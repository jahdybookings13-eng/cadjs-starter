// scadgen rebuild executor: walks the ScadgenHistory feature tree and drives
// the cadjs OCC kernel (SketchToBrepService + extrudeBRep/filletBRep/...).
// Provenance refs ({creationFeatureId, entityTag}) resolve against a per-build
// output registry — Onshape's qCreatedBy equivalent for this codebase.
import * as THREE from "three";
import {
  Brep,
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
  thickenBRep,
  projectCurvesBRep,
  surfaceOpBRep,
  SketchToBrepService,
  makeSketchConstraint,
  requiresValue,
  validateConstraint,
  sweepBRep,
  transformBrepVertices,
} from "@vitekk02/cadjs";
import { getImportAsset } from "./assets";
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
          this.outputs.set(node.featureId, out);
          report[node.featureId] = { status: "OK" };
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

  private resolve(query: ProvenanceQuery): BodyOutput | null {
    if (!query.creationFeatureId) return null;
    return this.outputs.get(query.creationFeatureId) ?? null;
  }

  private edgeIndices(
    source: BodyOutput,
    queries: ProvenanceQuery[],
  ): number[] {
    const all: number[] = [];
    for (const q of queries) {
      const i = source.edgeTags.indexOf(q.entityTag);
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
      const i = source.faceTags.indexOf(q.entityTag);
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
        const snap = snapshotOf(node);
        if (!snap) {
          report[node.featureId] = { status: "ERROR", detail: "no snapshot" };
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
            pieces.push({
              featureId: node.featureId,
              kind: "body",
              brep: res.value.brep,
              occBrep: res.value.occBrep,
              position: one.position,
              edgeTags: [],
              faceTags: [],
              edgeGeometry: res.value.edgeGeometry,
              faceGeometry: res.value.faceGeometry,
              vertexPositions: res.value.vertexPositions,
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
            pieces.length === 1
              ? {
                  brep: pieces[0]!.brep,
                  position: pieces[0]!.position,
                  occBrep: pieces[0]!.occBrep,
                  edgeGeometry: pieces[0]!.edgeGeometry,
                  faceGeometry: pieces[0]!.faceGeometry,
                  vertexPositions: pieces[0]!.vertexPositions,
                }
              : await this.sendBooleanOp("union", pieces);
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
        const idxs = tags.map((t) => src.edgeTags.indexOf(t) + 1);
        if (!idxs.length || idxs.some((i) => i < 1)) {
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
          const idxs = tags.map((t) => src.edgeTags.indexOf(t) + 1);
          if (idxs.length < 2 || idxs.some((i) => i < 1)) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "surface: edge tags not resolved",
            };
            return null;
          }
          opts.edgeIndices = idxs;
        } else {
          const faceIdx = src.faceTags.indexOf(
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
        const res = await splitBRep(
          src.brep,
          src.position,
          { x: origin[0] ?? 0, y: origin[1] ?? 0, z: origin[2] ?? 0 },
          { x: normal[0] ?? 1, y: normal[1] ?? 0, z: normal[2] ?? 0 },
          src.occBrep,
          undefined,
          stringOfParam(node, "keep") === "negative" ? "negative" : "positive",
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
