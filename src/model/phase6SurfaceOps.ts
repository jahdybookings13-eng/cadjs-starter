// Operation specs and planning records for knit, trim, extend, thicken,
// replace-face and solid/surface conversion. These decide whether an operation
// may be committed and what the worker must produce; B-rep construction stays
// in the kernel layer.
import {
  phase6Fail,
  phase6Ok,
  type ConversionDiagnostics,
  type Phase6BodyKind,
  type Phase6Issue,
  type Phase6Result,
  type SurfaceContinuity,
  type SurfaceExtendContinuity,
  type SurfaceTrimKeep,
} from "./phase6";

function finite(value: number): boolean {
  return Number.isFinite(value);
}
function positive(value: number): boolean {
  return finite(value) && value > 0;
}
function nonNegative(value: number): boolean {
  return finite(value) && value >= 0;
}
function uniqueIds(ids: readonly string[], path: string): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (!id.trim())
      issues.push({ path: `${path}[${index}]`, message: "selection is empty" });
    else if (seen.has(id))
      issues.push({
        path: `${path}[${index}]`,
        message: `duplicate selection ${id}`,
      });
    seen.add(id);
  });
  return issues;
}

export interface KnitSurfaceSpec {
  id: string;
  surfaceBodyIds: string[];
  toleranceMM: number;
  mergeGaps: boolean;
  createSolid: boolean;
}

export function validateKnitSurfaceSpec(spec: KnitSurfaceSpec): Phase6Issue[] {
  const issues = uniqueIds(spec.surfaceBodyIds, "knit.surfaceBodyIds");
  if (spec.surfaceBodyIds.length < 2)
    issues.push({
      path: "knit.surfaceBodyIds",
      message: "knit needs at least two surface bodies or faces",
    });
  if (!spec.id.trim())
    issues.push({ path: "knit.id", message: "id is required" });
  if (!positive(spec.toleranceMM))
    issues.push({
      path: "knit.toleranceMM",
      message: "stitch tolerance must be greater than zero",
    });
  return issues;
}

export interface KnitPlan {
  stitchedEdgeCount: number;
  unstitchedEdges: string[];
  closed: boolean;
  solidAllowed: boolean;
}

export function planKnitSurface(
  spec: KnitSurfaceSpec,
  input: { stitchedEdgeCount: number; unstitchedEdges: string[] },
): Phase6Result<KnitPlan> {
  const issues = validateKnitSurfaceSpec(spec);
  if (issues.length) return { ok: false, errors: issues };
  if (!Number.isInteger(input.stitchedEdgeCount) || input.stitchedEdgeCount < 0)
    return phase6Fail(
      "knit.stitchedEdgeCount",
      "stitched edge count must be a non-negative integer",
    );
  const unstitchedEdges = [...new Set(input.unstitchedEdges)].filter((edge) =>
    edge.trim(),
  );
  const closed = unstitchedEdges.length === 0;
  if (spec.createSolid && !closed)
    return phase6Fail(
      "knit.closed",
      `cannot create a solid: ${unstitchedEdges.length} unstitched edge(s)`,
    );
  return phase6Ok({
    stitchedEdgeCount: input.stitchedEdgeCount,
    unstitchedEdges,
    closed,
    solidAllowed: closed,
  });
}

export type SurfaceTrimmerKind = "plane" | "body" | "surface" | "curve";

export interface TrimSurfaceSpec {
  id: string;
  targetBodyId: string;
  trimmerKind: SurfaceTrimmerKind;
  trimmerId: string;
  keep: SurfaceTrimKeep;
  mutual: boolean;
}

export function validateTrimSurfaceSpec(spec: TrimSurfaceSpec): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.id.trim())
    issues.push({ path: "trim.id", message: "id is required" });
  if (!spec.targetBodyId.trim())
    issues.push({
      path: "trim.targetBodyId",
      message: "target surface is required",
    });
  if (!["plane", "body", "surface", "curve"].includes(spec.trimmerKind))
    issues.push({ path: "trim.trimmerKind", message: "invalid trimmer kind" });
  if (!spec.trimmerId.trim())
    issues.push({ path: "trim.trimmerId", message: "trimmer is required" });
  if (!["positive", "negative", "both"].includes(spec.keep))
    issues.push({ path: "trim.keep", message: "invalid keep side" });
  if (spec.mutual && spec.trimmerKind === "plane")
    issues.push({
      path: "trim.mutual",
      message: "a plane cannot be trimmed mutually",
    });
  return issues;
}

export interface TrimPlan {
  intersectionCount: number;
  keptSides: SurfaceTrimKeep;
  didTrim: boolean;
}

export function planTrimSurface(
  spec: TrimSurfaceSpec,
  input: { intersectionCount: number },
): Phase6Result<TrimPlan> {
  const issues = validateTrimSurfaceSpec(spec);
  if (issues.length) return { ok: false, errors: issues };
  if (!Number.isInteger(input.intersectionCount) || input.intersectionCount < 0)
    return phase6Fail(
      "trim.intersectionCount",
      "intersection count must be a non-negative integer",
    );
  if (input.intersectionCount === 0)
    return phase6Fail(
      "trim.intersections",
      "trimmer does not intersect the target surface",
    );
  return phase6Ok({
    intersectionCount: input.intersectionCount,
    keptSides: spec.keep,
    didTrim: true,
  });
}

export interface ExtendSurfaceSpec {
  id: string;
  bodyId: string;
  edgeIds: string[];
  mode: SurfaceExtendContinuity;
  distanceMM: number;
  continuity: SurfaceContinuity;
  trim: boolean;
}

export function validateExtendSurfaceSpec(
  spec: ExtendSurfaceSpec,
): Phase6Issue[] {
  const issues = uniqueIds(spec.edgeIds, "extend.edgeIds");
  if (!spec.id.trim())
    issues.push({ path: "extend.id", message: "id is required" });
  if (!spec.bodyId.trim())
    issues.push({ path: "extend.bodyId", message: "surface body is required" });
  if (!spec.edgeIds.length)
    issues.push({
      path: "extend.edgeIds",
      message: "select at least one edge",
    });
  if (!["linear", "natural"].includes(spec.mode))
    issues.push({ path: "extend.mode", message: "invalid extension mode" });
  if (!positive(spec.distanceMM))
    issues.push({
      path: "extend.distanceMM",
      message: "extension distance must be greater than zero",
    });
  if (!["G0", "G1", "G2"].includes(spec.continuity))
    issues.push({ path: "extend.continuity", message: "invalid continuity" });
  return issues;
}

export interface ExtendPlan {
  extendedLengthMM: number;
  mode: SurfaceExtendContinuity;
  trimmed: boolean;
}

export function planExtendSurface(
  spec: ExtendSurfaceSpec,
  input: { selfIntersects: boolean },
): Phase6Result<ExtendPlan> {
  const issues = validateExtendSurfaceSpec(spec);
  if (issues.length) return { ok: false, errors: issues };
  if (input.selfIntersects)
    return phase6Fail(
      "extend.selfIntersects",
      "extension would self-intersect; reduce the distance",
    );
  return phase6Ok({
    extendedLengthMM: spec.distanceMM,
    mode: spec.mode,
    trimmed: spec.trim,
  });
}

export type ThickenDirection = "positive" | "negative" | "both";

export interface ThickenSurfaceSpec {
  id: string;
  bodyId: string;
  thicknessMM: number;
  direction: ThickenDirection;
  merge: boolean;
  requireClosed: boolean;
}

export function validateThickenSurfaceSpec(
  spec: ThickenSurfaceSpec,
): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.id.trim())
    issues.push({ path: "thicken.id", message: "id is required" });
  if (!spec.bodyId.trim())
    issues.push({
      path: "thicken.bodyId",
      message: "surface body is required",
    });
  if (!positive(spec.thicknessMM))
    issues.push({
      path: "thicken.thicknessMM",
      message: "thickness must be greater than zero",
    });
  if (!["positive", "negative", "both"].includes(spec.direction))
    issues.push({
      path: "thicken.direction",
      message: "invalid thickness direction",
    });
  return issues;
}

export interface ThickenPlan {
  closedVolume: boolean;
  valid: boolean;
  thicknessMM: number;
  direction: ThickenDirection;
}

export function planThickenSurface(
  spec: ThickenSurfaceSpec,
  input: { closed: boolean; selfIntersects: boolean; minRadiusMM: number },
): Phase6Result<ThickenPlan> {
  const issues = validateThickenSurfaceSpec(spec);
  if (issues.length) return { ok: false, errors: issues };
  if (input.selfIntersects)
    return phase6Fail(
      "thicken.selfIntersects",
      "thickening would self-intersect at the current thickness",
    );
  if (
    input.minRadiusMM > 0 &&
    spec.thicknessMM > input.minRadiusMM &&
    spec.direction !== "both"
  )
    return phase6Fail(
      "thicken.minRadiusMM",
      "thickness exceeds the smallest concave radius",
    );
  if (input.minRadiusMM > 0 && spec.thicknessMM > input.minRadiusMM * 2)
    return phase6Fail(
      "thicken.minRadiusMM",
      "both-direction thickness exceeds the smallest concave radius",
    );
  if (spec.requireClosed && !input.closed)
    return phase6Fail(
      "thicken.closed",
      "thicken requires a closed surface body",
    );
  return phase6Ok({
    closedVolume: input.closed,
    valid: true,
    thicknessMM: spec.thicknessMM,
    direction: spec.direction,
  });
}

export type ReplaceFaceContinuity = "position" | "tangent" | "curvature";

export interface ReplaceFaceSpec {
  id: string;
  solidBodyId: string;
  faceId: string;
  surfaceId: string;
  extend: boolean;
  trim: boolean;
  continuity: ReplaceFaceContinuity;
}

export function validateReplaceFaceSpec(spec: ReplaceFaceSpec): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.id.trim())
    issues.push({ path: "replaceFace.id", message: "id is required" });
  if (!spec.solidBodyId.trim())
    issues.push({
      path: "replaceFace.solidBodyId",
      message: "solid body is required",
    });
  if (!spec.faceId.trim())
    issues.push({
      path: "replaceFace.faceId",
      message: "target face is required",
    });
  if (!spec.surfaceId.trim())
    issues.push({
      path: "replaceFace.surfaceId",
      message: "replacement surface is required",
    });
  if (!["position", "tangent", "curvature"].includes(spec.continuity))
    issues.push({
      path: "replaceFace.continuity",
      message: "invalid continuity",
    });
  return issues;
}

export interface ReplaceFacePlan {
  intersects: boolean;
  clean: boolean;
  continuity: ReplaceFaceContinuity;
  extended: boolean;
  trimmed: boolean;
}

export function planReplaceFace(
  spec: ReplaceFaceSpec,
  input: { intersects: boolean; clean: boolean },
): Phase6Result<ReplaceFacePlan> {
  const issues = validateReplaceFaceSpec(spec);
  if (issues.length) return { ok: false, errors: issues };
  if (!input.intersects)
    return phase6Fail(
      "replaceFace.intersections",
      "replacement surface does not intersect the solid cleanly",
    );
  if (!input.clean)
    return phase6Fail(
      "replaceFace.clean",
      "replacement surface leaves open or overlapping faces",
    );
  return phase6Ok({
    intersects: true,
    clean: true,
    continuity: spec.continuity,
    extended: spec.extend,
    trimmed: spec.trim,
  });
}

export interface SurfaceToSolidSpec {
  id: string;
  surfaceBodyIds: string[];
  toleranceMM: number;
  sew: boolean;
  thickenMM: number | null;
}

export function validateSurfaceToSolidSpec(
  spec: SurfaceToSolidSpec,
): Phase6Issue[] {
  const issues = uniqueIds(
    spec.surfaceBodyIds,
    "surfaceToSolid.surfaceBodyIds",
  );
  if (!spec.surfaceBodyIds.length)
    issues.push({
      path: "surfaceToSolid.surfaceBodyIds",
      message: "at least one surface body is required",
    });
  if (!positive(spec.toleranceMM))
    issues.push({
      path: "surfaceToSolid.toleranceMM",
      message: "tolerance must be greater than zero",
    });
  if (spec.thickenMM !== null && !positive(spec.thickenMM))
    issues.push({
      path: "surfaceToSolid.thickenMM",
      message: "thicken amount must be greater than zero",
    });
  return issues;
}

export interface SurfaceToSolidPlan {
  bodyKind: Extract<Phase6BodyKind, "solid">;
  volumeMM3: number;
  closed: boolean;
  sewn: boolean;
  orientationConsistent: boolean;
}

export function planSurfaceToSolid(
  spec: SurfaceToSolidSpec,
  diagnostics: ConversionDiagnostics,
  input: { volumeMM3: number | null; orientationConsistent: boolean },
): Phase6Result<SurfaceToSolidPlan> {
  const issues = validateSurfaceToSolidSpec(spec);
  if (issues.length) return { ok: false, errors: issues };
  if (!diagnostics.ok)
    return phase6Fail(
      "surfaceToSolid.diagnostics",
      diagnostics.issues[0]?.message ?? "surface conversion failed",
    );
  if (input.volumeMM3 === null || !(input.volumeMM3 > 0))
    return phase6Fail(
      "surfaceToSolid.volume",
      "converted body has no positive volume",
    );
  if (!input.orientationConsistent)
    return phase6Fail(
      "surfaceToSolid.orientation",
      "surface normals are not consistently oriented",
    );
  return phase6Ok({
    bodyKind: "solid",
    volumeMM3: input.volumeMM3,
    closed: true,
    sewn: spec.sew,
    orientationConsistent: true,
  });
}

export interface SolidToSurfaceSpec {
  id: string;
  solidBodyId: string;
  faceIds: string[];
  shell: boolean;
  toleranceMM: number;
}

export function validateSolidToSurfaceSpec(
  spec: SolidToSurfaceSpec,
): Phase6Issue[] {
  const issues = uniqueIds(spec.faceIds, "solidToSurface.faceIds");
  if (!spec.id.trim())
    issues.push({ path: "solidToSurface.id", message: "id is required" });
  if (!spec.solidBodyId.trim())
    issues.push({
      path: "solidToSurface.solidBodyId",
      message: "solid body is required",
    });
  if (!spec.faceIds.length)
    issues.push({
      path: "solidToSurface.faceIds",
      message: "select at least one face",
    });
  if (!positive(spec.toleranceMM))
    issues.push({
      path: "solidToSurface.toleranceMM",
      message: "tolerance must be greater than zero",
    });
  return issues;
}

export interface SolidToSurfacePlan {
  surfaceBodyIds: string[];
  faceCount: number;
  extracted: boolean;
  provenance: Array<{ surfaceBodyId: string; sourceFaceId: string }>;
}

export function planSolidToSurface(
  spec: SolidToSurfaceSpec,
  input: { availableFaceIds: string[]; duplicateFaceIds?: string[] },
): Phase6Result<SolidToSurfacePlan> {
  const issues = validateSolidToSurfaceSpec(spec);
  if (issues.length) return { ok: false, errors: issues };
  const available = new Set(input.availableFaceIds);
  const missing = spec.faceIds.filter((id) => !available.has(id));
  if (missing.length)
    return phase6Fail(
      "solidToSurface.faceIds",
      `unknown solid face(s): ${missing.join(", ")}`,
    );
  const duplicateFaceIds = input.duplicateFaceIds ?? [];
  if (duplicateFaceIds.length)
    return phase6Fail(
      "solidToSurface.duplicateFaces",
      `duplicate face extraction: ${duplicateFaceIds.join(", ")}`,
    );
  return phase6Ok({
    surfaceBodyIds: spec.faceIds.map(
      (faceId) => `surface:${spec.solidBodyId}:${faceId}`,
    ),
    faceCount: spec.faceIds.length,
    extracted: true,
    provenance: spec.faceIds.map((faceId) => ({
      surfaceBodyId: `surface:${spec.solidBodyId}:${faceId}`,
      sourceFaceId: faceId,
    })),
  });
}
