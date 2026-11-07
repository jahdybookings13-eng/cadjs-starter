import * as THREE from "three";
import { Brep } from "../../geometry";
import { SceneElement } from "../../scene-operations/types";
import { flatAxis } from "../../scene-operations/brep-utils";

export { isFlat as isFlatShape } from "../../scene-operations/brep-utils";

const NORMAL_TOLERANCE = 1e-3;

export function normalsEqual(a: THREE.Vector3, b: THREE.Vector3): boolean {
  return (
    Math.abs(a.x - b.x) < NORMAL_TOLERANCE &&
    Math.abs(a.y - b.y) < NORMAL_TOLERANCE &&
    Math.abs(a.z - b.z) < NORMAL_TOLERANCE
  );
}

/**
 * Get the normal direction of a flat BRep (the axis it's flat along).
 * If `element` carries a sketchPlane, uses that normal directly.
 * Otherwise falls back to detecting the flat axis from vertex ranges.
 */
export function getFlatNormal(
  brep: Brep,
  element?: SceneElement,
): THREE.Vector3 {
  if (element?.sketchPlane) {
    return element.sketchPlane.normal.clone();
  }
  switch (flatAxis(brep)) {
    case "x":
      return new THREE.Vector3(1, 0, 0);
    case "y":
      return new THREE.Vector3(0, 1, 0);
    default:
      return new THREE.Vector3(0, 0, 1);
  }
}

/**
 * Build a single arrow handle (shaft cylinder + head cone) as a THREE.Group.
 * Caller adds it to the scene and tracks it in the arrowHandlesRef.
 */
export function buildArrowGeometry(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  shaftRadius: number,
  headRadius: number,
  headLength: number,
  color: number,
  opacity: number,
  handleDirection: "up" | "down",
): THREE.Group {
  const group = new THREE.Group();
  group.userData.handleType = "extrudeArrow";
  group.userData.direction = handleDirection;

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
  });

  const shaftLength = length - headLength;
  const shaftGeometry = new THREE.CylinderGeometry(
    shaftRadius,
    shaftRadius,
    shaftLength,
    16,
  );
  const shaft = new THREE.Mesh(shaftGeometry, material);
  shaft.userData.handleType = "extrudeArrow";
  shaft.userData.direction = handleDirection;

  shaft.position.copy(direction.clone().multiplyScalar(shaftLength / 2));

  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  shaft.quaternion.copy(quaternion);

  group.add(shaft);

  const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 16);
  const head = new THREE.Mesh(headGeometry, material);
  head.userData.handleType = "extrudeArrow";
  head.userData.direction = handleDirection;

  head.position.copy(
    direction.clone().multiplyScalar(shaftLength + headLength / 2),
  );
  head.quaternion.copy(quaternion);

  group.add(head);

  group.position.copy(origin);

  return group;
}

/**
 * Build the directional scale matrix M = I + (s-1)(n⊗n) with translation `offset`,
 * applied to a unit-extrusion mesh to scale it along `normal` by factor `s` while
 * leaving the orthogonal directions untouched.
 */
export function buildDirectionalScaleMatrix(
  normal: THREE.Vector3,
  s: number,
  offset: { x: number; y: number; z: number },
): THREE.Matrix4 {
  const nx = normal.x,
    ny = normal.y,
    nz = normal.z;
  const f = s - 1;
  const m = new THREE.Matrix4();
  m.set(
    1 + f * nx * nx,
    f * nx * ny,
    f * nx * nz,
    offset.x,
    f * ny * nx,
    1 + f * ny * ny,
    f * ny * nz,
    offset.y,
    f * nz * nx,
    f * nz * ny,
    1 + f * nz * nz,
    offset.z,
    0,
    0,
    0,
    1,
  );
  return m;
}

/**
 * Project a normal vector to screen-space pixel direction at the given world origin.
 * Returns the screen-space direction vector (px) and its length.
 */
export function projectNormalToScreenSpace(
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  origin: THREE.Vector3,
  normal: THREE.Vector3,
): { screenDir: THREE.Vector2; screenDirLen: number } {
  const normalEnd = origin.clone().add(normal);
  const rect = renderer.domElement.getBoundingClientRect();
  const originNDC = origin.clone().project(camera);
  const normalEndNDC = normalEnd.clone().project(camera);
  const screenDir = new THREE.Vector2(
    ((normalEndNDC.x - originNDC.x) * rect.width) / 2,
    (-(normalEndNDC.y - originNDC.y) * rect.height) / 2,
  );
  return { screenDir, screenDirLen: screenDir.length() };
}

/**
 * Convert a mouse pixel delta into projected extrusion depth along the screen-space
 * normal direction. When the normal points roughly at the camera (screenDirLen < 1),
 * falls back to vertical mouse movement.
 */
export function calculateExtrusionDepthFromMouse(
  screenDir: THREE.Vector2,
  screenDirLen: number,
  mouseDeltaPx: THREE.Vector2,
): number {
  if (screenDirLen < 1) {
    return -mouseDeltaPx.y * 0.02;
  }
  const screenDirNorm = screenDir.clone().normalize();
  const pixelDist = mouseDeltaPx.dot(screenDirNorm);
  return pixelDist / screenDirLen;
}
