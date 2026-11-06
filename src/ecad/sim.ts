// ecad/sim.ts — the ScadGen ECAD simulation core.
//
// Owns: placed part instances, wires between pins, per-board firmware
// runtimes (virtual JS tier + real AVR hex tier), and the derived state the
// 3D layer reads every frame (LED levels, servo angles, display buffers,
// serial logs, button/pot inputs).
//
// NO three.js here — the scene layer (scene.ts) consumes `sim` state, which
// keeps the whole engine node-testable.

import {
  getPart,
  pinsOf,
  type BoardPart,
  type DisplayPart,
  type EcadPart,
  type PeripheralPart,
  type PinFunction,
} from "./catalog";
import {
  CharGridBuffer,
  ColorBuffer,
  MonoBuffer,
  SevenSegDriver,
  makeDisplayBackend,
} from "./displays";
import {
  McuRuntime,
  wallClock,
  type Clock,
  type DisplayApi,
  type DisplayBackend,
} from "./runtime";
import {
  firmwareFor,
  getFirmware,
  pinConstantsFor,
  type FirmwareEntry,
} from "./firmware";
import { makeAvr328p, watchAvrPins, type AvrEmulator } from "./avr";
import { UNO_BLINK_HEX } from "./hex";

export interface EcadInstance {
  id: string;
  partId: string;
  /** Stable handle for the 3D object (set by the scene layer). */
  objectId?: string;
  position: { x: number; y: number; z: number };
  rotation: number;
}

export interface EcadWire {
  id: string;
  from: { inst: string; pin: string };
  to: { inst: string; pin: string };
}

interface PinState {
  digital: 0 | 1;
  pwm: number;
  servo: number;
  tone: number | null;
}

type RuntimeHandle =
  | { kind: "virtual"; rt: McuRuntime }
  | {
      kind: "hex";
      emu: AvrEmulator;
      pinMap: {
        name: string;
        avrPort?: string | undefined;
        avrBit?: number | undefined;
      }[];
    };

export interface BoardRuntimeStatus {
  running: boolean;
  error: string | null;
  tier: "virtual" | "hex" | null;
  firmwareId: string | null;
  serial: string[];
}

const COMPAT: Record<PinFunction, PinFunction[]> = {
  gpio: ["gpio", "adc", "pwm"],
  pwm: ["gpio", "pwm", "adc"],
  adc: ["gpio", "adc", "pwm"],
  "i2c-sda": ["i2c-sda"],
  "i2c-scl": ["i2c-scl"],
  "spi-mosi": ["spi-mosi"],
  "spi-miso": ["spi-miso"],
  "spi-sck": ["spi-sck"],
  "spi-cs": ["spi-cs"],
  "uart-tx": ["uart-rx"],
  "uart-rx": ["uart-tx"],
  gnd: ["gnd"],
  vcc: ["vcc", "vin"],
  vin: ["vin", "vcc"],
  reset: ["reset", "gpio"],
  nc: ["nc"],
};

export function pinsCompatible(a: PinFunction, b: PinFunction): boolean {
  return (COMPAT[a] ?? []).includes(b);
}

export class EcadSim {
  readonly instances = new Map<string, EcadInstance>();
  readonly wires: EcadWire[] = [];
  private pinState = new Map<string, Map<string, PinState>>();
  private runtimes = new Map<string, RuntimeHandle>();
  private serialLogs = new Map<string, string[]>();
  private firmwareByInst = new Map<string, FirmwareEntry>();
  private backends = new Map<string, DisplayBackend>(); // board inst -> display backend
  private clocks: Clock;
  private idc = 0;

  constructor(clock: Clock = wallClock) {
    this.clocks = clock;
  }

  // ---- instance lifecycle -------------------------------------------------

  insert(
    partId: string,
    position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  ): EcadInstance {
    const part = getPart(partId);
    if (!part) throw new Error(`ecad: unknown part "${partId}"`);
    const id = `${part.category[0]}${++this.idc}`;
    const inst: EcadInstance = {
      id,
      partId,
      position: { ...position },
      rotation: 0,
    };
    this.instances.set(id, inst);
    if (part.category === "board") this.pinState.set(id, new Map());
    return inst;
  }

  remove(id: string): boolean {
    this.stop(id);
    const wires = this.wires.filter(
      (w) => w.from.inst === id || w.to.inst === id,
    );
    for (const w of wires) this.unwire(w.id);
    return this.instances.delete(id);
  }

  move(id: string, position: { x: number; y: number; z: number }): boolean {
    const inst = this.instances.get(id);
    if (!inst) return false;
    inst.position = { ...position };
    return true;
  }

  partOf(id: string): EcadPart | undefined {
    const inst = this.instances.get(id);
    return inst ? getPart(inst.partId) : undefined;
  }

  // ---- wiring -------------------------------------------------------------

  wire(from: string, to: string): EcadWire {
    const [fi, fp] = splitPinRef(from);
    const [ti, tp] = splitPinRef(to);
    const a = this.instances.get(fi);
    const b = this.instances.get(ti);
    if (!a || !b)
      throw new Error(
        `ecad: wire references unknown instance (${from} -> ${to})`,
      );
    const pa = pinOf(this.partOf(fi), fp);
    const pb = pinOf(this.partOf(ti), tp);
    if (!pa || !pb)
      throw new Error(`ecad: unknown pin on wire ${from} -> ${to}`);
    if (fi === ti) throw new Error("ecad: cannot wire a part to itself");
    if (!pinsCompatible(pa.fn, pb.fn))
      throw new Error(`ecad: incompatible pin functions ${pa.fn} <-> ${pb.fn}`);
    const id = `w${++this.idc}`;
    const wire: EcadWire = {
      id,
      from: { inst: fi, pin: fp },
      to: { inst: ti, pin: tp },
    };
    this.wires.push(wire);
    return wire;
  }

  unwire(id: string): boolean {
    const i = this.wires.findIndex((w) => w.id === id);
    if (i < 0) return false;
    this.wires.splice(i, 1);
    return true;
  }

  wiresFor(instId: string): EcadWire[] {
    return this.wires.filter(
      (w) => w.from.inst === instId || w.to.inst === instId,
    );
  }

  /** The other end of a wire touching (inst, pin), if any. */
  peerOf(instId: string, pin: string): { inst: string; pin: string } | null {
    for (const w of this.wires) {
      if (w.from.inst === instId && w.from.pin === pin) return w.to;
      if (w.to.inst === instId && w.to.pin === pin) return w.from;
    }
    return null;
  }

  // ---- firmware -----------------------------------------------------------

  /** Deploy firmware to a placed board: by id from the registry, raw JS, or raw hex. */
  deploy(
    boardInst: string,
    spec: { firmwareId?: string; code?: string; hex?: string },
  ): FirmwareEntry {
    const part = this.boardPart(boardInst);
    let fw: FirmwareEntry;
    if (spec.firmwareId) {
      const found = getFirmware(spec.firmwareId);
      if (!found)
        throw new Error(`ecad: unknown firmware "${spec.firmwareId}"`);
      if (found.boards.length && !found.boards.includes(part.id))
        throw new Error(
          `ecad: firmware "${found.id}" targets ${found.boards.join(", ")}, not ${part.id}`,
        );
      fw = found;
    } else if (spec.hex) {
      fw = {
        id: "custom-hex",
        title: "Uploaded .hex",
        boards: [part.id],
        tier: "hex",
        language: "avr-hex",
        source: spec.hex,
      };
    } else if (spec.code !== undefined) {
      fw = {
        id: "custom",
        title: "Custom firmware",
        boards: [],
        tier: "virtual",
        language: "scadgen-js",
        source: spec.code,
      };
    } else {
      throw new Error("ecad: deploy needs firmwareId, code, or hex");
    }
    if (fw.tier === "hex" && part.family !== "avr")
      throw new Error(
        `ecad: hex firmware requires an AVR board (got ${part.mcu}); use the virtual tier`,
      );
    this.firmwareByInst.set(boardInst, fw);
    const handle = this.runtimes.get(boardInst);
    if (handle?.kind === "virtual") handle.rt.deploy(fw.source);
    return fw;
  }

  async run(boardInst: string): Promise<BoardRuntimeStatus> {
    const part = this.boardPart(boardInst);
    this.stop(boardInst);
    const deployed = this.firmwareByInst.get(boardInst);
    const chosen = deployed ?? firmwareFor(part.id)[0];
    if (!chosen) throw new Error(`ecad: no firmware available for ${part.id}`);
    if (chosen.tier === "hex") {
      const result = await makeAvr328p(chosen.source);
      if (!result.ok) {
        this.pushSerial(
          boardInst,
          `sim: hex emulation unavailable (${result.reason})\n`,
        );
        throw new Error(`ecad: hex emulation unavailable: ${result.reason}`);
      }
      watchAvrPins(
        result.emulator,
        pinsOf(part).map((p) => ({
          name: p.name,
          avrPort: p.avrPort,
          avrBit: p.avrBit,
        })),
        (pin, value) => {
          this.stateFor(boardInst, pin).digital = value;
        },
      );
      result.emulator.onSerial((chunk) => this.pushSerial(boardInst, chunk));
      this.runtimes.set(boardInst, {
        kind: "hex",
        emu: result.emulator,
        pinMap: pinsOf(part).map(
          (
            p,
          ): {
            name: string;
            avrPort?: string | undefined;
            avrBit?: number | undefined;
          } => ({
            name: p.name,
            avrPort: p.avrPort,
            avrBit: p.avrBit,
          }),
        ),
      });
    } else {
      const display = this.bindDisplay(boardInst);
      const rt = new McuRuntime(
        part.id,
        pinsOf(part).map((p) => p.name),
        {
          onDigitalWrite: (pin, v) => {
            this.stateFor(boardInst, pin).digital = v;
          },
          onAnalogWrite: (pin, v) => {
            this.stateFor(boardInst, pin).pwm = v;
          },
          onServoWrite: (pin, deg) => {
            this.stateFor(boardInst, pin).servo = deg;
          },
          onTone: (pin, f) => {
            this.stateFor(boardInst, pin).tone = f;
          },
          onSerial: (text) => this.pushSerial(boardInst, text),
        },
        {
          display: display?.api ?? null,
          clock: this.clocks,
          globals: buildGlobals(
            pinConstantsFor(part.id),
            this.peripheralPinsFor(boardInst),
          ),
          inputs: { ...defaultInputs(part) },
        },
      );
      rt.deploy(chosen.source);
      this.runtimes.set(boardInst, { kind: "virtual", rt });
      void rt.start(); // async; errors surface in status()
    }
    return this.status(boardInst);
  }

  stop(boardInst: string): void {
    const handle = this.runtimes.get(boardInst);
    if (!handle) return;
    if (handle.kind === "virtual") handle.rt.stop();
    else handle.emu.dispose();
    this.runtimes.delete(boardInst);
  }

  status(boardInst: string): BoardRuntimeStatus {
    const handle = this.runtimes.get(boardInst);
    const serial = this.serialLogs.get(boardInst) ?? [];
    if (!handle)
      return {
        running: false,
        error: null,
        tier: null,
        firmwareId: this.firmwareByInst.get(boardInst)?.id ?? null,
        serial: [...serial],
      };
    if (handle.kind === "virtual") {
      const s = handle.rt.state();
      return {
        running: s.running,
        error: s.error,
        tier: "virtual",
        firmwareId: this.firmwareByInst.get(boardInst)?.id ?? null,
        serial: s.serial,
      };
    }
    return {
      running: true,
      error: null,
      tier: "hex",
      firmwareId: this.firmwareByInst.get(boardInst)?.id ?? null,
      serial: [...serial],
    };
  }

  /**
   * Hex-tier clock: step every running AVR emulator for `dtMs` of board time
   * (call from the render loop). Virtual-tier runtimes self-schedule.
   */
  tick(dtMs: number): void {
    for (const handle of this.runtimes.values()) {
      if (handle.kind !== "hex") continue;
      const cycles = Math.min(16_000_000 * (dtMs / 1000), 2_000_000); // cap per frame
      handle.emu.step(cycles);
    }
  }

  // ---- peripheral interaction ----------------------------------------------

  /** Press a button instance (pullup wiring reads 0). */
  press(id: string): void {
    this.setPeripheralInput(id, 0);
  }
  release(id: string): void {
    this.setPeripheralInput(id, 1);
  }
  setPot(id: string, value: number): void {
    this.setPeripheralInput(id, Math.max(0, Math.min(1023, Math.round(value))));
  }
  private setPeripheralInput(id: string, value: number): void {
    const part = this.partOf(id);
    if (!part || part.category !== "peripheral") return;
    for (const w of this.wiresFor(id)) {
      const boardEnd = w.from.inst === id ? w.to : w.from;
      const peer = this.instances.get(boardEnd.inst);
      const peerPart = peer ? getPart(peer.partId) : undefined;
      if (!peerPart || peerPart.category !== "board") continue;
      const rt = this.runtimes.get(boardEnd.inst);
      if (rt?.kind === "virtual") rt.rt.setInput(boardEnd.pin, value);
      this.pushSerial(boardEnd.inst, "");
    }
  }

  // ---- derived state (what the 3D layer reads) -----------------------------

  /** LED drive level 0..1 for a placed LED/RGB part (max over its wires). */
  ledLevel(id: string): number {
    const part = this.partOf(id);
    if (
      !part ||
      part.category !== "peripheral" ||
      (part.kind !== "led" && part.kind !== "rgbled")
    )
      return 0;
    let level = 0;
    for (const w of this.wiresFor(id)) {
      const boardEnd = w.from.inst === id ? w.to : w.from;
      const st = this.pinState.get(boardEnd.inst)?.get(boardEnd.pin);
      if (!st) continue;
      level = Math.max(level, st.digital === 1 ? 1 : st.pwm / 255);
    }
    return level;
  }

  /** Servo angle for a placed servo (0 if unpowered/unwired). */
  servoAngle(id: string): number {
    const part = this.partOf(id);
    if (!part || part.category !== "peripheral" || part.kind !== "servo")
      return 0;
    for (const w of this.wiresFor(id)) {
      const boardEnd = w.from.inst === id ? w.to : w.from;
      const st = this.pinState.get(boardEnd.inst)?.get(boardEnd.pin);
      if (st && st.servo > 0) return st.servo;
    }
    return 0;
  }

  /** Buzzer frequency currently driven at a placed buzzer (null = silent). */
  buzzerTone(id: string): number | null {
    const part = this.partOf(id);
    if (!part || part.category !== "peripheral" || part.kind !== "buzzer")
      return null;
    for (const w of this.wiresFor(id)) {
      const boardEnd = w.from.inst === id ? w.to : w.from;
      const st = this.pinState.get(boardEnd.inst)?.get(boardEnd.pin);
      if (st && st.tone) return st.tone;
    }
    return null;
  }

  /** The display wired to a board (I2C or SPI), with its live backend. */
  displayOf(
    boardInst: string,
  ): { instId: string; backend: DisplayBackend } | null {
    const part = this.boardPart(boardInst);
    for (const w of this.wiresFor(boardInst)) {
      const other = w.from.inst === boardInst ? w.to : w.from;
      const otherPart = this.partOf(other.inst);
      if (!otherPart || otherPart.category !== "display") continue;
      const backend = this.backends.get(boardInst);
      if (backend) return { instId: other.inst, backend };
    }
    void part;
    return null;
  }

  /** Typed accessors for the scene layer's texture blitters. */
  monoBuffer(boardInst: string): MonoBuffer | null {
    const b = this.displayOf(boardInst)?.backend;
    return b && "buffer" in b && b.buffer instanceof MonoBuffer
      ? b.buffer
      : null;
  }
  colorBuffer(boardInst: string): ColorBuffer | null {
    const b = this.displayOf(boardInst)?.backend;
    return b && "buffer" in b && b.buffer instanceof ColorBuffer
      ? b.buffer
      : null;
  }
  charGrid(boardInst: string): CharGridBuffer | null {
    const b = this.displayOf(boardInst)?.backend;
    return b && "grid" in b
      ? (b as unknown as { buffer: CharGridBuffer }).buffer
      : null;
  }
  sevenSeg(boardInst: string): SevenSegDriver | null {
    const b = this.displayOf(boardInst)?.backend;
    return b instanceof SevenSegDriver ? b : null;
  }

  serial(instId: string): string[] {
    return [...(this.serialLogs.get(instId) ?? [])];
  }

  clearSerial(instId: string): void {
    this.serialLogs.set(instId, []);
  }

  // ---- internals -----------------------------------------------------------

  private boardPart(id: string): BoardPart {
    const part = this.partOf(id);
    if (!part || part.category !== "board")
      throw new Error(`ecad: "${id}" is not a placed board`);
    return part;
  }

  private stateFor(boardInst: string, pin: string): PinState {
    const map = this.pinState.get(boardInst)!;
    let st = map.get(pin);
    if (!st) {
      st = { digital: 0, pwm: 0, servo: 0, tone: null };
      map.set(pin, st);
    }
    return st;
  }

  private pushSerial(boardInst: string, text: string): void {
    if (text === "") return; // poke without payload (input changes)
    let log = this.serialLogs.get(boardInst);
    if (!log) {
      log = [];
      this.serialLogs.set(boardInst, log);
    }
    for (const line of text.split("\n")) if (line) log.push(line);
    while (log.length > 200) log.shift();
  }

  /** Create + bind a display backend for the first display wired to a board. */
  private bindDisplay(
    boardInst: string,
  ): { instId: string; api: DisplayApi } | null {
    for (const w of this.wiresFor(boardInst)) {
      const other = w.from.inst === boardInst ? w.to : w.from;
      const otherPart = this.partOf(other.inst);
      if (!otherPart || otherPart.category !== "display") continue;
      const dp = otherPart as DisplayPart;
      const backend = makeDisplayBackend(
        dp.driver,
        dp.res,
        dp.driver === "hd44780"
          ? { cols: dp.res.w, rows: dp.res.h }
          : undefined,
      );
      this.backends.set(boardInst, backend);
      const size: [number, number] =
        dp.driver === "hd44780" ? [dp.res.w, dp.res.h] : [dp.res.w, dp.res.h];
      return {
        instId: other.inst,
        api: {
          size,
          clear: () => backend.clear(),
          text: (s, x, y, color) =>
            (
              backend as unknown as {
                text(s: string, x: number, y: number, c?: number): void;
              }
            ).text(s, x, y, color),
          pixel: (x, y, on, color) =>
            (
              backend as unknown as {
                pixel(x: number, y: number, on: boolean, c?: number): void;
              }
            ).pixel(x, y, !!on, color),
          rect: (x, y, w2, h2, fill, color) =>
            (
              backend as unknown as {
                rect(
                  x: number,
                  y: number,
                  w: number,
                  h: number,
                  f?: boolean,
                  c?: number,
                ): void;
              }
            ).rect(x, y, w2, h2, fill, color),
          fill: (color) =>
            (backend as unknown as { fill(c?: number): void }).fill(color),
        },
      };
    }
    return null;
  }

  /** Map sketch constants (SERVO_PIN etc.) to the pins actually wired. */
  private peripheralPinsFor(boardInst: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const w of this.wiresFor(boardInst)) {
      const other = w.from.inst === boardInst ? w.to : w.from;
      const otherPart = this.partOf(other.inst);
      if (!otherPart || otherPart.category !== "peripheral") continue;
      const pp = otherPart as PeripheralPart;
      const boardPin = w.from.inst === boardInst ? w.from.pin : w.to.pin;
      const key =
        pp.kind === "led"
          ? "LED_PIN"
          : pp.kind === "servo"
            ? "SERVO_PIN"
            : pp.kind === "button"
              ? "BTN_PIN"
              : pp.kind === "buzzer"
                ? "BUZZ_PIN"
                : pp.kind === "pot"
                  ? "POT_PIN"
                  : pp.kind === "rgbled"
                    ? `RGB_${w.from.inst === boardInst ? w.from.pin : w.to.pin}`
                    : null;
      if (key && !out[key]) out[key] = boardPin;
      if (pp.kind === "rgbled") {
        const pinIdx = pp.pins.findIndex(
          (x) => x.name === (w.from.inst === boardInst ? w.to.pin : w.from.pin),
        );
        const ch = pinIdx === 0 ? "R" : pinIdx === 1 ? "G" : "B";
        const assign = (k: string, ch2: string) => {
          if (out[k] === undefined && ch === ch2) out[k] = boardPin;
        };
        assign("R_PIN", "R");
        assign("G_PIN", "G");
        assign("B_PIN", "B");
      }
    }
    return out;
  }
}

// ---- helpers ---------------------------------------------------------------

function splitPinRef(ref: string): [string, string] {
  const i = ref.lastIndexOf(".");
  if (i <= 0)
    throw new Error(
      `ecad: pin reference must be "<instance>.<pin>" (got "${ref}")`,
    );
  return [ref.slice(0, i), ref.slice(i + 1)];
}

function pinOf(part: EcadPart | undefined, pin: string) {
  return part ? pinsOf(part).find((p) => p.name === pin) : undefined;
}

function defaultInputs(part: BoardPart): Record<string, number> {
  // Buttons default to released (pullup = 1); inputs otherwise 0.
  const out: Record<string, number> = {};
  for (const h of part.headers) for (const p of h.pins) out[p.name] = 1;
  return out;
}

function buildGlobals(
  base: Record<string, string>,
  wired: Record<string, string>,
): Record<string, unknown> {
  // wired pins win over board defaults so sketches follow the actual wiring
  return { ...base, ...wired };
}

/** The firmware ids to advertise for a board instance (catalog + universal). */
export function firmwareChoices(
  boardInst: string,
  sim: EcadSim,
): FirmwareEntry[] {
  const part = sim.partOf(boardInst);
  if (!part || part.category !== "board") return [];
  return firmwareFor(part.id);
}

/** Convenience for tests + the upload path: prebuilt Uno hex. */
export const UNO_BLINK = UNO_BLINK_HEX;
