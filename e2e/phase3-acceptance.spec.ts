import { expect, test, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

interface P3Geometry {
  digest: string;
  bodies: Array<{
    featureId: string;
    kind: string;
    vertices: number;
    edges: number;
    faces: number;
    volumeMM3: number | null;
    bbox: number[] | null;
    digest: string;
  }>;
  totals: { bodies: number; vertices: number; edges: number; faces: number };
  bbox: number[] | null;
}

interface P3Audit {
  ok: boolean;
  featureCount: number;
  types: string[];
  missing: string[];
  duplicateIds: string[];
  unnamed: string[];
  newFeatures: string[];
}

interface P3Debug {
  configureSync: () => void;
  idle: () => Promise<
    Record<string, { status: string; detail?: string; origin?: string }>
  >;
  box: (w: number, h: number, d: number) => string;
  cylinder: (r: number, h: number) => string;
  sphere: (r: number) => string;
  torus: (ringR: number, tubeR: number) => string;
  sweepSimple: () => string;
  loftSimple: () => string;
  booleanUnion: (targetFid: string, toolFid: string) => string;
  fillet: (fid: string, tags: string[], r: number) => string;
  chamfer: (fid: string, tags: string[], d: number) => string;
  shell: (fid: string, tag: string, t: number) => string;
  draft: (
    fid: string,
    tags: string[],
    angleDeg: number,
    neutral: string,
  ) => string;
  hole: (
    fid: string,
    centers: [number, number, number][],
    r: number,
    d: number,
  ) => string;
  featurePattern: (
    sourceFids: string[],
    axis: [number, number, number],
    spacing: number,
    count: number,
  ) => string;
  split: (
    fid: string,
    origin: [number, number, number],
    normal: [number, number, number],
    keep?: "positive" | "negative" | "both",
  ) => string;
  mirror: (src: string, axis: "X" | "Y" | "Z") => string;
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
  etags: (fid: string) => string[] | null;
  ftags: (fid: string) => string[] | null;
  setRollback: (index: number | null) => void;
  setSuppressed: (fid: string, suppressed: boolean) => boolean;
  moveFeature: (fid: string, toIndex: number) => boolean;
  history: () => {
    features: Array<{ featureId: string; featureType: string; name: string }>;
    rollbackIndex: number | null;
  };
  saveProject: () => string;
  loadProject: (text?: string) => number;
  exportSceneStl: () => Promise<Uint8Array>;
  exportSceneStep: () => Promise<Uint8Array>;
  exportBodyStl: (fid: string) => Promise<Uint8Array>;
  exportBodyStep: (fid: string) => Promise<Uint8Array>;
  insertStl: (bytes: number[]) => string;
  insertStep: (bytes: number[]) => string;
  bodiesOf: (fid: string) => string[];
  setAppearance: (
    fid: string,
    ap: { color?: string; opacity?: number },
  ) => boolean;
  appearanceOf: (fid: string) => { color?: string; opacity?: number } | null;
  featureParam: (
    fid: string,
    parameterId: string,
  ) => { kind?: string; value?: unknown } | null;
}

const buildPart = async (page: Page) =>
  page.evaluate(async () => {
    const w = window as unknown as {
      __cadDebug: { scadgen: P3Debug };
      __scadgen: {
        phase3: {
          audit: () => P3Audit;
          geometry: () => P3Geometry;
          projectJson: () => string;
        };
      };
    };
    const g = w.__cadDebug.scadgen;
    g.configureSync();

    const ids: Record<string, string> = {};
    ids.base = g.box(0.06, 0.04, 0.02);
    ids.pin = g.cylinder(0.02, 0.05);
    ids.ball = g.sphere(0.015);
    ids.ring = g.torus(0.02, 0.004);
    ids.sweep = g.sweepSimple();
    ids.loft = g.loftSimple();
    const toolA = g.box(0.02, 0.02, 0.01);
    const toolB = g.box(0.015, 0.015, 0.02);
    await g.idle();
    ids.boolean = g.booleanUnion(toolA, toolB);

    const baseEdge = (g.etags(ids.base) ?? [])[0] ?? "";
    const pinEdge = (g.etags(ids.pin) ?? [])[0] ?? "";
    const baseFaces = g.ftags(ids.base) ?? [];
    ids.fillet = g.fillet(ids.base, [baseEdge], 0.002);
    ids.chamfer = g.chamfer(ids.pin, [pinEdge], 0.001);
    ids.shell = g.shell(ids.base, baseFaces[0] ?? "", 0.001);
    ids.draft = g.draft(
      ids.base,
      [baseFaces[1] ?? baseFaces[0] ?? ""],
      3,
      baseFaces[0] ?? "",
    );
    ids.hole = g.hole(ids.base, [[0.02, 0.02, 0.02]], 0.003, 0.01);
    ids.pattern = g.featurePattern([ids.fillet], [1, 0, 0], 0.02, 2);
    ids.split = g.split(ids.ball, [0, 0, 0], [1, 0, 0], "both");
    ids.mirror = g.mirror(ids.ring, "X");
    ids.rib = g.rib(ids.base, {
      x1: 0.005,
      y1: 0.005,
      x2: 0.05,
      y2: 0.005,
      thickness: 0.003,
      depth: 0.02,
    });
    ids.gusset = g.gusset(null, { x2: 0.03, depth: 0.02, merge: false });
    ids.web = g.web(null, {
      x1: 0,
      y1: 0,
      x2: 0.03,
      y2: 0,
      merge: false,
    });
    ids.boss = g.boss(ids.base, { diameter: 0.01, height: 0.006 });
    ids.emboss = g.emboss(ids.pin, [
      [
        [0, 0.01],
        [0.02, 0.02],
        [0.04, 0.03],
      ],
    ]);
    ids.coil = g.coil(null, {
      radius: 0.01,
      wireRadius: 0.001,
      pitch: 0.004,
      turns: 2,
      merge: false,
    });
    ids.dome = g.domeFeature(null, {
      radius: 0.015,
      height: 0.01,
      merge: false,
    });
    ids.enclose = g.enclose(ids.base, (g.etags(ids.base) ?? []).slice(0, 2));

    const report = await g.idle();
    return {
      ids,
      report,
      audit: w.__scadgen.phase3.audit(),
      geometry: w.__scadgen.phase3.geometry(),
      project: w.__scadgen.phase3.projectJson(),
      history: g.history(),
    };
  });

test.setTimeout(240_000);

test("H1/H2: 35-feature acceptance part builds, audits and is rebuild-stable", async ({
  page,
}) => {
  await loadAppReady(page);
  const built = await buildPart(page);

  const failures = Object.entries(built.report).filter(
    ([, r]) => r.status !== "OK",
  );
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  expect(built.audit.ok, JSON.stringify(built.audit, null, 2)).toBe(true);
  expect(built.audit.featureCount).toBeGreaterThanOrEqual(20);
  expect(built.audit.missing).toEqual([]);
  expect(built.audit.duplicateIds).toEqual([]);
  expect(built.audit.newFeatures.length).toBeGreaterThan(0);
  for (const t of [
    "sweep",
    "loft",
    "boolean",
    "revolve",
    "extrude",
    "fillet",
    "chamfer",
    "shell",
    "draft",
    "hole",
    "featurePattern",
    "split",
  ]) {
    expect(built.audit.types, t).toContain(t);
  }
  expect(built.geometry.digest).toMatch(/^[0-9a-f]{16}$/);
  expect(built.geometry.totals.bodies).toBeGreaterThan(10);

  // A second idle must not change geometry (deterministic rebuild).
  const stable = await page.evaluate(async () => {
    const w = window as unknown as {
      __cadDebug: { scadgen: P3Debug };
      __scadgen: { phase3: { geometry: () => P3Geometry } };
    };
    await w.__cadDebug.scadgen.idle();
    return w.__scadgen.phase3.geometry().digest;
  });
  expect(stable).toBe(built.geometry.digest);

  // Suppress/restore and rollback/forward return to the same geometry.
  const toggled = await page.evaluate(async () => {
    const w = window as unknown as {
      __cadDebug: { scadgen: P3Debug };
      __scadgen: { phase3: { geometry: () => P3Geometry } };
    };
    const g = w.__cadDebug.scadgen;
    const before = w.__scadgen.phase3.geometry().digest;
    const gusset = g.history().features.find((f) => f.featureType === "gusset");
    if (!gusset) throw new Error("gusset missing");
    g.setSuppressed(gusset.featureId, true);
    await g.idle();
    const off = w.__scadgen.phase3.geometry().digest;
    g.setSuppressed(gusset.featureId, false);
    await g.idle();
    const restored = w.__scadgen.phase3.geometry().digest;
    g.setRollback(5);
    await g.idle();
    const rolled = w.__scadgen.phase3.geometry().digest;
    g.setRollback(null);
    await g.idle();
    const forward = w.__scadgen.phase3.geometry().digest;
    return { before, off, restored, rolled, forward };
  });
  expect(toggled.off).not.toBe(toggled.before);
  expect(toggled.restored).toBe(toggled.before);
  expect(toggled.rolled).not.toBe(toggled.before);
  expect(toggled.forward).toBe(toggled.before);
});

test("H2/H3: save/reload keeps canonical bytes, geometry and feature states", async ({
  page,
}) => {
  await loadAppReady(page);
  const built = await buildPart(page);
  const restored = await page.evaluate(async () => {
    const w = window as unknown as {
      __cadDebug: { scadgen: P3Debug };
      __scadgen: {
        phase3: {
          audit: () => P3Audit;
          geometry: () => P3Geometry;
          projectJson: () => string;
        };
      };
    };
    const g = w.__cadDebug.scadgen;
    const text = g.saveProject();
    const before = {
      project: w.__scadgen.phase3.projectJson(),
      digest: w.__scadgen.phase3.geometry().digest,
      audit: w.__scadgen.phase3.audit(),
    };
    g.loadProject(text);
    const report = await g.idle();
    return {
      before,
      after: {
        project: w.__scadgen.phase3.projectJson(),
        digest: w.__scadgen.phase3.geometry().digest,
        audit: w.__scadgen.phase3.audit(),
      },
      failures: Object.entries(report).filter(([, r]) => r.status !== "OK"),
    };
  });

  expect(restored.after.project).toBe(restored.before.project);
  expect(restored.after.digest).toBe(restored.before.digest);
  expect(restored.after.audit).toEqual(restored.before.audit);
  expect(restored.failures).toEqual([]);
  expect(built.audit.ok).toBe(true);
});

test("H5/H6: STL and STEP round-trips preserve bbox and body ownership", async ({
  page,
}) => {
  await loadAppReady(page);
  const built = await buildPart(page);
  const stl = await page.evaluate(async (baseFid) => {
    const w = window as unknown as {
      __cadDebug: { scadgen: P3Debug };
      __scadgen: { phase3: { geometry: () => P3Geometry } };
    };
    const g = w.__cadDebug.scadgen;
    const before = w.__scadgen.phase3.geometry();
    const bytes = await g.exportBodyStl(baseFid);
    const source = before.bodies.find((b) => b.featureId === baseFid);
    const inserted = g.insertStl(Array.from(bytes));
    const report = await g.idle();
    const after = w.__scadgen.phase3.geometry();
    return {
      bytes: bytes.length,
      inserted,
      status: report[inserted]?.status,
      detail: report[inserted]?.detail,
      sourceBbox: source?.bbox ?? null,
      insertedBody: after.bodies.find(
        (b) =>
          b.featureId === inserted || b.featureId.startsWith(`${inserted}#`),
      ),
    };
  }, built.ids.base!);
  expect(stl.bytes).toBeGreaterThan(84);
  expect(stl.status, stl.detail).toBe("OK");
  expect(stl.insertedBody).toBeTruthy();
  expect(stl.insertedBody!.vertices).toBeGreaterThan(0);
  const size = (box: number[] | null) =>
    box ? [box[3]! - box[0]!, box[4]! - box[1]!, box[5]! - box[2]!] : null;
  const sourceSize = size(stl.sourceBbox);
  const importedSize = size(stl.insertedBody!.bbox);
  expect(importedSize).not.toBeNull();
  for (let i = 0; i < 3; i++)
    expect(importedSize![i]!).toBeCloseTo(sourceSize![i]!, 2);

  const step = await page.evaluate(async (baseFid) => {
    const w = window as unknown as {
      __cadDebug: { scadgen: P3Debug };
      __scadgen: { phase3: { geometry: () => P3Geometry } };
    };
    const g = w.__cadDebug.scadgen;
    const before = w.__scadgen.phase3.geometry();
    const source = before.bodies.find((b) => b.featureId === baseFid);
    const bytes = await g.exportBodyStep(baseFid);
    const inserted = g.insertStep(Array.from(bytes));
    const report = await g.idle();
    const after = w.__scadgen.phase3.geometry();
    const rec = g.featureParam(inserted, "recognition");
    return {
      bytes: bytes.length,
      inserted,
      status: report[inserted]?.status,
      detail: report[inserted]?.detail,
      source: source
        ? {
            bbox: source.bbox,
            faces: source.faces,
            edges: source.edges,
            volumeMM3: source.volumeMM3,
          }
        : null,
      newBodyIds: after.bodies
        .map((b) => b.featureId)
        .filter((id) => !before.bodies.some((b) => b.featureId === id)),
      sourceStillPresent: after.bodies.some((b) => b.featureId === baseFid),
      recognition: typeof rec?.value === "string" ? rec.value : null,
      body: after.bodies.find(
        (b) =>
          b.featureId === inserted || b.featureId.startsWith(`${inserted}#`),
      ),
    };
  }, built.ids.base!);
  expect(step.bytes).toBeGreaterThan(100);
  expect(step.status, step.detail).toBe("OK");
  expect(step.source).toBeTruthy();
  expect(step.body).toBeTruthy();
  expect(step.body!.vertices).toBeGreaterThan(0);

  // STEP is BREP: the imported solid keeps the source bbox, face/edge
  // topology and enclosed volume, and is owned by the insert feature rather
  // than merged into the body it came from.
  const sourceSizeStep = size(step.source!.bbox);
  const importedSizeStep = size(step.body!.bbox);
  for (let i = 0; i < 3; i++)
    expect(importedSizeStep![i]!).toBeCloseTo(sourceSizeStep![i]!, 2);
  expect(step.newBodyIds.length).toBeGreaterThan(0);
  for (const id of step.newBodyIds)
    expect(id === step.inserted || id.startsWith(`${step.inserted}#`)).toBe(
      true,
    );
  expect(step.sourceStillPresent).toBe(true);
  expect(step.body!.featureId).toBe(step.inserted);
  expect(step.body!.faces).toBe(step.source!.faces);
  expect(step.body!.edges).toBe(step.source!.edges);
  expect(step.body!.volumeMM3).not.toBeNull();
  expect(step.source!.volumeMM3).not.toBeNull();
  const volumeDrift = Math.abs(step.body!.volumeMM3! - step.source!.volumeMM3!);
  expect(volumeDrift / Math.max(step.source!.volumeMM3!, 1e-9)).toBeLessThan(
    0.02,
  );
  expect(step.recognition).toBeTruthy();
  expect(Object.keys(JSON.parse(step.recognition!)).length).toBeGreaterThan(0);
  expect(built.geometry.digest).toMatch(/^[0-9a-f]{16}$/);
});

test("H7: invalid features report named errors and no bodies", async ({
  page,
}) => {
  await loadAppReady(page);
  const result = await page.evaluate(async () => {
    const w = window as unknown as {
      __cadDebug: { scadgen: P3Debug };
      __scadgen: { phase3: { geometry: () => P3Geometry } };
    };
    const g = w.__cadDebug.scadgen;
    g.configureSync();
    const base = g.box(0.03, 0.03, 0.02);
    await g.idle();
    const bad = g.boss(base, { diameter: 0, height: 0.01 });
    const report = await g.idle();
    const geometry = w.__scadgen.phase3.geometry();
    return {
      status: report[bad]?.status,
      detail: report[bad]?.detail,
      hasBody: geometry.bodies.some(
        (b) => b.featureId === bad || b.featureId.startsWith(`${bad}#`),
      ),
    };
  });
  expect(result.status).toBe("ERROR");
  expect(result.detail ?? "").not.toBe("");
  expect(result.hasBody).toBe(false);

  // Beyond the zero-diameter boss: a degenerate sketch, a missing reference,
  // a boolean with no targets and a shell with no faces each name the cause
  // and publish no body.
  const named = await page.evaluate(async () => {
    const w = window as unknown as {
      __cadDebug: { scadgen: P3Debug };
      __scadgen: { phase3: { geometry: () => P3Geometry } };
    };
    const g = w.__cadDebug.scadgen;
    g.configureSync();
    const base = g.box(0.03, 0.03, 0.02);
    await g.idle();
    const cases = {
      degenerateSketch: g.box(0.02, 0.02, 0),
      missingReference: g.fillet(base, ["missing_edge_tag"], 0.001),
      booleanNoTargets: g.booleanUnion("missing_target", "missing_tool"),
      shellNoFaces: g.shell(base, "missing_face_tag", 0.001),
    };
    const report = await g.idle();
    const bodies = w.__scadgen.phase3.geometry().bodies.map((b) => b.featureId);
    return Object.fromEntries(
      Object.entries(cases).map(([name, fid]) => [
        name,
        {
          status: report[fid]?.status,
          detail: report[fid]?.detail,
          hasBody: bodies.some((b) => b === fid || b.startsWith(`${fid}#`)),
        },
      ]),
    );
  });
  for (const [name, failure] of Object.entries(named)) {
    expect(failure.status, `${name}: ${failure.detail ?? "no detail"}`).toBe(
      "ERROR",
    );
    expect(failure.detail ?? "", name).not.toBe("");
    expect(failure.hasBody, name).toBe(false);
  }
});

test("H4/H8: body part, material, visibility and export names survive reload", async ({
  page,
}) => {
  await loadAppReady(page);

  const built = await page.evaluate(async () => {
    const w = window as unknown as { __cadDebug: { scadgen: P3Debug } };
    const g = w.__cadDebug.scadgen;
    g.configureSync();
    const box = g.box(0.04, 0.04, 0.03);
    await g.idle();
    const split = g.split(box, [0.02, 0, 0], [1, 0, 0], "both");
    await g.idle();
    return { split, bodies: g.bodiesOf(split) };
  });
  expect(built.bodies).toHaveLength(2);

  const extraRow = () =>
    page
      .getByTestId("feature-tree-row")
      .filter({ hasText: "Split (body 2)" })
      .first();
  await expect(extraRow()).toBeVisible({ timeout: 15_000 });
  await extraRow().click();

  const panel = page.getByTestId("body-properties");
  await expect(panel).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept("Housing"));
  await panel.getByTestId("body-part-create").click();
  await expect(panel.getByTestId("body-part-name")).toHaveValue("Housing");
  await panel.getByTestId("body-material").selectOption("aluminum");
  const mass = await panel.getByTestId("body-mass").textContent();
  expect(mass).not.toBe("n/a");

  // Export names are derived from the shared part name, so repeated exports
  // are byte-for-byte deterministic (`scadgen_housing.stl`).
  const names: string[] = [];
  for (let i = 0; i < 2; i++) {
    const download = page.waitForEvent("download");
    await panel.getByTestId("body-export-stl").click();
    names.push((await download).suggestedFilename());
  }
  for (const name of names) expect(name).toMatch(/^scadgen_[a-z0-9_]+\.stl$/);
  expect(names[0]).toBe(names[1]);

  await panel.getByTestId("body-hide").click();
  await expect(panel.getByTestId("body-visible")).toHaveText("No");

  // Body appearance rides on the feature node and must round-trip too.
  const appearance = { color: "#ff8800", opacity: 0.5 };
  await page.evaluate(
    ({ fid, ap }) => {
      const w = window as unknown as { __cadDebug: { scadgen: P3Debug } };
      return w.__cadDebug.scadgen.setAppearance(fid, ap);
    },
    { fid: built.split, ap: appearance },
  );

  const reloaded = await page.evaluate(async () => {
    const w = window as unknown as { __cadDebug: { scadgen: P3Debug } };
    const g = w.__cadDebug.scadgen;
    g.loadProject(g.saveProject());
    const report = await g.idle();
    return {
      failures: Object.entries(report).filter(([, r]) => r.status !== "OK"),
    };
  });
  expect(reloaded.failures).toEqual([]);

  await expect(extraRow()).toBeVisible({ timeout: 15_000 });
  await extraRow().click();
  await expect(panel.getByTestId("body-visible")).toHaveText("No");
  await expect(panel.getByTestId("body-material")).toHaveValue("aluminum");
  await expect(panel.getByTestId("body-mass")).toHaveText(mass!);
  await expect(panel.getByTestId("body-part-name")).toHaveValue("Housing");
  expect(
    await page.evaluate((fid) => {
      const w = window as unknown as { __cadDebug: { scadgen: P3Debug } };
      return w.__cadDebug.scadgen.appearanceOf(fid);
    }, built.split),
  ).toEqual(appearance);

  // The deterministic name survives the reload too.
  const afterReload = page.waitForEvent("download");
  await panel.getByTestId("body-export-stl").click();
  expect((await afterReload).suggestedFilename()).toBe(names[0]);
});
