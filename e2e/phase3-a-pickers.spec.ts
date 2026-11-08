import { test, expect, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

type Vec3 = { x: number; y: number; z: number };

const debug = (page: Page) =>
  (
    window as unknown as {
      __cadDebug?: {
        fitView?: () => void;
        projectWorld?: (
          p: [number, number, number],
        ) => { x: number; y: number; visible: boolean } | null;
        featureParam: (fid: string, id: string) => unknown;
        scadgen?: {
          configureSync: () => void;
          idle: () => Promise<unknown>;
          primitive: (
            kind: "box",
            opts?: Record<string, unknown>,
          ) => {
            featureId: string;
            profileFeatureId: string;
          };
          sweepSimple: () => string;
          extrudeRect: (
            w: number,
            h: number,
            depth: number,
          ) => { sketch: string; extrude: string };
          faceDirs: (
            fid: string,
          ) => Array<{ tag: string; center: Vec3; normal: Vec3 }> | null;
        };
      };
    }
  ).__cadDebug;

const fit = async (page: Page) => {
  await page.evaluate(() => {
    (
      window as unknown as { __cadDebug?: { fitView?: () => void } }
    ).__cadDebug?.fitView?.();
  });
  await page.waitForTimeout(250);
};

const clickWorld = async (page: Page, point: [number, number, number]) => {
  const projected = await page.evaluate((p) => {
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
  expect(
    projected,
    `world point ${point.join(",")} should project`,
  ).not.toBeNull();
  expect(projected!.visible).toBe(true);
  const target = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el
        ? `${el.tagName}:${el.getAttribute("data-testid") ?? el.className}`
        : "none";
    },
    { x: projected!.x, y: projected!.y },
  );
  expect(
    target,
    `point ${point.join(",")} must reach the pick layer`,
  ).toContain("end-reference-pick-layer");
  await page.mouse.click(projected!.x, projected!.y);
};

const topFaceOf = async (page: Page, featureId: string) => {
  const point = await page.evaluate((fid) => {
    const g = (
      window as unknown as {
        __cadDebug: {
          scadgen: {
            faceDirs: (
              f: string,
            ) => Array<{ center: Vec3; normal: Vec3 }> | null;
            describeScene: () => {
              bodies: Array<{ fid: string; position: number[] | null }>;
            };
          };
        };
      }
    ).__cadDebug.scadgen;
    const top = (g.faceDirs(fid) ?? [])
      .slice()
      .sort((a, b) => b.normal.z - a.normal.z)[0];
    const pos = g.describeScene().bodies.find((b) => b.fid === fid)?.position;
    if (!top) return null;
    return [
      top.center.x + (pos?.[0] ?? 0),
      top.center.y + (pos?.[1] ?? 0),
      top.center.z + (pos?.[2] ?? 0),
    ] as [number, number, number];
  }, featureId);
  return point;
};

const openDialog = async (page: Page, featureId: string) => {
  const row = page.locator(`[data-feature-id="${featureId}"]`).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Edit Feature", exact: true })
    .click();
  const dialog = page.getByTestId("feature-dialog");
  await expect(dialog).toBeVisible();
  // The panel is centered over the fitted model. Move it aside so viewport
  // picks reach the canvas; this changes no picker logic.
  await dialog.evaluate((el) => {
    el.style.transform = "translateX(-30vw)";
  });
  return dialog;
};

const param = (page: Page, fid: string, id: string) =>
  page.evaluate(
    ([f, p]) => {
      const dbg = (
        window as unknown as {
          __cadDebug?: { featureParam: (fid: string, id: string) => unknown };
        }
      ).__cadDebug;
      return dbg?.featureParam(f, p) ?? null;
    },
    [fid, id] as const,
  );

test("extrude end reference picks a face on another body and rejects its own result", async ({
  page,
}) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = (
      window as unknown as {
        __cadDebug: {
          scadgen: {
            configureSync: () => void;
            idle: () => Promise<unknown>;
            primitive: (
              kind: "box",
              opts?: Record<string, unknown>,
            ) => {
              featureId: string;
            };
            cylinder: (r: number, h: number) => string;
            transform: (
              fid: string,
              type: "MOVE",
              translation: [number, number, number],
            ) => string;
            extrudeRect: (
              w: number,
              h: number,
              d: number,
            ) => { sketch: string; extrude: string };
          };
        };
      }
    ).__cadDebug.scadgen;
    g.configureSync();
    g.primitive("box", { width: 0.06, height: 0.06, depth: 0.02 });
    await g.idle();
    const extruded = g.extrudeRect(0.04, 0.04, 0.01);
    // A separate reference body moved clear in X: no shared depth tie with the
    // extrude, so the ray cannot land on the feature's own result.
    const reference = g.transform(g.cylinder(0.01, 0.03), "MOVE", [0.08, 0, 0]);
    await g.idle();
    return { reference, ...extruded };
  });

  await fit(page);
  const referenceTop = await topFaceOf(page, ids.reference);
  let dialog = await openDialog(page, ids.extrude);
  await dialog.getByLabel("End Condition").selectOption("UP_TO_FACE");
  const row = dialog.locator('[data-parameter-id="endBoundEntity"]');
  await row.getByTestId("pick-end-reference").click();
  await expect(page.getByTestId("end-reference-pick-layer")).toBeVisible();

  // A click on the offset reference cylinder's top face is stored as a FACE
  // query; the row shows the resolved face tag.
  await clickWorld(page, referenceTop!);
  await expect(row).toContainText(/_F\d+/);
  await expect(row).not.toContainText("None");

  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  expect(await param(page, ids.extrude, "endBound")).toBe("UP_TO_FACE");
  expect(await param(page, ids.extrude, "endBoundEntity")).toBe(1);
});

test("extrude draft picks a neutral face and a parting edge", async ({
  page,
}) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = (
      window as unknown as {
        __cadDebug: {
          scadgen: {
            configureSync: () => void;
            idle: () => Promise<unknown>;
            primitive: (
              kind: "box",
              opts?: Record<string, unknown>,
            ) => {
              featureId: string;
            };
            cylinder: (r: number, h: number) => string;
            transform: (
              fid: string,
              type: "MOVE",
              translation: [number, number, number],
            ) => string;
            extrudeRect: (
              w: number,
              h: number,
              d: number,
            ) => { sketch: string; extrude: string };
          };
        };
      }
    ).__cadDebug.scadgen;
    g.configureSync();
    const box = g.primitive("box", { width: 0.06, height: 0.06, depth: 0.02 });
    await g.idle();
    const extruded = g.extrudeRect(0.04, 0.04, 0.01);
    // A reference body moved clear of the extrude, so its face is unambiguous.
    const reference = g.transform(g.cylinder(0.01, 0.03), "MOVE", [0.08, 0, 0]);
    await g.idle();
    return { box: box.featureId, reference, ...extruded };
  });

  await fit(page);
  const referenceTop = await topFaceOf(page, ids.reference);
  const dialog = await openDialog(page, ids.extrude);
  await dialog.getByLabel("Draft", { exact: true }).check();
  await dialog.getByLabel("Draft Plane").selectOption("PARTING");

  // Parting edge first: picking the neutral face commits a preview and
  // re-renders the row, which can detach a second pick button mid-click.
  // The bottom line of the centered sketch is at (0, -0.02, 0); pickers match
  // only sketch curves, so body occlusion is moot.
  const edgeRow = dialog.locator('[data-parameter-id="draftPartingEdge"]');
  await edgeRow.getByTestId("pick-end-reference").dispatchEvent("click");
  await clickWorld(page, [0, -0.02, 0]);
  await expect(edgeRow).not.toContainText("None");

  const neutralRow = dialog.locator('[data-parameter-id="draftNeutralFace"]');
  await neutralRow.getByTestId("pick-end-reference").dispatchEvent("click");
  // Top centre of the offset reference cylinder.
  await clickWorld(page, referenceTop!);
  await expect(neutralRow).toContainText(/_F\d+/);

  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  expect(await param(page, ids.extrude, "draftMode")).toBe("PARTING");
  expect(await param(page, ids.extrude, "draftNeutralFace")).toBe(1);
  expect(await param(page, ids.extrude, "draftPartingEdge")).toBe(1);
});

test("draft feature parting edge picker stores a sketch line", async ({
  page,
}) => {
  await loadAppReady(page);

  const ids = await page.evaluate(async () => {
    const g = (
      window as unknown as {
        __cadDebug: {
          scadgen: {
            configureSync: () => void;
            idle: () => Promise<unknown>;
            box: (w: number, h: number, d: number) => string;
            etags: (fid: string) => string[] | null;
            ftags: (fid: string) => string[] | null;
            rect: (w: number, h: number) => string;
            draft: (
              fid: string,
              tags: string[],
              angleDeg: number,
              neutral: string,
            ) => string;
          };
        };
      }
    ).__cadDebug.scadgen;
    g.configureSync();
    const box = g.box(0.03, 0.03, 0.01);
    await g.idle();
    const edge = (g.etags(box) ?? [])[0];
    const face = (g.ftags(box) ?? [])[0];
    if (!edge || !face) throw new Error("box has no edge/face tags");
    const reference = g.rect(0.03, 0.03);
    const draft = g.draft(box, [edge], 5, face);
    await g.idle();
    return { draft, reference };
  });

  await fit(page);
  const dialog = await openDialog(page, ids.draft);
  await dialog.getByLabel("Mode").selectOption("PARTING");
  const row = dialog.locator('[data-parameter-id="draftPartingEdge"]');
  await row.getByTestId("pick-end-reference").dispatchEvent("click");
  // Top line of the standalone centered 0.03 x 0.03 reference sketch.
  await clickWorld(page, [0, 0.015, 0]);
  await expect(row).not.toContainText("None");

  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  expect(await param(page, ids.draft, "draftPartingEdge")).toBe(1);
});

test("sweep guide picker adds one guide, dedupes it, and clears", async ({
  page,
}) => {
  await loadAppReady(page);

  const sweep = await page.evaluate(async () => {
    const g = (
      window as unknown as {
        __cadDebug: {
          scadgen: {
            configureSync: () => void;
            idle: () => Promise<unknown>;
            sweepSimple: () => string;
          };
        };
      }
    ).__cadDebug.scadgen;
    g.configureSync();
    const fid = g.sweepSimple();
    await g.idle();
    return fid;
  });

  await fit(page);
  const dialog = await openDialog(page, sweep);
  const row = dialog.locator('[data-parameter-id="guideSubqueries"]');
  await expect(row).toContainText("None");

  // The path sketch's line runs from (0,0,0) to (0.05,0,0).
  await row.getByTestId("pick-end-reference").click();
  await clickWorld(page, [0.025, 0, 0]);
  await expect(row).not.toContainText("None");

  // Clicking the same curve again must not duplicate the guide. Apply proves
  // the stored query list has exactly one entry.
  await clickWorld(page, [0.025, 0, 0]);
  await expect(row).not.toContainText("None");
  await row.getByTestId("pick-end-reference").click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  expect(await param(page, sweep, "guideSubqueries")).toBe(1);

  // Reopening and clearing removes the stored guide.
  const reopened = await openDialog(page, sweep);
  const reopenedRow = reopened.locator('[data-parameter-id="guideSubqueries"]');
  await expect(reopenedRow).not.toContainText("None");
  await reopenedRow.getByTestId("clear-guides").click();
  await expect(reopenedRow).toContainText("None");
  await reopened.getByRole("button", { name: "Apply" }).click();
  await expect(reopened).toBeHidden();
  expect(await param(page, sweep, "guideSubqueries")).toBe(0);
});
