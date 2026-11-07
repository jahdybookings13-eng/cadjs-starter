import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { notify } from "../../../config";
import {
  collectPickableMeshes,
  isDescendantOf,
} from "../../../scene-operations/mesh-operations";
import { SceneElement } from "../../../scene-operations/types";
import { BODY, SELECTION } from "../../../theme";
import {
  calculateExtrusionDepthFromMouse,
  getFlatNormal,
  isFlatShape,
  normalsEqual,
  projectNormalToScreenSpace,
} from "../extrude-helpers";
import { useRaycastToObjects } from "../../shared/useRaycastToObjects";
import { createModeInputHandlers } from "../../shared/createModeInputHandlers";
import { useModeInputHoldRefs } from "../../shared/useModeInputHoldRefs";
import type { ExtrudeDirection } from "../types";
import type { ExtrudeStateBag } from "./useExtrudeState";
import type { PreviewRenderingBag } from "./usePreviewRendering";
import { EXTRUSION_MIN_DEPTH_MM } from "../../../tolerances";

interface UseExtrudeInputHandlersParams {
  stateBag: ExtrudeStateBag;
  preview: PreviewRenderingBag;
}

type ExtrudePick =
  | { kind: "arrow"; direction: "up" | "down" }
  | { kind: "profile"; elementId: string }
  | { kind: "empty" };

export function useExtrudeInputHandlers({
  stateBag,
  preview,
}: UseExtrudeInputHandlersParams) {
  const { elements, getObject } = useCadCore();
  const { camera, renderer, getMouseIntersection, navToolActiveRef } =
    useCadVisualizer();
  const { raycasterFromEvent, raycastToObjects } = useRaycastToObjects();
  const {
    state,
    setState,
    startPointRef,
    startScreenRef,
    originalBrepRef,
    arrowHandlesRef,
    hoveredElementRef,
    previewBuildVersionRef,
    tintElement,
    cleanupHandles,
    createArrowHandles,
    cleanupHoverOverlay,
  } = stateBag;
  const {
    buildCachedPreviewGeometry,
    updatePreview,
    cachedPreviewGeometryRef,
    cleanupPreview,
    restoreOriginalMesh,
  } = preview;

  // Refs pin live state for the memoized factory spec.
  const selectedElementsRef = useRef(state.selectedElements);
  selectedElementsRef.current = state.selectedElements;
  const isExtrudingRef = useRef(state.isExtruding);
  isExtrudingRef.current = state.isExtruding;
  const activeDirectionRef = useRef<ExtrudeDirection | null>(
    state.activeDirection,
  );
  activeDirectionRef.current = state.activeDirection;
  const isApplyingRef = useRef(false);
  const holdRefs = useModeInputHoldRefs<ExtrudePick>();

  const beginArrowDrag = useCallback(
    (direction: "up" | "down", event: MouseEvent) => {
      const activeDir: ExtrudeDirection = event.shiftKey
        ? "symmetric"
        : direction;

      startPointRef.current = getMouseIntersection(event);
      startScreenRef.current = { x: event.clientX, y: event.clientY };

      const selectedEls = selectedElementsRef.current
        .map((id) => elements.find((el) => el.nodeId === id))
        .filter((el): el is SceneElement => !!el);
      if (selectedEls.length === 0) return false;

      let screenPos = { x: 0, y: 0 };
      if (camera && renderer) {
        const combined = new THREE.Box3();
        selectedEls.forEach((el) => {
          const obj = getObject(el.nodeId);
          if (obj) combined.expandByObject(obj);
        });
        const center = new THREE.Vector3();
        combined.getCenter(center);
        center.project(camera);
        const rect2 = renderer.domElement.getBoundingClientRect();
        screenPos = {
          x: ((center.x + 1) / 2) * rect2.width + rect2.left,
          y: ((-center.y + 1) / 2) * rect2.height + rect2.top - 50,
        };
      }

      setState((prev) => ({
        ...prev,
        isExtruding: true,
        activeDirection: activeDir,
        extrusionDepth: 1.0,
        showDimensionInput: true,
        dimensionInputPosition: screenPos,
      }));

      // Store original BReps and build per-profile OCC preview geometry.
      originalBrepRef.current.clear();
      cachedPreviewGeometryRef.current.clear();
      selectedEls.forEach((el) => {
        originalBrepRef.current.set(el.nodeId, el.brep);
      });

      const buildVersion = ++previewBuildVersionRef.current;
      void Promise.all(
        selectedEls.map(async (el) => {
          const geom = await buildCachedPreviewGeometry(el.brep, el);
          if (previewBuildVersionRef.current !== buildVersion) return;
          if (geom) cachedPreviewGeometryRef.current.set(el.nodeId, geom);
        }),
      ).then(() => {
        if (previewBuildVersionRef.current !== buildVersion) return;
        if (originalBrepRef.current.size === 0) return;
        updatePreview(1.0, activeDir);
      });
      return true;
    },
    [
      elements,
      getObject,
      getMouseIntersection,
      camera,
      renderer,
      startPointRef,
      startScreenRef,
      setState,
      originalBrepRef,
      cachedPreviewGeometryRef,
      previewBuildVersionRef,
      buildCachedPreviewGeometry,
      updatePreview,
    ],
  );

  const handleProfilePick = useCallback(
    (el: SceneElement, event: MouseEvent) => {
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      const already = selectedElementsRef.current.includes(el.nodeId);

      if (additive && already) {
        tintElement(el.nodeId, BODY.default);
        const newSelection = selectedElementsRef.current.filter(
          (id) => id !== el.nodeId,
        );
        setState((prev) => ({
          ...prev,
          selectedElements: newSelection,
          showDimensionInput: false,
        }));
        if (newSelection.length === 0) cleanupHandles();
        else createArrowHandles(newSelection);
      } else if (additive && !already) {
        const firstId = selectedElementsRef.current[0];
        if (firstId) {
          const firstEl = elements.find((e) => e.nodeId === firstId);
          const candNormal = getFlatNormal(el.brep, el);
          const firstNormal = firstEl
            ? getFlatNormal(firstEl.brep, firstEl)
            : null;
          if (firstNormal && !normalsEqual(candNormal, firstNormal)) {
            notify("All selected profiles must share the same normal", "error");
            return;
          }
        }
        tintElement(el.nodeId, SELECTION.selected);
        const newSelection = [...selectedElementsRef.current, el.nodeId];
        setState((prev) => ({
          ...prev,
          selectedElements: newSelection,
          showDimensionInput: false,
        }));
        createArrowHandles(newSelection);
      } else {
        selectedElementsRef.current.forEach((id) =>
          tintElement(id, BODY.default),
        );
        tintElement(el.nodeId, SELECTION.selected);
        setState((prev) => ({
          ...prev,
          selectedElements: [el.nodeId],
          showDimensionInput: false,
        }));
        createArrowHandles([el.nodeId]);
      }
    },
    [elements, tintElement, setState, cleanupHandles, createArrowHandles],
  );

  const handleEmptyPick = useCallback(() => {
    selectedElementsRef.current.forEach((id) => tintElement(id, BODY.default));
    setState((prev) => ({
      ...prev,
      selectedElements: [],
      showDimensionInput: false,
    }));
    cleanupHandles();
  }, [tintElement, setState, cleanupHandles]);

  const onExtrudeDrag = useCallback(
    (event: MouseEvent) => {
      if (
        !isExtrudingRef.current ||
        !startPointRef.current ||
        !activeDirectionRef.current
      )
        return;
      if (!camera || !renderer || !startScreenRef.current) return;

      event.preventDefault();
      event.stopPropagation();

      const firstId = selectedElementsRef.current[0];
      const firstEl = firstId
        ? elements.find((el) => el.nodeId === firstId)
        : undefined;
      if (!firstEl) return;
      const normal = getFlatNormal(firstEl.brep, firstEl);

      const combined = new THREE.Box3();
      for (const id of selectedElementsRef.current) {
        const obj = getObject(id);
        if (obj) combined.expandByObject(obj);
      }
      const origin = new THREE.Vector3();
      if (combined.isEmpty()) origin.copy(firstEl.position);
      else combined.getCenter(origin);

      const { screenDir, screenDirLen } = projectNormalToScreenSpace(
        camera,
        renderer,
        origin,
        normal,
      );

      const mouseDeltaPx = new THREE.Vector2(
        event.clientX - startScreenRef.current.x,
        event.clientY - startScreenRef.current.y,
      );

      const projectedDelta = calculateExtrusionDepthFromMouse(
        screenDir,
        screenDirLen,
        mouseDeltaPx,
      );

      const dir = activeDirectionRef.current;
      let extrusionDepth: number;
      if (dir === "up")
        extrusionDepth = Math.max(EXTRUSION_MIN_DEPTH_MM, projectedDelta);
      else if (dir === "down")
        extrusionDepth = Math.max(EXTRUSION_MIN_DEPTH_MM, -projectedDelta);
      else
        extrusionDepth = Math.max(
          EXTRUSION_MIN_DEPTH_MM,
          Math.abs(projectedDelta),
        );

      // Snap to grid unless modifier-suppressed.
      if (!(event.ctrlKey || event.metaKey)) {
        extrusionDepth = Math.round(extrusionDepth * 4) / 4;
      }

      setState((prev) => ({ ...prev, extrusionDepth }));
      updatePreview(extrusionDepth, dir);
    },
    [
      camera,
      renderer,
      elements,
      getObject,
      setState,
      startPointRef,
      startScreenRef,
      updatePreview,
    ],
  );

  const onExtrudeDragEnd = useCallback(() => {
    setState((prev) => ({ ...prev, isExtruding: false }));
    startPointRef.current = null;
    startScreenRef.current = null;
  }, [setState, startPointRef, startScreenRef]);

  const handlers = useMemo(
    () =>
      createModeInputHandlers<ExtrudePick, never>(
        {
          pickTargets: (raycaster, event) => {
            // Arrow handle hits take priority over profile hits.
            const handleObjects: THREE.Object3D[] = [];
            arrowHandlesRef.current.forEach((handle) => {
              handle.traverse((child) => {
                if (child instanceof THREE.Mesh) handleObjects.push(child);
              });
            });
            const handleIntersects = raycastToObjects(event, handleObjects);
            if (handleIntersects.length > 0) {
              const handle = handleIntersects[0]!.object;
              const direction = handle.userData.direction as "up" | "down";
              return { picks: [], resolved: { kind: "arrow", direction } };
            }

            const flatElements = elements.filter(
              (el) => isFlatShape(el.brep) || el.sketchPlane,
            );
            const meshes = collectPickableMeshes(flatElements, getObject);
            const intersects = raycaster.intersectObjects(meshes, false);
            if (intersects.length === 0) {
              return { picks: [], resolved: { kind: "empty" } };
            }
            const pickedObject = intersects[0]!.object;
            for (const el of flatElements) {
              const obj = getObject(el.nodeId);
              if (obj && isDescendantOf(pickedObject, obj)) {
                return {
                  picks: [],
                  resolved: { kind: "profile", elementId: el.nodeId },
                };
              }
            }
            return { picks: [], resolved: { kind: "empty" } };
          },
          hoverTargets: (raycaster, event) => {
            // Profile hover only when not extruding and nothing selected.
            if (
              isExtrudingRef.current ||
              selectedElementsRef.current.length > 0
            )
              return null;
            const flatElements = elements.filter(
              (el) => isFlatShape(el.brep) || el.sketchPlane,
            );
            const meshes = collectPickableMeshes(flatElements, getObject);
            const intersects = raycastToObjects(event, meshes, false);
            if (intersects.length === 0) return null;
            const pickedObject = intersects[0]!.object;
            for (const el of flatElements) {
              const obj = getObject(el.nodeId);
              if (obj && isDescendantOf(pickedObject, obj)) {
                return { kind: "profile", elementId: el.nodeId };
              }
            }
            return null;
          },
          onPickStart: (resolved, _picks, event) => {
            if (resolved.kind === "arrow") {
              beginArrowDrag(resolved.direction, event);
              return;
            }
            if (resolved.kind === "profile") {
              const el = elements.find((e) => e.nodeId === resolved.elementId);
              if (el) handleProfilePick(el, event);
              return;
            }
            handleEmptyPick();
          },
          onPickFromMenu: () => {
            // Extrude does not use Select Other.
          },
          onHover: (resolved) => {
            if (!resolved || resolved.kind !== "profile") {
              if (hoveredElementRef.current) cleanupHoverOverlay();
              return null;
            }
            const foundId = resolved.elementId;
            if (foundId !== hoveredElementRef.current) {
              cleanupHoverOverlay();
              hoveredElementRef.current = foundId;
              const obj = getObject(foundId);
              if (obj) {
                obj.traverse((child) => {
                  if (
                    child instanceof THREE.Mesh &&
                    !child.userData.isEdgeOverlay
                  ) {
                    (child.material as THREE.MeshStandardMaterial).color.set(
                      SELECTION.hover,
                    );
                  }
                });
              }
            }
            return null;
          },
          onCancel: () => {
            previewBuildVersionRef.current++;
            setState((prev) => {
              prev.selectedElements.forEach((id) =>
                tintElement(id, BODY.default),
              );
              return {
                ...prev,
                isExtruding: false,
                showDimensionInput: false,
                activeDirection: null,
                extrusionDepth: 0,
                selectedElements: [],
              };
            });
            cleanupHandles();
            cleanupPreview();
            restoreOriginalMesh();
            originalBrepRef.current.clear();
            cachedPreviewGeometryRef.current.clear();
          },
          onDragStart: (resolved) => resolved.kind === "arrow",
          onDrag: onExtrudeDrag,
          onDragEnd: onExtrudeDragEnd,
        },
        {
          raycasterFromEvent,
          // Extrude opts out of Select Other; pick is single-best.
          selectOtherRef: undefined,
          navToolActiveRef,
          isApplyingRef,
        },
        holdRefs,
      ),
    [
      elements,
      getObject,
      raycasterFromEvent,
      raycastToObjects,
      navToolActiveRef,
      arrowHandlesRef,
      hoveredElementRef,
      beginArrowDrag,
      handleProfilePick,
      handleEmptyPick,
      onExtrudeDrag,
      onExtrudeDragEnd,
      tintElement,
      cleanupHandles,
      cleanupHoverOverlay,
      cleanupPreview,
      restoreOriginalMesh,
      originalBrepRef,
      cachedPreviewGeometryRef,
      previewBuildVersionRef,
      setState,
      holdRefs,
    ],
  );

  return {
    handleMouseDown: handlers.handleMouseDown,
    handleMouseMove: handlers.handleMouseMove,
    handleMouseUp: handlers.handleMouseUp,
    handleKeyDown: handlers.handleKeyDown,
  };
}
