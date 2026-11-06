import * as THREE from "three";

export type SubPrimType = "face" | "edge" | "vertex";

export interface SubPrimHit {
  type: SubPrimType;
  index: number;
  position: THREE.Vector3;
  normal: THREE.Vector3 | undefined;
  object: THREE.Object3D;
  /** Mesh-local vertices of the triangle under the hit — the model layer
   *  (subPrimBridge) maps these to persistent `FID_F{i}` face tags. */
  tri?: [V3, V3, V3] | undefined;
}

type V3 = { x: number; y: number; z: number };

export interface SubPrimSelector {
  lastHit: SubPrimHit | null;
  cast: (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    scene: THREE.Scene,
    maxDistance?: number,
  ) => SubPrimHit | null;
  clearHighlight: () => void;
}

const FACE_THRESHOLD = 0.01;
const EDGE_THRESHOLD = 0.005;
const VERTEX_THRESHOLD = 0.003;

export function createSubPrimSelector(): SubPrimSelector {
  let lastHit: SubPrimHit | null = null;
  let highlightMesh: THREE.Mesh | null = null;

  const raycaster = new THREE.Raycaster();

  const cast = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    scene: THREE.Scene,
    maxDistance = 10,
  ): SubPrimHit | null => {
    raycaster.set(origin, direction);
    raycaster.far = maxDistance;

    const targets: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry && !obj.type.includes("Line")) {
        // Helper gizmos (origin markers, constraint sprites…) sit under
        // element groups and would otherwise steal hits from real faces.
        let p: THREE.Object3D | null = obj;
        let helper = false;
        while (p) {
          const ud = p.userData as Record<string, unknown>;
          if (ud.isHelper || ud.isOriginHelper || ud.originId) {
            helper = true;
            break;
          }
          p = p.parent;
        }
        if (!helper) targets.push(obj);
      }
    });

    const intersects = raycaster.intersectObjects(targets, false);

    for (const hit of intersects) {
      const mesh = hit.object as THREE.Mesh;
      if (!mesh.geometry) continue;

      let owner: THREE.Object3D | null = mesh;
      while (owner) {
        const ownerUserData = owner.userData as Record<string, unknown>;
        if (ownerUserData.id || ownerUserData.nodeId) break;
        owner = owner.parent;
      }
      if (!owner) continue;
      const userData = owner.userData as Record<string, unknown>;
      const id = userData.id ?? userData.nodeId;
      if (!id) continue;

      const geo = mesh.geometry;
      const posAttr = geo.getAttribute("position");
      if (!posAttr) continue;

      const localPoint = hit.point.clone();
      mesh.worldToLocal(localPoint);

      const tri =
        triangleFromHit(hit, posAttr as THREE.BufferAttribute) ?? undefined;

      const vertexHit = findNearestVertex(
        localPoint,
        posAttr as THREE.BufferAttribute,
        VERTEX_THRESHOLD,
      );
      if (vertexHit !== null) {
        lastHit = {
          type: "vertex",
          index: vertexHit,
          position: hit.point.clone(),
          normal: undefined,
          object: owner,
          tri,
        };
        return lastHit;
      }

      const edgeHit = findNearestEdge(
        localPoint,
        posAttr as THREE.BufferAttribute,
        geo.index as THREE.BufferAttribute | null,
        EDGE_THRESHOLD,
      );
      if (edgeHit !== null) {
        lastHit = {
          type: "edge",
          index: edgeHit,
          position: hit.point.clone(),
          normal: undefined,
          object: owner,
          tri,
        };
        return lastHit;
      }

      const faceIdx = hit.faceIndex ?? -1;
      if (faceIdx >= 0) {
        const normal = hit.face?.normal?.clone();
        if (normal) {
          normal.transformDirection(mesh.matrixWorld);
        }
        lastHit = {
          type: "face",
          index: faceIdx,
          position: hit.point.clone(),
          normal,
          object: owner,
          tri,
        };
        return lastHit;
      }
    }

    lastHit = null;
    return null;
  };

  const clearHighlight = () => {
    if (highlightMesh) {
      highlightMesh.parent?.remove(highlightMesh);
      highlightMesh.geometry.dispose();
      (highlightMesh.material as THREE.Material).dispose();
      highlightMesh = null;
    }
    lastHit = null;
  };

  return { lastHit, cast, clearHighlight };
}

function triangleFromHit(
  hit: THREE.Intersection,
  posAttr: THREE.BufferAttribute,
): [V3, V3, V3] | null {
  const fi = hit.faceIndex;
  if (fi == null || fi < 0) return null;
  const get = (v: number): V3 => ({
    x: posAttr.getX(v),
    y: posAttr.getY(v),
    z: posAttr.getZ(v),
  });
  const face = hit.face as { a: number; b: number; c: number } | null;
  if (face) return [get(face.a), get(face.b), get(face.c)];
  const idx = (hit.object as THREE.Mesh).geometry?.index;
  if (idx)
    return [
      get(idx.getX(fi * 3)),
      get(idx.getX(fi * 3 + 1)),
      get(idx.getX(fi * 3 + 2)),
    ];
  return [get(fi * 3), get(fi * 3 + 1), get(fi * 3 + 2)];
}

function findNearestVertex(
  point: THREE.Vector3,
  posAttr: THREE.BufferAttribute,
  threshold: number,
): number | null {
  let closest = -1;
  let closestDist = threshold;

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const dx = point.x - x;
    const dy = point.y - y;
    const dz = point.z - z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }
  return closest >= 0 ? closest : null;
}

function findNearestEdge(
  point: THREE.Vector3,
  posAttr: THREE.BufferAttribute,
  indexAttr: THREE.BufferAttribute | null,
  threshold: number,
): number | null {
  if (!indexAttr) return null;

  const edgeCount = indexAttr.count / 3;
  const p = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  let closestEdge = -1;
  let closestDist = threshold;

  for (let i = 0; i < edgeCount; i++) {
    const i0 = indexAttr.getX(i * 3);
    const i1 = indexAttr.getX(i * 3 + 1);
    const i2 = indexAttr.getX(i * 3 + 2);

    const edges: [number, number][] = [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ];

    for (const [va, vb] of edges) {
      a.set(posAttr.getX(va), posAttr.getY(va), posAttr.getZ(va));
      b.set(posAttr.getX(vb), posAttr.getY(vb), posAttr.getZ(vb));

      const dist = distanceToSegment(point, a, b, p);
      if (dist < closestDist) {
        closestDist = dist;
        closestEdge = i;
      }
    }
  }

  return closestEdge >= 0 ? closestEdge : null;
}

function distanceToSegment(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  closest: THREE.Vector3,
): number {
  const ab = b.clone().sub(a);
  const ap = p.clone().sub(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.dot(ab)));
  closest.copy(a).addScaledVector(ab, t);
  return p.distanceTo(closest);
}
