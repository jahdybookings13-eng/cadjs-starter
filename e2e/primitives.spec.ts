import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("primitive catalog builds sphere, ellipsoid, capsule and dome", async ({
  page,
}) => {
  await loadAppReady(page);

  const created = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const ellipsoid = g.primitive("ellipsoid", {
      rx: 0.03,
      ry: 0.02,
      rz: 0.04,
    });
    const sphere = g.primitive("sphere", { r: 0.02 });
    const capsule = g.primitive("capsule", { r: 0.012, length: 0.06 });
    const dome = g.primitive("dome", { r: 0.03, h: 0.03 });
    const report = await g.idle();
    return {
      ids: [
        ellipsoid.featureId,
        sphere.featureId,
        capsule.featureId,
        dome.featureId,
      ],
      report,
    };
  });

  for (const id of created.ids)
    expect(
      created.report[id]?.status,
      `${id}: ${created.report[id]?.detail}`,
    ).toBe("OK");
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(4);
  // The ellipsoid's internal scale step updates the revolve body in place; it
  // must not add a fifth row to the Browser.
  await expect(page.getByRole("button", { name: "Bodies" })).toContainText(
    "(4)",
  );

  // The same builder is reachable from the desk toolbar, not only the debug hook.
  await page.getByTestId("tool-primitives").click();
  await page.getByRole("menuitem", { name: "Dome", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(5);
  await expect(page.getByRole("button", { name: "Bodies" })).toContainText(
    "(5)",
  );
});

test("every catalog primitive builds with published defaults", async ({
  page,
}) => {
  await loadAppReady(page);
  const kinds = [
    "box",
    "prism",
    "pyramid",
    "wedge",
    "cylinder",
    "cone",
    "torus",
    "pipe",
    "sphere",
    "ellipsoid",
    "capsule",
    "dome",
  ] as const;

  const created = await page.evaluate(async (catalog) => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const results = catalog.map((kind) => ({
      kind,
      ...g.primitive(kind, {}),
    }));
    const report = await g.idle();
    return { results, report };
  }, kinds);

  for (const item of created.results)
    expect(
      created.report[item.featureId]?.status,
      `${item.kind}: ${created.report[item.featureId]?.detail}`,
    ).toBe("OK");
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(kinds.length);
  await expect(page.getByRole("button", { name: "Bodies" })).toContainText(
    `(${kinds.length})`,
  );
});
