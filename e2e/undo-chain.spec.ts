import { test, expect } from "@playwright/test";
import { loadAppReady, readMode, readElements } from "./helpers";

test("Ctrl+Z repeatedly clears all features", async ({ page }) => {
  await loadAppReady(page);

  // Build at least one feature: a finished sketch
  await page.getByTestId("tool-sketch").click();
  await page.getByRole("button", { name: "XY", exact: true }).click();
  await page.getByTitle("Rect (R)").click();
  const box = await page.getByTestId("cad-canvas").boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 100, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 90, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Finish ✓", exact: true }).click();
  await expect
    .poll(() => readMode(page), { timeout: 15_000 })
    .not.toBe("sketch");
  // Sketch + profile = at least 1 row before we start undoing
  await expect
    .poll(() => page.getByTestId("feature-tree-row").count())
    .toBeGreaterThan(0);

  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Control+z");
  }

  await expect(page.getByTestId("feature-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });
  expect(await readElements(page)).toEqual([]);
});
