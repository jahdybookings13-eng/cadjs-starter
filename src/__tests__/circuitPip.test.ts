import { describe, expect, it } from "vitest";

// The held-board circuit card is pure: a snapshot from EcadSim + a canvas
// painter. These tests prove the card describes the circuit that is ACTUALLY
// wired (pads, wires, module state) and that it paints deterministically into
// any 2D context — no DOM, no GPU, no RAPIER.
import { circuitPipSnapshot, drawCircuitPip } from "../ecad/circuitPip";
import { EcadSim } from "../ecad/sim";
import { getPart, pinsOf } from "../ecad/catalog";

function recorder() {
  const ops: string[] = [];
  const calls: Record<string, number> = {};
  const bump = (key: string) => {
    calls[key] = (calls[key] ?? 0) + 1;
  };
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    clearRect: () => bump("clearRect"),
    fillRect: () => bump("fillRect"),
    strokeRect: () => bump("strokeRect"),
    beginPath: () => bump("beginPath"),
    moveTo: () => bump("moveTo"),
    lineTo: () => bump("lineTo"),
    stroke: () => bump("stroke"),
    fill: () => bump("fill"),
    fillText: (text: string) => {
      bump("fillText");
      ops.push(String(text));
    },
    save: () => {},
    restore: () => {},
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    ops,
    calls,
  };
}

function wiredCircuit() {
  const sim = new EcadSim();
  const board = sim.insert("arduino-uno", { x: 0, y: 0, z: 0 });
  const led = sim.insert("led-red", { x: 40, y: 0, z: 0 });
  const ledPart = getPart("led-red")!;
  const ledPin = pinsOf(ledPart).find(
    (p) => p.fn === "gpio" || p.fn === "pwm" || p.fn === "adc",
  )!;
  sim.wire(`${board.id}.13`, `${led.id}.${ledPin.name}`);
  return { sim, board, led };
}

describe("circuitPipSnapshot", () => {
  it("describes the board that is really wired", () => {
    const { sim, board, led } = wiredCircuit();
    const snap = circuitPipSnapshot(sim, board.id);
    expect(snap).not.toBeNull();
    expect(snap!.instId).toBe(board.id);
    expect(snap!.title.toLowerCase()).toContain("uno");
    expect(snap!.subtitle).toContain("mm");
    expect(snap!.subtitle).toContain("no firmware");
    expect(snap!.running).toBe(false);
    expect(snap!.serial).toBeNull();

    // One wired module, with its live state line.
    expect(snap!.modules.length).toBe(1);
    expect(snap!.modules[0]!.instId).toBe(led.id);
    expect(snap!.modules[0]!.state).toContain("LED");

    // The wire runs from the board's pin 13 to that module, and is dark
    // until firmware drives it.
    expect(snap!.wires.length).toBe(1);
    expect(snap!.wires[0]!.from.name).toBe("13");
    expect(snap!.wires[0]!.to.name).toBeTruthy();
    expect(snap!.wires[0]!.live).toBe(false);

    // Pin 13 is marked wired (and not hot).
    const pin13 = snap!.headers
      .flatMap((h) => h.pins)
      .find((p) => p.name === "13");
    expect(pin13).toBeTruthy();
    expect(pin13!.wired).toBe(true);
    expect(pin13!.hot).toBe(false);
  });

  it("returns null for anything that is not a board", () => {
    const { sim, led } = wiredCircuit();
    expect(circuitPipSnapshot(sim, led.id)).toBeNull();
    expect(circuitPipSnapshot(sim, "nope")).toBeNull();
  });
});

describe("drawCircuitPip", () => {
  it("paints the card deterministically into a plain 2D context", () => {
    const { sim, board } = wiredCircuit();
    const snap = circuitPipSnapshot(sim, board.id)!;

    const a = recorder();
    drawCircuitPip(a.ctx, snap, 512, 340);

    // Background + board + module + pads all land.
    expect(a.calls.fillRect ?? 0).toBeGreaterThan(4);
    expect(a.calls.stroke).toBeGreaterThan(0);
    expect(a.calls.moveTo).toBeGreaterThan(0);
    const text = a.ops.join("|");
    expect(text).toContain(snap.title);
    expect(text).toContain("LED");
    expect(text).toContain("> serial idle");

    // Same snapshot → identical op sequence (no time, no randomness).
    const b = recorder();
    drawCircuitPip(b.ctx, snap, 512, 340);
    expect(b.ops).toEqual(a.ops);
  });

  it("survives a board with no wires and a zero-size canvas", () => {
    const sim = new EcadSim();
    const board = sim.insert("arduino-uno");
    const snap = circuitPipSnapshot(sim, board.id)!;
    expect(snap.modules).toEqual([]);
    expect(snap.wires).toEqual([]);
    const a = recorder();
    expect(() => drawCircuitPip(a.ctx, snap, 0, 0)).not.toThrow();
    expect(() => drawCircuitPip(a.ctx, snap, 512, 340)).not.toThrow();
  });
});
