import { describe, expect, it } from "vitest";
import { ScadgenHistory } from "../featureEngine";
import {
  applyImportRecognitionMode,
  editImportedRecognitionMode,
  type ImportRecognition,
} from "../featuresF";
import { buildInsertNode } from "../onshapeHistory";

const recognition: ImportRecognition = {
  shape: "box",
  faces: 6,
  edges: 12,
  vertices: 8,
  dimensions: [10, 20, 30],
  confidence: 0.9,
};

describe("imported-body history", () => {
  it("edits recognition mode without dropping geometry", () => {
    const node = buildInsertNode("import_1", "Bracket", "asset_1", "step");
    const edited = editImportedRecognitionMode(node, "mesh");
    expect(
      edited.parameters.find(
        (parameter) => parameter.parameterId === "recognitionMode",
      ),
    ).toMatchObject({ kind: "enum", value: "mesh" });
    expect(
      edited.parameters.find((p) => p.parameterId === "assetId"),
    ).toMatchObject({
      value: "asset_1",
    });
    expect(applyImportRecognitionMode(recognition, "mesh").shape).toBe("mesh");
    expect(applyImportRecognitionMode(recognition, "auto")).toBe(recognition);
  });

  it("supports suppress/rollback and survives a history round-trip", () => {
    const history = new ScadgenHistory();
    const node = editImportedRecognitionMode(
      buildInsertNode("import_1", "Bracket", "asset_1", "iges"),
      "cylinder",
    );
    history.add(node);
    history.add(buildInsertNode("import_2", "Cover", "asset_2", "3mf"));
    expect(history.setSuppressed("import_1", true)).toBe(true);
    expect(history.evaluatedNodes().map((n) => n.featureId)).toEqual([
      "import_2",
    ]);
    history.setSuppressed("import_1", false);
    history.setRollbackTo(1);
    expect(history.evaluatedNodes().map((n) => n.featureId)).toEqual([
      "import_1",
    ]);

    const snapshot = history.snapshotState();
    const restored = new ScadgenHistory();
    restored.restoreState(snapshot);
    expect(restored.get("import_1")?.parameters).toEqual(node.parameters);
    expect(restored.getRollbackIndex()).toBe(1);
  });

  it("rejects imported-recognition edits on other feature types", () => {
    const history = new ScadgenHistory();
    history.add({
      ...buildInsertNode("sketch_1", "Sketch", "asset_1", "step"),
      featureType: "sketch",
    });
    expect(() =>
      editImportedRecognitionMode(history.get("sketch_1")!, "box"),
    ).toThrow(/inserted-body/);
  });
});
