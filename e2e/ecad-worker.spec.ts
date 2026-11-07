// e2e/ecad-worker.spec.ts — two guarantees for EVERY board in the catalog:
//   1. virtual firmware runs off the main thread, so a sketch that never yields
//      cannot freeze the app;
//   2. boards with no AVR emulator still execute their firmware in-app.

import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

interface WorkerWindow {
  __ecad?: {
    sim: {
      status: (id: string) => {
        running: boolean;
        tier: string | null;
        error: string | null;
      };
      serial: (id: string) => string[];
      stop: (id: string) => void;
    };
  };
  __cadDebug?: {
    scadgen?: {
      bus?: { run: (id: string, ...args: unknown[]) => unknown };
    };
  };
}

test("ecad: an infinite-loop sketch cannot freeze the app", async ({
  page,
}) => {
  await loadAppReady(page);

  // If firmware ran on the main thread this evaluate would never return.
  const board = await page.evaluate(() => {
    const bus = (window as unknown as WorkerWindow).__cadDebug!.scadgen!.bus!;
    const esp = bus.run("ecad.insert", {
      part: "esp32-devkit",
      x: 0,
      y: 0,
      z: 0,
    }) as { id: string };
    bus.run("ecad.code", {
      board: esp.id,
      code: "function setup() { while (true) {} }",
    });
    void bus.run("ecad.run", esp.id);
    return esp.id;
  });

  // The page is still answering while that sketch spins in its worker.
  const alive = await page.evaluate((id) => {
    const sim = (window as unknown as WorkerWindow).__ecad!.sim;
    const status = sim.status(id);
    return { sum: 2 + 2, tier: status.tier, running: status.running };
  }, board);
  expect(alive.sum).toBe(4);
  expect(alive.tier).toBe("virtual");
  expect(alive.running).toBe(true);

  await page.evaluate((id) => {
    (window as unknown as WorkerWindow).__ecad!.sim.stop(id);
  }, board);
});

test("ecad: a non-AVR board (ESP32) runs its firmware and reports serial", async ({
  page,
}) => {
  await loadAppReady(page);

  const out = await page.evaluate(async () => {
    const w = window as unknown as WorkerWindow;
    const bus = w.__cadDebug!.scadgen!.bus!;
    const esp = bus.run("ecad.insert", {
      part: "esp32-devkit",
      x: 0,
      y: 0,
      z: 0,
    }) as { id: string };
    bus.run("ecad.code", {
      board: esp.id,
      code: [
        "function setup() { Serial.println('esp32 firmware alive'); }",
        "async function loop() { await delay(1000); }",
      ].join("\n"),
    });
    await bus.run("ecad.run", esp.id);
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 25));
      if (w.__ecad!.sim.serial(esp.id).length) break;
    }
    const status = w.__ecad!.sim.status(esp.id);
    const serial = w.__ecad!.sim.serial(esp.id);
    w.__ecad!.sim.stop(esp.id);
    return { tier: status.tier, serial };
  });

  expect(out.tier).toBe("virtual");
  expect(out.serial).toContain("esp32 firmware alive");
});
