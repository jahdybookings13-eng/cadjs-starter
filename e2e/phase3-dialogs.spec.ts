import { test, expect, type Locator, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

/**
 * H9: every Phase 3 feature dialog opens, exposes its parameters, marks
 * unwired rows disabled with a reason, previews a draft, cancels back to the
 * exact project text, applies as one history node and undoes back.
 */
interface DialogsDebug {
  configureSync: () => void;
  idle: () => Promise<Record<string, { status: string; detail?: string }>>;
  box: (w: number, h: number, d: number) => string;
  ftags: (fid: string) => string[] | null;
  etags: (fid: string) => string[] | null;
  shell: (fid: string, tag: string, t: number) => string;
  draft: (
    fid: string,
    tags: string[],
    angle: number,
    neutral: string,
  ) => string;
  loftSimple: () => string;
  sweepSimple: () => string;
  booleanUnion: (target: string, tool: string) => string;
  transform: (
    fid: string,
    type: "MOVE" | "COPY" | "ROTATE",
    translation: [number, number, number],
  ) => string;
  rib: (fid: string | null, opts?: Record<string, unknown>) => string;
  gusset: (fid: string | null, opts?: Record<string, unknown>) => string;
  web: (fid: string | null, opts?: Record<string, unknown>) => string;
  boss: (fid: string | null, opts?: Record<string, unknown>) => string;
  emboss: (
    fid: string,
    polylines: number[][][],
    opts?: Record<string, unknown>,
  ) => string;
  coil: (fid: string | null, opts?: Record<string, unknown>) => string;
  domeFeature: (fid: string | null, opts?: Record<string, unknown>) => string;
  enclose: (fid: string, edgeTags: string[]) => string;
  thread: (fid: string, size: string) => string;
  hem: (fid: string, edgeTag: string) => string;
  unfold: (sourceFid: string, foldFids: string[]) => string;
  openFeatureDialog: (fid: string) => boolean;
}

const KINDS = [
  "shell",
  "draft",
  "loft",
  "sweep",
  "boolean",
  "transform",
  "rib",
  "gusset",
  "web",
  "boss",
  "emboss",
  "coil",
  "dome",
  "enclose",
  "thread",
  "hem",
  "unfold",
] as const;

const buildFeature = (page: Page, kind: string) =>
  page.evaluate(async (kind) => {
    const w = window as unknown as {
      __cadDebug: { scadgen: DialogsDebug };
    };
    const g = w.__cadDebug.scadgen;
    g.configureSync();
    const base = g.box(0.04, 0.03, 0.02);
    await g.idle();
    const faces = g.ftags(base) ?? [];
    const edges = g.etags(base) ?? [];
    let fid = "";
    switch (kind) {
      case "shell":
        fid = g.shell(base, faces[0] ?? "", 0.001);
        break;
      case "draft":
        fid = g.draft(base, [faces[1] ?? faces[0] ?? ""], 3, faces[0] ?? "");
        break;
      case "loft":
        fid = g.loftSimple();
        break;
      case "sweep":
        fid = g.sweepSimple();
        break;
      case "boolean": {
        const target = g.box(0.02, 0.02, 0.01);
        const tool = g.box(0.015, 0.015, 0.02);
        await g.idle();
        fid = g.booleanUnion(target, tool);
        break;
      }
      case "transform":
        fid = g.transform(base, "MOVE", [0.01, 0, 0]);
        break;
      case "rib":
        fid = g.rib(base, {
          x1: 0.005,
          y1: 0.005,
          x2: 0.05,
          y2: 0.005,
          thickness: 0.003,
          depth: 0.02,
        });
        break;
      case "gusset":
        fid = g.gusset(null, { x2: 0.03, depth: 0.02, merge: false });
        break;
      case "web":
        fid = g.web(null, {
          x1: 0,
          y1: 0,
          x2: 0.03,
          y2: 0,
          merge: false,
        });
        break;
      case "boss":
        fid = g.boss(base, { diameter: 0.01, height: 0.006 });
        break;
      case "emboss":
        fid = g.emboss(base, [
          [
            [0, 0.01],
            [0.02, 0.02],
            [0.04, 0.03],
          ],
        ]);
        break;
      case "coil":
        fid = g.coil(null, {
          radius: 0.01,
          wireRadius: 0.001,
          pitch: 0.004,
          turns: 2,
          merge: false,
        });
        break;
      case "dome":
        fid = g.domeFeature(null, {
          radius: 0.015,
          height: 0.01,
          merge: false,
        });
        break;
      case "enclose":
        fid = g.enclose(base, edges.slice(0, 2));
        break;
      case "thread":
        fid = g.thread(base, "M6");
        break;
      case "hem":
        fid = g.hem(base, edges[0] ?? "");
        break;
      case "unfold": {
        const hem = g.hem(base, edges[0] ?? "");
        await g.idle();
        fid = g.unfold(base, [hem]);
        break;
      }
    }
    const report = await g.idle();
    return { fid, status: report[fid]?.status, detail: report[fid]?.detail };
  }, kind);

const projectJson = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __scadgen: { phase3: { projectJson: () => string } };
    };
    return w.__scadgen.phase3.projectJson();
  });

// The Browser dedupes in-place features (shell, fillet, thread) onto the body
// row they update, so open the dialog through the same handler the row's
// context menu calls instead of depending on a per-feature row.
const openDialog = async (page: Page, fid: string) => {
  const opened = await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __cadDebug: { scadgen: DialogsDebug };
        }
      ).__cadDebug.scadgen.openFeatureDialog(id),
    fid,
  );
  expect(opened).toBe(true);
  const dialog = page.getByTestId("feature-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
};

/** Change the first enabled editable control so the draft becomes dirty. */
const editFirstControl = async (dialog: Locator) => {
  const number = dialog.locator('input[type="number"]:not([disabled])').first();
  if ((await number.count()) > 0) {
    const value = Number(await number.inputValue());
    const delta = value === 0 ? 0.001 : Math.abs(value) * 0.1;
    const next = Number((value + delta).toPrecision(6));
    await number.fill(String(next));
    return;
  }
  const select = dialog.locator("select:not([disabled])").first();
  if ((await select.count()) > 0) {
    const options = await select
      .locator("option")
      .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
    const current = await select.inputValue();
    const next = options.find((option) => option !== current);
    if (!next) throw new Error("dialog has no alternative enum value");
    await select.selectOption(next);
    return;
  }
  const checkbox = dialog
    .locator('input[type="checkbox"]:not([disabled])')
    .first();
  if ((await checkbox.count()) > 0) {
    await checkbox.click();
    return;
  }
  const text = dialog.locator('input[type="text"]:not([disabled])').first();
  if ((await text.count()) > 0) {
    // The unfold dialog exposes only its fold list as an editable string.
    await text.fill(`${await text.inputValue()} `);
    return;
  }
  throw new Error("dialog has no enabled editable control");
};

for (const kind of KINDS) {
  test(`${kind} dialog previews, cancels, applies and undoes`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loadAppReady(page);
    const built = await buildFeature(page, kind);
    expect(built.fid, `${kind} feature was not created`).toBeTruthy();
    const before = await projectJson(page);

    const dialog = await openDialog(page, built.fid);
    const rows = dialog.locator("[data-parameter-id]");
    expect(await rows.count()).toBeGreaterThan(0);

    // Every parameter is either editable or explicitly unwired with a reason.
    for (let i = 0; i < (await rows.count()); i++) {
      const row = rows.nth(i);
      const control = row.locator("input,select").first();
      if ((await control.count()) === 0) continue;
      if (!(await control.isDisabled())) continue;
      const reason = await row.locator("label").getAttribute("title");
      expect(
        reason?.trim(),
        `${kind}: ${await row.getAttribute("data-parameter-id")} is disabled without a reason`,
      ).toBeTruthy();
    }

    // A draft edit previews and Cancel restores the exact project text.
    await editFirstControl(dialog);
    await expect(
      dialog.locator('[data-parameter-id][data-dirty="true"]').first(),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(await projectJson(page)).toBe(before);

    // Apply is one history node; one undo returns to the same project text.
    const applied = await openDialog(page, built.fid);
    await editFirstControl(applied);
    await expect(
      applied.locator('[data-parameter-id][data-dirty="true"]').first(),
    ).toBeVisible();
    // Let the live preview rebuild settle before committing the edit.
    await page.waitForTimeout(300);
    await applied.getByRole("button", { name: "Apply" }).click();
    await expect(applied).toBeHidden();
    const undo = page.getByRole("button", { name: /^Undo Edit Feature/ });
    await expect(undo).toBeVisible();
    await undo.click();
    expect(await projectJson(page)).toBe(before);
  });
}
