import { describe, expect, it } from "vitest";
import { CAM_MAX_MOVES_PER_OPERATION, CAM_MAX_OPERATIONS } from "../model";
import {
  generateOperationPath,
  generateToolpaths,
  formatMinutes,
} from "../toolpath";
import { sampleDocument, sampleOperation } from "./fixtures";

describe("2.5D toolpaths", () => {
  it("generates a stepped contour with lead moves and tabs", () => {
    const document = sampleDocument();
    const path = generateOperationPath(document, sampleOperation);
    expect(path.moves.length).toBeGreaterThan(10);
    expect(path.cutLength).toBeGreaterThan(0);
    expect(path.rapidLength).toBeGreaterThan(0);
    expect(path.moves.some((move) => move.kind === "rapid")).toBe(true);
    expect(path.moves.some((move) => move.kind === "cut")).toBe(true);
    expect(
      path.moves.some(
        (move) =>
          move.kind === "cut" &&
          Math.abs(move.z - (20 - sampleOperation.depth + 1)) < 1e-9,
      ),
    ).toBe(true);
  });

  it("generates face, pocket and drill paths", () => {
    const document = sampleDocument();
    const face = generateOperationPath(document, {
      ...sampleOperation,
      id: "op_face",
      name: "Face",
      kind: "face",
    });
    expect(face.moves.length).toBeGreaterThan(0);
    const pocket = generateOperationPath(document, {
      ...sampleOperation,
      id: "op_pocket",
      name: "Pocket",
      kind: "pocket",
      tabs: null,
    });
    expect(pocket.moves.length).toBeGreaterThan(20);
    const drill = generateOperationPath(document, {
      ...sampleOperation,
      id: "op_drill",
      name: "Drill",
      kind: "drill",
      holes: [
        { x: 20, y: 20 },
        { x: 40, y: 20 },
      ],
      tabs: null,
    });
    expect(drill.moves.filter((move) => move.kind === "rapid")).toHaveLength(4);
    expect(drill.moves.filter((move) => move.kind === "cut")).toHaveLength(2);
  });

  it("aggregates paths in operation order and formats time", () => {
    const document = sampleDocument();
    document.operations = [
      { ...sampleOperation, id: "op_2", name: "Second", order: 2 },
      sampleOperation,
    ];
    const result = generateToolpaths(document);
    expect(result.paths.map((path) => path.operationName)).toEqual([
      "Outside contour",
      "Second",
    ]);
    expect(result.cutLength).toBeGreaterThan(0);
    expect(formatMinutes(0.5)).toBe("30 s");
    expect(formatMinutes(61 / 60)).toBe("1 min 1 s");
  });

  it("rejects an operation whose tool is missing", () => {
    const document = sampleDocument();
    document.tools = [];
    expect(() => generateOperationPath(document, sampleOperation)).toThrow(
      /missing tool/,
    );
  });

  it("rejects a runaway path at the per-operation move ceiling", () => {
    const document = sampleDocument();
    const operation = {
      ...sampleOperation,
      depth: CAM_MAX_MOVES_PER_OPERATION,
      stepdown: 1,
      tabs: null,
    };
    expect(() => generateOperationPath(document, operation)).toThrow(
      /move limit/i,
    );
  });

  it("rejects more operations than the CAM ceiling", () => {
    const document = sampleDocument();
    document.operations = Array.from(
      { length: CAM_MAX_OPERATIONS + 1 },
      (_, index) => ({ ...sampleOperation, id: `op_${index}`, order: index }),
    );
    expect(() => generateToolpaths(document)).toThrow(/at most/i);
  });
});
