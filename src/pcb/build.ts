// One-call board build: schematic → netlist → placement → autoroute → pours →
// DRC → fabrication package. This is the pipeline the Flux assistant exposes as
// `buildPcb`; each step is also callable on its own from the studio.

import { buildFabrication, type PcbFabrication } from "./fabrication";
import { drcSummary, runDesignRuleCheck } from "./drc";
import {
  autoPlacePcb,
  autoroutePcb,
  pourRect,
  type AutorouteReport,
  type PlacementReport,
} from "./layout";
import { emptyPcbStudio, addPcbLibraryPart, setPcbPinNet } from "./model";
import {
  applyNetlist,
  autoSchematic,
  buildNetlist,
  type NetlistResult,
} from "./schematic";
import type { PcbLayer, PcbStudioDocument, PcbViolation } from "./types";

export interface PcbBuildOptions {
  place?: boolean;
  route?: boolean;
  pours?: boolean;
  gridMM?: number;
}

export interface PcbBuildReport {
  netlist: Pick<NetlistResult, "sheetCount" | "pinCount" | "unconnected"> & {
    netCount: number;
  };
  placement: PlacementReport | null;
  route: AutorouteReport | null;
  drc: {
    errors: number;
    warnings: number;
    clean: boolean;
    violations: PcbViolation[];
  };
  fab: PcbFabrication;
  steps: string[];
  ms: number;
}

/**
 * Fill any copper layer that would otherwise be empty. Outer layers get a real
 * GND pour, scanned with clearance around foreign pads/traces at export time.
 * Four-layer boards get GND/power planes on the inner layers.
 */
export function ensureCopperLayers(doc: PcbStudioDocument): PcbStudioDocument {
  const hasGnd = doc.project.nets.some((net) => net.name === "GND");
  const hasVcc = doc.project.nets.some((net) => net.name === "VCC");
  const layers: PcbLayer[] =
    doc.board.layers === 4
      ? ["top", "inner1", "inner2", "bottom"]
      : ["top", "bottom"];
  let next = doc;
  for (const layer of layers) {
    const inner = layer === "inner1" || layer === "inner2";
    const net = inner && layer === "inner2" && hasVcc ? "VCC" : "GND";
    if (net === "GND" && !hasGnd) continue;
    if (next.zones.some((zone) => zone.layer === layer)) continue;
    next = pourRect(next, net, layer, inner ? 0.8 : 1.2);
  }
  return next;
}

export function buildPcb(
  doc: PcbStudioDocument,
  opts: PcbBuildOptions = {},
): { doc: PcbStudioDocument; report: PcbBuildReport } {
  const started = performance.now();
  const steps: string[] = [];
  let next = doc;

  const hasSymbols = doc.schematic.sheets.some(
    (sheet) => sheet.symbols.length > 0,
  );
  if (!hasSymbols) {
    next = autoSchematic(next);
    steps.push("schematic");
  }
  const netlist = buildNetlist(next);
  next = applyNetlist(next, netlist);
  steps.push("netlist");

  let placement: PlacementReport | null = null;
  if (opts.place !== false) {
    const placed = autoPlacePcb(next);
    next = placed.doc;
    placement = placed.report;
    steps.push("placement");
  }

  // Pours come first: a net with a real outer pour is already connected, so
  // the router does not waste grid cells fencing it in.
  if (opts.pours !== false) {
    next = ensureCopperLayers(next);
    steps.push("pours");
  }

  let route: AutorouteReport | null = null;
  if (opts.route !== false) {
    const routed = autoroutePcb(next, { gridMM: opts.gridMM ?? 0.5 });
    next = routed.doc;
    route = routed.report;
    steps.push("route");
  }

  const violations = runDesignRuleCheck(next);
  const drc = { ...drcSummary(violations), violations };
  steps.push("drc");

  const fab = buildFabrication(next);
  steps.push("fab");

  return {
    doc: next,
    report: {
      netlist: {
        sheetCount: netlist.sheetCount,
        pinCount: netlist.pinCount,
        unconnected: netlist.unconnected,
        netCount: netlist.nets.length,
      },
      placement,
      route,
      drc,
      fab,
      steps,
      ms: Math.round(performance.now() - started),
    },
  };
}

/**
 * A complete two-sheet demo: MCU, pull-up, LED + resistor, decoupling cap and a
 * programming/power header. The build routes it, pours copper and produces a
 * fabrication package; it is the acceptance fixture for P8-EXIT-04.
 */
export function createPcbDemo(): PcbStudioDocument {
  let doc = emptyPcbStudio("Demo Controller");
  doc = {
    ...doc,
    board: {
      widthMM: 46,
      heightMM: 30,
      thicknessMM: 1.6,
      layers: 2,
      solderMask: "#0f7a4d",
    },
  };
  const add = (
    id: string,
    designator: string,
    nets: Record<string, string>,
  ): void => {
    doc = addPcbLibraryPart(doc, id, designator);
    for (const [pin, net] of Object.entries(nets))
      doc = setPcbPinNet(doc, designator, pin, net);
  };
  add("mcu-328p", "U1", {
    "1": "VCC",
    "2": "GND",
    "3": "LED_A",
    "8": "RESET",
    "25": "UART_TX",
    "26": "UART_RX",
    "22": "VCC",
    "21": "GND",
  });
  add("resistor-0805", "R1", { "1": "LED_A", "2": "LED_K" });
  add("led-0805", "D1", { "1": "LED_K", "2": "GND" });
  add("resistor-0805", "R2", { "1": "VCC", "2": "RESET" });
  add("capacitor-0805", "C1", { "1": "VCC", "2": "GND" });
  add("header-1x4", "J1", {
    "1": "VCC",
    "2": "GND",
    "3": "UART_TX",
    "4": "UART_RX",
  });
  const built = buildPcb(doc, { gridMM: 0.5 });
  return built.doc;
}
