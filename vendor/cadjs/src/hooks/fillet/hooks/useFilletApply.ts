import { useCallback } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { notify } from "../../../config";
import {
  chamferBRep,
  filletBRep,
} from "../../../scene-operations/fillet-operations";
import type { FilletEdgeOverlayBag } from "./useFilletEdgeOverlay";
import type { FilletStateBag } from "./useFilletState";

interface UseFilletApplyParams {
  stateBag: FilletStateBag;
  edgeOverlay: FilletEdgeOverlayBag;
}

export function useFilletApply({
  stateBag,
  edgeOverlay,
}: UseFilletApplyParams) {
  const { elements, updateElementBrep } = useCadCore();
  const { forceSceneUpdate } = useCadVisualizer();
  const { state, setState, resetBodyHover, resetSelectedBody } = stateBag;
  const { cleanupEdgeOverlay } = edgeOverlay;

  /** Apply the fillet or chamfer operation. Branches on `state.operationType`. */
  const applyOperation = useCallback(
    async (radius: number) => {
      if (
        !state.selectedElement ||
        state.selectedEdgeIndices.length === 0 ||
        radius <= 0
      )
        return;

      const element = elements.find(
        (el) => el.nodeId === state.selectedElement,
      );
      if (!element) return;

      setState((prev) => ({ ...prev, isApplying: true }));

      try {
        const operationFn =
          state.operationType === "fillet" ? filletBRep : chamferBRep;
        const result = await operationFn(
          element.brep,
          element.position,
          state.selectedEdgeIndices,
          radius,
          element.occBrep,
          element.rotation,
        );

        if (!result.ok) {
          const opName =
            state.operationType === "fillet" ? "Fillet" : "Chamfer";
          notify(`${opName} failed: ${result.reason}`, "error");
          setState((prev) => ({ ...prev, isApplying: false }));
          return;
        }

        const value = result.value;
        const newPosition = new THREE.Vector3(
          element.position.x + value.positionOffset.x,
          element.position.y + value.positionOffset.y,
          element.position.z + value.positionOffset.z,
        );

        updateElementBrep(
          state.selectedElement,
          value.brep,
          newPosition,
          {
            type: state.operationType,
          },
          value.edgeGeometry,
          value.occBrep,
          value.faceGeometry,
          value.vertexPositions,
        );

        // Reset state after successful apply (preserve operationType toggle)
        cleanupEdgeOverlay();
        resetBodyHover();
        resetSelectedBody();
        setState({
          selectedElement: null,
          selectedEdgeIndices: [],
          hoveredEdgeIndex: null,
          radius: 0.3,
          operationType: state.operationType,
          isApplying: false,
          showDimensionInput: false,
          dimensionInputPosition: { x: 0, y: 0 },
        });

        forceSceneUpdate();
      } catch (error) {
        console.error(`[useFilletMode] ${state.operationType} failed:`, error);
        notify(
          `${state.operationType === "fillet" ? "Fillet" : "Chamfer"} failed`,
          "error",
        );
        setState((prev) => ({ ...prev, isApplying: false }));
      }
    },
    [
      state.selectedElement,
      state.selectedEdgeIndices,
      state.operationType,
      elements,
      updateElementBrep,
      cleanupEdgeOverlay,
      resetBodyHover,
      resetSelectedBody,
      forceSceneUpdate,
      setState,
    ],
  );

  return { applyOperation };
}

export type FilletApplyBag = ReturnType<typeof useFilletApply>;
