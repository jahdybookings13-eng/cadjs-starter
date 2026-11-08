import { describe, expect, it } from "vitest";
import {
  SHEET_METAL_PERFORMANCE_BUDGET_MS,
  measureSheetMetalPipeline,
} from "../phase6SheetMetalBench";

describe("P6-SM-16 sheet-metal performance budget", () => {
  it("measures unfold, bend-table lookup and DXF separately", () => {
    const result = measureSheetMetalPipeline();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bendCount).toBe(12);
    expect(result.value.holeCount).toBe(4);
    expect(result.value.timings.unfold).toBeGreaterThanOrEqual(0);
    expect(result.value.timings.bendTable).toBeGreaterThanOrEqual(0);
    expect(result.value.timings.dxf).toBeGreaterThanOrEqual(0);
    expect(result.value.timings.total).toBeGreaterThanOrEqual(
      result.value.timings.unfold,
    );
    expect(result.value.budget).toBe(SHEET_METAL_PERFORMANCE_BUDGET_MS);
    expect(result.value.budgetMet).toBe(true);
    console.info(
      `P6-SM-16 timings ms: unfold ${result.value.timings.unfold.toFixed(3)}, ` +
        `bend-table ${result.value.timings.bendTable.toFixed(3)}, ` +
        `dxf ${result.value.timings.dxf.toFixed(3)}, ` +
        `total ${result.value.timings.total.toFixed(3)}`,
    );
  });
});
