import { useCallback } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { debugLog, notify } from "../../../config";
import { revolveBRep } from "../../../scene-operations/revolve-operations";
import { normalizeAxis } from "../revolve-helpers";
import type { RevolveAxisSelection } from "./useRevolveAxisSelection";
import type { RevolveStateBag } from "./useRevolveState";
import { REVOLVE_FULL_TURN_DEG_TOL } from "../../../tolerances";

interface UseRevolveApplyParams {
  stateBag: RevolveStateBag;
  axisSelection: RevolveAxisSelection;
}

export function useRevolveApply({
  stateBag,
  axisSelection,
}: UseRevolveApplyParams) {
  const { elements, updateElementBrep } = useCadCore();
  const { state, setState } = stateBag;
  const { removeEdgeOverlay, removeAxisLine } = axisSelection;

  const performRevolve = useCallback(
    async (angleDegrees?: number) => {
      const { selectedElement, axisEdgeStart, axisEdgeEnd } = state;
      if (!selectedElement || !axisEdgeStart || !axisEdgeEnd) return;

      const element = elements.find((el) => el.nodeId === selectedElement);
      if (!element) return;

      setState((prev) => ({ ...prev, isApplying: true }));

      try {
        const finalAngle = angleDegrees ?? state.angle;
        const angleRadians = (finalAngle / 180) * Math.PI;
        const angle2Radians = (state.angle2 / 180) * Math.PI;

        const axis = normalizeAxis(axisEdgeStart, axisEdgeEnd);
        if (!axis) {
          notify("Invalid axis: edge has zero length", "error");
          setState((prev) => ({ ...prev, isApplying: false }));
          return;
        }

        const result = await revolveBRep(
          element.brep,
          element.position,
          axis.origin,
          axis.direction,
          Math.abs(finalAngle - 360) < REVOLVE_FULL_TURN_DEG_TOL
            ? undefined
            : angleRadians,
          element.occBrep,
          state.direction,
          state.direction === "two"
            ? Math.abs(state.angle2 - 360) < REVOLVE_FULL_TURN_DEG_TOL
              ? undefined
              : angle2Radians
            : undefined,
        );

        if (!result.ok) {
          notify(`Revolve failed: ${result.reason}`, "error");
          setState((prev) => ({ ...prev, isApplying: false }));
          return;
        }

        const value = result.value;
        const newPosition = new THREE.Vector3(
          element.position.x + value.positionOffset.x,
          element.position.y + value.positionOffset.y,
          element.position.z + value.positionOffset.z,
        );

        debugLog("[revolve diag] performRevolve", {
          elementPosition: element.position.toArray(),
          elementRotation: element.rotation
            ? [
                element.rotation.x,
                element.rotation.y,
                element.rotation.z,
                element.rotation.order,
              ]
            : null,
          axis: { origin: axis.origin, direction: axis.direction },
          finalAngle,
          direction: state.direction,
          positionOffset: value.positionOffset,
          newPosition: newPosition.toArray(),
        });

        removeEdgeOverlay();
        removeAxisLine();

        updateElementBrep(
          selectedElement,
          value.brep,
          newPosition,
          { type: "revolve" },
          value.edgeGeometry,
          value.occBrep,
          value.faceGeometry,
          value.vertexPositions,
        );

        const toastMsg =
          state.direction === "symmetric"
            ? `Revolved ${finalAngle / 2}° + ${finalAngle / 2}° symmetric`
            : state.direction === "two"
              ? `Revolved ${finalAngle}° + ${state.angle2}° two sides`
              : `Revolved ${finalAngle}°`;
        notify(toastMsg, "success");

        // Reset state
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
      } catch (error) {
        console.error("[useRevolveMode] Revolve failed:", error);
        const msg = error instanceof Error ? error.message : "Revolve failed";
        notify(msg, "error");
        setState((prev) => ({ ...prev, isApplying: false }));
      }
    },
    [
      state,
      elements,
      updateElementBrep,
      removeEdgeOverlay,
      removeAxisLine,
      setState,
    ],
  );

  return { performRevolve };
}

export type RevolveApplyBag = ReturnType<typeof useRevolveApply>;
