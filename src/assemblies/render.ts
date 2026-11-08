// Viewport-facing assembly render plan. The model stays pure; this module
// groups repeated bodies into instanced batches and chooses a distance LOD.
// `simpleCadScene` executes the plan with THREE.InstancedMesh.

import type { PlacedInstance } from "./model";

export type AssemblyLod = "full" | "reduced" | "proxy";

export interface AssemblyRenderLeaf {
  instanceId: string;
  bodyId?: string;
  instance: PlacedInstance["instance"];
  transform: number[];
  distance: number;
  lod: AssemblyLod;
}

export interface AssemblyRenderGroup {
  key: string;
  bodyId: string;
  lod: AssemblyLod;
  leaves: AssemblyRenderLeaf[];
}

export interface AssemblyRenderPlan {
  leaves: AssemblyRenderLeaf[];
  groups: AssemblyRenderGroup[];
  /** Bodies that occur more than once and can use one InstancedMesh. */
  repeatedBodies: number;
  /** Extra leaves that do not need a per-leaf clone. */
  instancedLeaves: number;
  lodCounts: Record<AssemblyLod, number>;
}

/** LOD thresholds are metres from the camera to the leaf origin. */
export const ASSEMBLY_LOD_DISTANCE = {
  full: 0.8,
  reduced: 2.2,
} as const;

export function assemblyLodForDistance(distance: number): AssemblyLod {
  if (!Number.isFinite(distance) || distance <= ASSEMBLY_LOD_DISTANCE.full)
    return "full";
  if (distance <= ASSEMBLY_LOD_DISTANCE.reduced) return "reduced";
  return "proxy";
}

function leafPoint(leaf: PlacedInstance): [number, number, number] {
  return [
    leaf.transform[3] ?? 0,
    leaf.transform[7] ?? 0,
    leaf.transform[11] ?? 0,
  ];
}

/**
 * Pick a LOD and group repeated bodies. Explode is handled by the scene before
 * this runs, so `transform` is already the final placement.
 */
export function planAssemblyRender(
  leaves: readonly PlacedInstance[],
  cameraPosition: readonly [number, number, number],
  lodForDistance: (distance: number) => AssemblyLod = assemblyLodForDistance,
): AssemblyRenderPlan {
  const camera = cameraPosition;
  const out: AssemblyRenderLeaf[] = [];
  for (const leaf of leaves) {
    if (!leaf.visible) continue;
    const [x, y, z] = leafPoint(leaf);
    const distance = Math.hypot(x - camera[0], y - camera[1], z - camera[2]);
    out.push({
      instanceId: leaf.instanceId,
      ...(leaf.bodyId ? { bodyId: leaf.bodyId } : {}),
      instance: leaf.instance,
      transform: leaf.transform,
      distance,
      lod: lodForDistance(distance),
    });
  }
  const byBody = new Map<string, Map<AssemblyLod, AssemblyRenderLeaf[]>>();
  for (const leaf of out) {
    const bodyId = leaf.bodyId ?? leaf.instanceId;
    const tiers =
      byBody.get(bodyId) ?? new Map<AssemblyLod, AssemblyRenderLeaf[]>();
    const tier = tiers.get(leaf.lod) ?? [];
    tier.push(leaf);
    tiers.set(leaf.lod, tier);
    byBody.set(bodyId, tiers);
  }
  const groups: AssemblyRenderGroup[] = [];
  for (const [bodyId, tiers] of byBody) {
    for (const [lod, tierLeaves] of tiers) {
      groups.push({
        key: `${bodyId}:${lod}`,
        bodyId,
        lod,
        leaves: tierLeaves,
      });
    }
  }
  const lodCounts: Record<AssemblyLod, number> = {
    full: 0,
    reduced: 0,
    proxy: 0,
  };
  for (const leaf of out) lodCounts[leaf.lod]++;
  const repeatedBodies = [...byBody.values()].filter(
    (tiers) =>
      [...tiers.values()].reduce((sum, tier) => sum + tier.length, 0) > 1,
  ).length;
  return {
    leaves: out,
    groups,
    repeatedBodies,
    instancedLeaves: Math.max(0, out.length - byBody.size),
    lodCounts,
  };
}
