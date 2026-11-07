// Edge / vertex helper builders for element visualization.
// No Result<T>: pure construction, no failure mode. See ./result.ts for the policy.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { SceneElement } from "./types";
import { BODY } from "../theme";

export interface BuildElementHelpersOptions {
  edgeColor: number;
  edgeWidth: number;
  vertexColor: number;
  /** Vertex sphere radius in world units. */
  vertexRadius?: number;
  /** Corner-detection angle threshold in degrees (fallback path only). */
  cornerAngleThresholdDeg?: number;
}

/**
 * Attach edge + vertex helpers to a Three.js object representing a SceneElement.
 *
 * Two paths:
 * - **OCC path**: when `element.edgeGeometry` is present, build helpers from the
 *   precomputed clean topological edges and `element.vertexPositions` corner list.
 * - **Fallback path**: derive helpers from a child mesh via `EdgesGeometry`, with
 *   degree-based corner detection (a vertex counts as a corner if any pair of its
 *   incident edge directions deviates from collinear by more than `cornerAngleThresholdDeg`).
 *
 * Helpers are added with `userData.isHelper = true` and `userData.helperType = "edge" | "vertex"`,
 * starting hidden (`visible = false`). The function is idempotent per data source,
 * it stamps `obj.userData.helperDataKey` and skips if the key still matches the current source.
 */
export function buildElementHelpers(
  obj: THREE.Object3D,
  element: SceneElement,
  options: BuildElementHelpersOptions,
): void {
  const { edgeColor, edgeWidth, vertexColor } = options;
  const vertexRadius = options.vertexRadius ?? 0.05;
  const cornerAngleThresholdDeg = options.cornerAngleThresholdDeg ?? 25;

  const currentKey = element.edgeGeometry
    ? `occ-${element.edgeGeometry.uuid}`
    : "fallback";

  if (obj.userData.helperDataKey === currentKey) return;

  if (obj.userData.helperDataKey) {
    const toRemove: THREE.Object3D[] = [];
    obj.traverse((child) => {
      if (child.userData.isHelper) toRemove.push(child);
    });
    toRemove.forEach((child) => child.parent?.remove(child));
  }

  const sphereGeo = new THREE.SphereGeometry(vertexRadius, 16, 16);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: vertexColor,
    depthTest: false,
  });

  const buildEdgeHelper = (positions: Float32Array): LineSegments2 => {
    const lineGeo = new LineSegmentsGeometry();
    lineGeo.setPositions(positions);
    const mat = new LineMaterial({
      color: edgeColor,
      linewidth: edgeWidth,
      depthTest: false,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });
    const helper = new LineSegments2(lineGeo, mat);
    helper.renderOrder = 999;
    helper.userData.isHelper = true;
    helper.userData.helperType = "edge";
    helper.visible = false;
    return helper;
  };

  const buildVertexGroup = (): THREE.Group => {
    const group = new THREE.Group();
    group.userData.isHelper = true;
    group.userData.helperType = "vertex";
    group.visible = false;
    return group;
  };

  if (element.edgeGeometry) {
    obj.add(
      buildEdgeHelper(
        element.edgeGeometry.attributes.position!.array as Float32Array,
      ),
    );

    const vertexGroup = buildVertexGroup();
    if (element.vertexPositions !== undefined) {
      for (let i = 0; i < element.vertexPositions.length; i += 3) {
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.set(
          element.vertexPositions[i]!,
          element.vertexPositions[i + 1]!,
          element.vertexPositions[i + 2]!,
        );
        sphere.renderOrder = 1000;
        vertexGroup.add(sphere);
      }
    }
    obj.add(vertexGroup);
  } else {
    let meshGeometry: THREE.BufferGeometry | null = null;
    obj.traverse((child) => {
      if (
        (child as THREE.Mesh).isMesh &&
        !child.userData.isEdgeOverlay &&
        !child.userData.isHelper
      ) {
        meshGeometry = (child as THREE.Mesh).geometry;
      }
    });

    if (meshGeometry) {
      const edges = new THREE.EdgesGeometry(meshGeometry, BODY.edgeAngleDeg);
      const posArray = edges.attributes.position!.array as Float32Array;
      obj.add(buildEdgeHelper(posArray));
      edges.dispose();

      // A vertex is a "corner" if any pair of its incident edge directions deviates
      // from collinear by more than `cornerAngleThresholdDeg`.
      const cosThreshold = Math.cos(
        ((180 - cornerAngleThresholdDeg) * Math.PI) / 180,
      );

      const vertexDirs = new Map<
        string,
        {
          x: number;
          y: number;
          z: number;
          dirs: { dx: number; dy: number; dz: number }[];
        }
      >();
      const toKey = (x: number, y: number, z: number) =>
        `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;

      for (let i = 0; i < posArray.length; i += 6) {
        const ax = posArray[i]!,
          ay = posArray[i + 1]!,
          az = posArray[i + 2]!;
        const bx = posArray[i + 3]!,
          by = posArray[i + 4]!,
          bz = posArray[i + 5]!;
        let dx = bx - ax,
          dy = by - ay,
          dz = bz - az;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-10) continue;
        dx /= len;
        dy /= len;
        dz /= len;

        const keyA = toKey(ax, ay, az);
        if (!vertexDirs.has(keyA))
          vertexDirs.set(keyA, { x: ax, y: ay, z: az, dirs: [] });
        vertexDirs.get(keyA)!.dirs.push({ dx, dy, dz });

        const keyB = toKey(bx, by, bz);
        if (!vertexDirs.has(keyB))
          vertexDirs.set(keyB, { x: bx, y: by, z: bz, dirs: [] });
        vertexDirs.get(keyB)!.dirs.push({ dx: -dx, dy: -dy, dz: -dz });
      }

      const vertexGroup = buildVertexGroup();
      for (const [, info] of vertexDirs) {
        let isCorner = false;
        const dirs = info.dirs;
        for (let i = 0; i < dirs.length && !isCorner; i++) {
          for (let j = i + 1; j < dirs.length && !isCorner; j++) {
            const di = dirs[i]!,
              dj = dirs[j]!;
            const dot = di.dx * dj.dx + di.dy * dj.dy + di.dz * dj.dz;
            if (dot > cosThreshold) isCorner = true;
          }
        }
        if (isCorner) {
          const sphere = new THREE.Mesh(sphereGeo, sphereMat);
          sphere.position.set(info.x, info.y, info.z);
          sphere.renderOrder = 1000;
          vertexGroup.add(sphere);
        }
      }
      obj.add(vertexGroup);
    }
  }

  obj.userData.helperDataKey = currentKey;
}
