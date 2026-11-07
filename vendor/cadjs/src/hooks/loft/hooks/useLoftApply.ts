import { useCallback } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { notify } from "../../../config";
import { Brep } from "../../../geometry";
import { loftBReps } from "../../../scene-operations/loft-operations";
import type { LoftStateBag } from "./useLoftState";

interface UseLoftApplyParams {
  stateBag: LoftStateBag;
}

export function useLoftApply({ stateBag }: UseLoftApplyParams) {
  const { elements, loftElements } = useCadCore();
  const { forceSceneUpdate } = useCadVisualizer();
  const { state, setState } = stateBag;

  /**
   * Loft N selected profiles (≥ 2) into a single body.
   * Profiles are NOT consumed, they remain in the scene alongside the result.
   * Selection order determines the loft sequence.
   */
  const performLoft = useCallback(async () => {
    if (state.selectedProfiles.length < 2) return;

    setState((prev) => ({ ...prev, isApplying: true }));

    try {
      // Collect profile data in selection order
      const profiles = state.selectedProfiles
        .map((nodeId) => {
          const el = elements.find((e) => e.nodeId === nodeId);
          if (!el) return null;
          const profile: {
            brep: Brep;
            position: THREE.Vector3;
            occBrep?: string;
          } = { brep: el.brep, position: el.position };
          if (el.occBrep) profile.occBrep = el.occBrep;
          return profile;
        })
        .filter(
          (p): p is { brep: Brep; position: THREE.Vector3; occBrep?: string } =>
            p !== null,
        );

      if (profiles.length < 2) {
        console.error("[useLoftMode] Not enough valid profiles");
        notify("Not enough valid profiles for loft", "error");
        setState((prev) => ({ ...prev, isApplying: false }));
        return;
      }

      const result = await loftBReps(profiles, state.isRuled);

      if (!result.ok) {
        notify(`Loft failed: ${result.reason}`, "error");
      } else if (result.value.brep.faces.length === 0) {
        notify("Loft produced empty result", "error");
      } else {
        const value = result.value;
        loftElements(
          state.selectedProfiles,
          value.brep,
          value.position,
          value.edgeGeometry,
          value.occBrep,
          value.vertexPositions,
          value.faceGeometry,
        );
        forceSceneUpdate();
      }
    } catch (error) {
      console.error("[useLoftMode] Loft failed:", error);
      notify(
        `Loft failed: ${error instanceof Error ? error.message : "unknown error"}`,
        "error",
      );
    }

    setState((prev) => ({
      ...prev,
      selectedProfiles: [],
      isApplying: false,
    }));
  }, [
    state.selectedProfiles,
    state.isRuled,
    elements,
    loftElements,
    forceSceneUpdate,
    setState,
  ]);

  const canLoft = state.selectedProfiles.length >= 2;

  return { performLoft, canLoft };
}

export type LoftApplyBag = ReturnType<typeof useLoftApply>;
