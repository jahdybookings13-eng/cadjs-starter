import { describe, expect, it } from "vitest";
import {
  PRIMITIVE_SHAPES,
  buildShape,
  defaultPrimitiveOptions,
} from "../primitiveLibrary";
import type { ScadgenFeatureNode } from "../onshapeHistory";

type SketchPrimitive = {
  id: string;
  type: string;
  majorRadius?: number;
  minorRadius?: number;
  rotation?: number;
  startAngle?: number;
  endAngle?: number;
  radius?: number;
  centerId?: string;
  startId?: string;
  endId?: string;
};

const primitivesOf = (node: ScadgenFeatureNode): SketchPrimitive[] => {
  const sketch = node.extensions?.sketch as
    | { primitives?: SketchPrimitive[] }
    | undefined;
  return sketch?.primitives ?? [];
};

describe("first-party primitive catalog", () => {
  it("builds a literal tri-axial ellipsoid with a Y-radius scale", () => {
    const result = buildShape("Fe", "ellipsoid", {
      rx: 0.03,
      ry: 0.02,
      rz: 0.04,
    });
    expect(result.nodes.map((n) => n.featureType)).toEqual([
      "newSketch",
      "revolve",
      "scale",
    ]);

    const arc = primitivesOf(result.sketch).find(
      (p) => p.type === "ellipticalArc",
    );
    expect(arc).toMatchObject({
      majorRadius: 0.04,
      minorRadius: 0.03,
      rotation: Math.PI / 2,
      startAngle: Math.PI,
      endAngle: Math.PI * 2,
    });

    const factors = result.op.parameters.find(
      (p) => p.kind === "matrix" && p.parameterId === "factors",
    );
    expect(factors?.kind === "matrix" && factors.elements).toEqual([
      1,
      0.02 / 0.03,
      1,
    ]);
  });

  it("builds a sphere from a semicircle revolved about its diameter", () => {
    const result = buildShape("Fs", "sphere", { r: 0.03 });
    expect(result.nodes.map((n) => n.featureType)).toEqual([
      "newSketch",
      "revolve",
    ]);
    const arc = primitivesOf(result.sketch).find((p) => p.type === "arc");
    expect(arc).toMatchObject({
      centerId: "pc",
      startId: "ps",
      endId: "pe",
      radius: 0.03,
    });
    const axis = result.op.parameters.find(
      (p) => p.kind === "queryList" && p.parameterId === "axis",
    );
    expect(axis?.kind === "queryList" && axis.queries[0]?.entityTag).toBe("l1");
  });

  it("builds a capsule from two cap arcs, a side, and the revolve axis", () => {
    const result = buildShape("Fc", "capsule", { r: 0.012, length: 0.06 });
    expect(result.nodes.map((n) => n.featureType)).toEqual([
      "newSketch",
      "revolve",
    ]);
    const prims = primitivesOf(result.sketch);
    expect(prims.filter((p) => p.type === "arc")).toHaveLength(2);
    expect(prims.find((p) => p.id === "a1")?.radius).toBe(0.012);
    expect(prims.find((p) => p.id === "a2")?.radius).toBe(0.012);
    const axis = result.op.parameters.find(
      (p) => p.kind === "queryList" && p.parameterId === "axis",
    );
    expect(axis?.kind === "queryList" && axis.queries[0]?.entityTag).toBe("l2");
  });

  it("builds a dome from a quarter elliptical arc around the Z axis", () => {
    const result = buildShape("Fd", "dome", { r: 0.03, h: 0.03 });
    expect(result.nodes.map((n) => n.featureType)).toEqual([
      "newSketch",
      "revolve",
    ]);
    const arc = primitivesOf(result.sketch).find(
      (p) => p.type === "ellipticalArc",
    );
    expect(arc).toMatchObject({
      majorRadius: 0.03,
      minorRadius: 0.03,
      rotation: Math.PI / 2,
      startAngle: (Math.PI * 3) / 2,
      endAngle: Math.PI * 2,
    });
    const axis = result.op.parameters.find(
      (p) => p.kind === "queryList" && p.parameterId === "axis",
    );
    expect(axis?.kind === "queryList" && axis.queries[0]?.entityTag).toBe("l1");
  });

  it("rejects degenerate dimensions", () => {
    expect(() =>
      buildShape("Fx", "ellipsoid", { rx: 0, ry: 0.02, rz: 0.04 }),
    ).toThrow(/must be > 0/);
    expect(() =>
      buildShape("Fy", "capsule", { r: 0.02, length: 0.03 }),
    ).toThrow(/twice the radius/);
    expect(() => buildShape("Fz", "dome", { r: 0.03, h: 0 })).toThrow(
      /must be > 0/,
    );
    expect(() => buildShape("Fw", "sphere", { r: 0 })).toThrow(/must be > 0/);
  });

  it("fills missing options from catalog defaults", () => {
    const result = buildShape("Fdefault", "box", {});
    const depth = result.op.parameters.find(
      (p) => p.kind === "quantity" && p.parameterId === "depth",
    );
    expect(depth?.kind === "quantity" && depth.value).toBe(0.03);
  });

  it("exposes all catalog shapes with valid defaults", () => {
    expect(PRIMITIVE_SHAPES.map((s) => s.kind)).toContain("sphere");
    expect(PRIMITIVE_SHAPES.map((s) => s.kind)).toContain("ellipsoid");
    expect(PRIMITIVE_SHAPES.map((s) => s.kind)).toContain("capsule");
    expect(PRIMITIVE_SHAPES.map((s) => s.kind)).toContain("dome");
    for (const { kind } of PRIMITIVE_SHAPES) {
      const result = buildShape(
        `F_${kind}`,
        kind,
        defaultPrimitiveOptions(kind),
      );
      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    }
  });
});
