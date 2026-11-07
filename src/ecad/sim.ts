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
  type RadioCapability,
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
import { makeAvrChip, watchAvrPins, type AvrEmulator } from "./avr";
import { chipFor, chipPinOf, isAvrFamily, type ChipPin } from "./avrChips";
import { i2cDisplaySink } from "./avrPeripherals";
import { binaryFormat, bytesOf } from "./delivery";
import { makeRp2040, type Rp2040Emulator } from "./rp2040";
import { makeStm32f4, type Stm32f4Emulator } from "./stm32f4";
import { ESP32_WIFI_SPEC, makeEsp32, type Esp32Emulator } from "./esp32";
import { UNO_BLINK_HEX } from "./hex";
import {
  channelMatches,
  deliverEdge,
  distanceMeters,
  radioOf,
  reachMeters,
  receivedDbm,
  type RadioFrame,
  type RadioReceiver,
} from "./radio";
import {
  CircuitSolver,
  type AcPoint,
  type BoardGround,
  type CircuitElement,
  type Netlist,
  type PinProbe,
  type PinSource,
} from "./circuit";
import {
  ECAD_SNAPSHOT_VERSION,
  type EcadSnapshot,
  type EcadSnapshotFirmware,
  type EcadSnapshotInstance,
} from "./persist";

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

interface RemoteRuntime {
  kind: "remote";
  worker: Worker;
  running: boolean;
  error: string | null;
  display: { instId: string; api: DisplayApi } | null;
}

type RemoteMessage =
  | {
      type: "state";
      digital: Record<string, 0 | 1>;
      pwm: Record<string, number>;
      servo: Record<string, number>;
      tones: Record<string, number | null>;
    }
  | { type: "serial"; text: string }
  | { type: "display"; op: string; args: unknown[] }
  | { type: "error"; message: string }
  | { type: "started" }
  | { type: "done" };

interface Rp2040Runtime {
  kind: "rp2040";
  /** Null when the core runs inline (Node tests have no Worker). */
  worker: Worker | null;
  emu: Rp2040Emulator | null;
  running: boolean;
  error: string | null;
}

type Rp2040Message =
  | { type: "started"; bootPc: number; imageBytes: number }
  | { type: "pins"; pins: Record<string, 0 | 1> }
  | { type: "serial"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

interface Stm32f4Runtime {
  kind: "stm32f4";
  /** Null when the core runs inline (Node tests have no Worker). */
  worker: Worker | null;
  emu: Stm32f4Emulator | null;
  running: boolean;
  error: string | null;
}

type Stm32f4Message =
  | { type: "started"; chipLabel: string; imageBytes: number }
  | { type: "pins"; pins: Record<string, 0 | 1> }
  | { type: "serial"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

interface Esp32Runtime {
  kind: "esp32";
  /** Null when the core runs inline (Node tests have no Worker). */
  worker: Worker | null;
  emu: Esp32Emulator | null;
  running: boolean;
  error: string | null;
}

type Esp32Message =
  | {
      type: "started";
      chipLabel: string;
      imageBytes: number;
      layout: string;
      wifi?: string | null;
      ble?: boolean;
    }
  | { type: "pins"; pins: Record<string, 0 | 1> }
  | { type: "serial"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

type RuntimeHandle =
  | RemoteRuntime
  | Rp2040Runtime
  | Stm32f4Runtime
  | Esp32Runtime
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
  tier: "virtual" | "hex" | "binary" | "rp2040" | "stm32f4" | "esp32" | null;
  firmwareId: string | null;
  serial: string[];
}

const COMPAT: Record<PinFunction, PinFunction[]> = {
  gpio: ["gpio", "adc", "pwm", "passive"],
  pwm: ["gpio", "pwm", "adc", "passive"],
  adc: ["gpio", "adc", "pwm", "passive"],
  passive: ["passive", "gpio", "pwm", "adc", "gnd", "vcc", "vin", "reset"],
  "i2c-sda": ["i2c-sda"],
  "i2c-scl": ["i2c-scl"],
  "spi-mosi": ["spi-mosi"],
  "spi-miso": ["spi-miso"],
  "spi-sck": ["spi-sck"],
  "spi-cs": ["spi-cs"],
  "uart-tx": ["uart-rx"],
  "uart-rx": ["uart-tx"],
  gnd: ["gnd", "passive"],
  vcc: ["vcc", "vin", "passive"],
  vin: ["vin", "vcc", "passive"],
  reset: ["reset", "gpio", "passive"],
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
  /** Last servo control-pulse edge per board pin (hex tier). */
  private servoPulses = new Map<string, { rise: number; last: 0 | 1 }>();
  /** Application ELF per classic ESP32 board: Bluetooth needs its symbols. */
  private esp32BleElf = new Map<string, string>();
  /** In-world RF: per-instance tuning, sampled levels and the over-air log. */
  private radioTuning = new Map<string, number>();
  private rfTxLevels = new Map<string, 0 | 1>();
  private rfRxLevels = new Map<string, 0 | 1>();
  private peripheralInputs = new Map<string, number>();
  private rfEdgeQueue: { tx: string; level: 0 | 1; at: number }[] = [];
  private rfDropped = 0;
  private rfFrames: RadioFrame[] = [];
  private rfLastAt = new Map<string, number>();
  /** Component-level electrical solve (see circuit.ts). */
  private circuit = new CircuitSolver();
  private ledAmps = new Map<string, number>();
  private analogVolts = new Map<string, number>();
  /** Per-board logic-supply overrides. */
  private supplies = new Map<string, number>();
  private clocks: Clock;
  private idc = 0;
  /**
   * Parametric / out-of-catalog parts (e.g. a custom-sized board created in
   * VR or the project editor). Keyed by the instance's partId. Lets
   * insertInlinePart serve parts the catalog doesn't ship, and lets the 1:1
   * guard be exercised against arbitrary real sizes.
   */
  private inlineParts = new Map<string, EcadPart>();

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
    return this.insertInlinePart(part, position, partId);
  }

  /**
   * Insert an instance from an inline part object (parametric board, or a
   * test part not in the catalog). Generates a short id and registers the
   * part so partOf() resolves it.
   */
  insertInlinePart(
    part: EcadPart,
    position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    partId: string = part.id,
  ): EcadInstance {
    if (!part || !part.id)
      throw new Error("ecad: insertInlinePart needs a part");
    return this.insertWithId(
      part,
      `${part.category[0]}${++this.idc}`,
      partId,
      position,
      0,
    );
  }

  /** Insert with an explicit id — restore() keeps ids so wires/firmware hold. */
  private insertWithId(
    part: EcadPart,
    id: string,
    partId: string,
    position: { x: number; y: number; z: number },
    rotation: number,
  ): EcadInstance {
    const inst: EcadInstance = {
      id,
      partId,
      position: { ...position },
      rotation,
    };
    this.instances.set(id, inst);
    if (part.category === "board") this.pinState.set(id, new Map());
    if (partId !== part.id || !getPart(partId)) {
      this.inlineParts.set(partId, part);
    }
    return inst;
  }

  remove(id: string): boolean {
    this.stop(id);
    this.esp32BleElf.delete(id);
    this.radioTuning.delete(id);
    this.rfTxLevels.delete(id);
    this.rfRxLevels.delete(id);
    this.peripheralInputs.delete(id);
    this.rfLastAt.delete(id);
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
    if (!inst) return undefined;
    return this.inlineParts.get(inst.partId) ?? getPart(inst.partId);
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

  /**
   * Live drive state of one board pin. Read-only surface for the held-board
   * circuit card (circuitPip.ts) so it never touches the internal maps.
   */
  pinDrive(
    boardInst: string,
    pin: string,
  ): { digital: 0 | 1; pwm: number; servo: number; tone: number | null } {
    const st = this.pinState.get(boardInst)?.get(pin);
    return st ? { ...st } : { digital: 0, pwm: 0, servo: 0, tone: null };
  }

  // ---- firmware -----------------------------------------------------------

  /** Deploy firmware to a placed board: by id from the registry, raw JS, or raw hex. */
  deploy(
    boardInst: string,
    spec: {
      firmwareId?: string;
      code?: string;
      hex?: string;
      binary?: string;
      name?: string;
    },
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
    } else if (spec.binary !== undefined) {
      const format = binaryFormat(spec.binary);
      if (format === "empty")
        throw new Error("ecad: uploaded firmware binary is empty");
      // RP2040 / STM32F4 / classic ESP32 have in-app cores, so their images
      // actually execute; every other MCU can only carry the verified image.
      fw = {
        id: "custom-binary",
        title: spec.name ?? "Uploaded firmware",
        boards: [part.id],
        tier:
          part.family === "rp2040"
            ? "rp2040"
            : part.mcu.startsWith("STM32F4")
              ? "stm32f4"
              : part.family === "esp32"
                ? "esp32"
                : "binary",
        language: "binary",
        source: spec.binary,
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
    if (fw.tier === "hex" && (!isAvrFamily(part.family) || !chipFor(part.mcu)))
      throw new Error(
        `ecad: no AVR emulation for ${part.name} (${part.mcu}) — upload a binary for delivery instead`,
      );
    this.firmwareByInst.set(boardInst, fw);
    const handle = this.runtimes.get(boardInst);
    if (handle?.kind === "virtual") handle.rt.deploy(fw.source);
    return fw;
  }

  /** The firmware currently deployed to a board (null when none). */
  firmwareOf(boardInst: string): FirmwareEntry | null {
    return this.firmwareByInst.get(boardInst) ?? null;
  }

  // ---- persistence ---------------------------------------------------------

  /**
   * The whole scene as plain data: parts (stable ids), wires, and the exact
   * firmware text on each board. This is what goes into ProjectDoc.design.
   */
  snapshot(): EcadSnapshot {
    const instances: EcadSnapshotInstance[] = [];
    for (const inst of this.instances.values()) {
      const entry: EcadSnapshotInstance = {
        id: inst.id,
        partId: inst.partId,
        position: { ...inst.position },
        rotation: inst.rotation,
      };
      const inline = this.inlineParts.get(inst.partId);
      if (inline) entry.inlinePart = inline;
      const radio = this.radioTuning.get(inst.id);
      if (radio !== undefined) entry.radio = radio;
      instances.push(entry);
    }
    const firmware: EcadSnapshotFirmware[] = [];
    for (const [inst, fw] of this.firmwareByInst) {
      const entry: EcadSnapshotFirmware = {
        inst,
        firmwareId: fw.id,
        tier: fw.tier,
        source: fw.source,
      };
      if (fw.title) entry.title = fw.title;
      firmware.push(entry);
    }
    return {
      v: ECAD_SNAPSHOT_VERSION,
      savedAt: Date.now(),
      instances,
      wires: this.wires.map((w) => ({
        from: { ...w.from },
        to: { ...w.to },
      })),
      firmware,
    };
  }

  /** Wipe every placed part, wire, runtime and deployed firmware. */
  clear(): void {
    for (const inst of [...this.instances.values()]) this.stop(inst.id);
    this.instances.clear();
    this.wires.length = 0;
    this.pinState.clear();
    this.runtimes.clear();
    this.serialLogs.clear();
    this.firmwareByInst.clear();
    this.backends.clear();
    this.inlineParts.clear();
    this.radioTuning.clear();
    this.rfTxLevels.clear();
    this.rfRxLevels.clear();
    this.peripheralInputs.clear();
    this.rfEdgeQueue.length = 0;
    this.rfFrames.length = 0;
    this.rfLastAt.clear();
    this.rfDropped = 0;
    this.circuit.reset();
    this.ledAmps.clear();
    this.analogVolts.clear();
    this.supplies.clear();
    this.idc = 0;
  }

  /**
   * Rebuild a saved scene. Unknown parts are skipped, stale wires dropped, and
   * firmware that no longer applies is skipped — a corrupted doc costs the
   * bad part, not the whole board. Returns the number of parts restored.
   */
  restore(snapshot: EcadSnapshot): number {
    this.clear();
    for (const saved of snapshot.instances) {
      const part = saved.inlinePart ?? getPart(saved.partId);
      if (!part) continue;
      this.insertWithId(
        part,
        saved.id,
        saved.partId,
        saved.position,
        saved.rotation,
      );
      if (saved.radio !== undefined)
        this.radioTuning.set(saved.id, saved.radio);
    }
    // Keep new inserts from colliding with restored ids (b1 → next is b2).
    for (const id of this.instances.keys()) {
      const n = Number(/(\d+)$/.exec(id)?.[1]);
      if (Number.isFinite(n) && n > this.idc) this.idc = n;
    }
    for (const w of snapshot.wires) {
      try {
        this.wire(`${w.from.inst}.${w.from.pin}`, `${w.to.inst}.${w.to.pin}`);
      } catch {
        /* the part or pin went away — drop the wire, not the scene */
      }
    }
    for (const fw of snapshot.firmware) {
      if (!this.instances.has(fw.inst)) continue;
      try {
        const known = fw.firmwareId ? getFirmware(fw.firmwareId) : undefined;
        if (known && known.source === fw.source) {
          this.deploy(fw.inst, { firmwareId: known.id });
        } else if (fw.tier === "hex") {
          this.deploy(fw.inst, { hex: fw.source });
        } else if (
          fw.tier === "binary" ||
          fw.tier === "rp2040" ||
          fw.tier === "stm32f4" ||
          fw.tier === "esp32"
        ) {
          this.deploy(fw.inst, { binary: fw.source });
        } else if (fw.source.trim()) {
          this.deploy(fw.inst, { code: fw.source });
        }
      } catch {
        /* firmware targeting another board family — keep the part */
      }
    }
    return this.instances.size;
  }

  async run(boardInst: string): Promise<BoardRuntimeStatus> {
    const part = this.boardPart(boardInst);
    this.stop(boardInst);
    const deployed = this.firmwareByInst.get(boardInst);
    const chosen = deployed ?? firmwareFor(part.id)[0];
    if (!chosen) throw new Error(`ecad: no firmware available for ${part.id}`);
    if (chosen.tier === "rp2040") {
      // Raw GPIO numbers from the core → the catalog's pin names (GP25 …).
      const names = new Map<number, string>();
      for (const pin of pinsOf(part)) {
        if (pin.gpio !== undefined && !names.has(pin.gpio))
          names.set(pin.gpio, pin.name);
      }
      const inline = typeof Worker === "undefined";
      if (inline) {
        const booted = makeRp2040(chosen.source);
        if (!booted.ok) {
          this.pushSerial(
            boardInst,
            `sim: RP2040 boot failed (${booted.reason})\n`,
          );
          throw new Error(`ecad: RP2040 boot failed: ${booted.reason}`);
        }
        const emu = booted.emulator;
        emu.onPin((gpio, high) => {
          const name = names.get(gpio);
          if (name) this.setDigital(boardInst, name, high ? 1 : 0);
        });
        emu.onSerial((text) => this.pushSerial(boardInst, text));
        this.runtimes.set(boardInst, {
          kind: "rp2040",
          worker: null,
          emu,
          running: true,
          error: null,
        });
      } else {
        const worker = new Worker(
          new URL("./rp2040Worker.ts", import.meta.url),
          {
            type: "module",
          },
        );
        const handle: Rp2040Runtime = {
          kind: "rp2040",
          worker,
          emu: null,
          running: true,
          error: null,
        };
        worker.addEventListener(
          "message",
          (event: MessageEvent<Rp2040Message>) => {
            const message = event.data;
            if (message.type === "pins") {
              for (const [gpio, value] of Object.entries(message.pins)) {
                const name = names.get(Number(gpio));
                if (name) this.setDigital(boardInst, name, value);
              }
            } else if (message.type === "serial") {
              this.pushSerial(boardInst, message.text);
            } else if (message.type === "error") {
              handle.error = message.message;
              handle.running = false;
              this.pushSerial(boardInst, `sim: ${message.message}\n`);
            } else if (message.type === "done") {
              handle.running = false;
            }
          },
        );
        worker.postMessage({ type: "start", payload: chosen.source });
        this.runtimes.set(boardInst, handle);
      }
      this.pushSerial(
        boardInst,
        "sim: RP2040 core — boot-vector images only; mask-ROM functions are not present.\n",
      );
    } else if (chosen.tier === "stm32f4") {
      // Real Cortex-M4 firmware on the Rust WASM core. Node has no Worker, so
      // tests drive the same adapter inline; the browser gets the worker.
      if (typeof Worker === "undefined") {
        const booted = await makeStm32f4(chosen.source, part.mcu);
        if (!booted.ok) {
          this.pushSerial(
            boardInst,
            `sim: STM32F4 boot failed (${booted.reason})\n`,
          );
          throw new Error(`ecad: STM32F4 boot failed: ${booted.reason}`);
        }
        const emu = booted.emulator;
        emu.drain(
          (text) => this.pushSerial(boardInst, text),
          (name, high) => {
            this.setDigital(boardInst, name, high ? 1 : 0);
          },
        );
        this.runtimes.set(boardInst, {
          kind: "stm32f4",
          worker: null,
          emu,
          running: true,
          error: null,
        });
      } else {
        const worker = new Worker(
          new URL("./stm32f4Worker.ts", import.meta.url),
          { type: "module" },
        );
        const handle: Stm32f4Runtime = {
          kind: "stm32f4",
          worker,
          emu: null,
          running: true,
          error: null,
        };
        worker.addEventListener(
          "message",
          (event: MessageEvent<Stm32f4Message>) => {
            const message = event.data;
            if (message.type === "pins") {
              for (const [name, value] of Object.entries(message.pins))
                this.setDigital(boardInst, name, value);
            } else if (message.type === "serial") {
              this.pushSerial(boardInst, message.text);
            } else if (message.type === "error") {
              handle.error = message.message;
              handle.running = false;
              this.pushSerial(boardInst, `sim: ${message.message}\n`);
            } else if (message.type === "done") {
              handle.running = false;
            }
          },
        );
        worker.postMessage({
          type: "start",
          payload: chosen.source,
          mcu: part.mcu,
        });
        this.runtimes.set(boardInst, handle);
      }
      this.pushSerial(
        boardInst,
        "sim: STM32F4 core — real Cortex-M4 firmware (GPIO, USART, timers, SPI, I2C, ADC/DAC, DMA). Radio/Ethernet PHY is not modelled.\n",
      );
    } else if (chosen.tier === "esp32") {
      // Real Xtensa LX6 firmware on esp32sim (MIT): merged images boot through
      // the mask ROM, app images enter directly. Node has no Worker, so tests
      // drive the same adapter inline; the browser gets the worker.
      // Numeric GPIO -> the board's pin name, so an edge on GPIO2 lights an
      // LED wired to the DevKit's pin "2".
      const pinNameByGpio = new Map<number, string>();
      for (const pin of pinsOf(part))
        if (pin.gpio !== undefined && !pinNameByGpio.has(pin.gpio))
          pinNameByGpio.set(pin.gpio, pin.name);
      const elf = this.esp32BleElf.get(boardInst);
      if (typeof Worker === "undefined") {
        const booted = await makeEsp32(chosen.source, part.mcu, {
          bleElf: elf ? bytesOf(elf) : null,
        });
        if (!booted.ok) {
          this.pushSerial(
            boardInst,
            `sim: ESP32 boot failed (${booted.reason})\n`,
          );
          throw new Error(`ecad: ESP32 boot failed: ${booted.reason}`);
        }
        const emu = booted.emulator;
        emu.drain(
          (text) => this.pushSerial(boardInst, text),
          (pin, high, cycle) => {
            const name = pinNameByGpio.get(pin) ?? String(pin);
            this.setDigital(boardInst, name, high ? 1 : 0);
            this.servoPulse(
              boardInst,
              name,
              high ? 1 : 0,
              cycle,
              emu.chip.clockHz,
            );
          },
        );
        this.runtimes.set(boardInst, {
          kind: "esp32",
          worker: null,
          emu,
          running: true,
          error: null,
        });
      } else {
        const worker = new Worker(
          new URL("./esp32Worker.ts", import.meta.url),
          {
            type: "module",
          },
        );
        const handle: Esp32Runtime = {
          kind: "esp32",
          worker,
          emu: null,
          running: true,
          error: null,
        };
        worker.addEventListener(
          "message",
          (event: MessageEvent<Esp32Message>) => {
            const message = event.data;
            if (message.type === "pins") {
              for (const [name, value] of Object.entries(message.pins))
                this.setDigital(boardInst, name, value);
            } else if (message.type === "serial") {
              this.pushSerial(boardInst, message.text);
            } else if (message.type === "error") {
              handle.error = message.message;
              handle.running = false;
              this.pushSerial(boardInst, `sim: ${message.message}\n`);
            } else if (message.type === "done") {
              handle.running = false;
            }
          },
        );
        worker.postMessage({
          type: "start",
          payload: chosen.source,
          mcu: part.mcu,
          bleElf: elf ? bytesOf(elf) : null,
        });
        this.runtimes.set(boardInst, handle);
      }
      this.pushSerial(
        boardInst,
        `sim: ESP32 core — Xtensa LX6, real mask ROM + flash boot. GPIO edges drive wired LEDs and servos; the virtual access point "${ESP32_WIFI_SPEC.slice("ssid=".length).split(",")[0]}" is attached for Wi-Fi (association with the stock Espressif blob is not yet validated; no NAT). ${elf ? "Bluetooth is enabled from the app ELF." : "Attach the app ELF to enable Bluetooth."}\n`,
      );
    } else if (chosen.tier === "hex") {
      const profile = chipFor(part.mcu);
      const result = await makeAvrChip(chosen.source, part.mcu);
      if (!result.ok) {
        this.pushSerial(
          boardInst,
          `sim: hex emulation unavailable (${result.reason})\n`,
        );
        throw new Error(`ecad: hex emulation unavailable: ${result.reason}`);
      }
      const emu = result.emulator;
      if (profile?.serialNote)
        this.pushSerial(boardInst, `sim: ${profile.serialNote}\n`);
      // Chip truth, not catalog truth: a Mega's D13 is PB7 and a Leonardo's is
      // PC7, while the catalog pins for those boards only know Arduino numbers.
      const chipPins = pinsOf(part)
        .map((p) => chipPinOf(part.mcu, p))
        .filter((p): p is ChipPin => p !== null);
      watchAvrPins(
        emu,
        chipPins.map((p) => ({ name: p.name, avrPort: p.port, avrBit: p.bit })),
        (pin, value) => {
          this.setDigital(boardInst, pin, value);
          this.servoPulse(boardInst, pin, value, emu.cycles);
        },
      );
      emu.onSerial((chunk) => this.pushSerial(boardInst, chunk));
      // Compiled sketches reach an OLED over TWI; decode those transfers into
      // the same buffer the virtual tier draws into.
      const hexDisplay = this.bindDisplay(boardInst);
      const driver = this.displayDriver(boardInst);
      const sink =
        hexDisplay && driver ? i2cDisplaySink(hexDisplay.api, driver) : null;
      if (sink) emu.i2c(sink);
      this.runtimes.set(boardInst, {
        kind: "hex",
        emu,
        pinMap: chipPins.map((p) => ({
          name: p.name,
          avrPort: p.port,
          avrBit: p.bit,
        })),
      });
    } else {
      // Every board's virtual firmware runs in its own worker, so a sketch with
      // a synchronous infinite loop cannot freeze the app. Node (tests) has no
      // Worker and falls back to the in-thread runtime below.
      if (this.startRemote(boardInst, part, chosen.source))
        return this.status(boardInst);
      const display = this.bindDisplay(boardInst);
      const rt = new McuRuntime(
        part.id,
        pinsOf(part).map((p) => p.name),
        {
          onDigitalWrite: (pin, v) => {
            this.setDigital(boardInst, pin, v);
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
    if (handle.kind === "remote") handle.worker.terminate();
    else if (handle.kind === "virtual") handle.rt.stop();
    else if (handle.kind === "hex") handle.emu.dispose();
    else if (handle.kind === "rp2040") {
      handle.worker?.terminate();
      handle.emu?.dispose();
    } else {
      handle.worker?.terminate();
      handle.emu?.dispose();
    }
    this.runtimes.delete(boardInst);
  }

  status(boardInst: string): BoardRuntimeStatus {
    const handle = this.runtimes.get(boardInst);
    const serial = this.serialLogs.get(boardInst) ?? [];
    if (!handle)
      return {
        running: false,
        error: null,
        tier:
          this.firmwareByInst.get(boardInst)?.tier === "binary"
            ? "binary"
            : this.firmwareByInst.get(boardInst)?.tier === "rp2040"
              ? "rp2040"
              : this.firmwareByInst.get(boardInst)?.tier === "stm32f4"
                ? "stm32f4"
                : this.firmwareByInst.get(boardInst)?.tier === "esp32"
                  ? "esp32"
                  : null,
        firmwareId: this.firmwareByInst.get(boardInst)?.id ?? null,
        serial: [...serial],
      };
    if (handle.kind === "remote") {
      return {
        running: handle.running,
        error: handle.error,
        tier: "virtual",
        firmwareId: this.firmwareByInst.get(boardInst)?.id ?? null,
        serial: [...serial],
      };
    }
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
    if (handle.kind === "stm32f4") {
      return {
        running: handle.running,
        error: handle.error,
        tier: "stm32f4",
        firmwareId: this.firmwareByInst.get(boardInst)?.id ?? null,
        serial: [...serial],
      };
    }
    if (handle.kind === "esp32") {
      return {
        running: handle.running,
        error: handle.error,
        tier: "esp32",
        firmwareId: this.firmwareByInst.get(boardInst)?.id ?? null,
        serial: [...serial],
      };
    }
    if (handle.kind === "rp2040") {
      return {
        running: handle.running,
        error: handle.error,
        tier: "rp2040",
        firmwareId: this.firmwareByInst.get(boardInst)?.id ?? null,
        serial: [...serial],
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
    for (const [boardInst, handle] of this.runtimes) {
      if (handle.kind === "stm32f4" && handle.emu) {
        const emu = handle.emu;
        let budget = Math.min(emu.chip.clockHz * (dtMs / 1000), 2_000_000);
        while (budget > 0) {
          const ran = emu.step(Math.min(budget, 100_000));
          if (ran <= 0) break;
          budget -= ran;
        }
        emu.drain(
          (text) => this.pushSerial(boardInst, text),
          (name, high) => {
            this.setDigital(boardInst, name, high ? 1 : 0);
          },
        );
        continue;
      }
      if (handle.kind === "rp2040" && handle.emu) {
        // Inline cores (Node tests) advance on the same board clock as the
        // worker; step() takes instructions, ~1 cycle each on Cortex-M0+.
        const cycles = Math.min(handle.emu.clockHz * (dtMs / 1000), 2_000_000);
        handle.emu.step(cycles);
        continue;
      }
      if (handle.kind === "esp32" && handle.emu) {
        const emu = handle.emu;
        let budget = Math.min(emu.chip.clockHz * (dtMs / 1000), 4_000_000);
        while (budget > 0) {
          const ran = emu.step(Math.min(budget, 1_000_000));
          if (ran <= 0) break;
          budget -= ran;
        }
        emu.drain(
          (text) => this.pushSerial(boardInst, text),
          (pin, high, cycle) => {
            const name = this.esp32PinName(boardInst, pin);
            this.setDigital(boardInst, name, high ? 1 : 0);
            this.servoPulse(
              boardInst,
              name,
              high ? 1 : 0,
              cycle,
              emu.chip.clockHz,
            );
          },
        );
        if (emu.stopCode !== null && handle.running) {
          handle.running = false;
          this.pushSerial(
            boardInst,
            `sim: ESP32 stopped (code ${emu.stopCode})\n`,
          );
        }
        continue;
      }
      if (handle.kind !== "hex") continue;
      // Board time, not wall time: an ATtiny85 runs at 8 MHz, the rest at 16.
      const cycles = Math.min(handle.emu.clockHz * (dtMs / 1000), 2_000_000); // cap per frame
      handle.emu.step(cycles);
    }
    this.stepRadio();
    this.stepAnalog(dtMs);
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

  /**
   * Attach an application ELF to a classic ESP32. Its symbol table is what
   * enables the virtual Bluetooth controller: the .bin alone cannot name the
   * guest's controller hooks. The next run picks it up.
   */
  setAppElf(boardInst: string, elf: string): void {
    this.esp32BleElf.set(boardInst, elf);
  }
  private setPeripheralInput(id: string, value: number, pin?: string): void {
    const part = this.partOf(id);
    if (!part || part.category !== "peripheral") return;
    this.peripheralInputs.set(id, value);
    if (pin) this.queueRfEdges(id, pin, value !== 0 ? 1 : 0);
    for (const w of this.wiresFor(id)) {
      const boardEnd = w.from.inst === id ? w.to : w.from;
      const peer = this.instances.get(boardEnd.inst);
      const peerPart = peer ? getPart(peer.partId) : undefined;
      if (!peerPart || peerPart.category !== "board") continue;
      const rt = this.runtimes.get(boardEnd.inst);
      if (rt?.kind === "virtual") rt.rt.setInput(boardEnd.pin, value);
      else if (rt?.kind === "esp32") {
        // A button pulls its pad low; a pot or sensor drives it high.
        const gpio = pinsOf(peerPart).find(
          (pin) => pin.name === boardEnd.pin,
        )?.gpio;
        if (gpio !== undefined) {
          const high = value !== 0;
          if (rt.emu) rt.emu.setGpioInput(gpio, high);
          else
            rt.worker?.postMessage({
              type: "input",
              pin: gpio,
              level: high ? 1 : 0,
            });
        }
      } else if (rt?.kind === "remote")
        rt.worker.postMessage({
          type: "input",
          pin: boardEnd.pin,
          value,
        });
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
      const peer = this.partOf(boardEnd.inst);
      if (peer?.category === "peripheral" && peer.kind === "rf-rx") {
        level = Math.max(level, this.rfRxLevels.get(boardEnd.inst) ?? 0);
        continue;
      }
      const st = this.pinState.get(boardEnd.inst)?.get(boardEnd.pin);
      if (!st) continue;
      level = Math.max(level, st.digital === 1 ? 1 : st.pwm / 255);
    }
    // A closed component circuit (resistor, transistor…) wins on real current.
    return Math.max(level, Math.min(1, (this.ledAmps.get(id) ?? 0) / 0.02));
  }

  /** Forward current through a placed LED in amps (0 when off). */
  ledCurrent(id: string): number {
    return this.ledAmps.get(id) ?? 0;
  }

  /** Solved node voltage at one pin (volts) — probe, ADC or readout. */
  nodeVoltage(instId: string, pin: string): number {
    return this.analogVolts.get(`${instId}.${pin}`) ?? 0;
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

  /** Type a line into a board's console (the ESP32 REPL, or firmware stdin). */
  writeLine(boardInst: string, line: string): void {
    const rt = this.runtimes.get(boardInst);
    if (rt?.kind !== "esp32") return;
    if (rt.emu) rt.emu.writeLine(line);
    else rt.worker?.postMessage({ type: "serial", line });
  }

  // ---- in-world radio ------------------------------------------------------

  /**
   * Tune a placed RF part to a centre frequency in MHz. Only a transmitter and
   * a receiver on the same channel link; the stock pair ships at 433.92 MHz, so
   * a freshly placed pair works without tuning.
   */
  tuneRadio(instId: string, mhz: number): RadioCapability {
    const cap = radioOf(this.partOf(instId));
    if (!cap) throw new Error(`ecad: "${instId}" is not an RF part`);
    if (!Number.isFinite(mhz) || mhz <= 0 || mhz > 6000)
      throw new Error("ecad: radio channel must be 0 < mhz <= 6000");
    this.radioTuning.set(instId, mhz);
    return { ...cap, mhz };
  }

  /** Tuned channel of a placed RF part (MHz), or null when it has no radio. */
  radioChannel(instId: string): number | null {
    const cap = radioOf(this.partOf(instId));
    if (!cap) return null;
    return this.radioTuning.get(instId) ?? cap.mhz;
  }

  /** Recent over-the-air edges, oldest first. */
  radioFrames(limit = 50): RadioFrame[] {
    return this.rfFrames.slice(-Math.max(0, Math.floor(limit)));
  }

  /** 1 while a radio part keyed or heard an edge in the last 160 ms. */
  radioActivity(instId: string): number {
    const at = this.rfLastAt.get(instId);
    return at !== undefined && this.clocks.now() - at <= 160 ? 1 : 0;
  }

  /**
   * The link between a placed transmitter and receiver right now: distance,
   * received power, reach, and whether the receiver hears it.
   */
  radioLink(
    txInst: string,
    rxInst: string,
  ): {
    meters: number;
    dbm: number;
    reach: number;
    hears: boolean;
    channel: number;
  } | null {
    const txCap = radioOf(this.partOf(txInst));
    const rxCap = radioOf(this.partOf(rxInst));
    const a = this.instances.get(txInst);
    const b = this.instances.get(rxInst);
    if (
      !txCap ||
      !rxCap ||
      txCap.role !== "tx" ||
      rxCap.role !== "rx" ||
      !a ||
      !b
    )
      return null;
    const channel = this.radioTuning.get(txInst) ?? txCap.mhz;
    const rxChannel = this.radioTuning.get(rxInst) ?? rxCap.mhz;
    const meters = distanceMeters(a.position, b.position);
    const dbm = receivedDbm(txCap, rxCap, channel, meters);
    return {
      meters,
      dbm,
      reach: reachMeters(txCap, rxCap, channel),
      hears:
        channelMatches(channel, rxChannel) &&
        dbm >= (rxCap.sensitivityDbm ?? -100),
      channel,
    };
  }

  radioStats(): { frames: number; droppedEdges: number; queued: number } {
    return {
      frames: this.rfFrames.length,
      droppedEdges: this.rfDropped,
      queued: this.rfEdgeQueue.length,
    };
  }

  /**
   * Stamp every discrete part and every driven board pin into the nodal
   * solver once per tick. This is what makes a transistor switch, a coil ramp
   * and a divider set the ADC — the parts do the work, not the renderer.
   */
  private stepAnalog(dtMs: number): void {
    const elements: CircuitElement[] = [];
    const sources: PinSource[] = [];
    const netlist = this.analogNetlist();
    if (!netlist.elements.length && !netlist.sources.length) return;
    const result = this.circuit.solve(netlist, dtMs);
    this.ledAmps.clear();
    for (const [id, amps] of result.ledAmps) this.ledAmps.set(id, amps);
    this.analogVolts = result.volts;
    for (const p of result.probes) {
      const rt = this.runtimes.get(p.board);
      if (!rt) continue;
      if (rt.kind === "virtual") {
        const frac = Math.max(0, Math.min(1, p.volts / p.vdd));
        rt.rt.setInput(p.pin, Math.round(frac * 1023));
      } else if (rt.kind === "hex") {
        // Compiled AVR firmware reads the same solved voltage through avr8js's
        // real ADC, so analogRead() works there too.
        const part = this.partOf(p.board);
        if (part?.category !== "board") continue;
        // ADC channel = the Arduino analog number (A0 → 0), including A4/A5
        // where the same pin also carries I2C.
        const m = /^A(\d+)$/.exec(p.pin);
        if (m) rt.emu.setAnalog(Number(m[1]), p.volts);
      }
    }
  }

  /** Netlist shared by the per-tick solve and the AC sweep. */
  private analogNetlist(): Netlist {
    const elements: CircuitElement[] = [];
    const sources: PinSource[] = [];
    const probes: PinProbe[] = [];
    const boards: BoardGround[] = [];
    for (const inst of this.instances.values()) {
      const part = this.partOf(inst.id);
      if (!part) continue;
      if (part.category === "peripheral") {
        const spec = part.electronics;
        if (!spec) continue;
        const pins = part.pins.map((p) => `${inst.id}.${p.name}`);
        const a = pins[0];
        const b = pins[1];
        if (!a || !b) continue;
        const e: CircuitElement = {
          id: inst.id,
          device: spec.device,
          a,
          b,
          value: spec.value,
        };
        if (pins[2]) e.c = pins[2];
        if (spec.rOn !== undefined) e.rOn = spec.rOn;
        if (spec.is !== undefined) e.is = spec.is;
        if (spec.n !== undefined) e.n = spec.n;
        if (spec.bf !== undefined) e.bf = spec.bf;
        if (spec.br !== undefined) e.br = spec.br;
        if (spec.vaf !== undefined) e.vaf = spec.vaf;
        if (spec.vbr !== undefined) e.vbr = spec.vbr;
        if (spec.cj !== undefined) e.cj = spec.cj;
        if (spec.k !== undefined) e.k = spec.k;
        if (spec.lambda !== undefined) e.lambda = spec.lambda;
        if (spec.isZ !== undefined) e.isZ = spec.isZ;
        if (spec.nz !== undefined) e.nz = spec.nz;
        elements.push(e);
        continue;
      }
      if (part.category !== "board") continue;
      const gndKeys = pinsOf(part)
        .filter((pin) => pin.fn === "gnd")
        .map((pin) => `${inst.id}.${pin.name}`);
      if (!gndKeys.length) continue;
      boards.push({ board: inst.id, keys: gndKeys });
      const gnd = gndKeys[0]!;
      const vdd = this.supplyOf(inst.id, part);
      for (const pin of pinsOf(part)) {
        const key = `${inst.id}.${pin.name}`;
        const st = this.pinState.get(inst.id)?.get(pin.name);
        if (st && (pin.fn === "gpio" || pin.fn === "pwm")) {
          sources.push({
            board: inst.id,
            pin: pin.name,
            key,
            gnd,
            volts: st.digital === 1 ? vdd : (st.pwm / 255) * vdd,
            ohms: 25,
          });
        }
        if (
          (pin.fn === "adc" || /^A\d+$/.test(pin.name)) &&
          this.peerOf(inst.id, pin.name)
        ) {
          probes.push({ board: inst.id, pin: pin.name, key, vdd });
        }
      }
    }
    return {
      elements,
      wires: this.wires.map((w) => ({
        a: `${w.from.inst}.${w.from.pin}`,
        b: `${w.to.inst}.${w.to.pin}`,
      })),
      sources,
      probes,
      boards,
    };
  }

  /** 5 V for AVR boards, 3.3 V elsewhere, unless the project overrides it. */
  private supplyOf(instId: string, part: BoardPart): number {
    const override = this.supplies.get(instId);
    if (override !== undefined) return override;
    return part.family === "avr" || part.family === "avr32u4" ? 5 : 3.3;
  }

  /** Override a board's logic supply (e.g. running an Uno at 3.3 V). */
  setSupply(instId: string, volts: number): void {
    const part = this.partOf(instId);
    if (!part || part.category !== "board")
      throw new Error(`ecad: "${instId}" is not a placed board`);
    if (!Number.isFinite(volts) || volts < 1 || volts > 24)
      throw new Error("ecad: supply must be 1..24 V");
    this.supplies.set(instId, volts);
  }

  /** Junction temperature for the device models (°C). */
  setTemperature(celsius: number): void {
    this.circuit.setTemperature(celsius);
  }

  /**
   * AC small-signal sweep from a drive pin to a probe pin: gain (dB) and
   * phase (degrees) across a frequency range, linearised at the DC point.
   */
  acSweep(opts: {
    drive: string;
    probe: string;
    fromHz?: number;
    toHz?: number;
    points?: number;
  }): AcPoint[] {
    const [driveInst, drivePin] = splitPinRef(opts.drive);
    const [probeInst, probePin] = splitPinRef(opts.probe);
    const netlist = this.analogNetlist();
    const key = `${driveInst}.${drivePin}`;
    const source = netlist.sources.find((s) => s.key === key);
    const gnd = source?.gnd ?? netlist.boards[0]?.keys[0];
    if (!gnd)
      throw new Error("ecad.ac: no board ground to reference the drive");
    return this.circuit.ac(netlist, {
      drive: { key, gnd, volts: 1, ohms: 50 },
      probe: `${probeInst}.${probePin}`,
      fromHz: opts.fromHz ?? 10,
      toHz: opts.toHz ?? 1_000_000,
      points: opts.points ?? 40,
    });
  }

  // ---- internals -----------------------------------------------------------

  /** Driver id of the first display wired to a board, or null. */
  private displayDriver(boardInst: string): string | null {
    for (const w of this.wiresFor(boardInst)) {
      const other = w.from.inst === boardInst ? w.to : w.from;
      const part = this.partOf(other.inst);
      if (part?.category === "display") return part.driver;
    }
    return null;
  }

  /**
   * Servo signals are 1–2 ms pulses, not levels: measure the high time in
   * board cycles (16 MHz) and report the angle the horn would hold.
   */
  private servoPulse(
    boardInst: string,
    pin: string,
    value: 0 | 1,
    cycles: number,
    hz = 16_000_000,
  ): void {
    const key = `${boardInst}.${pin}`;
    const prev = this.servoPulses.get(key);
    if (prev && prev.last === value) return;
    const servoWired = this.wiresFor(boardInst).some((w) => {
      const mine = w.from.inst === boardInst ? w.from : w.to;
      const other = w.from.inst === boardInst ? w.to : w.from;
      if (mine.pin !== pin) return false;
      const part = this.partOf(other.inst);
      return part?.category === "peripheral" && part.kind === "servo";
    });
    if (!servoWired) return;
    if (value === 1) {
      this.servoPulses.set(key, { rise: cycles, last: 1 });
      return;
    }
    this.servoPulses.set(key, { rise: prev?.rise ?? cycles, last: 0 });
    if (!prev) return;
    const us = (cycles - prev.rise) / (hz / 1_000_000);
    if (us < 400 || us > 2600) return;
    const deg = Math.max(0, Math.min(180, ((us - 1000) / 1000) * 180));
    this.stateFor(boardInst, pin).servo = Math.round(deg);
  }

  /** Catalog pin name for a numeric GPIO, or the number as a string. */
  private esp32PinName(boardInst: string, gpio: number): string {
    const part = this.partOf(boardInst);
    if (part) {
      for (const pin of pinsOf(part)) {
        if (pin.gpio === gpio) return pin.name;
      }
    }
    return String(gpio);
  }

  /** Start the virtual tier in a worker; false when no Worker exists. */
  private startRemote(
    boardInst: string,
    part: BoardPart,
    source: string,
  ): boolean {
    if (typeof Worker === "undefined") return false;
    const display = this.bindDisplay(boardInst);
    const worker = new Worker(new URL("./firmwareWorker.ts", import.meta.url), {
      type: "module",
    });
    const handle: RemoteRuntime = {
      kind: "remote",
      worker,
      running: true,
      error: null,
      display,
    };
    worker.addEventListener("message", (event: MessageEvent<RemoteMessage>) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "state") {
        for (const [pin, value] of Object.entries(msg.digital))
          this.setDigital(boardInst, pin, value);
        for (const [pin, value] of Object.entries(msg.pwm))
          this.stateFor(boardInst, pin).pwm = value;
        for (const [pin, value] of Object.entries(msg.servo))
          this.stateFor(boardInst, pin).servo = value;
        for (const [pin, value] of Object.entries(msg.tones))
          this.stateFor(boardInst, pin).tone = value;
        return;
      }
      if (msg.type === "serial") {
        this.pushSerial(boardInst, msg.text);
        return;
      }
      if (msg.type === "display") {
        applyDisplayOp(handle.display?.api, msg.op, msg.args);
        return;
      }
      if (msg.type === "error") {
        handle.error = msg.message;
        handle.running = false;
        return;
      }
      if (msg.type === "done") handle.running = false;
    });
    worker.addEventListener("error", (event) => {
      handle.error = event.message || "firmware worker failed";
      handle.running = false;
    });
    worker.postMessage({
      type: "start",
      boardId: part.id,
      pins: pinsOf(part).map((p) => p.name),
      source,
      inputs: defaultInputs(part),
      globals: buildGlobals(
        pinConstantsFor(part.id),
        this.peripheralPinsFor(boardInst),
      ),
      displaySize: display ? display.api.size : null,
    });
    this.runtimes.set(boardInst, handle);
    return true;
  }

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

  /**
   * Every digital write funnels through here so an RF transmitter wired to the
   * pin sees the edge the moment firmware drives it, at any tier.
   */
  private setDigital(boardInst: string, pin: string, value: 0 | 1): void {
    const st = this.stateFor(boardInst, pin);
    if (st.digital === value) return;
    st.digital = value;
    this.queueRfEdges(boardInst, pin, value);
  }

  /** A level change on (inst, pin) goes to any transmitter wired to that pin. */
  private queueRfEdges(instId: string, pin: string, level: 0 | 1): void {
    for (const w of this.wiresFor(instId)) {
      const mine = w.from.inst === instId ? w.from : w.to;
      if (mine.pin !== pin) continue;
      const other = w.from.inst === instId ? w.to : w.from;
      const part = this.partOf(other.inst);
      if (part?.category !== "peripheral" || part.kind !== "rf-tx") continue;
      if (this.rfEdgeQueue.length >= 8192) {
        this.rfDropped += 1;
        continue;
      }
      this.rfEdgeQueue.push({ tx: other.inst, level, at: this.clocks.now() });
    }
  }

  /** Drain captured edges, then sample held levels (a button keying DATA). */
  private stepRadio(): void {
    if (!this.hasRadio()) return;
    const edges = this.rfEdgeQueue.splice(0, this.rfEdgeQueue.length);
    for (const e of edges) this.emitRf(e.tx, e.level, e.at);
    for (const id of this.instances.keys()) {
      const cap = radioOf(this.partOf(id));
      if (!cap || cap.role !== "tx") continue;
      const level = this.rfDataLevel(id);
      if (this.rfTxLevels.get(id) === level) continue;
      this.emitRf(id, level, this.clocks.now());
    }
  }

  private hasRadio(): boolean {
    for (const id of this.instances.keys())
      if (radioOf(this.partOf(id))) return true;
    return false;
  }

  /** What a transmitter is keying right now: board pin, receiver or button. */
  private rfDataLevel(txId: string): 0 | 1 {
    for (const w of this.wiresFor(txId)) {
      const other = w.from.inst === txId ? w.to : w.from;
      const part = this.partOf(other.inst);
      if (!part) continue;
      if (part.category === "board")
        return this.pinState.get(other.inst)?.get(other.pin)?.digital ?? 0;
      if (part.category !== "peripheral") continue;
      if (part.kind === "rf-rx") return this.rfRxLevels.get(other.inst) ?? 0;
      return (this.peripheralInputs.get(other.inst) ?? 0) !== 0 ? 1 : 0;
    }
    return 0;
  }

  /** Put one keyed level on the air and apply it to every hearing receiver. */
  private emitRf(txId: string, level: 0 | 1, at: number): void {
    const inst = this.instances.get(txId);
    const cap = radioOf(this.partOf(txId));
    if (!inst || !cap || cap.role !== "tx") return;
    this.rfTxLevels.set(txId, level);
    this.rfLastAt.set(txId, at);
    const channel = this.radioTuning.get(txId) ?? cap.mhz;
    const receivers: RadioReceiver[] = [];
    for (const [id, rxInst] of this.instances) {
      const rxCap = radioOf(this.partOf(id));
      if (!rxCap || rxCap.role !== "rx") continue;
      receivers.push({
        id,
        mhz: this.radioTuning.get(id) ?? rxCap.mhz,
        sensitivityDbm: rxCap.sensitivityDbm ?? -100,
        ...(rxCap.lossDb === undefined ? {} : { lossDb: rxCap.lossDb }),
        position: rxInst.position,
      });
    }
    const deliveries = deliverEdge(
      {
        id: txId,
        mhz: channel,
        powerDbm: cap.powerDbm,
        ...(cap.lossDb === undefined ? {} : { lossDb: cap.lossDb }),
        position: inst.position,
      },
      receivers,
      level,
    );
    for (const d of deliveries) {
      this.rfRxLevels.set(d.rx, d.level);
      this.rfLastAt.set(d.rx, at);
      this.rfFrames.push({
        at,
        tx: txId,
        rx: d.rx,
        level,
        meters: d.meters,
        dbm: d.dbm,
      });
      if (this.rfFrames.length > 200) this.rfFrames.shift();
      this.setPeripheralInput(d.rx, level, "OUT");
    }
  }

  private pushSerial(boardInst: string, text: string): void {
    if (text === "") return; // poke without payload (input changes)
    let log = this.serialLogs.get(boardInst);
    if (!log) {
      log = [];
      this.serialLogs.set(boardInst, log);
    }
    // avr8js's USART hands back the line buffer including \r and padding;
    // normalise it so compiled and virtual firmware read the same.
    for (const raw of text.split("\n")) {
      const line = raw.split("\r").join("").split("\u0000").join("").trimEnd();
      if (line) log.push(line);
    }
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
                  : pp.kind === "rf-tx"
                    ? "TX_PIN"
                    : pp.kind === "rf-rx"
                      ? "RX_PIN"
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

function applyDisplayOp(
  api: DisplayApi | undefined,
  op: string,
  args: unknown[],
): void {
  if (!api) return;
  if (op === "clear") {
    api.clear();
    return;
  }
  if (op === "text") {
    api.text(
      String(args[0]),
      Number(args[1]),
      Number(args[2]),
      Number(args[3]),
    );
    return;
  }
  if (op === "pixel") {
    api.pixel(Number(args[0]), Number(args[1]), !!args[2], Number(args[3]));
    return;
  }
  if (op === "rect") {
    api.rect(
      Number(args[0]),
      Number(args[1]),
      Number(args[2]),
      Number(args[3]),
      !!args[4],
      Number(args[5]),
    );
    return;
  }
  if (op === "fill") api.fill(Number(args[0]));
}

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
