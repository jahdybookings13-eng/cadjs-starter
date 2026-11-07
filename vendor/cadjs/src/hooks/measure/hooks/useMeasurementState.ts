import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { disposeMeasureOverlay } from "../../../scene-operations/measure-operations";
import { Measurement } from "../../../scene-operations/measure-types";
import { BODY, MEASURE } from "../../../theme";
import {
  buildAngleAnnotation,
  buildDistanceAnnotation,
  buildEdgeLengthAnnotation,
  tagOverlays,
} from "../measure-rendering";
import type { EdgeSegmentData, MeasureState } from "../types";

export function useMeasurementState() {
  const {
    pinnedMeasurements,
    addPinnedMeasurement,
    removePinnedMeasurement,
    getObject,
  } = useCadCore();
  const { scene, forceSceneUpdate } = useCadVisualizer();

  const [state, setState] = useState<MeasureState>({
    subMode: "distance",
    firstPoint: null,
    hoveredEdgeIndex: null,
    hoveredElementId: null,
    firstEdge: null,
    secondEdge: null,
    statusText: "Click first point",
  });

  const overlayObjectsRef = useRef<THREE.Object3D[]>([]);
  const previewObjectsRef = useRef<THREE.Object3D[]>([]);
  const measurementsRef = useRef<Measurement[]>([]);
  const hoveredBodyRef = useRef<string | null>(null);
  const measureIdRef = useRef(0);

  const [selectedMeasurementId, setSelectedMeasurementId] = useState<
    string | null
  >(null);
  const selectedMeasurementIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedMeasurementIdRef.current = selectedMeasurementId;
  }, [selectedMeasurementId]);

  const pinnedMeasurementsRef = useRef(pinnedMeasurements);
  useEffect(() => {
    pinnedMeasurementsRef.current = pinnedMeasurements;
  }, [pinnedMeasurements]);

  const [, setMeasurementVersion] = useState(0);
  const bumpVersion = useCallback(
    () => setMeasurementVersion((v) => v + 1),
    [],
  );

  const cleanupPreview = useCallback(() => {
    for (const obj of previewObjectsRef.current) {
      disposeMeasureOverlay(obj);
    }
    previewObjectsRef.current = [];
  }, []);

  const cleanupOverlays = useCallback(() => {
    for (const obj of overlayObjectsRef.current) {
      disposeMeasureOverlay(obj);
    }
    overlayObjectsRef.current = [];
  }, []);

  const cleanupMeasurements = useCallback(() => {
    for (const m of measurementsRef.current) {
      for (const obj of m.overlayObjects) {
        disposeMeasureOverlay(obj);
      }
    }
    measurementsRef.current = [];
    bumpVersion();
  }, [bumpVersion]);

  const resetBodyHover = useCallback(() => {
    if (hoveredBodyRef.current) {
      const obj = getObject(hoveredBodyRef.current);
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
      hoveredBodyRef.current = null;
    }
  }, [getObject]);

  const findMeasurementById = useCallback((id: string): Measurement | null => {
    const temp = measurementsRef.current.find((m) => m.id === id);
    if (temp) return temp;
    return pinnedMeasurementsRef.current.find((m) => m.id === id) ?? null;
  }, []);

  const clearTemporaryMeasurements = useCallback(() => {
    cleanupMeasurements();
    setSelectedMeasurementId(null);
    forceSceneUpdate();
  }, [cleanupMeasurements, forceSceneUpdate]);

  const pinMeasurement = useCallback(
    (id?: string): boolean => {
      const targetId = id ?? selectedMeasurementIdRef.current;
      const resolvedId =
        targetId ??
        (measurementsRef.current.length > 0
          ? measurementsRef.current[measurementsRef.current.length - 1]!.id
          : null);
      if (!resolvedId) return false;

      const measurement = measurementsRef.current.find(
        (m) => m.id === resolvedId,
      );
      if (!measurement || measurement.pinned) return false;

      for (const obj of measurement.overlayObjects) {
        if (obj instanceof Line2) {
          (obj.material as LineMaterial).color.set(MEASURE.pinnedLine);
        }
      }

      measurementsRef.current = measurementsRef.current.filter(
        (m) => m.id !== resolvedId,
      );
      addPinnedMeasurement(measurement);
      if (selectedMeasurementIdRef.current === resolvedId) {
        selectedMeasurementIdRef.current = null;
        setSelectedMeasurementId(null);
      }
      bumpVersion();
      return true;
    },
    [addPinnedMeasurement, bumpVersion],
  );

  const unpinMeasurement = useCallback(
    (id?: string): boolean => {
      const targetId = id ?? selectedMeasurementIdRef.current;
      if (!targetId) return false;
      const measurement = pinnedMeasurementsRef.current.find(
        (m) => m.id === targetId,
      );
      if (!measurement) return false;

      removePinnedMeasurement(measurement.id);

      let newOverlays: THREE.Object3D[] = [];
      if (measurement.type === "distance") {
        newOverlays = buildDistanceAnnotation(
          measurement.pointA,
          measurement.pointB,
          measurement.distance,
          false,
        );
      } else if (measurement.type === "edge-length") {
        const edgeData: EdgeSegmentData = {
          edgeIndex: measurement.edgeIndex,
          segments: measurement.edgeSegments,
          midpoint: measurement.midpoint,
        };
        newOverlays = buildEdgeLengthAnnotation(
          edgeData,
          measurement.length,
          false,
        );
      } else if (measurement.type === "angle") {
        newOverlays = buildAngleAnnotation(
          measurement.vertex,
          measurement.directionA,
          measurement.directionB,
          measurement.angleDegrees,
          false,
        );
      }
      if (scene) {
        for (const obj of newOverlays) scene.add(obj);
      }

      measureIdRef.current++;
      const newId = `measure-${measureIdRef.current}`;
      tagOverlays(newOverlays, newId);

      const newMeasurement: Measurement = {
        ...measurement,
        id: newId,
        pinned: false,
        overlayObjects: newOverlays,
      };
      measurementsRef.current.push(newMeasurement);
      if (selectedMeasurementIdRef.current === targetId) {
        selectedMeasurementIdRef.current = null;
        setSelectedMeasurementId(null);
      }
      bumpVersion();
      forceSceneUpdate();
      return true;
    },
    [removePinnedMeasurement, scene, forceSceneUpdate, bumpVersion],
  );

  const deleteMeasurement = useCallback(
    (id?: string): boolean => {
      const targetId = id ?? selectedMeasurementIdRef.current;
      if (!targetId) return false;

      const tempIdx = measurementsRef.current.findIndex(
        (m) => m.id === targetId,
      );
      if (tempIdx !== -1) {
        const measurement = measurementsRef.current[tempIdx]!;
        for (const obj of measurement.overlayObjects) {
          disposeMeasureOverlay(obj);
        }
        measurementsRef.current.splice(tempIdx, 1);
        if (selectedMeasurementIdRef.current === targetId) {
          selectedMeasurementIdRef.current = null;
          setSelectedMeasurementId(null);
        }
        bumpVersion();
        forceSceneUpdate();
        return true;
      }

      const pinned = pinnedMeasurementsRef.current.find(
        (m) => m.id === targetId,
      );
      if (pinned) {
        removePinnedMeasurement(pinned.id);
        if (selectedMeasurementIdRef.current === targetId) {
          selectedMeasurementIdRef.current = null;
          setSelectedMeasurementId(null);
        }
        forceSceneUpdate();
        return true;
      }

      return false;
    },
    [removePinnedMeasurement, forceSceneUpdate, bumpVersion],
  );

  return {
    state,
    setState,
    overlayObjectsRef,
    previewObjectsRef,
    measurementsRef,
    hoveredBodyRef,
    measureIdRef,
    selectedMeasurementId,
    selectedMeasurementIdRef,
    setSelectedMeasurementId,
    pinnedMeasurementsRef,
    bumpVersion,
    cleanupPreview,
    cleanupOverlays,
    cleanupMeasurements,
    resetBodyHover,
    findMeasurementById,
    clearTemporaryMeasurements,
    pinMeasurement,
    unpinMeasurement,
    deleteMeasurement,
  };
}

export type MeasurementStateBag = ReturnType<typeof useMeasurementState>;
