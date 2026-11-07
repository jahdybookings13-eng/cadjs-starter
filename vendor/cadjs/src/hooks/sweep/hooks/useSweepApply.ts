import { useCallback } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { debugLog, notify } from "../../../config";
import { sweepBRep } from "../../../scene-operations/sweep-operations";
import type { SweepStateBag } from "./useSweepState";

interface UseSweepApplyParams {
  stateBag: SweepStateBag;
}

export function useSweepApply({ stateBag }: UseSweepApplyParams) {
  const { elements, removeElement, updateElementBrep } = useCadCore();
  const { forceSceneUpdate } = useCadVisualizer();
  const { state, setState } = stateBag;

  const performSweep = useCallback(async () => {
    if (!state.selectedProfile || !state.selectedPath) return;

    const profileEl = elements.find(
      (el) => el.nodeId === state.selectedProfile,
    );
    const pathEl = elements.find((el) => el.nodeId === state.selectedPath);
    if (!profileEl || !pathEl || !pathEl.pathData) return;

    setState((prev) => ({ ...prev, isApplying: true }));

    try {
      debugLog("[useSweepMode] profileEl.position:", profileEl.position);
      debugLog(
        "[useSweepMode] pathEl.pathData.points:",
        pathEl.pathData.points,
      );

      const result = await sweepBRep(
        profileEl.brep,
        profileEl.position,
        pathEl.pathData.points,
        { orientation: state.orientation, cornerMode: state.cornerMode },
        profileEl.occBrep,
      );

      if (!result.ok) {
        notify(`Sweep failed: ${result.reason}`, "error");
      } else if (result.value.brep.faces.length === 0) {
        notify("Sweep produced empty result", "error");
      } else {
        const value = result.value;
        const newPosition = new THREE.Vector3(
          profileEl.position.x + value.positionOffset.x,
          profileEl.position.y + value.positionOffset.y,
          profileEl.position.z + value.positionOffset.z,
        );

        debugLog("[useSweepMode] result.positionOffset:", value.positionOffset);
        debugLog("[useSweepMode] newPosition:", newPosition);

        // CRITICAL ordering: updateElementBrep MUST run before removeElement.
        // Otherwise the path removal's stale-closure overwrites the queued
        // profile-update.
        updateElementBrep(
          state.selectedProfile,
          value.brep,
          newPosition,
          { type: "sweep", consumedElementId: state.selectedPath },
          value.edgeGeometry,
          value.occBrep,
          value.faceGeometry,
          value.vertexPositions,
        );

        removeElement(state.selectedPath);

        forceSceneUpdate();
      }
    } catch (error) {
      console.error("[useSweepMode] Sweep failed:", error);
      notify(
        `Sweep failed: ${error instanceof Error ? error.message : "unknown error"}`,
        "error",
      );
    }

    setState((prev) => ({
      ...prev,
      phase: "SELECT_PROFILE",
      selectedProfile: null,
      selectedPath: null,
      isApplying: false,
    }));
  }, [
    state.selectedProfile,
    state.selectedPath,
    state.orientation,
    state.cornerMode,
    elements,
    updateElementBrep,
    removeElement,
    forceSceneUpdate,
    setState,
  ]);

  const canSweep =
    state.phase === "READY" && !!state.selectedProfile && !!state.selectedPath;

  return { performSweep, canSweep };
}

export type SweepApplyBag = ReturnType<typeof useSweepApply>;
