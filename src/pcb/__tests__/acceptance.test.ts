import { debugLog } from "@vitekk02/cadjs";
import { describe, expect, it } from "vitest";
import { checkPcbAssembly } from "../assembly";
import { buildPcb, createPcbDemo } from "../build";
import { buildFabrication } from "../fabrication";
import { netConnectivity, pcbRatsnest } from "../layout";
import { pcbStudioFromDesign, serializePcbStudio } from "../model";
import { buildNetlist } from "../schematic";

describe("PCB acceptance (P8-EXIT-04)", () => {
  it("draws a two-sheet schematic, builds the board, passes DRC and exports fab outputs", () => {
    const built = buildPcb(createPcbDemo(), { gridMM: 0.5 });
    const doc = built.doc;

    // Two sheets, real wires and labels, resolved into a netlist.
    expect(doc.schematic.sheets.length).toBeGreaterThanOrEqual(2);
    expect(doc.schematic.sheets[0]!.symbols.length).toBeGreaterThan(0);
    expect(
      doc.schematic.sheets.reduce(
        (total, sheet) => total + sheet.junctions.length,
        0,
      ),
    ).toBeGreaterThan(0);
    const netlist = buildNetlist(doc);
    expect(netlist.nets.length).toBeGreaterThanOrEqual(6);
    expect(
      netlist.nets.find((net) => net.name === "GND")?.pins.length,
    ).toBeGreaterThan(1);

    // Placement + routing really ran.
    expect(built.report.placement?.placed).toBeGreaterThan(0);
    expect(built.report.route?.failed).toBe(0);
    expect(built.report.route?.routed).toBeGreaterThan(0);
    expect(doc.traces.length).toBeGreaterThan(0);
    expect(pcbRatsnest(doc).length).toBeGreaterThan(0);
    expect(netConnectivity(doc).broken).toEqual([]);

    // DRC is clean of errors (warnings are allowed: unused MCU pins).
    const errors = built.report.drc.violations.filter(
      (violation) => violation.severity === "error",
    );
    expect(errors, JSON.stringify(errors.slice(0, 4))).toEqual([]);
    expect(built.report.drc.clean).toBe(true);

    // Fabrication package: every promised layer is present and non-empty.
    const fab = buildFabrication(doc);
    expect(fab.issues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    expect(fab.ok).toBe(true);
    const names = fab.files.map((file) => file.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "top-copper.gbr",
        "bottom-copper.gbr",
        "top-mask.gbr",
        "bottom-mask.gbr",
        "top-silk.gbr",
        "board-outline.gbr",
        "drill.drl",
        "pick-and-place.csv",
        "bom.csv",
      ]),
    );
    expect(fab.stats.components).toBe(6);
    expect(fab.stats.holes).toBeGreaterThanOrEqual(4);
    expect(fab.zip.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));

    // 3D assembly: real transforms, no collision with the default enclosure.
    const assembly = checkPcbAssembly(doc);
    expect(assembly.componentCount).toBe(6);
    expect(assembly.pass).toBe(true);
    expect(assembly.collisions).toEqual([]);

    // Save/reload keeps the built document byte-identically.
    const reloaded = pcbStudioFromDesign(serializePcbStudio(doc));
    expect(reloaded).not.toBeNull();
    expect(serializePcbStudio(reloaded!)).toBe(serializePcbStudio(doc));

    // Record the acceptance numbers for the ledger. The browser build is
    // measured separately by e2e/pcb-studio.spec.ts; this is the Node core.
    expect(built.report.ms).toBeLessThan(5_000);
    debugLog(`[pcb] demo build ${built.report.ms} ms`);
  }, 120_000);

  it("keeps the build deterministic for the same input", () => {
    const a = buildPcb(createPcbDemo(), { gridMM: 0.5 });
    const b = buildPcb(createPcbDemo(), { gridMM: 0.5 });
    expect(a.report.drc.errors).toBe(b.report.drc.errors);
    expect(a.report.route?.routed).toBe(b.report.route?.routed);
    expect(a.doc.traces.length).toBe(b.doc.traces.length);
    expect(a.report.fab.stats.holes).toBe(b.report.fab.stats.holes);
  }, 120_000);
});
