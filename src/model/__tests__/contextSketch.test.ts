import { describe, expect, it } from "vitest";
import {
  addContextCircle,
  addContextLine,
  addContextReference,
  emptyContextSketch,
  parseContextSketch,
  parseContextSketches,
  projectContextPoint,
  referencesFromBoxes,
  referencesFromEdges,
  refreshContextReferences,
  serializeContextSketch,
} from "../contextSketch";

describe("context sketches", () => {
  const box = {
    id: "body-1",
    name: "Bracket",
    min: { x: 0, y: 0, z: 0 },
    max: { x: 0.04, y: 0.02, z: 0.01 },
  };

  it("projects reference boxes into the sketch plane", () => {
    const refs = referencesFromBoxes([box], "XY", 1000);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.sourceId).toBe("body-1");
    expect(refs[0]!.segments).toHaveLength(4);
    expect(refs[0]!.segments[0]!.a).toEqual({ x: 0, y: 0 });
    expect(refs[0]!.segments[1]!.a).toEqual({ x: 40, y: 0 });
  });

  it("projects body edges and drops zero-length ones", () => {
    const refs = referencesFromEdges(
      [
        {
          id: "b",
          name: "Body",
          edges: [
            [
              { x: 0, y: 0, z: 0 },
              { x: 0.01, y: 0, z: 0 },
            ],
            [
              { x: 1, y: 1, z: 1 },
              { x: 1, y: 1, z: 1 },
            ],
          ],
        },
      ],
      "XZ",
      1000,
    );
    expect(refs[0]!.segments).toHaveLength(1);
    expect(refs[0]!.segments[0]!.b).toEqual({ x: 10, y: 0 });
  });

  it("adds lines and circles and keeps references cross-context", () => {
    const ref = referencesFromBoxes([box])[0]!;
    let sketch = emptyContextSketch("assembly", "Top sketch", [ref]);
    sketch = addContextLine(sketch, { x: 0, y: 0 }, { x: 20, y: 5 });
    sketch = addContextCircle(sketch, { x: 5, y: 5 }, 4);
    expect(sketch.lines).toHaveLength(1);
    expect(sketch.circles).toHaveLength(1);
    expect(sketch.references[0]!.sourceId).toBe("body-1");
    expect(addContextLine(sketch, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(sketch);
    expect(addContextReference(sketch, ref)).toBe(sketch);
  });

  it("refreshes reference geometry without dropping authored geometry", () => {
    const ref = referencesFromBoxes([box])[0]!;
    let sketch = emptyContextSketch("drawing", "Layout", [ref]);
    sketch = addContextLine(sketch, { x: 0, y: 0 }, { x: 10, y: 0 });
    const moved = referencesFromBoxes([
      { ...box, max: { x: 0.08, y: 0.02, z: 0.01 } },
    ])[0]!;
    const next = refreshContextReferences(sketch, [moved]);
    expect(next.lines).toHaveLength(1);
    expect(next.references[0]!.segments[1]!.a.x).toBe(80);
  });

  it("round-trips through JSON and rejects corruption", () => {
    const ref = referencesFromBoxes([box])[0]!;
    const sketch = addContextLine(
      emptyContextSketch("assembly", "Sketch", [ref]),
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    );
    const parsed = parseContextSketch(
      JSON.parse(serializeContextSketch(sketch)),
    );
    expect(parsed).toMatchObject({
      name: "Sketch",
      context: "assembly",
      plane: "XY",
    });
    expect(parsed?.lines).toHaveLength(1);
    expect(parseContextSketch({ ...sketch, v: 99 })).toBeNull();
    expect(parseContextSketches([sketch, null, { bad: true }])).toHaveLength(1);
  });

  it("uses the plane selector for projection", () => {
    expect(projectContextPoint({ x: 1, y: 2, z: 3 }, "YZ", 10)).toEqual({
      x: 20,
      y: 30,
    });
  });
});
