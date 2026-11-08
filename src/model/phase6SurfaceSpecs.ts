// Surface feature specifications for Phase 6. These validate inputs and hold
// the options the dialogs/actuators pass to the kernel; the kernel geometry
// itself is still owned by the surface worker.
import {
  phase6Fail,
  phase6Ok,
  type Phase6Issue,
  type Phase6Result,
  type SurfaceContinuity,
  type SurfaceExtendContinuity,
  type SurfaceTrimKeep,
} from "./phase6";

export type SurfaceEndCondition =
  | "normal"
  | "tangent"
  | "curvature"
  | "direction";

export interface BoundarySurfaceSpec {
  boundaryIds: string[];
  continuity: SurfaceContinuity;
  constraintCurveIds: string[];
  trim: boolean;
}

export interface SurfaceLoftSpec {
  sectionIds: string[];
  guideCurveIds: string[];
  continuity: SurfaceContinuity;
  startCondition: SurfaceEndCondition;
  endCondition: SurfaceEndCondition;
  closed: boolean;
  twistDeg: number;
  ruled: boolean;
}

export interface SurfaceFillSpec {
  boundaryIds: string[];
  constraintCurveIds: string[];
  constraintPointIds: string[];
  continuity: SurfaceContinuity;
  trim: boolean;
}

export interface RuledSurfaceSpec {
  edgePairs: Array<[string, string]>;
  spans: number;
  trim: boolean;
  extendMM: number;
}

export interface OffsetSurfaceSpec {
  faceId: string;
  distanceMM: number;
  flip: boolean;
  toleranceMM: number;
  extend: boolean;
  continuity: SurfaceExtendContinuity;
}

function uniqueNonEmpty(ids: readonly string[], path: string): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    const value = id.trim();
    if (!value)
      issues.push({ path: `${path}[${index}]`, message: "selection is empty" });
    else if (seen.has(value))
      issues.push({
        path: `${path}[${index}]`,
        message: `duplicate selection ${value}`,
      });
    seen.add(value);
  });
  return issues;
}

function requireContinuity(
  value: SurfaceContinuity,
  path: string,
): Phase6Issue[] {
  return ["G0", "G1", "G2"].includes(value)
    ? []
    : [{ path, message: "continuity must be G0, G1 or G2" }];
}

export function validateBoundarySurfaceSpec(
  spec: BoundarySurfaceSpec,
): Phase6Issue[] {
  const issues = uniqueNonEmpty(spec.boundaryIds, "surface.boundaryIds");
  if (spec.boundaryIds.length < 2)
    issues.push({
      path: "surface.boundaryIds",
      message: "at least two boundary curves or loops are required",
    });
  issues.push(
    ...uniqueNonEmpty(spec.constraintCurveIds, "surface.constraintCurveIds"),
  );
  issues.push(...requireContinuity(spec.continuity, "surface.continuity"));
  return issues;
}

export function validateSurfaceLoftSpec(spec: SurfaceLoftSpec): Phase6Issue[] {
  const issues = uniqueNonEmpty(spec.sectionIds, "surface.sectionIds");
  if (spec.sectionIds.length < 2)
    issues.push({
      path: "surface.sectionIds",
      message: "at least two sections are required",
    });
  issues.push(...uniqueNonEmpty(spec.guideCurveIds, "surface.guideCurveIds"));
  issues.push(...requireContinuity(spec.continuity, "surface.continuity"));
  if (
    !["normal", "tangent", "curvature", "direction"].includes(
      spec.startCondition,
    )
  )
    issues.push({
      path: "surface.startCondition",
      message: "invalid start condition",
    });
  if (
    !["normal", "tangent", "curvature", "direction"].includes(spec.endCondition)
  )
    issues.push({
      path: "surface.endCondition",
      message: "invalid end condition",
    });
  if (!Number.isFinite(spec.twistDeg))
    issues.push({ path: "surface.twistDeg", message: "twist must be finite" });
  return issues;
}

export function validateSurfaceFillSpec(spec: SurfaceFillSpec): Phase6Issue[] {
  const issues = uniqueNonEmpty(spec.boundaryIds, "surface.boundaryIds");
  if (!spec.boundaryIds.length)
    issues.push({
      path: "surface.boundaryIds",
      message: "a boundary is required",
    });
  issues.push(
    ...uniqueNonEmpty(spec.constraintCurveIds, "surface.constraintCurveIds"),
  );
  issues.push(
    ...uniqueNonEmpty(spec.constraintPointIds, "surface.constraintPointIds"),
  );
  issues.push(...requireContinuity(spec.continuity, "surface.continuity"));
  return issues;
}

export function validateRuledSurfaceSpec(
  spec: RuledSurfaceSpec,
): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.edgePairs.length)
    issues.push({
      path: "surface.edgePairs",
      message: "an edge pair is required",
    });
  spec.edgePairs.forEach(([a, b], index) => {
    if (!a.trim() || !b.trim())
      issues.push({
        path: `surface.edgePairs[${index}]`,
        message: "both edges in a pair are required",
      });
    if (a === b)
      issues.push({
        path: `surface.edgePairs[${index}]`,
        message: "an edge cannot pair with itself",
      });
  });
  if (!Number.isInteger(spec.spans) || spec.spans < 1)
    issues.push({ path: "surface.spans", message: "spans must be at least 1" });
  if (!(spec.extendMM >= 0))
    issues.push({
      path: "surface.extendMM",
      message: "extend must be non-negative",
    });
  return issues;
}

export function validateOffsetSurfaceSpec(
  spec: OffsetSurfaceSpec,
): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.faceId.trim())
    issues.push({ path: "surface.faceId", message: "a face is required" });
  if (!Number.isFinite(spec.distanceMM) || spec.distanceMM === 0)
    issues.push({
      path: "surface.distanceMM",
      message: "offset distance must be non-zero",
    });
  if (!(spec.toleranceMM > 0))
    issues.push({
      path: "surface.toleranceMM",
      message: "tolerance must be greater than zero",
    });
  if (!["linear", "natural"].includes(spec.continuity))
    issues.push({
      path: "surface.continuity",
      message: "invalid extension continuity",
    });
  return issues;
}

export const PHASE6_SURFACE_SPEC_KINDS = [
  "boundarySurface",
  "surfaceLoft",
  "surfaceFill",
  "ruledSurface",
  "surfaceOffset",
] as const;

export type Phase6SurfaceSpecKind = (typeof PHASE6_SURFACE_SPEC_KINDS)[number];

export function createSurfaceSpec<T>(
  value: T,
  validate: (spec: T) => Phase6Issue[],
): Phase6Result<T> {
  const issues = validate(value);
  return issues.length
    ? phase6Fail("surface.spec", issues.map((i) => i.message).join("; "))
    : phase6Ok(value);
}

export function surfaceTrimLabel(keep: SurfaceTrimKeep): string {
  return keep === "positive"
    ? "Keep positive side"
    : keep === "negative"
      ? "Keep negative side"
      : "Keep both sides";
}
