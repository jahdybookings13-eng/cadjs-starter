/**
 * Utilities for reconstructing THREE.js objects from worker results.
 * Used on the main thread to convert raw typed arrays back to BufferGeometry.
 */

import * as THREE from "three";

/**
 * Reconstruct a THREE.BufferGeometry for face rendering from raw arrays.
 */
export function reconstructFaceGeometry(data: {
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
}): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(data.positions, 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Reconstruct a THREE.BufferGeometry for edge LineSegments rendering.
 */
export function reconstructEdgeGeometry(
  positions: Float32Array,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Walk an object tree and collect all ArrayBuffers for zero-copy transfer.
 * Handles Float32Array, Uint32Array, Uint8Array, Int32Array, etc.
 */
export function collectTransferables(obj: unknown): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();

  function walk(value: unknown): void {
    if (value === null || value === undefined) return;

    if (ArrayBuffer.isView(value)) {
      buffers.add(value.buffer as ArrayBuffer);
      return;
    }

    if (value instanceof ArrayBuffer) {
      buffers.add(value);
      return;
    }

    if (typeof value === "object") {
      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item);
        }
      } else {
        for (const key of Object.keys(value as Record<string, unknown>)) {
          walk((value as Record<string, unknown>)[key]);
        }
      }
    }
  }

  walk(obj);
  return Array.from(buffers);
}
