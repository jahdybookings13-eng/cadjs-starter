// ecad/__tests__/radio.test.ts — the in-world RF medium: link budget, a
// transmitter keying a receiver's lamp across space, a receiving board reading
// the link, range/channel selectivity, and tuned channels surviving a snapshot.

import { describe, expect, it } from "vitest";
import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";
import {
  channelMatches,
  deliverEdge,
  reachMeters,
  receivedDbm,
} from "../radio";

const TX = { powerDbm: 10, lossDb: 25 };
const RX = { sensitivityDbm: -95, lossDb: 25 };

function lastFrame(sim: EcadSim) {
  const frames = sim.radioFrames();
  return frames[frames.length - 1];
}

describe("in-world RF — link budget", () => {
  it("decides reach from power, path loss and sensitivity", () => {
    const tx = {
      id: "tx",
      mhz: 433.92,
      ...TX,
      position: { x: 0, y: 0, z: 0 },
    };
    const near = {
      id: "rx",
      mhz: 433.92,
      ...RX,
      position: { x: 2000, y: 0, z: 0 },
    };
    const far = { ...near, position: { x: 400_000, y: 0, z: 0 } };
    expect(receivedDbm(TX, RX, 433.92, 2)).toBeGreaterThan(-95);
    expect(deliverEdge(tx, [near], 1)).toHaveLength(1);
    expect(deliverEdge(tx, [far], 1)).toHaveLength(0);
    const reach = reachMeters(TX, RX, 433.92);
    expect(reach).toBeGreaterThan(20);
    expect(reach).toBeLessThan(60);
    // 433.920 and 433.921 are the same channel; 915 MHz is not.
    expect(channelMatches(433.92, 433.921)).toBe(true);
    expect(channelMatches(433.92, 915)).toBe(false);
  });
});

describe("in-world RF — a link you can build in the world", () => {
  it("keys a receiver across the room and lights its lamp", async () => {
    const clock = new VirtualClock();
    const sim = new EcadSim(clock);
    const uno = sim.insert("arduino-uno");
    const tx = sim.insert("rf-tx-433", { x: 50, y: 0, z: 0 });
    const rx = sim.insert("rf-rx-433", { x: 3050, y: 0, z: 0 }); // 3 m
    const led = sim.insert("led-red", { x: 3100, y: 0, z: 0 });
    sim.wire(`${uno.id}.7`, `${tx.id}.DATA`);
    sim.wire(`${rx.id}.OUT`, `${led.id}.A`);
    sim.deploy(uno.id, { firmwareId: "rf-send" });
    await sim.run(uno.id);

    const link = sim.radioLink(tx.id, rx.id);
    expect(link?.hears).toBe(true);
    expect(link?.meters).toBeCloseTo(3, 5);

    await clock.advance(1); // sender keys HIGH at t=0
    sim.tick(1); // the edge travels; receiver OUT goes high
    expect(sim.ledLevel(led.id)).toBe(1);
    expect(lastFrame(sim)?.level).toBe(1);

    await clock.advance(110); // sender keys LOW at t=100
    sim.tick(1);
    expect(sim.ledLevel(led.id)).toBe(0);
    expect(lastFrame(sim)?.level).toBe(0);
    sim.stop(uno.id);
  });

  it("feeds a receiving board's input, so firmware sees the link", async () => {
    const clock = new VirtualClock();
    const sim = new EcadSim(clock);
    const sender = sim.insert("arduino-uno");
    const receiver = sim.insert("arduino-uno", { x: 2000, y: 0, z: 0 });
    const tx = sim.insert("rf-tx-433", { x: 100, y: 0, z: 0 });
    const rx = sim.insert("rf-rx-433", { x: 2100, y: 0, z: 0 });
    const led = sim.insert("led-red", { x: 2100, y: 0, z: 40 });
    sim.wire(`${sender.id}.7`, `${tx.id}.DATA`);
    sim.wire(`${receiver.id}.2`, `${rx.id}.OUT`);
    sim.wire(`${receiver.id}.13`, `${led.id}.A`);
    sim.deploy(sender.id, {
      code: `function setup() { pinMode(7, OUTPUT); }
             async function loop() {
               digitalWrite(7, HIGH); await delay(100);
               digitalWrite(7, LOW); await delay(100);
             }`,
    });
    sim.deploy(receiver.id, {
      code: `function setup() { pinMode(2, INPUT); pinMode(13, OUTPUT); }
             async function loop() { digitalWrite(13, digitalRead(2)); await delay(10); }`,
    });
    await sim.run(sender.id);
    await sim.run(receiver.id);
    // Unconnected inputs read high (pull-up), so the lamp starts on.
    expect(sim.ledLevel(led.id)).toBe(1);

    await clock.advance(1);
    sim.tick(1); // HIGH delivered
    await clock.advance(110); // LOW keyed at t=100; receiver still holds HIGH
    sim.tick(1); // LOW delivered into the receiver's input
    await clock.advance(30);
    expect(sim.ledLevel(led.id)).toBe(0);
    sim.stop(sender.id);
    sim.stop(receiver.id);
  });

  it("drops off-channel and out-of-range links but keeps the wire intact", async () => {
    const clock = new VirtualClock();
    const sim = new EcadSim(clock);
    const uno = sim.insert("arduino-uno");
    const tx = sim.insert("rf-tx-433", { x: 0, y: 0, z: 0 });
    const rx = sim.insert("rf-rx-433", { x: 1500, y: 0, z: 0 });
    sim.wire(`${uno.id}.7`, `${tx.id}.DATA`);
    sim.deploy(uno.id, { firmwareId: "rf-send" });
    await sim.run(uno.id);

    await clock.advance(1);
    sim.tick(1);
    expect(sim.radioFrames().length).toBeGreaterThan(0);

    sim.tuneRadio(rx.id, 915);
    expect(sim.radioLink(tx.id, rx.id)?.hears).toBe(false);
    const heard = sim.radioFrames().length;
    await clock.advance(110);
    sim.tick(1);
    expect(sim.radioFrames().length).toBe(heard);

    // Back on channel but 900 m away: below sensitivity, still silent.
    sim.tuneRadio(rx.id, 433.92);
    sim.move(rx.id, { x: 900_000, y: 0, z: 0 });
    expect(sim.radioLink(tx.id, rx.id)?.hears).toBe(false);
    await clock.advance(110);
    sim.tick(1);
    expect(sim.radioFrames().length).toBe(heard);

    // …and back in the room.
    sim.move(rx.id, { x: 1000, y: 0, z: 0 });
    await clock.advance(210);
    sim.tick(1);
    expect(sim.radioFrames().length).toBeGreaterThan(heard);
    sim.stop(uno.id);
  });

  it("persists tuning through a snapshot and rejects non-radio parts", () => {
    const sim = new EcadSim();
    const tx = sim.insert("rf-tx-433");
    const led = sim.insert("led-red");
    sim.tuneRadio(tx.id, 868);
    expect(sim.radioChannel(tx.id)).toBe(868);
    const snap = sim.snapshot();
    expect(snap.instances.find((i) => i.id === tx.id)?.radio).toBe(868);
    const restored = new EcadSim();
    restored.restore(snap);
    expect(restored.radioChannel(tx.id)).toBe(868);
    expect(() => sim.tuneRadio(led.id, 433)).toThrow(/not an RF part/);
  });
});
