import { test, expect } from "@playwright/test";
import { loadAppReady, readMode, readElements } from "./helpers";

test("sketch mode → XY plane → draw rectangle → finish creates a profile", async ({
  page,
}) => {
  await loadAppReady(page);

  await page.getByTestId("tool-sketch").click();
  await expect.poll(() => readMode(page)).toBe("sketch");

  await page.getByRole("button", { name: "XY", exact: true }).click();
  await page.getByTitle("Rect (R)").click();

  const canvas = page.getByTestId("cad-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Rectangle is a press-drag-release gesture in useSketchMode (mousedown → mousemove preview → mouseup)
  await page.mouse.move(cx - 100, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 90, { steps: 10 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Finish ✓", exact: true }).click();
  await expect
    .poll(() => readMode(page), { timeout: 15_000 })
    .not.toBe("sketch");

  // Finishing a sketch creates the sketch row + a profile row inside it
  await expect(page.getByTestId("feature-tree-row")).toHaveCount(2, {
    timeout: 15_000,
  });
  const elements = await readElements(page);
  expect(elements.length).toBeGreaterThanOrEqual(1);
});
