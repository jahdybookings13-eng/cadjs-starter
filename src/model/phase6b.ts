// Phase 6B — model/data/integration layer for the second batch.
//
// These are deliberately pure: selection rules, lifecycle/undo naming, frame
// layout and weld-gap data, frame→assembly/BOM adapters, surface typing,
// curvature analysis, surface persistence, conversion feature data and
// dialog/tree metadata. Kernel geometry is still owned by the workers and is
// not claimed here.
import type { BodyOutput } from "./executor";
import type { BomRow } from "../assemblies/bom";
import { cutListBomRows } from "../assemblies/phase6Bom";
import {
  frameCutList,
  phase6Fail,
  phase6Ok,
  type CutListRow,
  type FrameMember,
  type FrameProfile,
  type Phase6BodyKind,
  type Phase6Issue,
  type Phase6Result,
} from "./phase6";

// ---------------------------------------------------------------------------
// Selection and filters (P6-05)
// ---------------------------------------------------------------------------

export const PHASE6_SELECTION_KINDS = [
  "edge",
  "edgeLoop",
  "face",
  "body",
  "sketchProfile",
  "bendLine",
  "framePath",
  "surfaceBoundary",
] as const;

export type Phase6SelectionKind = (typeof PHASE6_SELECTION_KINDS)[number];

export interface Phase6SelectionFilter {
  active: boolean;
  allowed: readonly Phase6SelectionKind[];
}

export function createPhase6SelectionFilter(
  allowed: readonly Phase6SelectionKind[] = PHASE6_SELECTION_KINDS,
  active = true,
): Phase6SelectionFilter {
  return { active, allowed: [...allowed] };
}

export function phase6SelectionLabel(kind: Phase6SelectionKind): string {
  switch (kind) {
    case "edgeLoop":
      return "Edge loop";
    case "sketchProfile":
      return "Sketch profile";
    case "bendLine":
      return "Bend line";
    case "framePath":
      return "Frame path";
    case "surfaceBoundary":
      return "Surface boundary";
    default:
      return kind[0]!.toUpperCase() + kind.slice(1);
  }
}

export function phase6SelectionAllowed(
  filter: Phase6SelectionFilter,
  kind: Phase6SelectionKind,
): Phase6Result<Phase6SelectionKind> {
  if (!filter.active || filter.allowed.includes(kind)) return phase6Ok(kind);
  return phase6Fail(
    "selection.kind",
    `${phase6SelectionLabel(kind)} is not allowed by the active filter`,
  );
}

export interface Phase6Pick {
  id: string;
  kind: Phase6SelectionKind;
}

export interface Phase6FilteredPicks {
  accepted: Phase6Pick[];
  rejected: Array<Phase6Pick & { reason: string }>;
}

export function filterPhase6Picks(
  picks: readonly Phase6Pick[],
  filter: Phase6SelectionFilter,
): Phase6FilteredPicks {
  const accepted: Phase6Pick[] = [];
  const rejected: Array<Phase6Pick & { reason: string }> = [];
  for (const pick of picks) {
    const allowed = phase6SelectionAllowed(filter, pick.kind);
    if (allowed.ok) accepted.push(pick);
    else
      rejected.push({
        ...pick,
        reason: allowed.errors[0]?.message ?? "selection is not allowed",
      });
  }
  return { accepted, rejected };
}

export function phase6SelectionFilterLabel(
  filter: Phase6SelectionFilter,
): string {
  if (!filter.active) return "No filter";
  if (!filter.allowed.length) return "Nothing selectable";
  return filter.allowed.map(phase6SelectionLabel).join(", ");
}

// ---------------------------------------------------------------------------
// Feature family, lifecycle, tree folder and undo naming (P6-07, P6-SM-13,
// P6-INT-03, P6-INT-05)
// ---------------------------------------------------------------------------

export type Phase6FeatureFamily =
  | "sheetMetal"
  | "frames"
  | "surfaces"
  | "conversion";

const FAMILY_BY_TYPE: Record<string, Phase6FeatureFamily> = {
  baseFlange: "sheetMetal",
  edgeFlange: "sheetMetal",
  flange: "sheetMetal",
  bend: "sheetMetal",
  corner: "sheetMetal",
  hem: "sheetMetal",
  louver: "sheetMetal",
  unfold: "sheetMetal",
  flatPattern: "sheetMetal",
  bendTable: "sheetMetal",
  frame: "frames",
  frameGroup: "frames",
  structuralMember: "frames",
  cutList: "frames",
  surface: "surfaces",
  boundarySurface: "surfaces",
  constrainedSurface: "surfaces",
  surfaceLoft: "surfaces",
  surfaceFill: "surfaces",
  surfaceOffset: "surfaces",
  ruledSurface: "surfaces",
  knitSurface: "surfaces",
  trimSurface: "surfaces",
  extendSurface: "surfaces",
  thickenSurface: "surfaces",
  replaceFace: "surfaces",
  curvature: "surfaces",
  relief: "sheetMetal",
  sheetMetalRule: "sheetMetal",
  conversion: "conversion",
  convertSurface: "conversion",
  solidToSurface: "conversion",
};

export function phase6FeatureFamily(
  featureType: string,
): Phase6FeatureFamily | null {
  return FAMILY_BY_TYPE[featureType] ?? null;
}

export type Phase6LifecycleOp =
  | "edit"
  | "delete"
  | "suppress"
  | "unsuppress"
  | "reorder"
  | "rollback";

const LIFECYCLE_OPS: readonly Phase6LifecycleOp[] = [
  "edit",
  "delete",
  "suppress",
  "unsuppress",
  "reorder",
  "rollback",
];

export function phase6LifecycleOps(
  family: Phase6FeatureFamily,
): readonly Phase6LifecycleOp[] {
  // Every family uses the same generic history lifecycle; the family only
  // affects the folder and undo label.
  return family ? LIFECYCLE_OPS : [];
}

export function phase6LifecycleUndoName(
  op: Phase6LifecycleOp,
  name: string,
): string {
  const label = name.trim() || "Feature";
  switch (op) {
    case "edit":
      return `Edit ${label}`;
    case "delete":
      return `Delete ${label}`;
    case "suppress":
      return `Suppress ${label}`;
    case "unsuppress":
      return `Unsuppress ${label}`;
    case "reorder":
      return `Reorder ${label}`;
    case "rollback":
      return `Roll Back to ${label}`;
  }
}

export function phase6TreeFolder(featureType: string): string | null {
  switch (phase6FeatureFamily(featureType)) {
    case "sheetMetal":
      return "Sheet metal";
    case "frames":
      return "Frames";
    case "surfaces":
      return "Surfaces";
    case "conversion":
      return "Conversions";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Frame layout, groups and weld gaps (P6-FR-03, P6-FR-06)
// ---------------------------------------------------------------------------

export type FrameOrientation = "x" | "y" | "z" | "custom";

export interface FrameLayoutSegment {
  id: string;
  startMM: [number, number, number];
  endMM: [number, number, number];
  profileId: string;
  startAngleDeg?: number;
  endAngleDeg?: number;
}

export interface FrameLayoutGroup {
  id: string;
  name: string;
  orientation: FrameOrientation;
  segments: FrameLayoutSegment[];
}

export function createFrameLayoutGroup(
  id: string,
  name: string,
  orientation: FrameOrientation = "z",
): Phase6Result<FrameLayoutGroup> {
  if (!id.trim()) return phase6Fail("frameGroup.id", "group id is required");
  if (!name.trim())
    return phase6Fail("frameGroup.name", "group name is required");
  return phase6Ok({
    id: id.trim(),
    name: name.trim(),
    orientation,
    segments: [],
  });
}

export function addFrameSegment(
  group: FrameLayoutGroup,
  segment: FrameLayoutSegment,
): Phase6Result<FrameLayoutGroup> {
  if (!segment.id.trim())
    return phase6Fail("frameSegment.id", "segment id is required");
  if (group.segments.some((entry) => entry.id === segment.id))
    return phase6Fail("frameSegment.id", `duplicate segment ${segment.id}`);
  if (!segment.profileId.trim())
    return phase6Fail("frameSegment.profileId", "profile id is required");
  const length = Math.hypot(
    segment.endMM[0] - segment.startMM[0],
    segment.endMM[1] - segment.startMM[1],
    segment.endMM[2] - segment.startMM[2],
  );
  if (!(length > 1e-9))
    return phase6Fail("frameSegment.length", "segment has zero length");
  return phase6Ok({
    ...group,
    segments: [...group.segments, { ...segment }],
  });
}

export function removeFrameSegment(
  group: FrameLayoutGroup,
  segmentId: string,
): Phase6Result<FrameLayoutGroup> {
  if (!group.segments.some((segment) => segment.id === segmentId))
    return phase6Fail("frameSegment.id", `unknown segment ${segmentId}`);
  return phase6Ok({
    ...group,
    segments: group.segments.filter((segment) => segment.id !== segmentId),
  });
}

export function frameMembers(group: FrameLayoutGroup): FrameMember[] {
  return group.segments.map((segment) => ({
    id: segment.id,
    profileId: segment.profileId,
    groupId: group.id,
    startMM: [...segment.startMM] as [number, number, number],
    endMM: [...segment.endMM] as [number, number, number],
    ...(segment.startAngleDeg !== undefined
      ? { startAngleDeg: segment.startAngleDeg }
      : {}),
    ...(segment.endAngleDeg !== undefined
      ? { endAngleDeg: segment.endAngleDeg }
      : {}),
  }));
}

export interface FramePathInput {
  id: string;
  name: string;
  orientation?: FrameOrientation;
  segments: FrameLayoutSegment[];
}

/** Turn ordered sketch/3D path picks into one or more frame groups. */
export function createFrameGroupsFromPaths(
  paths: readonly FramePathInput[],
): Phase6Result<FrameLayoutGroup[]> {
  if (!paths.length)
    return phase6Fail("framePath", "at least one path is required");
  const groups: FrameLayoutGroup[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (seen.has(path.id))
      return phase6Fail("framePath.id", `duplicate path ${path.id}`);
    seen.add(path.id);
    const created = createFrameLayoutGroup(
      path.id,
      path.name,
      path.orientation ?? "z",
    );
    if (!created.ok) return created;
    let group = created.value;
    for (const segment of path.segments) {
      const added = addFrameSegment(group, segment);
      if (!added.ok) return added;
      group = added.value;
    }
    groups.push(group);
  }
  return phase6Ok(groups);
}

export interface WeldGapJoint {
  id: string;
  groupId: string;
  memberIds: string[];
  gapMM: number;
}

export function validateWeldGapJoint(joint: WeldGapJoint): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!joint.id.trim())
    issues.push({ path: "weldGap.id", message: "id is required" });
  if (!joint.groupId.trim())
    issues.push({ path: "weldGap.groupId", message: "group id is required" });
  if (joint.memberIds.length < 2)
    issues.push({
      path: "weldGap.memberIds",
      message: "a joint needs at least two members",
    });
  if (!Number.isFinite(joint.gapMM) || joint.gapMM < 0)
    issues.push({
      path: "weldGap.gapMM",
      message: "gap must be a non-negative length",
    });
  return issues;
}

export function weldGapForMember(
  joints: readonly WeldGapJoint[],
  groupId: string,
  memberId: string,
): number {
  return (
    joints.find(
      (joint) =>
        joint.groupId === groupId && joint.memberIds.includes(memberId),
    )?.gapMM ?? 0
  );
}

export function applyWeldGaps(
  members: readonly FrameMember[],
  joints: readonly WeldGapJoint[],
): FrameMember[] {
  return members.map((member) => {
    const gap = weldGapForMember(joints, member.groupId, member.id);
    return gap > 0 ? { ...member, weldGapMM: gap } : { ...member };
  });
}

export interface WeldGapPreviewJoint {
  jointId: string;
  memberIds: string[];
  gapMM: number;
  cutLengthsMM: Record<string, number>;
}

export interface WeldGapPreview {
  groupId: string;
  joints: WeldGapPreviewJoint[];
}

function memberLengthMM(member: FrameMember): number {
  return Math.hypot(
    member.endMM[0] - member.startMM[0],
    member.endMM[1] - member.startMM[1],
    member.endMM[2] - member.startMM[2],
  );
}

/** Preview data: the gap at each joint and the shortened cut length. */
export function weldGapPreview(
  members: readonly FrameMember[],
  joints: readonly WeldGapJoint[],
): WeldGapPreview {
  const byId = new Map(members.map((member) => [member.id, member]));
  return {
    groupId: joints[0]?.groupId ?? members[0]?.groupId ?? "",
    joints: joints.map((joint) => ({
      jointId: joint.id,
      memberIds: [...joint.memberIds],
      gapMM: joint.gapMM,
      cutLengthsMM: Object.fromEntries(
        joint.memberIds.map((id) => {
          const member = byId.get(id);
          return [
            id,
            member ? Math.max(0, memberLengthMM(member) - joint.gapMM) : 0,
          ];
        }),
      ),
    })),
  };
}

// ---------------------------------------------------------------------------
// Frame assembly integration (P6-FR-08)
// ---------------------------------------------------------------------------

export interface FrameAssemblyPlacement {
  instanceId: string;
  partId: string;
  bodyId: string;
  memberId: string;
}

export function frameAssemblyPlacements(
  group: FrameLayoutGroup,
): FrameAssemblyPlacement[] {
  return group.segments.map((segment) => ({
    instanceId: `frame:${group.id}:${segment.id}`,
    partId: segment.profileId,
    bodyId: `frame-body:${group.id}:${segment.id}`,
    memberId: segment.id,
  }));
}

export function frameAssemblyBomRows(
  group: FrameLayoutGroup,
  profiles: readonly FrameProfile[],
): Phase6Result<BomRow[]> {
  const cut = frameCutList(frameMembers(group), profiles);
  if (!cut.ok) return cut;
  return phase6Ok(cutListBomRows(cut.value, group.id));
}

export interface FrameAssemblyReconciliation {
  placements: FrameAssemblyPlacement[];
  added: FrameAssemblyPlacement[];
  updated: FrameAssemblyPlacement[];
  removed: string[];
}

/**
 * Diff the current frame against already-placed instances. Instance ids stay
 * stable across profile/geometry edits, so assembly BOM rows update in place
 * instead of being duplicated.
 */
export function reconcileFrameAssembly(
  previous: readonly FrameAssemblyPlacement[],
  group: FrameLayoutGroup,
): FrameAssemblyReconciliation {
  const next = frameAssemblyPlacements(group);
  const before = new Map(previous.map((entry) => [entry.instanceId, entry]));
  const after = new Map(next.map((entry) => [entry.instanceId, entry]));
  const added = next.filter((entry) => !before.has(entry.instanceId));
  const updated = next.filter((entry) => {
    const old = before.get(entry.instanceId);
    return (
      old !== undefined &&
      (old.partId !== entry.partId ||
        old.bodyId !== entry.bodyId ||
        old.memberId !== entry.memberId)
    );
  });
  const removed = previous
    .filter((entry) => !after.has(entry.instanceId))
    .map((entry) => entry.instanceId);
  return { placements: next, added, updated, removed };
}

// ---------------------------------------------------------------------------
// Surface body typing, curvature and persistence (P6-SU-01, P6-SU-12,
// P6-SU-15)
// ---------------------------------------------------------------------------

export interface SurfaceBodyStatus {
  solidOpsAllowed: boolean;
  reason: string | null;
}

export function surfaceBodyStatus(input: {
  kind: Phase6BodyKind;
  openShell: boolean;
  boundaryEdges: number;
}): SurfaceBodyStatus {
  if (input.openShell)
    return {
      solidOpsAllowed: false,
      reason: `open shell (${input.boundaryEdges} boundary edges)`,
    };
  if (input.kind === "surface")
    return {
      solidOpsAllowed: false,
      reason: "surface body; knit/convert to a solid first",
    };
  if (input.kind === "unknown")
    return { solidOpsAllowed: false, reason: "body kind is unknown" };
  return { solidOpsAllowed: true, reason: null };
}

export function assertSolidOperation(input: {
  kind: Phase6BodyKind;
  openShell: boolean;
  boundaryEdges: number;
}): Phase6Result<true> {
  const status = surfaceBodyStatus(input);
  return status.solidOpsAllowed
    ? phase6Ok(true)
    : phase6Fail("surface.solidOperation", status.reason ?? "not a solid");
}

export interface SurfaceBodyPresentation {
  doubleSided: boolean;
  boundaryEdgesVisible: boolean;
  opacity: number;
  sideLabel: string;
}

/** Presentation flags that keep open surfaces readable from both sides. */
export function surfaceBodyPresentation(input: {
  kind: Phase6BodyKind;
  openShell: boolean;
  boundaryEdges: number;
}): SurfaceBodyPresentation {
  const open = input.kind === "surface" || input.openShell;
  return {
    doubleSided: open,
    boundaryEdgesVisible: input.boundaryEdges > 0,
    opacity: open ? 0.82 : 1,
    sideLabel: open ? "Open surface · both sides" : "Closed body",
  };
}

export interface CurvatureOverlay {
  scale: number;
  min: number | null;
  max: number | null;
  colors: readonly string[];
  readout: string[];
}

const CURVATURE_COLORS = [
  "#2563eb",
  "#06b6d4",
  "#22c55e",
  "#eab308",
  "#ef4444",
] as const;

/** Map a signed curvature value into the overlay's blue→red ramp. */
export function curvatureSampleColor(
  value: number,
  min: number,
  max: number,
): string {
  if (!(max > min)) return CURVATURE_COLORS[2];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return CURVATURE_COLORS[
    Math.min(
      CURVATURE_COLORS.length - 1,
      Math.floor(t * CURVATURE_COLORS.length),
    )
  ]!;
}

/** Numeric and color-ramp data for a zebra/curvature readout. */
export function curvatureOverlay(
  report: CurvatureReport,
  scale = 1,
): CurvatureOverlay {
  const values = [
    report.minPrincipalPerMM,
    report.maxPrincipalPerMM,
    report.minGaussianPerMM2,
    report.maxGaussianPerMM2,
    report.minMeanPerMM,
    report.maxMeanPerMM,
  ].filter((value): value is number => value !== null);
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  return {
    scale,
    min,
    max,
    colors: CURVATURE_COLORS,
    readout: [
      `Principal ${report.minPrincipalPerMM ?? "n/a"} … ${report.maxPrincipalPerMM ?? "n/a"} /mm`,
      `Gaussian ${report.minGaussianPerMM2 ?? "n/a"} … ${report.maxGaussianPerMM2 ?? "n/a"} /mm²`,
      `Mean ${report.minMeanPerMM ?? "n/a"} … ${report.maxMeanPerMM ?? "n/a"} /mm`,
      `${report.sampleCount} samples · scale ${scale}`,
    ],
  };
}

export interface FrameEditorState {
  phase: "closed" | "editing";
  group: FrameLayoutGroup | null;
  error: string | null;
}

export const CLOSED_FRAME_EDITOR: FrameEditorState = {
  phase: "closed",
  group: null,
  error: null,
};

export function openFrameEditor(group: FrameLayoutGroup): FrameEditorState {
  return {
    phase: "editing",
    group: { ...group, segments: [...group.segments] },
    error: null,
  };
}

export function addFrameEditorSegment(
  state: FrameEditorState,
  segment: FrameLayoutSegment,
): FrameEditorState {
  if (!state.group) return { ...state, error: "no frame group is open" };
  const added = addFrameSegment(state.group, segment);
  return added.ok
    ? { ...state, group: added.value, error: null }
    : { ...state, error: added.errors[0]?.message ?? "invalid segment" };
}

export function removeFrameEditorSegment(
  state: FrameEditorState,
  segmentId: string,
): FrameEditorState {
  if (!state.group) return { ...state, error: "no frame group is open" };
  const removed = removeFrameSegment(state.group, segmentId);
  return removed.ok
    ? { ...state, group: removed.value, error: null }
    : { ...state, error: removed.errors[0]?.message ?? "unknown segment" };
}

export function applyFrameEditor(
  state: FrameEditorState,
): Phase6Result<FrameLayoutGroup> {
  if (!state.group) return phase6Fail("frameEditor", "no frame group is open");
  if (!state.group.name.trim())
    return phase6Fail("frameEditor.name", "group name is required");
  if (!state.group.segments.length)
    return phase6Fail("frameEditor.segments", "add at least one member");
  return phase6Ok({ ...state.group, segments: [...state.group.segments] });
}

export function cancelFrameEditor(): FrameEditorState {
  return CLOSED_FRAME_EDITOR;
}

export interface CurvatureReport {
  minPrincipalPerMM: number | null;
  maxPrincipalPerMM: number | null;
  minGaussianPerMM2: number | null;
  maxGaussianPerMM2: number | null;
  minMeanPerMM: number | null;
  maxMeanPerMM: number | null;
  sampleCount: number;
}

type Vec3 = [number, number, number];

function readMesh(out: BodyOutput): {
  positions: Vec3[];
  triangles: Array<[number, number, number]>;
} {
  const geometry = out.faceGeometry;
  const position = geometry?.attributes.position;
  const array = position?.array as ArrayLike<number> | undefined;
  if (!position || !array) return { positions: [], triangles: [] };
  const step = position.itemSize || 3;
  const index = geometry?.index?.array as ArrayLike<number> | undefined;
  const triangleCount = index
    ? Math.floor(index.length / 3)
    : Math.floor(position.count / 3);
  const positions: Vec3[] = [];
  const byKey = new Map<string, number>();
  const at = (vertexIndex: number): number => {
    const offset = vertexIndex * step;
    const point: Vec3 = [
      array[offset] ?? 0,
      array[offset + 1] ?? 0,
      array[offset + 2] ?? 0,
    ];
    const key = point.map((value) => value.toFixed(7)).join(",");
    const existing = byKey.get(key);
    if (existing !== undefined) return existing;
    const next = positions.length;
    byKey.set(key, next);
    positions.push(point);
    return next;
  };
  const triangles: Array<[number, number, number]> = [];
  for (let i = 0; i < triangleCount; i++) {
    const a = at(index ? Number(index[i * 3]) : i * 3);
    const b = at(index ? Number(index[i * 3 + 1]) : i * 3 + 1);
    const c = at(index ? Number(index[i * 3 + 2]) : i * 3 + 2);
    if (a !== b && b !== c && c !== a) triangles.push([a, b, c]);
  }
  return { positions, triangles };
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function length3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function angleAt(vertex: Vec3, a: Vec3, b: Vec3): number {
  const u = sub3(a, vertex);
  const v = sub3(b, vertex);
  const denominator = length3(u) * length3(v);
  if (!(denominator > 1e-12)) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot3(u, v) / denominator)));
}

function range(values: readonly number[]): [number, number] | null {
  if (!values.length) return null;
  return [Math.min(...values), Math.max(...values)];
}

/** Discrete angle-defect / umbrella estimate, in per-mm units. */
export function analyzeCurvature(out: BodyOutput): CurvatureReport {
  const { positions, triangles } = readMesh(out);
  if (!positions.length || !triangles.length) {
    return {
      minPrincipalPerMM: null,
      maxPrincipalPerMM: null,
      minGaussianPerMM2: null,
      maxGaussianPerMM2: null,
      minMeanPerMM: null,
      maxMeanPerMM: null,
      sampleCount: 0,
    };
  }
  const areas = new Float64Array(positions.length);
  const angleSums = new Float64Array(positions.length);
  const neighbors = positions.map(() => new Set<number>());
  for (const [ai, bi, ci] of triangles) {
    const a = positions[ai]!;
    const b = positions[bi]!;
    const c = positions[ci]!;
    const area = 0.5 * length3(cross3(sub3(b, a), sub3(c, a)));
    areas[ai] = (areas[ai] ?? 0) + area / 3;
    areas[bi] = (areas[bi] ?? 0) + area / 3;
    areas[ci] = (areas[ci] ?? 0) + area / 3;
    angleSums[ai] = (angleSums[ai] ?? 0) + angleAt(a, b, c);
    angleSums[bi] = (angleSums[bi] ?? 0) + angleAt(b, c, a);
    angleSums[ci] = (angleSums[ci] ?? 0) + angleAt(c, a, b);
    neighbors[ai]!.add(bi);
    neighbors[ai]!.add(ci);
    neighbors[bi]!.add(ai);
    neighbors[bi]!.add(ci);
    neighbors[ci]!.add(ai);
    neighbors[ci]!.add(bi);
  }
  const principal: number[] = [];
  const gaussian: number[] = [];
  const mean: number[] = [];
  for (let i = 0; i < positions.length; i++) {
    const area = areas[i]!;
    if (!(area > 1e-12)) continue;
    const p = positions[i]!;
    let lap: Vec3 = [0, 0, 0];
    for (const neighbor of neighbors[i]!) {
      const q = positions[neighbor]!;
      lap = [lap[0] + q[0] - p[0], lap[1] + q[1] - p[1], lap[2] + q[2] - p[2]];
    }
    const h = (0.5 * length3(lap)) / area;
    const k = (2 * Math.PI - angleSums[i]!) / area;
    const disc = Math.max(0, h * h - k);
    const k1 = h + Math.sqrt(disc);
    const k2 = h - Math.sqrt(disc);
    principal.push(k1 * 1000, k2 * 1000);
    gaussian.push(k * 1e6);
    mean.push(h * 1000);
  }
  const p = range(principal);
  const g = range(gaussian);
  const m = range(mean);
  return {
    minPrincipalPerMM: p ? p[0] : null,
    maxPrincipalPerMM: p ? p[1] : null,
    minGaussianPerMM2: g ? g[0] : null,
    maxGaussianPerMM2: g ? g[1] : null,
    minMeanPerMM: m ? m[0] : null,
    maxMeanPerMM: m ? m[1] : null,
    sampleCount: principal.length / 2,
  };
}

export {
  defaultSurfaceOptions,
  parseSurfaceOptions,
  serializeSurfaceOptions,
  validateSurfaceOptions,
} from "./phase6";
export type {
  SurfaceContinuity,
  SurfaceExtendContinuity,
  SurfaceOptions,
  SurfaceTrimKeep,
} from "./phase6";

// ---------------------------------------------------------------------------
// Conversion feature data and downstream checks (P6-CV-04, P6-CV-05)
// ---------------------------------------------------------------------------

export interface ConversionFeatureSpec {
  id: string;
  sourceBodyId: string;
  targetKind: "solid" | "surface";
  toleranceMM: number;
  sew: boolean;
  merge: boolean;
  status: "pending" | "ok" | "failed" | "suppressed";
  revision: number;
}

export function createConversionFeature(input: {
  id?: string;
  sourceBodyId: string;
  targetKind: "solid" | "surface";
  toleranceMM?: number;
  sew?: boolean;
  merge?: boolean;
}): Phase6Result<ConversionFeatureSpec> {
  if (!input.sourceBodyId.trim())
    return phase6Fail("conversion.sourceBodyId", "source body is required");
  const tolerance = input.toleranceMM ?? 0.01;
  if (!(tolerance >= 0))
    return phase6Fail(
      "conversion.toleranceMM",
      "tolerance must be non-negative",
    );
  return phase6Ok({
    id: input.id?.trim() || `conversion-${input.sourceBodyId}`,
    sourceBodyId: input.sourceBodyId.trim(),
    targetKind: input.targetKind,
    toleranceMM: tolerance,
    sew: input.sew ?? true,
    merge: input.merge ?? true,
    status: "pending",
    revision: 0,
  });
}

export function editConversionFeature(
  feature: ConversionFeatureSpec,
  patch: Partial<Omit<ConversionFeatureSpec, "id" | "revision">>,
): Phase6Result<ConversionFeatureSpec> {
  return createConversionFeature({ ...feature, ...patch, id: feature.id }).ok
    ? phase6Ok({
        ...feature,
        ...patch,
        status: "pending",
        revision: feature.revision + 1,
      })
    : createConversionFeature({ ...feature, ...patch, id: feature.id });
}

export function suppressConversionFeature(
  feature: ConversionFeatureSpec,
): ConversionFeatureSpec {
  return { ...feature, status: "suppressed", revision: feature.revision + 1 };
}

export function rebuildConversionFeature(
  feature: ConversionFeatureSpec,
): ConversionFeatureSpec {
  return { ...feature, status: "pending", revision: feature.revision + 1 };
}

export interface ConversionCompatibilityInput {
  bodyKind: Phase6BodyKind;
  openShell: boolean;
  volumeMM3: number | null;
  exportable: boolean;
}

export interface ConversionCompatibility {
  ok: boolean;
  issues: Phase6Issue[];
}

export interface ConversionDownstreamInput {
  bodyId: string;
  bodyKind: Phase6BodyKind;
  openShell: boolean;
  volumeMM3: number | null;
  exportable: boolean;
  bomBodyKind?: Phase6BodyKind;
  drawingViewCount?: number;
  stateRoundTrip: boolean;
}

export interface ConversionDownstreamReport {
  ok: boolean;
  checks: Record<
    | "measure"
    | "properties"
    | "export"
    | "assembly"
    | "bom"
    | "drawing"
    | "roundTrip",
    boolean
  >;
  issues: Phase6Issue[];
}

/** Gate a converted body before measure/BOM/drawing/export consumers use it. */
export function conversionDownstreamReport(
  input: ConversionDownstreamInput,
): ConversionDownstreamReport {
  const checks = {
    measure: input.bodyKind !== "unknown" && input.volumeMM3 !== null,
    properties: input.bodyKind !== "unknown" && !input.openShell,
    export: input.exportable,
    assembly: input.bodyId.trim().length > 0,
    bom: input.bomBodyKind === input.bodyKind,
    drawing: (input.drawingViewCount ?? 0) > 0,
    roundTrip: input.stateRoundTrip,
  };
  const issues: Phase6Issue[] = [];
  for (const [name, ok] of Object.entries(checks))
    if (!ok)
      issues.push({
        path: `conversion.downstream.${name}`,
        message: `${name} consumer is not compatible with this body`,
      });
  return { ok: issues.length === 0, checks, issues };
}

export function conversionCompatibility(
  input: ConversionCompatibilityInput,
): ConversionCompatibility {
  const issues: Phase6Issue[] = [];
  if (input.bodyKind === "unknown")
    issues.push({ path: "conversion.kind", message: "body kind is unknown" });
  if (input.bodyKind === "surface" && input.openShell)
    issues.push({
      path: "conversion.openShell",
      message: "surface body is open; knit/convert it first",
    });
  if (input.bodyKind === "solid" && input.volumeMM3 === null)
    issues.push({
      path: "conversion.volume",
      message: "solid has no computable volume",
    });
  if (!input.exportable)
    issues.push({
      path: "conversion.export",
      message: "body is not exportable",
    });
  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Dialog metadata and tree grouping (P6-SM-14, P6-FR-09, P6-INT-02,
// P6-INT-03)
// ---------------------------------------------------------------------------

export type Phase6DialogParameterKind =
  | "quantity"
  | "enum"
  | "boolean"
  | "string"
  | "selection";

export interface Phase6DialogParameter {
  parameterId: string;
  label: string;
  kind: Phase6DialogParameterKind;
  default?: string | number | boolean;
  units?: string;
  min?: number;
  options?: readonly string[];
}

export interface Phase6DialogSpec {
  featureType: string;
  label: string;
  selectionKind: Phase6SelectionKind | "mixed";
  parameters: readonly Phase6DialogParameter[];
  help: string;
}

const q = (
  parameterId: string,
  label: string,
  value: number,
  units = "m",
  min = 0,
): Phase6DialogParameter => ({
  parameterId,
  label,
  kind: "quantity",
  default: value,
  units,
  min,
});
const e = (
  parameterId: string,
  label: string,
  value: string,
  options: readonly string[],
): Phase6DialogParameter => ({
  parameterId,
  label,
  kind: "enum",
  default: value,
  options,
});
const b = (
  parameterId: string,
  label: string,
  value: boolean,
): Phase6DialogParameter => ({
  parameterId,
  label,
  kind: "boolean",
  default: value,
});
const s = (
  parameterId: string,
  label: string,
  value: string,
): Phase6DialogParameter => ({
  parameterId,
  label,
  kind: "string",
  default: value,
});

export const PHASE6_DIALOGS: readonly Phase6DialogSpec[] = [
  {
    featureType: "baseFlange",
    label: "Base flange",
    selectionKind: "sketchProfile",
    parameters: [
      q("thickness", "Thickness", 0.0015),
      e("direction", "Direction", "mid", ["positive", "negative", "mid"]),
      q("radius", "Bend radius", 0.0015),
      s("rule", "Rule", "default-sheet-metal"),
    ],
    help: "Create the first sheet-metal body from a closed profile.",
  },
  {
    featureType: "edgeFlange",
    label: "Edge flange",
    selectionKind: "edge",
    parameters: [
      q("angle", "Angle", Math.PI / 2, "rad"),
      q("length", "Length", 0.02),
      e("position", "Position", "inside", ["inside", "outside", "bend"]),
      q("radius", "Radius", 0.0015),
      q("relief", "Relief", 0.001),
    ],
    help: "Add a flange to one or more sheet-metal edges.",
  },
  {
    featureType: "bend",
    label: "Bend",
    selectionKind: "bendLine",
    parameters: [
      q("angle", "Angle", Math.PI / 2, "rad"),
      q("radius", "Radius", 0.0015),
      q("kFactor", "K-factor", 0.44, "", 0),
      e("fixedSide", "Fixed side", "positive", ["positive", "negative"]),
    ],
    help: "Bend along a sketch line or selected edge.",
  },
  {
    featureType: "corner",
    label: "Corner",
    selectionKind: "edge",
    parameters: [
      e("cornerType", "Type", "closed", [
        "closed",
        "open",
        "miter",
        "overlap",
        "underlap",
      ]),
      q("gap", "Gap", 0.0005),
      e("relief", "Relief", "rectangular", [
        "none",
        "rectangular",
        "round",
        "tear",
      ]),
    ],
    help: "Close or open the corner where sheet-metal flanges meet.",
  },
  {
    featureType: "louver",
    label: "Louver",
    selectionKind: "face",
    parameters: [
      q("length", "Length", 0.02),
      q("width", "Width", 0.004),
      q("depth", "Depth", 0.001),
      q("spacing", "Spacing", 0.006),
      q("angle", "Angle", Math.PI / 4, "rad"),
      q("count", "Count", 1, ""),
    ],
    help: "Form a louver as a sheet-metal form feature.",
  },
  {
    featureType: "hem",
    label: "Hem",
    selectionKind: "edge",
    parameters: [
      e("hemType", "Type", "closed", ["closed", "open", "rolled", "teardrop"]),
      q("length", "Length", 0.006),
      q("radius", "Radius", 0.001),
      q("gap", "Gap", 0),
    ],
    help: "Roll or fold a sheet-metal edge.",
  },
  {
    featureType: "flatPattern",
    label: "Flat pattern",
    selectionKind: "body",
    parameters: [
      s("fixedFace", "Fixed face", ""),
      s("bendTable", "Bend table", ""),
    ],
    help: "Unwrap the actual sheet-metal body with bend lines and allowances.",
  },
  {
    featureType: "relief",
    label: "Bend relief",
    selectionKind: "edge",
    parameters: [
      e("reliefType", "Type", "rectangular", ["rectangular", "round", "tear"]),
      e("placement", "Placement", "auto", ["auto", "corners", "manual"]),
      q("width", "Width", 0.001),
      q("depth", "Depth", 0.001),
    ],
    help: "Cut or form relief at bend ends so the flange can unfold.",
  },
  {
    featureType: "sheetMetalRule",
    label: "Sheet-metal rule",
    selectionKind: "body",
    parameters: [
      s("material", "Material", "steel"),
      q("thickness", "Thickness", 0.0015),
      q("radius", "Bend radius", 0.0015),
      q("kFactor", "K-factor", 0.44, "", 0),
      e("reliefType", "Relief", "rectangular", [
        "none",
        "rectangular",
        "round",
        "tear",
      ]),
      e("cornerType", "Corner", "closed", ["closed", "open", "miter"]),
    ],
    help: "Create or edit the material, thickness, bend and relief rule for a body.",
  },
  {
    featureType: "bendTable",
    label: "Bend table",
    selectionKind: "body",
    parameters: [s("csv", "CSV", ""), s("material", "Material", "steel")],
    help: "Import allowance/deduction rows keyed by material, thickness and radius.",
  },
  {
    featureType: "frame",
    label: "Frame",
    selectionKind: "framePath",
    parameters: [
      s("profile", "Profile", "square-40x40x3"),
      q("wall", "Wall", 0.003),
      s("group", "Group", "Frame group"),
      e("orientation", "Orientation", "z", ["x", "y", "z", "custom"]),
      b("merge", "Merge members", true),
    ],
    help: "Create an ordered frame group from sketch lines or 3D paths.",
  },
  {
    featureType: "structuralMember",
    label: "Structural member",
    selectionKind: "framePath",
    parameters: [
      s("profile", "Profile", "square-40x40x3"),
      q("wall", "Wall", 0.003),
      q("rotation", "Rotation", 0, "rad"),
      q("offset", "Offset", 0),
      e("endCondition", "End condition", "butt", [
        "butt",
        "miter",
        "trim",
        "extend",
      ]),
    ],
    help: "Generate a selectable member for one frame segment.",
  },
  {
    featureType: "knitSurface",
    label: "Knit / stitch",
    selectionKind: "surfaceBoundary",
    parameters: [
      q("tolerance", "Tolerance", 0.01, "mm"),
      b("createSolid", "Create solid when closed", true),
    ],
    help: "Stitch surface patches and report unstitched edges.",
  },
  {
    featureType: "trimSurface",
    label: "Trim surface",
    selectionKind: "surfaceBoundary",
    parameters: [
      e("tool", "Trim with", "plane", ["plane", "body", "surface", "curve"]),
      e("keep", "Keep", "positive", ["positive", "negative", "both"]),
    ],
    help: "Trim a surface and report a miss instead of returning the input.",
  },
  {
    featureType: "extendSurface",
    label: "Extend surface",
    selectionKind: "edge",
    parameters: [
      q("distance", "Distance", 0.01),
      e("continuity", "Continuity", "linear", ["linear", "natural"]),
    ],
    help: "Extend a surface edge linearly; natural continuation is reported as unsupported.",
  },
  {
    featureType: "thickenSurface",
    label: "Thicken surface",
    selectionKind: "body",
    parameters: [
      q("thickness", "Thickness", 0.002),
      e("direction", "Direction", "both", ["positive", "negative", "both"]),
      b("merge", "Merge", true),
    ],
    help: "Thicken an open surface and validate the closed volume.",
  },
  {
    featureType: "replaceFace",
    label: "Replace face",
    selectionKind: "face",
    parameters: [
      s("surface", "Surface", ""),
      e("continuity", "Continuity", "G0", ["G0", "G1", "G2"]),
      b("extend", "Extend surface", true),
    ],
    help: "Replace a solid face with a surface and fail on a clean intersection miss.",
  },
  {
    featureType: "boundarySurface",
    label: "Boundary surface",
    selectionKind: "surfaceBoundary",
    parameters: [
      e("continuity", "Continuity", "G1", ["G0", "G1", "G2"]),
      b("trim", "Trim boundaries", true),
    ],
    help: "Build a surface from multiple boundary curves and loops.",
  },
  {
    featureType: "surfaceLoft",
    label: "Surface loft",
    selectionKind: "sketchProfile",
    parameters: [
      e("continuity", "Continuity", "G1", ["G0", "G1", "G2"]),
      b("closed", "Closed loft", false),
      b("ruled", "Ruled", false),
    ],
    help: "Loft surface sections with optional guides and end conditions.",
  },
  {
    featureType: "surfaceFill",
    label: "Fill surface",
    selectionKind: "surfaceBoundary",
    parameters: [
      e("continuity", "Continuity", "G1", ["G0", "G1", "G2"]),
      b("trim", "Trim to boundary", true),
    ],
    help: "Fill a boundary with constraint curves and points.",
  },
  {
    featureType: "surfaceOffset",
    label: "Offset surface",
    selectionKind: "face",
    parameters: [
      q("distance", "Distance", 0.002),
      b("flip", "Flip direction", false),
      q("tolerance", "Tolerance", 0.01, "mm"),
    ],
    help: "Offset a surface while preserving the surface body kind.",
  },
  {
    featureType: "ruledSurface",
    label: "Ruled surface",
    selectionKind: "edge",
    parameters: [
      q("spans", "Spans", 1, "", 1),
      b("trim", "Trim to edges", true),
    ],
    help: "Create a ruled surface across one or more edge pairs.",
  },
  {
    featureType: "curvature",
    label: "Curvature analysis",
    selectionKind: "face",
    parameters: [
      q("scale", "Scale", 1, "", 0.1),
      b("zebra", "Zebra stripes", false),
    ],
    help: "Report principal, Gaussian and mean curvature with a color overlay.",
  },
  {
    featureType: "conversion",
    label: "Convert body",
    selectionKind: "body",
    parameters: [
      e("targetKind", "Target", "solid", ["solid", "surface"]),
      q("tolerance", "Tolerance", 0.01, "mm"),
      b("sew", "Sew", true),
      b("merge", "Merge", true),
    ],
    help: "Convert a body and expose the resulting body kind.",
  },
];

export function validatePhase6DialogSpec(
  spec: Phase6DialogSpec,
): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!spec.featureType.trim())
    issues.push({
      path: "dialog.featureType",
      message: "feature type is required",
    });
  if (!spec.label.trim())
    issues.push({ path: "dialog.label", message: "label is required" });
  if (!spec.help.trim())
    issues.push({ path: "dialog.help", message: "help text is required" });
  if (!spec.parameters.length)
    issues.push({
      path: "dialog.parameters",
      message: "at least one parameter is required",
    });
  const seen = new Set<string>();
  spec.parameters.forEach((parameter, index) => {
    if (!parameter.parameterId.trim() || seen.has(parameter.parameterId))
      issues.push({
        path: `dialog.parameters[${index}].parameterId`,
        message: "parameter id must be unique",
      });
    seen.add(parameter.parameterId);
    if (!parameter.label.trim())
      issues.push({
        path: `dialog.parameters[${index}].label`,
        message: "parameter label is required",
      });
    if (parameter.kind === "enum") {
      if (!parameter.options?.length)
        issues.push({
          path: `dialog.parameters[${index}].options`,
          message: "enum needs options",
        });
      else if (
        typeof parameter.default !== "string" ||
        !parameter.options.includes(parameter.default)
      )
        issues.push({
          path: `dialog.parameters[${index}].default`,
          message: "enum default must be one of its options",
        });
    }
    if (parameter.kind === "quantity") {
      if (
        typeof parameter.default !== "number" ||
        !Number.isFinite(parameter.default)
      )
        issues.push({
          path: `dialog.parameters[${index}].default`,
          message: "quantity default must be numeric",
        });
      else if (parameter.min !== undefined && parameter.default < parameter.min)
        issues.push({
          path: `dialog.parameters[${index}].default`,
          message: "quantity default is below its minimum",
        });
    }
  });
  return issues;
}

export function phase6DialogDisabledReason(
  spec: Phase6DialogSpec,
  input: {
    selectionCount: number;
    solidRequired?: boolean;
    hasSolid?: boolean;
  },
): string | null {
  if (spec.selectionKind !== "mixed" && input.selectionCount === 0)
    return `Select at least one ${phase6SelectionLabel(spec.selectionKind)}`;
  if (input.solidRequired && input.hasSolid === false)
    return "This feature requires a solid body; knit or convert the surface first";
  return null;
}

export interface Phase6ActionSpec {
  actionId: string;
  menuId: string;
  featureType: string;
  label: string;
  selectionKind: Phase6SelectionKind | "mixed";
  vrMode: "dialog";
}

export const PHASE6_ACTIONS: readonly Phase6ActionSpec[] = PHASE6_DIALOGS.map(
  (spec) => ({
    actionId: `phase6.${spec.featureType}`,
    menuId: `phase6-${spec.featureType.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
    featureType: spec.featureType,
    label: spec.label,
    selectionKind: spec.selectionKind,
    vrMode: "dialog" as const,
  }),
);

export function phase6ActionForFeature(
  featureType: string,
): Phase6ActionSpec | null {
  return (
    PHASE6_ACTIONS.find((action) => action.featureType === featureType) ?? null
  );
}

export function phase6DialogFor(featureType: string): Phase6DialogSpec | null {
  return (
    PHASE6_DIALOGS.find((spec) => spec.featureType === featureType) ?? null
  );
}
