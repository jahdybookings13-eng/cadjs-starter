// ecad/__tests__/perf.test.ts — the performance gate for the analog layer.
//
// Skipped in the normal suite (a wall-clock check is not a correctness test).
// Run it on demand:
//
//   ECAD_BENCH=1 npx vitest run src/ecad/__tests__/perf.test.ts --reporter=verbose
//
// It prints microseconds per solve and fails on a 4–10x regression. The
// circuits below are the ones the render loop actually feeds: a divider, an
// LED, a switching transistor and an AC sweep.

import { describe, expect, it } from "vitest";
import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";

const RUN = process.env.ECAD_BENCH === "1";

function bench(
  label: string,
  ticks: number,
  fn: (i: number) => void,
  budgetUs: number,
): number {
  // Warm the JIT and the solver's maps before timing.
  for (let i = 0; i < Math.min(200, ticks); i++) fn(i);
  const start = performance.now();
  for (let i = 0; i < ticks; i++) fn(i);
  const us = ((performance.now() - start) * 1000) / ticks;
  console.info(`${label}: ${us.toFixed(2)} µs/op (budget ${budgetUs} µs)`);
  // Generous headroom (measured ~33–69 µs): this catches a real regression,
  // not machine-to-machine noise. A 60 fps frame has 16.6 ms in total.
  expect(us).toBeGreaterThan(0);
  expect(us).toBeLessThan(budgetUs);
  return us;
}

function dividerCircuit() {
  const sim = new EcadSim(new VirtualClock());
  const uno = sim.insert("arduino-uno");
  const bat = sim.insert("battery-5v");
  const r1 = sim.insert("resistor-1k");
  const r2 = sim.insert("resistor-1k");
  sim.wire(`${bat.id}.+`, `${r1.id}.1`);
  sim.wire(`${r1.id}.2`, `${uno.id}.A0`);
  sim.wire(`${uno.id}.A0`, `${r2.id}.1`);
  sim.wire(`${r2.id}.2`, `${bat.id}.-`);
  return sim;
}

function activeCircuit() {
  const sim = new EcadSim(new VirtualClock());
  const uno = sim.insert("arduino-uno");
  const bat = sim.insert("battery-5v");
  const rLed = sim.insert("resistor-220");
  const led = sim.insert("led-red");
  const npn = sim.insert("transistor-2n3904");
  const rBase = sim.insert("resistor-1k");
  const rTop = sim.insert("resistor-10k");
  const rBot = sim.insert("resistor-10k");
  const cap = sim.insert("capacitor-100n");
  sim.wire(`${bat.id}.+`, `${rLed.id}.1`);
  sim.wire(`${rLed.id}.2`, `${led.id}.A`);
  sim.wire(`${led.id}.K`, `${npn.id}.C`);
  sim.wire(`${npn.id}.E`, `${bat.id}.-`);
  sim.wire(`${bat.id}.+`, `${rTop.id}.1`);
  sim.wire(`${rTop.id}.2`, `${npn.id}.B`);
  sim.wire(`${npn.id}.B`, `${rBot.id}.1`);
  sim.wire(`${rBot.id}.2`, `${bat.id}.-`);
  sim.wire(`${uno.id}.7`, `${rBase.id}.1`);
  sim.wire(`${rBase.id}.2`, `${npn.id}.B`);
  sim.wire(`${bat.id}.+`, `${cap.id}.+`);
  sim.wire(`${cap.id}.-`, `${bat.id}.-`);
  sim.wire(`${uno.id}.A0`, `${npn.id}.C`);
  sim.wire(`${uno.id}.A1`, `${npn.id}.B`);
  sim.wire(`${uno.id}.A2`, `${npn.id}.E`);
  return { sim, unoId: uno.id };
}

describe.skipIf(!RUN)("ecad perf harness", () => {
  it("times an empty tick (baseline overhead)", () => {
    const sim = new EcadSim(new VirtualClock());
    bench("empty tick(16)", 5_000, () => sim.tick(16), 100);
  });

  it("times a resistor divider solve", () => {
    const sim = dividerCircuit();
    bench("divider tick(16)", 2_000, () => sim.tick(16), 250);
  });

  it("times a transistor + LED + capacitor solve", () => {
    const { sim } = activeCircuit();
    bench("active tick(16)", 2_000, () => sim.tick(16), 400);
  });

  it("times a 25-point AC sweep", () => {
    const { sim, unoId } = activeCircuit();
    bench(
      "AC 25 points",
      50,
      () =>
        sim.acSweep({
          drive: `${unoId}.9`,
          probe: `${unoId}.A0`,
          fromHz: 100,
          toHz: 20_000,
          points: 25,
        }),
      4_000,
    );
  });
});
