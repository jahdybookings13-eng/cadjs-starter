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

export function buildSplitNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  planeOrigin: [number, number, number],
  planeNormal: [number, number, number],
  keep: "positive" | "negative" = "positive",
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
        queries: [faceQ(bodyFeatureId, "*")],
      },
      { kind: "string", parameterId: "patternType", value: "curve" },
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
        queries: [faceQ(bodyFeatureId, "*")],
      },
      { kind: "string", parameterId: "patternType", value: "circular" },
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
