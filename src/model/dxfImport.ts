import type {
  SketchArc,
  SketchCircle,
  SketchEllipse,
  SketchEllipticalArc,
  SketchLine,
  SketchPoint,
  SketchPrimitive,
} from "@vitekk02/cadjs";

export interface DxfImportResult {
  ok: true;
  points: SketchPoint[];
  primitives: SketchPrimitive[];
  entityCount: number;
  skipped: string[];
  units: string;
}

export type DxfImportFailure = { ok: false; reason: string };

interface DxfPair {
  code: number;
  value: string;
}

interface DxfEntity {
  type: string;
  pairs: DxfPair[];
}

const UNIT_SCALE: Record<number, { scale: number; name: string }> = {
  1: { scale: 25.4, name: "in" },
  2: { scale: 304.8, name: "ft" },
  4: { scale: 1, name: "mm" },
  5: { scale: 10, name: "cm" },
  6: { scale: 1000, name: "m" },
};

function pairsFrom(text: string): DxfPair[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const pairs: DxfPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]?.trim());
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1] ?? "" });
  }
  return pairs;
}

function first(pairs: DxfPair[], code: number): string | undefined {
  return pairs.find((pair) => pair.code === code)?.value;
}

function num(pairs: DxfPair[], code: number, fallback = 0): number {
  const value = Number(first(pairs, code));
  return Number.isFinite(value) ? value : fallback;
}

function sectionEntities(pairs: DxfPair[]): DxfEntity[] {
  const entities: DxfEntity[] = [];
  let inEntities = false;
  let current: DxfEntity | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]!;
    if (pair.code === 0 && pair.value === "SECTION") {
      const name = pairs[i + 1];
      inEntities = name?.code === 2 && name.value.toUpperCase() === "ENTITIES";
      current = null;
      continue;
    }
    if (pair.code === 0 && pair.value === "ENDSEC") {
      if (current) entities.push(current);
      current = null;
      inEntities = false;
      continue;
    }
    if (!inEntities) continue;
    if (pair.code === 0) {
      if (current) entities.push(current);
      current = { type: pair.value.toUpperCase(), pairs: [] };
    } else if (current) {
      current.pairs.push(pair);
    }
  }
  if (current) entities.push(current);
  return entities;
}

function dxfUnits(pairs: DxfPair[]): { scale: number; name: string } {
  const index = pairs.findIndex(
    (pair) => pair.code === 9 && pair.value === "$INSUNITS",
  );
  if (index < 0) return UNIT_SCALE[4]!;
  const next = pairs.slice(index + 1).find((pair) => pair.code === 70);
  const code = Number(next?.value);
  return UNIT_SCALE[code] ?? UNIT_SCALE[4]!;
}

/**
 * Read the common 2D entities from an ASCII DXF. Supports LINE, CIRCLE, ARC,
 * LWPOLYLINE (straight segments), ELLIPSE and POINT; SPLINE, INSERT, TEXT and
 * 3D entities are reported as skipped instead of silently disappearing.
 * Coordinates are converted to millimetres from the header's $INSUNITS.
 */
export function importDxfToSketch(
  text: string,
  generateId: (prefix: string) => string,
): DxfImportResult | DxfImportFailure {
  if (!/^\s*0\s*\nSECTION/m.test(text)) {
    return { ok: false, reason: "This is not an ASCII DXF file." };
  }
  const pairs = pairsFrom(text);
  const entities = sectionEntities(pairs);
  if (entities.length === 0) {
    return {
      ok: false,
      reason: "The DXF has no entities in its ENTITIES section.",
    };
  }
  const units = dxfUnits(pairs);
  const points: SketchPoint[] = [];
  const primitives: SketchPrimitive[] = [];
  const skipped: string[] = [];
  let entityCount = 0;

  const point = (x: number, y: number): SketchPoint => {
    const p: SketchPoint = {
      id: generateId("pt"),
      type: "point",
      x: x * units.scale,
      y: y * units.scale,
    };
    points.push(p);
    return p;
  };

  for (const entity of entities) {
    const { type, pairs: p } = entity;
    if (type === "LINE") {
      const p1 = point(num(p, 10), num(p, 20));
      const p2 = point(num(p, 11), num(p, 21));
      primitives.push({
        id: generateId("ln"),
        type: "line",
        p1Id: p1.id,
        p2Id: p2.id,
      } satisfies SketchLine);
      entityCount++;
      continue;
    }
    if (type === "CIRCLE") {
      const center = point(num(p, 10), num(p, 20));
      primitives.push({
        id: generateId("cir"),
        type: "circle",
        centerId: center.id,
        radius: num(p, 40) * units.scale,
      } satisfies SketchCircle);
      entityCount++;
      continue;
    }
    if (type === "ARC") {
      const cx = num(p, 10);
      const cy = num(p, 20);
      const radius = num(p, 40);
      if (radius <= 0) {
        skipped.push("ARC with zero radius");
        continue;
      }
      const startAngle = (num(p, 50) * Math.PI) / 180;
      const endAngle = (num(p, 51) * Math.PI) / 180;
      const center = point(cx, cy);
      const start = point(
        cx + radius * Math.cos(startAngle),
        cy + radius * Math.sin(startAngle),
      );
      const end = point(
        cx + radius * Math.cos(endAngle),
        cy + radius * Math.sin(endAngle),
      );
      primitives.push({
        id: generateId("arc"),
        type: "arc",
        centerId: center.id,
        startId: start.id,
        endId: end.id,
        radius: radius * units.scale,
      } satisfies SketchArc);
      entityCount++;
      continue;
    }
    if (type === "LWPOLYLINE") {
      const xs = p
        .filter((pair) => pair.code === 10)
        .map((pair) => Number(pair.value));
      const ys = p
        .filter((pair) => pair.code === 20)
        .map((pair) => Number(pair.value));
      const closed = (num(p, 70) & 1) === 1;
      const vertices = xs.map((x, index) => ({ x, y: ys[index] ?? 0 }));
      if (vertices.length < 2) {
        skipped.push("LWPOLYLINE with fewer than two vertices");
        continue;
      }
      const ids = vertices.map((vertex) => point(vertex.x, vertex.y));
      for (let i = 1; i < ids.length; i++) {
        primitives.push({
          id: generateId("ln"),
          type: "line",
          p1Id: ids[i - 1]!.id,
          p2Id: ids[i]!.id,
        } satisfies SketchLine);
      }
      if (closed) {
        primitives.push({
          id: generateId("ln"),
          type: "line",
          p1Id: ids[ids.length - 1]!.id,
          p2Id: ids[0]!.id,
        } satisfies SketchLine);
      }
      if (p.some((pair) => pair.code === 42)) {
        skipped.push("LWPOLYLINE bulge arcs imported as straight segments");
      }
      entityCount++;
      continue;
    }
    if (type === "ELLIPSE") {
      const cx = num(p, 10);
      const cy = num(p, 20);
      const mx = num(p, 11);
      const my = num(p, 21);
      const majorRadius = Math.hypot(mx, my);
      const ratio = num(p, 40, 1);
      const start = num(p, 41, 0);
      const end = num(p, 42, Math.PI * 2);
      if (majorRadius <= 0 || ratio <= 0) {
        skipped.push("ELLIPSE with invalid radii");
        continue;
      }
      const center = point(cx, cy);
      const rotation = Math.atan2(my, mx);
      const full = Math.abs(end - start) >= Math.PI * 2 - 1e-9;
      if (full) {
        primitives.push({
          id: generateId("ell"),
          type: "ellipse",
          centerId: center.id,
          majorRadius: majorRadius * units.scale,
          minorRadius: majorRadius * ratio * units.scale,
          rotation,
        } satisfies SketchEllipse);
      } else {
        primitives.push({
          id: generateId("earc"),
          type: "ellipticalArc",
          centerId: center.id,
          majorRadius: majorRadius * units.scale,
          minorRadius: majorRadius * ratio * units.scale,
          rotation,
          startAngle: start,
          endAngle: end,
        } satisfies SketchEllipticalArc);
      }
      entityCount++;
      continue;
    }
    if (type === "POINT") {
      point(num(p, 10), num(p, 20));
      entityCount++;
      continue;
    }
    skipped.push(type);
  }

  if (entityCount === 0) {
    return {
      ok: false,
      reason: `No supported 2D DXF entities found (${[...new Set(skipped)].join(", ") || "empty"}).`,
    };
  }
  return {
    ok: true,
    points,
    primitives,
    entityCount,
    skipped: [...new Set(skipped)],
    units: units.name,
  };
}
