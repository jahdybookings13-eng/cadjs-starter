// ecad/busActions.ts — every ECAD capability answers on the ActionBus by id,
// honoring the exit-ramp rule: desk UI, VR hands, voice, and the flux AI all
// dispatch the same actions.

import type { ActionBus } from "../model/actionBus";
import { findPartByName, getPart } from "./catalog";
import { firmwareFor } from "./firmware";
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

  reg("ecad.run", (boardInst: string) => ecad.run(boardInst));

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

  reg("ecad.update", (dtMs: number) => {
    ecad.layer.update(Number(dtMs) || 16);
    return true;
  });
}
