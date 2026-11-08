import { expect, test } from "@playwright/test";
import { loadAppReady } from "./helpers";

// Chromium-only browser gate for P6-SU-16: the Node handler bench cannot see
// worker transport or main-thread responsiveness.
test("P6-SU-16 surface knit/thicken through the real Web Worker", async ({
  page,
}) => {
  await loadAppReady(page);
  const report = await page.evaluate(async () => {
    const path = "/src/model/phase6SurfaceWorkerBench.ts";
    const mod = (await import(/* @vite-ignore */ path)) as {
      measureSurfaceWorker: () => Promise<unknown>;
    };
    return mod.measureSurfaceWorker();
  });
  const measured = report as {
    patchCount: number;
    knitFaces: number;
    thickenFaces: number;
    timings: {
      knit: number;
      thicken: number;
      uiStall: number;
      total: number;
    };
    budgetMet: boolean;
  };
  expect(measured.patchCount).toBe(2);
  expect(measured.knitFaces).toBeGreaterThan(0);
  expect(measured.thickenFaces).toBeGreaterThan(0);
  expect(measured.timings.knit).toBeGreaterThanOrEqual(0);
  expect(measured.timings.thicken).toBeGreaterThanOrEqual(0);
  expect(measured.timings.uiStall).toBeGreaterThanOrEqual(0);
  console.log("P6-SU-16 WORKER", JSON.stringify(measured));
  expect(measured.budgetMet).toBe(true);
});
