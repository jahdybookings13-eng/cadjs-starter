import { expect, test } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("Phase 4 assembly checklist", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1800, height: 1200 });
  await loadAppReady(page);
  await page.evaluate(async () => {
    window.__cadDebug!.scadgen!.box(40, 20, 10);
    await window.__cadDebug!.scadgen!.idle();
  });

  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-assembly").click();
  await expect(page.getByTestId("assembly-workspace")).toBeVisible();
  await expect(page.getByTestId("assembly-toolbar")).toBeVisible();
  await expect(page.getByText(/0 top-level · 0 leaves/)).toBeVisible();

  // Real source bodies, repeated-body instancing, and connector pick kinds.
  await page.getByRole("button", { name: /Add source body/ }).click();
  await page.getByRole("button", { name: /Add source body/ }).click();
  await expect(page.getByText(/2 top-level · 2 leaves/)).toBeVisible();
  await page.getByLabel("Connector pick kind").selectOption("axis");
  await expect(page.getByLabel("Connector pick kind")).toHaveValue("axis");

  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __cadDebug: {
                scadgen: {
                  assembly: {
                    renderStats: () => {
                      instancedBatches: number;
                      instancedLeaves: number;
                      lodCounts: Record<string, number>;
                    };
                  };
                };
              };
            }
          ).__cadDebug.scadgen.assembly.renderStats().instancedBatches,
      ),
    )
    .toBeGreaterThan(0);

  // Mate editing and separate suppression.
  await page
    .getByRole("button", { name: /\+ Mate selected instances/ })
    .click();
  await expect(page.getByText(/1 mates/)).toBeVisible();
  const suppress = page.getByLabel(/^Suppress mate_/).first();
  await suppress.check();
  await expect(suppress).toBeChecked();
  await expect(page.getByLabel(/^Edit mate kind mate_/).first()).toBeVisible();
  await page
    .getByLabel(/^Edit mate kind mate_/)
    .first()
    .selectOption("distance");
  await expect(page.getByLabel(/^Edit mate A ref mate_/).first()).toHaveValue(
    "body",
  );

  // Pointer drag inside the real viewport, then marker/list navigation.
  const instanceButton = page
    .locator('[data-testid^="assembly-instance-"]')
    .first();
  await instanceButton.click();
  await page.getByLabel("Show 3D view").click();
  const dragLayer = page.getByTestId("assembly-viewport-drag");
  await expect(dragLayer).toBeVisible();
  const before = await page.evaluate(
    () =>
      (
        window as unknown as {
          __cadDebug: {
            scadgen: {
              assembly: {
                state: () => { instances: { transform: number[] }[] };
              };
            };
          };
        }
      ).__cadDebug.scadgen.assembly.state().instances[0]!.transform[3],
  );
  const dragBox = await dragLayer.boundingBox();
  expect(dragBox).not.toBeNull();
  await page.mouse.move(dragBox!.x + dragBox!.width / 2, dragBox!.y + 200);
  await page.mouse.down();
  await page.mouse.move(
    dragBox!.x + dragBox!.width / 2 + 40,
    dragBox!.y + 210,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __cadDebug: {
                scadgen: {
                  assembly: {
                    state: () => { instances: { transform: number[] }[] };
                  };
                };
              };
            }
          ).__cadDebug.scadgen.assembly.state().instances[0]!.transform[3],
      ),
    )
    .not.toBe(before);
  await page.getByLabel("Show 3D view").click();
  await page.getByRole("button", { name: "Focus in viewport" }).click();
  await expect(dragLayer).toBeVisible();

  // In-context source rollback control.
  await page.getByLabel("Show 3D view").click();
  await page.getByRole("button", { name: "Open source" }).click();
  await expect(page.getByLabel("Assembly source rollback")).toBeVisible();
  await page.getByRole("button", { name: /Return to assembly/ }).click();
  await expect(page.getByTestId("assembly-workspace")).toBeVisible();
  // The assembly tab remounts its form state; wait for that render before
  // selecting a non-default feature kind.
  await expect(page.getByLabel("Assembly feature kind")).toHaveValue("hole");

  // Main feature tree rows for assembly-context features.
  await page.getByLabel("Assembly feature kind").selectOption("boss");
  await expect(page.getByLabel("Assembly feature kind")).toHaveValue("boss");
  await page.getByRole("button", { name: /Apply boss/ }).click();
  await expect(page.getByText(/In-context boss on/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "Assembly features" }),
  ).toBeVisible();

  // Persisted 3-level/21-instance fixture, save, and reload with the BOM intact.
  await page.getByLabel("Load benchmark assembly").click();
  await expect(page.getByText(/8 top-level · 21 leaves/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText(/BUDGET PASS · 21 leaves · 3 levels/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save" }).first().click();
  await page.reload();
  await expect(page.getByTestId("assembly-workspace")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/8 top-level · 21 leaves/)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("Show BOM").click();
  await expect(page.getByText(/23 rows/)).toBeVisible();
});
