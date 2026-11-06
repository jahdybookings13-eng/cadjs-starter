import { describe, it, expect } from "vitest";
import {
  extractGeometry,
  makeViewBasis,
  projectEdges,
  projectPoints,
  VIEWS,
  isViewName,
  normBrep,
  type Pt3,
  type Pt3 as P3,
} from "../geometry";

const V = (x: number, y: number, z: number): Pt3 => ({ x, y, z });
const [v0, v1, v2, v3, v4, v5, v6, v7] = [
  V(0, 0, 0),
  V(1, 0, 0),
  V(1, 1, 0),
  V(0, 1, 0),
  V(0, 0, 1),
  V(1, 0, 1),
  V(1, 1, 1),
  V(0, 1, 1),
];
const BOX_EDGES: { start: Pt3; end: Pt3 }[] = [
  { start: v0, end: v1 },
  { start: v1, end: v2 },
  { start: v2, end: v3 },
  { start: v3, end: v0 },
  { start: v4, end: v5 },
  { start: v5, end: v6 },
  { start: v6, end: v7 },
  { start: v7, end: v4 },
  { start: v0, end: v4 },
  { start: v1, end: v5 },
  { start: v2, end: v6 },
  { start: v3, end: v7 },
];
const BOX_FACES: { vertices: Pt3[] }[] = [
  { vertices: [v0, v1, v2, v3] },
  { vertices: [v4, v7, v6, v5] },
  { vertices: [v0, v1, v5, v4] },
  { vertices: [v2, v6, v7, v3] },
  { vertices: [v1, v2, v6, v5] },
  { vertices: [v0, v4, v7, v3] },
];
const BOX = {
  vertices: [v0, v1, v2, v3, v4, v5, v6, v7],
  edges: BOX_EDGES,
  faces: BOX_FACES,
};

describe("normBrep", () => {
  it("clones vertices/edges/faces (no aliasing)", () => {
    const src = { vertices: [{ x: 1, y: 2, z: 3 }], edges: [], faces: [] };
    const out = normBrep(src);
    out.vertices[0]!.x = 99;
    expect(src.vertices[0]!.x).toBe(1);
  });
  it("tolerates missing fields", () => {
    const out = normBrep({});
    expect(out.vertices).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.faces).toEqual([]);
  });
});

describe("extractGeometry — unit cube", () => {
  const g = extractGeometry(BOX);

  it("counts vertices / edges / faces", () => {
    expect(g.vertexCount).toBe(8);
    expect(g.edgeCount).toBe(12);
    expect(g.faceCount).toBe(6);
  });

  it("computes the bbox", () => {
    expect(g.bbox.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(g.bbox.max).toEqual({ x: 1, y: 1, z: 1 });
    expect(g.bbox.center).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
    expect(g.bbox.size).toEqual({ x: 1, y: 1, z: 1 });
  });

  it("emits one axis dim per world axis with the right value", () => {
    const byAxis = new Map(g.axisDims.map((d) => [d.axis, d.value]));
    expect(byAxis.get("x")).toBeCloseTo(1);
    expect(byAxis.get("y")).toBeCloseTo(1);
    expect(byAxis.get("z")).toBeCloseTo(1);
  });

  it("marks all 6 faces planar with 4 corners each", () => {
    expect(g.faces.every((f) => f.isPlanar)).toBe(true);
    expect(g.faces.every((f) => f.cornerCount === 4)).toBe(true);
  });

  it("finds 6 rectangular faces with dims [1,1]", () => {
    expect(g.rectDims).toHaveLength(6);
    expect(g.rectDims.every((r) => r.dims[0] === 1 && r.dims[1] === 1)).toBe(
      true,
    );
  });

  it("reports no circles for a box", () => {
    expect(g.circleDims).toHaveLength(0);
  });

  it("edge lengths are all 1 and directions are unit", () => {
    for (const e of g.edges) {
      expect(e.length).toBeCloseTo(1);
      const l = Math.hypot(e.dir.x, e.dir.y, e.dir.z);
      expect(l).toBeCloseTo(1);
    }
  });
});

describe("extractGeometry — translation & rotation", () => {
  it("applies a world translation", () => {
    const g = extractGeometry(BOX, { position: { x: 5, y: 0, z: 0 } });
    expect(g.bbox.min.x).toBeCloseTo(5);
    expect(g.bbox.max.x).toBeCloseTo(6);
    expect(g.bbox.center.x).toBeCloseTo(5.5);
  });

  it("rotates 90° about Z (x→y)", () => {
    // A unit cube at the origin rotated +Z 90° sends (1,0,0)→(0,1,0);
    // the bbox spans x∈[-1,0], y∈[0,1], z∈[0,1].
    const g = extractGeometry(BOX, {
      rotation: { x: 0, y: 0, z: Math.PI / 2 },
    });
    expect(g.bbox.min.x).toBeCloseTo(-1);
    expect(g.bbox.max.x).toBeCloseTo(0, 5);
    expect(g.bbox.min.y).toBeCloseTo(0);
    expect(g.bbox.max.y).toBeCloseTo(1);
    expect(g.bbox.min.z).toBeCloseTo(0);
    expect(g.bbox.max.z).toBeCloseTo(1);
  });
});

describe("extractGeometry — empty geometry", () => {
  it("degenerates to a zero bbox without throwing", () => {
    const g = extractGeometry({ vertices: [], edges: [], faces: [] });
    expect(g.vertexCount).toBe(0);
    expect(g.bbox.size).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("view basis + projection", () => {
  it("front view: +Y stays up, +X stays right", () => {
    const v = makeViewBasis(VIEWS.front);
    const p = v.to2({ x: 2, y: 3, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(2);
    expect(p.y).toBeCloseTo(3);
  });

  it("top view drops the y (line-of-sight) axis, keeps x-right / z-up", () => {
    // Top view: eye = −Y. "right" = +X, "up" = +Z (right-handed).
    // World X → 2-D x, world Z → 2-D y, world Y → dropped.
    const v = makeViewBasis(VIEWS.top);
    const p = v.to2({ x: 1, y: 2, z: 5 }, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(5, 5);
  });

  it("isViewName guards the enum", () => {
    expect(isViewName("front")).toBe(true);
    expect(isViewName("iso")).toBe(true);
    expect(isViewName("diagonal")).toBe(false);
  });

  it("projectEdges returns one 2-D edge per 3-D edge", () => {
    const g = extractGeometry(BOX);
    const v = makeViewBasis(VIEWS.front);
    const edges = projectEdges(g, v);
    expect(edges).toHaveLength(12);
  });

  it("projectPoints projects world points", () => {
    const v = makeViewBasis(VIEWS.front);
    const c: P3 = { x: 0, y: 0, z: 0 };
    const pts = projectPoints([{ x: 1, y: 2, z: 3 }], v, c);
    expect(pts[0]!.x).toBeCloseTo(1);
    expect(pts[0]!.y).toBeCloseTo(2);
  });
});
