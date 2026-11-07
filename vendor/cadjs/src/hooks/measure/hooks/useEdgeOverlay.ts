import { useCallback, useRef } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { OccWorkerClient } from "../../../services/OccWorkerClient";
import type {
  EulerJSON,
  WorkerEdgeAnalysisResult,
} from "../../../workers/occ-worker-types";
import { FILLET, MEASURE } from "../../../theme";
import { toEulerJSON, toVec3 } from "../../../vectorHelpers";
import type { EdgeSegmentData } from "../types";

export function useEdgeOverlay() {
  const { elements } = useCadCore();
  const { scene, forceSceneUpdate } = useCadVisualizer();

  const edgeOverlayGroupRef = useRef<THREE.Group | null>(null);
  const edgeSegmentsRef = useRef<EdgeSegmentData[]>([]);
  const activeElementRef = useRef<string | null>(null);

  const clearEdgeOverlay = useCallback(() => {
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
    activeElementRef.current = null;
  }, [scene]);

  const buildEdgeOverlays = useCallback(
    async (nodeId: string) => {
      if (!scene) return;
      if (activeElementRef.current === nodeId) return;
      clearEdgeOverlay();

      const element = elements.find((el) => el.nodeId === nodeId);
      if (!element) return;

      try {
        const client = OccWorkerClient.getInstance();
        const rotation =
          element.rotation &&
          (element.rotation.x !== 0 ||
            element.rotation.y !== 0 ||
            element.rotation.z !== 0)
            ? (toEulerJSON(element.rotation) as EulerJSON)
            : undefined;

        const analysisResult = await client.send<WorkerEdgeAnalysisResult>({
          type: "edgeAnalysis",
          payload: {
            brepJson: element.brep.toJSON(),
            position: toVec3(element.position),
            occBrep: element.occBrep,
            rotation,
            allEdges: true,
          },
        });

        const edgeData = analysisResult.edges;
        edgeSegmentsRef.current = edgeData;
        activeElementRef.current = nodeId;

        const group = new THREE.Group();
        group.userData.isMeasureEdgeOverlay = true;

        for (const edge of edgeData) {
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
            color: MEASURE.edgeHighlight,
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
          line.userData.isMeasureEdge = true;
          line.renderOrder = 999;

          group.add(line);
        }

        scene.add(group);
        edgeOverlayGroupRef.current = group;
        forceSceneUpdate();
      } catch (error) {
        console.error("[useMeasureMode] Failed to build edge overlays:", error);
      }
    },
    [elements, scene, forceSceneUpdate, clearEdgeOverlay],
  );

  return {
    edgeOverlayGroupRef,
    edgeSegmentsRef,
    activeElementRef,
    buildEdgeOverlays,
    clearEdgeOverlay,
  };
}

export type EdgeOverlayBag = ReturnType<typeof useEdgeOverlay>;
