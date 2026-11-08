import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("appearance panel lists bodies and applies color and opacity", async ({
  page,
}) => {
  await loadAppReady(page);

  await page.getByTestId("tool-operations").click();
  await page.getByTestId("operation-primitive-box").click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__cadDebug?.getElements().length ?? 0),
    )
    .toBe(1);

  await page.getByTestId("tool-appearance").click();
  const panel = page.getByTestId("appearance-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Appearance");
  await expect(panel).toContainText("Bodies (1)");

  await page.getByTestId("appearance-color-eb5757").click();
  await expect(page.getByTestId("appearance-color-custom")).toHaveValue(
    "#eb5757",
  );

  const aluminum = page.getByTestId("appearance-material-aluminum");
  await aluminum.click();
  await expect(aluminum).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toContainText("Aluminum");

  const opacity = page.getByTestId("appearance-opacity");
  await opacity.evaluate((element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "40");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByTestId("appearance-opacity-value")).toHaveText("40%");

  await page.getByTestId("appearance-close").click();
  await expect(panel).toBeHidden();
});

test("body context menu opens appearance for the selected body", async ({
  page,
}) => {
  await loadAppReady(page);
  await page.getByTestId("tool-operations").click();
  await page.getByTestId("operation-primitive-box").click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__cadDebug?.getElements().length ?? 0),
    )
    .toBe(1);

  const nodeId = await page.evaluate(
    () => window.__cadDebug?.getElements()[0]?.nodeId ?? null,
  );
  expect(nodeId).toBeTruthy();
  await page.evaluate((id) => window.__cadDebug?.selectElement(id), nodeId!);

  await page.getByTestId("cad-canvas").click({
    button: "right",
    position: { x: 220, y: 220 },
  });
  await expect(page.getByTestId("canvas-context-menu")).toBeVisible();
  await expect(page.getByTestId("canvas-op-appearance")).toBeVisible();
  await page.getByTestId("canvas-op-appearance").click();
  await expect(page.getByTestId("appearance-panel")).toBeVisible();
});
