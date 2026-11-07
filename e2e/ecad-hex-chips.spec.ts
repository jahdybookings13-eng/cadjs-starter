// e2e/ecad-hex-chips.spec.ts — the chip emulation, in the real app.
//
// A Mega 2560, a Leonardo and an ATtiny85 each get a compiled .hex and a wired
// LED. The app's own render tick must drive the emulators and the LEDs must
// light on the chip-correct pins (Mega D13 = PB7, Leonardo D13 = PC7, ATtiny
// PB1) — the exact thing a 328P-only emulator cannot do.

import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

interface ChipWindow {
  __ecad?: {
    sim: {
      tick: (dtMs: number) => void;
      ledLevel: (id: string) => number;
      serial: (id: string) => string[];
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

test("ecad: Mega 2560, Leonardo and ATtiny85 run compiled .hex on their own pins", async ({
  page,
}) => {
  await loadAppReady(page);

  const setup = await page.evaluate(async () => {
    const w = window as unknown as ChipWindow;
    const bus = w.__cadDebug?.scadgen?.bus;
    if (!bus) throw new Error("no bus");

    const place = (part: string) =>
      bus.run("ecad.insert", { part, x: 0, y: 0, z: 0 }) as { id: string };
    const wireLed = (board: { id: string }, pin: string, x: number) => {
      const led = bus.run("ecad.insert", {
        part: "led-red",
        x,
        y: 0,
        z: 0.05,
      }) as { id: string };
      bus.run("ecad.wire", { from: `${board.id}.${pin}`, to: `${led.id}.A` });
      return led;
    };

    const mega = place("arduino-mega");
    const megaLed = wireLed(mega, "13", -0.12);
    const leo = place("arduino-leonardo");
    const leoLed = wireLed(leo, "13", 0.12);
    const tiny = place("attiny85");
    const tinyLed = wireLed(tiny, "PB1", 0.24);

    const deploy = (board: { id: string }, firmwareId: string) =>
      bus.run("ecad.deploy", { board: board.id, firmwareId });

    deploy(mega, "blink-hex-mega");
    deploy(leo, "blink-hex-leonardo");
    deploy(tiny, "blink-hex-attiny85");

    const status = {
      mega: (await bus.run("ecad.run", mega.id)) as {
        tier: string | null;
        error: string | null;
      },
      leo: (await bus.run("ecad.run", leo.id)) as {
        tier: string | null;
        error: string | null;
      },
      tiny: (await bus.run("ecad.run", tiny.id)) as {
        tier: string | null;
        error: string | null;
      },
    };

    return {
      leads: {
        mega: megaLed.id,
        leo: leoLed.id,
        tiny: tinyLed.id,
      },
      boards: { mega: mega.id, leo: leo.id, tiny: tiny.id },
      status,
    };
  });

  expect(setup.status.mega.tier).toBe("hex");
  expect(setup.status.mega.error).toBeNull();
  expect(setup.status.leo.tier).toBe("hex");
  expect(setup.status.tiny.tier).toBe("hex");

  // Drive the same tick the render loop uses, and watch all three LEDs.
  const seen = await page.evaluate(
    async ({ leads }) => {
      const sim = (window as unknown as ChipWindow).__ecad!.sim;
      const out: Record<string, number[]> = { mega: [], leo: [], tiny: [] };
      for (let i = 0; i < 140; i++) {
        sim.tick(20); // 20 ms of board time per frame → 2.8 s total
        await new Promise((r) => setTimeout(r, 2));
        for (const key of ["mega", "leo", "tiny"] as const)
          out[key]!.push(sim.ledLevel(leads[key]));
      }
      return out;
    },
    { leads: setup.leads },
  );

  for (const chip of ["mega", "leo", "tiny"] as const) {
    const levels = seen[chip] ?? [];
    expect(Math.max(...levels), `${chip} LED never lit`).toBe(1);
  }

  const notes = await page.evaluate(
    ({ boards }) => {
      const sim = (window as unknown as ChipWindow).__ecad!.sim;
      return {
        leoSerial: sim.serial(boards.leo),
        tinySerial: sim.serial(boards.tiny),
      };
    },
    { boards: setup.boards },
  );

  // Honest serial surface: Leonardo says USB Serial is not emulated; the
  // ATtiny85 has no USART at all.
  expect(notes.leoSerial.join("\n")).toMatch(/USB CDC/);
  expect(notes.tinySerial.join("\n")).toMatch(/no USART/);
});
