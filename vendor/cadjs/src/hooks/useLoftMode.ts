import { useCadCore } from "../contexts/CoreContext";
import { BODY } from "../theme";
import { useLoftApply } from "./loft/hooks/useLoftApply";
import { useLoftInputHandlers } from "./loft/hooks/useLoftInputHandlers";
import { useLoftState } from "./loft/hooks/useLoftState";
import { tintMeshes } from "./shared/tintMeshes";
import { useModeCleanup } from "./shared/useModeCleanup";

export interface UseLoftModeResult {
  selectedProfiles: string[];
  isApplying: boolean;
  isRuled: boolean;
  setIsRuled: (isRuled: boolean) => void;
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseMove: (event: MouseEvent) => void;
  handleMouseUp: (event: MouseEvent) => void;
  handleContextMenu: (event: MouseEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  performLoft: () => Promise<void>;
  canLoft: boolean;
  cleanup: () => void;
}

/**
 * Hook for Fusion 360-style loft mode.
 * Select 2+ flat profiles in order → creates smooth blended solid.
 *
 * Composed of three sub-hooks living under `hooks/loft/`:
 *   - useLoftState         (state + refs + setters + hover + select-other preview + snapshot rollback)
 *   - useLoftApply         (performLoft + canLoft)
 *   - useLoftInputHandlers (mouse + keyboard + context menu)
 */
export function useLoftMode(): UseLoftModeResult {
  const { getObject, mode } = useCadCore();

  const stateBag = useLoftState();
  const apply = useLoftApply({ stateBag });

  const { state, setState, resetHover, setIsRuled } = stateBag;

  const { cleanup } = useModeCleanup(mode, "loft", () => {
    resetHover();
    for (const nodeId of state.selectedProfiles) {
      tintMeshes(getObject, nodeId, BODY.default);
    }
    setState((prev) => ({
      ...prev,
      selectedProfiles: [],
      isApplying: false,
    }));
  });

  const handlers = useLoftInputHandlers({ stateBag, apply, cleanup });

  return {
    selectedProfiles: state.selectedProfiles,
    isApplying: state.isApplying,
    isRuled: state.isRuled,
    setIsRuled,
    handleMouseDown: handlers.handleMouseDown,
    handleMouseMove: handlers.handleMouseMove,
    handleMouseUp: handlers.handleMouseUp,
    handleContextMenu: handlers.handleContextMenu,
    handleKeyDown: handlers.handleKeyDown,
    performLoft: apply.performLoft,
    canLoft: apply.canLoft,
    cleanup,
  };
}
