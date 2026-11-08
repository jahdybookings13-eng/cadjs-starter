import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { bodyPropertiesOf } from "../bodyProperties";
import type { BodyOutput } from "../executor";

const out = {
  featureId: "Fbody",
  kind: "body",
  brep: { faces: [], edges: [], vertices: [] },
  position: { x: 1, y: 2, z: 3 },
  edgeTags: ["e1", "e2"],
  faceTags: ["f1", "f2", "f3", "f4", "f5", "f6"],
} as unknown as BodyOutput;

describe("body properties", () => {
  it("derives world size, topology and identity", () => {
    const props = bodyPropertiesOf({
      featureId: "Fbody",
      node: {
        featureId: "Fbody",
        featureType: "extrude",
        name: "Base",
      } as never,
      out,
      elementId: "node_1",
      bboxMM: [0, 0, 0, 50, 40, 30],
      position: [1, 2, 3],
      visible: true,
    });
    expect(props).toMatchObject({
      featureId: "Fbody",
      name: "Base",
      featureType: "extrude",
      elementId: "node_1",
      sizeMM: [50, 40, 30],
      faces: 6,
      edges: 2,
      visible: true,
    });
  });

  it("uses executor vertices when the element bbox is missing", () => {
    const vp = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
    ]);
    const props = bodyPropertiesOf({
      featureId: "Fbody",
      node: null,
      out: {
        ...out,
        position: { x: 1, y: 2, z: 3 },
        vertexPositions: vp,
      } as unknown as BodyOutput,
      elementId: "node_1",
      bboxMM: null,
      position: [0, 0, 0],
      visible: true,
    });
    expect(props?.sizeMM).toEqual([1000, 1000, 1000]);
    expect(props?.bboxMM).toEqual([1000, 2000, 3000, 2000, 3000, 4000]);
  });

  it("computes volume, surface area and triangle count", () => {
    const props = bodyPropertiesOf({
      featureId: "Fbody",
      node: null,
      out: {
        ...out,
        position: { x: 0, y: 0, z: 0 },
        faceGeometry: new THREE.BoxGeometry(1, 1, 1),
      } as unknown as BodyOutput,
      elementId: "node_1",
      bboxMM: null,
      position: [0, 0, 0],
      visible: true,
    });
    expect(props?.volumeMM3).toBeCloseTo(1e9, 0);
    expect(props?.surfaceAreaMM2).toBeCloseTo(6e6, 0);
    expect(props?.triangles).toBe(12);
  });

  it("reports zero size when a body has no vertices", () => {
    const props = bodyPropertiesOf({
      featureId: "Fbody",
      node: null,
      out,
      elementId: "node_1",
      bboxMM: null,
      position: [0, 0, 0],
      visible: false,
    });
    expect(props?.sizeMM).toEqual([0, 0, 0]);
    expect(props?.name).toBe("Fbody");
    expect(props?.visible).toBe(false);
  });

  it("computes mass, centre of mass and centroidal inertia from density", () => {
    const props = bodyPropertiesOf({
      featureId: "Fbody",
      node: null,
      out: {
        ...out,
        position: { x: 0, y: 0, z: 0 },
        faceGeometry: new THREE.BoxGeometry(1, 1, 1),
      } as unknown as BodyOutput,
      elementId: "node_1",
      bboxMM: null,
      position: [0, 0, 0],
      visible: true,
      densityKgM3: 1000,
    });
    // 1 m³ at 1000 kg/m³.
    expect(props?.massKg).toBeCloseTo(1000, 6);
    expect(props?.centerOfMassMM?.[0]).toBeCloseTo(0, 6);
    expect(props?.centerOfMassMM?.[1]).toBeCloseTo(0, 6);
    expect(props?.centerOfMassMM?.[2]).toBeCloseTo(0, 6);
    // Solid cube: Ixx = Iyy = Izz = m/6 = 166.67 kg·m².
    expect(props!.inertiaKgMM2![0]! / 1e8).toBeCloseTo(1.666667, 4);
    expect(props!.inertiaKgMM2![3]! / 1e8).toBeCloseTo(1.666667, 4);
    expect(props!.inertiaKgMM2![5]! / 1e8).toBeCloseTo(1.666667, 4);
    expect(props?.inertiaKgMM2?.[1]).toBeCloseTo(0, 3);
  });

  it("offsets the centre of mass by the element position", () => {
    const props = bodyPropertiesOf({
      featureId: "Fbody",
      node: null,
      out: {
        ...out,
        position: { x: 1, y: 2, z: 3 },
        faceGeometry: new THREE.BoxGeometry(1, 1, 1),
      } as unknown as BodyOutput,
      elementId: "node_1",
      bboxMM: null,
      position: [1, 2, 3],
      visible: true,
      densityKgM3: 1000,
    });
    expect(props!.centerOfMassMM![0]! / 1000).toBeCloseTo(1, 6);
    expect(props!.centerOfMassMM![1]! / 1000).toBeCloseTo(2, 6);
    expect(props!.centerOfMassMM![2]! / 1000).toBeCloseTo(3, 6);
  });

  it("reports centre of mass without density and no mass/inertia", () => {
    const props = bodyPropertiesOf({
      featureId: "Fbody",
      node: null,
      out: {
        ...out,
        position: { x: 0, y: 0, z: 0 },
        faceGeometry: new THREE.BoxGeometry(1, 1, 1),
      } as unknown as BodyOutput,
      elementId: "node_1",
      bboxMM: null,
      position: [0, 0, 0],
      visible: true,
    });
    expect(props?.massKg).toBeNull();
    expect(props?.inertiaKgMM2).toBeNull();
    expect(props?.centerOfMassMM).not.toBeNull();
  });

  it("returns null without an executor output", () => {
    expect(
      bodyPropertiesOf({
        featureId: "Fbody",
        node: null,
        out: null,
        elementId: "node_1",
        bboxMM: null,
        position: [0, 0, 0],
        visible: true,
      }),
    ).toBeNull();
  });
});
