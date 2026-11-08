// pcb/mcuBridge.ts — turn PCB nets into real wires on the virtual MCU scene.
//
// The PCB editor and the virtual MCU workbench are two views of one design. A
// PcbMcuLink binds each placed PCB element (U1, D1, …) to an ECAD instance
// (b1, p1, …). Applying the netlist then wires the ECAD parts together exactly
// as the PCB says they are connected, so firmware running on the virtual board
// drives the same LED, servo or display that the routed board carries.
//
// This is deliberately a projection, not a second netlist: PCB pins/nets stay
// the source of truth and each application is idempotent.

import { pinsOf } from "../ecad/catalog";
import type { EcadSim } from "../ecad/sim";
import { allElements } from "../flux/domains/pcb/project";
import type { PcbMcuLink, PcbStudioDocument } from "./types";

export interface PcbNetlistSkip {
  net: string;
  pin: string;
  reason: string;
}

export interface PcbNetlistReport {
  /** New ECAD wires created from PCB nets. */
  wires: number;
  /** Connections the ECAD scene already had (re-apply is safe). */
  existing: number;
  /** Linked PCB pins with no matching ECAD pin on the placed part. */
  unresolved: string[];
  /** Connections the ECAD pin rules refused (e.g. a GPIO tied to GND). */
  skipped: PcbNetlistSkip[];
}

interface Endpoint {
  designator: string;
  pin: string;
  inst: string;
  ecadPin: string;
}

/**
 * Candidate ECAD pin names for a PCB pin. Library pins carry a readable name
 * ("D5", "A", "GND") while the ECAD catalog uses programmer-visible names
 * ("5", "A", "GND"), so try the Arduino-style stripped form too.
 */
function pinNameCandidates(pin: {
  pin: string;
  name?: string | undefined;
}): string[] {
  const candidates: string[] = [];
  if (pin.name) {
    candidates.push(pin.name);
    if (/^D\d+$/.test(pin.name)) candidates.push(pin.name.slice(1));
  }
  candidates.push(pin.pin);
  return candidates.filter(
    (value, index) => value.length > 0 && candidates.indexOf(value) === index,
  );
}

function buildEndpoints(
  sim: EcadSim,
  links: readonly PcbMcuLink[],
  doc: PcbStudioDocument,
  unresolved: string[],
): Map<string, Endpoint> {
  const elements = new Map(
    allElements(doc.project).map((element) => [element.designator, element]),
  );
  const referenced = new Set<string>();
  for (const net of doc.project.nets) {
    for (const pin of net.pins) {
      referenced.add(`${pin.designator}\u0000${pin.pin}`);
    }
  }
  const endpoints = new Map<string, Endpoint>();
  for (const link of links) {
    const element = elements.get(link.designator);
    if (!element) {
      unresolved.push(`${link.designator}: element is not in the PCB project`);
      continue;
    }
    const part = sim.partOf(link.instance);
    if (!part) {
      unresolved.push(
        `${link.designator}: ECAD instance "${link.instance}" is not in the scene`,
      );
      continue;
    }
    const available = new Set(pinsOf(part).map((pin) => pin.name));
    for (const pin of element.pins) {
      const key = `${link.designator}\u0000${pin.pin}`;
      // Unconnected pins cannot affect the netlist; reporting each one would
      // bury the real mapping errors in noise.
      if (!referenced.has(key)) continue;
      const override = link.pins?.[pin.pin];
      const candidates = [
        ...(override ? [override] : []),
        ...pinNameCandidates(pin),
      ];
      const ecadPin = candidates.find((name) => available.has(name));
      if (!ecadPin) {
        unresolved.push(
          `${link.designator}.${pin.pin}: no matching pin on ${part.name}`,
        );
        continue;
      }
      endpoints.set(key, {
        designator: link.designator,
        pin: pin.pin,
        inst: link.instance,
        ecadPin,
      });
    }
  }
  return endpoints;
}

function hasWire(sim: EcadSim, a: Endpoint, b: Endpoint): boolean {
  return sim.wires.some(
    (wire) =>
      (wire.from.inst === a.inst &&
        wire.from.pin === a.ecadPin &&
        wire.to.inst === b.inst &&
        wire.to.pin === b.ecadPin) ||
      (wire.from.inst === b.inst &&
        wire.from.pin === b.ecadPin &&
        wire.to.inst === a.inst &&
        wire.to.pin === a.ecadPin),
  );
}

/**
 * Wire every PCB net's linked endpoints into the ECAD scene. Unlinked
 * elements are ignored; incompatible pin pairs (a signal net tied to a
 * supply pin, or a part-to-itself net) are reported instead of thrown.
 */
export function applyPcbNetlist(
  sim: EcadSim,
  doc: PcbStudioDocument,
): PcbNetlistReport {
  const report: PcbNetlistReport = {
    wires: 0,
    existing: 0,
    unresolved: [],
    skipped: [],
  };
  const endpoints = buildEndpoints(
    sim,
    doc.virtualMcuLinks ?? [],
    doc,
    report.unresolved,
  );
  if (endpoints.size === 0) return report;

  for (const net of doc.project.nets) {
    const ends = net.pins
      .map((pin) => endpoints.get(`${pin.designator}\u0000${pin.pin}`))
      .filter((endpoint): endpoint is Endpoint => endpoint !== undefined);
    if (ends.length < 2) continue;
    const anchor = ends[0]!;
    for (const end of ends.slice(1)) {
      if (end.inst === anchor.inst) continue;
      if (hasWire(sim, anchor, end)) {
        report.existing += 1;
        continue;
      }
      try {
        sim.wire(
          `${anchor.inst}.${anchor.ecadPin}`,
          `${end.inst}.${end.ecadPin}`,
        );
        report.wires += 1;
      } catch (error) {
        report.skipped.push({
          net: net.name,
          pin: `${end.designator}.${end.pin}`,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return report;
}
