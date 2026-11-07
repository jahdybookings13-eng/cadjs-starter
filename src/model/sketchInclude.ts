import * as THREE from "three";
import {
  sectionBRep,
  type Sketch,
  type SketchIncludeSource,
  type SketchLine,
  type SketchPlane,
  type SketchPoint,
  type SketchPrimitive,
} from "@vitekk02/cadjs";

type Body = Parameters<typeof sectionBRep>[0];
type Sectioner = typeof sectionBRep;

export interface IncludeElement {
  nodeId?: string | undefined;
  brep: Body;
  position: THREE.Vector3;
  rotation?: THREE.Euler | undefined;
  occBrep?: string | undefined;
  edgeGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
}

export type IncludeEdgesResult =
  | { ok: true; points: SketchPoint[]; primitives: SketchLine[] }
  | { ok: false; reason: string };

const MIN_LENGTH = 1e-6;

/** Project BRep edge segments from selected bodies into 2D. */
export async function includeSelectedEdges(
  elements: readonly IncludeElement[],
  plane: SketchPlane,
  generateId: (prefix: string) => string,
  sectioner: Sectioner = sectionBRep,
): Promise<IncludeEdgesResult> {
  const points: SketchPoint[] = [];
  const primitives: SketchLine[] = [];
  const pointIds = new Map<string, string>();
  const origin = plane.origin;
  const xAxis = plane.xAxis;
  const yAxis = plane.yAxis;

  const addPoint = (
    world: THREE.Vector3,
    element: IncludeElement,
    kind: "edge" | "point",
  ): string => {
    const local = world.clone().sub(origin);
    const x = local.dot(xAxis);
    const y = local.dot(yAxis);
    const key = `${Math.round(x * 1e6)}:${Math.round(y * 1e6)}`;
    const existing = pointIds.get(key);
    if (existing) return existing;
    const offset = world.clone().sub(element.position);
    const source: SketchIncludeSource | undefined = element.nodeId
      ? {
          nodeId: element.nodeId,
          kind,
          offset: { x: offset.x, y: offset.y, z: offset.z },
        }
      : undefined;
    const point: SketchPoint = {
      id: generateId("pt"),
      type: "point",
      x,
      y,
      ...(source ? { includeSource: source } : {}),
    };
    pointIds.set(key, point.id);
    points.push(point);
    return point.id;
  };

  const includeVertices = (element: IncludeElement) => {
    const vertices = element.vertexPositions;
    if (!vertices) return;
    for (let i = 0; i + 2 < vertices.length; i += 3) {
      addPoint(
        new THREE.Vector3(vertices[i]!, vertices[i + 1]!, vertices[i + 2]!),
        element,
        "point",
      );
    }
  };

  for (const element of elements) {
    includeVertices(element);
    const section = await sectioner(
      element.brep,
      element.position,
      { x: plane.origin.x, y: plane.origin.y, z: plane.origin.z },
      { x: plane.normal.x, y: plane.normal.y, z: plane.normal.z },
      element.occBrep,
      element.rotation,
    );
    const geometry = section.ok ? section.value.edgeGeometry : undefined;
    const positions = geometry?.attributes.position?.array;
    if (!positions || positions.length < 6) {
      // Imported or non-OCC bodies may have no sectionable BRep. Fall back to
      // their tessellated topological edges rather than producing nothing.
      const fallback = element.edgeGeometry?.attributes.position?.array;
      if (!fallback || fallback.length < 6) continue;
      const rotation = element.rotation ?? new THREE.Euler();
      for (let i = 0; i + 5 < fallback.length; i += 6) {
        const a = new THREE.Vector3(
          fallback[i]!,
          fallback[i + 1]!,
          fallback[i + 2]!,
        )
          .applyEuler(rotation)
          .add(element.position);
        const b = new THREE.Vector3(
          fallback[i + 3]!,
          fallback[i + 4]!,
          fallback[i + 5]!,
        )
          .applyEuler(rotation)
          .add(element.position);
        if (a.distanceTo(b) < MIN_LENGTH) continue;
        const p1Id = addPoint(a, element, "edge");
        const p2Id = addPoint(b, element, "edge");
        if (p1Id === p2Id) continue;
        primitives.push({
          id: generateId("line"),
          type: "line",
          p1Id,
          p2Id,
          ...(element.nodeId
            ? {
                includeSource: {
                  nodeId: element.nodeId,
                  kind: "edge" as const,
                  offset: { x: 0, y: 0, z: 0 },
                },
              }
            : {}),
        });
      }
      continue;
    }

    for (let i = 0; i + 5 < positions.length; i += 6) {
      const a = new THREE.Vector3(
        positions[i]!,
        positions[i + 1]!,
        positions[i + 2]!,
      );
      const b = new THREE.Vector3(
        positions[i + 3]!,
        positions[i + 4]!,
        positions[i + 5]!,
      );
      if (a.distanceTo(b) < MIN_LENGTH) continue;
      const p1Id = addPoint(a, element, "edge");
      const p2Id = addPoint(b, element, "edge");
      if (p1Id === p2Id) continue;
      primitives.push({
        id: generateId("line"),
        type: "line",
        p1Id,
        p2Id,
        ...(element.nodeId
          ? {
              includeSource: {
                nodeId: element.nodeId,
                kind: "edge" as const,
                offset: { x: 0, y: 0, z: 0 },
              },
            }
          : {}),
      });
    }
  }

  if (primitives.length === 0) {
    return {
      ok: false,
      reason: "Select a 3D body whose edges intersect this sketch plane.",
    };
  }
  return { ok: true, points, primitives };
}

/** Re-project included points after their source element moves or is undone. */
export function refreshIncludedGeometry(
  sketch: Sketch,
  elements: readonly IncludeElement[],
): Sketch {
  const byId = new Map(elements.map((element) => [element.nodeId, element]));
  let changed = false;
  const primitives = sketch.primitives.map((primitive) => {
    if (primitive.type !== "point" || !primitive.includeSource) {
      return primitive;
    }
    const element = byId.get(primitive.includeSource.nodeId);
    if (!element) return primitive;
    const offset = primitive.includeSource.offset;
    const world = new THREE.Vector3(
      element.position.x + offset.x,
      element.position.y + offset.y,
      element.position.z + offset.z,
    );
    const local = world.sub(sketch.plane.origin);
    const x = local.dot(sketch.plane.xAxis);
    const y = local.dot(sketch.plane.yAxis);
    if (Math.abs(x - primitive.x) < 1e-9 && Math.abs(y - primitive.y) < 1e-9) {
      return primitive;
    }
    changed = true;
    return { ...primitive, x, y };
  });
  return changed ? { ...sketch, primitives } : sketch;
}
