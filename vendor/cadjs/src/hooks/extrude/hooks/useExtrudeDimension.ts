import { useCallback } from "react";
import { useCadCore } from "../../../contexts/CoreContext";
import { BODY } from "../../../theme";
import type { ExtrudeApplyBag } from "./useExtrudeApply";
import type { ExtrudeStateBag } from "./useExtrudeState";
import type { PreviewRenderingBag } from "./usePreviewRendering";

interface UseExtrudeDimensionParams {
  stateBag: ExtrudeStateBag;
  preview: PreviewRenderingBag;
  apply: ExtrudeApplyBag;
}

export function useExtrudeDimension({
  stateBag,
  preview,
  apply,
}: UseExtrudeDimensionParams) {
  const { elements } = useCadCore();
  const { state, setState, originalBrepRef, tintElement, cleanupHandles } =
    stateBag;
  const {
    cleanupPreview,
    restoreOriginalMesh,
    updatePreview,
    cachedPreviewGeometryRef,
  } = preview;
  const { applyExtrusion, applyCutExtrusion } = apply;

  /** Submit dimension input, applies the extrusion via the appropriate path. */
  const handleDimensionSubmit = useCallback(
    async (value: number) => {
      if (value > 0 && state.selectedElements.length > 0) {
        // Ensure originalBrepRef is populated (e.g. if user typed before dragging)
        for (const id of state.selectedElements) {
          if (originalBrepRef.current.has(id)) continue;
          const element = elements.find((el) => el.nodeId === id);
          if (element) originalBrepRef.current.set(id, element.brep);
        }

        cleanupPreview();
        restoreOriginalMesh();

        if (state.operationType === "cut") {
          await applyCutExtrusion(value, state.activeDirection || "up");
        } else {
          await applyExtrusion(value, state.activeDirection || "up");
        }
      }

      state.selectedElements.forEach((id) => tintElement(id, BODY.default));
      setState((prev) => ({
        ...prev,
        showDimensionInput: false,
        activeDirection: null,
        extrusionDepth: 0,
        selectedElements: [],
      }));

      cleanupHandles();
    },
    [
      state.selectedElements,
      state.activeDirection,
      state.operationType,
      elements,
      originalBrepRef,
      applyExtrusion,
      applyCutExtrusion,
      cleanupHandles,
      cleanupPreview,
      restoreOriginalMesh,
      tintElement,
      setState,
    ],
  );

  /** Live dimension change, updates preview in real-time. */
  const handleDimensionChange = useCallback(
    (value: number) => {
      if (state.selectedElements.length === 0 || !state.activeDirection) return;
      setState((prev) => ({ ...prev, extrusionDepth: value }));
      updatePreview(value, state.activeDirection);
    },
    [state.selectedElements, state.activeDirection, updatePreview, setState],
  );

  /** Cancel dimension input, restores original state. */
  const handleDimensionCancel = useCallback(() => {
    cleanupPreview();
    restoreOriginalMesh();

    setState((prev) => ({
      ...prev,
      showDimensionInput: false,
      isExtruding: false,
      activeDirection: null,
      extrusionDepth: 0,
    }));

    originalBrepRef.current.clear();
    cachedPreviewGeometryRef.current.clear();
  }, [
    cleanupPreview,
    restoreOriginalMesh,
    setState,
    originalBrepRef,
    cachedPreviewGeometryRef,
  ]);

  return {
    handleDimensionSubmit,
    handleDimensionChange,
    handleDimensionCancel,
  };
}

export type ExtrudeDimensionBag = ReturnType<typeof useExtrudeDimension>;
