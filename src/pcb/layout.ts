// PCB layout: pad placement, ratsnest, auto-placement, vias, copper pours and
// a deterministic two-layer grid autorouter.
//
// Everything is pure over the document: callers get a new document back. The
// router is capped by grid size and expansions per edge so a bad board cannot
// freeze the tab; failures are reported per net instead of silently vanishing.

import {
  bboxOfPoints,
  pointInPoly,
  pointSegDist,
  polylineSegments,
  rotatePt,
  segSegDist,
  simplifyPoints,
} from "./geometry";
import { libraryPart } from "./library";
import type {
  PcbLayer,
  PcbPad,
  PcbStudioDocument,
  PcbTrace,
  PcbVia,
  PcbZone,
  Pt,
} from "./types";

export interface PadPlacement {
  designator: string;
  pin: string;
  net: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg: number;
  layer: PcbLayer | "both";
  shape: PcbPad["shape"];
  drill?: number;
}

export function footprintOf(
  doc: { library: ReadonlyArray<{ id: string }> } & PcbStudioDocument,
  element: { package?: string },
) {
  return element.package ? libraryPart(doc, element.package) : null;
}

export function elementPads(
  doc: PcbStudioDocument,
  element: {
    designator: string;
    package?: string;
    position: { x: number; y: number };
    rotation: number;
    pins: Array<{ pin: string; net?: string }>;
  },
): PadPlacement[] {
  const part = footprintOf(doc, element);
  if (!part) return [];
  return part.pads.map((pad) => {
    const p = rotatePt({ x: pad.x, y: pad.y }, element.rotation || 0, 0, 0);
    return {
      designator: element.designator,
      pin: pad.pin,
      net: element.pins.find((pin) => pin.pin === pad.pin)?.net ?? "",
      x: element.position.x + p.x,
      y: element.position.y + p.y,
      w: pad.w,
      h: pad.h,
      rotationDeg: element.rotation || 0,
      layer: pad.layer,
      shape: pad.shape,
      ...(pad.drill !== undefined ? { drill: pad.drill } : {}),
    };
  });
}

export function allPads(doc: PcbStudioDocument): PadPlacement[] {
  const out: PadPlacement[] = [];
  const walk = (node: import("../flux/domains/pcb/project").PcbNode): void => {
    if (node.kind === "element") out.push(...elementPads(doc, node));
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(doc.project.root);
  return out;
}

export function ledsOnLayers(layer: PcbLayer | "both"): PcbLayer[] {
  if (layer === "both") return ["top", "bottom"];
  return [layer];
}

export function padPolygon(pad: PadPlacement): Pt[] {
  const hw = pad.w / 2;
  const hh = pad.h / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((point) => {
    const rotated = rotatePt(point, pad.rotationDeg, 0, 0);
    return { x: pad.x + rotated.x, y: pad.y + rotated.y };
  });
}

/** Silkscreen rectangles for an element, in board coordinates. */
export function elementSilk(
  doc: PcbStudioDocument,
  element: {
    designator: string;
    package?: string;
    position: { x: number; y: number };
    rotation: number;
  },
): Pt[][] {
  const part = footprintOf(doc, element);
  if (!part) return [];
  return part.silk.map((rect) =>
    [
      { x: rect.x - rect.w / 2, y: rect.y - rect.h / 2 },
      { x: rect.x + rect.w / 2, y: rect.y - rect.h / 2 },
      { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
      { x: rect.x - rect.w / 2, y: rect.y + rect.h / 2 },
    ].map((p) => {
      const r = rotatePt(p, element.rotation || 0, 0, 0);
      return { x: element.position.x + r.x, y: element.position.y + r.y };
    }),
  );
}

// ---------------------------------------------------------------------------
// Ratsnest + connectivity
// ---------------------------------------------------------------------------

export interface RatsnestEdge {
  net: string;
  a: PadPlacement;
  b: PadPlacement;
  lengthMM: number;
}

/** Minimum spanning tree over each net's pads, the classic ratsnest. */
export function pcbRatsnest(doc: PcbStudioDocument): RatsnestEdge[] {
  const byNet = new Map<string, PadPlacement[]>();
  for (const pad of allPads(doc)) {
    if (!pad.net) continue;
    const list = byNet.get(pad.net) ?? [];
    list.push(pad);
    byNet.set(pad.net, list);
  }
  const out: RatsnestEdge[] = [];
  for (const [net, pads] of byNet) {
    if (pads.length < 2) continue;
    const inTree = new Set<number>([0]);
    while (inTree.size < pads.length) {
      let best: RatsnestEdge | null = null;
      for (const i of inTree) {
        for (let j = 0; j < pads.length; j += 1) {
          if (inTree.has(j)) continue;
          const a = pads[i]!;
          const b = pads[j]!;
          const lengthMM = Math.hypot(a.x - b.x, a.y - b.y);
          if (!best || lengthMM < best.lengthMM) best = { net, a, b, lengthMM };
        }
      }
      if (!best) break;
      out.push(best);
      const next = pads.findIndex(
        (pad) =>
          pad.designator === best!.b.designator && pad.pin === best!.b.pin,
      );
      if (next === -1) break;
      inTree.add(next);
    }
  }
  return out.sort(
    (a, b) =>
      a.net.localeCompare(b.net) ||
      a.a.designator.localeCompare(b.a.designator),
  );
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

export interface ConnectivityResult {
  nets: Array<{ net: string; pads: number; connected: boolean }>;
  /** Pads outside the largest copper island of their net. */
  broken: Array<{ net: string; pads: PadPlacement[] }>;
}

function traceTouchesPad(trace: PcbTrace, pad: PadPlacement): boolean {
  const reach = Math.max(pad.w, pad.h) / 2 + trace.widthMM / 2 + 0.08;
  return polylineSegments(trace.points).some(
    ([a, b]) => pointSegDist({ x: pad.x, y: pad.y }, a, b) <= reach,
  );
}

/** Copper connectivity of each net: are all its pads on one island? */
export function netConnectivity(doc: PcbStudioDocument): ConnectivityResult {
  const pads = allPads(doc);
  const byNet = new Map<string, PadPlacement[]>();
  for (const pad of pads) {
    if (!pad.net) continue;
    const list = byNet.get(pad.net) ?? [];
    list.push(pad);
    byNet.set(pad.net, list);
  }
  const tracesByNet = new Map<string, PcbTrace[]>();
  for (const trace of doc.traces) {
    const list = tracesByNet.get(trace.net) ?? [];
    list.push(trace);
    tracesByNet.set(trace.net, list);
  }

  const result: ConnectivityResult = { nets: [], broken: [] };
  for (const [net, netPads] of byNet) {
    const traces = tracesByNet.get(net) ?? [];
    if (netPads.length < 2) continue;
    const outerZones = doc.zones.filter(
      (zone) =>
        zone.net === net && (zone.layer === "top" || zone.layer === "bottom"),
    );
    const zoneBase = netPads.length + traces.length;
    const dsu = new Dsu(zoneBase + outerZones.length);
    for (let i = 0; i < netPads.length; i += 1) {
      for (let j = 0; j < traces.length; j += 1) {
        if (traceTouchesPad(traces[j]!, netPads[i]!))
          dsu.union(i, netPads.length + j);
      }
      // Copper pours connect same-net pads they cover on their layer.
      for (let j = 0; j < outerZones.length; j += 1) {
        const zone = outerZones[j]!;
        const pad = netPads[i]!;
        if (pad.layer !== "both" && pad.layer !== zone.layer) continue;
        if (pointInPoly({ x: pad.x, y: pad.y }, zone.points))
          dsu.union(i, zoneBase + j);
      }
    }
    // A via inside two pours bridges them (top ↔ bottom).
    for (const via of doc.vias) {
      if (via.net !== net) continue;
      const hits: number[] = [];
      outerZones.forEach((zone, index) => {
        if (pointInPoly({ x: via.x, y: via.y }, zone.points))
          hits.push(zoneBase + index);
      });
      for (const hit of hits.slice(1)) dsu.union(hits[0]!, hit);
    }
    for (let i = 0; i < traces.length; i += 1) {
      for (let j = i + 1; j < traces.length; j += 1) {
        const a = traces[i]!;
        const b = traces[j]!;
        let joined = false;
        for (const pa of [a.points[0], a.points[a.points.length - 1]]) {
          if (!pa) continue;
          for (const pb of [b.points[0], b.points[b.points.length - 1]]) {
            if (!pb) continue;
            if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= 0.25) joined = true;
          }
        }
        if (!joined) {
          for (const [a1, a2] of polylineSegments(a.points)) {
            for (const [b1, b2] of polylineSegments(b.points)) {
              if (segSegDist(a1, a2, b1, b2) <= 0.02) joined = true;
            }
          }
        }
        if (joined) dsu.union(netPads.length + i, netPads.length + j);
      }
    }
    const groups = new Map<number, PadPlacement[]>();
    netPads.forEach((pad, index) => {
      const root = dsu.find(index);
      const list = groups.get(root) ?? [];
      list.push(pad);
      groups.set(root, list);
    });
    const connected = groups.size <= 1;
    result.nets.push({ net, pads: netPads.length, connected });
    if (!connected) {
      const largest = [...groups.values()].sort(
        (a, b) => b.length - a.length,
      )[0];
      const orphans: PadPlacement[] = [];
      for (const group of groups.values())
        if (group !== largest) orphans.push(...group);
      result.broken.push({ net, pads: orphans });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export interface PlacementReport {
  placed: number;
  unplaced: string[];
  rows: number;
}

/** Deterministic shelf placement with courtyard spacing. */
export function autoPlacePcb(
  doc: PcbStudioDocument,
  opts: { marginMM?: number; gapMM?: number } = {},
): { doc: PcbStudioDocument; report: PlacementReport } {
  const margin = Math.max(1, opts.marginMM ?? 3);
  const gap = Math.max(0, opts.gapMM ?? doc.rules.courtyardMM);
  const elements: Array<{
    designator: string;
    w: number;
    h: number;
  }> = [];
  const walk = (node: import("../flux/domains/pcb/project").PcbNode): void => {
    if (node.kind === "element") {
      const part = footprintOf(doc, node);
      elements.push({
        designator: node.designator,
        w: part?.widthMM ?? 6,
        h: part?.heightMM ?? 4,
      });
    }
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(doc.project.root);
  elements.sort(
    (a, b) =>
      b.h - a.h || b.w - a.w || a.designator.localeCompare(b.designator),
  );

  const usableW = Math.max(1, doc.board.widthMM - margin * 2);
  const usableH = Math.max(1, doc.board.heightMM - margin * 2);
  const positions = new Map<string, { x: number; y: number }>();
  const unplaced: string[] = [];
  let cursorX = margin;
  let rowTop = doc.board.heightMM - margin;
  let rowHeight = 0;
  let rows = 0;

  for (const element of elements) {
    if (element.w > usableW || element.h > usableH) {
      unplaced.push(element.designator);
      continue;
    }
    if (cursorX + element.w > margin + usableW) {
      cursorX = margin;
      rowTop -= rowHeight + gap;
      rowHeight = 0;
      rows += 1;
    }
    const centerY = rowTop - element.h / 2;
    if (centerY - element.h / 2 < margin) {
      unplaced.push(element.designator);
      continue;
    }
    positions.set(element.designator, {
      x: cursorX + element.w / 2,
      y: centerY,
    });
    cursorX += element.w + gap;
    rowHeight = Math.max(rowHeight, element.h);
  }

  const project = structuredClone(doc.project);
  const walkApply = (
    node: import("../flux/domains/pcb/project").PcbNode,
  ): void => {
    if (node.kind === "element") {
      const pos = positions.get(node.designator);
      if (pos) {
        node.position.x = pos.x;
        node.position.y = pos.y;
        node.rotation = 0;
      }
    }
    if ("children" in node) for (const child of node.children) walkApply(child);
  };
  walkApply(project.root);

  return {
    doc: { ...doc, project, updatedAt: Date.now() },
    report: {
      placed: positions.size,
      unplaced,
      rows: Math.max(rows, 1),
    },
  };
}

// ---------------------------------------------------------------------------
// Vias, pours, cutouts
// ---------------------------------------------------------------------------

let layoutSeq = 0;
function uid(prefix: string): string {
  layoutSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${layoutSeq.toString(36)}`;
}

export function addPcbVia(
  doc: PcbStudioDocument,
  net: string,
  x: number,
  y: number,
  opts: {
    drillMM?: number;
    padMM?: number;
    from?: PcbLayer;
    to?: PcbLayer;
  } = {},
): PcbStudioDocument {
  if (!net.trim() || !Number.isFinite(x) || !Number.isFinite(y)) return doc;
  const via: PcbVia = {
    id: uid("via"),
    net: net.trim(),
    x,
    y,
    drillMM: Math.max(doc.rules.minViaDrillMM, opts.drillMM ?? 0.3),
    padMM: Math.max(doc.rules.minViaPadMM, opts.padMM ?? 0.6),
    from: opts.from ?? "top",
    to: opts.to ?? "bottom",
  };
  return { ...doc, vias: [...doc.vias, via], updatedAt: Date.now() };
}

export function removePcbVia(
  doc: PcbStudioDocument,
  viaId: string,
): PcbStudioDocument {
  return {
    ...doc,
    vias: doc.vias.filter((via) => via.id !== viaId),
    updatedAt: Date.now(),
  };
}

export function addPcbZone(
  doc: PcbStudioDocument,
  net: string,
  layer: PcbLayer,
  points: readonly Pt[],
  opts: { clearanceMM?: number; fill?: PcbZone["fill"] } = {},
): PcbStudioDocument {
  if (!net.trim() || points.length < 3) return doc;
  const zone: PcbZone = {
    id: uid("zone"),
    net: net.trim(),
    layer,
    points: points.map((p) => ({ x: p.x, y: p.y })),
    clearanceMM: Math.max(0.05, opts.clearanceMM ?? doc.rules.minClearanceMM),
    fill: opts.fill ?? "solid",
  };
  return { ...doc, zones: [...doc.zones, zone], updatedAt: Date.now() };
}

export function removePcbZone(
  doc: PcbStudioDocument,
  zoneId: string,
): PcbStudioDocument {
  return {
    ...doc,
    zones: doc.zones.filter((zone) => zone.id !== zoneId),
    updatedAt: Date.now(),
  };
}

/** Rectangle pour inset from the board outline. */
export function pourRect(
  doc: PcbStudioDocument,
  net: string,
  layer: PcbLayer,
  inset = 1.2,
): PcbStudioDocument {
  const points: Pt[] = [
    { x: inset, y: inset },
    { x: doc.board.widthMM - inset, y: inset },
    { x: doc.board.widthMM - inset, y: doc.board.heightMM - inset },
    { x: inset, y: doc.board.heightMM - inset },
  ];
  return addPcbZone(doc, net, layer, points);
}

export function addPcbCutout(
  doc: PcbStudioDocument,
  points: readonly Pt[],
): PcbStudioDocument {
  if (points.length < 3) return doc;
  return {
    ...doc,
    cutouts: [
      ...doc.cutouts,
      { id: uid("cutout"), points: points.map((p) => ({ x: p.x, y: p.y })) },
    ],
    updatedAt: Date.now(),
  };
}

export function removePcbCutout(
  doc: PcbStudioDocument,
  cutoutId: string,
): PcbStudioDocument {
  return {
    ...doc,
    cutouts: doc.cutouts.filter((cutout) => cutout.id !== cutoutId),
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Autorouter
// ---------------------------------------------------------------------------

export interface AutorouteOptions {
  gridMM?: number;
  viaCost?: number;
  traceMM?: number;
  maxExpansionsPerEdge?: number;
  maxEdges?: number;
}

export interface AutorouteEdge {
  net: string;
  from: string;
  to: string;
  ok: boolean;
  points: number;
  reason?: string;
}

export interface AutorouteReport {
  routed: number;
  failed: number;
  edges: AutorouteEdge[];
  vias: number;
  traces: number;
  ms: number;
  gridMM: number;
}

class MinHeap {
  private ids: number[] = [];
  private fs: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, f: number): void {
    this.ids.push(id);
    this.fs.push(f);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.fs[parent]! <= this.fs[i]!) break;
      this.swap(parent, i);
      i = parent;
    }
  }
  pop(): number {
    const top = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastF = this.fs.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.fs[0] = lastF;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.ids.length && this.fs[left]! < this.fs[smallest]!)
          smallest = left;
        if (right < this.ids.length && this.fs[right]! < this.fs[smallest]!)
          smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    const id = this.ids[a]!;
    this.ids[a] = this.ids[b]!;
    this.ids[b] = id;
    const f = this.fs[a]!;
    this.fs[a] = this.fs[b]!;
    this.fs[b] = f;
  }
}

const BLOCK = 0xffff;

/**
 * Route every net with A* on a two-layer grid. Existing traces/vias are
 * replaced; zones are kept. Returns a report per net edge, including failures.
 */
export function autoroutePcb(
  doc: PcbStudioDocument,
  opts: AutorouteOptions = {},
): { doc: PcbStudioDocument; report: AutorouteReport } {
  const started = performance.now();
  const grid = Math.max(0.2, Math.min(2, opts.gridMM ?? 0.5));
  const viaCost = Math.max(2, opts.viaCost ?? 8);
  const traceMM = Math.max(
    doc.rules.minTraceMM,
    opts.traceMM ?? doc.rules.minTraceMM,
  );
  const maxExpansions = Math.max(1000, opts.maxExpansionsPerEdge ?? 160_000);
  const maxEdges = Math.max(1, opts.maxEdges ?? 300);

  const nx = Math.max(2, Math.ceil(doc.board.widthMM / grid));
  const ny = Math.max(2, Math.ceil(doc.board.heightMM / grid));
  const area = nx * ny;
  const occ = new Uint16Array(area * 2);
  const clampCell = (v: number, max: number) =>
    Math.max(0, Math.min(max - 1, v));
  const cellX = (x: number) => clampCell(Math.floor(x / grid), nx);
  const cellY = (y: number) => clampCell(Math.floor(y / grid), ny);
  const cellCenterX = (ix: number) => (ix + 0.5) * grid;
  const cellCenterY = (iy: number) => (iy + 0.5) * grid;

  // Board edge margin.
  const margin = Math.max(0.35, traceMM);
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      if (
        cellCenterX(ix) < margin ||
        cellCenterY(iy) < margin ||
        cellCenterX(ix) > doc.board.widthMM - margin ||
        cellCenterY(iy) > doc.board.heightMM - margin
      ) {
        occ[iy * nx + ix] = BLOCK;
        occ[area + iy * nx + ix] = BLOCK;
      }
    }
  }

  const pads = allPads(doc);
  // Nets with an outer copper pour are connected by the pour; routing them as
  // traces too would only wall the router in.
  const pouredNets = new Set(
    doc.zones
      .filter((zone) => zone.layer === "top" || zone.layer === "bottom")
      .map((zone) => zone.net),
  );
  const nets = [...new Set(pads.map((pad) => pad.net).filter(Boolean))]
    .filter((net) => !pouredNets.has(net))
    .sort();
  const netId = new Map<string, number>();
  nets.forEach((net, index) => netId.set(net, index + 1));

  const padLayerIndexes = (pad: PadPlacement): number[] => {
    if (pad.layer === "both") return [0, 1];
    if (pad.layer === "top") return [0];
    if (pad.layer === "bottom") return [1];
    return [];
  };

  // A trace centre needs minClearance + traceMM/2 from a foreign pad edge.
  // Add a hair of margin so grid-rounded paths stay DRC-clean.
  const clearance =
    Math.max(doc.rules.minClearanceMM, 0.1) + traceMM / 2 + 0.02;
  for (const pad of pads) {
    const id = pad.net ? (netId.get(pad.net) ?? BLOCK) : BLOCK;
    const x0 = clampCell(
      Math.floor((pad.x - pad.w / 2 - clearance) / grid),
      nx,
    );
    const x1 = clampCell(Math.ceil((pad.x + pad.w / 2 + clearance) / grid), nx);
    const y0 = clampCell(
      Math.floor((pad.y - pad.h / 2 - clearance) / grid),
      ny,
    );
    const y1 = clampCell(Math.ceil((pad.y + pad.h / 2 + clearance) / grid), ny);
    for (const layer of padLayerIndexes(pad)) {
      for (let iy = y0; iy <= y1; iy += 1) {
        for (let ix = x0; ix <= x1; ix += 1) {
          const cx = cellCenterX(ix);
          const cy = cellCenterY(iy);
          if (
            Math.abs(cx - pad.x) <= pad.w / 2 + clearance &&
            Math.abs(cy - pad.y) <= pad.h / 2 + clearance
          ) {
            const index = layer * area + iy * nx + ix;
            const prior = occ[index];
            if (prior === 0 || prior === id) occ[index] = id;
            else if (prior === BLOCK) occ[index] = BLOCK;
            else occ[index] = BLOCK;
          }
        }
      }
    }
  }

  const byNet = new Map<string, PadPlacement[]>();
  for (const pad of pads) {
    if (!pad.net) continue;
    const list = byNet.get(pad.net) ?? [];
    list.push(pad);
    byNet.set(pad.net, list);
  }

  const edges: AutorouteEdge[] = [];
  const traces: PcbTrace[] = [];
  const vias: PcbVia[] = [];
  let routed = 0;
  let failed = 0;

  const mstEdges = (netPads: PadPlacement[]): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    if (netPads.length < 2) return out;
    const inTree = new Set<number>([0]);
    while (inTree.size < netPads.length) {
      let best: [number, number] | null = null;
      let bestLen = Infinity;
      for (const i of inTree) {
        for (let j = 0; j < netPads.length; j += 1) {
          if (inTree.has(j)) continue;
          const len = Math.hypot(
            netPads[i]!.x - netPads[j]!.x,
            netPads[i]!.y - netPads[j]!.y,
          );
          if (len < bestLen) {
            bestLen = len;
            best = [i, j];
          }
        }
      }
      if (!best) break;
      out.push(best);
      inTree.add(best[1]);
    }
    return out;
  };

  const routedNets = nets.slice().sort((a, b) => {
    const pa = byNet.get(a)?.length ?? 0;
    const pb = byNet.get(b)?.length ?? 0;
    return pa - pb || a.localeCompare(b);
  });
  for (const net of routedNets) {
    const netPads = (byNet.get(net) ?? []).slice().sort((a, b) =>
      `${a.designator}.${a.pin}`.localeCompare(
        `${b.designator}.${b.pin}`,
        undefined,
        {
          numeric: true,
        },
      ),
    );
    if (netPads.length < 2) continue;
    const id = netId.get(net) ?? BLOCK;
    for (const [ai, bi] of mstEdges(netPads)) {
      if (edges.length >= maxEdges) break;
      const from = netPads[ai]!;
      const to = netPads[bi]!;
      const startLayer = padLayerIndexes(from).includes(0) ? 0 : 1;
      const goalLayer = padLayerIndexes(to).includes(0) ? 0 : 1;

      // The grid cell nearest a pad centre can belong to a neighbouring pad's
      // clearance. Pick a free cell *inside this pad* instead.
      const pickPadCell = (
        pad: PadPlacement,
        layer: number,
      ): { x: number; y: number } => {
        const fallback = { x: cellX(pad.x), y: cellY(pad.y) };
        const x0 = clampCell(Math.floor((pad.x - pad.w / 2 - grid) / grid), nx);
        const x1 = clampCell(Math.ceil((pad.x + pad.w / 2 + grid) / grid), nx);
        const y0 = clampCell(Math.floor((pad.y - pad.h / 2 - grid) / grid), ny);
        const y1 = clampCell(Math.ceil((pad.y + pad.h / 2 + grid) / grid), ny);
        let best = fallback;
        let bestDistance = Infinity;
        for (let iy = y0; iy <= y1; iy += 1) {
          for (let ix = x0; ix <= x1; ix += 1) {
            const cx = cellCenterX(ix);
            const cy = cellCenterY(iy);
            if (
              Math.abs(cx - pad.x) > pad.w / 2 ||
              Math.abs(cy - pad.y) > pad.h / 2
            )
              continue;
            if (occ[layer * area + iy * nx + ix] !== id) continue;
            const distance = Math.hypot(cx - pad.x, cy - pad.y);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = { x: ix, y: iy };
            }
          }
        }
        return best;
      };

      const startCell = pickPadCell(from, startLayer);
      const goalCell = pickPadCell(to, goalLayer);
      const sx = startCell.x;
      const sy = startCell.y;
      const gx = goalCell.x;
      const gy = goalCell.y;
      const startState = startLayer * area + sy * nx + sx;
      const goalState = goalLayer * area + gy * nx + gx;

      const total = area * 2;
      const gScore = new Float64Array(total).fill(Infinity);
      const came = new Int32Array(total).fill(-1);
      const closed = new Uint8Array(total);
      const heap = new MinHeap();
      const heuristic = (state: number): number => {
        const layer = state >= area ? 1 : 0;
        const cell = state - layer * area;
        const x = cell % nx;
        const y = Math.floor(cell / nx);
        return (
          Math.abs(x - gx) +
          Math.abs(y - gy) +
          (layer === goalLayer ? 0 : viaCost)
        );
      };
      gScore[startState] = 0;
      heap.push(startState, heuristic(startState));
      let found = false;
      let expansions = 0;
      const dirs: Array<[number, number]> = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

      while (heap.size > 0 && expansions < maxExpansions) {
        const state = heap.pop();
        if (closed[state]) continue;
        closed[state] = 1;
        expansions += 1;
        if (state === goalState) {
          found = true;
          break;
        }
        const layer = state >= area ? 1 : 0;
        const cell = state - layer * area;
        const x = cell % nx;
        const y = Math.floor(cell / nx);
        const baseG = gScore[state]!;
        for (const [dx, dy] of dirs) {
          const nxp = x + dx;
          const nyp = y + dy;
          if (nxp < 0 || nyp < 0 || nxp >= nx || nyp >= ny) continue;
          const nCell = nyp * nx + nxp;
          const index = layer * area + nCell;
          const owner = occ[index];
          if (owner !== 0 && owner !== id) continue;
          const next = index;
          const tentative = baseG + 1;
          if (tentative < gScore[next]!) {
            gScore[next] = tentative;
            came[next] = state;
            heap.push(next, tentative + heuristic(next));
          }
        }
        if (occ[state] !== BLOCK) {
          const otherLayer = layer === 0 ? 1 : 0;
          const otherState = otherLayer * area + cell;
          const owner = occ[otherState];
          if (owner === 0 || owner === id) {
            const tentative = baseG + viaCost;
            if (tentative < gScore[otherState]!) {
              gScore[otherState] = tentative;
              came[otherState] = state;
              heap.push(otherState, tentative + heuristic(otherState));
            }
          }
        }
      }

      if (!found) {
        failed += 1;
        const startOwner = occ[startState];
        const goalOwner = occ[goalState];
        edges.push({
          net,
          from: `${from.designator}.${from.pin}`,
          to: `${to.designator}.${to.pin}`,
          ok: false,
          points: 0,
          reason:
            expansions >= maxExpansions
              ? "expansion cap"
              : `no path (start ${startOwner === BLOCK ? "blocked" : startOwner}, goal ${goalOwner === BLOCK ? "blocked" : goalOwner}, net ${id})`,
        });
        continue;
      }

      const states: number[] = [];
      for (let state = goalState; state !== -1; state = came[state]!) {
        states.push(state);
        if (state === startState) break;
      }
      states.reverse();
      const points = states.map((state) => {
        const layer = state >= area ? 1 : 0;
        const cell = state - layer * area;
        return {
          x: cellCenterX(cell % nx),
          y: cellCenterY(Math.floor(cell / nx)),
          layer,
        };
      });
      if (points.length > 0) {
        points[0] = { x: from.x, y: from.y, layer: points[0]!.layer };
        points[points.length - 1] = {
          x: to.x,
          y: to.y,
          layer: points[points.length - 1]!.layer,
        };
      }

      let run: Pt[] = [];
      let runLayer = points[0]?.layer ?? 0;
      const flush = (): void => {
        const simplified = simplifyPoints(run);
        if (simplified.length >= 2) {
          traces.push({
            id: uid("trace"),
            net,
            layer: runLayer === 0 ? "top" : "bottom",
            widthMM: traceMM,
            points: simplified,
          });
        }
        run = [];
      };
      for (let i = 0; i < points.length; i += 1) {
        const point = points[i]!;
        if (i > 0 && point.layer !== runLayer) {
          flush();
          vias.push({
            id: uid("via"),
            net,
            x: point.x,
            y: point.y,
            drillMM: Math.max(doc.rules.minViaDrillMM, 0.3),
            padMM: Math.max(doc.rules.minViaPadMM, 0.6),
            from: runLayer === 0 ? "top" : "bottom",
            to: point.layer === 0 ? "top" : "bottom",
          });
          runLayer = point.layer;
          run.push({ x: point.x, y: point.y });
        } else {
          run.push({ x: point.x, y: point.y });
        }
        const state = point.layer * area + cellY(point.y) * nx + cellX(point.x);
        if (occ[state] !== BLOCK) occ[state] = id;
      }
      flush();
      routed += 1;
      edges.push({
        net,
        from: `${from.designator}.${from.pin}`,
        to: `${to.designator}.${to.pin}`,
        ok: true,
        points: points.length,
      });
    }
  }

  return {
    doc: { ...doc, traces, vias, updatedAt: Date.now() },
    report: {
      routed,
      failed,
      edges,
      vias: vias.length,
      traces: traces.length,
      ms: Math.round(performance.now() - started),
      gridMM: grid,
    },
  };
}

export function traceBBox(trace: PcbTrace): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return bboxOfPoints(trace.points);
}
