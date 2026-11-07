// ecad/__tests__/avrBuild.test.ts — the in-browser C++ path without a browser:
// the sketch transform, target gating, error reporting, and how validation
// treats C++ source (it must not be judged as JS).

import { describe, expect, it } from "vitest";
import { getPart } from "../catalog";
import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";
import { analyzeBoard } from "../studio";
import {
  compilerErrorSummary,
  functionPrototypes,
  inoToCpp,
  looksLikeCxx,
} from "../avrSource";
import { avrCppTarget } from "../avrBuild";

const SKETCH = `const int LED = LED_PIN;
void setup() { pinMode(LED, OUTPUT); }
void loop() { digitalWrite(LED, HIGH); delay(500); }
`;

describe("looksLikeCxx", () => {
  it("recognises Arduino C++ and not the JS firmware tier", () => {
    expect(looksLikeCxx(SKETCH)).toBe(true);
    expect(looksLikeCxx("#include <Servo.h>\n")).toBe(true);
    expect(
      looksLikeCxx(
        "function setup() { pinMode(LED_PIN, OUTPUT); }\nasync function loop() { await delay(10); }",
      ),
    ).toBe(false);
  });
});

describe("inoToCpp", () => {
  it("includes Arduino.h and defines the pin constants the sketch uses", () => {
    const cpp = inoToCpp(SKETCH, { LED_PIN: "13", BTN_PIN: "2" });
    expect(cpp).toMatch(/#include <Arduino\.h>/);
    expect(cpp).toMatch(/#define LED_PIN 13/);
    expect(cpp).not.toMatch(/BTN_PIN/); // unused constants stay out
  });

  it("does not shadow a constant the sketch defines itself", () => {
    const cpp = inoToCpp("#define LED_PIN 7\nvoid setup() {}\n", {
      LED_PIN: "13",
    });
    expect(cpp).not.toMatch(/#define LED_PIN 13/);
  });

  it("inserts after the sketch's own includes", () => {
    const cpp = inoToCpp("#include <Servo.h>\nvoid setup() {}\n", {});
    const lines = cpp.split("\n");
    expect(lines[0]).toBe("#include <Servo.h>");
    expect(lines[1]).toBe("#include <Arduino.h>");
  });

  it("keeps a sketch without preamble unchanged", () => {
    const plain = "#include <Arduino.h>\nvoid setup() {}\n";
    expect(inoToCpp(plain, {})).toBe(plain);
  });
});

describe("functionPrototypes", () => {
  it("declares helpers defined after use, dropping default arguments", () => {
    const src = [
      "void loop() { flash(2); }",
      "void flash(int times, int wait = 100) { delay(wait); }",
    ].join("\n");
    expect(functionPrototypes(src)).toEqual([
      "void flash(int times, int wait);",
    ]);
  });

  it("ignores control flow and setup/loop", () => {
    const src = [
      "void setup() { if (1) { } for (;;) { } }",
      "void loop() { while (0) { } }",
    ].join("\n");
    expect(functionPrototypes(src)).toEqual([]);
  });
});

describe("compilerErrorSummary", () => {
  it("picks the first real error and strips the tool prefix", () => {
    const line = compilerErrorSummary([
      "[cc1plus] /build/HorangFirmware.cpp:4:3: error: 'foo' was not declared",
      "[cc1plus] make: *** failed",
    ]);
    expect(line).toBe(
      "/build/HorangFirmware.cpp:4:3: error: 'foo' was not declared",
    );
  });

  it("falls back to the last line when there is no error marker", () => {
    expect(compilerErrorSummary(["", "avr-ld failed: boom"])).toBe(
      "avr-ld failed: boom",
    );
  });
});

describe("avrCppTarget", () => {
  it("targets the emulated ATmega328P boards only", () => {
    expect(avrCppTarget(getPart("arduino-uno"))).toBe(true);
    expect(avrCppTarget(getPart("arduino-nano"))).toBe(true);
    expect(avrCppTarget(getPart("arduino-mega"))).toBe(false);
    expect(avrCppTarget(getPart("rpi-pico"))).toBe(false);
    expect(avrCppTarget(getPart("ssd1306-128x64"))).toBe(false);
    expect(avrCppTarget(undefined)).toBe(false);
  });
});

describe("validation of C++ source", () => {
  it("does not judge C++ as a broken JS sketch", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = sim.insert("arduino-uno", { x: 0, y: 0, z: 0 });
    sim.deploy(board.id, { code: SKETCH });
    const report = analyzeBoard(sim, board.id);
    const codes = report.findings.map((f) => f.code);
    expect(codes).toContain("cxx-source");
    expect(codes).not.toContain("compile");
    expect(codes).not.toContain("entrypoints");
    expect(report.verdict).not.toBe("blocked");
  });
});
