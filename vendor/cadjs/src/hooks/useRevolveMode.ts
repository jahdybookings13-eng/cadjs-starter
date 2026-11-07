import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { useCadCore } from "../contexts/CoreContext";
import { useCadVisualizer } from "../contexts/VisualizerContext";
import { BODY } from "../theme";
import { useRevolveApply } from "./revolve/hooks/useRevolveApply";
import { useRevolveAxisSelection } from "./revolve/hooks/useRevolveAxisSelection";
import { useRevolveInputHandlers } from "./revolve/hooks/useRevolveInputHandlers";
import { useRevolveState } from "./revolve/hooks/useRevolveState";
import type { RevolvePhase, RevolveDirection } from "./revolve/types";

export type { RevolvePhase, RevolveDirection } from "./revolve/types";

export interface UseRevolveModeResult {
  phase: RevolvePhase;
  selectedElement: string | null;
  isApplying: boolean;
  angle: number;
  angle2: number;
  direction: RevolveDirection;
  showDimensionInput: boolean;
  dimensionInputPosition: { x: number; y: number };
  setAngle: (angle: number) => void;
  setAngle2: (angle2: number) => void;
  setDirection: (direction: RevolveDirection) => void;
  flipAxis: () => void;
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseMove: (event: MouseEvent) => void;
  handleMouseUp: (event: MouseEvent) => void;
  handleContextMenu: (event: MouseEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  performRevolve: (angleDegrees?: number) => Promise<void>;
  selectOriginAxis: (axis: "X" | "Y" | "Z") => void;
  cleanup: () => void;
}

/**
 * Hook for Fusion 360-style revolve mode.
 * State machine: SELECT_PROFILE → SELECT_AXIS → SET_ANGLE
 *
 * Composed of four sub-hooks living under `hooks/revolve/`:
 *   - useRevolveState         (state + refs + simple setters + hover + select-other preview)
 *   - useRevolveAxisSelection (overlay builders + axis line + flipAxis + selectOriginAxis + selectProfileById)
 *   - useRevolveApply         (performRevolve)
 *   - useRevolveInputHandlers (mouse + keyboard handlers)
 */
export function useRevolveMode(): UseRevolveModeResult {
  const { getObject, elements, sketches } = useCadCore();
  const { renderer, forceSceneUpdate } = useCadVisualizer();

  const stateBag = useRevolveState();
  const axisSelection = useRevolveAxisSelection({ stateBag });
  const apply = useRevolveApply({ stateBag, axisSelection });

  const { state, setState, resetHover } = stateBag;
  const { removeEdgeOverlay, removeAxisLine } = axisSelection;

  // Overlays (sketch-line, body-edge, profile-edge) are added directly to the scene
  // with userData.isHelper=true and snapshot the elements/sketches arrays at selection
  // time. They aren't part of objectsMap, so undo/redo's restoreSnapshot doesn't touch
  // them. Reset on any elements/sketches mutation to prevent ghost outlines.
  useEffect(() => {
    removeEdgeOverlay();
    removeAxisLine();
    setState((prev) =>
      prev.phase === "SELECT_PROFILE"
        ? prev
        : {
            ...prev,
            phase: "SELECT_PROFILE",
            selectedElement: null,
            axisEdgeStart: null,
            axisEdgeEnd: null,
            showDimensionInput: false,
          },
    );
  }, [elements, sketches, removeEdgeOverlay, removeAxisLine, setState]);

  const cleanup = useCallback(() => {
    resetHover();
    removeEdgeOverlay();
    removeAxisLine();

    if (state.selectedElement) {
      const obj = getObject(state.selectedElement);
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
    }

    if (renderer) {
      renderer.domElement.style.cursor = "default";
    }

    setState({
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
    forceSceneUpdate();
  }, [
    resetHover,
    removeEdgeOverlay,
    removeAxisLine,
    state.selectedElement,
    getObject,
    renderer,
    forceSceneUpdate,
    setState,
  ]);

  // Mode-content registry mounts this hook only while mode === "revolve", so unmount
  // == leaving the mode. Latest closure pinned via ref; unmount effect runs once.
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  useEffect(() => () => cleanupRef.current(), []);

  const handlers = useRevolveInputHandlers({
    stateBag,
    axisSelection,
    apply,
    cleanup,
  });

  return {
    phase: state.phase,
    selectedElement: state.selectedElement,
    isApplying: state.isApplying,
    angle: state.angle,
    angle2: state.angle2,
    direction: state.direction,
    showDimensionInput: state.showDimensionInput,
    dimensionInputPosition: state.dimensionInputPosition,
    setAngle: stateBag.setAngle,
    setAngle2: stateBag.setAngle2,
    setDirection: stateBag.setDirection,
    flipAxis: axisSelection.flipAxis,
    handleMouseDown: handlers.handleMouseDown,
    handleMouseMove: handlers.handleMouseMove,
    handleMouseUp: handlers.handleMouseUp,
    handleContextMenu: handlers.handleContextMenu,
    handleKeyDown: handlers.handleKeyDown,
    performRevolve: apply.performRevolve,
    selectOriginAxis: axisSelection.selectOriginAxis,
    cleanup,
  };
}
