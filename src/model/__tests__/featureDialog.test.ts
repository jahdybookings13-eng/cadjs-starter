import { describe, expect, it } from "vitest";
import { buildExtrudeNode, provenanceForFeature } from "../onshapeHistory";
import { paramPanelForFeature } from "../paramPanel";
import { auditParameter } from "../paramSupport";
import {
  CLOSED_FEATURE_DIALOG,
  closeFeatureDialog,
  draftParameterFor,
  editFeatureDialog,
  featureDialogParameters,
  isFeatureDialogDirty,
  openFeatureDialog,
  resetFeatureDialog,
} from "../featureDialog";

const sketchQ = () => [provenanceForFeature("Fsk", "SKETCH_ENTITY", "l")];

const mkExtrude = () =>
  buildExtrudeNode("Fex", "E", sketchQ(), {
    value: 0.01,
    units: "mm",
    expression: "10*mm",
  });

describe("parameter support audit", () => {
  it("flags extrude params the kernel never reads", () => {
    expect(auditParameter("extrude", "depth")).toEqual({ status: "wired" });
    expect(auditParameter("extrude", "midplane")).toEqual({ status: "wired" });
    expect(auditParameter("extrude", "symmetric")).toEqual({ status: "wired" });
    expect(auditParameter("extrude", "hasOffset")).toEqual({ status: "wired" });
    expect(auditParameter("extrude", "offsetDistance")).toEqual({
      status: "wired",
    });
    for (const id of [
      "operationType",
      "targets",
      "endBound",
      "endBoundOffset",
      "endBoundEntity",
      "hasDraft",
      "draftAngle",
      "thinWall",
      "wallThickness",
    ]) {
      expect(auditParameter("extrude", id)).toEqual({ status: "wired" });
    }
  });

  it("does not pretend a feature type was audited", () => {
    expect(auditParameter("fastener", "length")).toBeNull();
    expect(auditParameter("notAFeature", "depth")).toBeNull();
  });

  it("carries the verdict into panel rows", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const depth = panel.rows.find((r) => r.parameterId === "depth")!;
    const op = panel.rows.find((r) => r.parameterId === "operationType")!;
    expect(depth.support?.status).toBe("wired");
    expect(op.support?.status).toBe("wired");
  });
});

describe("feature dialog lifecycle", () => {
  it("opens in editing with the current values and no dirty rows", () => {
    const state = openFeatureDialog([mkExtrude()], "Fex", [
      { id: "Ff", name: "Fillet 1" },
    ])!;
    expect(state.dependents).toEqual([{ id: "Ff", name: "Fillet 1" }]);
    expect(CLOSED_FEATURE_DIALOG.dependents).toEqual([]);
    expect(state.phase).toBe("editing");
    expect(state.featureId).toBe("Fex");
    expect(state.label).toBe("Extrude");
    expect(state.error).toBeNull();
    expect(state.draft["depth"]).toBeCloseTo(0.01);
    expect(isFeatureDialogDirty(state)).toBe(false);
    expect(featureDialogParameters(state)).toEqual([]);
  });

  it("returns null for unknown features and unknown types", () => {
    expect(openFeatureDialog([], "Fnone")).toBeNull();
    const ex = mkExtrude();
    ex.featureType = "notARealFeature";
    expect(openFeatureDialog([ex], "Fex")).toBeNull();
  });

  it("drafts a quantity edit and exposes exactly that parameter", () => {
    const state = openFeatureDialog([mkExtrude()], "Fex")!;
    const edited = editFeatureDialog(state, "depth", 0.02);
    expect(edited.error).toBeNull();
    expect(edited.draft["depth"]).toBe(0.02);
    expect(isFeatureDialogDirty(edited)).toBe(true);
    const params = featureDialogParameters(edited);
    expect(params).toHaveLength(1);
    expect(params[0]?.kind).toBe("quantity");
    if (params[0]?.kind === "quantity") {
      expect(params[0].value).toBeCloseTo(0.02);
      expect(params[0].units).toBe("m");
      // The kernel evaluates the expression, so it must carry the unit.
      expect(params[0].expression).toBe("0.02 m");
    }
    expect(draftParameterFor(edited, "depth")?.kind).toBe("quantity");
  });

  it("accepts operationType now that the kernel reads it", () => {
    const state = openFeatureDialog([mkExtrude()], "Fex")!;
    const edited = editFeatureDialog(state, "operationType", "CUT");
    expect(edited.error).toBeNull();
    expect(edited.draft["operationType"]).toBe("CUT");
    expect(isFeatureDialogDirty(edited)).toBe(true);
  });

  it("commits a picked end reference as a query list", () => {
    const state = openFeatureDialog([mkExtrude()], "Fex")!;
    const query = provenanceForFeature("Fbody", "FACE", "Fbody_F2");
    const edited = editFeatureDialog(state, "endBoundEntity", [query]);
    expect(edited.error).toBeNull();
    expect(isFeatureDialogDirty(edited)).toBe(true);
    const params = featureDialogParameters(edited);
    expect(params).toHaveLength(1);
    expect(params[0]?.kind).toBe("queryList");
    if (params[0]?.kind === "queryList") {
      expect(params[0].queries).toEqual([query]);
    }
  });

  it("rejects non-finite numbers", () => {
    const state = openFeatureDialog([mkExtrude()], "Fex")!;
    const edited = editFeatureDialog(state, "depth", Number.NaN);
    expect(edited.error).toContain("Depth");
    expect(isFeatureDialogDirty(edited)).toBe(false);
  });

  it("resets drafts to the current values and closes cleanly", () => {
    const state = editFeatureDialog(
      openFeatureDialog([mkExtrude()], "Fex")!,
      "depth",
      0.02,
    );
    const reset = resetFeatureDialog(state);
    expect(reset.draft["depth"]).toBeCloseTo(0.01);
    expect(isFeatureDialogDirty(reset)).toBe(false);
    expect(closeFeatureDialog()).toBe(CLOSED_FEATURE_DIALOG);
  });
});
