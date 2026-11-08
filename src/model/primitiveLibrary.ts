// 3D primitive shape library.
//
// Each shape = [newSketch, op] where the sketch's plane is positioned/oriented
// for the shape, the profile is a single closed region, and the op is one of
// the four proven kernel ops: extrude, revolve, sweep, loft.
//
// All catalog builders share one node-assembly contract (buildShapeNodeChain):
// one sketch node + one op node, in evaluation order. The sketch carries
// the real closed profile (so the executor's newSketch case produces a body)
// plus the l0 axis line the op needs for revolve/sweep world placement. For
// extrude and loft, l0 doubles as the profile's first edge.

import {
  buildExtrudeNode,
  buildLoftNode,
  buildRevolveNode,
  buildSweepNode,
  buildSketchNode,
  provenanceForFeature,
  type ScadgenFeatureNode,
} from "./onshapeHistory";
import { buildScaleNode } from "./primitives";

export interface PlacementFrame {
  origin: [number, number, number];
  xAxis: [number, number, number];
  normal: [number, number, number];
}

const DEFAULT_FRAME: PlacementFrame = {
  origin: [0, 0, 0],
  xAxis: [1, 0, 0],
  normal: [0, 0, 1],
};

/** XZ is the sketch plane used by the revolved primitives. */
const REVOLVE_FRAME: PlacementFrame = {
  origin: [0, 0, 0],
  xAxis: [1, 0, 0],
  normal: [0, 1, 0],
};

const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Derive Y so that (xAxis, y, normal) is right-handed. */
function yFromFrame(
  xRaw: [number, number, number],
  nRaw: [number, number, number],
): {
  x: [number, number, number];
  y: [number, number, number];
  n: [number, number, number];
} {
  const n = norm(nRaw);
  const x = norm(xRaw);
  const dot = x[0] * n[0] + x[1] * n[1] + x[2] * n[2];
  const xOrtho = norm([
    x[0] - dot * n[0],
    x[1] - dot * n[1],
    x[2] - dot * n[2],
  ]);
  const y = cross(n, xOrtho);
  return { x: xOrtho, y, n };
}

function frameToPlane(frame: PlacementFrame) {
  const { x, y, n } = yFromFrame(frame.xAxis, frame.normal);
  return {
    type: "CUSTOM",
    origin: [frame.origin[0], frame.origin[1], frame.origin[2]],
    xAxis: x,
    yAxis: y,
    normal: n,
  };
}

const P = (id: string, x: number, y: number) => ({
  id,
  type: "point",
  x,
  y,
});
const L = (id: string, a: string, b: string) => ({
  id,
  type: "line",
  p1Id: a,
  p2Id: b,
});
const C = (id: string, centerId: string, radius: number) => ({
  id,
  type: "circle",
  centerId,
  radius,
});
const A = (
  id: string,
  centerId: string,
  startId: string,
  endId: string,
  radius: number,
) => ({ id, type: "arc", centerId, startId, endId, radius });
const EA = (
  id: string,
  centerId: string,
  majorRadius: number,
  minorRadius: number,
  rotation: number,
) => ({
  id,
  type: "ellipticalArc",
  centerId,
  majorRadius,
  minorRadius,
  rotation,
  startAngle: Math.PI,
  endAngle: Math.PI * 2,
});
const q = (meters: number) => ({
  value: meters,
  units: "m",
  expression: `${(meters * 1000).toFixed(3)} mm`,
});
const rad = (radians: number) => ({
  value: radians,
  units: "rad",
  expression: `${(radians * 180) / Math.PI} deg`,
});

type Prim =
  | ReturnType<typeof P>
  | ReturnType<typeof L>
  | ReturnType<typeof C>
  | ReturnType<typeof A>
  | ReturnType<typeof EA>;

export type ShapeKind =
  | "box"
  | "prism"
  | "pyramid"
  | "wedge"
  | "cylinder"
  | "cone"
  | "sphere"
  | "torus"
  | "pipe"
  | "ellipsoid"
  | "capsule"
  | "dome";

export interface ShapeResult {
  /**
   * All feature nodes in evaluation order (sketch(es), then op). Append to
   * scadgenHistory in this order. For most shapes = [sketch, op]; pyramid
   * emits two sketches before the loft, and ellipsoid emits a scale after the
   * revolve.
   */
  nodes: ScadgenFeatureNode[];
  /** Convenience aliases for the common single-sketch case. */
  sketch: ScadgenFeatureNode;
  op: ScadgenFeatureNode;
  bodyFeatureId: string;
  profileFeatureId: string;
}

function profileTags(prims: Prim[]): string[] {
  return prims
    .filter((p) => p.type !== "point")
    .map((p) => (p as { id: string }).id);
}

function makeSketch(
  skId: string,
  shapeId: string,
  frame: PlacementFrame,
  prims: Prim[],
): ScadgenFeatureNode {
  const plane = frameToPlane(frame);
  return buildSketchNode(skId, `${shapeId} profile`, profileTags(prims), null, {
    id: skId,
    plane,
    primitives: prims,
    constraints: [],
  });
}

// ── box: rect profile extruded along the normal ──────────────────────────
export function buildBox(
  shapeId: string,
  opts: {
    w: number;
    h: number;
    d: number;
    frame?: PlacementFrame;
    midplane?: boolean;
  },
): ShapeResult {
  const { w, h, d } = opts;
  const frame = opts.frame ?? DEFAULT_FRAME;
  const skId = `${shapeId}_sk`;
  const hX = w / 2;
  const hY = h / 2;
  const prims: Prim[] = [
    P("p1", -hX, -hY),
    P("p2", hX, -hY),
    P("p3", hX, hY),
    P("p4", -hX, hY),
    L("l1", "p1", "p2"),
    L("l2", "p2", "p3"),
    L("l3", "p3", "p4"),
    L("l4", "p4", "p1"),
  ];
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const op = buildExtrudeNode(
    shapeId,
    `${shapeId} (box)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l1")],
    q(d),
    opts.midplane
      ? [{ kind: "boolean", parameterId: "midplane", value: true }]
      : [],
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── wedge: triangular profile extruded; apex edge at one top corner ──────
export function buildWedge(
  shapeId: string,
  opts: {
    x: number;
    y: number;
    z: number;
    x1?: number;
    x2?: number;
    frame?: PlacementFrame;
  },
): ShapeResult {
  const { x, y, z } = opts;
  const x1 = opts.x1 ?? x / 2;
  const x2 = opts.x2 ?? x / 2;
  const frame = opts.frame ?? DEFAULT_FRAME;
  const skId = `${shapeId}_sk`;
  const hX = x / 2;
  const hZ = z / 2;
  const prims: Prim[] = [
    P("p1", -hX, -hZ),
    P("p2", hX - x1, -hZ),
    P("p3", hX, -hZ),
    P("p4", hX, hZ - x2),
    P("p5", hX, hZ),
    P("p6", -hX, hZ),
    L("l1", "p1", "p2"),
    L("l2", "p2", "p3"),
    L("l3", "p3", "p5"),
    L("l4", "p5", "p4"),
    L("l5", "p4", "p6"),
    L("l6", "p6", "p1"),
  ];
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const op = buildExtrudeNode(
    shapeId,
    `${shapeId} (wedge)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l1")],
    q(y),
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── cylinder: rectangle in XZ revolved 360° about its left edge (Z axis) ─
export function buildCylinder(
  shapeId: string,
  opts: { r: number; h: number; frame?: PlacementFrame },
): ShapeResult {
  const { r, h } = opts;
  const frame = opts.frame ?? {
    origin: [0, 0, 0],
    xAxis: [1, 0, 0],
    normal: [0, 1, 0],
  };
  const skId = `${shapeId}_sk`;
  const prims: Prim[] = [
    P("p1", 0, 0),
    P("p2", r, 0),
    P("p3", r, h),
    P("p4", 0, h),
    L("l1", "p1", "p2"),
    L("l2", "p2", "p3"),
    L("l3", "p3", "p4"),
    L("l4", "p4", "p1"),
  ];
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const op = buildRevolveNode(
    shapeId,
    `${shapeId} (cylinder)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l1")],
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l4")],
    rad(Math.PI * 2),
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── cone: triangle in XZ revolved 360° about its vertical edge ──────────
export function buildCone(
  shapeId: string,
  opts: { r: number; h: number; frame?: PlacementFrame },
): ShapeResult {
  const { r, h } = opts;
  const frame = opts.frame ?? {
    origin: [0, 0, 0],
    xAxis: [1, 0, 0],
    normal: [0, 1, 0],
  };
  const skId = `${shapeId}_sk`;
  const prims: Prim[] = [
    P("p1", 0, 0),
    P("p2", r, 0),
    P("p3", 0, h),
    L("l1", "p1", "p2"),
    L("l2", "p2", "p3"),
    L("l3", "p3", "p1"),
  ];
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const op = buildRevolveNode(
    shapeId,
    `${shapeId} (cone)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l1")],
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l3")],
    rad(Math.PI * 2),
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── sphere: semicircle in XZ revolved 360° about its diameter ───────────
export function buildSphere(
  shapeId: string,
  opts: { r: number; frame?: PlacementFrame },
): ShapeResult {
  const { r } = opts;
  if (r <= 0) throw new Error("sphere: radius must be > 0");
  const frame = opts.frame ?? REVOLVE_FRAME;
  const skId = `${shapeId}_sk`;
  const prims: Prim[] = [
    P("pc", 0, 0),
    P("ps", 0, -r),
    P("pe", 0, r),
    A("a1", "pc", "ps", "pe", r),
    L("l1", "pe", "ps"),
  ];
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const op = buildRevolveNode(
    shapeId,
    `${shapeId} (sphere)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "a1")],
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l1")],
    rad(Math.PI * 2),
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── torus: two semicircles at (R,0) in XZ revolved 360° about the Z axis ─
export function buildTorus(
  shapeId: string,
  opts: { ringR: number; tubeR: number; frame?: PlacementFrame },
): ShapeResult {
  const { ringR, tubeR } = opts;
  const frame = opts.frame ?? {
    origin: [0, 0, 0],
    xAxis: [1, 0, 0],
    normal: [0, 1, 0],
  };
  const skId = `${shapeId}_sk`;
  // Two semicircles rather than one periodic circle: OCC's full-turn revolve
  // serializes fine but meshes the periodic seam to an empty BREP.
  const prims: Prim[] = [
    P("pc", ringR, 0),
    P("p1", ringR + tubeR, 0),
    P("p2", ringR - tubeR, 0),
    A("a1", "pc", "p1", "p2", tubeR),
    A("a2", "pc", "p2", "p1", tubeR),
    P("pa", 0, 0),
    P("pb", 0, Math.max(ringR, 1e-3)),
    L("l1", "pa", "pb"),
  ];
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const op = buildRevolveNode(
    shapeId,
    `${shapeId} (torus)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "a1")],
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l1")],
    rad(Math.PI * 2),
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── ellipsoid: half of a tri-axial ellipse revolved, then Y-scaled ───────
export function buildEllipsoid(
  shapeId: string,
  opts: {
    rx: number;
    ry: number;
    rz: number;
    frame?: PlacementFrame;
  },
): ShapeResult {
  const { rx, ry, rz } = opts;
  if (rx <= 0 || ry <= 0 || rz <= 0)
    throw new Error("ellipsoid: rx, ry, and rz must be > 0");
  const frame = opts.frame ?? REVOLVE_FRAME;
  const skId = `${shapeId}_sk`;
  const revId = `${shapeId}_rev`;
  const prims: Prim[] = [
    P("pc", 0, 0),
    P("pb", 0, -rz),
    P("pt", 0, rz),
    EA("a1", "pc", rz, rx, Math.PI / 2),
    L("l1", "pt", "pb"),
  ];
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const revolve = buildRevolveNode(
    revId,
    `${shapeId} (ellipsoid)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "a1")],
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l1")],
    rad(Math.PI * 2),
  );
  const op = buildScaleNode(
    shapeId,
    `${shapeId} (ellipsoid radii)`,
    revId,
    1,
    [0, 0, 0],
    [1, ry / rx, 1],
  );
  return {
    nodes: [sketch, revolve, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── capsule: stadium profile revolved 360° about its long axis ──────────
export function buildCapsule(
  shapeId: string,
  opts: { r: number; length: number; frame?: PlacementFrame },
): ShapeResult {
  const { r, length } = opts;
  if (r <= 0) throw new Error("capsule: radius must be > 0");
  if (length < r * 2)
    throw new Error("capsule: length must be at least twice the radius");
  const frame = opts.frame ?? REVOLVE_FRAME;
  const skId = `${shapeId}_sk`;
  const h = (length - r * 2) / 2;
  const prims: Prim[] = [
    P("pb", 0, -h - r),
    P("pt", 0, h + r),
    P("cb", 0, -h),
    P("ct", 0, h),
  ];
  if (h <= 1e-9) {
    prims.push(P("ps", r, 0));
    prims.push(A("a1", "cb", "pb", "ps", r));
    prims.push(A("a2", "ct", "ps", "pt", r));
  } else {
    prims.push(P("psb", r, -h));
    prims.push(P("pst", r, h));
    prims.push(A("a1", "cb", "pb", "psb", r));
    prims.push(L("l1", "psb", "pst"));
    prims.push(A("a2", "ct", "pst", "pt", r));
  }
  prims.push(L("l2", "pt", "pb"));
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const op = buildRevolveNode(
    shapeId,
    `${shapeId} (capsule)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "a1")],
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l2")],
    rad(Math.PI * 2),
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── dome: quarter ellipse revolved around the Z axis ────────────────────
export function buildDome(
  shapeId: string,
  opts: { r: number; h: number; frame?: PlacementFrame },
): ShapeResult {
  const { r, h } = opts;
  if (r <= 0 || h <= 0) throw new Error("dome: radius and height must be > 0");
  const frame = opts.frame ?? REVOLVE_FRAME;
  const skId = `${shapeId}_sk`;
  const prims: Prim[] = [
    P("pc", 0, 0),
    P("pb", r, 0),
    P("pt", 0, h),
    {
      ...EA("a1", "pc", h, r, Math.PI / 2),
      startAngle: (Math.PI * 3) / 2,
      endAngle: Math.PI * 2,
    },
    L("l1", "pc", "pt"),
    L("l2", "pc", "pb"),
  ];
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const op = buildRevolveNode(
    shapeId,
    `${shapeId} (dome)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "a1")],
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l1")],
    rad(Math.PI * 2),
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── pipe: circle swept along a chained polyline path ────────────────────
export function buildPipe(
  shapeId: string,
  opts: {
    r: number;
    points: [number, number, number][];
    frame?: PlacementFrame;
  },
): ShapeResult {
  const { r, points } = opts;
  if (points.length < 2)
    throw new Error(`pipe: needs >=2 path points, got ${points.length}`);
  const frame = opts.frame ?? DEFAULT_FRAME;
  const skId = `${shapeId}_sk`;
  const prims: Prim[] = [P("pc", 0, 0), C("c1", "pc", r)];
  points.forEach((p, i) =>
    prims.push(P(`a${i}`, p[0] - frame.origin[0], p[1] - frame.origin[1])),
  );
  for (let i = 0; i < points.length - 1; i++) {
    prims.push(L(`b${i}`, `a${i}`, `a${i + 1}`));
  }
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const pathQuery = provenanceForFeature(skId, "SKETCH_ENTITY", "b0");
  const op = buildSweepNode(
    shapeId,
    `${shapeId} (pipe)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "c1")],
    [pathQuery],
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── dispatch ────────────────────────────────────────────────────────────
export function buildShape(
  shapeId: string,
  kind: ShapeKind,
  opts?: Record<string, unknown>,
): ShapeResult {
  // Callers include the toolbar, action bus and debug hook. Missing fields must
  // fall back to the published catalog defaults, never become NaN geometry.
  const options = { ...defaultPrimitiveOptions(kind), ...(opts ?? {}) };
  switch (kind) {
    case "box": {
      const o = options as {
        w: number;
        h: number;
        d: number;
        frame?: PlacementFrame;
        midplane?: boolean;
      };
      return buildBox(shapeId, o);
    }
    case "prism": {
      const o = options as {
        points: [number, number][];
        d: number;
        frame?: PlacementFrame;
        midplane?: boolean;
      };
      return buildPrism(shapeId, o);
    }
    case "pyramid": {
      const o = options as {
        w: number;
        h: number;
        frame?: PlacementFrame;
        cShrink?: number;
      };
      return buildPyramid(shapeId, o);
    }
    case "wedge": {
      const o = options as {
        x: number;
        y: number;
        z: number;
        x1?: number;
        x2?: number;
        frame?: PlacementFrame;
      };
      return buildWedge(shapeId, o);
    }
    case "cylinder": {
      const o = options as {
        r: number;
        h: number;
        frame?: PlacementFrame;
      };
      return buildCylinder(shapeId, o);
    }
    case "cone": {
      const o = options as {
        r: number;
        h: number;
        frame?: PlacementFrame;
      };
      return buildCone(shapeId, o);
    }
    case "sphere": {
      const o = options as { r: number; frame?: PlacementFrame };
      return buildSphere(shapeId, o);
    }
    case "torus": {
      const o = options as {
        ringR: number;
        tubeR: number;
        frame?: PlacementFrame;
      };
      return buildTorus(shapeId, o);
    }
    case "pipe": {
      const o = options as {
        r: number;
        points: [number, number, number][];
        frame?: PlacementFrame;
      };
      return buildPipe(shapeId, o);
    }
    case "ellipsoid": {
      const o = options as {
        rx: number;
        ry: number;
        rz: number;
        frame?: PlacementFrame;
      };
      return buildEllipsoid(shapeId, o);
    }
    case "capsule": {
      const o = options as {
        r: number;
        length: number;
        frame?: PlacementFrame;
      };
      return buildCapsule(shapeId, o);
    }
    case "dome": {
      const o = options as {
        r: number;
        h: number;
        frame?: PlacementFrame;
      };
      return buildDome(shapeId, o);
    }
    default:
      throw new Error(`unknown shape kind: ${kind}`);
  }
}

export const PRIMITIVE_SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: "box", label: "Box" },
  { kind: "prism", label: "Prism" },
  { kind: "pyramid", label: "Pyramid" },
  { kind: "wedge", label: "Wedge" },
  { kind: "cylinder", label: "Cylinder" },
  { kind: "cone", label: "Cone" },
  { kind: "torus", label: "Torus" },
  { kind: "pipe", label: "Pipe" },
  { kind: "sphere", label: "Sphere" },
  { kind: "ellipsoid", label: "Ellipsoid" },
  { kind: "capsule", label: "Capsule" },
  { kind: "dome", label: "Dome" },
];

export function defaultPrimitiveOptions(
  kind: ShapeKind,
): Record<string, unknown> {
  switch (kind) {
    case "box":
      return { w: 0.05, h: 0.04, d: 0.03 };
    case "prism":
      return {
        points: Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return [Math.cos(a) * 0.03, Math.sin(a) * 0.03] as [number, number];
        }),
        d: 0.03,
      };
    case "pyramid":
      return { w: 0.05, h: 0.04 };
    case "wedge":
      return { x: 0.05, y: 0.03, z: 0.04 };
    case "cylinder":
      return { r: 0.02, h: 0.05 };
    case "cone":
      return { r: 0.025, h: 0.05 };
    case "torus":
      return { ringR: 0.04, tubeR: 0.012 };
    case "sphere":
      return { r: 0.03 };
    case "pipe":
      return {
        r: 0.008,
        points: [
          [0, 0, 0],
          [0.03, 0, 0],
          [0.03, 0.03, 0],
        ],
      };
    case "ellipsoid":
      return { rx: 0.03, ry: 0.02, rz: 0.04 };
    case "capsule":
      return { r: 0.012, length: 0.06 };
    case "dome":
      return { r: 0.03, h: 0.03 };
  }
}

// ── prism: polygon profile extruded along the normal ─────────────────────
export function buildPrism(
  shapeId: string,
  opts: {
    points: [number, number][];
    d: number;
    frame?: PlacementFrame;
    midplane?: boolean;
  },
): ShapeResult {
  const { points, d } = opts;
  if (points.length < 3)
    throw new Error(`prism: needs >=3 points, got ${points.length}`);
  const frame = opts.frame ?? DEFAULT_FRAME;
  const skId = `${shapeId}_sk`;
  const n = points.length;
  const first = points[0] as [number, number];
  const last = points[n - 1] as [number, number];
  const closed: [number, number][] =
    first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
  const prims: Prim[] = [];
  closed.forEach((p, i) => prims.push(P(`p${i}`, p[0], p[1])));
  for (let i = 0; i < n; i++) {
    prims.push(L(`l${i}`, `p${i}`, `p${(i + 1) % n}`));
  }
  const sketch = makeSketch(skId, shapeId, frame, prims);
  const op = buildExtrudeNode(
    shapeId,
    `${shapeId} (prism)`,
    [provenanceForFeature(skId, "SKETCH_ENTITY", "l0")],
    q(d),
    opts.midplane
      ? [{ kind: "boolean", parameterId: "midplane", value: true }]
      : [],
  );
  return {
    nodes: [sketch, op],
    sketch,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}

// ── pyramid: loft between a square base and a shrunken square at the top ─
export function buildPyramid(
  shapeId: string,
  opts: { w: number; h: number; frame?: PlacementFrame; cShrink?: number },
): ShapeResult {
  const { w, h } = opts;
  const s = Math.max((opts.cShrink ?? 0.02) * w, 2e-4);
  const frame = opts.frame ?? DEFAULT_FRAME;
  const skId = `${shapeId}_sk`;
  const sk2Id = `${shapeId}_sk2`;
  const hX = w / 2;
  const hS = s / 2;
  const basePrims: Prim[] = [
    P("p1", -hX, -hX),
    P("p2", hX, -hX),
    P("p3", hX, hX),
    P("p4", -hX, hX),
    L("l1", "p1", "p2"),
    L("l2", "p2", "p3"),
    L("l3", "p3", "p4"),
    L("l4", "p4", "p1"),
  ];
  const topPrims: Prim[] = [
    P("p1", -hS, -hS),
    P("p2", hS, -hS),
    P("p3", hS, hS),
    P("p4", -hS, hS),
    L("l1", "p1", "p2"),
    L("l2", "p2", "p3"),
    L("l3", "p3", "p4"),
    L("l4", "p4", "p1"),
  ];
  const { y, n } = yFromFrame(frame.xAxis, frame.normal);
  const basePlane = frameToPlane(frame);
  const topOrigin: [number, number, number] = [
    frame.origin[0] + n[0] * h,
    frame.origin[1] + n[1] * h,
    frame.origin[2] + n[2] * h,
  ];
  const topPlane = {
    type: "CUSTOM",
    origin: topOrigin,
    xAxis: basePlane.xAxis,
    yAxis: y,
    normal: n,
  };
  const base = buildSketchNode(
    skId,
    `${shapeId} base`,
    ["l1", "l2", "l3", "l4"],
    null,
    { id: skId, plane: basePlane, primitives: basePrims, constraints: [] },
  );
  const top = buildSketchNode(
    sk2Id,
    `${shapeId} top`,
    ["l1", "l2", "l3", "l4"],
    null,
    { id: sk2Id, plane: topPlane, primitives: topPrims, constraints: [] },
  );
  const op = buildLoftNode(
    shapeId,
    `${shapeId} (pyramid)`,
    [
      provenanceForFeature(skId, "SKETCH_ENTITY", "l1"),
      provenanceForFeature(sk2Id, "SKETCH_ENTITY", "l1"),
    ],
    [],
    true,
  );
  // Reuse the ShapeResult contract even though we emit two sketches.
  return {
    nodes: [base, top, op],
    sketch: base,
    op,
    bodyFeatureId: shapeId,
    profileFeatureId: skId,
  };
}
