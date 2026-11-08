import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applySheetMetalRule,
  bendAllowanceMM,
  bendDeductionMM,
  canonicalPhase6Json,
  classifyPhase6Body,
  createCustomFrameProfile,
  createFrameMaterial,
  createSheetMetalRule,
  diagnoseSurfaceConversion,
  cutListCsv,
  deleteSheetMetalRule,
  duplicateSheetMetalRule,
  emptyPhase6State,
  flatPatternDxf,
  flatPatternDxfFileName,
  formatFrameProfileSize,
  formatKFactor,
  formatPhase6Angle,
  formatPhase6Length,
  frameCutList,
  frameProfileDimensions,
  groupFrameProfilesByShape,
  normalizeDefaultRule,
  parsePhase6Angle,
  parsePhase6Length,
  lookupBend,
  parseBendTableCsv,
  parsePhase6State,
  phase6BodyKindLabel,
  phase6RoundTrip,
  searchFrameProfiles,
  serializePhase6State,
  sheetMetalBomCsv,
  sheetMetalBomRow,
  STANDARD_FRAME_MATERIALS,
  STANDARD_FRAME_PROFILES,
  upsertSheetMetalRule,
  upsertSheetMetalBody,
  validateBendTable,
  validateFlatPatternDrawing,
  validateFrameProfile,
  validateSheetMetalFeatureValues,
  validateSheetMetalRule,
  type BendTable,
  type FlatPatternDrawing,
  type FrameMember,
  type Phase6Result,
} from "../phase6";
import {
  addFrameSegment,
  analyzeCurvature,
  applyWeldGaps,
  assertSolidOperation,
  conversionCompatibility,
  createConversionFeature,
  createFrameLayoutGroup,
  createFrameGroupsFromPaths,
  createPhase6SelectionFilter,
  conversionDownstreamReport,
  defaultSurfaceOptions,
  editConversionFeature,
  frameAssemblyBomRows,
  frameAssemblyPlacements,
  frameMembers,
  PHASE6_DIALOGS,
  filterPhase6Picks,
  parseSurfaceOptions,
  phase6DialogFor,
  phase6SelectionFilterLabel,
  phase6FeatureFamily,
  phase6LifecycleUndoName,
  phase6SelectionAllowed,
  phase6SelectionLabel,
  phase6TreeFolder,
  rebuildConversionFeature,
  reconcileFrameAssembly,
  serializeSurfaceOptions,
  suppressConversionFeature,
  validatePhase6DialogSpec,
  weldGapPreview,
  surfaceBodyStatus,
  validateSurfaceOptions,
  validateWeldGapJoint,
} from "../phase6b";
import type { BodyOutput } from "../executor";
import { exportSelectionStl } from "../../printers/exportSelection";
import { loadProject, saveProject } from "../documentStore";
import { scadgenPhase6 } from "../phase6Store";

function ok<T>(result: Phase6Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

function meshBody(
  positions: number[],
  indices: number[],
  featureId = "F1",
): BodyOutput {
  const faceGeometry = new THREE.BufferGeometry();
  faceGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  faceGeometry.setIndex(indices);
  return {
    featureId,
    kind: "body",
    brep: {} as BodyOutput["brep"],
    position: new THREE.Vector3(),
    edgeTags: [],
    faceTags: [],
    faceGeometry,
  };
}

const closedTetra = () =>
  meshBody(
    [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10],
    [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2],
  );

const openQuad = () =>
  meshBody([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0], [0, 1, 2, 0, 2, 3]);

const rule = () =>
  ok(
    createSheetMetalRule({
      id: "rule-steel-15",
      name: "Steel 1.5",
      material: "steel",
      thicknessMM: 1.5,
      bendRadiusMM: 1.5,
      kFactor: 0.44,
      relief: "rectangular",
      reliefSizeMM: 1,
    }),
  );

const drawing = (): FlatPatternDrawing => ({
  outline: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ],
  holes: [
    [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ],
  ],
  bends: [
    {
      start: { x: 25, y: 5 },
      end: { x: 25, y: 45 },
      angleDeg: 90,
      direction: "down",
      radiusMM: 1.5,
    },
  ],
  units: "mm",
});

const bendTable = (): BendTable =>
  ok(
    parseBendTableCsv(
      [
        "Material,Thickness (mm),Radius (mm),Angle (deg),Allowance (mm),Deduction (mm)",
        "steel,1.5,1.5,90,3.2,2.4",
        "steel,1.5,1.5,45,1.1,0.4",
      ].join("\n"),
      { id: "bt-1", name: "Steel 1.5" },
    ),
  );

const members = (): FrameMember[] => [
  {
    id: "m1",
    profileId: "sq-40-3",
    groupId: "g1",
    startMM: [0, 0, 0],
    endMM: [1000, 0, 0],
  },
  {
    id: "m2",
    profileId: "sq-40-3",
    groupId: "g1",
    startMM: [0, 100, 0],
    endMM: [1000, 100, 0],
  },
  {
    id: "m3",
    profileId: "sq-40-3",
    groupId: "g1",
    startMM: [0, 200, 0],
    endMM: [1000, 200, 0],
    weldGapMM: 2,
  },
];

describe("P6-SM-01 sheet-metal rules", () => {
  it("creates, edits, duplicates and deletes a validated rule", () => {
    const created = rule();
    expect(validateSheetMetalRule(created)).toEqual([]);
    const added = ok(upsertSheetMetalRule([], created));
    expect(added).toHaveLength(1);
    const edited = ok(
      upsertSheetMetalRule(added, { ...created, name: "Renamed" }),
    );
    expect(edited).toHaveLength(1);
    expect(edited[0]!.name).toBe("Renamed");
    const copy = ok(duplicateSheetMetalRule(created));
    expect(copy.id).toBe(`${created.id}-copy`);
    expect(copy.name).toBe("Steel 1.5 copy");
    expect(deleteSheetMetalRule(edited, created.id)).toEqual([]);
  });

  it("rejects an out-of-range K-factor with a feature-level error", () => {
    const bad = createSheetMetalRule({
      id: "bad",
      name: "Bad",
      material: "steel",
      thicknessMM: 1.5,
      bendRadiusMM: 1.5,
      kFactor: 1.2,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(bad.errors.map((e) => e.path)).toContain("rule.kFactor");
  });

  it("stores unit, allowance/deduction overrides and one default rule", () => {
    const configured = ok(
      createSheetMetalRule({
        ...rule(),
        id: "rule-inch",
        units: "in",
        bendAllowanceMM: 3.2,
        bendDeductionMM: 2.4,
        isDefault: true,
      }),
    );
    expect(configured).toMatchObject({
      units: "in",
      bendAllowanceMM: 3.2,
      bendDeductionMM: 2.4,
      isDefault: true,
    });
    const normalized = normalizeDefaultRule([configured, rule()]);
    expect(normalized.filter((entry) => entry.isDefault)).toHaveLength(1);
    expect(normalized[0]!.isDefault).toBe(true);
    expect(createSheetMetalRule({ ...rule(), units: "yd" as never }).ok).toBe(
      false,
    );
  });

  it("derives body metadata and mass from the rule", () => {
    const meta = ok(applySheetMetalRule(rule(), 100, 50, 2, 7850));
    expect(meta).toMatchObject({
      ruleId: "rule-steel-15",
      material: "steel",
      thicknessMM: 1.5,
      bendCount: 2,
      flatWidthMM: 100,
      flatHeightMM: 50,
    });
    expect(meta.massKg).toBeCloseTo(0.058875, 9);
  });
});

describe("P6-SM-10 bend tables", () => {
  it("parses CSV rows and looks up allowance/deduction", () => {
    const table = bendTable();
    expect(validateBendTable(table)).toEqual([]);
    expect(
      ok(
        lookupBend(table, {
          material: "steel",
          thicknessMM: 1.5,
          radiusMM: 1.5,
          angleDeg: 90,
        }),
      ),
    ).toEqual({ allowanceMM: 3.2, deductionMM: 2.4 });
    const miss = lookupBend(table, {
      material: "steel",
      thicknessMM: 1.5,
      radiusMM: 1.5,
      angleDeg: 30,
    });
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.errors[0]!.path).toBe("bendTable.lookup");
  });

  it("rejects malformed tables and matches analytic bend formulas", () => {
    const table = bendTable();
    expect(validateBendTable({ ...table, rows: [] }).length).toBeGreaterThan(0);
    const angle = Math.PI / 2;
    expect(bendAllowanceMM(angle, 1.5, 1.5, 0.44)).toBeCloseTo(3.3929, 4);
    expect(bendDeductionMM(angle, 1.5, 1.5, 0.44)).toBeCloseTo(2.6071, 4);
  });

  it("rejects duplicate rows and prefers per-bend overrides", () => {
    const base = bendTable();
    const withOverride: BendTable = {
      ...base,
      overrides: [{ bendId: "bend-3", allowanceMM: 5, deductionMM: 4 }],
    };
    expect(
      ok(
        lookupBend(
          withOverride,
          {
            material: "steel",
            thicknessMM: 1.5,
            radiusMM: 1.5,
            angleDeg: 90,
          },
          "bend-3",
        ),
      ),
    ).toEqual({ allowanceMM: 5, deductionMM: 4 });
    const duplicate: BendTable = {
      ...base,
      rows: [...base.rows, base.rows[0]!],
    };
    expect(
      validateBendTable(duplicate).some((issue) =>
        issue.message.includes("duplicate"),
      ),
    ).toBe(true);
    expect(
      validateBendTable({
        ...base,
        overrides: [
          { bendId: "b1", allowanceMM: 1 },
          { bendId: "b1", deductionMM: 2 },
        ],
      }).some((issue) => issue.message.includes("duplicate override")),
    ).toBe(true);
  });
});

describe("P6-SM-11 flat-pattern DXF", () => {
  it("writes cut, hole and bend entities with units and notes", () => {
    const result = flatPatternDxf(drawing(), { title: "Enclosure base" });
    const text = ok(result);
    expect(text).toContain("$INSUNITS");
    expect(text).toContain("CUT");
    expect(text).toContain("BEND_DOWN");
    expect(text).toContain("90.0 deg down");
    expect(text).toContain("Enclosure base");
    expect(text.trimEnd().endsWith("EOF")).toBe(true);
    // deterministic: same drawing -> byte-identical export
    expect(ok(flatPatternDxf(drawing(), { title: "Enclosure base" }))).toBe(
      text,
    );
  });

  it("names the file deterministically from body id, units and revision", () => {
    expect(flatPatternDxfFileName("Body 1/x", "in")).toBe(
      "body-1-x-flat-pattern-in.dxf",
    );
    expect(flatPatternDxfFileName("Body 1/x", "mm", "Rev B")).toBe(
      "body-1-x-flat-pattern-mm-rev-b.dxf",
    );
    expect(flatPatternDxfFileName("", "mm")).toBe(
      "sheet-metal-flat-pattern-mm.dxf",
    );
  });

  it("fails a self-intersecting outline instead of emitting a DXF", () => {
    const bowtie: FlatPatternDrawing = {
      outline: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
      units: "mm",
    };
    expect(
      validateFlatPatternDrawing(bowtie).some((issue) =>
        issue.message.includes("self-intersects"),
      ),
    ).toBe(true);
    expect(flatPatternDxf(bowtie).ok).toBe(false);
  });

  it("fails a hole outside the outline", () => {
    const bad = drawing();
    bad.holes = [
      [
        { x: 200, y: 200 },
        { x: 210, y: 200 },
        { x: 210, y: 210 },
      ],
    ];
    expect(
      validateFlatPatternDrawing(bad).some((issue) =>
        issue.message.includes("outside the outline"),
      ),
    ).toBe(true);
  });

  it("rejects open, crossed, zero-length, unrelieved and overlapping flat bodies", () => {
    const open = { ...drawing(), closed: false };
    expect(
      validateFlatPatternDrawing(open).some((issue) =>
        issue.message.includes("outline is open"),
      ),
    ).toBe(true);
    const crossed = drawing();
    crossed.holes = [
      [
        { x: 90, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 20 },
        { x: 90, y: 20 },
      ],
    ];
    expect(
      validateFlatPatternDrawing(crossed).some((issue) =>
        issue.message.includes("crosses the outline"),
      ),
    ).toBe(true);
    const badBends = drawing();
    badBends.bends = [
      {
        start: { x: 10, y: 10 },
        end: { x: 90, y: 10 },
        angleDeg: 90,
        direction: "down",
        flangeLengthMM: 0,
        requiresRelief: true,
      },
      {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 50 },
        angleDeg: 90,
        direction: "up",
      },
    ];
    const issues = validateFlatPatternDrawing(badBends).map(
      (issue) => issue.message,
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        "flange has zero developed length",
        "bend requires relief but none is applied",
      ]),
    );
    expect(issues.some((message) => message.includes("overlap"))).toBe(true);
    expect(flatPatternDxf(badBends).ok).toBe(false);
  });
});

describe("P6-SM-12 sheet-metal metadata and BOM", () => {
  it("writes BOM rows and CSV with metadata after a rule edit", () => {
    const meta = ok(applySheetMetalRule(rule(), 100, 50, 2, 7850));
    const row = ok(
      sheetMetalBomRow(meta, {
        partNumber: "SM-100",
        description: "Enclosure base",
        qty: 2,
      }),
    );
    expect(row).toMatchObject({
      partNumber: "SM-100",
      material: "steel",
      thicknessMM: 1.5,
      flatWidthMM: 100,
      flatHeightMM: 50,
      bendCount: 2,
      qty: 2,
    });
    expect(row.massKg).toBeCloseTo(0.11775, 9);
    const csv = sheetMetalBomCsv([row]);
    expect(csv).toContain("SM-100");
    expect(csv).toContain("Enclosure base");
    expect(csv).toContain("1.500");
  });
});

describe("P6-FR-01/02 frame profile library", () => {
  it("ships every standard shape and searches the data-driven library", () => {
    const shapes = new Set(
      STANDARD_FRAME_PROFILES.map((profile) => profile.shape),
    );
    for (const shape of [
      "squareTube",
      "rectTube",
      "roundTube",
      "angle",
      "channel",
      "iBeam",
    ]) {
      expect(shapes.has(shape as never)).toBe(true);
    }
    expect(
      searchFrameProfiles(STANDARD_FRAME_PROFILES, "round").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      searchFrameProfiles(STANDARD_FRAME_PROFILES, "40").length,
    ).toBeGreaterThan(2);
    expect(searchFrameProfiles(STANDARD_FRAME_PROFILES, "  ")).toHaveLength(
      STANDARD_FRAME_PROFILES.length,
    );
  });

  it("exposes size families in mm and inches and filters the library", () => {
    const square = STANDARD_FRAME_PROFILES.find(
      (profile) => profile.id === "sq-40-3",
    )!;
    expect(frameProfileDimensions(square, "in").width).toBeCloseTo(1.5748, 3);
    expect(formatFrameProfileSize(square, "in")).toContain("1.57");
    expect(
      searchFrameProfiles(STANDARD_FRAME_PROFILES, "1.57", { unit: "in" }).some(
        (profile) => profile.id === "sq-40-3",
      ),
    ).toBe(true);
    expect(
      searchFrameProfiles(STANDARD_FRAME_PROFILES, "", {
        shape: "roundTube",
      }).every((profile) => profile.shape === "roundTube"),
    ).toBe(true);
    const groups = groupFrameProfilesByShape(STANDARD_FRAME_PROFILES);
    expect(groups.roundTube.length).toBeGreaterThanOrEqual(3);
    expect(groups.squareTube.length).toBeGreaterThanOrEqual(3);
  });

  it("creates a closed custom profile and material and validates the wall", () => {
    const material = ok(
      createFrameMaterial({
        id: "m-steel",
        name: "Mild steel",
        densityKgM3: 7850,
      }),
    );
    const custom = ok(
      createCustomFrameProfile({
        id: "custom-30",
        name: "Custom 30 x 30 x 3",
        widthMM: 30,
        heightMM: 30,
        wallMM: 3,
        material,
      }),
    );
    expect(custom).toMatchObject({
      id: "custom-30",
      custom: true,
      materialId: "m-steel",
      densityKgM3: 7850,
    });
    expect(validateFrameProfile(custom)).toEqual([]);
    const tooThick = createCustomFrameProfile({
      id: "bad",
      name: "Bad",
      widthMM: 20,
      heightMM: 20,
      wallMM: 12,
      material,
    });
    expect(tooThick.ok).toBe(false);
    if (!tooThick.ok)
      expect(tooThick.errors.map((issue) => issue.path)).toContain(
        "frameProfile.wallMM",
      );
  });
});

describe("P6-FR-07 cut list and frame adapters", () => {
  it("groups identical members and subtracts weld gaps from cut length", () => {
    const rows = ok(frameCutList(members(), STANDARD_FRAME_PROFILES));
    expect(rows).toHaveLength(2);
    const full = rows.find((row) => row.lengthMM === 1000)!;
    const gapped = rows.find((row) => row.lengthMM === 998)!;
    expect(full.qty).toBe(2);
    expect(gapped.qty).toBe(1);
    expect(gapped.weldGapMM).toBe(2);
    expect(full.massKg).toBeCloseTo(3.4854, 4);
    const csv = cutListCsv(rows);
    expect(csv.split("\n")[0]).toContain("Mark");
    expect(csv).toContain("M1");
    expect(csv).toContain("998.000");
  });

  it("exposes frame members as assembly placements and BOM rows", () => {
    const group = ok(createFrameLayoutGroup("g1", "Frame", "z"));
    const withSegments = ok(
      addFrameSegment(group, {
        id: "m1",
        startMM: [0, 0, 0],
        endMM: [1000, 0, 0],
        profileId: "sq-40-3",
      }),
    );
    expect(frameMembers(withSegments)).toHaveLength(1);
    expect(frameAssemblyPlacements(withSegments)[0]).toMatchObject({
      instanceId: "frame:g1:m1",
      partId: "sq-40-3",
      bodyId: "frame-body:g1:m1",
    });
    const bom = ok(frameAssemblyBomRows(withSegments, STANDARD_FRAME_PROFILES));
    expect(bom[0]).toMatchObject({ bodyKind: "frame", qty: 1 });
  });
});

describe("P6-FR-06 weld gaps", () => {
  it("reconciles assembly placements without duplicating stable instances", () => {
    const group = ok(createFrameLayoutGroup("g1", "Frame", "z"));
    const withSegment = ok(
      addFrameSegment(group, {
        id: "m1",
        startMM: [0, 0, 0],
        endMM: [1000, 0, 0],
        profileId: "sq-40-3",
      }),
    );
    const before = frameAssemblyPlacements(withSegment);
    const changed = {
      ...withSegment,
      segments: [{ ...withSegment.segments[0]!, profileId: "sq-50-3" }],
    };
    const result = reconcileFrameAssembly(before, changed);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]).toMatchObject({
      instanceId: "frame:g1:m1",
      partId: "sq-50-3",
    });
    const removed = reconcileFrameAssembly(result.placements, {
      ...withSegment,
      segments: [],
    });
    expect(removed.removed).toEqual(["frame:g1:m1"]);
  });

  it("validates joints and applies per-member gaps", () => {
    const joint = {
      id: "j1",
      groupId: "g1",
      memberIds: ["m1", "m2"],
      gapMM: 2,
    };
    expect(validateWeldGapJoint(joint)).toEqual([]);
    expect(
      validateWeldGapJoint({ ...joint, memberIds: ["m1"] }).some((issue) =>
        issue.message.includes("at least two"),
      ),
    ).toBe(true);
    const gapped = applyWeldGaps(
      frameMembers(
        ok(
          addFrameSegment(ok(createFrameLayoutGroup("g1", "Frame")), {
            id: "m1",
            startMM: [0, 0, 0],
            endMM: [500, 0, 0],
            profileId: "sq-40-3",
          }),
        ),
      ),
      [joint],
    );
    expect(gapped[0]!.weldGapMM).toBe(2);
  });
});

describe("P6-05/P6-07 selection, lifecycle and tree metadata", () => {
  it("filters invalid picks and labels the active selection kind", () => {
    const filter = createPhase6SelectionFilter(["edge", "bendLine"]);
    expect(ok(phase6SelectionAllowed(filter, "edge"))).toBe("edge");
    const denied = phase6SelectionAllowed(filter, "face");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.errors[0]!.message).toContain("not allowed");
    expect(phase6SelectionLabel("edgeLoop")).toBe("Edge loop");
    expect(phase6SelectionLabel("surfaceBoundary")).toBe("Surface boundary");
  });

  it("groups families, folders and names every lifecycle undo", () => {
    expect(phase6FeatureFamily("edgeFlange")).toBe("sheetMetal");
    expect(phase6FeatureFamily("frame")).toBe("frames");
    expect(phase6FeatureFamily("knitSurface")).toBe("surfaces");
    expect(phase6FeatureFamily("conversion")).toBe("conversion");
    expect(phase6TreeFolder("baseFlange")).toBe("Sheet metal");
    expect(phase6TreeFolder("structuralMember")).toBe("Frames");
    expect(phase6TreeFolder("trimSurface")).toBe("Surfaces");
    for (const op of [
      "edit",
      "delete",
      "suppress",
      "unsuppress",
      "reorder",
      "rollback",
    ] as const) {
      expect(phase6LifecycleUndoName(op, "Edge flange 1")).toContain(
        "Edge flange 1",
      );
    }
  });
});

describe("P6-SU-01/P6-SU-15 surface typing and persistence", () => {
  it("separates open shells and surface bodies from solids", () => {
    const open = surfaceBodyStatus({
      kind: "surface",
      openShell: true,
      boundaryEdges: 4,
    });
    expect(open.solidOpsAllowed).toBe(false);
    expect(open.reason).toContain("open shell");
    expect(
      surfaceBodyStatus({ kind: "surface", openShell: false, boundaryEdges: 0 })
        .solidOpsAllowed,
    ).toBe(false);
    expect(
      surfaceBodyStatus({ kind: "solid", openShell: false, boundaryEdges: 0 })
        .solidOpsAllowed,
    ).toBe(true);
    expect(
      assertSolidOperation({
        kind: "surface",
        openShell: true,
        boundaryEdges: 2,
      }).ok,
    ).toBe(false);
  });

  it("round-trips surface options without changing the body kind", () => {
    const values = [defaultSurfaceOptions("S1")];
    expect(validateSurfaceOptions(values[0]!)).toEqual([]);
    expect(ok(parseSurfaceOptions(serializeSurfaceOptions(values)))).toEqual(
      values,
    );
    const bad = { ...values[0]!, continuity: "G3" as never };
    expect(validateSurfaceOptions(bad).map((issue) => issue.path)).toContain(
      "surface.continuity",
    );
    expect(parseSurfaceOptions("{").ok).toBe(false);
  });
});

describe("P6-SU-12 curvature analysis", () => {
  it("reports principal, Gaussian and mean curvature samples", () => {
    const report = analyzeCurvature(closedTetra());
    expect(report.sampleCount).toBeGreaterThan(0);
    expect(Number.isFinite(report.minPrincipalPerMM)).toBe(true);
    expect(Number.isFinite(report.maxPrincipalPerMM)).toBe(true);
    expect(Number.isFinite(report.maxGaussianPerMM2)).toBe(true);
    expect(analyzeCurvature(meshBody([], [])).sampleCount).toBe(0);
  });
});

describe("P6-CV-03/CV-04 conversion diagnostics", () => {
  it("rejects an open surface with named conversion diagnostics", () => {
    const open = classifyPhase6Body(openQuad(), "surface");
    expect(open.openShell).toBe(true);
    const compatibility = conversionCompatibility({
      bodyKind: open.kind,
      openShell: open.openShell,
      volumeMM3: null,
      exportable: false,
    });
    expect(compatibility.ok).toBe(false);
    expect(compatibility.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["conversion.openShell", "conversion.export"]),
    );
  });

  it("names the offending edges and faces for an open mesh", () => {
    const diagnostics = diagnoseSurfaceConversion(openQuad(), 0.01);
    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.openEdges).toBe(4);
    expect(diagnostics.offendingEdges).toHaveLength(4);
    expect(diagnostics.offendingEdges[0]).toContain("|");
    expect(diagnostics.offendingFaces).toEqual([0, 1]);
    expect(diagnostics.sewingFailed).toBe(true);
    expect(diagnostics.issues.map((issue) => issue.path)).toContain(
      "conversion.openEdges",
    );
  });

  it("accepts a closed solid and validates conversion feature input", () => {
    const closed = classifyPhase6Body(closedTetra());
    expect(closed.openShell).toBe(false);
    expect(
      conversionCompatibility({
        bodyKind: closed.kind,
        openShell: closed.openShell,
        volumeMM3: 1000,
        exportable: true,
      }),
    ).toEqual({ ok: true, issues: [] });
    expect(
      createConversionFeature({ sourceBodyId: "", targetKind: "solid" }).ok,
    ).toBe(false);
    const feature = ok(
      createConversionFeature({
        sourceBodyId: "S1",
        targetKind: "solid",
        toleranceMM: 0.02,
      }),
    );
    expect(feature).toMatchObject({
      id: "conversion-S1",
      targetKind: "solid",
      toleranceMM: 0.02,
    });
  });
});

describe("P6-01 feature dialogs", () => {
  it("has one complete, uniquely typed dialog per Phase 6 feature", () => {
    const types = PHASE6_DIALOGS.map((spec) => spec.featureType);
    expect(new Set(types).size).toBe(types.length);
    for (const spec of PHASE6_DIALOGS) {
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.help.length).toBeGreaterThan(0);
      expect(spec.parameters.length).toBeGreaterThan(0);
    }
    expect(phase6DialogFor("edgeFlange")?.label).toBe("Edge flange");
    expect(phase6DialogFor("does-not-exist")).toBeNull();
  });
});

describe("P6-03/P6-INT-04 Phase 6 persistence", () => {
  it("serializes and round-trips every Phase 6 record canonically", () => {
    const meta = ok(applySheetMetalRule(rule(), 100, 50, 2, 7850));
    const customMaterial = ok(
      createFrameMaterial({ id: "m1", name: "Mild steel", densityKgM3: 7850 }),
    );
    const customProfile = ok(
      createCustomFrameProfile({
        id: "custom-30",
        name: "Custom 30",
        widthMM: 30,
        heightMM: 30,
        wallMM: 3,
        material: customMaterial,
      }),
    );
    const state = upsertSheetMetalBody(
      {
        ...emptyPhase6State(),
        displayUnit: "in",
        rules: [rule()],
        bendTables: [bendTable()],
        frameProfiles: [...STANDARD_FRAME_PROFILES, customProfile],
        frameMaterials: [...STANDARD_FRAME_MATERIALS, customMaterial],
        frameGroups: [{ id: "g1", name: "Frame", memberIds: ["m1"] }],
        flatPatterns: [{ id: "fp1", bodyId: "B1", drawing: drawing() }],
        cutLists: [
          {
            id: "cl1",
            rows: ok(frameCutList(members(), STANDARD_FRAME_PROFILES)),
          },
        ],
        surfaceBodies: [
          {
            bodyId: "S1",
            classification: classifyPhase6Body(openQuad(), "surface"),
          },
        ],
        surfaceOptions: [
          {
            ...defaultSurfaceOptions("S1"),
            continuity: "G2",
            stitchToleranceMM: 0.02,
            trimKeep: "both",
            extendContinuity: "linear",
            curvatureScale: 2,
          },
        ],
        conversions: [
          {
            id: "cv1",
            sourceBodyId: "S1",
            targetBodyId: "B2",
            diagnostics: {
              ok: false,
              openEdges: 4,
              nonManifoldEdges: 0,
              gapsMM: [10],
              selfIntersections: 0,
              sewingFailed: true,
              offendingEdges: ["a|b"],
              offendingFaces: [0],
              issues: [{ path: "conversion.openEdges", message: "open" }],
            },
          },
        ],
      },
      "B1",
      meta,
    );
    const parsed = ok(phase6RoundTrip(state));
    expect(canonicalPhase6Json(parsed)).toBe(canonicalPhase6Json(state));
    expect(serializePhase6State(state)).toBe(serializePhase6State(parsed));
    expect(parsed.rules[0]!.id).toBe("rule-steel-15");
    expect(parsed.frameProfiles.some((profile) => profile.custom)).toBe(true);
    expect(parsed.flatPatterns[0]!.drawing.units).toBe("mm");
    expect(parsed.surfaceOptions[0]).toMatchObject({
      bodyId: "S1",
      continuity: "G2",
      trimKeep: "both",
    });
    expect(
      parsePhase6State(
        JSON.stringify({
          ...state,
          surfaceOptions: [
            { ...defaultSurfaceOptions("S1"), continuity: "G3" },
          ],
        }),
      ).ok,
    ).toBe(false);
  });

  it("migrates a v0 document by restoring standard rules/profiles/materials", () => {
    const migrated = ok(
      parsePhase6State(JSON.stringify({ v: 0, displayUnit: "mm" })),
    );
    expect(migrated.v).toBe(1);
    expect(migrated.rules).toHaveLength(1);
    expect(migrated.frameProfiles).toHaveLength(STANDARD_FRAME_PROFILES.length);
    expect(migrated.frameMaterials).toHaveLength(
      STANDARD_FRAME_MATERIALS.length,
    );
    expect(parsePhase6State("{").ok).toBe(false);
    expect(parsePhase6State(JSON.stringify({ v: 99 })).ok).toBe(false);
  });

  it("reapplies an edited rule to attached sheet-metal bodies", () => {
    scadgenPhase6.reset();
    scadgenPhase6.saveRule(rule());
    scadgenPhase6.setSheetMetalBody(
      "B1",
      ok(applySheetMetalRule(rule(), 100, 50, 2, 7850)),
    );
    scadgenPhase6.saveRule({ ...rule(), thicknessMM: 2, material: "aluminum" });
    const updated = scadgenPhase6.reapplyRule("rule-steel-15");
    const meta = updated.sheetMetalBodies.find(
      (entry) => entry.bodyId === "B1",
    )!;
    expect(meta.meta.thicknessMM).toBe(2);
    expect(meta.meta.material).toBe("aluminum");
    expect(meta.meta.massKg).toBeCloseTo(0.0785, 6);
  });

  it("persists Phase 6 state through saveProject/loadProject", () => {
    scadgenPhase6.reset();
    scadgenPhase6.setDisplayUnit("in");
    scadgenPhase6.saveRule(rule());
    scadgenPhase6.setSheetMetalBody(
      "B1",
      ok(applySheetMetalRule(rule(), 100, 50, 2, 7850)),
    );
    const text = saveProject();
    scadgenPhase6.reset();
    expect(scadgenPhase6.snapshot().rules).toHaveLength(1);
    loadProject(text);
    const restored = scadgenPhase6.snapshot();
    expect(restored.displayUnit).toBe("in");
    expect(restored.rules.map((row) => row.id)).toContain("rule-steel-15");
    expect(restored.sheetMetalBodies[0]).toMatchObject({
      bodyId: "B1",
      meta: { material: "steel", bendCount: 2 },
    });
  });
});

describe("P6-04 body classification", () => {
  it("classifies solids, open surfaces, sheet metal, frames and flat patterns", () => {
    const solid = classifyPhase6Body(closedTetra());
    expect(solid).toMatchObject({
      kind: "solid",
      openShell: false,
      boundaryEdges: 0,
      nonManifoldEdges: 0,
    });
    const surface = classifyPhase6Body(openQuad(), "surface");
    expect(surface.kind).toBe("surface");
    expect(surface.openShell).toBe(true);
    expect(surface.boundaryEdges).toBe(4);
    expect(classifyPhase6Body(closedTetra(), "flange").kind).toBe("sheetMetal");
    expect(classifyPhase6Body(closedTetra(), "unfold").kind).toBe(
      "flatPattern",
    );
    expect(classifyPhase6Body(closedTetra(), "structuralMember").kind).toBe(
      "frame",
    );
    expect(phase6BodyKindLabel("sheetMetal")).toBe("Sheet metal");
    expect(phase6BodyKindLabel("flatPattern")).toBe("Flat pattern");
  });
});

describe("P6-06/P6-INT-06 units, precision and validation", () => {
  it("formats and parses mm/inch, degrees/radians and K-factors", () => {
    expect(formatPhase6Length(25.4, "in", 3)).toBe("1.000 in");
    expect(formatPhase6Length(1.5, "mm", 2)).toBe("1.50 mm");
    expect(ok(parsePhase6Length("2 in"))).toBeCloseTo(50.8, 6);
    expect(ok(parsePhase6Length("12.7"))).toBeCloseTo(12.7, 6);
    expect(parsePhase6Length("nope").ok).toBe(false);
    expect(formatPhase6Angle(Math.PI / 2, "deg")).toBe("90.0 deg");
    expect(ok(parsePhase6Angle("90", "deg"))).toBeCloseTo(Math.PI / 2, 6);
    expect(ok(parsePhase6Angle(String(Math.PI), "rad"))).toBeCloseTo(
      Math.PI,
      6,
    );
    expect(formatKFactor(0.44)).toBe("0.440");
  });

  it("validates feature values in the active units and rejects bad input", () => {
    expect(
      validateSheetMetalFeatureValues(
        {
          thickness: 0.06,
          radius: 0.06,
          angle: 90,
          length: 2,
          kFactor: 0.44,
          reliefSize: 0.05,
          gap: 0.01,
        },
        "in",
        "deg",
      ),
    ).toEqual([]);
    const issues = validateSheetMetalFeatureValues(
      {
        thickness: 0,
        radius: -1,
        angle: 0,
        kFactor: 1.2,
        reliefSize: -1,
        gap: -1,
      },
      "mm",
      "rad",
    ).map((issue) => issue.path);
    expect(issues).toEqual(
      expect.arrayContaining([
        "sheetMetal.thickness",
        "sheetMetal.radius",
        "sheetMetal.angle",
        "sheetMetal.kFactor",
        "sheetMetal.reliefSize",
        "sheetMetal.gap",
      ]),
    );
  });
});

describe("P6-01/P6-04/P6-05/P6-FR-03/P6-FR-06/P6-INT-02/P6-CV-04/CV-05 batch", () => {
  it("persists structural members, knit results and conversion features", () => {
    const conversion = ok(
      createConversionFeature({ sourceBodyId: "S1", targetKind: "solid" }),
    );
    const state = {
      ...emptyPhase6State(),
      structuralMembers: [
        {
          id: "sm1",
          groupId: "g1",
          profileId: "sq-40-3",
          bodyId: "frame-body:g1:sm1",
          startMM: [0, 0, 0] as [number, number, number],
          endMM: [1000, 0, 0] as [number, number, number],
          rotationRad: 0,
          offsetMM: 0,
          endCondition: "miter" as const,
        },
      ],
      knitResults: [
        {
          id: "k1",
          surfaceBodyIds: ["S1", "S2"],
          toleranceMM: 0.01,
          stitchedEdgeCount: 8,
          unstitchedEdges: [],
          solidBodyId: "B2",
        },
      ],
      conversionFeatures: [conversion],
    };
    const parsed = ok(phase6RoundTrip(state));
    expect(parsed.structuralMembers[0]!.endCondition).toBe("miter");
    expect(parsed.knitResults[0]!.unstitchedEdges).toEqual([]);
    expect(parsed.conversionFeatures[0]!.status).toBe("pending");
  });

  it("puts the body kind in the STL export name", async () => {
    const result = await exportSelectionStl(
      [
        {
          nodeId: "e1",
          position: { x: 0, y: 0, z: 0 },
          vertexPositions: [0, 0, 0, 1, 0, 0, 1, 1, 0],
        },
      ],
      ["e1"],
      async () => new Blob([new Uint8Array([1, 2, 3])]),
      "Bracket",
      "sheetMetal",
    );
    expect(result.stlName).toBe("scadgen_bracket_sheetmetal.stl");
    expect(result.bodyKind).toBe("sheetMetal");
  });

  it("filters picks and reports the active selection filter", () => {
    const filter = createPhase6SelectionFilter(["edge", "face"]);
    const picks = filterPhase6Picks(
      [
        { id: "e1", kind: "edge" },
        { id: "b1", kind: "body" },
      ],
      filter,
    );
    expect(picks.accepted.map((pick) => pick.id)).toEqual(["e1"]);
    expect(picks.rejected[0]!.reason).toContain("not allowed");
    expect(phase6SelectionFilterLabel(filter)).toBe("Edge, Face");
  });

  it("builds ordered frame groups from path picks", () => {
    const groups = ok(
      createFrameGroupsFromPaths([
        {
          id: "g1",
          name: "Main",
          orientation: "x",
          segments: [
            {
              id: "m1",
              startMM: [0, 0, 0],
              endMM: [1000, 0, 0],
              profileId: "sq-40-3",
            },
          ],
        },
        {
          id: "g2",
          name: "Cross",
          orientation: "y",
          segments: [
            {
              id: "m2",
              startMM: [0, 0, 0],
              endMM: [0, 800, 0],
              profileId: "sq-40-3",
            },
          ],
        },
      ]),
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.orientation).toBe("x");
    expect(groups.flatMap(frameMembers)).toHaveLength(2);
    expect(
      createFrameGroupsFromPaths([
        { id: "g1", name: "A", segments: [] },
        { id: "g1", name: "B", segments: [] },
      ]).ok,
    ).toBe(false);
  });

  it("previews weld gaps and shortened cut lengths", () => {
    const preview = weldGapPreview(members(), [
      { id: "j1", groupId: "g1", memberIds: ["m1", "m2"], gapMM: 2 },
    ]);
    expect(preview.joints[0]!.gapMM).toBe(2);
    expect(preview.joints[0]!.cutLengthsMM).toEqual({ m1: 998, m2: 998 });
  });

  it("validates every dialog and covers the surface features", () => {
    for (const spec of PHASE6_DIALOGS)
      expect(validatePhase6DialogSpec(spec)).toEqual([]);
    const types = PHASE6_DIALOGS.map((spec) => spec.featureType);
    for (const type of [
      "boundarySurface",
      "surfaceLoft",
      "surfaceFill",
      "surfaceOffset",
      "ruledSurface",
    ])
      expect(types).toContain(type);
    expect(
      validatePhase6DialogSpec({
        ...PHASE6_DIALOGS[0]!,
        parameters: [
          {
            parameterId: "x",
            label: "X",
            kind: "enum",
            default: "a",
            options: ["b"],
          },
        ],
      }).length,
    ).toBeGreaterThan(0);
  });

  it("edits, suppresses and rebuilds a conversion feature", () => {
    const base = ok(
      createConversionFeature({ sourceBodyId: "S1", targetKind: "solid" }),
    );
    const edited = ok(editConversionFeature(base, { toleranceMM: 0.02 }));
    expect(edited).toMatchObject({
      toleranceMM: 0.02,
      status: "pending",
      revision: 1,
    });
    const suppressed = suppressConversionFeature(edited);
    expect(suppressed).toMatchObject({ status: "suppressed", revision: 2 });
    const rebuilt = rebuildConversionFeature(suppressed);
    expect(rebuilt).toMatchObject({ status: "pending", revision: 3 });
  });

  it("gates converted bodies for downstream consumers", () => {
    const good = conversionDownstreamReport({
      bodyId: "B2",
      bodyKind: "solid",
      openShell: false,
      volumeMM3: 1000,
      exportable: true,
      bomBodyKind: "solid",
      drawingViewCount: 1,
      stateRoundTrip: true,
    });
    expect(good.ok).toBe(true);
    const bad = conversionDownstreamReport({
      bodyId: "B2",
      bodyKind: "surface",
      openShell: true,
      volumeMM3: null,
      exportable: false,
      bomBodyKind: "solid",
      drawingViewCount: 0,
      stateRoundTrip: false,
    });
    expect(bad.ok).toBe(false);
    expect(bad.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "conversion.downstream.measure",
        "conversion.downstream.properties",
        "conversion.downstream.export",
        "conversion.downstream.bom",
        "conversion.downstream.drawing",
        "conversion.downstream.roundTrip",
      ]),
    );
  });
});
