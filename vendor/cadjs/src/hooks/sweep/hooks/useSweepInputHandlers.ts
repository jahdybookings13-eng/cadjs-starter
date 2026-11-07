import { useCallback, useMemo } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  collectPickableMeshes,
  collectPicksUnderCursor,
  isDescendantOf,
  makeBodyOrProfileLabel,
} from "../../../scene-operations/mesh-operations";
import { SceneElement } from "../../../scene-operations/types";
import { BODY, SELECTION } from "../../../theme";
import { useRaycastToObjects } from "../../shared/useRaycastToObjects";
import { createModeInputHandlers } from "../../shared/createModeInputHandlers";
import { useModeInputHoldRefs } from "../../shared/useModeInputHoldRefs";
import { isFlatShape } from "../sweep-helpers";
import type { SweepApplyBag } from "./useSweepApply";
import type { SweepStateBag } from "./useSweepState";

interface UseSweepInputHandlersParams {
  stateBag: SweepStateBag;
  apply: SweepApplyBag;
  cleanup: () => void;
}

/**
 * `TPick` carries the resolved value for the active phase. SELECT_PROFILE
 * and SELECT_PATH each emit a different tag; READY short-circuits via
 * `pickTargets` returning null.
 */
type SweepPick =
  | { kind: "profile"; elementId: string }
  | { kind: "path"; elementId: string };

export function useSweepInputHandlers({
  stateBag,
  apply,
  cleanup,
}: UseSweepInputHandlersParams) {
  const { elements, getObject } = useCadCore();
  const { forceSceneUpdate, navToolActiveRef, selectOtherRef } =
    useCadVisualizer();
  const { raycasterFromEvent } = useRaycastToObjects();
  const {
    state,
    setState,
    hoveredId,
    setHoveredId,
    hoverPreviewRef,
    menuOpenRef,
    resetHover,
    highlightSelected,
    selectProfileById,
    applyHoverPreview,
  } = stateBag;
  const { performSweep, canSweep } = apply;

  const profileFilter = useCallback(
    (el: SceneElement) => el.elementType !== "path" && isFlatShape(el.brep),
    [],
  );

  const isApplyingRef = useMemo(
    () => ({ current: state.isApplying }),
    [state.isApplying],
  );
  const holdRefs = useModeInputHoldRefs<SweepPick>();

  return useMemo(() => {
    return createModeInputHandlers<SweepPick, void>(
      {
        pickTargets: (raycaster) => {
          if (state.phase === "READY") return null;

          if (state.phase === "SELECT_PROFILE") {
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
            return {
              picks,
              resolved: { kind: "profile", elementId: picks[0]!.elementId },
            };
          }

          // SELECT_PATH, pick line geometry directly. Paths are line objects;
          // occlusion isn't meaningful, so no SelectOther menu (we still return
          // picks for the API contract; the factory will start a hold but it
          // doesn't matter, there's nothing meaningful for the menu to show).
          const meshes = collectPickableMeshes(elements, getObject);
          const allObjects: THREE.Object3D[] = [...meshes];
          elements.forEach((el) => {
            if (el.elementType === "path") {
              const obj = getObject(el.nodeId);
              if (obj) {
                obj.traverse((child) => {
                  if (child instanceof THREE.Line) allObjects.push(child);
                });
              }
            }
          });

          const intersects = raycaster.intersectObjects(allObjects, false);
          if (intersects.length === 0) return null;

          const pickedObject = intersects[0]!.object;
          for (const el of elements) {
            const obj = getObject(el.nodeId);
            if (!obj || !isDescendantOf(pickedObject, obj)) continue;
            if (el.elementType !== "path" || !el.pathData) continue;
            // Synthesize a single-element picks list to satisfy the factory contract.
            return {
              picks: [
                {
                  key: el.nodeId,
                  label: el.nodeId,
                  distance: intersects[0]!.distance,
                  elementId: el.nodeId,
                  object: obj,
                },
              ],
              resolved: { kind: "path", elementId: el.nodeId },
            };
          }
          return null;
        },
        hoverTargets: (raycaster) => {
          if (state.phase === "READY") return null;

          const allObjects: THREE.Object3D[] = [];
          elements.forEach((el) => {
            const obj = getObject(el.nodeId);
            if (!obj) return;
            obj.traverse((child) => {
              if (
                child instanceof THREE.Mesh &&
                !child.userData.isEdgeOverlay &&
                !child.userData.isHelper
              ) {
                allObjects.push(child);
              }
              if (child instanceof THREE.Line && child.userData.isPathLine) {
                allObjects.push(child);
              }
            });
          });

          const intersects = raycaster.intersectObjects(allObjects, false);
          if (intersects.length === 0) return null;

          const pickedObject = intersects[0]!.object;
          for (const el of elements) {
            const obj = getObject(el.nodeId);
            if (obj && isDescendantOf(pickedObject, obj)) {
              if (
                state.phase === "SELECT_PROFILE" &&
                el.elementType !== "path" &&
                isFlatShape(el.brep)
              ) {
                return { kind: "profile", elementId: el.nodeId };
              }
              if (state.phase === "SELECT_PATH" && el.elementType === "path") {
                return { kind: "path", elementId: el.nodeId };
              }
              return null;
            }
          }
          return null;
        },
        onPickStart: (resolved) => {
          if (resolved.kind === "profile") {
            selectProfileById(resolved.elementId);
          } else {
            // SELECT_PATH commit is immediate (no SelectOther menu meaningful).
            resetHover();
            highlightSelected(resolved.elementId, SELECTION.selected);
            setState((prev) => ({
              ...prev,
              phase: "READY",
              selectedPath: resolved.elementId,
            }));
          }
        },
        onPickFromMenu: (item, resolved) => {
          menuOpenRef.current = false;
          hoverPreviewRef.current = null;
          if (resolved.kind === "profile") {
            selectProfileById(item.elementId);
          }
        },
        onHover: (hoverPick) => {
          const foundId = hoverPick?.elementId ?? null;
          if (
            foundId &&
            foundId !== hoveredId &&
            foundId !== state.selectedProfile &&
            foundId !== state.selectedPath
          ) {
            resetHover();
            setHoveredId(foundId);
            highlightSelected(foundId, SELECTION.hover);
            forceSceneUpdate();
          } else if (!foundId && hoveredId) {
            resetHover();
            forceSceneUpdate();
          }
          void applyHoverPreview;
          return null;
        },
        onMenuOpen: (resolved) => {
          if (resolved.kind === "profile") {
            menuOpenRef.current = true;
            highlightSelected(resolved.elementId, BODY.default);
          }
        },
        onMenuCancel: (resolved) => {
          if (resolved.kind === "profile") {
            menuOpenRef.current = false;
            hoverPreviewRef.current = null;
            highlightSelected(
              state.selectedProfile ?? resolved.elementId,
              SELECTION.selected,
            );
          }
        },
        onCancel: () => {
          // Original behavior: only reset in SELECT_PATH/READY (SELECT_PROFILE
          // has nothing to undo).
          if (state.phase === "READY" || state.phase === "SELECT_PATH") {
            cleanup();
          }
        },
        onCommit: () => {
          if (canSweep) performSweep();
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
    applyHoverPreview,
    highlightSelected,
    resetHover,
    forceSceneUpdate,
    raycasterFromEvent,
    selectOtherRef,
    navToolActiveRef,
    isApplyingRef,
    holdRefs,
    state.phase,
    state.selectedProfile,
    state.selectedPath,
    setState,
    hoveredId,
    setHoveredId,
    hoverPreviewRef,
    menuOpenRef,
    cleanup,
    canSweep,
    performSweep,
  ]);
}
