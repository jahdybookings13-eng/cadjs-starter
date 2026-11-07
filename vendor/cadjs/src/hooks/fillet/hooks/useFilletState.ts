import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { Brep } from "../../../geometry";
import { BODY, SELECTION } from "../../../theme";
import { useHoverPreview } from "../../shared/useHoverPreview";
import type { EdgeSegmentData, FilletState } from "../types";

export function useFilletState() {
  const { getObject } = useCadCore();

  const [state, setState] = useState<FilletState>({
    selectedElement: null,
    selectedEdgeIndices: [],
    hoveredEdgeIndex: null,
    radius: 0.3,
    operationType: "fillet",
    isApplying: false,
    showDimensionInput: false,
    dimensionInputPosition: { x: 0, y: 0 },
  });

  // Cached OCC data for selected element
  const edgeSegmentsRef = useRef<EdgeSegmentData[]>([]);
  const edgeOverlayGroupRef = useRef<THREE.Group | null>(null);
  const originalBrepRef = useRef<Brep | null>(null);
  // Track hovered element for body highlight (before element selection)
  const hoveredBodyRef = useRef<string | null>(null);
  // Track which body currently wears the SELECTION.selected tint so we can
  // reset exactly that mesh on deselect/cleanup, independent of pending setState.
  const selectedBodyTintedRef = useRef<string | null>(null);
  // Select Other state
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const menuOpenRef = useRef(false);

  const { hoverPreviewRef, applyHoverPreview, restoreHoverPreview } =
    useHoverPreview();

  /** Reset body hover highlight. */
  const resetBodyHover = useCallback(() => {
    if (hoveredBodyRef.current) {
      const obj = getObject(hoveredBodyRef.current);
      if (obj) {
        obj.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            !child.userData.isEdgeOverlay &&
            !child.userData.isHelper
          ) {
            (child.material as THREE.MeshStandardMaterial).color.set(
              BODY.default,
            );
          }
        });
      }
      hoveredBodyRef.current = null;
    }
  }, [getObject]);

  /** Tint a body mesh with the selection color. */
  const tintSelectedBody = useCallback(
    (nodeId: string) => {
      const obj = getObject(nodeId);
      if (obj) {
        obj.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            !child.userData.isEdgeOverlay &&
            !child.userData.isHelper
          ) {
            (child.material as THREE.MeshStandardMaterial).color.set(
              SELECTION.selected,
            );
          }
        });
      }
      selectedBodyTintedRef.current = nodeId;
    },
    [getObject],
  );

  /** Reset the currently-tinted selected body back to the default color. */
  const resetSelectedBody = useCallback(() => {
    if (selectedBodyTintedRef.current) {
      const obj = getObject(selectedBodyTintedRef.current);
      if (obj) {
        obj.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            !child.userData.isEdgeOverlay &&
            !child.userData.isHelper
          ) {
            (child.material as THREE.MeshStandardMaterial).color.set(
              BODY.default,
            );
          }
        });
      }
      selectedBodyTintedRef.current = null;
    }
  }, [getObject]);

  /** Toggle between fillet and chamfer. */
  const toggleOperationType = useCallback(() => {
    setState((prev) => ({
      ...prev,
      operationType: prev.operationType === "fillet" ? "chamfer" : "fillet",
    }));
  }, []);

  return {
    state,
    setState,
    edgeSegmentsRef,
    edgeOverlayGroupRef,
    originalBrepRef,
    hoveredBodyRef,
    selectedBodyTintedRef,
    holdStartRef,
    hoverPreviewRef,
    menuOpenRef,
    resetBodyHover,
    tintSelectedBody,
    resetSelectedBody,
    applyHoverPreview,
    restoreHoverPreview,
    toggleOperationType,
  };
}

export type FilletStateBag = ReturnType<typeof useFilletState>;
