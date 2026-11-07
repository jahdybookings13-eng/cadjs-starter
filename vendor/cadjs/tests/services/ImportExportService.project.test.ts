import * as THREE from "three";
import {
  ImportExportService,
  type CadjsProjectState,
} from "../../src/services/ImportExportService";
import { Brep, Vertex, Edge, Face, CompoundBrep } from "../../src/geometry";
import type {
  Sketch,
  FeatureNode,
  SketchPlane,
} from "../../src/types/sketch-types";

function buildPlane(): SketchPlane {
  return {
    type: "XY",
    origin: new THREE.Vector3(1, 2, 3),
    normal: new THREE.Vector3(0, 0, 1),
    xAxis: new THREE.Vector3(1, 0, 0),
    yAxis: new THREE.Vector3(0, 1, 0),
  };
}

function buildSquareBrep(): Brep {
  const v = [
    new Vertex(0, 0, 0),
    new Vertex(1, 0, 0),
    new Vertex(1, 1, 0),
    new Vertex(0, 1, 0),
  ];
  const edges = [
    new Edge(v[0]!, v[1]!),
    new Edge(v[1]!, v[2]!),
    new Edge(v[2]!, v[3]!),
    new Edge(v[3]!, v[0]!),
  ];
  return new Brep(v, edges, [new Face(v)]);
}

function buildState(): CadjsProjectState {
  const brep = buildSquareBrep();
  const sketch: Sketch = {
    id: "sketch_1",
    plane: buildPlane(),
    primitives: [
      { id: "p1", type: "point", x: 0, y: 0 },
      { id: "p2", type: "point", x: 1, y: 0 },
      { id: "l1", type: "line", p1Id: "p1", p2Id: "p2" },
    ],
    constraints: [
      { id: "c1", type: "horizontal", primitiveIds: ["l1"] },
      { id: "c2", type: "distance", primitiveIds: ["p1", "p2"], value: 10 },
    ],
    dof: 1,
    status: "underconstrained",
  };
  const featureTree: FeatureNode[] = [
    {
      id: "fn_sketch_1",
      type: "sketch",
      name: "Sketch 1",
      visible: true,
      sourceSketchId: "sketch_1",
    },
    {
      id: "fn_body_1",
      type: "body",
      name: "Extrude 1",
      visible: true,
      elementId: "node_1",
      operationType: "extrude",
    },
  ];
  return {
    elements: [
      {
        brep,
        nodeId: "node_1",
        position: new THREE.Vector3(5, 10, 0),
        rotation: new THREE.Euler(0, Math.PI / 2, 0, "XYZ"),
        elementType: undefined,
        occBrep: "fake-brep-blob",
        sketchPlane: buildPlane(),
      },
    ],
    sketches: [sketch],
    featureTree,
    idCounter: 7,
  };
}

describe("ImportExportService project round-trip", () => {
  const ie = ImportExportService.getInstance();

  test("preserves elements, sketches, featureTree, idCounter through Blob round-trip", async () => {
    const original = buildState();
    const blob = ie.exportProject(original);
    expect(blob.type).toBe("application/json");

    const buf = await blob.arrayBuffer();
    const restored = await ie.importProject(buf);

    expect(restored.idCounter).toBe(original.idCounter);
    expect(restored.featureTree).toEqual(original.featureTree);

    expect(restored.sketches).toHaveLength(1);
    const s = restored.sketches[0]!;
    expect(s.id).toBe("sketch_1");
    expect(s.dof).toBe(1);
    expect(s.status).toBe("underconstrained");
    expect(s.primitives).toEqual(original.sketches[0]!.primitives);
    expect(s.constraints).toEqual(original.sketches[0]!.constraints);
    expect(s.plane.origin).toBeInstanceOf(THREE.Vector3);
    expect(s.plane.origin.toArray()).toEqual([1, 2, 3]);
    expect(s.plane.normal.toArray()).toEqual([0, 0, 1]);

    expect(restored.elements).toHaveLength(1);
    const el = restored.elements[0]!;
    expect(el.nodeId).toBe("node_1");
    expect(el.position).toBeInstanceOf(THREE.Vector3);
    expect(el.position.toArray()).toEqual([5, 10, 0]);
    expect(el.rotation).toBeInstanceOf(THREE.Euler);
    expect(el.rotation!.toArray()).toEqual([0, Math.PI / 2, 0, "XYZ"]);
    expect(el.occBrep).toBe("fake-brep-blob");
    expect(el.sketchPlane?.origin).toBeInstanceOf(THREE.Vector3);

    // BRep structure round-trips: same vertex/edge/face counts, same coords.
    expect(el.brep.vertices).toHaveLength(
      original.elements[0]!.brep.vertices.length,
    );
    expect(el.brep.faces).toHaveLength(original.elements[0]!.brep.faces.length);
    expect(el.brep.vertices.map((v) => [v.x, v.y, v.z])).toEqual(
      original.elements[0]!.brep.vertices.map((v) => [v.x, v.y, v.z]),
    );
  });

  test("rejects mismatched schema version", async () => {
    const file = JSON.stringify({
      schemaVersion: 99,
      elements: [],
      sketches: [],
      featureTree: [],
      idCounter: 0,
    });
    const buf = new TextEncoder().encode(file).buffer;
    await expect(ie.importProject(buf)).rejects.toThrow(
      /Unsupported project file version/,
    );
  });

  test("rejects malformed JSON shape", async () => {
    const buf = new TextEncoder().encode(
      JSON.stringify({ schemaVersion: 1, idCounter: 0 }),
    ).buffer;
    await expect(ie.importProject(buf)).rejects.toThrow(/missing/);
  });

  test("CompoundBrep elements round-trip via the type discriminator", async () => {
    const child1 = buildSquareBrep();
    const child2 = buildSquareBrep();
    const compound = new CompoundBrep([child1, child2]);
    compound.setUnifiedBrep(buildSquareBrep());

    const state: CadjsProjectState = {
      elements: [
        {
          brep: compound,
          nodeId: "node_compound",
          position: new THREE.Vector3(0, 0, 0),
        },
      ],
      sketches: [],
      featureTree: [],
      idCounter: 1,
    };

    const blob = ie.exportProject(state);
    const restored = await ie.importProject(await blob.arrayBuffer());
    const el = restored.elements[0]!;
    expect(el.brep).toBeInstanceOf(CompoundBrep);
    expect((el.brep as CompoundBrep).children).toHaveLength(2);
    expect((el.brep as CompoundBrep).cachedUnifiedBRep).not.toBeNull();
  });
});
