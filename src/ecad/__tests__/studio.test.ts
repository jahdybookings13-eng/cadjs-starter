import { describe, it, expect } from "vitest";

import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";
import { getPart, type BoardPart } from "../catalog";
import { UNO_BLINK_HEX } from "../hex";
import {
  analyzeBoard,
  compileFirmware,
  hasEntrypoints,
  pinConstantsUsed,
  type StudioSim,
} from "../studio";

const BLINK = `
const LED = LED_PIN;
function setup() { pinMode(LED, OUTPUT); }
async function loop() {
  digitalWrite(LED, HIGH);
  await delay(500);
  digitalWrite(LED, LOW);
  await delay(500);
}
`;

function novoBoard(sim: EcadSim, ledWired: boolean) {
  const board = sim.insert("arduino-uno");
  if (ledWired) {
    const led = sim.insert("rgb-led");
    sim.wire(`${board.id}.13`, `${led.id}.R`);
  }
  return board;
}

describe("firmware static checks", () => {
  it("compiles valid sketches and rejects broken ones", () => {
    expect(compileFirmware(BLINK).ok).toBe(true);
    const bad = compileFirmware("function loop( {");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.length).toBeGreaterThan(0);
  });

  it("detects setup()/loop() entrypoints", () => {
    expect(hasEntrypoints(BLINK)).toBe(true);
    expect(hasEntrypoints("const setup = () => {};")).toBe(true);
    expect(hasEntrypoints("const x = 1;")).toBe(false);
  });

  it("finds the pin constants a sketch uses, sorted and unique", () => {
    expect(
      pinConstantsUsed("const a = LED_PIN, b = BTN_PIN, c = LED_PIN;"),
    ).toEqual(["BTN_PIN", "LED_PIN"]);
    expect(pinConstantsUsed("const n = 3;")).toEqual([]);
  });
});

describe("analyzeBoard", () => {
  it("blocks a board with no firmware", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = sim.insert("arduino-uno");
    const report = analyzeBoard(sim, board.id);
    expect(report.verdict).toBe("blocked");
    expect(report.findings.map((f) => f.code)).toContain("no-firmware");
  });

  it("passes a wired blink sketch", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = novoBoard(sim, true);
    sim.deploy(board.id, { code: BLINK });
    const report = analyzeBoard(sim, board.id);
    expect(report.findings.map((f) => f.code)).not.toContain("pin-unwired");
    expect(report.verdict).toBe("ready");
    expect(report.pins).toEqual([
      { constant: "LED_PIN", pin: "13", fn: "gpio", wiredTo: "RGB LED.R" },
    ]);
  });

  it("flags an unwired pin as needs-work, without blocking the code", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = novoBoard(sim, false);
    sim.deploy(board.id, { code: BLINK });
    const report = analyzeBoard(sim, board.id);
    expect(report.verdict).toBe("needs-work");
    const unwired = report.findings.find((f) => f.code === "pin-unwired");
    expect(unwired?.message).toContain("LED_PIN (13)");
    expect(report.pins[0]?.wiredTo).toBeNull();
  });

  it("blocks a sketch that does not compile", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = novoBoard(sim, true);
    sim.deploy(board.id, { code: "function loop( {" });
    const report = analyzeBoard(sim, board.id);
    expect(report.verdict).toBe("blocked");
    expect(report.findings.map((f) => f.code)).toContain("compile");
  });

  it("warns about an unknown pin constant", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = novoBoard(sim, true);
    sim.deploy(board.id, {
      code: "function setup() { digitalWrite(FOO_PIN, 1); }",
    });
    const report = analyzeBoard(sim, board.id);
    expect(report.findings.map((f) => f.code)).toContain("constant-unknown");
    expect(report.verdict).toBe("needs-work");
  });

  it("warns when Servo is driven with no servo wired", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = novoBoard(sim, true);
    sim.deploy(board.id, {
      code: "function setup() {}\nasync function loop() { Servo.write(90); await delay(100); }",
    });
    const report = analyzeBoard(sim, board.id);
    expect(report.findings.map((f) => f.code)).toContain("servo-unwired");
  });

  it("blocks AVR hex pushed at a non-AVR board", () => {
    const pico = getPart("rpi-pico") as BoardPart;
    const stub: StudioSim = {
      instances: new Map(),
      wires: [],
      partOf: (id) => (id === "b1" ? pico : undefined),
      status: () => ({
        running: false,
        error: null,
        tier: "hex",
        firmwareId: "custom-hex",
        serial: [],
      }),
      firmwareOf: () => ({
        id: "custom-hex",
        title: "Uploaded .hex",
        boards: [],
        tier: "hex",
        language: "avr-hex",
        source: UNO_BLINK_HEX,
      }),
    };
    const report = analyzeBoard(stub, "b1");
    expect(report.verdict).toBe("blocked");
    expect(report.findings.map((f) => f.code)).toContain("hex-not-avr");
  });

  it("reports a runtime error as blocking", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = novoBoard(sim, true);
    sim.deploy(board.id, { code: BLINK });
    (sim as unknown as { runtimes: Map<string, unknown> }).runtimes.set(
      board.id,
      {
        kind: "virtual",
        rt: {
          state: () => ({
            running: false,
            error: "runtime: boom",
            digital: {},
            pwm: {},
            servo: {},
            tones: {},
            serial: [],
          }),
          stop: () => {},
        },
      },
    );
    const report = analyzeBoard(sim, board.id);
    expect(report.verdict).toBe("blocked");
    expect(report.findings.map((f) => f.code)).toContain("runtime-error");
  });
});
