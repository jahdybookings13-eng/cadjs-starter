import { test, expect, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

const row = (page: Page, featureId: string) =>
  page.locator(`[data-feature-id="${featureId}"]`).first();

const historyOrder = (page: Page) =>
  page.evaluate(
    () =>
      window.__cadDebug?.scadgen
        ?.history()
        .features.map((feature) => feature.featureId) ?? [],
  );

const undo = (page: Page, action: string) =>
  page.getByRole("button", { name: new RegExp(`^Undo ${action}`) }).click();

test("tree cascade suppression, rename collision and reorder guard", async ({
  page,
}) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const a = g.box(0.02, 0.02, 0.01);
    const b = g.box(0.02, 0.02, 0.01);
    await g.idle();
    const edge = (g.etags(a) ?? [])[0] ?? "";
    const fillet = g.fillet(a, [edge], 0.002);
    await g.idle();
    const c = g.box(0.02, 0.02, 0.01);
    await g.idle();
    return { a, b, c, fillet };
  });

  const historyName = (fid: string) =>
    page.evaluate((id) => {
      const s = (
        window as unknown as {
          __cadDebug?: {
            scadgen?: {
              history?: () => {
                features: { featureId: string; name: string }[];
              };
            };
          };
        }
      ).__cadDebug?.scadgen;
      return s?.history?.().features.find((f) => f.featureId === id)?.name;
    }, fid);

  const stateOf = (fid: string) =>
    page.evaluate((id) => {
      const s = (
        window as unknown as {
          __cadDebug?: {
            scadgen?: {
              history?: () => {
                featureStates: Record<string, { featureStatus: string }>;
              };
            };
          };
        }
      ).__cadDebug?.scadgen;
      return s?.history?.().featureStates[id]?.featureStatus;
    }, fid);

  const row = (fid: string) =>
    page.locator(`[data-feature-id="${fid}"]`).first();

  await expect(row(ids.a)).toBeVisible({ timeout: 15_000 });
  await expect(row(ids.b)).toBeVisible({ timeout: 15_000 });

  // Renaming a second feature to an existing name must not collide.
  await row(ids.b).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByLabel("Rename feature").fill("Box");
  await page.getByLabel("Rename feature").press("Enter");
  await expect.poll(() => historyName(ids.b)).toBe("Box (2)");

  // Suppressing the parent suppresses the dependent fillet and undoes once.
  await row(ids.a).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Suppress feature" }).click();
  await expect.poll(() => stateOf(ids.fillet)).toBe("SUPPRESSED");
  await expect(row(ids.a)).toContainText("SUPPRESSED");
  await undo(page, "Suppress Feature");
  await expect.poll(() => stateOf(ids.fillet)).toBe("OK");
  await expect(row(ids.a)).not.toContainText("SUPPRESSED");

  // Dragging a parent past its dependent is clamped before the dependent.
  await expect(row(ids.c)).toBeVisible({ timeout: 15_000 });
  await row(ids.a).dragTo(row(ids.c));
  await expect
    .poll(async () => {
      const order = await historyOrder(page);
      const parent = order.indexOf(ids.a);
      const dependent = order.indexOf(ids.fillet);
      return parent === dependent - 1 && parent < dependent;
    })
    .toBe(true);
});

test("rollback edit/forward, bar drag, retry and persistence", async ({
  page,
}) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const a = g.box(0.02, 0.02, 0.01);
    const b = g.box(0.03, 0.03, 0.02);
    await g.idle();
    // Two radii for one selected edge is a named fillet validation error.
    const edge = (g.etags(a) ?? [])[0] ?? "";
    const failed = g.fillet(a, [edge], 0.002, [0.002, 0.003]);
    await g.idle();
    return { a, b, failed };
  });

  const depthOf = (fid: string) =>
    page.evaluate((id) => {
      const s = (
        window as unknown as {
          __cadDebug?: {
            scadgen?: {
              history?: () => {
                features: Array<{
                  featureId: string;
                  parameters: Array<{ parameterId: string; value?: unknown }>;
                }>;
              };
            };
          };
        }
      ).__cadDebug?.scadgen;
      const node = s?.history?.().features.find((f) => f.featureId === id);
      const depth = node?.parameters.find((p) => p.parameterId === "depth");
      return typeof depth?.value === "number" ? depth.value : null;
    }, fid);

  const row = (fid: string) =>
    page.locator(`[data-feature-id="${fid}"]`).first();

  await expect(row(ids.a)).toBeVisible({ timeout: 15_000 });
  await expect(row(ids.b)).toBeVisible({ timeout: 15_000 });
  await expect(row(ids.failed)).toContainText("ERROR");

  // Retry is a real rebuild, so a broken feature stays ERROR.
  await row(ids.failed).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Retry Feature" }).click();
  await expect(row(ids.failed)).toContainText("ERROR");

  // Roll back to the first box; later rows report ROLLED BACK.
  await row(ids.a).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rollback to Here" }).click();
  await expect(page.getByTestId("rollback-banner")).toBeVisible();
  await expect(row(ids.b)).toContainText("ROLLED BACK");

  // The rollback bar is draggable onto a later feature row.
  await page.getByTestId("rollback-bar").dragTo(row(ids.b));
  await expect(row(ids.b)).not.toContainText("ROLLED BACK");

  // Step forward one feature, then resume the whole tree.
  await page.getByRole("button", { name: "Roll forward one feature" }).click();
  await page
    .getByTestId("rollback-banner")
    .getByRole("button", { name: "Clear rollback" })
    .click();
  await expect(page.getByTestId("rollback-banner")).toHaveCount(0);
  await expect(row(ids.failed)).toContainText("ERROR");

  // Rollback index is part of the saved document and restored with it.
  const persisted = await page.evaluate(() => {
    const g = window.__cadDebug?.scadgen as unknown as {
      setRollback: (index: number | null) => void;
      saveProject: () => string;
      loadProject: (text?: string) => void;
      history: () => { rollbackIndex: number | null };
    };
    g.setRollback(1);
    const text = g.saveProject();
    g.setRollback(null);
    g.loadProject(text);
    return g.history().rollbackIndex;
  });
  expect(persisted).toBe(1);
  await expect(page.getByTestId("rollback-banner")).toBeVisible();
  await page
    .getByTestId("rollback-banner")
    .getByRole("button", { name: "Clear rollback" })
    .click();

  // Editing a feature previews live, cancels cleanly, and applies with one
  // undo entry. The dependent warning names the downstream fillet.
  await row(ids.a).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit Feature" }).click();
  const dialog = page.getByTestId("feature-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("feature-dialog-dependents")).toContainText(
    "Fillet",
  );
  await dialog.getByLabel("Depth", { exact: true }).fill("0.02");
  await expect.poll(() => depthOf(ids.a)).toBe(0.02);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => depthOf(ids.a)).toBe(0.01);

  await row(ids.a).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit Feature" }).click();
  await dialog.getByLabel("Depth", { exact: true }).fill("0.02");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => depthOf(ids.a)).toBe(0.02);
  await undo(page, "Edit Feature");
  await expect.poll(() => depthOf(ids.a)).toBe(0.01);
  await expect(row(ids.a)).toBeVisible();
});

test("feature tree folders, references, reorder and undo", async ({ page }) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const a = g.box(0.04, 0.03, 0.02);
    const b = g.box(0.03, 0.03, 0.03);
    await g.idle();
    return { a, b };
  });

  await expect(row(page, ids.a)).toBeVisible({ timeout: 15_000 });
  await expect(row(page, ids.b)).toBeVisible({ timeout: 15_000 });

  // Affected references are visible before deleting a referenced sketch.
  await row(page, `${ids.a}_sk`).click({ button: "right" });
  await expect(
    page.getByText("Used by 1: Box", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Folder creation through the feature context menu, then undo it.
  page.once("dialog", (dialog) => dialog.accept("Base"));
  await row(page, ids.a).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to folder" }).click();
  await expect(page.getByTestId("feature-folder")).toContainText("Base");
  await undo(page, "Move to Folder");
  await expect(page.getByTestId("feature-folder")).toHaveCount(0);
  await expect(row(page, ids.a)).toBeVisible();

  // Suppression participates in document undo.
  await row(page, ids.a).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Suppress feature" }).click();
  await expect(row(page, ids.a)).toContainText("SUPPRESSED");
  await undo(page, "Suppress Feature");
  await expect(row(page, ids.a)).not.toContainText("SUPPRESSED");

  // Drag reorder uses the row's history index and is undoable.
  const before = await historyOrder(page);
  await row(page, ids.b).dragTo(row(page, ids.a));
  await expect
    .poll(async () => {
      const after = await historyOrder(page);
      return after.indexOf(ids.b) < after.indexOf(ids.a);
    })
    .toBe(true);
  await undo(page, "Reorder Feature");
  await expect.poll(() => historyOrder(page)).toEqual(before);

  // Deleting a history feature is reversible through the same undo stack.
  await row(page, ids.a).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(row(page, ids.a)).toHaveCount(0);
  await undo(page, "Delete Feature");
  await expect(row(page, ids.a)).toBeVisible({ timeout: 10_000 });
});

test("feature context menu selects the right-clicked row and stays on screen", async ({
  page,
}) => {
  await loadAppReady(page);
  const featureId = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const box = g.box(0.02, 0.02, 0.01);
    await g.idle();
    return box;
  });

  const target = row(page, featureId);
  await expect(target).toBeVisible({ timeout: 15_000 });
  await target.click({ button: "right" });

  const menu = page.getByTestId("browser-context-menu");
  await expect(menu).toBeVisible();
  await expect(target).toHaveAttribute("data-selected", "true");
  await expect(menu).toContainText("Suppress");

  const menuBox = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.y).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport!.height);

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});
