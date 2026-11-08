import { test, expect, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

const addBox = (page: Page) =>
  page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const result = g.primitive("box", { w: 0.05, h: 0.04, d: 0.03 });
    await g.idle();
    return result.featureId;
  });

const fit = async (page: Page) => {
  await page.evaluate(() => {
    (
      window as unknown as { __cadDebug?: { fitView?: () => void } }
    ).__cadDebug?.fitView?.();
  });
  await page.waitForTimeout(400);
};

const project = (page: Page, point: [number, number, number]) =>
  page.evaluate((p) => {
    const dbg = (
      window as unknown as {
        __cadDebug?: {
          projectWorld?: (
            p: [number, number, number],
          ) => { x: number; y: number; visible: boolean } | null;
        };
      }
    ).__cadDebug;
    return dbg?.projectWorld?.(p) ?? null;
  }, point);

const moveWorld = async (page: Page, point: [number, number, number]) => {
  const projected = await project(page, point);
  expect(
    projected,
    `world point ${point.join(",")} should project`,
  ).not.toBeNull();
  expect(projected!.visible).toBe(true);
  await page.mouse.move(projected!.x, projected!.y);
};

const clickWorld = async (page: Page, point: [number, number, number]) => {
  const projected = await project(page, point);
  expect(
    projected,
    `world point ${point.join(",")} should project`,
  ).not.toBeNull();
  expect(projected!.visible).toBe(true);
  await page.mouse.click(projected!.x, projected!.y);
};

const measureState = (page: Page) =>
  page.evaluate(() => window.__cadMeasureDebug?.state() ?? null);

test("measure: distance, pin and unpin survive a rebuild", async ({ page }) => {
  await loadAppReady(page);
  await addBox(page);
  await fit(page);
  await page.getByRole("button", { name: "Measure", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getMode()))
    .toBe("measure");
  await expect
    .poll(() => page.evaluate(() => !!window.__cadMeasureDebug))
    .toBe(true);

  // The top face is visible after fit-all; clicking its opposite corners snaps
  // to the two vertices and exercises the real distance picker.
  await clickWorld(page, [-0.025, -0.02, 0.03]);
  await clickWorld(page, [0.025, 0.02, 0.03]);
  await expect
    .poll(async () => (await measureState(page))?.measurements.length ?? 0)
    .toBe(1);

  const distance = (await measureState(page))!.measurements[0]!;
  expect(distance.type).toBe("distance");
  expect(distance.value).toBeGreaterThan(0.03);
  expect(distance.value).toBeLessThan(0.08);

  expect(await page.evaluate(() => window.__cadMeasureDebug?.pin())).toBe(true);
  await expect
    .poll(async () => (await measureState(page))?.pinned.length ?? 0)
    .toBe(1);
  const pinned = (await measureState(page))!.pinned[0]!;
  expect(pinned.id).toBe(distance.id);

  // Rebuilding does not discard the pinned measurement.
  await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    g.primitive("sphere", {
      r: 0.004,
      frame: {
        origin: [0.05, 0, 0],
        xAxis: [1, 0, 0],
        normal: [0, 0, 1],
      },
    });
    await g.idle();
  });
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(2);
  await expect
    .poll(async () => (await measureState(page))?.pinned.length ?? 0)
    .toBe(1);
  expect((await measureState(page))!.pinned[0]!.value).toBeCloseTo(
    distance.value,
    9,
  );

  expect(
    await page.evaluate(
      (id) => window.__cadMeasureDebug?.unpin(id),
      distance.id,
    ),
  ).toBe(true);
  await expect
    .poll(async () => (await measureState(page))?.pinned.length ?? 0)
    .toBe(0);
  await expect
    .poll(async () => (await measureState(page))?.measurements.length ?? 0)
    .toBe(1);
});

test("measure: edge length and angle use the edge pickers", async ({
  page,
}) => {
  await loadAppReady(page);
  await addBox(page);
  await fit(page);
  await page.getByRole("button", { name: "Measure", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getMode()))
    .toBe("measure");
  await expect
    .poll(() => page.evaluate(() => !!window.__cadMeasureDebug))
    .toBe(true);

  const topCentre: [number, number, number] = [0, 0, 0.03];
  const edgeAlongY: [number, number, number] = [-0.025, 0, 0.03];
  const edgeAlongX: [number, number, number] = [0, -0.02, 0.03];

  await page.getByRole("button", { name: "Edge Length", exact: true }).click();
  await moveWorld(page, topCentre);
  await page.waitForTimeout(400);
  await moveWorld(page, edgeAlongY);
  await page.waitForTimeout(400);
  await clickWorld(page, edgeAlongY);
  await expect
    .poll(async () => (await measureState(page))?.measurements.length ?? 0)
    .toBe(1);
  const edge = (await measureState(page))!.measurements[0]!;
  expect(edge.type).toBe("edge-length");
  expect([0.03, 0.04, 0.05]).toContainEqual(Number(edge.value.toFixed(3)));

  // Remove the edge annotation before the angle pick: measurement annotations
  // are hit-tested before edges and would otherwise swallow the second click.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect
    .poll(async () => (await measureState(page))?.measurements.length ?? 0)
    .toBe(0);

  await page.getByRole("button", { name: "Angle", exact: true }).click();
  await moveWorld(page, topCentre);
  await page.waitForTimeout(400);
  await moveWorld(page, edgeAlongY);
  await page.waitForTimeout(400);
  await clickWorld(page, edgeAlongY);
  await expect
    .poll(async () => (await measureState(page))?.statusText)
    .toContain("second edge");
  await moveWorld(page, edgeAlongX);
  await page.waitForTimeout(400);
  await clickWorld(page, edgeAlongX);
  await expect
    .poll(async () => (await measureState(page))?.measurements.length ?? 0)
    .toBe(1);
  const angle = (await measureState(page))!.measurements[0]!;
  expect(angle.type).toBe("angle");
  expect(angle.value).toBeGreaterThan(80);
  expect(angle.value).toBeLessThan(100);
});
