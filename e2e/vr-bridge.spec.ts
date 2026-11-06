import { test, expect } from "@playwright/test";
import {
  installFakeXR,
  watchVRErrors,
  bootIntoVR,
  vr,
  shot,
  expectCleanVR,
} from "./vr-harness";
import { FEATURE_MAP } from "../src/model/featureMap";

const LEGACY_KEYS = new Set([
  "newSketch",
  "extrude",
  "loft",
  "sweep",
  "revolve",
  "fillet",
  "shell",
]);
const BELT_TOTAL =
  8 +
  new Set(
    FEATURE_MAP.filter(
      (e) => e.status === "implemented" && !LEGACY_KEYS.has(e.featureType),
    ).map((e) => e.featureType),
  ).size;

// Headless VR bridge: runs the real WebXR entry path (VRButton -> enterVR ->
// renderer.xr.setSession) against the fake XR device in vr-fake-xr.js.
// The canvas shows the in-VR view, so screenshots = headset screenshots.

test("enter VR headless and render the room", async ({ page }) => {
  const errors = watchVRErrors(page);
  await installFakeXR(page);
  await bootIntoVR(page);

  const info = await vr(page, "info");
  expect(info.active).toBeTruthy();
  expect(info.fb).not.toBeNull();

  await shot(page, "vr-room");
  await expectCleanVR(errors);
});

test("look down reveals the tool belt, trigger selects a tool", async ({
  page,
}) => {
  const errors = watchVRErrors(page);
  await installFakeXR(page);
  await bootIntoVR(page);

  await vr(page, "lookDown");
  await vr(page, "frame", [10]);
  await shot(page, "vr-belt-lookdown");

  // Belt selection (current code): left-hand grip hovers segment by angle,
  // L3 (buttons[2]/[3]) selects. Actions: legacy order pinned first —
  // Sketch, Extrude, Loft, Sweep, Revolve, Fillet, Shell, Measure -> index 7
  // maps setMode("measure"). Belt now carries every implemented feature type.
  await vr(page, "beltSeg", [7, BELT_TOTAL]);
  await vr(page, "frame", [6]);
  await shot(page, "vr-belt-hover");

  await vr(page, "press", ["left", 2]);
  await vr(page, "frame", [4]);
  await vr(page, "press", ["left", 2, false]);
  await vr(page, "frame", [8]);
  await shot(page, "vr-belt-selected");

  const mode = await vr(page, "mode");
  console.log("mode after belt L3:", mode);

  await expectCleanVR(errors);
  expect(mode).toBe("measure");
});

test("trigger click without hover does not crash", async ({ page }) => {
  const errors = watchVRErrors(page);
  await installFakeXR(page);
  await bootIntoVR(page);

  await vr(page, "press", ["right", 0]);
  await vr(page, "frame", [4]);
  await vr(page, "press", ["right", 0, false]);
  await vr(page, "press", ["left", 1]);
  await vr(page, "frame", [4]);
  await vr(page, "press", ["left", 1, false]);
  await vr(page, "frame", [4]);
  await shot(page, "vr-press-idle");

  await expectCleanVR(errors);
});

test("beam hit on a model face resolves to its persistent FID tag", async ({
  page,
}) => {
  const errors = watchVRErrors(page);
  await installFakeXR(page);
  await bootIntoVR(page);

  const built = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) return null;
    g.configureSync();
    const fid = g.box(0.1, 0.1, 0.1);
    await g.idle();
    const dirs = g.faceDirs ? g.faceDirs(fid) : null;
    return { fid, dirs };
  });
  expect(built, "scadgen hooks available").not.toBeNull();
  const { fid, dirs } = built!;
  expect(dirs?.length, "box exposes face dirs").toBeGreaterThan(0);

  // Aim at the TOP face — the bottom sits on the floor plane, which would
  // intercept a beam coming from below.
  const face = dirs!.find((f: { normal: { y: number } }) => f.normal.y > 0.9)!;
  expect(face, "box has an up-facing face").toBeTruthy();
  const el = (
    await page.evaluate(() => window.__cadDebug?.getElements() ?? [])
  )[0]!;
  const off = el.position;
  const center: [number, number, number] = [
    face.center.x + off[0],
    face.center.y + off[1],
    face.center.z + off[2],
  ];
  // Aim close: at 0.5 m the pose quantization drifts > the 3 mm vertex
  // threshold and lands on a corner; 5 cm keeps sub-degree error under 1 mm.
  const origin: [number, number, number] = [
    center[0] + face.normal.x * 0.05,
    center[1] + face.normal.y * 0.05,
    center[2] + face.normal.z * 0.05,
  ];
  // The visualizer mounts meshes asynchronously after the executor settles —
  // wait until the scene actually carries a tagged body before aiming.
  const tagged = await page.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
      const d = window.__vrMechanics?.debugRaycast?.();
      if (d && d.tagged.length > 0) return d.tagged;
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  });
  expect(tagged.length, "VR scene mounts tagged body meshes").toBeGreaterThan(
    0,
  );
  await vr(page, "pointAt", ["right", center, origin]);
  await vr(page, "frame", [4]);

  const hit = await vr(page, "hoverBeam");
  expect(hit, "beam hits the aimed face").not.toBeNull();
  expect(hit.kind).toBe("face");
  expect(hit.featureId).toBe(fid);
  expect(hit.faceTag).toBe(face.tag);

  const tags: string[] = await page.evaluate(
    (id) => window.__cadDebug?.scadgen?.ftags(id) ?? [],
    fid,
  );
  expect(tags).toContain(hit.faceTag);

  const sel = await vr(page, "selectBeam");
  expect(sel?.faceTag).toBe(face.tag);
  await shot(page, "vr-beam-face-tag");
  await expectCleanVR(errors);
});
