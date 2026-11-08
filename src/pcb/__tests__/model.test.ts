import { describe, expect, it } from "vitest";
import {
  PCB_LIBRARY,
  addPcbCustomPart,
  addPcbLibraryPart,
  addPcbTrace,
  emptyPcbStudio,
  movePcbPart,
  pcb3dBoxes,
  pcbBom,
  pcbStudioFromDesign,
  runPcbDrc,
  serializePcbStudio,
  setPcbPinNet,
  syncPcbNets,
} from "../model";
import { allElements } from "../../flux/domains/pcb/project";
import { EcadSim } from "../../ecad/sim";

describe("ScadStudio:pcb model", () => {
  it("starts with a real board and persists an empty tab", () => {
    const doc = emptyPcbStudio("Controller");
    expect(doc.board.widthMM).toBe(60);
    expect(doc.board.layers).toBe(2);
    expect(doc.project.root.kind).toBe("root");
    const parsed = pcbStudioFromDesign(serializePcbStudio(doc));
    expect(parsed?.name).toBe("Controller");
    expect(pcbStudioFromDesign("")).not.toBeNull();
    expect(pcbStudioFromDesign("{bad")).toBeNull();
  });

  it("adds library parts with unique designators", () => {
    let doc = emptyPcbStudio();
    doc = addPcbLibraryPart(doc, "mcu-328p");
    doc = addPcbLibraryPart(doc, "resistor-0805");
    doc = addPcbLibraryPart(doc, "resistor-0805");
    expect(allElements(doc.project).map((el) => el.designator)).toEqual([
      "U1",
      "R1",
      "R2",
    ]);
    expect(doc.project).toBeTruthy();
    expect(PCB_LIBRARY.length).toBeGreaterThan(3);
    expect(PCB_LIBRARY[0]!.model3D).toBe("builtin://tqfp-32");
  });

  it("persists custom parts with real pads and a 3D model link", () => {
    let doc = emptyPcbStudio();
    doc = addPcbCustomPart(doc, {
      name: "Custom sensor",
      prefix: "U",
      model3D: "builtin://sensor-box",
      pins: [
        { pin: "1", name: "VCC", kind: "power" },
        { pin: "2", name: "GND", kind: "gnd" },
        { pin: "3", name: "SDA", kind: "signal" },
      ],
    });
    const reloaded = pcbStudioFromDesign(serializePcbStudio(doc));
    expect(reloaded).not.toBeNull();
    expect(reloaded!.library).toHaveLength(1);
    expect(reloaded!.library[0]!.pads.length).toBeGreaterThanOrEqual(2);
    expect(reloaded!.library[0]!.model3D).toBe("builtin://sensor-box");
  });

  it("persists the virtual MCU snapshot inside the PCB document", () => {
    const sim = new EcadSim();
    const board = sim.insert("arduino-uno");
    sim.deploy(board.id, { firmwareId: "hello-serial" });
    const doc = { ...emptyPcbStudio(), virtualMcu: sim.snapshot() };
    const reloaded = pcbStudioFromDesign(serializePcbStudio(doc));
    expect(reloaded).not.toBeNull();
    expect(reloaded!.virtualMcu?.instances).toHaveLength(1);
    expect(reloaded!.virtualMcu?.instances[0]?.id).toBe(board.id);
    expect(reloaded!.virtualMcu?.firmware[0]?.firmwareId).toBe("hello-serial");
    sim.clear();
  });

  it("builds nets from pins and routes traces", () => {
    let doc = emptyPcbStudio();
    doc = addPcbLibraryPart(doc, "mcu-328p");
    doc = addPcbLibraryPart(doc, "resistor-0805");
    doc = setPcbPinNet(doc, "U1", "1", "VCC");
    doc = setPcbPinNet(doc, "U1", "2", "GND");
    doc = setPcbPinNet(doc, "U1", "3", "SIG");
    doc = setPcbPinNet(doc, "R1", "1", "SIG");
    doc = setPcbPinNet(doc, "R1", "2", "GND");
    expect(doc.project.nets.map((net) => net.name).sort()).toEqual([
      "GND",
      "SIG",
      "VCC",
    ]);
    const synced = syncPcbNets(doc.project);
    expect(synced.nets.find((net) => net.name === "SIG")?.pins).toHaveLength(2);
    doc = addPcbTrace(doc, "SIG", [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
    expect(doc.traces).toHaveLength(1);
  });

  it("reports ERC and physical DRC violations", () => {
    let doc = emptyPcbStudio();
    doc = addPcbLibraryPart(doc, "mcu-328p");
    expect(runPcbDrc(doc).some((v) => v.rule === "erc.unconnected")).toBe(true);
    doc = movePcbPart(doc, "U1", 1, 1);
    expect(runPcbDrc(doc).some((v) => v.rule === "pcb-outline")).toBe(true);
    doc = addPcbTrace(doc, "missing", [
      { x: 1, y: 1 },
      { x: 80, y: 80 },
    ]);
    expect(runPcbDrc(doc).some((v) => v.rule === "pcb-trace-outline")).toBe(
      true,
    );
    expect(runPcbDrc(doc).some((v) => v.rule === "pcb-trace-net")).toBe(true);
  });

  it("produces BOM rows and a 3D board with component boxes", () => {
    let doc = emptyPcbStudio();
    doc = addPcbLibraryPart(doc, "mcu-328p");
    doc = addPcbLibraryPart(doc, "capacitor-0805");
    const boxes = pcb3dBoxes(doc);
    expect(boxes).toHaveLength(3);
    expect(boxes[0]!.id).toBe("board");
    expect(boxes.some((box) => box.id === "U1")).toBe(true);
    expect(pcbBom(doc).length).toBe(2);
  });
});
