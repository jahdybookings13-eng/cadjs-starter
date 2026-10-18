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
  thicken: (fid: string, tag: string, t: number) => string;
  fillet: (fid: string, tags: string[], r: number, radii?: number[]) => string;
  modFillet: (fid: string, r?: number, tags?: string[]) => boolean;
  measEdge: (fid: string) => Promise<number[] | null>;
  authoredIds: () => string[];
  configureSync: () => void;
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
