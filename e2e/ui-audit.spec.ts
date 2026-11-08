import { test, expect, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

const OUT = "test-results/ui-audit";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, animations: "disabled" });
}

async function closeMenus(page: Page) {
  await page
    .getByTestId("document-toolbar")
    .click({ position: { x: 700, y: 20 } });
  await page.waitForTimeout(150);
}

async function createTab(page: Page, kind: string) {
  await page.getByTestId("document-tab-add").click();
  await page.getByTestId(`document-tab-create-${kind}`).click();
  await page.waitForTimeout(1800);
}

test("capture every top-level UI surface", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loadAppReady(page);

  await shot(page, "01-part-studio-empty");

  await page.getByTestId("tool-operations").click();
  await page.getByTestId("operation-primitive-box").click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__cadDebug?.getElements().length ?? 0),
    )
    .toBe(1);
  await page.waitForTimeout(900);
  await shot(page, "02-part-studio-populated");

  const bodyId = await page.evaluate(
    () => window.__cadDebug?.getElements()[0]?.nodeId ?? null,
  );
  if (bodyId)
    await page.evaluate((id) => window.__cadDebug?.selectElement(id), bodyId);
  await page.waitForTimeout(900);
  await shot(page, "03-part-studio-selected");

  await page.getByTestId("display-menu").click();
  await shot(page, "04-display-menu");
  await closeMenus(page);

  await page.getByLabel("File menu").click();
  await shot(page, "05-file-menu");
  await closeMenus(page);

  await page.getByTestId("document-panel-toggle").click();
  await shot(page, "06-document-panel");
  await page.getByLabel("Close document panel").click();

  await page.getByTestId("tool-operations").click();
  await shot(page, "07-operations-menu");
  await closeMenus(page);

  await page.getByTestId("tool-appearance").click();
  await shot(page, "08-appearance-panel");
  await page.getByTestId("appearance-close").click();

  const featureRow = page
    .getByTestId("feature-tree")
    .getByText(/^Box \d+$/)
    .first();
  if (await featureRow.count()) {
    await featureRow.click({ button: "right" });
    await shot(page, "09-feature-context-menu");
    await page.keyboard.press("Escape");
  }

  await page.getByTestId("tool-sketch").click();
  await page.waitForTimeout(800);
  await shot(page, "10-sketch-mode");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  await page.getByTestId("open-documents").click();
  await expect(page.getByTestId("documents-page")).toBeVisible();
  await shot(page, "11-documents-page");
  await page.getByRole("button", { name: "← Back to editor" }).click();
  await expect(page.getByTestId("cad-canvas")).toBeVisible();

  const tabs: Array<[string, string, string]> = [
    ["assembly", "assembly-workspace", "12-assembly"],
    ["drawing", "drawing-workspace", "13-drawing"],
    ["variablestudio", "variable-studio-workspace", "14-variable-studio"],
    ["featurestudio", "feature-studio-workspace", "15-feature-studio"],
    ["camstudio", "cam-studio-workspace", "16-cam-studio"],
    ["renderstudio", "render-studio-workspace", "17-render-studio"],
    ["simulationstudio", "simulation-studio-workspace", "18-simulation-studio"],
    ["pcbstudio", "scadstudio-pcb-workspace", "19-pcb-studio"],
  ];

  for (const [kind, testId, name] of tabs) {
    await createTab(page, kind);
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
    if (kind === "assembly") {
      await expect(page.getByTestId("assembly-toolbar")).toBeVisible();
      const addSource = page.getByRole("button", {
        name: /Add source body/,
      });
      if (await addSource.count()) {
        await addSource.first().click();
        await page.waitForTimeout(500);
      }
    }
    await shot(page, name);
  }
});
