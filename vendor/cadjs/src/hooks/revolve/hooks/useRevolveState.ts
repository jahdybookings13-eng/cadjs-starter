import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { BODY } from "../../../theme";
import { useHoverPreview } from "../../shared/useHoverPreview";
import type { EdgeSegmentData, RevolveDirection, RevolveState } from "../types";

export function useRevolveState() {
  const { getObject } = useCadCore();

  const [state, setState] = useState<RevolveState>({
    phase: "SELECT_PROFILE",
    selectedElement: null,
    axisEdgeStart: null,
    axisEdgeEnd: null,
    angle: 360,
    angle2: 360,
    direction: "one",
    isApplying: false,
    showDimensionInput: false,
    dimensionInputPosition: { x: 0, y: 0 },
  });

  const hoveredElementRef = useRef<string | null>(null);
  const edgeSegmentsRef = useRef<EdgeSegmentData[]>([]);
  const edgeOverlayGroupRef = useRef<THREE.Group | null>(null);
  const hoveredEdgeRef = useRef<number | null>(null);
  const axisLineRef = useRef<THREE.Line | null>(null);
  const sketchLineOverlayRef = useRef<THREE.Group | null>(null);
  const bodyEdgeOverlayRef = useRef<THREE.Group | null>(null);
  // Select Other state, only the SELECT_PROFILE phase uses it.
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const menuOpenRef = useRef(false);

  const { hoverPreviewRef, applyHoverPreview, restoreHoverPreview } =
    useHoverPreview();

  const setAngle = useCallback(
    (angle: number) => setState((prev) => ({ ...prev, angle })),
    [],
  );
  const setAngle2 = useCallback(
    (angle2: number) => setState((prev) => ({ ...prev, angle2 })),
    [],
  );
  const setDirection = useCallback(
    (direction: RevolveDirection) =>
      setState((prev) => ({ ...prev, direction })),
    [],
  );

  /** Reset hover highlight for profile selection. */
  const resetHover = useCallback(() => {
    if (hoveredElementRef.current) {
      const obj = getObject(hoveredElementRef.current);
      if (obj) {
        obj.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            !child.userData.isEdgeOverlay &&
            !child.userData.isHelper
          ) {
            if (hoveredElementRef.current !== state.selectedElement) {
              (child.material as THREE.MeshStandardMaterial).color.set(
                BODY.default,
              );
            }
          }
        });
      }
      hoveredElementRef.current = null;
    }
  }, [getObject, state.selectedElement]);

  return {
    state,
    setState,
    hoveredElementRef,
    edgeSegmentsRef,
    edgeOverlayGroupRef,
    hoveredEdgeRef,
    axisLineRef,
    sketchLineOverlayRef,
    bodyEdgeOverlayRef,
    holdStartRef,
    hoverPreviewRef,
    menuOpenRef,
    setAngle,
    setAngle2,
    setDirection,
    resetHover,
    applyHoverPreview,
    restoreHoverPreview,
  };
}

export type RevolveStateBag = ReturnType<typeof useRevolveState>;
