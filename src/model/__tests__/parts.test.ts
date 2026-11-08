import { beforeEach, describe, expect, it } from "vitest";
import {
  ScadgenParts,
  bodyBaseId,
  bodyNumber,
  consumedByFeature,
  defaultBodyName,
  exportableBodies,
} from "../parts";
import type { ScadgenFeatureNode } from "../onshapeHistory";

describe("ScadgenParts", () => {
  let parts: ScadgenParts;

  beforeEach(() => {
    parts = new ScadgenParts();
  });

  it("creates, renames and describes a part", () => {
    const part = parts.addPart({ name: "Housing" });
    expect(part).toMatchObject({
      name: "Housing",
      number: "",
      description: "",
      bodyIds: [],
    });
    expect(parts.renamePart(part.id, "Enclosure")).toBe(true);
    parts.updatePart(part.id, {
      number: "PN-100",
      description: "Main shell",
    });
    expect(parts.part(part.id)).toMatchObject({
      name: "Enclosure",
      number: "PN-100",
      description: "Main shell",
    });
  });

  it("keeps part names unique and rejects empty renames", () => {
    const a = parts.addPart({ name: "Part" });
    const b = parts.addPart({ name: "Part" });
    expect(b.name).toBe("Part (2)");
    expect(parts.renamePart(a.id, "   ")).toBe(false);
    expect(parts.renamePart(a.id, "Part (2)")).toBe(true);
    expect(parts.part(a.id)?.name).toBe("Part (2) (2)");
  });

  it("assigns bodies to parts and derives composite parts", () => {
    parts.ensureBody("F1", "Box");
    parts.ensureBody("F1#1", "Box");
    const part = parts.addPart({ name: "Housing" });
    expect(parts.isComposite(part.id)).toBe(false);
    parts.assignBody("F1", part.id);
    parts.assignBody("F1#1", part.id);
    expect(parts.bodiesOfPart(part.id).map((b) => b.id)).toEqual([
      "F1",
      "F1#1",
    ]);
    expect(parts.isComposite(part.id)).toBe(true);
    const other = parts.addPart({ name: "Other" });
    parts.assignBody("F1#1", other.id);
    expect(parts.part(part.id)?.bodyIds).toEqual(["F1"]);
    expect(parts.part(other.id)?.bodyIds).toEqual(["F1#1"]);
    parts.assignBody("F1", null);
    expect(parts.part(part.id)?.bodyIds).toEqual([]);
  });

  it("removing a part clears membership but keeps bodies", () => {
    const part = parts.addPart({ name: "Housing" });
    parts.ensureBody("F1", "Box");
    parts.assignBody("F1", part.id);
    expect(parts.removePart(part.id)).toBe(true);
    expect(parts.part(part.id)).toBeNull();
    expect(parts.body("F1")?.partId).toBeNull();
  });

  it("names bodies independently of the owning feature", () => {
    const rec = parts.ensureBody("F1#1", "Box");
    expect(rec.name).toBe("Box (body 2)");
    expect(parts.renameBody("F1#1", "Lid")).toBe(true);
    expect(parts.body("F1#1")?.name).toBe("Lid");
    // A rebuild must not overwrite the user name.
    expect(parts.ensureBody("F1#1", "Box").name).toBe("Lid");
    expect(parts.renameBody("F1#1", "")).toBe(false);
  });

  it("assigns materials and merges appearance over the material colour", () => {
    parts.ensureBody("F1", "Box");
    expect(parts.setMaterial("F1", "aluminum")).toBe(true);
    expect(parts.materialOf("F1")?.label).toBe("Aluminum");
    expect(parts.appearanceFor("F1")).toEqual({ color: "#c9d1d9" });
    parts.setAppearance("F1", { color: "#ff0000" });
    expect(parts.appearanceFor("F1")).toEqual({ color: "#ff0000" });
    parts.setTransparent("F1", true);
    expect(parts.appearanceFor("F1").opacity).toBeCloseTo(0.35);
    parts.setTransparent("F1", false);
    expect(parts.appearanceFor("F1").opacity).toBe(1);
    expect(parts.setMaterial("F1", "unobtainium")).toBe(false);
  });

  it("hides, isolates and removes bodies", () => {
    parts.ensureBody("F1", "Box");
    parts.ensureBody("F2", "Lid");
    parts.setHidden("F1", true);
    expect(parts.isHidden("F1")).toBe(true);
    parts.setHidden("F1", false);
    expect(parts.isHidden("F1")).toBe(false);

    expect(parts.isolate("F2")).toBe(true);
    expect(parts.isHidden("F1")).toBe(true);
    expect(parts.isHidden("F2")).toBe(false);
    parts.isolate(null);
    expect(parts.isHidden("F1")).toBe(false);

    parts.setRemoved("F1", true);
    expect(parts.isHidden("F1")).toBe(true);
    expect(parts.body("F1")?.state).toBe("removed");
    parts.setRemoved("F1", false);
    expect(parts.isHidden("F1")).toBe(false);
  });

  it("round-trips parts, names, materials, visibility and appearance", () => {
    const part = parts.addPart({
      name: "Housing",
      number: "PN-1",
      description: "Shell",
    });
    parts.ensureBody("F1", "Box");
    parts.ensureBody("F2", "Lid");
    parts.assignBody("F1", part.id);
    parts.assignBody("F2", part.id);
    parts.renameBody("F2", "Cover");
    parts.setMaterial("F1", "steel");
    parts.setAppearance("F2", { color: "#123456", opacity: 0.5 });
    parts.setHidden("F2", true);
    parts.setTransparent("F1", true);
    parts.setRemoved("F2", true);

    const snapshot = parts.serialize();
    const restored = new ScadgenParts();
    restored.restore(snapshot);
    expect(restored.part(part.id)).toMatchObject({
      name: "Housing",
      number: "PN-1",
      description: "Shell",
      bodyIds: ["F1", "F2"],
    });
    expect(restored.body("F1")).toMatchObject({
      name: "Box",
      partId: part.id,
      materialId: "steel",
      transparent: true,
    });
    expect(restored.body("F2")).toMatchObject({
      name: "Cover",
      appearance: { color: "#123456", opacity: 0.5 },
      hidden: true,
      state: "removed",
    });
    expect(restored.isHidden("F2")).toBe(true);
    // New ids continue after the restored sequence.
    expect(restored.addPart({ name: "Next" }).id).not.toBe(part.id);
  });

  it("tolerates an empty or malformed snapshot", () => {
    parts.ensureBody("F1", "Box");
    parts.restore(undefined);
    expect(parts.allBodies()).toEqual([]);
    parts.restore({
      parts: [{ id: 7 } as never],
      bodies: [{ id: "F1", name: 3 } as never],
      nextId: Number.NaN,
    } as never);
    // Malformed entries are normalized rather than trusted; a body with a
    // usable id is kept with safe defaults.
    expect(parts.allBodies()).toHaveLength(1);
    expect(parts.body("F1")).toMatchObject({
      name: "F1",
      partId: null,
      materialId: null,
      state: "keep",
    });
  });

  it("computes mass from volume and material density", () => {
    parts.ensureBody("F1", "Box");
    parts.setMaterial("F1", "steel");
    expect(parts.massKg("F1", 1_000_000)).toBeCloseTo(7.85, 6);
    expect(parts.massKg("F1", null)).toBeNull();
    parts.setMaterial("F1", null);
    expect(parts.massKg("F1", 1_000_000)).toBeNull();
  });

  it("excludes removed bodies from exports", () => {
    parts.ensureBody("F1", "Box");
    parts.ensureBody("F1#1", "Box");
    const part = parts.addPart({ name: "Housing" });
    parts.assignBodies(["F1", "F1#1"], part.id);
    parts.setRemoved("F1#1", true);
    // A removed body keeps its (hidden) element in the scene, so export must
    // filter the registry state rather than trust element resolution.
    expect(
      exportableBodies(parts.bodiesOfPart(part.id)).map((b) => b.id),
    ).toEqual(["F1"]);
    parts.setRemoved("F1#1", false);
    expect(exportableBodies(parts.bodiesOfPart(part.id))).toHaveLength(2);
  });

  it("reports the feature that consumed a body", () => {
    const nodes = [
      {
        featureId: "F1",
        featureType: "extrude",
        name: "Box",
        parameters: [],
        subFeatures: [],
        suppressed: false,
      },
      {
        featureId: "F2",
        featureType: "boolean",
        name: "Cut",
        parameters: [
          {
            kind: "queryList",
            parameterId: "tools",
            queries: [{ creationFeatureId: "F1" }],
          },
        ],
        subFeatures: [],
        suppressed: false,
      },
    ] as unknown as ScadgenFeatureNode[];
    expect(consumedByFeature(nodes, "F1")).toMatchObject({
      id: "F2",
      name: "Cut",
    });
    expect(consumedByFeature(nodes, "F1#1")).toMatchObject({ id: "F2" });
    expect(consumedByFeature([nodes[0]!], "F1")).toBeNull();
  });

  it("parses body addresses", () => {
    expect(bodyBaseId("F1#2")).toBe("F1");
    expect(bodyBaseId("F1")).toBe("F1");
    expect(bodyNumber("F1#2")).toBe(2);
    expect(bodyNumber("F1")).toBeNull();
    expect(defaultBodyName("Box", "F1#1")).toBe("Box (body 2)");
    expect(defaultBodyName("Box", "F1")).toBe("Box");
  });
});
