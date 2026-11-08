import { describe, expect, it } from "vitest";
import {
  bridgePoints,
  buildBossFeatureNode,
  buildBridgingCurveNode,
  buildCoilFeatureNode,
  buildDeriveNode,
  buildDomeFeatureNode,
  buildEmbossNode,
  buildEncloseNode,
  buildFitSplineNode,
  buildGussetFeatureNode,
  buildHelixCurveNode,
  buildRibFeatureNode,
  buildWebFeatureNode,
  coilPathPoints,
  curvePoints,
  expandFeatureMacro,
  fitSplinePolyline,
  parseEmbossPolylines,
  recognizeImportedBrep,
} from "../featuresF";
import { feature } from "../featureMap";

const planeOrigin = (node: { extensions?: unknown }) => {
  const ext = node.extensions as
    | { sketch?: { plane?: { origin?: number[] } } }
    | undefined;
  return ext?.sketch?.plane?.origin ?? null;
};

const points = (node: { extensions?: unknown }) => {
  const ext = node.extensions as
    | {
        sketch?: {
          primitives?: Array<{ type: string; x?: number; y?: number }>;
        };
      }
    | undefined;
  return (ext?.sketch?.primitives ?? []).filter((p) => p.type === "point");
};

describe("F macro features", () => {
  it("builds a rib with a target and draft/flip/merge params", () => {
    const node = buildRibFeatureNode("R1", "Rib", "B1", {
      x1: 0,
      y1: 0,
      x2: 0.04,
      y2: 0,
      thickness: 0.004,
      depth: 0.02,
      draftAngle: 0.05,
      flip: true,
    });
    expect(node.featureType).toBe("rib");
    expect(node.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parameterId: "targets" }),
        expect.objectContaining({ parameterId: "depth", value: 0.02 }),
        expect.objectContaining({ parameterId: "flip", value: true }),
        expect.objectContaining({ parameterId: "merge", value: true }),
        expect.objectContaining({ parameterId: "draftAngle", value: 0.05 }),
      ]),
    );
  });

  it("expands a merged rib into sketch, extrude and boolean union", () => {
    const node = buildRibFeatureNode("R1", "Rib", "B1", {
      thickness: 0.004,
      depth: 0.02,
    });
    const chain = expandFeatureMacro(node);
    expect(chain.map((n) => n.featureType)).toEqual([
      "newSketch",
      "extrude",
      "boolean",
    ]);
    expect(chain[2]?.featureId).toBe("R1_bool");
    const pts = points(chain[0]!);
    // Horizontal line from 0 to 0.04, 4 mm thick => ±2 mm in Y.
    expect(pts.find((p) => p.type === "point" && p.x === 0.04)).toBeTruthy();
    expect(pts.some((p) => Math.abs((p.y ?? 0) - 0.002) < 1e-9)).toBe(true);
    expect(pts.some((p) => Math.abs((p.y ?? 0) + 0.002) < 1e-9)).toBe(true);
  });

  it("expands an unmerged rib without a boolean", () => {
    const node = buildRibFeatureNode("R1", "Rib", null, { merge: false });
    expect(expandFeatureMacro(node).map((n) => n.featureType)).toEqual([
      "newSketch",
      "extrude",
    ]);
  });

  it("gusset uses a closed triangle profile", () => {
    const node = buildGussetFeatureNode("G1", "Gusset", "B1", {
      x2: 0.03,
      depth: 0.03,
    });
    expect(node.featureType).toBe("gusset");
    const chain = expandFeatureMacro(node);
    const sketch = chain[0]!;
    const ext = sketch.extensions as {
      sketch: { primitives: Array<{ type: string; id: string }> };
    };
    const lines = ext.sketch.primitives.filter((p) => p.type === "line");
    expect(lines.map((l) => l.id).sort()).toEqual(["l1", "l2", "l3"]);
  });

  it("web is a rib with web defaults and the web feature type", () => {
    const node = buildWebFeatureNode("W1", "Web", "B1");
    expect(node.featureType).toBe("web");
    expect(
      node.parameters.find((p) => p.parameterId === "thickness"),
    ).toMatchObject({ value: 0.006 });
  });

  it("boss places the circle at the target's top centre", () => {
    const node = buildBossFeatureNode("B1", "Boss", "T1", {
      diameter: 0.01,
      height: 0.008,
    });
    const chain = expandFeatureMacro(node, {
      min: [0, 0, 0],
      max: [0.05, 0.04, 0.02],
    });
    expect(chain.map((n) => n.featureType)).toEqual([
      "newSketch",
      "extrude",
      "boolean",
    ]);
    expect(planeOrigin(chain[0]!)).toEqual([0.025, 0.02, 0.02]);
  });

  it("dome builds a closed quarter-ellipse revolve profile", () => {
    const node = buildDomeFeatureNode("D1", "Dome", null, {
      radius: 0.02,
      height: 0.015,
      merge: false,
    });
    const chain = expandFeatureMacro(node);
    expect(chain.map((n) => n.featureType)).toEqual(["newSketch", "revolve"]);
    const sketch = chain[0]!;
    const ext = sketch.extensions as {
      sketch: { primitives: Array<{ type: string; id: string }> };
    };
    const ids = ext.sketch.primitives
      .filter((p) => p.type === "line")
      .map((p) => p.id);
    expect(ids).toContain("ltop");
    expect(ids).toContain("lbase");
    expect(ids.filter((id) => id.startsWith("e")).length).toBe(16);
  });

  it("emboss is a wrap node in EMBOSS mode with parsed polylines", () => {
    const node = buildEmbossNode("E1", "Logo", "B1", [
      [
        [0, 0],
        [0.01, 0],
        [0.01, 0.01],
      ],
    ]);
    expect(node.featureType).toBe("wrap");
    expect(
      node.parameters.find((p) => p.parameterId === "operation"),
    ).toMatchObject({ value: "EMBOSS" });
    expect(parseEmbossPolylines(node)).toHaveLength(1);
  });

  it("builds a true 3D helix path for the coil feature", () => {
    const node = buildCoilFeatureNode("C1", "Spring", null, {
      radius: 0.02,
      pitch: 0.005,
      turns: 4,
      hand: "right",
    });
    const points = coilPathPoints(node);
    expect(points.length).toBeGreaterThan(100);
    expect(points[0]?.[0]).toBeCloseTo(0.02, 6);
    expect(points[0]?.[2]).toBeCloseTo(0, 6);
    const last = points[points.length - 1]!;
    expect(last[2]).toBeCloseTo(0.02, 6);
    // Left hand reverses the tangential direction.
    const left = buildCoilFeatureNode("C2", "Spring", null, {
      radius: 0.02,
      pitch: 0.005,
      turns: 1,
      hand: "left",
    });
    const lp = coilPathPoints(left);
    expect(lp[8]?.[1]).toBeLessThan(0);
  });

  it("spring presets set pitch/turns while explicit values win", () => {
    const preset = buildCoilFeatureNode("C1", "Spring", null, {
      preset: "compression",
    });
    expect(
      preset.parameters.find((p) => p.parameterId === "turns"),
    ).toMatchObject({ value: 8 });
    const explicit = buildCoilFeatureNode("C2", "Spring", null, {
      preset: "compression",
      turns: 3,
    });
    expect(
      explicit.parameters.find((p) => p.parameterId === "turns"),
    ).toMatchObject({ value: 3 });
  });

  it("names bad profiles instead of emitting empty geometry", () => {
    expect(() =>
      expandFeatureMacro(
        buildRibFeatureNode("R1", "Rib", null, { thickness: 0 }),
      ),
    ).toThrow(/thickness must be > 0/);
    expect(() =>
      expandFeatureMacro(
        buildRibFeatureNode("R1", "Rib", null, { x1: 1, x2: 1, y1: 1, y2: 1 }),
      ),
    ).toThrow(/zero length/);
    expect(() =>
      expandFeatureMacro(
        buildBossFeatureNode("B1", "Boss", null, { diameter: 0 }),
      ),
    ).toThrow(/diameter must be > 0/);
    expect(() =>
      expandFeatureMacro(
        buildDomeFeatureNode("D1", "Dome", null, { height: 0 }),
      ),
    ).toThrow(/height must be > 0/);
    expect(() =>
      parseEmbossPolylines(buildEmbossNode("E1", "Logo", "B1", [])),
    ).toThrow(/non-empty list of 2D paths/);
    expect(() =>
      coilPathPoints(buildCoilFeatureNode("C1", "Spring", null, { pitch: 0 })),
    ).toThrow(/pitch must be > 0/);
  });

  it("exposes the coil path as a standalone helix curve", () => {
    const node = buildHelixCurveNode("H1", "Helix", {
      radius: 0.01,
      pitch: 0.002,
      turns: 2,
    });
    expect(node.featureType).toBe("helixCurve");
    const pts = coilPathPoints(node);
    expect(pts[0]?.[0]).toBeCloseTo(0.01, 6);
    expect(pts[pts.length - 1]?.[2]).toBeCloseTo(0.004, 6);
  });

  it("fit spline parses its points and interpolates through them", () => {
    const node = buildFitSplineNode("F1", "Spline", [
      [0, 0, 0],
      [0.01, 0, 0],
      [0.02, 0.01, 0],
    ]);
    const pts = curvePoints(node);
    expect(pts).toHaveLength(3);
    const poly = fitSplinePolyline(pts);
    expect(poly[0]).toEqual([0, 0, 0]);
    expect(poly[poly.length - 1]).toEqual([0.02, 0.01, 0]);
    expect(poly).toHaveLength(17);
    expect(() =>
      curvePoints(buildFitSplineNode("F2", "Bad", [[0, 0, 0]])),
    ).toThrow(/two 3D points/);
  });

  it("bridging curve parses its two 3D endpoints", () => {
    const node = buildBridgingCurveNode(
      "B1",
      "Bridge",
      [0, 0, 0],
      [0, 0.02, 0.01],
    );
    expect(bridgePoints(node)).toEqual([
      [0, 0, 0],
      [0, 0.02, 0.01],
    ]);
    const bad = buildBridgingCurveNode(
      "B2",
      "Bad",
      [0, 0] as unknown as [number, number, number],
      [1, 0, 0],
    );
    expect(() => bridgePoints(bad)).toThrow(/x,y,z/);
  });

  it("enclose and derive nodes carry the params the executor reads", () => {
    const enc = buildEncloseNode("E1", "Endcap", "B1", ["B1_E0", "B1_E1"]);
    expect(enc.featureType).toBe("surface");
    expect(enc.parameters.find((p) => p.parameterId === "kind")).toMatchObject({
      value: "fill",
    });
    expect(
      enc.parameters.find((p) => p.parameterId === "edgeTags"),
    ).toMatchObject({ value: JSON.stringify(["B1_E0", "B1_E1"]) });

    const der = buildDeriveNode("D1", "Derive", {
      sourceTab: "tab_1",
      sourceFeature: "B1",
    });
    expect(der.featureType).toBe("derive");
    expect(
      der.parameters.find((p) => p.parameterId === "sourceTab"),
    ).toMatchObject({ value: "tab_1" });
    expect(
      der.parameters.find((p) => p.parameterId === "sourceFeature"),
    ).toMatchObject({ value: "B1" });
    expect(der.parameters.find((p) => p.parameterId === "merge")).toMatchObject(
      { value: false },
    );
  });

  it("recognizes imported bodies without dropping geometry", () => {
    const box = recognizeImportedBrep({
      toJSON: () => ({
        faces: Array.from({ length: 6 }, () => ({})),
        edges: Array.from({ length: 12 }, () => ({})),
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 0.01, y: 0.02, z: 0.03 },
        ],
      }),
    });
    expect(box.shape).toBe("box");
    expect(box.dimensions).toEqual([0.01, 0.02, 0.03]);
    expect(box.confidence).toBeGreaterThan(0.5);
    const mesh = recognizeImportedBrep({
      toJSON: () => ({ faces: [], edges: [], vertices: [] }),
    });
    expect(mesh.shape).toBe("mesh");
  });

  it("registers the new features as implemented map entries", () => {
    for (const type of [
      "rib",
      "gusset",
      "web",
      "boss",
      "domeFeature",
      "coil",
      "helixCurve",
      "fitSpline",
      "bridgingCurve",
      "derive",
    ]) {
      expect(feature(type)).toMatchObject({
        status: "implemented",
        kernelOp: type,
      });
    }
    expect(feature("emboss")).toMatchObject({
      status: "implemented",
      kernelOp: "wrap",
    });
    expect(feature("enclose")).toMatchObject({ kernelOp: "surface" });
  });
});
