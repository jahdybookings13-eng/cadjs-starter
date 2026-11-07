import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadAppReady } from "./helpers";

interface Budgets {
  budgets: {
    bootInteractiveMs: number;
    documentReloadMs: number;
    regenerateBoxMs: number;
    orbitFpsMin: number;
    assemblyOpenMs: number | null;
  };
}

const config = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../parity/budgets.json", import.meta.url)),
    "utf8",
  ),
) as Budgets;

// Chromium-only (Firefox/WebKit testMatch excludes this spec). The numbers are
// deliberately measured from a cold page, not from a warm unit-test harness, so
// a regression in the real boot path fails here.
test("browser budgets: boot, regenerate, orbit and document reload", async ({
  page,
}, testInfo) => {
  const bootStart = Date.now();
  await loadAppReady(page);
  const bootInteractiveMs = Date.now() - bootStart;

  const regenerate = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) return { ms: -1, status: "no scadgen hook" };
    g.configureSync();
    const start = performance.now();
    const id = g.box(0.05, 0.04, 0.03);
    let states = await g.idle();
    for (let i = 0; i < 120 && states[id]?.status !== "OK"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      states = await g.idle();
    }
    return {
      ms: Math.round(performance.now() - start),
      status: states[id]?.status ?? "missing",
    };
  });

  const orbitFps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const start = performance.now();
        let frames = 0;
        const tick = () => {
          frames += 1;
          const elapsed = performance.now() - start;
          if (elapsed >= 1000) resolve((frames * 1000) / elapsed);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );

  const reloadStart = Date.now();
  await page.reload();
  await expect(page.getByText("Loading...")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  await page.waitForFunction(() => !!window.__cadDebug, undefined, {
    timeout: 10_000,
  });
  const documentReloadMs = Date.now() - reloadStart;

  const measurements = {
    bootInteractiveMs,
    documentReloadMs,
    regenerateBoxMs: regenerate.ms,
    orbitFpsMin: Math.round(orbitFps),
  };
  console.log("PERF MEASUREMENTS", JSON.stringify(measurements));
  await testInfo.attach("perf-measurements.json", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });

  expect(regenerate.status, "regenerated box status").toBe("OK");
  expect(bootInteractiveMs).toBeLessThanOrEqual(
    config.budgets.bootInteractiveMs,
  );
  expect(documentReloadMs).toBeLessThanOrEqual(config.budgets.documentReloadMs);
  expect(regenerate.ms).toBeLessThanOrEqual(config.budgets.regenerateBoxMs);
  expect(orbitFps).toBeGreaterThanOrEqual(config.budgets.orbitFpsMin);
});
