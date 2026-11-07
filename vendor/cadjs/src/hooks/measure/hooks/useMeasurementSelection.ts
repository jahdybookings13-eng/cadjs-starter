import { useCallback } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { Measurement } from "../../../scene-operations/measure-types";
import { MEASURE, SELECTION } from "../../../theme";
import type { MeasurementStateBag } from "./useMeasurementState";

interface UseMeasurementSelectionParams {
  stateBag: MeasurementStateBag;
}

export function useMeasurementSelection({
  stateBag,
}: UseMeasurementSelectionParams) {
  const { forceSceneUpdate } = useCadVisualizer();
  const {
    findMeasurementById,
    selectedMeasurementIdRef,
    setSelectedMeasurementId,
  } = stateBag;

  const highlightMeasurement = useCallback(
    (measurement: Measurement) => {
      for (const obj of measurement.overlayObjects) {
        if (obj instanceof Line2) {
          (obj.material as LineMaterial).color.set(SELECTION.selected);
          (obj.material as LineMaterial).linewidth = 2.5;
        }
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.isMeasureOverlay) {
            (child.material as THREE.MeshBasicMaterial).color.set(
              SELECTION.selected,
            );
          }
        });
      }
      forceSceneUpdate();
    },
    [forceSceneUpdate],
  );

  const unhighlightMeasurement = useCallback(
    (measurement: Measurement) => {
      const isPinned = measurement.pinned;
      const lineColor = isPinned
        ? MEASURE.pinnedLine
        : measurement.type === "angle"
          ? MEASURE.angleArc
          : measurement.type === "edge-length"
            ? MEASURE.edgeHighlight
            : MEASURE.line;
      const lineWidth = measurement.type === "edge-length" ? 2.0 : 1.5;
      const pointColor = isPinned ? MEASURE.pinnedLine : MEASURE.point;

      for (const obj of measurement.overlayObjects) {
        if (obj instanceof Line2) {
          (obj.material as LineMaterial).color.set(lineColor);
          (obj.material as LineMaterial).linewidth = lineWidth;
        }
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.isMeasureOverlay) {
            (child.material as THREE.MeshBasicMaterial).color.set(pointColor);
          }
        });
      }
      forceSceneUpdate();
    },
    [forceSceneUpdate],
  );

  const selectMeasurement = useCallback(
    (id: string | null) => {
      const prevId = selectedMeasurementIdRef.current;
      if (prevId) {
        const prev = findMeasurementById(prevId);
        if (prev) unhighlightMeasurement(prev);
      }
      if (id) {
        const next = findMeasurementById(id);
        if (next) highlightMeasurement(next);
      }
      selectedMeasurementIdRef.current = id;
      setSelectedMeasurementId(id);
    },
    [
      findMeasurementById,
      highlightMeasurement,
      unhighlightMeasurement,
      selectedMeasurementIdRef,
      setSelectedMeasurementId,
    ],
  );

  return {
    selectMeasurement,
    highlightMeasurement,
    unhighlightMeasurement,
  };
}

export type MeasurementSelection = ReturnType<typeof useMeasurementSelection>;
