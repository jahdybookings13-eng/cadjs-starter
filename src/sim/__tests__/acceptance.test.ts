import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSimulationReport,
  demoBracketBody,
  emptySimulationDocument,
  generateVolumeMesh,
  materialForBody,
  simulateModal,
  simulateStatic,
} from "..";

const budgets = (
  JSON.parse(
    readFileSync(
      new URL("../../../parity/budgets.json", import.meta.url),
      "utf8",
    ),
  ) as {
    budgets: {
      studioSimMeshMs: number;
      studioSimStaticMs: number;
      studioSimModalMs: number;
    };
  }
).budgets;

describe("Simulation Studio acceptance", () => {
  it("meshes the bracket, solves static and modal cases, and exports a report", async () => {
    const document = emptySimulationDocument("Bracket acceptance");
    const body = demoBracketBody();
    document.body = body;
    const meshStarted = performance.now();
    document.mesh = await generateVolumeMesh(body, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    const meshMs = performance.now() - meshStarted;
    const material = materialForBody(document, document.mesh.bodyId)!;
    const staticResult = simulateStatic(document, material, {
      maxIterations: 4_000,
    });
    const modalResult = simulateModal(document, material, {
      modes: 3,
      maxIterations: 1_000,
    });
    document.result = staticResult;
    document.modal = modalResult;
    const report = buildSimulationReport(document);

    expect(document.mesh.elements.length).toBeGreaterThan(0);
    expect(staticResult.maxDisplacementM).toBeGreaterThan(0);
    expect(staticResult.maxVonMisesPa).toBeGreaterThan(0);
    expect(modalResult.modes).toHaveLength(3);
    expect(modalResult.modes.every((mode) => mode.frequencyHz > 0)).toBe(true);
    expect(report).toContain("Bracket acceptance");
    expect(report).toContain("Linear static");
    expect(report).toContain("Mode 1");
    expect(meshMs).toBeLessThanOrEqual(budgets.studioSimMeshMs);
    expect(staticResult.solveMs).toBeLessThanOrEqual(budgets.studioSimStaticMs);
    expect(modalResult.solveMs).toBeLessThanOrEqual(budgets.studioSimModalMs);

    process.stdout.write(
      `${JSON.stringify({
        meshMs: Number(meshMs.toFixed(1)),
        nodes: document.mesh.nodes.length,
        elements: document.mesh.elements.length,
        staticMs: Number(staticResult.solveMs.toFixed(1)),
        modalMs: Number(modalResult.solveMs.toFixed(1)),
        maxDisplacementM: staticResult.maxDisplacementM,
        maxVonMisesPa: staticResult.maxVonMisesPa,
        firstFrequencyHz: modalResult.modes[0]!.frequencyHz,
      })}\n`,
    );
  });
});
