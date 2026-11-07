import { useCallback } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { notify } from "../../../config";
import { Brep, type BrepJSON } from "../../../geometry";
import { OccWorkerClient } from "../../../services/OccWorkerClient";
import type { WorkerBooleanResult } from "../../../workers/occ-worker-types";
import {
  reconstructEdgeGeometry,
  reconstructFaceGeometry,
} from "../../../workers/geometry-reconstruction";
import { extrudeBRep } from "../../../scene-operations/resize-operations";
import { isElement3D, SceneElement } from "../../../scene-operations/types";
import { toVec3 } from "../../../vectorHelpers";
import { getFlatNormal } from "../extrude-helpers";
import type { ExtrudeDirection } from "../types";
import type { ExtrudeStateBag } from "./useExtrudeState";
import type { PreviewRenderingBag } from "./usePreviewRendering";

interface UseExtrudeApplyParams {
  stateBag: ExtrudeStateBag;
  preview: PreviewRenderingBag;
}

export function useExtrudeApply({ stateBag, preview }: UseExtrudeApplyParams) {
  const { elements, getObject, updateElementBrep, removeElement } =
    useCadCore();
  const { forceSceneUpdate } = useCadVisualizer();
  const { state, originalBrepRef } = stateBag;
  const { cachedPreviewGeometryRef } = preview;

  /** Apply extrusion to every selected element (join mode). */
  const applyExtrusion = useCallback(
    async (depth: number, direction: ExtrudeDirection) => {
      if (state.selectedElements.length === 0) return;

      let ocDirection: number;
      switch (direction) {
        case "up":
          ocDirection = 1;
          break;
        case "down":
          ocDirection = -1;
          break;
        case "symmetric":
          ocDirection = 1;
          break;
        default:
          ocDirection = 1;
      }
      const isSymmetric = direction === "symmetric";

      for (const nodeId of state.selectedElements) {
        const element = elements.find((el) => el.nodeId === nodeId);
        const origBrep = originalBrepRef.current.get(nodeId);
        if (!element || !origBrep) continue;

        try {
          const normal = getFlatNormal(origBrep, element);
          const normalVec = toVec3(normal);

          const extrusionResult = await extrudeBRep(
            origBrep,
            depth,
            ocDirection,
            normalVec,
            element.occBrep,
            isSymmetric,
          );

          if (!extrusionResult.ok) {
            notify(`Extrusion failed: ${extrusionResult.reason}`, "error");
            continue;
          }

          const value = extrusionResult.value;
          const newPosition = new THREE.Vector3(
            element.position.x + value.positionOffset.x,
            element.position.y + value.positionOffset.y,
            element.position.z + value.positionOffset.z,
          );

          updateElementBrep(
            nodeId,
            value.brep,
            newPosition,
            { type: "extrude" },
            value.edgeGeometry,
            value.occBrep,
            value.faceGeometry,
            value.vertexPositions,
          );
        } catch (error) {
          console.error("Extrusion failed for", nodeId, error);
          notify(
            `Extrusion failed: ${error instanceof Error ? error.message : "unknown error"}`,
            "error",
          );
        }
      }

      forceSceneUpdate();
      originalBrepRef.current.clear();
      cachedPreviewGeometryRef.current.clear();
    },
    [
      state.selectedElements,
      elements,
      updateElementBrep,
      forceSceneUpdate,
      originalBrepRef,
      cachedPreviewGeometryRef,
    ],
  );

  /**
   * Apply cut extrusion for every selected profile.
   * Tools accumulate per target body so multi-profile cuts on the same body chain correctly.
   */
  const applyCutExtrusion = useCallback(
    async (depth: number, direction: ExtrudeDirection) => {
      if (state.selectedElements.length === 0) return;

      const client = OccWorkerClient.getInstance();

      let ocDirection: number;
      switch (direction) {
        case "down":
          ocDirection = -1;
          break;
        default:
          ocDirection = 1;
      }
      const isSymmetric = direction === "symmetric";

      type TargetState = {
        brepJson: BrepJSON;
        position: { x: number; y: number; z: number };
        occBrep: string | undefined;
        lastResult: WorkerBooleanResult | null;
        consumedProfileIds: string[];
      };
      const targetStates = new Map<string, TargetState>();

      for (const nodeId of state.selectedElements) {
        const profileElement = elements.find((el) => el.nodeId === nodeId);
        const origBrep = originalBrepRef.current.get(nodeId);
        if (!profileElement || !origBrep) continue;

        try {
          const normal = getFlatNormal(origBrep, profileElement);
          const normalVec = toVec3(normal);
          const extrusionResult = await extrudeBRep(
            origBrep,
            depth,
            ocDirection,
            normalVec,
            profileElement.occBrep,
            isSymmetric,
          );

          if (!extrusionResult.ok) {
            notify(`Cut extrusion failed: ${extrusionResult.reason}`, "error");
            continue;
          }
          const extValue = extrusionResult.value;

          const toolWorldPos = new THREE.Vector3(
            profileElement.position.x + extValue.positionOffset.x,
            profileElement.position.y + extValue.positionOffset.y,
            profileElement.position.z + extValue.positionOffset.z,
          );

          // Find target body, prefer sketch-plane source, fall back to bbox overlap.
          let targetElement: SceneElement | null = null;
          const sourceId = profileElement.sketchPlane?.sourceElementId;
          if (sourceId) {
            const sourceEl = elements.find((el) => el.nodeId === sourceId);
            if (sourceEl && isElement3D(sourceEl)) targetElement = sourceEl;
          }
          if (!targetElement) {
            const toolBox = new THREE.Box3();
            for (const v of extValue.brep.vertices) {
              toolBox.expandByPoint(
                new THREE.Vector3(
                  v.x + toolWorldPos.x,
                  v.y + toolWorldPos.y,
                  v.z + toolWorldPos.z,
                ),
              );
            }
            const expandVec = normal.clone().multiplyScalar(depth * 2);
            toolBox.expandByVector(
              new THREE.Vector3(
                Math.abs(expandVec.x),
                Math.abs(expandVec.y),
                Math.abs(expandVec.z),
              ),
            );

            for (const el of elements) {
              if (state.selectedElements.includes(el.nodeId)) continue;
              if (!isElement3D(el)) continue;
              const targetObj = getObject(el.nodeId);
              if (targetObj) {
                const targetBox = new THREE.Box3().setFromObject(targetObj);
                if (toolBox.intersectsBox(targetBox)) {
                  targetElement = el;
                  break;
                }
              }
            }
          }

          if (!targetElement) {
            notify("No intersecting body found for cut", "error");
            continue;
          }

          const existing = targetStates.get(targetElement.nodeId);
          const tgtState: TargetState = existing ?? {
            brepJson: targetElement.brep.toJSON(),
            position: toVec3(targetElement.position),
            occBrep: targetElement.occBrep,
            lastResult: null,
            consumedProfileIds: [],
          };
          if (!existing) targetStates.set(targetElement.nodeId, tgtState);

          // Boolean difference via worker: (running target) - tool
          const booleanResult = await client.send<WorkerBooleanResult>({
            type: "boolean",
            payload: {
              operation: "difference",
              operands: [
                {
                  brepJson: tgtState.brepJson,
                  position: tgtState.position,
                  occBrep: tgtState.occBrep,
                },
                {
                  brepJson: extValue.brep.toJSON(),
                  position: toVec3(toolWorldPos),
                  occBrep: extValue.occBrep,
                },
              ],
            },
          });

          tgtState.brepJson = booleanResult.brepJson;
          tgtState.position = booleanResult.position;
          tgtState.occBrep = booleanResult.occBrep;
          tgtState.lastResult = booleanResult;
          tgtState.consumedProfileIds.push(nodeId);
        } catch (error) {
          console.error("Cut extrusion failed for", nodeId, error);
          notify(
            `Cut extrusion failed: ${error instanceof Error ? error.message : "unknown error"}`,
            "error",
          );
        }
      }

      // Commit: one updateElementBrep per target (consuming last profile) + removeElement for the rest
      targetStates.forEach((tgtState, targetId) => {
        if (!tgtState.lastResult) return;
        const resultBrep = Brep.fromJSON(tgtState.lastResult.brepJson);
        const worldCenter = new THREE.Vector3(
          tgtState.lastResult.position.x,
          tgtState.lastResult.position.y,
          tgtState.lastResult.position.z,
        );
        const edgeGeometry = tgtState.lastResult.edgePositions
          ? reconstructEdgeGeometry(tgtState.lastResult.edgePositions)
          : undefined;
        const faceGeometry = tgtState.lastResult.faceGeometry
          ? reconstructFaceGeometry(tgtState.lastResult.faceGeometry)
          : undefined;

        const consumed = tgtState.consumedProfileIds;
        const lastConsumed = consumed[consumed.length - 1];
        const earlierConsumed = consumed.slice(0, -1);

        updateElementBrep(
          targetId,
          resultBrep,
          worldCenter,
          {
            type: "difference",
            ...(lastConsumed !== undefined && {
              consumedElementId: lastConsumed,
            }),
          },
          edgeGeometry,
          tgtState.lastResult.occBrep,
          faceGeometry,
          tgtState.lastResult.vertexPositions,
        );
        earlierConsumed.forEach((id) => removeElement(id));
      });

      forceSceneUpdate();
      originalBrepRef.current.clear();
      cachedPreviewGeometryRef.current.clear();
    },
    [
      state.selectedElements,
      elements,
      getObject,
      updateElementBrep,
      removeElement,
      forceSceneUpdate,
      originalBrepRef,
      cachedPreviewGeometryRef,
    ],
  );

  return { applyExtrusion, applyCutExtrusion };
}

export type ExtrudeApplyBag = ReturnType<typeof useExtrudeApply>;
