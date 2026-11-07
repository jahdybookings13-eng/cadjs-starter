import { useCallback, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useCadCore } from "../contexts/CoreContext";
import { useCadVisualizer } from "../contexts/VisualizerContext";
import { debugLog } from "../config";
import {
  Sketch,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  SketchPrimitive,
  SketchConstraint,
  ConstraintType,
  ConstraintResultStatus,
  SketchPlane,
  SketchPlaneType,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  createSketchPlane,
  createSketchPlaneFromNormal,
} from "../types/sketch-types";
import {
  useSketchInference,
  InferencePoint,
  Guideline,
} from "./useSketchInference";
import {
  findAllIntersections,
  identifyTrimSegment,
  findClosestEndpoint,
  findNearestExtendTarget,
  findNearestArcExtendTarget,
  normalizeAngle,
  isAngleInArcRange,
  getArcAngles,
  IntersectionResult,
} from "../scene-operations/sketch-intersection-utils";
import {
  trimLineAtSegment,
  convertCircleToArc,
} from "../scene-operations/sketch-operations";
import {
  SKETCH as SKETCH_THEME,
  INFERENCE,
  SKETCH_PLANE as PLANE_THEME,
  BODY as BODY_THEME,
} from "../theme";
import {
  SketchSubMode,
  PendingLineDimension,
  SketchContextMenu,
} from "./sketch/types";
import {
  SKETCH_CONFIG,
  COLORS,
  pointToLineDistance,
  createLine2FromPoints,
  getPixelsPerUnit,
  screenPxToSketchUnits,
  getAdaptiveSegments,
  createConstraintGlyph,
  createLinePreview,
  createRectanglePreview,
  createCirclePreview,
  worldToSketch2D,
  snapToGrid,
} from "./sketch/sketch-helpers";
import { useSketchPlaneSelection } from "./sketch/hooks/useSketchPlaneSelection";
import { useSketchSceneVisuals } from "./sketch/hooks/useSketchSceneVisuals";
import { useRaycastToObjects } from "./shared/useRaycastToObjects";
import { useSketchInferenceRender } from "./sketch/hooks/useSketchInferenceRender";
import { useSketchTrimExtend } from "./sketch/hooks/useSketchTrimExtend";
import { useSketchDrawing } from "./sketch/hooks/useSketchDrawing";
import { useSketchSelection } from "./sketch/hooks/useSketchSelection";
import { useSketchConstraints } from "./sketch/hooks/useSketchConstraints";
import { useSketchRender } from "./sketch/hooks/useSketchRender";
import { useSketchInputHandlers } from "./sketch/hooks/useSketchInputHandlers";

export type { SketchSubMode, PendingLineDimension, SketchContextMenu };

export interface UseSketchModeResult {
  sketchSubMode: SketchSubMode;
  setSketchSubMode: (mode: SketchSubMode) => void;
  handleSketchMode: (event: MouseEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  cleanupSketchPreview: () => void;
  sketchObjects: THREE.Object3D[];
  startNewSketch: () => void;
  selectedPrimitives: string[];
  selectPrimitive: (id: string, addToSelection: boolean) => void;
  clearSelection: () => void;
  applyConstraint: (type: ConstraintType, value?: number) => void;
  isChaining: boolean;
  cancelCurrentOperation: () => void;
  currentInferencePoint: InferencePoint | null;
  guidelines: Guideline[];
  // New: For dimension input after line creation
  pendingLineDimension: PendingLineDimension | null;
  clearPendingLineDimension: () => void;
  applyLineLengthConstraint: (lineId: string, length: number) => Promise<void>;
  // Context menu for right-click constraints
  contextMenu: SketchContextMenu;
  closeContextMenu: () => void;
  applyConstraintToContextMenuPrimitives: (
    type: ConstraintType,
    value?: number,
  ) => Promise<void>;
  deleteConstraint: (constraintId: string) => void;
  deleteSelectedPrimitives: () => void;
  // Pre-fill & live preview for constraint value input
  getCurrentValueForConstraint: (type: ConstraintType) => number | undefined;
  handleConstraintPreviewChange: (
    type: ConstraintType,
    value: number,
    overridePrimitiveIds?: string[],
  ) => void;
  handleConstraintPreviewCancel: () => void;
  // Plane selection (Fusion 360 style)
  isSelectingPlane: boolean;
  hoveredPlane: SketchPlaneType | null;
  enterPlaneSelectionMode: () => void;
  cancelPlaneSelection: () => void;
  selectPlaneAndStartSketch: (
    planeOrType: SketchPlane | SketchPlaneType,
    offset?: number,
  ) => void;
  cleanupSketchGrid: () => void;
  handlePlaneSelectionMouseMove: (event: MouseEvent) => void;
  handlePlaneSelectionClick: (event: MouseEvent) => void;
  setPlaneOffset: (v: number) => void;
  // Fix/unfix points
  toggleFixPoint: () => void;
  // Constraint feedback (redundant/conflicting rollback)
  constraintFeedback: {
    message: string;
    type: "redundant" | "conflicting";
  } | null;
  // Editing constraint value (double-click)
  editingConstraintId: string | null;
}

export function useSketchMode(
  vrMode = false,
  polygonSides = 6,
  conicRho = 0.5,
): UseSketchModeResult {
  const {
    activeSketch,
    addPrimitive,
    updatePrimitive,
    removePrimitive,
    updatePrimitivesAndSolve,
    addConstraintAndSolve,
    previewConstraint,
    cancelConstraintPreview,
    commitConstraintPreview,
    removeConstraint,
    updateConstraint,
    startSketch,
    solveSketch,
    mode,
    elements,
    getObject,
    pushSketchUndo,
    editingSketchId,
  } = useCadCore();

  const {
    scene,
    camera,
    renderer,
    getMouseIntersection,
    showGroundPlane,
    toggleGroundPlane,
    sceneReady,
    setCameraRotationEnabled,
    setDrawingPlane,
    projectionType,
    setProjectionType,
    navToolActiveRef,
    controlsRef,
    gridSpacing,
    gridSnapEnabled,
  } = useCadVisualizer();

  const [sketchSubMode, setSketchSubMode] = useState<SketchSubMode>("line");
  const sketchObjectsRef = useRef<THREE.Object3D[]>([]);

  const {
    findInferencePoints,
    findNearestSnap,
    findGuidelines,
    isHorizontalAligned,
    isVerticalAligned,
  } = useSketchInference();

  const [currentInferencePoint, setCurrentInferencePoint] =
    useState<InferencePoint | null>(null);
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);

  // Holding Ctrl suppresses snapping, guidelines, and auto H/V.
  const ctrlHeldRef = useRef(false);

  const projectionTypeRef = useRef(projectionType);
  useEffect(() => {
    projectionTypeRef.current = projectionType;
  }, [projectionType]);

  // Owned here so mode-exit cleanup, the editingSketchId resume effect, and the plane
  // sub-hook can all read/write the same entry-state.
  const sketchHidGroundPlaneRef = useRef(false);
  const originalProjectionRef = useRef<"perspective" | "orthographic" | null>(
    null,
  );
  const cameraAnimFrameRef = useRef<number | null>(null);

  const sceneVisuals = useSketchSceneVisuals({
    activeSketch,
    editingSketchId,
    cameraAnimFrameRef,
    sketchHidGroundPlaneRef,
    originalProjectionRef,
    projectionTypeRef,
    vrMode,
  });
  const {
    dimSceneBodies,
    restoreSceneBodies,
    createSketchGrid,
    cleanupSketchGrid,
    orientCameraToPlane,
  } = sceneVisuals;

  const idCounterRef = useRef(0);

  const { raycastToObjects } = useRaycastToObjects(
    SKETCH_CONFIG.LINE_HIT_THRESHOLD,
  );

  // Drawing sub-hook reads this for auto-coincident detection.
  const lastSnapRef = useRef<InferencePoint | null>(null);

  const [contextMenu, setContextMenu] = useState<SketchContextMenu>({
    visible: false,
    x: 0,
    y: 0,
    primitiveIds: [],
    primitiveTypes: [],
  });

  const [constraintFeedback, setConstraintFeedback] = useState<{
    message: string;
    type: "redundant" | "conflicting";
  } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedConstraintId, setSelectedConstraintId] = useState<
    string | null
  >(null);

  const [editingConstraintId, setEditingConstraintId] = useState<string | null>(
    null,
  );

  const isPreviewingRef = useRef(false);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewConstraintIdRef = useRef<string | null>(null);

  // Drag handlers read activeSketch through this ref to avoid stale-closure bugs.
  const activeSketchRef = useRef(activeSketch);

  // Populated by the render effect; the click handler uses it to project 2D points to 3D.
  const sketchTo3DRef = useRef<
    (x: number, y: number, zOffset?: number) => THREE.Vector3
  >((x, y, zOffset = 0) => new THREE.Vector3(x, y, zOffset));

  const inferenceRender = useSketchInferenceRender({ sketchTo3DRef });
  const { cleanupInferenceObjects, renderInferencePoint, renderGuidelines } =
    inferenceRender;

  const showConstraintFeedback = useCallback(
    (status: ConstraintResultStatus) => {
      if (status === "applied" || status === "failed") return;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      const message =
        status === "redundant"
          ? "Constraint already satisfied"
          : "Constraint conflicts with existing constraints";
      setConstraintFeedback({ message, type: status });
      feedbackTimerRef.current = setTimeout(() => {
        setConstraintFeedback(null);
        feedbackTimerRef.current = null;
      }, 3000);
    },
    [],
  );

  const {
    INFERENCE_SNAP_DISTANCE,
    ALIGNMENT_TOLERANCE,
    DOUBLE_CLICK_THRESHOLD,
    SNAP_DISTANCE,
    GLYPH_DRAG_THRESHOLD_PX,
  } = SKETCH_CONFIG;

  useEffect(() => {
    activeSketchRef.current = activeSketch;
  }, [activeSketch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") ctrlHeldRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") ctrlHeldRef.current = false;
    };
    const onBlur = () => {
      ctrlHeldRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const generateId = useCallback((prefix: string) => {
    idCounterRef.current += 1;
    return `${prefix}_${idCounterRef.current}`;
  }, []);

  const trimExtend = useSketchTrimExtend({ generateId, sketchTo3DRef });
  const { cleanupTrimHighlight, handleTrimMode, handleExtendMode } = trimExtend;

  const drawing = useSketchDrawing({
    generateId,
    sketchTo3DRef,
    cleanupInferenceObjects,
    showConstraintFeedback,
    ctrlHeldRef,
    lastSnapRef,
    polygonSides,
    conicRho,
  });
  const {
    isChaining,
    pendingLineDimension,
    handleLineDraw,
    handleMidpointLineDraw,
    handleRectangleDraw,
    handleCenterRectangleDraw,
    handleSlotDraw,
    handlePolygonDraw,
    handleEllipseDraw,
    handleEllipticalArcDraw,
    handleSplineDraw,
    handleBezierDraw,
    handleConicDraw,
    handleSplitDraw,
    handleCircleDraw,
    handleCircle3PointDraw,
    handleArcDraw,
    handlePointDraw,
    cancelCurrentOperation,
    clearPendingLineDimension,
    applyLineLengthConstraint,
    cleanupDrawingPreview,
  } = drawing;

  // Defined before useSketchSelection so the selection hook can receive it; the right-click
  // cancel paths and the consumer both call this.
  const closeContextMenu = useCallback(() => {
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
      previewDebounceRef.current = null;
    }
    if (isPreviewingRef.current) {
      cancelConstraintPreview();
      isPreviewingRef.current = false;
      previewConstraintIdRef.current = null;
    }
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      primitiveIds: [],
      primitiveTypes: [],
    });
  }, [cancelConstraintPreview]);

  const selection = useSketchSelection({
    generateId,
    sketchTo3DRef,
    activeSketchRef,
    setSelectedConstraintId,
    setEditingConstraintId,
    setContextMenu,
    closeContextMenu,
    sketchObjectsRef,
  });
  const {
    selectedPrimitives,
    selectPrimitive,
    clearSelection,
    handleSelectMode,
    cleanupGlyphDrag,
    isGlyphDraggingActiveRef,
  } = selection;

  const constraints = useSketchConstraints({
    generateId,
    activeSketchRef,
    selectedPrimitives,
    clearSelection,
    contextMenu,
    setContextMenu,
    closeContextMenu,
    setSelectedConstraintId,
    showConstraintFeedback,
    isPreviewingRef,
    previewDebounceRef,
    previewConstraintIdRef,
  });
  const {
    applyConstraint,
    getCurrentValueForConstraint,
    handleConstraintPreviewChange,
    handleConstraintPreviewCancel,
    deleteConstraint,
    toggleFixPoint,
    deleteSelectedPrimitives,
    applyConstraintToContextMenuPrimitives,
  } = constraints;

  const cleanupSketchPreview = useCallback(() => {
    cleanupDrawingPreview();
    cleanupTrimHighlight();
    cleanupGlyphDrag();
  }, [cleanupDrawingPreview, cleanupTrimHighlight, cleanupGlyphDrag]);

  const planeSelection = useSketchPlaneSelection({
    cameraAnimFrameRef,
    sketchHidGroundPlaneRef,
    originalProjectionRef,
    projectionTypeRef,
    dimSceneBodies,
    orientCameraToPlane,
    createSketchGrid,
    cleanupSketchGrid,
    raycastToObjects,
  });

  const startNewSketch = useCallback(() => {
    planeSelection.enterPlaneSelectionMode();
  }, [planeSelection.enterPlaneSelectionMode]);

  useSketchRender({
    sketchObjectsRef,
    sketchTo3DRef,
    selectedPrimitives,
    sketchSubMode,
    selectedConstraintId,
  });

  const { handleSketchMode, handleKeyDown } = useSketchInputHandlers({
    mode,
    sketchSubMode,
    setSketchSubMode,
    activeSketch,
    ctrlHeldRef,
    lastSnapRef,
    handleLineDraw,
    handleMidpointLineDraw,
    handleRectangleDraw,
    handleCenterRectangleDraw,
    handleSlotDraw,
    handlePolygonDraw,
    handleEllipseDraw,
    handleEllipticalArcDraw,
    handleSplineDraw,
    handleBezierDraw,
    handleConicDraw,
    handleSplitDraw,
    handleCircleDraw,
    handleCircle3PointDraw,
    handleArcDraw,
    handlePointDraw,
    handleSelectMode,
    handleTrimMode,
    handleExtendMode,
    cancelCurrentOperation,
    isDrawingActive: drawing.isDrawingActive,
    getChainStartPoint: drawing.getChainStartPoint,
    isSelectingPlane: planeSelection.isSelectingPlane,
    cancelPlaneSelection: planeSelection.cancelPlaneSelection,
    isGlyphDraggingActiveRef,
    renderInferencePoint,
    renderGuidelines,
    cleanupInferenceObjects,
    findInferencePoints,
    findNearestSnap,
    findGuidelines,
    setCurrentInferencePoint,
    setGuidelines,
    selectedPrimitives,
    clearSelection,
    selectedConstraintId,
    setSelectedConstraintId,
    pushSketchUndo,
    removeConstraint,
    removePrimitive,
    solveSketch,
    updatePrimitive,
  });

  // The hook is now mounted only while sketch mode is active (R5 mode-content registry),
  // so "leaving sketch" == component unmount. Sync a ref each render with the latest
  // closure of cleanup callbacks; the unmount effect calls it once.
  const exitCleanupRef = useRef<() => void>(() => {});
  useEffect(() => {
    exitCleanupRef.current = () => {
      if (cameraAnimFrameRef.current !== null) {
        cancelAnimationFrame(cameraAnimFrameRef.current);
        cameraAnimFrameRef.current = null;
      }

      cleanupInferenceObjects();
      cleanupSketchGrid();
      planeSelection.cancelPlaneSelection();
      setCurrentInferencePoint(null);
      setGuidelines([]);

      if (!vrMode) {
        restoreSceneBodies();

        if (sketchHidGroundPlaneRef.current) {
          toggleGroundPlane();
          sketchHidGroundPlaneRef.current = false;
        }

        if (originalProjectionRef.current !== null) {
          setProjectionType(originalProjectionRef.current);
          originalProjectionRef.current = null;
        }

        setCameraRotationEnabled(true);

        setDrawingPlane(new THREE.Vector3(0, 0, 1));
      }
    };
  });

  useEffect(() => () => exitCleanupRef.current(), []);

  return {
    sketchSubMode,
    setSketchSubMode,
    handleSketchMode,
    handleKeyDown,
    cleanupSketchPreview,
    sketchObjects: sketchObjectsRef.current,
    startNewSketch,
    selectedPrimitives,
    selectPrimitive,
    clearSelection,
    applyConstraint,
    isChaining,
    cancelCurrentOperation,
    currentInferencePoint,
    guidelines,
    // Dimension input after line creation
    pendingLineDimension,
    clearPendingLineDimension,
    applyLineLengthConstraint,
    // Context menu for right-click constraints
    contextMenu,
    closeContextMenu,
    applyConstraintToContextMenuPrimitives,
    deleteConstraint,
    deleteSelectedPrimitives,
    // Pre-fill & live preview for constraint value input
    getCurrentValueForConstraint,
    handleConstraintPreviewChange,
    handleConstraintPreviewCancel,
    // Plane selection (Fusion 360 style)
    isSelectingPlane: planeSelection.isSelectingPlane,
    hoveredPlane: planeSelection.hoveredPlane,
    enterPlaneSelectionMode: planeSelection.enterPlaneSelectionMode,
    cancelPlaneSelection: planeSelection.cancelPlaneSelection,
    selectPlaneAndStartSketch: planeSelection.selectPlaneAndStartSketch,
    cleanupSketchGrid,
    handlePlaneSelectionMouseMove: planeSelection.handlePlaneSelectionMouseMove,
    handlePlaneSelectionClick: planeSelection.handlePlaneSelectionClick,
    setPlaneOffset: planeSelection.setPlaneOffset,
    // Fix/unfix points
    toggleFixPoint,
    // Constraint feedback (redundant/conflicting rollback)
    constraintFeedback,
    // Editing constraint value (double-click)
    editingConstraintId,
  };
}
