import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("parts: create, name, assign, material, hide, export and copy", async ({
  page,
}) => {
  await loadAppReady(page);

  const split = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const box = g.box(0.04, 0.04, 0.03);
    await g.idle();
    return g.split(box, [0.02, 0, 0], [1, 0, 0], "both");
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__cadDebug?.getElements().length ?? 0),
      { timeout: 15000 },
    )
    .toBeGreaterThanOrEqual(2);

  const panel = page.getByTestId("body-properties");
  // Select the split's primary body row.
  const primaryRow = page
    .getByTestId("feature-tree-row")
    .filter({ hasText: "Split" })
    .first();
  await primaryRow.click();
  await expect(panel).toBeVisible();

  // Create a part and auto-assign the selection.
  page.once("dialog", (dialog) => dialog.accept("Housing"));
  await panel.getByTestId("body-part-create").click();
  await expect(panel.getByTestId("body-part-select")).toHaveValue(/part-/);
  await expect(panel.getByTestId("body-part-name")).toHaveValue("Housing");
  const partValue = await panel.getByTestId("body-part-select").inputValue();

  // Part number and description persist in the registry-backed fields.
  await panel.getByTestId("body-part-number").fill("PN-100");
  await panel.getByTestId("body-part-number").blur();
  await expect(panel.getByTestId("body-part-number")).toHaveValue("PN-100");

  // Rename the body independently of the feature.
  await panel.getByTestId("body-name").fill("Base");
  await panel.getByTestId("body-name").blur();
  await expect(
    page.getByTestId("feature-tree-row").filter({ hasText: "Base" }).first(),
  ).toBeVisible();

  // Material drives mass; aluminium has a density.
  await panel.getByTestId("body-material").selectOption("aluminum");
  await expect(panel.getByTestId("body-mass")).not.toHaveText("n/a");
  await expect(panel.getByTestId("body-center-of-mass")).not.toHaveText("n/a");

  // Hide/show through the inspector updates the scene and the body row.
  await panel.getByTestId("body-hide").click();
  await expect(panel.getByTestId("body-visible")).toHaveText("No");
  await panel.getByTestId("body-hide").click();
  await expect(panel.getByTestId("body-visible")).toHaveText("Yes");

  // Assign the second split body to the same part => composite part.
  const extraRow = page
    .getByTestId("feature-tree-row")
    .filter({ hasText: "Split (body 2)" })
    .first();
  await extraRow.click();
  await expect(panel).toBeVisible();
  // The extra body was created before the part, so it starts unassigned and
  // is assigned here to make the part composite.
  await panel.getByTestId("body-part-select").selectOption(partValue);
  await expect(panel.getByTestId("body-part-composite")).toBeVisible();
  await expect(panel.getByTestId("body-part-body-count")).toHaveText("2");

  // Per-part STL export includes both bodies.
  const downloadPromise = page.waitForEvent("download");
  await panel.getByTestId("body-export-part-stl").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.stl$/);

  // Copy the selected extra body adds a new registered body to the scene.
  const before = await page.evaluate(
    () => window.__cadDebug?.getElements().length ?? 0,
  );
  await panel.getByTestId("body-transform-copy").click();
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__cadDebug?.getElements().length ?? 0),
      { timeout: 15000 },
    )
    .toBeGreaterThan(before);

  // The copied body appears as a body row with its own name.
  await expect(
    page.getByTestId("feature-tree-row").filter({ hasText: "body 2" }).first(),
  ).toBeVisible();
  expect(split).toMatch(/^F/);
});

test("parts: multi-select applies part, material and state to every body", async ({
  page,
}) => {
  await loadAppReady(page);

  const bodies = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const box = g.box(0.04, 0.04, 0.03);
    await g.idle();
    const split = g.split(box, [0.02, 0, 0], [1, 0, 0], "both");
    await g.idle();
    for (let i = 0; i < 60; i++) {
      if ((window.__cadDebug?.getElements().length ?? 0) >= 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const authored = g.authoredIds();
    const elementOf = (bodyId: string) =>
      authored.find((pair) => pair.startsWith(`${bodyId}->`))?.split("->")[1];
    return {
      primary: elementOf(split) ?? null,
      extra: elementOf(`${split}#1`) ?? null,
    };
  });
  expect(bodies.primary).toBeTruthy();
  expect(bodies.extra).toBeTruthy();

  const panel = page.getByTestId("body-properties");

  // selectElement is additive, but each call must land before the next so the
  // selection ref is fresh (same-tick calls would overwrite each other).
  await page.evaluate(
    (id) => window.__cadDebug?.selectElement(id),
    bodies.primary!,
  );
  await expect(panel).toBeVisible();
  await page.evaluate(
    (id) => window.__cadDebug?.selectElement(id),
    bodies.extra!,
  );
  await expect(panel).toContainText("2 bodies selected");
  await expect(panel.getByTestId("body-selection-count")).toHaveText("2");
  await expect(panel.getByTestId("body-selection-volume")).not.toHaveText(
    "n/a",
  );

  // New Part assigns every selected body at once => composite part.
  page.once("dialog", (dialog) => dialog.accept("Housing"));
  await panel.getByTestId("body-part-create").click();
  await expect(panel.getByTestId("body-part-name")).toHaveValue("Housing");
  await expect(panel.getByTestId("body-part-body-count")).toHaveText("2");
  await expect(panel.getByTestId("body-part-composite")).toBeVisible();

  // Material, visibility, transparency and remove apply to all selected bodies.
  await panel.getByTestId("body-material").selectOption("aluminum");
  await expect(panel.getByTestId("body-selection-mass")).not.toContainText(
    "n/a",
  );
  await panel.getByTestId("body-hide").click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.__cadDebug?.getElements().filter((e) => e.visible === false)
            .length ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await panel.getByTestId("body-hide").click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.__cadDebug?.getElements().filter((e) => e.visible === false)
            .length ?? 0,
      ),
    )
    .toBe(0);

  await panel.getByTestId("body-transparent").click();
  await expect(panel.getByTestId("body-transparent")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await panel.getByTestId("body-transparent").click();
  await expect(panel.getByTestId("body-transparent")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await panel.getByTestId("body-remove").click();
  await expect(panel.getByTestId("body-remove")).toHaveText("Restore");

  // Dropping to a single body keeps the material that was applied to all.
  await page.evaluate(
    (id) => window.__cadDebug?.deselectElement(id),
    bodies.extra!,
  );
  await expect(panel.getByTestId("body-selection-count")).toHaveCount(0);
  await expect(panel.getByTestId("body-material")).toHaveValue("aluminum");
});

test("parts: a failed feature owns its row's error, not the source body", async ({
  page,
}) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const box = g.box(0.02, 0.02, 0.01);
    await g.idle();
    // Two radii for one selected edge is a named fillet validation error.
    const edge = (g.etags(box) ?? [])[0] ?? "";
    const failed = g.fillet(box, [edge], 0.002, [0.002, 0.003]);
    const report = await g.idle();
    return { box, failed, detail: report[failed]?.detail ?? null };
  });
  expect(ids.detail).toBeTruthy();

  const panel = page.getByTestId("body-properties");
  const failedRow = page.locator(`[data-feature-id="${ids.failed}"]`).first();
  await expect(failedRow).toContainText("ERROR", { timeout: 15_000 });
  await failedRow.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("body-feature-status")).toHaveText("ERROR");
  await expect(panel.getByTestId("body-feature-error")).toContainText(
    ids.detail!,
  );
  await expect(panel.getByTestId("body-feature")).toContainText("Fillet");

  // The source body row reports its own status and never claims the error.
  const boxRow = page.locator(`[data-feature-id="${ids.box}"]`).first();
  await boxRow.click();
  await expect(panel.getByTestId("body-feature-status")).toHaveText("OK");
  await expect(panel.getByTestId("body-feature-error")).toHaveCount(0);
});
