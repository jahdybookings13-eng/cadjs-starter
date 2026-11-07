import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ProjectionType } from "../../VisualizerContext";

export interface CameraAndProjectionApi {
  perspCameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  orthoCameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
  projectionType: ProjectionType;
  setProjectionTypeState: React.Dispatch<React.SetStateAction<ProjectionType>>;
}

/**
 * Owns camera refs + projection state. Refs are populated by
 * `useSceneAndRenderer.mountRenderer` (via `initSceneObjects()`), so they
 * start as null and get filled at mount time. The `switchProjection` callback
 * is composed by the Provider since it needs both camera and renderer/controls
 * refs (the latter live in `useSceneAndRenderer`).
 */
export function useCameraAndProjection(): CameraAndProjectionApi {
  const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const [projectionType, setProjectionTypeState] =
    useState<ProjectionType>("perspective");

  // Memoize so the API object has stable identity across renders. Refs and
  // the state setter are already stable; only `projectionType` changes. Without
  // this, downstream useCallbacks that close over `camera` (e.g.
  // `switchProjection`) get a fresh identity every render and ripple instability
  // into every effect that depends on them.
  return useMemo(
    () => ({
      perspCameraRef,
      orthoCameraRef,
      cameraRef,
      projectionType,
      setProjectionTypeState,
    }),
    [projectionType],
  );
}
