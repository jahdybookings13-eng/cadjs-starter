import { describe, expect, it } from "vitest";
import {
  buildBoxNodes,
  buildConeNodes,
  buildCylinderNodes,
  buildMirrorNodes,
  buildLinearPatternNodes,
  buildSphereNodes,
  buildTorusNodes,
} from "../primitives";

describe("primitive composite builders", () => {
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
