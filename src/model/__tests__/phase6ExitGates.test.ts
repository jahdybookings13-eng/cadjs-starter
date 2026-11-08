import { beforeAll, describe, expect, it } from "vitest";
import initOpenCascade from "opencascade.js/dist/node.js";
import type { OpenCascadeInstance } from "opencascade.js";
import {
  applySheetMetalRule,
  createSheetMetalRule,
  cutListCsv,
  flatPatternDxf,
  frameCutList,
  STANDARD_FRAME_PROFILES,
  validateFlatPatternDrawing,
  type FlatPatternDrawing,
  type Phase6Result,
  type SheetMetalRule,
} from "../phase6";
import {
  addFrameSegment,
  applyWeldGaps,
  createConversionFeature,
  createFrameLayoutGroup,
  defaultSurfaceOptions,
  frameAssemblyBomRows,
  frameMembers,
  PHASE6_ACTIONS,
  PHASE6_DIALOGS,
  phase6ActionForFeature,
  phase6DialogFor,
  validatePhase6DialogSpec,
  type FrameLayoutGroup,
  type FrameLayoutSegment,
} from "../phase6b";
import {
  addPhase6Feature,
  editPhase6Feature,
  emptyPhase6FeatureHistory,
  phase6AffectedFeatures,
} from "../phase6Lifecycle";
import { cutListBomRows } from "../../assemblies/phase6Bom";
import {
  baseFlangeFromRule,
  edgeFlangeDevelopedLengthMM,
  frameJointGeometry,
  generateStructuralMembers,
  hemDevelopedLengthMM,
  louverFlatPatternFeature,
  validateBendReliefSpec,
  validateCornerTreatmentSpec,
  validateEdgeFlangeSpec,
  validateFrameJoints,
  validateHemSpec,
  validateLouverSpec,
  type EdgeFlangeSpec,
  type FrameJointSpec,
  type HemSpec,
  type LouverSpec,
} from "../phase6FeatureSpecs";
import {
  computeTrueFlatPattern,
  type FlatPatternBendInput,
} from "../phase6FlatPatternCalc";
import { planKnitSurface } from "../phase6SurfaceOps";
import { importDxfToSketch, type DxfImportResult } from "../dxfImport";
import { loadProject, saveProject } from "../documentStore";
import { scadgenPhase6 } from "../phase6Store";
import {
  handleSew,
  handleThicken,
} from "../../../vendor/cadjs/src/workers/occ-worker-handlers";
import {
  deserializeShapeHelper,
  ocShapeToBRepHelper,
  serializeShapeHelper,
} from "../../../vendor/cadjs/src/services/occ-shape-conversion";
import { iterSubShapes } from "../../../vendor/cadjs/src/services/occ-facade";
import type { BrepJSON } from "../../../vendor/cadjs/src/geometry";

let oc: OpenCascadeInstance;

beforeAll(async () => {
  oc = await initOpenCascade();
}, 60_000);

function ok<T>(result: Phase6Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

function rule(): SheetMetalRule {
  return ok(
    createSheetMetalRule({
      id: "rule-exit-15",
      name: "Exit steel 1.5",
      material: "steel",
      thicknessMM: 1.5,
      bendRadiusMM: 1.5,
      kFactor: 0.44,
      relief: "rectangular",
      reliefSizeMM: 2,
    }),
  );
}

type DxfOk = Extract<DxfImportResult, { ok: true }>;
type DxfLine = { p1Id: string; p2Id: string; layerId: string };

/** Count closed polygon loops on one DXF layer after reopening the export. */
function closedLoops(result: DxfOk, layerName: string): number {
  const layerId = result.layers.find((layer) => layer.name === layerName)?.id;
  if (!layerId) return 0;
  const pointById = new Map(result.points.map((point) => [point.id, point]));
  const key = (id: string): string => {
    const point = pointById.get(id);
    return point ? `${point.x.toFixed(6)},${point.y.toFixed(6)}` : id;
  };
  const adjacency = new Map<string, Set<string>>();
  const lines = result.primitives.filter(
    (primitive) => primitive.type === "line" && primitive.layerId === layerId,
  ) as unknown as DxfLine[];
  for (const line of lines) {
    const a = key(line.p1Id);
    const b = key(line.p2Id);
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }
  const visited = new Set<string>();
  let loops = 0;
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const stack = [start];
    const nodes: string[] = [];
    while (stack.length) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      nodes.push(node);
      for (const peer of adjacency.get(node) ?? []) stack.push(peer);
    }
    if (
      nodes.length >= 3 &&
      nodes.every((node) => (adjacency.get(node)?.size ?? 0) === 2)
    )
      loops++;
  }
  return loops;
}

function enclosure() {
  const sheetRule = rule();
  const baseFlange = ok(
    baseFlangeFromRule(sheetRule, {
      id: "base-flange",
      profileId: "profile-enclosure",
      profileClosed: true,
      direction: "up",
    }),
  );
  const edgeFlanges: EdgeFlangeSpec[] = [
    ["left", 36],
    ["right", 36],
    ["top", 28],
    ["bottom", 28],
  ].map(([side, length], index) => ({
    id: `edge-flange-${side}`,
    edgeIds: [`edge-${side}`],
    angleDeg: 90,
    lengthMM: Number(length),
    position: "outside",
    radiusMM: 1.5,
    flip: false,
    relief: "rectangular",
    reliefMM: 2,
    ruleId: sheetRule.id,
    thicknessMM: sheetRule.thicknessMM,
    kFactor: sheetRule.kFactor,
  }));
  for (const flange of edgeFlanges)
    expect(validateEdgeFlangeSpec(flange)).toEqual([]);

  const hem: HemSpec = {
    id: "hem-front",
    edgeId: "edge-front",
    type: "closed",
    lengthMM: 12,
    radiusMM: 1.5,
    gapMM: 0,
    direction: "down",
    thicknessMM: sheetRule.thicknessMM,
  };
  expect(validateHemSpec(hem)).toEqual([]);
  const hemLength = hemDevelopedLengthMM(hem);

  const bends: FlatPatternBendInput[] = edgeFlanges.map((flange, index) => ({
    id: `bend-${index + 1}`,
    angleDeg: flange.angleDeg,
    radiusMM: flange.radiusMM,
    thicknessMM: flange.thicknessMM,
    kFactor: flange.kFactor,
    flangeLengthMM:
      edgeFlangeDevelopedLengthMM(flange) + (index === 3 ? hemLength : 0),
    direction: index % 2 === 0 ? "up" : "down",
    reliefMM: flange.reliefMM,
  }));
  for (const bend of bends)
    expect(
      validateBendReliefSpec({
        id: `relief-${bend.id}`,
        bendId: bend.id,
        type: "rectangular",
        placement: "auto",
        widthMM: 2,
        depthMM: 2,
        thicknessMM: bend.thicknessMM,
        flangeLengthMM: bend.flangeLengthMM,
      }),
    ).toEqual([]);

  const corner = {
    id: "corner-1",
    cornerId: "corner-front-left",
    type: "closed" as const,
    gapMM: 0,
    overlapMM: 0,
    cornerReliefMM: 1,
    flangeIds: [edgeFlanges[0]!.id, edgeFlanges[2]!.id],
  };
  expect(validateCornerTreatmentSpec(corner)).toEqual([]);

  const louver: LouverSpec = {
    id: "louver-1",
    faceId: "face-front",
    lengthMM: 100,
    widthMM: 10,
    depthMM: 2,
    spacingMM: 10,
    angleDeg: 45,
    count: 3,
  };
  expect(validateLouverSpec(louver)).toEqual([]);
  const louverForm = louverFlatPatternFeature(louver);

  const flat = ok(
    computeTrueFlatPattern({
      baseLengthMM: 300,
      baseWidthMM: 180,
      bends,
    }),
  );
  const height = flat.developedWidthMM;
  const drawing: FlatPatternDrawing = {
    outline: [
      { x: 0, y: 0 },
      { x: flat.developedLengthMM, y: 0 },
      { x: flat.developedLengthMM, y: height },
      { x: 0, y: height },
    ],
    holes: [
      [
        { x: 20, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 30 },
        { x: 20, y: 30 },
      ],
      [
        { x: 60, y: 25 },
        { x: 72, y: 25 },
        { x: 72, y: 37 },
        { x: 60, y: 37 },
      ],
    ],
    bends: flat.bendLines.map((bend) => ({
      start: { x: bend.offsetMM, y: 5 },
      end: { x: bend.offsetMM, y: height - 5 },
      angleDeg: bend.angleDeg,
      direction: bend.direction,
      radiusMM: 1.5,
      id: bend.id,
      flangeLengthMM: bends.find((entry) => entry.id === bend.id)!
        .flangeLengthMM,
      reliefMM: bend.reliefMM,
    })),
    units: "mm",
    closed: true,
  };
  return {
    sheetRule,
    baseFlange,
    edgeFlanges,
    hem,
    bends,
    corner,
    louver,
    louverForm,
    flat,
    drawing,
  };
}

describe("Phase 6 exit gates", () => {
  it("P6-EXIT-01 builds the enclosure flat pattern and reopens its DXF", () => {
    const built = enclosure();
    expect(built.baseFlange.thicknessMM).toBe(built.sheetRule.thicknessMM);
    expect(built.edgeFlanges).toHaveLength(4);
    expect(built.flat.bendCount).toBe(4);
    expect(built.louverForm).toMatchObject({
      kind: "form",
      cut: false,
      count: 3,
    });
    expect(validateFlatPatternDrawing(built.drawing)).toEqual([]);

    const text = ok(
      flatPatternDxf(built.drawing, { title: "P6 exit enclosure" }),
    );
    expect(text).toContain("$INSUNITS");
    expect(text).toContain("BEND_UP");
    expect(text).toContain("BEND_DOWN");
    expect(text).toContain("90.0 deg up");
    expect(text).toContain("90.0 deg down");

    let next = 0;
    const reopened = importDxfToSketch(text, (prefix) => `${prefix}-${next++}`);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.units).toBe("mm");
    expect(reopened.entityCount).toBe(16);
    expect(reopened.layers.map((layer) => layer.name)).toEqual(
      expect.arrayContaining(["CUT", "BEND_UP", "BEND_DOWN"]),
    );
    expect(closedLoops(reopened, "CUT")).toBe(3);
    expect(
      reopened.primitives.filter(
        (primitive) =>
          primitive.type === "line" &&
          (primitive.layerId ===
            reopened.layers.find((layer) => layer.name === "BEND_UP")?.id ||
            primitive.layerId ===
              reopened.layers.find((layer) => layer.name === "BEND_DOWN")?.id),
      ),
    ).toHaveLength(4);
    expect(reopened.skipped).toContain("TEXT");
  });

  it("P6-EXIT-02 produces a gapped multi-group cut list through the BOM adapter", () => {
    const profileA = STANDARD_FRAME_PROFILES.find(
      (profile) => profile.id === "sq-40-3",
    )!;
    const profileB = STANDARD_FRAME_PROFILES.find(
      (profile) => profile.id === "sq-50-3",
    )!;
    expect(profileA).toBeDefined();
    expect(profileB).toBeDefined();

    const group = (
      id: string,
      profileId: string,
      segments: Array<Omit<FrameLayoutSegment, "profileId">>,
    ): FrameLayoutGroup => {
      let current = ok(createFrameLayoutGroup(id, id, "z"));
      for (const segment of segments)
        current = ok(addFrameSegment(current, { ...segment, profileId }));
      return current;
    };
    const groupA = group("frameA", profileA.id, [
      {
        id: "a1",
        startMM: [0, 0, 0],
        endMM: [1000, 0, 0],
        startAngleDeg: 0,
        endAngleDeg: 45,
      },
      {
        id: "a2",
        startMM: [1000, 0, 0],
        endMM: [1000, 600, 0],
        startAngleDeg: 45,
        endAngleDeg: 0,
      },
      {
        id: "a3",
        startMM: [1000, 600, 0],
        endMM: [0, 600, 0],
        startAngleDeg: 0,
        endAngleDeg: 45,
      },
      {
        id: "a4",
        startMM: [0, 600, 0],
        endMM: [0, 0, 0],
        startAngleDeg: 45,
        endAngleDeg: 0,
      },
    ]);
    const groupB = group("frameB", profileB.id, [
      {
        id: "b1",
        startMM: [0, 0, 0],
        endMM: [800, 0, 0],
        startAngleDeg: 0,
        endAngleDeg: 45,
      },
      {
        id: "b2",
        startMM: [800, 0, 0],
        endMM: [800, 400, 0],
        startAngleDeg: 45,
        endAngleDeg: 0,
      },
    ]);
    const generatedA = ok(generateStructuralMembers(groupA, [], [profileA.id]));
    const generatedB = ok(generateStructuralMembers(groupB, [], [profileB.id]));

    const jointA1: FrameJointSpec = {
      id: "miter-a1",
      memberAId: generatedA[0]!.id,
      memberBId: generatedA[1]!.id,
      kind: "miter",
      gapMM: 2,
      trimMM: 0,
      copeDepthMM: 0,
    };
    const jointA2: FrameJointSpec = {
      id: "miter-a2",
      memberAId: generatedA[2]!.id,
      memberBId: generatedA[3]!.id,
      kind: "miter",
      gapMM: 2,
      trimMM: 0,
      copeDepthMM: 0,
    };
    const trimB: FrameJointSpec = {
      id: "trim-b",
      memberAId: generatedB[0]!.id,
      memberBId: generatedB[1]!.id,
      kind: "trim",
      gapMM: 1,
      trimMM: 4,
      copeDepthMM: 0,
    };
    expect(validateFrameJoints(generatedA, [jointA1, jointA2])).toEqual([]);
    expect(validateFrameJoints(generatedB, [trimB])).toEqual([]);
    const miter = ok(frameJointGeometry(generatedA, jointA1));
    expect(miter.miterCutAngleDeg).toBeCloseTo(45, 6);
    expect(miter.cutLengthsMM[generatedA[0]!.id]).toBeCloseTo(999, 6);
    const trim = ok(frameJointGeometry(generatedB, trimB));
    expect(trim.kind).toBe("trim");
    expect(trim.cutLengthsMM[generatedB[0]!.id]).toBeCloseTo(797.5, 6);

    const gapped = [
      ...applyWeldGaps(frameMembers(groupA), [
        { id: "w-a1", groupId: "frameA", memberIds: ["a1", "a2"], gapMM: 2 },
        { id: "w-a2", groupId: "frameA", memberIds: ["a3", "a4"], gapMM: 2 },
      ]),
      ...applyWeldGaps(frameMembers(groupB), [
        { id: "w-b", groupId: "frameB", memberIds: ["b1", "b2"], gapMM: 1 },
      ]),
    ];
    const rows = ok(frameCutList(gapped, [profileA, profileB]));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const common = rows.find(
      (row) =>
        row.profileId === profileA.id && Math.abs(row.lengthMM - 998) < 1e-6,
    );
    expect(common).toMatchObject({
      profileId: profileA.id,
      lengthMM: 998,
      qty: 2,
      weldGapMM: 2,
    });
    expect(rows.some((row) => row.angleStartDeg === 45)).toBe(true);
    for (const row of rows) {
      const profile = STANDARD_FRAME_PROFILES.find(
        (entry) => entry.id === row.profileId,
      )!;
      expect(row.materialId).toBe(profile.materialId);
      expect(row.massKg).toBeCloseTo(
        profile.areaMM2 * row.lengthMM * 1e-9 * profile.densityKgM3,
        9,
      );
    }
    const bom = cutListBomRows(rows, "phase6-exit");
    expect(bom).toHaveLength(rows.length);
    expect(bom.every((row) => row.bodyKind === "frame")).toBe(true);
    expect(bom.map((row) => row.number)).toEqual(rows.map((row) => row.mark));
    expect(cutListCsv(rows).split("\n")[0]).toContain("Mark");
    const assemblyBom = ok(frameAssemblyBomRows(groupA, [profileA]));
    expect(assemblyBom.reduce((sum, row) => sum + row.qty, 0)).toBe(4);
    expect(assemblyBom.every((row) => row.bodyKind === "frame")).toBe(true);
  });

  it("P6-EXIT-03 sews a multi-patch shell, thickens a face and rejects an open shell", () => {
    const width = 40;
    const height = 30;
    const depth = 20;
    const face = (
      points: Array<[number, number, number]>,
    ): { brepJson: BrepJSON; occBrep: string } => {
      const polygon = new oc.BRepBuilderAPI_MakePolygon_1();
      for (const [x, y, z] of points) {
        const point = new oc.gp_Pnt_3(x, y, z);
        polygon.Add_1(point);
        point.delete();
      }
      polygon.Close();
      if (!polygon.IsDone()) throw new Error("exit gate: polygon failed");
      const maker = new oc.BRepBuilderAPI_MakeFace_15(polygon.Wire(), true);
      if (!maker.IsDone()) throw new Error("exit gate: face failed");
      const shape = maker.Face();
      const result = {
        brepJson: ocShapeToBRepHelper(oc, shape, false).brepJson,
        occBrep: serializeShapeHelper(oc, shape),
      };
      maker.delete();
      polygon.delete();
      return result;
    };
    // Explode a real box into six independent face patches. This keeps the
    // per-face orientation from the kernel instead of reconstructing it by
    // hand, then exercises the same multi-patch sew/convert path.
    const box = new oc.BRepPrimAPI_MakeBox_2(width, height, depth);
    const patches = [
      ...iterSubShapes(
        oc,
        box.Shape(),
        oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
      ),
    ].map((shape) => {
      const patchFace = oc.TopoDS.Face_1(shape);
      return {
        brepJson: ocShapeToBRepHelper(oc, patchFace, false).brepJson,
        occBrep: serializeShapeHelper(oc, patchFace),
      };
    });
    expect(patches).toHaveLength(6);
    const sewn = handleSew(oc, {
      sources: patches.map((patch) => ({
        brepJson: patch.brepJson,
        position: { x: 0, y: 0, z: 0 },
        occBrep: patch.occBrep,
      })),
      tolerance: 1e-6,
      makeSolid: true,
      mergeFaces: true,
    });
    expect(sewn.unstitchedEdges).toBe(0);
    expect(sewn.shellCount).toBe(1);
    expect(sewn.brepJson.faces.length).toBeGreaterThanOrEqual(6);
    const volume = (occBrep: string): number => {
      const shape = deserializeShapeHelper(oc, occBrep);
      const props = new oc.GProp_GProps_1();
      oc.BRepGProp.VolumeProperties_2(shape, props, 1e-7, true, false);
      const value = Math.abs(props.Mass());
      props.delete();
      shape.delete();
      return value;
    };
    expect(volume(sewn.occBrep!)).toBeCloseTo(width * height * depth, 1);

    const large = face([
      [0, 0, 0],
      [100, 0, 0],
      [100, 80, 0],
      [0, 80, 0],
    ]);
    const thickened = handleThicken(oc, {
      brepJson: large.brepJson,
      position: { x: 0, y: 0, z: 0 },
      occBrep: large.occBrep,
      faceIndices: [0],
      thickness: 2,
    });
    expect(thickened.brepJson.faces.length).toBeGreaterThan(0);
    expect(volume(thickened.occBrep!)).toBeCloseTo(100 * 80 * 2, 1);

    const open = handleSew(oc, {
      sources: patches.slice(0, 5).map((patch) => ({
        brepJson: patch.brepJson,
        position: { x: 0, y: 0, z: 0 },
        occBrep: patch.occBrep,
      })),
      tolerance: 1e-6,
      makeSolid: false,
      mergeFaces: false,
    });
    expect(open.unstitchedEdges).toBeGreaterThan(0);
    const rejected = planKnitSurface(
      {
        id: "open-knit",
        surfaceBodyIds: ["p1", "p2", "p3", "p4", "p5"],
        toleranceMM: 0.01,
        mergeGaps: false,
        createSolid: true,
      },
      {
        stitchedEdgeCount: Math.max(
          0,
          open.brepJson.edges.length - open.unstitchedEdges,
        ),
        unstitchedEdges: ["open-boundary"],
      },
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.errors[0]?.path).toBe("knit.closed");
  });

  it("P6-EXIT-04 persists edits, rebuilds dependents and audits every Phase 6 control", () => {
    scadgenPhase6.reset();
    const sheetRule = rule();
    const meta = ok(applySheetMetalRule(sheetRule, 300, 180, 2, 7850));
    const profileA = STANDARD_FRAME_PROFILES.find(
      (profile) => profile.id === "sq-40-3",
    )!;
    let group = ok(createFrameLayoutGroup("frameA", "Exit frame", "z"));
    group = ok(
      addFrameSegment(group, {
        id: "m1",
        startMM: [0, 0, 0],
        endMM: [1000, 0, 0],
        profileId: profileA.id,
        startAngleDeg: 0,
        endAngleDeg: 45,
      }),
    );
    const cutRows = ok(frameCutList(frameMembers(group), [profileA]));
    const flatDrawing: FlatPatternDrawing = {
      outline: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 180 },
        { x: 0, y: 180 },
      ],
      units: "mm",
    };
    const conversion = ok(
      createConversionFeature({
        id: "cv1",
        sourceBodyId: "SU1",
        targetKind: "solid",
      }),
    );
    scadgenPhase6.update((state) => ({
      ...state,
      rules: [sheetRule],
      sheetMetalBodies: [{ bodyId: "SM1", meta }],
      frameGroups: [{ id: "frameA", name: "Exit frame", memberIds: ["m1"] }],
      flatPatterns: [{ id: "fp1", bodyId: "SM1", drawing: flatDrawing }],
      cutLists: [{ id: "cl1", rows: cutRows }],
      structuralMembers: [
        {
          id: "m1",
          groupId: "frameA",
          profileId: profileA.id,
          bodyId: "frame-body:frameA:m1",
          startMM: [0, 0, 0],
          endMM: [1000, 0, 0],
          rotationRad: 0,
          offsetMM: 0,
          endCondition: "miter",
        },
      ],
      surfaceBodies: [
        {
          bodyId: "SU1",
          classification: {
            kind: "surface",
            openShell: true,
            boundaryEdges: 4,
            nonManifoldEdges: 0,
          },
        },
      ],
      surfaceOptions: [defaultSurfaceOptions("SU1")],
      conversionFeatures: [conversion],
    }));

    scadgenPhase6.saveRule({ ...sheetRule, thicknessMM: 2 });
    expect(scadgenPhase6.undoLabel()).toBe("Save sheet-metal rule");
    expect(scadgenPhase6.undo()?.state.rules[0]?.thicknessMM).toBe(1.5);
    expect(scadgenPhase6.redo()?.state.rules[0]?.thicknessMM).toBe(2);
    scadgenPhase6.reapplyRule(sheetRule.id);
    expect(scadgenPhase6.snapshot().sheetMetalBodies[0]?.meta.thicknessMM).toBe(
      2,
    );

    scadgenPhase6.commit("Edit frame profile", (state) => ({
      ...state,
      frameProfiles: state.frameProfiles.map((profile) =>
        profile.id === profileA.id
          ? { ...profile, name: "Edited 40x40 exit" }
          : profile,
      ),
    }));
    expect(scadgenPhase6.undoLabel()).toBe("Edit frame profile");
    expect(
      scadgenPhase6
        .undo()
        ?.state.frameProfiles.find((profile) => profile.id === profileA.id)
        ?.name,
    ).toBe(profileA.name);
    expect(
      scadgenPhase6
        .redo()
        ?.state.frameProfiles.find((profile) => profile.id === profileA.id)
        ?.name,
    ).toBe("Edited 40x40 exit");

    scadgenPhase6.commit("Edit surface continuity", (state) => ({
      ...state,
      surfaceOptions: state.surfaceOptions.map((options) =>
        options.bodyId === "SU1" ? { ...options, continuity: "G2" } : options,
      ),
    }));
    expect(scadgenPhase6.undoLabel()).toBe("Edit surface continuity");
    expect(scadgenPhase6.undo()?.state.surfaceOptions[0]?.continuity).toBe(
      "G1",
    );
    expect(scadgenPhase6.redo()?.state.surfaceOptions[0]?.continuity).toBe(
      "G2",
    );

    let history = emptyPhase6FeatureHistory();
    history = ok(
      addPhase6Feature(history, {
        id: "sm1",
        featureType: "baseFlange",
        label: "Base flange",
        dependsOn: [],
      }),
    );
    history = ok(
      addPhase6Feature(history, {
        id: "fr1",
        featureType: "frame",
        label: "Frame",
        dependsOn: ["sm1"],
      }),
    );
    history = ok(
      addPhase6Feature(history, {
        id: "su1",
        featureType: "surfaceLoft",
        label: "Surface loft",
        dependsOn: ["fr1"],
      }),
    );
    history = ok(
      editPhase6Feature(history, "sm1", { label: "Base flange v2" }),
    );
    expect(phase6AffectedFeatures(history, "sm1")).toEqual(["fr1", "su1"]);

    const text = saveProject();
    scadgenPhase6.reset();
    loadProject(text);
    const restored = scadgenPhase6.snapshot();
    expect(
      restored.rules.find((entry) => entry.id === sheetRule.id),
    ).toMatchObject({
      thicknessMM: 2,
    });
    expect(
      restored.frameProfiles.find((profile) => profile.id === profileA.id)
        ?.name,
    ).toBe("Edited 40x40 exit");
    expect(restored.surfaceOptions[0]?.continuity).toBe("G2");
    expect(restored.frameGroups[0]).toMatchObject({ id: "frameA" });
    expect(restored.structuralMembers).toHaveLength(1);
    expect(restored.flatPatterns).toHaveLength(1);
    expect(restored.cutLists).toHaveLength(1);
    expect(restored.conversionFeatures[0]?.status).toBe("pending");

    const actionIds = PHASE6_ACTIONS.map((action) => action.actionId);
    expect(new Set(actionIds).size).toBe(actionIds.length);
    for (const dialog of PHASE6_DIALOGS) {
      expect(validatePhase6DialogSpec(dialog), dialog.featureType).toEqual([]);
      expect(dialog.label.trim(), dialog.featureType).not.toBe("");
      expect(dialog.help.trim(), dialog.featureType).not.toBe("");
      expect(dialog.parameters.length, dialog.featureType).toBeGreaterThan(0);
      expect(dialog.help, dialog.featureType).not.toMatch(
        /placeholder|todo|coming soon/i,
      );
      const action = phase6ActionForFeature(dialog.featureType);
      expect(action, dialog.featureType).not.toBeNull();
      expect(action?.actionId).toBe(`phase6.${dialog.featureType}`);
      expect(action?.menuId).toMatch(/^phase6-/);
      expect(action?.vrMode).toBe("dialog");
      expect(phase6DialogFor(dialog.featureType)).toEqual(dialog);
    }
  });
});
