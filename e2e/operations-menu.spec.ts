import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("operations menu exposes live features and creates a primitive", async ({
  page,
}) => {
  await loadAppReady(page);

  await page.getByTestId("tool-operations").click();
  await expect(page.getByTestId("operations-menu")).toBeVisible();
  await expect(page.getByTestId("operations-search")).toBeVisible();
  await expect(page.getByTestId("operation-primitive-box")).toBeVisible();
  await expect(page.getByTestId("operation-appearance")).toBeVisible();

  await page.getByTestId("operations-search").fill("box");
  await expect(page.getByTestId("operation-primitive-box")).toBeVisible();
  await page.getByTestId("operation-primitive-box").click();

  await expect
    .poll(() =>
      page.evaluate(() => window.__cadDebug?.getElements().length ?? 0),
    )
    .toBe(1);
  await expect(page.getByRole("button", { name: "Bodies" })).toContainText(
    "(1)",
  );
});

test("operations menu searches labels and reports its live count", async ({
  page,
}) => {
  await loadAppReady(page);
  await page.getByTestId("tool-operations").click();

  const menu = page.getByTestId("operations-menu");
  await expect(menu).toContainText("live operations");
  await page.getByTestId("operations-search").fill("shell");
  await expect(page.getByTestId("operation-shell")).toBeVisible();
  await expect(page.getByTestId("operation-primitive-box")).toBeHidden();
  await page.getByTestId("operations-search").fill("no-such-feature");
  await expect(menu).toContainText("No operation matches");
});
