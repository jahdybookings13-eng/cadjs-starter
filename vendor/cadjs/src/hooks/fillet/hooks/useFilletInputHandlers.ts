import { useMemo } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  collectPicksUnderCursor,
  isDescendantOf,
  makeBodyOrProfileLabel,
} from "../../../scene-operations/mesh-operations";
import { isElement3D } from "../../../scene-operations/types";
import { SELECTION } from "../../../theme";
import { useRaycastToObjects } from "../../shared/useRaycastToObjects";
import { createModeInputHandlers } from "../../shared/createModeInputHandlers";
import { useModeInputHoldRefs } from "../../shared/useModeInputHoldRefs";
import type { FilletApplyBag } from "./useFilletApply";
import type { FilletDimensionInputBag } from "./useFilletDimensionInput";
import type { FilletEdgeOverlayBag } from "./useFilletEdgeOverlay";
import type { FilletStateBag } from "./useFilletState";

interface UseFilletInputHandlersParams {
  stateBag: FilletStateBag;
  edgeOverlay: FilletEdgeOverlayBag;
  apply: FilletApplyBag;
  dimension: FilletDimensionInputBag;
}

/**
 * `TPick` discriminates the four mousedown outcomes when fillet mode is
 * active. `deselect-edges` and `deselect-all` use a synthetic 1-item picks
 * array, `useSelectOther.startHold` no-ops when `candidates.length <= 1`,
 * so SelectOther stays out of these paths.
 */
type FilletPick =
  | { kind: "edge"; edgeIndex: number; ctrlKey: boolean }
  | { kind: "body"; elementId: string }
  | { kind: "deselect-edges" }
  | { kind: "deselect-all" };

export function useFilletInputHandlers({
  stateBag,
  edgeOverlay,
  apply,
  dimension,
}: UseFilletInputHandlersParams) {
  const { elements, getObject } = useCadCore();
  const { forceSceneUpdate, navToolActiveRef, selectOtherRef } =
    useCadVisualizer();
  const { raycasterFromEvent } = useRaycastToObjects();
  const {
    state,
    setState,
    edgeOverlayGroupRef,
    hoveredBodyRef,
    hoverPreviewRef,
    menuOpenRef,
    resetBodyHover,
    resetSelectedBody,
    applyHoverPreview,
    toggleOperationType,
  } = stateBag;
  const { cleanupEdgeOverlay, updateEdgeColors, selectBodyById } = edgeOverlay;
  const { applyOperation } = apply;
  const { showDimensionInputAtEdge } = dimension;

  const isApplyingRef = useMemo(
    () => ({ current: state.isApplying }),
    [state.isApplying],
  );
  const holdRefs = useModeInputHoldRefs<FilletPick>();

  const handlers = useMemo(() => {
    return createModeInputHandlers<FilletPick, void>(
      {
        pickTargets: (raycaster, event) => {
          // Phase A: body already selected, disambiguate edge / body / empty.
          if (state.selectedElement && edgeOverlayGroupRef.current) {
            const edgeObjects: THREE.Object3D[] = [];
            edgeOverlayGroupRef.current.traverse((child) => {
              if (child instanceof Line2) edgeObjects.push(child);
            });
            const edgeIntersects = raycaster.intersectObjects(edgeObjects);
            if (edgeIntersects.length > 0) {
              const hit0 = edgeIntersects[0]!;
              const edgeIndex = hit0.object.userData.edgeIndex as number;
              return {
                picks: [
                  {
                    key: `edge-${edgeIndex}`,
                    label: `Edge ${edgeIndex}`,
                    distance: hit0.distance,
                    elementId: `edge-${edgeIndex}`,
                    object: hit0.object,
                  },
                ],
                resolved: {
                  kind: "edge",
                  edgeIndex,
                  ctrlKey: event.ctrlKey || event.metaKey,
                },
              };
            }

            // Body clicked but not edge → deselect edges only.
            const obj = getObject(state.selectedElement);
            if (obj) {
              const bodyIntersects = raycaster.intersectObjects([obj], true);
              if (bodyIntersects.length > 0) {
                return {
                  picks: [
                    {
                      key: "fillet-body-noedge",
                      label: "",
                      distance: 0,
                      elementId: "",
                      object: obj,
                    },
                  ],
                  resolved: { kind: "deselect-edges" },
                };
              }
            }

            // Empty space → deselect all.
            return {
              picks: [
                {
                  key: "fillet-empty",
                  label: "",
                  distance: 0,
                  elementId: "",
                  object: new THREE.Object3D(),
                },
              ],
              resolved: { kind: "deselect-all" },
            };
          }

          // Phase B: no body selected, pick a 3D body.
          const picks = collectPicksUnderCursor(
            raycaster,
            elements,
            getObject,
            {
              filter: isElement3D,
              nameFor: makeBodyOrProfileLabel(elements),
            },
          );
          if (picks.length === 0) return null;
          return {
            picks,
            resolved: { kind: "body", elementId: picks[0]!.elementId },
          };
        },
        hoverTargets: (raycaster) => {
          // Edge hover only when a body is selected.
          if (state.selectedElement && edgeOverlayGroupRef.current) {
            const edgeObjects: THREE.Object3D[] = [];
            edgeOverlayGroupRef.current.traverse((child) => {
              if (child instanceof Line2) edgeObjects.push(child);
            });
            const edgeIntersects = raycaster.intersectObjects(edgeObjects);
            if (edgeIntersects.length > 0) {
              const edgeIndex = edgeIntersects[0]!.object.userData
                .edgeIndex as number;
              return { kind: "edge", edgeIndex, ctrlKey: false };
            }
            return null;
          }

          // Body hover otherwise.
          const objects: THREE.Object3D[] = [];
          elements.forEach((el) => {
            if (isElement3D(el)) {
              const obj = getObject(el.nodeId);
              if (obj) objects.push(obj);
            }
          });
          const intersects = raycaster.intersectObjects(objects, true);
          if (intersects.length === 0) return null;
          const pickedObject = intersects[0]!.object;
          for (const el of elements) {
            if (!isElement3D(el)) continue;
            const obj = getObject(el.nodeId);
            if (obj && isDescendantOf(pickedObject, obj)) {
              return { kind: "body", elementId: el.nodeId };
            }
          }
          return null;
        },
        onPickStart: (resolved) => {
          if (resolved.kind === "edge") {
            const { edgeIndex, ctrlKey } = resolved;
            const newSelected = ctrlKey
              ? state.selectedEdgeIndices.includes(edgeIndex)
                ? state.selectedEdgeIndices.filter((i) => i !== edgeIndex)
                : [...state.selectedEdgeIndices, edgeIndex]
              : [edgeIndex];
            setState((prev) => ({
              ...prev,
              selectedEdgeIndices: newSelected,
              showDimensionInput: newSelected.length > 0,
            }));
            updateEdgeColors(newSelected, null);
            if (newSelected.length > 0) showDimensionInputAtEdge(newSelected);
            forceSceneUpdate();
            return;
          }
          if (resolved.kind === "body") {
            resetBodyHover();
            selectBodyById(resolved.elementId);
            return;
          }
          if (resolved.kind === "deselect-edges") {
            setState((prev) => ({
              ...prev,
              selectedEdgeIndices: [],
              showDimensionInput: false,
            }));
            return;
          }
          // deselect-all
          cleanupEdgeOverlay();
          resetSelectedBody();
          setState((prev) => ({
            ...prev,
            selectedElement: null,
            selectedEdgeIndices: [],
            hoveredEdgeIndex: null,
            showDimensionInput: false,
          }));
        },
        onPickFromMenu: (item, resolved) => {
          if (resolved.kind !== "body") return;
          menuOpenRef.current = false;
          hoverPreviewRef.current = null;
          selectBodyById(item.elementId);
        },
        onHover: (hoverPick) => {
          if (state.selectedElement) {
            // Edge hover, update overlay color.
            const newHovered =
              hoverPick?.kind === "edge" ? hoverPick.edgeIndex : null;
            if (newHovered !== state.hoveredEdgeIndex) {
              setState((prev) => ({ ...prev, hoveredEdgeIndex: newHovered }));
              updateEdgeColors(state.selectedEdgeIndices, newHovered);
              forceSceneUpdate();
            }
            return null;
          }

          // Body hover, set hover color via Three.js traverse.
          const foundId =
            hoverPick?.kind === "body" ? hoverPick.elementId : null;
          if (foundId && foundId !== hoveredBodyRef.current) {
            resetBodyHover();
            hoveredBodyRef.current = foundId;
            const obj = getObject(foundId);
            if (obj) {
              obj.traverse((child) => {
                if (
                  child instanceof THREE.Mesh &&
                  !child.userData.isEdgeOverlay &&
                  !child.userData.isHelper
                ) {
                  (child.material as THREE.MeshStandardMaterial).color.set(
                    SELECTION.hover,
                  );
                }
              });
            }
            forceSceneUpdate();
          } else if (!foundId && hoveredBodyRef.current) {
            resetBodyHover();
            forceSceneUpdate();
          }
          void applyHoverPreview;
          return null;
        },
        onMenuOpen: (resolved) => {
          if (resolved.kind === "body") menuOpenRef.current = true;
        },
        onMenuCancel: (resolved) => {
          if (resolved.kind === "body") {
            menuOpenRef.current = false;
            hoverPreviewRef.current = null;
          }
        },
        // Three-tier Escape (edges → body → no-op) handled via extraKeys, since
        // the factory's onCancel maps to a single behavior.
        onCancel: () => {
          if (state.isApplying) return;
          if (state.selectedEdgeIndices.length > 0) {
            setState((prev) => ({
              ...prev,
              selectedEdgeIndices: [],
              hoveredEdgeIndex: null,
              showDimensionInput: false,
            }));
            updateEdgeColors([], null);
            forceSceneUpdate();
          } else if (state.selectedElement) {
            cleanupEdgeOverlay();
            resetSelectedBody();
            setState((prev) => ({
              ...prev,
              selectedElement: null,
              selectedEdgeIndices: [],
              hoveredEdgeIndex: null,
              showDimensionInput: false,
            }));
          }
        },
        onCommit: () => {
          if (state.isApplying) return;
          if (state.selectedEdgeIndices.length > 0 && state.radius > 0) {
            applyOperation(state.radius);
          }
        },
        enableContextMenu: !state.selectedElement,
        extraKeys: {
          f: (event) => {
            if ((event.target as HTMLElement)?.tagName === "INPUT") return;
            toggleOperationType();
          },
          F: (event) => {
            if ((event.target as HTMLElement)?.tagName === "INPUT") return;
            toggleOperationType();
          },
        },
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
    raycasterFromEvent,
    selectOtherRef,
    navToolActiveRef,
    isApplyingRef,
    holdRefs,
    state.selectedElement,
    state.selectedEdgeIndices,
    state.hoveredEdgeIndex,
    state.isApplying,
    state.radius,
    edgeOverlayGroupRef,
    hoveredBodyRef,
    hoverPreviewRef,
    menuOpenRef,
    cleanupEdgeOverlay,
    updateEdgeColors,
    showDimensionInputAtEdge,
    forceSceneUpdate,
    resetBodyHover,
    resetSelectedBody,
    selectBodyById,
    applyHoverPreview,
    toggleOperationType,
    applyOperation,
    setState,
  ]);

  return handlers;
}
