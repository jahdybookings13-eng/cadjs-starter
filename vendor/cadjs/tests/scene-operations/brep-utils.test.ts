import { Brep, CompoundBrep, Vertex, Face } from "../../src/geometry";
import {
  axisRanges,
  flatAxis,
  isFlat,
  thickAxisCount,
} from "../../src/scene-operations/brep-utils";
import { AXIS_FLATNESS_MM } from "../../src/tolerances";

function makeBrep(vertices: Vertex[]): Brep {
  const faces = vertices.length >= 3 ? [new Face(vertices.slice(0, 3))] : [];
  return new Brep(vertices, [], faces);
}

describe("axisRanges", () => {
  test("returns null for empty BRep", () => {
    expect(axisRanges(new Brep([], [], []))).toBeNull();
  });

  test("returns zero ranges for single vertex", () => {
    const brep = new Brep([new Vertex(1, 2, 3)], [], []);
    expect(axisRanges(brep)).toEqual({ x: 0, y: 0, z: 0 });
  });

  test("computes ranges along each axis", () => {
    const brep = makeBrep([
      new Vertex(-1, 0, 5),
      new Vertex(2, 7, 5.25),
      new Vertex(0, 3, 5.5),
    ]);
    expect(axisRanges(brep)).toEqual({ x: 3, y: 7, z: 0.5 });
  });

  test("uses unified BRep on CompoundBrep", () => {
    const inner = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(10, 0, 0),
      new Vertex(0, 10, 0),
    ]);
    const compound = new CompoundBrep([inner, inner]);
    compound.setUnifiedBrep(inner);
    expect(axisRanges(compound)).toEqual({ x: 10, y: 10, z: 0 });
  });

  test("falls back to compound's own (empty) vertices when no unified cache", () => {
    const inner = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(1, 0, 0),
      new Vertex(0, 1, 0),
    ]);
    const compound = new CompoundBrep([inner]);
    expect(axisRanges(compound)).toBeNull();
  });
});

describe("isFlat", () => {
  test("true when one axis range is below tolerance", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(2, 3, 0),
      new Vertex(2, 3, 0),
    ]);
    expect(isFlat(brep)).toBe(true);
  });

  test("false for a 3D cube", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(1, 1, 1),
      new Vertex(0, 1, 1),
      new Vertex(1, 0, 0),
    ]);
    expect(isFlat(brep)).toBe(false);
  });

  test("false for empty BRep", () => {
    expect(isFlat(new Brep([], [], []))).toBe(false);
  });

  test("respects custom tolerance", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(0.05, 1, 1),
      new Vertex(0.05, 0, 1),
    ]);
    expect(isFlat(brep, 0.01)).toBe(false);
    expect(isFlat(brep, 0.1)).toBe(true);
  });

  test("uses AXIS_FLATNESS_MM as default tolerance", () => {
    const justUnder = AXIS_FLATNESS_MM - 1e-9;
    const justOver = AXIS_FLATNESS_MM + 1e-9;
    const flatBrep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(justUnder, 5, 5),
      new Vertex(justUnder, 0, 5),
    ]);
    const thickBrep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(justOver, 5, 5),
      new Vertex(justOver, 0, 5),
    ]);
    expect(isFlat(flatBrep)).toBe(true);
    expect(isFlat(thickBrep)).toBe(false);
  });
});

describe("flatAxis", () => {
  test("returns 'x' for YZ-plane shape", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(0, 5, 5),
      new Vertex(0, 5, 0),
    ]);
    expect(flatAxis(brep)).toBe("x");
  });

  test("returns 'y' for XZ-plane shape", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(5, 0, 5),
      new Vertex(5, 0, 0),
    ]);
    expect(flatAxis(brep)).toBe("y");
  });

  test("returns 'z' for XY-plane shape", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(5, 5, 0),
      new Vertex(5, 0, 0),
    ]);
    expect(flatAxis(brep)).toBe("z");
  });

  test("returns null for a 3D cube", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(1, 1, 1),
      new Vertex(0, 1, 1),
      new Vertex(1, 0, 0),
    ]);
    expect(flatAxis(brep)).toBeNull();
  });

  test("returns null for empty BRep (caller can default)", () => {
    expect(flatAxis(new Brep([], [], []))).toBeNull();
  });
});

describe("thickAxisCount", () => {
  test("returns 0 for empty BRep", () => {
    expect(thickAxisCount(new Brep([], [], []))).toBe(0);
  });

  test("returns 0 for a single vertex (degenerate)", () => {
    expect(thickAxisCount(new Brep([new Vertex(0, 0, 0)], [], []))).toBe(0);
  });

  test("returns 1 for a line along Y", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(0, 5, 0),
      new Vertex(0, 5, 0),
    ]);
    expect(thickAxisCount(brep)).toBe(1);
  });

  test("returns 2 for a flat XY rectangle", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(5, 0, 0),
      new Vertex(5, 5, 0),
    ]);
    expect(thickAxisCount(brep)).toBe(2);
  });

  test("returns 3 for a 3D shape", () => {
    const brep = makeBrep([
      new Vertex(0, 0, 0),
      new Vertex(1, 1, 1),
      new Vertex(0, 1, 1),
      new Vertex(1, 0, 0),
    ]);
    expect(thickAxisCount(brep)).toBe(3);
  });
});
