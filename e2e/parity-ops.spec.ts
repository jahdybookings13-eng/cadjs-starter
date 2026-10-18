import { expect, test } from "@playwright/test";

interface ScadgenDbg {
  box: (w: number, h: number, d: number) => string;
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
  circPattern: (fid: string, count: number) => string;
  curvePattern: (
    fid: string,
    pts: [number, number, number][],
    count: number,
    align?: boolean,
  ) => string;
  tags: (fid: string) => { edges: number; faces: number } | null;
  etags: (fid: string) => string[] | null;
  delFace: (fid: string, tag: string) => string;
  fillet: (fid: string, tag: string, r: number) => string;
  modFillet: (fid: string, r?: number, tags?: string[]) => boolean;
  measEdge: (fid: string) => Promise<number[] | null>;
}

async function sg(page: import("@playwright/test").Page): Promise<ScadgenDbg> {
  return page.evaluate(
    () =>
      (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } }).__cadDebug
        .scadgen,
  );
}

test("shell, draft, hole, circular pattern run on the real kernel", async ({
  page,
}) => {
  test.setTimeout(180_000);
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
    return { status: st[cf]?.status, detail: st[cf]?.detail, out: s.tags(cf) };
  });
  expect(circRes.status).toBe("OK");
  expect(circRes.out?.faces).toBeGreaterThanOrEqual(6);

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

  const modRes = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const et = s.etags(boxFid) ?? [];
    const ff = s.fillet(boxFid, et[0] ?? "", 0.3);
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

  const impossibleFillet = await page.evaluate(async () => {
    const s = (window as unknown as { __cadDebug: { scadgen: ScadgenDbg } })
      .__cadDebug.scadgen;
    const boxFid = s.box(2, 2, 1);
    await s.idle();
    const et = s.etags(boxFid) ?? [];
    const ff = s.fillet(boxFid, et[0] ?? "", 0.2);
    await s.idle();
    s.modFillet(ff, 5);
    const st = await s.idle();
    return { status: st[ff]?.status };
  });
  expect(impossibleFillet.status).toBe("ERROR");

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
