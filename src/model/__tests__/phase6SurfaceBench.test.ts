import { beforeAll, describe, expect, it } from "vitest";
import initOpenCascade from "opencascade.js/dist/node.js";
import type { OpenCascadeInstance } from "opencascade.js";
import {
  LARGE_SURFACE_THICKEN_BUDGET_MS,
  SURFACE_PERFORMANCE_BUDGET_MS,
  measureSurfacePipeline,
} from "../phase6SurfaceBench";

let oc: OpenCascadeInstance;

beforeAll(async () => {
  oc = await initOpenCascade();
}, 60_000);

describe("P6-SU-16 surface performance budget", () => {
  it("measures real knit and thicken time plus main-thread stall", async () => {
    const report = await measureSurfacePipeline(oc);
    expect(report.patchCount).toBe(2);
    expect(report.knitFaces).toBeGreaterThan(0);
    expect(report.thickenFaces).toBeGreaterThan(0);
    expect(report.timings.knit).toBeGreaterThanOrEqual(0);
    expect(report.timings.thicken).toBeGreaterThanOrEqual(0);
    expect(report.timings.uiStall).toBeGreaterThanOrEqual(0);
    expect(report.largeThickenMs).toBeGreaterThanOrEqual(0);
    expect(report.largeThickenFaces).toBeGreaterThan(0);
    expect(report.largeThickenBudget).toBe(LARGE_SURFACE_THICKEN_BUDGET_MS);
    expect(report.budget).toBe(SURFACE_PERFORMANCE_BUDGET_MS);
    console.info(
      `P6-SU-16/P6-INT-08 timings ms: knit ${report.timings.knit.toFixed(3)}, ` +
        `thicken ${report.timings.thicken.toFixed(3)}, ` +
        `ui-stall ${report.timings.uiStall.toFixed(3)}, ` +
        `total ${report.timings.total.toFixed(3)}, ` +
        `large-thicken ${report.largeThickenMs.toFixed(3)}`,
    );
    expect(report.budgetMet).toBe(true);
  }, 120_000);
});
