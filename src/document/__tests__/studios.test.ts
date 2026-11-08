import { describe, expect, it } from "vitest";
import {
  DOCUMENT_TAB_KINDS,
  TAB_KIND_LABEL,
  newDocument,
  newDocumentTab,
  normalizeDocument,
  type CadDocument,
} from "../model";
import { STUDIO_TAB_KINDS, tabKindDisabledReason } from "../studios";
import { camStudioFromDesign } from "../../cam/model";
import { renderStudioFromDesign } from "../../render/model";
import { simulationStudioFromDesign } from "../../sim/model";
import { pcbStudioFromDesign } from "../../pcb/model";

describe("studio tab navigation", () => {
  it("declares Render, Simulation, CAM and PCB tab kinds", () => {
    expect(STUDIO_TAB_KINDS).toEqual([
      "renderstudio",
      "simulationstudio",
      "camstudio",
      "pcbstudio",
    ]);
    for (const kind of STUDIO_TAB_KINDS) {
      expect(DOCUMENT_TAB_KINDS).toContain(kind);
      expect(TAB_KIND_LABEL[kind].toLowerCase()).toContain("studio");
    }
  });

  it("allows every studio tab, including ScadStudio:pcb", () => {
    for (const kind of STUDIO_TAB_KINDS) {
      expect(tabKindDisabledReason(kind)).toBeNull();
    }
    expect(TAB_KIND_LABEL.pcbstudio).toBe("ScadStudio:pcb");
  });

  it("creates a persisted CAM payload and keeps it through normalization", () => {
    const tab = newDocumentTab("camstudio");
    expect(tab.kind).toBe("camstudio");
    expect(camStudioFromDesign(tab.design)).not.toBeNull();
    const document = newDocument({ projectId: "cam-doc" });
    document.tabs.push(tab);
    document.activeTabId = tab.id;
    const normalized = normalizeDocument(document);
    expect(normalized).not.toBeNull();
    expect(
      normalized!.tabs.find((entry) => entry.kind === "camstudio"),
    ).toEqual(tab);
  });

  it("creates persisted Render, Simulation and ScadStudio:pcb payloads", () => {
    const render = newDocumentTab("renderstudio");
    expect(render.kind).toBe("renderstudio");
    expect(renderStudioFromDesign(render.design)).not.toBeNull();
    const simulation = newDocumentTab("simulationstudio");
    expect(simulation.kind).toBe("simulationstudio");
    expect(simulationStudioFromDesign(simulation.design)).not.toBeNull();
    const pcb = newDocumentTab("pcbstudio");
    expect(pcb.kind).toBe("pcbstudio");
    expect(pcb.name).toBe("ScadStudio:pcb");
    expect(pcbStudioFromDesign(pcb.design)).not.toBeNull();
  });

  it("preserves CAM tabs through a document round-trip", () => {
    const document = newDocument({ projectId: "cam-round-trip" });
    const tab = newDocumentTab("camstudio", { name: "Bracket CAM" });
    document.tabs = [document.tabs[0]!, tab];
    const raw = JSON.parse(JSON.stringify(document)) as CadDocument;
    const normalized = normalizeDocument(raw);
    expect(normalized?.tabs.map((entry) => entry.kind)).toEqual([
      "partstudio",
      "camstudio",
    ]);
    expect(normalized?.tabs[1]?.name).toBe("Bracket CAM");
  });
});
