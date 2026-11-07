import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  Sketch,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
} from "../../../types/sketch-types";
import { InferencePoint, Guideline } from "../../useSketchInference";
import { SketchSubMode } from "../types";
import { SKETCH_CONFIG, snapToGrid, worldToSketch2D } from "../sketch-helpers";
import { useRaycastToObjects } from "../../shared/useRaycastToObjects";
import { createModeInputHandlers } from "../../shared/createModeInputHandlers";
import { useModeInputHoldRefs } from "../../shared/useModeInputHoldRefs";

interface UseSketchInputHandlersParams {
  // Mode/state
  mode: string;
  sketchSubMode: SketchSubMode;
  setSketchSubMode: (m: SketchSubMode) => void;
  activeSketch: Sketch | null;
  // Refs
  ctrlHeldRef: React.MutableRefObject<boolean>;
  lastSnapRef: React.MutableRefObject<InferencePoint | null>;
  // Sub-hook handlers
  handleLineDraw: (event: MouseEvent, point: THREE.Vector3) => Promise<void>;
  handleMidpointLineDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleRectangleDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleCenterRectangleDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleSlotDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handlePolygonDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleCircleDraw: (event: MouseEvent, point: THREE.Vector3) => Promise<void>;
  handleCircle3PointDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleEllipseDraw: (event: MouseEvent, point: THREE.Vector3) => Promise<void>;
  handleEllipticalArcDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleSplineDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleBezierDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleConicDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleSplitDraw: (
    event: MouseEvent,
    point: THREE.Vector3,
  ) => Promise<void>;
  handleArcDraw: (event: MouseEvent, point: THREE.Vector3) => Promise<void>;
  handlePointDraw: (event: MouseEvent, point: THREE.Vector3) => Promise<void>;
  handleSelectMode: (event: MouseEvent, isRightClick?: boolean) => void;
  handleTrimMode: (event: MouseEvent, point: THREE.Vector3) => Promise<void>;
  handleExtendMode: (event: MouseEvent, point: THREE.Vector3) => void;
  cancelCurrentOperation: () => void;
  // Drawing helpers
  isDrawingActive: () => boolean;
  getChainStartPoint: () => THREE.Vector3 | null;
  // Plane selection state
  isSelectingPlane: boolean;
  cancelPlaneSelection: () => void;
  // Glyph drag detection
  isGlyphDraggingActiveRef: React.MutableRefObject<string | null>;
  // Inference rendering
  renderInferencePoint: (p: InferencePoint) => void;
  renderGuidelines: (g: Guideline[]) => void;
  cleanupInferenceObjects: () => void;
  // Inference data
  findInferencePoints: (s: Sketch) => InferencePoint[];
  findNearestSnap: (
    p: THREE.Vector3,
    ips: InferencePoint[],
    dist: number,
  ) => InferencePoint | null;
  findGuidelines: (
    p: THREE.Vector3,
    s: Sketch,
    anchor: THREE.Vector3 | null,
    tol: number,
  ) => Guideline[];
  setCurrentInferencePoint: (p: InferencePoint | null) => void;
  setGuidelines: (g: Guideline[]) => void;
  // Selection state
  selectedPrimitives: string[];
  clearSelection: () => void;
  selectedConstraintId: string | null;
  setSelectedConstraintId: (id: string | null) => void;
  // CoreContext-derived setters
  pushSketchUndo: () => void;
  removeConstraint: (id: string) => void;
  removePrimitive: (id: string) => void;
  solveSketch: () => Promise<Sketch | null>;
  updatePrimitive: (id: string, updates: Record<string, unknown>) => void;
}

/**
 * Sketch input layer: routes mouse events through the right sub-mode handler
 * (drawing/select/trim/extend), wires inference snapping + guidelines, and
 * handles all keyboard shortcuts (tool switches, Escape, Delete, X for
 * construction toggle).
 *
 * Uses the shared `createModeInputHandlers` factory for keyboard centralization
 * and continuous pointer tracking via `onPointerMove`. Mouse events are
 * delegated to the existing per-sub-mode dispatcher; right-click bypasses the
 * factory's LMB gate. Drag-protocol semantics don't fit sketch, sketch is in
 * continuous-pointer-tracking mode, not drag mode.
 *
 * Also owns two lifecycle effects: mode-change clear-selection and
 * sub-mode-change clear-selection. (Line2 resolution sync is centralised in
 * `useSceneAndRenderer`'s ResizeObserver, it walks the whole scene.)
 */
export function useSketchInputHandlers(params: UseSketchInputHandlersParams) {
  const {
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
    handleCircleDraw,
    handleCircle3PointDraw,
    handleEllipseDraw,
    handleEllipticalArcDraw,
    handleSplineDraw,
    handleBezierDraw,
    handleConicDraw,
    handleSplitDraw,
    handleArcDraw,
    handlePointDraw,
    handleSelectMode,
    handleTrimMode,
    handleExtendMode,
    cancelCurrentOperation,
    isDrawingActive,
    getChainStartPoint,
    isSelectingPlane,
    cancelPlaneSelection,
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
  } = params;

  const {
    getMouseIntersection,
    gridSpacing,
    gridSnapEnabled,
    navToolActiveRef,
  } = useCadVisualizer();
  const { raycasterFromEvent } = useRaycastToObjects();
  const { INFERENCE_SNAP_DISTANCE, ALIGNMENT_TOLERANCE } = SKETCH_CONFIG;
  const isApplyingRef = useRef(false);
  const holdRefs = useModeInputHoldRefs<{ kind: "delegate" }>();

  // Latest values for the memoized factory spec.
  const sketchSubModeRef = useRef(sketchSubMode);
  sketchSubModeRef.current = sketchSubMode;
  const isSelectingPlaneRef = useRef(isSelectingPlane);
  isSelectingPlaneRef.current = isSelectingPlane;
  const activeSketchRef = useRef(activeSketch);
  activeSketchRef.current = activeSketch;
  const selectedPrimitivesRef = useRef(selectedPrimitives);
  selectedPrimitivesRef.current = selectedPrimitives;
  const selectedConstraintIdRef = useRef(selectedConstraintId);
  selectedConstraintIdRef.current = selectedConstraintId;

  /**
   * Project the mouse event to the active sketch plane in 2D, with grid snap +
   * inference snap (suppressed when Ctrl held or in trim/extend modes).
   * Used by both `onPickStart` (mousedown) and `onPointerMove` so they apply
   * identical snapping logic.
   */
  const projectAndSnap = useCallback(
    (
      event: MouseEvent,
      isMouseDown: boolean,
    ): { point: THREE.Vector3 | null; subMode: SketchSubMode } => {
      const subMode = sketchSubModeRef.current;
      const point3D = getMouseIntersection(event);
      if (!point3D) return { point: null, subMode };

      const sketch = activeSketchRef.current;
      let point = sketch
        ? worldToSketch2D(point3D, sketch.plane)
        : point3D.clone();
      point = snapToGrid(point, gridSpacing, gridSnapEnabled);

      const skipInference =
        ctrlHeldRef.current || subMode === "trim" || subMode === "extend";

      if (sketch && !isMouseDown && !skipInference) {
        const inferencePoints = findInferencePoints(sketch);
        const nearestSnap = findNearestSnap(
          point,
          inferencePoints,
          INFERENCE_SNAP_DISTANCE,
        );
        if (nearestSnap) {
          point = nearestSnap.position.clone();
          setCurrentInferencePoint(nearestSnap);
          renderInferencePoint(nearestSnap);
        } else {
          setCurrentInferencePoint(null);
          cleanupInferenceObjects();
        }
        const currentGuidelines = findGuidelines(
          point,
          sketch,
          getChainStartPoint(),
          ALIGNMENT_TOLERANCE,
        );
        setGuidelines(currentGuidelines);
        renderGuidelines(currentGuidelines);
      }

      if (sketch && !isMouseDown && skipInference && ctrlHeldRef.current) {
        // Ctrl held: clear any visible inference objects regardless.
        setCurrentInferencePoint(null);
        cleanupInferenceObjects();
        setGuidelines([]);
        renderGuidelines([]);
      }

      if (sketch && isMouseDown && !skipInference) {
        const inferencePoints = findInferencePoints(sketch);
        const nearestSnap = findNearestSnap(
          point,
          inferencePoints,
          INFERENCE_SNAP_DISTANCE,
        );
        if (nearestSnap) {
          point = nearestSnap.position.clone();
          lastSnapRef.current = nearestSnap;
        } else {
          lastSnapRef.current = null;
        }
      }

      return { point, subMode };
    },
    [
      getMouseIntersection,
      gridSpacing,
      gridSnapEnabled,
      ctrlHeldRef,
      activeSketchRef,
      sketchSubModeRef,
      lastSnapRef,
      findInferencePoints,
      findNearestSnap,
      findGuidelines,
      setCurrentInferencePoint,
      setGuidelines,
      renderInferencePoint,
      renderGuidelines,
      cleanupInferenceObjects,
      getChainStartPoint,
      INFERENCE_SNAP_DISTANCE,
      ALIGNMENT_TOLERANCE,
    ],
  );

  const dispatchPointerEvent = useCallback(
    (event: MouseEvent, isMouseDown: boolean) => {
      const { point, subMode } = projectAndSnap(event, isMouseDown);
      if (!point) return;

      switch (subMode) {
        case "line":
          void handleLineDraw(event, point);
          break;
        case "midpointLine":
          void handleMidpointLineDraw(event, point);
          break;
        case "rectangle":
          void handleRectangleDraw(event, point);
          break;
        case "centerRectangle":
          void handleCenterRectangleDraw(event, point);
          break;
        case "slot":
          void handleSlotDraw(event, point);
          break;
        case "polygon":
          void handlePolygonDraw(event, point);
          break;
        case "circle":
          void handleCircleDraw(event, point);
          break;
        case "circle3p":
          void handleCircle3PointDraw(event, point);
          break;
        case "ellipse":
          void handleEllipseDraw(event, point);
          break;
        case "ellipticalArc":
          void handleEllipticalArcDraw(event, point);
          break;
        case "spline":
          void handleSplineDraw(event, point);
          break;
        case "bezier":
          void handleBezierDraw(event, point);
          break;
        case "conic":
          void handleConicDraw(event, point);
          break;
        case "split":
          void handleSplitDraw(event, point);
          break;
        case "arc":
          void handleArcDraw(event, point);
          break;
        case "point":
          void handlePointDraw(event, point);
          break;
        case "select":
        case "dimension":
          handleSelectMode(event, false);
          break;
        case "trim":
          void handleTrimMode(event, point);
          break;
        case "extend":
          handleExtendMode(event, point);
          break;
      }
    },
    [
      projectAndSnap,
      handleLineDraw,
      handleMidpointLineDraw,
      handleRectangleDraw,
      handleCenterRectangleDraw,
      handleSlotDraw,
      handlePolygonDraw,
      handleCircleDraw,
      handleCircle3PointDraw,
      handleEllipseDraw,
      handleEllipticalArcDraw,
      handleSplineDraw,
      handleBezierDraw,
      handleConicDraw,
      handleSplitDraw,
      handleArcDraw,
      handlePointDraw,
      handleSelectMode,
      handleTrimMode,
      handleExtendMode,
    ],
  );

  const handlers = useMemo(
    () =>
      createModeInputHandlers<{ kind: "delegate" }, never>(
        {
          // The factory's gates run before pickTargets; we return an
          // empty-pick to opt out of the hold-menu flow but still fire
          // `onPickStart`. Right-click and plane-selection bypass this
          // entirely (see the wrapper below).
          pickTargets: () => {
            if (mode !== "sketch") return null;
            if (isSelectingPlaneRef.current) return null;
            return { picks: [], resolved: { kind: "delegate" } };
          },
          onPickStart: (_resolved, _picks, event) => {
            // Glyph mid-drag: route directly to select handler before
            // intersection check (intersection can return null at edge-on
            // views, which would strand the drag).
            if (isGlyphDraggingActiveRef.current) {
              handleSelectMode(event, false);
              return;
            }
            dispatchPointerEvent(event, true);
          },
          onPickFromMenu: () => {
            // Sketch does not use Select Other.
          },
          onPointerMove: (event) => {
            if (mode !== "sketch") return;
            if (isSelectingPlaneRef.current) return;
            // Glyph mid-drag short-circuit: see onPickStart for rationale.
            if (isGlyphDraggingActiveRef.current) {
              handleSelectMode(event, false);
              return;
            }
            dispatchPointerEvent(event, false);
          },
          onPointerUp: (event) => {
            if (mode !== "sketch") return;
            if (isSelectingPlaneRef.current) return;
            // Match the mousedown gate so a middle-button rotate-release
            // doesn't commit a circle.
            if (event.button !== 0) return;
            if (isGlyphDraggingActiveRef.current) {
              handleSelectMode(event, false);
              return;
            }
            dispatchPointerEvent(event, false);
          },
          onCancel: () => {
            if (isSelectingPlaneRef.current) {
              cancelPlaneSelection();
            } else if (isDrawingActive()) {
              cancelCurrentOperation();
            } else {
              setSketchSubMode("select");
            }
          },
          extraKeys: {
            l: () => {
              cancelCurrentOperation();
              setSketchSubMode("line");
            },
            L: () => {
              cancelCurrentOperation();
              setSketchSubMode("line");
            },
            c: () => {
              cancelCurrentOperation();
              setSketchSubMode("circle");
            },
            C: () => {
              cancelCurrentOperation();
              setSketchSubMode("circle");
            },
            a: () => {
              cancelCurrentOperation();
              setSketchSubMode("arc");
            },
            A: () => {
              cancelCurrentOperation();
              setSketchSubMode("arc");
            },
            p: () => {
              cancelCurrentOperation();
              setSketchSubMode("point");
            },
            P: () => {
              cancelCurrentOperation();
              setSketchSubMode("point");
            },
            d: () => {
              cancelCurrentOperation();
              setSketchSubMode("dimension");
            },
            D: () => {
              cancelCurrentOperation();
              setSketchSubMode("dimension");
            },
            r: () => {
              cancelCurrentOperation();
              setSketchSubMode("rectangle");
            },
            R: () => {
              cancelCurrentOperation();
              setSketchSubMode("rectangle");
            },
            s: () => {
              cancelCurrentOperation();
              setSketchSubMode("select");
            },
            S: () => {
              cancelCurrentOperation();
              setSketchSubMode("select");
            },
            t: () => {
              cancelCurrentOperation();
              setSketchSubMode("trim");
            },
            T: () => {
              cancelCurrentOperation();
              setSketchSubMode("trim");
            },
            e: () => {
              cancelCurrentOperation();
              setSketchSubMode("extend");
            },
            E: () => {
              cancelCurrentOperation();
              setSketchSubMode("extend");
            },
            Delete: () => deleteSelection(),
            Backspace: () => deleteSelection(),
            x: () => toggleConstruction(),
            X: () => toggleConstruction(),
          },
        },
        {
          raycasterFromEvent,
          selectOtherRef: undefined,
          navToolActiveRef,
          isApplyingRef,
        },
        holdRefs,
      ),
    // Dispatched via refs; deps captured at memo creation suffice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      mode,
      raycasterFromEvent,
      navToolActiveRef,
      handleSelectMode,
      isGlyphDraggingActiveRef,
      dispatchPointerEvent,
      cancelPlaneSelection,
      isDrawingActive,
      cancelCurrentOperation,
      setSketchSubMode,
      holdRefs,
    ],
  );

  function deleteSelection(): void {
    if (selectedConstraintIdRef.current) {
      pushSketchUndo();
      removeConstraint(selectedConstraintIdRef.current);
      void solveSketch();
      setSelectedConstraintId(null);
      return;
    }
    const sketch = activeSketchRef.current;
    if (selectedPrimitivesRef.current.length === 0 || !sketch) return;
    const deletable = selectedPrimitivesRef.current.filter((id) => {
      const p = sketch.primitives.find((x) => x.id === id);
      return !!p && !(p as { origin?: boolean }).origin;
    });
    if (deletable.length === 0) return;
    pushSketchUndo();
    for (const primId of deletable) removePrimitive(primId);
    clearSelection();
    void solveSketch();
  }

  function toggleConstruction(): void {
    const sketch = activeSketchRef.current;
    if (!sketch || selectedPrimitivesRef.current.length === 0) return;
    for (const primId of selectedPrimitivesRef.current) {
      const prim = sketch.primitives.find((p) => p.id === primId);
      if (!prim) continue;
      if (isSketchLine(prim) || isSketchCircle(prim) || isSketchArc(prim)) {
        if (isSketchLine(prim) && prim.origin) continue;
        updatePrimitive(primId, { construction: !prim.construction });
      }
    }
  }

  /**
   * Public mouse dispatcher: keeps the existing single-callback API the
   * starter is wired to, while routing through the factory for centralized
   * gates + continuous pointer tracking.
   */
  const handleSketchMode = useCallback(
    (event: MouseEvent) => {
      if (mode !== "sketch") return;
      if (isSelectingPlaneRef.current) return;

      // Right-click bypasses the factory (factory enforces LMB-only). Sketch's
      // existing convention: only mousedown+button=2 dispatches the alt-select.
      if (event.button === 2) {
        if (event.type === "mousedown") {
          handleSelectMode(event, true);
        }
        return;
      }

      // Suppress mousemove / mouseup mid right-button drag (e.g. RMB pan).
      // `event.button` is unreliable on mousemove; check the pressed-buttons mask.
      if (
        event.type === "mousemove" &&
        (event.buttons & 2) !== 0 &&
        (event.buttons & 1) === 0
      ) {
        return;
      }

      if (event.type === "mousedown") handlers.handleMouseDown(event);
      else if (event.type === "mousemove") handlers.handleMouseMove(event);
      else if (event.type === "mouseup") handlers.handleMouseUp(event);
    },
    [mode, handleSelectMode, handlers],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (mode !== "sketch") return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;

      // Factory handles Escape + extraKeys; preventDefault for consumed keys.
      const before = event.defaultPrevented;
      handlers.handleKeyDown(event);
      if (
        !before &&
        (event.key === "Escape" ||
          [
            "l",
            "c",
            "a",
            "p",
            "d",
            "r",
            "s",
            "t",
            "e",
            "x",
            "Delete",
            "Backspace",
          ].includes(event.key.toLowerCase()))
      ) {
        event.preventDefault();
      }
    },
    [mode, handlers],
  );

  // Clear selection when leaving sketch mode.
  useEffect(() => {
    if (mode !== "sketch") {
      clearSelection();
    }
  }, [mode, clearSelection]);

  // Clear selection when not in select sub-mode.
  useEffect(() => {
    if (sketchSubMode !== "select") {
      clearSelection();
    }
  }, [sketchSubMode, clearSelection]);

  return { handleSketchMode, handleKeyDown };
}
