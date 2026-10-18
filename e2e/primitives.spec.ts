import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("primitives build real bodies through the OCC worker", async ({
  page,
}) => {
  page.on("console", (m) => console.log("PAGE:", m.text()));
  await loadAppReady(page);
  const result = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) return { error: "no scadgen hook" } as never;
    g.configureSync();
    const box = g.box(0.05, 0.04, 0.03);
    const cyl = g.cylinder(0.02, 0.08);
    const sph = g.sphere(0.025);
    const tor = g.torus(0.05, 0.015);
    const mir = g.mirror(box, "Y");
    await g.idle();
    for (let i = 0; i < 60; i++) {
      if ((window.__cadDebug?.getElements().length ?? 0) >= 5) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const st = g.states();
    return {
      solids: {
        box: st[box]?.featureStatus,
        cyl: st[cyl]?.featureStatus,
        sph: st[sph]?.featureStatus,
        tor: st[tor]?.featureStatus,
        mir: st[mir]?.featureStatus,
      },
      profiles: {
        box: st[`${box}_sk`]?.featureStatus,
        cyl: st[`${cyl}_sk`]?.featureStatus,
        sph: st[`${sph}_sk`]?.featureStatus,
        tor: st[`${tor}_sk`]?.featureStatus,
      },
      geometry: {
        box: g.geom(box),
        cyl: g.geom(cyl),
        sph: g.geom(sph),
        tor: g.geom(tor),
        mir: g.geom(mir),
      },
      nElements: window.__cadDebug?.getElements().length ?? 0,
      ids: window.__cadDebug?.getElements().map((e) => e.nodeId) ?? [],
      authored: g.authoredIds(),
    };
  });
  console.log("PRIMS RESULT:", JSON.stringify(result, null, 1));
  if ("error" in result) throw new Error((result as { error: string }).error);
  for (const v of Object.values(result.solids)) expect(v).toBe("OK");
  for (const v of Object.values(result.profiles)) expect(v).toBe("OK");
  expect(result.geometry.box?.faces).toBeGreaterThanOrEqual(6);
  expect(result.geometry.cyl?.faces).toBeGreaterThanOrEqual(3);
  expect(result.geometry.sph?.faces).toBeGreaterThanOrEqual(1);
  expect(result.geometry.tor?.edges).toBeGreaterThanOrEqual(1);
  expect(result.geometry.mir?.faces).toBe(result.geometry.box?.faces);
  expect(result.nElements).toBeGreaterThanOrEqual(5);
});
