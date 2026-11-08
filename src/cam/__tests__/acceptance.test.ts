import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSetupSheet } from "../setupSheet";
import { parsePostedOperations, postProcess } from "../post";
import { simulateToolpaths } from "../simulate";
import { generateToolpaths } from "../toolpath";
import type { CamDocument, CamOperation } from "../model";
import { sampleDocument, sampleOperation } from "./fixtures";

const budgets = (
  JSON.parse(
    readFileSync(
      new URL("../../../parity/budgets.json", import.meta.url),
      "utf8",
    ),
  ) as {
    budgets: {
      studioCamToolpathMs: number;
      studioCamSimulationMs: number;
    };
  }
).budgets;

function bracketDocument(): CamDocument {
  const document = sampleDocument();
  document.stock.size = { x: 80, y: 50, z: 12 };
  const base = sampleOperation;
  const surface = {
    origin: { x: 0, y: 0, z: 12 },
    cell: 4,
    cols: 11,
    rows: 9,
    heights: Array.from({ length: 99 }, (_, index) =>
      index % 2 === 0 ? 4 : 0,
    ),
  };
  document.surface = surface;
  const operation = (
    id: string,
    name: string,
    kind: CamOperation["kind"],
    order: number,
    patch: Partial<CamOperation> = {},
  ): CamOperation => ({
    ...base,
    id,
    name,
    kind,
    order,
    tabs: null,
    leadIn: 1,
    leadOut: 1,
    ...patch,
  });
  document.operations = [
    operation("op_face", "Face top", "face", 0, {
      depth: 0.5,
      stepdown: 0.5,
    }),
    operation("op_contour", "Outside contour", "contour", 1, {
      depth: 12,
      stepdown: 3,
    }),
    operation("op_drill", "Mounting holes", "drill", 2, {
      depth: 12,
      holes: [
        { x: 15, y: 12 },
        { x: 65, y: 38 },
      ],
    }),
    operation("op_parallel", "Parallel finish", "parallel", 3, {
      depth: 4,
      stepdown: 1,
      stepover: 2,
    }),
  ];
  return document;
}

describe("CAM exit acceptance", () => {
  it("generates, simulates, posts and documents the four-operation bracket", () => {
    const document = bracketDocument();
    const generateStarted = performance.now();
    const paths = generateToolpaths(document);
    const toolpathMs = performance.now() - generateStarted;
    expect(paths.paths).toHaveLength(4);
    expect(
      paths.paths.reduce((sum, path) => sum + path.moves.length, 0),
    ).toBeGreaterThan(100);

    const simulateStarted = performance.now();
    const simulation = simulateToolpaths(document, paths);
    const simulationMs = performance.now() - simulateStarted;
    expect(toolpathMs).toBeLessThanOrEqual(budgets.studioCamToolpathMs);
    expect(simulationMs).toBeLessThanOrEqual(budgets.studioCamSimulationMs);
    process.stdout.write(
      `CAM acceptance ${JSON.stringify({
        toolpathMs: Number(toolpathMs.toFixed(2)),
        simulationMs: Number(simulationMs.toFixed(2)),
        moves: paths.paths.reduce((sum, path) => sum + path.moves.length, 0),
      })}\n`,
    );
    expect(simulation.gouges).toBe(0);
    expect(simulation.collisions).toBe(0);
    expect(simulation.outOfBounds).toBe(0);
    expect(simulation.missingLinks).toBe(0);
    expect(simulation.checkedMoves).toBeGreaterThan(0);

    const posted = postProcess(document, "grbl");
    expect(posted.program).toContain("M30");
    expect(parsePostedOperations(posted.program)).toHaveLength(4);
    expect(posted.operations.map((operation) => operation.kind)).toEqual([
      "face",
      "contour",
      "drill",
      "parallel",
    ]);

    const sheet = buildSetupSheet(document, { generatedAt: 0 });
    expect(sheet.html).toContain("Face top");
    expect(sheet.html).toContain("Outside contour");
    expect(sheet.html).toContain("Mounting holes");
    expect(sheet.html).toContain("Parallel finish");
    expect(sheet.html).toContain("80 × 50 × 12 mm");
    expect(sheet.estimatedMinutes).toBeGreaterThan(0);
  });
});
