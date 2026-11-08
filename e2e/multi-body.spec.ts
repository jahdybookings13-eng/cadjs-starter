import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("split-both exposes a second selectable body", async ({ page }) => {
  await loadAppReady(page);

  const result = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const box = g.box(0.04, 0.04, 0.03);
    await g.idle();
    const split = g.split(box, [0.02, 0, 0], [1, 0, 0], "both");
    const report = await g.idle();
    for (let i = 0; i < 60; i++) {
      if ((window.__cadDebug?.getElements().length ?? 0) >= 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const authored = g.authoredIds();
    const extra = authored.find((p) => p.startsWith(`${split}#1->`));
    return {
      split,
      status: report[split]?.status,
      bodies: g.bodiesOf(split),
      authored,
      extraElementId: extra?.slice(extra.indexOf("->") + 2) ?? null,
    };
  });

  expect(result.status).toBe("OK");
  expect(result.bodies).toHaveLength(2);
  expect(result.authored.some((p) => p.startsWith(`${result.split}#1->`))).toBe(
    true,
  );

  const extraRow = page
    .getByTestId("feature-tree-row")
    .filter({ hasText: "(body 2)" });
  await expect(extraRow).toBeVisible();
  await extraRow.click();
  // Selecting the extra body also selects and highlights its owning feature
  // row, so Browser and feature selection stay in sync for multi-body extras.
  await expect(extraRow).toHaveClass(/bg-blue-900\/60/);

  const panel = page.getByTestId("body-properties");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Split (body 2)");
  await expect(panel).toContainText("split");
  await expect(panel.getByTestId("body-face-count")).not.toHaveText("0");
  await expect(panel.getByTestId("body-visible")).toHaveText("Yes");

  await extraRow.getByTitle("Hide").click();
  await expect(panel.getByTestId("body-visible")).toHaveText("No");
  expect(
    await page.evaluate(
      (id) =>
        window.__cadDebug?.getElements().find((e) => e.nodeId === id)?.visible,
      result.extraElementId,
    ),
  ).toBe(false);
  await extraRow.getByTitle("Show").click();
  await expect(panel.getByTestId("body-visible")).toHaveText("Yes");

  const downloadPromise = page.waitForEvent("download");
  await panel.getByTestId("body-export-stl").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.stl$/);
  expect(await download.path()).toBeTruthy();
});
