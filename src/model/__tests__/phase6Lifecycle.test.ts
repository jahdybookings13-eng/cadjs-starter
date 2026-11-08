import { describe, expect, it } from "vitest";
import {
  addPhase6Feature,
  deletePhase6Feature,
  editPhase6Feature,
  emptyPhase6FeatureHistory,
  phase6AffectedFeatures,
  phase6FeatureRows,
  phase6FeatureUndoName,
  reorderPhase6Feature,
  rollbackPhase6Feature,
  suppressPhase6Feature,
} from "../phase6Lifecycle";
import {
  addFrameEditorSegment,
  applyFrameEditor,
  analyzeCurvature,
  cancelFrameEditor,
  createFrameLayoutGroup,
  curvatureOverlay,
  curvatureSampleColor,
  openFrameEditor,
  PHASE6_DIALOGS,
  surfaceBodyPresentation,
  validatePhase6DialogSpec,
  type FrameLayoutSegment,
} from "../phase6b";
import { scadgenPhase6 } from "../phase6Store";
import type { BodyOutput } from "../executor";
import type { Phase6Result } from "../phase6";

const ok = <T>(result: Phase6Result<T>): T => {
  if (!result.ok)
    throw new Error(result.errors.map((e) => e.message).join("; "));
  return result.value;
};

const feature = (
  id: string,
  featureType: string,
  label: string,
  dependsOn: string[] = [],
) => ({ id, featureType, label, dependsOn });

describe("Phase 6 lifecycle and feature tree", () => {
  it("builds folder rows for sheet metal, frames, surfaces and conversions", () => {
    let history = emptyPhase6FeatureHistory();
    history = ok(
      addPhase6Feature(history, feature("sm1", "baseFlange", "Base flange")),
    );
    history = ok(
      addPhase6Feature(
        history,
        feature("sm2", "edgeFlange", "Edge flange", ["sm1"]),
      ),
    );
    history = ok(addPhase6Feature(history, feature("fr1", "frame", "Frame")));
    history = ok(
      addPhase6Feature(history, feature("su1", "surfaceLoft", "Surface loft")),
    );
    history = ok(
      addPhase6Feature(history, feature("cv1", "conversion", "Convert body")),
    );
    const rows = phase6FeatureRows(history);
    expect(rows.map((row) => row.folder)).toEqual([
      "Sheet metal",
      "Sheet metal",
      "Frames",
      "Surfaces",
      "Conversions",
    ]);
    expect(rows[1]!.depth).toBe(1);
    expect(rows[0]!.dependents).toEqual(["sm2"]);
    expect(phase6AffectedFeatures(history, "sm1")).toEqual(["sm2"]);
  });

  it("edits, suppresses, rolls back, reorders and protects dependents", () => {
    let history = emptyPhase6FeatureHistory();
    history = ok(
      addPhase6Feature(history, feature("sm1", "baseFlange", "Base flange")),
    );
    history = ok(
      addPhase6Feature(
        history,
        feature("sm2", "edgeFlange", "Edge flange", ["sm1"]),
      ),
    );
    history = ok(addPhase6Feature(history, feature("fr1", "frame", "Frame")));

    history = ok(editPhase6Feature(history, "sm1", { label: "Base" }));
    history = ok(suppressPhase6Feature(history, "sm1"));
    expect(phase6FeatureRows(history)[0]!.status).toBe("SUPPRESSED");
    history = ok(suppressPhase6Feature(history, "sm1", false));
    expect(phase6FeatureRows(history)[0]!.status).toBe("OK");

    const blocked = deletePhase6Feature(history, "sm1");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok)
      expect(blocked.errors[0]!.message).toContain("Edge flange");

    history = ok(reorderPhase6Feature(history, "fr1", 0));
    expect(history.features[0]!.id).toBe("fr1");

    history = ok(rollbackPhase6Feature(history, "sm1"));
    expect(phase6FeatureRows(history).map((row) => row.status)).toEqual([
      "OK",
      "ROLLED_BACK",
      "ROLLED_BACK",
    ]);
    history = ok(rollbackPhase6Feature(history, null));
    expect(phase6FeatureRows(history).every((row) => row.status === "OK")).toBe(
      true,
    );
    expect(phase6FeatureUndoName(history, "suppress", "sm1")).toBe(
      "Suppress Base",
    );
  });

  it("rejects unknown types, missing dependencies and self-dependency", () => {
    let history = emptyPhase6FeatureHistory();
    expect(addPhase6Feature(history, feature("x", "notAFeature", "X")).ok).toBe(
      false,
    );
    expect(
      addPhase6Feature(history, feature("x", "baseFlange", "X", ["missing"]))
        .ok,
    ).toBe(false);
    history = ok(
      addPhase6Feature(history, feature("sm1", "baseFlange", "Base")),
    );
    expect(editPhase6Feature(history, "sm1", { dependsOn: ["sm1"] }).ok).toBe(
      false,
    );
  });
});

describe("Frame editor and surface presentation", () => {
  const segment: FrameLayoutSegment = {
    id: "m1",
    startMM: [0, 0, 0],
    endMM: [1000, 0, 0],
    profileId: "sq-40-3",
  };

  it("opens, edits, applies and cancels a frame group", () => {
    const group = ok(createFrameLayoutGroup("g1", "Main", "x"));
    let editor = openFrameEditor(group);
    expect(editor.phase).toBe("editing");
    editor = addFrameEditorSegment(editor, segment);
    expect(editor.error).toBeNull();
    const applied = ok(applyFrameEditor(editor));
    expect(applied.segments).toHaveLength(1);
    expect(applied.orientation).toBe("x");
    expect(applyFrameEditor(openFrameEditor(group)).ok).toBe(false);
    editor = addFrameEditorSegment(editor, { ...segment, id: "m1" });
    expect(editor.error).toContain("duplicate");
    expect(cancelFrameEditor().phase).toBe("closed");
  });

  it("marks open surfaces double-sided and closed bodies single-sided", () => {
    expect(
      surfaceBodyPresentation({
        kind: "surface",
        openShell: true,
        boundaryEdges: 4,
      }),
    ).toMatchObject({
      doubleSided: true,
      boundaryEdgesVisible: true,
      opacity: 0.82,
    });
    expect(
      surfaceBodyPresentation({
        kind: "solid",
        openShell: false,
        boundaryEdges: 0,
      }),
    ).toMatchObject({ doubleSided: false, boundaryEdgesVisible: false });
  });

  it("reports numeric curvature and maps it onto the overlay ramp", () => {
    const body = {
      faceGeometry: {
        attributes: {
          position: {
            array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
            itemSize: 3,
            count: 4,
          },
        },
        index: {
          array: new Uint32Array([0, 1, 2, 0, 1, 3, 1, 2, 3, 0, 2, 3]),
        },
      },
    } as unknown as BodyOutput;
    const report = analyzeCurvature(body);
    expect(report.sampleCount).toBeGreaterThan(0);
    const overlay = curvatureOverlay(report, 2);
    expect(overlay.scale).toBe(2);
    expect(overlay.readout).toHaveLength(4);
    expect(curvatureSampleColor(0, 0, 1)).toBe("#2563eb");
    expect(curvatureSampleColor(1, 0, 1)).toBe("#ef4444");
  });

  it("covers every surface dialog, including curvature", () => {
    const types = PHASE6_DIALOGS.map((spec) => spec.featureType);
    for (const type of [
      "boundarySurface",
      "surfaceLoft",
      "surfaceFill",
      "ruledSurface",
      "surfaceOffset",
      "knitSurface",
      "trimSurface",
      "extendSurface",
      "thickenSurface",
      "replaceFace",
      "curvature",
    ])
      expect(types).toContain(type);
    for (const spec of PHASE6_DIALOGS)
      expect(validatePhase6DialogSpec(spec)).toEqual([]);
  });
});

describe("Phase 6 state undo and redo", () => {
  it("labels edits, restores state and replays redo", () => {
    scadgenPhase6.reset();
    expect(scadgenPhase6.canUndo()).toBe(false);
    scadgenPhase6.setDisplayUnit("in");
    expect(scadgenPhase6.snapshot().displayUnit).toBe("in");
    expect(scadgenPhase6.undoLabel()).toBe("Change display unit");
    const undone = scadgenPhase6.undo();
    expect(undone?.label).toBe("Change display unit");
    expect(scadgenPhase6.snapshot().displayUnit).toBe("mm");
    expect(scadgenPhase6.canRedo()).toBe(true);
    expect(scadgenPhase6.redoLabel()).toBe("Change display unit");
    scadgenPhase6.redo();
    expect(scadgenPhase6.snapshot().displayUnit).toBe("in");
    expect(scadgenPhase6.undoLabel()).toBe("Change display unit");
  });

  it("clears history on reset", () => {
    scadgenPhase6.reset();
    scadgenPhase6.setDisplayUnit("in");
    scadgenPhase6.reset();
    expect(scadgenPhase6.canUndo()).toBe(false);
    expect(scadgenPhase6.canRedo()).toBe(false);
  });
});
