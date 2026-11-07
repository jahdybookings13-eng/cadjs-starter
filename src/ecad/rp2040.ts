// ecad/rp2040.ts — real RP2040 execution for the Pi Pico / Pico W.
//
// rp2040js is the Wokwi RP2040 emulator: a Cortex-M0+ core plus the chip's
// GPIO, UART, I2C, SPI, PWM and PIO blocks. It needs a boot ROM image, and the
// RP2040 mask ROM is proprietary, so we do what the ROM's first job is: read
// the initial stack pointer and reset vector from the start of flash and hand
// them to the core. That boots boot-vector images (bare-metal, and usually
// MicroPython/Arduino images whose startup lives in flash).
//
// Honest boundary: images that call mask-ROM functions (pico-sdk's
// rom_func_lookup paths, flash programming helpers) will not find them here.
// The tier reports this instead of pretending every UF2 runs.
//
// Pure adapter: no DOM. The worker host lives in rp2040Worker.ts.

import { GPIOPinState, RP2040 } from "rp2040js";
import { bytesOf, uf2Image } from "./delivery";

export const RP2040_FLASH_BASE = 0x10000000;
/** RP2040 default system clock (clk_sys 125 MHz). */
export const RP2040_CLOCK_HZ = 125_000_000;

export interface Rp2040Emulator {
  clockHz: number;
  readonly cycles: number;
  /** Execute up to `maxInstructions` instructions; returns instructions run. */
  step(maxInstructions?: number): number;
  /** Output-pin changes, by GPIO number (0-29). */
  onPin(fn: (gpio: number, high: boolean) => void): void;
  /** Text transmitted on UART0 (line-buffered). */
  onSerial(fn: (text: string) => void): void;
  dispose(): void;
}

export type Rp2040Result =
  | {
      ok: true;
      emulator: Rp2040Emulator;
      imageBytes: number;
      bootPc: number;
    }
  | { ok: false; reason: string };

/**
 * Boot a UF2 or raw flash image on the emulated RP2040.
 * Raw images are placed at flash offset 0; UF2 blocks are placed at their own
 * target addresses.
 */
export function makeRp2040(payload: string): Rp2040Result {
  const uf2 = uf2Image(payload);
  const image = uf2 ? uf2.image : bytesOf(payload);
  if (image.length === 0) return { ok: false, reason: "empty firmware image" };

  const chip = new RP2040();
  const offset = uf2 ? uf2.baseAddress - RP2040_FLASH_BASE : 0;
  if (offset < 0 || offset + image.length > chip.flash.length) {
    return { ok: false, reason: "image does not fit RP2040 flash" };
  }
  chip.flash.set(image, offset);

  const view = new DataView(chip.flash.buffer);
  const sp = view.getUint32(0, true);
  const pc = view.getUint32(4, true);
  if (sp === 0 || sp === 0xffffffff || pc === 0 || pc === 0xffffffff) {
    return {
      ok: false,
      reason:
        "image has no boot vector at flash start — not a bootable RP2040 image",
    };
  }
  // The core's reset reads these two words, exactly like the mask ROM does.
  chip.bootrom[0] = sp;
  chip.bootrom[1] = pc;
  chip.core.reset();

  const pinListeners: ((gpio: number, high: boolean) => void)[] = [];
  const unsubscribes = chip.gpio.map((pin, index) =>
    pin.addListener((state) => {
      const high = state === GPIOPinState.High;
      for (const fn of pinListeners) fn(index, high);
    }),
  );

  const serialListeners: ((text: string) => void)[] = [];
  let line = "";
  const uart = chip.uart[0];
  if (uart) {
    uart.onByte = (value: number) => {
      line += String.fromCharCode(value);
      if (value === 0x0a || line.length >= 256) {
        for (const fn of serialListeners) fn(line);
        line = "";
      }
    };
  }

  let executed = 0;
  const emulator: Rp2040Emulator = {
    clockHz: RP2040_CLOCK_HZ,
    get cycles() {
      return chip.core.cycles;
    },
    step(maxInstructions = 10_000) {
      for (let i = 0; i < maxInstructions; i++) {
        chip.step();
        executed++;
      }
      return executed;
    },
    onPin(fn) {
      pinListeners.push(fn);
    },
    onSerial(fn) {
      serialListeners.push(fn);
    },
    dispose() {
      pinListeners.length = 0;
      serialListeners.length = 0;
      for (const off of unsubscribes) off();
      if (uart) delete uart.onByte;
    },
  };

  return {
    ok: true,
    emulator,
    imageBytes: image.length,
    bootPc: pc & ~1,
  };
}
