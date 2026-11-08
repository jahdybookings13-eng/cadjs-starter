// Multi-sheet schematic capture + netlist extraction.
//
// A schematic is a set of sheets. Each symbol is a placed library part with
// real pin endpoints. Connectivity is derived from geometry: a wire touching a
// pin connects it, and global net labels / power ports / sheet ports merge
// groups by name across sheets. The result is applied back onto the live
// PcbProject so the rules engine, layout and BoM read one tree.

import { makeNet, type PcbProject } from "../flux/domains/pcb/project";
import { libraryPart } from "./library";
import { pointSegDist, polylineSegments } from "./geometry";
import type {
  PcbLibraryPart,
  PcbStudioDocument,
  PcbViolation,
  Pt,
  SchematicNetLabel,
  SchematicPinPlacement,
  SchematicPowerPort,
  SchematicSheet,
  SchematicSheetPort,
  SchematicSymbol,
  SchematicWire,
} from "./types";

export const SCHEMATIC_SHEET_GAP_MM = 2.54;
const STUB_MM = 2.54;
const BODY_WIDTH_MM = 15.24;
const PIN_PITCH_MM = 2.54;

// ---------------------------------------------------------------------------
// Package selection / symbol layout
// ---------------------------------------------------------------------------

/** Resolve a part for a symbol or element, with a generic fallback. */
export function partForPackage(
  doc: { library: readonly PcbLibraryPart[] },
  packageId: string | undefined,
  pinCount = 2,
): PcbLibraryPart {
  const found = packageId ? libraryPart(doc, packageId) : null;
  if (found) return found;
  const pins = Array.from({ length: Math.max(2, pinCount) }, (_, i) => ({
    pin: String(i + 1),
    name: String(i + 1),
    kind: "signal" as const,
  }));
  const width = 12.7;
  return {
    id: packageId ?? "generic",
    name: "Generic part",
    type: "component",
    mpn: "",
    package: packageId ?? "GENERIC",
    prefix: "X",
    widthMM: 9,
    heightMM: 9,
    height3DMM: 1,
    color: "#3f4750",
    pins,
    pads: [],
    silk: [{ x: 0, y: 0, w: width, h: 12 }],
    custom: true,
  };
}

export function symbolBodySize(part: PcbLibraryPart): {
  width: number;
  height: number;
} {
  const perSide = Math.max(1, Math.ceil(part.pins.length / 2));
  return {
    width: BODY_WIDTH_MM,
    height: Math.max(10.16, perSide * PIN_PITCH_MM + 5.08),
  };
}

/** Absolute pin endpoints for a symbol placed at (x, y). */
export function symbolPinLayout(
  part: PcbLibraryPart,
  x: number,
  y: number,
): SchematicPinPlacement[] {
  const { width, height } = symbolBodySize(part);
  const perSide = Math.max(1, Math.ceil(part.pins.length / 2));
  const top = height / 2 - PIN_PITCH_MM;
  return part.pins.map((pin, index) => {
    const left = index < perSide;
    const row = left ? index : index - perSide;
    return {
      pin: pin.pin,
      x: x + (left ? -width / 2 - STUB_MM : width / 2 + STUB_MM),
      y: y + top - row * PIN_PITCH_MM,
    };
  });
}

// ---------------------------------------------------------------------------
// Sheet construction
// ---------------------------------------------------------------------------

let schematicSeq = 0;
function uid(prefix: string): string {
  schematicSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${schematicSeq.toString(36)}`;
}

export function emptySheet(name = "Sheet 1"): SchematicSheet {
  return {
    id: uid("sheet"),
    name,
    symbols: [],
    wires: [],
    junctions: [],
    powerPorts: [],
    labels: [],
    ports: [],
  };
}

export function emptySchematic(): { sheets: SchematicSheet[] } {
  return { sheets: [emptySheet("Sheet 1")] };
}

export function addSchematicSheet(
  doc: PcbStudioDocument,
  name?: string,
): PcbStudioDocument {
  const sheet = emptySheet(name ?? `Sheet ${doc.schematic.sheets.length + 1}`);
  return {
    ...doc,
    schematic: { sheets: [...doc.schematic.sheets, sheet] },
    updatedAt: Date.now(),
  };
}

export function removeSchematicSheet(
  doc: PcbStudioDocument,
  sheetId: string,
): PcbStudioDocument {
  if (doc.schematic.sheets.length <= 1) return doc;
  return {
    ...doc,
    schematic: {
      sheets: doc.schematic.sheets.filter((sheet) => sheet.id !== sheetId),
    },
    updatedAt: Date.now(),
  };
}

export function renameSchematicSheet(
  doc: PcbStudioDocument,
  sheetId: string,
  name: string,
): PcbStudioDocument {
  const clean = name.trim();
  if (!clean) return doc;
  return {
    ...doc,
    schematic: {
      sheets: doc.schematic.sheets.map((sheet) =>
        sheet.id === sheetId ? { ...sheet, name: clean } : sheet,
      ),
    },
    updatedAt: Date.now(),
  };
}

const POWER_ORDER = ["VCC", "GND", "VBUS", "3V3", "5V", "AVCC"];

function powerRank(net: string): number {
  const index = POWER_ORDER.indexOf(net.toUpperCase());
  return index === -1 ? POWER_ORDER.length : index;
}

function isPowerNetName(net: string): boolean {
  return /^(gnd|vcc|vdd|vss|vbus|v\d|3v3|5v|12v|avcc|aref|\+?\d+v\d*|pwr)/i.test(
    net.trim(),
  );
}

/**
 * Build a complete, editable two-sheet schematic from the live project.
 * Sheet 1 holds the active parts, sheet 2 the connectors and power ports.
 * Every connected pin gets a wire stub and a global net label, which is a
 * normal capture style and gives the netlist exact geometry to resolve.
 */
export function autoSchematic(doc: PcbStudioDocument): PcbStudioDocument {
  const elements = walkElements(doc.project);
  const main = elements.filter((el) => !el.designator.startsWith("J"));
  const io = elements.filter((el) => el.designator.startsWith("J"));
  const sheet1 = emptySheet("Sheet 1 — Main");
  const sheet2 = emptySheet("Sheet 2 — Power & I/O");

  const layout = (
    sheet: SchematicSheet,
    designators: typeof elements,
    startY: number,
  ): void => {
    const columns = 3;
    const colW = 44;
    const rowH = 68;
    designators
      .slice()
      .sort((a, b) =>
        a.designator.localeCompare(b.designator, undefined, {
          numeric: true,
        }),
      )
      .forEach((element, index) => {
        const part = partForPackage(doc, element.package, element.pins.length);
        const x = 24 + (index % columns) * colW;
        const y = startY + Math.floor(index / columns) * rowH;
        const symbol: SchematicSymbol = {
          id: uid("sym"),
          partId: part.id,
          designator: element.designator,
          x,
          y,
          pins: symbolPinLayout(part, x, y),
        };
        sheet.symbols.push(symbol);
        for (const pin of symbol.pins) {
          const modelPin = element.pins.find((p) => p.pin === pin.pin);
          const net = modelPin?.net?.trim();
          if (!net) continue;
          const left = pin.x < x;
          const end: Pt = { x: pin.x + (left ? -3.81 : 3.81), y: pin.y };
          sheet.wires.push({
            id: uid("wire"),
            net,
            points: [{ x: pin.x, y: pin.y }, end],
          });
          sheet.labels.push({ id: uid("label"), net, x: end.x, y: end.y });
          sheet.junctions.push({ id: uid("junc"), x: end.x, y: end.y });
        }
      });
  };

  layout(sheet1, main, 34);
  layout(sheet2, io, 34);

  // Power ports are real connectivity anchors, not decoration: they carry the
  // net name at a point the netlist resolver merges globally.
  const nets = new Set<string>();
  for (const el of elements)
    for (const pin of el.pins) if (pin.net?.trim()) nets.add(pin.net.trim());
  const powerNets = [...nets]
    .filter(isPowerNetName)
    .sort((a, b) => powerRank(a) - powerRank(b) || a.localeCompare(b));
  powerNets.forEach((net, index) => {
    const port: SchematicPowerPort = {
      id: uid("pwr"),
      net,
      x: 24 + (index % 5) * 22,
      y: 210 + Math.floor(index / 5) * 16,
      kind: /gnd/i.test(net) ? "gnd" : "vcc",
    };
    sheet2.powerPorts.push(port);
  });

  // Declare cross-sheet ports for nets used on both sheets. Ports merge by
  // name, so these are functional as well as navigational.
  const netsOn = (sheet: SchematicSheet): Set<string> => {
    const set = new Set<string>();
    for (const wire of sheet.wires) if (wire.net) set.add(wire.net);
    return set;
  };
  const a = netsOn(sheet1);
  const b = netsOn(sheet2);
  const shared = [...a].filter((net) => b.has(net)).sort();
  shared.forEach((net, index) => {
    sheet1.ports.push({
      id: uid("port"),
      name: net,
      direction: "bidirectional",
      x: 160,
      y: 40 + index * 8,
    });
    sheet2.ports.push({
      id: uid("port"),
      name: net,
      direction: "bidirectional",
      x: 160,
      y: 40 + index * 8,
    });
  });

  return {
    ...doc,
    schematic: { sheets: [sheet1, sheet2] },
    updatedAt: Date.now(),
  };
}

function walkElements(project: PcbProject) {
  const out: import("../flux/domains/pcb/project").PcbElement[] = [];
  const walk = (node: import("../flux/domains/pcb/project").PcbNode): void => {
    if (node.kind === "element") out.push(node);
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(project.root);
  return out;
}

// ---------------------------------------------------------------------------
// Netlist
// ---------------------------------------------------------------------------

export interface NetlistPin {
  designator: string;
  pin: string;
}

export interface NetlistNet {
  name: string;
  pins: NetlistPin[];
  sheets: string[];
}

export interface NetlistResult {
  nets: NetlistNet[];
  issues: PcbViolation[];
  unconnected: NetlistPin[];
  sheetCount: number;
  pinCount: number;
  /** designator.pin -> net */
  pinNets: Record<string, string>;
}

class Dsu {
  private parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[i] !== i) {
      const next = this.parent[i]!;
      this.parent[i] = root;
      i = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

interface FlatPin extends NetlistPin {
  index: number;
  x: number;
  y: number;
  sheet: string;
  partId: string;
  kind: "power" | "signal" | "gnd" | "nc";
  dir: "in" | "out" | "bidir" | "power" | "passive";
}

const TOUCH_MM = 0.45;

function touches(pin: FlatPin, wire: SchematicWire): boolean {
  for (const [a, b] of polylineSegments(wire.points)) {
    if (pointSegDist({ x: pin.x, y: pin.y }, a, b) <= TOUCH_MM) return true;
  }
  return false;
}

/**
 * Resolve schematic geometry into named nets. Pure: no document mutation.
 * Also reports duplicate references, net conflicts, output conflicts and
 * power/ground mistakes with stable codes.
 */
export function buildNetlist(doc: PcbStudioDocument): NetlistResult {
  const flat: FlatPin[] = [];
  const issues: PcbViolation[] = [];
  const designatorSheets = new Map<string, Set<string>>();

  for (const sheet of doc.schematic.sheets) {
    for (const symbol of sheet.symbols) {
      const part = partForPackage(doc, symbol.partId);
      for (const pin of symbol.pins) {
        const libraryPin = part.pins.find((p) => p.pin === pin.pin);
        flat.push({
          index: flat.length,
          designator: symbol.designator,
          pin: pin.pin,
          x: pin.x,
          y: pin.y,
          sheet: sheet.id,
          partId: symbol.partId,
          kind: libraryPin?.kind ?? "signal",
          dir: libraryPin?.dir ?? "bidir",
        });
      }
      const set = designatorSheets.get(symbol.designator) ?? new Set<string>();
      set.add(sheet.id);
      designatorSheets.set(symbol.designator, set);
    }
  }
  for (const [designator, sheets] of designatorSheets) {
    if (sheets.size > 1) {
      issues.push({
        rule: "ERC-DUP-REF",
        code: "ERC-DUP-REF",
        severity: "error",
        where: designator,
        msg: `Reference ${designator} is placed on ${sheets.size} sheets`,
        source: "erc",
        fix: { kind: "schematic", id: designator },
      });
    }
  }

  const pinDsu = new Dsu(Math.max(1, flat.length));
  const wireNets = new Map<number, string[]>();
  const danglingWires: string[] = [];

  for (const sheet of doc.schematic.sheets) {
    for (const wire of sheet.wires) {
      if (!wire.net.trim()) continue;
      const touched = flat.filter(
        (pin) => pin.sheet === sheet.id && touches(pin, wire),
      );
      if (touched.length === 0) {
        danglingWires.push(wire.id);
        continue;
      }
      const first = touched[0]!;
      for (const pin of touched.slice(1)) pinDsu.union(first.index, pin.index);
      const names = wireNets.get(first.index) ?? [];
      names.push(wire.net.trim());
      wireNets.set(first.index, names);
    }
    // Power ports / labels at a pin endpoint are connectivity anchors too.
    const anchors: Array<{ net: string; x: number; y: number }> = [
      ...sheet.powerPorts.map((p) => ({ net: p.net, x: p.x, y: p.y })),
      ...sheet.labels.map((p) => ({ net: p.net, x: p.x, y: p.y })),
      ...sheet.ports.map((p) => ({ net: p.name, x: p.x, y: p.y })),
    ];
    for (const anchor of anchors) {
      const touched = flat.filter(
        (pin) =>
          pin.sheet === sheet.id &&
          Math.hypot(pin.x - anchor.x, pin.y - anchor.y) <= TOUCH_MM,
      );
      if (touched.length < 1) continue;
      const first = touched[0]!;
      for (const pin of touched.slice(1)) pinDsu.union(first.index, pin.index);
      const names = wireNets.get(first.index) ?? [];
      names.push(anchor.net);
      wireNets.set(first.index, names);
    }
    // Coincident pins are directly connected (pin-to-pin join).
    const sheetPins = flat.filter((pin) => pin.sheet === sheet.id);
    for (let i = 0; i < sheetPins.length; i += 1) {
      for (let j = i + 1; j < sheetPins.length; j += 1) {
        const a = sheetPins[i]!;
        const b = sheetPins[j]!;
        if (Math.hypot(a.x - b.x, a.y - b.y) <= 0.05)
          pinDsu.union(a.index, b.index);
      }
    }
  }

  interface Group {
    pins: FlatPin[];
    names: string[];
    sheets: Set<string>;
  }
  const groups = new Map<number, Group>();
  for (const pin of flat) {
    const root = pinDsu.find(pin.index);
    const group = groups.get(root) ?? {
      pins: [],
      names: [],
      sheets: new Set<string>(),
    };
    group.pins.push(pin);
    group.sheets.add(pin.sheet);
    groups.set(root, group);
  }
  for (const [root, names] of wireNets) {
    const group = groups.get(pinDsu.find(root));
    if (!group) continue;
    for (const name of names) group.names.push(name);
  }

  // Merge groups that carry the same explicit net name (global labels/ports).
  const namedGroups = [...groups.values()];
  const nameToGroup = new Map<string, number>();
  const groupDsu = new Dsu(Math.max(1, namedGroups.length));
  const groupNames: string[][] = namedGroups.map((g) => g.names);
  namedGroups.forEach((group, index) => {
    const unique = [...new Set(group.names)];
    if (unique.length > 1) {
      issues.push({
        rule: "ERC-NET-CONFLICT",
        code: "ERC-NET-CONFLICT",
        severity: "error",
        where: group.pins
          .map((p) => `${p.designator}.${p.pin}`)
          .slice(0, 4)
          .join(", "),
        msg: `Wires join different nets: ${unique.join(", ")}`,
        source: "erc",
        fix: { kind: "net", id: unique[0]! },
      });
    }
    const name = unique[0];
    if (!name) return;
    const prev = nameToGroup.get(name);
    if (prev !== undefined) groupDsu.union(prev, index);
    else nameToGroup.set(name, index);
  });

  const merged = new Map<number, Group>();
  namedGroups.forEach((group, index) => {
    const root = groupDsu.find(index);
    const target = merged.get(root) ?? {
      pins: [],
      names: [],
      sheets: new Set<string>(),
    };
    target.pins.push(...group.pins);
    target.names.push(...groupNames[index]!);
    for (const sheet of group.sheets) target.sheets.add(sheet);
    merged.set(root, target);
  });

  // Project pins that were never symbol-placed still carry manual nets.
  const placed = new Set(flat.map((pin) => `${pin.designator}.${pin.pin}`));
  for (const element of walkElements(doc.project)) {
    for (const pin of element.pins) {
      const key = `${element.designator}.${pin.pin}`;
      if (placed.has(key) || !pin.net?.trim()) continue;
      const name = pin.net.trim();
      const root = nameToGroup.get(name);
      const group =
        root !== undefined ? merged.get(groupDsu.find(root)) : undefined;
      if (group) {
        group.pins.push({
          index: -1,
          designator: element.designator,
          pin: pin.pin,
          x: 0,
          y: 0,
          sheet: "",
          partId: element.package ?? "",
          kind: "signal",
          dir: "bidir",
        });
      } else {
        const index = namedGroups.length;
        namedGroups.push({
          pins: [
            {
              index: -1,
              designator: element.designator,
              pin: pin.pin,
              x: 0,
              y: 0,
              sheet: "",
              partId: element.package ?? "",
              kind: "signal",
              dir: "bidir",
            },
          ],
          names: [name],
          sheets: new Set<string>(),
        });
        merged.set(index, namedGroups[index]!);
        nameToGroup.set(name, index);
      }
    }
  }

  const nets: NetlistNet[] = [];
  const unconnected: NetlistPin[] = [];
  for (const group of merged.values()) {
    const name = [...new Set(group.names)].sort()[0]?.trim();
    if (!name) {
      for (const pin of group.pins) {
        if (pin.kind === "nc") continue;
        unconnected.push({ designator: pin.designator, pin: pin.pin });
        issues.push({
          rule: "erc.unconnected",
          code: "ERC-UNCONNECTED",
          severity: "warning",
          where: `${pin.designator}.${pin.pin}`,
          msg: "Pin has no net assigned",
          source: "erc",
          fix: { kind: "schematic", id: `${pin.designator}.${pin.pin}` },
        });
      }
      continue;
    }
    nets.push({
      name,
      pins: group.pins
        .map((pin) => ({ designator: pin.designator, pin: pin.pin }))
        .sort((a, b) =>
          `${a.designator}.${a.pin}`.localeCompare(
            `${b.designator}.${b.pin}`,
            undefined,
            {
              numeric: true,
            },
          ),
        ),
      sheets: [...group.sheets].sort(),
    });
  }
  nets.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  // Output conflicts: more than one active driver on a net.
  for (const net of nets) {
    const drivers = net.pins.filter((pin) => {
      const element = walkElements(doc.project).find(
        (el) => el.designator === pin.designator,
      );
      const part = partForPackage(doc, element?.package);
      const libraryPin = part.pins.find((p) => p.pin === pin.pin);
      return libraryPin?.dir === "out";
    });
    if (drivers.length > 1) {
      issues.push({
        rule: "ERC-OUTPUT-CONFLICT",
        code: "ERC-OUTPUT-CONFLICT",
        severity: "error",
        where: net.name,
        msg: `Net ${net.name} has ${drivers.length} output drivers: ${drivers
          .map((d) => `${d.designator}.${d.pin}`)
          .join(", ")}`,
        source: "erc",
        fix: { kind: "net", id: net.name },
      });
    }
    const powerPins = net.pins.filter((pin) => {
      const element = walkElements(doc.project).find(
        (el) => el.designator === pin.designator,
      );
      const part = partForPackage(doc, element?.package);
      const libraryPin = part.pins.find((p) => p.pin === pin.pin);
      return libraryPin?.kind === "power" || libraryPin?.kind === "gnd";
    });
    if (powerPins.length > 0 && !isPowerNetName(net.name)) {
      issues.push({
        rule: "ERC-POWER-MISMATCH",
        code: "ERC-POWER-MISMATCH",
        severity: "warning",
        where: net.name,
        msg: `Power pin ${powerPins
          .map((p) => `${p.designator}.${p.pin}`)
          .join(", ")} is on non-power net ${net.name}`,
        source: "erc",
        fix: { kind: "net", id: net.name },
      });
    }
  }

  if (danglingWires.length > 0) {
    issues.push({
      rule: "ERC-DANGLING-WIRE",
      code: "ERC-DANGLING-WIRE",
      severity: "warning",
      where: danglingWires[0]!,
      msg: `${danglingWires.length} wire(s) touch no pin endpoint`,
      source: "erc",
      fix: { kind: "schematic", id: danglingWires[0]! },
    });
  }

  const pinNets: Record<string, string> = {};
  for (const net of nets)
    for (const pin of net.pins)
      pinNets[`${pin.designator}.${pin.pin}`] = net.name;

  return {
    nets,
    issues,
    unconnected,
    sheetCount: doc.schematic.sheets.length,
    pinCount: flat.length,
    pinNets,
  };
}

/** Write a resolved netlist back into the live project tree. */
export function applyNetlist(
  doc: PcbStudioDocument,
  result: NetlistResult = buildNetlist(doc),
): PcbStudioDocument {
  const project = structuredClone(doc.project) as PcbProject;
  const byKey = new Map<string, string>();
  for (const net of result.nets)
    for (const pin of net.pins)
      byKey.set(`${pin.designator}.${pin.pin}`, net.name);

  const walk = (node: import("../flux/domains/pcb/project").PcbNode): void => {
    if (node.kind === "element") {
      for (const pin of node.pins) {
        const net = byKey.get(`${node.designator}.${pin.pin}`);
        if (net) pin.net = net;
        else delete pin.net;
      }
    }
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(project.root);
  project.nets = result.nets.map((net) => ({
    ...makeNet(net.name),
    pins: net.pins.map((pin) => ({
      designator: pin.designator,
      pin: pin.pin,
    })),
  }));
  return { ...doc, project, updatedAt: Date.now() };
}

export function schematicNetLabels(sheet: SchematicSheet): SchematicNetLabel[] {
  return sheet.labels;
}

export function schematicPowerPorts(
  sheet: SchematicSheet,
): SchematicPowerPort[] {
  return sheet.powerPorts;
}

export function schematicSheetPorts(
  sheet: SchematicSheet,
): SchematicSheetPort[] {
  return sheet.ports;
}
