import { describe, expect, it } from "vitest";
import { newDocument, newDocumentTab } from "../../document";
import { addTab } from "../../document/model";
import {
  emptyAssemblyTab,
  parseAssemblyTab,
  serializeAssemblyTab,
} from "../document";
import { identity } from "../model";
import { parseDrawingTab } from "../../drawings/model";

describe("document workspace tabs", () => {
  it("creates an Assembly tab with a valid persisted payload", () => {
    const tab = newDocumentTab("assembly");
    expect(tab.kind).toBe("assembly");
    const parsed = parseAssemblyTab(tab.design);
    expect(parsed).not.toBeNull();
    expect(parsed!.kind).toBe("assembly");
    expect(parsed!.assembly.instances).toEqual([]);
  });

  it("creates a Drawing tab with a valid persisted payload", () => {
    const tab = newDocumentTab("drawing");
    expect(tab.kind).toBe("drawing");
    const parsed = parseDrawingTab(tab.design);
    expect(parsed).not.toBeNull();
    expect(parsed!.kind).toBe("drawing");
    expect(parsed!.sheet.size).toBe("A4");
  });

  it("round-trips nested subassemblies and assembly features", () => {
    const data = emptyAssemblyTab("part");
    data.assembly.instances = [
      {
        id: "sub_1",
        partId: "subasm",
        name: "Gear set",
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        subassembly: {
          id: "subasm",
          name: "Gear set",
          instances: [
            {
              id: "gear",
              partId: "gear",
              bodyId: "body-gear",
              transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            },
          ],
          mates: [],
          features: [
            {
              id: "f1",
              kind: "hole",
              instanceId: "gear",
              axis: "z",
              radius: 2,
              depth: 8,
              offset: [0, 0, 0],
            },
          ],
        },
      },
    ];
    const parsed = parseAssemblyTab(serializeAssemblyTab(data));
    expect(parsed?.assembly.instances[0]?.subassembly?.instances).toHaveLength(
      1,
    );
    expect(
      parsed?.assembly.instances[0]?.subassembly?.features?.[0],
    ).toMatchObject({ id: "f1", kind: "hole", radius: 2 });
  });

  it("round-trips boss, fillet, and chamfer assembly features", () => {
    const data = emptyAssemblyTab("part");
    data.assembly.instances = [
      {
        id: "i1",
        partId: "p",
        transform: identity(),
      },
    ];
    data.assembly.features = (["boss", "fillet", "chamfer"] as const).map(
      (kind, index) => ({
        id: `f${index}`,
        kind,
        instanceId: "i1",
        axis: "z" as const,
        radius: 3,
        depth: 6,
        offset: [0, 0, 0] as [number, number, number],
      }),
    );
    const parsed = parseAssemblyTab(serializeAssemblyTab(data));
    expect(parsed?.assembly.features?.map((f) => f.kind)).toEqual([
      "boss",
      "fillet",
      "chamfer",
    ]);
  });

  it("keeps assembly and drawing tabs alongside a Part Studio", () => {
    const doc = newDocument({ projectId: "prj_4_5" });
    const assembly = newDocumentTab("assembly", {
      design: JSON.stringify(emptyAssemblyTab(doc.tabs[0]!.id)),
    });
    const drawing = newDocumentTab("drawing");
    const next = addTab(addTab(doc, assembly), drawing);
    expect(next.tabs.map((tab) => tab.kind)).toEqual([
      "partstudio",
      "assembly",
      "drawing",
    ]);
    expect(parseAssemblyTab(next.tabs[1]!.design)?.sourceTabId).toBe(
      doc.tabs[0]!.id,
    );
  });
});
