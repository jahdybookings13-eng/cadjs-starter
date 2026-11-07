import { useCallback } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { OccWorkerClient } from "../../../services/OccWorkerClient";
import type { WorkerEdgeAnalysisResult } from "../../../workers/occ-worker-types";
import { FILLET } from "../../../theme";
import { toEulerJSON, toVec3 } from "../../../vectorHelpers";
import type { FilletStateBag } from "./useFilletState";

interface UseFilletEdgeOverlayParams {
  stateBag: FilletStateBag;
}

export function useFilletEdgeOverlay({ stateBag }: UseFilletEdgeOverlayParams) {
  const { elements } = useCadCore();
  const { scene, forceSceneUpdate } = useCadVisualizer();
  const {
    state,
    setState,
    edgeSegmentsRef,
    edgeOverlayGroupRef,
    originalBrepRef,
    tintSelectedBody,
    resetSelectedBody,
  } = stateBag;

  /** Clean up edge overlay lines from scene. */
  const cleanupEdgeOverlay = useCallback(() => {
    if (scene && edgeOverlayGroupRef.current) {
      scene.remove(edgeOverlayGroupRef.current);
      edgeOverlayGroupRef.current.traverse((child) => {
        if (child instanceof Line2) {
          child.geometry.dispose();
          (child.material as LineMaterial).dispose();
        }
      });
      edgeOverlayGroupRef.current = null;
    }
    edgeSegmentsRef.current = [];
  }, [scene, edgeOverlayGroupRef, edgeSegmentsRef]);

  /**
   * Build edge overlays for the selected element.
   * Per-edge LineSegments allow individual raycast and highlight.
   */
  const buildEdgeOverlays = useCallback(
    async (nodeId: string) => {
      if (!scene) return;
      cleanupEdgeOverlay();

      const element = elements.find((el) => el.nodeId === nodeId);
      if (!element) return;

      try {
        const client = OccWorkerClient.getInstance();
        const result = await client.send<WorkerEdgeAnalysisResult>({
          type: "edgeAnalysis",
          payload: {
            brepJson: element.brep.toJSON(),
            position: toVec3(element.position),
            occBrep: element.occBrep,
            rotation: element.rotation
              ? toEulerJSON(element.rotation)
              : undefined,
            allEdges: false,
          },
        });

        const edgeData = result.edges;

        edgeSegmentsRef.current = edgeData;

        const group = new THREE.Group();
        group.userData.isFilletEdgeOverlay = true;

        for (const edge of edgeData) {
          // Convert pair-format [x1,y1,z1,x2,y2,z2,...] to continuous strip for LineGeometry
          const pairs = edge.segments;
          const strip: number[] = [];
          for (let i = 0; i < pairs.length; i += 6) {
            if (strip.length === 0)
              strip.push(pairs[i]!, pairs[i + 1]!, pairs[i + 2]!);
            strip.push(pairs[i + 3]!, pairs[i + 4]!, pairs[i + 5]!);
          }

          const geometry = new LineGeometry();
          geometry.setPositions(strip);

          const material = new LineMaterial({
            color: FILLET.edgeHover,
            linewidth: FILLET.edgeWidth,
            transparent: true,
            opacity: 0,
            depthTest: false,
            resolution: new THREE.Vector2(
              window.innerWidth,
              window.innerHeight,
            ),
          });

          const line = new Line2(geometry, material);
          line.computeLineDistances();
          line.userData.edgeIndex = edge.edgeIndex;
          line.userData.isFilletEdge = true;
          line.renderOrder = 999;

          group.add(line);
        }

        scene.add(group);
        edgeOverlayGroupRef.current = group;
        forceSceneUpdate();
      } catch (error) {
        console.error("[useFilletMode] Failed to build edge overlays:", error);
      }
    },
    [
      elements,
      scene,
      forceSceneUpdate,
      cleanupEdgeOverlay,
      edgeOverlayGroupRef,
      edgeSegmentsRef,
    ],
  );

  /**
   * Update edge overlay colors based on selection/hover state.
   * Single source of truth for edge visibility, never set opacity inline elsewhere.
   */
  const updateEdgeColors = useCallback(
    (selectedIndices: number[], hoveredIndex: number | null) => {
      if (!edgeOverlayGroupRef.current) return;

      edgeOverlayGroupRef.current.children.forEach((child) => {
        if (child instanceof Line2 && child.userData.isFilletEdge) {
          const idx = child.userData.edgeIndex;
          const mat = child.material as LineMaterial;

          if (selectedIndices.includes(idx)) {
            mat.color.set(FILLET.edgeHighlight);
            mat.opacity = 1.0;
          } else if (idx === hoveredIndex) {
            mat.color.set(FILLET.edgeHover);
            mat.opacity = 1.0;
          } else {
            mat.opacity = 0;
          }
        }
      });
    },
    [edgeOverlayGroupRef],
  );

  /**
   * Select a body by id (extracted so menu picks and direct clicks share it).
   * Fire-and-forget: clicking returns immediately, overlays appear when ready.
   */
  const selectBodyById = useCallback(
    (elementId: string) => {
      if (elementId === state.selectedElement) return;
      const el = elements.find((e) => e.nodeId === elementId);
      if (!el) return;
      cleanupEdgeOverlay();
      resetSelectedBody();
      tintSelectedBody(elementId);
      originalBrepRef.current = el.brep;
      setState((prev) => ({
        ...prev,
        selectedElement: elementId,
        selectedEdgeIndices: [],
        hoveredEdgeIndex: null,
        showDimensionInput: false,
      }));
      buildEdgeOverlays(elementId);
    },
    [
      elements,
      state.selectedElement,
      cleanupEdgeOverlay,
      buildEdgeOverlays,
      originalBrepRef,
      setState,
      tintSelectedBody,
      resetSelectedBody,
    ],
  );

  return {
    cleanupEdgeOverlay,
    buildEdgeOverlays,
    updateEdgeColors,
    selectBodyById,
  };
}

export type FilletEdgeOverlayBag = ReturnType<typeof useFilletEdgeOverlay>;
