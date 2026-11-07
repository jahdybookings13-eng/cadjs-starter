// ecad/target.ts — what silicon each catalog board actually carries.
//
// Used to verify a firmware image against the board it is being attached to:
// an ARM ELF must not land on an Xtensa ESP32, and an image bigger than the
// chip's flash is not "ready for delivery", it is a file that will not boot.
//
// Flash/RAM numbers are the device (or module) figures a firmware build targets.
// Pure data: no DOM, no emulator imports.

export type McuArch = "avr" | "arm" | "xtensa";

export interface TargetProfile {
  /** Catalog mcu string, uppercased for matching. */
  mcu: string;
  arch: McuArch;
  /** Human-readable core, e.g. "Cortex-M0+". */
  core: string;
  /** Application flash the linker has to fit into. */
  flashBytes: number;
  ramBytes: number;
}

const TARGETS: readonly TargetProfile[] = [
  // AVR — all four emulate in-app.
  {
    mcu: "ATMEGA328P",
    arch: "avr",
    core: "8-bit AVR",
    flashBytes: 32 * 1024,
    ramBytes: 2048,
  },
  {
    mcu: "ATMEGA2560",
    arch: "avr",
    core: "8-bit AVR",
    flashBytes: 256 * 1024,
    ramBytes: 8192,
  },
  {
    mcu: "ATMEGA32U4",
    arch: "avr",
    core: "8-bit AVR",
    flashBytes: 32 * 1024,
    ramBytes: 2560,
  },
  {
    mcu: "ATTINY85",
    arch: "avr",
    core: "8-bit AVR",
    flashBytes: 8 * 1024,
    ramBytes: 512,
  },
  // Xtensa — the classic ESP32 (LX6) runs in-app; the S3 (LX7) and ESP8266
  // (L106) are different cores and stay on the verified-image path.
  {
    mcu: "ESP32-WROOM-32",
    arch: "xtensa",
    core: "Xtensa LX6 (dual)",
    flashBytes: 4 * 1024 * 1024,
    ramBytes: 520 * 1024,
  },
  {
    mcu: "ESP32-S3-WROOM-1",
    arch: "xtensa",
    core: "Xtensa LX7 (dual)",
    flashBytes: 8 * 1024 * 1024,
    ramBytes: 512 * 1024,
  },
  {
    mcu: "ESP8266EX",
    arch: "xtensa",
    core: "Xtensa L106",
    flashBytes: 4 * 1024 * 1024,
    ramBytes: 80 * 1024,
  },
  // ARM — RP2040 and STM32F4 run in-app; the rest are delivery-only.
  {
    mcu: "RP2040",
    arch: "arm",
    core: "Cortex-M0+ (dual)",
    flashBytes: 2 * 1024 * 1024,
    ramBytes: 264 * 1024,
  },
  {
    mcu: "RP2040 + CYW43439",
    arch: "arm",
    core: "Cortex-M0+ (dual)",
    flashBytes: 2 * 1024 * 1024,
    ramBytes: 264 * 1024,
  },
  {
    mcu: "STM32F411CEU6",
    arch: "arm",
    core: "Cortex-M4F",
    flashBytes: 512 * 1024,
    ramBytes: 128 * 1024,
  },
  {
    mcu: "STM32F103C8T6",
    arch: "arm",
    core: "Cortex-M3",
    flashBytes: 64 * 1024,
    ramBytes: 20 * 1024,
  },
  {
    mcu: "I.MX RT1062",
    arch: "arm",
    core: "Cortex-M7",
    flashBytes: 2 * 1024 * 1024,
    ramBytes: 1024 * 1024,
  },
  {
    mcu: "NRF52833",
    arch: "arm",
    core: "Cortex-M4F",
    flashBytes: 512 * 1024,
    ramBytes: 128 * 1024,
  },
  {
    mcu: "AT91SAM3X8E",
    arch: "arm",
    core: "Cortex-M3",
    flashBytes: 512 * 1024,
    ramBytes: 96 * 1024,
  },
];

/** Target profile for a catalog `mcu` string, or null when it is unknown. */
export function targetFor(mcu: string | undefined): TargetProfile | null {
  if (!mcu) return null;
  const key = mcu.trim().toUpperCase();
  return TARGETS.find((t) => t.mcu === key) ?? null;
}

/** Every profile, for capability reporting. */
export function allTargets(): readonly TargetProfile[] {
  return TARGETS;
}

export function kilobytes(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10;
}
