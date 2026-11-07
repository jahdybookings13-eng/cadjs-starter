import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { MeasureSubMode, Measurement } from "../scene-operations/measure-types";
import { useEdgeOverlay } from "./measure/hooks/useEdgeOverlay";
import { useMeasureInputHandlers } from "./measure/hooks/useMeasureInputHandlers";
import { useMeasurementSelection } from "./measure/hooks/useMeasurementSelection";
import { useMeasurementState } from "./measure/hooks/useMeasurementState";

export interface UseMeasureModeResult {
  subMode: MeasureSubMode;
  statusText: string;
  firstPoint: THREE.Vector3 | null;
  firstEdge: { elementId: string; edgeIndex: number } | null;
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseMove: (event: MouseEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  setSubMode: (newSubMode: MeasureSubMode) => void;
  clearTemporaryMeasurements: () => void;
  cleanup: () => void;
  measurements: Measurement[];
  selectedMeasurementId: string | null;
  selectMeasurement: (id: string | null) => void;
  pinMeasurement: (id?: string) => boolean;
  unpinMeasurement: (id?: string) => boolean;
  deleteMeasurement: (id?: string) => boolean;
}

export function useMeasureMode(): UseMeasureModeResult {
  const stateBag = useMeasurementState();
  const selection = useMeasurementSelection({ stateBag });
  const edgeOverlay = useEdgeOverlay();

  const {
    state,
    setState,
    cleanupPreview,
    cleanupOverlays,
    cleanupMeasurements,
    resetBodyHover,
    setSelectedMeasurementId,
    measurementsRef,
    selectedMeasurementId,
    clearTemporaryMeasurements,
    pinMeasurement,
    unpinMeasurement,
    deleteMeasurement,
  } = stateBag;
  const { clearEdgeOverlay } = edgeOverlay;

  const setSubMode = useCallback(
    (newSubMode: MeasureSubMode) => {
      cleanupPreview();
      cleanupOverlays();
      clearEdgeOverlay();
      resetBodyHover();

      setState({
        subMode: newSubMode,
        firstPoint: null,
        hoveredEdgeIndex: null,
        hoveredElementId: null,
        firstEdge: null,
        secondEdge: null,
        statusText:
          newSubMode === "distance"
            ? "Click first point"
            : newSubMode === "edge-length"
              ? "Hover over an edge and click"
              : "Click first edge",
      });
    },
    [
      cleanupPreview,
      cleanupOverlays,
      clearEdgeOverlay,
      resetBodyHover,
      setState,
    ],
  );

  const handlers = useMeasureInputHandlers({
    stateBag,
    selection,
    edgeOverlay,
    setSubMode,
  });

  const cleanup = useCallback(() => {
    cleanupPreview();
    cleanupOverlays();
    clearEdgeOverlay();
    cleanupMeasurements();
    resetBodyHover();
    setSelectedMeasurementId(null);

    setState({
      subMode: "distance",
      firstPoint: null,
      hoveredEdgeIndex: null,
      hoveredElementId: null,
      firstEdge: null,
      secondEdge: null,
      statusText: "Click first point",
    });
  }, [
    cleanupPreview,
    cleanupOverlays,
    clearEdgeOverlay,
    cleanupMeasurements,
    resetBodyHover,
    setSelectedMeasurementId,
    setState,
  ]);

  // Mode-content registry mounts this hook only while mode === "measure", so unmount
  // == leaving the mode. Latest closure pinned via ref; unmount effect runs once.
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  useEffect(() => () => cleanupRef.current(), []);

  return {
    subMode: state.subMode,
    statusText: state.statusText,
    firstPoint: state.firstPoint,
    firstEdge: state.firstEdge,
    handleMouseDown: handlers.handleMouseDown,
    handleMouseMove: handlers.handleMouseMove,
    handleKeyDown: handlers.handleKeyDown,
    setSubMode,
    clearTemporaryMeasurements,
    cleanup,
    measurements: measurementsRef.current,
    selectedMeasurementId,
    selectMeasurement: selection.selectMeasurement,
    pinMeasurement,
    unpinMeasurement,
    deleteMeasurement,
  };
}
