import { describe, expect, it } from "vitest";
import { buildPcb, createPcbDemo, ensureCopperLayers } from "../build";
import { buildFabrication } from "../fabrication";
import { addPcbTrace, emptyPcbStudio } from "../model";

describe("PCB fabrication outputs", () => {
  it("emits RS-274X copper, Excellon drill, CPL and BoM for the demo", () => {
    const demo = createPcbDemo();
    const fab = buildFabrication(demo);
    expect(fab.ok).toBe(true);
    const byName = new Map(fab.files.map((file) => [file.name, file.content]));

    const top = byName.get("top-copper.gbr")!;
    expect(top).toContain("%FSLAX46Y46*%");
    expect(top).toContain("%MOMM*%");
    expect(top).toContain("D03*");
    expect(top).toContain("D01*");
    expect(top).toContain("M02*");

    const outline = byName.get("board-outline.gbr")!;
    expect(outline).toContain("%TF.FileFunction,Profile,NP*%");

    const drill = byName.get("drill.drl")!;
    expect(drill).toContain("M48");
    expect(drill).toContain("METRIC,TZ");
    expect(drill).toContain("M30");
    expect(drill).toMatch(/T\d+C\d\.\d{4}/);
    expect(drill).toMatch(/X\d+\.\d{4}Y\d+\.\d{4}/);

    const cpl = byName.get("pick-and-place.csv")!;
    expect(cpl).toContain("Designator,Mid X (mm)");
    expect(cpl.split("\n").filter(Boolean)).toHaveLength(7);

    const bom = byName.get("bom.csv")!;
    expect(bom).toContain("U1");
    expect(bom).toContain("ATMEGA328P-AU");

    expect(fab.stats.layers).toBe(2);
    expect(fab.stats.components).toBe(6);
    expect(fab.stats.bytes).toBeGreaterThan(10_000);
    expect(fab.zip.length).toBeGreaterThan(1000);
  });

  it("fails empty copper, drill and placement by name instead of emitting blanks", () => {
    const fab = buildFabrication(emptyPcbStudio("Empty"));
    expect(fab.ok).toBe(false);
    const codes = fab.issues.map((issue) => issue.code);
    expect(codes).toContain("FAB-EMPTY-LAYER");
    expect(codes).toContain("FAB-NO-HOLES");
    expect(codes).toContain("FAB-NO-PARTS");
    expect(codes).toContain("FAB-EMPTY-BOM");
    expect(
      fab.files.find((file) => file.name === "README.txt")?.content,
    ).toContain("Layer mapping");
  });

  it("produces four non-empty copper layers for a 4-layer board", () => {
    const demo = createPcbDemo();
    const four = ensureCopperLayers({
      ...demo,
      board: { ...demo.board, layers: 4 as const },
    });
    const fab = buildFabrication(four);
    expect(fab.stats.layers).toBe(4);
    for (const name of [
      "top-copper.gbr",
      "inner1-copper.gbr",
      "inner2-copper.gbr",
      "bottom-copper.gbr",
    ]) {
      const content = fab.files.find((file) => file.name === name)?.content;
      expect(content).toContain("D01*");
    }
    expect(fab.issues.filter((i) => i.code === "FAB-EMPTY-LAYER")).toEqual([]);
  });

  it("rejects a trace below the rule minimum in the fab package", () => {
    let doc = createPcbDemo();
    doc = addPcbTrace(
      doc,
      "GND",
      [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
      ],
      "top",
      0.05,
    );
    const fab = buildFabrication(doc);
    expect(fab.issues.some((issue) => issue.code === "FAB-TRACE-WIDTH")).toBe(
      true,
    );
    expect(fab.ok).toBe(false);
  });
});
