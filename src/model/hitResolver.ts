import { scadgenExecutor } from "./executor";
import { scadgenSceneSync } from "./sceneSync";
import { faceTagForTriangle } from "./subPrimBridge";

type V3 = { x: number; y: number; z: number };

export interface HitResolution {
  featureId: string;
  faceTag: string;
}

export interface HitResolverDeps {
  featureForElement: (nodeId: string) => string | null;
  outputs: Map<
    string,
    {
      brep: unknown;
      featureId: string;
      additionalBodies?: Array<{ brep: unknown; featureId: string }>;
    }
  >;
}

const defaultDeps: HitResolverDeps = {
  featureForElement: (nodeId) => scadgenSceneSync.featureForElement(nodeId),
  outputs: scadgenExecutor.outputs as unknown as HitResolverDeps["outputs"],
};

/** Maps a raycast hit (element nodeId + mesh-local triangle) to the
 *  persistent model-side face tag. Sibling bodies (`fid#k`) are searched
 *  too, since they share the element's nodeId→feature mapping base. */
export function resolveHitToTag(
  nodeId: string,
  tri: [V3, V3, V3] | undefined,
  deps: HitResolverDeps = defaultDeps,
): HitResolution | null {
  if (!tri) return null;
  const fid = deps.featureForElement(nodeId);
  if (!fid) return null;
  const out = deps.outputs.get(fid);
  if (!out) return null;
  const bodies = [out, ...(out.additionalBodies ?? [])];
  for (const body of bodies) {
    const tag = faceTagForTriangle(
      body.brep as Parameters<typeof faceTagForTriangle>[0],
      tri,
      body.featureId,
    );
    if (tag) return { featureId: body.featureId, faceTag: tag };
  }
  return null;
}
