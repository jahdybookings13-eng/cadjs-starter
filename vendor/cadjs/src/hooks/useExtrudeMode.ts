import { useCadCore } from "../contexts/CoreContext";
import { BODY } from "../theme";
import { useExtrudeApply } from "./extrude/hooks/useExtrudeApply";
import { useExtrudeDimension } from "./extrude/hooks/useExtrudeDimension";
import { useExtrudeInputHandlers } from "./extrude/hooks/useExtrudeInputHandlers";
import { useExtrudeState } from "./extrude/hooks/useExtrudeState";
import { usePreviewRendering } from "./extrude/hooks/usePreviewRendering";
import { useModeCleanup } from "./shared/useModeCleanup";
import type { ExtrudeDirection, ExtrudeOperationType } from "./extrude/types";

export interface UseExtrudeModeResult {
  selectedElements: string[];
  isExtruding: boolean;
  extrusionDepth: number;
  activeDirection: ExtrudeDirection | null;
  showDimensionInput: boolean;
  dimensionInputPosition: { x: number; y: number };
  operationType: ExtrudeOperationType;
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseMove: (event: MouseEvent) => void;
  handleMouseUp: (event: MouseEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleDimensionSubmit: (value: number) => Promise<void>;
  handleDimensionCancel: () => void;
  handleDimensionChange: (value: number) => void;
  toggleOperationType: () => void;
  cleanup: () => void;
  dimSceneBodies: () => void;
}

/**
 * Hook for Fusion 360-style extrude mode.
 * Allows selecting flat shapes and extruding them with arrow handles.
 *
 * Composed of five sub-hooks living under `hooks/extrude/`:
 *   - useExtrudeState         (state + selection refs + dimming + arrow handles)
 *   - usePreviewRendering     (OCC preview cache + live mesh updates)
 *   - useExtrudeApply         (commit: applyExtrusion / applyCutExtrusion)
 *   - useExtrudeDimension     (dimension input UI handlers)
 *   - useExtrudeInputHandlers (mouse + keyboard handlers)
 */
export function useExtrudeMode(): UseExtrudeModeResult {
  const { mode } = useCadCore();
  const stateBag = useExtrudeState();
  const preview = usePreviewRendering({ stateBag });
  const apply = useExtrudeApply({ stateBag, preview });
  const dimension = useExtrudeDimension({ stateBag, preview, apply });
  const handlers = useExtrudeInputHandlers({ stateBag, preview });

  const {
    state,
    setState,
    startPointRef,
    startScreenRef,
    originalBrepRef,
    tintElement,
    cleanupHandles,
    restoreSceneBodies,
    cleanupHoverOverlay,
    toggleOperationType,
    dimSceneBodies,
  } = stateBag;
  const { cleanupPreview, restoreOriginalMesh, cachedPreviewGeometryRef } =
    preview;

  const { cleanup } = useModeCleanup(mode, "extrude", () => {
    setState((prev) => {
      prev.selectedElements.forEach((id) => tintElement(id, BODY.default));
      return prev;
    });
    cleanupHandles();
    cleanupPreview();
    cleanupHoverOverlay();
    restoreOriginalMesh();
    restoreSceneBodies();
    originalBrepRef.current.clear();
    cachedPreviewGeometryRef.current.clear();
    setState((prev) => ({
      selectedElements: [],
      isExtruding: false,
      activeDirection: null,
      extrusionDepth: 0,
      showDimensionInput: false,
      dimensionInputPosition: { x: 0, y: 0 },
      operationType: prev.operationType, // preserve toggle across cleanup
    }));
    startPointRef.current = null;
    startScreenRef.current = null;
  });

  return {
    selectedElements: state.selectedElements,
    isExtruding: state.isExtruding,
    extrusionDepth: state.extrusionDepth,
    activeDirection: state.activeDirection,
    showDimensionInput: state.showDimensionInput,
    dimensionInputPosition: state.dimensionInputPosition,
    operationType: state.operationType,
    handleMouseDown: handlers.handleMouseDown,
    handleMouseMove: handlers.handleMouseMove,
    handleMouseUp: handlers.handleMouseUp,
    handleKeyDown: handlers.handleKeyDown,
    handleDimensionSubmit: dimension.handleDimensionSubmit,
    handleDimensionCancel: dimension.handleDimensionCancel,
    handleDimensionChange: dimension.handleDimensionChange,
    toggleOperationType,
    cleanup,
    dimSceneBodies,
  };
}

export type { ExtrudeDirection, ExtrudeOperationType } from "./extrude/types";
