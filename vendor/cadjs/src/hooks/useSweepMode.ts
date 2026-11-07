import * as THREE from "three";
import { useCadCore } from "../contexts/CoreContext";
import { BODY, SWEEP } from "../theme";
import { useSweepApply } from "./sweep/hooks/useSweepApply";
import { useSweepInputHandlers } from "./sweep/hooks/useSweepInputHandlers";
import { useSweepState } from "./sweep/hooks/useSweepState";
import { useModeCleanup } from "./shared/useModeCleanup";
import type {
  SweepCornerMode,
  SweepOrientation,
  SweepPhase,
} from "./sweep/types";

export type {
  SweepCornerMode,
  SweepOrientation,
  SweepPhase,
} from "./sweep/types";

export interface UseSweepModeResult {
  phase: SweepPhase;
  selectedProfile: string | null;
  selectedPath: string | null;
  isApplying: boolean;
  orientation: SweepOrientation;
  cornerMode: SweepCornerMode;
  setOrientation: (orientation: SweepOrientation) => void;
  setCornerMode: (cornerMode: SweepCornerMode) => void;
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseMove: (event: MouseEvent) => void;
  handleMouseUp: (event: MouseEvent) => void;
  handleContextMenu: (event: MouseEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  performSweep: () => Promise<void>;
  canSweep: boolean;
  cleanup: () => void;
}

/**
 * Hook for Fusion 360-style sweep mode.
 * State machine: SELECT_PROFILE → SELECT_PATH → READY (Enter to apply)
 *
 * Composed of three sub-hooks living under `hooks/sweep/`:
 *   - useSweepState         (state + refs + setters + hover/highlight + select-other preview)
 *   - useSweepApply         (performSweep + canSweep)
 *   - useSweepInputHandlers (mouse + keyboard + context menu)
 */
export function useSweepMode(): UseSweepModeResult {
  const { getObject, mode } = useCadCore();

  const stateBag = useSweepState();
  const apply = useSweepApply({ stateBag });

  const {
    state,
    setState,
    resetHover,
    highlightSelected,
    setOrientation,
    setCornerMode,
  } = stateBag;

  const { cleanup } = useModeCleanup(mode, "sweep", () => {
    resetHover();

    if (state.selectedProfile) {
      highlightSelected(state.selectedProfile, BODY.default);
    }
    if (state.selectedPath) {
      const obj = getObject(state.selectedPath);
      if (obj) {
        obj.traverse((child) => {
          if (child instanceof THREE.Line && child.userData.isPathLine) {
            (child.material as THREE.LineBasicMaterial).color.set(
              SWEEP.pathPreview,
            );
          }
        });
      }
    }

    setState((prev) => ({
      ...prev,
      phase: "SELECT_PROFILE",
      selectedProfile: null,
      selectedPath: null,
      isApplying: false,
    }));
  });

  const handlers = useSweepInputHandlers({ stateBag, apply, cleanup });

  return {
    phase: state.phase,
    selectedProfile: state.selectedProfile,
    selectedPath: state.selectedPath,
    isApplying: state.isApplying,
    orientation: state.orientation,
    cornerMode: state.cornerMode,
    setOrientation,
    setCornerMode,
    handleMouseDown: handlers.handleMouseDown,
    handleMouseMove: handlers.handleMouseMove,
    handleMouseUp: handlers.handleMouseUp,
    handleContextMenu: handlers.handleContextMenu,
    handleKeyDown: handlers.handleKeyDown,
    performSweep: apply.performSweep,
    canSweep: apply.canSweep,
    cleanup,
  };
}
