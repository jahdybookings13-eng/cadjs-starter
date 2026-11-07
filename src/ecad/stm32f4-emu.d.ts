// Ambient types for the stm32f4-emu package. Its root index.d.ts is hidden by
// its "exports" map, and the browser-safe subpath entries we use
// (./emulator, ./vendor) are untyped JavaScript. These declarations cover only
// the surface this app touches.

declare module "stm32f4-emu" {
  export interface Stm32f4StepResult {
    pc: number;
    stopped: boolean;
    instCount: number;
  }

  export interface Stm32f4Handle {
    step(maxInst?: number): Stm32f4StepResult;
    drainUart(): Uint8Array | number[] | string;
    read32(addr: number): number;
    close(): void;
    [key: string]: unknown;
  }

  export function chipInfo(key?: string): {
    label: string;
    flash_size: number;
    ram_size: number;
    maxClockMHz: number;
    gpioBanks: number;
  };
  export function decodeFirmware(key: string): Uint8Array;
  export const FIRMWARES: Record<string, { name?: string; bytes: string }>;
}

declare module "stm32f4-emu/emulator" {
  import type { Stm32f4Handle } from "stm32f4-emu";
  export function createEmulator(
    opts: Record<string, unknown>,
  ): Promise<Stm32f4Handle>;
}

declare module "stm32f4-emu/vendor" {
  /** wasm-bindgen glue; `default()` instantiates the core. */
  const bindings: {
    default?: (opts?: { module_or_path?: unknown }) => Promise<unknown>;
    [key: string]: unknown;
  };
  export default bindings;
}
