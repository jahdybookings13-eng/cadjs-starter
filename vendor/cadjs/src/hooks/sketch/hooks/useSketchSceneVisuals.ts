import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { Sketch, SketchPlane } from "../../../types/sketch-types";
import {
  SKETCH_PLANE as PLANE_THEME,
  BODY as BODY_THEME,
} from "../../../theme";

interface UseSketchSceneVisualsParams {
  activeSketch: Sketch | null;
  editingSketchId: string | null;
  cameraAnimFrameRef: React.MutableRefObject<number | null>;
  sketchHidGroundPlaneRef: React.MutableRefObject<boolean>;
  originalProjectionRef: React.MutableRefObject<
    "perspective" | "orthographic" | null
  >;
  projectionTypeRef: React.MutableRefObject<"perspective" | "orthographic">;
  vrMode?: boolean;
}

export function useSketchSceneVisuals({
  activeSketch,
  editingSketchId,
  cameraAnimFrameRef,
  sketchHidGroundPlaneRef,
  originalProjectionRef,
  projectionTypeRef,
  vrMode = false,
}: UseSketchSceneVisualsParams) {
  const { elements, getObject } = useCadCore();
  const {
    scene,
    camera,
    gridSpacing,
    controlsRef,
    showGroundPlane,
    toggleGroundPlane,
    setCameraRotationEnabled,
    setDrawingPlane,
    setProjectionType,
    requestRender,
  } = useCadVisualizer();

  // Body dimming, stores original material props for restoration
  const dimmedMaterialsRef = useRef<
    Map<string, { color: number; opacity: number; transparent: boolean }>
  >(new Map());
  // Sketch grid group reference
  const sketchGridRef = useRef<THREE.Group | null>(null);

  const dimSceneBodies = useCallback(() => {
    if (vrMode) return;
    dimmedMaterialsRef.current.clear();
    elements.forEach((el) => {
      const obj = getObject(el.nodeId);
      if (!obj) return;
      obj.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          !child.userData.isSketchPrimitive &&
          !child.userData.isEdgeOverlay
        ) {
          const mat = child.material as THREE.MeshStandardMaterial;
          const key = child.uuid;
          dimmedMaterialsRef.current.set(key, {
            color: mat.color.getHex(),
            opacity: mat.opacity,
            transparent: mat.transparent,
          });
          mat.transparent = true;
          mat.opacity = BODY_THEME.dimmedOpacity;
          mat.color.set(BODY_THEME.dimmedColor);
          mat.needsUpdate = true;
        }
        // Also dim edge overlays (LineSegments2 carries LineMaterial).
        if (child instanceof LineSegments2 && child.userData.isEdgeOverlay) {
          const mat = child.material;
          const key = child.uuid;
          dimmedMaterialsRef.current.set(key, {
            color: mat.color.getHex(),
            opacity: mat.opacity ?? 1,
            transparent: mat.transparent ?? false,
          });
          mat.transparent = true;
          mat.opacity = BODY_THEME.dimmedOpacity;
          mat.needsUpdate = true;
        }
      });
    });
    requestRender();
  }, [elements, getObject, requestRender]);

  /** Restore all dimmed bodies to their original appearance. */
  const restoreSceneBodies = useCallback(() => {
    elements.forEach((el) => {
      const obj = getObject(el.nodeId);
      if (!obj) return;
      obj.traverse((child) => {
        const key = child.uuid;
        const saved = dimmedMaterialsRef.current.get(key);
        if (!saved) return;
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.color.set(saved.color);
          mat.opacity = saved.opacity;
          mat.transparent = saved.transparent;
          mat.needsUpdate = true;
        }
        if (child instanceof LineSegments2 && child.userData.isEdgeOverlay) {
          const mat = child.material;
          mat.color.set(saved.color);
          mat.opacity = saved.opacity;
          mat.transparent = saved.transparent;
          mat.needsUpdate = true;
        }
      });
    });
    dimmedMaterialsRef.current.clear();
    requestRender();
  }, [elements, getObject, requestRender]);

  const createSketchGrid = useCallback(
    (plane: SketchPlane, gridSizeOverride?: number) => {
      if (vrMode) return;
      if (!scene) return;

      if (sketchGridRef.current) {
        scene.remove(sketchGridRef.current);
        sketchGridRef.current.traverse((obj) => {
          if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material?.dispose();
            }
          }
        });
        sketchGridRef.current = null;
      }

      const gridGroup = new THREE.Group();
      gridGroup.userData.isSketchGrid = true;

      const gridSize = gridSizeOverride ?? 20;
      const halfSize = gridSize / 2;

      const step = gridSpacing;
      // Major lines every 5 grid steps (or every 1 unit, whichever is larger)
      const majorStep = Math.max(step * 5, 1.0);

      const majorMaterial = new THREE.LineBasicMaterial({
        color: PLANE_THEME.gridMajor,
      });
      const minorMaterial = new THREE.LineBasicMaterial({
        color: PLANE_THEME.gridMinor,
      });

      const majorPoints: THREE.Vector3[] = [];
      const minorPoints: THREE.Vector3[] = [];

      for (let i = -halfSize; i <= halfSize; i += step) {
        const isMajor =
          Math.abs(i - Math.round(i / majorStep) * majorStep) < 1e-6;
        const pts = isMajor ? majorPoints : minorPoints;

        // Lines along yAxis direction
        pts.push(
          plane.origin
            .clone()
            .addScaledVector(plane.xAxis, i)
            .addScaledVector(plane.yAxis, -halfSize),
        );
        pts.push(
          plane.origin
            .clone()
            .addScaledVector(plane.xAxis, i)
            .addScaledVector(plane.yAxis, halfSize),
        );
        // Lines along xAxis direction
        pts.push(
          plane.origin
            .clone()
            .addScaledVector(plane.yAxis, i)
            .addScaledVector(plane.xAxis, -halfSize),
        );
        pts.push(
          plane.origin
            .clone()
            .addScaledVector(plane.yAxis, i)
            .addScaledVector(plane.xAxis, halfSize),
        );
      }

      if (minorPoints.length > 0) {
        const minorGeometry = new THREE.BufferGeometry().setFromPoints(
          minorPoints,
        );
        gridGroup.add(new THREE.LineSegments(minorGeometry, minorMaterial));
      }
      if (majorPoints.length > 0) {
        const majorGeometry = new THREE.BufferGeometry().setFromPoints(
          majorPoints,
        );
        gridGroup.add(new THREE.LineSegments(majorGeometry, majorMaterial));
      }

      const axisLength = Math.min(gridSize / 10, 1.0);
      const xAxisPoints = [
        plane.origin.clone(),
        plane.origin.clone().addScaledVector(plane.xAxis, axisLength),
      ];
      const yAxisPoints = [
        plane.origin.clone(),
        plane.origin.clone().addScaledVector(plane.yAxis, axisLength),
      ];
      const xAxisGeom = new THREE.BufferGeometry().setFromPoints(xAxisPoints);
      const yAxisGeom = new THREE.BufferGeometry().setFromPoints(yAxisPoints);
      const xAxisLine = new THREE.Line(
        xAxisGeom,
        new THREE.LineBasicMaterial({
          color: PLANE_THEME.xAxis,
          linewidth: 2,
          depthTest: false,
        }),
      );
      const yAxisLine = new THREE.Line(
        yAxisGeom,
        new THREE.LineBasicMaterial({
          color: PLANE_THEME.yAxis,
          linewidth: 2,
          depthTest: false,
        }),
      );
      xAxisLine.renderOrder = 999;
      yAxisLine.renderOrder = 999;
      gridGroup.add(xAxisLine);
      gridGroup.add(yAxisLine);

      scene.add(gridGroup);
      sketchGridRef.current = gridGroup;
      requestRender();
    },
    [scene, gridSpacing, requestRender],
  );

  const cleanupSketchGrid = useCallback(() => {
    if (!scene || !sketchGridRef.current) return;

    scene.remove(sketchGridRef.current);
    sketchGridRef.current.traverse((obj) => {
      if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    sketchGridRef.current = null;
    requestRender();
  }, [scene, requestRender]);

  // Rebuild grid when gridSpacing changes during active sketch
  useEffect(() => {
    if (activeSketch && sketchGridRef.current) {
      createSketchGrid(activeSketch.plane);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSpacing]);

  const orientCameraToPlane = useCallback(
    (plane: SketchPlane, onComplete?: () => void) => {
      if (vrMode || !camera) return;

      if (cameraAnimFrameRef.current !== null) {
        cancelAnimationFrame(cameraAnimFrameRef.current);
        cameraAnimFrameRef.current = null;
      }

      const controls = controlsRef.current;
      const distance = 15;
      const duration = 500;

      const targetPosition = plane.origin
        .clone()
        .addScaledVector(plane.normal, distance);
      const targetUp = plane.yAxis.clone();
      const lookAtTarget = plane.origin.clone();

      const startPosition = camera.position.clone();
      const startUp = camera.up.clone();
      const startControlsTarget = controls
        ? controls.target.clone()
        : new THREE.Vector3();
      const startTime = Date.now();

      const animateCamera = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);

        camera.position.lerpVectors(startPosition, targetPosition, eased);
        camera.up.lerpVectors(startUp, targetUp, eased);
        if (controls) {
          controls.target.lerpVectors(startControlsTarget, lookAtTarget, eased);
          controls.update();
        }
        camera.lookAt(lookAtTarget);

        if (t < 1) {
          cameraAnimFrameRef.current = requestAnimationFrame(animateCamera);
        } else {
          cameraAnimFrameRef.current = null;
          onComplete?.();
        }
      };

      cameraAnimFrameRef.current = requestAnimationFrame(animateCamera);
    },
    [camera, controlsRef, cameraAnimFrameRef],
  );

  useEffect(() => {
    if (!editingSketchId || !activeSketch || vrMode) return;

    // Reconstruct Vector3 instances, structuredClone in editSketch strips prototypes
    const plane: SketchPlane = {
      ...activeSketch.plane,
      origin: new THREE.Vector3(
        activeSketch.plane.origin.x,
        activeSketch.plane.origin.y,
        activeSketch.plane.origin.z,
      ),
      normal: new THREE.Vector3(
        activeSketch.plane.normal.x,
        activeSketch.plane.normal.y,
        activeSketch.plane.normal.z,
      ),
      xAxis: new THREE.Vector3(
        activeSketch.plane.xAxis.x,
        activeSketch.plane.xAxis.y,
        activeSketch.plane.xAxis.z,
      ),
      yAxis: new THREE.Vector3(
        activeSketch.plane.yAxis.x,
        activeSketch.plane.yAxis.y,
        activeSketch.plane.yAxis.z,
      ),
    };

    if (showGroundPlane) {
      toggleGroundPlane();
      sketchHidGroundPlaneRef.current = true;
    }

    setCameraRotationEnabled(false);

    originalProjectionRef.current = projectionTypeRef.current;

    dimSceneBodies();

    const planeConstant = -plane.normal.dot(plane.origin);
    setDrawingPlane(plane.normal, planeConstant);

    orientCameraToPlane(plane, () => {
      if (projectionTypeRef.current !== "orthographic") {
        setProjectionType("orthographic");
      }
    });

    const isFacePlane = plane.type === "face";
    createSketchGrid(plane, isFacePlane ? 10 : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSketchId]);

  return {
    dimSceneBodies,
    restoreSceneBodies,
    createSketchGrid,
    cleanupSketchGrid,
    orientCameraToPlane,
  };
}
