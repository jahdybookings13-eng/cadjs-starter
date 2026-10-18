// scadgen rebuild executor: walks the ScadgenHistory feature tree and drives
// the cadjs OCC kernel (SketchToBrepService + extrudeBRep/filletBRep/...).
// Provenance refs ({creationFeatureId, entityTag}) resolve against a per-build
// output registry — Onshape's qCreatedBy equivalent for this codebase.
import * as THREE from "three";
import {
  Brep,
  Edge as BrepEdge,
  Face as BrepFace,
  Vertex as BrepVertex,
  chamferBRep,
  extrudeBRep,
  filletBRep,
  ImportExportService,
  loftBReps,
  OccWorkerClient,
  revolveBRep,
  type ConstraintType,
  type Sketch,
  type SketchPlane,
  SketchSolverService,
  shellBRep,
  draftBRep,
  holeBRep,
  patternBRep,
  deleteFaceBRep,
  splitBRep,
  sectionBRep,
  moveFaceBRep,
  thickenBRep,
  threadBRep,
  projectCurvesBRep,
  surfaceOpBRep,
  SketchToBrepService,
  makeSketchConstraint,
  requiresValue,
  validateConstraint,
  sweepBRep,
  transformBrepVertices,
  type ParityResult,
} from "@vitekk02/cadjs";
import { getImportAsset } from "./assets";
import {
  resolveThread,
  type ThreadSpec,
  type ThreadStandard,
} from "./threadStandards";
import { matchEdgeTags, matchFaceTags } from "./tagStability";
import { TagChain } from "./tagChain";
import {
  DIM_ANGLE,
  DIM_LENGTH,
  DIM_NONE,
  dimsEqual,
  dimLabel,
  evalExpr,
  type Dim,
  type Scope,
} from "./expression";
import type { ScadgenHistory, FeatureStatus } from "./featureEngine";
import {
  extrudeDepthOf,
  type ProvenanceQuery,
  type ScadgenFeatureNode,
  type ScadgenParameter,
} from "./onshapeHistory";

export type ExecStatus = "OK" | "ERROR" | FeatureStatus;

export interface BodyOutput {
  featureId: string;
  kind: "profile" | "body";
  brep: Brep;
  occBrep?: string | undefined;
  position: THREE.Vector3;
  planeNormal?: [number, number, number] | undefined;
  edgeTags: string[];
  faceTags: string[];
  edgeGeometry?: THREE.BufferGeometry | undefined;
  faceGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
  snapshot?: SketchSnapshot;
  /** Sibling bodies produced by the same feature (split-both, separate
   *  patterns). Each carries featureId `${fid}#${k}` — body addressing lives
   *  in the owner id itself, so tags/ownership/chains work unchanged. */
  additionalBodies?: BodyOutput[];
}

export interface ExecReport {
  [featureId: string]: { status: ExecStatus; detail?: string };
}

interface SnapshotPlane {
  type: string;
  origin: number[];
  normal: number[];
  xAxis: number[];
  yAxis: number[];
  offset?: number;
}

export interface SnapPoint {
  id: string;
  type: "point";
  x: number;
  y: number;
}
export interface SnapLine {
  id: string;
  type: "line";
  p1Id: string;
  p2Id: string;
}

interface SketchSnapshot {
  id: string;
  plane: SnapshotPlane;
  primitives: unknown[];
  constraints?: unknown[];
}

function revivePlane(p: SnapshotPlane): SketchPlane {
  const vec = (a: number[]) =>
    new THREE.Vector3(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0);
  return {
    type: p.type as SketchPlane["type"],
    origin: vec(p.origin),
    normal: vec(p.normal),
    xAxis: vec(p.xAxis),
    yAxis: vec(p.yAxis),
    offset: p.offset ?? 0,
    sourceElementId: undefined,
  };
}

function snapshotOf(node: ScadgenFeatureNode): SketchSnapshot | null {
  const s = node.extensions?.sketch;
  if (!s || typeof s !== "object") return null;
  const cand = s as Partial<SketchSnapshot>;
  if (!cand.plane || !Array.isArray(cand.primitives)) return null;
  return {
    id: cand.id ?? node.featureId,
    plane: cand.plane,
    primitives: cand.primitives,
    constraints: cand.constraints ?? [],
  };
}

const EXPECTED_DIMS: Record<string, Dim> = {
  depth: DIM_LENGTH,
  radius: DIM_LENGTH,
  width: DIM_LENGTH,
  thickness: DIM_LENGTH,
  spacing: DIM_LENGTH,
  angleForward: DIM_ANGLE,
  count: DIM_NONE,
};

function quantityOf(
  node: ScadgenFeatureNode,
  parameterId: string,
  scope: Scope = {},
): number | null {
  const p = node.parameters.find(
    (x): x is Extract<ScadgenParameter, { kind: "quantity" }> =>
      x.kind === "quantity" && x.parameterId === parameterId,
  );
  if (!p) return null;
  const evaluated = evalExpr(p.expression, scope);
  if (!evaluated.ok) {
    if (p.value) return p.value;
    throw new Error(`'${parameterId}': ${evaluated.error}`);
  }
  const expect = EXPECTED_DIMS[parameterId];
  if (expect && !dimsEqual(evaluated.dim, expect))
    throw new Error(
      `'${parameterId}': expected ${dimLabel(expect)}, got ${dimLabel(evaluated.dim)}`,
    );
  return evaluated.value;
}

export function stringOf(
  node: ScadgenFeatureNode,
  parameterId: string,
): string | null {
  const p = node.parameters.find(
    (x): x is Extract<ScadgenParameter, { kind: "string" }> =>
      x.kind === "string" && x.parameterId === parameterId,
  );
  return p ? p.value : null;
}

function stringOfParam(
  node: ScadgenFeatureNode,
  parameterId: string,
): string | null {
  const p = node.parameters.find(
    (x): x is Extract<ScadgenParameter, { kind: "string" }> =>
      x.kind === "string" && x.parameterId === parameterId,
  );
  return p ? p.value : null;
}

function boolOfParam(node: ScadgenFeatureNode, parameterId: string): boolean {
  const p = node.parameters.find(
    (x): x is Extract<ScadgenParameter, { kind: "boolean" }> =>
      x.kind === "boolean" && x.parameterId === parameterId,
  );
  return p ? p.value : false;
}

function listOf(
  node: ScadgenFeatureNode,
  parameterId: string,
): ProvenanceQuery[] {
  const p = node.parameters.find(
    (x): x is Extract<ScadgenParameter, { kind: "queryList" }> =>
      x.kind === "queryList" && x.parameterId === parameterId,
  );
  return p ? p.queries : [];
}

const at = (a: number[], i: number): number => a[i] ?? 0;

export function vecOf(a: number[]): { x: number; y: number; z: number } {
  return { x: at(a, 0), y: at(a, 1), z: at(a, 2) };
}

export function pointToWorld(
  plane: SnapshotPlane,
  x: number,
  y: number,
): { x: number; y: number; z: number } {
  const ax = plane.xAxis;
  const ay = plane.yAxis;
  const o = plane.origin;
  return {
    x: at(o, 0) + at(ax, 0) * x + at(ay, 0) * y,
    y: at(o, 1) + at(ax, 1) * x + at(ay, 1) * y,
    z: at(o, 2) + at(ax, 2) * x + at(ay, 2) * y,
  };
}

export function axisFromSnapshot(
  snap: SketchSnapshot,
  entityTag: string,
): {
  origin: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
} | null {
  if (entityTag === "NORMAL") {
    return { origin: vecOf(snap.plane.origin), dir: vecOf(snap.plane.normal) };
  }
  const pts = new Map<string, SnapPoint>();
  for (const p of snap.primitives as Partial<SnapPoint>[]) {
    if (p?.type === "point" && p.id) {
      pts.set(p.id, { id: p.id, type: "point", x: p.x ?? 0, y: p.y ?? 0 });
    }
  }
  const line = (snap.primitives as Partial<SnapLine>[]).find(
    (p) => p?.type === "line" && p.id === entityTag,
  );
  if (!line?.p1Id || !line?.p2Id) return null;
  const a = pts.get(line.p1Id);
  const b = pts.get(line.p2Id);
  if (!a || !b) return null;
  const pa = pointToWorld(snap.plane, a.x, a.y);
  const pb = pointToWorld(snap.plane, b.x, b.y);
  const d = { x: pb.x - pa.x, y: pb.y - pa.y, z: pb.z - pa.z };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return { origin: pa, dir: { x: d.x / len, y: d.y / len, z: d.z / len } };
}

export function pathPointsFromSnapshot(
  snap: SketchSnapshot,
): { x: number; y: number; z: number }[] {
  const pts = new Map<string, SnapPoint>();
  for (const p of snap.primitives as Partial<SnapPoint>[]) {
    if (p?.type === "point" && p.id) {
      pts.set(p.id, { id: p.id, type: "point", x: p.x ?? 0, y: p.y ?? 0 });
    }
  }
  const lines: SnapLine[] = [];
  for (const p of snap.primitives as Partial<SnapLine>[]) {
    if (p?.type === "line" && p.id && p.p1Id && p.p2Id) {
      lines.push({ id: p.id, type: "line", p1Id: p.p1Id, p2Id: p.p2Id });
    }
  }
  if (!lines.length) return [];
  const byEndpoint = new Map<string, SnapLine[]>();
  for (const l of lines) {
    for (const e of [l.p1Id, l.p2Id]) {
      byEndpoint.set(e, [...(byEndpoint.get(e) ?? []), l]);
    }
  }
  const start =
    lines.find((l) => (byEndpoint.get(l.p1Id)?.length ?? 0) === 1) ?? lines[0];
  if (!start) return [];
  const ordered: SnapLine[] = [start];
  const used = new Set<string>([start.id]);
  let tail = start.p2Id;
  while (ordered.length < lines.length) {
    const next = (byEndpoint.get(tail) ?? []).find((l) => !used.has(l.id));
    if (!next) break;
    used.add(next.id);
    ordered.push(next);
    tail = next.p1Id === tail ? next.p2Id : next.p1Id;
  }
  const out: { x: number; y: number; z: number }[] = [];
  let cursor = start.p1Id;
  const cp = pts.get(cursor);
  if (cp) out.push(pointToWorld(snap.plane, cp.x, cp.y));
  for (const l of ordered) {
    const next = l.p1Id === cursor ? l.p2Id : l.p1Id;
    const np = pts.get(next);
    if (!np) break;
    out.push(pointToWorld(snap.plane, np.x, np.y));
    cursor = next;
  }
  return out;
}

export function mapBooleanOperation(
  v: string,
): "union" | "difference" | "intersection" {
  if (v === "CUT") return "difference";
  if (v === "COMMON" || v === "INTERSECT") return "intersection";
  return "union";
}

interface WorkerBooleanResultLike {
  brepJson: unknown;
  position: { x: number; y: number; z: number };
  occBrep?: string | undefined;
}

function registerEdges(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}_E${i}`);
}

function registerFaces(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}_F${i}`);
}

export function quantityOfTest(
  node: ScadgenFeatureNode,
  id: string,
  scope: Scope = {},
): number {
  return quantityOf(node, id, scope) ?? 0;
}

export function faceOwnerOf(tag: string): string | null {
  const m = tag.match(/^(.+)_F\d+$/);
  return m && m[1] ? m[1] : null;
}

export function edgeOwnerOf(tag: string): string | null {
  const m = tag.match(/^(.+)_E\d+$/);
  return m && m[1] ? m[1] : null;
}

export class ScadgenExecutor {
  readonly outputs = new Map<string, BodyOutput>();
  readonly bodySets = new Map<string, BodyOutput[]>();
  private deleted = new Set<string>();

  isDeleted(owner: string): boolean {
    return this.deleted.has(owner);
  }
  private prevGeom = new Map<
    string,
    { brep: Brep; tags: string[]; edgeTags: string[] }
  >();
  private stability = new Map<string, Map<string, string>>();
  private edgeStability = new Map<string, Map<string, string>>();
  private chains = new Map<string, TagChain>();
  private edgeChains = new Map<string, TagChain>();
  private scope: Scope = {};
  lastReport: ExecReport = {};
  private rebuiltListeners: Array<(r: ExecReport) => void> = [];
  private pending: Promise<void> = Promise.resolve();
  private dirty = false;

  onRebuilt(fn: (r: ExecReport) => void): () => void {
    this.rebuiltListeners.push(fn);
    return () => {
      this.rebuiltListeners = this.rebuiltListeners.filter((l) => l !== fn);
    };
  }

  attach(history: ScadgenHistory): () => void {
    return history.onRecompute(() => this.schedule(history));
  }

  schedule(history: ScadgenHistory): void {
    this.dirty = true;
    this.pending = this.pending.then(async () => {
      if (!this.dirty) return;
      this.dirty = false;
      this.lastReport = await this.rebuild(history);
      for (const fn of this.rebuiltListeners) fn(this.lastReport);
    });
  }

  whenIdle(): Promise<void> {
    return this.pending;
  }

  private async rebuild(history: ScadgenHistory): Promise<ExecReport> {
    const report: ExecReport = {};
    this.outputs.clear();
    this.bodySets.clear();
    this.deleted.clear();
    this.scope = {};
    for (const node of history.evaluatedNodes()) {
      if (node.featureType === "variable") {
        const name = stringOf(node, "varName");
        const q = node.parameters.find(
          (x) => x.kind === "quantity" && x.parameterId === "value",
        );
        if (!name || !q || q.kind !== "quantity") {
          report[node.featureId] = { status: "ERROR", detail: "bad variable" };
          history.setState(node.featureId, {
            featureStatus: "ERROR",
            inactive: true,
          });
          continue;
        }
        const typeP = node.parameters.find(
          (x) => x.kind === "enum" && x.parameterId === "varType",
        );
        const varType = typeP && typeP.kind === "enum" ? typeP.value : "number";
        const expected =
          varType === "distance"
            ? DIM_LENGTH
            : varType === "angle"
              ? DIM_ANGLE
              : DIM_NONE;
        const r = evalExpr(q.expression, this.scope);
        if (r.ok && dimsEqual(r.dim, expected)) {
          this.scope[name] = { value: r.value, dim: r.dim };
          report[node.featureId] = { status: "OK" };
          history.setState(node.featureId, {
            featureStatus: "OK",
            inactive: false,
          });
        } else {
          const why = !r.ok
            ? r.error
            : `varType '${varType}' expects ${dimLabel(expected)}, got ${dimLabel(r.dim)}`;
          if (q.value) this.scope[name] = { value: q.value, dim: expected };
          report[node.featureId] = { status: "ERROR", detail: why };
          history.setState(node.featureId, {
            featureStatus: "ERROR",
            inactive: true,
          });
        }
        continue;
      }
      if (node.suppressed) {
        report[node.featureId] = { status: "SUPPRESSED" };
        continue;
      }
      try {
        const out = await this.execute(node, report);
        if (out) {
          const bodies = [
            out,
            ...(out.additionalBodies ?? []).map((b, i) => ({
              ...b,
              featureId: `${node.featureId}#${i + 1}`,
            })),
          ];
          for (const b of bodies) this.outputs.set(b.featureId, b);
          this.bodySets.set(node.featureId, bodies);
          for (const b of bodies) {
            if (b.kind !== "body" || !b.faceTags.length) continue;
            this.trackStability(b);
          }
          report[out.featureId] = { status: "OK" };
          history.setState(node.featureId, {
            featureStatus: "OK",
            inactive: false,
          });
        } else if (report[node.featureId]?.status === "ERROR") {
          history.setState(node.featureId, {
            featureStatus: "ERROR",
            inactive: true,
          });
        } else if (!report[node.featureId]) {
          report[node.featureId] = { status: "UNKNOWN" };
          history.setState(node.featureId, {
            featureStatus: "UNKNOWN",
            inactive: false,
          });
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        report[node.featureId] = { status: "ERROR", detail: reason };
        history.setState(node.featureId, {
          featureStatus: "ERROR",
          inactive: true,
        });
      }
    }
    return report;
  }

  private trackStability(b: BodyOutput): void {
    const prev = this.prevGeom.get(b.featureId);
    const world = this.worldFaceBrep(b);
    if (prev) {
      const matches = matchFaceTags(prev.brep, prev.tags, world, b.faceTags);
      this.stability.set(b.featureId, matches);
      const chain = this.chains.get(b.featureId) ?? new TagChain();
      chain.apply(matches);
      this.chains.set(b.featureId, chain);
      const eMatches = matchEdgeTags(
        prev.brep,
        prev.edgeTags,
        world,
        b.edgeTags,
      );
      this.edgeStability.set(b.featureId, eMatches);
      const eChain = this.edgeChains.get(b.featureId) ?? new TagChain();
      eChain.apply(eMatches);
      this.edgeChains.set(b.featureId, eChain);
    }
    this.prevGeom.set(b.featureId, {
      brep: world,
      tags: [...b.faceTags],
      edgeTags: [...b.edgeTags],
    });
  }

  private worldFaceBrep(out: BodyOutput): Brep {
    const p = out.position;
    const faces =
      (
        out.brep as unknown as {
          faces: { vertices?: { x: number; y: number; z: number }[] }[];
        }
      ).faces ?? [];
    return {
      ...(out.brep as object),
      faces: faces.map((f) => ({
        ...f,
        vertices: (f.vertices ?? []).map((v) => ({
          x: v.x + p.x,
          y: v.y + p.y,
          z: v.z + p.z,
        })),
      })),
    } as unknown as Brep;
  }

  stabilityOf(featureId: string): Record<string, string> | null {
    const m = this.stability.get(featureId);
    return m ? Object.fromEntries(m) : null;
  }

  tagForPrevious(featureId: string, oldTag: string): string | null {
    return this.stability.get(featureId)?.get(oldTag) ?? null;
  }

  private resolve(query: ProvenanceQuery): BodyOutput | null {
    if (!query.creationFeatureId) return null;
    const fid = query.creationFeatureId;
    if (this.deleted.has(fid)) return null;
    const hash = fid.lastIndexOf("#");
    if (hash > 0) {
      const base = fid.slice(0, hash);
      const k = Number(fid.slice(hash + 1));
      const set = this.bodySets.get(base);
      if (set && Number.isInteger(k) && k >= 0 && k < set.length) {
        const body = set[k]!;
        return this.deleted.has(body.featureId) ? null : body;
      }
      return this.outputs.get(fid) ?? null; // explicit extra owner id
    }
    const out = this.outputs.get(fid) ?? null;
    if (out && (out.additionalBodies?.length ?? 0) > 0) {
      const set = this.bodySets.get(fid) ?? [out];
      if (set.every((b) => this.deleted.has(b.featureId))) return null;
    }
    return out;
  }

  deleteBodies(owners: string[]): void {
    for (const o of owners) this.deleted.add(o);
  }

  // Tag → index with persistent-naming retarget: exact hit first, else the
  // surviving chain mapping for the old tag, else -1 (unknown).
  tagIndex(out: BodyOutput, kind: "face" | "edge", tag: string): number {
    const tags = kind === "face" ? out.faceTags : out.edgeTags;
    const direct = tags.indexOf(tag);
    if (direct >= 0) return direct;
    const chain =
      kind === "face"
        ? this.chains.get(out.featureId)
        : this.edgeChains.get(out.featureId);
    const remapped = chain?.get(tag);
    if (!remapped) return -1;
    return tags.indexOf(remapped);
  }

  resolveTag(
    featureId: string,
    oldTag: string,
    kind: "face" | "edge" = "face",
  ): string | null {
    const chain =
      kind === "face"
        ? this.chains.get(featureId)
        : this.edgeChains.get(featureId);
    return chain?.get(oldTag) ?? null;
  }

  tagChainOf(featureId: string): Record<string, string> | null {
    const c = this.chains.get(featureId);
    return c ? c.snapshot() : null;
  }

  private edgeIndices(
    source: BodyOutput,
    queries: ProvenanceQuery[],
  ): number[] {
    const all: number[] = [];
    for (const q of queries) {
      const i = this.tagIndex(source, "edge", q.entityTag);
      if (i >= 0) all.push(i);
    }
    return all.length ? all : [...source.edgeTags.keys()];
  }

  private faceIndices(
    source: BodyOutput,
    queries: ProvenanceQuery[],
  ): number[] {
    const out: number[] = [];
    for (const q of queries) {
      const i = this.tagIndex(source, "face", q.entityTag);
      if (i >= 0 && !out.includes(i)) out.push(i);
    }
    return out;
  }

  private async sendBooleanOp(
    operation: "union" | "difference" | "intersection",
    outs: {
      brep: Brep;
      position: THREE.Vector3;
      occBrep?: string | undefined;
    }[],
  ): Promise<{
    brep: Brep;
    position: THREE.Vector3;
    occBrep?: string | undefined;
  }> {
    const operands = outs.map((o) => ({
      brepJson: o.brep.toJSON(),
      position: { x: o.position.x, y: o.position.y, z: o.position.z },
      ...(o.occBrep !== undefined ? { occBrep: o.occBrep } : {}),
    }));
    const client = OccWorkerClient.getInstance();
    await client.waitForReady();
    const res = await client.send<WorkerBooleanResultLike>({
      type: "boolean",
      payload: { operation, operands },
    });
    const merged = Brep.fromJSON(res.brepJson as never);
    return {
      brep: merged,
      position: new THREE.Vector3(
        res.position.x,
        res.position.y,
        res.position.z,
      ),
      ...(res.occBrep !== undefined ? { occBrep: res.occBrep } : {}),
    };
  }

  private async execute(
    node: ScadgenFeatureNode,
    report: ExecReport,
  ): Promise<BodyOutput | null> {
    switch (node.featureType) {
      case "newSketch": {
        let snap = snapshotOf(node);
        if (!snap) {
          report[node.featureId] = { status: "ERROR", detail: "no snapshot" };
          return null;
        }
        const datumRef = stringOfParam(node, "planeRef");
        if (datumRef) {
          const datum = this.outputs.get(datumRef) ?? null;
          if (!datum) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "sketch-on-datum: planeRef unresolved",
            };
            return null;
          }
          const dn = datum.planeNormal ?? [0, 0, 1];
          const dl = Math.hypot(dn[0], dn[1], dn[2]) || 1;
          const n = { x: dn[0] / dl, y: dn[1] / dl, z: dn[2] / dl };
          const raw = snap.plane.xAxis ?? [1, 0, 0];
          const rx = raw[0] ?? 1,
            ry = raw[1] ?? 0,
            rz = raw[2] ?? 0;
          const dx = rx * n.x + ry * n.y + rz * n.z;
          let ax = rx - n.x * dx,
            ay = ry - n.y * dx,
            az = rz - n.z * dx;
          if (Math.hypot(ax, ay, az) < 1e-6) {
            const ref = Math.abs(n.z) < 0.9 ? [0, 0, 1] : [1, 0, 0];
            ax = n.y * (ref[2] ?? 0) - n.z * (ref[1] ?? 0);
            ay = n.z * (ref[0] ?? 1) - n.x * (ref[2] ?? 0);
            az = n.x * (ref[1] ?? 0) - n.y * (ref[0] ?? 1);
          }
          const xl = Math.hypot(ax, ay, az) || 1;
          ax /= xl;
          ay /= xl;
          az /= xl;
          const x0 = [ax, ay, az];
          const y0 = [
            n.y * az - n.z * ay,
            n.z * ax - n.x * az,
            n.x * ay - n.y * ax,
          ];
          snap = {
            ...snap,
            plane: {
              ...snap.plane,
              type: "DATUM",
              origin: [datum.position.x, datum.position.y, datum.position.z],
              normal: [n.x, n.y, n.z],
              xAxis: x0,
              yAxis: y0,
            },
          };
        }
        const plane = revivePlane(snap.plane);
        const sketch = {
          id: snap.id,
          plane,
          primitives: snap.primitives as Sketch["primitives"],
          constraints: (snap.constraints ?? []) as Sketch["constraints"],
          dof: 0,
          status: "underconstrained" as Sketch["status"],
        } satisfies Sketch;
        const brep =
          await SketchToBrepService.getInstance().convertSketchToBrep(sketch);
        if (!brep.faces.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "profile has no faces (open wire?)",
          };
          return null;
        }
        const tags = registerEdges(brep.edges.length, node.featureId);
        return {
          featureId: node.featureId,
          kind: "profile",
          brep,
          position: plane.origin.clone(),
          planeNormal: [plane.normal.x, plane.normal.y, plane.normal.z],
          edgeTags: tags,
          faceTags: registerFaces(brep.faces.length, node.featureId),
          snapshot: snap,
        };
      }
      case "extrude": {
        const qs = listOf(node, "entities");
        const src = this.resolve(
          qs[0] ?? {
            entityType: "SKETCH_ENTITY",
            historyType: "CREATION",
            creationFeatureId: null,
            entityTag: "",
          },
        );
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "entities not resolved",
          };
          return null;
        }
        const depth = extrudeDepthOf(node, this.scope);
        if (!depth) {
          report[node.featureId] = { status: "ERROR", detail: "missing depth" };
          return null;
        }
        const res = await extrudeBRep(
          src.brep,
          depth,
          boolOfParam(node, "oppositeDirection") ? -1 : 1,
          src.planeNormal
            ? {
                x: src.planeNormal[0],
                y: src.planeNormal[1],
                z: src.planeNormal[2],
              }
            : undefined,
          src.occBrep,
          boolOfParam(node, "midplane"),
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        const value = res.value;
        return {
          featureId: node.featureId,
          kind: "body",
          brep: value.brep,
          occBrep: value.occBrep,
          position: src.position.add(
            new THREE.Vector3(
              value.positionOffset.x,
              value.positionOffset.y,
              value.positionOffset.z,
            ),
          ),
          planeNormal: src.planeNormal,
          edgeTags: registerEdges(value.brep.edges.length, node.featureId),
          faceTags: registerFaces(value.brep.faces.length, node.featureId),
          edgeGeometry: value.edgeGeometry,
          faceGeometry: value.faceGeometry,
          vertexPositions: value.vertexPositions,
        };
      }
      case "fillet":
      case "chamfer": {
        const qs = listOf(node, "entities");
        const src = this.resolve(
          qs[0] ?? {
            entityType: "EDGE",
            historyType: "CREATION",
            creationFeatureId: null,
            entityTag: "",
          },
        );
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "edges not resolved",
          };
          return null;
        }
        // worker edge op API is 1-based (OCC IndexedMap); tags are 0-based.
        const idx = this.edgeIndices(src, qs).map((i) => i + 1);
        const radius =
          quantityOf(node, "radius", this.scope) ??
          quantityOf(node, "width", this.scope) ??
          0;
        const perEdgeRaw = stringOfParam(
          node,
          node.featureType === "fillet" ? "radii" : "distances",
        );
        let radiusArg: number | number[] = radius;
        if (perEdgeRaw) {
          try {
            const parsed: unknown = JSON.parse(perEdgeRaw);
            if (
              Array.isArray(parsed) &&
              parsed.every((v) => typeof v === "number") &&
              parsed.length === idx.length
            )
              radiusArg = parsed as number[];
          } catch {
            radiusArg = radius;
          }
        }
        const res =
          node.featureType === "fillet"
            ? await filletBRep(
                src.brep,
                src.position,
                idx,
                radiusArg,
                src.occBrep,
              )
            : await chamferBRep(
                src.brep,
                src.position,
                idx,
                radiusArg,
                src.occBrep,
              );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: src.position,
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "loft": {
        const profiles = listOf(node, "profiles")
          .map((q) => this.resolve(q))
          .filter((o): o is BodyOutput => !!o);
        const base = profiles[0];
        if (profiles.length < 2 || !base) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "need >=2 profiles",
          };
          return null;
        }
        const ruled = node.parameters.find(
          (p) => p.kind === "boolean" && p.parameterId === "ruled",
        );
        const res = await loftBReps(
          profiles.map((p) => ({
            brep: p.brep,
            position: p.position,
            ...(p.occBrep !== undefined ? { occBrep: p.occBrep } : {}),
          })),
          ruled && ruled.kind === "boolean" ? ruled.value : false,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          position: base.position.clone(),
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
        };
      }
      case "revolve": {
        const qs = listOf(node, "entities");
        const src = qs[0] ? this.resolve(qs[0]) : undefined;
        if (!src?.snapshot) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "profile not resolved",
          };
          return null;
        }
        const axisQ = listOf(node, "axis")[0];
        const axis = axisFromSnapshot(
          src.snapshot,
          axisQ?.entityTag ?? "NORMAL",
        );
        if (!axis) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "axis unresolvable",
          };
          return null;
        }
        const angle =
          quantityOf(node, "angleForward", this.scope) ?? Math.PI * 2;
        const res = await revolveBRep(
          src.brep,
          src.position,
          axis.origin,
          axis.dir,
          angle,
          src.occBrep,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: src.position.add(
            new THREE.Vector3(
              res.value.positionOffset.x,
              res.value.positionOffset.y,
              res.value.positionOffset.z,
            ),
          ),
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "sweep": {
        const profQ = listOf(node, "profiles")[0];
        const pathQ = listOf(node, "path")[0];
        const profile = profQ ? this.resolve(profQ) : undefined;
        const path = pathQ ? this.resolve(pathQ) : undefined;
        if (!profile || !path?.snapshot) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "profile/path not resolved",
          };
          return null;
        }
        const points = pathPointsFromSnapshot(path.snapshot);
        if (points.length < 2) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "path needs >=2 chained line points",
          };
          return null;
        }
        const res = await sweepBRep(
          profile.brep,
          profile.position,
          points,
          undefined,
          profile.occBrep,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: profile.position.clone(),
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "constraint": {
        const sq = listOf(node, "sketch")[0];
        const src = sq ? this.resolve(sq) : undefined;
        if (!src?.snapshot) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "constraint: sketch source not resolved",
          };
          return null;
        }
        const snap = src.snapshot;
        const typeRaw = stringOfParam(node, "constraintType");
        const primsRaw = stringOfParam(node, "primitiveIds");
        const primIds = (primsRaw ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        const type = typeRaw as ConstraintType | null;
        if (!type || !primIds.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "constraint: missing type or primitives",
          };
          return null;
        }
        const plane = revivePlane(snap.plane);
        const sketch = {
          id: snap.id,
          plane,
          primitives: snap.primitives as Sketch["primitives"],
          constraints: (snap.constraints ?? []) as Sketch["constraints"],
          dof: 0,
          status: "underconstrained" as Sketch["status"],
        } satisfies Sketch;
        if (!validateConstraint(type, primIds, sketch.primitives)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `constraint '${type}' invalid for selection [${primIds.join(", ")}]`,
          };
          return null;
        }
        const value = requiresValue(type)
          ? (quantityOf(node, "value", this.scope) ?? 0)
          : undefined;
        const existing = sketch.constraints.filter(
          (c) =>
            !(
              c.type === type &&
              c.primitiveIds.length === primIds.length &&
              c.primitiveIds.every((p) => primIds.includes(p))
            ),
        );
        const constraint = makeSketchConstraint(
          `${node.featureId}_c`,
          type,
          primIds,
          value,
          true,
        );
        sketch.constraints = [...existing, constraint];
        let solved: Awaited<ReturnType<SketchSolverService["solve"]>>;
        try {
          solved = await SketchSolverService.getInstance().solve(sketch);
        } catch (e) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `solver failure: ${String(e)}`,
          };
          return null;
        }
        if (!solved.success) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `solve unsuccessful${solved.redundantConstraintIds?.length ? " (redundant)" : ""}${solved.conflictingConstraintIds?.length ? " (conflicting)" : ""}`,
          };
          return null;
        }
        const brep =
          await SketchToBrepService.getInstance().convertSketchToBrep(
            solved.sketch,
          );
        if (!brep.faces.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "constrained profile has no faces (open wire?)",
          };
          return null;
        }
        const serializePlane = (p: SketchPlane) => ({
          type: p.type,
          origin: [p.origin.x, p.origin.y, p.origin.z],
          normal: [p.normal.x, p.normal.y, p.normal.z],
          xAxis: [p.xAxis.x, p.xAxis.y, p.xAxis.z],
          yAxis: [p.yAxis.x, p.yAxis.y, p.yAxis.z],
          offset: p.offset ?? 0,
        });
        return {
          featureId: node.featureId,
          kind: "profile",
          brep,
          position: plane.origin.clone(),
          planeNormal: [plane.normal.x, plane.normal.y, plane.normal.z],
          edgeTags: registerEdges(brep.edges.length, node.featureId),
          faceTags: registerFaces(brep.faces.length, node.featureId),
          snapshot: {
            id: solved.sketch.id,
            plane: serializePlane(solved.sketch.plane),
            primitives: solved.sketch.primitives as unknown[],
            constraints: solved.sketch.constraints as unknown[],
          },
        };
      }
      case "boolean": {
        const targetQ = listOf(node, "targets")[0];
        const base = targetQ ? this.resolve(targetQ) : undefined;
        if (!base) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "boolean target not resolved",
          };
          return null;
        }
        const toolOuts = listOf(node, "tools")
          .map((q) => this.resolve(q))
          .filter((o): o is BodyOutput => !!o);
        if (!toolOuts.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "boolean tools not resolved",
          };
          return null;
        }
        const opParam = node.parameters.find(
          (p) => p.kind === "enum" && p.parameterId === "operationType",
        );
        const operation = mapBooleanOperation(
          opParam && opParam.kind === "enum" ? opParam.value : "ADD",
        );
        const merged = await this.sendBooleanOp(operation, [base, ...toolOuts]);
        const out: BodyOutput = {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          position: merged.position,
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
        };
        if (merged.occBrep !== undefined) out.occBrep = merged.occBrep;
        return out;
      }
      case "shell":
      case "hole":
      case "draft":
      case "deleteFace":
      case "thicken": {
        const bodyQ = listOf(node, "targets")[0];
        const src = bodyQ ? this.resolve(bodyQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `${node.featureType}: body not resolved`,
          };
          return null;
        }
        let res: Awaited<ReturnType<typeof shellBRep>>;
        if (node.featureType === "shell") {
          const idxs = this.faceIndices(src, listOf(node, "faces"));
          if (!idxs.length) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "shell: no faces selected",
            };
            return null;
          }
          res = await shellBRep(
            src.brep,
            src.position,
            idxs,
            quantityOf(node, "thickness", this.scope) ?? 0.001,
            src.occBrep,
          );
        } else if (node.featureType === "draft") {
          const idxs = this.faceIndices(src, listOf(node, "faces"));
          const neutralQs = listOf(node, "neutralFace");
          const nIdx = neutralQs.length ? this.faceIndices(src, neutralQs) : [];
          const json = src.brep.toJSON();
          const verts = json.vertices;
          const solidC = verts.length
            ? verts.reduce(
                (acc, v) => ({
                  x: acc.x + v.x / verts.length,
                  y: acc.y + v.y / verts.length,
                  z: acc.z + v.z / verts.length,
                }),
                { x: 0, y: 0, z: 0 },
              )
            : { x: 0, y: 0, z: 0 };
          const capDir = (fi: number) => {
            const fv = json.faces[fi]?.vertices ?? [];
            if (!fv.length) return null;
            const c = fv.reduce(
              (a2, v) => ({
                x: a2.x + v.x / fv.length,
                y: a2.y + v.y / fv.length,
                z: a2.z + v.z / fv.length,
              }),
              { x: 0, y: 0, z: 0 },
            );
            const r = {
              x: c.x - solidC.x,
              y: c.y - solidC.y,
              z: c.z - solidC.z,
            };
            const len = Math.hypot(r.x, r.y, r.z) || 1;
            return {
              point: c,
              normal: { x: r.x / len, y: r.y / len, z: r.z / len },
            };
          };
          const neutralIdx = nIdx[0] ?? idxs[0] ?? 0;
          const dir = capDir(neutralIdx);
          if (!dir) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "draft: neutral face geometry unavailable",
            };
            return null;
          }
          res = await draftBRep(
            src.brep,
            src.position,
            idxs,
            quantityOf(node, "angle", this.scope) ?? 0,
            dir.normal,
            dir.point,
            src.occBrep,
          );
        } else if (node.featureType === "thicken") {
          const idxs = this.faceIndices(src, listOf(node, "faces"));
          if (!idxs.length) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "thicken: no faces selected",
            };
            return null;
          }
          res = await thickenBRep(
            src.brep,
            src.position,
            idxs,
            quantityOf(node, "thickness", this.scope) ?? 0.001,
            src.occBrep,
          );
        } else if (node.featureType === "deleteFace") {
          const idxs = this.faceIndices(src, listOf(node, "faces"));
          if (!idxs.length) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "deleteFace: no faces selected",
            };
            return null;
          }
          res = await deleteFaceBRep(src.brep, src.position, idxs, src.occBrep);
        } else {
          const centersRaw = stringOfParam(node, "centerPoints");
          let centers: { x: number; y: number; z: number }[] = [];
          try {
            centers = JSON.parse(centersRaw ?? "[]") as typeof centers;
          } catch {
            centers = [];
          }
          if (!centers.length) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "hole: no center points",
            };
            return null;
          }
          const axisRaw = stringOfParam(node, "axisDir");
          const axis = (axisRaw ?? "0,0,-1")
            .split(",")
            .map((x) => Number(x.trim()));
          const through = stringOfParam(node, "throughAll") === "true";
          const depth = quantityOf(node, "depth", this.scope) ?? 0.05;
          const radius = quantityOf(node, "radius", this.scope) ?? 0.005;
          const json = src.brep.toJSON();
          let diag = depth * 4;
          if (json.vertices.length) {
            let mn = { ...json.vertices[0]! };
            let mx = { ...json.vertices[0]! };
            for (const v of json.vertices) {
              mn = {
                x: Math.min(mn.x, v.x),
                y: Math.min(mn.y, v.y),
                z: Math.min(mn.z, v.z),
              };
              mx = {
                x: Math.max(mx.x, v.x),
                y: Math.max(mx.y, v.y),
                z: Math.max(mx.z, v.z),
              };
            }
            diag = Math.hypot(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z);
          }
          const length = through ? diag + depth : depth;
          const overdrive = through ? diag : 0.002;
          res = await holeBRep(
            src.brep,
            src.position,
            centers,
            { x: axis[0] ?? 0, y: axis[1] ?? 0, z: axis[2] ?? -1 },
            radius,
            length,
            overdrive,
            src.occBrep,
          );
        }
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: src.position,
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "pattern": {
        const patternType = stringOfParam(node, "patternType");
        if (patternType === "circular" || patternType === "curve") {
          const qs = listOf(node, "entities");
          const srcs = qs
            .map((q) => this.resolve(q))
            .filter((o): o is BodyOutput => !!o);
          const src = srcs[0];
          if (!src) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "pattern: source not resolved",
            };
            return null;
          }
          const count = Math.max(
            2,
            Math.floor(quantityOf(node, "count", this.scope) ?? 2),
          );
          let spec: Parameters<typeof patternBRep>[2];
          if (patternType === "curve") {
            const raw = stringOfParam(node, "pathPoints");
            let pts: { x: number; y: number; z: number }[] = [];
            try {
              const parsed: unknown = JSON.parse(raw ?? "[]");
              if (Array.isArray(parsed))
                pts = parsed.filter(
                  (p): p is { x: number; y: number; z: number } =>
                    !!p &&
                    typeof p === "object" &&
                    "x" in p &&
                    "y" in p &&
                    "z" in p &&
                    typeof (p as { x: unknown }).x === "number" &&
                    typeof (p as { y: unknown }).y === "number" &&
                    typeof (p as { z: unknown }).z === "number",
                );
            } catch {
              pts = [];
            }
            if (pts.length < 2) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "pattern: curve needs >= 2 path points",
              };
              return null;
            }
            spec = {
              kind: "curve",
              count,
              pathPoints: pts,
              align: stringOfParam(node, "align") === "true",
              separate: stringOfParam(node, "separate") === "true",
            };
          } else {
            const angle = quantityOf(node, "angle", this.scope) ?? Math.PI * 2;
            const axisRaw = stringOfParam(node, "axisDir");
            const axis = (axisRaw ?? "0,0,1")
              .split(",")
              .map((x) => Number(x.trim()));
            const originRaw = stringOfParam(node, "axisOrigin");
            const origin = (originRaw ?? "0,0,0")
              .split(",")
              .map((x) => Number(x.trim()));
            spec = {
              kind: "circular",
              separate: stringOfParam(node, "separate") === "true",
              count,
              axisOrigin: {
                x: origin[0] ?? 0,
                y: origin[1] ?? 0,
                z: origin[2] ?? 0,
              },
              axisDir: { x: axis[0] ?? 0, y: axis[1] ?? 0, z: axis[2] ?? 1 },
              angleRad: angle,
            };
          }
          const pieces: BodyOutput[] = [];
          for (const one of srcs) {
            const res = await patternBRep(
              one.brep,
              one.position,
              spec,
              one.occBrep,
            );
            if (!res.ok) {
              report[node.featureId] = {
                status: "ERROR",
                detail: res.reason,
              };
              return null;
            }
            const list = Array.isArray(res.value) ? res.value : [res.value];
            for (const v of list)
              pieces.push({
                featureId: node.featureId,
                kind: "body",
                brep: v.brep,
                occBrep: v.occBrep,
                position: one.position,
                edgeTags: [],
                faceTags: [],
                edgeGeometry: v.edgeGeometry,
                faceGeometry: v.faceGeometry,
                vertexPositions: v.vertexPositions,
              });
          }
          const merged: {
            brep: Brep;
            position: THREE.Vector3;
            occBrep?: string | undefined;
            edgeGeometry?: THREE.BufferGeometry | undefined;
            faceGeometry?: THREE.BufferGeometry | undefined;
            vertexPositions?: Float32Array | undefined;
          } =
            pieces.length === 1 || stringOfParam(node, "separate") === "true"
              ? {
                  brep: pieces[0]!.brep,
                  position: pieces[0]!.position,
                  occBrep: pieces[0]!.occBrep,
                  edgeGeometry: pieces[0]!.edgeGeometry,
                  faceGeometry: pieces[0]!.faceGeometry,
                  vertexPositions: pieces[0]!.vertexPositions,
                }
              : await this.sendBooleanOp("union", pieces);
          const separateOn =
            stringOfParam(node, "separate") === "true" && pieces.length > 1;
          const extraBodies: BodyOutput[] = separateOn
            ? pieces.slice(1).map((p, i) => {
                const owner = `${node.featureId}#${i + 1}`;
                return {
                  featureId: owner,
                  kind: "body" as const,
                  brep: p.brep,
                  occBrep: p.occBrep,
                  position: p.position,
                  edgeTags: registerEdges(p.brep.edges.length, owner),
                  faceTags: registerFaces(p.brep.faces.length, owner),
                  edgeGeometry: p.edgeGeometry,
                  faceGeometry: p.faceGeometry,
                  vertexPositions: p.vertexPositions,
                };
              })
            : [];
          return {
            featureId: node.featureId,
            kind: "body",
            brep: merged.brep,
            ...(merged.occBrep !== undefined
              ? { occBrep: merged.occBrep }
              : {}),
            position: merged.position,
            edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
            faceTags: registerFaces(merged.brep.faces.length, node.featureId),
            ...(merged.edgeGeometry !== undefined
              ? { edgeGeometry: merged.edgeGeometry }
              : {}),
            ...(merged.faceGeometry !== undefined
              ? { faceGeometry: merged.faceGeometry }
              : {}),
            ...(merged.vertexPositions !== undefined
              ? { vertexPositions: merged.vertexPositions }
              : {}),
            ...(extraBodies.length ? { additionalBodies: extraBodies } : {}),
          };
        }
        const srcQs = listOf(node, "entities");
        const srcList = srcQs
          .map((q) => this.resolve(q))
          .filter((o): o is BodyOutput => !!o);
        const src = srcList[0];
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "pattern source not resolved",
          };
          return null;
        }
        const count = Math.max(
          1,
          Math.floor(quantityOf(node, "count", this.scope) ?? 1),
        );
        const spacing = quantityOf(node, "spacing", this.scope) ?? 0;
        const dirEl = node.parameters.find(
          (p) => p.kind === "matrix" && p.parameterId === "direction",
        );
        const raw =
          dirEl && dirEl.kind === "matrix"
            ? dirEl.elements.slice(0, 3)
            : [1, 0, 0];
        const dxa = raw[0] ?? 1;
        const dya = raw[1] ?? 0;
        const dza = raw[2] ?? 0;
        const len = Math.hypot(dxa, dya, dza) || 1;
        const dir = new THREE.Vector3(dxa / len, dya / len, dza / len);
        const copies: {
          brep: Brep;
          position: THREE.Vector3;
          occBrep?: string | undefined;
        }[] = [];
        for (const one of srcList) {
          for (let i = 1; i < count; i++) {
            const target = one.position
              .clone()
              .add(dir.clone().multiplyScalar(spacing * i));
            copies.push({
              brep: transformBrepVertices(one.brep, one.position, target),
              position: target,
            });
          }
        }
        if (!copies.length && srcList.length === 1)
          return { ...src, featureId: node.featureId };
        const merged = await this.sendBooleanOp("union", [
          ...srcList,
          ...copies,
        ]);
        return {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          position: merged.position,
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
          ...(merged.occBrep !== undefined ? { occBrep: merged.occBrep } : {}),
        };
      }
      case "projectCurves": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        const tgtQ = listOf(node, "targets")[0];
        const tgt = tgtQ ? this.resolve(tgtQ) : undefined;
        if (!src || !tgt) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "projectCurves: source or target not resolved",
          };
          return null;
        }
        let tags: string[] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "edgeTags") ?? "[]",
          );
          if (Array.isArray(parsed))
            tags = parsed.filter((t): t is string => typeof t === "string");
        } catch {
          tags = [];
        }
        const idxs = tags
          .map((t) => this.tagIndex(src, "edge", t) + 1)
          .filter((i) => i > 0);
        if (!idxs.length || idxs.length !== tags.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "projectCurves: edge tags not resolved",
          };
          return null;
        }
        const dirRaw = (stringOfParam(node, "direction") ?? "0,0,-1")
          .split(",")
          .map((x) => Number(x.trim()));
        const res = await projectCurvesBRep(
          { brep: src.brep, position: src.position, occBrep: src.occBrep },
          { brep: tgt.brep, position: tgt.position, occBrep: tgt.occBrep },
          idxs,
          { x: dirRaw[0] ?? 0, y: dirRaw[1] ?? 0, z: dirRaw[2] ?? -1 },
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: src.position,
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "surface": {
        const bodyQ = listOf(node, "targets")[0];
        const src = bodyQ ? this.resolve(bodyQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "surface: body not resolved",
          };
          return null;
        }
        const kind = stringOfParam(node, "kind");
        if (kind !== "ruled" && kind !== "fill" && kind !== "offset") {
          report[node.featureId] = {
            status: "ERROR",
            detail: "surface: unknown kind",
          };
          return null;
        }
        const opts: Parameters<typeof surfaceOpBRep>[3] = {};
        if (kind === "ruled") {
          let tags: string[] = [];
          try {
            const parsed: unknown = JSON.parse(
              stringOfParam(node, "edgeTags") ?? "[]",
            );
            if (Array.isArray(parsed))
              tags = parsed.filter((t): t is string => typeof t === "string");
          } catch {
            tags = [];
          }
          const idxs = tags
            .map((t) => this.tagIndex(src, "edge", t) + 1)
            .filter((i) => i > 0);
          if (idxs.length < 2 || idxs.length !== tags.length) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "surface: edge tags not resolved",
            };
            return null;
          }
          opts.edgeIndices = idxs;
        } else {
          const faceIdx = this.tagIndex(
            src,
            "face",
            stringOfParam(node, "faceTag") ?? "",
          );
          if (faceIdx < 0) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "surface: face tag not resolved",
            };
            return null;
          }
          opts.faceIndex = faceIdx;
          if (kind === "offset")
            opts.distance = quantityOf(node, "distance", this.scope) ?? 0.001;
        }
        const res = await surfaceOpBRep(
          kind,
          src.brep,
          src.position,
          opts,
          src.occBrep,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: src.position,
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "deleteBodies": {
        let owners: string[] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "bodies") ?? "[]",
          );
          if (Array.isArray(parsed))
            owners = parsed.filter((x): x is string => typeof x === "string");
        } catch {
          owners = [];
        }
        if (!owners.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "deleteBodies: no bodies given",
          };
          return null;
        }
        for (const o of owners) this.deleted.add(o);
        report[node.featureId] = { status: "OK" };
        return null;
      }
      case "thread": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "thread: source not resolved",
          };
          return null;
        }
        const standard = (stringOfParam(node, "standard") ??
          "iso") as ThreadStandard;
        const size = stringOfParam(node, "size") ?? "M6";
        const mode = (stringOfParam(node, "mode") ?? "coarse") as
          | "coarse"
          | "fine";
        const kind = (stringOfParam(node, "kind") ?? "external") as
          | "external"
          | "internal";
        const eng = quantityOf(node, "engagement", this.scope) ?? 1;
        let spec: ThreadSpec;
        try {
          spec = resolveThread(standard, size, mode, eng);
        } catch (e) {
          report[node.featureId] = { status: "ERROR", detail: String(e) };
          return null;
        }
        const aRaw = src.planeNormal ?? [0, 0, 1];
        const alen = Math.hypot(aRaw[0], aRaw[1], aRaw[2]) || 1;
        const a = {
          x: aRaw[0] / alen,
          y: aRaw[1] / alen,
          z: aRaw[2] / alen,
        };
        const pos = src.position;
        const worldV = src.brep.toJSON().vertices.map((q) => ({
          x: q.x + pos.x,
          y: q.y + pos.y,
          z: q.z + pos.z,
        }));
        const proj = worldV.map((q) => {
          const h = q.x * a.x + q.y * a.y + q.z * a.z;
          const px = q.x - a.x * h,
            py = q.y - a.y * h,
            pz = q.z - a.z * h;
          return {
            h,
            r: Math.hypot(px, py, pz),
            px,
            py,
            pz,
          };
        });
        const bin = Math.max(1e-5, spec.pitch * 0.15);
        const counts = new Map<number, number>();
        for (const { r } of proj) {
          const b = Math.round(r / bin);
          counts.set(b, (counts.get(b) ?? 0) + 1);
        }
        let best: [number, number] = [0, 0];
        for (const [b, c] of counts) if (c > best[1]) best = [b, c];
        if (best[1] < Math.max(6, proj.length * 0.2)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "thread: no cylindrical surface found",
          };
          return null;
        }
        const radius = best[0] * bin;
        const band = proj.filter((p) => Math.abs(p.r - radius) < bin * 1.5);
        const hMin = Math.min(...band.map((p) => p.h));
        const hMax = Math.max(...band.map((p) => p.h));
        const base = {
          x: band.reduce((acc, p) => acc + p.px, 0) / band.length,
          y: band.reduce((acc, p) => acc + p.py, 0) / band.length,
          z: band.reduce((acc, p) => acc + p.pz, 0) / band.length,
        };
        const runout = spec.pitch * 0.75;
        const tHeight = hMax - hMin - 2 * runout;
        if (tHeight < spec.pitch) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "thread: band too short for even one pitch",
          };
          return null;
        }
        const res = await threadBRep(
          src.brep,
          pos,
          {
            origin: {
              x: base.x + a.x * (hMin + runout),
              y: base.y + a.y * (hMin + runout),
              z: base.z + a.z * (hMin + runout),
            },
            axisDir: a,
            radius,
            pitch: spec.pitch,
            height: tHeight,
            depth: spec.depth,
            kind,
            taperPerLength: spec.taperPerLength,
          },
          src.occBrep,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: pos.clone(),
          planeNormal: src.planeNormal,
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "createPlane": {
        const o = (stringOfParam(node, "origin") ?? "0,0,0")
          .split(",")
          .map((x) => Number(x.trim()));
        const nRaw = (stringOfParam(node, "normal") ?? "0,0,1")
          .split(",")
          .map((x) => Number(x.trim()));
        const nLen = Math.hypot(nRaw[0] ?? 0, nRaw[1] ?? 0, nRaw[2] ?? 0) || 1;
        const n = {
          x: (nRaw[0] ?? 0) / nLen,
          y: (nRaw[1] ?? 0) / nLen,
          z: (nRaw[2] ?? 0) / nLen,
        };
        const size = quantityOf(node, "size", this.scope) ?? 0.1;
        const u =
          Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
        let ux = {
          x: n.y * u.z - n.z * u.y,
          y: n.z * u.x - n.x * u.z,
          z: n.x * u.y - n.y * u.x,
        };
        const ul = Math.hypot(ux.x, ux.y, ux.z) || 1;
        ux = { x: ux.x / ul, y: ux.y / ul, z: ux.z / ul };
        const vx = {
          x: n.y * ux.z - n.z * ux.y,
          y: n.z * ux.x - n.x * ux.z,
          z: n.x * ux.y - n.y * ux.x,
        };
        const ox = o[0] ?? 0,
          oy = o[1] ?? 0,
          oz = o[2] ?? 0;
        const pts = (
          [
            [1, 1],
            [1, -1],
            [-1, -1],
            [-1, 1],
          ] as const
        ).map(([sa, sb]) => ({
          x: ox + ux.x * size * sa + vx.x * size * sb,
          y: oy + ux.y * size * sa + vx.y * size * sb,
          z: oz + ux.z * size * sa + vx.z * size * sb,
        }));
        const brep = new Brep(
          pts.map((q) => new BrepVertex(q.x, q.y, q.z)),
          [0, 1, 2, 3].map((i) => {
            const a = pts[i]!,
              b = pts[(i + 1) % 4]!;
            return new BrepEdge(
              new BrepVertex(a.x, a.y, a.z),
              new BrepVertex(b.x, b.y, b.z),
            );
          }),
          [
            {
              vertices: pts.map((q) => new BrepVertex(q.x, q.y, q.z)),
            } as unknown as BrepFace,
          ],
        );
        return {
          featureId: node.featureId,
          kind: "body",
          brep,
          position: new THREE.Vector3(ox, oy, oz),
          planeNormal: [n.x, n.y, n.z],
          edgeTags: registerEdges(brep.edges.length, node.featureId),
          faceTags: registerFaces(brep.faces.length, node.featureId),
        };
      }
      case "scale": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "scale: source not resolved",
          };
          return null;
        }
        const f = quantityOf(node, "factor", this.scope) ?? 1;
        if (f <= 0) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "scale: factor must be > 0",
          };
          return null;
        }
        const oRaw = (stringOfParam(node, "origin") ?? "0,0,0")
          .split(",")
          .map((x) => Number(x.trim()));
        const json = src.brep.toJSON();
        const ox = oRaw[0] ?? 0,
          oy = oRaw[1] ?? 0,
          oz = oRaw[2] ?? 0;
        const sp = (q: { x: number; y: number; z: number }) => ({
          x: ox + (q.x - ox) * f,
          y: oy + (q.y - oy) * f,
          z: oz + (q.z - oz) * f,
        });
        const scaled: typeof json = {
          ...json,
          vertices: json.vertices.map(sp),
          edges: json.edges.map((e) => ({
            start: sp(e.start),
            end: sp(e.end),
          })),
          faces: json.faces.map((fa) => ({
            ...fa,
            vertices: (fa.vertices ?? []).map(sp),
          })),
        };
        const brep = Brep.fromJSON(scaled);
        // scale about the given LOCAL-space origin point (the body's own
        // coordinate frame; local bbox center is 0,0,0 by serialization)
        return {
          featureId: node.featureId,
          kind: "body",
          brep,
          position: src.position.clone(),
          planeNormal: src.planeNormal,
          edgeTags: registerEdges(brep.edges.length, node.featureId),
          faceTags: registerFaces(brep.faces.length, node.featureId),
        };
      }
      case "curveOnFace": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        const tgtQ = listOf(node, "targets")[0];
        const tgt = tgtQ ? this.resolve(tgtQ) : undefined;
        if (!src || !tgt) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "curveOnFace: source or target not resolved",
          };
          return null;
        }
        let tags: string[] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "edgeTags") ?? "[]",
          );
          if (Array.isArray(parsed))
            tags = parsed.filter((t): t is string => typeof t === "string");
        } catch {
          tags = [];
        }
        const idxs = tags
          .map((t) => this.tagIndex(src, "edge", t) + 1)
          .filter((i) => i > 0);
        if (!idxs.length || idxs.length !== tags.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "curveOnFace: edge tags not resolved",
          };
          return null;
        }
        const fi = this.tagIndex(
          tgt,
          "face",
          stringOfParam(node, "faceTag") ?? "",
        );
        if (fi < 0) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "curveOnFace: face tag not resolved",
          };
          return null;
        }
        const tjson = tgt.brep.toJSON();
        const allV = tjson.vertices;
        const solidC = allV.length
          ? allV.reduce(
              (a, q) => ({
                x: a.x + q.x / allV.length,
                y: a.y + q.y / allV.length,
                z: a.z + q.z / allV.length,
              }),
              { x: 0, y: 0, z: 0 },
            )
          : { x: 0, y: 0, z: 0 };
        const fv = tjson.faces[fi]?.vertices ?? [];
        const raw = fv.length
          ? fv.reduce(
              (a, q) => ({
                x: a.x + q.x / fv.length,
                y: a.y + q.y / fv.length,
                z: a.z + q.z / fv.length,
              }),
              { x: 0, y: 0, z: 0 },
            )
          : solidC;
        let n = {
          x: raw.x - solidC.x,
          y: raw.y - solidC.y,
          z: raw.z - solidC.z,
        };
        const nl = Math.hypot(n.x, n.y, n.z) || 1;
        n = { x: n.x / nl, y: n.y / nl, z: n.z / nl };
        const res = await projectCurvesBRep(
          { brep: src.brep, position: src.position, occBrep: src.occBrep },
          { brep: tgt.brep, position: tgt.position, occBrep: tgt.occBrep },
          idxs,
          n,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: tgt.position,
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "moveFace": {
        const bodyQ = listOf(node, "targets")[0];
        const src = bodyQ ? this.resolve(bodyQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "moveFace: body not resolved",
          };
          return null;
        }
        const fi = this.tagIndex(
          src,
          "face",
          stringOfParam(node, "faceTag") ?? "",
        );
        if (fi < 0) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "moveFace: face tag not resolved",
          };
          return null;
        }
        const dist = quantityOf(node, "distance", this.scope);
        if (dist === null || Math.abs(dist) < 1e-12) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "moveFace: distance required",
          };
          return null;
        }
        const res = await moveFaceBRep(
          src.brep,
          src.position,
          fi,
          dist,
          src.occBrep,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: src.position,
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "section":
      case "split": {
        const bodyQ = listOf(node, "targets")[0];
        const src = bodyQ ? this.resolve(bodyQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "split: body not resolved",
          };
          return null;
        }
        const parse3 = (raw: string | null, dflt: number[]) =>
          (raw ?? dflt.join(",")).split(",").map((x) => Number(x.trim()));
        const origin = parse3(stringOfParam(node, "planeOrigin"), [0, 0, 0]);
        const normal = parse3(stringOfParam(node, "planeNormal"), [1, 0, 0]);
        if (node.featureType === "section") {
          const sec = await sectionBRep(
            src.brep,
            src.position,
            { x: origin[0] ?? 0, y: origin[1] ?? 0, z: origin[2] ?? 0 },
            { x: normal[0] ?? 0, y: normal[1] ?? 0, z: normal[2] ?? 1 },
            src.occBrep,
          );
          if (!sec.ok) {
            report[node.featureId] = { status: "ERROR", detail: sec.reason };
            return null;
          }
          return {
            featureId: node.featureId,
            kind: "body",
            brep: sec.value.brep,
            occBrep: sec.value.occBrep,
            position: src.position,
            edgeTags: registerEdges(
              sec.value.brep.edges.length,
              node.featureId,
            ),
            faceTags: registerFaces(
              sec.value.brep.faces.length,
              node.featureId,
            ),
            edgeGeometry: sec.value.edgeGeometry,
            faceGeometry: sec.value.faceGeometry,
            vertexPositions: sec.value.vertexPositions,
          };
        }
        const keepRaw = stringOfParam(node, "keep");
        const keep =
          keepRaw === "negative" || keepRaw === "both" ? keepRaw : "positive";
        const res = await splitBRep(
          src.brep,
          src.position,
          { x: origin[0] ?? 0, y: origin[1] ?? 0, z: origin[2] ?? 0 },
          { x: normal[0] ?? 1, y: normal[1] ?? 0, z: normal[2] ?? 0 },
          src.occBrep,
          undefined,
          keep,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        const pair = "primary" in res.value ? res.value : null;
        const prim: ParityResult = pair
          ? pair.primary
          : (res.value as ParityResult);
        const bodyOf = (v: ParityResult, suffix: string): BodyOutput => ({
          featureId: `${node.featureId}${suffix}`,
          kind: "body",
          brep: v.brep,
          occBrep: v.occBrep,
          position: src.position,
          edgeTags: registerEdges(
            v.brep.edges.length,
            `${node.featureId}${suffix}`,
          ),
          faceTags: registerFaces(
            v.brep.faces.length,
            `${node.featureId}${suffix}`,
          ),
          edgeGeometry: v.edgeGeometry,
          faceGeometry: v.faceGeometry,
          vertexPositions: v.vertexPositions,
        });
        const out = bodyOf(prim, "");
        if (pair) out.additionalBodies = [bodyOf(pair.secondary, "#1")];
        return out;
      }
      case "mirror": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "mirror source not resolved",
          };
          return null;
        }
        const axisP = node.parameters.find(
          (p) => p.kind === "enum" && p.parameterId === "axis",
        );
        const axis =
          axisP && axisP.kind === "enum" ? axisP.value.toUpperCase() : "X";
        const scale = new THREE.Matrix4().makeScale(
          axis === "X" ? -1 : 1,
          axis === "Y" ? -1 : 1,
          axis === "Z" ? -1 : 1,
        );
        const mirrored = transformBrepVertices(
          src.brep,
          src.position,
          src.position,
          scale,
        );
        return {
          featureId: node.featureId,
          kind: "body",
          brep: mirrored,
          position: src.position.clone(),
          edgeTags: registerEdges(mirrored.edges.length, node.featureId),
          faceTags: registerFaces(mirrored.faces.length, node.featureId),
        };
      }
      case "insertedBody": {
        const assetId = stringOfParam(node, "assetId");
        const asset = assetId ? getImportAsset(assetId) : undefined;
        if (!asset) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "import asset not registered",
          };
          return null;
        }
        const svc = ImportExportService.getInstance();
        const buf = asset.bytes.slice().buffer;
        const imported =
          asset.format === "step"
            ? await svc.importStep(buf)
            : await svc.import(buf);
        if (!imported.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "import produced no bodies",
          };
          return null;
        }
        const first = imported[0]!;
        if (imported.length < 2) {
          return {
            featureId: node.featureId,
            kind: "body",
            brep: first.brep,
            position: first.position,
            edgeTags: registerEdges(first.brep.edges.length, node.featureId),
            faceTags: registerFaces(first.brep.faces.length, node.featureId),
            ...(first.occBrep !== undefined ? { occBrep: first.occBrep } : {}),
          };
        }
        const merged = await this.sendBooleanOp("union", imported);
        return {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          position: merged.position,
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
          ...(merged.occBrep !== undefined ? { occBrep: merged.occBrep } : {}),
        };
      }
      default:
        return null;
    }
  }
}

export const scadgenExecutor = new ScadgenExecutor();
