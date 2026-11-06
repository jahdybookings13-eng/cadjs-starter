import { beforeEach, describe, expect, it } from "vitest";
import { ScadgenHistory } from "../featureEngine";
import {
  buildSketchNode,
  buildExtrudeNode,
  provenanceForFeature,
} from "../onshapeHistory";
import {
  buildVRNode,
  buildVRNodeOrMode,
  buildableFeatureTypes,
} from "../vrNodeBuilder";
import { FEATURE_MAP, allFeatureTypes, gapTypes, feature } from "../featureMap";

const plane = {
  type: "XY" as const,
  origin: [0, 0, 0],
  normal: [0, 0, 1],
  xAxis: [1, 0, 0],
  yAxis: [0, 1, 0],
};
const primitives = [
  { type: "point", id: "p1", x: 0, y: 0 },
  { type: "point", id: "p2", x: 0.05, y: 0 },
  { type: "point", id: "p3", x: 0.05, y: 0.05 },
];

const sketchNode = (fid: string) => {
  const n = buildSketchNode(fid, fid, ["ln1"], null, {
    id: fid,
    plane,
    primitives,
    constraints: [],
  });
  n.extensions = { ...(n.extensions ?? {}), elementNodeId: `el_${fid}` };
  return n;
};

const bodyNode = (fid: string) => {
  const n = buildExtrudeNode(
    fid,
    fid,
    [provenanceForFeature("Fsk_src", "SKETCH_ENTITY", "ln1")],
    { value: 0.01, units: "m", expression: "10 mm" },
  );
  n.extensions = { ...(n.extensions ?? {}), elementNodeId: `el_${fid}` };
  return n;
};

describe("featureMap catalog", () => {
  it("has unique featureTypes", () => {
    const ids = allFeatureTypes();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks kernel ops for implemented ops", () => {
    expect(feature("extrude")?.kernelOp).toBe("extrude");
    expect(feature("fillet")?.kernelOp).toBe("fillet");
    expect(feature("boolean")?.kernelOp).toBe("boolean");
  });

  it("gaps have no kernel op", () => {
    for (const t of gapTypes()) expect(feature(t)?.kernelOp ?? null).toBeNull();
  });
});

describe("buildVRNode", () => {
  let h: ScadgenHistory;
  beforeEach(() => {
    h = new ScadgenHistory();
  });

  it("returns null when no sketch is mapped", () => {
    expect(buildVRNode("extrude", "Extrude", h)).toBeNull();
    expect(buildVRNodeOrMode("extrude", "Extrude", h)).toBeNull();
  });

  it("builds an extrude from the last mapped sketch (10 mm default)", () => {
    h.add(sketchNode("Fsk1"));
    const node = buildVRNode("extrude", "Extrude", h);
    expect(node?.featureType).toBe("extrude");
    const depth = node?.parameters.find(
      (p) => p.kind === "quantity" && p.parameterId === "depth",
    );
    expect(depth?.kind === "quantity" && depth.expression).toBe("10 mm");
  });

  it("maps newSketch to the sketch mode", () => {
    expect(buildVRNodeOrMode("newSketch", "Sketch", h)).toEqual({
      kind: "mode",
      mode: "sketch",
    });
  });

  it("maps measure and shell to modes", () => {
    expect(buildVRNodeOrMode("measure", "Measure", h)).toEqual({
      kind: "mode",
      mode: "measure",
    });
    expect(buildVRNodeOrMode("shell", "Shell", h)).toEqual({
      kind: "mode",
      mode: "combine",
    });
  });

  it("builds a chamfer from the last body (all edges)", () => {
    h.add(bodyNode("Fbod1"));
    const node = buildVRNode("chamfer", "Chamfer", h);
    expect(node?.featureType).toBe("chamfer");
    const edges = node?.parameters.find((p) => p.kind === "queryList");
    expect(edges?.kind === "queryList" && edges.queries[0]?.entityTag).toBe(
      "ALL",
    );
    expect(
      edges?.kind === "queryList" && edges.queries[0]?.creationFeatureId,
    ).toBe("Fbod1");
  });

  it("builds a mirror from the last body", () => {
    h.add(bodyNode("Fbod2"));
    expect(buildVRNode("mirror", "Mirror", h)?.featureType).toBe("mirror");
  });

  it("builds a fillet from the last body", () => {
    h.add(bodyNode("Fbod3"));
    expect(buildVRNode("fillet", "Fillet", h)?.featureType).toBe("fillet");
  });

  it("needs two bodies to loft", () => {
    h.add(bodyNode("FbodA"));
    expect(buildVRNode("loft", "Loft", h)).toBeNull();
    h.add(bodyNode("FbodB"));
    expect(buildVRNode("loft", "Loft", h)?.featureType).toBe("loft");
  });

  it("exposes the buildable set", () => {
    expect(buildableFeatureTypes()).toEqual([
      "extrude",
      "revolve",
      "sweep",
      "loft",
      "fillet",
      "chamfer",
      "mirror",
    ]);
  });
});
