import { test, expect } from "@playwright/test";
import { loadAppReady, readMode, readElements } from "./helpers";

async function sketchRectangle(page: import("@playwright/test").Page) {
  await page.getByTestId("tool-sketch").click();
  await page.getByRole("button", { name: "XY", exact: true }).click();
  await page.getByRole("button", { name: "Rect", exact: true }).click();

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
}

test("selecting a profile and clicking extrude activates extrude mode", async ({
  page,
}) => {
  await loadAppReady(page);
  await sketchRectangle(page);

  // Click the profile row in the feature tree to select it
  const rows = page.getByTestId("feature-tree-row");
  await rows.last().click();

  await page.getByTestId("tool-extrude").click();
  await expect.poll(() => readMode(page)).toBe("extrude");

  // The arrow handle drag itself is intentionally NOT exercised here — the
  // exact screen-space position of the 3D arrow depends on camera + profile
  // geometry and is too brittle for a smoke test. L1 workflow tests cover
  // the underlying extrudeBRep operation; L2 goldens cover the geometry
  // pipeline. This scenario is the regression gate for "extrude mode
  // mounts cleanly when a profile is selected" — useExtrudeMode hook
  // event-handler attachment, mode state transition.
  const elements = await readElements(page);
  expect(elements.length).toBeGreaterThanOrEqual(1);
});

test.fixme("drag-to-extrude with arrow handle produces a body", async () => {
  // TODO: requires positioning Playwright clicks against the 3D arrow handle.
  // Strategy options:
  //   1. Add a __cadDebug.getArrowScreenPos() to expose the arrow's projected
  //      screen coords, then click those.
  //   2. Use the dimension-input dialog: enter extrude mode, type a value,
  //      submit — bypass the drag entirely.
  // Pick option 2 in a follow-up: less fragile, exercises the keyboard path.
});
