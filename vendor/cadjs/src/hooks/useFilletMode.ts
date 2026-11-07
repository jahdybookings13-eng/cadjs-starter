import { useCallback, useEffect, useRef } from "react";
import { useFilletApply } from "./fillet/hooks/useFilletApply";
import { useFilletDimensionInput } from "./fillet/hooks/useFilletDimensionInput";
import { useFilletEdgeOverlay } from "./fillet/hooks/useFilletEdgeOverlay";
import { useFilletInputHandlers } from "./fillet/hooks/useFilletInputHandlers";
import { useFilletState } from "./fillet/hooks/useFilletState";
import type { FilletOperationType } from "./fillet/types";

export type { FilletOperationType } from "./fillet/types";

export interface UseFilletModeResult {
  selectedElement: string | null;
  selectedEdgeIndices: number[];
  radius: number;
  operationType: FilletOperationType;
  isApplying: boolean;
  showDimensionInput: boolean;
  dimensionInputPosition: { x: number; y: number };
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseMove: (event: MouseEvent) => void;
  handleMouseUp: (event: MouseEvent) => void;
  handleContextMenu: (event: MouseEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleRadiusSubmit: (value: number) => Promise<void>;
  handleRadiusCancel: () => void;
  toggleOperationType: () => void;
  cleanup: () => void;
}

/**
 * Hook for fillet/chamfer mode.
 * Toggle between fillet and chamfer via F key (`operationType` field).
 *
 * Composed of five sub-hooks living under `hooks/fillet/`:
 *   - useFilletState          (state + refs + body hover + select-other preview + toggle)
 *   - useFilletEdgeOverlay    (build/update/cleanup edge overlays + selectBodyById)
 *   - useFilletApply          (applyOperation, fillet or chamfer branch)
 *   - useFilletDimensionInput (radius input UI: show/submit/cancel)
 *   - useFilletInputHandlers  (mouse + keyboard + context menu + window-resize effect)
 */
export function useFilletMode(): UseFilletModeResult {
  const stateBag = useFilletState();
  const edgeOverlay = useFilletEdgeOverlay({ stateBag });
  const apply = useFilletApply({ stateBag, edgeOverlay });
  const dimension = useFilletDimensionInput({ stateBag, apply });
  const handlers = useFilletInputHandlers({
    stateBag,
    edgeOverlay,
    apply,
    dimension,
  });

  const {
    state,
    setState,
    originalBrepRef,
    resetBodyHover,
    resetSelectedBody,
    toggleOperationType,
  } = stateBag;
  const { cleanupEdgeOverlay } = edgeOverlay;

  const cleanup = useCallback(() => {
    cleanupEdgeOverlay();
    resetBodyHover();
    resetSelectedBody();
    originalBrepRef.current = null;
    setState({
      selectedElement: null,
      selectedEdgeIndices: [],
      hoveredEdgeIndex: null,
      radius: 0.3,
      operationType: "fillet",
      isApplying: false,
      showDimensionInput: false,
      dimensionInputPosition: { x: 0, y: 0 },
    });
  }, [
    cleanupEdgeOverlay,
    resetBodyHover,
    resetSelectedBody,
    originalBrepRef,
    setState,
  ]);

  // Mode-content registry mounts this hook only while mode === "fillet", so unmount
  // == leaving the mode. Latest closure pinned via ref; unmount effect runs once.
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  useEffect(() => () => cleanupRef.current(), []);

  return {
    selectedElement: state.selectedElement,
    selectedEdgeIndices: state.selectedEdgeIndices,
    radius: state.radius,
    operationType: state.operationType,
    isApplying: state.isApplying,
    showDimensionInput: state.showDimensionInput,
    dimensionInputPosition: state.dimensionInputPosition,
    handleMouseDown: handlers.handleMouseDown,
    handleMouseMove: handlers.handleMouseMove,
    handleMouseUp: handlers.handleMouseUp,
    handleContextMenu: handlers.handleContextMenu,
    handleKeyDown: handlers.handleKeyDown,
    handleRadiusSubmit: dimension.handleRadiusSubmit,
    handleRadiusCancel: dimension.handleRadiusCancel,
    toggleOperationType,
    cleanup,
  };
}
