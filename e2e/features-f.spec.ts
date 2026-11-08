import { expect, test, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

// Macro rebuilds run the real OCC kernel (sometimes several per edit), so the
// default 60 s test budget is not enough on a loaded machine.
test.describe.configure({ timeout: 180_000 });

interface FBody {
  fid: string;
  type: string;
  state: string;
  elementId: string | null;
  visible: boolean | null;
  faces: number;
  edges: number;
  bbox: number[] | null;
}

interface FDebug {
  configureSync: () => void;
  box: (w: number, h: number, d: number) => string;
  cylinder: (r: number, h: number) => string;
  idle: () => Promise<Record<string, { status: string; detail?: string }>>;
  tags: (fid: string) => { edges: number; faces: number } | null;
  geom: (fid: string) => {
    edges: number;
    faces: number;
    vertices: number;
  } | null;
  authoredIds: () => string[];
  describeScene: () => { bodies: FBody[] };
  states: () => Record<string, { featureStatus: string }>;
  etags: (fid: string) => string[] | null;
  modBox: (fid: string, depth: number) => string;
  measEdge: (fid: string) => Promise<number[] | null>;
  insertStl: (bytes: number[]) => string;
  recognition: (fid: string) => unknown;
  rib: (fid: string | null, opts?: Record<string, unknown>) => string;
  gusset: (fid: string | null, opts?: Record<string, unknown>) => string;
  web: (fid: string | null, opts?: Record<string, unknown>) => string;
  boss: (fid: string | null, opts?: Record<string, unknown>) => string;
  domeFeature: (fid: string | null, opts?: Record<string, unknown>) => string;
  coil: (fid: string | null, opts?: Record<string, unknown>) => string;
  helixCurve: (opts?: Record<string, unknown>) => string;
  fitSpline: (points: number[][], closed?: boolean) => string;
  bridgingCurve: (start: number[], end: number[]) => string;
  enclose: (fid: string, edgeTags: string[]) => string;
  emboss: (
    fid: string,
    polylines: number[][][],
    opts?: Record<string, unknown>,
  ) => string;
  derive: (opts: Record<string, unknown>) => string;
  bus: {
    run: (id: string, ...args: unknown[]) => unknown;
    has: (id: string) => boolean;
    log: Array<{ id: string; ok: boolean }>;
  };
}

const elementCount = (page: Page) =>
  page.evaluate(() => window.__cadDebug?.getElements().length ?? 0);

const bodyOf = (page: Page, fid: string) =>
  page.evaluate(
    (id) =>
      (
        window as unknown as {
          __cadDebug: { scadgen: FDebug };
        }
      ).__cadDebug.scadgen
        .describeScene()
        .bodies.find((b) => b.fid === id) ?? null,
    fid,
  );

const sizeOf = async (page: Page, fid: string): Promise<number[] | null> => {
  const b = await bodyOf(page, fid);
  return b?.bbox
    ? [
        b.bbox[3]! - b.bbox[0]!,
        b.bbox[4]! - b.bbox[1]!,
        b.bbox[5]! - b.bbox[2]!,
      ]
    : null;
};

const edgeSumOf = async (page: Page, fid: string): Promise<number> => {
  const lens = await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __cadDebug: { scadgen: FDebug };
        }
      ).__cadDebug.scadgen.measEdge(id),
    fid,
  );
  return (lens ?? []).reduce((sum, len) => sum + len, 0);
};

const facesOf = (page: Page, fid: string) =>
  page.evaluate(
    (id) =>
      (
        window as unknown as {
          __cadDebug: { scadgen: FDebug };
        }
      ).__cadDebug.scadgen.tags(id)?.faces ?? 0,
    fid,
  );

const edgesOf = (page: Page, fid: string) =>
  page.evaluate(
    (id) =>
      (
        window as unknown as {
          __cadDebug: { scadgen: FDebug };
        }
      ).__cadDebug.scadgen.tags(id)?.edges ?? 0,
    fid,
  );

const sceneOf = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __cadDebug: { scadgen: FDebug };
      }
    ).__cadDebug.scadgen.describeScene(),
  );

const reportsOf = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __cadDebug: { scadgen: FDebug };
      }
    ).__cadDebug.scadgen.idle(),
  );

const tabsOf = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("scadgen.documents.v1");
    if (!raw) return [] as Array<{ id: string; design: string }>;
    const map = JSON.parse(raw) as Record<
      string,
      { tabs: Array<{ id: string; design: string }> }
    >;
    return Object.values(map)[0]?.tabs ?? [];
  });

test("F1-F5: rib, gusset, web, boss and dome author bodies and merge", async ({
  page,
}) => {
  await loadAppReady(page);
  const ids = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.configureSync();
    const box = g.box(0.05, 0.04, 0.02);
    await g.idle();
    const base = g.tags(box)?.faces ?? 0;
    const rib = g.rib(box, {
      x1: 0.005,
      y1: 0.005,
      x2: 0.045,
      y2: 0.005,
      thickness: 0.004,
      depth: 0.02,
    });
    const ribSolo = g.rib(null, {
      x1: 0,
      y1: 0,
      x2: 0.03,
      y2: 0,
      thickness: 0.004,
      depth: 0.01,
      merge: false,
    });
    const gusset = g.gusset(null, { x2: 0.03, depth: 0.03, merge: false });
    const web = g.web(null, {
      x1: 0,
      y1: 0,
      x2: 0.04,
      y2: 0,
      merge: false,
    });
    const boss = g.boss(box, { diameter: 0.01, height: 0.008 });
    const dome = g.domeFeature(null, {
      radius: 0.02,
      height: 0.015,
      merge: false,
    });
    const rep = await g.idle();
    return {
      box,
      base,
      rib,
      ribSolo,
      gusset,
      web,
      boss,
      dome,
      statuses: Object.fromEntries(
        [rib, ribSolo, gusset, web, boss, dome].map((f) => [f, rep[f]?.status]),
      ),
      details: Object.fromEntries(
        [rib, ribSolo, gusset, web, boss, dome].map((f) => [f, rep[f]?.detail]),
      ),
      authored: g.authoredIds(),
      scene: g.describeScene().bodies,
    };
  });

  expect(ids.statuses[ids.rib]).toBe("OK");
  expect(ids.statuses[ids.ribSolo]).toBe("OK");
  expect(ids.statuses[ids.gusset]).toBe("OK");
  expect(ids.statuses[ids.web]).toBe("OK");
  expect(ids.statuses[ids.boss]).toBe("OK");
  expect(ids.statuses[ids.dome]).toBe("OK");

  // Every standalone body is authored into the scene (not just evaluated).
  for (const fid of [ids.ribSolo, ids.gusset, ids.web, ids.dome]) {
    const body = ids.scene.find((b) => b.fid === fid);
    expect(body, `scene body for ${fid}`).toBeTruthy();
    expect(body?.elementId, `element for ${fid}`).not.toBeNull();
    expect(body?.visible).not.toBe(false);
    expect(body?.faces ?? 0).toBeGreaterThan(0);
  }
  // Solid rib/web boxes and the gusset prism have at least their six walls;
  // the kernel may split coplanar caps, so only the lower bound is stable.
  expect(await facesOf(page, ids.ribSolo)).toBeGreaterThanOrEqual(6);
  expect(await facesOf(page, ids.gusset)).toBeGreaterThanOrEqual(5);
  expect(await facesOf(page, ids.web)).toBeGreaterThanOrEqual(6);
  expect(await facesOf(page, ids.dome)).toBeGreaterThan(2);

  // Merged rib and boss union into the box: more faces than the source.
  expect(await facesOf(page, ids.rib)).toBeGreaterThan(ids.base);
  expect(await facesOf(page, ids.boss)).toBeGreaterThan(ids.base);
  const boxBody = ids.scene.find((b) => b.fid === ids.box);
  expect(boxBody?.elementId).not.toBeNull();
});

test("F4/F8: coil, helix curve, fit/bridge curves, enclose and emboss", async ({
  page,
}) => {
  await loadAppReady(page);
  const ids = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.configureSync();
    const coil = g.coil(null, {
      radius: 0.01,
      wireRadius: 0.001,
      pitch: 0.004,
      turns: 2,
      merge: false,
    });
    const helix = g.helixCurve({ radius: 0.01, pitch: 0.002, turns: 2 });
    const spline = g.fitSpline(
      [
        [0, 0, 0],
        [0.01, 0, 0],
        [0.02, 0.01, 0],
      ],
      false,
    );
    const bridge = g.bridgingCurve([0, 0, 0], [0, 0.02, 0.01]);
    const box = g.box(0.02, 0.02, 0.01);
    await g.idle();
    const enclosing = g.enclose(box, (g.etags(box) ?? []).slice(0, 2));
    const cyl = g.cylinder(0.02, 0.05);
    await g.idle();
    const emboss = g.emboss(cyl, [
      [
        [0, 0.01],
        [0.02, 0.02],
        [0.04, 0.03],
      ],
    ]);
    const rep = await g.idle();
    return {
      coil,
      helix,
      spline,
      bridge,
      box,
      enclosing,
      emboss,
      statuses: Object.fromEntries(
        [coil, helix, spline, bridge, enclosing, emboss].map((f) => [
          f,
          rep[f]?.status,
        ]),
      ),
      details: Object.fromEntries(
        [coil, helix, spline, bridge, enclosing, emboss].map((f) => [
          f,
          rep[f]?.detail,
        ]),
      ),
      scene: g.describeScene().bodies,
    };
  });

  expect(ids.statuses[ids.coil]).toBe("OK");
  expect(ids.statuses[ids.helix]).toBe("OK");
  expect(ids.statuses[ids.spline]).toBe("OK");
  expect(ids.statuses[ids.bridge]).toBe("OK");
  expect(ids.statuses[ids.enclosing]).toBe("OK");
  expect(ids.statuses[ids.emboss]).toBe("OK");

  expect(await facesOf(page, ids.coil)).toBeGreaterThan(10);
  expect(await facesOf(page, ids.helix)).toBe(0);
  expect(await edgesOf(page, ids.helix)).toBeGreaterThan(20);
  expect(await edgesOf(page, ids.spline)).toBe(16);
  expect(await edgesOf(page, ids.bridge)).toBe(1);
  // A fill over a two-edge selection is an open surface (edges, no face); the
  // feature is still OK and authored. The error path for bad tags is covered
  // separately.
  expect(
    (await facesOf(page, ids.enclosing)) + (await edgesOf(page, ids.enclosing)),
  ).toBeGreaterThanOrEqual(1);
  expect(await edgesOf(page, ids.emboss)).toBeGreaterThanOrEqual(1);

  // Curves must be visible in the Browser/3D view, not only in the report.
  for (const fid of [
    ids.coil,
    ids.helix,
    ids.spline,
    ids.bridge,
    ids.enclosing,
  ]) {
    const body = ids.scene.find((b) => b.fid === fid);
    expect(body, `scene body for ${fid}`).toBeTruthy();
    expect(body?.elementId, `element for ${fid}`).not.toBeNull();
    expect(body?.visible).not.toBe(false);
  }
});

test("F: invalid parameters surface named errors instead of bodies", async ({
  page,
}) => {
  await loadAppReady(page);
  const r = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.configureSync();
    const box = g.box(0.04, 0.03, 0.02);
    await g.idle();
    const ribThin = g.rib(box, { thickness: 0 });
    const ribFlat = g.rib(null, { x1: 1, y1: 1, x2: 1, y2: 1 });
    const bossZero = g.boss(null, { diameter: 0 });
    const domeZero = g.domeFeature(null, { height: 0 });
    const coilPitch = g.coil(null, { pitch: 0 });
    const helixTurns = g.helixCurve({ turns: 0 });
    const splineOne = g.fitSpline([[0, 0, 0]]);
    const bridgeBad = g.bridgingCurve([0, 0] as number[], [1, 0, 0]);
    const encloseBad = g.enclose(box, ["nope_E0"]);
    const embossEmpty = g.emboss(box, []);
    const deriveBad = g.derive({ sourceTab: "missing_tab" });
    const rep = await g.idle();
    return Object.fromEntries(
      [
        ribThin,
        ribFlat,
        bossZero,
        domeZero,
        coilPitch,
        helixTurns,
        splineOne,
        bridgeBad,
        encloseBad,
        embossEmpty,
        deriveBad,
      ].map((f) => [f, rep[f]]),
    );
  });

  const failures = Object.entries(r) as Array<
    [string, { status?: string; detail?: string }]
  >;
  expect(failures.length).toBe(11);
  for (const [fid, report] of failures) {
    expect(report?.status, fid).toBe("ERROR");
    expect(report?.detail ?? "", fid).not.toBe("");
  }
  expect(failures[0]?.[1]?.detail).toMatch(/thickness/);
  expect(failures[1]?.[1]?.detail).toMatch(/zero length/);
  expect(failures[2]?.[1]?.detail).toMatch(/diameter/);
  expect(failures[3]?.[1]?.detail).toMatch(/height/);
  expect(failures[4]?.[1]?.detail).toMatch(/pitch/);
  expect(failures[5]?.[1]?.detail).toMatch(/revolutions/);
  expect(failures[6]?.[1]?.detail).toMatch(/two 3D points/);
  expect(failures[7]?.[1]?.detail).toMatch(/x,y,z/);
  expect(failures[8]?.[1]?.detail).not.toBe("");
  expect(failures[9]?.[1]?.detail).toMatch(/polylines/);
  expect(failures[10]?.[1]?.detail).toMatch(/not found/);
});

test("F6: derive resolves a second Part Studio and follows its edits", async ({
  page,
}) => {
  await loadAppReady(page);

  const first = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.configureSync();
    const box = g.box(0.02, 0.02, 0.02);
    await g.idle();
    return box;
  });
  await expect.poll(() => elementCount(page)).toBe(1);

  // Create the source tab through the real tab UI.
  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-partstudio").click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect.poll(() => elementCount(page)).toBe(0);

  const sourceBox = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    const box = g.box(0.05, 0.02, 0.02);
    await g.idle();
    return box;
  });
  await expect.poll(() => elementCount(page)).toBe(1);

  await expect.poll(async () => (await tabsOf(page)).length).toBe(2);

  // Switching back captures the source tab's design into the document, which
  // is what the derive resolver reads on every rebuild.
  await page.getByRole("tab").first().click();
  await expect.poll(() => elementCount(page)).toBe(1);
  await expect
    .poll(async () => ((await tabsOf(page))[1]?.design ?? "").length)
    .toBeGreaterThan(50);
  const tabs = await tabsOf(page);

  const derived = await page.evaluate(async (sourceTab) => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    const fid = g.derive({ sourceTab });
    const rep = await g.idle();
    return { fid, status: rep[fid]?.status, detail: rep[fid]?.detail };
  }, tabs[1]!.id);
  expect(derived.status).toBe("OK");
  expect(derived.detail).toBeUndefined();
  expect(await facesOf(page, derived.fid)).toBeGreaterThan(0);
  const before = await sizeOf(page, derived.fid);
  expect(before?.[2]).toBeCloseTo(0.02, 3);
  const derivedRow = page.locator(`[data-feature-id="${derived.fid}"]`).first();
  await expect(derivedRow).toBeVisible({ timeout: 15_000 });

  // Editing the source tab re-evaluates the derived body on the next rebuild.
  await page.getByRole("tab").nth(1).click();
  await expect.poll(() => elementCount(page)).toBe(1);
  await page.evaluate(async (fid) => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.modBox(fid, 0.06);
    await g.idle();
  }, sourceBox);
  await page.getByRole("tab").first().click();
  await expect
    .poll(async () => (await sizeOf(page, derived.fid))?.[2] ?? 0)
    .toBeCloseTo(0.06, 2);
  await expect
    .poll(async () => (await reportsOf(page))[derived.fid]?.status)
    .toBe("OK");
});

test("F7: import recognition is metadata and keeps the imported body", async ({
  page,
}) => {
  await loadAppReady(page);
  const r = await page.evaluate(
    async (bytes) => {
      const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
        .__cadDebug.scadgen;
      g.configureSync();
      const inserted = g.insertStl(bytes);
      const rep = await g.idle();
      const first = g.geom(inserted);
      const recognition = g.recognition(inserted);
      await g.idle();
      return {
        inserted,
        status: rep[inserted]?.status,
        detail: rep[inserted]?.detail,
        first,
        after: g.geom(inserted),
        recognition,
        authored: g.authoredIds(),
      };
    },
    Array.from(cubeStlBytes(0.01)),
  );

  expect(r.status).toBe("OK");
  expect(r.first?.faces ?? 0).toBeGreaterThan(0);
  expect(r.after).toEqual(r.first);
  expect(r.authored.some((a) => a.startsWith(`${r.inserted}->`))).toBe(true);
  // Authoring happens on the render that follows the rebuild.
  await expect.poll(() => elementCount(page)).toBeGreaterThanOrEqual(1);

  const rec = r.recognition as {
    shape: string;
    dimensions: number[];
    confidence: number;
    faces: number;
  } | null;
  expect(rec).not.toBeNull();
  expect(["box", "cylinder", "mesh"]).toContain(rec?.shape);
  expect(rec?.dimensions).toHaveLength(3);
  expect(rec?.dimensions.some((d) => d > 0)).toBe(true);
  expect(rec?.confidence).toBeGreaterThan(0);
  expect(rec?.faces).toBeGreaterThan(0);
}); /** Open the feature dialog, commit one param, and wait for the rebuild. */
async function editMacro(
  page: Page,
  fid: string,
  label: string | RegExp,
  value: string,
): Promise<void> {
  const row = page.locator(`[data-feature-id="${fid}"]`).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Edit Feature", exact: true })
    .click();
  const dialog = page.getByTestId("feature-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(label).fill(value);
  // Apply commits the draft and rebuilds; the preview rebuild is only a visual
  // aid and can still be in flight here.
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await reportsOf(page))[fid]?.status, {
      timeout: 45_000,
    })
    .toBe("OK");
  // Reopen: the committed value is what the tree now stores (not a preview).
  await row.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Edit Feature", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(label)).toHaveValue(value);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
}

test("F2: web dialog commits a thickness change", async ({ page }) => {
  await loadAppReady(page);
  const fid = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.configureSync();
    const id = g.web(null, { merge: false });
    await g.idle();
    return id;
  });
  const before = await edgeSumOf(page, fid);
  await editMacro(page, fid, "Thickness", "0.012");
  await expect
    .poll(() => edgeSumOf(page, fid), { timeout: 45_000 })
    .toBeGreaterThan(before);
  await expect.poll(() => sizeOf(page, fid)).not.toBeNull();
});

test("F3: boss dialog commits a diameter change", async ({ page }) => {
  await loadAppReady(page);
  const fid = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.configureSync();
    const id = g.boss(null, { merge: false });
    await g.idle();
    return id;
  });
  const before = await edgeSumOf(page, fid);
  await editMacro(page, fid, "Diameter", "0.02");
  await expect
    .poll(() => edgeSumOf(page, fid), { timeout: 45_000 })
    .toBeGreaterThan(before);
});

test("F5: dome dialog commits a height change", async ({ page }) => {
  await loadAppReady(page);
  const fid = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.configureSync();
    const id = g.domeFeature(null, { merge: false });
    await g.idle();
    return id;
  });
  const before = await edgeSumOf(page, fid);
  await editMacro(page, fid, "Height", "0.03");
  await expect
    .poll(() => edgeSumOf(page, fid), { timeout: 45_000 })
    .toBeGreaterThan(before);
});

test("F4: coil dialog commits a revolutions change", async ({ page }) => {
  await loadAppReady(page);
  const fid = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.configureSync();
    const id = g.coil(null, { merge: false, turns: 1, pitch: 0.004 });
    await g.idle();
    return id;
  });
  // Face count is a cheap synchronous signal: one more revolution adds a whole
  // band of sweep faces without another kernel measurement per edge.
  const before = await facesOf(page, fid);
  await editMacro(page, fid, /Revolutions/, "2");
  await expect
    .poll(() => facesOf(page, fid), { timeout: 45_000 })
    .toBeGreaterThan(before);
});

test("F8: menu ids answer on the action bus without placeholders", async ({
  page,
}) => {
  await loadAppReady(page);
  const r = await page.evaluate(async () => {
    const g = (window as unknown as { __cadDebug: { scadgen: FDebug } })
      .__cadDebug.scadgen;
    g.configureSync();
    const expected = [
      "rib",
      "gusset",
      "web",
      "boss",
      "emboss",
      "coil",
      "dome-feature",
      "helix-curve",
      "derive",
      "fit-spline",
      "bridging-curve",
      "enclose",
    ];
    const missing = expected.filter((id) => !g.bus.has(id));
    const box = g.box(0.04, 0.03, 0.02);
    await g.idle();
    const rib = g.bus.run("rib", box, {
      x1: 0.005,
      y1: 0.005,
      x2: 0.035,
      y2: 0.005,
      thickness: 0.004,
      depth: 0.02,
    }) as string;
    const coil = g.bus.run("coil", null, {
      turns: 1,
      pitch: 0.004,
      radius: 0.01,
    }) as string;
    const rep = await g.idle();
    return {
      missing,
      rib,
      coil,
      ribStatus: rep[rib]?.status,
      coilStatus: rep[coil]?.status,
      logged: g.bus.log.filter((e) => e.id === "rib" || e.id === "coil"),
    };
  });

  expect(r.missing).toEqual([]);
  expect(r.ribStatus).toBe("OK");
  expect(r.coilStatus).toBe("OK");
  expect(r.logged.length).toBeGreaterThanOrEqual(2);
  expect(r.logged.every((e) => e.ok)).toBe(true);
});

/** Synthetic binary STL cube, metres (copied from step-import.spec). */
function cubeStlBytes(half: number): Uint8Array {
  const v = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ].map(
    (p3) =>
      [p3[0]! * half, p3[1]! * half, p3[2]! * half] as [number, number, number],
  );
  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [2, 3, 7],
    [2, 7, 6],
    [1, 5, 6],
    [1, 6, 2],
    [0, 4, 7],
    [0, 7, 3],
  ];
  const buf = new ArrayBuffer(84 + faces.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, faces.length, true);
  let o = 84;
  for (const f of faces) {
    const [a, b, c] = f.map((i) => v[i]!) as [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
    const u: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n: [number, number, number] = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ];
    dv.setFloat32(o, n[0], true);
    dv.setFloat32(o + 4, n[1], true);
    dv.setFloat32(o + 8, n[2], true);
    o += 12;
    for (const idx of [a, b, c]) {
      dv.setFloat32(o, idx[0], true);
      dv.setFloat32(o + 4, idx[1], true);
      dv.setFloat32(o + 8, idx[2], true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(buf);
}
