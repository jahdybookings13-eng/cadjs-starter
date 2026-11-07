import React, {
  createContext,
  useContext,
  useState,
  useRef,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SceneElement } from "../scene-operations/types";
import { useCadCore } from "./CoreContext";
import { disposeObject3D } from "../scene-operations/mesh-operations";
import type { SelectOtherApi } from "../hooks/useSelectOther";
import {
  createEdgeHelpers as createEdgeHelpersImpl,
  createVertexHelpers as createVertexHelpersImpl,
} from "./visualizer/helperVisualizations";
import {
  highlightElement as highlightElementImpl,
  unhighlightElement as unhighlightElementImpl,
} from "./visualizer/highlight";
import { switchProjection as switchProjectionImpl } from "./visualizer/cameraSwitch";
import { useCameraAndProjection } from "./visualizer/hooks/useCameraAndProjection";
import { useSceneAndRenderer } from "./visualizer/hooks/useSceneAndRenderer";
import { useMouseInteraction } from "./visualizer/hooks/useMouseInteraction";
import { useGroundPlane } from "./visualizer/hooks/useGroundPlane";

export type ProjectionType = "perspective" | "orthographic";

export interface CadVisualizerContextType {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | null;

  createEdgeHelpers: (element: SceneElement) => THREE.LineSegments | null;
  createVertexHelpers: (element: SceneElement) => THREE.Object3D | null;
  getMouseIntersection: (event: MouseEvent) => THREE.Vector3 | null;

  mountRenderer: (container: HTMLDivElement) => void;
  unmountRenderer: () => void;

  highlightElement: (nodeId: string) => void;
  unhighlightElement: (nodeId: string) => void;

  forceSceneUpdate: () => void;

  /** Schedule a single rAF render. Idempotent within a frame. */
  requestRender: () => void;
  /** Drive the loop continuously while `active` is true (for drag/animation). */
  setContinuousRender: (active: boolean) => void;
  /** Subscribe to canvas-container resize events. Returns an unsubscribe. */
  subscribeResize: (
    listener: (width: number, height: number) => void,
  ) => () => void;

  showGroundPlane: boolean;
  toggleGroundPlane: () => void;

  cursorPosition: THREE.Vector3 | null;
  updateCursorPosition: (event: MouseEvent) => void;
  sceneReady: boolean;

  setCameraRotationEnabled: (enabled: boolean) => void;
  setDrawingPlane: (normal: THREE.Vector3, constant?: number) => void;

  projectionType: ProjectionType;
  setProjectionType: (type: ProjectionType) => void;
  toggleProjection: () => void;

  navToolActiveRef: React.MutableRefObject<boolean>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  selectOtherRef: React.MutableRefObject<SelectOtherApi | null>;

  gridSpacing: number;
  setGridSpacing: (spacing: number) => void;
  gridSnapEnabled: boolean;
  setGridSnapEnabled: (enabled: boolean) => void;
}

export const CadVisualizerContext = createContext<
  CadVisualizerContextType | undefined
>(undefined);

export const CadVisualizerProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { elements, getObject } = useCadCore();

  // Sub-hooks own their refs/state. Provider composes them.
  const camera = useCameraAndProjection();
  const sceneAndRenderer = useSceneAndRenderer(camera);
  const mouse = useMouseInteraction(
    camera.cameraRef,
    sceneAndRenderer.rendererRef,
  );
  const groundPlane = useGroundPlane(
    sceneAndRenderer.sceneRef,
    sceneAndRenderer.sceneReady,
  );

  const [forceUpdate, setForceUpdate] = useState(0);
  const [gridSpacing, setGridSpacing] = useState(0.5);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const selectOtherRef = useRef<SelectOtherApi | null>(null);

  const forceSceneUpdate = useCallback(() => {
    setForceUpdate((prev) => prev + 1);
  }, []);

  // Projection switching needs both camera refs (from useCameraAndProjection)
  // and renderer/controls refs (from useSceneAndRenderer), so it's composed here.
  const switchProjection = useCallback(
    (newType: ProjectionType) => {
      switchProjectionImpl(
        {
          perspCameraRef: camera.perspCameraRef,
          orthoCameraRef: camera.orthoCameraRef,
          cameraRef: camera.cameraRef,
          rendererRef: sceneAndRenderer.rendererRef,
          controlsRef: sceneAndRenderer.controlsRef,
          controlsListenersRef: sceneAndRenderer.controlsListenersRef,
        },
        newType,
        camera.setProjectionTypeState,
        sceneAndRenderer.requestRender,
      );
    },
    [
      camera,
      sceneAndRenderer.rendererRef,
      sceneAndRenderer.controlsRef,
      sceneAndRenderer.controlsListenersRef,
      sceneAndRenderer.requestRender,
    ],
  );

  const setProjectionType = useCallback(
    (type: ProjectionType) => {
      switchProjection(type);
    },
    [switchProjection],
  );

  const toggleProjection = useCallback(() => {
    const current =
      camera.cameraRef.current instanceof THREE.PerspectiveCamera
        ? "perspective"
        : "orthographic";
    switchProjection(
      current === "perspective" ? "orthographic" : "perspective",
    );
  }, [switchProjection, camera.cameraRef]);

  const setCameraRotationEnabled = useCallback(
    (enabled: boolean) => {
      if (sceneAndRenderer.controlsRef.current) {
        sceneAndRenderer.controlsRef.current.enableRotate = enabled;
      }
    },
    [sceneAndRenderer.controlsRef],
  );

  const highlightElement = useCallback(
    (nodeId: string) => {
      highlightElementImpl(getObject(nodeId) ?? null);
    },
    [getObject],
  );

  const unhighlightElement = useCallback(
    (nodeId: string) => {
      const element = elements.find((el) => el.nodeId === nodeId);
      unhighlightElementImpl(
        getObject(nodeId) ?? null,
        element?.selected ?? false,
      );
    },
    [getObject, elements],
  );

  // Scene synchronization effect, keep Three.js scene in sync with core state.
  // Stays in the Provider because it's tightly bound to `elements` and the
  // multi-criteria object-removal filter.
  useEffect(() => {
    const scene = sceneAndRenderer.sceneRef.current;
    if (!scene) return;

    elements.forEach((element) => {
      const obj = getObject(element.nodeId);
      if (obj) {
        if (!scene.children.includes(obj)) {
          scene.add(obj);
        }
        if (!obj.position.equals(element.position)) {
          obj.position.copy(element.position);
        }
        if (element.rotation && !obj.rotation.equals(element.rotation)) {
          obj.rotation.copy(element.rotation);
        }
      }
    });

    const validObjects = new Set(elements.map((el) => getObject(el.nodeId)));

    const objectsToRemove = scene.children.filter((child) => {
      if (
        child instanceof THREE.Light ||
        child instanceof THREE.Camera ||
        child.type === "GridHelper" ||
        child.type === "AxesHelper" ||
        child.userData.isHelper ||
        child.userData.isPreview === true ||
        child.userData.helperType === "gizmo" ||
        child.userData.helperType === "handleType" ||
        child.userData.handleType !== undefined ||
        child.userData.isGroundPlane === true ||
        child.userData.isScadGenEcad === true ||
        child.userData.isSketchGrid === true ||
        child.userData.isSelectionPlanes === true ||
        child.userData.isOriginHelper === true ||
        child.type === "TransformControlsGizmo" ||
        child.userData.isSketchPrimitive === true ||
        child.userData.primitiveId !== undefined ||
        child.userData.isSketchObject === true ||
        child.userData.isMeasureOverlay === true ||
        child.userData.isMeasureEdgeOverlay === true ||
        child.userData.isFilletEdgeOverlay === true
      ) {
        return false;
      }

      let curr: THREE.Object3D | null = child;
      while (curr) {
        if (validObjects.has(curr)) return false;
        curr = curr.parent;
      }

      if (child.userData && child.userData.nodeId) {
        const matchingElement = elements.find(
          (el) => el.nodeId === child.userData.nodeId,
        );
        if (matchingElement) return false;
      }

      return true;
    });

    if (objectsToRemove.length > 0) {
      objectsToRemove.forEach((child) => {
        scene.remove(child);
        disposeObject3D(child);
      });
    }

    // On-demand rendering: every reconciliation triggers exactly one redraw.
    // This single line covers all `forceSceneUpdate()` callers without renaming.
    sceneAndRenderer.requestRender();
  }, [
    elements,
    getObject,
    sceneAndRenderer.sceneRef,
    sceneAndRenderer.requestRender,
    forceUpdate,
  ]);

  // Memoize the context value object so consumers don't see a fresh object
  // identity on every parent render, only when one of the listed dependencies
  // changes. Refs (`scene`, `camera`, `renderer`, `controls`) re-read `.current`
  // at memo-recompute time, so transitions like `sceneReady: false → true`
  // pick up the populated refs as expected.
  const value = useMemo<CadVisualizerContextType>(
    () => ({
      scene: sceneAndRenderer.sceneObj ?? sceneAndRenderer.sceneRef.current,
      camera: camera.cameraRef.current,
      renderer: sceneAndRenderer.rendererRef.current,
      controls: sceneAndRenderer.controlsRef.current,

      createEdgeHelpers: createEdgeHelpersImpl,
      createVertexHelpers: createVertexHelpersImpl,

      getMouseIntersection: mouse.getMouseIntersection,

      mountRenderer: sceneAndRenderer.mountRenderer,
      unmountRenderer: sceneAndRenderer.unmountRenderer,

      highlightElement,
      unhighlightElement,

      forceSceneUpdate,

      requestRender: sceneAndRenderer.requestRender,
      setContinuousRender: sceneAndRenderer.setContinuousRender,
      subscribeResize: sceneAndRenderer.subscribeResize,

      showGroundPlane: groundPlane.showGroundPlane,
      toggleGroundPlane: groundPlane.toggleGroundPlane,

      cursorPosition: mouse.cursorPosition,
      updateCursorPosition: mouse.updateCursorPosition,
      sceneReady: sceneAndRenderer.sceneReady,

      setCameraRotationEnabled,
      setDrawingPlane: mouse.setDrawingPlane,

      projectionType: camera.projectionType,
      setProjectionType,
      toggleProjection,

      navToolActiveRef: sceneAndRenderer.navToolActiveRef,
      controlsRef: sceneAndRenderer.controlsRef,
      selectOtherRef,

      gridSpacing,
      setGridSpacing,
      gridSnapEnabled,
      setGridSnapEnabled,
    }),
    [
      sceneAndRenderer.sceneObj,
      sceneAndRenderer.sceneRef,
      sceneAndRenderer.rendererRef,
      sceneAndRenderer.controlsRef,
      sceneAndRenderer.navToolActiveRef,
      sceneAndRenderer.sceneReady,
      sceneAndRenderer.mountRenderer,
      sceneAndRenderer.unmountRenderer,
      sceneAndRenderer.requestRender,
      sceneAndRenderer.setContinuousRender,
      sceneAndRenderer.subscribeResize,
      camera.cameraRef,
      camera.projectionType,
      mouse.getMouseIntersection,
      mouse.cursorPosition,
      mouse.updateCursorPosition,
      mouse.setDrawingPlane,
      highlightElement,
      unhighlightElement,
      forceSceneUpdate,
      groundPlane.showGroundPlane,
      groundPlane.toggleGroundPlane,
      setCameraRotationEnabled,
      setProjectionType,
      toggleProjection,
      gridSpacing,
      gridSnapEnabled,
    ],
  );

  return (
    <CadVisualizerContext.Provider value={value}>
      {children}
    </CadVisualizerContext.Provider>
  );
};

export const useCadVisualizer = () => {
  const context = useContext(CadVisualizerContext);
  if (!context) {
    throw new Error(
      "useCadVisualizer must be used within a CadVisualizerProvider",
    );
  }
  return context;
};
