import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  bodyPairInspection,
  convertArea,
  convertVolume,
  formatArea,
  formatCurvature,
  formatLength,
  formatVolume,
  inspectBody,
  inspectBodies,
  sectionMetrics,
  bodyTriangles,
} from "../inspect";
import type { BodyOutput } from "../executor";

function body(
  geometry: THREE.BufferGeometry,
  position = new THREE.Vector3(),
  id = "F1",
): BodyOutput {
  return {
    featureId: id,
    kind: "body",
    brep: { vertices: [], edges: [], faces: [] },
    faceGeometry: geometry,
    position,
  } as unknown as BodyOutput;
}

describe("inspect body", () => {
  it("measures volume, area, bbox and section of a box", () => {
    const box = new THREE.BoxGeometry(2, 1, 0.5);
    const inspection = inspectBody(body(box));
    expect(inspection.error).toBeNull();
    expect(inspection.triangles).toBe(12);
    expect(inspection.volumeMM3).toBeCloseTo(1e9, -2);
    expect(inspection.surfaceAreaMM2).toBeCloseTo(7e6, -2);
    expect(inspection.bboxMM).toEqual([-1000, -500, -250, 1000, 500, 250]);
    // Section through the centre on XY: 2 m × 1 m.
    expect(inspection.sectionAreaMM2).toBeCloseTo(2e6, -2);
    expect(inspection.sectionPerimeterMM).toBeCloseTo(6000, -2);
    // The thinnest wall is the 0.5 m Z pair.
    expect(inspection.thicknessMM).toBeCloseTo(500, 0);
    // A box has no smooth edges, so no radius/curvature estimate.
    expect(inspection.radiusMM).toBeNull();
    expect(inspection.curvatureMaxPerMM).toBeNull();
  });

  it("estimates radius and curvature from a tessellated cylinder", () => {
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 64, 1);
    const inspection = inspectBody(body(cyl));
    expect(inspection.radiusMM).toBeCloseTo(500, -1);
    expect(inspection.diameterMM).toBeCloseTo(1000, -1);
    expect(inspection.curvatureMaxPerMM).toBeCloseTo(0.002, 2);
    // A 64-sided mesh is slightly inside the ideal circle; require <0.5% error.
    expect(inspection.volumeMM3! / (Math.PI * 0.5 ** 2 * 1 * 1e9)).toBeCloseTo(
      1,
      2,
    );
    // CylinderGeometry runs along Y, so the XY cut is a 1 m × 1 m rectangle.
    expect(inspection.sectionAreaMM2).toBeCloseTo(1e6, -2);
    expect(inspection.sectionPerimeterMM).toBeCloseTo(4000, -2);
  });

  it("applies density to mass without changing geometry", () => {
    const withDensity = inspectBody(body(new THREE.BoxGeometry(1, 1, 1)), {
      densityKgM3: 1000,
    });
    const without = inspectBody(body(new THREE.BoxGeometry(1, 1, 1)));
    expect(withDensity.massKg).toBeCloseTo(1000, 6);
    expect(without.massKg).toBeNull();
    expect(withDensity.volumeMM3).toBeCloseTo(without.volumeMM3!, 3);
  });

  it("names an empty body instead of throwing", () => {
    const inspection = inspectBody({
      featureId: "Fempty",
      kind: "body",
      brep: { vertices: [], edges: [], faces: [] },
      position: new THREE.Vector3(),
    } as unknown as BodyOutput);
    expect(inspection.error).toMatch(/no measurable geometry/);
    expect(inspection.volumeMM3).toBeNull();
    expect(inspection.radiusMM).toBeNull();
  });

  it("handles split/extra body ids without special casing", () => {
    const inspection = inspectBody(
      body(new THREE.BoxGeometry(1, 1, 1), new THREE.Vector3(), "F1#1"),
    );
    expect(inspection.featureId).toBe("F1#1");
    expect(inspection.volumeMM3).toBeCloseTo(1e9, -2);
  });
});

describe("interference and clearance", () => {
  it("reports interference for overlapping boxes", () => {
    const a = body(new THREE.BoxGeometry(2, 2, 2), new THREE.Vector3(0, 0, 0));
    const b = body(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.Vector3(1, 0, 0),
      "F2",
    );
    const pair = bodyPairInspection(a, b);
    expect(pair.interference).toBe(true);
    expect(pair.minClearanceM3).toBe(0);
    expect(inspectBodies([a, b]).interference).toBe(true);
  });

  it("reports positive clearance for separated boxes", () => {
    const a = body(new THREE.BoxGeometry(1, 1, 1), new THREE.Vector3(0, 0, 0));
    const b = body(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.Vector3(2, 0, 0),
      "F2",
    );
    const pair = bodyPairInspection(a, b);
    expect(pair.interference).toBe(false);
    expect(pair.minClearanceM3).toBeCloseTo(1, 5);
    const selection = inspectBodies([a, b]);
    expect(selection.interference).toBe(false);
    expect(selection.minClearanceMM).toBeCloseTo(1000, 3);
  });
});

describe("section metrics and units", () => {
  it("computes a plane section independent of triangle order", () => {
    const tris = bodyTriangles(body(new THREE.BoxGeometry(2, 1, 0.5)));
    const reversed = [...tris].reverse();
    const a = sectionMetrics(
      tris,
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, 1),
    );
    const b = sectionMetrics(
      reversed,
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, 1),
    );
    expect(b.areaM2).toBeCloseTo(a.areaM2, 6);
    expect(b.perimeterM).toBeCloseTo(a.perimeterM, 6);
    expect(a.areaM2).toBeCloseTo(2, 6);
    expect(a.perimeterM).toBeCloseTo(6, 6);
  });

  it("formats mm and inches deterministically", () => {
    expect(formatLength(25.4, "mm", 2)).toBe("25.40 mm");
    expect(formatLength(25.4, "in", 3)).toBe("1.000 in");
    expect(formatLength(null, "mm")).toBe("n/a");
    expect(formatArea(645.16, "in", 3)).toBe("1.000 in²");
    expect(formatCurvature(1 / 25.4, "in", 4)).toBe("1.0000 1/in");
    expect(convertArea(645.16, "in")).toBeCloseTo(1, 6);
    expect(convertVolume(25.4 ** 3, "in")).toBeCloseTo(1, 6);
    expect(formatVolume(60000, "mm", 1)).toBe("60000.0 mm³");
    expect(formatVolume(60000, "in", 2)).toBe("3.66 in³");
    expect(formatVolume(null, "in", 2)).toBe("n/a");
  });
});
