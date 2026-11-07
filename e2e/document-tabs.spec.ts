import { expect, test, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

const elementCount = (page: Page) =>
  page.evaluate(() => window.__cadDebug?.getElements().length ?? 0);

test("document tabs keep separate designs and survive reload", async ({
  page,
}) => {
  await loadAppReady(page);
  await expect(page.getByTestId("document-tabs")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(1);

  // First Part Studio: one body.
  await page.evaluate(() => window.__cadDebug!.scadgen!.box(20, 20, 20));
  await expect.poll(() => elementCount(page)).toBe(1);

  // A new tab starts empty; the first tab's body must not leak into it.
  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-partstudio").click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect.poll(() => elementCount(page)).toBe(0);

  // Give the second tab its own design (two bodies) so the tabs are
  // distinguishable by real geometry, not just by label.
  await page.evaluate(() => {
    window.__cadDebug!.scadgen!.box(40, 10, 10);
    window.__cadDebug!.scadgen!.box(10, 40, 10);
  });
  await expect.poll(() => elementCount(page)).toBe(2);

  // Rename through the tab itself (double-click), not a hidden test hook.
  await page.getByRole("tab").last().dblclick();
  const rename = page.getByLabel(/Rename Part Studio/);
  await expect(rename).toBeVisible();
  await rename.fill("Housing");
  await rename.press("Enter");
  await expect(page.getByRole("tab", { name: /^Housing/ })).toBeVisible();

  // Switching back restores the first tab's single body.
  await page.getByRole("tab", { name: /^Part Studio/ }).click();
  await expect.poll(() => elementCount(page)).toBe(1);

  // Reload reopens the document on the same tab with its geometry.
  await page.reload();
  await expect(page.getByTestId("document-tabs")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: /^Part Studio/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect.poll(() => elementCount(page)).toBe(1);

  // And the other tab still has its own two bodies.
  await page.getByRole("tab", { name: /^Housing/ }).click();
  await expect.poll(() => elementCount(page)).toBe(2);

  // Deleting the active tab falls back to the remaining Part Studio, which
  // keeps its own design.
  await page.getByTestId("document-tab-menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect.poll(() => elementCount(page)).toBe(1);
});
