import { Brep, Edge, Vertex } from "@vitekk02/cadjs";
import { describe, expect, it } from "vitest";
import {
  buildConstraintNode,
  extendSnapshot,
  isValidConstraint,
  trimSnapshot,
  type SketchSnapLike,
} from "../constraints";
import {
  edgeIndexOf,
  nearestVertexDistance,
  polylineLength,
  straightEdgeAngle,
} from "../measure";
import type { BodyOutput } from "../executor";
import { allowedOperations, menuFor } from "../operationMenu";
import { buildRectangleProfileNodes } from "../primitives";

const snap: SketchSnapLike = {
  id: "S1",
  plane: { type: "XY" },
  primitives: [
    { id: "p1", type: "point", x: 0, y: 0 },
    { id: "p2", type: "point", x: 2, y: 0 },
    { id: "p3", type: "point", x: 1, y: -1 },
    { id: "p4", type: "point", x: 1, y: 1 },
    { id: "l1", type: "line", p1Id: "p1", p2Id: "p2" },
    { id: "l2", type: "line", p1Id: "p3", p2Id: "p4" },
  ],
  constraints: [],
};

const body = (pts: number[][]): BodyOutput => {
  const v = pts.map((p) => new Vertex(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0));
  const edges = [new Edge(v[0]!, v[1]!), new Edge(v[1]!, v[2]!)];
  const brep = new Brep(v, edges, []);
  return {
    featureId: "F",
    kind: "body",
    brep,
    position: { x: 0, y: 0, z: 0 } as never,
    edgeTags: ["F_E0", "F_E1"],
    faceTags: [],
  } as unknown as BodyOutput;
};

describe("constraints (cheap wins)", () => {
  it("builds a distance constraint node", () => {
    const n = buildConstraintNode({
      featureId: "Fc",
      sketchFeatureId: "S1",
      type: "distance",
      primitiveIds: ["p1", "p2"],
      value: 3,
    });
    expect(n.featureType).toBe("constraint");
    const q = n.parameters.find((p) => p.parameterId === "sketch");
    expect(q?.kind === "queryList" && q.queries[0]?.creationFeatureId).toBe(
      "S1",
    );
    expect(n.parameters.find((p) => p.parameterId === "value")).toMatchObject({
      kind: "quantity",
      value: 3,
    });
  });
  it("validates constraints the way Onshape filters menus", () => {
    expect(isValidConstraint(snap, "horizontal", ["l1"])).toBe(true);
    expect(isValidConstraint(snap, "distance", ["p1", "p2"])).toBe(true);
    expect(isValidConstraint(snap, "concentric", ["p1", "p2"])).toBe(false);
  });
  it("trims a line past an intersection", () => {
    const r = trimSnapshot(snap, "l1", { x: 1.6, y: 0.1 });
    expect(r).not.toBeNull();
    const prims = r!.snapshot.primitives as Array<Record<string, unknown>>;
    const lines = prims.filter((p) => p.type === "line");
    const points = prims.filter((p) => p.type === "point") as Array<{
      id: string;
      x: number;
      y: number;
    }>;
    expect(lines.length).toBeLessThanOrEqual(4);
    const xs = points.map((p) => p.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(2 + 1e-6);
  });
  it("extends a line endpoint to nearest target", () => {
    const s2: SketchSnapLike = {
      id: "S2",
      plane: { type: "XY" },
      primitives: [
        { id: "a", type: "point", x: 0, y: 0 },
        { id: "b", type: "point", x: 1, y: 0 },
        { id: "c", type: "point", x: 2, y: -3 },
        { id: "d", type: "point", x: 2, y: 3 },
        { id: "la", type: "line", p1Id: "a", p2Id: "b" },
        { id: "lc", type: "line", p1Id: "c", p2Id: "d" },
      ],
    };
    const r = extendSnapshot(s2, "la", false);
    expect(r).not.toBeNull();
    const prims = r!.primitives as Array<Record<string, unknown>>;
    const b = prims.find((p) => p.id === "b") as { x: number; y: number };
    expect(b.x).toBeCloseTo(2, 6);
    expect(b.y).toBeCloseTo(0, 6);
  });
});

describe("measure (cheap wins)", () => {
  it("parses edge tags", () => {
    expect(edgeIndexOf("F7_E12")).toBe(12);
    expect(() => edgeIndexOf("F7_F0")).toThrow();
  });
  it("polyline length + angle + distance are pure and exact", () => {
    const b = body([
      [0, 0, 0],
      [3, 0, 0],
      [3, 4, 0],
    ]);
    expect(polylineLength(b)).toBeCloseTo(7, 6);
    expect(straightEdgeAngle(b, "F_E0", "F_E1")).toBeCloseTo(90, 6);
    const b2 = body([
      [0, 0, 3],
      [1, 0, 3],
      [1, 1, 3],
    ]);
    expect(nearestVertexDistance(b, b2)).toBeCloseTo(3, 6);
  });
});

describe("menu statuses flipped", () => {
  it("dimension, constrain, trim, measure now ready", () => {
    const ids = menuFor("edge").map((o) => o.id);
    expect(ids).toContain("measure");
    const ready = allowedOperations("sketch-line").map((o) => o.id);
    expect(ready).toContain("dimension");
    expect(ready).toContain("constraint");
    expect(ready).toContain("trim-extend");
    expect(allowedOperations("vertex").map((o) => o.id)).toContain("measure");
  });
  it("rectangle profile builder returns a sketch node", () => {
    const nodes = buildRectangleProfileNodes("F1", "R", {
      width: 2,
      height: 1,
    });
    expect(nodes[0]!.featureType).toBe("newSketch");
    const snap = nodes[0]!.extensions!.sketch as { primitives: unknown[] };
    expect(snap.primitives.length).toBe(8);
  });
});
