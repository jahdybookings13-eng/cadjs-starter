// ecad/avrBuild.ts — compile Arduino C++ to Intel HEX inside the browser.
//
// The heavy lifting is @horang-corp/avr-gcc-wasm: cc1plus, avr-as, avr-ld and
// avr-objcopy built to WebAssembly, linked against prebuilt Arduino core
// objects. This module owns the part the app cares about: which boards that
// toolchain actually targets, where its assets are served from, and a worker
// round-trip that cannot block the render loop.
//
// Honest scope: the toolchain targets ATmega328P (Arduino Uno / Nano) — the
// same MCU the avr8js tier emulates. Other boards still run the virtual tier.

import type { EcadPart } from "./catalog";
import { chipFor } from "./avrChips";

export interface AvrBuildResult {
  /** Intel HEX text, ready for `EcadSim.deploy({ hex })`. */
  hex: string;
  /** Bytes of flash actually used. */
  flashBytes: number;
  /** False when the sketch overflows the Uno's application budget. */
  fitsTarget: boolean;
  bytes: number;
  ms: number;
  stderr: string[];
}

export type AvrBuildOutcome =
  | { ok: true; result: AvrBuildResult }
  | { ok: false; error: string; stderr: string[] };

export interface AvrBuildRequest {
  source: string;
  constants?: Record<string, string>;
  assetsBase?: string;
}

/** Can the in-browser C++ toolchain build for this placed part? */
export function avrCppTarget(part: EcadPart | undefined): boolean {
  return (
    !!part &&
    part.category === "board" &&
    part.family === "avr" &&
    part.mcu === "ATmega328P"
  );
}

/**
 * Why the in-browser C++ build cannot target this board — and the path that
 * does work. `null` when the board is buildable.
 *
 * Reverse-engineered, not guessed: the shipped toolchain hardcodes
 * `-mmcu=atmega328p` / multilib `avr5` and links prebuilt Arduino core
 * objects, crt and libc built for the 328P (assets/objects/core_*.o,
 * assets/libs/crtatmega328p.o). There are no Mega/32U4/ATtiny core objects to
 * link, so compiling for them would produce a binary with the wrong pin tables
 * and interrupt slots — exactly the "compiled" badge that would be a lie.
 */
export function avrBuildRefusal(part: EcadPart | undefined): string | null {
  if (avrCppTarget(part)) return null;
  if (!part) return "no board selected";
  if (part.category !== "board")
    return `in-browser C++ builds microcontroller firmware; "${part.name}" is a ${part.category}.`;
  const chip = chipFor(part.mcu);
  if (chip) {
    return `in-browser C++ ships ATmega328P core objects only, so it cannot build for ${part.name} (${part.mcu}). Build that sketch for ${part.mcu} in Arduino IDE and upload the .hex — the ${part.mcu} emulator runs it.`;
  }
  return `in-browser C++ targets ATmega328P (Uno/Nano); ${part.name} is ${part.mcu}, which has neither an AVR toolchain nor an emulator. Upload a binary for delivery.`;
}

/** Where `public/avr/{tools,assets}` is served from. */
export function avrAssetsBase(): string {
  const base =
    typeof document !== "undefined" && document.baseURI
      ? document.baseURI
      : "http://localhost/";
  return new URL("avr/", base).href;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Compile in a dedicated module worker (fresh memory per build, terminated
 * afterwards). Never throws for a bad sketch — a failed compile is an answer.
 */
export async function buildAvrFirmware(opts: {
  source: string;
  constants?: Record<string, string>;
  timeoutMs?: number;
}): Promise<AvrBuildOutcome> {
  if (typeof Worker === "undefined") {
    return {
      ok: false,
      error:
        "This environment has no Worker — the AVR toolchain needs a browser.",
      stderr: [],
    };
  }
  const worker = new Worker(new URL("./avrBuildWorker.ts", import.meta.url), {
    type: "module",
  });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const request: AvrBuildRequest = {
    source: opts.source,
    constants: opts.constants ?? {},
    assetsBase: avrAssetsBase(),
  };

  return new Promise<AvrBuildOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: AvrBuildOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(outcome);
    };
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          error: `Compile timed out after ${Math.round(timeoutMs / 1000)}s.`,
          stderr: [],
        }),
      timeoutMs,
    );

    worker.addEventListener("message", (event: MessageEvent<AvrBuildOutcome>) =>
      finish(event.data),
    );
    worker.addEventListener("error", (event) => {
      finish({
        ok: false,
        error: event.message || "AVR compiler worker failed",
        stderr: [],
      });
    });
    worker.postMessage(request);
  });
}
