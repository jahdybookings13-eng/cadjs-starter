// Feature specifications and calculations for the Phase 6 sheet-metal and
// frame features that still need kernel geometry. These functions own the
// values, validation, developed lengths and joint math; workers remain
// responsible for producing B-rep geometry.
import {
  phase6Fail,
  phase6Ok,
  type Phase6Issue,
  type Phase6Result,
  type SheetMetalCorner,
  type SheetMetalHem,
  type SheetMetalRelief,
  type SheetMetalRule,
} from "./phase6";
import type { FrameLayoutGroup } from "./phase6b";

const finite = (value: number) => Number.isFinite(value);
const positive = (value: number) => finite(value) && value > 0;
const nonNegative = (value: number) => finite(value) && value >= 0;

function nonEmptyIds(ids: readonly string[], path: string): Phase6Issue[] {
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

export type FlangeDirection = "up" | "down";
export type FlangePosition = "inside" | "outside" | "bendCenter";

export interface BaseFlangeSpec {
  id: string;
  profileId: string;
  profileClosed: boolean;
  thicknessMM: number;
  direction: FlangeDirection;
  bendRadiusMM: number;
  offsetMM: number;
  ruleId: string;
}

export function validateBaseFlangeSpec(spec: BaseFlangeSpec): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.id.trim())
    issues.push({ path: "baseFlange.id", message: "id is required" });
  if (!spec.profileId.trim())
    issues.push({
      path: "baseFlange.profileId",
      message: "profile is required",
    });
  if (!spec.profileClosed)
    issues.push({
      path: "baseFlange.profileId",
      message: "base flange requires a closed profile",
    });
  if (!positive(spec.thicknessMM))
    issues.push({
      path: "baseFlange.thicknessMM",
      message: "thickness must be greater than zero",
    });
  if (!nonNegative(spec.bendRadiusMM))
    issues.push({
      path: "baseFlange.bendRadiusMM",
      message: "bend radius cannot be negative",
    });
  if (!finite(spec.offsetMM))
    issues.push({
      path: "baseFlange.offsetMM",
      message: "offset must be finite",
    });
  if (!spec.ruleId.trim())
    issues.push({ path: "baseFlange.ruleId", message: "rule is required" });
  return issues;
}

export function baseFlangeFromRule(
  rule: SheetMetalRule,
  input: {
    id: string;
    profileId: string;
    profileClosed: boolean;
    direction?: FlangeDirection;
    offsetMM?: number;
  },
): Phase6Result<BaseFlangeSpec> {
  const spec: BaseFlangeSpec = {
    id: input.id,
    profileId: input.profileId,
    profileClosed: input.profileClosed,
    thicknessMM: rule.thicknessMM,
    direction: input.direction ?? "up",
    bendRadiusMM: rule.bendRadiusMM,
    offsetMM: input.offsetMM ?? 0,
    ruleId: rule.id,
  };
  const issues = validateBaseFlangeSpec(spec);
  return issues.length ? { ok: false, errors: issues } : phase6Ok(spec);
}

export interface EdgeFlangeSpec {
  id: string;
  edgeIds: string[];
  angleDeg: number;
  lengthMM: number;
  position: FlangePosition;
  radiusMM: number;
  flip: boolean;
  relief: SheetMetalRelief;
  reliefMM: number;
  ruleId: string;
  thicknessMM: number;
  kFactor: number;
}

export function validateEdgeFlangeSpec(spec: EdgeFlangeSpec): Phase6Issue[] {
  const issues = nonEmptyIds(spec.edgeIds, "edgeFlange.edgeIds");
  if (!spec.edgeIds.length)
    issues.push({
      path: "edgeFlange.edgeIds",
      message: "select at least one edge",
    });
  if (!(spec.angleDeg > 0 && spec.angleDeg < 180))
    issues.push({
      path: "edgeFlange.angleDeg",
      message: "angle must be between 0 and 180 degrees",
    });
  if (!positive(spec.lengthMM))
    issues.push({
      path: "edgeFlange.lengthMM",
      message: "flange length must be greater than zero",
    });
  if (!["inside", "outside", "bendCenter"].includes(spec.position))
    issues.push({
      path: "edgeFlange.position",
      message: "invalid bend position",
    });
  if (!nonNegative(spec.radiusMM))
    issues.push({
      path: "edgeFlange.radiusMM",
      message: "radius cannot be negative",
    });
  if (!positive(spec.thicknessMM))
    issues.push({
      path: "edgeFlange.thicknessMM",
      message: "thickness must be greater than zero",
    });
  if (!(spec.kFactor >= 0 && spec.kFactor <= 1))
    issues.push({
      path: "edgeFlange.kFactor",
      message: "K-factor must be 0..1",
    });
  if (!["none", "rectangular", "round", "tear"].includes(spec.relief))
    issues.push({ path: "edgeFlange.relief", message: "invalid relief type" });
  if (!nonNegative(spec.reliefMM))
    issues.push({
      path: "edgeFlange.reliefMM",
      message: "relief cannot be negative",
    });
  return issues;
}

export function bendAllowanceMM(input: {
  angleDeg: number;
  radiusMM: number;
  thicknessMM: number;
  kFactor: number;
  overrideMM?: number | null;
}): number {
  if (input.overrideMM !== undefined && input.overrideMM !== null)
    return Math.max(0, input.overrideMM);
  const angle =
    (Math.min(179.999, Math.max(0, input.angleDeg)) * Math.PI) / 180;
  return angle * (input.radiusMM + input.kFactor * input.thicknessMM);
}

export function bendDeductionMM(input: {
  angleDeg: number;
  radiusMM: number;
  thicknessMM: number;
  kFactor: number;
  overrideMM?: number | null;
}): number {
  const allowance = bendAllowanceMM(input);
  const angle =
    (Math.min(179.999, Math.max(0.001, input.angleDeg)) * Math.PI) / 180;
  const setback =
    2 * (input.radiusMM + input.thicknessMM) * Math.tan(angle / 2);
  return Math.max(0, setback - allowance);
}

/** Flat length contributed by a flange: leg length plus half the bend allowance. */
export function edgeFlangeDevelopedLengthMM(spec: EdgeFlangeSpec): number {
  return (
    spec.lengthMM +
    bendAllowanceMM({
      angleDeg: spec.angleDeg,
      radiusMM: spec.radiusMM,
      thicknessMM: spec.thicknessMM,
      kFactor: spec.kFactor,
    }) /
      2
  );
}

export interface BendSpec {
  id: string;
  lineId: string;
  angleDeg: number;
  radiusMM: number;
  kFactor: number;
  fixedSide: "positive" | "negative";
  order: number;
  thicknessMM: number;
}

export function validateBendSpec(spec: BendSpec): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.id.trim())
    issues.push({ path: "bend.id", message: "id is required" });
  if (!spec.lineId.trim())
    issues.push({
      path: "bend.lineId",
      message: "bend line or edge is required",
    });
  if (!(spec.angleDeg > 0 && spec.angleDeg < 180))
    issues.push({ path: "bend.angleDeg", message: "angle must be 0..180" });
  if (!nonNegative(spec.radiusMM))
    issues.push({
      path: "bend.radiusMM",
      message: "radius cannot be negative",
    });
  if (!(spec.kFactor >= 0 && spec.kFactor <= 1))
    issues.push({ path: "bend.kFactor", message: "K-factor must be 0..1" });
  if (!["positive", "negative"].includes(spec.fixedSide))
    issues.push({ path: "bend.fixedSide", message: "invalid fixed side" });
  if (!Number.isInteger(spec.order) || spec.order < 0)
    issues.push({
      path: "bend.order",
      message: "order must be a non-negative integer",
    });
  if (!positive(spec.thicknessMM))
    issues.push({
      path: "bend.thicknessMM",
      message: "thickness must be greater than zero",
    });
  return issues;
}

/** Multiple bends must have a deterministic, gap-free order. */
export function validateBendSequence(
  specs: readonly BendSpec[],
): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  const orders = new Map<number, string>();
  for (const spec of specs) {
    issues.push(...validateBendSpec(spec));
    const prior = orders.get(spec.order);
    if (prior)
      issues.push({
        path: `bend.${spec.id}.order`,
        message: `bend order ${spec.order} is already used by ${prior}`,
      });
    else orders.set(spec.order, spec.id);
  }
  return issues;
}

export function bendFlatLengthMM(spec: BendSpec): {
  allowanceMM: number;
  deductionMM: number;
  developedMM: number;
} {
  const allowanceMM = bendAllowanceMM(spec);
  return {
    allowanceMM,
    deductionMM: bendDeductionMM(spec),
    developedMM: allowanceMM,
  };
}

export interface BendReliefSpec {
  id: string;
  bendId: string;
  type: SheetMetalRelief;
  placement: "auto" | "corners" | "manual";
  widthMM: number;
  depthMM: number;
  thicknessMM: number;
  flangeLengthMM: number;
}

export function validateBendReliefSpec(spec: BendReliefSpec): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.id.trim())
    issues.push({ path: "relief.id", message: "id is required" });
  if (!spec.bendId.trim())
    issues.push({ path: "relief.bendId", message: "bend is required" });
  if (!["none", "rectangular", "round", "tear"].includes(spec.type))
    issues.push({ path: "relief.type", message: "invalid relief type" });
  if (!["auto", "corners", "manual"].includes(spec.placement))
    issues.push({ path: "relief.placement", message: "invalid placement" });
  if (spec.type !== "none") {
    if (!positive(spec.widthMM))
      issues.push({
        path: "relief.widthMM",
        message: "relief width must be greater than zero",
      });
    if (!positive(spec.depthMM))
      issues.push({
        path: "relief.depthMM",
        message: "relief depth must be greater than zero",
      });
    if (!(spec.thicknessMM > 0))
      issues.push({
        path: "relief.thicknessMM",
        message: "thickness must be greater than zero",
      });
    if (
      spec.flangeLengthMM > 0 &&
      spec.widthMM + spec.depthMM >= spec.flangeLengthMM
    )
      issues.push({
        path: "relief.flangeLengthMM",
        message: "relief consumes the whole flange",
      });
  }
  return issues;
}

export interface CornerTreatmentSpec {
  id: string;
  cornerId: string;
  type: SheetMetalCorner;
  gapMM: number;
  overlapMM: number;
  cornerReliefMM: number;
  flangeIds: string[];
}

export function validateCornerTreatmentSpec(
  spec: CornerTreatmentSpec,
): Phase6Issue[] {
  const issues = nonEmptyIds(spec.flangeIds, "corner.flangeIds");
  if (spec.flangeIds.length < 2)
    issues.push({
      path: "corner.flangeIds",
      message: "a corner needs at least two flanges",
    });
  if (!spec.id.trim())
    issues.push({ path: "corner.id", message: "id is required" });
  if (!spec.cornerId.trim())
    issues.push({ path: "corner.cornerId", message: "corner is required" });
  if (!["closed", "open", "miter", "overlap", "underlap"].includes(spec.type))
    issues.push({ path: "corner.type", message: "invalid corner type" });
  if (!nonNegative(spec.gapMM))
    issues.push({ path: "corner.gapMM", message: "gap cannot be negative" });
  if (!nonNegative(spec.overlapMM))
    issues.push({
      path: "corner.overlapMM",
      message: "overlap cannot be negative",
    });
  if (!nonNegative(spec.cornerReliefMM))
    issues.push({
      path: "corner.cornerReliefMM",
      message: "corner relief cannot be negative",
    });
  if (spec.overlapMM > 0 && spec.gapMM <= 0)
    issues.push({
      path: "corner.collision",
      message: "overlap without a gap collides at the corner",
    });
  if (spec.type === "closed" && spec.gapMM !== 0)
    issues.push({
      path: "corner.gapMM",
      message: "a closed corner must have zero gap",
    });
  if (spec.type === "open" && !(spec.gapMM > 0))
    issues.push({
      path: "corner.gapMM",
      message: "an open corner needs a gap",
    });
  return issues;
}

export interface HemSpec {
  id: string;
  edgeId: string;
  type: Exclude<SheetMetalHem, "none">;
  lengthMM: number;
  radiusMM: number;
  gapMM: number;
  direction: FlangeDirection;
  thicknessMM: number;
}

export function validateHemSpec(spec: HemSpec): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.id.trim())
    issues.push({ path: "hem.id", message: "id is required" });
  if (!spec.edgeId.trim())
    issues.push({ path: "hem.edgeId", message: "an edge is required" });
  if (!["closed", "open", "rolled", "teardrop"].includes(spec.type))
    issues.push({ path: "hem.type", message: "invalid hem type" });
  if (!positive(spec.lengthMM))
    issues.push({
      path: "hem.lengthMM",
      message: "hem length must be positive",
    });
  if (!nonNegative(spec.radiusMM))
    issues.push({ path: "hem.radiusMM", message: "radius cannot be negative" });
  if (!nonNegative(spec.gapMM))
    issues.push({ path: "hem.gapMM", message: "gap cannot be negative" });
  if (!positive(spec.thicknessMM))
    issues.push({
      path: "hem.thicknessMM",
      message: "thickness must be greater than zero",
    });
  if (spec.type === "rolled" && !(spec.radiusMM > 0))
    issues.push({ path: "hem.radiusMM", message: "rolled hem needs a radius" });
  if (spec.type === "closed" && spec.gapMM !== 0)
    issues.push({ path: "hem.gapMM", message: "a closed hem has no gap" });
  if (spec.type === "open" && !(spec.gapMM > 0))
    issues.push({ path: "hem.gapMM", message: "an open hem needs a gap" });
  return issues;
}

export function hemDevelopedLengthMM(spec: HemSpec): number {
  const bend = bendAllowanceMM({
    angleDeg: 180,
    radiusMM: spec.radiusMM,
    thicknessMM: spec.thicknessMM,
    kFactor: 0.5,
  });
  if (spec.type === "rolled")
    return spec.lengthMM + Math.PI * (spec.radiusMM + spec.thicknessMM / 2);
  if (spec.type === "teardrop")
    return spec.lengthMM + Math.PI * (spec.radiusMM + spec.thicknessMM);
  return spec.lengthMM + bend;
}

export interface LouverSpec {
  id: string;
  faceId: string;
  lengthMM: number;
  widthMM: number;
  depthMM: number;
  spacingMM: number;
  angleDeg: number;
  count: number;
}

export function validateLouverSpec(spec: LouverSpec): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.id.trim())
    issues.push({ path: "louver.id", message: "id is required" });
  if (!spec.faceId.trim())
    issues.push({
      path: "louver.faceId",
      message: "a face or edge is required",
    });
  if (!positive(spec.lengthMM))
    issues.push({
      path: "louver.lengthMM",
      message: "length must be positive",
    });
  if (!positive(spec.widthMM))
    issues.push({ path: "louver.widthMM", message: "width must be positive" });
  if (!positive(spec.depthMM))
    issues.push({ path: "louver.depthMM", message: "depth must be positive" });
  if (!nonNegative(spec.spacingMM))
    issues.push({
      path: "louver.spacingMM",
      message: "spacing cannot be negative",
    });
  if (!(spec.angleDeg > 0 && spec.angleDeg < 90))
    issues.push({ path: "louver.angleDeg", message: "angle must be 0..90" });
  if (!Number.isInteger(spec.count) || spec.count < 1)
    issues.push({
      path: "louver.count",
      message: "count must be a positive integer",
    });
  if (spec.count > 1 && spec.spacingMM < spec.widthMM)
    issues.push({
      path: "louver.spacingMM",
      message: "spacing must be at least the louver width",
    });
  const run =
    spec.count * spec.widthMM + Math.max(0, spec.count - 1) * spec.spacingMM;
  if (run > spec.lengthMM)
    issues.push({
      path: "louver.lengthMM",
      message: "louver run exceeds the selected face length",
    });
  return issues;
}

/** Louvers are form features, so they stay in the flat pattern as marks. */
export function louverFlatPatternFeature(spec: LouverSpec): {
  id: string;
  kind: "form";
  cut: false;
  count: number;
  widthMM: number;
  spacingMM: number;
} {
  return {
    id: spec.id,
    kind: "form",
    cut: false,
    count: spec.count,
    widthMM: spec.widthMM,
    spacingMM: spec.spacingMM,
  };
}

// ---------------------------------------------------------------------------
// Frame structural members and joints
// ---------------------------------------------------------------------------

export type FrameEndCondition = "butt" | "miter" | "trim" | "extend";
export type FrameMemberOrientation = "x" | "y" | "z" | "custom";

export interface StructuralMemberOptions {
  profileId: string;
  orientation: FrameMemberOrientation;
  rotationRad: number;
  offsetMM: number;
  merge: boolean;
  join: boolean;
  endCondition: FrameEndCondition;
  startAngleDeg: number;
  endAngleDeg: number;
}

export interface GeneratedStructuralMember {
  id: string;
  groupId: string;
  segmentId: string;
  profileId: string;
  partId: string;
  bodyId: string;
  selectable: true;
  startMM: [number, number, number];
  endMM: [number, number, number];
  lengthMM: number;
  direction: [number, number, number];
  orientation: FrameMemberOrientation;
  rotationRad: number;
  offsetMM: number;
  merge: boolean;
  join: boolean;
  endCondition: FrameEndCondition;
  startAngleDeg: number;
  endAngleDeg: number;
}

const DEFAULT_MEMBER_OPTIONS: Omit<StructuralMemberOptions, "profileId"> = {
  orientation: "z",
  rotationRad: 0,
  offsetMM: 0,
  merge: true,
  join: true,
  endCondition: "butt",
  startAngleDeg: 0,
  endAngleDeg: 0,
};

function directionOf(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
): [number, number, number] {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  return length > 1e-9 ? [dx / length, dy / length, dz / length] : [0, 0, 0];
}

/**
 * One selectable structural-member descriptor per layout segment. The body id
 * is stable across edits so assembly instances and BOM rows do not churn.
 */
export function generateStructuralMembers(
  group: FrameLayoutGroup,
  options: readonly (Partial<StructuralMemberOptions> & {
    segmentId: string;
  })[] = [],
  profileIds?: readonly string[],
): Phase6Result<GeneratedStructuralMember[]> {
  if (!group.id.trim())
    return phase6Fail("structuralMember.groupId", "group id is required");
  if (!group.segments.length)
    return phase6Fail("structuralMember.segments", "group has no segments");
  const allowedProfiles = profileIds ? new Set(profileIds) : null;
  const bySegment = new Map(options.map((entry) => [entry.segmentId, entry]));
  const members: GeneratedStructuralMember[] = [];
  const seen = new Set<string>();
  for (const segment of group.segments) {
    const overrides: Partial<StructuralMemberOptions> =
      bySegment.get(segment.id) ?? {};
    const profileId = overrides.profileId ?? segment.profileId;
    if (!profileId.trim())
      return phase6Fail("structuralMember.profileId", "profile id is required");
    if (allowedProfiles && !allowedProfiles.has(profileId))
      return phase6Fail(
        "structuralMember.profileId",
        `unknown profile ${profileId}`,
      );
    const lengthMM = Math.hypot(
      segment.endMM[0] - segment.startMM[0],
      segment.endMM[1] - segment.startMM[1],
      segment.endMM[2] - segment.startMM[2],
    );
    if (!(lengthMM > 1e-9))
      return phase6Fail(
        "structuralMember.length",
        `segment ${segment.id} has zero length`,
      );
    const id = `${group.id}:${segment.id}`;
    if (seen.has(id))
      return phase6Fail("structuralMember.id", `duplicate member ${id}`);
    seen.add(id);
    const merged = {
      ...DEFAULT_MEMBER_OPTIONS,
      profileId,
      startAngleDeg: segment.startAngleDeg ?? 0,
      endAngleDeg: segment.endAngleDeg ?? 0,
      ...overrides,
    };
    if (!finite(merged.rotationRad))
      return phase6Fail(
        "structuralMember.rotationRad",
        "rotation must be finite",
      );
    if (!finite(merged.offsetMM))
      return phase6Fail("structuralMember.offsetMM", "offset must be finite");
    if (!["butt", "miter", "trim", "extend"].includes(merged.endCondition))
      return phase6Fail(
        "structuralMember.endCondition",
        "invalid end condition",
      );
    members.push({
      id,
      groupId: group.id,
      segmentId: segment.id,
      profileId,
      partId: `frame-part:${profileId}`,
      bodyId: `frame-body:${group.id}:${segment.id}`,
      selectable: true,
      startMM: [...segment.startMM] as [number, number, number],
      endMM: [...segment.endMM] as [number, number, number],
      lengthMM,
      direction: directionOf(segment.startMM, segment.endMM),
      orientation: merged.orientation,
      rotationRad: merged.rotationRad,
      offsetMM: merged.offsetMM,
      merge: merged.merge,
      join: merged.join,
      endCondition: merged.endCondition,
      startAngleDeg: merged.startAngleDeg,
      endAngleDeg: merged.endAngleDeg,
    });
  }
  return phase6Ok(members);
}

export interface FrameJointSpec {
  id: string;
  memberAId: string;
  memberBId: string;
  kind: FrameEndCondition | "cope";
  gapMM: number;
  trimMM: number;
  copeDepthMM: number;
}

export interface FrameJointGeometry {
  id: string;
  kind: FrameJointSpec["kind"];
  sharedPointMM: [number, number, number];
  interiorAngleDeg: number;
  miterCutAngleDeg: number;
  cutLengthsMM: Record<string, number>;
  copeDepthMM: number;
  threeWay: boolean;
  gapMM: number;
  warnings: string[];
}

function pointDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function endpointPairs(
  a: GeneratedStructuralMember,
  b: GeneratedStructuralMember,
): Array<{
  aPoint: [number, number, number];
  bPoint: [number, number, number];
  distance: number;
}> {
  return [
    { aPoint: a.startMM, bPoint: b.startMM },
    { aPoint: a.startMM, bPoint: b.endMM },
    { aPoint: a.endMM, bPoint: b.startMM },
    { aPoint: a.endMM, bPoint: b.endMM },
  ].map((pair) => ({
    ...pair,
    distance: pointDistance(pair.aPoint, pair.bPoint),
  }));
}

/** Calculate miter angles, trim/extend lengths and cope depth for one joint. */
export function frameJointGeometry(
  members: readonly GeneratedStructuralMember[],
  joint: FrameJointSpec,
  toleranceMM = 0.01,
): Phase6Result<FrameJointGeometry> {
  if (!joint.id.trim())
    return phase6Fail("frameJoint.id", "joint id is required");
  if (joint.memberAId === joint.memberBId)
    return phase6Fail("frameJoint.members", "a member cannot join itself");
  const a = members.find((member) => member.id === joint.memberAId);
  const b = members.find((member) => member.id === joint.memberBId);
  if (!a || !b)
    return phase6Fail("frameJoint.members", "joint member is missing");
  if (!nonNegative(joint.gapMM))
    return phase6Fail("frameJoint.gapMM", "gap cannot be negative");
  if (!nonNegative(joint.trimMM))
    return phase6Fail("frameJoint.trimMM", "trim cannot be negative");
  if (joint.kind === "cope" && !(joint.copeDepthMM > 0))
    return phase6Fail(
      "frameJoint.copeDepthMM",
      "cope depth must be greater than zero",
    );
  const pair = endpointPairs(a, b).sort((x, y) => x.distance - y.distance)[0]!;
  if (pair.distance > toleranceMM)
    return phase6Fail(
      "frameJoint.sharedPoint",
      `members do not meet within ${toleranceMM} mm`,
    );
  const shared = pair.aPoint;
  const aAway = directionOf(
    shared,
    pointDistance(a.startMM, shared) < 1e-6 ? a.endMM : a.startMM,
  );
  const bAway = directionOf(
    shared,
    pointDistance(b.startMM, shared) < 1e-6 ? b.endMM : b.startMM,
  );
  const dot = Math.max(
    -1,
    Math.min(
      1,
      aAway[0] * bAway[0] + aAway[1] * bAway[1] + aAway[2] * bAway[2],
    ),
  );
  const interiorAngleDeg = (Math.acos(dot) * 180) / Math.PI;
  const miterCutAngleDeg = Math.max(0, (180 - interiorAngleDeg) / 2);
  const extension = joint.kind === "extend" ? joint.trimMM : 0;
  const shortening = joint.kind === "trim" ? joint.trimMM / 2 : 0;
  const cutLengthsMM = {
    [a.id]: Math.max(0, a.lengthMM + extension - shortening - joint.gapMM / 2),
    [b.id]: Math.max(0, b.lengthMM + extension - shortening - joint.gapMM / 2),
  };
  const sharedCount = members.filter(
    (member) =>
      pointDistance(member.startMM, shared) <= toleranceMM ||
      pointDistance(member.endMM, shared) <= toleranceMM,
  ).length;
  const warnings: string[] = [];
  if (sharedCount > 2)
    warnings.push(`three-way corner: ${sharedCount} members meet here`);
  if (joint.kind === "trim" && joint.trimMM <= 0)
    warnings.push("trim amount is zero");
  return phase6Ok({
    id: joint.id,
    kind: joint.kind,
    sharedPointMM: [...shared] as [number, number, number],
    interiorAngleDeg,
    miterCutAngleDeg,
    cutLengthsMM,
    copeDepthMM: joint.kind === "cope" ? joint.copeDepthMM : 0,
    threeWay: sharedCount > 2,
    gapMM: joint.gapMM,
    warnings,
  });
}

/** Validate a set of joints and report collisions before committing. */
export function validateFrameJoints(
  members: readonly GeneratedStructuralMember[],
  joints: readonly FrameJointSpec[],
): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  const seen = new Set<string>();
  for (const joint of joints) {
    if (seen.has(joint.id))
      issues.push({
        path: `frameJoint.${joint.id}`,
        message: "duplicate joint id",
      });
    seen.add(joint.id);
    const result = frameJointGeometry(members, joint);
    if (!result.ok) issues.push(...result.errors);
    else if (
      result.value.kind === "miter" &&
      Math.abs(result.value.interiorAngleDeg - 180) < 0.01
    )
      issues.push({
        path: `frameJoint.${joint.id}`,
        message: "miter joint has collinear members",
      });
  }
  return issues;
}
