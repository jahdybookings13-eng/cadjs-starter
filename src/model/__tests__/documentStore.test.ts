import { describe, expect, it } from "vitest";
import { scadgenHistory } from "../featureEngine";
import { buildBoxNodes } from "../primitives";
import { loadProject, saveProject } from "../documentStore";
import { scadgenParts } from "../parts";

describe("documentStore", () => {
  it("save/load round-trips the full node list", () => {
    scadgenHistory.restoreNodes([
      ...buildBoxNodes("P1", "p", 1, 1, 1),
      ...buildBoxNodes("P2", "q", 2, 2, 2),
    ]);
    scadgenHistory.setRollbackTo(3);
    const text = saveProject();
    scadgenHistory.restoreNodes([]);
    expect(scadgenHistory.serializeNodes().length).toBe(0);
    const n = loadProject(text);
    expect(n).toBe(4);
    const ids = scadgenHistory
      .serializeNodes()
      .map((x) => x.featureId)
      .sort();
    expect(ids).toEqual(["P1", "P1_sk", "P2", "P2_sk"]);
    expect(scadgenHistory.getRollbackIndex()).toBe(3);
    expect(() => loadProject(JSON.stringify({ v: 9 }))).toThrow(/unsupported/);
  });

  it("persists parts, body names, material and visibility with the design", () => {
    scadgenParts.reset();
    scadgenHistory.restoreNodes(buildBoxNodes("P1", "p", 1, 1, 1));
    const part = scadgenParts.addPart({
      name: "Housing",
      number: "PN-1",
      description: "Shell",
    });
    scadgenParts.ensureBody("P1", "p");
    scadgenParts.assignBody("P1", part.id);
    scadgenParts.renameBody("P1", "Base");
    scadgenParts.setMaterial("P1", "steel");
    scadgenParts.setAppearance("P1", { color: "#abcdef" });
    scadgenParts.setHidden("P1", true);
    scadgenParts.setTransparent("P1", true);

    const text = saveProject();
    scadgenParts.reset();
    loadProject(text);

    expect(scadgenParts.part(part.id)).toMatchObject({
      name: "Housing",
      number: "PN-1",
      description: "Shell",
      bodyIds: ["P1"],
    });
    expect(scadgenParts.body("P1")).toMatchObject({
      name: "Base",
      partId: part.id,
      materialId: "steel",
      appearance: { color: "#abcdef" },
      hidden: true,
      transparent: true,
    });
    expect(scadgenParts.isHidden("P1")).toBe(true);
    expect(scadgenParts.materialOf("P1")?.label).toBe("Steel");
  });
});
