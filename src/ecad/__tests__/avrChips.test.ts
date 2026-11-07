// ecad/__tests__/avrChips.test.ts — proves the per-chip emulation is real.
//
// The register maps in avrChips.ts were read from the avr-libc device headers
// shipped inside @horang-corp/avr-gcc-wasm. These tests pin the values that
// differ per chip (flash, RAMEND, ports, vector slots, USART blocks) and then
// RUN an assembled blink .hex on each chip, asserting the right port bit
// actually toggles under avr8js.

import { describe, expect, it } from "vitest";
import {
  chipFor,
  chipPinOf,
  isAvrFamily,
  type AvrTimerRegs,
} from "../avrChips";
import { getPart, pinsOf } from "../catalog";
import { makeAvrChip } from "../avr";
import {
  ATTINY85_BLINK_HEX,
  LEONARDO_BLINK_HEX,
  MEGA_BLINK_HEX,
  UNO_BLINK_HEX,
} from "../hex";

function timer0(mcu: string): AvrTimerRegs {
  const chip = chipFor(mcu);
  const spec = chip?.timers.find((t) => t.name === "Timer0");
  if (!spec || spec.kind !== "avr-timer")
    throw new Error(`no Timer0 on ${mcu}`);
  return spec;
}

describe("AVR chip profiles match the device headers", () => {
  it("ATmega328P stays byte-for-byte the avr8js configs", async () => {
    const mod = await import("avr8js");
    const chip = chipFor("ATmega328P")!;
    expect(chip.flashBytes).toBe(32 * 1024);
    expect(chip.ramEnd).toBe(0x8ff);
    expect(chip.buildable).toBe(true);

    const chipTimers = chip.timers.filter(
      (t): t is AvrTimerRegs => t.kind === "avr-timer",
    );
    for (const [i, config] of [
      mod.timer0Config,
      mod.timer1Config,
      mod.timer2Config,
    ].entries()) {
      const ours = chipTimers[i]!;
      for (const key of [
        "TIFR",
        "TIMSK",
        "TCCRA",
        "TCCRB",
        "TCNT",
        "OCRA",
        "OCRB",
        "ovfInterrupt",
        "compAInterrupt",
      ] as const) {
        expect(ours[key], `${ours.name}.${key}`).toBe(
          config[key as keyof typeof config],
        );
      }
    }
  });

  it("ATmega2560 has 256 KB flash, all 11 ports and timers 0-5", () => {
    const chip = chipFor("ATmega2560")!;
    expect(chip.flashBytes).toBe(256 * 1024); // FLASHEND 0x3FFFF
    expect(chip.ramEnd).toBe(0x21ff);
    expect(chip.ports.map((p) => p.letter).join("")).toBe("ABCDEFGHJKL");
    expect(chip.ports.find((p) => p.letter === "L")).toEqual({
      letter: "L",
      PIN: 0x109,
      DDR: 0x10a,
      PORT: 0x10b,
    });
    expect(chip.timers).toHaveLength(6);
    // Timer5 lives in extended I/O at 0x120 — a 328P-only profile cannot do this.
    const t5 = chip.timers.find((t) => t.name === "Timer5");
    expect(t5 && t5.kind === "avr-timer" ? t5.TCCRA : null).toBe(0x120);
    expect(chip.usarts.map((u) => u.name)).toEqual([
      "USART0",
      "USART1",
      "USART2",
      "USART3",
    ]);
    expect(chip.twi?.twiInterrupt).toBe(0x4e); // TWI_vect 39 × 2
    expect(chip.buildable).toBe(false);
  });

  it("ATmega32U4 has no Timer2 and only USART1", () => {
    const chip = chipFor("ATmega32U4")!;
    expect(chip.ramEnd).toBe(0xaff);
    expect(chip.timers.map((t) => t.name)).toEqual([
      "Timer0",
      "Timer1",
      "Timer3",
    ]);
    expect(chip.usarts).toHaveLength(1);
    expect(chip.usarts[0]?.UCSRA).toBe(0xc8);
    expect(chip.usarts[0]?.rxCompleteInterrupt).toBe(0x32); // USART1_RX 25 × 2
    expect(chip.twi?.twiInterrupt).toBe(0x48); // TWI_vect 36 × 2
    expect(chip.serialNote).toMatch(/USB CDC/);
  });

  it("ATtiny85 is 8 MHz, PORTB-only, with 1-word vector slots", () => {
    const chip = chipFor("ATtiny85")!;
    expect(chip.flashBytes).toBe(8 * 1024);
    expect(chip.ramEnd).toBe(0x25f);
    expect(chip.clockHz).toBe(8_000_000);
    expect(chip.ports).toEqual([
      { letter: "B", PIN: 0x36, DDR: 0x37, PORT: 0x38 },
    ]);
    expect(chip.usarts).toEqual([]);
    expect(chip.twi).toBeNull();
    const t0 = timer0("ATtiny85");
    // ATtiny85 vector table is RJMP (1 word), so slots are vector numbers.
    expect(t0.ovfInterrupt).toBe(5); // TIMER0_OVF_vect 5
    expect(t0.compAInterrupt).toBe(10); // TIMER0_COMPA_vect 10
    expect(t0.TCCRA).toBe(0x4a); // TCCR0A I/O 0x2A
    expect(t0.TCCRB).toBe(0x53); // TCCR0B I/O 0x33 — not 0x45 like the 328P
    expect(t0.OCFB).toBe(8); // OCF0B is bit 3, not bit 2
    expect(chip.timers.some((t) => t.kind === "attiny-timer1")).toBe(true);
  });

  it("unknown MCUs have no profile", () => {
    expect(chipFor("ESP32-WROOM-32")).toBeNull();
    expect(chipFor(undefined)).toBeNull();
    expect(isAvrFamily("avr")).toBe(true);
    expect(isAvrFamily("avr32u4")).toBe(true);
    expect(isAvrFamily("esp32")).toBe(false);
  });
});

describe("pin maps follow the chip, not the Arduino number", () => {
  it("Mega D13 is PB7 while Uno D13 is PB5", () => {
    expect(chipPinOf("ATmega2560", { name: "13" })).toEqual({
      name: "13",
      port: "B",
      bit: 7,
    });
    expect(chipPinOf("ATmega328P", { name: "13" })).toEqual({
      name: "13",
      port: "B",
      bit: 5,
    });
    expect(chipPinOf("ATmega2560", { name: "53" })).toMatchObject({
      port: "B",
      bit: 0,
    });
    expect(chipPinOf("ATmega2560", { name: "A8" })).toMatchObject({
      port: "K",
      bit: 0,
    });
  });

  it("Leonardo D13 is PC7, A4/A5 are PF1/PF0", () => {
    expect(chipPinOf("ATmega32U4", { name: "13" })).toMatchObject({
      port: "C",
      bit: 7,
    });
    expect(chipPinOf("ATmega32U4", { name: "A4" })).toMatchObject({
      port: "F",
      bit: 1,
    });
    expect(chipPinOf("ATmega32U4", { name: "A5" })).toMatchObject({
      port: "F",
      bit: 0,
    });
  });

  it("catalog pins win when they carry avrPort/avrBit", () => {
    const attiny = getPart("attiny85")!;
    const pb1 = pinsOf(attiny).find((p) => p.name === "PB1")!;
    expect(chipPinOf("ATtiny85", pb1)).toEqual({
      name: "PB1",
      port: "B",
      bit: 1,
    });
    expect(chipPinOf("ESP32-WROOM-32", { name: "2" })).toBeNull();
  });
});

async function runBlink(
  mcu: string,
  hex: string,
  port: string,
  bit: number,
  maxCycles: number,
): Promise<{
  edges: { at: number; level: number }[];
  chip: string;
  clockHz: number;
}> {
  const made = await makeAvrChip(hex, mcu);
  if (!made.ok) throw new Error(made.reason);
  const emu = made.emulator;
  const edges: { at: number; level: number }[] = [];
  let last = -1;
  emu.onPort(port, (value) => {
    const b = (value >> bit) & 1;
    if (b !== last) {
      edges.push({ at: emu.cycles, level: b });
      last = b;
    }
  });
  while (emu.cycles < maxCycles && edges.length < 4) emu.step(200_000);
  const result = { edges, chip: emu.chip, clockHz: emu.clockHz };
  emu.dispose();
  return result;
}

/** Rising-edge period, ignoring the DDR/PORT write pair at program start. */
function period(edges: { at: number; level: number }[]): number {
  const rising = edges.filter((e) => e.level === 1).map((e) => e.at);
  return (rising[1] ?? 0) - (rising[0] ?? 0);
}

describe("compiled .hex executes on every emulated AVR chip", () => {
  it("ATmega328P blink toggles PB5 (Uno D13)", async () => {
    const run = await runBlink("ATmega328P", UNO_BLINK_HEX, "B", 5, 9_000_000);
    expect(run.chip).toBe("ATmega328P");
    expect(run.edges.length).toBeGreaterThanOrEqual(3);
    expect(period(run.edges)).toBeGreaterThan(3_000_000);
  }, 30_000);

  it("ATmega2560 blink toggles PB7 through 256 KB flash and 8 KB SRAM", async () => {
    const run = await runBlink("ATmega2560", MEGA_BLINK_HEX, "B", 7, 9_000_000);
    expect(run.chip).toBe("ATmega2560");
    expect(run.clockHz).toBe(16_000_000);
    expect(run.edges.length).toBeGreaterThanOrEqual(3);
    // A 328P-shaped memory would put SP in the wrong place; this program needs
    // no stack, so the stronger evidence is the port bit above.
    expect(period(run.edges)).toBeGreaterThan(3_000_000);
  }, 30_000);

  it("ATmega32U4 blink toggles PC7 (Leonardo D13)", async () => {
    const run = await runBlink(
      "ATmega32U4",
      LEONARDO_BLINK_HEX,
      "C",
      7,
      9_000_000,
    );
    expect(run.chip).toBe("ATmega32U4");
    expect(run.edges.length).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it("ATtiny85 blink toggles PB1 at 8 MHz", async () => {
    const run = await runBlink(
      "ATtiny85",
      ATTINY85_BLINK_HEX,
      "B",
      1,
      5_000_000,
    );
    expect(run.chip).toBe("ATtiny85");
    expect(run.clockHz).toBe(8_000_000);
    expect(run.edges.length).toBeGreaterThanOrEqual(3);
    expect(period(run.edges)).toBeGreaterThan(500_000);
  }, 30_000);

  it("refuses a chip with no profile instead of guessing", async () => {
    const made = await makeAvrChip(UNO_BLINK_HEX, "ESP32-WROOM-32");
    expect(made.ok).toBe(false);
    if (!made.ok) expect(made.reason).toMatch(/no AVR emulation profile/);
  });
});
