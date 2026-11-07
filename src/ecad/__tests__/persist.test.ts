import { describe, it, expect } from "vitest";

import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";
import { analyzeBoard } from "../studio";
import {
  ECAD_SNAPSHOT_VERSION,
  isEcadSnapshot,
  type EcadSnapshot,
} from "../persist";
import { saveProject } from "../../model/documentStore";

const CUSTOM = `
const LED = LED_PIN;
function setup() { pinMode(LED, OUTPUT); }
async function loop() {
  digitalWrite(LED, HIGH);
  await delay(250);
  digitalWrite(LED, LOW);
  await delay(250);
}
`;

function buildScene() {
  const sim = new EcadSim(new VirtualClock());
  const board = sim.insert("arduino-uno");
  const led = sim.insert("rgb-led");
  sim.wire(`${board.id}.13`, `${led.id}.R`);
  sim.deploy(board.id, { code: CUSTOM });
  return { sim, board, led };
}

describe("ecad snapshot", () => {
  it("round-trips parts, wires and the exact firmware text", () => {
    const { sim, board, led } = buildScene();
    const snap = sim.snapshot();
    expect(snap.v).toBe(ECAD_SNAPSHOT_VERSION);
    expect(snap.instances.map((i) => i.id).sort()).toEqual(
      [board.id, led.id].sort(),
    );
    expect(snap.wires).toHaveLength(1);
    expect(snap.firmware).toHaveLength(1);
    expect(snap.firmware[0]?.source).toBe(CUSTOM);

    const restored = new EcadSim(new VirtualClock());
    expect(restored.restore(snap)).toBe(2);
    expect([...restored.instances.keys()].sort()).toEqual(
      [board.id, led.id].sort(),
    );
    expect(restored.wires).toHaveLength(1);
    expect(restored.firmwareOf(board.id)?.source).toBe(CUSTOM);
    // The restored scene still validates as ready: same pins, same wiring.
    expect(analyzeBoard(restored, board.id).verdict).toBe("ready");
  });

  it("keeps firmware that came from the catalog attached by id", () => {
    const sim = new EcadSim(new VirtualClock());
    const board = sim.insert("arduino-uno");
    sim.deploy(board.id, { firmwareId: "blink" });
    const restored = new EcadSim(new VirtualClock());
    restored.restore(sim.snapshot());
    expect(restored.firmwareOf(board.id)?.id).toBe("blink");
  });

  it("does not reuse ids after a restore", () => {
    const { sim, board } = buildScene();
    const restored = new EcadSim(new VirtualClock());
    restored.restore(sim.snapshot());
    const fresh = restored.insert("arduino-uno");
    expect(fresh.id).not.toBe(board.id);
    expect(restored.instances.size).toBe(3);
  });

  it("drops unknown parts and stale wires instead of failing the load", () => {
    const { sim } = buildScene();
    const snap = sim.snapshot();
    const broken: EcadSnapshot = {
      ...snap,
      instances: [
        ...snap.instances,
        {
          id: "b99",
          partId: "part-that-no-longer-exists",
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
        },
      ],
      wires: [
        ...snap.wires,
        { from: { inst: "b99", pin: "1" }, to: { inst: "p9", pin: "A" } },
      ],
    };
    const restored = new EcadSim(new VirtualClock());
    expect(restored.restore(broken)).toBe(2);
    expect(restored.instances.has("b99")).toBe(false);
    expect(restored.wires).toHaveLength(1);
  });

  it("clears a scene completely", () => {
    const { sim } = buildScene();
    sim.clear();
    expect(sim.instances.size).toBe(0);
    expect(sim.wires).toHaveLength(0);
  });

  it("guards snapshots read back from storage", () => {
    const { sim } = buildScene();
    expect(isEcadSnapshot(sim.snapshot())).toBe(true);
    expect(isEcadSnapshot(null)).toBe(false);
    expect(isEcadSnapshot({ v: 1 })).toBe(false);
    expect(isEcadSnapshot({ ...sim.snapshot(), v: 99 })).toBe(false);
  });
});

describe("document persistence", () => {
  it("writes the ecad scene into the project blob", () => {
    const { sim } = buildScene();
    const snap = sim.snapshot();
    const doc = JSON.parse(saveProject(snap)) as { ecad?: { v: number } };
    expect(doc.ecad?.v).toBe(ECAD_SNAPSHOT_VERSION);
  });

  it("leaves the key out for CAD-only saves", () => {
    const doc = JSON.parse(saveProject()) as Record<string, unknown>;
    expect("ecad" in doc).toBe(false);
  });
});
