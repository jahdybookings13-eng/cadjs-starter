import type { Sketch, SketchLayer, SketchLine } from "@vitekk02/cadjs";
import { ensureSketchLayers, polylineVertices } from "./sketchEntities";

const ACI: Array<[number, string]> = [
  [1, "#ef4444"],
  [2, "#facc15"],
  [3, "#22c55e"],
  [4, "#06b6d4"],
  [5, "#3b82f6"],
  [6, "#d946ef"],
  [7, "#e5e7eb"],
];

function colorIndex(hex: string): number {
  const target = hex.toLowerCase();
  let best = 7;
  let bestDistance = Infinity;
  for (const [index, value] of ACI) {
    const a = parseInt(value.slice(1), 16);
    const b = parseInt(target.replace("#", "").slice(0, 6), 16);
    if (!Number.isFinite(b)) return 7;
    const distance =
      Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) +
      Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) +
      Math.abs((a & 255) - (b & 255));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function layerName(layer: SketchLayer): string {
  return layer.name.replace(/[^\w.-]+/g, "_") || "0";
}

function pair(lines: string[], code: number, value: string | number): void {
  lines.push(String(code), String(value));
}

/**
 * Export the active 2D sketch as an ASCII DXF R12 file. Layers, colours,
 * linetypes, polylines, circles, arcs, ellipses and points are preserved.
 * Hatches and blocks are expanded to their source geometry, which is the
 * useful interchange representation for other CAD tools.
 */
export function sketchToDxf(sketch: Sketch): string {
  const layers = ensureSketchLayers(sketch);
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const fallback = layers[0]!;
  const layerFor = (id: string | undefined) =>
    layerName((id ? byId.get(id) : undefined) ?? fallback);
  const lines: string[] = [];

  pair(lines, 0, "SECTION");
  pair(lines, 2, "HEADER");
  pair(lines, 9, "$ACADVER");
  pair(lines, 1, "AC1009");
  pair(lines, 9, "$INSUNITS");
  pair(lines, 70, 4);
  pair(lines, 0, "ENDSEC");

  pair(lines, 0, "SECTION");
  pair(lines, 2, "TABLES");
  pair(lines, 0, "TABLE");
  pair(lines, 2, "LAYER");
  pair(lines, 70, layers.length);
  for (const layer of layers) {
    pair(lines, 0, "LAYER");
    pair(lines, 2, layerName(layer));
    pair(lines, 70, 0);
    pair(
      lines,
      62,
      layer.visible ? colorIndex(layer.color) : -colorIndex(layer.color),
    );
    pair(lines, 6, layer.linetype.toUpperCase());
  }
  pair(lines, 0, "ENDTAB");
  pair(lines, 0, "ENDSEC");

  pair(lines, 0, "SECTION");
  pair(lines, 2, "ENTITIES");
  const point = (id: string) => {
    const p = sketch.primitives.find((primitive) => primitive.id === id);
    return p?.type === "point" ? p : null;
  };
  const handledLines = new Set<string>();

  for (const primitive of sketch.primitives) {
    if (primitive.type === "point" && !primitive.origin) {
      pair(lines, 0, "POINT");
      pair(lines, 8, layerFor(primitive.layerId));
      pair(lines, 10, primitive.x);
      pair(lines, 20, primitive.y);
      continue;
    }
    if (primitive.type === "line" && !handledLines.has(primitive.id)) {
      if (primitive.polylineId) {
        const group = sketch.primitives.filter(
          (entry): entry is SketchLine =>
            entry.type === "line" && entry.polylineId === primitive.polylineId,
        );
        for (const line of group) handledLines.add(line.id);
        const vertices = polylineVertices(sketch, primitive.polylineId);
        if (vertices.length >= 2) {
          const first = group[0]!;
          const last = group[group.length - 1]!;
          const closed =
            (first.p1Id === last.p2Id || first.p2Id === last.p1Id) &&
            vertices.length > 2;
          pair(lines, 0, "LWPOLYLINE");
          pair(lines, 8, layerFor((first as { layerId?: string }).layerId));
          pair(lines, 90, vertices.length);
          pair(lines, 70, closed ? 1 : 0);
          for (const vertex of vertices) {
            pair(lines, 10, vertex.x);
            pair(lines, 20, vertex.y);
          }
          continue;
        }
      }
      const p1 = point(primitive.p1Id);
      const p2 = point(primitive.p2Id);
      if (!p1 || !p2) continue;
      pair(lines, 0, "LINE");
      pair(lines, 8, layerFor(primitive.layerId));
      pair(lines, 10, p1.x);
      pair(lines, 20, p1.y);
      pair(lines, 30, 0);
      pair(lines, 11, p2.x);
      pair(lines, 21, p2.y);
      pair(lines, 31, 0);
      continue;
    }
    if (primitive.type === "circle") {
      const center = point(primitive.centerId);
      if (!center) continue;
      pair(lines, 0, "CIRCLE");
      pair(lines, 8, layerFor(primitive.layerId));
      pair(lines, 10, center.x);
      pair(lines, 20, center.y);
      pair(lines, 40, primitive.radius);
      continue;
    }
    if (primitive.type === "arc") {
      const center = point(primitive.centerId);
      const start = point(primitive.startId);
      const end = point(primitive.endId);
      if (!center || !start || !end) continue;
      const startAngle =
        (Math.atan2(start.y - center.y, start.x - center.x) * 180) / Math.PI;
      const endAngle =
        (Math.atan2(end.y - center.y, end.x - center.x) * 180) / Math.PI;
      pair(lines, 0, "ARC");
      pair(lines, 8, layerFor(primitive.layerId));
      pair(lines, 10, center.x);
      pair(lines, 20, center.y);
      pair(lines, 40, primitive.radius);
      pair(lines, 50, startAngle);
      pair(lines, 51, endAngle);
      continue;
    }
    if (primitive.type === "ellipse" || primitive.type === "ellipticalArc") {
      const center = point(primitive.centerId);
      if (!center) continue;
      const major = primitive.majorRadius;
      const minor = primitive.minorRadius;
      pair(lines, 0, "ELLIPSE");
      pair(lines, 8, layerFor(primitive.layerId));
      pair(lines, 10, center.x);
      pair(lines, 20, center.y);
      pair(lines, 11, Math.cos(primitive.rotation) * major);
      pair(lines, 21, Math.sin(primitive.rotation) * major);
      pair(lines, 40, major === 0 ? 1 : minor / major);
      pair(lines, 41, primitive.type === "ellipse" ? 0 : primitive.startAngle);
      pair(
        lines,
        42,
        primitive.type === "ellipse" ? Math.PI * 2 : primitive.endAngle,
      );
    }
  }

  pair(lines, 0, "ENDSEC");
  pair(lines, 0, "EOF");
  return lines.join("\n");
}
