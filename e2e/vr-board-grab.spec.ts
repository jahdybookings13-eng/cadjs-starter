import { test, expect } from "@playwright/test";
import { installFakeXR, vr, shot } from "./vr-harness";

/**
 * End-to-end (real browser + real RAPIER WASM): a PCB board drops onto the
 * desk, the fake-VR RIGHT hand aims at it, a grip press GRABS it (kinematic
 * hand-follow via EcadPhysics), and a grip release DROPS it (dynamic, gravity).
 *
 * Point-of-truth notes (from vr-fake-xr.js):
 *  - `pointAt(side, target, origin)` places the hand's RAY at `origin` with a
 *    look direction through `target`; the GRIP space is offset from the ray
 *    origin by (0, -0.1, +0.15) with the same quaternion.
 *  - useVRSession's grab bridge casts the ray from the GRIP space (position &
 *    `(0,0,-1)` rotated by the grip quaternion) with maxDistance 0.5m.
 *  - So we aim with a target that makes the *grip ray* pass through the board.
 *  - `__scadgen.ecadPhysics` only exists after RAPIER.init() resolves AND the
 *    board's body was bound — that is our deterministic ready gate (no sleeps,
 *    no retry loops).
 */

const GRIP = 1; // GRIP_BUTTON_INDEX (useVRSession.ts)
const RIGHT = "right"; // the grab bridge grabs with the RIGHT hand

test("grab a PCB board in VR, hold it up, drop it back onto the desk", async ({
  page,
}) => {
  await installFakeXR(page); // init script must be installed before goto

  // Drive navigation + scene mount myself (NOT bootIntoVR — it re-gotos and
  // would clobber a pre-inserted board).
  await page.goto("/");
  await page.waitForFunction(
    () =>
      (window as unknown as { __scadgen?: unknown }).__scadgen !== undefined,
    undefined,
    { timeout: 30_000 },
  );

  // 1) Place a known PCB board high above the desk (y in mm — the ECAD unit);
  //    physics will drop it onto the desk top (~0.77 m) before we aim at it.
  const board = (await page.evaluate(() => {
    const bus = (
      window as unknown as {
        __ecad?: { bus?: { run(...a: unknown[]): unknown } };
      }
    ).__ecad?.bus;
    if (!bus) return null;
    return bus.run("ecad.insert", { part: "arduino-uno", x: 0, y: 900, z: 0 });
  })) as { id: string; part: string } | null;
  expect(
    board,
    "arduino-uno board inserted (__ecad.bus.run ecad.insert)",
  ).toBeTruthy();
  const boardId = board!.id;

  // Enter VR (fake XR: the "VR" button appears and the session starts).
  const btn = page.getByRole("button", { name: "VR", exact: true });
  await btn.click();
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __vr?: { sessionActive(): boolean } }
      ).__vr?.sessionActive?.() === true,
    undefined,
    { timeout: 20_000 },
  );
  await vr(page, "frame", [8]);

  // 2) Deterministic ready gate: the board must rest on the desk AND have a
  //    Rapier body — both happen only after RAPIER.init() + binding + settling.
  await page.waitForFunction(
    (id) => {
      const all = (
        window as unknown as {
          __scadgen?: {
            ecadPhysics?: { hasBody(id: string): boolean };
            ecadLayer?: {
              get(id: string): { position: { y: number } } | null;
            };
          };
        }
      ).__scadgen;
      return (
        all?.ecadPhysics?.hasBody(id) === true &&
        all?.ecadLayer?.get(id)?.position.y !== undefined &&
        (all?.ecadLayer?.get(id)?.position.y as number) < 0.8 // rested on desk
      );
    },
    boardId,
    { timeout: 30_000 },
  );
  await vr(page, "frame", [10]); // settle fully

  // 3) Read the board's world position (meters).
  const bp = (await page.evaluate((id: string) => {
    const pos = (
      window as unknown as {
        __scadgen?: {
          ecadLayer?: {
            get(id: string): {
              position: { x: number; y: number; z: number };
            } | null;
          };
        };
      }
    ).__scadgen?.ecadLayer?.get(id)?.position;
    return pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
  }, boardId)) as { x: number; y: number; z: number } | null;
  expect(bp, "board has a world position").toBeTruthy();

  // 4) Aim the RIGHT hand so the GRIP RAY passes through the board center.
  //    pointAt seats the grip at origin + (0, -0.1, +0.15) with the look
  //    quaternion; the bridge casts forward from the GRIP space toward the
  //    board (within the 0.5m reach).
  //    origin -> grip = bp + (0, 0.15, 0.40); lookDir = normalize(bp - grip).
  const gripDirLen = Math.hypot(0.15, 0.4);
  const dy = 0.15 / gripDirLen;
  const dz = 0.4 / gripDirLen;
  await vr(page, "pointAt", [
    RIGHT,
    [bp!.x, bp!.y + 0.25 - dy, bp!.z + 0.25 - dz], // origin + lookDir (k = 1)
    [bp!.x, bp!.y + 0.25, bp!.z + 0.25], // ray origin (grip lands at bp.y+0.15, bp.z+0.40)
  ]);
  await vr(page, "frame", [4]);

  // 5) GRIP (press) — the bridge raycasts from the grip; within 0.5m it hits
  //    the board; EcadPhysics.grab() makes it kinematic + hand-follow.
  const gripBefore = await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __scadgen?: { ecadPhysics?: { isGrabbed(id: string): boolean } };
        }
      ).__scadgen?.ecadPhysics?.isGrabbed(id) ?? false,
    boardId,
  );
  expect(gripBefore, "not grabbed before the grip press").toBe(false);

  await vr(page, "press", [RIGHT, GRIP, true]);
  await vr(page, "frame", [6]);

  const grabbed = await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __scadgen?: { ecadPhysics?: { isGrabbed(id: string): boolean } };
        }
      ).__scadgen?.ecadPhysics?.isGrabbed(id) === true,
    boardId,
  );
  if (!grabbed) {
    // Diagnostics — why didn't the grab fire? Reports whether the board mesh
    // is in the scene's tagged set (world position) and whether it has a body.
    const diag = await page.evaluate((id: string) => {
      const w = (
        window as unknown as {
          __scadgen?: {
            ecadLayer?: {
              get(id: string): {
                position: { x: number; y: number; z: number };
              } | null;
            };
            ecadPhysics?: { hasBody(id: string): boolean };
          };
          __vrMechanics?: {
            debugRaycast?: () => { tagged?: { id: string }[] } | null;
          };
        }
      ).__scadgen;
      let tagged: { id: string } | null | undefined = null;
      try {
        tagged = (
          window as unknown as {
            __vrMechanics?: {
              debugRaycast?: () => { tagged?: { id: string }[] } | null;
            };
          }
        ).__vrMechanics
          ?.debugRaycast?.()
          ?.tagged?.find((t) => t.id === id);
      } catch {
        tagged = undefined;
      }
      const p = w?.ecadLayer?.get(id)?.position;
      return { pos: p, hasBody: w?.ecadPhysics?.hasBody(id), tagged };
    }, boardId);
    console.error("GRAB FAILED — diagnostics:", JSON.stringify(diag));
  }
  expect(
    grabbed,
    "gripping the board makes it a kinematic hand-followed body",
  ).toBe(true);

  // 5b) The held-board circuit card is up, and it is THIS board.
  const pip = (await page.evaluate(() => {
    const p = (
      window as unknown as {
        __scadgen?: {
          circuitPip?: {
            isVisible(): boolean;
            snapshot(): { instId: string; title: string } | null;
          };
        };
      }
    ).__scadgen?.circuitPip;
    return { visible: p?.isVisible() ?? false, snap: p?.snapshot() ?? null };
  })) as { visible: boolean; snap: { instId: string; title: string } | null };
  expect(pip.visible, "circuit card appears while a board is held").toBe(true);
  expect(pip.snap?.instId, "card describes the held board").toBe(boardId);
  expect(pip.snap?.title, "card names the held board").toBeTruthy();

  // 6) LIFT: raise the hand straight up over the desk; the board follows the
  //    grip (setBodyPosition). Keep x/z over the DESK (z within ±0.4 depth) so
  //    the release below lands back on the desk rather than off the edge.
  await vr(page, "pointAt", [
    RIGHT,
    [bp!.x, bp!.y, bp!.z], // aim at the desk (target irrelevant once held)
    [bp!.x, bp!.y + 0.55, bp!.z], // ray origin directly above the desk
  ]);
  await vr(page, "frame", [8]);
  const lifted = await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __scadgen?: {
            ecadLayer?: {
              get(id: string): { position: { y: number } } | null;
            };
          };
        }
      ).__scadgen?.ecadLayer?.get(id)?.position?.y ?? 0,
    boardId,
  );
  expect(lifted, `board followed the grip up (y=${lifted})`).toBeGreaterThan(
    0.95,
  );
  await shot(page, "vr-board-grabbed");

  // 7) RELEASE — dynamic again; gravity pulls it back to the desk.
  await vr(page, "press", [RIGHT, GRIP, false]);
  await vr(page, "frame", [30]); // settle

  const after = await page.evaluate((id) => {
    const all = (
      window as unknown as {
        __scadgen?: {
          ecadPhysics?: { isGrabbed(id: string): boolean };
          ecadLayer?: {
            get(id: string): { position: { y: number } } | null;
          };
        };
      }
    ).__scadgen;
    return {
      grabbed: all?.ecadPhysics?.isGrabbed(id) === true,
      y: all?.ecadLayer?.get(id)?.position?.y ?? 0,
    };
  }, boardId);
  expect(after.grabbed, "releasing the grip drops the board (dynamic)").toBe(
    false,
  );
  expect(
    after.y,
    `board fell back down toward the desk (y=${after.y})`,
  ).toBeLessThan(lifted);
  expect(after.y).toBeGreaterThan(0.5); // still on the desk, not through the floor
  // 7b) Released → the card STAYS up, still on the board you just held, so the
  //     schematic doesn't vanish the moment you set the board down.
  const pipAfter = (await page.evaluate(() => {
    const p = (
      window as unknown as {
        __scadgen?: {
          circuitPip?: {
            isVisible(): boolean;
            snapshot(): { instId: string } | null;
          };
        };
      }
    ).__scadgen?.circuitPip;
    return { visible: p?.isVisible() ?? false, snap: p?.snapshot() ?? null };
  })) as { visible: boolean; snap: { instId: string } | null };
  expect(
    pipAfter.visible,
    "circuit card stays up when the board is released",
  ).toBe(true);
  expect(pipAfter.snap?.instId, "card keeps the board you just held").toBe(
    boardId,
  );

  await shot(page, "vr-board-dropped");
});
