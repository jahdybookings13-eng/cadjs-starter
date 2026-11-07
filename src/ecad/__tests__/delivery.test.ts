// ecad/__tests__/delivery.test.ts — firmware for the MCUs the suit cannot
// emulate: the image is real, validated, attached to the board and persisted,
// and the project says plainly that it is delivery-only.

import { describe, expect, it } from "vitest";
import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";
import { analyzeBoard } from "../studio";
import { binaryBytes, binaryFormat, bytesOf, dataUrlOf } from "../delivery";

const UF2 = dataUrlOf(new Uint8Array([0x55, 0x46, 0x32, 0x0a, 1, 2, 3]));
const ELF = dataUrlOf(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 9]));
const BIN = dataUrlOf(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

describe("binaryFormat", () => {
  it("recognises UF2, ELF and raw images", () => {
    expect(binaryFormat(UF2)).toBe("uf2");
    expect(binaryFormat(ELF)).toBe("elf");
    expect(binaryFormat(BIN)).toBe("bin");
    expect(binaryFormat(dataUrlOf(new Uint8Array()))).toBe("empty");
  });

  it("round-trips bytes through the data: URL", () => {
    const bytes = new Uint8Array([1, 2, 250, 255]);
    expect([...bytesOf(dataUrlOf(bytes))]).toEqual([...bytes]);
    expect(binaryBytes(UF2)).toBe(7);
  });
});

describe("delivery firmware for a non-emulated MCU", () => {
  it("attaches the image and reports the board as binary, not running", () => {
    const sim = new EcadSim(new VirtualClock());
    // The Due's SAM3X has no in-app core; the classic ESP32 now does.
    const board = sim.insert("arduino-due", { x: 0, y: 0, z: 0 });
    sim.deploy(board.id, { binary: BIN, name: "firmware.bin" });

    const status = sim.status(board.id);
    expect(status.tier).toBe("binary");
    expect(status.running).toBe(false);
    expect(sim.firmwareOf(board.id)?.title).toBe("firmware.bin");
  });

  it("survives a snapshot round-trip with the exact image", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = sim.insert("arduino-due", { x: 0, y: 0, z: 0 });
    sim.deploy(board.id, { binary: UF2, name: "blink.uf2" });

    const restored = new EcadSim(new VirtualClock());
    restored.restore(sim.snapshot());
    const entry = restored.firmwareOf(board.id);
    expect(entry?.tier).toBe("binary");
    expect(entry?.source).toBe(UF2);
    expect(restored.status(board.id).tier).toBe("binary");
  });

  it("rejects an empty image instead of pretending it deployed", () => {
    const sim = new EcadSim(new VirtualClock());
    const esp = sim.insert("esp32-devkit", { x: 0, y: 0, z: 0 });
    expect(() =>
      sim.deploy(esp.id, { binary: dataUrlOf(new Uint8Array()) }),
    ).toThrow(/empty/);
  });

  it("validation says delivery-only and does not block", () => {
    const sim = new EcadSim(new VirtualClock());
    const teensy = sim.insert("teensy-40", { x: 0, y: 0, z: 0 });
    sim.deploy(teensy.id, { binary: ELF, name: "firmware.elf" });

    const report = analyzeBoard(sim, teensy.id);
    expect(report.findings.map((f) => f.code)).toContain("binary-attached");
    expect(report.verdict).not.toBe("blocked");
  });
});
