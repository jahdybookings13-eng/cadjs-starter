import {
  findSketchPoint,
  isSketchHatch,
  isSketchLine,
  isSketchPoint,
  type HatchPattern,
  type Sketch,
  type SketchBlockDefinition,
  type SketchHatch,
  type SketchLayer,
  type SketchLine,
  type SketchPrimitive,
} from "@vitekk02/cadjs";

export const DEFAULT_LAYER_ID = "layer_0";

export function ensureSketchLayers(sketch: Sketch): SketchLayer[] {
  if (sketch.layers?.length) return sketch.layers;
  return [
    {
      id: DEFAULT_LAYER_ID,
      name: "Layer 0",
      color: "#cbd5e1",
      visible: true,
      linetype: "continuous",
    },
  ];
}

export function layerForPrimitive(
  sketch: Sketch,
  primitive: SketchPrimitive,
): SketchLayer {
  const layers = ensureSketchLayers(sketch);
  return (
    layers.find((layer) => layer.id === primitive.layerId) ??
    layers.find((layer) => layer.id === DEFAULT_LAYER_ID) ??
    layers[0]!
  );
}

export function assignLayerToSelection(
  sketch: Sketch,
  selection: readonly string[],
  layerId: string,
): Sketch {
  const ids = new Set(selection);
  return {
    ...sketch,
    primitives: sketch.primitives.map((primitive) =>
      ids.has(primitive.id) ? { ...primitive, layerId } : primitive,
    ),
  };
}

/** Lines belonging to one polyline, in their stored order. */
export function polylineLines(
  sketch: Sketch,
  polylineId: string,
): SketchLine[] {
  return sketch.primitives.filter(
    (primitive): primitive is SketchLine =>
      isSketchLine(primitive) && primitive.polylineId === polylineId,
  );
}

/**
 * Find one ordered, closed loop among the selected lines. Every vertex must be
 * shared by exactly two selected lines. Returns null for open/branched chains.
 */
export function orderedClosedLoop(
  sketch: Sketch,
  selectedIds: readonly string[],
): { lineIds: string[]; pointIds: string[] } | null {
  const selected = new Set(selectedIds);
  const lines = sketch.primitives.filter(
    (primitive): primitive is SketchLine =>
      isSketchLine(primitive) &&
      selected.has(primitive.id) &&
      !primitive.origin &&
      !primitive.construction,
  );
  if (lines.length < 3) return null;

  const edgeByPoint = new Map<string, string[]>();
  for (const line of lines) {
    for (const pointId of [line.p1Id, line.p2Id]) {
      const list = edgeByPoint.get(pointId) ?? [];
      list.push(line.id);
      edgeByPoint.set(pointId, list);
    }
  }
  if ([...edgeByPoint.values()].some((list) => list.length !== 2)) return null;

  const lineById = new Map(lines.map((line) => [line.id, line]));
  const startLine = lines[0]!;
  const orderedLineIds: string[] = [startLine.id];
  const pointIds: string[] = [startLine.p1Id];
  let currentPoint = startLine.p2Id;
  let guard = 0;

  while (currentPoint !== startLine.p1Id && guard++ < lines.length + 2) {
    const candidates = edgeByPoint.get(currentPoint) ?? [];
    const nextId = candidates.find((id) => !orderedLineIds.includes(id));
    if (!nextId) return null;
    const next = lineById.get(nextId);
    if (!next) return null;
    orderedLineIds.push(next.id);
    pointIds.push(currentPoint);
    currentPoint = next.p1Id === currentPoint ? next.p2Id : next.p1Id;
  }

  if (currentPoint !== startLine.p1Id) return null;
  if (orderedLineIds.length !== lines.length) return null;
  return { lineIds: orderedLineIds, pointIds };
}

export function hatchFromSelection(
  sketch: Sketch,
  selection: readonly string[],
  id: string,
  options: {
    pattern?: HatchPattern;
    spacing?: number;
    angle?: number;
    layerId?: string;
  } = {},
): { ok: true; hatch: SketchHatch } | { ok: false; reason: string } {
  const loop = orderedClosedLoop(sketch, selection);
  if (!loop) {
    return {
      ok: false,
      reason: "Select a single closed loop of at least three lines.",
    };
  }
  return {
    ok: true,
    hatch: {
      id,
      type: "hatch",
      boundaryIds: loop.lineIds,
      pattern: options.pattern ?? "lines",
      spacing: Math.max(0.05, options.spacing ?? 0.75),
      angle: options.angle ?? Math.PI / 4,
      ...(options.layerId ? { layerId: options.layerId } : {}),
    },
  };
}

function selectionWithDependencies(
  sketch: Sketch,
  selection: readonly string[],
): SketchPrimitive[] {
  const selected = new Set(selection);
  const add = new Set(selection);

  for (const primitive of sketch.primitives) {
    if (!selected.has(primitive.id)) continue;
    if (isSketchHatch(primitive)) {
      for (const lineId of primitive.boundaryIds) add.add(lineId);
    }
  }

  for (const primitive of sketch.primitives) {
    if (!add.has(primitive.id)) continue;
    if (isSketchPoint(primitive)) continue;
    if (isSketchLine(primitive)) {
      add.add(primitive.p1Id);
      add.add(primitive.p2Id);
    } else if (primitive.type === "circle" || primitive.type === "ellipse") {
      add.add(primitive.centerId);
    } else if (primitive.type === "ellipticalArc") {
      add.add(primitive.centerId);
    } else if (primitive.type === "arc") {
      add.add(primitive.centerId);
      add.add(primitive.startId);
      add.add(primitive.endId);
    } else if (primitive.type === "spline" || primitive.type === "bezier") {
      for (const pointId of primitive.pointIds) add.add(pointId);
      if (primitive.type === "spline") {
        if (primitive.startId) add.add(primitive.startId);
        if (primitive.endId) add.add(primitive.endId);
      }
    } else if (primitive.type === "conic") {
      add.add(primitive.startId);
      add.add(primitive.controlId);
      add.add(primitive.endId);
    } else if (isSketchHatch(primitive)) {
      for (const lineId of primitive.boundaryIds) add.add(lineId);
    }
  }

  return sketch.primitives.filter((primitive) => add.has(primitive.id));
}

function remapPrimitive(
  primitive: SketchPrimitive,
  idMap: Map<string, string>,
  polylineMap: Map<string, string>,
  generateId: (prefix: string) => string,
  options: {
    blockInstanceId?: string;
    blockDefinitionId?: string;
    blockInstancePath?: string[] | undefined;
  } = {},
): SketchPrimitive {
  const id = idMap.get(primitive.id) ?? generateId(primitive.type);
  const {
    blockInstanceId: _oldInstance,
    blockDefinitionId: _oldDefinition,
    blockInstancePath: _oldPath,
    ...rest
  } = primitive;
  const polylineId = primitive.polylineId
    ? (polylineMap.get(primitive.polylineId) ?? primitive.polylineId)
    : undefined;
  const base = {
    ...rest,
    id,
    ...(polylineId ? { polylineId } : {}),
    ...(options.blockInstanceId
      ? { blockInstanceId: options.blockInstanceId }
      : {}),
    ...(options.blockDefinitionId
      ? { blockDefinitionId: options.blockDefinitionId }
      : {}),
    ...(options.blockInstancePath
      ? { blockInstancePath: options.blockInstancePath }
      : {}),
  };

  if (isSketchPoint(primitive)) return { ...base, id };
  if (isSketchLine(primitive)) {
    return {
      ...base,
      type: "line",
      p1Id: idMap.get(primitive.p1Id) ?? primitive.p1Id,
      p2Id: idMap.get(primitive.p2Id) ?? primitive.p2Id,
    };
  }
  if (primitive.type === "circle" || primitive.type === "ellipse") {
    return {
      ...base,
      type: primitive.type,
      centerId: idMap.get(primitive.centerId) ?? primitive.centerId,
    } as SketchPrimitive;
  }
  if (primitive.type === "ellipticalArc") {
    return {
      ...base,
      type: "ellipticalArc",
      centerId: idMap.get(primitive.centerId) ?? primitive.centerId,
    } as SketchPrimitive;
  }
  if (primitive.type === "arc") {
    return {
      ...base,
      type: "arc",
      centerId: idMap.get(primitive.centerId) ?? primitive.centerId,
      startId: idMap.get(primitive.startId) ?? primitive.startId,
      endId: idMap.get(primitive.endId) ?? primitive.endId,
    } as SketchPrimitive;
  }
  if (primitive.type === "spline" || primitive.type === "bezier") {
    return {
      ...base,
      pointIds: primitive.pointIds.map((id) => idMap.get(id) ?? id),
      ...(primitive.type === "spline" && primitive.startId
        ? { startId: idMap.get(primitive.startId) ?? primitive.startId }
        : {}),
      ...(primitive.type === "spline" && primitive.endId
        ? { endId: idMap.get(primitive.endId) ?? primitive.endId }
        : {}),
    } as SketchPrimitive;
  }
  if (primitive.type === "conic") {
    return {
      ...base,
      type: "conic",
      startId: idMap.get(primitive.startId) ?? primitive.startId,
      controlId: idMap.get(primitive.controlId) ?? primitive.controlId,
      endId: idMap.get(primitive.endId) ?? primitive.endId,
    } as SketchPrimitive;
  }
  if (isSketchHatch(primitive)) {
    return {
      ...base,
      boundaryIds: primitive.boundaryIds.map(
        (boundaryId) => idMap.get(boundaryId) ?? boundaryId,
      ),
    } as SketchHatch;
  }
  return base;
}

export function createBlockFromSelection(
  sketch: Sketch,
  selection: readonly string[],
  name: string,
  generateId: (prefix: string) => string,
):
  | { ok: true; definition: SketchBlockDefinition; sketch: Sketch }
  | {
      ok: false;
      reason: string;
    } {
  const selected = selectionWithDependencies(sketch, selection);
  const drawable = selected.filter((primitive) => !isSketchPoint(primitive));
  if (drawable.length === 0) {
    return { ok: false, reason: "Select sketch geometry to define a block." };
  }

  const definitionId = generateId("blockdef");
  const instanceId = generateId("blockinst");
  const idMap = new Map<string, string>();
  const polylineMap = new Map<string, string>();
  for (const primitive of selected) {
    idMap.set(primitive.id, generateId(primitive.type));
    if (primitive.polylineId && !polylineMap.has(primitive.polylineId)) {
      polylineMap.set(primitive.polylineId, generateId("pline"));
    }
  }
  const snapshot = selected.map((primitive) => {
    const path =
      primitive.blockInstancePath ??
      (primitive.blockInstanceId ? [primitive.blockInstanceId] : []);
    return remapPrimitive(primitive, idMap, polylineMap, generateId, {
      blockDefinitionId: definitionId,
      blockInstancePath: path.length > 0 ? path : undefined,
    });
  });

  const definition: SketchBlockDefinition = {
    id: definitionId,
    name,
    primitives: snapshot,
    constraints: [],
  };
  const ids = new Set(selected.map((primitive) => primitive.id));
  const updated: Sketch = {
    ...sketch,
    blocks: [...(sketch.blocks ?? []), definition],
    primitives: sketch.primitives.map((primitive) =>
      ids.has(primitive.id)
        ? {
            ...primitive,
            blockInstanceId: instanceId,
            blockDefinitionId: definitionId,
            blockInstancePath: [
              instanceId,
              ...(primitive.blockInstancePath ?? []),
            ],
          }
        : primitive,
    ),
  };
  return { ok: true, definition, sketch: updated };
}

export function insertBlock(
  sketch: Sketch,
  definitionId: string,
  offset: { x: number; y: number },
  generateId: (prefix: string) => string,
):
  | { ok: true; sketch: Sketch; primitives: SketchPrimitive[] }
  | {
      ok: false;
      reason: string;
    } {
  const definition = (sketch.blocks ?? []).find(
    (block) => block.id === definitionId,
  );
  if (!definition) return { ok: false, reason: "Block definition not found." };

  const instanceId = generateId("blockinst");
  const idMap = new Map<string, string>();
  const polylineMap = new Map<string, string>();
  const childInstanceMap = new Map<string, string>();
  for (const primitive of definition.primitives) {
    idMap.set(primitive.id, generateId(primitive.type));
    if (primitive.polylineId && !polylineMap.has(primitive.polylineId)) {
      polylineMap.set(primitive.polylineId, generateId("pline"));
    }
    for (const childId of primitive.blockInstancePath ?? []) {
      if (!childInstanceMap.has(childId)) {
        childInstanceMap.set(childId, generateId("blockinst"));
      }
    }
  }

  const inserted: SketchPrimitive[] = [];
  for (const primitive of definition.primitives) {
    const childPath = (primitive.blockInstancePath ?? []).map(
      (childId) => childInstanceMap.get(childId) ?? childId,
    );
    const remapped = remapPrimitive(primitive, idMap, polylineMap, generateId, {
      blockInstanceId: instanceId,
      blockDefinitionId: definition.id,
      blockInstancePath: [instanceId, ...childPath],
    });
    if (isSketchPoint(remapped)) {
      inserted.push({
        ...remapped,
        x: remapped.x + offset.x,
        y: remapped.y + offset.y,
      } as SketchPrimitive);
    } else {
      inserted.push(remapped);
    }
  }

  return {
    ok: true,
    sketch: { ...sketch, primitives: [...sketch.primitives, ...inserted] },
    primitives: inserted,
  };
}

export function explodeBlockSelection(
  sketch: Sketch,
  selection: readonly string[],
): { sketch: Sketch; count: number } {
  const selected = new Set(selection);
  const selectedPrimitives = sketch.primitives.filter((primitive) =>
    selected.has(primitive.id),
  );
  const selectedPaths = selectedPrimitives.map(
    (primitive) =>
      primitive.blockInstancePath ??
      (primitive.blockInstanceId ? [primitive.blockInstanceId] : []),
  );
  const deepest = selectedPaths.reduce(
    (best, path) => (path.length > best.length ? path : best),
    [] as string[],
  );
  if (deepest.length === 0) return { sketch, count: 0 };

  const nestedTarget = deepest.length > 1 ? deepest[deepest.length - 1] : null;
  const instanceIds = new Set(
    selectedPrimitives
      .map((primitive) => primitive.blockInstanceId)
      .filter((id): id is string => !!id),
  );
  const matches = (primitive: SketchPrimitive): boolean => {
    if (nestedTarget) {
      return (primitive.blockInstancePath ?? []).includes(nestedTarget);
    }
    return (
      !!primitive.blockInstanceId && instanceIds.has(primitive.blockInstanceId)
    );
  };

  let count = 0;
  const primitives = sketch.primitives.map((primitive) => {
    if (!matches(primitive)) return primitive;
    count++;
    const path = primitive.blockInstancePath ?? [];
    const remainingPath = nestedTarget
      ? path.filter((id) => id !== nestedTarget)
      : [];
    if (remainingPath.length === 0) {
      const {
        blockInstanceId: _instance,
        blockDefinitionId: _definition,
        blockInstancePath: _path,
        ...rest
      } = primitive;
      return rest as SketchPrimitive;
    }
    return {
      ...primitive,
      blockInstanceId: remainingPath[0],
      blockInstancePath: remainingPath,
    } as SketchPrimitive;
  });
  return { sketch: { ...sketch, primitives }, count };
}

export function polylineVertices(
  sketch: Sketch,
  polylineId: string,
): Array<{ id: string; x: number; y: number }> {
  const lines = polylineLines(sketch, polylineId);
  if (lines.length === 0) return [];
  const points: Array<{ id: string; x: number; y: number }> = [];
  const push = (id: string) => {
    const point = findSketchPoint(sketch.primitives, id);
    if (point && !points.some((entry) => entry.id === id)) {
      points.push({ id, x: point.x, y: point.y });
    }
  };
  push(lines[0]!.p1Id);
  for (const line of lines) {
    push(line.p1Id);
    push(line.p2Id);
  }
  return points;
}
