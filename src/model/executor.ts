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
  replaceFaceBRep,
  splitBRep,
  sectionBRep,
  moveFaceBRep,
  thickenBRep,
  sewBReps,
  extendSurfaceBRep,
  flangeBRep,
  hemBRep,
  wrapCurvesBRep,
  threadBRep,
  projectCurvesBRep,
  surfaceOpBRep,
  SketchToBrepService,
  makeSketchConstraint,
  requiresValue,
  validateConstraint,
  sweepBRep,
  transformBrepVertices,
  transformBRep,
  type ParityResult,
} from "@vitekk02/cadjs";
import {
  solveExtrudeEndBound,
  type ExtrudeEndBound,
  type ExtrudeEndBody,
} from "./extrudeEndCondition";
import { solveRevolveEndAngle } from "./revolveEndCondition";
import {
  loftSectionFrame,
  parseLoftDirection,
  planLoftEndSections,
  type LoftEndCondition,
  type LoftPoint,
  type LoftSectionFrame,
} from "./loftEndCondition";
import {
  blendGuidePoints,
  chainPathPoints,
  extendPathEnds,
  pathForPrimitive,
} from "./sweepPath";
import { profileRuleError } from "./profileRules";
import { buildReliefToolBreps } from "./reliefTool";
import {
  buildFrameMemberProfile,
  parseFrameProfileId,
} from "./frameMemberGeometry";
import { buildLouverTools } from "./louverTool";
import {
  computeTrueFlatPattern,
  type FlatPatternBendInput,
} from "./phase6FlatPatternCalc";
import { ribbonPolygon } from "./openProfileWall";
import { getImportAsset } from "./assets";
import { booleanParameter } from "./paramSupport";
import { buildBoxNodes, cloneFeatureNodes } from "./primitives";
import {
  bridgePoints,
  buildCoilProfileSketch,
  coilPathPoints,
  curvePoints,
  expandFeatureMacro,
  fitSplinePolyline,
  applyImportRecognitionMode,
  recognizeImportedBrep,
  type ImportRecognitionMode,
} from "./featuresF";
import {
  resolveHoleSpec,
  type HoleFit,
  type HoleStandard,
} from "./holeStandards";
import {
  facePredicates,
  queryFaces,
  queryEdges,
  type FaceQuery,
  type EdgeQuery,
} from "./predicates";
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
import { documentVariableScope } from "../phase7/store";
import { phase6DispatchError } from "./phase6Dispatch";

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
  [featureId: string]: {
    status: ExecStatus;
    detail?: string;
    /** Root failed feature for a downstream error (self for a direct one). */
    origin?: string;
  };
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
  offsetDistance: DIM_LENGTH,
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

function enumOfParam(
  node: ScadgenFeatureNode,
  parameterId: string,
): string | null {
  const p = node.parameters.find(
    (x): x is Extract<ScadgenParameter, { kind: "enum" }> =>
      x.kind === "enum" && x.parameterId === parameterId,
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

function vec3Param(
  node: ScadgenFeatureNode,
  parameterId: string,
): { x: number; y: number; z: number } | null {
  const raw = stringOfParam(node, parameterId);
  if (!raw) return null;
  const parts = raw.split(",").map((v) => Number(v.trim()));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
  return { x: parts[0]!, y: parts[1]!, z: parts[2]! };
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
  return chainPathPoints(snap);
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
  vertexPositions?: Float32Array | undefined;
}

function edgeKey(v: { x: number; y: number; z: number }): string {
  return `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
}

/**
 * Expand selected edges across tangent-continuous chains. Mesh edges are
 * shared by exact endpoint coordinates; two edges continue each other when
 * their directions are parallel (either sign) at a shared vertex. This mirrors
 * Onshape's tangent propagation for the common prismatic case without needing
 * a second kernel round-trip.
 */
function expandTangentEdges(brep: Brep, selected: number[]): number[] {
  const visited = new Set<number>(selected);
  const queue = [...selected];
  while (queue.length) {
    const i = queue.pop()!;
    const e = brep.edges[i];
    if (!e) continue;
    const dx = e.end.x - e.start.x;
    const dy = e.end.y - e.start.y;
    const dz = e.end.z - e.start.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    for (let j = 0; j < brep.edges.length; j++) {
      if (visited.has(j)) continue;
      const o = brep.edges[j];
      if (!o) continue;
      const shares =
        edgeKey(e.start) === edgeKey(o.start) ||
        edgeKey(e.start) === edgeKey(o.end) ||
        edgeKey(e.end) === edgeKey(o.start) ||
        edgeKey(e.end) === edgeKey(o.end);
      if (!shares) continue;
      const ox = o.end.x - o.start.x;
      const oy = o.end.y - o.start.y;
      const oz = o.end.z - o.start.z;
      const olen = Math.hypot(ox, oy, oz) || 1;
      const dot = (dx * ox + dy * oy + dz * oz) / (len * olen);
      if (Math.abs(dot) > 0.98) {
        visited.add(j);
        queue.push(j);
      }
    }
  }
  return [...visited].sort((a, b) => a - b);
}

function faceBoundaryEdgeIndices(brep: Brep, faceIndex: number): number[] {
  const face = brep.faces[faceIndex];
  if (!face) return [];
  const keys = new Set(face.vertices.map(edgeKey));
  const out: number[] = [];
  for (let i = 0; i < brep.edges.length; i++) {
    const e = brep.edges[i];
    if (!e) continue;
    if (keys.has(edgeKey(e.start)) && keys.has(edgeKey(e.end))) out.push(i);
  }
  return out;
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
  private deriveResolver: ((tabId: string) => string | null) | null = null;
  private attachedHistory: ScadgenHistory | null = null;

  setDeriveResolver(fn: ((tabId: string) => string | null) | null): void {
    this.deriveResolver = fn;
  }

  /** Re-run the attached history after document-level variables change. */
  requestRebuild(): void {
    if (this.attachedHistory) this.schedule(this.attachedHistory);
  }
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
    this.attachedHistory = history;
    return history.onRecompute(() => this.schedule(history));
  }

  schedule(history: ScadgenHistory): void {
    this.dirty = true;
    // A failed rebuild must not poison every future rebuild in the queue.
    this.pending = this.pending
      .catch(() => undefined)
      .then(async () => {
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
    // Failed feature → root cause. A later feature that still references a
    // failed one is reported against the origin instead of failing opaquely.
    const failures = new Map<string, { origin: string; detail: string }>();
    this.outputs.clear();
    this.bodySets.clear();
    this.deleted.clear();
    // Document-level Variable Studio values are visible to every feature,
    // including variables stored outside Part Studio history.
    this.scope = documentVariableScope();
    for (const node of this.flattenNodes(history.evaluatedNodes())) {
      if (node.featureType === "variable") {
        const name = stringOf(node, "varName");
        const q = node.parameters.find(
          (x) => x.kind === "quantity" && x.parameterId === "value",
        );
        if (!name || !q || q.kind !== "quantity") {
          report[node.featureId] = { status: "ERROR", detail: "bad variable" };
          failures.set(node.featureId, {
            origin: node.featureId,
            detail: "bad variable",
          });
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
          failures.set(node.featureId, {
            origin: node.featureId,
            detail: why,
          });
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
      const upstream = this.upstreamFailure(node.parameters, failures);
      if (upstream) {
        const originName =
          history.get(upstream.origin)?.name ?? upstream.origin;
        const via =
          upstream.id === upstream.origin
            ? ""
            : ` via “${history.get(upstream.id)?.name ?? upstream.id}”`;
        const detail = `depends on failed “${originName}”${via}`;
        report[node.featureId] = {
          status: "ERROR",
          detail,
          origin: upstream.origin,
        };
        failures.set(node.featureId, { origin: upstream.origin, detail });
        history.setState(node.featureId, {
          featureStatus: "ERROR",
          inactive: true,
        });
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
          failures.set(node.featureId, {
            origin: node.featureId,
            detail: report[node.featureId]?.detail ?? "failed",
          });
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
        failures.set(node.featureId, {
          origin: node.featureId,
          detail: reason,
        });
        history.setState(node.featureId, {
          featureStatus: "ERROR",
          inactive: true,
        });
      }
    }
    return report;
  }

  /** First parameter reference to a feature that already failed this build. */
  private upstreamFailure(
    parameters: ScadgenParameter[],
    failures: Map<string, { origin: string; detail: string }>,
  ): { id: string; origin: string; detail: string } | null {
    for (const param of parameters) {
      if (param.kind === "queryList") {
        for (const query of param.queries) {
          const id = query.creationFeatureId;
          const hit = id ? failures.get(id) : undefined;
          if (id && hit) return { id, ...hit };
        }
      } else if (param.kind === "string") {
        const hit = failures.get(param.value);
        if (hit) return { id: param.value, ...hit };
      }
    }
    return null;
  }

  private flattenNodes(nodes: ScadgenFeatureNode[]): ScadgenFeatureNode[] {
    const out: ScadgenFeatureNode[] = [];
    const seen = new Set<string>();
    const visit = (n: ScadgenFeatureNode, inFastener: boolean) => {
      if (seen.has(n.featureId)) return;
      seen.add(n.featureId);
      if (inFastener && n.featureType === "thread") return;
      const isFastenerParent =
        n.featureType === "fastener" || n.featureType === "screwHole";
      for (const c of n.subFeatures ?? [])
        visit(c, isFastenerParent || inFastener);
      out.push(n);
    };
    for (const n of nodes) visit(n, false);
    return out;
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
    if (queries.some((q) => q.entityTag === "*"))
      return [...source.edgeTags.keys()];
    const all: number[] = [];
    for (const q of queries) {
      const i = this.tagIndex(source, "edge", q.entityTag);
      if (i >= 0) all.push(i);
    }
    // An explicitly requested but unknown edge is a broken reference, not
    // "every edge": only an empty query means the whole body.
    if (queries.length === 0) return [...source.edgeTags.keys()];
    return all;
  }

  private faceIndices(
    source: BodyOutput,
    queries: ProvenanceQuery[],
  ): number[] {
    if (queries.some((q) => q.entityTag === "*"))
      return [...source.faceTags.keys()];
    const out: number[] = [];
    for (const q of queries) {
      const i = this.tagIndex(source, "face", q.entityTag);
      if (i >= 0 && !out.includes(i)) out.push(i);
    }
    return out;
  }

  /** Derive the forward extrude depth for a non-blind end condition. */
  private solveExtrudeEndBound(
    node: ScadgenFeatureNode,
    src: BodyOutput,
    endBound: string,
  ): { ok: true; depth: number } | { ok: false; reason: string } {
    const worldBody = (out: BodyOutput): ExtrudeEndBody => {
      const p = out.position;
      return {
        vertices: out.brep.vertices.map((v) => ({
          x: v.x + p.x,
          y: v.y + p.y,
          z: v.z + p.z,
        })),
        faces: out.brep.faces.map((f) =>
          f.vertices.map((v) => ({
            x: v.x + p.x,
            y: v.y + p.y,
            z: v.z + p.z,
          })),
        ),
      };
    };

    const targets = listOf(node, "targets")
      .map((q) => this.resolve(q))
      .filter((o): o is BodyOutput => !!o && o.featureId !== src.featureId);
    const throughBodies = targets.length
      ? targets
      : [...this.outputs.values()].filter(
          (o) =>
            o.kind === "body" &&
            o.featureId !== src.featureId &&
            !this.deleted.has(o.featureId),
        );

    let face: { x: number; y: number; z: number }[] | undefined;
    let vertex: { x: number; y: number; z: number } | undefined;
    if (
      endBound === "UP_TO_FACE" ||
      endBound === "UP_TO_SURFACE" ||
      endBound === "UP_TO_VERTEX"
    ) {
      const q = listOf(node, "endBoundEntity")[0];
      const ref = q ? this.resolve(q) : undefined;
      if (!q || !ref) {
        return {
          ok: false,
          reason: `extrude: ${endBound.toLowerCase().replace(/_/g, " ")} needs a resolved endBoundEntity`,
        };
      }
      const world = worldBody(ref);
      if (endBound === "UP_TO_VERTEX") {
        const m = q.entityTag.match(/_V(\d+)$/);
        const i = m?.[1] !== undefined ? Number(m[1]) : -1;
        const point = i >= 0 ? world.vertices[i] : undefined;
        if (!point) {
          return {
            ok: false,
            reason: "extrude: up-to-vertex reference does not name a vertex",
          };
        }
        vertex = point;
      } else {
        const byTag = this.tagIndex(ref, "face", q.entityTag);
        const m = q.entityTag.match(/_F(\d+)$/);
        const fi =
          byTag >= 0 ? byTag : m?.[1] !== undefined ? Number(m[1]) : -1;
        const polygon = fi >= 0 ? world.faces[fi] : undefined;
        if (!polygon?.length) {
          return {
            ok: false,
            reason: "extrude: up-to-face reference does not name a face",
          };
        }
        face = polygon;
      }
    }

    const normal = src.planeNormal ?? [0, 0, 1];
    const flip = boolOfParam(node, "oppositeDirection") ? -1 : 1;
    // Through-all/up-to bounds start from the offset plane, not the sketch.
    const startOffset = boolOfParam(node, "hasOffset")
      ? (quantityOf(node, "offsetDistance", this.scope) ?? 0)
      : 0;
    return solveExtrudeEndBound({
      endBound: endBound as ExtrudeEndBound,
      origin: {
        x: src.position.x + (normal[0] ?? 0) * startOffset,
        y: src.position.y + (normal[1] ?? 0) * startOffset,
        z: src.position.z + (normal[2] ?? 1) * startOffset,
      },
      direction: {
        x: (normal[0] ?? 0) * flip,
        y: (normal[1] ?? 0) * flip,
        z: (normal[2] ?? 1) * flip,
      },
      throughBodies: throughBodies.map(worldBody),
      face,
      vertex,
      offset: quantityOf(node, "endBoundOffset", this.scope) ?? 0,
    });
  }

  /** Reference face polygon or vertex for a revolve up-to end condition. */
  private revolveEndReference(node: ScadgenFeatureNode):
    | {
        face?: { x: number; y: number; z: number }[];
        vertex?: { x: number; y: number; z: number };
      }
    | { error: string } {
    const q = listOf(node, "endBoundEntity")[0];
    const ref = q ? this.resolve(q) : undefined;
    if (!q || !ref) {
      return {
        error: "revolve: up-to end condition needs a resolved endBoundEntity",
      };
    }
    if (ref.featureId.split("#")[0] === node.featureId) {
      return { error: "revolve: end reference must be another body" };
    }
    const p = ref.position;
    const world = (v: { x: number; y: number; z: number }) => ({
      x: v.x + p.x,
      y: v.y + p.y,
      z: v.z + p.z,
    });
    if ((enumOfParam(node, "endBound") ?? "") === "UP_TO_VERTEX") {
      const m = /_V(\d+)$/.exec(q.entityTag);
      const i = m?.[1] !== undefined ? Number(m[1]) : -1;
      const vertex = i >= 0 ? ref.brep.vertices[i] : undefined;
      if (!vertex) {
        return {
          error: "revolve: up-to-vertex reference does not name a vertex",
        };
      }
      return { vertex: world(vertex) };
    }
    const byTag = this.tagIndex(ref, "face", q.entityTag);
    const m = /_F(\d+)$/.exec(q.entityTag);
    const fi = byTag >= 0 ? byTag : m?.[1] !== undefined ? Number(m[1]) : -1;
    const polygon = fi >= 0 ? ref.brep.faces[fi] : undefined;
    if (!polygon?.vertices.length) {
      return { error: "revolve: up-to-face reference does not name a face" };
    }
    return { face: polygon.vertices.map(world) };
  }

  /**
   * Apply a feature result to its merge targets. `applied: false` means the
   * feature is NEW (or failed before merging) and the caller owns the geometry.
   */
  private async mergeOperation(
    node: ScadgenFeatureNode,
    brep: Brep,
    position: THREE.Vector3,
    occBrep?: string,
  ): Promise<{
    brep: Brep;
    position: THREE.Vector3;
    occBrep?: string | undefined;
    vertexPositions?: Float32Array | undefined;
    applied: boolean;
    error?: string;
  }> {
    const operationType = enumOfParam(node, "operationType") ?? "NEW";
    if (operationType === "NEW") {
      return { brep, position, occBrep, applied: false };
    }
    const targetOuts = listOf(node, "targets")
      .map((q) => this.resolve(q))
      .filter((o): o is BodyOutput => !!o);
    if (!targetOuts.length) {
      return {
        brep,
        position,
        occBrep,
        applied: false,
        error: `${node.featureType}: ${operationType} needs at least one target body`,
      };
    }
    const bodyOperand = { brep, position, occBrep };
    const targetOperands = targetOuts.map((t) => ({
      brep: t.brep,
      position: t.position,
      occBrep: t.occBrep,
    }));
    const merged = await this.sendBooleanOp(
      operationType === "ADD"
        ? "union"
        : operationType === "CUT"
          ? "difference"
          : "intersection",
      operationType === "CUT"
        ? [...targetOperands, bodyOperand]
        : [bodyOperand, ...targetOperands],
    );
    return { ...merged, applied: true };
  }

  private async sendBooleanOp(
    operation: "union" | "difference" | "intersection",
    outs: {
      brep: Brep;
      position: THREE.Vector3;
      occBrep?: string | undefined;
    }[],
    options?: { makeSolid?: boolean; keepTools?: boolean },
  ): Promise<{
    brep: Brep;
    position: THREE.Vector3;
    occBrep?: string | undefined;
    vertexPositions?: Float32Array | undefined;
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
      payload: { operation, operands, ...(options ? { options } : {}) },
    });
    const merged = Brep.fromJSON(res.brepJson as never);
    let vertexPositions = res.vertexPositions;
    if (!vertexPositions) {
      const verts = merged.toJSON().vertices;
      vertexPositions = new Float32Array(verts.length * 3);
      verts.forEach((v, i) => {
        vertexPositions![i * 3] = v.x;
        vertexPositions![i * 3 + 1] = v.y;
        vertexPositions![i * 3 + 2] = v.z;
      });
    }
    return {
      brep: merged,
      position: new THREE.Vector3(
        res.position.x,
        res.position.y,
        res.position.z,
      ),
      vertexPositions,
      ...(res.occBrep !== undefined ? { occBrep: res.occBrep } : {}),
    };
  }

  /**
   * Macro features (rib/gusset/web/boss/dome) expand into fresh helper nodes
   * from their current parameters, evaluate those helpers, and retag the final
   * body to the macro id. One history row, one body, but every parameter edit
   * regenerates the helpers instead of editing stale geometry.
   */
  private async executeMacro(
    node: ScadgenFeatureNode,
    report: ExecReport,
  ): Promise<BodyOutput | null> {
    let bbox: {
      min: [number, number, number];
      max: [number, number, number];
    } | null = null;
    const targetQ = listOf(node, "targets")[0];
    const target = targetQ ? this.resolve(targetQ) : null;
    if (target) {
      const j = target.brep.toJSON();
      const p = target.position;
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const v of j.vertices) {
        const xyz = [v.x + p.x, v.y + p.y, v.z + p.z];
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i] ?? Infinity, xyz[i] ?? 0);
          max[i] = Math.max(max[i] ?? -Infinity, xyz[i] ?? 0);
        }
      }
      if (Number.isFinite(min[0])) bbox = { min, max };
    }
    let chain: ScadgenFeatureNode[];
    try {
      chain = expandFeatureMacro(node, bbox);
    } catch (e) {
      report[node.featureId] = {
        status: "ERROR",
        detail: e instanceof Error ? e.message : String(e),
      };
      return null;
    }
    const temp: ExecReport = {};
    let last: BodyOutput | null = null;
    for (const sub of chain) {
      const out = await this.execute(sub, temp);
      if (!out) {
        report[node.featureId] = {
          status: "ERROR",
          detail: `${node.featureType}: ${temp[sub.featureId]?.detail ?? "helper feature failed"}`,
        };
        return null;
      }
      last = out;
      this.outputs.set(out.featureId, out);
    }
    if (!last) {
      report[node.featureId] = {
        status: "ERROR",
        detail: `${node.featureType}: macro produced no body`,
      };
      return null;
    }
    const result: BodyOutput = {
      ...last,
      featureId: node.featureId,
      edgeTags: registerEdges(last.brep.edges.length, node.featureId),
      faceTags: registerFaces(last.brep.faces.length, node.featureId),
    };
    for (const sub of chain) this.outputs.delete(sub.featureId);
    return result;
  }

  /** Curve-only features: a Brep with edges and no faces. */
  private executeCurve(
    node: ScadgenFeatureNode,
    report: ExecReport,
  ): BodyOutput | null {
    let points: number[][];
    try {
      if (node.featureType === "helixCurve") {
        points = coilPathPoints(node);
      } else if (node.featureType === "fitSpline") {
        points = fitSplinePolyline(
          curvePoints(node),
          boolOfParam(node, "closed"),
        );
      } else {
        points = bridgePoints(node);
      }
    } catch (e) {
      report[node.featureId] = {
        status: "ERROR",
        detail: e instanceof Error ? e.message : String(e),
      };
      return null;
    }
    if (points.length < 2) {
      report[node.featureId] = {
        status: "ERROR",
        detail: `${node.featureType}: needs at least two points`,
      };
      return null;
    }
    const vertices = points.map((p) => ({
      x: p[0] ?? 0,
      y: p[1] ?? 0,
      z: p[2] ?? 0,
    }));
    const edges = vertices.slice(1).map((end, i) => ({
      start: vertices[i]!,
      end,
    }));
    const brep = Brep.fromJSON({ type: "brep", vertices, edges, faces: [] });
    return {
      featureId: node.featureId,
      kind: "profile",
      brep,
      position: new THREE.Vector3(0, 0, 0),
      edgeTags: registerEdges(brep.edges.length, node.featureId),
      faceTags: [],
    };
  }

  /**
   * Derived Part Studio: resolve the source tab's serialized design on every
   * rebuild, evaluate it in an isolated executor, and retag its bodies.
   */
  private async executeDerive(
    node: ScadgenFeatureNode,
    report: ExecReport,
  ): Promise<BodyOutput | null> {
    const sourceTab = stringOfParam(node, "sourceTab");
    if (!sourceTab) {
      report[node.featureId] = {
        status: "ERROR",
        detail: "derive: no source Part Studio selected",
      };
      return null;
    }
    const design = this.deriveResolver?.(sourceTab) ?? null;
    if (!design) {
      report[node.featureId] = {
        status: "ERROR",
        detail: "derive: source Part Studio not found",
      };
      return null;
    }
    let nodes: ScadgenFeatureNode[];
    try {
      const parsed = JSON.parse(design) as { nodes?: unknown };
      if (!Array.isArray(parsed.nodes))
        throw new Error("source design has no nodes");
      nodes = parsed.nodes as ScadgenFeatureNode[];
    } catch (e) {
      report[node.featureId] = {
        status: "ERROR",
        detail: `derive: ${e instanceof Error ? e.message : String(e)}`,
      };
      return null;
    }
    const ex = new ScadgenExecutor();
    ex.deriveResolver = this.deriveResolver;
    const fake = {
      evaluatedNodes: () => nodes,
      setState: () => undefined,
      get: (id: string) => nodes.find((n) => n.featureId === id) ?? null,
    } as unknown as ScadgenHistory;
    await ex.rebuild(fake);
    const wanted = stringOfParam(node, "sourceFeature");
    let bodies = [...ex.outputs.values()].filter((b) => b.kind === "body");
    if (wanted)
      bodies = bodies.filter(
        (b) => b.featureId === wanted || b.featureId.startsWith(`${wanted}#`),
      );
    if (!bodies.length) {
      report[node.featureId] = {
        status: "ERROR",
        detail: wanted
          ? `derive: source body “${wanted}” not found`
          : "derive: source Part Studio has no bodies",
      };
      return null;
    }
    const retag = (b: BodyOutput, id: string): BodyOutput => ({
      ...b,
      featureId: id,
      edgeTags: registerEdges(b.brep.edges.length, id),
      faceTags: registerFaces(b.brep.faces.length, id),
    });
    if (boolOfParam(node, "merge")) {
      const targetQ = listOf(node, "targets")[0];
      const target = targetQ ? this.resolve(targetQ) : null;
      if (target) {
        const merged = await this.sendBooleanOp("union", [
          {
            brep: target.brep,
            position: target.position,
            occBrep: target.occBrep,
          },
          ...bodies.map((b) => ({
            brep: b.brep,
            position: b.position,
            occBrep: b.occBrep,
          })),
        ]);
        return {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          position: merged.position,
          ...(merged.occBrep !== undefined ? { occBrep: merged.occBrep } : {}),
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
        };
      }
    }
    const derived = bodies.map((b, i) =>
      retag(b, i === 0 ? node.featureId : `${node.featureId}#${i}`),
    );
    return { ...derived[0]!, additionalBodies: derived.slice(1) };
  }

  /** Coil/spring: circular profile swept along a true 3D helix, then merged. */
  private async executeCoil(
    node: ScadgenFeatureNode,
    report: ExecReport,
  ): Promise<BodyOutput | null> {
    let profileNode: ScadgenFeatureNode;
    let points: number[][];
    try {
      profileNode = buildCoilProfileSketch(node);
      points = coilPathPoints(node);
    } catch (e) {
      report[node.featureId] = {
        status: "ERROR",
        detail: e instanceof Error ? e.message : String(e),
      };
      return null;
    }
    const temp: ExecReport = {};
    const profile = await this.execute(profileNode, temp);
    if (!profile) {
      report[node.featureId] = {
        status: "ERROR",
        detail: `coil: ${temp[profileNode.featureId]?.detail ?? "profile failed"}`,
      };
      return null;
    }
    const res = await sweepBRep(
      profile.brep,
      profile.position,
      points.map((p) => ({ x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 })),
      undefined,
      profile.occBrep,
    );
    if (!res.ok) {
      report[node.featureId] = { status: "ERROR", detail: res.reason };
      return null;
    }
    let brep = res.value.brep;
    let position = profile.position.clone();
    let occBrep = res.value.occBrep;
    let vertexPositions = res.value.vertexPositions;
    if (boolOfParam(node, "merge")) {
      const targetQ = listOf(node, "targets")[0];
      const target = targetQ ? this.resolve(targetQ) : null;
      if (target) {
        const merged = await this.sendBooleanOp("union", [
          {
            brep: target.brep,
            position: target.position,
            occBrep: target.occBrep,
          },
          { brep, position, occBrep },
        ]);
        brep = merged.brep;
        position = merged.position;
        occBrep = merged.occBrep;
        vertexPositions = merged.vertexPositions;
      }
    }
    this.outputs.delete(profileNode.featureId);
    return {
      featureId: node.featureId,
      kind: "body",
      brep,
      ...(occBrep !== undefined ? { occBrep } : {}),
      position,
      edgeTags: registerEdges(brep.edges.length, node.featureId),
      faceTags: registerFaces(brep.faces.length, node.featureId),
      ...(vertexPositions !== undefined ? { vertexPositions } : {}),
    };
  }

  private async execute(
    node: ScadgenFeatureNode,
    report: ExecReport,
  ): Promise<BodyOutput | null> {
    switch (node.featureType) {
      case "customFeature": {
        // Phase 7 registers the FeatureScript definition, parameters and source
        // hash. Kernel execution for custom features is the final Phase 7 item;
        // the row is valid and rebuilds without pretending to make geometry.
        report[node.featureId] = { status: "OK" };
        return null;
      }
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
        const shapeResult =
          await SketchToBrepService.getInstance().convertSketchToBrepWithShape(
            sketch,
          );
        const brep = shapeResult.brep;
        // An open chain has no face; keep it as a profile so thin extrude can
        // build a ribbon from the snapshot. Solid features still reject it.
        if (!brep.faces.length && !snap.primitives.length) {
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
          ...(shapeResult.occBrep !== undefined
            ? { occBrep: shapeResult.occBrep }
            : {}),
          edgeTags: tags,
          faceTags: registerFaces(brep.faces.length, node.featureId),
          snapshot: snap,
        };
      }
      case "baseFlange": {
        // A base flange is the sheet blank: a closed profile extruded by the
        // rule thickness. Reuse the real extrude kernel, but keep this
        // feature's identity so provenance and body classification stay on
        // the sheet-metal feature.
        const thickness =
          quantityOf(node, "thickness", this.scope) ??
          quantityOf(node, "depth", this.scope) ??
          0.0015;
        if (!(thickness > 1e-9)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "baseFlange: thickness must be greater than zero",
          };
          return null;
        }
        const parameters = node.parameters.filter(
          (p) => p.parameterId !== "depth",
        );
        parameters.push({
          kind: "quantity",
          parameterId: "depth",
          value: thickness,
          units: "m",
          expression: `${(thickness * 1000).toFixed(3)} mm`,
        });
        return this.execute(
          { ...node, featureType: "extrude", parameters },
          report,
        );
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
        // BLIND uses the dialog depth; every other bound derives its depth from
        // the bodies/faces/vertices around the sketch plane.
        const endBound = enumOfParam(node, "endBound") ?? "BLIND";
        let depth: number;
        if (endBound === "BLIND") {
          const declared = extrudeDepthOf(node, this.scope);
          if (!declared) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "missing depth",
            };
            return null;
          }
          depth = declared;
        } else {
          const solved = this.solveExtrudeEndBound(node, src, endBound);
          if (!solved.ok) {
            report[node.featureId] = { status: "ERROR", detail: solved.reason };
            return null;
          }
          depth = solved.depth;
        }
        const draftOn = boolOfParam(node, "hasDraft");
        const draftAngle = quantityOf(node, "draftAngle", this.scope) ?? 0;
        const draftMode =
          (enumOfParam(node, "draftMode") as "NEUTRAL" | "PARTING" | null) ??
          "NEUTRAL";
        let draftNeutralPoint: { x: number; y: number; z: number } | undefined;
        let draftNeutralNormal: { x: number; y: number; z: number } | undefined;
        let draftPartingLine:
          | {
              start: { x: number; y: number; z: number };
              end: { x: number; y: number; z: number };
            }
          | undefined;
        if (draftOn) {
          const neutralQs = listOf(node, "draftNeutralFace");
          if (neutralQs.length > 1) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "extrude: select one neutral face or one explicit plane",
            };
            return null;
          }
          const explicitOrigin = vec3Param(node, "draftNeutralOrigin");
          const explicitNormal = vec3Param(node, "draftNeutralNormal");
          if (!!explicitOrigin !== !!explicitNormal) {
            report[node.featureId] = {
              status: "ERROR",
              detail:
                "extrude: draft neutral plane needs both origin and normal",
            };
            return null;
          }
          if (explicitOrigin && explicitNormal) {
            const nl = Math.hypot(
              explicitNormal.x,
              explicitNormal.y,
              explicitNormal.z,
            );
            if (!(nl > 1e-9)) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "extrude: draft neutral normal must be non-zero",
              };
              return null;
            }
            draftNeutralPoint = {
              x: explicitOrigin.x - src.position.x,
              y: explicitOrigin.y - src.position.y,
              z: explicitOrigin.z - src.position.z,
            };
            draftNeutralNormal = {
              x: explicitNormal.x / nl,
              y: explicitNormal.y / nl,
              z: explicitNormal.z / nl,
            };
          } else if (neutralQs[0]) {
            const ref = this.resolve(neutralQs[0]);
            const fi = ref
              ? this.faceIndices(ref, [neutralQs[0]!])[0]
              : undefined;
            const polygon = fi !== undefined ? ref?.brep.faces[fi] : undefined;
            if (!ref || !polygon?.vertices.length) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "extrude: draft neutral face not resolved",
              };
              return null;
            }
            const world = polygon.vertices.map((v) => ({
              x: v.x + ref.position.x,
              y: v.y + ref.position.y,
              z: v.z + ref.position.z,
            }));
            const centroid = world.reduce(
              (a, p) => ({
                x: a.x + p.x / world.length,
                y: a.y + p.y / world.length,
                z: a.z + p.z / world.length,
              }),
              { x: 0, y: 0, z: 0 },
            );
            let nx = 0;
            let ny = 0;
            let nz = 0;
            for (let i = 0; i < world.length; i++) {
              const a = world[i]!;
              const b = world[(i + 1) % world.length]!;
              nx += (a.y - b.y) * (a.z + b.z);
              ny += (a.z - b.z) * (a.x + b.x);
              nz += (a.x - b.x) * (a.y + b.y);
            }
            const nl = Math.hypot(nx, ny, nz);
            if (!(nl > 1e-12)) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "extrude: neutral face has no usable normal",
              };
              return null;
            }
            draftNeutralPoint = {
              x: centroid.x - src.position.x,
              y: centroid.y - src.position.y,
              z: centroid.z - src.position.z,
            };
            draftNeutralNormal = {
              x: nx / nl,
              y: ny / nl,
              z: nz / nl,
            };
          }
          if (draftMode === "PARTING") {
            const partingQs = listOf(node, "draftPartingEdge");
            if (partingQs.length !== 1) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "extrude: parting mode needs exactly one parting edge",
              };
              return null;
            }
            const q = partingQs[0]!;
            const ref = this.resolve(q);
            const pts = ref?.snapshot
              ? pathForPrimitive(ref.snapshot, q.entityTag)
              : [];
            if (pts.length < 2) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "extrude: parting edge not resolved to a sketch curve",
              };
              return null;
            }
            const start = pts[0]!;
            const end = pts[pts.length - 1]!;
            if (
              Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) <
              1e-9
            ) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "extrude: parting edge has zero length",
              };
              return null;
            }
            draftPartingLine = {
              start: {
                x: start.x - src.position.x,
                y: start.y - src.position.y,
                z: start.z - src.position.z,
              },
              end: {
                x: end.x - src.position.x,
                y: end.y - src.position.y,
                z: end.z - src.position.z,
              },
            };
          }
        }
        const thinOn = boolOfParam(node, "thinWall");
        const wallThickness =
          quantityOf(node, "wallThickness", this.scope) ?? 0;
        if (draftOn && draftAngle === 0) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "extrude: draft is on but the angle is zero",
          };
          return null;
        }
        if (thinOn && !(wallThickness > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "extrude: thin wall needs a positive wall thickness",
          };
          return null;
        }
        const normalVec = src.planeNormal
          ? {
              x: src.planeNormal[0],
              y: src.planeNormal[1],
              z: src.planeNormal[2],
            }
          : undefined;
        const openProfile = src.brep.faces.length === 0;
        if (!openProfile) {
          const ruleError = profileRuleError("extrude", src.brep, src.snapshot);
          if (ruleError) {
            report[node.featureId] = { status: "ERROR", detail: ruleError };
            return null;
          }
        }
        let ribbonPoints: { x: number; y: number; z: number }[] | undefined;
        if (openProfile) {
          if (!src.snapshot) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "extrude: open profile has no sketch snapshot",
            };
            return null;
          }
          if (!thinOn) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "extrude: an open profile needs a thin wall",
            };
            return null;
          }
          if (endBound !== "BLIND") {
            report[node.featureId] = {
              status: "ERROR",
              detail: "extrude: open thin wall supports blind depth only",
            };
            return null;
          }
          const polygon = ribbonPolygon(
            chainPathPoints(src.snapshot),
            wallThickness,
            src.planeNormal as [number, number, number] | undefined,
          );
          if (polygon.length < 4) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "extrude: open profile wall could not be built",
            };
            return null;
          }
          ribbonPoints = polygon;
        }
        const symmetric =
          boolOfParam(node, "midplane") || boolOfParam(node, "symmetric");
        if (symmetric && endBound !== "BLIND") {
          report[node.featureId] = {
            status: "ERROR",
            detail: `extrude: midplane cannot combine with end condition ${endBound}`,
          };
          return null;
        }
        const secondDirection = boolOfParam(node, "hasSecondDirection");
        const backDepth = quantityOf(node, "depthBack", this.scope) ?? 0;
        const symmetricKernel = symmetric && !secondDirection;
        if (secondDirection && backDepth <= 0) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "extrude: second direction needs a positive back depth",
          };
          return null;
        }
        if (secondDirection && thinOn) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "extrude: thin wall cannot combine with a second direction",
          };
          return null;
        }
        const extrudeOptions =
          draftOn || thinOn || ribbonPoints
            ? {
                ...(draftOn
                  ? { draftAngleDeg: (draftAngle * 180) / Math.PI }
                  : {}),
                ...(draftNeutralPoint ? { draftNeutralPoint } : {}),
                ...(draftNeutralNormal ? { draftNeutralNormal } : {}),
                ...(draftOn ? { draftMode } : {}),
                ...(draftPartingLine ? { draftPartingLine } : {}),
                ...(thinOn && !ribbonPoints ? { thinWall: wallThickness } : {}),
                ...(ribbonPoints ? { ribbonPoints } : {}),
              }
            : undefined;
        // hasOffset gates the value: the builder boilerplate expression
        // ("25 mm") must not shift every legacy feature.
        const offset = boolOfParam(node, "hasOffset")
          ? (quantityOf(node, "offsetDistance", this.scope) ?? 0)
          : 0;
        const offsetVec =
          normalVec && offset !== 0
            ? new THREE.Vector3(
                normalVec.x,
                normalVec.y,
                normalVec.z,
              ).multiplyScalar(offset)
            : null;
        const startPosition = offsetVec
          ? src.position.clone().add(offsetVec)
          : src.position;
        const startBrep = offsetVec
          ? transformBrepVertices(src.brep, src.position, startPosition)
          : src.brep;
        const forwardDir = boolOfParam(node, "oppositeDirection") ? -1 : 1;
        const res = await extrudeBRep(
          startBrep,
          depth,
          forwardDir,
          normalVec,
          offsetVec ? undefined : src.occBrep,
          symmetricKernel,
          extrudeOptions,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        const value = res.value;
        let brep = value.brep;
        let position = src.position
          .clone()
          .add(
            new THREE.Vector3(
              value.positionOffset.x,
              value.positionOffset.y,
              value.positionOffset.z,
            ),
          );
        let occBrep = value.occBrep;
        let vertexPositions = value.vertexPositions;
        let edgeGeometry = value.edgeGeometry;
        let faceGeometry = value.faceGeometry;
        if (secondDirection) {
          const back = await extrudeBRep(
            startBrep,
            backDepth,
            -forwardDir,
            normalVec,
            offsetVec ? undefined : src.occBrep,
            false,
            draftOn
              ? {
                  draftAngleDeg: (draftAngle * 180) / Math.PI,
                  ...(draftNeutralPoint ? { draftNeutralPoint } : {}),
                  ...(draftNeutralNormal ? { draftNeutralNormal } : {}),
                  ...(draftMode ? { draftMode } : {}),
                  ...(draftPartingLine ? { draftPartingLine } : {}),
                }
              : undefined,
          );
          if (!back.ok) {
            report[node.featureId] = { status: "ERROR", detail: back.reason };
            return null;
          }
          const backPosition = src.position
            .clone()
            .add(
              new THREE.Vector3(
                back.value.positionOffset.x,
                back.value.positionOffset.y,
                back.value.positionOffset.z,
              ),
            );
          const merged = await this.sendBooleanOp("union", [
            { brep, position, occBrep },
            {
              brep: back.value.brep,
              position: backPosition,
              occBrep: back.value.occBrep,
            },
          ]);
          brep = merged.brep;
          position = merged.position;
          occBrep = merged.occBrep;
          vertexPositions = merged.vertexPositions;
          edgeGeometry = undefined;
          faceGeometry = undefined;
        }
        const merged = await this.mergeOperation(node, brep, position, occBrep);
        if (merged.error) {
          report[node.featureId] = { status: "ERROR", detail: merged.error };
          return null;
        }
        brep = merged.brep;
        position = merged.position;
        occBrep = merged.occBrep;
        if (merged.vertexPositions) vertexPositions = merged.vertexPositions;
        if (merged.applied) {
          edgeGeometry = undefined;
          faceGeometry = undefined;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep,
          occBrep,
          // positionOffset already reflects the shifted start brep, so
          // translate from the original sketch position to avoid doubling.
          position,
          planeNormal: src.planeNormal,
          edgeTags: registerEdges(brep.edges.length, node.featureId),
          faceTags: registerFaces(brep.faces.length, node.featureId),
          edgeGeometry,
          faceGeometry,
          vertexPositions,
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
        const edgeQs = qs.filter((q) => q.entityType !== "FACE");
        const faceQs = qs.filter((q) => q.entityType === "FACE");
        const baseEdges = [
          ...(edgeQs.length ? this.edgeIndices(src, edgeQs) : []),
          ...faceQs.flatMap((q) => {
            const fi = this.tagIndex(src, "face", q.entityTag);
            return fi >= 0 ? faceBoundaryEdgeIndices(src.brep, fi) : [];
          }),
        ].filter((v, i, a) => a.indexOf(v) === i);
        if (!baseEdges.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `${node.featureType}: no edges or faces resolved`,
          };
          return null;
        }
        const perEdgeRaw = stringOfParam(
          node,
          node.featureType === "fillet" ? "radii" : "distances",
        );
        const selectedEdges =
          boolOfParam(node, "tangentPropagation") && !perEdgeRaw
            ? expandTangentEdges(src.brep, baseEdges)
            : baseEdges;
        // worker edge op API is 1-based (OCC IndexedMap); tags are 0-based.
        const idx = selectedEdges.map((i) => i + 1);
        const radius =
          quantityOf(node, "radius", this.scope) ??
          quantityOf(node, "width", this.scope) ??
          0;
        let radiusArg: number | number[] = radius;
        if (perEdgeRaw) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(perEdgeRaw);
          } catch {
            parsed = null;
          }
          if (
            !Array.isArray(parsed) ||
            parsed.length !== idx.length ||
            !parsed.every(
              (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
            )
          ) {
            report[node.featureId] = {
              status: "ERROR",
              detail: `${node.featureType}: ${
                node.featureType === "fillet" ? "radii" : "distances"
              } must provide one positive value per edge`,
            };
            return null;
          }
          radiusArg = parsed as number[];
        }
        const variableRaw = stringOfParam(node, "variableRadii");
        let variableRadii: Array<{ start: number; end: number }> | undefined;
        if (variableRaw) {
          try {
            const parsed: unknown = JSON.parse(variableRaw);
            if (Array.isArray(parsed)) {
              variableRadii = parsed.filter(
                (v): v is { start: number; end: number } =>
                  !!v &&
                  typeof v === "object" &&
                  typeof (v as { start?: unknown }).start === "number" &&
                  typeof (v as { end?: unknown }).end === "number",
              );
            }
          } catch {
            variableRadii = undefined;
          }
          if (
            !variableRadii ||
            variableRadii.length !== idx.length ||
            variableRadii.some((v) => !(v.start > 0 && v.end > 0))
          ) {
            report[node.featureId] = {
              status: "ERROR",
              detail:
                "fillet: variableRadii needs one positive {start,end} pair per edge",
            };
            return null;
          }
        }
        const edgeValues = Array.isArray(radiusArg) ? radiusArg : [radiusArg];
        if (!edgeValues.length || edgeValues.some((v) => !(v > 0))) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `${node.featureType}: ${
              node.featureType === "fillet" ? "radius" : "width"
            } must be positive`,
          };
          return null;
        }
        const res =
          node.featureType === "fillet"
            ? await filletBRep(
                src.brep,
                src.position,
                idx,
                radiusArg,
                src.occBrep,
                undefined,
                {
                  section:
                    (enumOfParam(node, "crossSection") as
                      | "RATIONAL"
                      | "QUASI_ANGULAR"
                      | "POLYNOMIAL"
                      | null) ?? "RATIONAL",
                  ...(variableRadii ? { variableRadii } : {}),
                  cornerRadius:
                    quantityOf(node, "cornerRadius", this.scope) ?? 0,
                },
              )
            : await chamferBRep(
                src.brep,
                src.position,
                idx,
                radiusArg,
                src.occBrep,
                undefined,
                {
                  mode:
                    (enumOfParam(node, "chamferType") as
                      | "DIST_DISTS"
                      | "DIST_ANG"
                      | "ANG_DISTS"
                      | "SYM_DISTS"
                      | null) ?? "DIST_DISTS",
                  angleDeg:
                    ((quantityOf(node, "angle", this.scope) ?? 0) * 180) /
                    Math.PI,
                },
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
        // This build's ThruSections has no guide input. Guides are blended by
        // arc length into one spine, then the loft is built as a pipe shell
        // through every section along that spine (same path as the centerline).
        const guideQs = listOf(node, "guideSubqueries");
        const guideChains: { x: number; y: number; z: number }[][] = [];
        for (const q of guideQs) {
          const guide = this.resolve(q);
          if (!guide?.snapshot) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "loft: guide curve not resolved",
            };
            return null;
          }
          // A viewport pick names one sketch entity; use that exact curve.
          // Older whole-sketch guide queries fall back to the first chain.
          const picked = pathForPrimitive(guide.snapshot, q.entityTag);
          const pts =
            picked.length >= 2 ? picked : chainPathPoints(guide.snapshot);
          if (pts.length < 2) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "loft: guide curve needs >=2 chainable points",
            };
            return null;
          }
          guideChains.push(pts);
        }
        const guidePoints = guideChains.length
          ? blendGuidePoints(guideChains)
          : undefined;
        const ruled = node.parameters.find(
          (p) => p.kind === "boolean" && p.parameterId === "ruled",
        );
        const loftType = enumOfParam(node, "loftType");
        const isRuled =
          (ruled && ruled.kind === "boolean" ? ruled.value : false) ||
          loftType === "STRAIGHT";
        const thinOn = boolOfParam(node, "thinWall");
        const wallThickness =
          quantityOf(node, "wallThickness", this.scope) ?? 0;
        if (thinOn && !(wallThickness > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "loft: thin wall needs a positive wall thickness",
          };
          return null;
        }
        const twist = quantityOf(node, "twist", this.scope) ?? 0;
        const centerlineQ = listOf(node, "centerline")[0];
        const centerline = centerlineQ ? this.resolve(centerlineQ) : undefined;
        if (centerlineQ && !centerline?.snapshot) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "loft: centerline not resolved",
          };
          return null;
        }
        const centerlinePoints = centerline?.snapshot
          ? chainPathPoints(centerline.snapshot)
          : undefined;
        if (centerlineQ && (centerlinePoints?.length ?? 0) < 2) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "loft: centerline needs >=2 chainable points",
          };
          return null;
        }
        if (guidePoints && centerlinePoints) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "loft: pick guides or a centerline, not both",
          };
          return null;
        }
        const spinePoints = guidePoints ?? centerlinePoints;
        const connectorQs = listOf(node, "connectors");
        const connectors:
          | Array<{ x: number; y: number; z: number } | undefined>
          | undefined = connectorQs.length
          ? profiles.map((p) => {
              const q = connectorQs.find(
                (c) => c.creationFeatureId === p.featureId,
              );
              if (!q) return undefined;
              const m = /_V(\d+)$/.exec(q.entityTag);
              const i = m?.[1] !== undefined ? Number(m[1]) : -1;
              const v = i >= 0 ? p.brep.vertices[i] : undefined;
              return v
                ? {
                    x: v.x + p.position.x,
                    y: v.y + p.position.y,
                    z: v.z + p.position.z,
                  }
                : undefined;
            })
          : undefined;
        const startCondition = (enumOfParam(node, "startCondition") ??
          "NONE") as LoftEndCondition;
        const endCondition = (enumOfParam(node, "endCondition") ??
          "NONE") as LoftEndCondition;
        let loftProfiles: Array<
          Pick<BodyOutput, "brep" | "position" | "occBrep">
        > = profiles;
        let loftConnectors = connectors;
        if (startCondition !== "NONE" || endCondition !== "NONE") {
          if (boolOfParam(node, "closed")) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "loft: end conditions cannot combine with a closed loft",
            };
            return null;
          }
          if (spinePoints) {
            report[node.featureId] = {
              status: "ERROR",
              detail:
                "loft: end conditions cannot combine with a centerline or guides",
            };
            return null;
          }
          const frames = profiles.map((p) =>
            loftSectionFrame(p.brep.faces[0]?.vertices ?? p.brep.vertices, {
              x: p.position.x,
              y: p.position.y,
              z: p.position.z,
            }),
          );
          if (frames.some((f) => !f)) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "loft: end condition needs a planar section",
            };
            return null;
          }
          const rawStartDirection = stringOfParam(node, "startDirection");
          const rawEndDirection = stringOfParam(node, "endDirection");
          const startDirection = rawStartDirection
            ? parseLoftDirection(rawStartDirection)
            : null;
          const endDirection = rawEndDirection
            ? parseLoftDirection(rawEndDirection)
            : null;
          if (rawStartDirection && !startDirection) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "loft: start direction is not a valid JSON vector",
            };
            return null;
          }
          if (rawEndDirection && !endDirection) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "loft: end direction is not a valid JSON vector",
            };
            return null;
          }
          const plan = planLoftEndSections({
            sections: frames.filter((f): f is LoftSectionFrame => !!f),
            start: startCondition,
            end: endCondition,
            startDirection,
            endDirection,
          });
          if (!plan.ok) {
            report[node.featureId] = { status: "ERROR", detail: plan.reason };
            return null;
          }
          const copyAt = (p: BodyOutput, offset: LoftPoint): BodyOutput => ({
            featureId: p.featureId,
            kind: p.kind,
            brep: p.brep,
            position: p.position
              .clone()
              .add(new THREE.Vector3(offset.x, offset.y, offset.z)),
            edgeTags: p.edgeTags,
            faceTags: p.faceTags,
            ...(p.occBrep !== undefined ? { occBrep: p.occBrep } : {}),
          });
          const before = plan.before.map((o) => copyAt(profiles[0]!, o));
          const after = plan.after.map((o) =>
            copyAt(profiles[profiles.length - 1]!, o),
          );
          loftProfiles = [...before, ...profiles, ...after];
          if (connectors) {
            loftConnectors = [
              ...before.map(() => undefined),
              ...connectors,
              ...after.map(() => undefined),
            ];
          }
        }
        const res = await loftBReps(
          loftProfiles.map((p) => ({
            brep: p.brep,
            position: p.position,
            ...(p.occBrep !== undefined ? { occBrep: p.occBrep } : {}),
          })),
          isRuled,
          boolOfParam(node, "closed"),
          {
            ...(thinOn ? { thinWall: wallThickness } : {}),
            ...(twist !== 0 ? { twistRadians: twist } : {}),
            ...(loftConnectors ? { connectors: loftConnectors } : {}),
            ...(spinePoints ? { centerlinePoints: spinePoints } : {}),
          },
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        // loftBReps returns the world bbox centre, not an offset.
        const merged = await this.mergeOperation(
          node,
          res.value.brep,
          res.value.position,
          res.value.occBrep,
        );
        if (merged.error) {
          report[node.featureId] = { status: "ERROR", detail: merged.error };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          occBrep: merged.occBrep,
          position: merged.position,
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
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
        if (src.brep.faces.length === 0) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "revolve: profile is open; revolve needs a closed profile",
          };
          return null;
        }
        const revolveRuleError = profileRuleError(
          "revolve",
          src.brep,
          src.snapshot,
        );
        if (revolveRuleError) {
          report[node.featureId] = {
            status: "ERROR",
            detail: revolveRuleError,
          };
          return null;
        }
        const axisQ = listOf(node, "axis")[0];
        let axis: {
          origin: { x: number; y: number; z: number };
          dir: { x: number; y: number; z: number };
        } | null = null;
        const explicitDir = vec3Param(node, "axisDir");
        if (explicitDir) {
          const origin = vec3Param(node, "axisOrigin") ?? { x: 0, y: 0, z: 0 };
          const len = Math.hypot(explicitDir.x, explicitDir.y, explicitDir.z);
          if (len > 1e-9) {
            axis = {
              origin,
              dir: {
                x: explicitDir.x / len,
                y: explicitDir.y / len,
                z: explicitDir.z / len,
              },
            };
          }
        } else if (axisQ?.entityType === "EDGE") {
          const body = this.resolve(axisQ);
          const i = body ? this.tagIndex(body, "edge", axisQ.entityTag) : -1;
          const edge = body && i >= 0 ? body.brep.edges[i] : undefined;
          if (body && edge) {
            const origin = {
              x: edge.start.x + body.position.x,
              y: edge.start.y + body.position.y,
              z: edge.start.z + body.position.z,
            };
            const end = {
              x: edge.end.x + body.position.x,
              y: edge.end.y + body.position.y,
              z: edge.end.z + body.position.z,
            };
            const dir = {
              x: end.x - origin.x,
              y: end.y - origin.y,
              z: end.z - origin.z,
            };
            const len = Math.hypot(dir.x, dir.y, dir.z);
            if (len > 1e-9) {
              axis = {
                origin,
                dir: { x: dir.x / len, y: dir.y / len, z: dir.z / len },
              };
            }
          }
        } else {
          axis = axisFromSnapshot(src.snapshot, axisQ?.entityTag ?? "NORMAL");
        }
        if (!axis) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "revolve: axis unresolvable",
          };
          return null;
        }
        const direction = (enumOfParam(node, "direction") ?? "one") as
          | "one"
          | "two"
          | "symmetric";
        let angle = quantityOf(node, "angleForward", this.scope) ?? Math.PI * 2;
        const angleBack = quantityOf(node, "angleBack", this.scope) ?? 0;
        const endBound = enumOfParam(node, "endBound") ?? "BLIND";
        const flip = boolOfParam(node, "oppositeDirection") ? -1 : 1;
        if (endBound !== "BLIND") {
          if (direction !== "one") {
            report[node.featureId] = {
              status: "ERROR",
              detail: "revolve: up-to end condition needs one direction",
            };
            return null;
          }
          const reference = this.revolveEndReference(node);
          if ("error" in reference) {
            report[node.featureId] = {
              status: "ERROR",
              detail: reference.error,
            };
            return null;
          }
          const solved = solveRevolveEndAngle({
            endBound:
              endBound === "UP_TO_VERTEX" ? "UP_TO_VERTEX" : "UP_TO_FACE",
            profilePoints: src.brep.vertices.map((v) => ({
              x: v.x + src.position.x,
              y: v.y + src.position.y,
              z: v.z + src.position.z,
            })),
            axisOrigin: axis.origin,
            axisDir: {
              x: axis.dir.x * flip,
              y: axis.dir.y * flip,
              z: axis.dir.z * flip,
            },
            face: reference.face,
            vertex: reference.vertex,
          });
          if (!solved.ok) {
            report[node.featureId] = { status: "ERROR", detail: solved.reason };
            return null;
          }
          angle = solved.angle;
        }
        if (!(angle > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "revolve: angle must be positive",
          };
          return null;
        }
        if (direction === "two" && !(angleBack > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "revolve: second direction needs a positive angle",
          };
          return null;
        }
        const thinOn = boolOfParam(node, "thinWall");
        const wallThickness =
          quantityOf(node, "wallThickness", this.scope) ?? 0;
        if (thinOn && !(wallThickness > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "revolve: thin wall needs a positive wall thickness",
          };
          return null;
        }
        const res = await revolveBRep(
          src.brep,
          src.position,
          axis.origin,
          {
            x: axis.dir.x * flip,
            y: axis.dir.y * flip,
            z: axis.dir.z * flip,
          },
          angle,
          src.occBrep,
          direction,
          direction === "two" ? angleBack : undefined,
          thinOn
            ? {
                thinWall: wallThickness,
                cornerType: (enumOfParam(node, "cornerType") ?? "ROUNDED") as
                  | "ROUNDED"
                  | "CONICAL"
                  | "TRANSITIONAL",
              }
            : undefined,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        const position = src.position
          .clone()
          .add(
            new THREE.Vector3(
              res.value.positionOffset.x,
              res.value.positionOffset.y,
              res.value.positionOffset.z,
            ),
          );
        const merged = await this.mergeOperation(
          node,
          res.value.brep,
          position,
          res.value.occBrep,
        );
        if (merged.error) {
          report[node.featureId] = { status: "ERROR", detail: merged.error };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          occBrep: merged.occBrep,
          position: merged.position,
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
          edgeGeometry: merged.applied ? undefined : res.value.edgeGeometry,
          vertexPositions: merged.vertexPositions ?? res.value.vertexPositions,
        };
      }
      case "sweep": {
        const profQ = listOf(node, "profiles")[0];
        const pathQ = listOf(node, "path")[0];
        const profile = profQ ? this.resolve(profQ) : undefined;
        const path = pathQ ? this.resolve(pathQ) : undefined;
        // A true 3D path can be supplied directly as JSON; sketch snapshots are
        // still planar. Invalid explicit paths fail instead of falling back.
        const rawPath = stringOfParam(node, "pathPoints");
        let explicitPath: { x: number; y: number; z: number }[] | null = null;
        if (rawPath) {
          try {
            const parsed: unknown = JSON.parse(rawPath);
            if (Array.isArray(parsed)) {
              const pts = parsed.filter(
                (p): p is { x: number; y: number; z: number } =>
                  !!p &&
                  typeof p === "object" &&
                  (["x", "y", "z"] as const).every(
                    (k) =>
                      typeof (p as Record<string, unknown>)[k] === "number",
                  ),
              );
              explicitPath = pts.length >= 2 ? pts : null;
            }
          } catch {
            explicitPath = null;
          }
          if (!explicitPath) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "sweep: pathPoints needs >=2 {x,y,z} points",
            };
            return null;
          }
        }
        if (!profile || (!explicitPath && !path?.snapshot)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "profile/path not resolved",
          };
          return null;
        }
        const startOffset =
          quantityOf(node, "pathStartOffset", this.scope) ?? 0;
        const endOffset = quantityOf(node, "pathEndOffset", this.scope) ?? 0;
        if (startOffset < 0 || endOffset < 0) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "sweep: path offsets must be zero or positive",
          };
          return null;
        }
        const points = extendPathEnds(
          explicitPath ?? chainPathPoints(path!.snapshot!),
          startOffset,
          endOffset,
        );
        if (points.length < 2) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "sweep: path needs >=2 chainable points",
          };
          return null;
        }
        const tolerance = quantityOf(node, "chordalTolerance", this.scope) ?? 0;
        const twist = quantityOf(node, "twist", this.scope) ?? 0;
        const thinOn = boolOfParam(node, "thinWall");
        const wallThickness =
          quantityOf(node, "wallThickness", this.scope) ?? 0;
        if (thinOn && !(wallThickness > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "sweep: thin wall needs a positive wall thickness",
          };
          return null;
        }
        // Keep every guide intact. A single guide uses the pipe shell's one
        // auxiliary spine; two or more are built as guide-constrained sections
        // in the kernel, not averaged into a blended spine.
        const guideQs = listOf(node, "guideSubqueries");
        const guideChains: { x: number; y: number; z: number }[][] = [];
        for (const q of guideQs) {
          const guide = this.resolve(q);
          if (!guide?.snapshot) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "sweep: guide curve not resolved",
            };
            return null;
          }
          // A viewport pick names one sketch entity; use that exact curve.
          // Older whole-sketch guide queries fall back to the first chain.
          const picked = pathForPrimitive(guide.snapshot, q.entityTag);
          const pts =
            picked.length >= 2 ? picked : chainPathPoints(guide.snapshot);
          if (pts.length < 2) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "sweep: guide curve needs >=2 chainable points",
            };
            return null;
          }
          guideChains.push(pts);
        }
        // A single guide is the pipe-shell auxiliary spine. Two or more guides
        // are passed intact to the kernel, which builds guide-constrained
        // sections instead of averaging them into one spine.
        const res = await sweepBRep(
          profile.brep,
          profile.position,
          points,
          {
            orientation: boolOfParam(node, "keepProfileOrientation")
              ? "parallel"
              : "perpendicular",
            cornerMode:
              enumOfParam(node, "cornerMode") === "round" ? "round" : "right",
            ...(tolerance > 0 ? { chordalTolerance: tolerance } : {}),
            ...(twist !== 0 ? { twistRadians: twist } : {}),
            ...(guideChains.length ? { guideCurves: guideChains } : {}),
            ...(thinOn ? { thinWall: wallThickness } : {}),
          },
          profile.occBrep,
        );
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        // The sweep result is centred; its world centre is the profile origin
        // plus the op's positionOffset, not the profile origin alone.
        const position = profile.position
          .clone()
          .add(
            new THREE.Vector3(
              res.value.positionOffset.x,
              res.value.positionOffset.y,
              res.value.positionOffset.z,
            ),
          );
        const merged = await this.mergeOperation(
          node,
          res.value.brep,
          position,
          res.value.occBrep,
        );
        if (merged.error) {
          report[node.featureId] = { status: "ERROR", detail: merged.error };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          occBrep: merged.occBrep,
          position: merged.position,
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
          edgeGeometry: merged.applied ? undefined : res.value.edgeGeometry,
          vertexPositions: merged.vertexPositions ?? res.value.vertexPositions,
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
        const merged = await this.sendBooleanOp(
          operation,
          [base, ...toolOuts],
          {
            makeSolid: node.parameters.some(
              (p) => p.parameterId === "makeSolid",
            )
              ? boolOfParam(node, "makeSolid")
              : true,
            keepTools: booleanParameter(node, "keepTools"),
          },
        );
        const out: BodyOutput = {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          position: merged.position,
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
        };
        if (merged.occBrep !== undefined) out.occBrep = merged.occBrep;
        if (merged.vertexPositions !== undefined)
          out.vertexPositions = merged.vertexPositions;
        return out;
      }
      case "replaceFace": {
        const sources = listOf(node, "entities");
        const target = sources[0] ? this.resolve(sources[0]) : undefined;
        const replacement = sources[1] ? this.resolve(sources[1]) : undefined;
        if (!target || !replacement) {
          report[node.featureId] = {
            status: "ERROR",
            detail:
              "replaceFace: target body and replacement surface are required",
          };
          return null;
        }
        let tags: string[] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "faceTags") ?? "[]",
          );
          if (Array.isArray(parsed))
            tags = parsed.filter(
              (tag): tag is string => typeof tag === "string",
            );
        } catch {
          tags = [];
        }
        const single = stringOfParam(node, "faceTag");
        if (single) tags = [single];
        const indices = tags
          .map((tag) => {
            const byTag = target.faceTags.indexOf(tag);
            if (byTag >= 0) return byTag + 1;
            const numeric = Number(tag);
            return Number.isInteger(numeric) && numeric >= 1 ? numeric : -1;
          })
          .filter((index) => index >= 1);
        if (!indices.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "replaceFace: no target face selected",
          };
          return null;
        }
        const res = await replaceFaceBRep(
          target.brep,
          target.position,
          indices,
          replacement.brep,
          replacement.position,
          target.occBrep,
          replacement.occBrep,
        );
        if (!res.ok) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `replaceFace: ${res.reason}`,
          };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          position: target.position.clone(),
          occBrep: res.value.occBrep,
          planeNormal: target.planeNormal,
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "shell":
      case "hole":
      case "draft":
      case "deleteFace":
      case "thicken":
      case "thickenSurface": {
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
          const thicknessRaw = stringOfParam(node, "thicknesses");
          let thicknesses: number[] | undefined;
          if (thicknessRaw) {
            try {
              const parsed: unknown = JSON.parse(thicknessRaw);
              if (
                Array.isArray(parsed) &&
                parsed.length > 0 &&
                parsed.every(
                  (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
                )
              ) {
                thicknesses = parsed as number[];
              }
            } catch {
              thicknesses = undefined;
            }
            if (!thicknesses) {
              report[node.featureId] = {
                status: "ERROR",
                detail:
                  "shell: thicknesses must be a JSON array of positive numbers",
              };
              return null;
            }
            if (thicknesses.length !== idxs.length) {
              report[node.featureId] = {
                status: "ERROR",
                detail: `shell: thicknesses needs one value per removed face (${idxs.length}), got ${thicknesses.length}`,
              };
              return null;
            }
          }
          res = await shellBRep(
            src.brep,
            src.position,
            idxs,
            quantityOf(node, "thickness", this.scope) ?? 0.001,
            src.occBrep,
            undefined,
            {
              keepType:
                (enumOfParam(node, "keepType") as
                  | "KEEP_SHELL"
                  | "KEEP_CORE"
                  | null) ?? "KEEP_SHELL",
              ...(thicknesses ? { thicknesses } : {}),
              ...(boolOfParam(node, "curvedCap") ? { curvedCap: true } : {}),
            },
          );
        } else if (node.featureType === "draft") {
          const idxs = this.faceIndices(src, listOf(node, "faces"));
          if (!idxs.length) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "draft: no faces selected",
            };
            return null;
          }
          const neutralQs = listOf(node, "neutralFace");
          const nIdx = neutralQs.length ? this.faceIndices(src, neutralQs) : [];
          if (nIdx.length > 1) {
            report[node.featureId] = {
              status: "ERROR",
              detail:
                "draft: select one neutral face (or set an explicit origin/normal)",
            };
            return null;
          }
          const draftAngle = quantityOf(node, "angle", this.scope) ?? 0;
          if (!(draftAngle > 0) || draftAngle >= Math.PI / 2) {
            report[node.featureId] = {
              status: "ERROR",
              detail:
                "draft: angle must be greater than 0 and less than 90 degrees",
            };
            return null;
          }
          const draftMode =
            (enumOfParam(node, "draftMode") as
              | "NEUTRAL"
              | "STEP"
              | "PARTING"
              | null) ?? "NEUTRAL";
          let partingLine:
            | {
                start: { x: number; y: number; z: number };
                end: { x: number; y: number; z: number };
              }
            | undefined;
          if (draftMode === "PARTING") {
            const partingQs = listOf(node, "draftPartingEdge");
            if (partingQs.length !== 1) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "draft: parting mode needs exactly one parting edge",
              };
              return null;
            }
            const q = partingQs[0]!;
            const ref = this.resolve(q);
            const pts = ref?.snapshot
              ? pathForPrimitive(ref.snapshot, q.entityTag)
              : [];
            if (pts.length < 2) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "draft: parting edge not resolved to a sketch curve",
              };
              return null;
            }
            const start = pts[0]!;
            const end = pts[pts.length - 1]!;
            if (
              Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) <
              1e-9
            ) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "draft: parting edge has zero length",
              };
              return null;
            }
            partingLine = {
              start: {
                x: start.x - src.position.x,
                y: start.y - src.position.y,
                z: start.z - src.position.z,
              },
              end: {
                x: end.x - src.position.x,
                y: end.y - src.position.y,
                z: end.z - src.position.z,
              },
            };
          }
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
          let dir = capDir(neutralIdx);
          const explicitOrigin = stringOfParam(node, "neutralOrigin");
          const explicitNormal = stringOfParam(node, "neutralNormal");
          if (explicitOrigin && explicitNormal) {
            const op = explicitOrigin.split(",").map((x) => Number(x.trim()));
            const np = explicitNormal.split(",").map((x) => Number(x.trim()));
            const nl = Math.hypot(np[0] ?? 0, np[1] ?? 0, np[2] ?? 0);
            if (nl > 1e-12) {
              dir = {
                point: {
                  x: op[0] ?? 0,
                  y: op[1] ?? 0,
                  z: op[2] ?? 0,
                },
                normal: {
                  x: (np[0] ?? 0) / nl,
                  y: (np[1] ?? 0) / nl,
                  z: (np[2] ?? 0) / nl,
                },
              };
            }
          }
          if (!dir) {
            report[node.featureId] = {
              status: "ERROR",
              detail:
                "draft: neutral geometry unavailable (select a face or set origin/normal)",
            };
            return null;
          }
          res = await draftBRep(
            src.brep,
            src.position,
            idxs,
            draftAngle,
            dir.normal,
            dir.point,
            src.occBrep,
            undefined,
            {
              mode: draftMode,
              ...(partingLine ? { partingLine } : {}),
            },
          );
        } else if (
          node.featureType === "thicken" ||
          node.featureType === "thickenSurface"
        ) {
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
          res = await deleteFaceBRep(
            src.brep,
            src.position,
            idxs,
            src.occBrep,
            undefined,
            { mergeAdjacent: booleanParameter(node, "mergeAdjacent") },
          );
        } else {
          const centersRaw = stringOfParam(node, "centerPoints");
          let centers: { x: number; y: number; z: number }[] = [];
          try {
            centers = JSON.parse(centersRaw ?? "[]") as typeof centers;
          } catch {
            centers = [];
          }
          // Dialog point/face selections: a sketch point resolves through its
          // snapshot; a body face resolves to its mesh centroid. Legacy nodes
          // still use the JSON string above.
          let selectedFaceAxis: { x: number; y: number; z: number } | null =
            null;
          for (const q of listOf(node, "centerPoints")) {
            const out = this.resolve(q);
            if (!out) continue;
            if (out.snapshot) {
              const prim = out.snapshot.primitives.find((p) => {
                if (!p || typeof p !== "object") return false;
                const pp = p as {
                  type?: string;
                  id?: string;
                  x?: number;
                  y?: number;
                };
                return (
                  pp.type === "point" &&
                  pp.id === q.entityTag &&
                  typeof pp.x === "number" &&
                  typeof pp.y === "number"
                );
              }) as { x: number; y: number } | undefined;
              if (prim) {
                centers.push(pointToWorld(out.snapshot.plane, prim.x, prim.y));
              }
              continue;
            }
            const fi = this.tagIndex(out, "face", q.entityTag);
            if (fi >= 0) {
              const fv = out.brep.faces[fi]?.vertices ?? [];
              if (fv.length) {
                const c = fv.reduce(
                  (acc, v) => ({
                    x: acc.x + v.x / fv.length,
                    y: acc.y + v.y / fv.length,
                    z: acc.z + v.z / fv.length,
                  }),
                  { x: 0, y: 0, z: 0 },
                );
                centers.push({
                  x: c.x + out.position.x,
                  y: c.y + out.position.y,
                  z: c.z + out.position.z,
                });
                if (fv.length >= 3) {
                  let nx = 0,
                    ny = 0,
                    nz = 0;
                  for (let i = 0; i < fv.length; i++) {
                    const a = fv[i]!;
                    const b = fv[(i + 1) % fv.length]!;
                    nx += (a.y - b.y) * (a.z + b.z);
                    ny += (a.z - b.z) * (a.x + b.x);
                    nz += (a.x - b.x) * (a.y + b.y);
                  }
                  const nl = Math.hypot(nx, ny, nz);
                  if (nl > 1e-9) {
                    const n = { x: nx / nl, y: ny / nl, z: nz / nl };
                    const planar = fv.every(
                      (v) =>
                        Math.abs(
                          (v.x - c.x) * n.x +
                            (v.y - c.y) * n.y +
                            (v.z - c.z) * n.z,
                        ) < 1e-5,
                    );
                    if (planar) {
                      // Point the drill into the body from the selected face.
                      selectedFaceAxis = { x: -n.x, y: -n.y, z: -n.z };
                    }
                  }
                }
              }
            }
          }
          const uniqueCenters: typeof centers = [];
          for (const c of centers) {
            if (
              !uniqueCenters.some(
                (u) => Math.hypot(u.x - c.x, u.y - c.y, u.z - c.z) < 1e-7,
              )
            ) {
              uniqueCenters.push(c);
            }
          }
          centers = uniqueCenters;
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
          const through = booleanParameter(node, "throughAll");
          const depth = quantityOf(node, "depth", this.scope) ?? 0.05;
          const standard = (enumOfParam(node, "standard") ??
            "CUSTOM") as HoleStandard;
          const size = enumOfParam(node, "size") ?? "M6";
          const fit = (enumOfParam(node, "fit") ?? "CUSTOM") as HoleFit;
          const fitClass =
            (enumOfParam(node, "fitClass") as
              | "CLOSE"
              | "NORMAL"
              | "LOOSE"
              | null) ?? "NORMAL";
          const spec = resolveHoleSpec(standard, size, fit, fitClass);
          if (fit !== "CUSTOM" && !spec) {
            report[node.featureId] = {
              status: "ERROR",
              detail: `hole: no ${standard} table row for ${size}`,
            };
            return null;
          }
          const holeType = enumOfParam(node, "holeType") ?? "SIMPLE";
          if (holeType === "TAPPED" && !spec) {
            report[node.featureId] = {
              status: "ERROR",
              detail:
                "hole: TAPPED type needs a standard size with a clearance or tapped fit",
            };
            return null;
          }
          const tapped =
            (fit === "TAPPED" || holeType === "TAPPED") && spec !== null;
          const radius =
            spec && fit !== "CUSTOM"
              ? tapped
                ? spec.tapRadius
                : spec.radius
              : (quantityOf(node, "radius", this.scope) ?? 0.005);
          const holeOptions =
            spec && spec.taperPerLength > 0
              ? { taperPerLength: spec.taperPerLength }
              : undefined;
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
          const axisVec =
            !axisRaw && selectedFaceAxis
              ? selectedFaceAxis
              : {
                  x: axis[0] ?? 0,
                  y: axis[1] ?? 0,
                  z: axis[2] ?? -1,
                };
          if (holeType === "COUNTERBORE") {
            const cbRadius =
              quantityOf(node, "counterboreRadius", this.scope) ?? 0;
            const cbDepth =
              quantityOf(node, "counterboreDepth", this.scope) ?? 0;
            if (cbRadius <= radius) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "hole: counterbore radius must exceed hole radius",
              };
              return null;
            }
            if (cbDepth <= 0) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "hole: counterbore depth must be positive",
              };
              return null;
            }
            const counter = await holeBRep(
              src.brep,
              src.position,
              centers,
              axisVec,
              cbRadius,
              cbDepth,
              0.001,
              src.occBrep,
            );
            if (!counter.ok) {
              report[node.featureId] = {
                status: "ERROR",
                detail: counter.reason,
              };
              return null;
            }
            res = await holeBRep(
              counter.value.brep,
              src.position,
              centers,
              axisVec,
              radius,
              length,
              overdrive,
              counter.value.occBrep,
              undefined,
              holeOptions,
            );
          } else if (holeType === "COUNTERSINK") {
            res = await holeBRep(
              src.brep,
              src.position,
              centers,
              axisVec,
              radius,
              length,
              overdrive,
              src.occBrep,
              undefined,
              {
                holeType: "COUNTERSINK",
                countersinkAngleDeg:
                  ((quantityOf(node, "countersinkAngle", this.scope) ??
                    Math.PI / 2) *
                    180) /
                  Math.PI,
                ...(holeOptions ?? {}),
              },
            );
          } else {
            res = await holeBRep(
              src.brep,
              src.position,
              centers,
              axisVec,
              radius,
              length,
              overdrive,
              src.occBrep,
              undefined,
              holeOptions,
            );
          }
          if (res.ok && tapped && spec) {
            let threaded = res;
            for (const center of centers) {
              const t = await threadBRep(
                threaded.value.brep,
                src.position,
                {
                  origin: center,
                  axisDir: axisVec,
                  radius: spec.tapRadius,
                  pitch: spec.pitch,
                  height: length,
                  depth: spec.threadDepth,
                  kind: "internal",
                },
                threaded.value.occBrep,
              );
              if (!t.ok) {
                report[node.featureId] = { status: "ERROR", detail: t.reason };
                return null;
              }
              threaded = t;
            }
            res = threaded;
          }
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
        const patternType =
          enumOfParam(node, "patternType") ??
          stringOfParam(node, "patternType") ??
          "linear";
        const joinParam = node.parameters.some((p) => p.parameterId === "join");
        const join = joinParam ? booleanParameter(node, "join") : true;
        const separate = booleanParameter(node, "separate") || !join;
        if (
          patternType === "circular" ||
          patternType === "curve" ||
          patternType === "face"
        ) {
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
          const suppressedSet = new Set<number>();
          try {
            const parsed: unknown = JSON.parse(
              stringOfParam(node, "suppressedInstances") ?? "[]",
            );
            if (Array.isArray(parsed)) {
              for (const v of parsed) {
                if (typeof v === "number" && Number.isInteger(v) && v >= 1)
                  suppressedSet.add(v);
              }
            }
          } catch {
            // malformed suppression lists are ignored; the pattern still builds
          }
          if (patternType === "face") {
            const faceQs = listOf(node, "faces");
            const faceIndices = this.faceIndices(src, faceQs);
            if (!faceIndices.length) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "pattern: face mode needs at least one face selection",
              };
              return null;
            }
            const spacing = quantityOf(node, "spacing", this.scope) ?? 0;
            const spacingMode =
              enumOfParam(node, "spacingMode") ??
              stringOfParam(node, "spacingMode") ??
              "SPACING";
            const step =
              spacingMode === "EXTENT"
                ? count > 1
                  ? spacing / (count - 1)
                  : 0
                : spacingMode === "EQUAL"
                  ? count > 0
                    ? spacing / count
                    : 0
                  : spacing;
            if (count > 1 && !(step > 0)) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "pattern: face spacing must be positive for count > 1",
              };
              return null;
            }
            const dirEl = node.parameters.find(
              (p) => p.kind === "matrix" && p.parameterId === "direction",
            );
            const rawDir =
              dirEl && dirEl.kind === "matrix"
                ? dirEl.elements.slice(0, 3)
                : [1, 0, 0];
            const dl =
              Math.hypot(rawDir[0] ?? 1, rawDir[1] ?? 0, rawDir[2] ?? 0) || 1;
            const sign = booleanParameter(node, "flipDirection") ? -1 : 1;
            spec = {
              kind: "face",
              count,
              faceIndices,
              translation: {
                x: ((rawDir[0] ?? 1) / dl) * step * sign,
                y: ((rawDir[1] ?? 0) / dl) * step * sign,
                z: ((rawDir[2] ?? 0) / dl) * step * sign,
              },
              separate,
              skip: [...suppressedSet],
            };
          } else if (patternType === "curve") {
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
              separate,
              skip: [...suppressedSet],
            };
          } else {
            const angle = quantityOf(node, "angle", this.scope) ?? Math.PI * 2;
            if (count > 1 && Math.abs(angle) < 1e-9) {
              report[node.featureId] = {
                status: "ERROR",
                detail: "pattern: circular angle must be non-zero",
              };
              return null;
            }
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
              separate,
              skip: [...suppressedSet],
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
                position: one.position
                  .clone()
                  .add(
                    new THREE.Vector3(
                      v.positionOffset.x,
                      v.positionOffset.y,
                      v.positionOffset.z,
                    ),
                  ),
                edgeTags: registerEdges(v.brep.edges.length, node.featureId),
                faceTags: registerFaces(v.brep.faces.length, node.featureId),
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
            pieces.length === 1 || separate
              ? {
                  brep: pieces[0]!.brep,
                  position: pieces[0]!.position,
                  occBrep: pieces[0]!.occBrep,
                  edgeGeometry: pieces[0]!.edgeGeometry,
                  faceGeometry: pieces[0]!.faceGeometry,
                  vertexPositions: pieces[0]!.vertexPositions,
                }
              : await this.sendBooleanOp("union", pieces);
          const separateOn = separate && pieces.length > 1;
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
        const spacingMode =
          enumOfParam(node, "spacingMode") ??
          stringOfParam(node, "spacingMode") ??
          "SPACING";
        // SPACING = gap between instances; EXTENT = first-to-last span;
        // EQUAL = divide the span into `count` equal gaps from the seed.
        const step =
          spacingMode === "EXTENT"
            ? count > 1
              ? spacing / (count - 1)
              : 0
            : spacingMode === "EQUAL"
              ? count > 0
                ? spacing / count
                : 0
              : spacing;
        if (count > 1 && !(step > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "pattern: spacing/extent must be positive for count > 1",
          };
          return null;
        }
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
        const flip = booleanParameter(node, "flipDirection");
        const dir = new THREE.Vector3(dxa / len, dya / len, dza / len);
        if (flip) dir.multiplyScalar(-1);
        const suppressed = new Set<number>();
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "suppressedInstances") ?? "[]",
          );
          if (Array.isArray(parsed)) {
            for (const v of parsed) {
              if (typeof v === "number" && Number.isInteger(v) && v >= 1)
                suppressed.add(v);
            }
          }
        } catch {
          // A malformed list suppresses nothing; the pattern still rebuilds.
        }
        const offsets: number[] = [];
        for (let i = 1; i < count; i++) {
          if (!suppressed.has(i)) offsets.push(step * i);
        }
        if (booleanParameter(node, "hasSecondDirection")) {
          const count2 = Math.max(
            0,
            Math.floor(quantityOf(node, "count2", this.scope) ?? 0),
          );
          const spacing2 = quantityOf(node, "spacing2", this.scope) ?? 0;
          for (let i = 1; i <= count2; i++) offsets.push(-spacing2 * i);
        }
        const copies: {
          brep: Brep;
          position: THREE.Vector3;
          occBrep?: string | undefined;
        }[] = [];
        for (const one of srcList) {
          for (const offset of offsets) {
            const target = one.position
              .clone()
              .add(dir.clone().multiplyScalar(offset));
            copies.push({
              brep: transformBrepVertices(one.brep, one.position, target),
              position: target,
            });
          }
        }
        if (!copies.length && srcList.length === 1)
          return { ...src, featureId: node.featureId };
        if (separate) {
          const pieces: BodyOutput[] = [
            ...srcList,
            ...copies.map((c) => ({
              featureId: node.featureId,
              kind: "body" as const,
              brep: c.brep,
              position: c.position,
              edgeTags: [],
              faceTags: [],
            })),
          ];
          const primary: BodyOutput = {
            ...pieces[0]!,
            featureId: node.featureId,
            edgeTags: registerEdges(
              pieces[0]!.brep.edges.length,
              node.featureId,
            ),
            faceTags: registerFaces(
              pieces[0]!.brep.faces.length,
              node.featureId,
            ),
            additionalBodies: pieces.slice(1).map((p, i) => {
              const owner = `${node.featureId}#${i + 1}`;
              return {
                ...p,
                featureId: owner,
                edgeTags: registerEdges(p.brep.edges.length, owner),
                faceTags: registerFaces(p.brep.faces.length, owner),
              };
            }),
          };
          return primary;
        }
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
      case "surface":
      case "boundarySurface":
      case "constrainedSurface":
      case "surfaceLoft":
      case "surfaceFill":
      case "ruledSurface":
      case "surfaceOffset": {
        const bodyQ = listOf(node, "targets")[0];
        const src = bodyQ ? this.resolve(bodyQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `${node.featureType}: body not resolved`,
          };
          return null;
        }
        const kind =
          stringOfParam(node, "kind") ??
          (node.featureType === "boundarySurface"
            ? "boundary"
            : node.featureType === "constrainedSurface"
              ? "constrained"
              : node.featureType === "surfaceLoft" ||
                  node.featureType === "ruledSurface"
                ? "ruled"
                : node.featureType === "surfaceOffset"
                  ? "offset"
                  : "fill");
        if (
          kind !== "ruled" &&
          kind !== "fill" &&
          kind !== "offset" &&
          kind !== "boundary" &&
          kind !== "constrained"
        ) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "surface: unknown kind",
          };
          return null;
        }
        const opts: Parameters<typeof surfaceOpBRep>[3] = {};
        const entityQueries = kind !== "ruled" ? listOf(node, "entities") : [];
        const edgeIndicesFromQueries = (qs: ProvenanceQuery[]): number[] => {
          const out: number[] = [];
          for (const q of qs) {
            const i = this.tagIndex(src, "edge", q.entityTag);
            if (i >= 0) out.push(i + 1);
          }
          return out;
        };
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
          const edgeIdxs = edgeIndicesFromQueries(entityQueries);
          let tagsFromJson: string[] = [];
          try {
            const parsed: unknown = JSON.parse(
              stringOfParam(node, "edgeTags") ?? "[]",
            );
            if (Array.isArray(parsed))
              tagsFromJson = parsed.filter(
                (t): t is string => typeof t === "string",
              );
          } catch {
            tagsFromJson = [];
          }
          const jsonIdxs = tagsFromJson
            .map((t) => this.tagIndex(src, "edge", t) + 1)
            .filter((i) => i > 0);
          const allEdgeIdxs = [...new Set([...edgeIdxs, ...jsonIdxs])];
          const faceIdx = this.tagIndex(
            src,
            "face",
            stringOfParam(node, "faceTag") ?? "",
          );
          if (allEdgeIdxs.length) opts.edgeIndices = allEdgeIdxs;
          else if (faceIdx >= 0) opts.faceIndex = faceIdx;
          else {
            report[node.featureId] = {
              status: "ERROR",
              detail: "surface: no edges or face selected",
            };
            return null;
          }
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
      case "rib":
      case "gusset":
      case "web":
      case "boss":
      case "domeFeature": {
        return this.executeMacro(node, report);
      }
      case "coil": {
        return this.executeCoil(node, report);
      }
      case "helixCurve":
      case "fitSpline":
      case "bridgingCurve": {
        return this.executeCurve(node, report);
      }
      case "derive": {
        return this.executeDerive(node, report);
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
      case "hem": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "hem: source not resolved",
          };
          return null;
        }
        const ei = this.tagIndex(
          src,
          "edge",
          stringOfParam(node, "edgeTag") ?? "",
        );
        const json = src.brep.toJSON();
        const edge = ei >= 0 ? json.edges[ei] : undefined;
        if (!edge) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "hem: fold edge tag not resolved",
          };
          return null;
        }
        const pos = src.position;
        const p1 = {
          x: edge.start.x + pos.x,
          y: edge.start.y + pos.y,
          z: edge.start.z + pos.z,
        };
        const line = {
          x: edge.end.x - edge.start.x,
          y: edge.end.y - edge.start.y,
          z: edge.end.z - edge.start.z,
        };
        const ll = Math.hypot(line.x, line.y, line.z);
        if (ll < 1e-9) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "hem: degenerate fold line",
          };
          return null;
        }
        const u = { x: line.x / ll, y: line.y / ll, z: line.z / ll };
        const vs = json.vertices;
        const c = vs.length
          ? vs.reduce(
              (acc, q) => ({
                x: acc.x + q.x / vs.length,
                y: acc.y + q.y / vs.length,
                z: acc.z + q.z / vs.length,
              }),
              { x: 0, y: 0, z: 0 },
            )
          : { x: 0, y: 0, z: 0 };
        const mid = {
          x: (edge.start.x + edge.end.x) / 2 + pos.x,
          y: (edge.start.y + edge.end.y) / 2 + pos.y,
          z: (edge.start.z + edge.end.z) / 2 + pos.z,
        };
        const rx = mid.x - (c.x + pos.x),
          ry = mid.y - (c.y + pos.y),
          rz = mid.z - (c.z + pos.z);
        const rd = rx * u.x + ry * u.y + rz * u.z;
        let bx = rx - u.x * rd,
          by = ry - u.y * rd,
          bz = rz - u.z * rd;
        const bl = Math.hypot(bx, by, bz) || 1;
        bx /= bl;
        by /= bl;
        bz /= bl;
        const thickness = quantityOf(node, "thickness", this.scope) ?? 0.001;
        const lip = quantityOf(node, "lip", this.scope) ?? thickness * 6;
        const relief = quantityOf(node, "relief", this.scope) ?? 0;
        const res = await hemBRep(
          src.brep,
          pos,
          {
            origin: p1,
            bendDir: { x: bx, y: by, z: bz },
            bendLineDir: u,
            thickness,
            lip,
            relief,
            radius: quantityOf(node, "radius", this.scope) ?? 0,
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
      case "unfold":
      case "flatPattern": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "unfold: source not resolved",
          };
          return null;
        }
        let folds: {
          angle: number;
          length: number;
          thickness: number;
          radius?: number;
        }[] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "folds") ?? "[]",
          );
          if (Array.isArray(parsed)) folds = parsed as typeof folds;
        } catch {
          folds = [];
        }
        if (!folds.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "unfold: no fold parameters",
          };
          return null;
        }
        const verts = src.brep.toJSON().vertices;
        const ys = verts.map((q) => q.y);
        const xs = verts.map((q) => q.x);
        const zs = verts.map((q) => q.z);
        const baseY = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
        const baseX = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
        const bodyThickness = zs.length ? Math.max(...zs) - Math.min(...zs) : 0;
        let bends: FlatPatternBendInput[] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "bends") ?? "[]",
          );
          if (Array.isArray(parsed)) bends = parsed as FlatPatternBendInput[];
        } catch {
          bends = [];
        }
        if (!bends.length) {
          bends = folds.map((fold, index) => ({
            id: `fold-${index + 1}`,
            angleDeg: (Math.abs(fold.angle) * 180) / Math.PI,
            radiusMM: (fold.radius ?? 0) * 1000,
            thicknessMM: fold.thickness * 1000,
            kFactor: 0.5,
            flangeLengthMM: fold.length * 1000,
            direction: fold.angle >= 0 ? "up" : "down",
          }));
        }
        let flat = baseY;
        let width = baseX;
        let t0 = bodyThickness;
        if (bends.length) {
          const plan = computeTrueFlatPattern({
            baseLengthMM: baseY * 1000,
            baseWidthMM: baseX * 1000,
            bends,
          });
          if (!plan.ok) {
            report[node.featureId] = {
              status: "ERROR",
              detail: `unfold: ${plan.errors
                .map((issue) => `${issue.path}: ${issue.message}`)
                .join("; ")}`,
            };
            return null;
          }
          flat = plan.value.developedLengthMM / 1000;
          width = plan.value.developedWidthMM / 1000;
          t0 = bends[0]!.thicknessMM / 1000;
        }
        if (!(flat > 0) || !(width > 0) || !(t0 > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "unfold: source body has no valid flat dimensions",
          };
          return null;
        }
        const plate = buildBoxNodes(
          node.featureId,
          "Flat pattern",
          flat,
          width,
          t0,
        );
        let last: BodyOutput | null = null;
        for (const cn of plate) {
          const out = await this.execute(cn, report);
          if (out) {
            this.outputs.set(out.featureId, out);
            if (out.kind === "body") last = out;
          }
        }
        if (!last) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "unfold: flat plate build failed",
          };
          return null;
        }
        return {
          ...last,
          featureId: node.featureId,
        };
      }
      case "wrap": {
        const tgtQ = listOf(node, "targets")[0];
        const tgt = tgtQ ? this.resolve(tgtQ) : undefined;
        if (!tgt) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "wrap: target not resolved",
          };
          return null;
        }
        let polys: number[][][] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "polylines") ?? "[]",
          );
          if (Array.isArray(parsed)) polys = parsed as number[][][];
        } catch {
          polys = [];
        }
        if (polys.length < 1) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "wrap: no polylines",
          };
          return null;
        }
        const wrapMode =
          (enumOfParam(node, "operation") as
            | "CURVE"
            | "CUT"
            | "EMBOSS"
            | null) ?? "CURVE";
        const wrapDepth = quantityOf(node, "depth", this.scope) ?? 0.0005;
        const wrapWidth = quantityOf(node, "width", this.scope) ?? 0.001;
        if (wrapMode !== "CURVE" && !(wrapDepth > 0 && wrapWidth > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "wrap: cut/emboss needs positive depth and width",
          };
          return null;
        }
        const tj = tgt.brep.toJSON();
        const tpos = tgt.position;
        const aRaw = tgt.planeNormal ?? [0, 0, 1];
        const alen = Math.hypot(aRaw[0], aRaw[1], aRaw[2]) || 1;
        const a = {
          x: aRaw[0] / alen,
          y: aRaw[1] / alen,
          z: aRaw[2] / alen,
        };
        const proj = tj.vertices.map((q) => {
          const wx = q.x + tpos.x,
            wy = q.y + tpos.y,
            wz = q.z + tpos.z;
          const h = wx * a.x + wy * a.y + wz * a.z;
          return {
            h,
            r: Math.hypot(wx - a.x * h, wy - a.y * h, wz - a.z * h),
            px: wx - a.x * h,
            py: wy - a.y * h,
            pz: wz - a.z * h,
          };
        });
        const bin = 2e-4;
        const counts = new Map<number, number>();
        for (const p of proj) {
          const b = Math.round(p.r / bin);
          counts.set(b, (counts.get(b) ?? 0) + 1);
        }
        let best: [number, number] = [0, 0];
        for (const [b, cn] of counts) if (cn > best[1]) best = [b, cn];
        if (best[1] < 6) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "wrap: no cylindrical surface on target",
          };
          return null;
        }
        const radius = best[0] * bin;
        const band = proj.filter((p) => Math.abs(p.r - radius) < bin * 1.5);
        const axisPt = {
          x: band.reduce((acc, p) => acc + p.px, 0) / band.length,
          y: band.reduce((acc, p) => acc + p.py, 0) / band.length,
          z: band.reduce((acc, p) => acc + p.pz, 0) / band.length,
        };
        const hMin = Math.min(...band.map((p) => p.h));
        const origin = {
          x: axisPt.x + a.x * hMin,
          y: axisPt.y + a.y * hMin,
          z: axisPt.z + a.z * hMin,
        };
        const shifted = polys.map((pl) =>
          pl.map((row) => [Number(row[0] ?? 0), Number(row[1] ?? 0) + hMin]),
        );
        const res = await wrapCurvesBRep(
          tgt.brep,
          tpos,
          {
            axisOrigin: origin,
            axisDir: a,
            radius,
            polylines: shifted,
            operation: wrapMode,
            depth: wrapDepth,
            width: wrapWidth,
          },
          tgt.occBrep,
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
          position: tpos.clone(),
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "flange": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "flange: source not resolved",
          };
          return null;
        }
        const ei = this.tagIndex(
          src,
          "edge",
          stringOfParam(node, "edgeTag") ?? "",
        );
        const json = src.brep.toJSON();
        const edge = ei >= 0 ? json.edges[ei] : undefined;
        if (!edge) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "flange: bend edge tag not resolved",
          };
          return null;
        }
        const pos = src.position;
        const p1 = {
          x: edge.start.x + pos.x,
          y: edge.start.y + pos.y,
          z: edge.start.z + pos.z,
        };
        const p2 = {
          x: edge.end.x + pos.x,
          y: edge.end.y + pos.y,
          z: edge.end.z + pos.z,
        };
        const line = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
        const ll = Math.hypot(line.x, line.y, line.z);
        if (ll < 1e-9) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "flange: degenerate bend line",
          };
          return null;
        }
        const u = { x: line.x / ll, y: line.y / ll, z: line.z / ll };
        const vs = json.vertices;
        const c = vs.length
          ? vs.reduce(
              (acc, q) => ({
                x: acc.x + q.x / vs.length,
                y: acc.y + q.y / vs.length,
                z: acc.z + q.z / vs.length,
              }),
              { x: 0, y: 0, z: 0 },
            )
          : { x: 0, y: 0, z: 0 };
        const mid = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
          z: (p1.z + p2.z) / 2,
        };
        const rx = mid.x - (c.x + pos.x),
          ry = mid.y - (c.y + pos.y),
          rz = mid.z - (c.z + pos.z);
        const rd = rx * u.x + ry * u.y + rz * u.z;
        let bx = rx - u.x * rd,
          by = ry - u.y * rd,
          bz = rz - u.z * rd;
        const bl = Math.hypot(bx, by, bz) || 1;
        bx /= bl;
        by /= bl;
        bz /= bl;
        const angle = quantityOf(node, "angle", this.scope) ?? Math.PI / 2;
        const thickness = quantityOf(node, "thickness", this.scope) ?? 0.001;
        const relief = quantityOf(node, "relief", this.scope) ?? 0;
        const res = await flangeBRep(
          src.brep,
          pos,
          {
            origin: p1,
            bendDir: { x: bx, y: by, z: bz },
            bendLineDir: u,
            angle,
            thickness,
            relief,
            radius: quantityOf(node, "radius", this.scope) ?? 0,
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
      case "relief": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "relief: source not resolved",
          };
          return null;
        }
        const reliefType = enumOfParam(node, "reliefType") ?? "rectangular";
        if (reliefType !== "rectangular") {
          report[node.featureId] = {
            status: "ERROR",
            detail: `relief: ${reliefType} relief is not implemented`,
          };
          return null;
        }
        const width = quantityOf(node, "width", this.scope);
        const depth = quantityOf(node, "depth", this.scope);
        if (width === null || !(width > 0) || depth === null || !(depth > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "relief: width and depth must be greater than zero",
          };
          return null;
        }
        let tags: string[] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "edgeTags") ?? "[]",
          );
          if (Array.isArray(parsed))
            tags = parsed.filter(
              (tag): tag is string => typeof tag === "string",
            );
        } catch {
          tags = [];
        }
        const single = stringOfParam(node, "edgeTag");
        if (single) tags = [single];
        const json = src.brep.toJSON();
        const pos = src.position;
        const bodyVertices = json.vertices.map((vertex) => ({
          x: vertex.x + pos.x,
          y: vertex.y + pos.y,
          z: vertex.z + pos.z,
        }));
        const placement = (enumOfParam(node, "placement") ?? "auto") as
          | "auto"
          | "corners"
          | "manual";
        const tools: Brep[] = [];
        for (const tag of tags) {
          const index = this.tagIndex(src, "edge", tag);
          const edge = index >= 0 ? json.edges[index] : undefined;
          if (!edge) continue;
          tools.push(
            ...buildReliefToolBreps(
              bodyVertices,
              {
                x: edge.start.x + pos.x,
                y: edge.start.y + pos.y,
                z: edge.start.z + pos.z,
              },
              {
                x: edge.end.x + pos.x,
                y: edge.end.y + pos.y,
                z: edge.end.z + pos.z,
              },
              width,
              depth,
              placement,
            ),
          );
        }
        if (!tools.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "relief: no valid bend edge selected",
          };
          return null;
        }
        const merged = await this.sendBooleanOp("difference", [
          { brep: src.brep, position: pos, occBrep: src.occBrep },
          ...tools.map((brep) => ({
            brep,
            position: new THREE.Vector3(0, 0, 0),
          })),
        ]);
        return {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          position: merged.position,
          occBrep: merged.occBrep,
          planeNormal: src.planeNormal,
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
          vertexPositions: merged.vertexPositions,
        };
      }
      case "corner": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "corner: source not resolved",
          };
          return null;
        }
        const cornerType = enumOfParam(node, "cornerType") ?? "closed";
        if (cornerType === "overlap" || cornerType === "underlap") {
          report[node.featureId] = {
            status: "ERROR",
            detail: `corner: ${cornerType} corner treatment is not implemented`,
          };
          return null;
        }
        let tags: string[] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "edgeTags") ?? "[]",
          );
          if (Array.isArray(parsed))
            tags = parsed.filter(
              (tag): tag is string => typeof tag === "string",
            );
        } catch {
          tags = [];
        }
        const single = stringOfParam(node, "edgeTag");
        if (single) tags = [single];
        const indices = tags
          .map((tag) => this.tagIndex(src, "edge", tag))
          .filter((index) => index >= 0)
          .map((index) => index + 1);
        if (!indices.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "corner: no valid corner edge selected",
          };
          return null;
        }
        const gap = quantityOf(node, "gap", this.scope) ?? 0.0005;
        if (!(gap > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "corner: gap must be greater than zero",
          };
          return null;
        }
        const res =
          cornerType === "closed"
            ? await filletBRep(
                src.brep,
                src.position,
                indices,
                gap,
                src.occBrep,
                undefined,
                { cornerRadius: gap },
              )
            : await chamferBRep(
                src.brep,
                src.position,
                indices,
                gap,
                src.occBrep,
              );
        if (!res.ok) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `corner: ${res.reason}`,
          };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          position: src.position.clone(),
          occBrep: res.value.occBrep,
          planeNormal: src.planeNormal,
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "frame":
      case "frameGroup": {
        type FrameSegment = {
          id?: string;
          startMM?: [number, number, number];
          endMM?: [number, number, number];
          profileId?: string;
        };
        const raw =
          stringOfParam(node, "groups") ?? stringOfParam(node, "segments");
        let segments: FrameSegment[] = [];
        if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const groups = parsed.filter(
                (entry): entry is { segments: FrameSegment[] } =>
                  !!entry &&
                  typeof entry === "object" &&
                  Array.isArray((entry as { segments?: unknown }).segments),
              );
              segments = groups.length
                ? groups.flatMap((group) => group.segments)
                : (parsed as FrameSegment[]);
            }
          } catch {
            segments = [];
          }
        }
        if (!segments.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `${node.featureType}: no frame segments resolved`,
          };
          return null;
        }
        const defaultProfile =
          stringOfParam(node, "profile") ?? "square-40x40x3";
        const bodies: BodyOutput[] = [];
        const frameWall = quantityOf(node, "wall", this.scope);
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i]!;
          if (!segment.startMM || !segment.endMM) continue;
          const childId = `${node.featureId}:S${i}`;
          const child: ScadgenFeatureNode = {
            featureId: childId,
            featureType: "structuralMember",
            name: `${node.name} member ${i + 1}`,
            namespace: "",
            parameters: [
              {
                kind: "string",
                parameterId: "start",
                value: JSON.stringify({
                  x: segment.startMM[0] / 1000,
                  y: segment.startMM[1] / 1000,
                  z: segment.startMM[2] / 1000,
                }),
              },
              {
                kind: "string",
                parameterId: "end",
                value: JSON.stringify({
                  x: segment.endMM[0] / 1000,
                  y: segment.endMM[1] / 1000,
                  z: segment.endMM[2] / 1000,
                }),
              },
              {
                kind: "string",
                parameterId: "profile",
                value: segment.profileId ?? defaultProfile,
              },
              ...(frameWall === null
                ? []
                : [
                    {
                      kind: "quantity" as const,
                      parameterId: "wall",
                      value: frameWall,
                      units: "m",
                      expression: `${(frameWall * 1000).toFixed(3)} mm`,
                    },
                  ]),
            ],
            subFeatures: [],
            suppressed: false,
          };
          const temp: ExecReport = {};
          const body = await this.execute(child, temp);
          if (!body) {
            report[node.featureId] = {
              status: "ERROR",
              detail: `${node.featureType}: member ${i + 1} failed: ${
                temp[childId]?.detail ?? "unknown error"
              }`,
            };
            return null;
          }
          bodies.push(body);
        }
        if (!bodies.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `${node.featureType}: no valid frame members`,
          };
          return null;
        }
        const retag = (body: BodyOutput, id: string): BodyOutput => ({
          ...body,
          featureId: id,
          edgeTags: registerEdges(body.brep.edges.length, id),
          faceTags: registerFaces(body.brep.faces.length, id),
        });
        if (boolOfParam(node, "merge") && bodies.length > 1) {
          const merged = await this.sendBooleanOp(
            "union",
            bodies.map((body) => ({
              brep: body.brep,
              position: body.position,
              occBrep: body.occBrep,
            })),
          );
          return {
            featureId: node.featureId,
            kind: "body",
            brep: merged.brep,
            position: merged.position,
            occBrep: merged.occBrep,
            edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
            faceTags: registerFaces(merged.brep.faces.length, node.featureId),
            vertexPositions: merged.vertexPositions,
          };
        }
        const primary = retag(bodies[0]!, node.featureId);
        return {
          ...primary,
          additionalBodies: bodies
            .slice(1)
            .map((body, i) => retag(body, `${node.featureId}#${i + 1}`)),
        };
      }
      case "structuralMember": {
        const parsePoint = (raw: string | null) => {
          if (!raw) return null;
          try {
            const parsed: unknown = JSON.parse(raw);
            if (
              parsed &&
              typeof parsed === "object" &&
              ["x", "y", "z"].every(
                (key) =>
                  typeof (parsed as Record<string, unknown>)[key] === "number",
              )
            ) {
              const p = parsed as { x: number; y: number; z: number };
              return { x: p.x, y: p.y, z: p.z };
            }
          } catch {
            /* fall through to comma form */
          }
          const values = raw.split(",").map((value) => Number(value.trim()));
          return values.length === 3 && values.every(Number.isFinite)
            ? { x: values[0]!, y: values[1]!, z: values[2]! }
            : null;
        };
        let start = parsePoint(stringOfParam(node, "start"));
        let end = parsePoint(stringOfParam(node, "end"));
        if (!start || !end) {
          const rawSegments = stringOfParam(node, "segments");
          if (rawSegments) {
            try {
              const parsed = JSON.parse(rawSegments) as Array<{
                startMM?: [number, number, number];
                endMM?: [number, number, number];
              }>;
              const segment = parsed[0];
              if (segment?.startMM && segment.endMM) {
                start = {
                  x: segment.startMM[0],
                  y: segment.startMM[1],
                  z: segment.startMM[2],
                };
                end = {
                  x: segment.endMM[0],
                  y: segment.endMM[1],
                  z: segment.endMM[2],
                };
              }
            } catch {
              /* named error below */
            }
          }
        }
        if (!start || !end) {
          const rawPath = stringOfParam(node, "pathPoints");
          if (rawPath) {
            try {
              const parsed = JSON.parse(rawPath) as Array<{
                x?: number;
                y?: number;
                z?: number;
              }>;
              if (parsed.length >= 2 && parsed[0] && parsed[1]) {
                start = {
                  x: parsed[0].x ?? 0,
                  y: parsed[0].y ?? 0,
                  z: parsed[0].z ?? 0,
                };
                end = {
                  x: parsed[1].x ?? 0,
                  y: parsed[1].y ?? 0,
                  z: parsed[1].z ?? 0,
                };
              }
            } catch {
              /* named error below */
            }
          }
        }
        if (!start || !end) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "structuralMember: path not resolved",
          };
          return null;
        }
        const profileId =
          stringOfParam(node, "profile") ??
          stringOfParam(node, "profileId") ??
          "square-40x40x3";
        const profileShape = profileId.split("-")[0]?.toLowerCase() ?? "";
        if (profileShape && !["square", "rect", "bar"].includes(profileShape)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `structuralMember: ${profileShape} profiles are not implemented`,
          };
          return null;
        }
        const dims = parseFrameProfileId(profileId);
        const width = quantityOf(node, "width", this.scope) ?? dims?.width;
        const height = quantityOf(node, "height", this.scope) ?? dims?.height;
        if (!width || !height || !(width > 0) || !(height > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "structuralMember: profile width and height are required",
          };
          return null;
        }
        const wall =
          quantityOf(node, "wall", this.scope) ??
          dims?.wall ??
          Math.min(width, height) * 0.1;
        if (!(wall >= 0) || (wall > 0 && wall >= Math.min(width, height) / 2)) {
          report[node.featureId] = {
            status: "ERROR",
            detail:
              "structuralMember: wall must be zero (solid) or less than half the smallest profile dimension",
          };
          return null;
        }
        const rotation = quantityOf(node, "rotation", this.scope) ?? 0;
        const profile = buildFrameMemberProfile(
          start,
          end,
          width,
          height,
          rotation,
        );
        if (!profile) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "structuralMember: zero-length or invalid profile",
          };
          return null;
        }
        const extruded = await extrudeBRep(
          profile.brep,
          profile.length,
          1,
          profile.direction,
        );
        if (!extruded.ok) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `structuralMember: ${extruded.reason}`,
          };
          return null;
        }
        let brep = extruded.value.brep;
        let position = new THREE.Vector3(
          extruded.value.positionOffset.x,
          extruded.value.positionOffset.y,
          extruded.value.positionOffset.z,
        );
        let occBrep = extruded.value.occBrep;
        let vertexPositions = extruded.value.vertexPositions;
        if (wall > 0) {
          const along = brep.faces
            .map((face, index) => {
              const count = face.vertices.length || 1;
              const value =
                face.vertices.reduce(
                  (sum, vertex) =>
                    sum +
                    vertex.x * profile.direction.x +
                    vertex.y * profile.direction.y +
                    vertex.z * profile.direction.z,
                  0,
                ) / count;
              return { index, value };
            })
            .sort((a, b) => a.value - b.value);
          const endFaces = [
            along[0]?.index,
            along[along.length - 1]?.index,
          ].filter((index): index is number => index !== undefined);
          if (endFaces.length < 2) {
            report[node.featureId] = {
              status: "ERROR",
              detail:
                "structuralMember: extruded solid has no end faces to shell",
            };
            return null;
          }
          const shelled = await shellBRep(
            brep,
            position,
            endFaces,
            wall,
            occBrep,
            undefined,
            { keepType: "KEEP_SHELL" },
          );
          if (!shelled.ok) {
            report[node.featureId] = {
              status: "ERROR",
              detail: `structuralMember: ${shelled.reason}`,
            };
            return null;
          }
          brep = shelled.value.brep;
          position = new THREE.Vector3(
            shelled.value.positionOffset.x,
            shelled.value.positionOffset.y,
            shelled.value.positionOffset.z,
          );
          occBrep = shelled.value.occBrep;
          vertexPositions = shelled.value.vertexPositions;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep,
          position,
          occBrep,
          edgeTags: registerEdges(brep.edges.length, node.featureId),
          faceTags: registerFaces(brep.faces.length, node.featureId),
          vertexPositions,
        };
      }
      case "louver": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "louver: source not resolved",
          };
          return null;
        }
        const faceTag = stringOfParam(node, "faceTag") ?? "";
        const faceIndex = this.tagIndex(src, "face", faceTag);
        const face = faceIndex >= 0 ? src.brep.faces[faceIndex] : undefined;
        if (!face?.vertices.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "louver: selected face not resolved",
          };
          return null;
        }
        const length = quantityOf(node, "length", this.scope);
        const width = quantityOf(node, "width", this.scope);
        const depth = quantityOf(node, "depth", this.scope);
        const spacing = quantityOf(node, "spacing", this.scope) ?? 0;
        const angle = quantityOf(node, "angle", this.scope) ?? Math.PI / 4;
        const count = Math.round(quantityOf(node, "count", this.scope) ?? 1);
        if (
          length === null ||
          width === null ||
          depth === null ||
          !(length > 0) ||
          !(width > 0) ||
          !(depth > 0) ||
          count < 1
        ) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "louver: length, width, depth and count must be positive",
          };
          return null;
        }
        const pos = src.position;
        const bodyVertices = src.brep.vertices.map((vertex) => ({
          x: vertex.x + pos.x,
          y: vertex.y + pos.y,
          z: vertex.z + pos.z,
        }));
        const faceVertices = face.vertices.map((vertex) => ({
          x: vertex.x + pos.x,
          y: vertex.y + pos.y,
          z: vertex.z + pos.z,
        }));
        const tools = buildLouverTools(
          bodyVertices,
          faceVertices,
          length,
          width,
          depth,
          angle,
          count,
          spacing,
        );
        if (!tools.cutters.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "louver: selected face produced no valid louver tools",
          };
          return null;
        }
        const cut = await this.sendBooleanOp("difference", [
          { brep: src.brep, position: pos, occBrep: src.occBrep },
          ...tools.cutters.map((brep) => ({
            brep,
            position: new THREE.Vector3(0, 0, 0),
          })),
        ]);
        const merged = tools.tabs.length
          ? await this.sendBooleanOp("union", [
              {
                brep: cut.brep,
                position: cut.position,
                occBrep: cut.occBrep,
              },
              ...tools.tabs.map((brep) => ({
                brep,
                position: new THREE.Vector3(0, 0, 0),
              })),
            ])
          : cut;
        return {
          featureId: node.featureId,
          kind: "body",
          brep: merged.brep,
          position: merged.position,
          occBrep: merged.occBrep,
          planeNormal: src.planeNormal,
          edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
          faceTags: registerFaces(merged.brep.faces.length, node.featureId),
          vertexPositions: merged.vertexPositions,
        };
      }
      case "edgeFlange":
      case "bend": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `${node.featureType}: source not resolved`,
          };
          return null;
        }
        const json = src.brep.toJSON();
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
        const single = stringOfParam(node, "edgeTag");
        if (single) tags = [single];
        const edgeData = tags.map((tag) => {
          const index = this.tagIndex(src, "edge", tag);
          const edge = index >= 0 ? json.edges[index] : undefined;
          if (!edge) return null;
          const pos = src.position;
          const p1 = {
            x: edge.start.x + pos.x,
            y: edge.start.y + pos.y,
            z: edge.start.z + pos.z,
          };
          const p2 = {
            x: edge.end.x + pos.x,
            y: edge.end.y + pos.y,
            z: edge.end.z + pos.z,
          };
          const line = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
          const ll = Math.hypot(line.x, line.y, line.z);
          if (ll < 1e-9) return null;
          const u = { x: line.x / ll, y: line.y / ll, z: line.z / ll };
          const vs = json.vertices;
          const c = vs.length
            ? vs.reduce(
                (acc, q) => ({
                  x: acc.x + q.x / vs.length,
                  y: acc.y + q.y / vs.length,
                  z: acc.z + q.z / vs.length,
                }),
                { x: 0, y: 0, z: 0 },
              )
            : { x: 0, y: 0, z: 0 };
          const mid = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2,
            z: (p1.z + p2.z) / 2,
          };
          const rx = mid.x - (c.x + pos.x);
          const ry = mid.y - (c.y + pos.y);
          const rz = mid.z - (c.z + pos.z);
          const rd = rx * u.x + ry * u.y + rz * u.z;
          let bx = rx - u.x * rd;
          let by = ry - u.y * rd;
          let bz = rz - u.z * rd;
          const bl = Math.hypot(bx, by, bz) || 1;
          bx /= bl;
          by /= bl;
          bz /= bl;
          return { p1, u, b: { x: bx, y: by, z: bz }, tag };
        });
        if (!edgeData.length || edgeData.some((edge) => !edge)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `${node.featureType}: no valid edges selected`,
          };
          return null;
        }
        let brep = src.brep;
        let occBrep = src.occBrep;
        const angle = quantityOf(node, "angle", this.scope) ?? Math.PI / 2;
        const thickness = quantityOf(node, "thickness", this.scope) ?? 0.0015;
        const relief = quantityOf(node, "relief", this.scope) ?? 0;
        const radius = quantityOf(node, "radius", this.scope) ?? 0;
        const length = quantityOf(node, "length", this.scope);
        for (const edge of edgeData) {
          if (!edge) continue;
          const res = await flangeBRep(
            brep,
            src.position,
            {
              origin: edge.p1,
              bendDir: edge.b,
              bendLineDir: edge.u,
              angle,
              thickness,
              relief,
              ...(length !== null && length > 0 ? { length } : {}),
              radius,
            },
            occBrep,
          );
          if (!res.ok) {
            report[node.featureId] = {
              status: "ERROR",
              detail: `${node.featureType}: ${res.reason}`,
            };
            return null;
          }
          brep = res.value.brep;
          occBrep = res.value.occBrep;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep,
          occBrep,
          position: src.position.clone(),
          planeNormal: src.planeNormal,
          edgeTags: registerEdges(brep.edges.length, node.featureId),
          faceTags: registerFaces(brep.faces.length, node.featureId),
        };
      }
      case "featurePattern": {
        let chain: ScadgenFeatureNode[] = [];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "chain") ?? "[]",
          );
          if (Array.isArray(parsed)) chain = parsed as ScadgenFeatureNode[];
        } catch {
          chain = [];
        }
        if (!chain.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "featurePattern: empty chain",
          };
          return null;
        }
        const aRaw = (stringOfParam(node, "axis") ?? "1,0,0")
          .split(",")
          .map((x) => Number(x.trim()));
        const alen = Math.hypot(aRaw[0] ?? 1, aRaw[1] ?? 0, aRaw[2] ?? 0) || 1;
        const ax = {
          x: (aRaw[0] ?? 1) / alen,
          y: (aRaw[1] ?? 0) / alen,
          z: (aRaw[2] ?? 0) / alen,
        };
        const spacing = quantityOf(node, "spacing", this.scope) ?? 0;
        const count = Math.round(quantityOf(node, "count", this.scope) ?? 1);
        const spacingMode =
          enumOfParam(node, "spacingMode") ??
          stringOfParam(node, "spacingMode") ??
          "SPACING";
        const step =
          spacingMode === "EXTENT"
            ? count > 1
              ? spacing / (count - 1)
              : 0
            : spacingMode === "EQUAL"
              ? count > 0
                ? spacing / count
                : 0
              : spacing;
        if (!(step > 0 && count >= 2 && count <= 50)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "featurePattern: spacing/extent>0, count 2..50 required",
          };
          return null;
        }
        const suppressed = new Set<number>();
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "suppressedInstances") ?? "[]",
          );
          if (Array.isArray(parsed)) {
            for (const v of parsed) {
              if (typeof v === "number" && Number.isInteger(v) && v >= 1)
                suppressed.add(v);
            }
          }
        } catch {
          // malformed suppression lists are ignored; the pattern still builds
        }
        const bodies: BodyOutput[] = [];
        for (let k = 1; k < count; k++) {
          if (suppressed.has(k)) continue;
          const clones = cloneFeatureNodes(chain, `_p${k}`, [
            ax.x * step * k,
            ax.y * step * k,
            ax.z * step * k,
          ]);
          let last: BodyOutput | null = null;
          for (const cn of clones) {
            const out = await this.execute(cn, report);
            if (out) {
              this.outputs.set(out.featureId, out);
              if (out.kind === "body") last = out;
            }
          }
          if (last) bodies.push(last);
        }
        if (!bodies.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail:
              "featurePattern: no body produced (all instances suppressed?)",
          };
          return null;
        }
        const join = booleanParameter(node, "join");
        if (join) {
          const sourceId = chain[chain.length - 1]?.featureId;
          const source = sourceId ? this.outputs.get(sourceId) : undefined;
          const pieces = source ? [source, ...bodies] : bodies;
          const merged = await this.sendBooleanOp("union", pieces);
          return {
            featureId: node.featureId,
            kind: "body",
            brep: merged.brep,
            position: merged.position,
            edgeTags: registerEdges(merged.brep.edges.length, node.featureId),
            faceTags: registerFaces(merged.brep.faces.length, node.featureId),
            ...(merged.occBrep !== undefined
              ? { occBrep: merged.occBrep }
              : {}),
            ...(merged.vertexPositions !== undefined
              ? { vertexPositions: merged.vertexPositions }
              : {}),
          };
        }
        const primary: BodyOutput = {
          ...bodies[0]!,
          featureId: node.featureId,
          additionalBodies: bodies.slice(1).map((b, i) => ({
            ...b,
            featureId: `${node.featureId}#${i + 1}`,
            edgeTags: registerEdges(
              b.brep.edges.length,
              `${node.featureId}#${i + 1}`,
            ),
            faceTags: registerFaces(
              b.brep.faces.length,
              `${node.featureId}#${i + 1}`,
            ),
          })),
        };
        const owned = [
          primary,
          ...bodies.slice(1).map((b, i) => ({
            ...b,
            featureId: `${node.featureId}#${i + 1}`,
            edgeTags: registerEdges(
              b.brep.edges.length,
              `${node.featureId}#${i + 1}`,
            ),
            faceTags: registerFaces(
              b.brep.faces.length,
              `${node.featureId}#${i + 1}`,
            ),
          })),
        ];
        for (const b of owned) this.outputs.set(b.featureId, b);
        this.bodySets.set(node.featureId, owned);
        return primary;
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
        const endChamfer =
          boolOfParam(node, "chamferEnds") === false
            ? 0
            : Math.min(spec.pitch * 0.35, spec.depth * 0.9, tHeight * 0.1);
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
            helical: boolOfParam(node, "helical"),
            endChamfer,
            cosmetic: boolOfParam(node, "cosmetic"),
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
      case "fastener":
      case "screwHole": {
        // Fastener: one sketch profile -> revolve 360deg -> optional thread.
        // The sketch carries the merged head+shank (or bore) outline in the
        // (x=radial, y=axial) plane. The revolve axis is the line `axl`
        // (x=0, spanning the profile). We revolve around that axis (the bolt
        // axis) to produce the body, then, if the node has a `thread` child
        // in subFeatures, apply it to the top surface band.
        const srcQ = listOf(node, "entities")[0];
        const axisQ = listOf(node, "axis")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src?.snapshot) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "fastener: profile not resolved",
          };
          return null;
        }
        const axis = axisFromSnapshot(src.snapshot, axisQ?.entityTag ?? "axl");
        if (!axis) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "fastener: axis unresolvable",
          };
          return null;
        }
        // Revolve the merged profile 360deg around the bolt axis.
        const rev = await revolveBRep(
          src.brep,
          src.position,
          axis.origin,
          axis.dir,
          Math.PI * 2,
          src.occBrep,
        );
        if (!rev.ok) {
          report[node.featureId] = {
            status: "ERROR",
            detail: `fastener: ${rev.reason}`,
          };
          return null;
        }
        const primary: BodyOutput = {
          featureId: node.featureId,
          kind: "body",
          brep: rev.value.brep,
          occBrep: rev.value.occBrep,
          position: src.position
            .clone()
            .add(
              new THREE.Vector3(
                rev.value.positionOffset.x,
                rev.value.positionOffset.y,
                rev.value.positionOffset.z,
              ),
            ),
          planeNormal: [axis.dir.x, axis.dir.y, axis.dir.z],
          edgeTags: registerEdges(rev.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(rev.value.brep.faces.length, node.featureId),
          edgeGeometry: rev.value.edgeGeometry,
          faceGeometry: rev.value.faceGeometry,
          vertexPositions: rev.value.vertexPositions,
        };

        // If a thread child (sub-features "thread") is present, apply it.
        const threadChild = node.subFeatures.find(
          (c) => c.featureType === "thread",
        );
        if (threadChild) {
          const standard = (stringOfParam(threadChild, "standard") ??
            "iso") as ThreadStandard;
          const size = stringOfParam(threadChild, "size") ?? "M6";
          const mode = (stringOfParam(threadChild, "mode") ?? "coarse") as
            | "coarse"
            | "fine";
          const kind = (stringOfParam(threadChild, "kind") ?? "external") as
            | "external"
            | "internal";
          const eng = quantityOf(threadChild, "engagement", this.scope) ?? 1;
          let spec: ThreadSpec;
          try {
            spec = resolveThread(standard, size, mode, eng);
          } catch (e) {
            report[node.featureId] = {
              status: "ERROR",
              detail: `fastener: thread ${e}`,
            };
            return null;
          }
          const aRaw = primary.planeNormal ?? [0, 0, 0];
          const alen = Math.hypot(aRaw[0], aRaw[1], aRaw[2]) || 1;
          const a = {
            x: aRaw[0] / alen,
            y: aRaw[1] / alen,
            z: aRaw[2] / alen,
          };
          const pos = primary.position;
          const worldV = primary.brep.toJSON().vertices.map((q) => ({
            x: q.x + pos.x,
            y: q.y + pos.y,
            z: q.z + pos.z,
          }));
          const proj = worldV.map((q) => {
            const h = q.x * a.x + q.y * a.y + q.z * a.z;
            const px = q.x - a.x * h,
              py = q.y - a.y * h,
              pz = q.z - a.z * h;
            return { h, r: Math.hypot(px, py, pz), px, py, pz };
          });
          const bin = Math.max(1e-5, spec.pitch * 0.15);
          const counts = new Map<number, number>();
          for (const { r } of proj) {
            const b = Math.round(r / bin);
            counts.set(b, (counts.get(b) ?? 0) + 1);
          }
          let best: [number, number] = [0, 0];
          for (const [b, c] of counts) if (c > best[1]) best = [b, c];
          if (best[1] >= Math.max(6, proj.length * 0.2)) {
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
            if (tHeight >= spec.pitch) {
              const endChamfer =
                boolOfParam(node, "chamferEnds") === false
                  ? 0
                  : Math.min(
                      spec.pitch * 0.35,
                      spec.depth * 0.9,
                      tHeight * 0.1,
                    );
              const tr = await threadBRep(
                primary.brep,
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
                  endChamfer,
                  cosmetic: boolOfParam(node, "cosmetic"),
                },
                primary.occBrep,
              );
              if (tr.ok) {
                primary.brep = tr.value.brep;
                primary.occBrep = tr.value.occBrep;
                primary.edgeTags = registerEdges(
                  tr.value.brep.edges.length,
                  node.featureId,
                );
                primary.faceTags = registerFaces(
                  tr.value.brep.faces.length,
                  node.featureId,
                );
                primary.edgeGeometry = tr.value.edgeGeometry;
                primary.faceGeometry = tr.value.faceGeometry;
                primary.vertexPositions = tr.value.vertexPositions;
              }
            }
          }
        }
        return primary;
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
        const factors = node.parameters.find(
          (p) => p.kind === "matrix" && p.parameterId === "factors",
        );
        const axisFactors =
          factors && factors.kind === "matrix" ? factors.elements : null;
        const fx = axisFactors?.[0] ?? f;
        const fy = axisFactors?.[1] ?? f;
        const fz = axisFactors?.[2] ?? f;
        if (f <= 0 || fx <= 0 || fy <= 0 || fz <= 0) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "scale: factors must be > 0",
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
          x: ox + (q.x - ox) * fx,
          y: oy + (q.y - oy) * fy,
          z: oz + (q.z - oz) * fz,
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
      case "transform": {
        const srcQ = listOf(node, "entities")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "transform: source not resolved",
          };
          return null;
        }
        const transformType =
          (enumOfParam(node, "transformType") as
            | "MOVE"
            | "ROTATE"
            | "COPY"
            | null) ?? "MOVE";
        const tRaw = (stringOfParam(node, "translation") ?? "0,0,0")
          .split(",")
          .map((x) => Number(x.trim()));
        const tx = tRaw[0] ?? 0;
        const ty = tRaw[1] ?? 0;
        const tz = tRaw[2] ?? 0;
        if (![tx, ty, tz].every(Number.isFinite)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "transform: translation must be numeric x,y,z",
          };
          return null;
        }
        const matrix = new THREE.Matrix4();
        if (transformType === "ROTATE") {
          const aRaw = (stringOfParam(node, "rotationAxis") ?? "0,0,1")
            .split(",")
            .map((x) => Number(x.trim()));
          const axis = new THREE.Vector3(
            aRaw[0] ?? 0,
            aRaw[1] ?? 0,
            aRaw[2] ?? 1,
          );
          if (axis.lengthSq() < 1e-18) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "transform: rotation axis is zero",
            };
            return null;
          }
          const angle = quantityOf(node, "rotationAngle", this.scope) ?? 0;
          if (!Number.isFinite(angle) || Math.abs(angle) < 1e-12) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "transform: rotation angle must be non-zero",
            };
            return null;
          }
          axis.normalize();
          const rot = new THREE.Matrix4().makeRotationAxis(axis, angle);
          const toOrigin = new THREE.Matrix4().makeTranslation(
            -src.position.x,
            -src.position.y,
            -src.position.z,
          );
          const back = new THREE.Matrix4().makeTranslation(
            src.position.x,
            src.position.y,
            src.position.z,
          );
          matrix.multiplyMatrices(back, rot).multiply(toOrigin);
        }
        matrix.multiply(new THREE.Matrix4().makeTranslation(tx, ty, tz));
        const res = await transformBRep(
          src.brep,
          src.position,
          matrix.elements,
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
          position: src.position
            .clone()
            .add(
              new THREE.Vector3(
                res.value.positionOffset.x,
                res.value.positionOffset.y,
                res.value.positionOffset.z,
              ),
            ),
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
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
        const faceTags = [
          stringOfParam(node, "faceTag") ?? "",
          ...listOf(node, "faces").map((q) => q.entityTag),
        ].filter(Boolean);
        const faceIndices = [
          ...new Set(
            faceTags
              .map((t) => this.tagIndex(src, "face", t))
              .filter((i) => i >= 0),
          ),
        ];
        const fi = faceIndices[0] ?? -1;
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
          undefined,
          {
            faceIndices,
            extendNeighbors: booleanParameter(node, "extendNeighbors"),
          },
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
      case "solidToSurface": {
        const bodyQ = listOf(node, "targets")[0] ?? listOf(node, "entities")[0];
        const source = bodyQ ? this.resolve(bodyQ) : undefined;
        if (!source) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "solidToSurface: solid body not resolved",
          };
          return null;
        }
        const faceTags = [
          stringOfParam(node, "faceTag") ?? "",
          ...listOf(node, "faces").map((query) => query.entityTag),
        ].filter(Boolean);
        const faceIndices = [
          ...new Set(
            faceTags
              .map((tag) => this.tagIndex(source, "face", tag))
              .filter((index) => index >= 0),
          ),
        ];
        if (!faceTags.length || faceIndices.length !== new Set(faceTags).size) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "solidToSurface: select at least one resolved face",
          };
          return null;
        }
        const tolerance = quantityOf(node, "tolerance", this.scope) ?? 1e-6;
        const res = await sewBReps(
          [
            {
              brep: source.brep,
              position: source.position,
              ...(source.occBrep !== undefined
                ? { occBrep: source.occBrep }
                : {}),
              faceIndices,
            },
          ],
          {
            tolerance,
            makeSolid: false,
            extractShell: true,
            mergeFaces: false,
          },
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
          position: new THREE.Vector3(
            res.value.positionOffset.x,
            res.value.positionOffset.y,
            res.value.positionOffset.z,
          ),
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "extendSurface": {
        const bodyQ = listOf(node, "targets")[0] ?? listOf(node, "entities")[0];
        const source = bodyQ ? this.resolve(bodyQ) : undefined;
        if (!source) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "extendSurface: surface body not resolved",
          };
          return null;
        }
        const mode =
          enumOfParam(node, "mode") ??
          enumOfParam(node, "continuity") ??
          stringOfParam(node, "mode") ??
          stringOfParam(node, "continuity") ??
          "linear";
        if (mode !== "linear" && mode !== "G0") {
          report[node.featureId] = {
            status: "ERROR",
            detail: `extendSurface: ${mode} continuation is not implemented; use linear`,
          };
          return null;
        }
        const edgeTags = [
          ...listOf(node, "edges").map((query) => query.entityTag),
          ...listOf(node, "entities").map((query) => query.entityTag),
        ];
        try {
          const parsed: unknown = JSON.parse(
            stringOfParam(node, "edgeTags") ?? "[]",
          );
          if (Array.isArray(parsed))
            edgeTags.push(
              ...parsed.filter((tag): tag is string => typeof tag === "string"),
            );
        } catch {
          // No JSON edge list: selections above still count.
        }
        const uniqueTags = [...new Set(edgeTags)];
        const edgeIndices = [
          ...new Set(
            uniqueTags
              .map((tag) => this.tagIndex(source, "edge", tag) + 1)
              .filter((index) => index > 0),
          ),
        ];
        if (!uniqueTags.length || edgeIndices.length !== uniqueTags.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "extendSurface: select at least one resolved boundary edge",
          };
          return null;
        }
        const distance = quantityOf(node, "distance", this.scope);
        if (distance === null || !(distance > 0)) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "extendSurface: distance must be greater than zero",
          };
          return null;
        }
        const tolerance = quantityOf(node, "tolerance", this.scope) ?? 1e-6;
        const res = await extendSurfaceBRep(
          source.brep,
          source.position,
          edgeIndices,
          distance,
          source.occBrep,
          undefined,
          { mode: "linear", tolerance },
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
          position: new THREE.Vector3(
            res.value.positionOffset.x,
            res.value.positionOffset.y,
            res.value.positionOffset.z,
          ),
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "convertSurface":
      case "conversion": {
        const kind =
          enumOfParam(node, "conversionKind") ??
          stringOfParam(node, "conversionKind") ??
          "surfaceToSolid";
        if (kind === "solidToSurface") {
          report[node.featureId] = {
            status: "ERROR",
            detail:
              "conversion: use the dedicated solidToSurface feature for face extraction",
          };
          return null;
        }
        const sourceQ = listOf(node, "targets")[0];
        const source = sourceQ ? this.resolve(sourceQ) : undefined;
        if (!source) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "convertSurface: source surface not resolved",
          };
          return null;
        }
        const tolerance = quantityOf(node, "tolerance", this.scope) ?? 1e-6;
        const res = await sewBReps(
          [
            {
              brep: source.brep,
              position: source.position,
              ...(source.occBrep !== undefined
                ? { occBrep: source.occBrep }
                : {}),
            },
          ],
          { tolerance, makeSolid: true },
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
          position: new THREE.Vector3(
            res.value.positionOffset.x,
            res.value.positionOffset.y,
            res.value.positionOffset.z,
          ),
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "knitSurface": {
        const sources = listOf(node, "targets")
          .map((query) => this.resolve(query))
          .filter(
            (source): source is NonNullable<typeof source> =>
              source !== undefined,
          )
          .map((source) => ({
            brep: source.brep,
            position: source.position,
            ...(source.occBrep !== undefined
              ? { occBrep: source.occBrep }
              : {}),
          }));
        if (sources.length < 2) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "knitSurface: at least two source bodies are required",
          };
          return null;
        }
        const tolerance = quantityOf(node, "tolerance", this.scope) ?? 1e-6;
        const res = await sewBReps(sources, {
          tolerance,
          makeSolid:
            booleanParameter(node, "createSolid") ||
            booleanParameter(node, "makeSolid"),
        });
        if (!res.ok) {
          report[node.featureId] = { status: "ERROR", detail: res.reason };
          return null;
        }
        return {
          featureId: node.featureId,
          kind: "body",
          brep: res.value.brep,
          occBrep: res.value.occBrep,
          position: new THREE.Vector3(
            res.value.positionOffset.x,
            res.value.positionOffset.y,
            res.value.positionOffset.z,
          ),
          edgeTags: registerEdges(res.value.brep.edges.length, node.featureId),
          faceTags: registerFaces(res.value.brep.faces.length, node.featureId),
          edgeGeometry: res.value.edgeGeometry,
          faceGeometry: res.value.faceGeometry,
          vertexPositions: res.value.vertexPositions,
        };
      }
      case "trimSurface": {
        const bodyQ = listOf(node, "targets")[0];
        const src = bodyQ ? this.resolve(bodyQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "trimSurface: surface body not resolved",
          };
          return null;
        }
        const trimmerKind =
          enumOfParam(node, "trimmerKind") ??
          stringOfParam(node, "trimmerKind") ??
          "plane";
        if (trimmerKind === "curve") {
          report[node.featureId] = {
            status: "ERROR",
            detail: "trimSurface: curve trimmer is not implemented",
          };
          return null;
        }
        const keepRaw =
          enumOfParam(node, "keep") ??
          enumOfParam(node, "trimKeep") ??
          stringOfParam(node, "keep") ??
          stringOfParam(node, "trimKeep");
        const keep =
          keepRaw === "negative" || keepRaw === "both" ? keepRaw : "positive";
        const parse3 = (raw: string | null, dflt: number[]) =>
          (raw ?? dflt.join(",")).split(",").map((x) => Number(x.trim()));
        const origin = parse3(stringOfParam(node, "planeOrigin"), [0, 0, 0]);
        const normal = parse3(stringOfParam(node, "planeNormal"), [1, 0, 0]);
        let tool:
          | { brep: Brep; position: THREE.Vector3; occBrep?: string }
          | undefined;
        if (trimmerKind !== "plane") {
          const toolQ = listOf(node, "tools")[0];
          const toolOut = toolQ ? this.resolve(toolQ) : undefined;
          if (!toolOut) {
            report[node.featureId] = {
              status: "ERROR",
              detail: `trimSurface: ${trimmerKind} trimmer not resolved`,
            };
            return null;
          }
          tool = {
            brep: toolOut.brep,
            position: toolOut.position,
            ...(toolOut.occBrep !== undefined
              ? { occBrep: toolOut.occBrep }
              : {}),
          };
        }
        const res = await splitBRep(
          src.brep,
          src.position,
          { x: origin[0] ?? 0, y: origin[1] ?? 0, z: origin[2] ?? 0 },
          { x: normal[0] ?? 1, y: normal[1] ?? 0, z: normal[2] ?? 0 },
          src.occBrep,
          undefined,
          keep,
          {
            splitBy: trimmerKind === "plane" ? "plane" : "surface",
            ...(tool ? { tool } : {}),
          },
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
          position: src.position
            .clone()
            .add(
              new THREE.Vector3(
                v.positionOffset.x,
                v.positionOffset.y,
                v.positionOffset.z,
              ),
            ),
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
        const keepRaw =
          enumOfParam(node, "keep") ?? stringOfParam(node, "keep");
        const keep =
          keepRaw === "negative" || keepRaw === "both" ? keepRaw : "positive";
        const splitBy =
          (enumOfParam(node, "splitBy") as "plane" | "surface" | null) ??
          "plane";
        let tool: {
          brep: Brep;
          position: THREE.Vector3;
          occBrep?: string;
        } | null = null;
        if (splitBy === "surface") {
          const toolQ = listOf(node, "tools")[0];
          const toolOut = toolQ ? this.resolve(toolQ) : undefined;
          if (!toolOut) {
            report[node.featureId] = {
              status: "ERROR",
              detail: "split: tool surface not resolved",
            };
            return null;
          }
          tool = {
            brep: toolOut.brep,
            position: toolOut.position,
            ...(toolOut.occBrep !== undefined
              ? { occBrep: toolOut.occBrep }
              : {}),
          };
        }
        const res = await splitBRep(
          src.brep,
          src.position,
          { x: origin[0] ?? 0, y: origin[1] ?? 0, z: origin[2] ?? 0 },
          { x: normal[0] ?? 1, y: normal[1] ?? 0, z: normal[2] ?? 0 },
          src.occBrep,
          undefined,
          keep,
          { splitBy, ...(tool ? { tool } : {}) },
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
          position: src.position
            .clone()
            .add(
              new THREE.Vector3(
                v.positionOffset.x,
                v.positionOffset.y,
                v.positionOffset.z,
              ),
            ),
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
      case "queryFaces":
      case "queryEdges": {
        const srcQ = listOf(node, "targets")[0];
        const src = srcQ ? this.resolve(srcQ) : undefined;
        if (!src) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "query: body not resolved",
          };
          return null;
        }
        const kind = stringOfParam(node, "queryKind") ?? "planar";
        const axisRaw = stringOfParam(node, "axis") ?? "z";
        const signRaw = Number(stringOfParam(node, "sign") ?? "1");
        const rawValue = Number(stringOfParam(node, "value") ?? "0");
        const rawCount = Number(stringOfParam(node, "count") ?? "4");

        if (node.featureType === "queryFaces") {
          let query: FaceQuery = { kind: "planar" };
          if (kind === "area-gt") query = { kind: "area-gt", value: rawValue };
          else if (kind === "at-least-vertices")
            query = { kind: "at-least-vertices", count: rawCount };
          else if (kind === "normal-alignment")
            query = {
              kind: "normal-alignment",
              axis: axisRaw as "x" | "y" | "z",
              sign: (signRaw >= 0 ? 1 : -1) as 1 | -1,
            };
          const indices = queryFaces(src.brep, query);
          const tags = indices.map((i) => `${node.featureId}_F${i}`);
          return {
            featureId: node.featureId,
            kind: "profile",
            brep: src.brep,
            position: src.position.clone(),
            planeNormal: src.planeNormal,
            edgeTags: src.edgeTags,
            faceTags: tags,
            ...(src.snapshot ? { snapshot: src.snapshot } : {}),
          };
        }

        let eq: EdgeQuery = { kind: "length-gt", value: rawValue };
        if (kind === "equal-length")
          eq = { kind: "equal-length", length: rawValue };
        else if (kind === "parallel") eq = { kind: "parallel" };
        else if (kind === "parallel-axis")
          eq = { kind: "parallel-axis", axis: axisRaw as "x" | "y" | "z" };
        const indices = queryEdges(src.brep, eq);
        const tags = indices.map((i) => `${node.featureId}_E${i}`);
        return {
          featureId: node.featureId,
          kind: "profile",
          brep: src.brep,
          position: src.position.clone(),
          planeNormal: src.planeNormal,
          edgeTags: tags,
          faceTags: src.faceTags,
          ...(src.snapshot ? { snapshot: src.snapshot } : {}),
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
            : asset.format === "iges"
              ? await svc.importIges(buf)
              : asset.format === "3mf"
                ? await svc.import3mf(buf)
                : await svc.import(buf);
        if (!imported.length) {
          report[node.featureId] = {
            status: "ERROR",
            detail: "import produced no bodies",
          };
          return null;
        }
        const first = imported[0]!;
        const recognitionMode = (stringOfParam(node, "recognitionMode") ??
          "auto") as ImportRecognitionMode;
        const recognition = applyImportRecognitionMode(
          recognizeImportedBrep(first.brep),
          recognitionMode,
        );
        const recParam = node.parameters.find(
          (p) => p.parameterId === "recognition",
        );
        if (recParam && recParam.kind === "string")
          recParam.value = JSON.stringify(recognition);
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
        // Multi-solid import (e.g. an STL with disconnected shells): keep the
        // bodies SEPARATE like Onshape does — boolean-unioning raw mesh shells
        // fails in OCC (no pcurves/tolerances) and would fuse distinct parts.
        const owned: BodyOutput[] = imported.map((b, i) => {
          const fid = i === 0 ? node.featureId : `${node.featureId}#${i}`;
          return {
            featureId: fid,
            kind: "body",
            brep: b.brep,
            position: b.position,
            edgeTags: registerEdges(b.brep.edges.length, fid),
            faceTags: registerFaces(b.brep.faces.length, fid),
            ...(b.occBrep !== undefined ? { occBrep: b.occBrep } : {}),
          };
        });
        for (const b of owned) this.outputs.set(b.featureId, b);
        this.bodySets.set(node.featureId, owned);
        return {
          ...owned[0]!,
          additionalBodies: owned.slice(1),
        };
      }
      default:
        report[node.featureId] = {
          status: "ERROR",
          detail: phase6DispatchError(node.featureType),
        };
        return null;
    }
  }
}

export const scadgenExecutor = new ScadgenExecutor();
