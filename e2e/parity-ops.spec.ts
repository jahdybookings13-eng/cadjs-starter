import { expect, test } from "@playwright/test";

interface ScadgenDbg {
  box: (
    w: number,
    h: number,
    d: number,
    opts?: { midplane?: boolean; opposite?: boolean },
  ) => string;
  ftags: (fid: string) => string[] | null;
  idle: () => Promise<Record<string, { status: string; detail?: string }>>;
  shell: (fid: string, tag: string, t: number) => string;
  draft: (
    fid: string,
    tags: string[],
    angleDeg: number,
    neutral: string,
  ) => string;
  faceDirs: (fid: string) => Array<{
    tag: string;
    center: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
  }> | null;
  hole: (
    fid: string,
    centers: [number, number, number][],
    r: number,
    d: number,
  ) => string;
  circPattern: (
    fid: string,
    count: number,
    extra?: string[],
    separate?: boolean,
  ) => string;
  bodiesOf: (fid: string) => string[];
  delBodies: (owners: string[]) => string;
  mirror: (src: string, axis: "X" | "Y" | "Z") => string;
  curvePattern: (
    fid: string,
    pts: [number, number, number][],
    count: number,
    align?: boolean,
  ) => string;
  tags: (fid: string) => { edges: number; faces: number } | null;
  etags: (fid: string) => string[] | null;
  tagMap: (fid: string) => Record<string, string> | null;
  resolveTag: (
    fid: string,
    oldTag: string,
    kind?: "face" | "edge",
  ) => string | null;
  modBox: (fid: string, d: number) => string;
  projectCurves: (
    srcFid: string,
    tgtFid: string,
    tags: string[],
    dir: [number, number, number],
  ) => string;
  ruledSurface: (fid: string, tagA: string, tagB: string) => string;
  fillSurface: (fid: string, faceTag: string) => string;
  offsetSurface: (fid: string, faceTag: string, d: number) => string;
  split: (
    fid: string,
    origin: [number, number, number],
    normal: [number, number, number],
    keep?: "positive" | "negative" | "both",
  ) => string;
  delFace: (fid: string, tag: string) => string;
  moveFace: (fid: string, tag: string, d: number) => string;
  setAppearance: (
    fid: string,
    ap: { color?: string; opacity?: number },
  ) => boolean;
  appearanceOf: (fid: string) => { color?: string; opacity?: number } | null;
  materialOf: (fid: string) => { color: string; opacity: number } | null;
  unfold: (sourceFid: string, foldFids: string[]) => string;
  hem: (
    fid: string,
    edgeTag: string,
    thickness?: number,
    lip?: number,
    relief?: number,
  ) => string;
  wrap: (fid: string, polylines: number[][][]) => string;
  flange: (
    fid: string,
    edgeTag: string,
    angleDeg: number,
    thickness?: number,
    relief?: number,
    radius?: number,
  ) => string;
  featurePattern: (
    srcFids: string[],
    axis: [number, number, number],
    spacing: number,
    count: number,
  ) => string;
  sketchOnDatum: (d: string, w: number, h: number, depth: number) => string;
  thread: (
    fid: string,
    size: string,
    kind?: "external" | "internal",
    standard?: "iso" | "unified" | "npt",
    mode?: "coarse" | "fine",
  ) => string;
  cylinder: (r: number, h: number) => string;
  createPlane: (
    origin: [number, number, number],
    normal: [number, number, number],
    size?: number,
  ) => string;
  curveOnFace: (
    srcFid: string,
    tgtFid: string,
    tags: string[],
    faceTag: string,
  ) => string;
  scale: (fid: string, f: number, origin?: [number, number, number]) => string;
  section: (
    fid: string,
    origin: [number, number, number],
    normal: [number, number, number],
  ) => string;
  thicken: (fid: string, tag: string, t: number) => string;
  fillet: (fid: string, tags: string[], r: number, radii?: number[]) => string;
  modFillet: (fid: string, r?: number, tags?: string[]) => boolean;
  measEdge: (fid: string) => Promise<number[] | null>;
  authoredIds: () => string[];
  configureSync: () => void;
  saveProject: () => string;
  loadProject: (text?: string) => number;
  bus: {
    run: (id: string, ...a: unknown[]) => unknown;
    ids: () => string[];
    has: (id: string) => boolean;
    log: Array<{ id: string; ok: boolean }>;
  };
}

async function boot(page: import("@playwright/test").Page): Promise<void> {
  test.setTimeout(120_000);
  await page.goto("/", { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      !!(
        window as unknown as {
          __cadDebug?: { scadgen?: object };
        }
      ).__cadDebug?.scadgen,
    undefined,
    { timeout: 30_000 },
  );
}

function sg(page: import("@playwright/test").Page): Promise<ScadgenDbg> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } }).__cadDebug
        .scadgen,
  );
}

test("shell and draft run on the real kernel", async ({ page }) => {
  await boot(page);
  const shellRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const ft = s.ftags(boxFid) ?? [];
    const sf = s.shell(boxFid, ft[0] ?? "", 0.2);
    const st = await s.idle();
    return {
      boxFid,
      faces: ft.length,
      sf,
      status: st[sf]?.status,
      detail: st[sf]?.detail,
      out: s.tags(sf),
    };
  });
  expect(shellRes.faces).toBeGreaterThanOrEqual(6);
  expect(shellRes.status).toBe("OK");
  expect(shellRes.out?.faces).toBeGreaterThanOrEqual(5);

  const draftRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const dirs = s.faceDirs(boxFid) ?? [];
    const bottom = dirs.reduce((a, b) => (b.normal.z < a.normal.z ? b : a));
    const sides = dirs
      .filter(
        (d) =>
          Math.abs(d.normal.z) < 0.5 &&
          Math.hypot(d.normal.x, d.normal.y) > 0.5,
      )
      .slice(0, 4)
      .map((d) => d.tag);
    const df = s.draft(boxFid, sides, 8, bottom.tag);
    const st = await s.idle();
    return { status: st[df]?.status, detail: st[df]?.detail, out: s.tags(df) };
  });
  expect(draftRes.status).toBe("OK");
  expect(draftRes.out?.faces).toBeGreaterThanOrEqual(6);
});

test("hole and circular/curve pattern run on the real kernel", async ({
  page,
}) => {
  await boot(page);
  const holeRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const hf = s.hole(boxFid, [[0, 0, 1]], 0.25, 0.1);
    const st = await s.idle();
    return { status: st[hf]?.status, detail: st[hf]?.detail, out: s.tags(hf) };
  });
  expect(holeRes.status).toBe("OK");
  expect(holeRes.out?.faces).toBeGreaterThan(6);

  const circRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const cf = s.circPattern(boxFid, 4);
    const st = await s.idle();
    const mir = s.mirror(boxFid, "X");
    await s.idle();
    const gf = s.circPattern(boxFid, 3, [mir]);
    const st2 = await s.idle();
    return {
      status: st[cf]?.status,
      detail: st[cf]?.detail,
      out: s.tags(cf),
      groupStatus: st2[gf]?.status,
      groupDetail: st2[gf]?.detail,
      groupOut: s.tags(gf),
      singleOut: st[cf]?.status === "OK" ? s.tags(cf) : null,
    };
  });
  expect(circRes.status).toBe("OK");
  expect(circRes.out?.faces).toBeGreaterThanOrEqual(6);
  expect(circRes.groupStatus).toBe("OK");
  expect((circRes.groupOut?.faces ?? 0) > (circRes.singleOut?.faces ?? 0)).toBe(
    true,
  );

  const curveRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const cf = s.curvePattern(
      boxFid,
      [
        [0, 0, 0],
        [8, 0, 0],
        [8, 8, 0],
      ],
      3,
      true,
    );
    const st = await s.idle();
    return { status: st[cf]?.status, detail: st[cf]?.detail, out: s.tags(cf) };
  });
  expect(curveRes.status).toBe("OK");
  expect(curveRes.out?.faces).toBeGreaterThanOrEqual(18);

  const badCurveRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const bf = s.curvePattern(boxFid, [[0, 0, 0]], 3);
    const st = await s.idle();
    return { status: st[bf]?.status, detail: st[bf]?.detail };
  });
  expect(badCurveRes.status).toBe("ERROR");
});

test("delete-face and split run on the real kernel", async ({ page }) => {
  await boot(page);
  const delRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const ft = s.ftags(boxFid) ?? [];
    const df = s.delFace(boxFid, ft[3] ?? "");
    const st = await s.idle();
    const badFid = s.delFace(boxFid, "no_such_tag");
    const st2 = await s.idle();
    return {
      status: st[df]?.status,
      detail: st[df]?.detail,
      out: s.tags(df),
      badStatus: st2[badFid]?.status,
    };
  });
  expect(delRes.status).toBe("OK");
  expect(delRes.out?.faces).toBeGreaterThanOrEqual(6);
  expect(delRes.badStatus).toBe("ERROR");

  const splitRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const sf = s.split(boxFid, [1, 0, 0], [1, 0, 0]);
    const sn = s.split(boxFid, [1, 0, 0], [1, 0, 0], "negative");
    const sb = s.split(boxFid, [1, 0, 0], [1, 0, 0], "both");
    const st = await s.idle();
    const badFid = s.split(boxFid, [3, 0, 0], [1, 0, 0]);
    const st2 = await s.idle();
    return {
      status: st[sf]?.status,
      detail: st[sf]?.detail,
      negStatus: st[sn]?.status,
      out: s.tags(sf),
      negOut: s.tags(sn),
      badStatus: st2[badFid]?.status,
      bothStatus: st2[sb]?.status,
      bothDetail: st2[sb]?.detail,
      bothBodies: s.bodiesOf(sb),
    };
  });
  expect(splitRes.status).toBe("OK");
  expect(splitRes.negStatus).toBe("OK");
  expect(splitRes.out?.faces).toBeGreaterThanOrEqual(6);
  expect(splitRes.negOut?.faces).toBeGreaterThanOrEqual(6);
  expect(splitRes.badStatus).toBe("ERROR");
  expect(splitRes.bothStatus).toBe("OK");
  expect(splitRes.bothBodies.length).toBe(2);
  expect(splitRes.bothBodies[1]?.endsWith("#1")).toBe(true);
});

test("project save/load round-trips the whole document", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const w = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const b = w.box(0.01, 0.01, 0.01);
    await w.idle();
    w.setAppearance(b, { opacity: 0.5 });
    const et = w.etags(b) ?? [];
    w.fillet(b, [et[0] ?? ""], 0.002);
    await w.idle();
    const snap = w.saveProject();
    const reloaded = w.loadProject(snap);
    const st = await w.idle();
    return {
      reloaded,
      box: st[b]?.status,
      kept: w.appearanceOf(b),
      len: snap.length,
    };
  });
  expect(r.reloaded).toBeGreaterThanOrEqual(3);
  expect(r.box).toBe("OK");
  expect((r.kept as { opacity?: number } | null)?.opacity).toBe(0.5);
  expect(r.len).toBeGreaterThan(500);
});

test("action bus is the single dispatcher for desk/VR/voice", async ({
  page,
}) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const w = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const idsOk =
      w.bus.has("fillet") && w.bus.has("thread") && w.bus.has("appearance");
    let threw = false;
    try {
      w.bus.run("undo");
    } catch {
      threw = true;
    }
    const fid = w.bus.run("createPlane", [0, 0, 1], [0, 0, 1]) as string;
    const st = await w.idle();
    return {
      idsOk,
      threw,
      plane: st[fid]?.status,
      logged: w.bus.log.filter((e) => e.id === "createPlane").at(-1)?.ok,
      n: w.bus.ids().length,
    };
  });
  expect(r.idsOk).toBe(true);
  expect(r.threw).toBe(true);
  expect(r.plane).toBe("OK");
  expect(r.logged).toBe(true);
  expect(r.n).toBeGreaterThan(30);
});

test("appearance is tree data: applies live and survives rebuild", async ({
  page,
}) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const w = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const b = w.box(0.01, 0.01, 0.01);
    await w.idle();
    const ok1 = w.setAppearance(b, { opacity: 0.4, color: "#ff3300" });
    await w.idle();
    const m1 = w.materialOf(b);
    w.modBox(b, 0.02);
    await w.idle();
    const m2 = w.materialOf(b);
    return {
      ok1,
      m1,
      m2,
      stored: w.appearanceOf(b),
    };
  });
  expect(r.ok1).toBe(true);
  expect(r.m1?.opacity).toBeCloseTo(0.4, 2);
  expect(r.m1?.color).toBe("#ff3300");
  expect(r.m2?.opacity).toBeCloseTo(0.4, 2);
  expect((r.stored as { opacity?: number })?.opacity).toBe(0.4);
});

test("rounded flange + flat pattern unfold produce the net", async ({
  page,
}) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const w = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const plate = w.box(0.02, 0.01, 0.002);
    await w.idle();
    const et = w.etags(plate) ?? [];
    const ft = w.flange(plate, et[0] ?? "", 90, 0.002, 0, 0.001);
    const st0 = await w.idle();
    const fl = w.unfold(plate, [ft]);
    const st = await w.idle();
    return {
      rounded: st0[ft]?.status,
      unfold: st[fl]?.status,
      detail: st[fl]?.detail,
      faces: w.tags(fl)?.faces ?? 0,
      edges: w.tags(fl)?.edges ?? 0,
    };
  });
  expect(r.rounded).toBe("OK");
  expect(r.unfold).toBe("OK");
  expect(r.faces).toBeGreaterThanOrEqual(6);
});

test("hem double-folds a sheet edge; wrap maps curves onto a cylinder", async ({
  page,
}) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const w = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const plate = w.box(0.02, 0.02, 0.002);
    const cyl = w.cylinder(0.005, 0.02);
    await w.idle();
    const et = w.etags(plate) ?? [];
    const hm = w.hem(plate, et[0] ?? "", 0.002, 0.008, 0.0008);
    const half = Math.PI * 0.005;
    const wr = w.wrap(cyl, [
      [
        [0, 0.004],
        [half, 0.008],
        [half * 2, 0.012],
      ],
    ]);
    const bad = w.hem(plate, "nope_E7", 0.002);
    const st = await w.idle();
    return {
      hem: st[hm]?.status,
      hemFaces: w.tags(hm)?.faces ?? 0,
      plateFaces: w.tags(plate)?.faces ?? 0,
      wrap: st[wr]?.status,
      wrapDetail: st[wr]?.detail,
      wrapEdges: w.tags(wr)?.edges ?? 0,
      bad: st[bad]?.status,
    };
  });
  expect(r.hem).toBe("OK");
  expect(r.hemFaces).toBeGreaterThan(r.plateFaces);
  expect(r.wrap).toBe("OK");
  expect(r.wrapEdges).toBeGreaterThanOrEqual(1);
  expect(r.bad).toBe("ERROR");
});

test("flange bends a sheet edge up into an L-bracket", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const w = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const plate = w.box(0.01, 0.01, 0.001);
    await w.idle();
    const et = w.etags(plate) ?? [];
    const fl = w.flange(plate, et[0] ?? "", 90, 0.001, 0.0004);
    const st = await w.idle();
    const bad = w.flange(plate, "nope_E7", 90, 0.001);
    const st2 = await w.idle();
    return {
      fl: st[fl]?.status,
      detail: st[fl]?.detail,
      faces: w.tags(fl)?.faces ?? 0,
      plateFaces: w.tags(plate)?.faces ?? 0,
      bad: st2[bad]?.status,
    };
  });
  expect(r.fl).toBe("OK");
  expect(r.faces).toBeGreaterThan(r.plateFaces);
  expect(r.bad).toBe("ERROR");
});

test("feature-pattern clones a sketch+extrude chain into bodies", async ({
  page,
}) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const w = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const b = w.box(0.002, 0.002, 0.001);
    await w.idle();
    const pat = w.featurePattern([`${b}_sk`, b], [1, 0, 0], 0.004, 3);
    const st = await w.idle();
    const bodies = w.bodiesOf(pat);
    return {
      pat: st[pat]?.status,
      n: bodies.length,
      faces: w.tags(pat)?.faces ?? 0,
    };
  });
  expect(r.pat).toBe("OK");
  expect(r.n).toBe(2);
  expect(r.faces).toBeGreaterThan(3);
});

test("sketch-on-datum places a pad on a datum plane", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const datum = s.createPlane([0.001, 0.001, 0.005], [0.3, 0.2, 1]);
    const pad = s.sketchOnDatum(datum, 0.002, 0.002, 0.001);
    const st = await s.idle();
    const w = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    return { pad: st[pad]?.status, faces: w.tags(pad)?.faces ?? 0 };
  });
  expect(r.pad).toBe("OK");
  expect(r.faces).toBeGreaterThan(3);
});

test("thread cuts real ISO grooves on a cylinder", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const cyl = s.cylinder(0.003, 0.012);
    await s.idle();
    const before = s.tags(cyl)?.faces ?? 0;
    const th = s.thread(cyl, "M6");
    const st = await s.idle();
    const after = s.tags(th)?.faces ?? 0;
    const bad = s.thread(cyl, "M99");
    const st3 = await s.idle();
    return {
      before,
      th: st[th]?.status,
      after,
      bad: st3[bad]?.status,
    };
  });
  expect(r.th).toBe("OK");
  expect(r.after).toBeGreaterThan(r.before);
  expect(r.bad).not.toBe("OK");
});

test("createPlane, curveOnFace, scale run on the real kernel", async ({
  page,
}) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const datum = s.createPlane([0, 0, 2], [0, 0, 1]);
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const et = s.etags(boxFid) ?? [];
    const ft = s.ftags(boxFid) ?? [];
    const cof = s.curveOnFace(
      boxFid,
      boxFid,
      [et[0] ?? "", et[1] ?? ""],
      ft[0] ?? "",
    );
    const sc = s.scale(boxFid, 2);
    const bad = s.curveOnFace(boxFid, boxFid, ["nope_E9"], ft[0] ?? "");
    const st = await s.idle();
    return {
      datum: st[datum]?.status,
      datumFaces: s.tags(datum)?.faces,
      cof: st[cof]?.status,
      cofDetail: st[cof]?.detail,
      cofEdges: s.tags(cof)?.edges,
      scale: st[sc]?.status,
      bad: st[bad]?.status,
    };
  });
  expect(r.datum).toBe("OK");
  expect(r.datumFaces).toBe(1);
  expect(r.cof).toBe("OK");
  expect(r.cofEdges).toBeGreaterThanOrEqual(1);
  expect(r.scale).toBe("OK");
  expect(r.bad).toBe("ERROR");
});

test("move-face trims and bosses planar faces", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const dirs = s.faceDirs(boxFid) ?? [];
    const top = dirs.reduce((a, b) => (b.center.z > a.center.z ? b : a));
    const cut = s.moveFace(boxFid, top.tag, -0.4);
    const st = await s.idle();
    const boxFid2 = s.box(2, 2, 1);
    await s.idle();
    const dirs2 = s.faceDirs(boxFid2) ?? [];
    const top2 = dirs2.reduce((a, b) => (b.center.z > a.center.z ? b : a));
    const boss = s.moveFace(boxFid2, top2.tag, 0.3);
    const st2 = await s.idle();
    const bad = s.moveFace(boxFid, "nope_F9", -0.1);
    const st3 = await s.idle();
    return {
      cut: st[cut]?.status,
      cutFaces: s.tags(cut)?.faces,
      boss: st2[boss]?.status,
      bad: st3[bad]?.status,
    };
  });
  expect(r.cut).toBe("OK");
  expect(r.cutFaces).toBeGreaterThanOrEqual(6);
  expect(r.boss).toBe("OK");
  expect(r.bad).toBe("ERROR");
});

test("ruled, fill, offset surfaces and projectCurves run on the real kernel", async ({
  page,
}) => {
  await boot(page);
  const thkRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const ft = s.ftags(boxFid) ?? [];
    const tf = s.thicken(boxFid, ft[0] ?? "", 0.5);
    const st = await s.idle();
    return { status: st[tf]?.status, detail: st[tf]?.detail, out: s.tags(tf) };
  });
  expect(thkRes.status).toBe("OK");
  expect(thkRes.out?.faces).toBeGreaterThanOrEqual(6);

  const secRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const sc = s.section(boxFid, [0, 0.5, 0.5], [0, 1, 0]);
    const st = await s.idle();
    const miss = s.section(boxFid, [0, 0, 50], [0, 0, 1]);
    const st2 = await s.idle();
    return {
      status: st[sc]?.status,
      detail: st[sc]?.detail,
      out: s.tags(sc),
      missStatus: st2[miss]?.status,
    };
  });
  expect(secRes.status).toBe("OK");
  expect(secRes.out?.faces).toBe(0);
  expect(secRes.out?.edges).toBeGreaterThanOrEqual(4);
  expect(secRes.missStatus).toBe("ERROR");

  const surfRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const et = s.etags(boxFid) ?? [];
    const ft = s.ftags(boxFid) ?? [];
    const ru = s.ruledSurface(boxFid, et[0] ?? "", et[1] ?? "");
    const fi = s.fillSurface(boxFid, ft[0] ?? "");
    const of = s.offsetSurface(boxFid, ft[0] ?? "", 0.5);
    const bad = s.ruledSurface(boxFid, "nope_1", "nope_2");
    const st = await s.idle();
    return {
      ruled: st[ru]?.status,
      ruledDetail: st[ru]?.detail,
      ruledFaces: s.tags(ru)?.faces,
      fill: st[fi]?.status,
      fillFaces: s.tags(fi)?.faces,
      offset: st[of]?.status,
      offsetFaces: s.tags(of)?.faces,
      bad: st[bad]?.status,
    };
  });
  expect(surfRes.ruled).toBe("OK");
  expect(surfRes.ruledFaces).toBeGreaterThanOrEqual(1);
  expect(surfRes.fill).toBe("OK");
  expect(surfRes.fillFaces).toBeGreaterThanOrEqual(1);
  expect(surfRes.offset).toBe("OK");
  expect(surfRes.offsetFaces).toBeGreaterThanOrEqual(1);
  expect(surfRes.bad).toBe("ERROR");

  const projRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const et = s.etags(boxFid) ?? [];
    const pf = s.projectCurves(boxFid, boxFid, et, [0, 0, -1]);
    const st = await s.idle();
    const bad = s.projectCurves(boxFid, boxFid, ["nope_E9"], [0, 0, -1]);
    const st2 = await s.idle();
    return {
      status: st[pf]?.status,
      detail: st[pf]?.detail,
      out: s.tags(pf),
      badStatus: st2[bad]?.status,
    };
  });
  expect(projRes.status).toBe("OK");
  expect(projRes.out?.faces).toBe(0);
  expect(projRes.out?.edges).toBeGreaterThanOrEqual(1);
  expect(projRes.badStatus).toBe("ERROR");
});

test("extrude honors midplane and oppositeDirection", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const dbg = (
      window as unknown as {
        __cadDebug: {
          scadgen: ScadgenDbg;
          getElements: () => {
            nodeId: string;
            position: [number, number, number];
          }[];
        };
      }
    ).__cadDebug;
    const s = dbg.scadgen;
    s.configureSync();
    const mid = s.box(2, 2, 1, { midplane: true });
    const opp = s.box(2, 2, 1, { opposite: true });
    const st = await s.idle();
    const els = () =>
      (
        window as unknown as {
          __cadDebug: {
            getElements: () => {
              nodeId: string;
              position: [number, number, number];
            }[];
          };
        }
      ).__cadDebug.getElements();
    for (let i = 0; i < 60; i++) {
      if (els().length >= 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const pos = els().map((e) => e.position[2]);
    const authored = dbg.scadgen.authoredIds();
    const zFor = (fid: string) => {
      const pair = authored.find((a) => a.startsWith(`${fid}->`));
      const nid = pair?.split("->")[1];
      return els().find((e) => e.nodeId === nid)?.position[2];
    };
    return {
      mid: st[mid]?.status,
      opp: st[opp]?.status,
      count: pos.length,
      zMid: zFor(mid),
      zOpp: zFor(opp),
    };
  });
  expect(r.mid).toBe("OK");
  expect(r.opp).toBe("OK");
  expect(r.count).toBe(2);
  // symmetric extrude sits on the profile plane; opposite grows downward
  expect(Math.abs(r.zMid ?? 99)).toBeLessThan(0.2);
  expect(r.zOpp ?? 99).toBeLessThan(-0.2);
});

test("face tags stay stable across a parameter rebuild", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const before = s.ftags(boxFid) ?? [];
    const map1 = s.tagMap(boxFid);
    // local bbox re-centering: faceDirs z is relative — the bottom cap is
    // the min-z face; it sits at world z=0 before AND after a depth edit.
    const dirs = s.faceDirs(boxFid) ?? [];
    const bottomTag = dirs.reduce((a, b) =>
      b.center.z < a.center.z ? b : a,
    ).tag;
    s.modBox(boxFid, 3);
    await s.idle();
    const after = s.ftags(boxFid) ?? [];
    const map2 = s.tagMap(boxFid);
    return {
      before: before.length,
      map1,
      after: after.length,
      map2,
      bottomStillResolves: bottomTag
        ? (s.resolveTag(boxFid, bottomTag) ?? bottomTag) === bottomTag &&
          after.includes(bottomTag)
        : false,
    };
  });
  expect(r.bottomStillResolves).toBe(true);
  expect(r.before).toBeGreaterThanOrEqual(6);
  expect(r.map1).toBeNull(); // first build: no predecessor
  expect(r.after).toBe(r.before);
  expect(r.map2).not.toBeNull();
  // growing the box along z leaves the profile-plane cap untouched -> >=1 stable tag
  expect(Object.keys(r.map2 ?? {}).length).toBeGreaterThanOrEqual(1);
});

test("separate pattern emits one body + element per instance", async ({
  page,
}) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const els = () =>
      (
        window as unknown as {
          __cadDebug: {
            getElements: () => { nodeId: string; visible?: boolean }[];
          };
        }
      ).__cadDebug.getElements();
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    s.configureSync();
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const pf = s.circPattern(boxFid, 4, [], true);
    const st = await s.idle();
    for (let i = 0; i < 60; i++) {
      if (els().length >= 5) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    const db = s.delBodies([`${pf}#1`, `${pf}#2`]);
    const st2 = await s.idle();
    await s.idle();
    return {
      status: st[pf]?.status,
      detail: st[pf]?.detail,
      bodies: s.bodiesOf(pf),
      elements: els().length,
      tag0: (s.etags(`${pf}#1`) ?? [""])[0],
      delStatus: st2[db]?.status,
      visible: els().filter((e) => e.visible !== false).length,
    };
  });
  expect(r.status).toBe("OK");
  expect(r.bodies.length).toBe(4);
  expect(r.elements).toBeGreaterThanOrEqual(5); // 1 box + 4 pattern bodies
  expect(r.tag0).toBe(`${r.bodies[1]}_E0`); // tags carry the body-qualified owner
  expect(r.delStatus).toBe("OK");
  expect(r.visible).toBe(3); // 5 elements minus 2 deleted bodies
});

test("modifyFillet re-specs radius on the real kernel", async ({ page }) => {
  await boot(page);
  const modRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const et = s.etags(boxFid) ?? [];
    const ff = s.fillet(boxFid, [et[0] ?? ""], 0.3);
    const before = await s.idle();
    const lenBefore = await s.measEdge(ff);
    const applied = s.modFillet(ff, 0.6);
    const after = await s.idle();
    const lenAfter = await s.measEdge(ff);
    return {
      statusBefore: before[ff]?.status,
      applied,
      statusAfter: after[ff]?.status,
      faces: s.tags(ff)?.faces,
      changed:
        !!lenBefore &&
        !!lenAfter &&
        lenBefore.length === lenAfter.length &&
        lenBefore.some((v, i) => Math.abs(v - (lenAfter[i] as number)) > 1e-4),
    };
  });
  expect(modRes.statusBefore).toBe("OK");
  expect(modRes.applied).toBe(true);
  expect(modRes.statusAfter).toBe("OK");
  expect(modRes.faces).toBeGreaterThanOrEqual(7);
  expect(modRes.changed).toBe(true);

  const varFillet = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const et = s.etags(boxFid) ?? [];
    const vf = s.fillet(boxFid, [et[0] ?? "", et[1] ?? ""], 0.3, [0.15, 0.4]);
    const st = await s.idle();
    return { status: st[vf]?.status, detail: st[vf]?.detail, out: s.tags(vf) };
  });
  expect(varFillet.status).toBe("OK");
  expect(varFillet.out?.faces).toBeGreaterThanOrEqual(8);

  const impossibleFillet = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const et = s.etags(boxFid) ?? [];
    const ff = s.fillet(boxFid, [et[0] ?? ""], 0.2);
    await s.idle();
    s.modFillet(ff, 5);
    const st = await s.idle();
    return { status: st[ff]?.status };
  });
  expect(impossibleFillet.status).toBe("ERROR");
});
