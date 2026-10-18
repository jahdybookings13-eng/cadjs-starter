import {
  findAllIntersections,
  findNearestExtendTarget,
  identifyTrimSegment,
  makeSketchConstraint,
  requiresValue,
  validateConstraint,
  type ConstraintType,
} from "@vitekk02/cadjs";
import {
  buildSketchNode,
  type ScadgenFeatureNode,
  type ScadgenParameter,
} from "./onshapeHistory";

export interface SketchSnapLike {
  id: string;
  plane: Record<string, unknown>;
  primitives: unknown[];
  constraints?: unknown[];
}

function revive(snap: SketchSnapLike) {
  return {
    id: snap.id,
    plane: snap.plane as never,
    primitives: snap.primitives as never,
    constraints: (snap.constraints ?? []) as never,
    dof: 0,
    status: "underconstrained" as const,
  };
}

export function buildConstraintNode(opts: {
  featureId: string;
  name?: string;
  sketchFeatureId: string;
  type: ConstraintType;
  primitiveIds: string[];
  value?: number;
  units?: string;
}): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [
    {
      kind: "queryList",
      parameterId: "sketch",
      queries: [
        {
          entityType: "SKETCH_ENTITY",
          historyType: "CREATION",
          creationFeatureId: opts.sketchFeatureId,
          entityTag: "*",
        },
      ],
    },
    { kind: "string", parameterId: "constraintType", value: opts.type },
    {
      kind: "string",
      parameterId: "primitiveIds",
      value: opts.primitiveIds.join(","),
    },
  ];
  if (requiresValue(opts.type)) {
    parameters.push({
      kind: "quantity",
      parameterId: "value",
      value: opts.value ?? 0,
      units: opts.units ?? "m",
      expression: String(opts.value ?? 0),
    });
  }
  return {
    featureId: opts.featureId,
    featureType: "constraint",
    name: opts.name ?? `${opts.type} constraint`,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function isValidConstraint(
  snap: SketchSnapLike,
  type: ConstraintType,
  primitiveIds: string[],
): boolean {
  return validateConstraint(type, primitiveIds, revive(snap).primitives);
}

export function trimSegmentInfo(
  snap: SketchSnapLike,
  primId: string,
  cursor: { x: number; y: number },
) {
  const sketch = revive(snap);
  const inter = findAllIntersections(sketch, primId);
  return identifyTrimSegment(sketch, primId, inter, cursor);
}

export function trimSnapshot(
  snap: SketchSnapLike,
  primId: string,
  cursor: { x: number; y: number },
): {
  snapshot: SketchSnapLike;
  removed: { startParam: number; endParam: number };
} | null {
  const sketch = revive(snap);
  const inter = findAllIntersections(sketch, primId);
  const seg = identifyTrimSegment(sketch, primId, inter, cursor);
  if (!seg) return null;
  const prims = snap.primitives as Array<Record<string, unknown>>;
  const line = prims.find((p) => p.id === primId && p.type === "line") as
    | { p1Id: string; p2Id: string }
    | undefined;
  const points = new Map(
    prims
      .filter((p) => p.type === "point")
      .map((p) => [p.id as string, p as { x: number; y: number }]),
  );
  if (!line) return { snapshot: snap, removed: seg };
  const a = points.get(line.p1Id);
  const b = points.get(line.p2Id);
  if (!a || !b) return { snapshot: snap, removed: seg };
  const at = (t: number) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const keepA = seg.startParam > 1e-9;
  const keepB = seg.endParam < 1 - 1e-9;
  if (!keepA && !keepB) return null;
  const nid = `${primId}_t${Date.now() % 100000}`;
  const pa = at(0);
  const pm = at(keepA ? seg.startParam : seg.endParam);
  const pb = at(1);
  const outPrims: unknown[] = prims.filter((p) => p.id !== primId);
  if (keepA) {
    outPrims.push(
      { id: `${nid}a`, type: "point", x: pa.x, y: pa.y },
      { id: `${nid}b`, type: "point", x: pm.x, y: pm.y },
      { id: `${nid}L`, type: "line", p1Id: `${nid}a`, p2Id: `${nid}b` },
    );
  }
  if (keepB) {
    const p2id = keepA ? `${nid}c` : `${nid}a`;
    const p3id = keepA ? `${nid}d` : `${nid}b`;
    if (!keepA) {
      outPrims.push({ id: p2id, type: "point", x: pm.x, y: pm.y });
    } else {
      outPrims.push({ id: p2id, type: "point", x: pm.x, y: pm.y });
    }
    outPrims.push({ id: p3id, type: "point", x: pb.x, y: pb.y });
    outPrims.push({
      id: keepA ? `${nid}M` : `${nid}L`,
      type: "line",
      p1Id: p2id,
      p2Id: p3id,
    });
  }
  return {
    snapshot: { ...snap, primitives: outPrims },
    removed: seg,
  };
}

export function extendSnapshot(
  snap: SketchSnapLike,
  lineId: string,
  isStart: boolean,
): SketchSnapLike | null {
  const sketch = revive(snap);
  const target = findNearestExtendTarget(sketch, lineId, isStart);
  if (!target) return null;
  const prims = snap.primitives as Array<Record<string, unknown>>;
  const line = prims.find((p) => p.id === lineId && p.type === "line") as
    | { p1Id: string; p2Id: string }
    | undefined;
  if (!line) return null;
  const pid = isStart ? line.p1Id : line.p2Id;
  return {
    ...snap,
    primitives: prims.map((p) =>
      p.id === pid && p.type === "point"
        ? { ...p, x: target.point.x, y: target.point.y }
        : p,
    ),
  };
}

export { makeSketchConstraint };
