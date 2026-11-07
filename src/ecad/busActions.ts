// ecad/busActions.ts — every ECAD capability answers on the ActionBus by id,
// honoring the exit-ramp rule: desk UI, VR hands, voice, and the flux AI all
// dispatch the same actions.

import type { ActionBus } from "../model/actionBus";
import { findPartByName, getPart } from "./catalog";
import { firmwareFor, pinConstantsFor } from "./firmware";
import { analyzeBoard } from "./studio";
import { avrBuildRefusal, buildAvrFirmware } from "./avrBuild";
import { inspectFirmware } from "./delivery";
import type { Ecad } from "./install";

/** Register all ecad.* actions on a bus. Idempotent. */
export function registerEcadActions(bus: ActionBus, ecad: Ecad): void {
  const reg = (id: string, run: (...args: never[]) => unknown) => {
    if (bus.has(id)) return;
    bus.register({ id, kind: "op", aliases: [], run: run as never });
  };

  reg("ecad.catalog", (query?: string) =>
    (query
      ? findPartByName(String(query))
      : ecad.sim
        ? ecad.catalog()
        : []
    ).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      mcu: "mcu" in p ? p.mcu : undefined,
      tiers: "tiers" in p ? p.tiers : undefined,
    })),
  );

  reg("ecad.insert", (spec: unknown) => {
    const {
      part,
      x = 0,
      y = 0,
      z = 0,
    } = (spec ?? {}) as { part?: string; x?: number; y?: number; z?: number };
    if (!part || !getPart(part))
      throw new Error(`ecad.insert: unknown part "${part}"`);
    const inst = ecad.sim.insert(part, { x, y, z });
    ecad.layer.add(inst.id);
    return { id: inst.id, part };
  });

  reg("ecad.move", (spec: unknown) => {
    const { id, x, y, z } = (spec ?? {}) as {
      id?: string;
      x?: number;
      y?: number;
      z?: number;
    };
    if (!id) throw new Error("ecad.move: id required");
    if (!ecad.sim.move(id, { x: x ?? 0, y: y ?? 0, z: z ?? 0 }))
      throw new Error(`ecad.move: unknown instance "${id}"`);
    return { id };
  });

  reg("ecad.remove", (id: string) => {
    ecad.layer.remove(id);
    return { removed: ecad.sim.remove(id) };
  });

  reg("ecad.list", () =>
    [...ecad.sim.instances.values()].map((i) => ({
      id: i.id,
      part: i.partId,
      name: ecad.sim.partOf(i.id)?.name,
      position: i.position,
    })),
  );

  reg("ecad.select", (id: string | null) => {
    ecad.layer.highlight(id);
    return { selected: ecad.layer.selected() };
  });

  reg("ecad.wire", (spec: unknown) => {
    const { from, to } = (spec ?? {}) as { from?: string; to?: string };
    if (!from || !to)
      throw new Error(
        "ecad.wire: from/to pin refs required (<instance>.<pin>)",
      );
    const wire = ecad.sim.wire(from, to);
    return { id: wire.id, from, to };
  });

  reg("ecad.unwire", (id: string) => ({ removed: ecad.sim.unwire(id) }));

  reg("ecad.wires", () =>
    ecad.sim.wires.map((w) => ({
      id: w.id,
      from: `${w.from.inst}.${w.from.pin}`,
      to: `${w.to.inst}.${w.to.pin}`,
    })),
  );

  reg("ecad.firmwares", (boardInst: string) => {
    const part = ecad.sim.partOf(boardInst);
    if (!part || part.category !== "board")
      throw new Error(`ecad.firmwares: "${boardInst}" is not a board instance`);
    return firmwareFor(part.id).map((f) => ({
      id: f.id,
      title: f.title,
      tier: f.tier,
      desc: f.desc,
    }));
  });

  reg("ecad.code", (spec: unknown) => {
    const { board, code } = (spec ?? {}) as { board?: string; code?: string };
    if (!board || code === undefined)
      throw new Error("ecad.code: board + code required");
    const fw = ecad.sim.deploy(board, { code });
    return { firmwareId: fw.id };
  });

  reg("ecad.deploy", (spec: unknown) => {
    const { board, firmwareId } = (spec ?? {}) as {
      board?: string;
      firmwareId?: string;
    };
    if (!board || !firmwareId)
      throw new Error("ecad.deploy: board + firmwareId required");
    const fw = ecad.sim.deploy(board, { firmwareId });
    return { firmwareId: fw.id, tier: fw.tier };
  });

  reg("ecad.uploadHex", (spec: unknown) => {
    const { board, hex } = (spec ?? {}) as { board?: string; hex?: string };
    if (!board || !hex) throw new Error("ecad.uploadHex: board + hex required");
    const fw = ecad.sim.deploy(board, { hex });
    return { firmwareId: fw.id, tier: fw.tier };
  });

  // Real C++ → Intel HEX inside the browser: cc1plus / avr-as / avr-ld /
  // avr-objcopy as WebAssembly, linked against Arduino core objects. The
  // compiled binary is deployed to the same emulated ATmega328P that runs
  // uploaded .hex files, so desk, VR, voice and the AI all get one path.
  reg("ecad.buildFirmware", async (spec: unknown) => {
    const { board, code } = (spec ?? {}) as { board?: string; code?: string };
    if (!board || code === undefined)
      throw new Error("ecad.buildFirmware: board + code required");
    const part = ecad.sim.partOf(board);
    if (!part || part.category !== "board")
      throw new Error(`ecad.buildFirmware: "${board}" is not a placed board`);
    const refusal = avrBuildRefusal(part);
    if (refusal) throw new Error(`ecad.buildFirmware: ${refusal}`);
    const out = await buildAvrFirmware({
      source: code,
      constants: pinConstantsFor(part.id),
    });
    if (!out.ok) return out; // a failed compile is an answer, not an exception
    ecad.sim.deploy(board, { hex: out.result.hex });
    return { ...out, board, status: await ecad.run(board) };
  });

  // Real firmware for MCUs the suit cannot emulate: the binary itself is
  // validated, attached to the board and persisted, so the project carries
  // deliverable code for every board in the catalog.
  reg("ecad.uploadBinary", (spec: unknown) => {
    const { board, data, name } = (spec ?? {}) as {
      board?: string;
      data?: string;
      name?: string;
    };
    if (!board || !data)
      throw new Error("ecad.uploadBinary: board + data required");
    const part = ecad.sim.partOf(board);
    if (!part || part.category !== "board")
      throw new Error(`ecad.uploadBinary: "${board}" is not a placed board`);
    // Verify the container against the silicon before attaching it: an ARM ELF
    // on an Xtensa ESP32, or an image larger than the chip's flash, is not
    // "ready for delivery" — it is a file that cannot boot.
    const facts = inspectFirmware(data, part.mcu);
    if (facts.issues.length)
      throw new Error(`ecad.uploadBinary: ${facts.issues.join("; ")}`);
    const fw = ecad.sim.deploy(board, {
      binary: data,
      ...(name ? { name } : {}),
    });
    return {
      firmwareId: fw.id,
      tier: fw.tier,
      format: facts.format,
      verified: facts,
    };
  });

  reg("ecad.run", (boardInst: string) => ecad.run(boardInst));

  // Pre-hardware verdict: compile, pins, wiring, peripherals, last run. The
  // desk panel, VR hands and the AI all ask the same question the same way.
  reg("ecad.validate", (spec: unknown) => {
    const { board, code } = (spec ?? {}) as { board?: string; code?: string };
    if (!board) throw new Error("ecad.validate: board required");
    return analyzeBoard(ecad.sim, board, code === undefined ? {} : { code });
  });

  reg("ecad.stop", (boardInst: string) => {
    ecad.sim.stop(boardInst);
    return ecad.sim.status(boardInst);
  });

  reg("ecad.status", (boardInst: string) => ecad.sim.status(boardInst));

  reg("ecad.serial", (boardInst: string) => ({
    lines: ecad.sim.serial(boardInst),
  }));

  reg("ecad.press", (id: string) => {
    ecad.sim.press(id);
    return { id, pressed: true };
  });

  reg("ecad.release", (id: string) => {
    ecad.sim.release(id);
    return { id, pressed: false };
  });

  reg("ecad.setPot", (spec: unknown) => {
    const { id, value } = (spec ?? {}) as { id?: string; value?: number };
    if (!id || value === undefined)
      throw new Error("ecad.setPot: id + value required");
    ecad.sim.setPot(id, value);
    return { id, value };
  });

  // In-world RF: tune a placed transmitter/receiver, then read the link and
  // the over-the-air edge log (RSSI + distance per frame). Desk, VR, voice and
  // the AI all use these two calls.
  reg("ecad.tuneRadio", (spec: unknown) => {
    const { id, mhz } = (spec ?? {}) as { id?: string; mhz?: number };
    if (!id || mhz === undefined)
      throw new Error("ecad.tuneRadio: id + mhz required");
    const cap = ecad.sim.tuneRadio(id, Number(mhz));
    return { id, mhz: cap.mhz, role: cap.role };
  });

  reg("ecad.radio", (spec: unknown) => {
    const { tx, rx, limit } = (spec ?? {}) as {
      tx?: string;
      rx?: string;
      limit?: number;
    };
    return {
      link: tx && rx ? ecad.sim.radioLink(tx, rx) : null,
      frames: ecad.sim.radioFrames(limit ?? 50),
      stats: ecad.sim.radioStats(),
    };
  });

  // Board supply, device temperature and AC analysis: the physical knobs.
  reg("ecad.setSupply", (spec: unknown) => {
    const { id, volts } = (spec ?? {}) as { id?: string; volts?: number };
    if (!id || volts === undefined)
      throw new Error("ecad.setSupply: id + volts required");
    ecad.sim.setSupply(id, Number(volts));
    return { id, volts: Number(volts) };
  });

  reg("ecad.setTemperature", (celsius: number) => {
    ecad.sim.setTemperature(Number(celsius));
    return { celsius: Number(celsius) };
  });

  reg("ecad.ac", (spec: unknown) => {
    const { drive, probe, fromHz, toHz, points } = (spec ?? {}) as {
      drive?: string;
      probe?: string;
      fromHz?: number;
      toHz?: number;
      points?: number;
    };
    if (!drive || !probe)
      throw new Error("ecad.ac: drive + probe pin refs required");
    return ecad.sim.acSweep({
      drive,
      probe,
      ...(fromHz === undefined ? {} : { fromHz: Number(fromHz) }),
      ...(toHz === undefined ? {} : { toHz: Number(toHz) }),
      ...(points === undefined ? {} : { points: Number(points) }),
    });
  });

  reg("ecad.update", (dtMs: number) => {
    ecad.layer.update(Number(dtMs) || 16);
    return true;
  });
}
