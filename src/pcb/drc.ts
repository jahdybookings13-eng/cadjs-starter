// Design-rule checking for the physical board, plus the schematic's ERC
// findings. Every finding has a stable code and a fix target the UI can jump to.
//
// Numeric checks use real geometry: rotated pads are polygons, traces are
// capsules, courtyards are their footprint envelopes.

import { runErcDrc } from "../flux/domains/pcb/rules";
import {
  polyPolyDist,
  pointInPoly,
  segPolyDist,
  segSegDist,
  polylineSegments,
} from "./geometry";
import {
  allPads,
  elementSilk,
  footprintOf,
  netConnectivity,
  padPolygon,
  type PadPlacement,
} from "./layout";
import { buildNetlist } from "./schematic";
import type { PcbStudioDocument, PcbViolation, Pt } from "./types";

function violation(
  input: Omit<PcbViolation, "code"> & { code?: string },
): PcbViolation {
  return {
    ...input,
    code:
      input.code ??
      `DRC-${input.rule.replace(/[^a-zA-Z0-9]+/g, "-").toUpperCase()}`,
  };
}

function walkElements(
  doc: PcbStudioDocument,
): import("../flux/domains/pcb/project").PcbElement[] {
  const out: import("../flux/domains/pcb/project").PcbElement[] = [];
  const walk = (node: import("../flux/domains/pcb/project").PcbNode): void => {
    if (node.kind === "element") out.push(node);
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(doc.project.root);
  return out;
}

function outOfBoard(
  doc: PcbStudioDocument,
  points: readonly Pt[],
  margin = 0,
): boolean {
  return points.some(
    (p) =>
      p.x < -margin ||
      p.y < -margin ||
      p.x > doc.board.widthMM + margin ||
      p.y > doc.board.heightMM + margin,
  );
}

function inCutout(doc: PcbStudioDocument, point: Pt): boolean {
  return doc.cutouts.some((cutout) => pointInPoly(point, cutout.points));
}

/**
 * Full DRC. `rule` keeps the historical names used by the rules panel and
 * earlier tests; `code` is the stable machine code.
 */
export function runDesignRuleCheck(doc: PcbStudioDocument): PcbViolation[] {
  const out: PcbViolation[] = [];
  const rules = doc.rules;

  // --- ERC from the live project ------------------------------------------
  for (const v of runErcDrc(doc.project)) {
    out.push({
      rule: v.rule,
      severity: v.severity,
      where: v.where,
      msg: v.msg,
      source: "erc",
      code: `ERC-${v.rule.replace(/[^a-zA-Z0-9]+/g, "-").toUpperCase()}`,
      fix: { kind: "net", id: v.where },
    });
  }

  // --- Schematic netlist findings -----------------------------------------
  const netlist = buildNetlist(doc);
  const seenCodes = new Set(out.map((v) => `${v.code}:${v.where}`));
  for (const issue of netlist.issues) {
    if (issue.code === "ERC-UNCONNECTED") continue; // project ERC covers it
    const key = `${issue.code}:${issue.where}`;
    if (seenCodes.has(key)) continue;
    seenCodes.add(key);
    out.push(issue);
  }

  // --- Duplicate references ------------------------------------------------
  const refs = new Map<string, number>();
  for (const element of walkElements(doc))
    refs.set(element.designator, (refs.get(element.designator) ?? 0) + 1);
  for (const [designator, count] of refs) {
    if (count > 1)
      out.push(
        violation({
          rule: "DRC-DUP-REF",
          code: "DRC-DUP-REF",
          severity: "error",
          where: designator,
          msg: `Reference ${designator} is used ${count} times`,
          source: "drc",
          fix: { kind: "element", id: designator },
        }),
      );
  }

  // --- Board sanity --------------------------------------------------------
  if (
    doc.board.widthMM < 5 ||
    doc.board.heightMM < 5 ||
    doc.board.thicknessMM < 0.4
  ) {
    out.push(
      violation({
        rule: "DRC-BOARD-SIZE",
        code: "DRC-BOARD-SIZE",
        severity: "error",
        where: "board",
        msg: `Board ${doc.board.widthMM}×${doc.board.heightMM}×${doc.board.thicknessMM} mm is outside fabrication limits`,
        source: "drc",
        fix: { kind: "board", id: "board" },
      }),
    );
  }

  // --- Trace width ---------------------------------------------------------
  for (const trace of doc.traces) {
    if (trace.widthMM < rules.minTraceMM - 1e-9) {
      out.push(
        violation({
          rule: "pcb-trace-width",
          code: "DRC-TRACE-WIDTH",
          severity: "error",
          where: trace.id,
          msg: `Trace on ${trace.net} is ${trace.widthMM.toFixed(3)} mm; minimum is ${rules.minTraceMM.toFixed(3)} mm`,
          source: "drc",
          actualMM: trace.widthMM,
          limitMM: rules.minTraceMM,
          fix: { kind: "trace", id: trace.id },
        }),
      );
    }
  }

  // --- Vias ----------------------------------------------------------------
  for (const via of doc.vias) {
    const annular = (via.padMM - via.drillMM) / 2;
    if (via.drillMM < rules.minViaDrillMM - 1e-9) {
      out.push(
        violation({
          rule: "pcb-via-drill",
          code: "DRC-VIA-DRILL",
          severity: "error",
          where: via.id,
          msg: `Via ${via.net} drill ${via.drillMM.toFixed(3)} mm is below ${rules.minViaDrillMM.toFixed(3)} mm`,
          source: "drc",
          actualMM: via.drillMM,
          limitMM: rules.minViaDrillMM,
          fix: { kind: "via", id: via.id },
        }),
      );
    }
    if (via.padMM < rules.minViaPadMM - 1e-9) {
      out.push(
        violation({
          rule: "pcb-via-pad",
          code: "DRC-VIA-PAD",
          severity: "error",
          where: via.id,
          msg: `Via ${via.net} pad ${via.padMM.toFixed(3)} mm is below ${rules.minViaPadMM.toFixed(3)} mm`,
          source: "drc",
          actualMM: via.padMM,
          limitMM: rules.minViaPadMM,
          fix: { kind: "via", id: via.id },
        }),
      );
    }
    if (annular < rules.minAnnularMM - 1e-9) {
      out.push(
        violation({
          rule: "pcb-via-annular",
          code: "DRC-VIA-ANNULAR",
          severity: "error",
          where: via.id,
          msg: `Via ${via.net} annular ring ${annular.toFixed(3)} mm is below ${rules.minAnnularMM.toFixed(3)} mm`,
          source: "drc",
          actualMM: annular,
          limitMM: rules.minAnnularMM,
          fix: { kind: "via", id: via.id },
        }),
      );
    }
  }

  // --- Trace ↔ trace clearance --------------------------------------------
  for (let i = 0; i < doc.traces.length; i += 1) {
    const a = doc.traces[i]!;
    for (let j = i + 1; j < doc.traces.length; j += 1) {
      const b = doc.traces[j]!;
      if (a.layer !== b.layer || a.net === b.net) continue;
      let best = Infinity;
      for (const [a1, a2] of polylineSegments(a.points)) {
        for (const [b1, b2] of polylineSegments(b.points)) {
          best = Math.min(best, segSegDist(a1, a2, b1, b2));
        }
      }
      const gap = best - (a.widthMM + b.widthMM) / 2;
      if (gap < rules.minClearanceMM - 1e-9) {
        out.push(
          violation({
            rule: "pcb-clearance",
            code: "DRC-CLEARANCE",
            severity: "error",
            where: `${a.net} / ${b.net}`,
            msg: `Copper clearance ${gap.toFixed(3)} mm is below ${rules.minClearanceMM.toFixed(3)} mm`,
            source: "drc",
            actualMM: gap,
            limitMM: rules.minClearanceMM,
            fix: { kind: "trace", id: a.id },
          }),
        );
      }
    }
  }

  // --- Trace ↔ pad clearance ----------------------------------------------
  const pads = allPads(doc);
  for (const trace of doc.traces) {
    for (const pad of pads) {
      if (!pad.net || pad.net === trace.net) continue;
      const layers = pad.layer === "both" ? ["top", "bottom"] : [pad.layer];
      if (!layers.includes(trace.layer)) continue;
      const poly = padPolygon(pad);
      let best = Infinity;
      for (const [a, b] of polylineSegments(trace.points)) {
        best = Math.min(best, segPolyDist(a, b, poly));
      }
      const gap = best - trace.widthMM / 2;
      if (gap < rules.minClearanceMM - 1e-9) {
        out.push(
          violation({
            rule: "pcb-pad-clearance",
            code: "DRC-PAD-CLEARANCE",
            severity: "error",
            where: `${trace.id} / ${pad.designator}.${pad.pin}`,
            msg: `Trace ${trace.net} is ${gap.toFixed(3)} mm from pad ${pad.designator}.${pad.pin}; minimum ${rules.minClearanceMM.toFixed(3)} mm`,
            source: "drc",
            actualMM: gap,
            limitMM: rules.minClearanceMM,
            fix: { kind: "trace", id: trace.id },
          }),
        );
      }
    }
  }

  // --- Pad ↔ pad clearance (different nets, different parts) --------------
  for (let i = 0; i < pads.length; i += 1) {
    const a = pads[i]!;
    for (let j = i + 1; j < pads.length; j += 1) {
      const b = pads[j]!;
      if (a.designator === b.designator) continue;
      if (a.net && a.net === b.net) continue;
      if (!a.net && !b.net) continue;
      const gap = polyPolyDist(padPolygon(a), padPolygon(b));
      if (gap < rules.minClearanceMM - 1e-9) {
        out.push(
          violation({
            rule: "pcb-pad-clearance",
            code: "DRC-PAD-CLEARANCE",
            severity: "error",
            where: `${a.designator}.${a.pin} / ${b.designator}.${b.pin}`,
            msg: `Pad clearance ${gap.toFixed(3)} mm is below ${rules.minClearanceMM.toFixed(3)} mm`,
            source: "drc",
            actualMM: gap,
            limitMM: rules.minClearanceMM,
            fix: { kind: "element", id: a.designator },
          }),
        );
        break;
      }
    }
  }

  // --- Courtyard overlap ---------------------------------------------------
  const elements = walkElements(doc).map((element) => {
    const part = footprintOf(doc, element);
    return {
      element,
      w: part?.widthMM ?? 6,
      h: part?.heightMM ?? 4,
    };
  });
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      const a = elements[i]!;
      const b = elements[j]!;
      const pa = rotatedRectPoly(
        a.element.position,
        a.w,
        a.h,
        a.element.rotation,
      );
      const pb = rotatedRectPoly(
        b.element.position,
        b.w,
        b.h,
        b.element.rotation,
      );
      const gap = polyPolyDist(pa, pb);
      if (gap < rules.courtyardMM - 1e-9) {
        out.push(
          violation({
            rule: "pcb-overlap",
            code: "DRC-COURTYARD",
            severity: "warning",
            where: `${a.element.designator} / ${b.element.designator}`,
            msg:
              gap < 0
                ? `Courtyards overlap by ${Math.abs(gap).toFixed(3)} mm`
                : `Courtyard gap ${gap.toFixed(3)} mm is below ${rules.courtyardMM.toFixed(3)} mm`,
            source: "drc",
            actualMM: gap,
            limitMM: rules.courtyardMM,
            fix: { kind: "element", id: a.element.designator },
          }),
        );
      }
    }
  }

  // --- Silkscreen over a foreign pad ---------------------------------------
  for (const element of elements) {
    const silks = elementSilk(doc, element.element);
    for (const silk of silks) {
      const poly = [...silk];
      for (const pad of pads) {
        if (pad.designator === element.element.designator) continue;
        if (!pad.net) continue;
        const gap = polyPolyDist(poly, padPolygon(pad));
        if (gap < rules.silkClearanceMM - 1e-9) {
          out.push(
            violation({
              rule: "pcb-silk-pad",
              code: "DRC-SILK-PAD",
              severity: "warning",
              where: `${element.element.designator} / ${pad.designator}.${pad.pin}`,
              msg: `Silkscreen ${element.element.designator} is ${gap.toFixed(3)} mm from pad ${pad.designator}.${pad.pin}`,
              source: "drc",
              actualMM: gap,
              limitMM: rules.silkClearanceMM,
              fix: { kind: "element", id: element.element.designator },
            }),
          );
        }
      }
    }
  }

  // --- Board outline -------------------------------------------------------
  for (const pad of pads) {
    const poly = padPolygon(pad);
    if (outOfBoard(doc, poly) || poly.some((p) => inCutout(doc, p))) {
      out.push(
        violation({
          rule: "pcb-outline",
          code: "DRC-OUTLINE",
          severity: "error",
          where: pad.designator,
          msg: `Pad ${pad.designator}.${pad.pin} extends past the board outline`,
          source: "drc",
          fix: { kind: "element", id: pad.designator },
        }),
      );
      break;
    }
  }
  for (const trace of doc.traces) {
    if (
      outOfBoard(doc, trace.points) ||
      trace.points.some((p) => inCutout(doc, p))
    ) {
      out.push(
        violation({
          rule: "pcb-trace-outline",
          code: "DRC-OUTLINE",
          severity: "error",
          where: trace.id,
          msg: "Trace exits the board outline",
          source: "drc",
          fix: { kind: "trace", id: trace.id },
        }),
      );
    }
  }
  for (const via of doc.vias) {
    if (
      outOfBoard(doc, [
        { x: via.x - via.padMM / 2, y: via.y - via.padMM / 2 },
        { x: via.x + via.padMM / 2, y: via.y + via.padMM / 2 },
      ])
    ) {
      out.push(
        violation({
          rule: "pcb-via-outline",
          code: "DRC-OUTLINE",
          severity: "error",
          where: via.id,
          msg: "Via pad extends past the board outline",
          source: "drc",
          fix: { kind: "via", id: via.id },
        }),
      );
    }
  }
  for (const zone of doc.zones) {
    if (outOfBoard(doc, zone.points)) {
      out.push(
        violation({
          rule: "pcb-zone-outline",
          code: "DRC-OUTLINE",
          severity: "error",
          where: zone.id,
          msg: "Copper pour extends past the board outline",
          source: "drc",
          fix: { kind: "board", id: zone.id },
        }),
      );
    }
    if (zone.net && !doc.project.nets.some((net) => net.name === zone.net)) {
      out.push(
        violation({
          rule: "pcb-zone-net",
          code: "DRC-ZONE-NET",
          severity: "error",
          where: zone.id,
          msg: `Pour refers to missing net ${zone.net}`,
          source: "drc",
          fix: { kind: "net", id: zone.net },
        }),
      );
    }
  }

  // --- Unconnected nets ----------------------------------------------------
  const connectivity = netConnectivity(doc);
  for (const broken of connectivity.broken) {
    out.push(
      violation({
        rule: "pcb-unconnected",
        code: "DRC-UNCONNECTED",
        severity: "error",
        where: broken.net,
        msg: `${broken.pads.length} pad(s) on ${broken.net} are not connected by copper: ${broken.pads
          .map((pad) => `${pad.designator}.${pad.pin}`)
          .join(", ")}`,
        source: "drc",
        fix: { kind: "element", id: broken.pads[0]?.designator ?? broken.net },
      }),
    );
  }

  // --- Trace nets ----------------------------------------------------------
  const netNames = new Set(doc.project.nets.map((net) => net.name));
  for (const trace of doc.traces) {
    if (!netNames.has(trace.net)) {
      out.push(
        violation({
          rule: "pcb-trace-net",
          code: "DRC-TRACE-NET",
          severity: "error",
          where: trace.id,
          msg: `Trace refers to missing net ${trace.net}`,
          source: "drc",
          fix: { kind: "net", id: trace.net },
        }),
      );
    }
  }
  for (const pad of pads) {
    if (pad.net && !netNames.has(pad.net)) {
      out.push(
        violation({
          rule: "pcb-pad-net",
          code: "DRC-PAD-NET",
          severity: "error",
          where: `${pad.designator}.${pad.pin}`,
          msg: `Pad refers to missing net ${pad.net}`,
          source: "drc",
          fix: { kind: "element", id: pad.designator },
        }),
      );
    }
  }

  return out;
}

function rotatedRectPoly(
  center: { x: number; y: number },
  w: number,
  h: number,
  rotationDeg: number,
): Pt[] {
  const hw = w / 2;
  const hh = h / 2;
  const r = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => ({
    x: center.x + p.x * cos - p.y * sin,
    y: center.y + p.x * sin + p.y * cos,
  }));
}

export function drcSummary(violations: readonly PcbViolation[]): {
  errors: number;
  warnings: number;
  clean: boolean;
} {
  const errors = violations.filter((v) => v.severity === "error").length;
  return {
    errors,
    warnings: violations.length - errors,
    clean: errors === 0,
  };
}

export type { PadPlacement };
