import { describe, expect, it } from "vitest";
import { buildPcb, createPcbDemo, ensureCopperLayers } from "../build";
import {
  addPcbCutout,
  addPcbVia,
  addPcbZone,
  allPads,
  autoPlacePcb,
  netConnectivity,
  pcbRatsnest,
  pourRect,
} from "../layout";
import { emptyPcbStudio, addPcbLibraryPart, setPcbPinNet } from "../model";

function partsDoc() {
  let doc = emptyPcbStudio("Layout");
  doc = addPcbLibraryPart(doc, "mcu-328p", "U1");
  doc = addPcbLibraryPart(doc, "resistor-0805", "R1");
  doc = addPcbLibraryPart(doc, "capacitor-0805", "C1");
  doc = addPcbLibraryPart(doc, "header-1x4", "J1");
  doc = setPcbPinNet(doc, "R1", "1", "VCC");
  doc = setPcbPinNet(doc, "R1", "2", "GND");
  doc = setPcbPinNet(doc, "C1", "1", "VCC");
  doc = setPcbPinNet(doc, "C1", "2", "GND");
  doc = setPcbPinNet(doc, "J1", "1", "VCC");
  doc = setPcbPinNet(doc, "J1", "2", "GND");
  return doc;
}

describe("PCB layout", () => {
  it("shelf-places all parts inside the board without courtyard overlap", () => {
    const { doc, report } = autoPlacePcb(partsDoc());
    expect(report.placed).toBe(4);
    expect(report.unplaced).toEqual([]);
    const pads = allPads(doc);
    expect(pads.length).toBe(32 + 2 + 2 + 4);
    for (const pad of pads) {
      expect(pad.x).toBeGreaterThanOrEqual(0);
      expect(pad.y).toBeGreaterThanOrEqual(0);
      expect(pad.x).toBeLessThanOrEqual(doc.board.widthMM);
      expect(pad.y).toBeLessThanOrEqual(doc.board.heightMM);
    }
  });

  it("computes a ratsnest per net and routes the demo with no failures", () => {
    const demo = createPcbDemo();
    const rats = pcbRatsnest(demo);
    expect(rats.length).toBeGreaterThan(0);
    expect(rats.every((edge) => edge.lengthMM >= 0)).toBe(true);

    const built = buildPcb(demo, { gridMM: 0.5 });
    expect(built.report.route?.failed).toBe(0);
    expect(built.report.route?.routed).toBeGreaterThan(5);
    expect(netConnectivity(built.doc).broken).toEqual([]);
    expect(built.doc.traces.every((trace) => trace.widthMM >= 0.15)).toBe(true);
    expect(built.doc.vias.every((via) => via.drillMM >= 0.3)).toBe(true);
  }, 60_000);

  it("adds vias, pours and cutouts as first-class geometry", () => {
    let doc = partsDoc();
    doc = addPcbVia(doc, "GND", 10, 10);
    expect(doc.vias).toHaveLength(1);
    expect(doc.vias[0]!.padMM).toBeGreaterThanOrEqual(doc.rules.minViaPadMM);

    doc = addPcbZone(doc, "GND", "top", [
      { x: 2, y: 2 },
      { x: 20, y: 2 },
      { x: 20, y: 20 },
      { x: 2, y: 20 },
    ]);
    expect(doc.zones).toHaveLength(1);
    doc = addPcbCutout(doc, [
      { x: 30, y: 30 },
      { x: 34, y: 30 },
      { x: 34, y: 34 },
    ]);
    expect(doc.cutouts).toHaveLength(1);

    const poured = ensureCopperLayers(doc);
    expect(poured.zones.length).toBeGreaterThanOrEqual(2);
    expect(poured.zones.some((zone) => zone.net === "GND")).toBe(true);
    expect(poured.zones.some((zone) => zone.layer === "bottom")).toBe(true);
  });

  it("keeps 4-layer builds with both inner planes populated", () => {
    const demo = createPcbDemo();
    const four = { ...demo, board: { ...demo.board, layers: 4 as const } };
    const poured = ensureCopperLayers(four);
    expect(poured.zones.some((zone) => zone.layer === "inner1")).toBe(true);
    expect(poured.zones.some((zone) => zone.layer === "inner2")).toBe(true);
    expect(pourRect(four, "GND", "top").zones.at(-1)?.layer).toBe("top");
  });
});
