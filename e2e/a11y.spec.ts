import { expect, test } from "@playwright/test";

import { loadAppReady, readMode } from "./helpers";

test("skip link reaches the main workspace and focus is visible", async ({
  page,
}) => {
  await loadAppReady(page);
  await page.keyboard.press("Tab");

  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("global tool search is keyboard-first, dispatches tools and restores focus", async ({
  page,
}) => {
  await loadAppReady(page);
  await page.keyboard.press("Control+K");

  const dialog = page.getByTestId("tool-search-dialog");
  const input = page.getByTestId("tool-search-input");
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();

  // Shift+Tab from the first focusable must wrap to the last control inside
  // the dialog rather than escaping to the page behind it.
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(() =>
      Boolean(
        document
          .querySelector('[data-testid="tool-search-dialog"]')
          ?.contains(document.activeElement),
      ),
    ),
  ).toBe(true);

  await input.fill("extrude");
  await expect(
    page
      .getByTestId("tool-search-result")
      .filter({ hasText: "Extrude" })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  expect(await readMode(page)).toBe("extrude");

  // Opening from the toolbar and escaping returns focus to the trigger.
  const trigger = page.getByTestId("tool-search-trigger");
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("toolbar, palette and tab order expose accessible names and sufficient contrast", async ({
  page,
}) => {
  await loadAppReady(page);

  const unnamed = await page.evaluate(() => {
    const selector = "button, input, a[href]";
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.getBoundingClientRect().width > 0 &&
          element.getBoundingClientRect().height > 0
        );
      })
      .filter((element) => {
        const text = element.textContent?.trim() ?? "";
        const label = element.getAttribute("aria-label")?.trim() ?? "";
        const title = element.getAttribute("title")?.trim() ?? "";
        const placeholder = element.getAttribute("placeholder")?.trim() ?? "";
        return !text && !label && !title && !placeholder;
      })
      .map((element) => element.outerHTML.slice(0, 160));
  });
  expect(unnamed).toEqual([]);

  const contrast = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    const parse = (value: string): [number, number, number] => {
      if (!context) return [0, 0, 0];
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const data = context.getImageData(0, 0, 1, 1).data;
      return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
    };
    const luminance = ([r, g, b]: [number, number, number]) => {
      const channel = (value: number) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const ratio = (foreground: string, background: string) => {
      const a = luminance(parse(foreground));
      const b = luminance(parse(background));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const background = (element: HTMLElement) => {
      let node: HTMLElement | null = element;
      while (node) {
        const value = window.getComputedStyle(node).backgroundColor;
        if (value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
          return value;
        }
        node = node.parentElement;
      }
      return "rgb(0, 0, 0)";
    };
    const toolbar = document.querySelector<HTMLElement>(
      '[data-testid="tool-extrude"]',
    );
    const search = document.querySelector<HTMLElement>(
      '[data-testid="tool-search-trigger"]',
    );
    const text = (element: HTMLElement | null) =>
      element
        ? ratio(window.getComputedStyle(element).color, background(element))
        : 0;
    return { toolbar: text(toolbar), search: text(search) };
  });
  expect(contrast.toolbar).toBeGreaterThanOrEqual(4.5);
  expect(contrast.search).toBeGreaterThanOrEqual(4.5);

  // Tab through the first controls; every landing place must be a visible,
  // named control rather than an unnamed wrapper or the document body.
  await page.keyboard.press("Tab");
  for (let index = 0; index < 6; index += 1) {
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return { name: "", visible: false };
      const text = element.textContent?.trim() ?? "";
      const label = element.getAttribute("aria-label")?.trim() ?? "";
      const title = element.getAttribute("title")?.trim() ?? "";
      return {
        name: text || label || title,
        visible: element.getBoundingClientRect().width > 0,
      };
    });
    expect(focused.visible).toBe(true);
    expect(focused.name.length).toBeGreaterThan(0);
    await page.keyboard.press("Tab");
  }
});
