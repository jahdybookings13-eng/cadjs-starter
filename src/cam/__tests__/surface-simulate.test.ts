import { debugLog } from "@vitekk02/cadjs";
import { describe, expect, it } from "vitest";
import {
  generateOperationPath,
  generateToolpaths,
  generateToolpathsAsync,
} from "../toolpath";
import { simulateToolpaths } from "../simulate";
import {
  validateCamDocument,
  type CamDocument,
  type OperationKind,
} from "../model";
import { sampleDocument, sampleOperation } from "./fixtures";

function surfaceDocument(kind: OperationKind): CamDocument {
  const document = sampleDocument();
  const cols = 11;
  const rows = 9;
  const heights = Array.from({ length: cols * rows }, (_, index) =>
    index % 2 === 0 ? 4 : 0,
  );
  document.surface = {
    origin: { x: 0, y: 0, z: 20 },
    cell: 4,
    cols,
    rows,
    heights,
  };
  document.operations = [
    {
      ...sampleOperation,
      id: `op_${kind}`,
      name: `3D ${kind}`,
      kind,
      depth: 4,
      stepdown: 2,
      stepover: 2,
      leadIn: 0,
      leadOut: 0,
      tabs: null,
    },
  ];
  return document;
}

describe("3D height-map toolpaths", () => {
  it.each(["adaptive", "parallel", "pencil", "rest"] as const)(
    "generates surface-following %s moves",
    (kind) => {
      const document = surfaceDocument(kind);
      const path = generateOperationPath(document, document.operations[0]!);
      expect(path.moves.length).toBeGreaterThan(2);
      expect(path.cutLength).toBeGreaterThan(0);
      expect(path.moves.some((move) => move.kind === "cut")).toBe(true);
      expect(path.moves.some((move) => move.kind === "rapid")).toBe(true);
      expect(path.moves[path.moves.length - 1]!.z).toBeGreaterThan(20);
    },
  );

  it("rejects a 3D operation without a surface by name", () => {
    const document = sampleDocument();
    document.operations[0] = {
      ...document.operations[0]!,
      kind: "parallel",
    };
    expect(validateCamDocument(document).map((issue) => issue.code)).toContain(
      "OPERATION_SURFACE",
    );
    expect(() =>
      generateOperationPath(document, document.operations[0]!),
    ).toThrow(/surface height map/);
  });
});

describe("CAM acceptance measurement", () => {
  it("generates a four-operation bracket case and records time/heap", () => {
    const document = surfaceDocument("parallel");
    const base = document.operations[0]!;
    document.operations = [
      {
        ...base,
        id: "op_face",
        name: "Face",
        kind: "face",
        depth: 0.5,
        stepdown: 0.5,
        order: 0,
        tabs: null,
      },
      {
        ...base,
        id: "op_contour",
        name: "Contour",
        kind: "contour",
        depth: 12,
        stepdown: 3,
        order: 1,
        tabs: null,
      },
      {
        ...base,
        id: "op_drill",
        name: "Drill",
        kind: "drill",
        depth: 12,
        order: 2,
        tabs: null,
        holes: [
          { x: 15, y: 12 },
          { x: 65, y: 38 },
        ],
      },
      {
        ...base,
        id: "op_parallel",
        name: "Parallel finish",
        kind: "parallel",
        depth: 4,
        stepdown: 1,
        order: 3,
      },
    ];
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    const result = generateToolpaths(document);
    const elapsed = performance.now() - started;
    const heap = process.memoryUsage().heapUsed - before;
    debugLog("CAM acceptance", {
      operations: result.paths.length,
      moves: result.paths.reduce((sum, path) => sum + path.moves.length, 0),
      elapsedMs: Number(elapsed.toFixed(2)),
      heapDeltaBytes: heap,
    });
    expect(result.paths).toHaveLength(4);
    expect(elapsed).toBeGreaterThan(0);
  });
});

describe("toolpath simulation", () => {
  it("reports clean parallel paths and remaining stock", () => {
    const document = surfaceDocument("parallel");
    const result = generateToolpaths(document);
    const simulation = simulateToolpaths(document, result);
    expect(simulation.gouges).toBe(0);
    expect(simulation.collisions).toBe(0);
    expect(simulation.outOfBounds).toBe(0);
    expect(simulation.missingLinks).toBe(0);
    expect(simulation.remainingPercent).toBeLessThan(100);
    expect(simulation.checkedMoves).toBeGreaterThan(0);
  });

  it("finds a gouge and a rapid collision", () => {
    const document = surfaceDocument("parallel");
    const result = generateToolpaths(document);
    const gouged = JSON.parse(JSON.stringify(result)) as typeof result;
    const cut = gouged.paths[0]!.moves.find((move) => move.kind === "cut")!;
    cut.z -= 5;
    expect(simulateToolpaths(document, gouged).gouges).toBeGreaterThan(0);

    const collided = JSON.parse(JSON.stringify(result)) as typeof result;
    const rapid = collided.paths[0]!.moves.find(
      (move) => move.kind === "rapid",
    )!;
    rapid.z = 20;
    expect(simulateToolpaths(document, collided).collisions).toBeGreaterThan(0);
  });

  it("reports a missing safe link between operations", () => {
    const document = surfaceDocument("parallel");
    const result = generateToolpaths(document);
    const first = result.paths[0]!;
    first.moves = first.moves.slice(0, -1);
    const second = generateOperationPath(document, {
      ...document.operations[0]!,
      id: "op_second",
      name: "Second",
      order: 2,
    });
    result.paths.push(second);
    const simulation = simulateToolpaths(document, result);
    expect(simulation.missingLinks).toBeGreaterThan(0);
  });

  it("cancels synchronously and asynchronously without returning a partial path", async () => {
    const document = surfaceDocument("parallel");
    expect(() =>
      generateToolpaths(document, { shouldCancel: () => true }),
    ).toThrow(/cancelled/);
    await expect(
      generateToolpathsAsync(document, { shouldCancel: () => true }),
    ).rejects.toThrow(/cancelled/);

    const progress: number[] = [];
    const result = await generateToolpathsAsync(document, {
      onProgress: (done, total) => progress.push(total > 0 ? done / total : 0),
    });
    expect(result.paths).toHaveLength(1);
    expect(progress[progress.length - 1]).toBe(1);
  });
});
