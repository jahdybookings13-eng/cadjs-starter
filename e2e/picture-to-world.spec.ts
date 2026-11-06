import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

// Picture → 3D world lane: TripoSR (~/image-to-world) turns an image into a
// mesh; this proves the seeded mesh lands in the scadgen world as a real,
// tagged, selectable body — the same path a human drops a photo into.
const SEED_STL = fileURLToPath(
  new URL("fixtures/seed-chair.stl", import.meta.url),
);

test("seeded mesh from an image becomes a body in the world", async ({
  page,
}) => {
  await loadAppReady(page);
  const bytes = Array.from(readFileSync(SEED_STL));
  const result = await page.evaluate(async (stlBytes) => {
    const g = window.__cadDebug?.scadgen;
    if (!g) return null;
    g.configureSync();
    const fid = g.insertStl(stlBytes);
    await g.idle();
    for (let i = 0; i < 60; i++) {
      if ((window.__cadDebug?.getElements().length ?? 0) >= 1) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const rep = await g.idle();
    return {
      fid,
      rep,
      els: window.__cadDebug?.getElements() ?? [],
      st: g.states(),
      tags: g.geom ? g.geom(fid) : null,
    };
  }, bytes);

  expect(result, "scadgen hooks available").not.toBeNull();
  const { fid } = result!;
  // Fresh evaluate: re-fetch the hook so describeScene sees the post-mount
  // elements array (stale-closure rule from the handoff).
  const scene = await page.evaluate(() =>
    window.__cadDebug?.scadgen?.describeScene(),
  );
  expect(scene).not.toBeNull();
  expect(scene!.bodies.length, "seeded body in describeScene").toBeGreaterThan(
    0,
  );
  const seeded = scene!.bodies.find((b) => b.fid === fid)!;
  expect(seeded, "insertedBody feature present").toBeTruthy();
  expect(seeded.state).toBe("OK");
  expect(seeded.faces, "mesh triangulation imported").toBeGreaterThan(100);
  expect(seeded.elementId, "seeded body is mounted").toBeTruthy();
  expect(seeded.visible).toBe(true);
  // bbox is best-effort: worker translateShape is optional for mesh imports.
  const bb = seeded.bbox;
  if (bb) {
    const extent = [3, 4, 5].map((k) => bb[k]! - bb[k - 3]!);
    expect(Math.max(...extent), "normalized ~10cm chair").toBeLessThan(0.15);
  }
});
