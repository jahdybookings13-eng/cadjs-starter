import { describe, expect, it } from "vitest";
import {
  createSketchPlane,
  type Sketch,
  type SketchArc,
  type SketchLine,
  type SketchPoint,
  type SketchPrimitive,
} from "@vitekk02/cadjs";
import {
  cornerModifyArcArc,
  cornerModifyLineArc,
  cornerModifyLines,
} from "../sketchCorner";
import {
  findSketchCommand,
  sketchCommandAvailability,
} from "../sketchControls";

const point = (id: string, x: number, y: number): SketchPoint => ({
  id,
  type: "point",
  x,
  y,
});

const line = (id: string, p1Id: string, p2Id: string): SketchLine => ({
  id,
  type: "line",
  p1Id,
  p2Id,
});

const arc = (
  id: string,
  centerId: string,
  startId: string,
  endId: string,
  radius: number,
): SketchArc => ({ id, type: "arc", centerId, startId, endId, radius });

const sketchWith = (primitives: SketchPrimitive[]): Sketch => ({
  id: "sketch_corner",
  plane: createSketchPlane("XY"),
  primitives,
  constraints: [],
  dof: 0,
  status: "underconstrained",
});

const ids = () => {
  let next = 0;
  return (prefix: string) => `${prefix}_${++next}`;
};

const pointById = (primitives: SketchPrimitive[], id: string): SketchPoint => {
  const found = primitives.find((primitive) => primitive.id === id);
  expect(found?.type).toBe("point");
  return found as SketchPoint;
};

describe("cornerModifyLines", () => {
  const source = () =>
    sketchWith([
      point("corner", 0, 0),
      point("right", 10, 0),
      point("up", 0, 10),
      line("horizontal", "corner", "right"),
      line("vertical", "corner", "up"),
    ]);

  it("trims two lines to a tangent arc", () => {
    const result = cornerModifyLines(
      source(),
      ["horizontal", "vertical"],
      "fillet",
      1,
      ids(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const arc = result.primitives[0] as SketchArc;
    expect(arc.type).toBe("arc");
    expect(arc.radius).toBe(1);
    expect(arc.startId).not.toBe(arc.endId);

    const start = pointById(result.points, arc.startId);
    const end = pointById(result.points, arc.endId);
    const center = pointById(result.points, arc.centerId);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(1);
    expect(end.x).toBeCloseTo(1);
    expect(end.y).toBeCloseTo(0);
    expect(center.x).toBeCloseTo(1);
    expect(center.y).toBeCloseTo(1);

    const horizontalUpdate = result.lineUpdates.find(
      (update) => update.id === "horizontal",
    );
    const verticalUpdate = result.lineUpdates.find(
      (update) => update.id === "vertical",
    );
    expect(horizontalUpdate?.p1Id).toBe(arc.endId);
    expect(verticalUpdate?.p1Id).toBe(arc.startId);
    expect(result.removePointIds).toContain("corner");
  });

  it("inserts a straight chamfer between the trimmed ends", () => {
    const result = cornerModifyLines(
      source(),
      ["horizontal", "vertical"],
      "chamfer",
      2,
      ids(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chamfer = result.primitives[0] as SketchLine;
    expect(chamfer.type).toBe("line");
    const p1 = pointById(result.points, chamfer.p1Id);
    const p2 = pointById(result.points, chamfer.p2Id);
    expect([p1.x, p1.y]).toEqual([2, 0]);
    expect([p2.x, p2.y]).toEqual([0, 2]);
  });

  it("refuses parallel lines", () => {
    const result = cornerModifyLines(
      sketchWith([
        point("a", 0, 0),
        point("b", 10, 0),
        point("c", 0, 2),
        point("d", 10, 2),
        line("one", "a", "b"),
        line("two", "c", "d"),
      ]),
      ["one", "two"],
      "fillet",
      1,
      ids(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/parallel/i);
  });

  it("refuses a radius larger than the lines", () => {
    const result = cornerModifyLines(
      source(),
      ["horizontal", "vertical"],
      "fillet",
      20,
      ids(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/too large/i);
  });

  it("enables the fillet command for a curve corner and chamfer only for lines", () => {
    const command = findSketchCommand("FILLET");
    expect(command?.id).toBe("sketch.fillet");
    expect(findSketchCommand("CHA")?.id).toBe("sketch.chamfer");
    if (!command) return;

    const base = {
      hasSelection: true,
      hasPointSelection: false,
      canUndo: true,
      canRedo: true,
    };
    expect(sketchCommandAvailability(command, base).enabled).toBe(true);
    expect(
      sketchCommandAvailability(command, {
        ...base,
        hasTwoLineSelection: true,
      }).enabled,
    ).toBe(true);
    expect(
      sketchCommandAvailability(findSketchCommand("CHA")!, {
        ...base,
        hasTwoLineSelection: false,
      }).enabled,
    ).toBe(false);
  });

  it("fillets a line and arc that share a perpendicular corner", () => {
    const result = cornerModifyLineArc(
      sketchWith([
        point("corner", 10, 0),
        point("lineFar", 0, 0),
        point("center", 5, 0),
        point("arcFar", 5, 5),
        line("line", "corner", "lineFar"),
        arc("arc", "center", "corner", "arcFar", 5),
      ]),
      ["line", "arc"],
      1,
      ids(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fillet = result.primitives[0] as SketchArc;
    expect(fillet.type).toBe("arc");
    expect(fillet.radius).toBe(1);
    const tangentLine = pointById(result.points, fillet.startId);
    const tangentArc = pointById(result.points, fillet.endId);
    const center = pointById(result.points, fillet.centerId);
    expect(center.x).toBeCloseTo(8.873, 3);
    expect(center.y).toBeCloseTo(1, 3);
    expect(tangentLine.x).toBeCloseTo(8.873, 3);
    expect(tangentLine.y).toBeCloseTo(0, 3);
    expect(tangentArc.x).toBeCloseTo(9.841, 3);
    expect(tangentArc.y).toBeCloseTo(1.25, 3);
    expect(result.lineUpdates[0]?.p1Id).toBe(fillet.startId);
    expect(result.arcUpdates?.[0]?.startId).toBe(fillet.endId);
    expect(result.removePointIds).toContain("corner");
  });

  it("fillets two arcs that share a corner", () => {
    const result = cornerModifyArcArc(
      sketchWith([
        point("corner", 0.915, -0.915),
        point("c1", -4, 0),
        point("c2", 0, 4),
        point("a-far", 0.8296, 1.2941),
        point("b-far", -1.2941, -0.8296),
        arc("arc-a", "c1", "corner", "a-far", 5),
        arc("arc-b", "c2", "b-far", "corner", 5),
      ]),
      ["arc-a", "arc-b"],
      1,
      ids(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fillet = result.primitives[0] as SketchArc;
    expect(fillet.radius).toBe(1);
    const center = pointById(result.points, fillet.centerId);
    expect(center.x).toBeCloseTo(0, 6);
    expect(center.y).toBeCloseTo(0, 6);
    const start = pointById(result.points, fillet.startId);
    const end = pointById(result.points, fillet.endId);
    const tangencies = [
      [start.x, start.y],
      [end.x, end.y],
    ].sort((a, b) => a[0]! - b[0]!);
    expect(tangencies[0]![0]).toBeCloseTo(0, 3);
    expect(tangencies[0]![1]).toBeCloseTo(-1, 3);
    expect(tangencies[1]![0]).toBeCloseTo(1, 3);
    expect(tangencies[1]![1]).toBeCloseTo(0, 3);
    expect(result.arcUpdates).toHaveLength(2);
    expect(result.removePointIds).toContain("corner");
  });

  it("refuses a line/arc pair without a shared endpoint", () => {
    const result = cornerModifyLineArc(
      sketchWith([
        point("a", 10, 0),
        point("b", 0, 0),
        point("center", 5, 0),
        point("start", 5, 5),
        point("end", 5, -5),
        line("line", "a", "b"),
        arc("arc", "center", "start", "end", 5),
      ]),
      ["line", "arc"],
      1,
      ids(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/shared endpoint/i);
  });

  it("keeps a corner point that other geometry still uses", () => {
    const result = cornerModifyLines(
      sketchWith([
        point("corner", 0, 0),
        point("right", 10, 0),
        point("up", 0, 10),
        point("other", -5, -5),
        line("horizontal", "corner", "right"),
        line("vertical", "corner", "up"),
        line("otherLine", "corner", "other"),
      ]),
      ["horizontal", "vertical"],
      "chamfer",
      1,
      ids(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removePointIds).not.toContain("corner");
  });
});
