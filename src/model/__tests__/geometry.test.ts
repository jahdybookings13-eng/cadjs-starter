import { describe, expect, it } from "vitest";
import {
  axisFromSnapshot,
  mapBooleanOperation,
  pathPointsFromSnapshot,
  pointToWorld,
} from "../executor";

const plane = {
  type: "XZ" as const,
  origin: [0, 0.75, 0],
  normal: [0, 1, 0],
  xAxis: [1, 0, 0],
  yAxis: [0, 0, -1],
};
const snap = {
  id: "Fsk",
  plane,
  primitives: [
    { id: "p1", type: "point", x: 0, y: 0 },
    { id: "p2", type: "point", x: 1, y: 0 },
    { id: "p3", type: "point", x: 1, y: 1 },
    { id: "p4", type: "point", x: 0, y: 1 },
    { id: "l1", type: "line", p1Id: "p1", p2Id: "p2" },
    { id: "l2", type: "line", p1Id: "p2", p2Id: "p3" },
    { id: "l3", type: "line", p1Id: "p3", p2Id: "p4" },
  ],
  constraints: [],
};

describe("snapshot geometry", () => {
  it("maps sketch coords through XZ plane basis", () => {
    expect(pointToWorld(plane, 2, 3)).toEqual({ x: 2, y: 0.75, z: -3 });
  });
  it("resolves line axis with normalized direction", () => {
    const ax = axisFromSnapshot(snap as never, "l1");
    expect(ax?.origin).toEqual({ x: 0, y: 0.75, z: 0 });
    expect(ax?.dir).toEqual({ x: 1, y: 0, z: 0 });
  });
  it("NORMAL axis uses plane normal", () => {
    expect(axisFromSnapshot(snap as never, "NORMAL")?.dir.y).toBe(1);
  });
  it("chains 3 lines into 4 ordered points from degree-1 start", () => {
    const pts = pathPointsFromSnapshot(snap as never);
    expect(pts).toHaveLength(4);
    expect(pts[3]).toEqual({ x: 0, y: 0.75, z: -1 });
  });
});

describe("boolean operation mapping", () => {
  it("maps ADD/CUT/COMMON to worker operations", () => {
    expect(mapBooleanOperation("ADD")).toBe("union");
    expect(mapBooleanOperation("CUT")).toBe("difference");
    expect(mapBooleanOperation("COMMON")).toBe("intersection");
    expect(mapBooleanOperation("INTERSECT")).toBe("intersection");
  });
});
