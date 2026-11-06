// src/model/fasteners.ts
//
// Compose a FastenerSpec into a single ScadgenFeatureNode.
//
//   featureType "fastener"   -> one revolve profile (head+shank merged outline)
//                                + optional `thread` child (applied to the
//                                shank band). The executor (case "fastener")
//                                runs the revolve, unions nothing extra (the
//                                profile is already the composite outline),
//                                then applies the thread child to the shank.
//
//   featureType "screwHole"  -> one revolve bore profile + optional `thread`
//                                child (only when the ISO 273 fit is "tapped").
//
// The model layer here is pure: input FastenerSpec -> output ScadgenFeatureNode
// with stable, addressable sub-feature ids (#head, #shank, #thread, #bore,
// #profile_sk) so the tree, undo/redo, VR select and documentStore round-trip
// treat a whole fastener as ONE unit.

import {
  type ScadgenFeatureNode,
  type ScadgenParameter,
  provenanceForFeature,
  buildSketchNode,
} from "./onshapeHistory";
import {
  type HeadShapeId,
  type TipStyle,
  headProfile,
  tipProfile,
} from "./headShapes";
import {
  type ThreadStandard,
  resolveThread,
  clearanceOf,
} from "./threadStandards";
import type { FastenerSpec } from "./fastenerPresets";

// ---------------------------------------------------------------------------
// Geometry snapshot helpers
// ---------------------------------------------------------------------------

interface P {
  id: string;
  r: number;
  z: number;
}
interface L {
  id: string;
  a: string;
  b: string;
}

function toSkPrims(
  pts: P[],
  lines: L[],
): (
  | {
      id: string;
      type: "point";
      x: number;
      y: number;
      construction?: boolean;
    }
  | {
      id: string;
      type: "line";
      p1Id: string;
      p2Id: string;
      construction?: boolean;
    }
)[] {
  const out: (
    | {
        id: string;
        type: "point";
        x: number;
        y: number;
        construction?: boolean;
      }
    | {
        id: string;
        type: "line";
        p1Id: string;
        p2Id: string;
        construction?: boolean;
      }
  )[] = [];
  for (const p of pts) {
    const prim = { id: p.id, type: "point" as const, x: p.r, y: p.z };
    if (p.id === "ax0" || p.id === "ax1")
      (prim as { construction?: boolean }).construction = true;
    out.push(prim);
  }
  for (const l of lines) {
    const prim = {
      id: l.id,
      type: "line" as const,
      p1Id: l.a,
      p2Id: l.b,
    };
    if (l.id === "axl")
      (prim as { construction?: boolean }).construction = true;
    out.push(prim);
  }
  return out;
}

const XZ = {
  type: "XZ",
  origin: [0, 0, 0],
  normal: [0, -1, 0],
  xAxis: [1, 0, 0],
  yAxis: [0, 0, 1],
};

// Merged outline of head + shank in the (r, z) half-plane. The bolt axis is
// the world Z; sketch Y maps to world Z. z=0 is the mounting face; z<0 is the
// head (behind the face) and z>0 is the shank (into the material).
function fastenerOutline(spec: FastenerSpec): {
  pts: P[];
  lines: L[];
  headA: number;
  shankLen: number;
  bigR: number;
} {
  const head = headProfile(
    {
      standard: spec.standard as ThreadStandard,
      size: spec.size,
      mode: spec.mode,
      shapeId: spec.head as HeadShapeId,
    },
    0,
  );
  const headA = head.resolved.A;
  const headBigR = head.resolved.CD / 2;
  const th = resolveThread(
    spec.standard as ThreadStandard,
    spec.size,
    spec.mode,
    spec.engagement ?? 1,
  );
  const majorR = th.majorD / 2;
  const shankLen = spec.length;
  // Tip profile for the entering portion.
  const tipBaseR = majorR;
  const tip = tipProfile(
    tipBaseR,
    shankLen,
    spec.tip as TipStyle,
    spec.tip === "partialThread"
      ? {
          unthreadedLen: shankLen * 0.4,
          threadDia: spec.size ? th.majorD : tipBaseR * 2,
        }
      : undefined,
  );

  // Build the composite outline as ONE closed loop (head + shank merged).
  //
  // Head loop spans z in [-headA, 0]; shank spans z in [0, shankLen].
  // Merged single-loop traversal (counter-clockwise, r >= 0):
  //   A0 = (0,       -headA)   axis at head back
  //   A1 = (rHead,   -headA)   head outer back
  //   A2 = (rHead,        0)   head outer face
  //   B1 = (rMajor,       0)   shank outer at face (step inward if rMajor < rHead)
  //   B2 = (rMajor,  shankLen) shank outer at tip
  //   [tip cone end]
  //   *  = (0,           tipEnd)  axis at tip
  // close: * --axis--> A0
  const pts: P[] = [];
  const lines: L[] = [];

  if (spec.head === "none") {
    // No head: just the shank profile.
    for (const p of tip.profile as { type: string }[]) {
      if (p.type === "point") {
        const pp = p as unknown as { id: string; r: number; z: number };
        pts.push({ id: pp.id, r: pp.r, z: pp.z });
      }
    }
    (tip.profile as unknown as { type: string }[])
      .filter((p) => (p as { type: string }).type === "line")
      .forEach((lp) => {
        const ll = lp as unknown as {
          id: string;
          p1Id: string;
          p2Id: string;
        };
        lines.push({ id: ll.id, a: ll.p1Id, b: ll.p2Id });
      });
    return { pts, lines, headA: 0, shankLen, bigR: majorR };
  }

  // With a head: build ONE merged closed loop.
  //
  // Extract the head's outer (headOuterR) and the tip's geometry from the
  // profile fns. Head outer R = CD/2 (largest r in the head loop). The
  // head loop is a closed polygon; headBigR != tipBigR in general.
  //
  // Strategy: emit the explicit head loop (translated so face at z=0),
  // then emit the explicit shank/tip loop. Then stitch them:
  //   - find the head-face point at (rHeadOuter, 0)
  //   - find the shank-face point at (rMajor, 0)
  //   - replace the axis-closing segment of each loop with a step
  // between (rHeadOuter, 0) and (rMajor, 0) -- this keeps r >= 0 and
  // yields a single closed polygon.
  const headPtsRaw = head.profile as { type: string }[] as unknown as {
    id: string;
    r: number;
    z: number;
    type: string;
  }[];
  const headLinesRaw = head.profile as { type: string }[] as unknown as {
    id: string;
    type: string;
    p1Id: string;
    p2Id: string;
  }[];

  // Translate the head loop z -> z - headA (so the mounting face maps to z=0).
  const hPts = headPtsRaw
    .filter((p) => p.type === "point")
    .map((p) => ({ id: p.id, r: p.r, z: p.z - headA }));
  const hLines = headLinesRaw
    .filter((l) => l.type === "line")
    .map((l) => ({ id: l.id, a: l.p1Id, b: l.p2Id }));

  // The head face point (outermost r at z=0) and the axis-closing segment.
  // We want to identify:
  //   - the head-face outer vertex: max r among hPts where z == 0
  //   - the axis-side of the loop: the vertex with r == 0 in the head loop
  //   - the segment that closes the head loop back to that axis vertex.
  // To keep this tractable we rebuild the merged loop explicitly below,
  // reading the head's outer radius from headBigR.
  const rHead = headBigR;

  // Head side of merged loop: A0 (axis, -headA) .. A1 (rHead, -headA) ..
  // A2 (rHead, 0).
  pts.push({ id: "mA0", r: 0, z: -headA });
  pts.push({ id: "mA1", r: rHead, z: -headA });
  pts.push({ id: "mA2", r: rHead, z: 0 });

  // Shank/tip loop points.
  const tipPtsRaw = tip.profile as unknown as {
    id: string;
    type: string;
    r: number;
    z: number;
  }[];
  const tipLinesRaw = tip.profile as unknown as {
    id: string;
    type: string;
    p1Id: string;
    p2Id: string;
  }[];
  const tPts = tipPtsRaw.filter((p) => p.type === "point");
  const tLines = tipLinesRaw.filter((l) => l.type === "line");

  // Identify the shank-face vertex (z == 0) and the tip-end vertex (the only
  // z > 0 axis point). For "threaded" and "pointed" tip the tip-end vertex
  // is the only one with r == 0 at z == length. For "flat" the last vertex
  // is at r == 0 too.
  const faceVer = tPts.find((p) => p.z === 0 && p.r > 0);
  const endVer = tPts.find((p) => p.r === 0 && p.z > 0);
  const shankFaceR = faceVer?.r ?? majorR;

  // Shank/tip portion of merged loop: step from A2 (rHead, 0) inward/outward
  // to the shank face vertex (shankFaceR, 0), then down the shank to
  // (shankFaceR, length) if "flat"/"threaded", or cone to (0, tipEnd) for
  // "pointed"/"countersunk". Append shankFace vertex (B1) and tip end (B2).
  pts.push({ id: "mB1", r: shankFaceR, z: 0 });
  // Tip end: the max-z tip point (the one on the axis at the far end).
  let tipEndZ = -1e9;
  let tipEndR = 0;
  for (const p of tPts) {
    if (p.z > tipEndZ) {
      tipEndZ = p.z;
      tipEndR = p.r;
    }
  }
  if (tipEndZ < 0) {
    tipEndZ = shankLen;
    tipEndR = 0;
  }
  pts.push({ id: "mB2", r: tipEndR, z: tipEndZ });

  // Close the loop: A2 -> B1 -> B2 -> A0 (along the axis back to the head top).
  // The axis-side close from B2 (r=0 or r=tipEndR, z=tipEndZ) to A0
  // (r=0, z=-headA) is along the bolt axis.
  // The open "shank" interior between B1 (shankFaceR,0) and B2
  // (tipEndR, tipEndZ) is whatever the tipProfile gave us (a straight
  // shank or a cone). We embed it by also adding the intermediate
  // shank-face point (shankFaceR, 0) == B1, so the loop is:
  //   A0 -> A1 -> A2 -> B1 -> B2 -> A0
  void hLines;
  void tLines;
  lines.push({ id: "l1", a: "mA0", b: "mA1" }); // head back (axis -> outer)
  lines.push({ id: "l2", a: "mA1", b: "mA2" }); // head outer (back -> face)
  lines.push({ id: "l3", a: "mA2", b: "mB1" }); // head face -> shank face (step at z=0)
  lines.push({ id: "l4", a: "mB1", b: "mB2" }); // shank/tip outer
  lines.push({ id: "l5", a: "mB2", b: "mA0" }); // axis close (B2 -> A0)

  return {
    pts,
    lines,
    headA,
    shankLen,
    bigR: Math.max(headBigR, majorR),
  };
}

function screwHoleOutline(spec: FastenerSpec): {
  pts: P[];
  lines: L[];
  boreR: number;
  boreLen: number;
} {
  const fit = clearanceOf(spec.clearance ?? "none");
  const th = resolveThread(
    spec.standard as ThreadStandard,
    spec.size,
    spec.mode,
    1,
  );
  const boreR = (fit?.multiplier ?? 1) * (th.majorD / 2);
  const boreLen = spec.length;
  const pts: P[] = [
    { id: "p1", r: 0, z: 0 },
    { id: "p2", r: boreR, z: 0 },
    { id: "p3", r: boreR, z: boreLen },
    { id: "p4", r: 0, z: boreLen },
  ];
  const lines: L[] = [
    { id: "l1", a: "p1", b: "p2" },
    { id: "l2", a: "p2", b: "p3" },
    { id: "l3", a: "p3", b: "p4" },
    { id: "l4", a: "p4", b: "p1" },
  ];
  return { pts, lines, boreR, boreLen };
}

// ---------------------------------------------------------------------------
// Public: build a fastener / screw-hole node
// ---------------------------------------------------------------------------

export function buildFastenerPresetNode(
  spec: FastenerSpec,
  featureId: string,
): ScadgenFeatureNode {
  const isHole = spec.family === "screwHole";
  const skFid = `${featureId}#profile_sk`;
  let outline;
  if (isHole) {
    const o = screwHoleOutline(spec);
    outline = { pts: o.pts, lines: o.lines };
  } else {
    const o = fastenerOutline(spec);
    outline = { pts: o.pts, lines: o.lines };
  }
  // Build a sketch of the merged head+shank (or bore) profile. The sketch
  // plane is XZ (bolt axis = world Z = sketch Y). We add two extra points
  // (ax0, ax1) at x=0 spanning the profile's z-range and a line `axl` so the
  // executor's revolve case can use it as the rotation axis (the `axis`
  // entityTag in the fastener node's `axis` provenance query).
  const minZ = Math.min(...outline.pts.map((p) => p.z), 0);
  const maxZ = Math.max(...outline.pts.map((p) => p.z), 0);
  outline.pts.push(
    { id: "ax0", r: 0, z: minZ - 0.005 },
    { id: "ax1", r: 0, z: maxZ + 0.005 },
  );
  outline.lines.push({ id: "axl", a: "ax0", b: "ax1" });
  const sketch = buildSketchNode(
    skFid,
    "fastener profile",
    [...outline.lines.map((l) => l.id), "axl"],
    null,
    {
      id: skFid,
      plane: XZ,
      primitives: toSkPrims(outline.pts, outline.lines),
      constraints: [],
    },
  );

  // axis: bolt axis = the dedicated `axl` line in the sketch profile.
  const chain: ScadgenParameter[] = [
    {
      kind: "queryList",
      parameterId: "entities",
      queries: [provenanceForFeature(skFid, "SKETCH_ENTITY", "l1")],
    },
    {
      kind: "queryList",
      parameterId: "axis",
      queries: [provenanceForFeature(skFid, "SKETCH_ENTITY", "axl")],
    },
    { kind: "string", parameterId: "id", value: spec.id },
    { kind: "enum", parameterId: "family", value: spec.family },
    { kind: "enum", parameterId: "standard", value: spec.standard },
    { kind: "string", parameterId: "size", value: spec.size },
    { kind: "enum", parameterId: "mode", value: spec.mode },
    { kind: "enum", parameterId: "head", value: spec.head },
    { kind: "enum", parameterId: "tip", value: spec.tip },
    {
      kind: "quantity",
      parameterId: "length",
      value: spec.length,
      units: "m",
      expression: `${(spec.length * 1000).toFixed(1)} mm`,
    },
    {
      kind: "matrix",
      parameterId: "axis",
      elements: [0, 0, 1],
    },
  ];

  const subFeatures: ScadgenFeatureNode[] = [sketch];
  const needThread = isHole
    ? (clearanceOf(spec.clearance ?? "none")?.tapped ?? false)
    : spec.tip === "threaded" || spec.tip === "partialThread";

  if (needThread) {
    const thFid = `${featureId}#thread`;
    const kind =
      spec.family === "tNut" ||
      spec.family === "wingNut" ||
      spec.family === "eyeBolt"
        ? "internal"
        : "external";
    const th = resolveThread(
      spec.standard as ThreadStandard,
      spec.size,
      spec.mode,
      spec.engagement ?? 1,
    );
    subFeatures.push({
      featureId: thFid,
      featureType: "thread",
      name: `thread (${spec.standard}-${spec.size})`,
      namespace: "",
      parameters: [
        { kind: "string", parameterId: "standard", value: spec.standard },
        { kind: "string", parameterId: "size", value: spec.size },
        { kind: "string", parameterId: "mode", value: spec.mode },
        { kind: "string", parameterId: "kind", value: kind },
        {
          kind: "quantity",
          parameterId: "engagement",
          value: spec.engagement ?? 1,
          units: "",
          expression: String(spec.engagement ?? 1),
        },
      ],
      subFeatures: [],
      suppressed: false,
      extensions: {
        threadStandard: spec.standard,
        threadSize: spec.size,
        threadMode: spec.mode,
        threadKind: kind,
        pitch: th.pitch,
        majorD: th.majorD,
        depth: th.depth,
      },
    });
  }

  chain.push({
    kind: "string",
    parameterId: "label",
    value: spec.label,
  });

  return {
    featureId,
    featureType: isHole ? "screwHole" : "fastener",
    name: spec.label,
    namespace: "",
    parameters: chain,
    subFeatures,
    suppressed: false,
    extensions: {
      family: spec.family,
      standard: spec.standard,
      size: spec.size,
      mode: spec.mode,
      head: spec.head,
      tip: spec.tip,
      clearance: spec.clearance,
      length: spec.length,
      engagement: spec.engagement,
      profilePoints: outline.pts,
      profileLines: outline.lines,
    },
  };
}

export function buildScrewHolePresetNode(
  spec: FastenerSpec,
  featureId: string,
): ScadgenFeatureNode {
  if (spec.family !== "screwHole")
    throw new Error(
      "buildScrewHolePresetNode: spec.family must be 'screwHole'",
    );
  return buildFastenerPresetNode(spec, featureId);
}

// Convenience for UI: wrap a spec's node at origin placement.
export function fastenerPlacement(
  position: [number, number, number] = [0, 0, 0],
): {
  kind: "string";
  parameterId: "placement";
  value: string;
} {
  return {
    kind: "string",
    parameterId: "placement",
    value: position.join(","),
  };
}

// Re-exports for tests / upstream.
export { XZ };
