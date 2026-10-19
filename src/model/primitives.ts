import {
  buildExtrudeNode,
  formatQuantityExpression,
  buildSketchNode,
  buildRevolveNode,
  provenanceForFeature,
  type ScadgenFeatureNode,
} from "./onshapeHistory";

const faceQ = (fid: string, tag: string) =>
  provenanceForFeature(fid, "FACE", tag);

const XY = {
  type: "XY",
  origin: [0, 0, 0],
  normal: [0, 0, 1],
  xAxis: [1, 0, 0],
  yAxis: [0, 1, 0],
};
const XZ = {
  type: "XZ",
  origin: [0, 0, 0],
  normal: [0, 1, 0],
  xAxis: [1, 0, 0],
  yAxis: [0, 0, -1],
};

const P = (id: string, x: number, y: number) => ({ id, type: "point", x, y });
const L = (id: string, a: string, b: string) => ({
  id,
  type: "line",
  p1Id: a,
  p2Id: b,
});

function sketchJson(id: string, plane: typeof XY, primitives: unknown[]) {
  return { id, plane, primitives, constraints: [] };
}

function rectPrims(w: number, h: number, ox = 0, oy = 0) {
  return [
    P("p1", ox, oy),
    P("p2", ox + w, oy),
    P("p3", ox + w, oy + h),
    P("p4", ox, oy + h),
    L("l1", "p1", "p2"),
    L("l2", "p2", "p3"),
    L("l3", "p3", "p4"),
    L("l4", "p4", "p1"),
  ];
}

function sketchNode(
  fid: string,
  name: string,
  plane: typeof XY,
  primitives: unknown[],
): ScadgenFeatureNode {
  const tags = primitives
    .filter((p) => (p as { type: string }).type !== "point")
    .map((p) => (p as { id: string }).id);
  return buildSketchNode(
    fid,
    name,
    tags,
    null,
    sketchJson(fid, plane, primitives),
  );
}

const q = (meters: number, expr: string) => ({
  value: meters,
  units: "m",
  expression: expr,
});

export function buildRectangleProfileNodes(
  baseId: string,
  name: string,
  opts: { width: number; height: number },
): ScadgenFeatureNode[] {
  return [
    sketchNode(
      `${baseId}S`,
      name,
      XY,
      rectPrims(opts.width, opts.height, -opts.width / 2, -opts.height / 2),
    ),
  ];
}

export function buildBoxNodes(
  baseId: string,
  name: string,
  w: number,
  h: number,
  d: number,
  opts?: { midplane?: boolean; opposite?: boolean },
): ScadgenFeatureNode[] {
  const skFid = `${baseId}_sk`;
  return [
    sketchNode(skFid, `${name} profile`, XY, rectPrims(w, h)),
    buildExtrudeNode(
      baseId,
      name,
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "l1")],
      q(d, `${(d * 1000).toFixed(0)} mm`),
      [
        {
          kind: "boolean",
          parameterId: "midplane",
          value: !!opts?.midplane,
        },
        {
          kind: "boolean",
          parameterId: "oppositeDirection",
          value: !!opts?.opposite,
        },
      ],
    ),
  ];
}

export function buildDatumSketchExtrudeNodes(
  baseId: string,
  name: string,
  datumFeatureId: string,
  width: number,
  height: number,
  depth: number,
): ScadgenFeatureNode[] {
  const skFid = `${baseId}_sk`;
  const plane = {
    type: "DATUM",
    origin: [0, 0, 0],
    normal: [0, 0, 1],
    xAxis: [1, 0, 0],
    yAxis: [0, 1, 0],
  };
  const sk = sketchNode(
    skFid,
    `${name} profile`,
    plane,
    rectPrims(width, height),
  );
  sk.parameters = [
    ...sk.parameters,
    { kind: "string", parameterId: "planeRef", value: datumFeatureId },
  ];
  return [
    sk,
    buildExtrudeNode(
      baseId,
      name,
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "l1")],
      q(depth, `${(depth * 1000).toFixed(0)} mm`),
    ),
  ];
}

export function buildCylinderNodes(
  baseId: string,
  name: string,
  r: number,
  h: number,
): ScadgenFeatureNode[] {
  const skFid = `${baseId}_sk`;
  return [
    sketchNode(skFid, `${name} profile`, XZ, rectPrims(r, h)),
    buildRevolveNode(
      baseId,
      name,
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "l1")],
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "l4")],
      q(Math.PI * 2, "360 deg"),
    ),
  ];
}

export function buildConeNodes(
  baseId: string,
  name: string,
  r: number,
  h: number,
): ScadgenFeatureNode[] {
  const skFid = `${baseId}_sk`;
  return [
    sketchNode(skFid, `${name} profile`, XZ, [
      P("p1", 0, 0),
      P("p2", r, 0),
      P("p3", 0, h),
      L("l1", "p1", "p2"),
      L("l2", "p2", "p3"),
      L("l3", "p3", "p1"),
    ]),
    buildRevolveNode(
      baseId,
      name,
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "l1")],
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "l3")],
      q(Math.PI * 2, "360 deg"),
    ),
  ];
}

export function buildSphereNodes(
  baseId: string,
  name: string,
  r: number,
): ScadgenFeatureNode[] {
  const skFid = `${baseId}_sk`;
  return [
    sketchNode(skFid, `${name} profile`, XZ, [
      P("pc", 0, 0),
      P("ps", 0, -r),
      P("pe", 0, r),
      {
        id: "a1",
        type: "arc",
        centerId: "pc",
        startId: "ps",
        endId: "pe",
        radius: r,
      },
      L("l1", "pe", "ps"),
    ]),
    buildRevolveNode(
      baseId,
      name,
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "a1")],
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "l1")],
      q(Math.PI * 2, "360 deg"),
    ),
  ];
}

export function buildTorusNodes(
  baseId: string,
  name: string,
  ringR: number,
  tubeR: number,
): ScadgenFeatureNode[] {
  const skFid = `${baseId}_sk`;
  return [
    sketchNode(skFid, `${name} profile`, XZ, [
      P("pc", ringR, 0),
      { id: "c1", type: "circle", centerId: "pc", radius: tubeR },
      P("pa", 0, 0),
      P("pb", 0, Math.max(ringR, 1e-3)),
      L("l1", "pa", "pb"),
    ]),
    buildRevolveNode(
      baseId,
      name,
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "c1")],
      [provenanceForFeature(skFid, "SKETCH_ENTITY", "l1")],
      q(Math.PI * 2, "360 deg"),
    ),
  ];
}

export function buildLinearPatternNodes(
  baseId: string,
  name: string,
  sourceFeatureId: string,
  count: number,
  dir: [number, number, number],
  spacing: number,
): ScadgenFeatureNode {
  return {
    featureId: baseId,
    featureType: "pattern",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [provenanceForFeature(sourceFeatureId, "FACE", "")],
      },
      {
        kind: "quantity",
        parameterId: "count",
        value: count,
        units: "",
        expression: String(count),
      },
      {
        kind: "quantity",
        parameterId: "spacing",
        value: spacing,
        units: "m",
        expression: `${(spacing * 1000).toFixed(0)} mm`,
      },
      { kind: "matrix", parameterId: "direction", elements: [...dir] },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildMirrorNodes(
  baseId: string,
  name: string,
  sourceFeatureId: string,
  axis: "X" | "Y" | "Z",
): ScadgenFeatureNode {
  return {
    featureId: baseId,
    featureType: "mirror",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [provenanceForFeature(sourceFeatureId, "FACE", "")],
      },
      { kind: "enum", parameterId: "axis", value: axis },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildShellNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  faceTags: string[],
  thickness: number,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "shell",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(bodyFeatureId, faceTags[0] ?? "*")],
      },
      {
        kind: "queryList",
        parameterId: "faces",
        queries: faceTags.map((t) => faceQ(bodyFeatureId, t)),
      },
      {
        kind: "quantity",
        parameterId: "thickness",
        value: thickness,
        units: "m",
        expression: formatQuantityExpression(thickness, "m"),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildDraftNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  faceTags: string[],
  angleDeg: number,
  neutralTag: string,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "draft",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(bodyFeatureId, neutralTag)],
      },
      {
        kind: "queryList",
        parameterId: "faces",
        queries: faceTags.map((t) => faceQ(bodyFeatureId, t)),
      },
      {
        kind: "queryList",
        parameterId: "neutralFace",
        queries: [faceQ(bodyFeatureId, neutralTag)],
      },
      {
        kind: "quantity",
        parameterId: "angle",
        value: (angleDeg * Math.PI) / 180,
        units: "rad",
        expression: `${angleDeg} deg`,
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildHoleNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  centers: [number, number, number][],
  radius: number,
  depth: number,
  axisDir: [number, number, number] = [0, 0, -1],
  throughAll = true,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "hole",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(bodyFeatureId, "*")],
      },
      {
        kind: "string",
        parameterId: "centerPoints",
        value: JSON.stringify(centers.map(([x, y, z]) => ({ x, y, z }))),
      },
      {
        kind: "string",
        parameterId: "axisDir",
        value: axisDir.join(","),
      },
      {
        kind: "string",
        parameterId: "throughAll",
        value: String(throughAll),
      },
      {
        kind: "quantity",
        parameterId: "radius",
        value: radius,
        units: "m",
        expression: formatQuantityExpression(radius, "m"),
      },
      {
        kind: "quantity",
        parameterId: "depth",
        value: depth,
        units: "m",
        expression: formatQuantityExpression(depth, "m"),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildProjectCurvesNode(
  featureId: string,
  name: string,
  sourceFeatureId: string,
  targetFeatureId: string,
  edgeTags: string[],
  direction: [number, number, number],
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "projectCurves",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [faceQ(sourceFeatureId, "*")],
      },
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(targetFeatureId, "*")],
      },
      {
        kind: "string",
        parameterId: "edgeTags",
        value: JSON.stringify(edgeTags),
      },
      { kind: "string", parameterId: "direction", value: direction.join(",") },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildRuledSurfaceNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  edgeTagA: string,
  edgeTagB: string,
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
        queries: [faceQ(bodyFeatureId, "*")],
      },
      { kind: "string", parameterId: "kind", value: "ruled" },
      {
        kind: "string",
        parameterId: "edgeTags",
        value: JSON.stringify([edgeTagA, edgeTagB]),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildFillSurfaceNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  faceTag: string,
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
        queries: [faceQ(bodyFeatureId, "*")],
      },
      { kind: "string", parameterId: "kind", value: "fill" },
      { kind: "string", parameterId: "faceTag", value: faceTag },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildOffsetSurfaceNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  faceTag: string,
  distance: number,
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
        queries: [faceQ(bodyFeatureId, "*")],
      },
      { kind: "string", parameterId: "kind", value: "offset" },
      { kind: "string", parameterId: "faceTag", value: faceTag },
      {
        kind: "quantity",
        parameterId: "distance",
        value: distance,
        units: "m",
        expression: formatQuantityExpression(distance, "m"),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildCreatePlaneNode(
  featureId: string,
  name: string,
  origin: [number, number, number],
  normal: [number, number, number],
  size: number,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "createPlane",
    name,
    namespace: "",
    parameters: [
      { kind: "string", parameterId: "origin", value: origin.join(",") },
      { kind: "string", parameterId: "normal", value: normal.join(",") },
      {
        kind: "quantity",
        parameterId: "size",
        value: size,
        units: "m",
        expression: formatQuantityExpression(size, "m"),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildCurveOnFaceNode(
  featureId: string,
  name: string,
  sourceFeatureId: string,
  targetFeatureId: string,
  edgeTags: string[],
  faceTag: string,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "curveOnFace",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [faceQ(sourceFeatureId, "*")],
      },
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(targetFeatureId, "*")],
      },
      {
        kind: "string",
        parameterId: "edgeTags",
        value: JSON.stringify(edgeTags),
      },
      { kind: "string", parameterId: "faceTag", value: faceTag },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildScaleNode(
  featureId: string,
  name: string,
  sourceFeatureId: string,
  factor: number,
  origin: [number, number, number],
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "scale",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [faceQ(sourceFeatureId, "*")],
      },
      {
        kind: "quantity",
        parameterId: "factor",
        value: factor,
        units: "",
        expression: String(factor),
      },
      { kind: "string", parameterId: "origin", value: origin.join(",") },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildThreadNode(
  featureId: string,
  name: string,
  sourceFeatureId: string,
  size: string,
  kind: "external" | "internal",
  standard: "iso" | "unified" | "npt" = "iso",
  mode: "coarse" | "fine" = "coarse",
  engagement = 1,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "thread",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [faceQ(sourceFeatureId, "*")],
      },
      { kind: "string", parameterId: "standard", value: standard },
      { kind: "string", parameterId: "size", value: size },
      { kind: "string", parameterId: "mode", value: mode },
      { kind: "string", parameterId: "kind", value: kind },
      {
        kind: "quantity",
        parameterId: "engagement",
        value: engagement,
        units: "",
        expression: String(engagement),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function cloneFeatureNodes(
  nodes: ScadgenFeatureNode[],
  suffix: string,
  shift: [number, number, number],
): ScadgenFeatureNode[] {
  const map = new Map(
    nodes.map((n) => [n.featureId, `${n.featureId}${suffix}`]),
  );
  const walk = (val: unknown): unknown => {
    if (Array.isArray(val)) return val.map(walk);
    if (val && typeof val === "object") {
      const o = val as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        if (
          (k === "featureId" ||
            k === "creationFeatureId" ||
            k === "planeRef") &&
          typeof v === "string" &&
          map.has(v)
        )
          out[k] = map.get(v);
        else if (
          k === "plane" &&
          v &&
          typeof v === "object" &&
          Array.isArray((v as { origin?: unknown }).origin)
        ) {
          const p = v as { origin: number[] };
          out[k] = {
            ...p,
            origin: [
              (p.origin[0] ?? 0) + shift[0],
              (p.origin[1] ?? 0) + shift[1],
              (p.origin[2] ?? 0) + shift[2],
            ],
          };
        } else out[k] = walk(v);
      }
      return out;
    }
    return val;
  };
  return nodes.map((n) => walk(n) as ScadgenFeatureNode);
}

export function buildFeaturePatternNode(
  featureId: string,
  name: string,
  chainNodes: ScadgenFeatureNode[],
  axis: [number, number, number],
  spacing: number,
  count: number,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "featurePattern",
    name,
    namespace: "",
    parameters: [
      {
        kind: "string",
        parameterId: "chain",
        value: JSON.stringify(chainNodes),
      },
      { kind: "string", parameterId: "axis", value: axis.join(",") },
      {
        kind: "quantity",
        parameterId: "spacing",
        value: spacing,
        units: "m",
        expression: formatQuantityExpression(spacing, "m"),
      },
      {
        kind: "quantity",
        parameterId: "count",
        value: count,
        units: "",
        expression: String(count),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildFlangeNode(
  featureId: string,
  name: string,
  sourceFeatureId: string,
  edgeTag: string,
  angleRad: number,
  thickness: number,
  relief = 0,
  radius = 0,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "flange",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [faceQ(sourceFeatureId, "*")],
      },
      { kind: "string", parameterId: "edgeTag", value: edgeTag },
      {
        kind: "quantity",
        parameterId: "angle",
        value: angleRad,
        units: "rad",
        expression: `${((angleRad * 180) / Math.PI).toFixed(0)} deg`,
      },
      {
        kind: "quantity",
        parameterId: "thickness",
        value: thickness,
        units: "m",
        expression: formatQuantityExpression(thickness, "m"),
      },
      {
        kind: "quantity",
        parameterId: "relief",
        value: relief,
        units: "m",
        expression: formatQuantityExpression(relief, "m"),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildHemNode(
  featureId: string,
  name: string,
  sourceFeatureId: string,
  edgeTag: string,
  thickness: number,
  lip: number,
  relief = 0,
  radius = 0,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "hem",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [faceQ(sourceFeatureId, "*")],
      },
      { kind: "string", parameterId: "edgeTag", value: edgeTag },
      {
        kind: "quantity",
        parameterId: "thickness",
        value: thickness,
        units: "m",
        expression: formatQuantityExpression(thickness, "m"),
      },
      {
        kind: "quantity",
        parameterId: "lip",
        value: lip,
        units: "m",
        expression: formatQuantityExpression(lip, "m"),
      },
      {
        kind: "quantity",
        parameterId: "relief",
        value: relief,
        units: "m",
        expression: formatQuantityExpression(relief, "m"),
      },
      {
        kind: "quantity",
        parameterId: "radius",
        value: radius,
        units: "m",
        expression: formatQuantityExpression(radius, "m"),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildUnfoldNode(
  featureId: string,
  name: string,
  sourceFeatureId: string,
  folds: {
    angle: number;
    length: number;
    thickness: number;
    radius?: number;
  }[],
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "unfold",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [faceQ(sourceFeatureId, "*")],
      },
      { kind: "string", parameterId: "folds", value: JSON.stringify(folds) },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildWrapNode(
  featureId: string,
  name: string,
  targetFeatureId: string,
  polylines: number[][][],
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
        queries: [faceQ(targetFeatureId, "*")],
      },
      {
        kind: "string",
        parameterId: "polylines",
        value: JSON.stringify(polylines),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildMoveFaceNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  faceTag: string,
  distance: number,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "moveFace",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(bodyFeatureId, "*")],
      },
      { kind: "string", parameterId: "faceTag", value: faceTag },
      {
        kind: "quantity",
        parameterId: "distance",
        value: distance,
        units: "m",
        expression: formatQuantityExpression(distance, "m"),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildSectionNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  planeOrigin: [number, number, number],
  planeNormal: [number, number, number],
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "section",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(bodyFeatureId, "*")],
      },
      {
        kind: "string",
        parameterId: "planeOrigin",
        value: planeOrigin.join(","),
      },
      {
        kind: "string",
        parameterId: "planeNormal",
        value: planeNormal.join(","),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildSplitNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  planeOrigin: [number, number, number],
  planeNormal: [number, number, number],
  keep: "positive" | "negative" | "both" = "positive",
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "split",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(bodyFeatureId, "*")],
      },
      {
        kind: "string",
        parameterId: "planeOrigin",
        value: planeOrigin.join(","),
      },
      {
        kind: "string",
        parameterId: "planeNormal",
        value: planeNormal.join(","),
      },
      { kind: "string", parameterId: "keep", value: keep },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildThickenNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  faceTags: string[],
  thickness: number,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "thicken",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(bodyFeatureId, "*")],
      },
      {
        kind: "queryList",
        parameterId: "faces",
        queries: faceTags.map((t) => faceQ(bodyFeatureId, t)),
      },
      {
        kind: "quantity",
        parameterId: "thickness",
        value: thickness,
        units: "m",
        expression: formatQuantityExpression(thickness, "m"),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildDeleteBodiesNode(
  featureId: string,
  name: string,
  bodyOwners: string[],
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "deleteBodies",
    name,
    namespace: "",
    parameters: [
      {
        kind: "string",
        parameterId: "bodies",
        value: JSON.stringify(bodyOwners),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildDeleteFaceNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  faceTags: string[],
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "deleteFace",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "targets",
        queries: [faceQ(bodyFeatureId, "*")],
      },
      {
        kind: "queryList",
        parameterId: "faces",
        queries: faceTags.map((t) => faceQ(bodyFeatureId, t)),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildCurvePatternNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  pathPoints: [number, number, number][],
  count: number,
  align = false,
  extraSourceFeatureIds: string[] = [],
  separate = false,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "pattern",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [
          faceQ(bodyFeatureId, "*"),
          ...extraSourceFeatureIds.map((f) => faceQ(f, "*")),
        ],
      },
      { kind: "string", parameterId: "patternType", value: "curve" },
      { kind: "string", parameterId: "separate", value: String(separate) },
      {
        kind: "quantity",
        parameterId: "count",
        value: count,
        units: "",
        expression: String(count),
      },
      {
        kind: "string",
        parameterId: "pathPoints",
        value: JSON.stringify(pathPoints.map(([x, y, z]) => ({ x, y, z }))),
      },
      { kind: "string", parameterId: "align", value: String(align) },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildCircularPatternNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  count: number,
  axisDir: [number, number, number] = [0, 0, 1],
  angleDeg = 360,
  extraSourceFeatureIds: string[] = [],
  separate = false,
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "pattern",
    name,
    namespace: "",
    parameters: [
      {
        kind: "queryList",
        parameterId: "entities",
        queries: [
          faceQ(bodyFeatureId, "*"),
          ...extraSourceFeatureIds.map((f) => faceQ(f, "*")),
        ],
      },
      { kind: "string", parameterId: "patternType", value: "circular" },
      { kind: "string", parameterId: "separate", value: String(separate) },
      {
        kind: "quantity",
        parameterId: "count",
        value: count,
        units: "",
        expression: String(count),
      },
      {
        kind: "quantity",
        parameterId: "angle",
        value: (angleDeg * Math.PI) / 180,
        units: "rad",
        expression: `${angleDeg} deg`,
      },
      {
        kind: "string",
        parameterId: "axisDir",
        value: axisDir.join(","),
      },
      { kind: "string", parameterId: "axisOrigin", value: "0,0,0" },
    ],
    subFeatures: [],
    suppressed: false,
  };
}
