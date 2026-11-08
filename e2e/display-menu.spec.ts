import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("display menu controls style, origin visibility and section view", async ({
  page,
}) => {
  await loadAppReady(page);

  await page.getByTestId("display-menu").click();
  const panel = page.getByTestId("display-menu-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Origin");

  const xyPlane = page.getByTestId("display-origin-xy");
  await expect(xyPlane).toHaveAttribute("aria-checked", "false");
  await xyPlane.click();
  await expect(xyPlane).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("display-style-shaded-no-edges").click();
  await expect(panel).toBeHidden();
  await page.getByTestId("display-menu").click();
  await expect(
    page.getByTestId("display-style-shaded-no-edges"),
  ).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("display-section-y").click();
  await expect(page.getByTestId("display-section-y")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("display-section-offset")).toBeVisible();
});
