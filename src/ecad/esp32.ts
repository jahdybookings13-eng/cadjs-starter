// ecad/esp32.ts — real Xtensa LX6 execution for the classic ESP32.
//
// `esp32sim` (MIT, https://github.com/mikroverk/esp32sim) is a Rust emulator of
// the Espressif chips compiled to WebAssembly. We build it from source and
// ship the module in public/esp32/; there is no npm package and no committed
// upstream WASM. The module exports a plain C ABI (no wasm-bindgen), so this
// adapter is the host: it allocates ABI buffers, drives `esp32sim_run` in
// slices, and decodes the JSON outbox into serial text.
//
// Booting an ESP32 is not "load one .bin": the classic chip starts in its mask
// ROM, which reads the 2nd-stage bootloader at flash 0x1000, the partition
// table at 0x8000 and the app at 0x10000. We therefore accept a merged flash
// image (bootloader/app at their ESP32 offsets), load it whole through
// `esp32sim_load` kind 5 and boot it through the real ROM. App-only images are
// refused: esp32sim's classic ESP32 has no synthetic app boot, so entering one
// directly would mean skipping the ROM and the 2nd-stage setup it performs.
// The mask-ROM ELF is Espressif's Apache-2.0 `esp32_rev300_rom.elf`, staged by
// tools/fetch-rom-elfs.sh and shipped in public/esp32/ with its notice.
//
// Scope is the Xtensa LX6 (ESP32-WROOM-32) only. The S3 (LX7), C3/C6 (RISC-V)
// and ESP8266 (L106) are different cores and stay on the verified-image path.
//
// Output: esp32sim's text outbox is JSON (`{"t":"serial","src":"uart0",
// "data":"…"}`), not raw console bytes. Serial is relayed; display/audio
// binary frames are dropped because the DevKit has no panel or codec.
//
// Pins are real. esp32sim records every GPIO output edge as it reaches the
// board and every input the host drives; the ABI here exposes both. The
// classic ESP32 also has the virtual access point (`esp32sim_wifi`) and the
// VHCI Bluetooth controller. Wi-Fi attaches before boot. Bluetooth needs the
// application ELF's symbol table (`enable_ble`), not just the .bin: the radio
// itself is not modelled, so the guest's controller hooks have to be named.
// Without the ELF the tier says so instead of pretending the radio is there.

import { bytesOf } from "./delivery";

export const ESP32_FLASH_BYTES = 4 * 1024 * 1024;
export const ESP32_RAM_BYTES = 520 * 1024;
export const ESP32_CLOCK_HZ = 240_000_000;
/** esp32sim's classic-ESP32 board name (bare esp32dev module). */
export const ESP32_BOARD = "esp32";
const ASSET_PATH = "/esp32";
const ROM_FILE = "esp32_rev300_rom.elf";
/** Where a combined (flashed at 0x1000) image starts. */
const COMBINED_OFFSET = 0x1000;

/** The virtual access point every classic ESP32 boots with. */
export const ESP32_WIFI_SPEC = "ssid=esp32sim,psk=esp32sim-pass";

/** ABI load kinds from esp32sim's wasm/src/lib.rs. */
const KIND_ROM = 0;
const KIND_FLASH = 5;

export type Esp32Layout = "merged" | "combined" | "app";

export interface Esp32Assets {
  wasm?: Uint8Array;
  rom?: Uint8Array;
}

let injected: Esp32Assets | null = null;
/**
 * Headless/test hook: supply the module and mask ROM directly. Node tests have
 * no page to fetch public/esp32/ from.
 */
export function setEsp32Assets(assets: Esp32Assets | null): void {
  injected = assets;
  wasmPromise = null;
  romPromise = null;
}

/** Only the classic ESP32. The S3 is an LX7 and the 8266 an L106. */
export function esp32ChipKey(mcu: string): "esp32" | null {
  const id = mcu.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^ESP32WROOM32[A-Z0-9]*$/.test(id) || id === "ESP32" ? "esp32" : null;
}

/**
 * Which flash layout the bytes carry:
 * - `merged`: `esptool merge_bin` output written at 0x0; the bootloader's
 *   0xE9 magic sits at 0x1000.
 * - `combined`: an image written at 0x1000 (stock MicroPython and many
 *   Arduino distributions) whose partition table and app follow inside it.
 * - `app`: a lone application image, which the classic ROM cannot enter.
 * An app image carries the ESP-IDF app descriptor magic at 0x20; a bootloader
 * does not, which tells the two 0xE9-leading images apart.
 */
export function esp32ImageLayout(bytes: Uint8Array): Esp32Layout | null {
  if (bytes.length === 0) return null;
  if (bytes[0] === 0xe9) {
    const appDescriptor =
      bytes.length >= 0x24 &&
      bytes[0x20] === 0x32 &&
      bytes[0x21] === 0x54 &&
      bytes[0x22] === 0xcd &&
      bytes[0x23] === 0xab;
    return appDescriptor ? "app" : "combined";
  }
  if (bytes.length > 0x1000 && bytes[0x1000] === 0xe9) return "merged";
  return null;
}

interface Esp32Wasm {
  memory: WebAssembly.Memory;
  __indirect_function_table: WebAssembly.Table;
  esp32sim_alloc(len: number): number;
  esp32sim_free(ptr: number, len: number): void;
  esp32sim_new(
    board: number,
    boardLen: number,
    flashMb: number,
    psramMb: number,
  ): number;
  esp32sim_delete(emu: number): void;
  esp32sim_load(emu: number, kind: number, ptr: number, len: number): number;
  esp32sim_load_at(
    emu: number,
    offset: number,
    ptr: number,
    len: number,
  ): number;
  esp32sim_wifi(emu: number, ptr: number, len: number): number;
  esp32sim_ble_enable(emu: number, ptr: number, len: number): number;
  esp32sim_gpio_enable(emu: number, on: number): number;
  esp32sim_gpio_take(emu: number): number;
  esp32sim_gpio_pin(emu: number, i: number): number;
  esp32sim_gpio_cycle(emu: number, i: number): number;
  esp32sim_gpio_level(emu: number, i: number): number;
  esp32sim_gpio_set(emu: number, pin: number, level: number): number;
  esp32sim_in_text(emu: number, ptr: number, len: number): void;
  esp32sim_boot(emu: number, appDirect: number): number;
  esp32sim_run(emu: number, cycles: number, unixMs: number): number;
  esp32sim_out_take(emu: number): number;
  esp32sim_out_kind(emu: number, i: number): number;
  esp32sim_out_ptr(emu: number, i: number): number;
  esp32sim_out_len(emu: number, i: number): number;
  esp32sim_cycles(emu: number): number;
  esp32sim_insns(emu: number): number;
  esp32sim_cpu_hz(emu: number): number;
  esp32sim_set_jit(emu: number, enabled: number): void;
}

/**
 * The JIT host from upstream web/wasm/jit.mjs: compile a guest block into a
 * module that shares the emulator's memory/table. Compilation failure is safe
 * — the emulator keeps interpreting.
 */
function createJitHost(exports: () => Esp32Wasm) {
  const free: number[] = [];
  const live = new Map<number, number>();
  return {
    host_jit_compile(ptr: number, len: number): number {
      try {
        const w = exports();
        const bytes = new Uint8Array(w.memory.buffer, ptr, len).slice();
        const module = new WebAssembly.Module(bytes);
        const instance = new WebAssembly.Instance(module, {
          env: { memory: w.memory, table: w.__indirect_function_table },
        });
        const slot = free.length
          ? free.pop()!
          : (w.__indirect_function_table.grow(1) as number);
        w.__indirect_function_table.set(slot, instance.exports.run);
        live.set(slot, len);
        return slot;
      } catch {
        return 0;
      }
    },
    host_jit_release(slot: number): void {
      if (!live.has(slot)) return;
      live.delete(slot);
      exports().__indirect_function_table.set(slot, null);
      free.push(slot);
    },
  };
}

let wasmPromise: Promise<Uint8Array> | null = null;
let romPromise: Promise<Uint8Array> | null = null;

async function fetchAsset(file: string): Promise<Uint8Array> {
  const response = await fetch(`${ASSET_PATH}/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function wasmBytes(): Promise<Uint8Array> {
  if (injected?.wasm) return Promise.resolve(injected.wasm);
  wasmPromise ??= fetchAsset("esp32sim.wasm");
  return wasmPromise;
}

function romBytes(): Promise<Uint8Array> {
  if (injected?.rom) return Promise.resolve(injected.rom);
  romPromise ??= fetchAsset(ROM_FILE);
  return romPromise;
}

export interface Esp32Options {
  /**
   * Virtual access point spec (`ssid=…,psk=…,chan=…`); `null` starts with no
   * radio. Defaults to {@link ESP32_WIFI_SPEC}, so firmware that joins that AP
   * works out of the box.
   */
  wifi?: string | null;
  /**
   * Application ELF. Enables the virtual Bluetooth controller: esp32sim needs
   * the guest's controller symbols, which a flash .bin does not carry.
   */
  bleElf?: Uint8Array | null;
}

export interface Esp32Emulator {
  readonly chip: {
    label: string;
    flashBytes: number;
    ramBytes: number;
    clockHz: number;
    arch: "xtensa";
  };
  /** The access point attached before boot, or null when the radio is off. */
  readonly wifi: string | null;
  /** Whether the VHCI Bluetooth controller was enabled from an ELF. */
  readonly ble: boolean;
  /** Run up to `maxCycles`; returns the cycles actually executed. */
  step(maxCycles?: number): number;
  /**
   * Drain serial text accumulated since the last drain, and the GPIO edges the
   * firmware drove (output levels) or the host changed (inputs).
   */
  drain(
    onSerial: (text: string) => void,
    onPin?: (pin: number, high: boolean, cycle: number) => void,
  ): void;
  /** Drive a GPIO pad from the board's peripherals (a button, sensor, jumper). */
  setGpioInput(pin: number, high: boolean): void;
  /** Type a line into the firmware's console (a REPL or line-oriented stdin). */
  writeLine(line: string): void;
  /** Non-null once the core stops (unimplemented instruction, exception…). */
  readonly stopCode: number | null;
  /** Cumulative emulated cycles (diagnostics and pacing). */
  readonly cycles: number;
  dispose(): void;
}

export type Esp32Result =
  | {
      ok: true;
      emulator: Esp32Emulator;
      imageBytes: number;
      layout: Esp32Layout;
      chipLabel: string;
    }
  | { ok: false; reason: string };

/** Split concatenated JSON objects (the outbox has no delimiters). */
function splitMessages(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

interface Esp32WireMessage {
  t?: string;
  data?: string;
  msg?: string;
}

const CHIP_LABEL = "ESP32-WROOM-32 (Xtensa LX6)";

/**
 * Boot an ESP32 image on the emulated Xtensa LX6. `mcu` must be a classic
 * ESP32-WROOM-32; anything else is refused rather than silently mismatched.
 */
export async function makeEsp32(
  payload: string,
  mcu: string,
  options: Esp32Options = {},
): Promise<Esp32Result> {
  if (!esp32ChipKey(mcu))
    return {
      ok: false,
      reason: `no Xtensa LX6 core for ${mcu} — this tier emulates the classic ESP32 only (the S3 is LX7, the 8266 L106)`,
    };
  const bytes = bytesOf(payload);
  if (bytes.length === 0) return { ok: false, reason: "empty firmware image" };
  // An Xtensa ELF carries symbols/segments, not the flash layout the ROM reads.
  if (
    bytes[0] === 0x7f &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x46
  )
    return {
      ok: false,
      reason:
        "Xtensa ELF is not a flash image — upload the .bin app image or a merged flash image (bootloader at 0x1000)",
    };
  const layout = esp32ImageLayout(bytes);
  if (!layout)
    return {
      ok: false,
      reason:
        "not an ESP32 image: expected the 0xE9 bootloader magic at 0x1000 (merged flash image)",
    };
  if (layout === "app")
    return {
      ok: false,
      reason:
        "app-only ESP32 images cannot boot here: esp32sim's classic ESP32 has no synthetic app boot (boot_app is unsupported). Upload a merged flash image (bootloader at 0x1000, partition table at 0x8000, app at 0x10000) or a combined image written at 0x1000 (MicroPython, Arduino).",
    };
  if (bytes.length > ESP32_FLASH_BYTES)
    return {
      ok: false,
      reason: `image is ${Math.ceil(bytes.length / 1024)} KB but the ESP32-WROOM-32 has ${ESP32_FLASH_BYTES / 1024 / 1024} MB of flash`,
    };

  // Merged images start in the mask ROM; without it the run would execute from
  // empty memory and print nothing, so refuse instead of pretending.
  let rom: Uint8Array;
  try {
    rom = await romBytes();
  } catch (error) {
    return {
      ok: false,
      reason: `mask ROM missing (${error instanceof Error ? error.message : String(error)}) — merged flash images need /esp32/${ROM_FILE}`,
    };
  }
  if (rom.length === 0)
    return {
      ok: false,
      reason: `mask ROM is empty — merged flash images need /esp32/${ROM_FILE}`,
    };

  const setupLogs: string[] = [];
  let wasm!: Esp32Wasm;
  try {
    const module = await WebAssembly.instantiate(await wasmBytes(), {
      env: {
        ...createJitHost(() => wasm),
        host_log: (ptr: number, len: number) => {
          if (!wasm) return;
          const text = new TextDecoder().decode(
            new Uint8Array(wasm.memory.buffer, ptr, len),
          );
          if (text) setupLogs.push(text);
        },
      },
    });
    const exports =
      (
        module as unknown as {
          instance?: { exports: unknown };
          exports?: unknown;
        }
      ).instance?.exports ??
      (module as unknown as { exports?: unknown }).exports;
    wasm = exports as Esp32Wasm;
  } catch (error) {
    return {
      ok: false,
      reason: `ESP32 core failed to instantiate: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const memory = () => new Uint8Array(wasm.memory.buffer);
  const withBytes = <T>(
    data: Uint8Array,
    fn: (ptr: number, len: number) => T,
  ): T => {
    const ptr = wasm.esp32sim_alloc(data.length);
    memory().set(data, ptr);
    try {
      return fn(ptr, data.length);
    } finally {
      wasm.esp32sim_free(ptr, data.length);
    }
  };

  const emu = withBytes(new TextEncoder().encode(ESP32_BOARD), (ptr, len) =>
    wasm.esp32sim_new(ptr, len, ESP32_FLASH_BYTES / 1024 / 1024, 0),
  );
  if (!emu)
    return {
      ok: false,
      reason: `ESP32 core rejected the board (${setupLogs.at(-1) ?? "no reason logged"})`,
    };

  const load = (kind: number, data: Uint8Array) =>
    withBytes(data, (ptr, len) => {
      if (wasm.esp32sim_load(emu, kind, ptr, len) !== 0)
        throw new Error(`load kind ${kind}: ${setupLogs.at(-1) ?? "rejected"}`);
    });
  const loadAt = (offset: number, data: Uint8Array) =>
    withBytes(data, (ptr, len) => {
      if (wasm.esp32sim_load_at(emu, offset, ptr, len) !== 0)
        throw new Error(`flash ${offset}: ${setupLogs.at(-1) ?? "rejected"}`);
    });

  const wifiSpec = options.wifi === undefined ? ESP32_WIFI_SPEC : options.wifi;
  let bleEnabled = false;
  try {
    load(KIND_ROM, rom);
    if (layout === "combined") loadAt(COMBINED_OFFSET, bytes);
    else load(KIND_FLASH, bytes);
    // The radio is configured before boot: the guest's driver then finds the AP
    // and the virtual subnet already up, as if it had been switched on.
    if (wifiSpec)
      withBytes(new TextEncoder().encode(wifiSpec), (ptr, len) => {
        if (wasm.esp32sim_wifi(emu, ptr, len) !== 0)
          throw new Error(
            `virtual access point: ${setupLogs.at(-1) ?? "rejected"}`,
          );
      });
    if (options.bleElf)
      withBytes(options.bleElf, (ptr, len) => {
        if (wasm.esp32sim_ble_enable(emu, ptr, len) !== 0)
          throw new Error(`Bluetooth: ${setupLogs.at(-1) ?? "rejected"}`);
      });
    bleEnabled = options.bleElf != null;
    wasm.esp32sim_gpio_enable(emu, 1);
    if (wasm.esp32sim_boot(emu, 0) !== 0)
      throw new Error(
        `boot through mask ROM: ${setupLogs.at(-1) ?? "rejected"}`,
      );
  } catch (error) {
    wasm.esp32sim_delete(emu);
    return {
      ok: false,
      reason: `firmware did not load: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  wasm.esp32sim_set_jit(emu, 1);

  let pending = "";
  let queued = setupLogs.length > 0 ? `${setupLogs.join("\n")}\n` : "";
  let stopCode: number | null = null;
  const clockHz = wasm.esp32sim_cpu_hz(emu) || ESP32_CLOCK_HZ;
  // esp32sim's timers/RTC read the unix time passed to run(). This tier runs as
  // fast as the host allows, so wall time would make the bootloader idle (or
  // reset on its watchdog) between slices: give it time that tracks the
  // emulated cycle count instead.
  const epoch = Date.now();

  const emulator: Esp32Emulator = {
    chip: {
      label: CHIP_LABEL,
      flashBytes: ESP32_FLASH_BYTES,
      ramBytes: ESP32_RAM_BYTES,
      clockHz,
      arch: "xtensa",
    },
    wifi: wifiSpec,
    ble: bleEnabled,
    setGpioInput(pin, high) {
      if (stopCode !== null) return;
      wasm.esp32sim_gpio_set(emu, pin, high ? 1 : 0);
    },
    writeLine(line) {
      if (stopCode !== null) return;
      withBytes(
        new TextEncoder().encode(JSON.stringify({ t: "serial", line })),
        (ptr, len) => wasm.esp32sim_in_text(emu, ptr, len),
      );
    },
    step(maxCycles = 2_000_000) {
      if (stopCode !== null) return 0;
      const before = wasm.esp32sim_cycles(emu);
      const rc = wasm.esp32sim_run(
        emu,
        Math.max(1, Math.floor(maxCycles)),
        epoch + (before / clockHz) * 1000,
      );
      const after = wasm.esp32sim_cycles(emu);
      // Copy the outbox before the next run invalidates its pointers.
      const count = wasm.esp32sim_out_take(emu);
      for (let i = 0; i < count; i++) {
        if (wasm.esp32sim_out_kind(emu, i) !== 1) continue; // binary display/audio
        const ptr = wasm.esp32sim_out_ptr(emu, i);
        const len = wasm.esp32sim_out_len(emu, i);
        const text = new TextDecoder().decode(
          memory().subarray(ptr, ptr + len),
        );
        for (const raw of splitMessages(text)) {
          try {
            const message = JSON.parse(raw) as Esp32WireMessage;
            if (message.t === "serial" && message.data) queued += message.data;
            else if (message.t === "emu" && message.msg)
              queued += `[emu] ${message.msg}\n`;
          } catch {
            /* a partial/unknown frame: ignore, never crash the board */
          }
        }
      }
      if (rc !== 0) stopCode = rc;
      return Math.max(0, after - before);
    },
    drain(onSerial, onPin) {
      const all = queued + pending;
      pending = "";
      const lines = all.split("\n");
      const tail = lines.pop() ?? "";
      for (const line of lines) onSerial(`${line}\n`);
      // Keep a partial line for the next slice, but do not buffer forever.
      if (tail.length > 4096) onSerial(`${tail}\n`);
      else pending = tail;
      // Always drain the edge batch so it cannot grow without a pin consumer.
      const count = wasm.esp32sim_gpio_take(emu);
      if (!onPin) return;
      for (let i = 0; i < count; i++)
        onPin(
          wasm.esp32sim_gpio_pin(emu, i),
          wasm.esp32sim_gpio_level(emu, i) === 1,
          wasm.esp32sim_gpio_cycle(emu, i),
        );
    },
    get stopCode() {
      return stopCode;
    },
    get cycles() {
      return wasm.esp32sim_cycles(emu);
    },
    dispose() {
      wasm.esp32sim_delete(emu);
    },
  };

  return {
    ok: true,
    emulator,
    imageBytes: bytes.length,
    layout,
    chipLabel: CHIP_LABEL,
  };
}
