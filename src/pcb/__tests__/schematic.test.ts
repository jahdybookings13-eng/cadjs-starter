import { describe, expect, it } from "vitest";
import { allElements } from "../../flux/domains/pcb/project";
import {
  addPcbLibraryPart,
  emptyPcbStudio,
  pcbStudioFromDesign,
  serializePcbStudio,
  setPcbPinNet,
} from "../model";
import {
  addSchematicSheet,
  applyNetlist,
  autoSchematic,
  buildNetlist,
} from "../schematic";

function twoPartDoc() {
  let doc = emptyPcbStudio("Schematic");
  doc = addPcbLibraryPart(doc, "mcu-328p", "U1");
  doc = addPcbLibraryPart(doc, "resistor-0805", "R1");
  doc = addPcbLibraryPart(doc, "header-1x4", "J1");
  doc = setPcbPinNet(doc, "U1", "1", "VCC");
  doc = setPcbPinNet(doc, "U1", "2", "GND");
  doc = setPcbPinNet(doc, "U1", "3", "SIG");
  doc = setPcbPinNet(doc, "R1", "1", "SIG");
  doc = setPcbPinNet(doc, "R1", "2", "GND");
  doc = setPcbPinNet(doc, "J1", "1", "VCC");
  doc = setPcbPinNet(doc, "J1", "2", "GND");
  return doc;
}

describe("PCB schematic and netlist", () => {
  it("auto-captures every part on two sheets with wires", () => {
    const doc = autoSchematic(twoPartDoc());
    expect(doc.schematic.sheets).toHaveLength(2);
    const symbols = doc.schematic.sheets.flatMap((sheet) => sheet.symbols);
    expect(symbols.map((symbol) => symbol.designator).sort()).toEqual([
      "J1",
      "R1",
      "U1",
    ]);
    expect(symbols.every((symbol) => symbol.pins.length > 0)).toBe(true);
    expect(
      doc.schematic.sheets.flatMap((sheet) => sheet.wires).length,
    ).toBeGreaterThan(5);
    // Connector lives on the I/O sheet.
    expect(
      doc.schematic.sheets[1]!.symbols.some((s) => s.designator === "J1"),
    ).toBe(true);
  });

  it("resolves wires into named nets and applies them to the project", () => {
    const doc = autoSchematic(twoPartDoc());
    const netlist = buildNetlist(doc);
    const gnd = netlist.nets.find((net) => net.name === "GND");
    expect(
      gnd?.pins.map((pin) => `${pin.designator}.${pin.pin}`).sort(),
    ).toEqual(["J1.2", "R1.2", "U1.2"]);
    expect(netlist.nets.find((net) => net.name === "SIG")?.pins).toHaveLength(
      2,
    );
    // Unassigned MCU pins stay explicitly unconnected; assigned pins do not.
    expect(
      netlist.unconnected.some((pin) =>
        ["U1.1", "U1.2", "U1.3", "R1.1", "R1.2", "J1.1", "J1.2"].includes(
          `${pin.designator}.${pin.pin}`,
        ),
      ),
    ).toBe(false);
    expect(netlist.unconnected.length).toBeGreaterThan(0);

    const applied = applyNetlist(doc, netlist);
    const u1 = allElements(applied.project).find(
      (el) => el.designator === "U1",
    );
    expect(u1?.pins.find((pin) => pin.pin === "2")?.net).toBe("GND");
    expect(applied.project.nets.map((net) => net.name).sort()).toEqual([
      "GND",
      "SIG",
      "VCC",
    ]);
  });

  it("flags duplicate references and output conflicts", () => {
    let doc = autoSchematic(twoPartDoc());
    // Duplicate reference on a second sheet.
    doc = addSchematicSheet(doc, "Duplicate");
    const sheet2 = doc.schematic.sheets[1]!;
    const source = doc.schematic.sheets[0]!.symbols.find(
      (symbol) => symbol.designator === "R1",
    )!;
    doc = {
      ...doc,
      schematic: {
        sheets: doc.schematic.sheets.map((sheet) =>
          sheet.id === sheet2.id
            ? {
                ...sheet,
                symbols: [
                  ...sheet.symbols,
                  { ...source, id: `${source.id}_dup` },
                ],
              }
            : sheet,
        ),
      },
    };
    expect(buildNetlist(doc).issues.some((i) => i.code === "ERC-DUP-REF")).toBe(
      true,
    );

    let conflict = emptyPcbStudio("Conflict");
    conflict = addPcbLibraryPart(conflict, "mcu-328p", "U1");
    conflict = setPcbPinNet(conflict, "U1", "25", "BUS");
    conflict = setPcbPinNet(conflict, "U1", "27", "BUS");
    conflict = autoSchematic(conflict);
    expect(
      buildNetlist(conflict).issues.some(
        (issue) => issue.code === "ERC-OUTPUT-CONFLICT",
      ),
    ).toBe(true);
  });

  it("persists sheets, symbols and wires through save/reload", () => {
    const doc = autoSchematic(twoPartDoc());
    const reloaded = pcbStudioFromDesign(serializePcbStudio(doc));
    expect(reloaded).not.toBeNull();
    expect(reloaded!.schematic.sheets).toHaveLength(2);
    expect(serializePcbStudio(reloaded!)).toBe(serializePcbStudio(doc));
  });
});
