// In-context sketches for assembly and drawing tabs.
//
// A context sketch is authored in the tab that owns the reference geometry,
// not inside a Part Studio. Its reference edges carry the source body id so a
// later update can re-project them instead of baking a one-time copy.

export const CONTEXT_SKETCH_SCHEMA = "scadgen.contextsketch";
export const CONTEXT_SKETCH_VERSION = 1 as const;

export type ContextSketchContext = "assembly" | "drawing";
export type ContextSketchPlane = "XY" | "XZ" | "YZ";

export interface ContextSketchPoint {
  x: number;
  y: number;
}

export interface ContextSketchSegment {
  a: ContextSketchPoint;
  b: ContextSketchPoint;
}

export interface ContextSketchReference {
  id: string;
  sourceId: string;
  sourceLabel: string;
  kind: "body" | "edge";
  segments: ContextSketchSegment[];
}

export interface ContextSketchLine {
  id: string;
  p1: ContextSketchPoint;
  p2: ContextSketchPoint;
  referenceId?: string;
}

export interface ContextSketchCircle {
  id: string;
  center: ContextSketchPoint;
  radius: number;
  referenceId?: string;
}

export interface ContextSketchDocument {
  schema: typeof CONTEXT_SKETCH_SCHEMA;
  v: typeof CONTEXT_SKETCH_VERSION;
  id: string;
  name: string;
  context: ContextSketchContext;
  plane: ContextSketchPlane;
  references: ContextSketchReference[];
  lines: ContextSketchLine[];
  circles: ContextSketchCircle[];
  createdAt: number;
  updatedAt: number;
}

export interface ContextBodyEdges {
  id: string;
  name: string;
  edges: ReadonlyArray<
    readonly [
      { x: number; y: number; z: number },
      { x: number; y: number; z: number },
    ]
  >;
}

export interface ContextBodyBox {
  id: string;
  name: string;
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

let sketchSeq = 0;

function nextId(prefix: string): string {
  sketchSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${sketchSeq.toString(36)}`;
}

export function projectContextPoint(
  point: { x: number; y: number; z: number },
  plane: ContextSketchPlane,
  scale = 1000,
): ContextSketchPoint {
  if (plane === "XZ") return { x: point.x * scale, y: point.z * scale };
  if (plane === "YZ") return { x: point.y * scale, y: point.z * scale };
  return { x: point.x * scale, y: point.y * scale };
}

function samePoint(a: ContextSketchPoint, b: ContextSketchPoint): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

export function referencesFromEdges(
  bodies: readonly ContextBodyEdges[],
  plane: ContextSketchPlane = "XY",
  scale = 1000,
): ContextSketchReference[] {
  return bodies.map((body) => {
    const segments: ContextSketchSegment[] = [];
    for (const [a, b] of body.edges) {
      const p1 = projectContextPoint(a, plane, scale);
      const p2 = projectContextPoint(b, plane, scale);
      if (samePoint(p1, p2)) continue;
      segments.push({ a: p1, b: p2 });
    }
    return {
      id: `ctxref_${body.id}`,
      sourceId: body.id,
      sourceLabel: body.name,
      kind: "body" as const,
      segments,
    };
  });
}

export function referencesFromBoxes(
  boxes: readonly ContextBodyBox[],
  plane: ContextSketchPlane = "XY",
  scale = 1000,
): ContextSketchReference[] {
  return boxes.map((box) => {
    const min = projectContextPoint(box.min, plane, scale);
    const max = projectContextPoint(box.max, plane, scale);
    const corners = [
      { x: min.x, y: min.y },
      { x: max.x, y: min.y },
      { x: max.x, y: max.y },
      { x: min.x, y: max.y },
    ];
    const segments: ContextSketchSegment[] = [];
    for (let i = 0; i < corners.length; i += 1) {
      const a = corners[i]!;
      const b = corners[(i + 1) % corners.length]!;
      segments.push({ a, b });
    }
    return {
      id: `ctxref_${box.id}`,
      sourceId: box.id,
      sourceLabel: box.name,
      kind: "body" as const,
      segments,
    };
  });
}

export function emptyContextSketch(
  context: ContextSketchContext,
  name = context === "assembly" ? "Assembly sketch" : "Drawing sketch",
  references: readonly ContextSketchReference[] = [],
  plane: ContextSketchPlane = "XY",
  now = Date.now(),
): ContextSketchDocument {
  return {
    schema: CONTEXT_SKETCH_SCHEMA,
    v: CONTEXT_SKETCH_VERSION,
    id: nextId("ctxsketch"),
    name: name.trim() || "Context sketch",
    context,
    plane,
    references: references.map((reference) => ({
      ...reference,
      segments: reference.segments.map((segment) => ({
        a: { ...segment.a },
        b: { ...segment.b },
      })),
    })),
    lines: [],
    circles: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addContextLine(
  sketch: ContextSketchDocument,
  p1: ContextSketchPoint,
  p2: ContextSketchPoint,
  referenceId?: string,
): ContextSketchDocument {
  if (samePoint(p1, p2)) return sketch;
  return {
    ...sketch,
    lines: [
      ...sketch.lines,
      {
        id: nextId("ctxline"),
        p1: { ...p1 },
        p2: { ...p2 },
        ...(referenceId ? { referenceId } : {}),
      },
    ],
    updatedAt: Date.now(),
  };
}

export function addContextCircle(
  sketch: ContextSketchDocument,
  center: ContextSketchPoint,
  radius: number,
  referenceId?: string,
): ContextSketchDocument {
  if (!(radius > 0)) return sketch;
  return {
    ...sketch,
    circles: [
      ...sketch.circles,
      {
        id: nextId("ctxcircle"),
        center: { ...center },
        radius,
        ...(referenceId ? { referenceId } : {}),
      },
    ],
    updatedAt: Date.now(),
  };
}

export function addContextReference(
  sketch: ContextSketchDocument,
  reference: ContextSketchReference,
): ContextSketchDocument {
  if (sketch.references.some((item) => item.sourceId === reference.sourceId))
    return sketch;
  return {
    ...sketch,
    references: [...sketch.references, reference],
    updatedAt: Date.now(),
  };
}

/** Replace reference geometry while keeping authored lines/circles intact. */
export function refreshContextReferences(
  sketch: ContextSketchDocument,
  references: readonly ContextSketchReference[],
): ContextSketchDocument {
  const bySource = new Map(references.map((item) => [item.sourceId, item]));
  return {
    ...sketch,
    references: sketch.references.map(
      (item) => bySource.get(item.sourceId) ?? item,
    ),
    updatedAt: Date.now(),
  };
}

export function removeLastContextEntity(
  sketch: ContextSketchDocument,
): ContextSketchDocument {
  if (sketch.circles.length) {
    return {
      ...sketch,
      circles: sketch.circles.slice(0, -1),
      updatedAt: Date.now(),
    };
  }
  if (sketch.lines.length) {
    return {
      ...sketch,
      lines: sketch.lines.slice(0, -1),
      updatedAt: Date.now(),
    };
  }
  return sketch;
}

export function contextSketchBounds(sketch: ContextSketchDocument): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const reference of sketch.references) {
    for (const segment of reference.segments) {
      xs.push(segment.a.x, segment.b.x);
      ys.push(segment.a.y, segment.b.y);
    }
  }
  for (const line of sketch.lines) {
    xs.push(line.p1.x, line.p2.x);
    ys.push(line.p1.y, line.p2.y);
  }
  for (const circle of sketch.circles) {
    xs.push(circle.center.x - circle.radius, circle.center.x + circle.radius);
    ys.push(circle.center.y - circle.radius, circle.center.y + circle.radius);
  }
  if (!xs.length) return { minX: -50, minY: -50, maxX: 50, maxY: 50 };
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function serializeContextSketch(sketch: ContextSketchDocument): string {
  return JSON.stringify(sketch);
}

export function parseContextSketch(raw: unknown): ContextSketchDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ContextSketchDocument>;
  if (
    value.schema !== CONTEXT_SKETCH_SCHEMA ||
    value.v !== CONTEXT_SKETCH_VERSION ||
    (value.context !== "assembly" && value.context !== "drawing") ||
    (value.plane !== "XY" && value.plane !== "XZ" && value.plane !== "YZ") ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.references) ||
    !Array.isArray(value.lines) ||
    !Array.isArray(value.circles)
  )
    return null;
  const point = (candidate: unknown): ContextSketchPoint | null => {
    if (!candidate || typeof candidate !== "object") return null;
    const p = candidate as Partial<ContextSketchPoint>;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: Number(p.x), y: Number(p.y) };
  };
  const references: ContextSketchReference[] = value.references.flatMap(
    (candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const ref = candidate as Partial<ContextSketchReference>;
      if (
        typeof ref.id !== "string" ||
        typeof ref.sourceId !== "string" ||
        typeof ref.sourceLabel !== "string" ||
        (ref.kind !== "body" && ref.kind !== "edge") ||
        !Array.isArray(ref.segments)
      )
        return [];
      const segments = ref.segments.flatMap((segment) => {
        if (!segment || typeof segment !== "object") return [];
        const a = point((segment as Partial<ContextSketchSegment>).a);
        const b = point((segment as Partial<ContextSketchSegment>).b);
        return a && b ? [{ a, b }] : [];
      });
      return [
        {
          id: ref.id,
          sourceId: ref.sourceId,
          sourceLabel: ref.sourceLabel,
          kind: ref.kind,
          segments,
        },
      ];
    },
  );
  const lines: ContextSketchLine[] = value.lines.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const line = candidate as Partial<ContextSketchLine>;
    const p1 = point(line.p1);
    const p2 = point(line.p2);
    if (typeof line.id !== "string" || !p1 || !p2) return [];
    return [
      {
        id: line.id,
        p1,
        p2,
        ...(typeof line.referenceId === "string"
          ? { referenceId: line.referenceId }
          : {}),
      },
    ];
  });
  const circles: ContextSketchCircle[] = value.circles.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const circle = candidate as Partial<ContextSketchCircle>;
    const center = point(circle.center);
    if (
      typeof circle.id !== "string" ||
      !center ||
      !Number.isFinite(circle.radius) ||
      Number(circle.radius) <= 0
    )
      return [];
    return [
      {
        id: circle.id,
        center,
        radius: Number(circle.radius),
        ...(typeof circle.referenceId === "string"
          ? { referenceId: circle.referenceId }
          : {}),
      },
    ];
  });
  return {
    schema: CONTEXT_SKETCH_SCHEMA,
    v: CONTEXT_SKETCH_VERSION,
    id: value.id,
    name: value.name.trim() || "Context sketch",
    context: value.context,
    plane: value.plane,
    references,
    lines,
    circles,
    createdAt: Number.isFinite(value.createdAt) ? Number(value.createdAt) : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : 0,
  };
}

export function parseContextSketches(raw: unknown): ContextSketchDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const sketch = parseContextSketch(entry);
    return sketch ? [sketch] : [];
  });
}
