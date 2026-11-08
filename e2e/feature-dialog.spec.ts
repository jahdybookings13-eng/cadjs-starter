import { test, expect, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

const bboxOf = (page: Page, featureId: string) =>
  page.evaluate((fid) => {
    const body = window.__cadDebug?.scadgen
      ?.describeScene()
      .bodies.find((b) => b.fid === fid);
    return body?.bbox ?? null;
  }, featureId);

const sizeOf = async (page: Page, featureId: string) => {
  const b = await bboxOf(page, featureId);
  return b ? [b[3]! - b[0]!, b[4]! - b[1]!, b[5]! - b[2]!] : null;
};

const depthOf = async (page: Page, featureId: string) =>
  (await sizeOf(page, featureId))?.[2] ?? 0;

const minZOf = async (page: Page, featureId: string) =>
  (await bboxOf(page, featureId))?.[2] ?? Number.NaN;

const worldZOf = (page: Page, featureId: string) =>
  page.evaluate((fid) => {
    const body = window.__cadDebug?.scadgen
      ?.describeScene()
      .bodies.find((b) => b.fid === fid);
    return body?.position?.[2] ?? Number.NaN;
  }, featureId);

const facesOf = (page: Page, featureId: string) =>
  page.evaluate(
    (fid) => window.__cadDebug?.scadgen?.tags(fid)?.faces ?? 0,
    featureId,
  );

test("feature dialog previews, cancels, applies and undoes an extrude edit", async ({
  page,
}) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const result = g.primitive("box", {});
    await g.idle();
    return result;
  });

  const row = page.locator(`[data-feature-id="${ids.featureId}"]`).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.03, 3);
  // The box profile is centred on its sketch plane; measure from that base.
  const baseMinZ = await minZOf(page, ids.featureId);
  const baseWorldZ = await worldZOf(page, ids.featureId);
  expect(Number.isFinite(baseMinZ)).toBe(true);
  expect(Number.isFinite(baseWorldZ)).toBe(true);

  const openDialog = async () => {
    await row.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit Feature" }).click();
    const dialog = page.getByTestId("feature-dialog");
    await expect(dialog).toBeVisible();
    return dialog;
  };

  // All four params below are consumed by the extrude executor path
  // (operationType boolean, hasDraft/draftAngle, symmetric, offset), so the
  // dialog must let them be edited rather than disabling them as unwired.
  const dialog = await openDialog();
  await expect(dialog.getByLabel("Operation")).toBeEnabled();
  await expect(dialog.getByLabel("Draft", { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("Symmetric")).toBeEnabled();
  await expect(dialog.getByLabel("Offset", { exact: true })).toBeEnabled();

  // A depth edit previews on the live body, and Cancel restores it.
  const depth = dialog.getByLabel("Depth", { exact: true });
  await expect(depth).toBeEnabled();
  await depth.fill("0.06");
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.06, 3);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.03, 3);

  // Escape is Cancel: no partial feature and no residual preview.
  const escapeDialog = await openDialog();
  await escapeDialog.getByLabel("Depth", { exact: true }).fill("0.05");
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.05, 3);
  await page.keyboard.press("Escape");
  await expect(escapeDialog).toBeHidden();
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.03, 3);

  // Offset moves the start plane without changing the extruded depth.
  const offsetDialog = await openDialog();
  await offsetDialog.getByLabel("Offset", { exact: true }).check();
  await offsetDialog.getByLabel("Offset Distance").fill("0.01");
  await expect
    .poll(() => worldZOf(page, ids.featureId))
    .toBeCloseTo(baseWorldZ + 0.01, 3);
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.03, 3);
  await offsetDialog.getByRole("button", { name: "Cancel" }).click();
  await expect
    .poll(() => worldZOf(page, ids.featureId))
    .toBeCloseTo(baseWorldZ, 3);

  // Symmetric extrudes the depth on both sides of the sketch plane.
  const symmetricDialog = await openDialog();
  await symmetricDialog.getByLabel("Symmetric").check();
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.06, 3);
  // Symmetric bodies are centred on the sketch plane in their local frame.
  await expect.poll(() => minZOf(page, ids.featureId)).toBeCloseTo(-0.03, 3);
  await symmetricDialog.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.03, 3);
  await expect.poll(() => minZOf(page, ids.featureId)).toBeCloseTo(baseMinZ, 3);

  // A back depth adds material on the other side of the sketch plane.
  const twoSided = await openDialog();
  await twoSided.getByLabel("Second Direction").check();
  await twoSided.getByLabel("Back Depth").fill("0.02");
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.05, 3);
  await twoSided.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.03, 3);

  // Apply keeps the edit and records exactly one undo entry.
  const applied = await openDialog();
  await applied.getByLabel("Depth", { exact: true }).fill("0.06");
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.06, 3);
  await applied.getByRole("button", { name: "Apply" }).click();
  await expect(applied).toBeHidden();
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.06, 3);

  await page.getByRole("button", { name: /^Undo Edit Feature/ }).click();
  await expect.poll(() => depthOf(page, ids.featureId)).toBeCloseTo(0.03, 3);
});

test("pattern and split dialogs edit the C parameters", async ({ page }) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    const box = g.box(0.02, 0.02, 0.01);
    await g.idle();
    const pattern = (
      g as unknown as {
        bodyPattern: (
          fid: string,
          count: number,
          direction: [number, number, number],
          spacing: number,
          opts?: { separate?: boolean },
        ) => string;
      }
    ).bodyPattern(box, 3, [1, 0, 0], 0.03, { separate: true });
    await g.idle();
    const split = g.split(box, [0.01, 0, 0], [1, 0, 0], "both");
    await g.idle();
    return { box, pattern, split };
  });

  const patternRow = page.locator(`[data-feature-id="${ids.pattern}"]`).first();
  await expect(patternRow).toBeVisible({ timeout: 15_000 });
  await patternRow.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Edit Feature", exact: true })
    .click();
  const patternDialog = page.getByTestId("feature-dialog");
  await expect(patternDialog).toBeVisible();
  await patternDialog.getByLabel("Spacing Mode").selectOption("EQUAL");
  await patternDialog.getByLabel("Count", { exact: true }).fill("2");
  await patternDialog.getByRole("button", { name: "Apply" }).click();
  await expect(patternDialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: /^Undo Edit Feature/ }),
  ).toBeVisible();

  const splitRow = page.locator(`[data-feature-id="${ids.split}"]`).first();
  await expect(splitRow).toBeVisible({ timeout: 15_000 });
  await splitRow.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Edit Feature", exact: true })
    .click();
  const splitDialog = page.getByTestId("feature-dialog");
  await expect(splitDialog).toBeVisible();
  await splitDialog.getByLabel("Keep").selectOption("both");
  await splitDialog.getByRole("button", { name: "Apply" }).click();
  await expect(splitDialog).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate((fid) => {
        const s = (
          window as unknown as {
            __cadDebug?: { scadgen?: { bodiesOf?: (id: string) => string[] } };
          }
        ).__cadDebug?.scadgen;
        return s?.bodiesOf?.(fid).length ?? 0;
      }, ids.split),
    )
    .toBe(2);
});

test("counterbore adds a shoulder and a second wall", async ({ page }) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();

    const simpleBox = g.primitive("box", {});
    await g.idle();
    const simple = g.hole(simpleBox.featureId, [[0, 0, 0]], 0.004, 0.05);

    const boreBox = g.primitive("box", {});
    await g.idle();
    const counterbore = g.hole(boreBox.featureId, [[0, 0, 0]], 0.004, 0.05, {
      holeType: "COUNTERBORE",
      counterboreRadius: 0.008,
      counterboreDepth: 0.006,
    });
    await g.idle();
    return { simple, counterbore };
  });

  const simpleFaces = await facesOf(page, ids.simple);
  const counterboreFaces = await facesOf(page, ids.counterbore);
  expect(simpleFaces).toBeGreaterThan(0);
  expect(counterboreFaces).toBeGreaterThan(simpleFaces);
});

test("per-edge fillet radii and chamfer distances are applied and validated", async ({
  page,
}) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();

    const edgeOf = async () => {
      const box = g.primitive("box", {});
      await g.idle();
      const tag = (g.etags(box.featureId) ?? [])[0];
      if (!tag) throw new Error("box has no edges");
      return { boxId: box.featureId, tag };
    };

    const f = await edgeOf();
    const filletOk = g.fillet(f.boxId, [f.tag], 0.003, [0.003]);
    const fBad = await edgeOf();
    const filletBad = g.fillet(fBad.boxId, [fBad.tag], 0.003, [0.003, 0.004]);

    const c = await edgeOf();
    const chamferOk = g.chamfer(c.boxId, [c.tag], 0.003, [0.003]);
    const cBad = await edgeOf();
    const chamferBad = g.chamfer(cBad.boxId, [cBad.tag], 0.003, [0.003, 0.004]);

    await g.idle();
    return { filletOk, filletBad, chamferOk, chamferBad };
  });

  // A blend or chamfer replaces one box edge with a new face.
  expect(await facesOf(page, ids.filletOk)).toBeGreaterThan(6);
  expect(await facesOf(page, ids.chamferOk)).toBeGreaterThan(6);

  const statuses = await page.evaluate(
    () => window.__cadDebug?.scadgen?.states() ?? {},
  );
  expect(statuses[ids.filletBad]?.featureStatus).toBe("ERROR");
  expect(statuses[ids.chamferBad]?.featureStatus).toBe("ERROR");
});
