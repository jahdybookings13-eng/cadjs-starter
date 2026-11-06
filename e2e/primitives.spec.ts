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

    // ── legacy API (box / cylinder / sphere / torus / mirror) ─────────
    const box = g.box(0.05, 0.04, 0.03);
    const cyl = g.cylinder(0.02, 0.08);
    const sph = g.sphere(0.025);
    const tor = g.torus(0.05, 0.015);
    const mir = g.mirror(box, "Y");

    // ── new library API: all 8 shapes through buildShape ───────────────
    const pbox = g.primitive("box", { w: 0.06, h: 0.04, d: 0.03 });
    const pprism = g.primitive("prism", {
      points: [
        [-0.02, -0.02],
        [0.02, -0.02],
        [0.02, 0.02],
        [-0.02, 0.02],
      ],
      d: 0.05,
    });
    const ppyr = g.primitive("pyramid", { w: 0.05, h: 0.04 });
    const pwedge = g.primitive("wedge", { x: 0.06, y: 0.04, z: 0.05 });
    const pcyl = g.primitive("cylinder", { r: 0.02, h: 0.06 });
    const pcone = g.primitive("cone", { r: 0.03, h: 0.06 });
    const ptor = g.primitive("torus", { ringR: 0.05, tubeR: 0.015 });
    const ppipe = g.primitive("pipe", {
      r: 0.01,
      points: [
        [-0.05, 0, 0],
        [0, 0, 0.05],
        [0.05, 0, 0],
      ],
    });

    await g.idle();
    for (
      let i = 0;
      i < 120 && (window.__cadDebug?.getElements().length ?? 0) < 13;
      i++
    ) {
      await new Promise((r) => setTimeout(r, 100));
    }

    const st = g.states();
    const geom = (fid: string, sk: string) => ({
      faces: g.geom(fid)?.faces ?? 0,
      edges: g.geom(fid)?.edges ?? 0,
      profFaces: g.geom(sk)?.faces ?? 0,
    });

    return {
      solids: {
        box: st[box]?.featureStatus,
        cyl: st[cyl]?.featureStatus,
        sph: st[sph]?.featureStatus,
        tor: st[tor]?.featureStatus,
        mir: st[mir]?.featureStatus,
        pbox: st[pbox.featureId]?.featureStatus,
        pprism: st[pprism.featureId]?.featureStatus,
        ppyr: st[ppyr.featureId]?.featureStatus,
        pwedge: st[pwedge.featureId]?.featureStatus,
        pcyl: st[pcyl.featureId]?.featureStatus,
        pcone: st[pcone.featureId]?.featureStatus,
        ptor: st[ptor.featureId]?.featureStatus,
        ppipe: st[ppipe.featureId]?.featureStatus,
      },
      profiles: {
        box: st[`${box}_sk`]?.featureStatus,
        pbox: st[`${pbox.featureId}`]
          ? st[`${pbox.featureId}`]?.featureStatus
          : undefined,
        pprism: st[pprism.profileFeatureId]?.featureStatus,
        ppyr: st[ppyr.profileFeatureId]?.featureStatus,
        pwedge: st[pwedge.profileFeatureId]?.featureStatus,
        pcyl: st[pcyl.profileFeatureId]?.featureStatus,
        pcone: st[pcone.profileFeatureId]?.featureStatus,
        ptor: st[ptor.profileFeatureId]?.featureStatus,
        ppipe: st[ppipe.profileFeatureId]?.featureStatus,
      },
      geometry: {
        box: g.geom(box),
        cyl: g.geom(cyl),
        sph: g.geom(sph),
        tor: g.geom(tor),
        mir: g.geom(mir),
        pbox: geom(pbox.featureId, pbox.profileFeatureId),
        pprism: geom(pprism.featureId, pprism.profileFeatureId),
        ppyr: geom(ppyr.featureId, ppyr.profileFeatureId),
        pwedge: geom(pwedge.featureId, pwedge.profileFeatureId),
        pcyl: geom(pcyl.featureId, pcyl.profileFeatureId),
        pcone: geom(pcone.featureId, pcone.profileFeatureId),
        ptor: geom(ptor.featureId, ptor.profileFeatureId),
        ppipe: geom(ppipe.featureId, ppipe.profileFeatureId),
      },
      nElements: window.__cadDebug?.getElements().length ?? 0,
      ids: window.__cadDebug?.getElements().map((e) => e.nodeId) ?? [],
      authored: g.authoredIds(),
    };
  });
  console.log("PRIMS RESULT:", JSON.stringify(result, null, 1));
  if ("error" in result) throw new Error((result as { error: string }).error);

  // Legacy shapes
  expect(result.solids.box).toBe("OK");
  expect(result.solids.cyl).toBe("OK");
  expect(result.solids.sph).toBe("OK");
  expect(result.solids.tor).toBe("OK");
  expect(result.solids.mir).toBe("OK");

  // Library shapes (all 8)
  expect(result.solids.pbox).toBe("OK");
  expect(result.solids.pprism).toBe("OK");
  expect(result.solids.ppyr).toBe("OK");
  expect(result.solids.pwedge).toBe("OK");
  expect(result.solids.pcyl).toBe("OK");
  expect(result.solids.pcone).toBe("OK");
  expect(result.solids.ptor).toBe("OK");
  expect(result.solids.ppipe).toBe("OK");

  // Profiles
  expect(result.profiles.box).toBe("OK");
  expect(result.profiles.pbox).toBeTruthy();
  expect(result.profiles.pprism).toBe("OK");
  expect(result.profiles.ppyr).toBe("OK");
  expect(result.profiles.pwedge).toBe("OK");
  expect(result.profiles.pcyl).toBe("OK");
  expect(result.profiles.pcone).toBe("OK");
  expect(result.profiles.ptor).toBe("OK");
  expect(result.profiles.ppipe).toBe("OK");

  // Geometry sanity
  expect(result.geometry.box?.faces).toBeGreaterThanOrEqual(6);
  expect(result.geometry.cyl?.faces).toBeGreaterThanOrEqual(3);
  expect(result.geometry.sph?.faces).toBeGreaterThanOrEqual(1);
  expect(result.geometry.tor?.edges).toBeGreaterThanOrEqual(1);
  expect(result.geometry.mir?.faces).toBe(result.geometry.box?.faces);
  expect(result.geometry.pbox?.faces).toBeGreaterThanOrEqual(6);
  expect(result.geometry.pprism?.faces).toBeGreaterThanOrEqual(6);
  expect(result.geometry.ppyr?.faces).toBeGreaterThanOrEqual(5);
  expect(result.geometry.pwedge?.faces).toBeGreaterThanOrEqual(6);
  expect(result.geometry.pcyl?.faces).toBeGreaterThanOrEqual(3);
  expect(result.geometry.pcone?.faces).toBeGreaterThanOrEqual(2);
  expect(result.geometry.ptor?.edges).toBeGreaterThanOrEqual(1);
  expect(result.geometry.ppipe?.edges).toBeGreaterThanOrEqual(1);

  expect(result.nElements).toBeGreaterThanOrEqual(13);
});
