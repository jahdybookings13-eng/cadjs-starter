// e2e/ecad-cpp-build.spec.ts — the real thing: type Arduino C++, compile it to
// Intel HEX inside the browser with the wasm toolchain, and watch the emulated
// ATmega328P drive a wired LED. No local toolchain, no server round-trip.

import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

interface BuildWindow {
  __ecad?: {
    sim: {
      instances: Map<string, { id: string; partId: string }>;
      ledLevel: (id: string) => number;
      tick: (dtMs: number) => void;
      status: (id: string) => {
        running: boolean;
        tier: string | null;
        error: string | null;
      };
    };
  };
  __cadDebug?: {
    scadgen?: {
      bus?: {
        run: (id: string, ...args: unknown[]) => unknown;
        has: (id: string) => boolean;
      };
    };
  };
}

const SKETCH = [
  "const int LED = LED_PIN;",
  "void setup() { pinMode(LED, OUTPUT); }",
  "void loop() { digitalWrite(LED, HIGH); delay(300); digitalWrite(LED, LOW); delay(300); }",
].join("\n");

test("ecad: C++ compiles in the browser and runs on the emulated AVR", async ({
  page,
}) => {
  await loadAppReady(page);

  const out = await page.evaluate(async (sketch) => {
    const w = window as unknown as BuildWindow;
    const bus = w.__cadDebug?.scadgen?.bus;
    if (!bus) throw new Error("no bus");
    const uno = bus.run("ecad.insert", {
      part: "arduino-uno",
      x: 0,
      y: 0,
      z: 0,
    }) as { id: string };
    const led = bus.run("ecad.insert", {
      part: "led-red",
      x: -0.12,
      y: 0,
      z: 0.05,
    }) as { id: string };
    bus.run("ecad.wire", { from: `${uno.id}.13`, to: `${led.id}.A` });
    const built = (await bus.run("ecad.buildFirmware", {
      board: uno.id,
      code: sketch,
    })) as {
      ok: boolean;
      error?: string;
      stderr?: string[];
      result?: { flashBytes: number; fitsTarget: boolean };
      status?: { tier: string | null; running: boolean };
    };
    return { uno: uno.id, led: led.id, built };
  }, SKETCH);

  // the compiler really produced a binary that fits an Uno
  expect(out.built.ok, out.built.error ?? "").toBe(true);
  expect(out.built.result?.flashBytes ?? 0).toBeGreaterThan(500);
  expect(out.built.result?.fitsTarget).toBe(true);
  expect(out.built.status?.tier).toBe("hex");

  // and the emulator executes it: the LED goes high and low on its own
  const levels = await page.evaluate(
    async ({ led }) => {
      const sim = (window as unknown as BuildWindow).__ecad!.sim;
      const seen: number[] = [];
      for (let i = 0; i < 120; i++) {
        sim.tick(20);
        await new Promise((r) => setTimeout(r, 2));
        seen.push(sim.ledLevel(led));
      }
      return seen;
    },
    { led: out.led },
  );
  expect(Math.max(...levels)).toBe(1);
  expect(Math.min(...levels)).toBe(0);

  // the workbench exposes the build path on the same board
  const panel = await page.evaluate(
    ({ uno }) => {
      const bus = (window as unknown as BuildWindow).__cadDebug!.scadgen!.bus!;
      bus.run("ecad.openPanel", undefined);
      return bus.run("ecad.status", uno) as { tier: string | null };
    },
    { uno: out.uno },
  );
  expect(panel.tier).toBe("hex");
  await expect(page.getByTestId("ecad-panel")).toBeVisible();
});
