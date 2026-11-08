import { beforeAll, describe, expect, it } from "vitest";
import initOpenCascade from "opencascade.js/dist/node.js";
import type { OpenCascadeInstance, TopoDS_Face } from "opencascade.js";
import {
  handleBoolean,
  handleChamfer,
  handleExtrude,
  handleFillet,
  handleReplaceFace,
  handleSew,
  handleShell,
  handleSurfaceExtend,
} from "../../../vendor/cadjs/src/workers/occ-worker-handlers";
import {
  deserializeShapeHelper,
  ocShapeToBRepHelper,
  serializeShapeHelper,
} from "../../../vendor/cadjs/src/services/occ-shape-conversion";
import { buildReliefToolBreps } from "../reliefTool";
import { buildFrameMemberProfile } from "../frameMemberGeometry";
import { buildLouverTools } from "../louverTool";
import type { BrepJSON } from "../../../vendor/cadjs/src/geometry";

let oc: OpenCascadeInstance;

beforeAll(async () => {
  oc = await initOpenCascade();
}, 60_000);

function boxFixture(): {
  brepJson: BrepJSON;
  occBrep: string;
} {
  const box = new oc.BRepPrimAPI_MakeBox_2(20, 10, 2);
  const shape = box.Shape();
  return {
    brepJson: ocShapeToBRepHelper(oc, shape, false).brepJson,
    occBrep: serializeShapeHelper(oc, shape),
  };
}

function rectangleFace(): TopoDS_Face {
  const polygon = new oc.BRepBuilderAPI_MakePolygon_1();
  for (const [x, y, z] of [
    [0, 0, 0],
    [20, 0, 0],
    [20, 10, 0],
    [0, 10, 0],
  ] as const) {
    const point = new oc.gp_Pnt_3(x, y, z);
    polygon.Add_1(point);
    point.delete();
  }
  polygon.Close();
  if (!polygon.IsDone()) throw new Error("test fixture: polygon failed");

  const maker = new oc.BRepBuilderAPI_MakeFace_15(polygon.Wire(), true);
  if (!maker.IsDone()) throw new Error("test fixture: face failed");
  return maker.Face();
}

describe("Phase 6 OCC kernels (real WASM)", () => {
  it("extracts a selected solid face as a sewn shell", () => {
    const source = boxFixture();
    const result = handleSew(oc, {
      sources: [
        {
          brepJson: source.brepJson,
          position: { x: 0, y: 0, z: 0 },
          occBrep: source.occBrep,
          faceIndices: [0],
        },
      ],
      tolerance: 1e-6,
      makeSolid: false,
      extractShell: true,
      mergeFaces: false,
    });

    expect(result.shellCount).toBe(1);
    expect(result.brepJson.faces.length).toBeGreaterThan(0);
    expect(result.brepJson.vertices.length).toBeGreaterThan(0);
    expect(result.unstitchedEdges).toBeGreaterThan(0);
  });

  it("extends a planar boundary edge into a sewn surface", () => {
    const face = rectangleFace();
    const source = {
      brepJson: ocShapeToBRepHelper(oc, face, false).brepJson,
      occBrep: serializeShapeHelper(oc, face),
    };
    const result = handleSurfaceExtend(oc, {
      brepJson: source.brepJson,
      position: { x: 0, y: 0, z: 0 },
      occBrep: source.occBrep,
      edgeIndices: [1],
      distance: 5,
      mode: "linear",
      tolerance: 1e-6,
    });

    expect(result.brepJson.faces.length).toBeGreaterThan(
      source.brepJson.faces.length,
    );
    expect(result.brepJson.vertices.length).toBeGreaterThan(0);
  });

  it("cuts a real relief notch at both ends of a bend edge", () => {
    const source = boxFixture();
    const edge = source.brepJson.edges[0]!;
    const tools = buildReliefToolBreps(
      source.brepJson.vertices,
      edge.start,
      edge.end,
      2,
      1,
      "auto",
    );
    expect(tools).toHaveLength(2);

    const result = handleBoolean(oc, {
      operation: "difference",
      operands: [
        {
          brepJson: source.brepJson,
          position: { x: 0, y: 0, z: 0 },
          occBrep: source.occBrep,
        },
        ...tools.map((brep) => ({
          brepJson: brep.toJSON(),
          position: { x: 0, y: 0, z: 0 },
        })),
      ],
    });

    const volume = (occBrep: string): number => {
      const shape = deserializeShapeHelper(oc, occBrep);
      const props = new oc.GProp_GProps_1();
      oc.BRepGProp.VolumeProperties_2(shape, props, 1e-7, true, false);
      const value = Math.abs(props.Mass());
      props.delete();
      shape.delete();
      return value;
    };

    const before = volume(source.occBrep);
    const after = volume(result.occBrep!);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  it("applies real fillet and chamfer corner treatments", () => {
    const source = boxFixture();
    const fillet = handleFillet(oc, {
      brepJson: source.brepJson,
      position: { x: 0, y: 0, z: 0 },
      occBrep: source.occBrep,
      edgeIndices: [1],
      radius: 1,
    });
    const chamfer = handleChamfer(oc, {
      brepJson: source.brepJson,
      position: { x: 0, y: 0, z: 0 },
      occBrep: source.occBrep,
      edgeIndices: [1],
      distance: 1,
    });

    expect(fillet.brepJson.faces.length).toBeGreaterThan(
      source.brepJson.faces.length,
    );
    expect(chamfer.brepJson.faces.length).toBeGreaterThan(
      source.brepJson.faces.length,
    );
  });

  it("extrudes and shells a real structural-member profile", () => {
    const profile = buildFrameMemberProfile(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 20 },
      4,
      4,
    );
    expect(profile).not.toBeNull();

    const extruded = handleExtrude(oc, {
      brepJson: profile!.brep.toJSON(),
      depth: profile!.length,
      direction: 1,
      normalVec: profile!.direction,
    });
    const along = extruded.brepJson.faces
      .map((face, index) => {
        const count = face.vertices.length || 1;
        const value =
          face.vertices.reduce(
            (sum, vertex) =>
              sum +
              vertex.x * profile!.direction.x +
              vertex.y * profile!.direction.y +
              vertex.z * profile!.direction.z,
            0,
          ) / count;
        return { index, value };
      })
      .sort((a, b) => a.value - b.value);
    const endFaces = [along[0]!.index, along[along.length - 1]!.index];
    expect(new Set(endFaces).size).toBe(2);

    const shelled = handleShell(oc, {
      brepJson: extruded.brepJson,
      position: extruded.positionOffset,
      occBrep: extruded.occBrep,
      faceIndices: endFaces,
      thickness: 0.5,
      keepType: "KEEP_SHELL",
    });
    expect(shelled.brepJson.vertices.length).toBeGreaterThan(0);
    expect(shelled.brepJson.faces.length).toBeGreaterThan(
      extruded.brepJson.faces.length,
    );
  });

  it("cuts and forms a real louver slot with a tab", () => {
    const source = boxFixture();
    const face = source.brepJson.faces[0]!;
    const tools = buildLouverTools(
      source.brepJson.vertices,
      face.vertices,
      8,
      2,
      1,
      Math.PI / 4,
      1,
      0,
    );
    expect(tools.cutters).toHaveLength(1);
    expect(tools.tabs).toHaveLength(1);

    const cut = handleBoolean(oc, {
      operation: "difference",
      operands: [
        {
          brepJson: source.brepJson,
          position: { x: 0, y: 0, z: 0 },
          occBrep: source.occBrep,
        },
        {
          brepJson: tools.cutters[0]!.toJSON(),
          position: { x: 0, y: 0, z: 0 },
        },
      ],
    });
    const formed = handleBoolean(oc, {
      operation: "union",
      operands: [
        {
          brepJson: cut.brepJson,
          position: cut.position,
          occBrep: cut.occBrep,
        },
        {
          brepJson: tools.tabs[0]!.toJSON(),
          position: { x: 0, y: 0, z: 0 },
        },
      ],
    });

    const volume = (occBrep: string): number => {
      const shape = deserializeShapeHelper(oc, occBrep);
      const props = new oc.GProp_GProps_1();
      oc.BRepGProp.VolumeProperties_2(shape, props, 1e-7, true, false);
      const value = Math.abs(props.Mass());
      props.delete();
      shape.delete();
      return value;
    };
    expect(volume(formed.occBrep!)).toBeGreaterThan(0);
    expect(formed.brepJson.faces.length).toBeGreaterThan(0);
  });

  it("replaces a face with a real sewn replacement face", () => {
    const target = boxFixture();
    const replacement = boxFixture();
    const result = handleReplaceFace(oc, {
      brepJson: target.brepJson,
      position: { x: 0, y: 0, z: 0 },
      faceIndices: [0],
      replacementBrepJson: replacement.brepJson,
      replacementPosition: { x: 0, y: 0, z: 0 },
      replacementFaceIndex: 0,
    });
    expect(result.brepJson.faces.length).toBeGreaterThan(0);
    const shape = deserializeShapeHelper(oc, result.occBrep!);
    const props = new oc.GProp_GProps_1();
    oc.BRepGProp.VolumeProperties_2(shape, props, 1e-7, true, false);
    expect(Math.abs(props.Mass())).toBeCloseTo(400, 3);
    props.delete();
    shape.delete();
  });

  it("rejects natural extension instead of silently treating it as linear", () => {
    const face = rectangleFace();
    const source = {
      brepJson: ocShapeToBRepHelper(oc, face, false).brepJson,
      occBrep: serializeShapeHelper(oc, face),
    };
    expect(() =>
      handleSurfaceExtend(oc, {
        brepJson: source.brepJson,
        position: { x: 0, y: 0, z: 0 },
        occBrep: source.occBrep,
        edgeIndices: [1],
        distance: 5,
        mode: "natural",
        tolerance: 1e-6,
      }),
    ).toThrow(/natural extension is not implemented/);
  });
});
