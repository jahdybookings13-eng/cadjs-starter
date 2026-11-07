import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { Brep } from "../../../geometry";
import { SceneElement } from "../../../scene-operations/types";
import { BODY, EXTRUDE, SELECTION } from "../../../theme";
import { tintMeshes } from "../../shared/tintMeshes";
import {
  buildArrowGeometry,
  getFlatNormal,
  isFlatShape,
} from "../extrude-helpers";
import type { ExtrudeOperationType, ExtrudeState } from "../types";

export function useExtrudeState() {
  const { elements, getObject } = useCadCore();
  const { scene, forceSceneUpdate } = useCadVisualizer();

  const [state, setState] = useState<ExtrudeState>({
    selectedElements: [],
    isExtruding: false,
    activeDirection: null,
    extrusionDepth: 0,
    showDimensionInput: false,
    dimensionInputPosition: { x: 0, y: 0 },
    operationType: "join",
  });

  const startPointRef = useRef<THREE.Vector3 | null>(null);
  const startScreenRef = useRef<{ x: number; y: number } | null>(null);
  const originalBrepRef = useRef<Map<string, Brep>>(new Map());
  const arrowHandlesRef = useRef<THREE.Object3D[]>([]);
  const originalMeshRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const hoveredElementRef = useRef<string | null>(null);
  const hoverOverlayRef = useRef<THREE.Mesh | null>(null);
  // Map<materialUUID, restoreCallback>. Closure captures the material reference,
  // so restore points back at the actual material we modified, even if Three.js
  // swaps a mesh's material between dim and restore.
  const dimmedMaterialsRef = useRef<Map<string, () => void>>(new Map());
  // Bumped whenever a preview build starts or is cancelled. Async geometry-build
  // promises capture the current version and bail if it has moved on.
  const previewBuildVersionRef = useRef(0);

  // Live mirror of selected ids for cleanupHoverOverlay, without it the
  // overlay teardown would tint a selected profile back to BODY.default after
  // the cursor moves off, losing its highlight while state still says selected.
  const selectedElementsRef = useRef(state.selectedElements);
  selectedElementsRef.current = state.selectedElements;

  // Dim 3D bodies so flat profiles stand out (Fusion 360-style).
  const dimSceneBodies = useCallback(() => {
    elements.forEach((el) => {
      if (isFlatShape(el.brep) || el.sketchPlane) return;
      const obj = getObject(el.nodeId);
      if (!obj) return;
      obj.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          !child.userData.isEdgeOverlay &&
          !child.userData.isHelper
        ) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (dimmedMaterialsRef.current.has(mat.uuid)) return;
          const savedColor = mat.color.getHex();
          const savedOpacity = mat.opacity;
          const savedTransparent = mat.transparent;
          dimmedMaterialsRef.current.set(mat.uuid, () => {
            mat.color.set(savedColor);
            mat.opacity = savedOpacity;
            mat.transparent = savedTransparent;
            mat.polygonOffset = false;
            mat.polygonOffsetFactor = 0;
            mat.polygonOffsetUnits = 0;
            mat.needsUpdate = true;
          });
          mat.transparent = true;
          mat.opacity = BODY.dimmedOpacity;
          mat.color.set(BODY.dimmedColor);
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = 1;
          mat.polygonOffsetUnits = 1;
          mat.needsUpdate = true;
        }
        if (child.userData.isEdgeOverlay) {
          const mat = (child as THREE.Mesh).material as THREE.Material & {
            color?: THREE.Color;
            opacity?: number;
            transparent?: boolean;
            polygonOffset?: boolean;
            polygonOffsetFactor?: number;
            polygonOffsetUnits?: number;
          };
          if (!mat || dimmedMaterialsRef.current.has(mat.uuid)) return;
          const savedColor = (mat.color?.getHex() as number) ?? 0xffffff;
          const savedOpacity = mat.opacity ?? 1;
          const savedTransparent = mat.transparent ?? false;
          dimmedMaterialsRef.current.set(mat.uuid, () => {
            mat.color?.set(savedColor);
            mat.opacity = savedOpacity;
            mat.transparent = savedTransparent;
            mat.polygonOffset = false;
            mat.polygonOffsetFactor = 0;
            mat.polygonOffsetUnits = 0;
            mat.needsUpdate = true;
          });
          mat.transparent = true;
          mat.opacity = BODY.dimmedOpacity;
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = 1;
          mat.polygonOffsetUnits = 1;
          mat.needsUpdate = true;
        }
      });
    });
  }, [elements, getObject]);

  const restoreSceneBodies = useCallback(() => {
    dimmedMaterialsRef.current.forEach((restore) => restore());
    dimmedMaterialsRef.current.clear();
  }, []);

  const tintElement = useCallback(
    (nodeId: string, color: number) => tintMeshes(getObject, nodeId, color),
    [getObject],
  );

  const cleanupHandles = useCallback(() => {
    if (scene) {
      arrowHandlesRef.current.forEach((handle) => {
        scene.remove(handle);
        handle.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      });
      arrowHandlesRef.current = [];
    }
  }, [scene]);

  // Pass `opType` to override state.operationType, avoids stale-state reads during toggle.
  const createArrowHandles = useCallback(
    (nodeIds: string[], opType?: ExtrudeOperationType) => {
      if (!scene) return;
      cleanupHandles();
      if (nodeIds.length === 0) return;

      const selectedEls = nodeIds
        .map((id) => elements.find((el) => el.nodeId === id))
        .filter((el): el is SceneElement => !!el);
      if (selectedEls.length === 0) return;

      const bbox = new THREE.Box3();
      for (const el of selectedEls) {
        const obj = getObject(el.nodeId);
        if (obj) bbox.expandByObject(obj);
      }
      if (bbox.isEmpty()) return;
      const center = new THREE.Vector3();
      bbox.getCenter(center);

      const arrowLength = 1.5;
      const shaftRadius = 0.04;
      const headRadius = 0.12;
      const headLength = 0.3;

      const firstEl = selectedEls[0]!;
      const normal = getFlatNormal(firstEl.brep, firstEl);

      const effectiveOpType = opType ?? state.operationType;
      const isCut = effectiveOpType === "cut";
      const primaryColor = isCut ? EXTRUDE.cutArrow : EXTRUDE.arrow;
      const secondaryColor = isCut
        ? EXTRUDE.cutArrowSecondary
        : EXTRUDE.arrowSecondary;
      const upOpacity = isCut ? 0.5 : 1.0;
      const downOpacity = isCut ? 1.0 : 0.5;

      const upArrow = buildArrowGeometry(
        center,
        normal.clone(),
        arrowLength,
        shaftRadius,
        headRadius,
        headLength,
        primaryColor,
        upOpacity,
        "up",
      );
      scene.add(upArrow);
      arrowHandlesRef.current.push(upArrow);

      const downArrow = buildArrowGeometry(
        center,
        normal.clone().negate(),
        arrowLength,
        shaftRadius,
        headRadius,
        headLength,
        secondaryColor,
        downOpacity,
        "down",
      );
      scene.add(downArrow);
      arrowHandlesRef.current.push(downArrow);

      forceSceneUpdate();
    },
    [
      elements,
      getObject,
      scene,
      forceSceneUpdate,
      cleanupHandles,
      state.operationType,
    ],
  );

  const toggleOperationType = useCallback(() => {
    const newType: ExtrudeOperationType =
      state.operationType === "join" ? "cut" : "join";
    setState((prev) => ({ ...prev, operationType: newType }));
    if (state.selectedElements.length > 0) {
      createArrowHandles(state.selectedElements, newType);
    }
  }, [state.operationType, state.selectedElements, createArrowHandles]);

  const cleanupHoverOverlay = useCallback(() => {
    if (scene && hoverOverlayRef.current) {
      scene.remove(hoverOverlayRef.current);
      hoverOverlayRef.current.geometry.dispose();
      (hoverOverlayRef.current.material as THREE.Material).dispose();
      hoverOverlayRef.current = null;
    }
    if (hoveredElementRef.current) {
      const id = hoveredElementRef.current;
      const restore = selectedElementsRef.current.includes(id)
        ? SELECTION.selected
        : BODY.default;
      tintMeshes(getObject, id, restore);
      hoveredElementRef.current = null;
    }
  }, [scene, getObject]);

  return {
    state,
    setState,
    startPointRef,
    startScreenRef,
    originalBrepRef,
    arrowHandlesRef,
    originalMeshRef,
    hoveredElementRef,
    hoverOverlayRef,
    dimmedMaterialsRef,
    previewBuildVersionRef,
    dimSceneBodies,
    restoreSceneBodies,
    tintElement,
    cleanupHandles,
    createArrowHandles,
    toggleOperationType,
    cleanupHoverOverlay,
  };
}

export type ExtrudeStateBag = ReturnType<typeof useExtrudeState>;
