// VR node builder: turns any featureType from FEATURE_MAP into a
// ScadgenFeatureNode with sensible defaults, resolving provenance
// (last sketch / last body / all edges) from the history tree.
// Mirrors the trigger defaults already hard-coded in useVRSession.ts
// (extrude 10 mm, fillet 5 mm, revolve 360°).
import {
  buildChamferNode,
  buildExtrudeNode,
  buildFilletNode,
  buildLoftNode,
  buildMirrorNode,
  buildRevolveNode,
  buildSweepNode,
  type ProvenanceQuery,
  type ScadgenFeatureNode,
} from "./onshapeHistory";
import { scadgenHistory, type ScadgenHistory } from "./featureEngine";

function lastSketch(history: ScadgenHistory): ScadgenFeatureNode | null {
  return (
    history
      .evaluatedNodes()
      .filter(
        (n) =>
          n.featureType === "newSketch" && Boolean(n.extensions?.elementNodeId),
      )
      .pop() ?? null
  );
}

function lastBody(history: ScadgenHistory): ScadgenFeatureNode | null {
  const bodyTypes = new Set([
    "extrude",
    "revolve",
    "sweep",
    "loft",
    "fillet",
    "chamfer",
    "boolean",
    "shell",
    "thicken",
    "draft",
    "hole",
    "pattern",
    "mirror",
    "moveFace",
    "deleteFace",
    "split",
    "surface",
    "wrap",
    "thread",
    "flange",
    "hem",
    "unfold",
    "scale",
    "featurePattern",
  ]);
  return (
    history
      .evaluatedNodes()
      .filter(
        (n) =>
          bodyTypes.has(n.featureType) && Boolean(n.extensions?.elementNodeId),
      )
      .pop() ?? null
  );
}

function bodyQuery(f: ScadgenFeatureNode): ProvenanceQuery {
  return {
    entityType: "FACE",
    historyType: "CREATION",
    creationFeatureId: f.featureId,
    entityTag: "",
  };
}

function edgeAllQuery(f: ScadgenFeatureNode): ProvenanceQuery {
  return {
    entityType: "EDGE",
    historyType: "CREATION",
    creationFeatureId: f.featureId,
    entityTag: "ALL",
  };
}

function sketchEntityQueries(f: ScadgenFeatureNode): ProvenanceQuery[] {
  const p = f.parameters.find(
    (x) => x.kind === "queryList" && x.parameterId === "entities",
  );
  return p && p.kind === "queryList" ? p.queries : [];
}

function firstSketchLineId(f: ScadgenFeatureNode): string | undefined {
  const prims = (f.extensions as Record<string, unknown> | undefined)
    ?.sketch as
    | { primitives: Array<{ type: string; id?: string }> }
    | undefined;
  return prims?.primitives?.find((p) => p.type === "line")?.id;
}

export function buildVRNode(
  featureType: string,
  name: string,
  history: ScadgenHistory = scadgenHistory,
): ScadgenFeatureNode | null {
  const id = `__vr_${featureType}_${Date.now()}`;
  switch (featureType) {
    case "extrude": {
      const s = lastSketch(history);
      if (!s) return null;
      return buildExtrudeNode(id, name, sketchEntityQueries(s), {
        value: 0.01,
        units: "m",
        expression: "10 mm",
      });
    }
    case "revolve": {
      const s = lastSketch(history);
      if (!s) return null;
      const lineId = firstSketchLineId(s);
      return buildRevolveNode(
        id,
        name,
        sketchEntityQueries(s),
        [
          {
            entityType: "SKETCH_ENTITY",
            historyType: "CREATION",
            creationFeatureId: lineId ? s.featureId : null,
            entityTag: lineId ?? "NORMAL",
          },
        ],
        { value: Math.PI * 2, units: "rad", expression: "360 deg" },
      );
    }
    case "sweep": {
      const sketches = history
        .evaluatedNodes()
        .filter(
          (n) =>
            n.featureType === "newSketch" &&
            Boolean(n.extensions?.elementNodeId),
        );
      if (sketches.length < 2) return null;
      const profile = sketches[sketches.length - 2]!;
      const path = sketches[sketches.length - 1]!;
      return buildSweepNode(
        id,
        name,
        sketchEntityQueries(profile),
        sketchEntityQueries(path),
      );
    }
    case "loft": {
      const bodies = history
        .evaluatedNodes()
        .filter(
          (n) =>
            ["extrude", "revolve", "sweep", "loft", "fillet"].includes(
              n.featureType,
            ) && Boolean(n.extensions?.elementNodeId),
        );
      if (bodies.length < 2) return null;
      const a = bodies[bodies.length - 2]!;
      const b = bodies[bodies.length - 1]!;
      return buildLoftNode(id, name, [bodyQuery(a), bodyQuery(b)]);
    }
    case "fillet": {
      const b = lastBody(history);
      if (!b) return null;
      return buildFilletNode(id, name, [edgeAllQuery(b)], {
        value: 0.005,
        units: "m",
        expression: "5 mm",
      });
    }
    case "chamfer": {
      const b = lastBody(history);
      if (!b) return null;
      return buildChamferNode(id, name, [edgeAllQuery(b)], "DIST_DISTS", {
        value: 0.005,
        units: "m",
        expression: "5 mm",
      });
    }
    case "mirror": {
      const b = lastBody(history);
      if (!b) return null;
      return buildMirrorNode(id, name, [bodyQuery(b)], []);
    }
    case "boolean":
    case "shell":
    case "thicken":
    case "draft":
    case "hole":
    case "pattern":
    case "moveFace":
    case "deleteFace":
    case "split":
    case "section":
    case "projectCurves":
    case "curveOnFace":
    case "surface":
    case "wrap":
    case "thread":
    case "flange":
    case "hem":
    case "unfold":
    case "createPlane":
    case "scale":
    case "constraint":
    case "variable":
    case "featurePattern":
    case "insertedBody":
    case "newSketch":
    default:
      return null;
  }
}

export function buildableFeatureTypes(): string[] {
  return ["extrude", "revolve", "sweep", "loft", "fillet", "chamfer", "mirror"];
}

export function buildVRNodeOrMode(
  featureType: string,
  name: string,
  history: ScadgenHistory = scadgenHistory,
):
  | { kind: "node"; node: ScadgenFeatureNode }
  | { kind: "mode"; mode: string }
  | null {
  const node = buildVRNode(featureType, name, history);
  if (node) return { kind: "node", node };
  // Non-auto-build ops fall back to a SceneMode if one exists.
  const modeMap: Record<string, string> = {
    shell: "combine",
    measure: "measure",
    newSketch: "sketch",
    sketch: "sketch",
  };
  const mode = modeMap[featureType];
  return mode ? { kind: "mode", mode } : null;
}
