import { describe, expect, it } from "vitest";
import {
  baseFlangeFromRule,
  bendAllowanceMM,
  bendFlatLengthMM,
  edgeFlangeDevelopedLengthMM,
  frameJointGeometry,
  generateStructuralMembers,
  hemDevelopedLengthMM,
  louverFlatPatternFeature,
  validateBaseFlangeSpec,
  validateBendReliefSpec,
  validateBendSequence,
  validateCornerTreatmentSpec,
  validateEdgeFlangeSpec,
  validateFrameJoints,
  validateHemSpec,
  validateLouverSpec,
  type BendReliefSpec,
  type BendSpec,
  type CornerTreatmentSpec,
  type EdgeFlangeSpec,
  type FrameJointSpec,
  type HemSpec,
  type LouverSpec,
} from "../phase6FeatureSpecs";
import { defaultSheetMetalRule } from "../phase6";
import { phase6DialogFor, type FrameLayoutGroup } from "../phase6b";

const rule = defaultSheetMetalRule();

const edgeFlange = (patch: Partial<EdgeFlangeSpec> = {}): EdgeFlangeSpec => ({
  id: "ef1",
  edgeIds: ["e1", "e2"],
  angleDeg: 90,
  lengthMM: 20,
  position: "outside",
  radiusMM: 1.5,
  flip: false,
  relief: "rectangular",
  reliefMM: 1,
  ruleId: rule.id,
  thicknessMM: rule.thicknessMM,
  kFactor: rule.kFactor,
  ...patch,
});

const bend = (patch: Partial<BendSpec> = {}): BendSpec => ({
  id: "b1",
  lineId: "line-1",
  angleDeg: 90,
  radiusMM: 1.5,
  kFactor: 0.44,
  fixedSide: "positive",
  order: 0,
  thicknessMM: 1.5,
  ...patch,
});

const relief = (patch: Partial<BendReliefSpec> = {}): BendReliefSpec => ({
  id: "r1",
  bendId: "b1",
  type: "rectangular",
  placement: "auto",
  widthMM: 1,
  depthMM: 2,
  thicknessMM: 1.5,
  flangeLengthMM: 20,
  ...patch,
});

const corner = (
  patch: Partial<CornerTreatmentSpec> = {},
): CornerTreatmentSpec => ({
  id: "c1",
  cornerId: "corner-1",
  type: "closed",
  gapMM: 0,
  overlapMM: 0,
  cornerReliefMM: 1,
  flangeIds: ["f1", "f2"],
  ...patch,
});

const hem = (patch: Partial<HemSpec> = {}): HemSpec => ({
  id: "h1",
  edgeId: "e1",
  type: "closed",
  lengthMM: 10,
  radiusMM: 1.5,
  gapMM: 0,
  direction: "down",
  thicknessMM: 1.5,
  ...patch,
});

const louver = (patch: Partial<LouverSpec> = {}): LouverSpec => ({
  id: "l1",
  faceId: "face-1",
  lengthMM: 100,
  widthMM: 10,
  depthMM: 2,
  spacingMM: 10,
  angleDeg: 45,
  count: 3,
  ...patch,
});

describe("P6-SM-02 base flange", () => {
  it("takes thickness and radius from the rule and rejects open profiles", () => {
    const made = baseFlangeFromRule(rule, {
      id: "bf1",
      profileId: "profile-1",
      profileClosed: true,
    });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.value.thicknessMM).toBe(rule.thicknessMM);
    expect(made.value.bendRadiusMM).toBe(rule.bendRadiusMM);
    expect(
      validateBaseFlangeSpec({ ...made.value, profileClosed: false }).map(
        (issue) => issue.path,
      ),
    ).toContain("baseFlange.profileId");
  });
});

describe("P6-SM-03 edge flange", () => {
  it("accepts multiple edges and computes an allowance-backed flat length", () => {
    const spec = edgeFlange();
    expect(validateEdgeFlangeSpec(spec)).toEqual([]);
    expect(edgeFlangeDevelopedLengthMM(spec)).toBeGreaterThan(spec.lengthMM);
    const paths = validateEdgeFlangeSpec(
      edgeFlange({ angleDeg: 180, lengthMM: 0, edgeIds: ["e1", "e1"] }),
    ).map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "edgeFlange.angleDeg",
        "edgeFlange.lengthMM",
        "edgeFlange.edgeIds[1]",
      ]),
    );
  });
});

describe("P6-SM-04 bend", () => {
  it("calculates allowance/deduction and rejects duplicate bend order", () => {
    const allowance = bendAllowanceMM({
      angleDeg: 90,
      radiusMM: 1.5,
      thicknessMM: 1.5,
      kFactor: 0.44,
    });
    expect(allowance).toBeCloseTo((Math.PI / 2) * (1.5 + 0.44 * 1.5), 6);
    expect(bendFlatLengthMM(bend()).developedMM).toBeCloseTo(allowance, 6);
    expect(
      validateBendSequence([bend(), bend({ id: "b2", order: 0 })]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "bend.b2.order" }),
      ]),
    );
  });
});

describe("P6-SM-05 bend relief", () => {
  it("accepts rectangular/round/tear and rejects a flange-consuming relief", () => {
    expect(
      validateBendReliefSpec(relief({ type: "round", placement: "corners" })),
    ).toEqual([]);
    expect(
      validateBendReliefSpec(relief({ type: "tear", placement: "manual" })),
    ).toEqual([]);
    expect(
      validateBendReliefSpec(relief({ widthMM: 15, depthMM: 6 })).map(
        (issue) => issue.path,
      ),
    ).toContain("relief.flangeLengthMM");
  });
});

describe("P6-SM-06 corner treatment", () => {
  it("validates closed/open/overlap corners and three-flange corners", () => {
    expect(validateCornerTreatmentSpec(corner())).toEqual([]);
    expect(
      validateCornerTreatmentSpec(
        corner({ type: "open", gapMM: 1, flangeIds: ["f1", "f2", "f3"] }),
      ),
    ).toEqual([]);
    expect(
      validateCornerTreatmentSpec(
        corner({ type: "overlap", overlapMM: 0.5, gapMM: 0 }),
      ).map((issue) => issue.path),
    ).toContain("corner.collision");
  });
});

describe("P6-SM-07 hem types", () => {
  it("validates closed/open/rolled/teardrop and computes developed length", () => {
    for (const type of ["closed", "open", "rolled", "teardrop"] as const) {
      const spec = hem({
        type,
        gapMM: type === "open" ? 1 : 0,
        radiusMM: type === "closed" ? 1.5 : 2,
      });
      expect(validateHemSpec(spec), type).toEqual([]);
      expect(hemDevelopedLengthMM(spec), type).toBeGreaterThan(spec.lengthMM);
    }
    expect(
      validateHemSpec(hem({ type: "rolled", radiusMM: 0 })).map((i) => i.path),
    ).toContain("hem.radiusMM");
  });
});

describe("frame wall thickness dialog", () => {
  it("exposes an editable wall with a default shell thickness", () => {
    const member = phase6DialogFor("structuralMember")!;
    const frame = phase6DialogFor("frame")!;
    for (const dialog of [member, frame]) {
      const wall = dialog.parameters.find((p) => p.parameterId === "wall");
      expect(wall).toMatchObject({ kind: "quantity", default: 0.003 });
    }
  });
});

describe("P6-SM-08 louver", () => {
  it("validates spacing/run and stays a non-cut form feature", () => {
    const spec = louver();
    expect(validateLouverSpec(spec)).toEqual([]);
    expect(
      validateLouverSpec(louver({ spacingMM: 5 })).map((i) => i.path),
    ).toContain("louver.spacingMM");
    expect(
      validateLouverSpec(louver({ count: 6 })).map((i) => i.path),
    ).toContain("louver.lengthMM");
    expect(louverFlatPatternFeature(spec)).toMatchObject({
      kind: "form",
      cut: false,
      count: 3,
    });
  });
});

const frameGroup: FrameLayoutGroup = {
  id: "frame-1",
  name: "Frame",
  orientation: "z",
  segments: [
    {
      id: "s1",
      profileId: "square-40-3",
      startMM: [0, 0, 0],
      endMM: [1000, 0, 0],
    },
    {
      id: "s2",
      profileId: "square-40-3",
      startMM: [1000, 0, 0],
      endMM: [1000, 0, 1000],
    },
    {
      id: "s3",
      profileId: "square-40-3",
      startMM: [1000, 0, 0],
      endMM: [1000, 500, 0],
    },
    {
      id: "s4",
      profileId: "square-40-3",
      startMM: [5000, 0, 0],
      endMM: [6000, 0, 0],
    },
  ],
};

describe("P6-FR-04 structural members", () => {
  it("generates one selectable body per segment with stable ids and options", () => {
    const made = generateStructuralMembers(
      frameGroup,
      [
        {
          segmentId: "s1",
          rotationRad: Math.PI / 2,
          offsetMM: 25,
          merge: false,
        },
        { segmentId: "s2", orientation: "x", endCondition: "miter" },
      ],
      ["square-40-3"],
    );
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.value).toHaveLength(4);
    expect(made.value[0]).toMatchObject({
      id: "frame-1:s1",
      bodyId: "frame-body:frame-1:s1",
      selectable: true,
      rotationRad: Math.PI / 2,
      offsetMM: 25,
      merge: false,
    });
    expect(made.value[1]).toMatchObject({
      orientation: "x",
      endCondition: "miter",
    });
    expect(made.value[2]!.direction).toEqual([0, 1, 0]);
  });

  it("rejects unknown profiles and zero-length segments", () => {
    expect(generateStructuralMembers(frameGroup, [], ["other"]).ok).toBe(false);
    expect(
      generateStructuralMembers({
        ...frameGroup,
        segments: [{ ...frameGroup.segments[0]!, endMM: [0, 0, 0] }],
      }).ok,
    ).toBe(false);
  });
});

async function generated() {
  const made = generateStructuralMembers(frameGroup);
  if (!made.ok) throw new Error("fixture failed");
  return made.value;
}

describe("P6-FR-05 miter, trim and cope", () => {
  it("computes a 45-degree miter and shared-point cut lengths", async () => {
    const members = await generated();
    const joint: FrameJointSpec = {
      id: "j1",
      memberAId: "frame-1:s1",
      memberBId: "frame-1:s2",
      kind: "miter",
      gapMM: 0,
      trimMM: 0,
      copeDepthMM: 0,
    };
    const result = frameJointGeometry(members, joint);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sharedPointMM).toEqual([1000, 0, 0]);
    expect(result.value.interiorAngleDeg).toBeCloseTo(90, 6);
    expect(result.value.miterCutAngleDeg).toBeCloseTo(45, 6);
    expect(result.value.cutLengthsMM["frame-1:s1"]).toBeCloseTo(1000, 6);
  });

  it("applies trim/extend and reports a three-way corner", async () => {
    const members = await generated();
    const trim = frameJointGeometry(members, {
      id: "j2",
      memberAId: "frame-1:s1",
      memberBId: "frame-1:s2",
      kind: "trim",
      gapMM: 2,
      trimMM: 10,
      copeDepthMM: 0,
    });
    expect(trim.ok && trim.value.cutLengthsMM["frame-1:s1"]).toBeCloseTo(
      994,
      6,
    );
    const cope = frameJointGeometry(members, {
      id: "j3",
      memberAId: "frame-1:s1",
      memberBId: "frame-1:s2",
      kind: "cope",
      gapMM: 0,
      trimMM: 0,
      copeDepthMM: 3,
    });
    expect(cope.ok && cope.value.copeDepthMM).toBe(3);
    const threeWay = frameJointGeometry(members, {
      id: "j4",
      memberAId: "frame-1:s1",
      memberBId: "frame-1:s2",
      kind: "butt",
      gapMM: 0,
      trimMM: 0,
      copeDepthMM: 0,
    });
    expect(threeWay.ok && threeWay.value.threeWay).toBe(true);
  });

  it("rejects missing shared points, self joins and zero cope depth", async () => {
    const members = await generated();
    const noMeet = frameJointGeometry(members, {
      id: "j5",
      memberAId: "frame-1:s1",
      memberBId: "frame-1:s4",
      kind: "miter",
      gapMM: 0,
      trimMM: 0,
      copeDepthMM: 0,
    });
    expect(noMeet.ok).toBe(false);
    const joints: FrameJointSpec[] = [
      {
        id: "self",
        memberAId: "frame-1:s1",
        memberBId: "frame-1:s1",
        kind: "miter",
        gapMM: 0,
        trimMM: 0,
        copeDepthMM: 0,
      },
      {
        id: "cope",
        memberAId: "frame-1:s1",
        memberBId: "frame-1:s2",
        kind: "cope",
        gapMM: 0,
        trimMM: 0,
        copeDepthMM: 0,
      },
    ];
    expect(
      validateFrameJoints(members, joints).map((issue) => issue.path),
    ).toEqual(
      expect.arrayContaining(["frameJoint.members", "frameJoint.copeDepthMM"]),
    );
  });
});
