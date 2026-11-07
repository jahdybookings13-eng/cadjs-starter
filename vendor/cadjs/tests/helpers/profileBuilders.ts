import { Brep } from "../../src/geometry";
import { getOcInstance } from "../../src/services/opencascade-instance";
import {
  ocShapeToBRepHelper,
  computeBoundingBoxCenter,
  translateShape,
  serializeShapeHelper,
} from "../../src/services/occ-helpers";

export interface BuiltProfile {
  brep: Brep;
  occBrep: string;
}

export interface BuiltSolid {
  brep: Brep;
  occBrep: string;
}

async function shapeToOccBrep(
  shape: any,
  centerAtOrigin: boolean,
): Promise<{ brep: Brep; occBrep: string }> {
  const oc = await getOcInstance();
  const { brepJson } = ocShapeToBRepHelper(oc, shape, centerAtOrigin);
  const brep = Brep.fromJSON(brepJson);
  let serialized = shape;
  if (centerAtOrigin) {
    const center = computeBoundingBoxCenter(oc, shape);
    serialized = translateShape(oc, shape, {
      x: -center.x,
      y: -center.y,
      z: -center.z,
    });
  }
  const occBrep = serializeShapeHelper(oc, serialized);
  return { brep, occBrep };
}

export async function buildAnalyticCircleProfile(
  radius: number,
): Promise<BuiltProfile> {
  const oc = await getOcInstance();
  const center = new oc.gp_Pnt_3(0, 0, 0);
  const dir = new oc.gp_Dir_4(0, 0, 1);
  const axis = new oc.gp_Ax2_3(center, dir);
  const circle = new oc.gp_Circ_2(axis, radius);
  const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_8(circle);
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_2(edgeBuilder.Edge());
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(
    wireBuilder.Wire(),
    true,
  );
  const face = faceBuilder.Face();
  return shapeToOccBrep(face, true);
}

async function buildPlanarFaceFromXYPoints(
  points: number[][],
  centerAtOrigin = true,
): Promise<BuiltProfile> {
  const oc = await getOcInstance();
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const a = new oc.gp_Pnt_3(ax, ay, 0);
    const b = new oc.gp_Pnt_3(bx, by, 0);
    const edge = new oc.BRepBuilderAPI_MakeEdge_3(a, b).Edge();
    wireBuilder.Add_1(edge);
  }
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(
    wireBuilder.Wire(),
    true,
  );
  return shapeToOccBrep(faceBuilder.Face(), centerAtOrigin);
}

export async function buildRectProfile(
  w: number,
  h: number,
): Promise<BuiltProfile> {
  const hw = w / 2;
  const hh = h / 2;
  return buildPlanarFaceFromXYPoints([
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]);
}

export async function buildBoxSolid(
  w: number,
  h: number,
  d: number,
): Promise<BuiltSolid> {
  const oc = await getOcInstance();
  const box = new oc.BRepPrimAPI_MakeBox_2(w, h, d);
  return shapeToOccBrep(box.Shape(), true);
}

export async function buildLProfile(
  w: number,
  h: number,
  t: number,
  centerAtOrigin = true,
): Promise<BuiltProfile> {
  return buildPlanarFaceFromXYPoints(
    [
      [0, 0],
      [w, 0],
      [w, t],
      [t, t],
      [t, h],
      [0, h],
    ],
    centerAtOrigin,
  );
}
