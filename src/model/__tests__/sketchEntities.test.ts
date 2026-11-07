import { describe, expect, it } from "vitest";
import type { Sketch, SketchPrimitive } from "@vitekk02/cadjs";
import {
  assignLayerToSelection,
  createBlockFromSelection,
  ensureSketchLayers,
  explodeBlockSelection,
  hatchFromSelection,
  insertBlock,
  orderedClosedLoop,
  polylineVertices,
} from "../sketchEntities";

let nextId = 0;
const id = (prefix: string) => `${prefix}_${++nextId}`;

function squareSketch(): Sketch {
  const primitives: SketchPrimitive[] = [
    { id: "p1", type: "point", x: 0, y: 0 },
    { id: "p2", type: "point", x: 10, y: 0 },
    { id: "p3", type: "point", x: 10, y: 10 },
    { id: "p4", type: "point", x: 0, y: 10 },
    { id: "l1", type: "line", p1Id: "p1", p2Id: "p2", polylineId: "pl1" },
    { id: "l2", type: "line", p1Id: "p2", p2Id: "p3", polylineId: "pl1" },
    { id: "l3", type: "line", p1Id: "p3", p2Id: "p4", polylineId: "pl1" },
    { id: "l4", type: "line", p1Id: "p4", p2Id: "p1", polylineId: "pl1" },
  ];
  return {
    id: "s1",
    plane: {
      type: "XY",
      origin: { x: 0, y: 0, z: 0 } as never,
      normal: { x: 0, y: 0, z: 1 } as never,
      xAxis: { x: 1, y: 0, z: 0 } as never,
      yAxis: { x: 0, y: 1, z: 0 } as never,
    },
    primitives,
    constraints: [],
    dof: 0,
    status: "underconstrained",
  };
}

describe("sketch entities", () => {
  it("supplies a default layer and assigns a selection to a named layer", () => {
    const sketch = squareSketch();
    const layers = ensureSketchLayers(sketch);
    expect(layers).toHaveLength(1);
    const assigned = assignLayerToSelection(sketch, ["l1", "l2"], "layer_2");
    expect(
      assigned.primitives
        .filter((primitive) => primitive.type === "line")
        .map((primitive) => primitive.layerId),
    ).toEqual(["layer_2", "layer_2", undefined, undefined]);
  });

  it("orders the selected square into one closed polyline loop", () => {
    const loop = orderedClosedLoop(squareSketch(), ["l3", "l1", "l4", "l2"]);
    expect(loop?.lineIds).toHaveLength(4);
    expect(new Set(loop?.pointIds)).toEqual(new Set(["p1", "p2", "p3", "p4"]));
    expect(
      polylineVertices(squareSketch(), "pl1").map((point) => point.id),
    ).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("creates a hatch only for a closed loop", () => {
    const sketch = squareSketch();
    const result = hatchFromSelection(sketch, ["l1", "l2", "l3", "l4"], "h1", {
      pattern: "cross",
      spacing: 1,
      angle: 0.5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hatch.boundaryIds).toEqual(["l1", "l2", "l3", "l4"]);
    expect(result.hatch.pattern).toBe("cross");
    expect(hatchFromSelection(sketch, ["l1", "l2"], "h2").ok).toBe(false);
  });

  it("remaps hatch boundaries and polyline groups inside a block", () => {
    const sketch = squareSketch();
    const hatched = hatchFromSelection(sketch, ["l1", "l2", "l3", "l4"], "h1", {
      pattern: "solid",
    });
    expect(hatched.ok).toBe(true);
    if (!hatched.ok) return;
    const withHatch = {
      ...sketch,
      primitives: [...sketch.primitives, hatched.hatch],
    };
    const created = createBlockFromSelection(withHatch, ["h1"], "Hatched", id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const inserted = insertBlock(
      created.sketch,
      created.definition.id,
      { x: 40, y: 0 },
      id,
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const hatch = inserted.primitives.find((p) => p.type === "hatch");
    expect(hatch?.type).toBe("hatch");
    if (!hatch || hatch.type !== "hatch") return;
    const boundaryLines = inserted.primitives.filter(
      (p) => p.type === "line" && hatch.boundaryIds.includes(p.id),
    );
    expect(boundaryLines).toHaveLength(4);
    expect(new Set(boundaryLines.map((line) => line.polylineId)).size).toBe(1);
    expect(hatch.blockInstanceId).toBe(boundaryLines[0]?.blockInstanceId);
  });

  it("preserves a nested instance path when a block is used in another block", () => {
    const first = createBlockFromSelection(
      squareSketch(),
      ["l1", "l2", "l3", "l4"],
      "Cell",
      id,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const cell = insertBlock(
      first.sketch,
      first.definition.id,
      { x: 30, y: 0 },
      id,
    );
    expect(cell.ok).toBe(true);
    if (!cell.ok) return;
    const childInstance = cell.primitives[0]?.blockInstanceId;
    expect(childInstance).toBeTruthy();

    const parent = createBlockFromSelection(
      cell.sketch,
      cell.primitives.map((primitive) => primitive.id),
      "Array",
      id,
    );
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;
    const inserted = insertBlock(
      parent.sketch,
      parent.definition.id,
      { x: 60, y: 0 },
      id,
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const line = inserted.primitives.find((p) => p.type === "line");
    expect(line?.blockInstancePath).toHaveLength(2);
    expect(line?.blockInstancePath?.[0]).toBe(line?.blockInstanceId);
    expect(line?.blockInstancePath?.[1]).toBeTruthy();
    expect(line?.blockInstancePath?.[1]).not.toBe(childInstance);

    const nested = explodeBlockSelection(inserted.sketch, [line!.id]);
    expect(nested.count).toBeGreaterThan(0);
    const afterNested = nested.sketch.primitives.find((p) => p.id === line!.id);
    expect(afterNested?.blockInstancePath).toHaveLength(1);
    expect(afterNested?.blockInstanceId).toBe(
      afterNested?.blockInstancePath?.[0],
    );
  });

  it("defines, inserts and explodes a block instance", () => {
    const sketch = squareSketch();
    const created = createBlockFromSelection(
      sketch,
      ["l1", "l2", "l3", "l4"],
      "Square",
      id,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.sketch.blocks).toHaveLength(1);
    expect(created.definition.primitives).toHaveLength(8);

    const instanceId = created.sketch.primitives.find(
      (p) => p.id === "l1",
    )?.blockInstanceId;
    expect(instanceId).toBeTruthy();

    const inserted = insertBlock(
      created.sketch,
      created.definition.id,
      { x: 20, y: 0 },
      id,
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.primitives).toHaveLength(8);
    const insertedPoint = inserted.primitives.find((p) =>
      p.type === "point" ? p.x >= 20 : false,
    );
    expect(insertedPoint?.type === "point" ? insertedPoint.x : 0).toBeCloseTo(
      20,
    );

    const exploded = explodeBlockSelection(inserted.sketch, ["l1"]);
    expect(exploded.count).toBe(8);
    expect(
      exploded.sketch.primitives.find((p) => p.id === "l1")?.blockInstanceId,
    ).toBeUndefined();
  });
});
