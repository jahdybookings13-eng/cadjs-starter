import { describe, expect, it } from "vitest";
import {
  addPcbLibraryPart,
  addPcbTrace,
  emptyPcbStudio,
  movePcbPart,
  runPcbDrc,
  setPcbPinNet,
  updatePcbRules,
} from "../model";
import { addPcbVia } from "../layout";

function linkedDoc() {
  let doc = emptyPcbStudio("DRC");
  doc = addPcbLibraryPart(doc, "resistor-0805", "R1");
  doc = addPcbLibraryPart(doc, "resistor-0805", "R2");
  doc = movePcbPart(doc, "R1", 20, 20);
  doc = movePcbPart(doc, "R2", 40, 20);
  doc = setPcbPinNet(doc, "R1", "1", "A");
  doc = setPcbPinNet(doc, "R1", "2", "B");
  doc = setPcbPinNet(doc, "R2", "1", "A");
  doc = setPcbPinNet(doc, "R2", "2", "B");
  return doc;
}

describe("PCB design rule checks", () => {
  it("names clearance, trace-width and annular-ring violations with fix targets", () => {
    let doc = emptyPcbStudio("Clearance");
    doc = addPcbTrace(
      doc,
      "A",
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
      ],
      "top",
      0.2,
    );
    doc = addPcbTrace(
      doc,
      "B",
      [
        { x: 10, y: 10.1 },
        { x: 30, y: 10.1 },
      ],
      "top",
      0.2,
    );
    doc = addPcbTrace(
      doc,
      "C",
      [
        { x: 10, y: 20 },
        { x: 20, y: 20 },
      ],
      "top",
      0.05,
    );
    const violations = runPcbDrc(doc);
    const clearance = violations.find((v) => v.code === "DRC-CLEARANCE");
    expect(clearance).toBeTruthy();
    expect(clearance?.fix?.kind).toBe("trace");
    expect(clearance?.severity).toBe("error");
    expect(violations.some((v) => v.code === "DRC-TRACE-WIDTH")).toBe(true);

    let viaDoc = updatePcbRules(doc, { minViaPadMM: 0.1 });
    viaDoc = addPcbVia(viaDoc, "A", 25, 25, { drillMM: 0.3, padMM: 0.4 });
    expect(runPcbDrc(viaDoc).some((v) => v.code === "DRC-VIA-ANNULAR")).toBe(
      true,
    );
  });

  it("flags unconnected pads and traces outside the outline", () => {
    let doc = linkedDoc();
    const unconnected = runPcbDrc(doc).find(
      (v) => v.code === "DRC-UNCONNECTED",
    );
    expect(unconnected).toBeTruthy();
    expect(unconnected?.where).toBe("A");

    doc = addPcbTrace(
      doc,
      "A",
      [
        { x: 5, y: 5 },
        { x: 80, y: 5 },
      ],
      "top",
      0.2,
    );
    expect(runPcbDrc(doc).some((v) => v.code === "DRC-OUTLINE")).toBe(true);
  });

  it("flags courtyard overlap when two footprints sit on top of each other", () => {
    let doc = linkedDoc();
    doc = movePcbPart(doc, "R2", 20, 20);
    const overlap = runPcbDrc(doc).find((v) => v.rule === "pcb-overlap");
    expect(overlap).toBeTruthy();
    expect(overlap?.code).toBe("DRC-COURTYARD");
  });

  it("keeps ERC rule names for the studio rules panel", () => {
    let doc = emptyPcbStudio("ERC");
    doc = addPcbLibraryPart(doc, "mcu-328p", "U1");
    const violations = runPcbDrc(doc);
    expect(violations.some((v) => v.rule === "erc.unconnected")).toBe(true);
    expect(violations.every((v) => v.code.length > 0)).toBe(true);
    expect(
      violations.every((v) => v.source === "erc" || v.fix !== undefined),
    ).toBe(true);
  });
});
