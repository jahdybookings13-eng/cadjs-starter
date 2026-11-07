import { useCallback, useRef, useState } from "react";
import { useCadCore } from "../../../contexts/CoreContext";
import { BODY, SELECTION } from "../../../theme";
import { useHoverPreview } from "../../shared/useHoverPreview";
import { tintMeshes, tintMeshesAndPathLines } from "../../shared/tintMeshes";
import type { SweepCornerMode, SweepOrientation, SweepState } from "../types";

export function useSweepState() {
  const { getObject } = useCadCore();

  const [state, setState] = useState<SweepState>({
    phase: "SELECT_PROFILE",
    selectedProfile: null,
    selectedPath: null,
    isApplying: false,
    orientation: "perpendicular",
    cornerMode: "right",
  });

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Select Other state, only the SELECT_PROFILE phase uses it.
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const menuOpenRef = useRef(false);

  const { hoverPreviewRef, applyHoverPreview, restoreHoverPreview } =
    useHoverPreview();

  /** Reset hover highlight back to default body color. */
  const resetHover = useCallback(() => {
    if (hoveredId) {
      tintMeshes(getObject, hoveredId, BODY.default);
      setHoveredId(null);
    }
  }, [getObject, hoveredId]);

  /** Highlight a profile (mesh) or path (line) with the given color. */
  const highlightSelected = useCallback(
    (nodeId: string, color: number) =>
      tintMeshesAndPathLines(getObject, nodeId, color),
    [getObject],
  );

  /**
   * Apply profile selection: tints body, advances phase to SELECT_PATH.
   * Used by both `handleMouseDown` initial pick and Select Other menu picks.
   */
  const selectProfileById = useCallback(
    (elementId: string) => {
      resetHover();
      highlightSelected(elementId, SELECTION.selected);
      setState((prev) => ({
        ...prev,
        phase: "SELECT_PATH",
        selectedProfile: elementId,
      }));
    },
    [resetHover, highlightSelected],
  );

  const setOrientation = useCallback((orientation: SweepOrientation) => {
    setState((prev) => ({ ...prev, orientation }));
  }, []);

  const setCornerMode = useCallback((cornerMode: SweepCornerMode) => {
    setState((prev) => ({ ...prev, cornerMode }));
  }, []);

  return {
    state,
    setState,
    hoveredId,
    setHoveredId,
    holdStartRef,
    hoverPreviewRef,
    menuOpenRef,
    resetHover,
    highlightSelected,
    applyHoverPreview,
    restoreHoverPreview,
    selectProfileById,
    setOrientation,
    setCornerMode,
  };
}

export type SweepStateBag = ReturnType<typeof useSweepState>;
