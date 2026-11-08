// Measured frame pipeline budget: member generation, joints, cut list and BOM.
// This intentionally reports model times separately from geometry/kernel time.
import {
  frameCutList,
  type FrameMember,
  type FrameProfile,
  type Phase6Result,
} from "./phase6";
import { frameAssemblyBomRows, type FrameLayoutGroup } from "./phase6b";
import {
  frameJointGeometry,
  generateStructuralMembers,
  type FrameJointSpec,
} from "./phase6FeatureSpecs";

export const FRAME_PERFORMANCE_BUDGET_MS = {
  generation: 50,
  joints: 50,
  cutList: 50,
  bom: 50,
  total: 250,
} as const;

export interface FramePerformanceReport {
  memberCount: number;
  jointCount: number;
  cutListRows: number;
  bomRows: number;
  timings: {
    generation: number;
    joints: number;
    cutList: number;
    bom: number;
    total: number;
  };
  budget: typeof FRAME_PERFORMANCE_BUDGET_MS;
  budgetMet: boolean;
}

const now = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export function measureFramePipeline(
  group: FrameLayoutGroup,
  profiles: readonly FrameProfile[],
  joints: readonly FrameJointSpec[] = [],
): Phase6Result<FramePerformanceReport> {
  const started = now();
  const generated = generateStructuralMembers(
    group,
    [],
    profiles.map((profile) => profile.id),
  );
  if (!generated.ok) return generated;
  const afterGeneration = now();

  for (const joint of joints) {
    const result = frameJointGeometry(generated.value, joint);
    if (!result.ok) return result;
  }
  const afterJoints = now();

  const members: FrameMember[] = generated.value.map((member) => ({
    id: member.id,
    profileId: member.profileId,
    groupId: member.groupId,
    startMM: member.startMM,
    endMM: member.endMM,
    startAngleDeg: member.startAngleDeg,
    endAngleDeg: member.endAngleDeg,
  }));
  const cutList = frameCutList(members, profiles);
  if (!cutList.ok) return cutList;
  const afterCutList = now();

  const bom = frameAssemblyBomRows(group, profiles);
  if (!bom.ok) return bom;
  const finished = now();

  const timings = {
    generation: afterGeneration - started,
    joints: afterJoints - afterGeneration,
    cutList: afterCutList - afterJoints,
    bom: finished - afterCutList,
    total: finished - started,
  };
  return {
    ok: true,
    value: {
      memberCount: generated.value.length,
      jointCount: joints.length,
      cutListRows: cutList.value.length,
      bomRows: bom.value.length,
      timings,
      budget: FRAME_PERFORMANCE_BUDGET_MS,
      budgetMet:
        timings.total <= FRAME_PERFORMANCE_BUDGET_MS.total &&
        timings.generation <= FRAME_PERFORMANCE_BUDGET_MS.generation &&
        timings.joints <= FRAME_PERFORMANCE_BUDGET_MS.joints &&
        timings.cutList <= FRAME_PERFORMANCE_BUDGET_MS.cutList &&
        timings.bom <= FRAME_PERFORMANCE_BUDGET_MS.bom,
    },
  };
}
