// Pure measurement primitives (distance, angle line builders).
// No Result<T>: math + Three.js construction, no failure mode.
// See ./result.ts for the policy.
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { SceneElement } from "./types";

export function disposeMeasureOverlay(obj: THREE.Object3D): void {
  obj.parent?.remove(obj);
  // Line2 extends Mesh, so the instanceof check below would match it. Handle here first.
  if (obj instanceof Line2) {
    obj.geometry.dispose();
    (obj.material as LineMaterial).dispose();
  }
  obj.traverse((child) => {
    if (child instanceof Line2) return;
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        (child.material as THREE.Material).dispose();
      }
    } else if (child instanceof THREE.Sprite) {
      (child.material as THREE.SpriteMaterial).map?.dispose();
      child.material.dispose();
    }
  });
}

export function computePointDistance(
  a: THREE.Vector3,
  b: THREE.Vector3,
): number {
  return a.distanceTo(b);
}

// Returns value in [0, 180].
export function computeAngleBetweenVectors(
  dirA: THREE.Vector3,
  dirB: THREE.Vector3,
): number {
  const dot = dirA.clone().normalize().dot(dirB.clone().normalize());
  const clamped = Math.max(-1, Math.min(1, dot));
  return Math.acos(clamped) * (180 / Math.PI);
}

/**
 * Find the nearest BRep vertex (in world space) to a given point.
 * Transforms vertices by the element's position and rotation before comparing.
 * Returns the snapped world-space position and distance, or null if none within threshold.
 */
export function findNearestVertex(
  point: THREE.Vector3,
  element: SceneElement,
  snapThreshold: number = 0.15,
): { position: THREE.Vector3; distance: number } | null {
  const brep = element.brep;
  const vertices = brep.vertices;
  if (!vertices || vertices.length === 0) return null;

  const matrix = new THREE.Matrix4();
  matrix.makeTranslation(
    element.position.x,
    element.position.y,
    element.position.z,
  );
  if (element.rotation) {
    const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(
      element.rotation,
    );
    matrix.multiply(rotMatrix);
  }

  let nearest: { position: THREE.Vector3; distance: number } | null = null;

  for (const v of vertices) {
    const worldPos = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(matrix);
    const dist = point.distanceTo(worldPos);
    if (
      dist <= snapThreshold &&
      (nearest === null || dist < nearest.distance)
    ) {
      nearest = { position: worldPos, distance: dist };
    }
  }

  return nearest;
}
