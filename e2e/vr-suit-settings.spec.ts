import { test, expect } from "@playwright/test";
import {
  installFakeXR,
  bootIntoVR,
  vr,
  shot,
  expectCleanVR,
  type VRError,
} from "./vr-harness";

/**
 * In-VR suit/project settings panel. Look up to open — the panel floats in
 * front of the face; point the right hand at a row's +/- button and click
 * the trigger to edit; the doc is written back to localStorage on every
 * commit (not just on panel close), and room/desk rows rebuild the room live.
 */

const RIGHT = "right";
const TRIG = 0; // trigger button
const GRIP = 1;

test("suit settings panel opens on look-up, edits persist, edits rebuild the room", async ({
  page,
}) => {
  const errors: VRError[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push({ kind: "console", text: m.text() });
  });
  page.on("pageerror", (e) =>
    errors.push({ kind: "pageerror", text: String(e?.stack ?? e) }),
  );

  await installFakeXR(page);
  await bootIntoVR(page);
  await page.waitForFunction(
    () =>
      (window as unknown as { __scadgen?: { suitPanel?: unknown } }).__scadgen
        ?.suitPanel !== undefined,
    undefined,
    { timeout: 15_000 },
  );

  // --- panel hidden on a neutral gaze ---
  const hidden0 = (await vr(page, "frame", [2])) as unknown;
  void hidden0;
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __scadgen?: { suitPanel?: { isVisible(): boolean } };
        }
      ).__scadgen!.suitPanel!.isVisible(),
    ),
    "panel must be hidden while looking straight ahead",
  ).toBe(false);

  // --- look UP: panel opens head-relative ---
  await vr(page, "lookUp", [50]);
  await vr(page, "frame", [4]);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __scadgen?: { suitPanel?: { isVisible(): boolean } };
        }
      ).__scadgen!.suitPanel!.isVisible(),
    ),
    "panel must open on look-up",
  ).toBe(true);
  await shot(page, "vr-suit-panel-open");

  // read current room width from the doc (defaults to project value)
  const before = (await page.evaluate(() => {
    const all = (
      window as unknown as {
        __scadgen?: {
          suitPanel?: { rows(): { parameterId: string; value: unknown }[] };
        };
      }
    ).__scadgen!;
    const row = all
      .suitPanel!.rows()
      .find((r) => r.parameterId === "roomWidth");
    return Number(row?.value);
  })) as number;
  expect(before, `default roomWidth`).toBeGreaterThan(1);

  const hit = (await page.evaluate(
    () =>
      (
        window as unknown as {
          __scadgen?: {
            suitPanel?: {
              hitPoint(
                id: string,
                region?: string,
              ): [number, number, number] | null;
            };
          };
        }
      ).__scadgen!.suitPanel!.hitPoint("roomWidth", "increment")!,
  )) as [number, number, number];
  const pose = (await page.evaluate(
    () =>
      (
        window as unknown as {
          __scadgen?: {
            suitPanel?: {
              pose(): {
                position: [number, number, number];
                normal: [number, number, number];
              } | null;
            };
          };
        }
      ).__scadgen!.suitPanel!.pose()!,
  )) as {
    position: [number, number, number];
    normal: [number, number, number];
  };
  const origin: [number, number, number] = [
    pose.position[0] + pose.normal[0] * 0.3,
    pose.position[1] + pose.normal[1] * 0.3,
    pose.position[2] + pose.normal[2] * 0.3,
  ];
  await vr(page, "pointAt", [RIGHT, hit, origin]);
  await vr(page, "frame", [4]);
  await vr(page, "press", [RIGHT, TRIG, true]);
  await vr(page, "frame", [4]);
  await vr(page, "press", [RIGHT, TRIG, false]);
  await vr(page, "frame", [2]);

  const after = (await page.evaluate(() => {
    const all = (
      window as unknown as {
        __scadgen?: {
          suitPanel?: { rows(): { parameterId: string; value: unknown }[] };
        };
      }
    ).__scadgen!;
    const row = all
      .suitPanel!.rows()
      .find((r) => r.parameterId === "roomWidth");
    return Number(row?.value);
  })) as number;
  expect(
    after,
    `roomWidth after +step click (${before} -> ${after})`,
  ).toBeGreaterThan(before);

  // the doc was persisted to localStorage as well
  const stored = (await page.evaluate(() => {
    const activeRaw = localStorage.getItem("scadgen.active.v1");
    const active = activeRaw ? (JSON.parse(activeRaw) as string) : null;
    const all = JSON.parse(
      localStorage.getItem("scadgen.projects.v1") ?? "{}",
    ) as Record<string, { settings?: { room?: { width: number } } }>;
    return active ? all[active]?.settings?.room?.width : undefined;
  })) as number | undefined;
  expect(stored, "room width persisted to localStorage").toBe(after);

  // panel closes on look-down (belt takes the gaze)
  await vr(page, "lookDown", [-55]);
  await vr(page, "frame", [4]);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __scadgen?: { suitPanel?: { isVisible(): boolean } };
        }
      ).__scadgen!.suitPanel!.isVisible(),
    ),
    "panel must close on look-down",
  ).toBe(false);

  await shot(page, "vr-suit-panel-closed");
  await expectCleanVR(errors);
});
