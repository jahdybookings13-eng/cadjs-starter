import { useCallback } from "react";
import * as THREE from "three";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import type { FilletApplyBag } from "./useFilletApply";
import type { FilletStateBag } from "./useFilletState";

interface UseFilletDimensionInputParams {
  stateBag: FilletStateBag;
  apply: FilletApplyBag;
}

export function useFilletDimensionInput({
  stateBag,
  apply,
}: UseFilletDimensionInputParams) {
  const { camera, renderer } = useCadVisualizer();
  const { setState, edgeSegmentsRef } = stateBag;
  const { applyOperation } = apply;

  /**
   * Show dimension input near the first selected edge's midpoint.
   * Edge midpoints are in world space (overlay built at world position+rotation).
   */
  const showDimensionInputAtEdge = useCallback(
    (edgeIndices: number[]) => {
      if (!camera || !renderer || edgeIndices.length === 0) return;

      const firstIdx = edgeIndices[0];
      const edgeData = edgeSegmentsRef.current.find(
        (e) => e.edgeIndex === firstIdx,
      );
      if (!edgeData) return;

      const worldPos = new THREE.Vector3(
        edgeData.midpoint.x,
        edgeData.midpoint.y,
        edgeData.midpoint.z,
      );
      worldPos.project(camera);

      const rect = renderer.domElement.getBoundingClientRect();
      const screenX = ((worldPos.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-worldPos.y + 1) / 2) * rect.height + rect.top;

      setState((prev) => ({
        ...prev,
        showDimensionInput: true,
        dimensionInputPosition: { x: screenX, y: screenY - 50 },
      }));
    },
    [camera, renderer, edgeSegmentsRef, setState],
  );

  /** Submit the dimension input, applies the operation. */
  const handleRadiusSubmit = useCallback(
    async (value: number) => {
      if (value > 0) {
        setState((prev) => ({
          ...prev,
          radius: value,
          showDimensionInput: false,
        }));
        await applyOperation(value);
      }
    },
    [applyOperation, setState],
  );

  /** Hide dimension input without applying. */
  const handleRadiusCancel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showDimensionInput: false,
    }));
  }, [setState]);

  return {
    showDimensionInputAtEdge,
    handleRadiusSubmit,
    handleRadiusCancel,
  };
}

export type FilletDimensionInputBag = ReturnType<
  typeof useFilletDimensionInput
>;
