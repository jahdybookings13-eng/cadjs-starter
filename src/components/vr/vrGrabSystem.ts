import * as THREE from "three";

export interface GrabState {
  heldObjectId: string | null;
  heldObjectMesh: THREE.Object3D | null;
  gripOrigin: THREE.Vector3 | null;
  gripOffset: THREE.Vector3 | null;
  initialScale: number | null;
  isTwoHandScale: boolean;
}

export interface VRGrabSystem {
  state: GrabState;
  tryGrab: (
    controllerPos: THREE.Vector3,
    controllerDir: THREE.Vector3,
    scene: THREE.Scene,
    maxDistance?: number,
  ) => string | null;
  release: () => void;
  updateHeldPosition: (
    controllerPos: THREE.Vector3,
    controllerQuat: THREE.Quaternion,
  ) => void;
  startTwoHandScale: (secondControllerPos: THREE.Vector3) => void;
  updateTwoHandScale: (secondControllerPos: THREE.Vector3) => void;
  endTwoHandScale: () => void;
  getGrabDistance: () => number;
}

const GRAB_MAX_DISTANCE = 0.5;

export function createVRGrabSystem(): VRGrabSystem {
  const state: GrabState = {
    heldObjectId: null,
    heldObjectMesh: null,
    gripOrigin: null,
    gripOffset: null,
    initialScale: null,
    isTwoHandScale: false,
  };

  let secondHandOrigin: THREE.Vector3 | null = null;
  const raycaster = new THREE.Raycaster();

  const tryGrab = (
    controllerPos: THREE.Vector3,
    controllerDir: THREE.Vector3,
    scene: THREE.Scene,
    maxDistance = GRAB_MAX_DISTANCE,
  ): string | null => {
    raycaster.set(controllerPos, controllerDir);
    raycaster.far = maxDistance;

    const intersects = raycaster.intersectObjects(scene.children, true);

    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        const userData = (obj as unknown as Record<string, unknown>)
          .userData as Record<string, unknown> | undefined;
        if (userData && typeof userData.id === "string" && userData.id) {
          state.heldObjectId = userData.id;
          state.heldObjectMesh = obj;
          state.gripOrigin = controllerPos.clone();
          state.gripOffset = obj.position.clone().sub(controllerPos);
          state.initialScale = obj.scale.x;
          return state.heldObjectId;
        }
        obj = obj.parent;
      }
    }
    return null;
  };

  const release = () => {
    state.heldObjectId = null;
    state.heldObjectMesh = null;
    state.gripOrigin = null;
    state.gripOffset = null;
    state.initialScale = null;
    state.isTwoHandScale = false;
    secondHandOrigin = null;
  };

  const updateHeldPosition = (
    controllerPos: THREE.Vector3,
    _controllerQuat: THREE.Quaternion,
  ) => {
    if (!state.heldObjectMesh || !state.gripOffset) return;
    if (state.isTwoHandScale) return;
    state.heldObjectMesh.position.copy(controllerPos).add(state.gripOffset);
  };

  const startTwoHandScale = (secondControllerPos: THREE.Vector3) => {
    if (!state.heldObjectMesh || !state.gripOrigin) return;
    state.isTwoHandScale = true;
    secondHandOrigin = secondControllerPos.clone();
  };

  const updateTwoHandScale = (secondControllerPos: THREE.Vector3) => {
    if (
      !state.heldObjectMesh ||
      !state.gripOrigin ||
      !state.initialScale ||
      !secondHandOrigin
    )
      return;

    const originalDist = state.gripOrigin.distanceTo(secondHandOrigin);
    const currentDist =
      state.heldObjectMesh.position.distanceTo(secondControllerPos);

    if (originalDist < 0.01) return;

    const scaleRatio = currentDist / originalDist;
    const newScale = state.initialScale * scaleRatio;
    const clampedScale = Math.max(0.01, Math.min(100, newScale));
    state.heldObjectMesh.scale.setScalar(clampedScale);
  };

  const endTwoHandScale = () => {
    state.isTwoHandScale = false;
    secondHandOrigin = null;
    if (state.heldObjectMesh) {
      state.initialScale = state.heldObjectMesh.scale.x;
    }
  };

  const getGrabDistance = (): number => {
    if (!state.heldObjectMesh || !state.gripOrigin) return 0;
    return state.heldObjectMesh.position.distanceTo(state.gripOrigin);
  };

  return {
    state,
    tryGrab,
    release,
    updateHeldPosition,
    startTwoHandScale,
    updateTwoHandScale,
    endTwoHandScale,
    getGrabDistance,
  };
}
