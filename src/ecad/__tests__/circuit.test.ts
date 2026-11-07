// ecad/__tests__/circuit.test.ts — the component layer: discrete parts are
// electrical elements, not decoration. Resistors divide, capacitors charge,
// coils ramp, diodes block and an NPN really switches a lamp from a pin.

import { describe, expect, it } from "vitest";
import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";

describe("ecad circuit — discrete parts do the work", () => {
  it("a resistor divider sets a real ADC voltage", () => {
    const sim = new EcadSim();
    const uno = sim.insert("arduino-uno");
    const bat = sim.insert("battery-5v");
    const r1 = sim.insert("resistor-1k");
    const r2 = sim.insert("resistor-1k");
    sim.wire(`${bat.id}.+`, `${r1.id}.1`);
    sim.wire(`${r1.id}.2`, `${uno.id}.A0`);
    sim.wire(`${uno.id}.A0`, `${r2.id}.1`);
    sim.wire(`${r2.id}.2`, `${bat.id}.-`);

    sim.tick(16);
    const volts = sim.nodeVoltage(uno.id, "A0");
    expect(volts).toBeGreaterThan(2.3);
    expect(volts).toBeLessThan(2.7);
  });

  it("a capacitor charges through a resistor over time", () => {
    const sim = new EcadSim();
    const uno = sim.insert("arduino-uno");
    const bat = sim.insert("battery-5v");
    const r = sim.insert("resistor-1k");
    const cap = sim.insert("capacitor-100u");
    sim.wire(`${bat.id}.+`, `${r.id}.1`);
    sim.wire(`${r.id}.2`, `${uno.id}.A0`);
    sim.wire(`${uno.id}.A0`, `${cap.id}.+`);
    sim.wire(`${cap.id}.-`, `${bat.id}.-`);

    sim.tick(16);
    const early = sim.nodeVoltage(uno.id, "A0");
    for (let i = 0; i < 10; i++) sim.tick(16);
    const later = sim.nodeVoltage(uno.id, "A0");
    expect(early).toBeGreaterThan(0.4);
    expect(later).toBeGreaterThan(early + 1);
    expect(later).toBeGreaterThan(3.5);
  });

  it("a coil ramps its current instead of jumping to steady state", () => {
    const sim = new EcadSim();
    const bat = sim.insert("battery-5v");
    const r = sim.insert("resistor-220");
    const coil = sim.insert("coil-100mh");
    const led = sim.insert("led-red");
    sim.wire(`${bat.id}.+`, `${r.id}.1`);
    sim.wire(`${r.id}.2`, `${coil.id}.1`);
    sim.wire(`${coil.id}.2`, `${led.id}.A`);
    sim.wire(`${led.id}.K`, `${bat.id}.-`);

    sim.tick(0.05);
    const first = sim.ledCurrent(led.id);
    for (let i = 0; i < 40; i++) sim.tick(0.05);
    const settled = sim.ledCurrent(led.id);
    expect(first).toBeLessThan(settled);
    expect(settled).toBeGreaterThan(0.005);
  });

  it("a reverse-biased diode blocks", () => {
    const sim = new EcadSim();
    const uno = sim.insert("arduino-uno");
    const bat = sim.insert("battery-5v");
    const diode = sim.insert("diode-1n4148");
    const r = sim.insert("resistor-1k");
    // + → cathode, anode → resistor → − : the diode is backwards.
    sim.wire(`${bat.id}.+`, `${diode.id}.K`);
    sim.wire(`${diode.id}.A`, `${uno.id}.A0`);
    sim.wire(`${uno.id}.A0`, `${r.id}.1`);
    sim.wire(`${r.id}.2`, `${bat.id}.-`);
    sim.tick(16);
    expect(sim.nodeVoltage(uno.id, "A0")).toBeLessThan(0.2);
  });

  it("an NPN transistor switches a lamp from a GPIO pin", async () => {
    const clock = new VirtualClock();
    const sim = new EcadSim(clock);
    const uno = sim.insert("arduino-uno");
    const bat = sim.insert("battery-5v");
    const led = sim.insert("led-red");
    const rLed = sim.insert("resistor-220");
    const rBase = sim.insert("resistor-1k");
    const npn = sim.insert("transistor-2n3904");
    // 5 V → 220 Ω → LED → collector; emitter → ground; pin 7 → 1 kΩ → base.
    sim.wire(`${bat.id}.+`, `${rLed.id}.1`);
    sim.wire(`${rLed.id}.2`, `${led.id}.A`);
    sim.wire(`${led.id}.K`, `${npn.id}.C`);
    sim.wire(`${npn.id}.E`, `${bat.id}.-`);
    sim.wire(`${uno.id}.7`, `${rBase.id}.1`);
    sim.wire(`${rBase.id}.2`, `${npn.id}.B`);
    sim.deploy(uno.id, {
      code: `function setup() { pinMode(7, OUTPUT); }
             async function loop() {
               digitalWrite(7, HIGH); await delay(200);
               digitalWrite(7, LOW); await delay(200);
             }`,
    });
    await sim.run(uno.id);

    await clock.advance(1);
    sim.tick(16);
    expect(sim.ledCurrent(led.id)).toBeGreaterThan(0.008);
    expect(sim.ledLevel(led.id)).toBeGreaterThan(0.4);

    await clock.advance(220); // LOW at t=200 turns the base off
    sim.tick(16);
    expect(sim.ledCurrent(led.id)).toBeCloseTo(0, 3);
    expect(sim.ledLevel(led.id)).toBe(0);
    sim.stop(uno.id);
  });

  it("feeds the divider into analogRead on the running firmware", async () => {
    const clock = new VirtualClock();
    const sim = new EcadSim(clock);
    const uno = sim.insert("arduino-uno");
    const bat = sim.insert("battery-5v");
    const r1 = sim.insert("resistor-1k");
    const r2 = sim.insert("resistor-1k");
    sim.wire(`${bat.id}.+`, `${r1.id}.1`);
    sim.wire(`${r1.id}.2`, `${uno.id}.A0`);
    sim.wire(`${uno.id}.A0`, `${r2.id}.1`);
    sim.wire(`${r2.id}.2`, `${bat.id}.-`);
    sim.deploy(uno.id, {
      code: `async function loop() {
               Serial.println(analogRead("A0"));
               await delay(50);
             }`,
    });
    await sim.run(uno.id);
    await clock.advance(5);
    sim.tick(16);
    await clock.advance(60);
    const values = sim
      .serial(uno.id)
      .map((line) => Number(line))
      .filter((n) => Number.isFinite(n));
    expect(values.length).toBeGreaterThan(0);
    expect(Math.max(...values)).toBeGreaterThan(400);
    sim.stop(uno.id);
  });
});

describe("ecad circuit — continuous device models", () => {
  it("biases an NPN in its active region (amplifier, not just a switch)", () => {
    const sim = new EcadSim();
    const uno = sim.insert("arduino-uno");
    const bat = sim.insert("battery-5v");
    const rTop = sim.insert("resistor-10k");
    const rBot = sim.insert("resistor-10k");
    const rC = sim.insert("resistor-220");
    const rE = sim.insert("resistor-220");
    const npn = sim.insert("transistor-2n3904");
    sim.wire(`${bat.id}.+`, `${rTop.id}.1`);
    sim.wire(`${rTop.id}.2`, `${npn.id}.B`);
    sim.wire(`${npn.id}.B`, `${rBot.id}.1`);
    sim.wire(`${rBot.id}.2`, `${bat.id}.-`);
    sim.wire(`${bat.id}.+`, `${rC.id}.1`);
    sim.wire(`${rC.id}.2`, `${npn.id}.C`);
    sim.wire(`${npn.id}.E`, `${rE.id}.1`);
    sim.wire(`${rE.id}.2`, `${bat.id}.-`);
    sim.wire(`${uno.id}.A0`, `${npn.id}.C`);
    sim.wire(`${uno.id}.A1`, `${npn.id}.B`);
    sim.wire(`${uno.id}.A2`, `${npn.id}.E`);

    sim.tick(16);
    const vc = sim.nodeVoltage(uno.id, "A0");
    const vbe = sim.nodeVoltage(uno.id, "A1") - sim.nodeVoltage(uno.id, "A2");
    // Divider gives ~2.5 V at the base; the emitter resistor sets ~8 mA, so
    // the collector sits mid-rail: forward-active, not saturated.
    expect(vc).toBeGreaterThan(2);
    expect(vc).toBeLessThan(4.2);
    expect(vbe).toBeGreaterThan(0.55);
    expect(vbe).toBeLessThan(0.85);
  });

  it("clamps a reverse-biased Zener at its breakdown voltage", () => {
    const sim = new EcadSim();
    const uno = sim.insert("arduino-uno");
    const bat = sim.insert("battery-9v");
    const r = sim.insert("resistor-1k");
    const z = sim.insert("zener-5v1");
    sim.wire(`${bat.id}.+`, `${r.id}.1`);
    sim.wire(`${r.id}.2`, `${z.id}.K`);
    sim.wire(`${z.id}.A`, `${bat.id}.-`);
    sim.wire(`${uno.id}.A0`, `${z.id}.K`);
    sim.tick(16);
    const clamp = sim.nodeVoltage(uno.id, "A0");
    expect(clamp).toBeGreaterThan(4.7);
    expect(clamp).toBeLessThan(5.6);
  });

  it("drifts the junction voltage with temperature", () => {
    const sim = new EcadSim();
    const uno = sim.insert("arduino-uno");
    const bat = sim.insert("battery-5v");
    const r = sim.insert("resistor-1k");
    const d = sim.insert("diode-1n4148");
    sim.wire(`${bat.id}.+`, `${r.id}.1`);
    sim.wire(`${r.id}.2`, `${d.id}.A`);
    sim.wire(`${d.id}.K`, `${bat.id}.-`);
    sim.wire(`${uno.id}.A0`, `${d.id}.A`);
    sim.tick(16);
    const cold = sim.nodeVoltage(uno.id, "A0");
    sim.setTemperature(100);
    sim.tick(16);
    const hot = sim.nodeVoltage(uno.id, "A0");
    // ~-2 mV/°C: a 73 °C rise drops the junction by roughly 0.15 V.
    expect(cold - hot).toBeGreaterThan(0.1);
    expect(cold - hot).toBeLessThan(0.2);
  });

  it("sweeps AC gain and phase of an RC low-pass", () => {
    const sim = new EcadSim();
    const uno = sim.insert("arduino-uno");
    const r = sim.insert("resistor-1k");
    const c = sim.insert("capacitor-100n");
    sim.wire(`${uno.id}.9`, `${r.id}.1`);
    sim.wire(`${r.id}.2`, `${uno.id}.A0`);
    sim.wire(`${uno.id}.A0`, `${c.id}.+`);
    sim.wire(`${c.id}.-`, `${uno.id}.GND`);

    const points = sim.acSweep({
      drive: `${uno.id}.9`,
      probe: `${uno.id}.A0`,
      fromHz: 100,
      toHz: 20_000,
      points: 25,
    });
    expect(points.length).toBe(25);
    const low = points[0]!;
    const high = points[points.length - 1]!;
    // fc = 1/(2π·1k·100n) ≈ 1592 Hz.
    const near = points.reduce((a, b) =>
      Math.abs(b.hz - 1592) < Math.abs(a.hz - 1592) ? b : a,
    );
    expect(low.gainDb).toBeGreaterThan(-1);
    expect(near.gainDb).toBeGreaterThan(-4.5);
    expect(near.gainDb).toBeLessThan(-1.5);
    expect(Math.abs(near.phaseDeg + 45)).toBeLessThan(12);
    expect(high.gainDb).toBeLessThan(-18);
  });

  it("gives each board its own logic supply, overridable", async () => {
    const clock = new VirtualClock();
    const sim = new EcadSim(clock);
    const uno = sim.insert("arduino-uno");
    const esp = sim.insert("esp32-devkit");
    const high = `function setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); }`;
    sim.deploy(uno.id, { code: high });
    sim.deploy(esp.id, {
      code: `function setup() { pinMode(2, OUTPUT); digitalWrite(2, HIGH); }`,
    });
    await sim.run(uno.id);
    await sim.run(esp.id);
    await clock.advance(1);
    sim.tick(16);
    expect(sim.nodeVoltage(uno.id, "13")).toBeCloseTo(5, 1);
    expect(sim.nodeVoltage(esp.id, "2")).toBeCloseTo(3.3, 1);
    sim.setSupply(uno.id, 3.3);
    sim.tick(16);
    expect(sim.nodeVoltage(uno.id, "13")).toBeCloseTo(3.3, 1);
    sim.stop(uno.id);
    sim.stop(esp.id);
  });
});
