import * as THREE from "three";
import { isElement3D, SceneElement } from "../../src/scene-operations/types";
import { Brep, CompoundBrep, Vertex, Edge, Face } from "../../src/geometry";

/** Helper to build a SceneElement from vertices */
function makeElement(vertices: Vertex[]): SceneElement {
  const faces = vertices.length >= 3 ? [new Face(vertices.slice(0, 3))] : [];
  const brep = new Brep(vertices, [], faces);
  return {
    brep,
    nodeId: "test_1",
    position: new THREE.Vector3(0, 0, 0),
  };
}

describe("isElement3D", () => {
  test("3D cube (all 3 axes thick) returns true", () => {
    const el = makeElement([
      new Vertex(0, 0, 0),
      new Vertex(1, 0, 0),
      new Vertex(1, 1, 0),
      new Vertex(0, 1, 0),
      new Vertex(0, 0, 1),
      new Vertex(1, 0, 1),
      new Vertex(1, 1, 1),
      new Vertex(0, 1, 1),
    ]);
    expect(isElement3D(el)).toBe(true);
  });

  test("flat XY rectangle (2 thick axes: X and Y) returns true", () => {
    const el = makeElement([
      new Vertex(0, 0, 0),
      new Vertex(2, 0, 0),
      new Vertex(2, 3, 0),
      new Vertex(0, 3, 0),
    ]);
    expect(isElement3D(el)).toBe(true);
  });

  test("flat XZ rectangle (2 thick axes: X and Z) returns true", () => {
    const el = makeElement([
      new Vertex(0, 0, 0),
      new Vertex(2, 0, 0),
      new Vertex(2, 0, 1),
      new Vertex(0, 0, 1),
    ]);
    expect(isElement3D(el)).toBe(true);
  });

  test("1D line along X (only 1 thick axis) returns false", () => {
    const vertices = [
      new Vertex(0, 0, 0),
      new Vertex(5, 0, 0),
      new Vertex(2.5, 0, 0),
    ];
    const el = makeElement(vertices);
    expect(isElement3D(el)).toBe(false);
  });

  test("empty vertices returns false", () => {
    const brep = new Brep([], [], []);
    const el: SceneElement = {
      brep,
      nodeId: "test_empty",
      position: new THREE.Vector3(),
    };
    expect(isElement3D(el)).toBe(false);
  });

  test("CompoundBrep with _unifiedBRep uses unified vertices", () => {
    // Children have no vertices (empty), but unified brep is a 3D cube
    const child = new Brep([], [], []);
    const compound = new CompoundBrep([child]);

    const v1 = new Vertex(0, 0, 0);
    const v2 = new Vertex(1, 0, 0);
    const v3 = new Vertex(1, 1, 0);
    const v4 = new Vertex(0, 0, 1);
    const unifiedBrep = new Brep(
      [v1, v2, v3, v4],
      [],
      [new Face([v1, v2, v3])],
    );
    compound.setUnifiedBrep(unifiedBrep);

    const el: SceneElement = {
      brep: compound,
      nodeId: "test_compound",
      position: new THREE.Vector3(),
    };
    expect(isElement3D(el)).toBe(true);
  });

  test("near-zero thickness below 0.01 threshold is not counted as thick", () => {
    // X range = 2 (thick), Y range = 0.005 (below threshold), Z range = 0.005 (below threshold)
    // Only 1 thick axis → returns false
    const el = makeElement([
      new Vertex(0, 0, 0),
      new Vertex(2, 0, 0),
      new Vertex(1, 0.005, 0.005),
    ]);
    expect(isElement3D(el)).toBe(false);
  });

  test("exactly at 0.01 boundary is not counted as thick", () => {
    // rangeY = 0.01, which is NOT > 0.01, so only X is thick → false
    const el = makeElement([
      new Vertex(0, 0, 0),
      new Vertex(2, 0, 0),
      new Vertex(1, 0.01, 0),
    ]);
    expect(isElement3D(el)).toBe(false);
  });
});
