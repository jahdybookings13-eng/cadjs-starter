import { useCallback, useRef, useState } from "react";
import { useCadCore } from "../../../contexts/CoreContext";
import { SceneElement } from "../../../scene-operations/types";
import { BODY, SELECTION } from "../../../theme";
import { useHoverPreview } from "../../shared/useHoverPreview";
import { tintMeshes } from "../../shared/tintMeshes";
import { isFlatShape } from "../loft-helpers";
import type { LoftState } from "../types";

export function useLoftState() {
  const { elements, getObject } = useCadCore();

  const [state, setState] = useState<LoftState>({
    selectedProfiles: [],
    isApplying: false,
    isRuled: false,
  });

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Select Other state
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const menuOpenRef = useRef(false);
  // Snapshot of selectedProfiles taken at hold-LMB time, restored on cancel.
  const heldSnapshotRef = useRef<string[] | null>(null);

  const { hoverPreviewRef, applyHoverPreview, restoreHoverPreview } =
    useHoverPreview();

  /** Reset hover highlight, but preserve selection color for selected profiles. */
  const resetHover = useCallback(() => {
    if (hoveredId) {
      if (!state.selectedProfiles.includes(hoveredId)) {
        tintMeshes(getObject, hoveredId, BODY.default);
      }
      setHoveredId(null);
    }
  }, [getObject, state.selectedProfiles, hoveredId]);

  const profileFilter = useCallback(
    (el: SceneElement) => el.elementType !== "path" && isFlatShape(el.brep),
    [],
  );

  /** Set the body color of an element (mesh-only traversal). */
  const setElementColor = useCallback(
    (nodeId: string, color: number) => tintMeshes(getObject, nodeId, color),
    [getObject],
  );

  /**
   * Toggle a profile's membership in `selectedProfiles`.
   * Insertion order is preserved, loft sequence follows selection order.
   */
  const toggleProfileSelection = useCallback(
    (elementId: string) => {
      setState((prev) => {
        const isSel = prev.selectedProfiles.includes(elementId);
        setElementColor(elementId, isSel ? BODY.default : SELECTION.selected);
        return {
          ...prev,
          selectedProfiles: isSel
            ? prev.selectedProfiles.filter((id) => id !== elementId)
            : [...prev.selectedProfiles, elementId],
        };
      });
    },
    [setElementColor],
  );

  /**
   * Restore selection visuals from a snapshot (used when the menu is closed
   * without a pick, the initial toggle is rolled back to the snapshot).
   */
  const restoreFromSnapshot = useCallback(
    (snapshot: string[]) => {
      elements.forEach((el) => {
        if (el.elementType === "path") return;
        if (!isFlatShape(el.brep)) return;
        setElementColor(
          el.nodeId,
          snapshot.includes(el.nodeId) ? SELECTION.selected : BODY.default,
        );
      });
      setState((prev) => ({ ...prev, selectedProfiles: [...snapshot] }));
    },
    [elements, setElementColor],
  );

  const setIsRuled = useCallback((isRuled: boolean) => {
    setState((prev) => ({ ...prev, isRuled }));
  }, []);

  return {
    state,
    setState,
    hoveredId,
    setHoveredId,
    holdStartRef,
    hoverPreviewRef,
    menuOpenRef,
    heldSnapshotRef,
    resetHover,
    profileFilter,
    setElementColor,
    toggleProfileSelection,
    applyHoverPreview,
    restoreHoverPreview,
    restoreFromSnapshot,
    setIsRuled,
  };
}

export type LoftStateBag = ReturnType<typeof useLoftState>;
