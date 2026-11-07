import * as THREE from "three";
import {
  computePointDistance,
  computeAngleBetweenVectors,
  findNearestVertex,
} from "../../src/scene-operations/measure-operations";
import { Vertex, Brep, Face } from "../../src/geometry";
import { SceneElement } from "../../src/scene-operations/types";

function makeElement(
  vertices: Vertex[],
  position: THREE.Vector3,
  rotation?: THREE.Euler,
): SceneElement {
  const brep = new Brep(
    vertices,
    [],
    vertices.length >= 3 ? [new Face(vertices)] : [],
  );
  return {
    brep,
    nodeId: "test",
    position,
    rotation,
  } as SceneElement;
}

describe("computePointDistance", () => {
  it("computes 3-4-5 triangle distance", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(3, 4, 0);
    expect(computePointDistance(a, b)).toBe(5);
  });

  it("returns 0 for the same point", () => {
    const a = new THREE.Vector3(7, -2, 3);
    expect(computePointDistance(a, a.clone())).toBe(0);
  });

  it("handles negative coordinates", () => {
    const a = new THREE.Vector3(-1, -1, -1);
    const b = new THREE.Vector3(1, 1, 1);
    expect(computePointDistance(a, b)).toBeCloseTo(Math.sqrt(12), 10);
  });
});

describe("computeAngleBetweenVectors", () => {
  it("returns 90 for perpendicular vectors", () => {
    const a = new THREE.Vector3(1, 0, 0);
    const b = new THREE.Vector3(0, 1, 0);
    expect(computeAngleBetweenVectors(a, b)).toBeCloseTo(90, 5);
  });

  it("returns 0 for same direction vectors", () => {
    const a = new THREE.Vector3(1, 0, 0);
    const b = new THREE.Vector3(2, 0, 0);
    expect(computeAngleBetweenVectors(a, b)).toBeCloseTo(0, 5);
  });

  it("returns 180 for opposite direction vectors", () => {
    const a = new THREE.Vector3(1, 0, 0);
    const b = new THREE.Vector3(-1, 0, 0);
    expect(computeAngleBetweenVectors(a, b)).toBeCloseTo(180, 5);
  });

  it("returns 45 for a 45-degree angle", () => {
    const a = new THREE.Vector3(1, 0, 0);
    const b = new THREE.Vector3(1, 1, 0);
    expect(computeAngleBetweenVectors(a, b)).toBeCloseTo(45, 5);
  });

  it("clamps dot product to [-1,1] for near-parallel vectors", () => {
    // Vectors that are effectively parallel but could produce dot > 1 due to floating point
    const a = new THREE.Vector3(1e-15, 1, 0);
    const b = new THREE.Vector3(-1e-15, 1, 0);
    const angle = computeAngleBetweenVectors(a, b);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThanOrEqual(180);
    expect(angle).toBeCloseTo(0, 5);
  });
});

describe("findNearestVertex", () => {
  it("returns the vertex when within threshold", () => {
    const vertices = [
      new Vertex(1, 0, 0),
      new Vertex(0, 1, 0),
      new Vertex(0, 0, 1),
    ];
    const element = makeElement(vertices, new THREE.Vector3(0, 0, 0));
    const point = new THREE.Vector3(1.05, 0, 0);

    const result = findNearestVertex(point, element, 0.15);
    expect(result).not.toBeNull();
    expect(result!.position.x).toBeCloseTo(1, 5);
    expect(result!.position.y).toBeCloseTo(0, 5);
    expect(result!.position.z).toBeCloseTo(0, 5);
    expect(result!.distance).toBeCloseTo(0.05, 5);
  });

  it("returns null when no vertex is within threshold", () => {
    const vertices = [
      new Vertex(1, 0, 0),
      new Vertex(0, 1, 0),
      new Vertex(0, 0, 1),
    ];
    const element = makeElement(vertices, new THREE.Vector3(0, 0, 0));
    const point = new THREE.Vector3(5, 5, 5);

    const result = findNearestVertex(point, element, 0.15);
    expect(result).toBeNull();
  });

  it("returns the nearest vertex when multiple are within threshold", () => {
    const vertices = [
      new Vertex(1, 0, 0),
      new Vertex(1.1, 0, 0),
      new Vertex(1.2, 0, 0),
    ];
    const element = makeElement(vertices, new THREE.Vector3(0, 0, 0));
    const point = new THREE.Vector3(1.08, 0, 0);

    const result = findNearestVertex(point, element, 0.15);
    expect(result).not.toBeNull();
    // Nearest should be (1.1, 0, 0) at distance 0.02
    expect(result!.position.x).toBeCloseTo(1.1, 5);
    expect(result!.distance).toBeCloseTo(0.02, 5);
  });

  it("applies element rotation to transform vertices to world space", () => {
    // Vertex at (1, 0, 0) with 90-degree rotation around Z
    // should end up at (0, 1, 0) in world space
    const vertices = [
      new Vertex(1, 0, 0),
      new Vertex(0, 1, 0),
      new Vertex(0, 0, 1),
    ];
    const rotation = new THREE.Euler(0, 0, Math.PI / 2, "XYZ");
    const element = makeElement(vertices, new THREE.Vector3(0, 0, 0), rotation);
    // After 90° Z rotation, (1,0,0) → (0,1,0)
    const point = new THREE.Vector3(0, 1.05, 0);

    const result = findNearestVertex(point, element, 0.15);
    expect(result).not.toBeNull();
    expect(result!.position.x).toBeCloseTo(0, 4);
    expect(result!.position.y).toBeCloseTo(1, 4);
    expect(result!.position.z).toBeCloseTo(0, 4);
  });
});
