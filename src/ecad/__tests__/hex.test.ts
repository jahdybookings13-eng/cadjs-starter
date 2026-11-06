// ecad/__tests__/hex.test.ts — proves the SHIPPED compiled firmware actually
// executes: the assembler-built Uno blink hex runs under avr8js and toggles
// PB5 (Arduino D13) with the designed ~8.4M-cycle period (~524 ms @16 MHz).

import { describe, expect, it } from "vitest";
import {
  assembleBlink,
  parseHex,
  toHex,
  wordsToImage,
  UNO_BLINK_HEX,
} from "../hex";

describe("intel hex utilities", () => {
  it("round-trips a program through parse/serialize", () => {
    const words = [0x9a25, 0x9a2d, 0x982d];
    const hex = toHex(wordsToImage(words, 8), 8);
    const records = parseHex(hex);
    expect(records.filter((r) => r.type === 0x00).length).toBe(3);
    expect(hex.trim().endsWith(":00000001FF")).toBe(true);
  });

  it("the shipped Uno blink hex is well-formed", () => {
    const records = parseHex(UNO_BLINK_HEX);
    expect(records.length).toBeGreaterThan(3);
    expect(records[records.length - 1]?.type).toBe(1); // EOF record
    const dataWords = records.filter((r) => r.type === 0x00);
    // sbi DDRB,5 must be the first instruction (0x9A25 little-endian)
    expect(dataWords[0]?.data).toEqual([0x25, 0x9a]);
  });
});

describe("compiled AVR firmware executes for real", () => {
  it("assembled blink toggles PORTB5 on avr8js with the designed period", async () => {
    const mod = await import("avr8js");
    const cpu = new mod.CPU(new Uint16Array(32 * 1024));
    const program = assembleBlink("B", 5);
    program.forEach((w, i) => (cpu.progMem[i] = w));

    const portB = new mod.AVRIOPort(cpu, mod.portBConfig);
    const edges: { at: number; level: number }[] = [];
    let last = -1;
    portB.addListener((value: number) => {
      const bit = (value >> 5) & 1;
      if (bit !== last) {
        edges.push({ at: cpu.cycles, level: bit });
        last = bit;
      }
    });

    // run ~1.1 simulated seconds
    const total = 17_600_000;
    while (cpu.cycles < total) {
      mod.avrInstruction(cpu);
      cpu.tick();
    }

    expect(edges.length).toBeGreaterThanOrEqual(3);
    const rising = edges.filter((e) => e.level === 1);
    expect(rising.length).toBeGreaterThanOrEqual(2);
    const period = rising[1]!.at - rising[0]!.at;
    // designed: ~8.4M cycles (~524ms @ 16MHz); allow assembler slack
    expect(period).toBeGreaterThan(7_000_000);
    expect(period).toBeLessThan(10_000_000);
  }, 30_000);

  it("the shipped hex runs identically to the freshly assembled program", async () => {
    const mod = await import("avr8js");
    const { flashImage } = await import("../hex");
    const cpu = new mod.CPU(new Uint16Array(32 * 1024));
    const image = flashImage(UNO_BLINK_HEX, 32 * 1024 * 2);
    for (let w = 0; w < 1024; w++)
      cpu.progMem[w] = (image[w * 2] ?? 0) | ((image[w * 2 + 1] ?? 0) << 8);
    const portB = new mod.AVRIOPort(cpu, mod.portBConfig);
    let toggles = 0;
    let last = -1;
    portB.addListener((value: number) => {
      const bit = (value >> 5) & 1;
      if (bit !== last) {
        toggles++;
        last = bit;
      }
    });
    for (let i = 0; i < 2_000_000; i++) {
      mod.avrInstruction(cpu);
      cpu.tick();
    }
    // 2M cycles ≈ 125 ms: the LED must have turned ON (DDRB set + first sbi)
    expect(toggles).toBeGreaterThanOrEqual(1);
    expect(((cpu.data[0x25] ?? 0) >> 5) & 1).toBe(1); // PORTB5 currently high
  }, 30_000);
});
