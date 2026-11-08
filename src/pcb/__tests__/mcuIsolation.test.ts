import { describe, expect, it } from "vitest";
import { makeHeadlessEcad } from "../../ecad/headless";
import { EcadSim } from "../../ecad/sim";
import type { EcadSnapshot } from "../../ecad/persist";
import {
  emptyPcbStudio,
  pcbStudioFromDesign,
  serializePcbStudio,
} from "../model";

/**
 * Two PCB documents, each with its own virtual MCU snapshot. Both use instance
 * id `b1` on purpose: ids are document-local, so restoring one must never
 * resolve against the other's scene.
 */
function twoDocuments(): {
  docA: ReturnType<typeof emptyPcbStudio>;
  docB: ReturnType<typeof emptyPcbStudio>;
} {
  const simA = new EcadSim();
  const uno = simA.insert("arduino-uno");
  simA.deploy(uno.id, { firmwareId: "hello-serial" });
  const snapA = simA.snapshot();
  simA.clear();

  const simB = new EcadSim();
  const nano = simB.insert("arduino-nano");
  simB.deploy(nano.id, {
    code: `function setup() {}
async function loop() { await delay(1000); }`,
  });
  const snapB = simB.snapshot();
  simB.clear();

  expect(uno.id).toBe(nano.id);
  return {
    docA: { ...emptyPcbStudio("Controller A"), virtualMcu: snapA },
    docB: { ...emptyPcbStudio("Controller B"), virtualMcu: snapB },
  };
}

function snapshotOf(doc: ReturnType<typeof emptyPcbStudio>): EcadSnapshot {
  const parsed = pcbStudioFromDesign(serializePcbStudio(doc));
  expect(parsed).not.toBeNull();
  expect(parsed!.virtualMcu).toBeDefined();
  return parsed!.virtualMcu!;
}

describe("virtual MCU isolation across documents and surfaces", () => {
  it("restores two PCB documents without sharing parts or firmware", () => {
    const { docA, docB } = twoDocuments();
    const boardA = makeHeadlessEcad();
    const boardB = makeHeadlessEcad();
    try {
      boardA.sim.restore(snapshotOf(docA));
      boardB.sim.restore(snapshotOf(docB));

      expect(boardA.sim.instances.size).toBe(1);
      expect(boardB.sim.instances.size).toBe(1);
      expect(boardA.sim.partOf("b1")?.name).toBe("Arduino Uno R3");
      expect(boardB.sim.partOf("b1")?.name).toBe("Arduino Nano");
      expect(boardA.sim.firmwareOf("b1")?.id).toBe("hello-serial");
      expect(boardB.sim.firmwareOf("b1")?.id).toBe("custom");

      // Mutating one document's scene must not touch the other, even though
      // both use the same instance id.
      boardA.sim.insert("led-red");
      boardA.sim.remove("b1");
      expect(boardA.sim.instances.size).toBe(1);
      expect(boardA.sim.instances.has("b1")).toBe(false);
      expect(boardB.sim.instances.size).toBe(1);
      expect(boardB.sim.partOf("b1")?.name).toBe("Arduino Nano");
      expect(boardB.sim.firmwareOf("b1")?.id).toBe("custom");

      // Disposing one surface leaves the other usable.
      boardA.dispose();
      expect(boardB.sim.instances.size).toBe(1);
      expect(boardB.sim.status("b1").firmwareId).toBe("custom");
    } finally {
      boardA.dispose();
      boardB.dispose();
    }
  });

  it("keeps a PCB workbench and a desk-style ECAD simulator independent", async () => {
    const { docA, docB } = twoDocuments();
    const pcbSurface = makeHeadlessEcad();
    // Desk/VR surfaces construct EcadSim directly; the headless PCB surface
    // must not share its instances, wires, runtimes or serial log.
    const deskSurface = new EcadSim();
    try {
      pcbSurface.sim.restore(snapshotOf(docA));
      deskSurface.restore(snapshotOf(docB));

      await pcbSurface.sim.run("b1");
      await new Promise((resolve) => setTimeout(resolve, 1_100));

      expect(pcbSurface.sim.status("b1").running).toBe(true);
      expect(pcbSurface.sim.serial("b1").join("\n")).toContain("scadgen alive");
      expect(deskSurface.status("b1").running).toBe(false);
      expect(deskSurface.serial("b1")).toEqual([]);
      expect(deskSurface.firmwareOf("b1")?.id).toBe("custom");

      // Editing the desk surface cannot leak into the PCB document snapshot.
      deskSurface.insert("led-green");
      expect(pcbSurface.sim.instances.size).toBe(1);
      const saved = JSON.parse(serializePcbStudio(docA)) as {
        virtualMcu: { instances: unknown[] };
      };
      expect(saved.virtualMcu.instances).toHaveLength(1);
    } finally {
      pcbSurface.dispose();
      deskSurface.clear();
    }
  });

  it("restoring the same snapshot twice yields independent runtimes", async () => {
    const { docA } = twoDocuments();
    const snapshot = snapshotOf(docA);
    const first = makeHeadlessEcad();
    const second = makeHeadlessEcad();
    try {
      first.sim.restore(snapshot);
      second.sim.restore(snapshot);
      await first.sim.run("b1");
      await second.sim.run("b1");
      await new Promise((resolve) => setTimeout(resolve, 1_100));

      first.sim.stop("b1");
      expect(first.sim.status("b1").running).toBe(false);
      expect(second.sim.status("b1").running).toBe(true);
      expect(second.sim.serial("b1").join("\n")).toContain("scadgen alive");

      // The persisted snapshot is a value, not a live handle: restoring and
      // stopping never mutates it.
      expect(snapshot.instances).toHaveLength(1);
      expect(snapshot.firmware).toHaveLength(1);
      expect(snapshot.firmware[0]?.firmwareId).toBe("hello-serial");
    } finally {
      first.dispose();
      second.dispose();
    }
  });
});
