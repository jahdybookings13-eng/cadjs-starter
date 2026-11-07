// ecad/studio.ts — "will this actually work when the parts arrive?"
//
// The simulator already runs firmware; this module is the judgment layer. It
// answers, for one placed board, the questions a maker wants answered BEFORE
// ordering hardware:
//
//   - does the firmware even compile, and does it define setup()/loop()?
//   - does every pin constant the sketch uses exist on THIS board?
//   - is that pin actually wired to something, and is the right thing on the
//     other end (a servo for Servo, a screen for Display, a buzzer for tone)?
//   - is a .hex being pushed at a board that cannot run it?
//   - did the last run throw?
//
// Pure and three.js-free, like the rest of ecad/: it reads a small structural
// view of the sim (StudioSim) so it is testable with a real EcadSim or a stub.
// The verdict is deliberately blunt — "ready" means "I have no reason to think
// this fails on hardware", not a guarantee.

import { pinsOf, type EcadPart, type PartPin } from "./catalog";
import { pinConstantsFor, type FirmwareEntry } from "./firmware";
import { parseHex } from "./hex";
import { inspectFirmware } from "./delivery";
import { chipFor } from "./avrChips";
import { looksLikeCxx } from "./avrSource";

export type StudioLevel = "error" | "warn" | "info";

export interface StudioFinding {
  /** Stable machine code (tests, AI, VR badges). */
  code: string;
  level: StudioLevel;
  message: string;
}

export interface StudioPinUse {
  constant: string;
  pin: string;
  /** Pin function on the board (gpio / pwm / adc …), null if absent. */
  fn: string | null;
  /** Human label of the wired peer, or null when the pin is unconnected. */
  wiredTo: string | null;
}

export type StudioVerdict = "ready" | "needs-work" | "blocked";

export interface StudioReport {
  verdict: StudioVerdict;
  boardId: string | null;
  boardName: string;
  findings: StudioFinding[];
  pins: StudioPinUse[];
}

/** The slice of EcadSim this module needs. */
export interface StudioSim {
  readonly instances: {
    get(id: string): { id: string; partId: string } | undefined;
  };
  readonly wires: {
    from: { inst: string; pin: string };
    to: { inst: string; pin: string };
  }[];
  partOf(id: string): EcadPart | undefined;
  status(id: string): {
    running: boolean;
    error: string | null;
    tier: "virtual" | "hex" | "binary" | "rp2040" | "stm32f4" | "esp32" | null;
    firmwareId: string | null;
    serial: string[];
  };
  firmwareOf(id: string): FirmwareEntry | null;
}

/* ------------------------------------------------------------------------ */
/* Static checks                                                             */
/* ------------------------------------------------------------------------ */

/** Parse-only compile check: never executes the sketch. */
export function compileFirmware(
  code: string,
): { ok: true } | { ok: false; error: string } {
  try {
    // Same constructor the runtime uses, so this catches exactly what it would.
    new Function(`"use strict";\n${code}\n;return true;`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function hasEntrypoints(code: string): boolean {
  return (
    /(?:function\s+setup\s*\(|(?:const|let|var)\s+setup\s*=|setup\s*=)/.test(
      code,
    ) ||
    /(?:function\s+loop\s*\(|(?:const|let|var)\s+loop\s*=|loop\s*=)/.test(code)
  );
}

/** Pin constants the sketch mentions (LED_PIN, BTN_PIN, R_PIN, …). */
export function pinConstantsUsed(code: string): string[] {
  const found = new Set<string>();
  for (const m of code.matchAll(/\b([A-Z][A-Z0-9]*_PIN)\b/g)) {
    if (m[1]) found.add(m[1]);
  }
  return [...found].sort();
}

/* ------------------------------------------------------------------------ */
/* Analysis                                                                  */
/* ------------------------------------------------------------------------ */

function findPin(pins: PartPin[], name: string): PartPin | null {
  const exact = pins.find((p) => p.name === name);
  if (exact) return exact;
  const ci = name.toLowerCase();
  return pins.find((p) => p.name.toLowerCase() === ci) ?? null;
}

function wiredPeer(
  sim: StudioSim,
  boardInst: string,
  pin: string,
): { inst: string; pin: string; part: EcadPart | undefined } | null {
  for (const w of sim.wires) {
    if (w.from.inst === boardInst && w.from.pin === pin) {
      return { inst: w.to.inst, pin: w.to.pin, part: sim.partOf(w.to.inst) };
    }
    if (w.to.inst === boardInst && w.to.pin === pin) {
      return {
        inst: w.from.inst,
        pin: w.from.pin,
        part: sim.partOf(w.from.inst),
      };
    }
  }
  return null;
}

function peerLabel(peer: {
  inst: string;
  pin: string;
  part: EcadPart | undefined;
}): string {
  return `${peer.part?.name ?? peer.inst}.${peer.pin}`;
}

/** Every part wired to this board, once each. */
function wiredParts(
  sim: StudioSim,
  boardInst: string,
): { inst: string; part: EcadPart }[] {
  const out = new Map<string, EcadPart>();
  for (const w of sim.wires) {
    const other =
      w.from.inst === boardInst
        ? w.to.inst
        : w.to.inst === boardInst
          ? w.from.inst
          : null;
    if (!other) continue;
    const part = sim.partOf(other);
    if (part) out.set(other, part);
  }
  return [...out].map(([inst, part]) => ({ inst, part }));
}

export function analyzeBoard(
  sim: StudioSim,
  boardInst: string,
  opts: { code?: string } = {},
): StudioReport {
  const findings: StudioFinding[] = [];
  const part = sim.partOf(boardInst);
  const board = part && part.category === "board" ? part : null;
  const fw = sim.firmwareOf(boardInst);
  const code = opts.code ?? fw?.source ?? "";
  const tier = fw?.tier ?? "virtual";

  if (!board) {
    return {
      verdict: "blocked",
      boardId: null,
      boardName: boardInst,
      findings: [
        {
          code: "not-a-board",
          level: "error",
          message: `"${boardInst}" is not a placed microcontroller board.`,
        },
      ],
      pins: [],
    };
  }

  const pins = pinsOf(board);

  // ---- firmware presence + static validity --------------------------------
  if (!code.trim()) {
    findings.push({
      code: "no-firmware",
      level: "error",
      message:
        "No firmware deployed. Write a sketch (or pick a template) first.",
    });
  } else if (tier === "virtual" && chipFor(board.mcu) && looksLikeCxx(code)) {
    // C++ is not JS: the real check is the wasm toolchain build, not a parse.
    const chip = chipFor(board.mcu);
    findings.push(
      chip?.buildable
        ? {
            code: "cxx-source",
            level: "info",
            message:
              "Arduino C++ source — build it in the browser (⚙ build C++) to produce the .hex this board runs.",
          }
        : {
            code: "cxx-source",
            level: "warn",
            message: `Arduino C++ for ${board.mcu}: the shipped wasm toolchain has ATmega328P core objects only. Build it for ${board.mcu} in Arduino IDE and upload the .hex — this board's emulator runs it.`,
          },
    );
  } else if (tier === "virtual") {
    const compiled = compileFirmware(code);
    if (!compiled.ok) {
      findings.push({
        code: "compile",
        level: "error",
        message: `Does not compile: ${compiled.error}`,
      });
    } else if (!hasEntrypoints(code)) {
      findings.push({
        code: "entrypoints",
        level: "error",
        message: "Firmware defines neither setup() nor loop().",
      });
    }
  } else if (tier === "stm32f4") {
    const facts = inspectFirmware(code, board.mcu);
    findings.push(
      facts.issues.length
        ? {
            code: "firmware-mismatch",
            level: "error",
            message: facts.issues.join("; "),
          }
        : {
            code: "stm32f4-image",
            level: "info",
            message: `${facts.summary} — runs on the in-app Cortex-M4 core (GPIO, USART, timers, SPI, I2C, ADC/DAC, DMA).`,
          },
    );
  } else if (tier === "esp32") {
    const facts = inspectFirmware(code, board.mcu);
    findings.push(
      facts.issues.length
        ? {
            code: "firmware-mismatch",
            level: "error",
            message: facts.issues.join("; "),
          }
        : {
            code: "esp32-image",
            level: "info",
            message: `${facts.summary} — runs on the in-app Xtensa LX6 through Espressif's mask ROM. GPIO edges drive wired parts and the virtual access point 'esp32sim' is attached for Wi-Fi (stock-blob association is not yet validated); Bluetooth runs when the application ELF (its symbol table) is attached.`,
          },
    );
  } else if (tier === "rp2040") {
    const facts = inspectFirmware(code, board.mcu);
    findings.push(
      facts.issues.length
        ? {
            code: "firmware-mismatch",
            level: "error",
            message: facts.issues.join("; "),
          }
        : {
            code: "rp2040-image",
            level: "info",
            message: `${facts.summary} — runs on the in-app RP2040 (Cortex-M0+). Boot-vector images only; firmware that calls mask-ROM functions may not finish booting.`,
          },
    );
  } else if (tier === "binary") {
    const facts = inspectFirmware(code, board.mcu);
    findings.push(
      facts.issues.length
        ? {
            code: "firmware-mismatch",
            level: "error",
            message: facts.issues.join("; "),
          }
        : {
            code: "binary-attached",
            level: "info",
            message: `${facts.summary} · ${board.name} (${board.mcu}) has no in-app emulator — this image is attached for delivery. Flash it with the vendor tool.`,
          },
    );
  } else {
    const records = parseHex(code);
    if (records.length === 0) {
      findings.push({
        code: "hex-parse",
        level: "error",
        message: "The .hex is empty or not Intel HEX.",
      });
    }
    if (!chipFor(board.mcu)) {
      findings.push({
        code: "hex-not-avr",
        level: "error",
        message: `${board.name} (${board.mcu}) has no AVR emulator — use the virtual tier or a matching binary.`,
      });
    }
  }

  // ---- pin constants ------------------------------------------------------
  const constants = pinConstantsFor(board.id);
  const uses: StudioPinUse[] = [];
  for (const constant of pinConstantsUsed(code)) {
    const pinName = constants[constant];
    if (pinName === undefined) {
      findings.push({
        code: "constant-unknown",
        level: "warn",
        message: `${constant} has no default pin on ${board.name}; the sketch will fail at runtime unless you define it.`,
      });
      continue;
    }
    const pin = findPin(pins, pinName);
    if (!pin) {
      findings.push({
        code: "pin-missing",
        level: "error",
        message: `${constant} = ${pinName}, but ${board.name} has no pin "${pinName}".`,
      });
      uses.push({ constant, pin: pinName, fn: null, wiredTo: null });
      continue;
    }
    const peer = wiredPeer(sim, boardInst, pin.name);
    uses.push({
      constant,
      pin: pin.name,
      fn: pin.fn,
      wiredTo: peer ? peerLabel(peer) : null,
    });
    if (!peer) {
      findings.push({
        code: "pin-unwired",
        level: "warn",
        message: `${constant} (${pin.name}) is not wired to anything — the code runs, but the circuit does nothing.`,
      });
    }
  }

  // ---- peripheral expectations -------------------------------------------
  const peers = wiredParts(sim, boardInst);
  const hasKind = (kind: string) =>
    peers.some((p) => p.part.category === "peripheral" && p.part.kind === kind);
  const hasDisplay = peers.some((p) => p.part.category === "display");

  if (/\bServo\./.test(code) && !hasKind("servo")) {
    findings.push({
      code: "servo-unwired",
      level: "warn",
      message: "The sketch drives Servo, but no servo is wired to this board.",
    });
  }
  if (/\bDisplay\./.test(code) && !hasDisplay) {
    findings.push({
      code: "display-unwired",
      level: "warn",
      message:
        "The sketch draws to Display, but no screen is wired to this board.",
    });
  }
  if (/\btone\s*\(/.test(code) && !hasKind("buzzer")) {
    findings.push({
      code: "buzzer-unwired",
      level: "warn",
      message: "The sketch calls tone(), but no buzzer is wired to this board.",
    });
  }
  if (/\bdigitalRead\s*\(/.test(code) && !hasKind("button")) {
    findings.push({
      code: "input-unwired",
      level: "info",
      message: "digitalRead() is used but no button is wired — inputs read 0.",
    });
  }
  if (/\banalogRead\s*\(/.test(code) && !hasKind("pot")) {
    findings.push({
      code: "analog-unwired",
      level: "info",
      message: "analogRead() is used but no pot is wired — inputs read 0.",
    });
  }

  // ---- last run -----------------------------------------------------------
  const st = sim.status(boardInst);
  if (st.error) {
    findings.push({
      code: "runtime-error",
      level: "error",
      message: `Last run failed: ${st.error}`,
    });
  } else if (st.running) {
    findings.push({
      code: "running",
      level: "info",
      message: `Firmware is running (${st.tier ?? tier})${st.firmwareId ? ` — ${st.firmwareId}` : ""}.`,
    });
  }

  const hasError = findings.some((f) => f.level === "error");
  const hasWarn = findings.some((f) => f.level === "warn");
  const verdict: StudioVerdict = hasError
    ? "blocked"
    : hasWarn
      ? "needs-work"
      : "ready";

  return {
    verdict,
    boardId: board.id,
    boardName: board.name,
    findings,
    pins: uses,
  };
}
