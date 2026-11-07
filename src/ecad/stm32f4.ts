// ecad/stm32f4.ts — real Cortex-M4 execution for STM32F4 boards.
//
// `stm32f4-emu` (MIT) is a Rust Thumb-2 Cortex-M4 core with a VFPv4-SP FPU and
// the STM32F4 peripheral model (RCC, GPIO, USART, DMA, timers, SPI, I2C,
// ADC/DAC, CAN, ETH …), compiled to WebAssembly. It runs unmodified
// arm-none-eabi firmware: the package's own blinky boots, prints its banner
// over USART and toggles the Black Pill's PC13 LED through GPIOC->ODR.
//
// We deliberately do NOT import the package root: it reads the WASM and SVD
// with node:fs, so it cannot be bundled for the browser. The universal
// `stm32f4-emu/emulator` factory takes the bindings + asset URLs instead, and
// `scripts/stm32f4-assets.mjs` stages those files in public/stm32f4/.
// `setStm32f4Assets` is the headless/test hook that supplies the same bytes
// directly (Node has no server to fetch from).
//
// GPIO is read from each bank's ODR register (GPIO base + 0x14), the level the
// pin actually drives. Sampling happens *inside* step(): firmware toggles pins
// on microsecond timescales while a frame is 16 ms, so reading ODR only at
// frame boundaries would lose pulses. Edges are queued and drained in order.
//
// Scope stated rather than implied: boards are the STM32F4 family
// (F401 / F411 / F407 / F407VE / F429). The STM32F103 "Blue Pill" is a
// different core generation and stays on the verified-image path.

import { createEmulator } from "stm32f4-emu/emulator";
import * as bindings from "stm32f4-emu/vendor";
import { bytesOf } from "./delivery";

/** GPIOx_ODR for banks A-F (RM0383/RM0090: GPIO base + 0x14). */
export const STM32F4_GPIO_ODR = [
  0x40020014, 0x40020414, 0x40020814, 0x40020c14, 0x40021014, 0x40021414,
] as const;

export type Stm32f4ChipKey =
  | "stm32f401"
  | "stm32f411"
  | "stm32f407"
  | "stm32f407ve"
  | "stm32f429";

interface ChipModel {
  label: string;
  svd: string;
  flash: number;
  ram: number;
  mhz: number;
}

/** Device figures from the datasheets (application flash / SRAM). */
const CHIPS: Record<Stm32f4ChipKey, ChipModel> = {
  stm32f401: {
    label: "STM32F401 (512K/128K)",
    svd: "stm32f401.svd",
    flash: 512 * 1024,
    ram: 128 * 1024,
    mhz: 84,
  },
  stm32f411: {
    label: "STM32F411 (512K/128K)",
    svd: "stm32f411.svd",
    flash: 512 * 1024,
    ram: 128 * 1024,
    mhz: 100,
  },
  stm32f407: {
    label: "STM32F407 (1M/192K)",
    svd: "stm32f407.svd",
    flash: 1024 * 1024,
    ram: 192 * 1024,
    mhz: 168,
  },
  stm32f407ve: {
    label: "STM32F407VE (512K/192K)",
    svd: "stm32f407.svd",
    flash: 512 * 1024,
    ram: 192 * 1024,
    mhz: 168,
  },
  stm32f429: {
    label: "STM32F429 (2M/256K)",
    svd: "stm32f429.svd",
    flash: 2 * 1024 * 1024,
    ram: 256 * 1024,
    mhz: 180,
  },
};

const PORT_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
/** ODR is re-read every 10k instructions (~100 µs on the F411). */
const SAMPLE_STRIDE = 10_000;
const ASSET_PATH = "/stm32f4";

/** Map a catalog MCU string ("STM32F411CEU6") to a supported emulated chip. */
export function chipKeyFor(mcu: string): Stm32f4ChipKey | null {
  const id = mcu.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (id.startsWith("STM32F401")) return "stm32f401";
  if (id.startsWith("STM32F411")) return "stm32f411";
  if (id.startsWith("STM32F429")) return "stm32f429";
  if (id.startsWith("STM32F407VE")) return "stm32f407ve";
  if (id.startsWith("STM32F407")) return "stm32f407";
  return null;
}

export interface Stm32f4Assets {
  wasmInit?: Uint8Array;
  svdXml?: string;
}

let injected: Stm32f4Assets | null = null;
/** Headless/test hook: supply the core WASM + SVD instead of fetching them. */
export function setStm32f4Assets(assets: Stm32f4Assets | null): void {
  injected = assets;
}

let wasmPromise: Promise<Uint8Array> | null = null;
async function wasmBytes(): Promise<Uint8Array> {
  if (injected?.wasmInit) return injected.wasmInit;
  wasmPromise ??= fetch(`${ASSET_PATH}/stm32_periph_wasm_bg.wasm`).then(
    async (response) => {
      if (!response.ok)
        throw new Error(`STM32F4 core wasm: HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  );
  return wasmPromise;
}

async function svdXml(chip: ChipModel): Promise<string> {
  if (injected?.svdXml) return injected.svdXml;
  const response = await fetch(`${ASSET_PATH}/${chip.svd}`);
  if (!response.ok)
    throw new Error(`STM32F4 SVD ${chip.svd}: HTTP ${response.status}`);
  return response.text();
}

export interface Stm32f4Emulator {
  readonly chip: {
    label: string;
    flashBytes: number;
    ramBytes: number;
    clockHz: number;
  };
  /** Execute up to `maxInstructions`; returns instructions actually run. */
  step(maxInstructions?: number): number;
  /**
   * Drain UART output and output-pin edges since the last drain.
   * Pin names are port+bit ("PC13"), matching the board silkscreen.
   */
  drain(
    onSerial: (text: string) => void,
    onPin: (name: string, high: boolean) => void,
  ): void;
  dispose(): void;
}

export type Stm32f4Result =
  | {
      ok: true;
      emulator: Stm32f4Emulator;
      imageBytes: number;
      chipLabel: string;
    }
  | { ok: false; reason: string };

interface Stm32f4Handle {
  step(maxInst?: number): { pc: number; stopped: boolean; instCount: number };
  drainUart(): Uint8Array | number[] | string;
  read32(addr: number): number;
  close(): void;
}

function uartText(bytes: ArrayLike<number> | string): string {
  if (typeof bytes === "string") return bytes;
  const list = Array.from(bytes);
  let text = "";
  for (let i = 0; i < list.length; i += 0x1000)
    text += String.fromCharCode(...list.slice(i, i + 0x1000));
  return text;
}

function wrap(
  handle: Stm32f4Handle,
  key: Stm32f4ChipKey,
  imageBytes: number,
): Stm32f4Result {
  const model = CHIPS[key];
  const banks = Math.min(6, STM32F4_GPIO_ODR.length);
  const last = new Map<string, boolean>();
  const edges: { name: string; high: boolean }[] = [];

  const sample = (seed: boolean) => {
    for (let bank = 0; bank < banks; bank++) {
      const odr = handle.read32(STM32F4_GPIO_ODR[bank]!) >>> 0;
      const port = PORT_LETTERS[bank];
      if (!port) continue;
      for (let bit = 0; bit < 16; bit++) {
        // Silkscreen form: P<port><bit>, e.g. PC13 (the Black Pill LED).
        const name = `P${port}${bit}`;
        const high = ((odr >>> bit) & 1) === 1;
        if (last.get(name) === high) continue;
        last.set(name, high);
        if (!seed) edges.push({ name, high });
      }
    }
  };
  sample(true);
  // The core reports a cumulative instruction count; budgets need deltas.
  let cumulative = 0;

  const emulator: Stm32f4Emulator = {
    chip: {
      label: model.label,
      flashBytes: model.flash,
      ramBytes: model.ram,
      clockHz: model.mhz * 1_000_000,
    },
    step(maxInstructions = 100_000) {
      let ran = 0;
      while (ran < maxInstructions) {
        const slice = Math.min(SAMPLE_STRIDE, maxInstructions - ran);
        const result = handle.step(slice);
        const total =
          typeof result?.instCount === "number"
            ? result.instCount
            : cumulative + slice;
        const done = Math.max(0, total - cumulative);
        cumulative = total;
        ran += done;
        sample(false);
        if (done <= 0 && result?.stopped) break;
        if (done <= 0) ran += slice; // no count reported; keep the budget moving
      }
      return ran;
    },
    drain(onSerial, onPin) {
      // The WASM bridge has returned bytes as a string and as an array.
      const bytes = handle.drainUart();
      if (bytes.length) onSerial(uartText(bytes as ArrayLike<number> | string));
      for (const edge of edges.splice(0)) onPin(edge.name, edge.high);
    },
    dispose() {
      try {
        handle.close();
      } catch {
        /* already closed */
      }
    },
  };

  return { ok: true, emulator, imageBytes, chipLabel: model.label };
}

/**
 * Boot a raw `.bin` / Intel `.hex` / ELF firmware image on the emulated STM32F4
 * core that matches `mcu`. Returns a reason instead of throwing.
 */
export async function makeStm32f4(
  payload: string,
  mcu: string,
): Promise<Stm32f4Result> {
  const key = chipKeyFor(mcu);
  if (!key) return { ok: false, reason: `no STM32F4 core for ${mcu}` };
  const bytes = bytesOf(payload);
  if (bytes.length === 0) return { ok: false, reason: "empty firmware image" };
  const model = CHIPS[key];
  if (bytes.length > model.flash) {
    return {
      ok: false,
      reason: `image is ${Math.ceil(bytes.length / 1024)} KB but ${model.label} has ${Math.round(model.flash / 1024)} KB of flash`,
    };
  }

  try {
    const handle = (await createEmulator({
      firmware: bytes,
      bindings,
      wasmInit: await wasmBytes(),
      svdXml: await svdXml(model),
      svdFile: model.svd,
      chipHint: model.svd.replace(/\.svd$/, ""),
      flash_size: model.flash,
      ram_size: model.ram,
    })) as unknown as Stm32f4Handle;
    return wrap(handle, key, bytes.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `firmware did not load: ${message}` };
  }
}
