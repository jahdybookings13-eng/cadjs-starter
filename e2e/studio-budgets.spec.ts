import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { loadAppReady } from "./helpers";

const budgets = (
  JSON.parse(
    readFileSync(new URL("../parity/budgets.json", import.meta.url), "utf8"),
  ) as {
    budgets: {
      studioSimMeshMs: number;
      studioSimStaticMs: number;
      studioSimModalMs: number;
      studioCamToolpathMs: number;
      studioCamSimulationMs: number;
      studioUiStallMs: number;
    };
  }
).budgets;

// Chromium-only browser gate for P8-X-03. These are the same acceptance cases
// the unit suite measures, but executed in the browser with a heartbeat timer
// so a main-thread stall is observed instead of inferred from total runtime.
test("studio compute budgets keep the browser responsive", async ({ page }) => {
  test.setTimeout(180_000);
  await loadAppReady(page);

  const report = await page.evaluate(async () => {
    const simPath = "/src/sim/index.ts";
    const sim = (await import(/* @vite-ignore */ simPath)) as unknown as {
      demoBracketBody: () => {
        id: string;
        name: string;
        triangles: Array<{
          a: { x: number; y: number; z: number };
          b: { x: number; y: number; z: number };
          c: { x: number; y: number; z: number };
        }>;
      };
      emptySimulationDocument: (name: string) => {
        body: unknown;
        mesh: unknown;
        [key: string]: unknown;
      };
      generateVolumeMesh: (
        body: unknown,
        options: {
          units: "mm";
          cellSize: number;
          minQuality: number;
          maxElements: number;
        },
      ) => Promise<{ bodyId: string; nodes: unknown[]; elements: unknown[] }>;
      materialForBody: (document: unknown, bodyId: string) => unknown;
      simulateStatic: (
        document: unknown,
        material: unknown,
        options: unknown,
      ) => { solveMs: number };
      simulateModal: (
        document: unknown,
        material: unknown,
        options: unknown,
      ) => { solveMs: number };
    };
    const fixturesPath = "/src/cam/__tests__/fixtures.ts";
    const camFixtures = (await import(
      /* @vite-ignore */ fixturesPath
    )) as unknown as {
      sampleDocument: () => {
        stock: { size: { x: number; y: number; z: number } };
        operations: Array<Record<string, unknown>>;
        surface?: unknown;
        [key: string]: unknown;
      };
      sampleOperation: Record<string, unknown>;
    };
    const camPath = "/src/cam/toolpath.ts";
    const cam = (await import(/* @vite-ignore */ camPath)) as unknown as {
      generateToolpaths: (document: unknown) => {
        paths: Array<{ moves: unknown[] }>;
      };
    };
    const camSimPath = "/src/cam/simulate.ts";
    const camSim = (await import(/* @vite-ignore */ camSimPath)) as unknown as {
      simulateToolpaths: (
        document: unknown,
        paths: unknown,
      ) => { checkedMoves: number };
    };

    const now = () => performance.now();
    const stall = { last: now(), maxGap: 0, timer: 0 };
    stall.timer = window.setInterval(() => {
      const tick = now();
      stall.maxGap = Math.max(stall.maxGap, tick - stall.last);
      stall.last = tick;
    }, 1);

    const simulationDocument = sim.emptySimulationDocument("Budget sim");
    const body = sim.demoBracketBody();
    simulationDocument.body = body;
    const meshStarted = now();
    const mesh = await sim.generateVolumeMesh(body, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    const meshMs = now() - meshStarted;
    simulationDocument.mesh = mesh;
    const material = sim.materialForBody(simulationDocument, mesh.bodyId);
    const staticStarted = now();
    sim.simulateStatic(simulationDocument, material, { maxIterations: 4_000 });
    const staticMs = now() - staticStarted;
    const modalStarted = now();
    sim.simulateModal(simulationDocument, material, {
      modes: 3,
      maxIterations: 1_000,
    });
    const modalMs = now() - modalStarted;

    const camDocument = camFixtures.sampleDocument();
    const base = camFixtures.sampleOperation;
    camDocument.stock.size = { x: 80, y: 50, z: 12 };
    camDocument.surface = {
      origin: { x: 0, y: 0, z: 12 },
      cell: 4,
      cols: 11,
      rows: 9,
      heights: Array.from({ length: 99 }, (_, index) =>
        index % 2 === 0 ? 4 : 0,
      ),
    };
    camDocument.operations = [
      {
        ...base,
        id: "op_face",
        name: "Face top",
        kind: "face",
        order: 0,
        depth: 0.5,
        stepdown: 0.5,
        tabs: null,
      },
      {
        ...base,
        id: "op_contour",
        name: "Outside contour",
        kind: "contour",
        order: 1,
      },
      {
        ...base,
        id: "op_drill",
        name: "Mounting holes",
        kind: "drill",
        order: 2,
        depth: 12,
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
        order: 3,
        depth: 4,
        stepdown: 1,
        stepover: 2,
        tabs: null,
      },
    ];
    const toolpathStarted = now();
    const paths = cam.generateToolpaths(camDocument);
    const toolpathMs = now() - toolpathStarted;
    const camSimStarted = now();
    const camResult = camSim.simulateToolpaths(camDocument, paths);
    const camSimulationMs = now() - camSimStarted;

    window.clearInterval(stall.timer);
    return {
      meshMs,
      staticMs,
      modalMs,
      toolpathMs,
      camSimulationMs,
      maxStallMs: Math.round(stall.maxGap),
      nodes: mesh.nodes.length,
      elements: mesh.elements.length,
      moves: paths.paths.reduce((sum, path) => sum + path.moves.length, 0),
      checkedMoves: camResult.checkedMoves,
    };
  });

  expect(report.nodes).toBeGreaterThan(0);
  expect(report.elements).toBeGreaterThan(0);
  expect(report.moves).toBeGreaterThan(100);
  expect(report.checkedMoves).toBeGreaterThan(0);
  expect(report.meshMs).toBeLessThanOrEqual(budgets.studioSimMeshMs);
  expect(report.staticMs).toBeLessThanOrEqual(budgets.studioSimStaticMs);
  expect(report.modalMs).toBeLessThanOrEqual(budgets.studioSimModalMs);
  expect(report.toolpathMs).toBeLessThanOrEqual(budgets.studioCamToolpathMs);
  expect(report.camSimulationMs).toBeLessThanOrEqual(
    budgets.studioCamSimulationMs,
  );
  expect(report.maxStallMs).toBeLessThanOrEqual(budgets.studioUiStallMs);
  console.log("STUDIO BUDGETS", JSON.stringify(report));
});
