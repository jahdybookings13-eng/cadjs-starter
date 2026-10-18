import { describe, expect, it } from "vitest";
import {
  buildBoxNodes,
  buildConeNodes,
  buildCylinderNodes,
  buildCurvePatternNode,
  buildDeleteFaceNode,
  buildFillSurfaceNode,
  buildOffsetSurfaceNode,
  buildProjectCurvesNode,
  buildRuledSurfaceNode,
  buildMirrorNodes,
  buildLinearPatternNodes,
  buildSplitNode,
  buildSphereNodes,
  buildTorusNodes,
} from "../primitives";

describe("primitive composite builders", () => {
  it("box carries midplane + oppositeDirection overrides", () => {
    const [, ex] = buildBoxNodes("Fb", "Box", 1, 1, 1, {
      midplane: true,
      opposite: true,
    });
    const mid = ex?.parameters.find(
      (x) => x.kind === "boolean" && x.parameterId === "midplane",
    );
    const opp = ex?.parameters.find(
      (x) => x.kind === "boolean" && x.parameterId === "oppositeDirection",
    );
    expect(mid?.kind === "boolean" && mid.value).toBe(true);
    expect(opp?.kind === "boolean" && opp.value).toBe(true);
  });
  it("box = sketch(rect) + extrude with provenance to sketch", () => {
    const [sk, ex] = buildBoxNodes("Fx", "Box", 0.1, 0.2, 0.05);
    expect(sk?.featureType).toBe("newSketch");
    expect(ex?.featureType).toBe("extrude");
    const q = ex?.parameters.find(
      (x) => x.kind === "queryList" && x.parameterId === "entities",
    );
    expect(q?.kind === "queryList" && q.queries[0]?.creationFeatureId).toBe(
      "Fx_sk",
    );
  });
  it("cylinder revolves rect profile about axis edge l4", () => {
    const [sk, rv] = buildCylinderNodes("Fy", "Cyl", 0.05, 0.1);
    expect(rv?.featureType).toBe("revolve");
    const axis = rv?.parameters.find(
      (x) => x.kind === "queryList" && x.parameterId === "axis",
    );
    expect(axis?.kind === "queryList" && axis.queries[0]?.entityTag).toBe("l4");
    expect(sk?.featureType).toBe("newSketch");
  });
  it("sphere profile carries arc + chord axis", () => {
    const [sk] = buildSphereNodes("Fz", "Sph", 0.03);
    expect(JSON.stringify(sk?.extensions)).toContain('"arc"');
    const rv = buildSphereNodes("Fz", "Sph", 0.03)[1];
    const axis = rv?.parameters.find(
      (x) => x.kind === "queryList" && x.parameterId === "axis",
    );
    expect(axis?.kind === "queryList" && axis.queries[0]?.entityTag).toBe("l1");
  });
  it("torus circle profile offset by ring radius", () => {
    const [sk] = buildTorusNodes("Ft", "Torus", 0.06, 0.02);
    expect(JSON.stringify(sk?.extensions)).toContain('"circle"');
  });
  it("cone axis is hypotenuse-closing line l3", () => {
    const [, rv] = buildConeImport();
    const axis = rv.parameters.find(
      (x) => x.kind === "queryList" && x.parameterId === "axis",
    );
    expect(axis?.kind === "queryList" && axis.queries[0]?.entityTag).toBe("l3");
  });
  it("projectCurves node wires entities + targets + tags + direction", () => {
    const nd = buildProjectCurvesNode(
      "Fp",
      "Proj",
      "Fsrc",
      "Ftgt",
      ["Fsrc_E0", "Fsrc_E1"],
      [0, 0, -1],
    );
    expect(nd.featureType).toBe("projectCurves");
    const ent = nd.parameters.find(
      (x) => x.kind === "queryList" && x.parameterId === "entities",
    );
    const tgt = nd.parameters.find(
      (x) => x.kind === "queryList" && x.parameterId === "targets",
    );
    expect(ent?.kind === "queryList" && ent.queries[0]?.creationFeatureId).toBe(
      "Fsrc",
    );
    expect(tgt?.kind === "queryList" && tgt.queries[0]?.creationFeatureId).toBe(
      "Ftgt",
    );
    const dir = nd.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "direction",
    );
    expect(dir?.kind === "string" && dir.value).toBe("0,0,-1");
  });
  it("surface builders carry kind + tags + typed distance", () => {
    const ruled = buildRuledSurfaceNode(
      "Fr",
      "Ruled",
      "Fbody",
      "Fbody_E1",
      "Fbody_E2",
    );
    expect(ruled.featureType).toBe("surface");
    const kind = ruled.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "kind",
    );
    expect(kind?.kind === "string" && kind.value).toBe("ruled");
    const tags = ruled.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "edgeTags",
    );
    expect(tags?.kind === "string" && JSON.parse(tags.value)).toEqual([
      "Fbody_E1",
      "Fbody_E2",
    ]);
    const fill = buildFillSurfaceNode("Ffi", "Fill", "Fbody", "Fbody_F0");
    const fk = fill.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "kind",
    );
    expect(fk?.kind === "string" && fk.value).toBe("fill");
    const off = buildOffsetSurfaceNode(
      "Fo",
      "Offset",
      "Fbody",
      "Fbody_F0",
      0.01,
    );
    const d = off.parameters.find(
      (x) => x.kind === "quantity" && x.parameterId === "distance",
    );
    expect(d?.kind === "quantity" && d.expression).toContain("m");
  });
  it("split node carries targets + plane origin/normal", () => {
    const nd = buildSplitNode("Fs", "Split", "Fbody", [1, 2, 3], [0, 0, 1]);
    expect(nd.featureType).toBe("split");
    const o = nd.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "planeOrigin",
    );
    const n = nd.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "planeNormal",
    );
    expect(o?.kind === "string" && o.value).toBe("1,2,3");
    expect(n?.kind === "string" && n.value).toBe("0,0,1");
  });
  it("delete-face node carries targets + faces queries", () => {
    const nd = buildDeleteFaceNode("Fd", "Del", "Fbody", ["Fbody_F2"]);
    expect(nd.featureType).toBe("deleteFace");
    const faces = nd.parameters.find(
      (x) => x.kind === "queryList" && x.parameterId === "faces",
    );
    expect(
      faces?.kind === "queryList" &&
        faces.queries[0]?.creationFeatureId === "Fbody" &&
        faces.queries[0]?.entityTag === "Fbody_F2",
    ).toBe(true);
  });
  it("curve pattern node carries patternType=curve + pathPoints + align", () => {
    const pat = buildCurvePatternNode(
      "Fcp",
      "CPat",
      "Fbody",
      [
        [0, 0, 0],
        [4, 0, 0],
        [4, 4, 0],
      ],
      3,
      true,
    );
    expect(pat.featureType).toBe("pattern");
    const type = pat.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "patternType",
    );
    expect(type?.kind === "string" && type.value).toBe("curve");
    const pts = pat.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "pathPoints",
    );
    expect(pts?.kind === "string" && JSON.parse(pts.value)).toHaveLength(3);
    const align = pat.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "align",
    );
    expect(align?.kind === "string" && align.value).toBe("true");
  });
  it("pattern/mirror nodes carry source query + params", () => {
    const pat = buildLinearPatternNodes(
      "Fp",
      "Pat",
      "Fbody",
      4,
      [1, 0, 0],
      0.02,
    );
    expect(pat.featureType).toBe("pattern");
    const mir = buildMirrorNodes("Fm", "Mir", "Fbody", "Y");
    expect(mir.featureType).toBe("mirror");
    const e = mir.parameters.find(
      (x) => x.kind === "queryList" && x.parameterId === "entities",
    );
    expect(e?.kind === "queryList" && e.queries[0]?.creationFeatureId).toBe(
      "Fbody",
    );
  });
});

function buildConeImport() {
  const nodes = buildConeNodes("Fc", "Cone", 0.04, 0.09);
  return [nodes[0]!, nodes[1]!] as const;
}
