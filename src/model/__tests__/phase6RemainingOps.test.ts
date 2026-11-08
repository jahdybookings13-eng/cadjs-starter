import { describe, expect, it } from "vitest";
import { STANDARD_FRAME_PROFILES, type ConversionDiagnostics } from "../phase6";
import {
  planExtendSurface,
  planKnitSurface,
  planReplaceFace,
  planSolidToSurface,
  planSurfaceToSolid,
  planThickenSurface,
  planTrimSurface,
  validateExtendSurfaceSpec,
  validateKnitSurfaceSpec,
  validateReplaceFaceSpec,
  validateSolidToSurfaceSpec,
  validateSurfaceToSolidSpec,
  validateThickenSurfaceSpec,
  validateTrimSurfaceSpec,
  type ExtendSurfaceSpec,
  type KnitSurfaceSpec,
  type ReplaceFaceSpec,
  type SolidToSurfaceSpec,
  type SurfaceToSolidSpec,
  type ThickenSurfaceSpec,
  type TrimSurfaceSpec,
} from "../phase6SurfaceOps";
import { computeTrueFlatPattern } from "../phase6FlatPatternCalc";
import { measureFramePipeline } from "../phase6FrameBench";
import { generateStructuralMembers } from "../phase6FeatureSpecs";
import type { FrameLayoutGroup } from "../phase6b";

const knit = (patch: Partial<KnitSurfaceSpec> = {}): KnitSurfaceSpec => ({
  id: "knit-1",
  surfaceBodyIds: ["s1", "s2"],
  toleranceMM: 0.01,
  mergeGaps: true,
  createSolid: false,
  ...patch,
});

const trim = (patch: Partial<TrimSurfaceSpec> = {}): TrimSurfaceSpec => ({
  id: "trim-1",
  targetBodyId: "surface-1",
  trimmerKind: "plane",
  trimmerId: "plane-1",
  keep: "positive",
  mutual: false,
  ...patch,
});

const extend = (patch: Partial<ExtendSurfaceSpec> = {}): ExtendSurfaceSpec => ({
  id: "extend-1",
  bodyId: "surface-1",
  edgeIds: ["e1", "e2"],
  mode: "natural",
  distanceMM: 5,
  continuity: "G1",
  trim: true,
  ...patch,
});

const thicken = (
  patch: Partial<ThickenSurfaceSpec> = {},
): ThickenSurfaceSpec => ({
  id: "thicken-1",
  bodyId: "surface-1",
  thicknessMM: 1,
  direction: "positive",
  merge: true,
  requireClosed: false,
  ...patch,
});

const replaceFace = (
  patch: Partial<ReplaceFaceSpec> = {},
): ReplaceFaceSpec => ({
  id: "replace-1",
  solidBodyId: "solid-1",
  faceId: "f1",
  surfaceId: "surface-1",
  extend: true,
  trim: true,
  continuity: "tangent",
  ...patch,
});

const conversion = (
  patch: Partial<SurfaceToSolidSpec> = {},
): SurfaceToSolidSpec => ({
  id: "to-solid",
  surfaceBodyIds: ["s1", "s2"],
  toleranceMM: 0.01,
  sew: true,
  thickenMM: null,
  ...patch,
});

const solidToSurface = (
  patch: Partial<SolidToSurfaceSpec> = {},
): SolidToSurfaceSpec => ({
  id: "to-surface",
  solidBodyId: "solid-1",
  faceIds: ["f1", "f2"],
  shell: false,
  toleranceMM: 0.01,
  ...patch,
});

const cleanDiagnostics: ConversionDiagnostics = {
  ok: true,
  openEdges: 0,
  nonManifoldEdges: 0,
  gapsMM: [],
  selfIntersections: 0,
  sewingFailed: false,
  offendingEdges: [],
  offendingFaces: [],
  issues: [],
};

describe("P6-SU-07 knit/stitch", () => {
  it("stitches within tolerance and only permits a solid when closed", () => {
    expect(validateKnitSurfaceSpec(knit())).toEqual([]);
    const closed = planKnitSurface(knit({ createSolid: true }), {
      stitchedEdgeCount: 8,
      unstitchedEdges: [],
    });
    expect(closed.ok && closed.value).toMatchObject({
      closed: true,
      solidAllowed: true,
      stitchedEdgeCount: 8,
    });
    const open = planKnitSurface(knit({ createSolid: true }), {
      stitchedEdgeCount: 6,
      unstitchedEdges: ["e7", "e7", "e8"],
    });
    expect(open.ok).toBe(false);
    expect(
      validateKnitSurfaceSpec(knit({ surfaceBodyIds: ["s1"] })).map(
        (i) => i.path,
      ),
    ).toContain("knit.surfaceBodyIds");
  });
});

describe("P6-SU-08 trim surface", () => {
  it("supports plane/body/surface/curve trimmers and rejects a miss", () => {
    expect(validateTrimSurfaceSpec(trim())).toEqual([]);
    expect(
      validateTrimSurfaceSpec(trim({ trimmerKind: "body", mutual: true })),
    ).toEqual([]);
    expect(
      planTrimSurface(trim({ keep: "both" }), { intersectionCount: 2 }).ok,
    ).toBe(true);
    expect(planTrimSurface(trim(), { intersectionCount: 0 }).ok).toBe(false);
    expect(
      validateTrimSurfaceSpec(trim({ trimmerKind: "plane", mutual: true })).map(
        (i) => i.path,
      ),
    ).toContain("trim.mutual");
  });
});

describe("P6-SU-09 extend surface", () => {
  it("handles linear/natural extension and rejects self-intersection", () => {
    expect(validateExtendSurfaceSpec(extend())).toEqual([]);
    expect(validateExtendSurfaceSpec(extend({ mode: "linear" }))).toEqual([]);
    const planned = planExtendSurface(extend(), { selfIntersects: false });
    expect(planned.ok && planned.value.extendedLengthMM).toBe(5);
    expect(planExtendSurface(extend(), { selfIntersects: true }).ok).toBe(
      false,
    );
    expect(
      validateExtendSurfaceSpec(
        extend({ edgeIds: ["e1", "e1"], distanceMM: 0 }),
      ).map((i) => i.path),
    ).toEqual(
      expect.arrayContaining(["extend.edgeIds[1]", "extend.distanceMM"]),
    );
  });
});

describe("P6-SU-10 thicken surface", () => {
  it("supports both directions and rejects self-intersection/radius violations", () => {
    expect(validateThickenSurfaceSpec(thicken())).toEqual([]);
    expect(
      planThickenSurface(thicken({ direction: "both" }), {
        closed: false,
        selfIntersects: false,
        minRadiusMM: 2,
      }).ok,
    ).toBe(true);
    expect(
      planThickenSurface(thicken({ thicknessMM: 5 }), {
        closed: true,
        selfIntersects: false,
        minRadiusMM: 2,
      }).ok,
    ).toBe(false);
    expect(
      planThickenSurface(thicken({ requireClosed: true }), {
        closed: false,
        selfIntersects: false,
        minRadiusMM: 0,
      }).ok,
    ).toBe(false);
  });
});

describe("P6-SU-11 replace face", () => {
  it("requires a clean intersecting replacement and supports continuity options", () => {
    expect(validateReplaceFaceSpec(replaceFace())).toEqual([]);
    expect(
      planReplaceFace(replaceFace({ continuity: "curvature" }), {
        intersects: true,
        clean: true,
      }).ok,
    ).toBe(true);
    expect(
      planReplaceFace(replaceFace(), { intersects: false, clean: true }).ok,
    ).toBe(false);
    expect(
      planReplaceFace(replaceFace(), { intersects: true, clean: false }).ok,
    ).toBe(false);
  });
});

describe("P6-CV-01 surface to solid", () => {
  it("gates on closed diagnostics, positive volume and orientation", () => {
    expect(validateSurfaceToSolidSpec(conversion())).toEqual([]);
    const result = planSurfaceToSolid(conversion(), cleanDiagnostics, {
      volumeMM3: 1250,
      orientationConsistent: true,
    });
    expect(result.ok && result.value).toMatchObject({
      bodyKind: "solid",
      volumeMM3: 1250,
      closed: true,
    });
    expect(
      planSurfaceToSolid(conversion(), cleanDiagnostics, {
        volumeMM3: null,
        orientationConsistent: true,
      }).ok,
    ).toBe(false);
    expect(
      planSurfaceToSolid(conversion(), cleanDiagnostics, {
        volumeMM3: 1250,
        orientationConsistent: false,
      }).ok,
    ).toBe(false);
    expect(
      planSurfaceToSolid(
        conversion(),
        { ...cleanDiagnostics, ok: false, openEdges: 1 },
        { volumeMM3: 1250, orientationConsistent: true },
      ).ok,
    ).toBe(false);
  });
});

describe("P6-CV-02 solid to surface", () => {
  it("extracts selected faces with stable provenance and no duplicates", () => {
    expect(validateSolidToSurfaceSpec(solidToSurface())).toEqual([]);
    const result = planSolidToSurface(solidToSurface(), {
      availableFaceIds: ["f1", "f2", "f3"],
    });
    expect(result.ok && result.value.faceCount).toBe(2);
    expect(result.ok && result.value.provenance[0]).toEqual({
      surfaceBodyId: "surface:solid-1:f1",
      sourceFaceId: "f1",
    });
    expect(
      planSolidToSurface(solidToSurface({ faceIds: ["f1", "f1"] }), {
        availableFaceIds: ["f1"],
      }).ok,
    ).toBe(false);
    expect(
      planSolidToSurface(solidToSurface(), { availableFaceIds: ["f1"] }).ok,
    ).toBe(false);
    expect(
      planSolidToSurface(solidToSurface(), {
        availableFaceIds: ["f1", "f2"],
        duplicateFaceIds: ["f2"],
      }).ok,
    ).toBe(false);
  });
});

describe("P6-SM-09 true flat pattern calculation", () => {
  it("accumulates each bend allowance and bend line instead of using a bounding box", () => {
    const result = computeTrueFlatPattern({
      baseLengthMM: 100,
      baseWidthMM: 50,
      bends: [
        {
          id: "b1",
          angleDeg: 90,
          radiusMM: 1.5,
          thicknessMM: 1.5,
          kFactor: 0.44,
          flangeLengthMM: 20,
          direction: "up",
          reliefMM: 1,
        },
        {
          id: "b2",
          angleDeg: 90,
          radiusMM: 1.5,
          thicknessMM: 1.5,
          kFactor: 0.44,
          flangeLengthMM: 30,
          direction: "down",
          suppressed: true,
        },
        {
          id: "b3",
          angleDeg: 45,
          radiusMM: 1,
          thicknessMM: 1.5,
          kFactor: 0.44,
          flangeLengthMM: 10,
          direction: "up",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bendCount).toBe(2);
    expect(result.value.developedWidthMM).toBe(50);
    expect(result.value.developedLengthMM).toBeGreaterThan(130);
    expect(result.value.bendLines.map((line) => line.id)).toEqual(["b1", "b3"]);
    expect(result.value.bendLines[1]!.offsetMM).toBeGreaterThan(
      result.value.bendLines[0]!.offsetMM,
    );
  });

  it("rejects invalid and duplicate bends", () => {
    const result = computeTrueFlatPattern({
      baseLengthMM: 100,
      baseWidthMM: 50,
      bends: [
        {
          id: "b1",
          angleDeg: 0,
          radiusMM: -1,
          thicknessMM: 0,
          kFactor: 2,
          flangeLengthMM: 0,
          direction: "up",
        },
        {
          id: "b1",
          angleDeg: 90,
          radiusMM: 1,
          thicknessMM: 1,
          kFactor: 0.4,
          flangeLengthMM: 10,
          direction: "up",
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe("P6-FR-10 frame performance budget", () => {
  it("measures generation, joints, cut list and BOM separately", () => {
    const profile = STANDARD_FRAME_PROFILES[0]!;
    const group: FrameLayoutGroup = {
      id: "bench-frame",
      name: "Bench frame",
      orientation: "z",
      segments: Array.from({ length: 24 }, (_, index) => ({
        id: `s${index}`,
        profileId: profile.id,
        startMM: [index * 80, 0, 0] as [number, number, number],
        endMM: [(index + 1) * 80, 0, 0] as [number, number, number],
      })),
    };
    const made = generateStructuralMembers(group);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const result = measureFramePipeline(
      group,
      [profile],
      [
        {
          id: "j1",
          memberAId: made.value[0]!.id,
          memberBId: made.value[1]!.id,
          kind: "miter",
          gapMM: 0,
          trimMM: 0,
          copeDepthMM: 0,
        },
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.memberCount).toBe(24);
    expect(result.value.jointCount).toBe(1);
    expect(result.value.cutListRows).toBeGreaterThan(0);
    expect(result.value.bomRows).toBeGreaterThan(0);
    expect(result.value.timings.total).toBeGreaterThanOrEqual(0);
    console.info(
      `P6-FR-10 timings ms: generation ${result.value.timings.generation.toFixed(3)}, ` +
        `joints ${result.value.timings.joints.toFixed(3)}, ` +
        `cut-list ${result.value.timings.cutList.toFixed(3)}, ` +
        `bom ${result.value.timings.bom.toFixed(3)}, ` +
        `total ${result.value.timings.total.toFixed(3)}`,
    );
    expect(result.value.budgetMet).toBe(true);
  });
});
