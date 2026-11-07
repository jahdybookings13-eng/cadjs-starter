import { useCallback, useRef } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { Brep } from "../../../geometry";
import { OccWorkerClient } from "../../../services/OccWorkerClient";
import type { WorkerPreviewResult } from "../../../workers/occ-worker-types";
import { reconstructFaceGeometry } from "../../../workers/geometry-reconstruction";
import { SceneElement } from "../../../scene-operations/types";
import { EXTRUDE } from "../../../theme";
import { toVec3 } from "../../../vectorHelpers";
import { buildDirectionalScaleMatrix, getFlatNormal } from "../extrude-helpers";
import type { ExtrudeDirection } from "../types";
import type { ExtrudeStateBag } from "./useExtrudeState";

interface UsePreviewRenderingParams {
  stateBag: ExtrudeStateBag;
}

export function usePreviewRendering({ stateBag }: UsePreviewRenderingParams) {
  const { elements, getObject } = useCadCore();
  const { scene, forceSceneUpdate } = useCadVisualizer();
  const { state, originalBrepRef, originalMeshRef } = stateBag;

  const previewMeshRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const cachedPreviewGeometryRef = useRef<Map<string, THREE.BufferGeometry>>(
    new Map(),
  );

  const cleanupPreview = useCallback(() => {
    if (!scene) return;
    previewMeshRef.current.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        (mesh.material as THREE.Material).dispose();
      }
    });
    previewMeshRef.current.clear();
  }, [scene]);

  const restoreOriginalMesh = useCallback(() => {
    originalMeshRef.current.forEach((obj) => {
      obj.visible = true;
    });
    originalMeshRef.current.clear();
  }, [originalMeshRef]);

  /**
   * Build OCC-based unit extrusion geometry (called once per profile when drag starts).
   * Result is cached and reused for live scaling during drag.
   */
  const buildCachedPreviewGeometry = useCallback(
    async (
      brep: Brep,
      element?: SceneElement,
    ): Promise<THREE.BufferGeometry | null> => {
      try {
        const client = OccWorkerClient.getInstance();
        const normal = getFlatNormal(brep, element);

        const result = await client.send<WorkerPreviewResult>({
          type: "previewGeometry",
          payload: {
            brepJson: brep.toJSON(),
            sourceOccBrep: element?.occBrep,
            normalVec: toVec3(normal),
          },
        });

        return reconstructFaceGeometry(result.faceGeometry);
      } catch (error) {
        console.warn(
          "[useExtrudeMode] Failed to build OCC preview geometry:",
          error,
        );
        return null;
      }
    },
    [],
  );

  /**
   * Update preview meshes during drag.
   * One preview mesh per selected profile, each cloned from its cached unit-extrusion
   * geometry and scaled along the shared normal via M = I + (s-1)(n⊗n).
   */
  const updatePreview = useCallback(
    (depth: number, direction: ExtrudeDirection) => {
      if (state.selectedElements.length === 0) return;

      for (const nodeId of state.selectedElements) {
        if (originalMeshRef.current.has(nodeId)) continue;
        const obj = getObject(nodeId);
        if (!obj) continue;
        originalMeshRef.current.set(nodeId, obj);
        obj.visible = false;
      }

      cleanupPreview();

      const extrusionDepth = Math.abs(depth);
      const directionSign = direction === "down" ? -1 : 1;
      const previewColor =
        state.operationType === "cut"
          ? EXTRUDE.cutPreview
          : EXTRUDE.profileHighlight;

      if (!scene) return;

      for (const nodeId of state.selectedElements) {
        const element = elements.find((el) => el.nodeId === nodeId);
        const origBrep = originalBrepRef.current.get(nodeId);
        const cachedGeom = cachedPreviewGeometryRef.current.get(nodeId);
        if (!element || !origBrep || !cachedGeom) continue;

        // Clone per preview mesh so cleanupPreview's dispose doesn't destroy the cache.
        const previewMesh = new THREE.Mesh(
          cachedGeom.clone(),
          new THREE.MeshStandardMaterial({
            color: previewColor,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthTest: false,
          }),
        );
        previewMesh.renderOrder = 500;

        const normal = getFlatNormal(origBrep, element);

        let s: number;
        let offsetX: number, offsetY: number, offsetZ: number;
        if (direction === "symmetric") {
          s = extrusionDepth * 2;
          offsetX = element.position.x - extrusionDepth * normal.x;
          offsetY = element.position.y - extrusionDepth * normal.y;
          offsetZ = element.position.z - extrusionDepth * normal.z;
        } else {
          s = extrusionDepth * directionSign;
          offsetX = element.position.x;
          offsetY = element.position.y;
          offsetZ = element.position.z;
        }

        previewMesh.matrixAutoUpdate = false;
        const m = buildDirectionalScaleMatrix(normal, s, {
          x: offsetX,
          y: offsetY,
          z: offsetZ,
        });
        previewMesh.matrix.copy(m);
        previewMesh.userData.isPreview = true;

        scene.add(previewMesh);
        previewMeshRef.current.set(nodeId, previewMesh);
      }
      forceSceneUpdate();
    },
    [
      state.selectedElements,
      state.operationType,
      elements,
      getObject,
      scene,
      forceSceneUpdate,
      cleanupPreview,
      originalBrepRef,
      originalMeshRef,
    ],
  );

  return {
    previewMeshRef,
    cachedPreviewGeometryRef,
    cleanupPreview,
    restoreOriginalMesh,
    buildCachedPreviewGeometry,
    updatePreview,
  };
}

export type PreviewRenderingBag = ReturnType<typeof usePreviewRendering>;
