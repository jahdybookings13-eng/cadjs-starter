// ecad/__tests__/rp2040.test.ts — the RP2040 tier is execution, not a badge.
//
// A hand-assembled Thumb program (route GPIO25 to SIO, enable the output, drive
// it high, spin) is loaded as a raw flash image and as a UF2; both must boot the
// emulated Cortex-M0+ and raise the pin. The same file checks the universal
// firmware verifier: correct architecture accepted, wrong architecture refused.

import { describe, expect, it } from "vitest";
import {
  dataUrlOf,
  inspectFirmware,
  uf2Image,
  RP2040_UF2_FAMILY,
} from "../delivery";
import { makeRp2040, RP2040_FLASH_BASE } from "../rp2040";
import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";

/**
 * Thumb-1 program:
 *   ldr r0, =0x400140CC   ; IO_BANK0 GPIO25_CTRL
 *   movs r1, #5           ; function 5 = SIO
 *   str r1, [r0]
 *   ldr r0, =0xD0000024   ; SIO GPIO_OE_SET
 *   ldr r1, =0x02000000   ; bit 25
 *   str r1, [r0]
 *   ldr r0, =0xD0000014   ; SIO GPIO_OUT_SET
 *   str r1, [r0]
 *   b .
 * Literals are 4-byte aligned at 0x118 so `ldr` (pc-relative, imm8*4) reaches
 * them; this was the detail the first probe got wrong.
 */
const GPIO25_HIGH = [
  0x4805, 0x2105, 0x6001, 0x4805, 0x4905, 0x6001, 0x4805, 0x6001, 0xe7fe,
  0xbf00, 0xbf00, 0xbf00, 0x40cc, 0x4001, 0x0024, 0xd000, 0x0000, 0x0200,
  0x0014, 0xd000,
];

function flashImageWithGpioHigh(): Uint8Array {
  const image = new Uint8Array(0x200);
  const view = new DataView(image.buffer);
  view.setUint32(0, 0x20040000, true); // initial SP (SRAM)
  view.setUint32(4, RP2040_FLASH_BASE + 0x101, true); // reset vector, thumb
  GPIO25_HIGH.forEach((half, i) => view.setUint16(0x100 + i * 2, half, true));
  return image;
}

function uf2Of(image: Uint8Array, family = RP2040_UF2_FAMILY): string {
  const blocks = Math.ceil(image.length / 256);
  const out = new Uint8Array(blocks * 512);
  const view = new DataView(out.buffer);
  for (let b = 0; b < blocks; b++) {
    const offset = b * 512;
    const data = image.subarray(b * 256, Math.min((b + 1) * 256, image.length));
    view.setUint32(offset, 0x0a324655, true);
    view.setUint32(offset + 4, 0x9e5d5157, true);
    view.setUint32(offset + 8, 0, true);
    view.setUint32(offset + 12, RP2040_FLASH_BASE + b * 256, true);
    view.setUint32(offset + 16, data.length, true);
    view.setUint32(offset + 20, b, true);
    view.setUint32(offset + 24, blocks, true);
    view.setUint32(offset + 28, family, true);
    out.set(data, offset + 32);
  }
  return dataUrlOf(out);
}

describe("RP2040 execution", () => {
  it("boots a raw flash image and drives GPIO25 high", () => {
    const made = makeRp2040(dataUrlOf(flashImageWithGpioHigh()));
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.bootPc).toBe(RP2040_FLASH_BASE + 0x100);
    const seen: { gpio: number; high: boolean }[] = [];
    made.emulator.onPin((gpio, high) => seen.push({ gpio, high }));
    made.emulator.step(100);
    expect(seen).toContainEqual({ gpio: 25, high: true });
    expect(made.emulator.clockHz).toBe(125_000_000);
    made.emulator.dispose();
  });

  it("boots the same program from a UF2 at its own target address", () => {
    const image = flashImageWithGpioHigh();
    const uf2 = uf2Of(image);
    const parsed = uf2Image(uf2);
    expect(parsed?.family).toBe(RP2040_UF2_FAMILY);
    expect(parsed?.baseAddress).toBe(RP2040_FLASH_BASE);
    expect(parsed?.image.length).toBe(image.length);

    const made = makeRp2040(uf2);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const seen: { gpio: number; high: boolean }[] = [];
    made.emulator.onPin((gpio, high) => seen.push({ gpio, high }));
    made.emulator.step(100);
    expect(seen).toContainEqual({ gpio: 25, high: true });
    made.emulator.dispose();
  });

  it("deploys a UF2 to a Pico in the sim and lights a wired LED", async () => {
    const sim = new EcadSim(new VirtualClock());
    const pico = sim.insert("rpi-pico", { x: 0, y: 0, z: 0 });
    const led = sim.insert("led-red", { x: -2, y: 0, z: 0 });
    sim.wire(`${pico.id}.GP25`, `${led.id}.A`);
    sim.deploy(pico.id, {
      binary: uf2Of(flashImageWithGpioHigh()),
      name: "gp25.uf2",
    });
    expect(sim.firmwareOf(pico.id)?.tier).toBe("rp2040");

    await sim.run(pico.id);
    expect(sim.status(pico.id).tier).toBe("rp2040");
    sim.tick(2);
    expect(sim.ledLevel(led.id)).toBe(1);
    sim.stop(pico.id);
  });

  it("refuses an image with no boot vector instead of running garbage", () => {
    const blank = dataUrlOf(new Uint8Array(0x100).fill(0xff));
    const made = makeRp2040(blank);
    expect(made.ok).toBe(false);
    if (!made.ok) expect(made.reason).toMatch(/no boot vector/);
  });
});

// --- universal verification -------------------------------------------------

function elfImage(opts: {
  machine: number;
  payloadBytes: number;
  entry?: number;
}): string {
  const header = 0x100;
  const bytes = new Uint8Array(header + opts.payloadBytes);
  const view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1], 0); // ELF32, little-endian
  view.setUint16(0x12, opts.machine, true);
  view.setUint32(0x18, opts.entry ?? 0x10000101, true);
  view.setUint32(0x1c, 0x34, true); // program headers right after the ELF header
  view.setUint16(0x2a, 32, true);
  view.setUint16(0x2c, 1, true);
  view.setUint32(0x34, 1, true); // PT_LOAD
  view.setUint32(0x34 + 4, header, true); // p_offset
  view.setUint32(0x34 + 8, 0x10000000, true); // p_vaddr
  view.setUint32(0x34 + 16, opts.payloadBytes, true); // p_filesz
  return dataUrlOf(bytes);
}

describe("firmware verification against the board's silicon", () => {
  it("accepts an ARM ELF for the Pico and reports its facts", () => {
    const facts = inspectFirmware(
      elfImage({ machine: 40, payloadBytes: 4096 }),
      "RP2040",
    );
    expect(facts.format).toBe("elf");
    expect(facts.arch).toBe("arm");
    expect(facts.issues).toEqual([]);
    expect(facts.imageBytes).toBe(4096);
    expect(facts.summary).toMatch(/ARM ELF · 4 KB · entry 0x10000101/);
  });

  it("refuses an ARM ELF pushed at an Xtensa ESP32", () => {
    const facts = inspectFirmware(
      elfImage({ machine: 40, payloadBytes: 1024 }),
      "ESP32-WROOM-32",
    );
    expect(facts.issues.join(" ")).toMatch(/image is ARM but ESP32-WROOM-32/);
  });

  it("refuses an image bigger than the chip's flash", () => {
    const facts = inspectFirmware(
      dataUrlOf(new Uint8Array(80 * 1024)),
      "STM32F103C8T6",
    );
    expect(facts.issues.join(" ")).toMatch(/80 KB but STM32F103C8T6 has 64 KB/);
  });

  it("checks UF2 family ids against the RP2040", () => {
    const image = flashImageWithGpioHigh();
    const ok = inspectFirmware(uf2Of(image), "RP2040");
    expect(ok.issues).toEqual([]);
    expect(ok.uf2Family).toBe(RP2040_UF2_FAMILY);
    expect(ok.blocks).toBe(2);

    const wrong = inspectFirmware(uf2Of(image, 0x12345678), "RP2040");
    expect(wrong.issues.join(" ")).toMatch(
      /UF2 family 0x12345678 is not RP2040/,
    );
  });

  it("accepts an AVR ELF for a 328P board and a raw image that fits", () => {
    const avr = inspectFirmware(
      elfImage({ machine: 83, payloadBytes: 2048 }),
      "ATmega328P",
    );
    expect(avr.arch).toBe("avr");
    expect(avr.issues).toEqual([]);
    const raw = inspectFirmware(dataUrlOf(new Uint8Array(1024)), "ATmega328P");
    expect(raw.issues).toEqual([]);
    expect(raw.summary).toMatch(/raw image · 1024 B · fits 32 KB flash/);
  });

  it("notes when an unparseable ELF cannot be verified", () => {
    const facts = inspectFirmware(
      dataUrlOf(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 9])),
      "I.MX RT1062",
    );
    expect(facts.format).toBe("elf");
    expect(facts.machine).toBeNull();
    expect(facts.issues).toEqual([]);
  });
});
