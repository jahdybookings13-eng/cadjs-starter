import { test, expect, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

async function addPrimitive(
  page: Page,
  kind: string,
  opts: Record<string, unknown> = {},
) {
  return page.evaluate(
    async ({ kind, opts }) => {
      const g = window.__cadDebug?.scadgen;
      if (!g) throw new Error("no scadgen debug hook");
      g.configureSync();
      const result = (
        g.primitive as unknown as (
          kind: string,
          opts: Record<string, unknown>,
        ) => { featureId: string }
      )(kind, opts);
      await g.idle();
      return result.featureId;
    },
    { kind, opts },
  );
}

async function selectBody(page: Page, id: string) {
  await page.evaluate((nodeId) => window.__cadDebug?.selectElement(nodeId), id);
  await expect(page.getByTestId("body-properties")).toBeVisible();
}

async function inspectNumber(page: Page, testId: string) {
  const text = await page.getByTestId(testId).innerText();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  expect(match, `no number in ${testId}: ${text}`).not.toBeNull();
  return Number(match![0]);
}

test("selected body shows real geometry properties", async ({ page }) => {
  await loadAppReady(page);

  await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    g.primitive("box", {});
    await g.idle();
  });

  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(1);
  const nodeId = await page.evaluate(
    () => window.__cadDebug?.getElements()[0]?.nodeId ?? null,
  );
  expect(nodeId).toBeTruthy();

  await page.evaluate((id) => window.__cadDebug?.selectElement(id), nodeId!);
  const panel = page.getByTestId("body-properties");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Body Properties");
  await expect(panel).toContainText("Box 1");
  await expect(panel).toContainText("extrude");
  await expect(panel.getByTestId("body-size-x")).toHaveText("50.0 mm");
  await expect(panel.getByTestId("body-size-y")).toHaveText("40.0 mm");
  await expect(panel.getByTestId("body-size-z")).toHaveText("30.0 mm");
  await expect(panel.getByTestId("body-face-count")).toHaveText("12");
  await expect(panel.getByTestId("body-edge-count")).toHaveText("12");
  await expect(panel.getByTestId("body-volume")).not.toHaveText("n/a");
  await expect(panel.getByTestId("body-surface-area")).not.toHaveText("n/a");
  await expect(panel.getByTestId("body-triangle-count")).not.toHaveText("0");
});

test("G1: box inspect reports thickness, section and precision", async ({
  page,
}) => {
  await loadAppReady(page);
  await addPrimitive(page, "box", { w: 0.02, h: 0.01, d: 0.005 });
  const nodeId = await page.evaluate(
    () => window.__cadDebug?.getElements()[0]?.nodeId ?? null,
  );
  expect(nodeId).toBeTruthy();
  await selectBody(page, nodeId!);

  const panel = page.getByTestId("body-properties");
  await expect(panel.getByTestId("inspect-thickness")).toHaveText("5.00 mm");
  await expect(panel.getByTestId("inspect-section-area")).toHaveText(
    "200.00 mm²",
  );
  await expect(panel.getByTestId("inspect-section-perimeter")).toHaveText(
    "60.00 mm",
  );
  // A box has no smooth-edge radius estimate.
  await expect(panel.getByTestId("inspect-radius")).toHaveText("n/a");
  await expect(panel.getByTestId("inspect-diameter")).toHaveText("n/a");
  await expect(panel.getByTestId("inspect-curvature")).toHaveText("n/a");

  await panel.getByTestId("inspect-precision").selectOption("4");
  await expect(panel.getByTestId("inspect-thickness")).toHaveText(
    /^5\.\d{4} mm$/,
  );
  await expect(panel.getByTestId("inspect-section-area")).toHaveText(
    "200.0000 mm²",
  );
  await expect(panel.getByTestId("inspect-section-perimeter")).toHaveText(
    "60.0000 mm",
  );
});

test("G2: cylinder inspect estimates radius, diameter and curvature", async ({
  page,
}) => {
  await loadAppReady(page);
  await addPrimitive(page, "cylinder", { r: 0.005, h: 0.02 });
  const nodeId = await page.evaluate(
    () => window.__cadDebug?.getElements()[0]?.nodeId ?? null,
  );
  expect(nodeId).toBeTruthy();
  await selectBody(page, nodeId!);

  const panel = page.getByTestId("body-properties");
  const radius = await inspectNumber(page, "inspect-radius");
  const diameter = await inspectNumber(page, "inspect-diameter");
  const curvature = await inspectNumber(page, "inspect-curvature");
  expect(Math.abs(radius - 5)).toBeLessThan(0.15);
  expect(Math.abs(diameter - 10)).toBeLessThan(0.3);
  expect(Math.abs(curvature - 0.2)).toBeLessThan(0.01);
  await expect(panel.getByTestId("inspect-radius")).toHaveText(/mm$/);
  await expect(panel.getByTestId("inspect-diameter")).toHaveText(/mm$/);
  await expect(panel.getByTestId("inspect-curvature")).toHaveText(/1\/mm$/);
});

test("G3: inspect switches between mm and inches", async ({ page }) => {
  await loadAppReady(page);
  await addPrimitive(page, "box", { w: 0.02, h: 0.01, d: 0.005 });
  const nodeId = await page.evaluate(
    () => window.__cadDebug?.getElements()[0]?.nodeId ?? null,
  );
  expect(nodeId).toBeTruthy();
  await selectBody(page, nodeId!);

  const panel = page.getByTestId("body-properties");
  await panel.getByTestId("body-material").selectOption("aluminum");
  await expect(panel.getByTestId("inspect-tolerance")).toContainText(
    "mesh estimate",
  );
  await panel.getByTestId("inspect-precision").selectOption("4");
  await panel.getByTestId("inspect-unit-in").click();
  await expect(panel.getByTestId("inspect-unit-in")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(panel.getByTestId("inspect-thickness")).toHaveText("0.1969 in");
  await expect(panel.getByTestId("inspect-section-area")).toHaveText(
    "0.3100 in²",
  );
  await expect(panel.getByTestId("inspect-section-perimeter")).toHaveText(
    "2.3622 in",
  );
  // The same unit switch applies to the mass-properties block.
  await expect(panel.getByTestId("body-size-x")).toHaveText("0.8 in");
  await expect(panel.getByTestId("body-volume")).toContainText("in³");
  await expect(panel.getByTestId("body-surface-area")).toContainText("in²");
  await expect(panel.getByTestId("body-mass")).toContainText("lb");
  await expect(panel.getByTestId("body-center-of-mass")).toContainText(" in");

  await panel.getByTestId("inspect-unit-mm").click();
  await expect(panel.getByTestId("inspect-thickness")).toHaveText(
    /^5\.\d{4} mm$/,
  );
  await expect(panel.getByTestId("inspect-section-area")).toHaveText(
    "200.0000 mm²",
  );
  await expect(panel.getByTestId("body-size-x")).toHaveText("20.0 mm");
  await expect(panel.getByTestId("body-volume")).toHaveText("1000.0 mm³");
  await expect(panel.getByTestId("body-mass")).not.toContainText("lb");
});

test("G4: selecting overlapping bodies reports interference", async ({
  page,
}) => {
  await loadAppReady(page);
  await addPrimitive(page, "box", { w: 0.02, h: 0.01, d: 0.005 });
  await addPrimitive(page, "box", { w: 0.02, h: 0.01, d: 0.005 });
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(2);
  const ids = await page.evaluate(() =>
    window.__cadDebug?.getElements().map((e) => e.nodeId),
  );
  expect(ids).toHaveLength(2);

  await selectBody(page, ids![0]!);
  await page.evaluate((id) => window.__cadDebug?.selectElement(id), ids![1]!);
  const panel = page.getByTestId("body-properties");
  await expect(panel).toContainText("2 bodies selected");
  await expect(panel.getByTestId("inspect-interference")).toHaveText("Yes");
  await expect(panel.getByTestId("inspect-clearance")).toHaveText("0.00 mm");
});

test("G4: selecting separated bodies reports clearance", async ({ page }) => {
  await loadAppReady(page);
  await addPrimitive(page, "box", { w: 0.02, h: 0.01, d: 0.005 });
  await addPrimitive(page, "box", {
    w: 0.02,
    h: 0.01,
    d: 0.005,
    frame: {
      // Placement applies this origin to the sketch and the body, so 25 mm
      // lands the 20 mm box at x = 50 mm and leaves a 30 mm gap.
      origin: [0.025, 0, 0],
      xAxis: [1, 0, 0],
      normal: [0, 0, 1],
    },
  });
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(2);
  const ids = await page.evaluate(() =>
    window.__cadDebug?.getElements().map((e) => e.nodeId),
  );
  expect(ids).toHaveLength(2);

  await selectBody(page, ids![0]!);
  await page.evaluate((id) => window.__cadDebug?.selectElement(id), ids![1]!);
  const panel = page.getByTestId("body-properties");
  await expect(panel).toContainText("2 bodies selected");
  await expect(panel.getByTestId("inspect-interference")).toHaveText("No");
  await expect(panel.getByTestId("inspect-clearance")).toHaveText("30.00 mm");
});

test("G8: inspect values survive a later rebuild", async ({ page }) => {
  await loadAppReady(page);
  await addPrimitive(page, "box", { w: 0.02, h: 0.01, d: 0.005 });
  const nodeId = await page.evaluate(
    () => window.__cadDebug?.getElements()[0]?.nodeId ?? null,
  );
  expect(nodeId).toBeTruthy();
  await selectBody(page, nodeId!);

  const panel = page.getByTestId("body-properties");
  const before = {
    thickness: await panel.getByTestId("inspect-thickness").innerText(),
    area: await panel.getByTestId("inspect-section-area").innerText(),
    perimeter: await panel.getByTestId("inspect-section-perimeter").innerText(),
  };

  await addPrimitive(page, "sphere", {
    r: 0.004,
    frame: {
      origin: [0.05, 0, 0],
      xAxis: [1, 0, 0],
      normal: [0, 0, 1],
    },
  });
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(2);

  await expect(panel.getByTestId("inspect-thickness")).toHaveText(
    before.thickness,
  );
  await expect(panel.getByTestId("inspect-section-area")).toHaveText(
    before.area,
  );
  await expect(panel.getByTestId("inspect-section-perimeter")).toHaveText(
    before.perimeter,
  );
});

test("G5: XY section stays fixed when box depth changes", async ({ page }) => {
  await loadAppReady(page);
  const featureId = await addPrimitive(page, "box", {
    w: 0.02,
    h: 0.01,
    d: 0.005,
  });
  const nodeId = await page.evaluate(
    () => window.__cadDebug?.getElements()[0]?.nodeId ?? null,
  );
  expect(nodeId).toBeTruthy();
  await selectBody(page, nodeId!);

  const panel = page.getByTestId("body-properties");
  const areaBefore = await panel
    .getByTestId("inspect-section-area")
    .innerText();
  const perimeterBefore = await panel
    .getByTestId("inspect-section-perimeter")
    .innerText();

  const row = page.locator(`[data-feature-id="${featureId}"]`).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Edit Feature", exact: true })
    .click();
  const dialog = page.getByTestId("feature-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Depth", { exact: true }).fill("0.02");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();

  await selectBody(page, nodeId!);
  await expect(panel.getByTestId("body-size-z")).toHaveText("20.0 mm");
  await expect(panel.getByTestId("inspect-section-area")).toHaveText(
    areaBefore,
  );
  await expect(panel.getByTestId("inspect-section-perimeter")).toHaveText(
    perimeterBefore,
  );
});

test("G6: extra split body reports its own measurements", async ({ page }) => {
  await loadAppReady(page);
  const extraId = await page.evaluate(async () => {
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
    return (
      g
        .authoredIds()
        .find((pair) => pair.startsWith(`${split}#1->`))
        ?.split("->")[1] ?? null
    );
  });
  expect(extraId).toBeTruthy();
  await selectBody(page, extraId!);

  const panel = page.getByTestId("body-properties");
  await expect(panel.getByTestId("body-visible")).toHaveText("Yes");
  await expect(panel.getByTestId("inspect-thickness")).toHaveText("20.00 mm");
  await expect(panel.getByTestId("inspect-section-area")).toHaveText(
    "800.00 mm²",
  );
  await expect(panel.getByTestId("inspect-section-perimeter")).toHaveText(
    "120.00 mm",
  );
});

test("G6: hidden and isolated bodies keep their inspect values", async ({
  page,
}) => {
  await loadAppReady(page);
  await addPrimitive(page, "box", { w: 0.02, h: 0.01, d: 0.005 });
  const nodeId = await page.evaluate(
    () => window.__cadDebug?.getElements()[0]?.nodeId ?? null,
  );
  expect(nodeId).toBeTruthy();
  await addPrimitive(page, "box", {
    w: 0.02,
    h: 0.01,
    d: 0.005,
    frame: {
      origin: [0.025, 0, 0],
      xAxis: [1, 0, 0],
      normal: [0, 0, 1],
    },
  });
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(2);
  await selectBody(page, nodeId!);

  const panel = page.getByTestId("body-properties");
  const thickness = await panel.getByTestId("inspect-thickness").innerText();
  const area = await panel.getByTestId("inspect-section-area").innerText();

  await panel.getByTestId("body-hide").click();
  await expect(panel.getByTestId("body-visible")).toHaveText("No");
  await expect(panel.getByTestId("inspect-thickness")).toHaveText(thickness);
  await expect(panel.getByTestId("inspect-section-area")).toHaveText(area);

  await panel.getByTestId("body-hide").click();
  await expect(panel.getByTestId("body-visible")).toHaveText("Yes");

  // Isolating the selected body must hide the other body, not just toggle a
  // registry flag. The inspector stays on the selected body.
  await panel.getByTestId("body-isolate").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__cadDebug?.getElements().filter((e) => e.visible === false)
            .length ?? 0,
      ),
    )
    .toBe(1);
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("body-visible")).toHaveText("Yes");
  await expect(panel.getByTestId("inspect-thickness")).toHaveText(thickness);

  await panel.getByTestId("body-isolate").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__cadDebug?.getElements().filter((e) => e.visible === false)
            .length ?? 0,
      ),
    )
    .toBe(0);
  await expect(panel.getByTestId("body-visible")).toHaveText("Yes");
});
