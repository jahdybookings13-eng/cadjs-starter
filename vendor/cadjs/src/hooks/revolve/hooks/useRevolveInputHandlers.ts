import { useCallback, useMemo } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  collectPickableMeshes,
  collectPicksUnderCursor,
  makeBodyOrProfileLabel,
} from "../../../scene-operations/mesh-operations";
import { SceneElement } from "../../../scene-operations/types";
import { BODY, REVOLVE, SELECTION } from "../../../theme";
import { useRaycastToObjects } from "../../shared/useRaycastToObjects";
import { createModeInputHandlers } from "../../shared/createModeInputHandlers";
import { useModeInputHoldRefs } from "../../shared/useModeInputHoldRefs";
import { tintMeshes } from "../../shared/tintMeshes";
import { isFlatShape } from "../revolve-helpers";
import type { RevolveAxisSelection } from "./useRevolveAxisSelection";
import type { RevolveApplyBag } from "./useRevolveApply";
import type { RevolveStateBag } from "./useRevolveState";

interface UseRevolveInputHandlersParams {
  stateBag: RevolveStateBag;
  axisSelection: RevolveAxisSelection;
  apply: RevolveApplyBag;
  cleanup: () => void;
}

export function useRevolveInputHandlers({
  stateBag,
  axisSelection,
  apply,
  cleanup,
}: UseRevolveInputHandlersParams) {
  const { elements, getObject } = useCadCore();
  const { renderer, forceSceneUpdate, navToolActiveRef, selectOtherRef } =
    useCadVisualizer();
  const { raycasterFromEvent } = useRaycastToObjects();
  const {
    state,
    setState,
    hoveredElementRef,
    edgeSegmentsRef,
    edgeOverlayGroupRef,
    hoveredEdgeRef,
    sketchLineOverlayRef,
    bodyEdgeOverlayRef,
    hoverPreviewRef,
    menuOpenRef,
    resetHover,
    applyHoverPreview,
  } = stateBag;
  const {
    selectProfileById,
    removeEdgeOverlay,
    showAxisLine,
    pickExtraOverlayAxis,
    resetExtraOverlayHover,
  } = axisSelection;
  const { performRevolve } = apply;

  const profileFilter = useCallback(
    (el: SceneElement) => isFlatShape(el.brep),
    [],
  );

  const isApplyingRef = useMemo(
    () => ({ current: state.isApplying }),
    [state.isApplying],
  );
  const holdRefs = useModeInputHoldRefs<string>();

  /**
   * Factory handles SELECT_PROFILE only. SELECT_AXIS picks are inline below
   *, they have no SelectOther, no drag threshold, and overlay-priority
   * raycasting that doesn't fit the factory shape.
   */
  const factoryHandlers = useMemo(() => {
    return createModeInputHandlers<string, void>(
      {
        pickTargets: (raycaster) => {
          if (state.phase !== "SELECT_PROFILE") return null;
          const picks = collectPicksUnderCursor(
            raycaster,
            elements,
            getObject,
            {
              filter: profileFilter,
              nameFor: makeBodyOrProfileLabel(elements),
            },
          );
          if (picks.length === 0) return null;
          return { picks, resolved: picks[0]!.elementId };
        },
        hoverTargets: (raycaster) => {
          if (state.phase !== "SELECT_PROFILE") return null;
          const flatElements = elements.filter((el) => isFlatShape(el.brep));
          const meshes = collectPickableMeshes(flatElements, getObject);
          const intersects = raycaster.intersectObjects(meshes, false);
          if (intersects.length === 0) return null;
          let parentObj = intersects[0]!.object;
          while (parentObj.parent && !parentObj.userData.nodeId) {
            parentObj = parentObj.parent;
          }
          return (parentObj.userData.nodeId as string) ?? null;
        },
        onPickStart: (initial) => {
          selectProfileById(initial);
        },
        onPickFromMenu: (item, initial) => {
          menuOpenRef.current = false;
          hoverPreviewRef.current = null;
          if (item.elementId === initial) return;
          // Reset prior body color before re-selecting.
          tintMeshes(getObject, initial, BODY.default);
          removeEdgeOverlay();
          selectProfileById(item.elementId);
        },
        onHover: (nodeId) => {
          resetHover();
          if (nodeId) {
            hoveredElementRef.current = nodeId;
            tintMeshes(getObject, nodeId, BODY.hover);
            if (renderer) renderer.domElement.style.cursor = "pointer";
          } else if (renderer) {
            renderer.domElement.style.cursor = "default";
          }
          forceSceneUpdate();
          void applyHoverPreview;
          return null;
        },
        onMenuOpen: (initial) => {
          menuOpenRef.current = true;
          tintMeshes(getObject, initial, BODY.default);
        },
        onMenuCancel: (initial) => {
          menuOpenRef.current = false;
          hoverPreviewRef.current = null;
          tintMeshes(getObject, initial, SELECTION.selected);
        },
        onCancel: cleanup,
        onCommit: () => {
          if (state.phase === "SET_ANGLE") performRevolve();
        },
        enableContextMenu: state.phase === "SELECT_PROFILE",
      },
      {
        raycasterFromEvent,
        selectOtherRef,
        navToolActiveRef,
        isApplyingRef,
      },
      holdRefs,
    );
  }, [
    elements,
    getObject,
    profileFilter,
    selectProfileById,
    removeEdgeOverlay,
    resetHover,
    applyHoverPreview,
    forceSceneUpdate,
    raycasterFromEvent,
    selectOtherRef,
    navToolActiveRef,
    isApplyingRef,
    holdRefs,
    state.phase,
    renderer,
    hoveredElementRef,
    hoverPreviewRef,
    menuOpenRef,
    cleanup,
    performRevolve,
  ]);

  // ── SELECT_AXIS-phase handlers (inline; factory short-circuits in this phase) ──

  const axisModeHandleMouseDown = useCallback(
    (event: MouseEvent) => {
      if (state.phase !== "SELECT_AXIS") return;
      if (
        event.button !== 0 ||
        event.altKey ||
        navToolActiveRef.current ||
        state.isApplying
      )
        return;

      const raycaster = raycasterFromEvent(event);
      if (!raycaster) return;

      // Priority 1: profile edge overlay
      if (edgeOverlayGroupRef.current && edgeSegmentsRef.current.length > 0) {
        const intersects = raycaster.intersectObjects(
          edgeOverlayGroupRef.current.children,
          false,
        );
        if (intersects.length > 0) {
          const edgeIndex = intersects[0]!.object.userData.edgeIndex as number;
          const edgeData = edgeSegmentsRef.current.find(
            (e) => e.edgeIndex === edgeIndex,
          );
          if (!edgeData || edgeData.segments.length < 6) return;

          const start = new THREE.Vector3(
            edgeData.segments[0]!,
            edgeData.segments[1]!,
            edgeData.segments[2]!,
          );
          const lastIdx = edgeData.segments.length - 3;
          const end = new THREE.Vector3(
            edgeData.segments[lastIdx]!,
            edgeData.segments[lastIdx + 1]!,
            edgeData.segments[lastIdx + 2]!,
          );

          removeEdgeOverlay();
          showAxisLine(start, end);
          setState((prev) => ({
            ...prev,
            phase: "SET_ANGLE",
            axisEdgeStart: start,
            axisEdgeEnd: end,
            showDimensionInput: true,
            dimensionInputPosition: { x: event.clientX, y: event.clientY },
          }));
          return;
        }
      }

      // Priority 2 & 3: sketch lines and body edges
      const extraHit = pickExtraOverlayAxis(raycaster);
      if (extraHit) {
        removeEdgeOverlay();
        showAxisLine(extraHit.start, extraHit.end);
        setState((prev) => ({
          ...prev,
          phase: "SET_ANGLE",
          axisEdgeStart: extraHit.start,
          axisEdgeEnd: extraHit.end,
          showDimensionInput: true,
          dimensionInputPosition: { x: event.clientX, y: event.clientY },
        }));
      }
    },
    [
      navToolActiveRef,
      raycasterFromEvent,
      state.phase,
      state.isApplying,
      edgeOverlayGroupRef,
      edgeSegmentsRef,
      removeEdgeOverlay,
      showAxisLine,
      pickExtraOverlayAxis,
      setState,
    ],
  );

  const axisModeHandleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (state.phase !== "SELECT_AXIS") return;
      if (state.isApplying) return;

      const raycaster = raycasterFromEvent(event);
      if (!raycaster) return;

      // Reset all overlay colors to defaults
      if (edgeOverlayGroupRef.current) {
        edgeOverlayGroupRef.current.children.forEach((child) => {
          if (child instanceof Line2) {
            (child.material as LineMaterial).color.set(REVOLVE.axisLine);
          }
        });
      }
      resetExtraOverlayHover();

      let foundHover = false;

      if (edgeOverlayGroupRef.current) {
        const intersects = raycaster.intersectObjects(
          edgeOverlayGroupRef.current.children,
          false,
        );
        if (intersects.length > 0) {
          const edgeIndex = intersects[0]!.object.userData.edgeIndex as number;
          hoveredEdgeRef.current = edgeIndex;
          edgeOverlayGroupRef.current.children.forEach((child) => {
            if (
              child instanceof Line2 &&
              child.userData.edgeIndex === edgeIndex
            ) {
              (child.material as LineMaterial).color.set(REVOLVE.axisHover);
            }
          });
          foundHover = true;
        }
      }

      if (
        !foundHover &&
        sketchLineOverlayRef.current &&
        sketchLineOverlayRef.current.children.length > 0
      ) {
        const hits = raycaster.intersectObjects(
          sketchLineOverlayRef.current.children,
          false,
        );
        if (hits.length > 0) {
          ((hits[0]!.object as Line2).material as LineMaterial).color.set(
            REVOLVE.axisHover,
          );
          foundHover = true;
        }
      }

      if (
        !foundHover &&
        bodyEdgeOverlayRef.current &&
        bodyEdgeOverlayRef.current.children.length > 0
      ) {
        const hits = raycaster.intersectObjects(
          bodyEdgeOverlayRef.current.children,
          false,
        );
        if (hits.length > 0) {
          ((hits[0]!.object as Line2).material as LineMaterial).color.set(
            REVOLVE.axisHover,
          );
          foundHover = true;
        }
      }

      if (foundHover) {
        if (renderer) renderer.domElement.style.cursor = "pointer";
      } else {
        hoveredEdgeRef.current = null;
        if (renderer) renderer.domElement.style.cursor = "default";
      }
      forceSceneUpdate();
    },
    [
      raycasterFromEvent,
      state.phase,
      state.isApplying,
      edgeOverlayGroupRef,
      sketchLineOverlayRef,
      bodyEdgeOverlayRef,
      hoveredEdgeRef,
      resetExtraOverlayHover,
      forceSceneUpdate,
      renderer,
    ],
  );

  // ── Composed top-level handlers ────────────────────────────────────────────

  return useMemo(
    () => ({
      handleMouseDown: (event: MouseEvent) => {
        factoryHandlers.handleMouseDown(event);
        axisModeHandleMouseDown(event);
      },
      handleMouseMove: (event: MouseEvent) => {
        factoryHandlers.handleMouseMove(event);
        axisModeHandleMouseMove(event);
      },
      handleMouseUp: factoryHandlers.handleMouseUp,
      handleContextMenu: factoryHandlers.handleContextMenu,
      handleKeyDown: factoryHandlers.handleKeyDown,
    }),
    [factoryHandlers, axisModeHandleMouseDown, axisModeHandleMouseMove],
  );
}
