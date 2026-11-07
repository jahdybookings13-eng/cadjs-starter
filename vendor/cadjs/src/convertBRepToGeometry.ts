import * as THREE from "three";
import { Brep, CompoundBrep, Edge, Face, Vertex } from "./geometry";
import { createMeshFromBrep } from "./scene-operations";
import { BODY } from "./theme";

/**
 * Per-Brep BufferGeometry cache. Keyed by the Brep instance so the cache
 * is invalidated automatically when the Brep is GC'd. A repeated render
 * of the same Brep, common during boolean ops, undo/redo, and mode switches
 * that re-attach existing meshes, returns the same `BufferGeometry` instance
 * instead of re-tessellating.
 *
 * Footgun: callers that mutate the returned geometry (e.g. `applyMatrix4`,
 * attribute swaps) corrupt the cache. The library's existing call sites only
 * use the geometry as a Mesh source, read-only, but a future caller that
 * mutates must clone first or call `createGeometryFromBRep(brep.faces)`
 * directly to bypass the cache.
 */
const brepGeometryCache = new WeakMap<Brep, THREE.BufferGeometry>();

/**
 * Build (or return cached) BufferGeometry for a Brep. Use this for any code
 * path where the same Brep instance may be rendered repeatedly. For one-off
 * geometry from a transient face list, call `createGeometryFromBRep(faces)`.
 */
export function getOrBuildBrepGeometry(brep: Brep): THREE.BufferGeometry {
  const cached = brepGeometryCache.get(brep);
  if (cached) return cached;
  const fresh = createGeometryFromBRep(brep.faces);
  brepGeometryCache.set(brep, fresh);
  return fresh;
}

export function createGeometryFromBRep(faces: Face[]): THREE.BufferGeometry {
  const positions: number[] = [];

  faces.forEach((face) => {
    const verts = face.vertices;

    if (verts.length < 3) {
      return;
    }

    for (let i = 1; i < verts.length - 1; i++) {
      const v0 = verts[0]!,
        vi = verts[i]!,
        vi1 = verts[i + 1]!;
      positions.push(v0.x, v0.y, v0.z);
      positions.push(vi.x, vi.y, vi.z);
      positions.push(vi1.x, vi1.y, vi1.z);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function unionBrepCompound(
  brep1: Brep,
  brep2: Brep,
  pos1?: THREE.Vector3,
  pos2?: THREE.Vector3,
  targetPos?: THREE.Vector3,
): CompoundBrep {
  const children: Brep[] = [];

  const adjustedBrep1 = transformBrepVertices(brep1, pos1, targetPos);
  const adjustedBrep2 = transformBrepVertices(brep2, pos2, targetPos);

  if (adjustedBrep1 instanceof CompoundBrep) {
    children.push(...adjustedBrep1.children);
  } else {
    children.push(adjustedBrep1);
  }

  if (adjustedBrep2 instanceof CompoundBrep) {
    children.push(...adjustedBrep2.children);
  } else {
    children.push(adjustedBrep2);
  }

  return new CompoundBrep(children);
}

export function transformBrepVertices(
  brep: Brep,
  sourcePos?: THREE.Vector3,
  targetPos?: THREE.Vector3,
  scaleMatrix?: THREE.Matrix4,
): Brep {
  if (
    (!sourcePos || !targetPos || sourcePos.equals(targetPos)) &&
    !scaleMatrix
  ) {
    return brep;
  }

  if (brep instanceof CompoundBrep) {
    return new CompoundBrep(
      brep.children.map((child) =>
        transformBrepVertices(child, sourcePos, targetPos, scaleMatrix),
      ),
    );
  }

  const offset =
    sourcePos && targetPos
      ? new THREE.Vector3().subVectors(targetPos, sourcePos)
      : new THREE.Vector3(0, 0, 0);

  const newVertices = brep.vertices.map((v) => {
    const vertex = new THREE.Vector3(v.x, v.y, v.z);

    if (scaleMatrix) {
      vertex.applyMatrix4(scaleMatrix);
    }

    vertex.add(offset);

    return new Vertex(vertex.x, vertex.y, vertex.z);
  });

  // O(1) lookup keyed by 1e-6-rounded coords replaces the prior linear scan
  // (the cube-tolerance check `vertexEqualsWithTolerance` was equivalent at
  // this rounding granularity for all real inputs).
  const indexByKey = new Map<string, number>();
  brep.vertices.forEach((v, i) => indexByKey.set(vertexKey(v), i));

  const newEdges = brep.edges.map((edge) => {
    const startIndex = indexByKey.get(vertexKey(edge.start)) ?? -1;
    const endIndex = indexByKey.get(vertexKey(edge.end)) ?? -1;

    if (startIndex === -1 || endIndex === -1) {
      throw new Error(
        `transformBrepVertices: edge endpoint not found in BRep vertex list. ` +
          `start=(${edge.start.x},${edge.start.y},${edge.start.z}) startIndex=${startIndex}, ` +
          `end=(${edge.end.x},${edge.end.y},${edge.end.z}) endIndex=${endIndex}, ` +
          `vertices.length=${brep.vertices.length}`,
      );
    }

    return new Edge(newVertices[startIndex]!, newVertices[endIndex]!);
  });

  const newFaces = brep.faces.map((face) => {
    const faceVertices = face.vertices.map((v) => {
      const index = indexByKey.get(vertexKey(v)) ?? -1;
      if (index === -1) {
        throw new Error(
          `transformBrepVertices: face vertex not found in BRep vertex list. ` +
            `vertex=(${v.x},${v.y},${v.z}), vertices.length=${brep.vertices.length}`,
        );
      }
      return newVertices[index]!;
    });
    return new Face(faceVertices);
  });

  return new Brep(newVertices, newEdges, newFaces);
}

function vertexKey(v: { x: number; y: number; z: number }): string {
  return `${Math.round(v.x * 1e6)},${Math.round(v.y * 1e6)},${Math.round(v.z * 1e6)}`;
}

export async function createMeshFromCompoundBrep(
  compoundBrep: CompoundBrep,
  material?: THREE.Material,
): Promise<THREE.Object3D> {
  try {
    const unifiedBrep = await compoundBrep.getUnifiedBRep();
    return createMeshFromBrep(unifiedBrep);
  } catch (error) {
    console.error("Error creating mesh from compound:", error);

    // fallback
    const allFaces: Face[] = [];
    compoundBrep.children.forEach((childBrep) => {
      if (childBrep.faces && childBrep.faces.length > 0) {
        allFaces.push(...childBrep.faces);
      }
    });

    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: BODY.default,
        side: THREE.DoubleSide,
        roughness: 0.6,
        metalness: 0.2,
      });
    }

    const geometry = createGeometryFromBRep(allFaces);
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }
}
