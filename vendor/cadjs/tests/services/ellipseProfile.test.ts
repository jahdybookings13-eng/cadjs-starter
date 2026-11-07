import { describe, expect, it } from "vitest";
import { getOcInstance } from "../../src/services/opencascade-instance";
import {
  makeAxis2,
  makeDir,
  makeEdgeFromEllipse,
  makeEdgeFromEllipticalArc,
  makeEdgeFromSpline,
  makeEdgeFromBezier,
  makeEdgeFromConic,
  makePlanarFace,
  makePoint,
  makeWireFromEdge,
} from "../../src/services/occ-facade";

describe("ellipse OCC profile", () => {
  it(
    "builds a closed elliptical edge, wire and planar face",
    async () => {
      const oc = await getOcInstance();
      const center = makePoint(oc, 0, 0, 0);
      const normal = makeDir(oc, 0, 0, 1);
      const xDir = makeDir(oc, 1, 0, 0);
      const axis = makeAxis2(oc, center, normal, xDir);

      const edge = makeEdgeFromEllipse(oc, axis, 4, 2);
      expect(edge).toBeTruthy();

      const wire = makeWireFromEdge(oc, edge);
      const face = makePlanarFace(oc, wire);
      expect(face).toBeTruthy();

      face.delete();
      wire.delete();
      edge.delete();
      axis.delete();
      xDir.delete();
      normal.delete();
      center.delete();
    },
    120000,
  );
  it(
    "builds an elliptical arc edge and wire",
    async () => {
      const oc = await getOcInstance();
      const center = makePoint(oc, 0, 0, 0);
      const normal = makeDir(oc, 0, 0, 1);
      const xDir = makeDir(oc, 1, 0, 0);
      const axis = makeAxis2(oc, center, normal, xDir);

      const edge = makeEdgeFromEllipticalArc(
        oc,
        axis,
        4,
        2,
        0,
        Math.PI / 2,
      );
      expect(edge).toBeTruthy();

      const wire = makeWireFromEdge(oc, edge);
      expect(wire).toBeTruthy();

      wire.delete();
      edge.delete();
      axis.delete();
      xDir.delete();
      normal.delete();
      center.delete();
    },
    120000,
  );
  it(
    "builds a cubic Bezier edge and wire",
    async () => {
      const oc = await getOcInstance();
      const edge = makeEdgeFromBezier(oc, [
        { x: -3, y: 0 },
        { x: -1, y: 3 },
        { x: 1, y: -3 },
        { x: 3, y: 0 },
      ]);
      expect(edge).toBeTruthy();

      const wire = makeWireFromEdge(oc, edge);
      expect(wire).toBeTruthy();

      wire.delete();
      edge.delete();
    },
    120000,
  );
  it(
    "builds a rational conic edge and wire",
    async () => {
      const oc = await getOcInstance();
      const edge = makeEdgeFromConic(
        oc,
        { x: -3, y: 0 },
        { x: 0, y: 4 },
        { x: 3, y: 0 },
        0.5,
      );
      expect(edge).toBeTruthy();

      const wire = makeWireFromEdge(oc, edge);
      expect(wire).toBeTruthy();

      wire.delete();
      edge.delete();
    },
    120000,
  );
  it(
    "builds an interpolated spline edge and wire",
    async () => {
      const oc = await getOcInstance();
      const edge = makeEdgeFromSpline(oc, [
        { x: -3, y: 0 },
        { x: 0, y: 2 },
        { x: 3, y: 0 },
      ]);
      expect(edge).toBeTruthy();

      const wire = makeWireFromEdge(oc, edge);
      expect(wire).toBeTruthy();

      wire.delete();
      edge.delete();
    },
    120000,
  );
});
