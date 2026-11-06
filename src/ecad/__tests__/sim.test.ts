// ecad/__tests__/sim.test.ts — the simulation core: placement, wiring rules,
// runtime lifecycle, peripheral state, and the flux AI agent path.

import { describe, expect, it } from "vitest";
import { EcadSim, pinsCompatible } from "../sim";
import { allParts } from "../catalog";
import type { Ecad } from "../install";
import type { EcadLayer } from "../scene";

/** Complete Ecad facade stub for agent tests (no three.js). */
function ecadStub(sim: EcadSim): Ecad {
  return {
    sim,
    layer: {
      add: () => null,
      remove: () => false,
      highlight: () => {},
      selected: () => null,
      update: () => {},
      get: () => undefined,
      dispose: () => {},
      group: {} as never,
    } as unknown as EcadLayer,
    bus: {
      run: () => undefined,
      has: () => false,
      register: () => {},
    } as never,
    catalog: () => allParts(),
    run: (b: string) => sim.run(b),
    attach: () => {},
  };
}
import { VirtualClock } from "../runtime";
import { makeFluxSession } from "../../flux/session";
import { registerEcadAgent, makeEcadAgent, ECAD_PROMPT_KEYS } from "../agent";
import { PROMPT_REGISTRY } from "../../flux/agent/registry";

function makeSim() {
  return new EcadSim(new VirtualClock());
}

const BLINK_CODE = `
function setup() { pinMode(13, OUTPUT); }
async function loop() {
  digitalWrite(13, HIGH);
  await delay(100);
  digitalWrite(13, LOW);
  await delay(100);
}`;

describe("ecad sim — placement + wiring", () => {
  it("inserts, lists, moves, removes parts", () => {
    const sim = makeSim();
    const uno = sim.insert("arduino-uno", { x: 10, y: 0, z: 0 });
    const led = sim.insert("led-red", { x: 40, y: 0, z: 0 });
    expect(sim.instances.size).toBe(2);
    expect(sim.partOf(uno.id)?.name).toBe("Arduino Uno R3");
    sim.move(led.id, { x: 50, y: 1, z: 2 });
    expect(sim.instances.get(led.id)?.position).toEqual({ x: 50, y: 1, z: 2 });
    expect(sim.remove(uno.id)).toBe(true);
    expect(sim.instances.size).toBe(1);
    expect(() => sim.insert("nope")).toThrow(/unknown part/);
  });

  it("enforces pin-compatibility rules on wires", () => {
    const sim = makeSim();
    const uno = sim.insert("arduino-uno");
    const led = sim.insert("led-red");
    const oled = sim.insert("ssd1306-128x64");
    // gpio -> gpio (LED anode) works
    const wire = sim.wire(`${uno.id}.13`, `${led.id}.A`);
    expect(wire.id).toBeTruthy();
    // i2c-sda -> i2c-sda works
    sim.wire(`${uno.id}.A4`, `${oled.id}.SDA`);
    sim.wire(`${uno.id}.A5`, `${oled.id}.SCL`);
    // gpio -> i2c-sda does NOT
    expect(() => sim.wire(`${uno.id}.2`, `${oled.id}.SDA`)).toThrow(
      /incompatible/,
    );
    // unknown pin does NOT
    expect(() => sim.wire(`${uno.id}.ZZ`, `${led.id}.A`)).toThrow(
      /unknown pin/,
    );
    // self-wire does NOT
    expect(() => sim.wire(`${uno.id}.2`, `${uno.id}.3`)).toThrow(/itself/);
    // unwiring removes
    expect(sim.unwire(wire.id)).toBe(true);
    expect(sim.wires.length).toBe(2);
    expect(pinsCompatible("gpio", "gpio")).toBe(true);
    expect(pinsCompatible("i2c-sda", "i2c-scl")).toBe(false);
  });

  it("removing a part removes its wires", () => {
    const sim = makeSim();
    const uno = sim.insert("arduino-uno");
    const led = sim.insert("led-red");
    sim.wire(`${uno.id}.13`, `${led.id}.A`);
    sim.remove(led.id);
    expect(sim.wires.length).toBe(0);
  });
});

describe("ecad sim — virtual firmware in 3D space", () => {
  it("a wired LED follows the board pin state", async () => {
    const sim = makeSim();
    const clock = new VirtualClock();
    const sim2 = new EcadSim(clock);
    const uno = sim2.insert("arduino-uno");
    const led = sim2.insert("led-red", { x: 30, y: 0, z: 0 });
    sim2.wire(`${uno.id}.13`, `${led.id}.A`);
    sim2.deploy(uno.id, { code: BLINK_CODE });
    await sim2.run(uno.id);
    await clock.advance(50);
    expect(sim2.ledLevel(led.id)).toBe(1); // HIGH @ t=0
    await clock.advance(100); // t=150: LOW fired @ 100
    expect(sim2.ledLevel(led.id)).toBe(0);
    await clock.advance(300); // t=450: HIGH fired @ 400
    expect(sim2.ledLevel(led.id)).toBe(1);
    sim2.stop(uno.id);
    expect(sim2.status(uno.id).running).toBe(false);
    void sim;
  });

  it("rejects hex firmware on non-AVR boards", () => {
    const sim = makeSim();
    const pico = sim.insert("rpi-pico");
    expect(() => sim.deploy(pico.id, { hex: ":00000001FF" })).toThrow(/AVR/);
  });

  it("wires an I2C OLED and draws text into its buffer", async () => {
    const sim = new EcadSim(new VirtualClock());
    const uno = sim.insert("arduino-uno");
    const oled = sim.insert("ssd1306-128x64", { x: 0, y: 0, z: 20 });
    sim.wire(`${uno.id}.A4`, `${oled.id}.SDA`);
    sim.wire(`${uno.id}.A5`, `${oled.id}.SCL`);
    sim.deploy(uno.id, {
      code: `async function loop() { Display.clear(); Display.text("SCADGEN MCU", 0, 0); await delay(50); }`,
    });
    await sim.run(uno.id);
    const bound = sim.displayOf(uno.id);
    expect(bound).not.toBeNull();
    const mono = sim.monoBuffer(uno.id);
    expect(mono?.w).toBe(128);
    expect(mono?.h).toBe(64);
    // "S" drawn at (0,0): first column lights rows 1..5 (glyph 0x7e top row is 0)
    expect(mono?.get(0, 1)).toBe(true);
    expect(mono?.get(0, 0)).toBe(false);
    sim.stop(uno.id);
  });

  it("a button press propagates into the running firmware", async () => {
    const sim = new EcadSim(); // wall clock: real-time waits below
    const uno = sim.insert("arduino-uno");
    const btn = sim.insert("button", { x: 20, y: 0, z: 0 });
    const led = sim.insert("led-green", { x: 40, y: 0, z: 0 });
    sim.wire(`${uno.id}.2`, `${btn.id}.1`);
    sim.wire(`${uno.id}.13`, `${led.id}.A`);
    sim.deploy(uno.id, {
      code: `function setup() { pinMode(2, INPUT_PULLUP); pinMode(13, OUTPUT); }
             async function loop() { digitalWrite(13, digitalRead("2") ? LOW : HIGH); await delay(10); }`,
    });
    await sim.run(uno.id);
    sim.press(btn.id);
    await new Promise((r) => setTimeout(r, 150)); // wall clock: loop yields every 10ms
    expect(sim.ledLevel(led.id)).toBe(1);
    sim.release(btn.id);
    await new Promise((r) => setTimeout(r, 150));
    expect(sim.ledLevel(led.id)).toBe(0);
    sim.stop(uno.id);
  });

  it("serial output accumulates per board", async () => {
    const sim = new EcadSim(new VirtualClock());
    const uno = sim.insert("arduino-uno");
    sim.deploy(uno.id, {
      code: `async function loop() { Serial.println("alive"); await delay(100); }`,
    });
    await sim.run(uno.id);
    await new Promise((r) => setTimeout(r, 250));
    expect(
      sim.serial(uno.id).filter((l) => l === "alive").length,
    ).toBeGreaterThanOrEqual(1);
    sim.stop(uno.id);
  });

  it("hex firmware runs on the Uno and drives D13 through the pin map", async () => {
    const sim = new EcadSim(new VirtualClock());
    const uno = sim.insert("arduino-uno");
    const led = sim.insert("led-red", { x: 30, y: 0, z: 0 });
    sim.wire(`${uno.id}.13`, `${led.id}.A`);
    sim.deploy(uno.id, { firmwareId: "blink-hex-uno" });
    const status = await sim.run(uno.id);
    expect(status.tier).toBe("hex");
    // 1.1s of simulated 16MHz time in bounded chunks
    for (let i = 0; i < 12; i++) sim.tick(100);
    expect(sim.ledLevel(led.id)).toBe(1); // LED on after first sbi (~instant)
    sim.stop(uno.id);
  }, 30_000);
});

describe("ecad — flux AI agent path", () => {
  it("registers ECAD prompt actions in the flux registry", () => {
    registerEcadAgent(
      makeFluxSession({ projectName: "t" }),
      ecadStub(makeSim()),
    );
    for (const key of ECAD_PROMPT_KEYS)
      expect(PROMPT_REGISTRY[key]).toBeDefined();
    expect(PROMPT_REGISTRY.writeFirmware?.tool?.name).toBe("writeFirmware");
  });

  it("routes ecad keys to the ecad agent and runs turns end-to-end", async () => {
    const sim = makeSim();
    const session = makeFluxSession({ projectName: "ecad-test" });
    registerEcadAgent(session, ecadStub(sim));

    // arg-less analyze action through the full orchestrator turn
    const listed = await session.orchestrator.runTurn("listBoards", []);
    expect(listed.ok).toBe(true);
    const data = listed.data as { boards: { id: string }[]; total: number };
    expect(data.total).toBeGreaterThanOrEqual(20); // 14 boards + 9 displays

    // placement + wiring + deploy + run via the agent's local executor
    const agent = makeEcadAgent(ecadStub(sim));
    const ctx = { designators: [] } as never;
    const placed = agent.runLocal(
      PROMPT_REGISTRY.insertMcu!,
      { part: "esp32-devkit", x: 5 },
      ctx,
    );
    expect(placed?.ok).toBe(true);
    const inst = (placed!.data as { instance: string }).instance;

    const oled = agent.runLocal(
      PROMPT_REGISTRY.insertMcu!,
      { part: "ssd1306-128x64" },
      ctx,
    );
    const oledId = (oled!.data as { instance: string }).instance;
    const wired = agent.runLocal(
      PROMPT_REGISTRY.wirePins!,
      { from: `${inst}.21`, to: `${oledId}.SDA` },
      ctx,
    );
    expect(wired?.ok).toBe(true);
    const deployed = agent.runLocal(
      PROMPT_REGISTRY.deployFirmware!,
      { board: inst, firmwareId: "hello-oled" },
      ctx,
    );
    expect(deployed?.ok).toBe(true);
    const started = agent.runLocal(
      PROMPT_REGISTRY.runFirmware!,
      { board: inst, verb: "run" },
      ctx,
    );
    expect((started!.data as { running: boolean }).running).toBe(true);

    const status = await session.orchestrator.runTurn("ecadStatus", []);
    expect(status.ok).toBe(true);
    const sd = status.data as {
      parts: unknown[];
      wires: unknown[];
      running: unknown[];
    };
    expect(sd.parts.length).toBe(2);
    expect(sd.wires.length).toBe(1);
    expect(sd.running.length).toBe(1);

    // bad part name fails honestly
    const bad = agent.runLocal(
      PROMPT_REGISTRY.insertMcu!,
      { part: "nonexistent-chip" },
      ctx,
    );
    expect(bad?.ok).toBe(false);
  });
});
