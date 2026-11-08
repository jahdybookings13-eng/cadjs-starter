import { describe, expect, it } from "vitest";
import { EcadSim } from "../../ecad/sim";
import { applyPcbNetlist } from "../mcuBridge";
import {
  addPcbLibraryPart,
  emptyPcbStudio,
  pcbStudioFromDesign,
  serializePcbStudio,
  setPcbPinNet,
  type PcbStudioDocument,
} from "../model";

function bridgeFixture(): {
  doc: PcbStudioDocument;
  sim: EcadSim;
  board: string;
  led: string;
} {
  let doc = emptyPcbStudio("Netlist bridge");
  doc = addPcbLibraryPart(doc, "mcu-328p");
  doc = addPcbLibraryPart(doc, "led-0805");
  // U1 pin 9 is D5 on the TQFP-32; D1 pin 1 is the LED anode.
  doc = setPcbPinNet(doc, "U1", "9", "SIG");
  doc = setPcbPinNet(doc, "U1", "2", "GND");
  doc = setPcbPinNet(doc, "D1", "1", "SIG");
  doc = setPcbPinNet(doc, "D1", "2", "GND");
  const sim = new EcadSim();
  const boardInst = sim.insert("arduino-uno");
  const ledInst = sim.insert("led-red");
  doc = {
    ...doc,
    virtualMcuLinks: [
      { designator: "U1", instance: boardInst.id },
      { designator: "D1", instance: ledInst.id },
    ],
  };
  return { doc, sim, board: boardInst.id, led: ledInst.id };
}

describe("PCB ↔ virtual MCU netlist bridge", () => {
  it("projects PCB nets into real ECAD wires", () => {
    const { doc, sim, board, led } = bridgeFixture();
    try {
      const report = applyPcbNetlist(sim, doc);
      expect(report.wires).toBe(1);
      expect(report.unresolved).toEqual([]);
      expect(sim.wires).toEqual([
        expect.objectContaining({
          from: { inst: board, pin: "5" },
          to: { inst: led, pin: "A" },
        }),
      ]);
      // GND ties a GPIO LED cathode to a supply pin; the ECAD rules refuse it
      // rather than silently pretending the board is wired.
      expect(report.skipped).toEqual([
        expect.objectContaining({ net: "GND", pin: "D1.2" }),
      ]);

      // Re-applying is idempotent: no duplicate wires.
      const again = applyPcbNetlist(sim, doc);
      expect(again.wires).toBe(0);
      expect(again.existing).toBe(1);
      expect(sim.wires).toHaveLength(1);
    } finally {
      sim.clear();
    }
  });

  it("lets firmware drive a PCB-connected LED through the netlist", async () => {
    const { doc, sim, board, led } = bridgeFixture();
    try {
      expect(applyPcbNetlist(sim, doc).wires).toBe(1);
      sim.deploy(board, {
        code: `
function setup() {
  pinMode(5, OUTPUT);
  digitalWrite(5, HIGH);
}
async function loop() {
  await delay(1000);
}
`,
      });
      await sim.run(board);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // The wire came from the PCB net, the drive came from firmware, and the
      // LED level is real simulator state.
      expect(sim.pinDrive(board, "5").digital).toBe(1);
      expect(sim.ledLevel(led)).toBe(1);
      expect(sim.status(board).running).toBe(true);
    } finally {
      sim.clear();
    }
  });

  it("persists the link table with the PCB document", () => {
    const { doc, sim } = bridgeFixture();
    try {
      const reloaded = pcbStudioFromDesign(serializePcbStudio(doc));
      expect(reloaded).not.toBeNull();
      expect(reloaded!.virtualMcuLinks).toEqual(doc.virtualMcuLinks);

      // Duplicate designators/instances and blank entries are dropped.
      const dirty = pcbStudioFromDesign(
        JSON.stringify({
          ...doc,
          virtualMcuLinks: [
            { designator: "U1", instance: "b1" },
            { designator: "U1", instance: "b2" },
            { designator: "D1", instance: "b1" },
            { designator: "", instance: "b3" },
            { designator: "Q1", instance: "" },
          ],
        }),
      );
      expect(dirty!.virtualMcuLinks).toEqual([
        { designator: "U1", instance: "b1" },
      ]);
    } finally {
      sim.clear();
    }
  });

  it("reports links that no longer resolve instead of throwing", () => {
    const { doc, sim } = bridgeFixture();
    try {
      const stale = {
        ...doc,
        virtualMcuLinks: [
          ...(doc.virtualMcuLinks ?? []),
          { designator: "U9", instance: "b99" },
          { designator: "D1", instance: "nope" },
        ],
      };
      const report = applyPcbNetlist(sim, stale);
      expect(report.wires).toBe(1);
      expect(report.unresolved).toEqual(
        expect.arrayContaining([
          expect.stringContaining("U9: element is not in the PCB project"),
          expect.stringContaining('"nope" is not in the scene'),
        ]),
      );
    } finally {
      sim.clear();
    }
  });
});
