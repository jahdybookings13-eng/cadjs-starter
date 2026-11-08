// ScadStudio:pcb document model.
//
// The schematic tree is the same live PcbProject the ScadStudio agent/rules
// layer uses. A PCB tab persists that tree plus board geometry, routing,
// multi-sheet schematic, vias/pours and the local library. Schema v1 documents
// (board + project + traces only) migrate on open without losing geometry.

import {
  addElement,
  allElements,
  byDesignator,
  makeElement,
  makeNet,
  removeElement,
  type PcbElement,
  type PcbNode,
  type PcbPin,
  type PcbProject,
} from "../flux/domains/pcb/project";
import { buildBom, type BomRow } from "../flux/domains/pcb/rules";
import {
  allLibraryParts,
  createCustomPart,
  libraryPart,
  type CustomPartInput,
} from "./library";
import { isEcadSnapshot } from "../ecad/persist";
import { runDesignRuleCheck } from "./drc";
import { pcbAssemblySolids } from "./assembly";
import {
  PCB_DEFAULT_RULES,
  PCB_STUDIO_SCHEMA,
  PCB_STUDIO_VERSION,
  SCADSTUDIO_PCB_NAME,
  emptyPcbStudio,
} from "./empty";
import {
  isPcbLayer,
  type Pcb3dBox,
  type PcbBoard,
  type PcbCutout,
  type PcbDesignRules,
  type PcbLayer,
  type PcbLibraryPart,
  type PcbMcuLink,
  type PcbSchematic,
  type PcbStudioDocument,
  type PcbTrace,
  type PcbVia,
  type PcbViolation,
  type PcbZone,
  type Pt,
  type SchematicSheet,
  type SchematicSymbol,
} from "./types";

export type {
  Pcb3dBox,
  PcbBoard,
  PcbCutout,
  PcbDesignRules,
  PcbLayer,
  PcbLibraryPart,
  PcbMcuLink,
  PcbSchematic,
  PcbStudioDocument,
  PcbTrace,
  PcbVia,
  PcbViolation,
  PcbZone,
  Pt,
} from "./types";
import { emptySchematic } from "./schematic";

export { PCB_LAYERS, isPcbLayer } from "./types";
export {
  BUILTIN_LIBRARY,
  PCB_LIBRARY,
  allLibraryParts,
  createCustomPart,
} from "./library";
export type { CustomPartInput } from "./library";
export {
  PCB_DEFAULT_RULES,
  PCB_STUDIO_SCHEMA,
  PCB_STUDIO_VERSION,
  SCADSTUDIO_PCB_NAME,
  emptyPcbStudio,
  pcbStudioTabDesign,
} from "./empty";

export type PcbTracePoint = Pt;

let pcSeq = 0;

function nextUid(prefix: string): string {
  pcSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${pcSeq.toString(36)}`;
}

function stamp(value: unknown): number {
  return Number.isFinite(value) ? Number(value) : Date.now();
}

function num(value: unknown, fallback: number, min?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return min !== undefined ? Math.max(min, parsed) : parsed;
}

function parsePt(value: unknown): Pt | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Partial<Pt>;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: Number(point.x), y: Number(point.y) };
}

function parsePoints(value: unknown): Pt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const point = parsePt(candidate);
    return point ? [point] : [];
  });
}

export function pcbLibraryPart(
  id: string,
  doc?: { library: readonly PcbLibraryPart[] },
): PcbLibraryPart | null {
  return libraryPart(doc ?? { library: [] }, id);
}

export function pcbLibrary(doc?: {
  library: readonly PcbLibraryPart[];
}): PcbLibraryPart[] {
  return allLibraryParts(doc ?? { library: [] });
}

export function serializePcbStudio(doc: PcbStudioDocument): string {
  return JSON.stringify(doc);
}

function parseBoard(value: unknown): PcbBoard {
  const board =
    value && typeof value === "object" ? (value as Partial<PcbBoard>) : {};
  return {
    widthMM: num(board.widthMM, 60, 10),
    heightMM: num(board.heightMM, 40, 10),
    thicknessMM: num(board.thicknessMM, 1.6, 0.4),
    layers: board.layers === 4 ? 4 : 2,
    solderMask:
      typeof board.solderMask === "string" ? board.solderMask : "#0f7a4d",
  };
}

function parseRules(value: unknown): PcbDesignRules {
  const rules =
    value && typeof value === "object"
      ? (value as Partial<PcbDesignRules>)
      : {};
  return {
    minTraceMM: num(rules.minTraceMM, PCB_DEFAULT_RULES.minTraceMM, 0.05),
    minClearanceMM: num(
      rules.minClearanceMM,
      PCB_DEFAULT_RULES.minClearanceMM,
      0.05,
    ),
    minViaDrillMM: num(
      rules.minViaDrillMM,
      PCB_DEFAULT_RULES.minViaDrillMM,
      0.1,
    ),
    minViaPadMM: num(rules.minViaPadMM, PCB_DEFAULT_RULES.minViaPadMM, 0.2),
    minAnnularMM: num(rules.minAnnularMM, PCB_DEFAULT_RULES.minAnnularMM, 0.05),
    silkClearanceMM: num(
      rules.silkClearanceMM,
      PCB_DEFAULT_RULES.silkClearanceMM,
      0,
    ),
    courtyardMM: num(rules.courtyardMM, PCB_DEFAULT_RULES.courtyardMM, 0),
  };
}

function parseTrace(value: unknown): PcbTrace | null {
  if (!value || typeof value !== "object") return null;
  const trace = value as Partial<PcbTrace>;
  if (
    typeof trace.id !== "string" ||
    typeof trace.net !== "string" ||
    !isPcbLayer(trace.layer) ||
    !Array.isArray(trace.points)
  )
    return null;
  const points = parsePoints(trace.points);
  if (points.length < 2) return null;
  return {
    id: trace.id,
    net: trace.net,
    layer: trace.layer,
    widthMM: num(trace.widthMM, 0.25, 0.05),
    points,
  };
}

function parseVia(value: unknown): PcbVia | null {
  if (!value || typeof value !== "object") return null;
  const via = value as Partial<PcbVia>;
  if (
    typeof via.id !== "string" ||
    typeof via.net !== "string" ||
    !Number.isFinite(via.x) ||
    !Number.isFinite(via.y)
  )
    return null;
  return {
    id: via.id,
    net: via.net,
    x: Number(via.x),
    y: Number(via.y),
    drillMM: num(via.drillMM, 0.3, 0.1),
    padMM: num(via.padMM, 0.6, 0.2),
    from: isPcbLayer(via.from) ? via.from : "top",
    to: isPcbLayer(via.to) ? via.to : "bottom",
  };
}

function parseZone(value: unknown): PcbZone | null {
  if (!value || typeof value !== "object") return null;
  const zone = value as Partial<PcbZone>;
  if (
    typeof zone.id !== "string" ||
    typeof zone.net !== "string" ||
    !isPcbLayer(zone.layer)
  )
    return null;
  const points = parsePoints(zone.points);
  if (points.length < 3) return null;
  return {
    id: zone.id,
    net: zone.net,
    layer: zone.layer,
    points,
    clearanceMM: num(zone.clearanceMM, 0.15, 0.05),
    fill: zone.fill === "hatch" ? "hatch" : "solid",
  };
}

function parseCutout(value: unknown): PcbCutout | null {
  if (!value || typeof value !== "object") return null;
  const cutout = value as Partial<PcbCutout>;
  if (typeof cutout.id !== "string") return null;
  const points = parsePoints(cutout.points);
  if (points.length < 3) return null;
  return { id: cutout.id, points };
}

function parseLibraryPart(value: unknown): PcbLibraryPart | null {
  if (!value || typeof value !== "object") return null;
  const part = value as Partial<PcbLibraryPart>;
  if (
    typeof part.id !== "string" ||
    typeof part.name !== "string" ||
    !Array.isArray(part.pins) ||
    !Array.isArray(part.pads) ||
    !Array.isArray(part.silk)
  )
    return null;
  return {
    id: part.id,
    name: part.name,
    type: typeof part.type === "string" ? part.type : "custom",
    mpn: typeof part.mpn === "string" ? part.mpn : "",
    package: typeof part.package === "string" ? part.package : "CUSTOM",
    prefix: typeof part.prefix === "string" ? part.prefix : "X",
    widthMM: num(part.widthMM, 6, 0.5),
    heightMM: num(part.heightMM, 4, 0.5),
    height3DMM: num(part.height3DMM, 1, 0.1),
    ...(typeof part.model3D === "string" && part.model3D.trim()
      ? { model3D: part.model3D.trim() }
      : {}),
    color: typeof part.color === "string" ? part.color : "#3f4750",
    pins: part.pins.map((pin) => ({
      pin: String(pin.pin),
      name: typeof pin.name === "string" ? pin.name : String(pin.pin),
      kind:
        pin.kind === "power" ||
        pin.kind === "gnd" ||
        pin.kind === "nc" ||
        pin.kind === "signal"
          ? pin.kind
          : "signal",
      ...(pin.dir ? { dir: pin.dir } : {}),
    })),
    pads: part.pads.map((pad) => ({
      pin: String(pad.pin),
      x: num(pad.x, 0),
      y: num(pad.y, 0),
      w: num(pad.w, 0.5, 0.05),
      h: num(pad.h, 0.5, 0.05),
      layer: pad.layer === "both" || isPcbLayer(pad.layer) ? pad.layer : "top",
      shape: pad.shape === "round" || pad.shape === "oval" ? pad.shape : "rect",
      ...(Number.isFinite(pad.drill)
        ? { drill: Math.max(0.1, Number(pad.drill)) }
        : {}),
    })),
    silk: part.silk.map((rect) => ({
      x: num(rect.x, 0),
      y: num(rect.y, 0),
      w: num(rect.w, 1, 0.05),
      h: num(rect.h, 1, 0.05),
    })),
    ...(part.custom === true ? { custom: true } : {}),
  };
}

function parseSchematic(value: unknown): PcbSchematic {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as PcbSchematic).sheets)
  )
    return emptySchematic() as PcbSchematic;
  const sheets: SchematicSheet[] = [];
  for (const raw of (value as PcbSchematic).sheets) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id : nextUid("sheet");
    const symbols: SchematicSymbol[] = Array.isArray(raw.symbols)
      ? raw.symbols.flatMap((symbol) => {
          if (
            !symbol ||
            typeof symbol.id !== "string" ||
            typeof symbol.partId !== "string" ||
            typeof symbol.designator !== "string" ||
            !Number.isFinite(symbol.x) ||
            !Number.isFinite(symbol.y)
          )
            return [];
          return [
            {
              id: symbol.id,
              partId: symbol.partId,
              designator: symbol.designator,
              x: Number(symbol.x),
              y: Number(symbol.y),
              pins: Array.isArray(symbol.pins)
                ? symbol.pins.flatMap((pin) =>
                    typeof pin.pin === "string" &&
                    Number.isFinite(pin.x) &&
                    Number.isFinite(pin.y)
                      ? [
                          {
                            pin: pin.pin,
                            x: Number(pin.x),
                            y: Number(pin.y),
                          },
                        ]
                      : [],
                  )
                : [],
            },
          ];
        })
      : [];
    sheets.push({
      id,
      name:
        typeof raw.name === "string" ? raw.name : `Sheet ${sheets.length + 1}`,
      symbols,
      wires: Array.isArray(raw.wires)
        ? raw.wires.flatMap((wire) => {
            if (
              !wire ||
              typeof wire.id !== "string" ||
              typeof wire.net !== "string"
            )
              return [];
            const points = parsePoints(wire.points);
            return points.length >= 2
              ? [{ id: wire.id, net: wire.net, points }]
              : [];
          })
        : [],
      junctions: Array.isArray(raw.junctions)
        ? raw.junctions.flatMap((junction) =>
            junction &&
            typeof junction.id === "string" &&
            Number.isFinite(junction.x) &&
            Number.isFinite(junction.y)
              ? [
                  {
                    id: junction.id,
                    x: Number(junction.x),
                    y: Number(junction.y),
                  },
                ]
              : [],
          )
        : [],
      powerPorts: Array.isArray(raw.powerPorts)
        ? raw.powerPorts.flatMap((port) =>
            port &&
            typeof port.id === "string" &&
            typeof port.net === "string" &&
            Number.isFinite(port.x) &&
            Number.isFinite(port.y)
              ? [
                  {
                    id: port.id,
                    net: port.net,
                    x: Number(port.x),
                    y: Number(port.y),
                    kind:
                      port.kind === "gnd" ? ("gnd" as const) : ("vcc" as const),
                  },
                ]
              : [],
          )
        : [],
      labels: Array.isArray(raw.labels)
        ? raw.labels.flatMap((label) =>
            label &&
            typeof label.id === "string" &&
            typeof label.net === "string" &&
            Number.isFinite(label.x) &&
            Number.isFinite(label.y)
              ? [
                  {
                    id: label.id,
                    net: label.net,
                    x: Number(label.x),
                    y: Number(label.y),
                  },
                ]
              : [],
          )
        : [],
      ports: Array.isArray(raw.ports)
        ? raw.ports.flatMap((port) =>
            port &&
            typeof port.id === "string" &&
            typeof port.name === "string" &&
            Number.isFinite(port.x) &&
            Number.isFinite(port.y)
              ? [
                  {
                    id: port.id,
                    name: port.name,
                    direction:
                      port.direction === "input" || port.direction === "output"
                        ? port.direction
                        : ("bidirectional" as const),
                    x: Number(port.x),
                    y: Number(port.y),
                  },
                ]
              : [],
          )
        : [],
    });
  }
  return { sheets: sheets.length > 0 ? sheets : emptySchematic().sheets };
}

function parseMcuLinks(value: unknown): PcbMcuLink[] {
  if (!Array.isArray(value)) return [];
  const links: PcbMcuLink[] = [];
  const usedElements = new Set<string>();
  const usedInstances = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Partial<PcbMcuLink>;
    if (typeof raw.designator !== "string" || !raw.designator.trim()) continue;
    if (typeof raw.instance !== "string" || !raw.instance.trim()) continue;
    const designator = raw.designator.trim();
    const instance = raw.instance.trim();
    if (usedElements.has(designator) || usedInstances.has(instance)) continue;
    usedElements.add(designator);
    usedInstances.add(instance);
    const pins: Record<string, string> = {};
    if (raw.pins && typeof raw.pins === "object") {
      for (const [pin, name] of Object.entries(raw.pins)) {
        if (typeof name === "string" && name.trim()) pins[pin] = name.trim();
      }
    }
    links.push({
      designator,
      instance,
      ...(Object.keys(pins).length > 0 ? { pins } : {}),
    });
  }
  return links;
}

export function pcbStudioFromDesign(design: string): PcbStudioDocument | null {
  if (!design.trim()) return emptyPcbStudio();
  try {
    const raw = JSON.parse(design) as Partial<PcbStudioDocument> & {
      v?: number;
    };
    const version = (raw as { v?: number }).v;
    if (
      raw.schema !== PCB_STUDIO_SCHEMA ||
      (version !== 1 && version !== PCB_STUDIO_VERSION) ||
      !raw.board ||
      !raw.project ||
      !raw.project.root ||
      !Array.isArray(raw.project.nets)
    )
      return null;
    const virtualMcuLinks = parseMcuLinks(raw.virtualMcuLinks);
    return {
      schema: PCB_STUDIO_SCHEMA,
      v: PCB_STUDIO_VERSION,
      name:
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name
          : SCADSTUDIO_PCB_NAME,
      board: parseBoard(raw.board),
      project: raw.project as PcbProject,
      traces: Array.isArray(raw.traces)
        ? raw.traces.flatMap((trace) => {
            const parsed = parseTrace(trace);
            return parsed ? [parsed] : [];
          })
        : [],
      vias: Array.isArray(raw.vias)
        ? raw.vias.flatMap((via) => {
            const parsed = parseVia(via);
            return parsed ? [parsed] : [];
          })
        : [],
      zones: Array.isArray(raw.zones)
        ? raw.zones.flatMap((zone) => {
            const parsed = parseZone(zone);
            return parsed ? [parsed] : [];
          })
        : [],
      cutouts: Array.isArray(raw.cutouts)
        ? raw.cutouts.flatMap((cutout) => {
            const parsed = parseCutout(cutout);
            return parsed ? [parsed] : [];
          })
        : [],
      schematic: parseSchematic(raw.schematic),
      library: Array.isArray(raw.library)
        ? raw.library.flatMap((part) => {
            const parsed = parseLibraryPart(part);
            return parsed ? [parsed] : [];
          })
        : [],
      ...(isEcadSnapshot(raw.virtualMcu) ? { virtualMcu: raw.virtualMcu } : {}),
      ...(virtualMcuLinks.length > 0 ? { virtualMcuLinks } : {}),
      rules: parseRules(raw.rules),
      createdAt: stamp(raw.createdAt),
      updatedAt: stamp(raw.updatedAt),
    };
  } catch {
    return null;
  }
}

export function nextPcbDesignator(
  doc: PcbStudioDocument,
  part: PcbLibraryPart,
): string {
  const used = new Set(allElements(doc.project).map((el) => el.designator));
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${part.prefix}${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${part.prefix}${Date.now().toString(36)}`;
}

function withProject(
  doc: PcbStudioDocument,
  project: PcbProject,
): PcbStudioDocument {
  return { ...doc, project, updatedAt: Date.now() };
}

function updateElement(
  project: PcbProject,
  designator: string,
  update: (element: PcbElement) => PcbElement,
): PcbProject {
  const root = structuredClone(project.root);
  const visit = (node: PcbNode): void => {
    if (node.kind === "element" && node.designator === designator) {
      Object.assign(node, update(node));
      return;
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(root);
  return { ...project, root };
}

export function addPcbLibraryPart(
  doc: PcbStudioDocument,
  libraryId: string,
  requestedDesignator?: string,
): PcbStudioDocument {
  const part = pcbLibraryPart(libraryId, doc);
  if (!part) return doc;
  const designator =
    requestedDesignator?.trim() || nextPcbDesignator(doc, part);
  if (byDesignator(doc.project, designator)) return doc;
  const element = makeElement(designator, {
    mpn: part.mpn,
    type: part.type,
    package: part.id,
    value: part.name,
    pins: part.pins.map((pin) => ({
      pin: pin.pin,
      name: pin.name,
      kind: pin.kind,
    })),
    position: {
      x: Math.round(doc.board.widthMM / 2),
      y: Math.round(doc.board.heightMM / 2),
      z: 0,
    },
  });
  return withProject(doc, addElement(doc.project, element));
}

export function addPcbCustomPart(
  doc: PcbStudioDocument,
  input: CustomPartInput,
): PcbStudioDocument {
  const part = createCustomPart(input);
  return {
    ...doc,
    library: [...doc.library, part],
    updatedAt: Date.now(),
  };
}

export function removePcbPart(
  doc: PcbStudioDocument,
  designator: string,
): PcbStudioDocument {
  return withProject(doc, syncPcbNets(removeElement(doc.project, designator)));
}

export function movePcbPart(
  doc: PcbStudioDocument,
  designator: string,
  x: number,
  y: number,
  rotation = 0,
): PcbStudioDocument {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return doc;
  const project = updateElement(doc.project, designator, (element) => ({
    ...element,
    position: {
      x: Math.max(0, Math.min(doc.board.widthMM, x)),
      y: Math.max(0, Math.min(doc.board.heightMM, y)),
      z: element.position.z,
    },
    rotation: Number.isFinite(rotation) ? rotation : element.rotation,
  }));
  return withProject(doc, project);
}

export function rotatePcbPart(
  doc: PcbStudioDocument,
  designator: string,
  rotation: number,
): PcbStudioDocument {
  const element = byDesignator(doc.project, designator);
  if (!element) return doc;
  return movePcbPart(
    doc,
    designator,
    element.position.x,
    element.position.y,
    rotation,
  );
}

export function syncPcbNets(project: PcbProject): PcbProject {
  const grouped = new Map<string, { designator: string; pin: string }[]>();
  for (const element of allElements(project)) {
    for (const pin of element.pins) {
      if (!pin.net?.trim()) continue;
      const key = pin.net.trim();
      const list = grouped.get(key) ?? [];
      list.push({ designator: element.designator, pin: pin.pin });
      grouped.set(key, list);
    }
  }
  const prior = new Map(project.nets.map((net) => [net.name, net]));
  const nets = [...grouped.entries()].map(([name, pins]) => {
    const existing = prior.get(name);
    return existing ? { ...existing, name, pins } : { ...makeNet(name), pins };
  });
  return { ...project, nets };
}

export function setPcbPinNet(
  doc: PcbStudioDocument,
  designator: string,
  pinId: string,
  net: string,
): PcbStudioDocument {
  const clean = net.trim();
  const project = updateElement(doc.project, designator, (element) => ({
    ...element,
    pins: element.pins.map((pin): PcbPin => {
      if (pin.pin !== pinId) return pin;
      if (!clean) {
        const { net: _removed, ...rest } = pin;
        return rest;
      }
      return { ...pin, net: clean };
    }),
  }));
  return withProject(doc, syncPcbNets(project));
}

export function addPcbTrace(
  doc: PcbStudioDocument,
  net: string,
  points: readonly Pt[],
  layer: PcbLayer = "top",
  widthMM = 0.25,
): PcbStudioDocument {
  if (!net.trim() || points.length < 2) return doc;
  const trace: PcbTrace = {
    id: nextUid("trace"),
    net: net.trim(),
    layer,
    widthMM: Math.max(0.05, widthMM),
    points: points.map((point) => ({ x: point.x, y: point.y })),
  };
  return { ...doc, traces: [...doc.traces, trace], updatedAt: Date.now() };
}

export function removePcbTrace(
  doc: PcbStudioDocument,
  traceId: string,
): PcbStudioDocument {
  return {
    ...doc,
    traces: doc.traces.filter((trace) => trace.id !== traceId),
    updatedAt: Date.now(),
  };
}

export function updatePcbBoard(
  doc: PcbStudioDocument,
  patch: Partial<PcbBoard>,
): PcbStudioDocument {
  const board: PcbBoard = {
    ...doc.board,
    ...patch,
    widthMM: Math.max(
      10,
      Number.isFinite(patch.widthMM)
        ? Number(patch.widthMM)
        : doc.board.widthMM,
    ),
    heightMM: Math.max(
      10,
      Number.isFinite(patch.heightMM)
        ? Number(patch.heightMM)
        : doc.board.heightMM,
    ),
    thicknessMM: Math.max(
      0.4,
      Number.isFinite(patch.thicknessMM)
        ? Number(patch.thicknessMM)
        : doc.board.thicknessMM,
    ),
    layers: patch.layers === 4 ? 4 : patch.layers === 2 ? 2 : doc.board.layers,
  };
  return { ...doc, board, updatedAt: Date.now() };
}

export function updatePcbRules(
  doc: PcbStudioDocument,
  patch: Partial<PcbDesignRules>,
): PcbStudioDocument {
  return {
    ...doc,
    rules: parseRules({ ...doc.rules, ...patch }),
    updatedAt: Date.now(),
  };
}

export function pcbFootprint(
  element: PcbElement,
  doc?: PcbStudioDocument,
): PcbLibraryPart | null {
  return element.package ? pcbLibraryPart(element.package, doc) : null;
}

export function pcbSheetCount(doc: PcbStudioDocument): number {
  return doc.schematic.sheets.length;
}

export function runPcbDrc(doc: PcbStudioDocument): PcbViolation[] {
  return runDesignRuleCheck(doc);
}

export function pcbBom(doc: PcbStudioDocument): BomRow[] {
  return buildBom(doc.project);
}

export function pcb3dBoxes(doc: PcbStudioDocument): Pcb3dBox[] {
  return pcbAssemblySolids(doc);
}

export function pcbBomCsv(doc: PcbStudioDocument): string {
  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [
    ["Designators", "Type", "Value", "MPN", "Qty", "Package"].join(","),
    ...pcbBom(doc).map((row) => {
      const first = row.designator[0] ?? "";
      const element = allElements(doc.project).find(
        (candidate) => candidate.designator === first,
      );
      return [
        row.designator.join(" "),
        row.type,
        row.value ?? "",
        row.mpn ?? "",
        String(row.qty),
        element?.package ?? "",
      ]
        .map(escape)
        .join(",");
    }),
  ].join("\n");
}

export function pcbProjectSummary(doc: PcbStudioDocument): {
  parts: number;
  nets: number;
  ics: number;
  sheets: number;
  vias: number;
  traces: number;
  zones: number;
} {
  const elements = allElements(doc.project);
  return {
    parts: elements.length,
    nets: doc.project.nets.length,
    ics: elements.filter((el) => el.designator.startsWith("U")).length,
    sheets: doc.schematic.sheets.length,
    vias: doc.vias.length,
    traces: doc.traces.length,
    zones: doc.zones.length,
  };
}

export type { PcbTracePoint as PcbTracePointType };
export type { PcbViolation as PcbStudioViolation };
export { PCB_LIBRARY as PCB_LIBRARY_PARTS } from "./library";
export { BUILTIN_LIBRARY as PCB_BUILTIN_LIBRARY } from "./library";
export { pcbLibraryPart as findPcbLibraryPart };
export { addPcbVia, addPcbZone, removePcbVia, removePcbZone } from "./layout";
