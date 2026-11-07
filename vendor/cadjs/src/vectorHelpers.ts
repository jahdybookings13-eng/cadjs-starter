import type { Camera, Euler, Vector3, WebGLRenderer } from "three";
import type { Vec3, EulerJSON } from "./workers/occ-worker-types";

/**
 * Strip a Vector3-shaped value (THREE.Vector3 or our Vertex class) to a
 * plain Vec3, needed when shipping data across the OCC Web Worker boundary
 * or serializing for import/export.
 */
export function toVec3(v: { x: number; y: number; z: number }): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

/** Serialize a THREE.Euler to a JSON-safe EulerJSON. */
export function toEulerJSON(e: Euler): EulerJSON {
  return { x: e.x, y: e.y, z: e.z, order: e.order };
}

/** Negate a Vec3 (returns a new object). */
export function negateVec3(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z };
}

/** Euclidean distance between two 3D points. */
export function distance3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Project a world-space point to screen pixel coordinates relative to the renderer's
 * canvas (already offset by the bounding rect, pass directly to absolute-positioned
 * DOM overlays). Mutates `worldPos` (it ends up in NDC); pass a clone if you need the
 * original.
 */
export function worldToScreen(
  worldPos: Vector3,
  camera: Camera,
  renderer: WebGLRenderer,
): { x: number; y: number } {
  worldPos.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: ((worldPos.x + 1) / 2) * rect.width + rect.left,
    y: ((-worldPos.y + 1) / 2) * rect.height + rect.top,
  };
}
