import { expect, test } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("Assembly and Drawing tabs are persisted workspaces", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1800, height: 1200 });
  await loadAppReady(page);
  await page.evaluate(async () => {
    window.__cadDebug!.scadgen!.box(20, 20, 20);
    await window.__cadDebug!.scadgen!.idle();
  });

  // Assembly tab: real source bodies, a mate, an in-context feature and a
  // nested subassembly.
  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-assembly").click();
  await expect(page.getByTestId("assembly-workspace")).toBeVisible();
  await page.getByRole("button", { name: /Add source body/ }).click();
  await page.getByRole("button", { name: /Add source body/ }).click();
  await expect(page.getByText(/2 top-level · 2 leaves/)).toBeVisible();
  await page.getByRole("button", { name: /Mate selected instances/ }).click();
  await expect(
    page.getByText(/2 top-level · 2 leaves · 1 mates/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Solve & place/ }).click();
  await expect(page.getByText(/SOLVED/)).toBeVisible();

  await page.getByLabel("Assembly feature kind").selectOption("boss");
  await page.getByRole("button", { name: /Apply boss/ }).click();
  await expect(page.getByText(/In-context boss on/)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("Assembly feature kind").selectOption("fillet");
  await page.getByRole("button", { name: /Apply fillet/ }).click();
  await expect(page.getByText(/In-context fillet on/)).toBeVisible({
    timeout: 30_000,
  });

  await page
    .getByLabel(/^Select inst_/)
    .first()
    .check();
  await page
    .getByLabel(/^Select inst_/)
    .nth(1)
    .check();
  await page.getByLabel("Subassembly name").fill("Gear set");
  await page.getByRole("button", { name: "Group" }).click();
  await expect(page.getByText(/1 top-level · 2 leaves/)).toBeVisible();
  await expect(
    page.locator('[data-testid^="assembly-instance-sub_"]'),
  ).toContainText("Gear set");
  await page.getByRole("button", { name: /Ungroup/ }).click();
  await expect(page.getByText(/2 top-level · 2 leaves/)).toBeVisible();

  // Drawing tab linked to the assembly.
  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-drawing").click();
  await expect(page.getByTestId("drawing-workspace")).toBeVisible();
  await expect(page.getByTestId("drawing-sheet")).toBeVisible();
  await expect(page.getByTestId("drawing-title-block")).toBeVisible();
  await expect(page.getByTestId("drawing-bom")).toContainText("Box");

  await page.getByRole("button", { name: "Save" }).first().click();
  await page.reload();
  await expect(page.getByTestId("drawing-workspace")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("drawing-sheet")).toBeVisible();
  await page.getByRole("tab", { name: /Assembly/ }).click();
  await expect(page.getByTestId("assembly-workspace")).toBeVisible();
  await expect(page.getByText(/2 top-level · 2 leaves/)).toBeVisible();
});
