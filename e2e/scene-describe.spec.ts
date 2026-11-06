import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("describeScene gives an agent the whole world in one call", async ({
  page,
}) => {
  await loadAppReady(page);
  const desc = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) return null;
    g.configureSync();
    const box = g.box(0.05, 0.04, 0.03);
    const cyl = g.cylinder(0.02, 0.08);
    await g.idle();
    return { box, cyl, scene: (g as any).describeScene?.() ?? null };
  });
  expect(desc, "scadgen hooks available").not.toBeNull();
  const scene = desc!.scene;
  expect(scene, "describeScene exists").not.toBeNull();
  expect(scene.selection.kind).toBe("none");
  const ids = scene.bodies.map((b: { fid: string }) => b.fid);
  expect(ids).toContain(desc!.box);
  expect(ids).toContain(desc!.cyl);
  const boxBody = scene.bodies.find(
    (b: { fid: string }) => b.fid === desc!.box,
  );
  expect(boxBody.state).toBe("OK");
  // The OCC-wasm BREP stores faces at TRIANGLE granularity: a box is 12,
  // not 6 — FID_F{i} tags are per-triangle by design.
  expect(boxBody.faces).toBe(12);
  expect(boxBody.faceTags.length).toBe(12);
  expect(boxBody.faceTags[0]).toBe(`${desc!.box}_F0`);
  expect(boxBody.bbox).not.toBeNull();
  expect(boxBody.bbox.length).toBe(6);
  expect(Array.isArray(scene.camera)).toBe(true);
  expect(scene.camera.length).toBe(4);
});
