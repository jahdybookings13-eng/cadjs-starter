import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { initSceneObjects } from "../initScene";
import { disposeObject3D } from "../../../scene-operations/mesh-operations";
import type { CameraAndProjectionApi } from "./useCameraAndProjection";

export type ResizeListener = (width: number, height: number) => void;

/**
 * Wires the on-demand render trio (`change`/`start`/`end`) onto an OrbitControls.
 * `switchProjection` rebuilds OrbitControls when toggling perspective/orthographic;
 * without re-attaching these listeners on the new instance, camera input stops
 * scheduling renders and the canvas freezes until something else (resize,
 * `elements` mutation) requests a frame.
 */
export interface ControlsListeners {
  attach: (controls: OrbitControls) => void;
  detach: (controls: OrbitControls) => void;
}

export interface SceneAndRendererApi {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  cleanupRef: React.MutableRefObject<(() => void) | null>;
  navToolActiveRef: React.MutableRefObject<boolean>;
  controlsListenersRef: React.MutableRefObject<ControlsListeners | null>;
  scene: THREE.Scene | null;
  sceneObj: THREE.Scene | null;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | null;
  sceneReady: boolean;
  mountRenderer: (container: HTMLDivElement) => void;
  unmountRenderer: () => void;
  requestRender: () => void;
  setContinuousRender: (active: boolean) => void;
  subscribeResize: (listener: ResizeListener) => () => void;
}

/**
 * Owns the scene/renderer/controls refs and the mount/unmount lifecycle.
 * Calls into `useCameraAndProjection` for camera ref ownership; this hook
 * populates those refs at mount time via `initSceneObjects()`.
 *
 * Rendering is on-demand: a `requestRender()` schedules at most one rAF.
 * OrbitControls `change`/`start`/`end` keep the canvas in sync during user
 * input; `setContinuousRender(true)` forces a continuous loop while a
 * TransformControls drag or camera animation is in flight.
 */
export function useSceneAndRenderer(
  camera: CameraAndProjectionApi,
): SceneAndRendererApi {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const navToolActiveRef = useRef<boolean>(false);
  const controlsListenersRef = useRef<ControlsListeners | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneObj, setSceneObj] = useState<THREE.Scene | null>(null);

  // Render-loop state. Live for the lifetime of the hook so the stable wrappers
  // below can dispatch into the most recent mount-time function.
  const requestRenderImplRef = useRef<(() => void) | null>(null);
  const setContinuousImplRef = useRef<((active: boolean) => void) | null>(null);
  const resizeListenersRef = useRef<Set<ResizeListener>>(new Set());

  const requestRender = useCallback(() => {
    requestRenderImplRef.current?.();
  }, []);

  const setContinuousRender = useCallback((active: boolean) => {
    setContinuousImplRef.current?.(active);
  }, []);

  const subscribeResize = useCallback(
    (listener: ResizeListener): (() => void) => {
      resizeListenersRef.current.add(listener);
      return () => {
        resizeListenersRef.current.delete(listener);
      };
    },
    [],
  );

  const mountRenderer = useCallback(
    (container: HTMLDivElement) => {
      containerRef.current = container;

      const initialWidth = container.clientWidth || window.innerWidth;
      const initialHeight = container.clientHeight || window.innerHeight;

      const { scene, perspCamera, orthoCamera, renderer, bgTexture } =
        initSceneObjects(initialWidth, initialHeight);
      sceneRef.current = scene;
      setSceneObj(scene);
      camera.perspCameraRef.current = perspCamera;
      camera.orthoCameraRef.current = orthoCamera;
      camera.cameraRef.current = perspCamera; // perspective is default
      rendererRef.current = renderer;

      if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
        (
          window as unknown as {
            __cadScene?: THREE.Scene;
            __cadCamera?: THREE.Camera;
          }
        ).__cadScene = scene;
        (
          window as unknown as {
            __cadScene?: THREE.Scene;
            __cadCamera?: THREE.Camera;
          }
        ).__cadCamera = perspCamera;
      }

      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(perspCamera, renderer.domElement);
      controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.RIGHT,
      };
      controls.enableZoom = true;
      controls.enableRotate = true;
      controls.enablePan = true;
      controls.listenToKeyEvents(window);
      controlsRef.current = controls;

      // On-demand render scheduler. `renderPending` collapses bursts; `continuousActive`
      // keeps a loop alive during TransformControls drag or camera animation. If
      // OrbitControls.enableDamping is ever turned on, the start/end bracket plus
      // the `change` listener below are what keep frames flowing through the settle.
      let renderPending = false;
      let continuousActive = false;
      // Per-mount closure (not useRef): under React StrictMode the mount effect
      // double-invokes, and a hook-level ref would be shared across both mount
      // instances, the second mount could overwrite the first's id before its
      // cleanup runs. The closure is per-invocation so each cleanup cancels its
      // own frame.
      let rafId: number | null = null;

      const renderFrame = () => {
        rafId = null;
        renderPending = false;
        controlsRef.current?.update();
        if (camera.cameraRef.current) {
          renderer.render(scene, camera.cameraRef.current);
        }
        if (continuousActive) requestRenderInternal();
      };

      const requestRenderInternal = () => {
        if (renderPending) return;
        renderPending = true;
        rafId = requestAnimationFrame(renderFrame);
      };

      const setContinuousInternal = (active: boolean) => {
        continuousActive = active;
        if (active) requestRenderInternal();
      };

      requestRenderImplRef.current = requestRenderInternal;
      setContinuousImplRef.current = setContinuousInternal;

      const onControlsChange = () => requestRenderInternal();
      const onControlsStart = () => setContinuousInternal(true);
      const onControlsEnd = () => setContinuousInternal(false);
      const attachControlsListeners = (c: OrbitControls) => {
        c.addEventListener("change", onControlsChange);
        c.addEventListener("start", onControlsStart);
        c.addEventListener("end", onControlsEnd);
      };
      const detachControlsListeners = (c: OrbitControls) => {
        c.removeEventListener("change", onControlsChange);
        c.removeEventListener("start", onControlsStart);
        c.removeEventListener("end", onControlsEnd);
      };
      attachControlsListeners(controls);
      controlsListenersRef.current = {
        attach: attachControlsListeners,
        detach: detachControlsListeners,
      };

      // Initial paint
      requestRenderInternal();

      // Alt+Left-click orbit: remap LEFT button while Alt is held
      const handleAltKeyDown = (e: KeyboardEvent) => {
        if (
          e.key === "Alt" &&
          controlsRef.current &&
          !navToolActiveRef.current
        ) {
          controlsRef.current.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
          renderer.domElement.style.cursor = "grab";
        }
      };
      const handleAltKeyUp = (e: KeyboardEvent) => {
        if (
          e.key === "Alt" &&
          controlsRef.current &&
          !navToolActiveRef.current
        ) {
          // OrbitControls disables a button by assigning null, but its .d.ts declares
          // LEFT as `MOUSE` (no null). The runtime accepts null; the cast is the only
          // way to express "disabled" without patching three's types.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          controlsRef.current.mouseButtons.LEFT = null as any;
          renderer.domElement.style.cursor = "";
        }
      };
      const handleWindowBlur = () => {
        if (controlsRef.current && !navToolActiveRef.current) {
          // OrbitControls disables a button by assigning null, but its .d.ts declares
          // LEFT as `MOUSE` (no null). The runtime accepts null; the cast is the only
          // way to express "disabled" without patching three's types.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          controlsRef.current.mouseButtons.LEFT = null as any;
          renderer.domElement.style.cursor = "";
        }
      };
      window.addEventListener("keydown", handleAltKeyDown);
      window.addEventListener("keyup", handleAltKeyUp);
      window.addEventListener("blur", handleWindowBlur);

      setSceneReady(true);

      const handleResize = (width: number, height: number) => {
        if (width <= 0 || height <= 0) return;
        const aspect = width / height;
        if (camera.perspCameraRef.current) {
          camera.perspCameraRef.current.aspect = aspect;
          camera.perspCameraRef.current.updateProjectionMatrix();
        }
        if (
          camera.cameraRef.current instanceof THREE.OrthographicCamera &&
          camera.orthoCameraRef.current &&
          controlsRef.current &&
          camera.perspCameraRef.current
        ) {
          const dist = camera.orthoCameraRef.current.position.distanceTo(
            controlsRef.current.target,
          );
          const fov = (camera.perspCameraRef.current.fov * Math.PI) / 180;
          const hh = dist * Math.tan(fov / 2);
          camera.orthoCameraRef.current.left = -hh * aspect;
          camera.orthoCameraRef.current.right = hh * aspect;
          camera.orthoCameraRef.current.top = hh;
          camera.orthoCameraRef.current.bottom = -hh;
          camera.orthoCameraRef.current.updateProjectionMatrix();
        }
        renderer.setSize(width, height);

        // Sync LineMaterial.resolution for every Line2 in the scene. Line2 widths
        // are in CSS pixels; resolution must match (the GLSL formula assumes the
        // same unit on both sides). Lines added later either set their own
        // resolution at creation or get fixed up on the next resize tick.
        scene.traverse((obj) => {
          if (obj instanceof Line2) {
            const mat = obj.material;
            if (mat instanceof LineMaterial) {
              mat.resolution.set(width, height);
            }
          }
        });

        resizeListenersRef.current.forEach((listener) => {
          listener(width, height);
        });

        requestRenderInternal();
      };

      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const cr = entry.contentRect;
        handleResize(cr.width, cr.height);
      });
      ro.observe(container);

      // Run an initial pass so Line2 resolution is set before the observer's
      // first async tick (the sizes were already passed into initSceneObjects,
      // but no traversal happened yet).
      handleResize(initialWidth, initialHeight);

      cleanupRef.current = () => {
        // Stop the render loop first so subsequent steps don't race a frame.
        continuousActive = false;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        ro.disconnect();
        if (controlsRef.current) detachControlsListeners(controlsRef.current);
        window.removeEventListener("keydown", handleAltKeyDown);
        window.removeEventListener("keyup", handleAltKeyUp);
        window.removeEventListener("blur", handleWindowBlur);
        controlsRef.current?.dispose();
        controlsRef.current = null;
        controlsListenersRef.current = null;
        requestRenderImplRef.current = null;
        setContinuousImplRef.current = null;

        // Free GPU resources held by every mesh/line still parented to the scene.
        disposeObject3D(scene);
        // The gradient background CanvasTexture is owned by the scene but not
        // disposed by `disposeObject3D` (it's not on a material).
        bgTexture.dispose();
        scene.background = null;

        if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
          const w = window as unknown as {
            __cadScene?: THREE.Scene;
            __cadCamera?: THREE.Camera;
          };
          delete w.__cadScene;
          delete w.__cadCamera;
        }

        if (
          containerRef.current &&
          renderer.domElement.parentNode === containerRef.current
        ) {
          containerRef.current.removeChild(renderer.domElement);
        }

        // forceContextLoss() must run before dispose(), it uses
        // WEBGL_lose_context to release the GL context immediately while
        // three's internal handles are still valid; dispose() then flushes
        // three's caches against the now-lost context (PR mrdoob/three.js#17588).
        renderer.forceContextLoss();
        renderer.dispose();

        sceneRef.current = null;
        setSceneObj(null);
        rendererRef.current = null;
      };
    },
    [camera],
  );

  const unmountRenderer = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  return {
    sceneRef,
    rendererRef,
    controlsRef,
    containerRef,
    cleanupRef,
    navToolActiveRef,
    controlsListenersRef,
    scene: sceneObj,
    sceneObj,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    sceneReady,
    mountRenderer,
    unmountRenderer,
    requestRender,
    setContinuousRender,
    subscribeResize,
  };
}
