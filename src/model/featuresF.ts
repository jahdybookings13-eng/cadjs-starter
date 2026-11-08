// Phase 3 F — modelling features implemented as macro features.
//
// A macro is one history node (rib, web, boss, dome) whose parameters drive a
// fresh helper chain on every rebuild: sketch → extrude/revolve → optional
// boolean union. The executor evaluates the helpers and retags the final body
// to the macro id, so the tree shows one feature and one body while all the
// geometry still comes from the existing kernel ops.
import {
  buildBooleanNode,
  buildExtrudeNode,
  buildRevolveNode,
  buildSketchNode,
  formatQuantityExpression,
  provenanceForFeature,
  setParameter,
  type ProvenanceQuery,
  type ScadgenFeatureNode,
  type ScadgenParameter,
} from "./onshapeHistory";

const XY = {
  type: "XY",
  origin: [0, 0, 0],
  normal: [0, 0, 1],
  xAxis: [1, 0, 0],
  yAxis: [0, 1, 0],
};

const P = (id: string, x: number, y: number) => ({ id, type: "point", x, y });
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

const q = (value: number, units = "m") => ({
  value,
  units,
  expression:
    units === "rad"
      ? `${((value * 180) / Math.PI).toFixed(2)} deg`
      : formatQuantityExpression(value, units),
});

const bool = (parameterId: string, value: boolean): ScadgenParameter => ({
  kind: "boolean",
  parameterId,
  value,
});

const queryParam = (
  parameterId: string,
  queries: ProvenanceQuery[],
): ScadgenParameter => ({ kind: "queryList", parameterId, queries });

function num(node: ScadgenFeatureNode, id: string, fallback = 0): number {
  const p = node.parameters.find(
    (x) => x.kind === "quantity" && x.parameterId === id,
  );
  return p && p.kind === "quantity" && Number.isFinite(p.value)
    ? p.value
    : fallback;
}

function flag(node: ScadgenFeatureNode, id: string): boolean {
  const p = node.parameters.find((x) => x.parameterId === id);
  if (!p) return false;
  if (p.kind === "boolean") return p.value;
  return p.kind === "string" && p.value === "true";
}

function has(node: ScadgenFeatureNode, id: string): boolean {
  return node.parameters.some((x) => x.parameterId === id);
}

function text(node: ScadgenFeatureNode, id: string): string {
  const p = node.parameters.find(
    (x) => x.kind === "string" && x.parameterId === id,
  );
  return p && p.kind === "string" ? p.value : "";
}

function targetQueries(node: ScadgenFeatureNode) {
  const p = node.parameters.find(
    (x) => x.kind === "queryList" && x.parameterId === "targets",
  );
  return p && p.kind === "queryList" ? p.queries : [];
}

function sketch(
  fid: string,
  name: string,
  plane: { origin: [number, number, number] },
  primitives: unknown[],
): ScadgenFeatureNode {
  const tags = primitives
    .filter((prim) => (prim as { type: string }).type !== "point")
    .map((prim) => (prim as { id: string }).id);
  return buildSketchNode(fid, name, tags, null, {
    id: fid,
    plane: { ...XY, origin: plane.origin },
    primitives,
    constraints: [],
  });
}

function extrude(
  fid: string,
  name: string,
  sketchId: string,
  entityTag: string,
  depth: number,
  opts: { draft?: number; flip?: boolean } = {},
): ScadgenFeatureNode {
  const overrides: ScadgenParameter[] = [
    bool("oppositeDirection", !!opts.flip),
  ];
  if (opts.draft && opts.draft > 0) {
    overrides.push(bool("hasDraft", true));
    overrides.push({
      kind: "quantity",
      parameterId: "draftAngle",
      ...q(opts.draft, "rad"),
    } as ScadgenParameter);
  }
  return buildExtrudeNode(
    fid,
    name,
    [provenanceForFeature(sketchId, "SKETCH_ENTITY", entityTag)],
    q(depth),
    overrides,
  );
}

function finish(
  node: ScadgenFeatureNode,
  chain: ScadgenFeatureNode[],
  toolId: string,
): ScadgenFeatureNode[] {
  if (flag(node, "merge") && targetQueries(node).length) {
    chain.push(
      buildBooleanNode(
        `${node.featureId}_bool`,
        node.name,
        targetQueries(node),
        [provenanceForFeature(toolId, "FACE", "*")],
        "ADD",
      ),
    );
  }
  return chain;
}

export interface RibOptions {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  z?: number;
  thickness?: number;
  depth?: number;
  draftAngle?: number;
  flip?: boolean;
  gusset?: boolean;
  merge?: boolean;
}

/** Rib/gusset macro node. Points are in the sketch XY plane, metres. */
export function buildRibFeatureNode(
  featureId: string,
  name: string,
  targetId: string | null,
  opts: RibOptions = {},
): ScadgenFeatureNode {
  const gusset = !!opts.gusset;
  const targets = targetId ? [provenanceForFeature(targetId, "FACE", "*")] : [];
  return {
    featureId,
    featureType: gusset ? "gusset" : "rib",
    name,
    namespace: "",
    parameters: [
      queryParam("targets", targets),
      { kind: "quantity", parameterId: "x1", ...q(opts.x1 ?? 0) },
      { kind: "quantity", parameterId: "y1", ...q(opts.y1 ?? 0) },
      { kind: "quantity", parameterId: "x2", ...q(opts.x2 ?? 0.04) },
      { kind: "quantity", parameterId: "y2", ...q(opts.y2 ?? 0) },
      { kind: "quantity", parameterId: "z", ...q(opts.z ?? 0) },
      {
        kind: "quantity",
        parameterId: "thickness",
        ...q(opts.thickness ?? (gusset ? 0.004 : 0.003)),
      },
      {
        kind: "quantity",
        parameterId: "depth",
        ...q(opts.depth ?? (gusset ? 0.03 : 0.02)),
      },
      bool("hasDraft", !!opts.draftAngle),
      {
        kind: "quantity",
        parameterId: "draftAngle",
        ...q(opts.draftAngle ?? 0, "rad"),
      },
      bool("flip", !!opts.flip),
      bool("merge", opts.merge ?? true),
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildGussetFeatureNode(
  featureId: string,
  name: string,
  targetId: string | null,
  opts: RibOptions = {},
): ScadgenFeatureNode {
  return buildRibFeatureNode(featureId, name, targetId, {
    ...opts,
    gusset: true,
  });
}

export function buildWebFeatureNode(
  featureId: string,
  name: string,
  targetId: string | null,
  opts: RibOptions = {},
): ScadgenFeatureNode {
  return {
    ...buildRibFeatureNode(featureId, name, targetId, {
      thickness: 0.006,
      depth: 0.03,
      ...opts,
    }),
    featureType: "web",
  };
}

export interface BossOptions {
  x?: number;
  y?: number;
  z?: number;
  diameter?: number;
  height?: number;
  draftAngle?: number;
  merge?: boolean;
}

/** Boss macro: circle on a plane → extrude → optional union with the target. */
export function buildBossFeatureNode(
  featureId: string,
  name: string,
  targetId: string | null,
  opts: BossOptions = {},
): ScadgenFeatureNode {
  const targets = targetId ? [provenanceForFeature(targetId, "FACE", "*")] : [];
  return {
    featureId,
    featureType: "boss",
    name,
    namespace: "",
    parameters: [
      queryParam("targets", targets),
      ...(opts.x !== undefined
        ? [{ kind: "quantity" as const, parameterId: "x", ...q(opts.x) }]
        : []),
      ...(opts.y !== undefined
        ? [{ kind: "quantity" as const, parameterId: "y", ...q(opts.y) }]
        : []),
      ...(opts.z !== undefined
        ? [{ kind: "quantity" as const, parameterId: "z", ...q(opts.z) }]
        : []),
      {
        kind: "quantity",
        parameterId: "diameter",
        ...q(opts.diameter ?? 0.012),
      },
      { kind: "quantity", parameterId: "height", ...q(opts.height ?? 0.01) },
      bool("hasDraft", !!opts.draftAngle),
      {
        kind: "quantity",
        parameterId: "draftAngle",
        ...q(opts.draftAngle ?? 0, "rad"),
      },
      bool("merge", opts.merge ?? true),
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export interface DomeFeatureOptions {
  x?: number;
  y?: number;
  z?: number;
  radius?: number;
  height?: number;
  merge?: boolean;
}

/** Dome modelling feature (the primitive builder is reused as a macro). */
export function buildDomeFeatureNode(
  featureId: string,
  name: string,
  targetId: string | null,
  opts: DomeFeatureOptions = {},
): ScadgenFeatureNode {
  const targets = targetId ? [provenanceForFeature(targetId, "FACE", "*")] : [];
  return {
    featureId,
    featureType: "domeFeature",
    name,
    namespace: "",
    parameters: [
      queryParam("targets", targets),
      { kind: "quantity", parameterId: "x", ...q(opts.x ?? 0) },
      { kind: "quantity", parameterId: "y", ...q(opts.y ?? 0) },
      { kind: "quantity", parameterId: "z", ...q(opts.z ?? 0) },
      { kind: "quantity", parameterId: "radius", ...q(opts.radius ?? 0.02) },
      { kind: "quantity", parameterId: "height", ...q(opts.height ?? 0.015) },
      bool("merge", opts.merge ?? true),
    ],
    subFeatures: [],
    suppressed: false,
  };
}

/**
 * Emboss is the existing Wrap EMBOSS mode with the text/logo polylines already
 * provided. The returned node is a normal `wrap` feature, so editing and
 * rebuild use the audited wrap path rather than a second implementation.
 */
export function buildEmbossNode(
  featureId: string,
  name: string,
  targetId: string,
  polylines: number[][][],
  opts: { depth?: number; width?: number } = {},
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "wrap",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [provenanceForFeature(targetId, "FACE", "*")],
      },
      {
        kind: "string",
        parameterId: "polylines",
        value: JSON.stringify(polylines),
      },
      { kind: "enum", parameterId: "operation", value: "EMBOSS" },
      { kind: "quantity", parameterId: "depth", ...q(opts.depth ?? 0.001) },
      { kind: "quantity", parameterId: "width", ...q(opts.width ?? 0.0015) },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export interface ImportRecognition {
  shape: "box" | "cylinder" | "mesh";
  faces: number;
  edges: number;
  vertices: number;
  dimensions: [number, number, number];
  confidence: number;
}

export type ImportRecognitionMode = "auto" | "box" | "cylinder" | "mesh";

/** Apply an explicit user choice without ever changing the imported geometry. */
export function applyImportRecognitionMode(
  recognition: ImportRecognition,
  mode: ImportRecognitionMode,
): ImportRecognition {
  if (mode === "auto") return recognition;
  return { ...recognition, shape: mode, confidence: 1 };
}

/** Edit the persisted recognition mode on an inserted-body node. */
export function editImportedRecognitionMode(
  node: ScadgenFeatureNode,
  mode: ImportRecognitionMode,
): ScadgenFeatureNode {
  if (node.featureType !== "insertedBody") {
    throw new Error(
      "Only inserted-body features have import recognition metadata",
    );
  }
  const parameters = node.parameters.map((parameter) => ({ ...parameter }));
  setParameter(parameters, {
    kind: "enum",
    parameterId: "recognitionMode",
    value: mode,
  });
  return { ...node, parameters };
}

/**
 * Best-effort recognition of an imported body. This never replaces the body:
 * callers keep the imported geometry and record this as metadata, so a failed
 * recognition cannot lose geometry.
 */
export function recognizeImportedBrep(brep: {
  toJSON(): {
    faces: unknown[];
    edges: unknown[];
    vertices: Array<{ x: number; y: number; z: number }>;
  };
}): ImportRecognition {
  const j = brep.toJSON();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const v of j.vertices) {
    [v.x, v.y, v.z].forEach((value, i) => {
      min[i] = Math.min(min[i] ?? Infinity, value);
      max[i] = Math.max(max[i] ?? -Infinity, value);
    });
  }
  const dims: [number, number, number] = [
    Number.isFinite(min[0]) ? (max[0] ?? 0) - (min[0] ?? 0) : 0,
    Number.isFinite(min[1]) ? (max[1] ?? 0) - (min[1] ?? 0) : 0,
    Number.isFinite(min[2]) ? (max[2] ?? 0) - (min[2] ?? 0) : 0,
  ];
  const faces = j.faces.length;
  if (faces === 6) {
    return {
      shape: "box",
      faces,
      edges: j.edges.length,
      vertices: j.vertices.length,
      dimensions: dims,
      confidence: 0.9,
    };
  }
  if (faces === 3) {
    return {
      shape: "cylinder",
      faces,
      edges: j.edges.length,
      vertices: j.vertices.length,
      dimensions: dims,
      confidence: 0.75,
    };
  }
  return {
    shape: "mesh",
    faces,
    edges: j.edges.length,
    vertices: j.vertices.length,
    dimensions: dims,
    confidence: 0.4,
  };
}

/** Standalone helix curve: same 3D path the coil sweeps, exposed as edges. */
export function buildHelixCurveNode(
  featureId: string,
  name: string,
  opts: CoilOptions = {},
): ScadgenFeatureNode {
  return {
    ...buildCoilFeatureNode(featureId, name, null, { ...opts, merge: false }),
    featureType: "helixCurve",
  };
}

/** Fit-spline curve from a point list (JSON [[x,y,z], ...], metres). */
export function buildFitSplineNode(
  featureId: string,
  name: string,
  points: number[][],
  closed = false,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "fitSpline",
    name,
    namespace: "",
    parameters: [
      { kind: "string", parameterId: "points", value: JSON.stringify(points) },
      bool("closed", closed),
    ],
    subFeatures: [],
    suppressed: false,
  };
}

/** Bridging curve between two 3D points. */
export function buildBridgingCurveNode(
  featureId: string,
  name: string,
  start: [number, number, number],
  end: [number, number, number],
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "bridgingCurve",
    name,
    namespace: "",
    parameters: [
      { kind: "string", parameterId: "start", value: start.join(",") },
      { kind: "string", parameterId: "end", value: end.join(",") },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

/** Enclose/endcap: fill the selected opening edges with a surface. */
export function buildEncloseNode(
  featureId: string,
  name: string,
  bodyId: string,
  edgeTags: string[],
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "surface",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [provenanceForFeature(bodyId, "FACE", "*")],
      },
      { kind: "string", parameterId: "kind", value: "fill" },
      {
        kind: "queryList",
        parameterId: "entities",
        queries: edgeTags.map((t) => provenanceForFeature(bodyId, "EDGE", t)),
      },
      {
        kind: "string",
        parameterId: "edgeTags",
        value: JSON.stringify(edgeTags),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export interface DeriveOptions {
  sourceTab: string;
  sourceFeature?: string;
  merge?: boolean;
  targetId?: string | null;
}

/** Derived Part Studio node; the executor resolves the tab on every rebuild. */
export function buildDeriveNode(
  featureId: string,
  name: string,
  opts: DeriveOptions,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "derive",
    name,
    namespace: "",
    parameters: [
      { kind: "string", parameterId: "sourceTab", value: opts.sourceTab },
      {
        kind: "string",
        parameterId: "sourceFeature",
        value: opts.sourceFeature ?? "",
      },
      bool("merge", opts.merge ?? false),
      ...(opts.targetId
        ? [
            {
              kind: "queryList" as const,
              parameterId: "targets",
              queries: [provenanceForFeature(opts.targetId, "FACE", "*")],
            },
          ]
        : []),
    ],
    subFeatures: [],
    suppressed: false,
  };
}

/** Fit-spline/polyline points from the node parameter. */
export function curvePoints(
  node: ScadgenFeatureNode,
): [number, number, number][] {
  const raw = text(node, "points");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    throw new Error(`${node.featureType}: points are not valid JSON`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length < 2 ||
    !parsed.every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 3 &&
        p.every((v) => typeof v === "number" && Number.isFinite(v)),
    )
  )
    throw new Error(`${node.featureType}: needs at least two 3D points`);
  return parsed as [number, number, number][];
}

/** Catmull-Rom sample through the fit points; endpoints are preserved. */
export function fitSplinePolyline(
  points: [number, number, number][],
  closed = false,
  samples = 8,
): [number, number, number][] {
  const pts = closed ? [...points, points[0]!] : points;
  const out: [number, number, number][] = [];
  const get = (i: number) =>
    pts[Math.max(0, Math.min(pts.length - 1, i))] ?? [0, 0, 0];
  const last = closed ? pts.length - 1 : pts.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const steps = i === last - 1 ? samples : samples;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        0.5 *
          (2 * p1[2] +
            (-p0[2] + p2[2]) * t +
            (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 +
            (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3),
      ]);
    }
  }
  out.push(closed ? points[0]! : points[points.length - 1]!);
  return out;
}

export function bridgePoints(
  node: ScadgenFeatureNode,
): [[number, number, number], [number, number, number]] {
  const parse = (id: string) => {
    const p = (text(node, id) || "0,0,0").split(",").map(Number);
    if (p.length !== 3 || !p.every(Number.isFinite))
      throw new Error(`bridgingCurve: ${id} must be x,y,z`);
    return p as [number, number, number];
  };
  return [parse("start"), parse("end")];
}

export type CoilHand = "right" | "left";
export type CoilPreset = "compression" | "extension" | "torsion" | "custom";

export interface CoilOptions {
  x?: number;
  y?: number;
  z?: number;
  radius?: number;
  wireRadius?: number;
  pitch?: number;
  turns?: number;
  taper?: number;
  hand?: CoilHand;
  startAngle?: number;
  endAngle?: number;
  preset?: CoilPreset;
  merge?: boolean;
}

/** Spring preset pitch/turns; explicit options still win. */
export function coilPresetValues(preset: CoilPreset): {
  pitch: number;
  turns: number;
} {
  switch (preset) {
    case "compression":
      return { pitch: 0.004, turns: 8 };
    case "extension":
      return { pitch: 0.003, turns: 10 };
    case "torsion":
      return { pitch: 0.003, turns: 6 };
    default:
      return { pitch: 0.005, turns: 6 };
  }
}

/** Coil/spring macro: circular profile swept along a true 3D helix. */
export function buildCoilFeatureNode(
  featureId: string,
  name: string,
  targetId: string | null,
  opts: CoilOptions = {},
): ScadgenFeatureNode {
  const preset = opts.preset ?? "custom";
  const presetVals = coilPresetValues(preset);
  const targets = targetId ? [provenanceForFeature(targetId, "FACE", "*")] : [];
  return {
    featureId,
    featureType: "coil",
    name,
    namespace: "",
    parameters: [
      queryParam("targets", targets),
      { kind: "quantity", parameterId: "x", ...q(opts.x ?? 0) },
      { kind: "quantity", parameterId: "y", ...q(opts.y ?? 0) },
      { kind: "quantity", parameterId: "z", ...q(opts.z ?? 0) },
      { kind: "quantity", parameterId: "radius", ...q(opts.radius ?? 0.02) },
      {
        kind: "quantity",
        parameterId: "wireRadius",
        ...q(opts.wireRadius ?? 0.002),
      },
      {
        kind: "quantity",
        parameterId: "pitch",
        ...q(opts.pitch ?? presetVals.pitch),
      },
      {
        kind: "quantity",
        parameterId: "turns",
        ...q(opts.turns ?? presetVals.turns),
      },
      { kind: "quantity", parameterId: "taper", ...q(opts.taper ?? 0) },
      { kind: "enum", parameterId: "hand", value: opts.hand ?? "right" },
      {
        kind: "quantity",
        parameterId: "startAngle",
        ...q(opts.startAngle ?? 0, "rad"),
      },
      {
        kind: "quantity",
        parameterId: "endAngle",
        ...q(opts.endAngle ?? 0, "rad"),
      },
      { kind: "enum", parameterId: "preset", value: preset },
      bool("merge", opts.merge ?? false),
    ],
    subFeatures: [],
    suppressed: false,
  };
}

/** Circular sweep profile at the start of the helix (sketch XY). */
export function buildCoilProfileSketch(
  node: ScadgenFeatureNode,
): ScadgenFeatureNode {
  const radius = num(node, "radius", 0.02);
  const wireRadius = num(node, "wireRadius", 0.002);
  const x = num(node, "x");
  const y = num(node, "y");
  const z = num(node, "z");
  if (!(radius > 0)) throw new Error("coil: radius must be > 0");
  if (!(wireRadius > 0)) throw new Error("coil: wire radius must be > 0");
  return sketch(
    `${node.featureId}_sk`,
    `${node.name} profile`,
    { origin: [x, y, z] },
    [P("c", radius, 0), C("c1", "c", wireRadius)],
  );
}

/** World-space helix points for sweepBRep. */
export function coilPathPoints(node: ScadgenFeatureNode): number[][] {
  const radius = num(node, "radius", 0.02);
  const pitch = num(node, "pitch", 0.005);
  const turns = num(node, "turns", 6);
  const taper = num(node, "taper");
  const start = num(node, "startAngle");
  const end = num(node, "endAngle");
  const x = num(node, "x");
  const y = num(node, "y");
  const z = num(node, "z");
  if (!(pitch > 0)) throw new Error("coil: pitch must be > 0");
  if (!(turns > 0)) throw new Error("coil: revolutions must be > 0");
  if (taper < 0 || taper > 0.95)
    throw new Error("coil: taper must be between 0 and 0.95");
  const hand =
    (
      node.parameters.find((p) => p.parameterId === "hand") as
        | { value?: string }
        | undefined
    )?.value === "left"
      ? -1
      : 1;
  const total = turns * Math.PI * 2 + Math.max(0, end - start);
  const steps = Math.max(32, Math.ceil((Math.abs(total) / (Math.PI * 2)) * 32));
  const points: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = start + hand * total * t;
    const r = radius * (1 - taper * t);
    points.push([
      x + r * Math.cos(angle),
      y + r * Math.sin(angle),
      z + pitch * turns * t,
    ]);
  }
  return points;
}

/**
 * Expand a macro node into fresh helper nodes. Called on every rebuild, so a
 * dialog edit changes the geometry instead of editing stale helpers.
 */
export function expandFeatureMacro(
  node: ScadgenFeatureNode,
  targetBBox?: {
    min: [number, number, number];
    max: [number, number, number];
  } | null,
): ScadgenFeatureNode[] {
  switch (node.featureType) {
    case "rib":
    case "web": {
      const [x1, y1, x2, y2, z] = [
        num(node, "x1"),
        num(node, "y1"),
        num(node, "x2"),
        num(node, "y2"),
        num(node, "z"),
      ];
      const thickness = num(node, "thickness", 0.003);
      const depth = num(node, "depth", 0.02);
      if (!(thickness > 0))
        throw new Error(`${node.featureType}: thickness must be > 0`);
      if (!(depth > 0))
        throw new Error(`${node.featureType}: depth must be > 0`);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9)
        throw new Error(`${node.featureType}: profile line has zero length`);
      const nx = (-dy / len) * (thickness / 2);
      const ny = (dx / len) * (thickness / 2);
      const prims = [
        P("p1", x1 + nx, y1 + ny),
        P("p2", x2 + nx, y2 + ny),
        P("p3", x2 - nx, y2 - ny),
        P("p4", x1 - nx, y1 - ny),
        L("l1", "p1", "p2"),
        L("l2", "p2", "p3"),
        L("l3", "p3", "p4"),
        L("l4", "p4", "p1"),
      ];
      const skId = `${node.featureId}_sk`;
      const toolId = `${node.featureId}_tool`;
      const chain = [
        sketch(skId, `${node.name} profile`, { origin: [0, 0, z] }, prims),
        extrude(toolId, node.name, skId, "l1", depth, {
          draft: flag(node, "hasDraft") ? num(node, "draftAngle") : 0,
          flip: flag(node, "flip"),
        }),
      ];
      return finish(node, chain, toolId);
    }
    case "gusset": {
      const [x1, y1, x2, y2, z] = [
        num(node, "x1"),
        num(node, "y1"),
        num(node, "x2"),
        num(node, "y2"),
        num(node, "z"),
      ];
      const thickness = num(node, "thickness", 0.004);
      const height = num(node, "depth", 0.03);
      if (!(thickness > 0)) throw new Error("gusset: thickness must be > 0");
      if (!(height > 0)) throw new Error("gusset: height must be > 0");
      if (Math.hypot(x2 - x1, y2 - y1) < 1e-9)
        throw new Error("gusset: profile line has zero length");
      const prims = [
        P("p1", x1, y1),
        P("p2", x2, y2),
        P("p3", x2, y2 + height),
        L("l1", "p1", "p2"),
        L("l2", "p2", "p3"),
        L("l3", "p3", "p1"),
      ];
      const skId = `${node.featureId}_sk`;
      const toolId = `${node.featureId}_tool`;
      const chain = [
        sketch(skId, `${node.name} profile`, { origin: [0, 0, z] }, prims),
        extrude(toolId, node.name, skId, "l1", thickness, {
          draft: flag(node, "hasDraft") ? num(node, "draftAngle") : 0,
          flip: flag(node, "flip"),
        }),
      ];
      return finish(node, chain, toolId);
    }
    case "boss": {
      const diameter = num(node, "diameter", 0.012);
      const height = num(node, "height", 0.01);
      if (!(diameter > 0)) throw new Error("boss: diameter must be > 0");
      if (!(height > 0)) throw new Error("boss: height must be > 0");
      // Default placement: top centre of the target body.
      const x = has(node, "x")
        ? num(node, "x")
        : targetBBox
          ? (targetBBox.min[0] + targetBBox.max[0]) / 2
          : 0;
      const y = has(node, "y")
        ? num(node, "y")
        : targetBBox
          ? (targetBBox.min[1] + targetBBox.max[1]) / 2
          : 0;
      const z = has(node, "z")
        ? num(node, "z")
        : targetBBox
          ? targetBBox.max[2]
          : 0;
      const skId = `${node.featureId}_sk`;
      const toolId = `${node.featureId}_tool`;
      const chain = [
        sketch(skId, `${node.name} profile`, { origin: [x, y, z] }, [
          P("c", 0, 0),
          C("c1", "c", diameter / 2),
        ]),
        extrude(toolId, node.name, skId, "c1", height, {
          draft: flag(node, "hasDraft") ? num(node, "draftAngle") : 0,
        }),
      ];
      return finish(node, chain, toolId);
    }
    case "domeFeature": {
      const radius = num(node, "radius", 0.02);
      const height = num(node, "height", 0.015);
      if (!(radius > 0)) throw new Error("dome: radius must be > 0");
      if (!(height > 0)) throw new Error("dome: height must be > 0");
      const x = num(node, "x");
      const y = num(node, "y");
      const z = num(node, "z");
      const prims: unknown[] = [
        P("p0", 0, 0),
        P("pbase", radius, 0),
        P("ptop", 0, height),
      ];
      // Closed quarter-ellipse profile, approximated with line segments so the
      // existing sketch/revolve kernel path is used unchanged.
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const a = (Math.PI / 2) * (i / steps);
        prims.push(P(`a${i}`, radius * Math.cos(a), height * Math.sin(a)));
      }
      for (let i = 0; i < steps; i++) {
        prims.push(L(`e${i}`, `a${i}`, `a${i + 1}`));
      }
      prims.push(L("ltop", `a${steps}`, "p0"));
      prims.push(L("lbase", "p0", "pbase"));
      const skId = `${node.featureId}_sk`;
      const toolId = `${node.featureId}_tool`;
      const chain = [
        sketch(skId, `${node.name} profile`, { origin: [x, y, z] }, prims),
        buildRevolveNode(
          toolId,
          node.name,
          [provenanceForFeature(skId, "SKETCH_ENTITY", "e0")],
          [provenanceForFeature(skId, "SKETCH_ENTITY", "ltop")],
          q(Math.PI * 2, "rad"),
        ),
      ];
      return finish(node, chain, toolId);
    }
    case "emboss":
      throw new Error("emboss: use buildEmbossNode (wrap EMBOSS mode)");
    default:
      throw new Error(`${node.featureType}: not a macro feature`);
  }
}

/** JSON polylines for emboss/wrap, with a named error instead of silent loss. */
export function parseEmbossPolylines(node: ScadgenFeatureNode): number[][][] {
  const raw = text(node, "polylines");
  if (!raw) throw new Error("emboss: no text/logo polylines");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("emboss: polylines are not valid JSON");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every(
      (line) =>
        Array.isArray(line) &&
        line.length >= 2 &&
        line.every(
          (pt) =>
            Array.isArray(pt) &&
            pt.length >= 2 &&
            pt.every((v) => typeof v === "number" && Number.isFinite(v)),
        ),
    )
  )
    throw new Error("emboss: polylines must be a non-empty list of 2D paths");
  return parsed as number[][][];
}
