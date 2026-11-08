import { describe, expect, it } from "vitest";
import type { Phase6Result } from "../phase6";
import {
  createSurfaceSpec,
  surfaceTrimLabel,
  validateBoundarySurfaceSpec,
  validateOffsetSurfaceSpec,
  validateRuledSurfaceSpec,
  validateSurfaceFillSpec,
  validateSurfaceLoftSpec,
} from "../phase6SurfaceSpecs";
import {
  PHASE6_ACTIONS,
  PHASE6_DIALOGS,
  phase6ActionForFeature,
  phase6DialogDisabledReason,
} from "../phase6b";
import {
  addPhase6Feature,
  emptyPhase6FeatureHistory,
  phase6FeatureTreeSections,
} from "../phase6Lifecycle";

const ok = <T>(result: Phase6Result<T>): T => {
  if (!result.ok)
    throw new Error(result.errors.map((e) => e.message).join("; "));
  return result.value;
};

describe("P6-SU-02 boundary surface specification", () => {
  it("requires at least two boundaries and validates continuity", () => {
    expect(
      validateBoundarySurfaceSpec({
        boundaryIds: ["e1", "e2", "e3"],
        continuity: "G1",
        constraintCurveIds: ["c1"],
        trim: true,
      }),
    ).toEqual([]);
    const issues = validateBoundarySurfaceSpec({
      boundaryIds: ["e1", "e1"],
      continuity: "G0",
      constraintCurveIds: [],
      trim: false,
    }).map((issue) => issue.path);
    expect(issues).toContain("surface.boundaryIds[1]");
    expect(
      validateBoundarySurfaceSpec({
        boundaryIds: ["e1"],
        continuity: "G1",
        constraintCurveIds: [],
        trim: false,
      }).map((issue) => issue.path),
    ).toContain("surface.boundaryIds");
  });
});

describe("P6-SU-03 surface loft specification", () => {
  it("requires sections, valid end conditions and finite twist", () => {
    expect(
      validateSurfaceLoftSpec({
        sectionIds: ["s1", "s2"],
        guideCurveIds: ["g1"],
        continuity: "G2",
        startCondition: "normal",
        endCondition: "tangent",
        closed: false,
        twistDeg: 0,
        ruled: false,
      }),
    ).toEqual([]);
    const paths = validateSurfaceLoftSpec({
      sectionIds: ["s1"],
      guideCurveIds: [],
      continuity: "G1",
      startCondition: "bogus" as never,
      endCondition: "direction",
      closed: false,
      twistDeg: NaN,
      ruled: true,
    }).map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "surface.sectionIds",
        "surface.startCondition",
        "surface.twistDeg",
      ]),
    );
  });
});

describe("P6-SU-04 fill surface specification", () => {
  it("keeps constraint curves and points with a valid boundary", () => {
    expect(
      validateSurfaceFillSpec({
        boundaryIds: ["loop-1"],
        constraintCurveIds: ["c1"],
        constraintPointIds: ["p1", "p2"],
        continuity: "G1",
        trim: true,
      }),
    ).toEqual([]);
    const paths = validateSurfaceFillSpec({
      boundaryIds: [],
      constraintCurveIds: [],
      constraintPointIds: ["p1", "p1"],
      continuity: "G0",
      trim: false,
    }).map((issue) => issue.path);
    expect(paths).toContain("surface.boundaryIds");
    expect(paths).toContain("surface.constraintPointIds[1]");
  });
});

describe("P6-SU-05 ruled surface specification", () => {
  it("supports multiple pairs and rejects self-pairs and bad spans", () => {
    expect(
      validateRuledSurfaceSpec({
        edgePairs: [
          ["e1", "e2"],
          ["e3", "e4"],
        ],
        spans: 2,
        trim: true,
        extendMM: 0,
      }),
    ).toEqual([]);
    const paths = validateRuledSurfaceSpec({
      edgePairs: [["e1", "e1"]],
      spans: 0,
      trim: false,
      extendMM: -1,
    }).map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "surface.edgePairs[0]",
        "surface.spans",
        "surface.extendMM",
      ]),
    );
  });
});

describe("P6-SU-06 offset surface specification", () => {
  it("requires a face, non-zero distance, tolerance and continuity", () => {
    expect(
      validateOffsetSurfaceSpec({
        faceId: "f1",
        distanceMM: 2,
        flip: false,
        toleranceMM: 0.01,
        extend: true,
        continuity: "natural",
      }),
    ).toEqual([]);
    const paths = validateOffsetSurfaceSpec({
      faceId: "",
      distanceMM: 0,
      flip: true,
      toleranceMM: 0,
      extend: false,
      continuity: "bogus" as never,
    }).map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "surface.faceId",
        "surface.distanceMM",
        "surface.toleranceMM",
        "surface.continuity",
      ]),
    );
  });

  it("wraps a valid spec and labels trim sides", () => {
    const spec = {
      faceId: "f1",
      distanceMM: 1,
      flip: false,
      toleranceMM: 0.01,
      extend: false,
      continuity: "linear" as const,
    };
    expect(ok(createSurfaceSpec(spec, validateOffsetSurfaceSpec))).toEqual(
      spec,
    );
    expect(surfaceTrimLabel("negative")).toBe("Keep negative side");
    expect(surfaceTrimLabel("both")).toBe("Keep both sides");
  });
});

describe("P6-SM-14 sheet-metal dialogs and P6-INT-01 actions", () => {
  it("covers every sheet-metal dialog with help and disabled reasons", () => {
    const types = PHASE6_DIALOGS.map((spec) => spec.featureType);
    for (const type of [
      "sheetMetalRule",
      "baseFlange",
      "edgeFlange",
      "bend",
      "relief",
      "corner",
      "hem",
      "louver",
      "flatPattern",
      "bendTable",
    ])
      expect(types).toContain(type);
    const bend = PHASE6_DIALOGS.find((spec) => spec.featureType === "bend")!;
    expect(phase6DialogDisabledReason(bend, { selectionCount: 0 })).toContain(
      "Bend line",
    );
    expect(phase6DialogDisabledReason(bend, { selectionCount: 1 })).toBeNull();
  });

  it("publishes an action and VR mode for every Phase 6 dialog", () => {
    expect(PHASE6_ACTIONS).toHaveLength(PHASE6_DIALOGS.length);
    for (const spec of PHASE6_DIALOGS) {
      const action = phase6ActionForFeature(spec.featureType);
      expect(action).toMatchObject({
        featureType: spec.featureType,
        label: spec.label,
        vrMode: "dialog",
      });
      expect(action?.actionId).toBe(`phase6.${spec.featureType}`);
    }
  });
});

describe("P6-07 feature-tree sections", () => {
  it("groups rows and counts errors, suppression and rollback", () => {
    let history = emptyPhase6FeatureHistory();
    history = ok(
      addPhase6Feature(history, {
        id: "sm1",
        featureType: "baseFlange",
        label: "Base",
        dependsOn: [],
        error: "thickness too small",
      }),
    );
    history = ok(
      addPhase6Feature(history, {
        id: "sm2",
        featureType: "edgeFlange",
        label: "Edge",
        dependsOn: ["sm1"],
        suppressed: true,
      }),
    );
    history = ok(
      addPhase6Feature(history, {
        id: "fr1",
        featureType: "frame",
        label: "Frame",
        dependsOn: [],
      }),
    );
    const sections = phase6FeatureTreeSections(history);
    expect(sections.map((section) => section.folder)).toEqual([
      "Sheet metal",
      "Frames",
    ]);
    expect(sections[0]).toMatchObject({
      errorCount: 1,
      suppressedCount: 1,
      rolledBackCount: 0,
    });
  });
});
