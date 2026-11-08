import {
  DimensionalConstraint,
  getAvailableConstraints,
  getDefaultValue,
  isDimensionalConstraint,
  isSketchLine,
  isSketchPoint,
  createSketchPlaneFromNormal,
  PLANE_SELECTOR,
  type ConstraintType,
  type HatchPattern,
  type SketchImageUnderlay,
  type SketchLayer,
  type SketchPrimitive,
  worldToScreen,
} from "@vitekk02/cadjs";
import React, { FC, useEffect, useRef, useState } from "react";

import { createPortal } from "react-dom";
import * as THREE from "three";

import {
  useCadCore,
  useCadVisualizer,
  useSketchMode,
} from "@vitekk02/cadjs/react";
import { useToast } from "../../contexts/ToastContext";
import SketchToolbar from "../../navbar/SketchToolbar";
import DimensionInput, {
  type DimensionSubmitOptions,
} from "../../components/DimensionInput";
import SketchCommandPalette from "../../components/SketchCommandPalette";
import SketchContextMenu from "../../components/SketchContextMenu";
import SketchControlsHelp from "../../components/SketchControlsHelp";
import ValueInputModal from "../../navbar/ValueInputModal";
import {
  sketchCommandAvailability,
  type SketchCommand,
  findSketchCommand,
} from "../../model/sketchControls";
import { RUN_SKETCH_COMMAND_EVENT } from "../../model/toolSearch";
import { describeConstraintIds } from "../../model/sketchDiagnostics";
import { analyzeSketch } from "../../model/sketchAnalysis";
import { mirrorSelectedPrimitives } from "../../model/sketchMirror";
import {
  cornerModifyArcArc,
  cornerModifyLineArc,
  cornerModifyLines,
  type CornerOperation,
} from "../../model/sketchCorner";
import {
  joinSketchLines,
  offsetSketchPrimitive,
} from "../../model/sketchModify";
import {
  circularPatternSelected,
  moveOrCopySelected,
  pathPatternSelected,
  rotateSelectedGeometry,
  scaleSelectedGeometry,
} from "../../model/sketchTransform";
import { linearPatternSelected } from "../../model/sketchPattern";
import VectorInputModal from "../../navbar/VectorInputModal";
import PatternInputModal from "../../navbar/PatternInputModal";
import CircularPatternInputModal from "../../navbar/CircularPatternInputModal";
import PathPatternInputModal, {
  type PathPatternCandidate,
} from "../../navbar/PathPatternInputModal";
import TextInputModal from "../../navbar/TextInputModal";
import ImageUnderlayModal from "../../navbar/ImageUnderlayModal";
import { textToSketchPrimitives } from "../../model/sketchText";
import { importDxfToSketch } from "../../model/dxfImport";
import { sketchToDxf } from "../../model/sketchDxf";
import {
  includeSelectedEdges,
  refreshIncludedGeometry,
} from "../../model/sketchInclude";
import {
  assignLayerToSelection,
  createBlockFromSelection,
  ensureSketchLayers,
  explodeBlockSelection,
  hatchFromSelection,
  insertBlock,
} from "../../model/sketchEntities";
import type { ModeContentProps } from ".";

const SketchModeContent: FC<ModeContentProps> = ({
  panelSlot,
  setSketchIsSelectingPlane,
  originGroupRef,
  sketchStartCounter,
  setSketchSelectedPrimitives,
}) => {
  const {
    activeSketch,
    finishSketch,
    cancelSketch,
    solveSketch,
    isOperationPending,
    canUndoSketch,
    canRedoSketch,
    undoSketch,
    redoSketch,
    addPrimitive,
    updatePrimitive,
    updateSketch,
    elements,
    selectedElements,
    removePrimitive,
    addConstraintAndSolve,
    removeConstraint: removeSketchConstraint,
    pushSketchUndo,
    mode,
    setMode,
  } = useCadCore();
  const {
    camera,
    renderer,
    gridSpacing,
    setGridSpacing,
    gridSnapEnabled,
    setGridSnapEnabled,
  } = useCadVisualizer();
  const { showToast } = useToast();
  const [polygonSides, setPolygonSides] = useState(6);
  const [conicRho, setConicRho] = useState(0.5);
  const [hatchPattern, setHatchPattern] = useState<HatchPattern>("lines");
  const [hatchSpacing, setHatchSpacing] = useState(0.75);
  const [hatchAngle, setHatchAngle] = useState(45);
  const [layersOpen, setLayersOpen] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState("");
  const [newVariableName, setNewVariableName] = useState("");
  const [newVariableValue, setNewVariableValue] = useState("");

  const {
    sketchSubMode,
    setSketchSubMode,
    cancelCurrentOperation,
    handleSketchMode,
    handleKeyDown,
    selectedPrimitives,
    applyConstraint,
    isChaining,
    pendingLineDimension,
    clearPendingLineDimension,
    applyLineLengthConstraint,
    contextMenu: sketchContextMenu,
    closeContextMenu: closeSketchContextMenu,
    applyConstraintToContextMenuPrimitives,
    deleteConstraint: deleteSketchConstraint,
    deleteSelectedPrimitives,
    getCurrentValueForConstraint,
    handleConstraintPreviewChange,
    handleConstraintPreviewCancel,
    isSelectingPlane,
    hoveredPlane,
    enterPlaneSelectionMode,
    cancelPlaneSelection,
    selectPlaneAndStartSketch,
    handlePlaneSelectionMouseMove,
    handlePlaneSelectionClick,
    setPlaneOffset: setSketchPlaneOffset,
    toggleFixPoint,
    editingConstraintId,
    constraintFeedback,
    clearConstraintFeedback,
  } = useSketchMode(false, polygonSides, conicRho);

  // Local UI state for the plane-selection overlay's offset input.
  const layers = activeSketch ? ensureSketchLayers(activeSketch) : [];
  const activeLayer =
    layers.find((layer) => layer.id === activeLayerId) ?? layers[0];

  useEffect(() => {
    if (!activeSketch) return;
    if (!layers.some((layer) => layer.id === activeLayerId)) {
      setActiveLayerId(layers[0]?.id ?? "");
    }
  }, [activeSketch, activeLayerId, layers]);

  const [planeOffset, setPlaneOffset] = useState(0);
  const [customNormal, setCustomNormal] = useState({ x: 0, y: 0, z: 1 });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingPaletteConstraint, setPendingPaletteConstraint] = useState<{
    type: ConstraintType;
    defaultValue: number;
  } | null>(null);
  const [pendingCorner, setPendingCorner] = useState<{
    operation: CornerOperation;
    defaultValue: number;
  } | null>(null);
  const [pendingOffset, setPendingOffset] = useState<{
    defaultValue: number;
  } | null>(null);
  const [pendingTransform, setPendingTransform] = useState<{
    mode: "move" | "copy";
    defaultX: number;
    defaultY: number;
  } | null>(null);
  const [pendingRotate, setPendingRotate] = useState<{
    defaultValue: number;
  } | null>(null);
  const [pendingScale, setPendingScale] = useState<{
    defaultValue: number;
  } | null>(null);
  const [pendingPattern, setPendingPattern] = useState<{
    defaultCount: number;
    defaultX: number;
    defaultY: number;
  } | null>(null);
  const [pendingCircularPattern, setPendingCircularPattern] = useState<{
    defaultCount: number;
    defaultAngle: number;
  } | null>(null);
  const [pendingPathPattern, setPendingPathPattern] = useState<{
    defaultCount: number;
    candidates: PathPatternCandidate[];
  } | null>(null);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [underlayEditorOpen, setUnderlayEditorOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Local dimension-input state. Used by all 3 dimension flows
  // (selecting a primitive, after line creation, editing an existing constraint).
  const [dimensionInputVisible, setDimensionInputVisible] = useState(false);
  const [dimensionInputPosition, setDimensionInputPosition] = useState({
    x: 0,
    y: 0,
  });
  const [dimensionInputLabel, setDimensionInputLabel] = useState("");
  const [dimensionInputValue, setDimensionInputValue] = useState<
    number | undefined
  >(undefined);
  const [dimensionInputExpression, setDimensionInputExpression] = useState<
    string | undefined
  >(undefined);
  const [dimensionInputDriving, setDimensionInputDriving] = useState(true);
  const [dimensionInputMin, setDimensionInputMin] = useState<
    number | undefined
  >(undefined);
  const [dimensionInputMax, setDimensionInputMax] = useState<
    number | undefined
  >(undefined);
  const [pendingDimensionPrimitiveId, setPendingDimensionPrimitiveId] =
    useState<string | null>(null);
  const [dimensionSource, setDimensionSource] = useState<
    "lineCreation" | "dimensionMode" | "constraintEdit" | null
  >(null);
  const editingConstraintRef = useRef<{
    id: string;
    type: string;
    primitiveIds: string[];
  } | null>(null);

  // Publish plane-selection state to chrome (gates secondary toolbar +
  // ModeInfoCard text).
  useEffect(() => {
    setSketchIsSelectingPlane(isSelectingPlane);
    return () => setSketchIsSelectingPlane(false);
  }, [isSelectingPlane, setSketchIsSelectingPlane]);

  // Publish primitive selection to chrome (SketchPropertiesPanel reads it).
  useEffect(() => {
    setSketchSelectedPrimitives(selectedPrimitives);
    return () => setSketchSelectedPrimitives([]);
  }, [selectedPrimitives, setSketchSelectedPrimitives]);

  // React to chrome's "New Sketch" button. The counter changes on each click;
  // only enter plane-selection if there's no active sketch (avoid clobbering
  // an in-progress sketch).
  useEffect(() => {
    if (!activeSketch && !isSelectingPlane) {
      enterPlaneSelectionMode();
    }
    // We only want to fire on counter change, not on activeSketch/isSelectingPlane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketchStartCounter]);

  // Canvas mouse listeners
  useEffect(() => {
    if (!renderer) return;
    const dom = renderer.domElement;
    dom.addEventListener("mousedown", handleSketchMode);
    dom.addEventListener("mousemove", handleSketchMode);
    dom.addEventListener("mouseup", handleSketchMode);
    return () => {
      dom.removeEventListener("mousedown", handleSketchMode);
      dom.removeEventListener("mousemove", handleSketchMode);
      dom.removeEventListener("mouseup", handleSketchMode);
    };
  }, [renderer, handleSketchMode]);

  // Keyboard
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Command palette and control-sheet shortcuts. Capture phase so the sketch
  // handler never treats these as drawing keys. Ctrl/Cmd+K works even while
  // the palette input is focused, so it can also close the palette.
  useEffect(() => {
    if (mode !== "sketch") return;
    const handleChromeKeys = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        setHelpOpen(false);
        setPaletteOpen((open) => !open);
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === "F1" || (event.key === "?" && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        setPaletteOpen(false);
        setHelpOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleChromeKeys, true);
    return () => window.removeEventListener("keydown", handleChromeKeys, true);
  }, [mode]);

  // Two-level Escape in sketch mode:
  //   Level 1: sketch's handleKeyDown fires first. If mid-drawing, it cancels the
  //            in-progress operation and calls preventDefault(). We check
  //            defaultPrevented to know it handled it.
  //   Level 2: If sketch was idle (defaultPrevented = false), we finish the
  //            sketch and exit to move mode.
  //   Enter: Always finishes the sketch (explicit commit).
  useEffect(() => {
    const handleSketchModeExit = async (event: KeyboardEvent) => {
      if (mode !== "sketch") return;
      if (!activeSketch) return;
      if (isSelectingPlane) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;

      if (event.key === "Escape") {
        // Use a microtask to let the sketch's handleKeyDown fire first.
        // If it handled the Escape (cancelled a drawing), defaultPrevented will be true.
        await Promise.resolve();
        if (event.defaultPrevented) return;

        event.preventDefault();
        const success = await finishSketch();
        if (!success) {
          showToast(
            "Sketch may have open profiles — try closing them first",
            "warning",
          );
          return;
        }
        setMode("move");
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const success = await finishSketch();
        if (!success) {
          showToast(
            "Sketch may have open profiles — try closing them first",
            "warning",
          );
          return;
        }
        setMode("move");
      }
    };
    // Capture phase: fires AFTER bubble, so sketch's handleKeyDown (bubble) has
    // already run and potentially called preventDefault.
    window.addEventListener("keydown", handleSketchModeExit, true);
    return () =>
      window.removeEventListener("keydown", handleSketchModeExit, true);
  }, [
    mode,
    activeSketch,
    isSelectingPlane,
    isChaining,
    finishSketch,
    setMode,
    showToast,
  ]);

  // Prevent the browser's right-click menu on the canvas.
  useEffect(() => {
    if (!renderer) return;
    const onCtx = (event: MouseEvent) => {
      event.preventDefault();
    };
    renderer.domElement.addEventListener("contextmenu", onCtx);
    return () => renderer.domElement.removeEventListener("contextmenu", onCtx);
  }, [renderer]);

  // Plane-selection canvas listeners (only during isSelectingPlane).
  useEffect(() => {
    if (!renderer || !isSelectingPlane) return;
    const dom = renderer.domElement;
    dom.addEventListener("mousemove", handlePlaneSelectionMouseMove);
    dom.addEventListener("click", handlePlaneSelectionClick);
    return () => {
      dom.removeEventListener("mousemove", handlePlaneSelectionMouseMove);
      dom.removeEventListener("click", handlePlaneSelectionClick);
    };
  }, [
    renderer,
    isSelectingPlane,
    handlePlaneSelectionMouseMove,
    handlePlaneSelectionClick,
  ]);

  // Hide origin helpers while selecting a plane; reset offset.
  useEffect(() => {
    if (!originGroupRef.current) return;
    originGroupRef.current.visible = !isSelectingPlane;
    if (isSelectingPlane) {
      setPlaneOffset(0);
      setSketchPlaneOffset(0);
    }
    return () => {
      if (originGroupRef.current) originGroupRef.current.visible = true;
    };
  }, [isSelectingPlane, originGroupRef, setSketchPlaneOffset]);

  // "Fully constrained" toast when DOF transitions to 0.
  const prevDofRef = useRef<number | null>(null);
  useEffect(() => {
    if (!activeSketch) {
      prevDofRef.current = null;
      return;
    }
    if (
      prevDofRef.current !== null &&
      prevDofRef.current > 0 &&
      activeSketch.dof === 0
    ) {
      showToast("Sketch fully constrained", "success");
    }
    prevDofRef.current = activeSketch.dof;
  }, [activeSketch?.dof, activeSketch, showToast]);

  // Show dimension input when a single primitive is selected in dimension mode.
  useEffect(() => {
    if (dimensionSource === "lineCreation") return;

    if (sketchSubMode !== "dimension" || selectedPrimitives.length !== 1) {
      if (dimensionSource === "dimensionMode") {
        setDimensionInputVisible(false);
        setPendingDimensionPrimitiveId(null);
        setDimensionSource(null);
      }
      return;
    }

    const primitiveId = selectedPrimitives[0]!;
    if (!activeSketch || !renderer) return;
    const primitive = activeSketch.primitives.find((p) => p.id === primitiveId);
    if (!primitive) return;

    let label = "";
    let value: number | undefined;
    let worldPos = new THREE.Vector3();
    const plane = activeSketch.plane;
    const sketchTo3D = (x: number, y: number) =>
      new THREE.Vector3()
        .copy(plane.origin)
        .addScaledVector(plane.xAxis, x)
        .addScaledVector(plane.yAxis, y);

    if (primitive.type === "line") {
      label = "Length";
      const p1 = activeSketch.primitives.find(
        (p) => p.id === primitive.p1Id && p.type === "point",
      );
      const p2 = activeSketch.primitives.find(
        (p) => p.id === primitive.p2Id && p.type === "point",
      );
      if (p1 && p2 && p1.type === "point" && p2.type === "point") {
        value = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        worldPos = sketchTo3D((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      }
    } else if (primitive.type === "circle") {
      label = "Radius";
      value = primitive.radius;
      const center = activeSketch.primitives.find(
        (p) => p.id === primitive.centerId && p.type === "point",
      );
      if (center && center.type === "point") {
        worldPos = sketchTo3D(center.x + primitive.radius / 2, center.y);
      }
    } else if (primitive.type === "arc") {
      label = "Radius";
      value = primitive.radius;
      const center = activeSketch.primitives.find(
        (p) => p.id === primitive.centerId && p.type === "point",
      );
      if (center && center.type === "point") {
        worldPos = sketchTo3D(center.x, center.y);
      }
    } else {
      setDimensionInputVisible(false);
      return;
    }

    if (camera && renderer) {
      setDimensionInputPosition(worldToScreen(worldPos, camera, renderer));
      setDimensionInputLabel(label);
      setDimensionInputValue(value);
      setDimensionInputExpression(undefined);
      setDimensionInputDriving(true);
      setDimensionInputMin(undefined);
      setDimensionInputMax(undefined);
      setPendingDimensionPrimitiveId(primitiveId);
      setDimensionSource("dimensionMode");
      setDimensionInputVisible(true);
    }
  }, [
    sketchSubMode,
    selectedPrimitives,
    activeSketch,
    camera,
    renderer,
    dimensionSource,
  ]);

  // Show dimension input immediately after line creation.
  useEffect(() => {
    if (!pendingLineDimension) {
      if (dimensionSource === "lineCreation") {
        setDimensionInputVisible(false);
        setDimensionSource(null);
      }
      return;
    }
    if (!renderer || !camera) return;

    setDimensionInputPosition(
      worldToScreen(pendingLineDimension.midpoint.clone(), camera, renderer),
    );
    setDimensionInputLabel("Length");
    setDimensionInputValue(pendingLineDimension.length);
    setDimensionInputExpression(undefined);
    setDimensionInputDriving(true);
    setDimensionInputMin(undefined);
    setDimensionInputMax(undefined);
    setPendingDimensionPrimitiveId(pendingLineDimension.lineId);
    setDimensionSource("lineCreation");
    setDimensionInputVisible(true);
  }, [pendingLineDimension, renderer, camera, dimensionSource]);

  // Show dimension input when double-clicking a constraint glyph.
  useEffect(() => {
    if (!editingConstraintId || !activeSketch || !renderer || !camera) return;

    const constraint = activeSketch.constraints.find(
      (c): c is DimensionalConstraint =>
        c.id === editingConstraintId && isDimensionalConstraint(c),
    );
    if (!constraint) return;

    editingConstraintRef.current = {
      id: constraint.id,
      type: constraint.type,
      primitiveIds: [...constraint.primitiveIds],
    };

    let worldPos = new THREE.Vector3();
    const plane = activeSketch.plane;
    const sketchTo3D = (x: number, y: number) =>
      new THREE.Vector3()
        .copy(plane.origin)
        .addScaledVector(plane.xAxis, x)
        .addScaledVector(plane.yAxis, y);

    if (constraint.primitiveIds.length === 2) {
      const p1 = activeSketch.primitives.find(
        (p) => p.id === constraint.primitiveIds[0] && p.type === "point",
      );
      const p2 = activeSketch.primitives.find(
        (p) => p.id === constraint.primitiveIds[1] && p.type === "point",
      );
      if (p1 && p1.type === "point" && p2 && p2.type === "point") {
        worldPos = sketchTo3D((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      }
    } else if (constraint.primitiveIds.length === 1) {
      const prim = activeSketch.primitives.find(
        (p) => p.id === constraint.primitiveIds[0],
      );
      if (prim?.type === "line") {
        const p1 = activeSketch.primitives.find(
          (p) => p.id === prim.p1Id && p.type === "point",
        );
        const p2 = activeSketch.primitives.find(
          (p) => p.id === prim.p2Id && p.type === "point",
        );
        if (p1 && p1.type === "point" && p2 && p2.type === "point") {
          worldPos = sketchTo3D((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
        }
      } else if (prim?.type === "circle" || prim?.type === "arc") {
        const center = activeSketch.primitives.find(
          (p) => p.id === prim.centerId && p.type === "point",
        );
        if (center && center.type === "point") {
          worldPos = sketchTo3D(center.x + (prim.radius || 0) / 2, center.y);
        }
      }
    }

    const displayValue =
      constraint.type === "angle"
        ? Math.round((constraint.value * 180) / Math.PI)
        : constraint.value;

    setDimensionInputPosition(worldToScreen(worldPos, camera, renderer));
    setDimensionInputLabel(
      constraint.type.charAt(0).toUpperCase() + constraint.type.slice(1),
    );
    setDimensionInputValue(displayValue);
    setDimensionInputExpression(constraint.expression);
    setDimensionInputDriving(constraint.driving ?? true);
    setDimensionInputMin(constraint.min);
    setDimensionInputMax(constraint.max);
    setPendingDimensionPrimitiveId(constraint.id);
    setDimensionSource("constraintEdit");
    setDimensionInputVisible(true);
  }, [editingConstraintId, activeSketch, renderer, camera]);

  const handleDimensionSubmit = async (
    value: number,
    expression: string,
    options: DimensionSubmitOptions,
  ) => {
    handleConstraintPreviewCancel();
    const editingType = editingConstraintRef.current?.type;
    const angleMode = editingType === "angle";
    const finalValue = angleMode ? (value * Math.PI) / 180 : value;
    const min =
      options.min === undefined
        ? undefined
        : angleMode
          ? (options.min * Math.PI) / 180
          : options.min;
    const max =
      options.max === undefined
        ? undefined
        : angleMode
          ? (options.max * Math.PI) / 180
          : options.max;

    if (
      dimensionSource === "constraintEdit" &&
      editingConstraintRef.current &&
      activeSketch
    ) {
      const { id: oldId, type, primitiveIds } = editingConstraintRef.current;
      const oldConstraint = activeSketch.constraints.find(
        (c) => c.id === oldId,
      );
      const oldLabelOffset = oldConstraint?.labelOffset;
      pushSketchUndo();
      removeSketchConstraint(oldId);
      await addConstraintAndSolve({
        id: `const_${Date.now()}`,
        type: type as ConstraintType,
        primitiveIds,
        value: finalValue,
        driving: options.driving,
        ...(expression ? { expression } : {}),
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
        ...(oldLabelOffset ? { labelOffset: oldLabelOffset } : {}),
      });
      editingConstraintRef.current = null;
      setDimensionInputVisible(false);
      setPendingDimensionPrimitiveId(null);
      setDimensionSource(null);
      return;
    }

    if (!pendingDimensionPrimitiveId) return;

    if (dimensionSource === "lineCreation") {
      await applyLineLengthConstraint(pendingDimensionPrimitiveId, value, {
        ...(expression ? { expression } : {}),
        driving: options.driving,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      });
    } else if (dimensionSource === "dimensionMode" && activeSketch) {
      const primitive = activeSketch.primitives.find(
        (p) => p.id === pendingDimensionPrimitiveId,
      );
      if (!primitive) return;

      if (
        primitive.type === "line" ||
        primitive.type === "circle" ||
        primitive.type === "arc"
      ) {
        const type: ConstraintType =
          primitive.type === "line" ? "distance" : "radius";
        pushSketchUndo();
        const result = await addConstraintAndSolve({
          id: `const_${Date.now()}`,
          type,
          primitiveIds: [primitive.id],
          value: finalValue,
          driving: options.driving,
          ...(expression ? { expression } : {}),
          ...(min === undefined ? {} : { min }),
          ...(max === undefined ? {} : { max }),
        });
        if (result.status !== "applied") {
          showToast(`Dimension ${result.status}`, "warning");
        }
      }
    }

    setDimensionInputVisible(false);
    setPendingDimensionPrimitiveId(null);
    setDimensionSource(null);
  };

  const handleAddVariable = () => {
    const name = newVariableName.trim();
    const value = Number(newVariableValue);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      showToast(
        "Variable names must start with a letter or underscore.",
        "warning",
      );
      return;
    }
    if (!Number.isFinite(value)) {
      showToast("Enter a numeric variable value.", "warning");
      return;
    }
    pushSketchUndo();
    updateSketch((sketch) => ({
      ...sketch,
      variables: { ...(sketch.variables ?? {}), [name]: value },
    }));
    setNewVariableName("");
    setNewVariableValue("");
  };

  const handleVariableValue = (name: string, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    updateSketch((sketch) => ({
      ...sketch,
      variables: { ...(sketch.variables ?? {}), [name]: value },
    }));
  };

  const handleRemoveVariable = (name: string) => {
    pushSketchUndo();
    updateSketch((sketch) => {
      const variables = { ...(sketch.variables ?? {}) };
      delete variables[name];
      return { ...sketch, variables };
    });
  };

  const handleDimensionCancel = () => {
    handleConstraintPreviewCancel();
    if (dimensionSource === "lineCreation") {
      clearPendingLineDimension();
    }
    editingConstraintRef.current = null;
    setDimensionInputVisible(false);
    setPendingDimensionPrimitiveId(null);
    setDimensionSource(null);
  };

  const handleDimensionChange = (value: number) => {
    if (!pendingDimensionPrimitiveId || !activeSketch) return;
    const primitive = activeSketch.primitives.find(
      (p) => p.id === pendingDimensionPrimitiveId,
    );
    if (!primitive) return;

    handleConstraintPreviewChange(
      primitive.type === "line" ? "distance" : "radius",
      value,
      [pendingDimensionPrimitiveId],
    );
  };

  const hasPointSelection = selectedPrimitives.some((id) => {
    const primitive = activeSketch?.primitives.find((p) => p.id === id);
    return primitive ? isSketchPoint(primitive) : false;
  });
  const hasTwoLineSelection =
    selectedPrimitives.length === 2 &&
    selectedPrimitives.every((id) => {
      const primitive = activeSketch?.primitives.find((p) => p.id === id);
      return primitive ? isSketchLine(primitive) && !primitive.origin : false;
    });

  const availableConstraints = activeSketch
    ? getAvailableConstraints(selectedPrimitives, activeSketch.primitives)
    : [];

  const commandAvailability = (command: SketchCommand) =>
    sketchCommandAvailability(command, {
      hasSelection: selectedPrimitives.length > 0,
      hasPointSelection,
      hasTwoLineSelection,
      canUndo: canUndoSketch,
      canRedo: canRedoSketch,
      availableConstraints,
    });

  const mirrorSeqRef = useRef(0);
  const cornerSeqRef = useRef(0);
  const handleMirror = () => {
    if (!activeSketch) return;

    const selected = activeSketch.primitives.filter((primitive) =>
      selectedPrimitives.includes(primitive.id),
    );
    const axisLines = selected.filter(
      (primitive) => isSketchLine(primitive) && !primitive.origin,
    );
    if (axisLines.length !== 1 || selected.length < 2) {
      showToast(
        "Select exactly one line as the mirror axis, plus the geometry to mirror.",
        "warning",
      );
      return;
    }

    const axis = axisLines[0]!;
    const result = mirrorSelectedPrimitives(
      activeSketch,
      selectedPrimitives,
      axis.id,
      (prefix) =>
        `${prefix}_${Date.now().toString(36)}_${++mirrorSeqRef.current}`,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }

    pushSketchUndo();
    for (const primitive of result.primitives) {
      addPrimitive(primitive);
    }
    void solveSketch();
    showToast(`Mirrored ${result.primitives.length} primitives`, "success");
  };

  const lineArcCornerSelection = (() => {
    if (!activeSketch || selectedPrimitives.length !== 2) return false;
    const selected = activeSketch.primitives.filter((primitive) =>
      selectedPrimitives.includes(primitive.id),
    );
    return (
      selected.some(
        (primitive) => primitive.type === "line" && !primitive.origin,
      ) && selected.some((primitive) => primitive.type === "arc")
    );
  })();

  const arcArcCornerSelection = (() => {
    if (!activeSketch || selectedPrimitives.length !== 2) return false;
    return (
      activeSketch.primitives.filter(
        (primitive) =>
          selectedPrimitives.includes(primitive.id) && primitive.type === "arc",
      ).length === 2
    );
  })();

  const handleCorner = (operation: CornerOperation) => {
    if (operation === "chamfer" && !hasTwoLineSelection) {
      showToast("Select exactly two lines first.", "warning");
      return;
    }
    if (
      operation === "fillet" &&
      !hasTwoLineSelection &&
      !lineArcCornerSelection &&
      !arcArcCornerSelection
    ) {
      showToast(
        "Select two lines, a line and an arc, or two arcs that share a corner.",
        "warning",
      );
      return;
    }
    setPendingCorner({ operation, defaultValue: 0.5 });
  };

  const applyCorner = (value: number) => {
    if (!activeSketch || !pendingCorner) return;

    const generateId = (prefix: string) =>
      `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`;
    const result =
      pendingCorner.operation === "fillet" && arcArcCornerSelection
        ? cornerModifyArcArc(
            activeSketch,
            selectedPrimitives,
            value,
            generateId,
          )
        : pendingCorner.operation === "fillet" && lineArcCornerSelection
          ? cornerModifyLineArc(
              activeSketch,
              selectedPrimitives,
              value,
              generateId,
            )
          : cornerModifyLines(
              activeSketch,
              selectedPrimitives,
              pendingCorner.operation,
              value,
              generateId,
            );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }

    pushSketchUndo();
    for (const point of result.points) addPrimitive(point);
    for (const update of result.lineUpdates) {
      const updates = {
        ...(update.p1Id ? { p1Id: update.p1Id } : {}),
        ...(update.p2Id ? { p2Id: update.p2Id } : {}),
      } as Partial<SketchPrimitive>;
      updatePrimitive(update.id, updates);
    }
    for (const update of result.arcUpdates ?? []) {
      updatePrimitive(update.id, {
        ...(update.startId ? { startId: update.startId } : {}),
        ...(update.endId ? { endId: update.endId } : {}),
      } as Partial<SketchPrimitive>);
    }
    for (const primitive of result.primitives) addPrimitive(primitive);
    for (const pointId of result.removePointIds) removePrimitive(pointId);
    void solveSketch();

    const label = pendingCorner.operation === "fillet" ? "Fillet" : "Chamfer";
    setPendingCorner(null);
    showToast(`${label} applied`, "success");
  };

  const handleOffset = () => {
    if (!activeSketch || selectedPrimitives.length !== 1) {
      showToast("Select one line, circle or arc to offset.", "warning");
      return;
    }
    const target = activeSketch.primitives.find(
      (primitive) => primitive.id === selectedPrimitives[0],
    );
    if (
      !target ||
      target.type === "point" ||
      target.type === "ellipse" ||
      target.type === "ellipticalArc" ||
      target.type === "spline" ||
      target.type === "bezier" ||
      target.type === "conic" ||
      (target.type === "line" && target.origin)
    ) {
      showToast("Offset supports lines, circles and arcs.", "warning");
      return;
    }
    setPendingOffset({ defaultValue: 1 });
  };

  const applyOffset = (value: number) => {
    if (!activeSketch || !pendingOffset || selectedPrimitives.length !== 1)
      return;
    const result = offsetSketchPrimitive(
      activeSketch,
      selectedPrimitives[0]!,
      value,
      (prefix) =>
        `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    for (const point of result.points) addPrimitive(point);
    for (const primitive of result.primitives) addPrimitive(primitive);
    void solveSketch();
    setPendingOffset(null);
    showToast("Offset applied", "success");
  };

  const handleJoin = () => {
    if (!activeSketch) return;
    const result = joinSketchLines(activeSketch, selectedPrimitives);
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    const updates = {
      ...(result.update.p1Id ? { p1Id: result.update.p1Id } : {}),
      ...(result.update.p2Id ? { p2Id: result.update.p2Id } : {}),
    } as Partial<SketchPrimitive>;
    updatePrimitive(result.update.id, updates);
    removePrimitive(result.removeLineId);
    if (result.removePointId) removePrimitive(result.removePointId);
    void solveSketch();
    showToast("Lines joined", "success");
  };

  const handleTransform = (mode: "move" | "copy" | "rotate" | "scale") => {
    if (selectedPrimitives.length === 0) {
      showToast("Select geometry to transform.", "warning");
      return;
    }
    if (mode === "rotate") {
      setPendingRotate({ defaultValue: 45 });
      return;
    }
    if (mode === "scale") {
      setPendingScale({ defaultValue: 2 });
      return;
    }
    setPendingTransform({ mode, defaultX: 1, defaultY: 1 });
  };

  const applyTransform = (x: number, y: number) => {
    if (!activeSketch || !pendingTransform) return;
    const result = moveOrCopySelected(
      activeSketch,
      selectedPrimitives,
      pendingTransform.mode,
      x,
      y,
      (prefix) =>
        `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }

    pushSketchUndo();
    for (const update of result.pointUpdates) {
      updatePrimitive(update.id, {
        x: update.x,
        y: update.y,
      } as Partial<SketchPrimitive>);
    }
    for (const point of result.points) addPrimitive(point);
    for (const primitive of result.primitives) addPrimitive(primitive);
    void solveSketch();

    const label = pendingTransform.mode === "move" ? "Moved" : "Copied";
    setPendingTransform(null);
    showToast(`${label} selected geometry`, "success");
  };

  const applyRotate = (degrees: number) => {
    if (!activeSketch || !pendingRotate) return;
    const result = rotateSelectedGeometry(
      activeSketch,
      selectedPrimitives,
      (degrees * Math.PI) / 180,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    for (const update of result.pointUpdates) {
      updatePrimitive(update.id, {
        x: update.x,
        y: update.y,
      } as Partial<SketchPrimitive>);
    }
    for (const update of result.primitiveUpdates) {
      updatePrimitive(update.id, update.updates as Partial<SketchPrimitive>);
    }
    void solveSketch();
    setPendingRotate(null);
    showToast(`Rotated ${degrees}°`, "success");
  };

  const applyScale = (factor: number) => {
    if (!activeSketch || !pendingScale) return;
    const result = scaleSelectedGeometry(
      activeSketch,
      selectedPrimitives,
      factor,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    for (const update of result.pointUpdates) {
      updatePrimitive(update.id, {
        x: update.x,
        y: update.y,
      } as Partial<SketchPrimitive>);
    }
    for (const update of result.primitiveUpdates) {
      updatePrimitive(update.id, update.updates as Partial<SketchPrimitive>);
    }
    void solveSketch();
    setPendingScale(null);
    showToast(`Scaled by ${factor}`, "success");
  };

  const handlePattern = () => {
    if (selectedPrimitives.length === 0) {
      showToast("Select geometry to pattern.", "warning");
      return;
    }
    setPendingPattern({ defaultCount: 3, defaultX: 1, defaultY: 0 });
  };

  const applyPattern = (count: number, x: number, y: number) => {
    if (!activeSketch || !pendingPattern) return;
    const result = linearPatternSelected(
      activeSketch,
      selectedPrimitives,
      count,
      x,
      y,
      (prefix) =>
        `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    for (const point of result.points) addPrimitive(point);
    for (const primitive of result.primitives) addPrimitive(primitive);
    void solveSketch();
    setPendingPattern(null);
    showToast(`Linear pattern: ${count} instances`, "success");
  };

  const handleCircularPattern = () => {
    if (selectedPrimitives.length === 0) {
      showToast("Select geometry to pattern.", "warning");
      return;
    }
    setPendingCircularPattern({ defaultCount: 4, defaultAngle: 360 });
  };

  const applyCircularPattern = (count: number, angle: number) => {
    if (!activeSketch || !pendingCircularPattern) return;
    const result = circularPatternSelected(
      activeSketch,
      selectedPrimitives,
      count,
      (angle * Math.PI) / 180,
      (prefix) =>
        `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    for (const point of result.points) addPrimitive(point);
    for (const primitive of result.primitives) addPrimitive(primitive);
    void solveSketch();
    setPendingCircularPattern(null);
    showToast(`Circular pattern: ${count} instances`, "success");
  };

  const applyText = (text: string, height: number) => {
    if (!activeSketch) return;
    const originPrimitive = activeSketch.primitives.find(
      (primitive) =>
        selectedPrimitives.includes(primitive.id) && primitive.type === "point",
    );
    const result = textToSketchPrimitives(text, {
      x: originPrimitive?.type === "point" ? originPrimitive.x : 0,
      y: originPrimitive?.type === "point" ? originPrimitive.y : 0,
      height,
      generateId: (prefix) =>
        `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`,
    });
    if (result.primitives.length === 0) {
      showToast("No supported text characters to insert.", "warning");
      return;
    }
    pushSketchUndo();
    for (const point of result.points) addPrimitive(point);
    for (const primitive of result.primitives) addPrimitive(primitive);
    void solveSketch();
    setTextDialogOpen(false);
    showToast(
      `Text: ${result.lineCount} lines, ${Math.round(result.width * 10) / 10} mm wide`,
      "success",
    );
  };

  const handleAddImage = () => {
    if (!activeSketch) return;
    imageInputRef.current?.click();
  };

  const handleImageFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeSketch) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl) return;
      const image = new Image();
      image.onload = () => {
        const width = 120;
        const height = (width * image.height) / Math.max(1, image.width);
        pushSketchUndo();
        updateSketch((sketch) => ({
          ...sketch,
          imageUnderlays: [
            ...(sketch.imageUnderlays ?? []),
            {
              id: `img_${Date.now().toString(36)}_${++cornerSeqRef.current}`,
              dataUrl,
              x: 0,
              y: 0,
              width,
              height,
              opacity: 0.55,
            },
          ],
        }));
        showToast("Image underlay inserted.", "success");
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleEditUnderlay = () => {
    if (!activeSketch?.imageUnderlays?.length) return;
    pushSketchUndo();
    setUnderlayEditorOpen(true);
  };

  const updateUnderlay = (
    id: string,
    updates: Partial<SketchImageUnderlay>,
  ) => {
    updateSketch((sketch) => ({
      ...sketch,
      imageUnderlays: (sketch.imageUnderlays ?? []).map((underlay) =>
        underlay.id === id ? { ...underlay, ...updates } : underlay,
      ),
    }));
  };

  const deleteUnderlay = (id: string) => {
    updateSketch((sketch) => ({
      ...sketch,
      imageUnderlays: (sketch.imageUnderlays ?? []).filter(
        (underlay) => underlay.id !== id,
      ),
    }));
    if ((activeSketch?.imageUnderlays?.length ?? 0) <= 1) {
      setUnderlayEditorOpen(false);
    }
  };

  useEffect(() => {
    if (
      !activeSketch?.primitives.some(
        (primitive) =>
          (primitive.type === "point" || primitive.type === "line") &&
          primitive.includeSource,
      )
    ) {
      return;
    }
    updateSketch((sketch) => refreshIncludedGeometry(sketch, elements));
  }, [elements, activeSketch?.id, updateSketch]);

  const handleInclude = async () => {
    if (!activeSketch) return;
    const selected = elements.filter((element) =>
      selectedElements.includes(element.nodeId),
    );
    const result = await includeSelectedEdges(
      selected,
      activeSketch.plane,
      (prefix) =>
        `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    for (const point of result.points) addPrimitive(point);
    for (const primitive of result.primitives) addPrimitive(primitive);
    void solveSketch();
    showToast(
      `Included ${result.primitives.length} projected edges.`,
      "success",
    );
  };

  const entityId = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`;

  const handleHatch = () => {
    if (!activeSketch) return;
    const result = hatchFromSelection(
      activeSketch,
      selectedPrimitives,
      entityId("hatch"),
      {
        pattern: hatchPattern,
        spacing: hatchSpacing,
        angle: (hatchAngle * Math.PI) / 180,
        ...(activeLayer ? { layerId: activeLayer.id } : {}),
      },
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    addPrimitive(result.hatch);
    void solveSketch();
    showToast(`Hatch: ${hatchPattern}`, "success");
  };

  const handleBlockCreate = () => {
    if (!activeSketch) return;
    const result = createBlockFromSelection(
      activeSketch,
      selectedPrimitives,
      `Block ${(activeSketch.blocks?.length ?? 0) + 1}`,
      entityId,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    updateSketch(() => result.sketch);
    showToast(
      `Created ${result.definition.name} with ${result.definition.primitives.length} primitives`,
      "success",
    );
  };

  const handleBlockInsert = () => {
    if (!activeSketch) return;
    const definition = activeSketch.blocks?.at(-1);
    if (!definition) {
      showToast("Create a block before inserting one.", "warning");
      return;
    }
    const result = insertBlock(
      activeSketch,
      definition.id,
      { x: 2, y: 2 },
      entityId,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    updateSketch(() => result.sketch);
    void solveSketch();
    showToast(`Inserted ${definition.name}`, "success");
  };

  const handleBlockExplode = () => {
    if (!activeSketch) return;
    const result = explodeBlockSelection(activeSketch, selectedPrimitives);
    if (result.count === 0) {
      showToast("Select a block instance to explode.", "warning");
      return;
    }
    pushSketchUndo();
    updateSketch(() => result.sketch);
    showToast(`Exploded ${result.count} primitives`, "success");
  };

  const handleAssignLayer = (layerId: string) => {
    if (!activeSketch || selectedPrimitives.length === 0) {
      showToast("Select geometry before assigning a layer.", "warning");
      return;
    }
    pushSketchUndo();
    updateSketch((sketch) =>
      assignLayerToSelection(sketch, selectedPrimitives, layerId),
    );
  };

  const handleAddLayer = () => {
    if (!activeSketch) return;
    const id = entityId("layer");
    const layer: SketchLayer = {
      id,
      name: `Layer ${layers.length}`,
      color: "#7dd3fc",
      visible: true,
      linetype: "continuous",
    };
    pushSketchUndo();
    updateSketch((sketch) => ({
      ...sketch,
      layers: [...ensureSketchLayers(sketch), layer],
    }));
    setActiveLayerId(id);
  };

  const handleLayerUpdate = (id: string, updates: Partial<SketchLayer>) => {
    updateSketch((sketch) => ({
      ...sketch,
      layers: ensureSketchLayers(sketch).map((layer) =>
        layer.id === id ? { ...layer, ...updates } : layer,
      ),
    }));
  };

  const handleImportDxf = () => {
    if (!activeSketch) return;
    dxfInputRef.current?.click();
  };

  const handleExportDxf = () => {
    if (!activeSketch) return;
    const text = sketchToDxf(activeSketch);
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/dxf" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "sketch.dxf";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Sketch exported as DXF", "success");
  };

  const handleDxfFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeSketch) return;
    try {
      const result = importDxfToSketch(
        await file.text(),
        (prefix) =>
          `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`,
      );
      if (!result.ok) {
        showToast(result.reason, "error");
        return;
      }
      pushSketchUndo();
      updateSketch((sketch) => {
        const existing = ensureSketchLayers(sketch);
        const ids = new Set(existing.map((layer) => layer.id));
        return {
          ...sketch,
          layers: [
            ...existing,
            ...result.layers.filter((layer) => !ids.has(layer.id)),
          ],
        };
      });
      for (const point of result.points) addPrimitive(point);
      for (const primitive of result.primitives) addPrimitive(primitive);
      void solveSketch();
      const skipped = result.skipped.length
        ? `; skipped ${result.skipped.join(", ")}`
        : "";
      showToast(
        `DXF: ${result.entityCount} entities in ${result.units}${skipped}`,
        result.skipped.length ? "warning" : "success",
      );
    } catch (error) {
      showToast(
        `DXF import failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      event.target.value = "";
    }
  };

  const handlePathPattern = () => {
    if (!activeSketch || selectedPrimitives.length < 2) {
      showToast(
        "Select geometry plus one line or curve to use as the path.",
        "warning",
      );
      return;
    }
    const candidates: PathPatternCandidate[] = activeSketch.primitives
      .filter(
        (primitive) =>
          selectedPrimitives.includes(primitive.id) &&
          primitive.type !== "point" &&
          !(primitive.type === "line" && primitive.origin),
      )
      .map((primitive, index) => ({
        id: primitive.id,
        label: `${primitive.type} ${index + 1}`,
      }));
    if (candidates.length === 0) {
      showToast(
        "Select one line or curve as the path, with other geometry to copy.",
        "warning",
      );
      return;
    }
    setPendingPathPattern({ defaultCount: 4, candidates });
  };

  const applyPathPattern = (count: number, pathId: string, align: boolean) => {
    if (!activeSketch || !pendingPathPattern) return;
    const result = pathPatternSelected(
      activeSketch,
      selectedPrimitives,
      { count, pathId, align },
      (prefix) =>
        `${prefix}_${Date.now().toString(36)}_${++cornerSeqRef.current}`,
    );
    if (!result.ok) {
      showToast(result.reason, "warning");
      return;
    }
    pushSketchUndo();
    for (const point of result.points) addPrimitive(point);
    for (const primitive of result.primitives) addPrimitive(primitive);
    void solveSketch();
    setPendingPathPattern(null);
    showToast(`Path pattern: ${count} instances`, "success");
  };

  const runSketchCommand = (command: SketchCommand) => {
    const availability = commandAvailability(command);
    if (!availability.enabled) {
      showToast(availability.reason ?? "Command unavailable", "warning");
      return;
    }
    setPaletteOpen(false);
    switch (command.action.type) {
      case "tool":
        cancelCurrentOperation();
        setSketchSubMode(command.action.mode);
        break;
      case "mirror":
        handleMirror();
        break;
      case "corner":
        handleCorner(command.action.operation);
        break;
      case "offset":
        handleOffset();
        break;
      case "join":
        handleJoin();
        break;
      case "transform":
        handleTransform(command.action.mode);
        break;
      case "pattern":
        handlePattern();
        break;
      case "patternCircular":
        handleCircularPattern();
        break;
      case "patternPath":
        handlePathPattern();
        break;
      case "text":
        setTextDialogOpen(true);
        break;
      case "hatch":
        handleHatch();
        break;
      case "block-create":
        handleBlockCreate();
        break;
      case "block-insert":
        handleBlockInsert();
        break;
      case "block-explode":
        handleBlockExplode();
        break;
      case "layers":
        setLayersOpen(true);
        break;
      case "import-dxf":
        handleImportDxf();
        break;
      case "export-dxf":
        handleExportDxf();
        break;
      case "toggle-construction":
        // The engine owns the construction rules (origin points excluded).
        // Reuse its real X handler instead of duplicating selection semantics.
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "x", cancelable: true }),
        );
        break;
      case "toggle-fix":
        toggleFixPoint();
        break;
      case "delete":
        deleteSelectedPrimitives();
        break;
      case "constraint":
        if (!activeSketch) break;
        if (command.action.needsValue) {
          setPendingPaletteConstraint({
            type: command.action.constraint,
            defaultValue:
              getDefaultValue(
                command.action.constraint,
                selectedPrimitives,
                activeSketch.primitives,
              ) ?? 0,
          });
        } else {
          void applyConstraint(command.action.constraint);
        }
        break;
      case "undo":
        undoSketch();
        break;
      case "redo":
        redoSketch();
        break;
      case "solve":
        solveSketch();
        break;
      case "finish":
        void (async () => {
          const success = await finishSketch();
          if (!success) {
            showToast(
              "Sketch may have open profiles — try closing them first",
              "warning",
            );
            return;
          }
          setMode("move");
        })();
        break;
      case "cancel":
        cancelSketch();
        break;
      case "grid-snap":
        setGridSnapEnabled(!gridSnapEnabled);
        break;
      case "command-palette":
        setPaletteOpen(true);
        break;
      case "controls-help":
        setHelpOpen(true);
        break;
    }
  };

  const runSketchCommandRef = useRef(runSketchCommand);
  runSketchCommandRef.current = runSketchCommand;
  useEffect(() => {
    const handleGlobalCommand = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const command = findSketchCommand(id);
      if (command) runSketchCommandRef.current(command);
    };
    window.addEventListener(RUN_SKETCH_COMMAND_EVENT, handleGlobalCommand);
    return () =>
      window.removeEventListener(RUN_SKETCH_COMMAND_EVENT, handleGlobalCommand);
  }, []);

  const showPanel = !isSelectingPlane && !!activeSketch;
  const conflictLabels = describeConstraintIds(
    constraintFeedback?.constraintIds,
    activeSketch?.constraints ?? [],
  );

  return (
    <>
      {/* Constraint feedback toast (redundant / conflicting). */}
      {constraintFeedback && (
        <div
          role="alert"
          data-testid="constraint-feedback"
          className={`absolute top-4 left-1/2 -translate-x-1/2 max-w-lg px-4 py-2 rounded shadow-lg text-sm font-medium z-50 pointer-events-auto ${
            constraintFeedback.type === "redundant"
              ? "bg-yellow-500 text-black"
              : "bg-red-500 text-white"
          }`}
        >
          <div>{constraintFeedback.message}</div>
          {conflictLabels.length > 0 && (
            <div className="mt-1 text-xs font-normal">
              Named: {conflictLabels.join(", ")}
            </div>
          )}
          {constraintFeedback.type === "conflicting" &&
            constraintFeedback.constraintIds && (
              <div className="mt-2 flex flex-wrap gap-1">
                {constraintFeedback.constraintIds.map((id) => (
                  <button
                    key={id}
                    className="rounded bg-black/20 px-2 py-0.5 text-xs hover:bg-black/35"
                    title={`Remove conflicting constraint ${id}`}
                    onClick={() => {
                      removeSketchConstraint(id);
                      clearConstraintFeedback();
                      showToast("Conflicting constraint removed", "success");
                    }}
                  >
                    Remove {id}
                  </button>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Generic dimension input overlay (line length / radius / constraint edit). */}
      <DimensionInput
        visible={dimensionInputVisible}
        position={dimensionInputPosition}
        label={dimensionInputLabel}
        initialValue={dimensionInputValue}
        initialExpression={dimensionInputExpression}
        initialDriving={dimensionInputDriving}
        initialMin={dimensionInputMin}
        initialMax={dimensionInputMax}
        scope={activeSketch?.variables}
        onSubmit={handleDimensionSubmit}
        onCancel={handleDimensionCancel}
        onChange={handleDimensionChange}
        expressionMode={
          dimensionInputLabel.toLowerCase() === "angle" ? "angle" : "length"
        }
      />

      {/* Right-click context menu for constraints. */}
      <SketchContextMenu
        visible={sketchContextMenu.visible}
        x={sketchContextMenu.x}
        y={sketchContextMenu.y}
        primitiveIds={sketchContextMenu.primitiveIds}
        primitiveTypes={sketchContextMenu.primitiveTypes}
        constraintId={sketchContextMenu.constraintId ?? null}
        onClose={closeSketchContextMenu}
        onApplyConstraint={(constraintType, value) =>
          applyConstraintToContextMenuPrimitives(
            constraintType as ConstraintType,
            value,
          )
        }
        onDeleteConstraint={deleteSketchConstraint}
        onToggleFixPoint={toggleFixPoint}
        onDeletePrimitive={deleteSelectedPrimitives}
        onGetCurrentValue={(constraintId) => {
          const v = getCurrentValueForConstraint(
            constraintId as ConstraintType,
          );
          return v ?? undefined;
        }}
        onValueChange={handleConstraintPreviewChange}
        onValueCancel={handleConstraintPreviewCancel}
      />

      {/* Plane-selection hint overlay. */}
      {isSelectingPlane && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-gray-800 bg-opacity-90 rounded-lg px-6 py-3 text-white shadow-lg">
            <div className="text-center">
              <p className="text-sm font-medium mb-2">Select a sketch plane</p>
              <p className="text-xs text-gray-400 mb-2">
                Click a plane, use buttons, or click a body face
              </p>
              {hoveredPlane && (
                <p
                  className="text-sm font-bold"
                  style={{
                    color:
                      hoveredPlane === "XY"
                        ? PLANE_SELECTOR.xyCss
                        : hoveredPlane === "XZ"
                          ? PLANE_SELECTOR.xzCss
                          : hoveredPlane === "face"
                            ? PLANE_SELECTOR.faceCss
                            : PLANE_SELECTOR.yzCss,
                  }}
                >
                  {hoveredPlane === "XY"
                    ? "XY Plane (Front)"
                    : hoveredPlane === "XZ"
                      ? "XZ Plane (Top)"
                      : hoveredPlane === "face"
                        ? "Body Face"
                        : "YZ Plane (Side)"}
                </p>
              )}
              <div className="mt-2 flex items-center justify-center gap-2 pointer-events-auto">
                <label className="text-xs text-gray-400">Offset:</label>
                <input
                  type="number"
                  step="0.5"
                  aria-label="Sketch plane offset"
                  value={planeOffset}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setPlaneOffset(v);
                    setSketchPlaneOffset(v);
                  }}
                  className="w-16 px-1 py-0.5 text-xs rounded bg-gray-700 border border-gray-600 text-white text-center"
                />
              </div>
              <div className="mt-2 flex items-center justify-center gap-1 pointer-events-auto">
                <span className="text-xs text-gray-400">Custom normal</span>
                {(["x", "y", "z"] as const).map((axis) => (
                  <input
                    key={axis}
                    type="number"
                    step="0.1"
                    aria-label={`Custom plane normal ${axis}`}
                    value={customNormal[axis]}
                    onChange={(e) =>
                      setCustomNormal((normal) => ({
                        ...normal,
                        [axis]: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-12 px-1 py-0.5 text-xs rounded bg-gray-700 border border-gray-600 text-white text-center"
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-center gap-2 pointer-events-auto">
                <button
                  className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500"
                  onClick={() =>
                    selectPlaneAndStartSketch("XY", planeOffset || undefined)
                  }
                >
                  XY
                </button>
                <button
                  className="px-3 py-1 text-xs rounded bg-green-600 hover:bg-green-500"
                  onClick={() =>
                    selectPlaneAndStartSketch("XZ", planeOffset || undefined)
                  }
                >
                  XZ
                </button>
                <button
                  className="px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-500"
                  onClick={() =>
                    selectPlaneAndStartSketch("YZ", planeOffset || undefined)
                  }
                >
                  YZ
                </button>
                <button
                  className="px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500"
                  onClick={() => {
                    const normal = new THREE.Vector3(
                      customNormal.x,
                      customNormal.y,
                      customNormal.z,
                    ).normalize();
                    if (normal.lengthSq() === 0) {
                      showToast(
                        "Custom plane normal cannot be zero.",
                        "warning",
                      );
                      return;
                    }
                    selectPlaneAndStartSketch(
                      createSketchPlaneFromNormal(
                        normal,
                        normal.clone().multiplyScalar(planeOffset),
                      ),
                    );
                  }}
                >
                  Custom
                </button>
                <button
                  className="px-3 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500"
                  onClick={cancelPlaneSelection}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPanel &&
        panelSlot &&
        createPortal(
          <SketchToolbar
            activeSketch={activeSketch}
            sketchSubMode={sketchSubMode}
            onSubModeChange={setSketchSubMode}
            onFinishSketch={async () => {
              const success = await finishSketch();
              if (!success) showToast("Failed to finish sketch", "error");
            }}
            onCancelSketch={cancelSketch}
            onSolveSketch={solveSketch}
            selectedPrimitives={selectedPrimitives}
            onApplyConstraint={applyConstraint}
            isChaining={isChaining}
            isOperationPending={isOperationPending}
            onToggleFixPoint={toggleFixPoint}
            gridSpacing={gridSpacing}
            onGridSpacingChange={setGridSpacing}
            gridSnapEnabled={gridSnapEnabled}
            onGridSnapToggle={() => setGridSnapEnabled(!gridSnapEnabled)}
            polygonSides={polygonSides}
            onPolygonSidesChange={setPolygonSides}
            conicRho={conicRho}
            onConicRhoChange={setConicRho}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenHelp={() => setHelpOpen(true)}
            onMirror={handleMirror}
            onCorner={handleCorner}
            onOffset={handleOffset}
            onJoin={handleJoin}
            onTransform={handleTransform}
            onPattern={handlePattern}
            onPatternCircular={handleCircularPattern}
            onPatternPath={handlePathPattern}
            onText={() => setTextDialogOpen(true)}
            onHatch={handleHatch}
            hatchPattern={hatchPattern}
            onHatchPatternChange={setHatchPattern}
            hatchSpacing={hatchSpacing}
            onHatchSpacingChange={setHatchSpacing}
            hatchAngle={hatchAngle}
            onHatchAngleChange={setHatchAngle}
            onBlockCreate={handleBlockCreate}
            onBlockInsert={handleBlockInsert}
            onBlockExplode={handleBlockExplode}
            onOpenLayers={() => setLayersOpen(true)}
            onImportDxf={handleImportDxf}
            onExportDxf={handleExportDxf}
            onAddImage={handleAddImage}
            onEditUnderlay={handleEditUnderlay}
            onInclude={() => void handleInclude()}
            onAnalyze={() => setAnalysisOpen(true)}
          />,
          panelSlot,
        )}

      {pendingPaletteConstraint && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setPendingPaletteConstraint(null);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <ValueInputModal
              constraintType={pendingPaletteConstraint.type}
              defaultValue={pendingPaletteConstraint.defaultValue}
              onConfirm={(value) => {
                const type = pendingPaletteConstraint.type;
                const finalValue =
                  type === "angle" ? (value * Math.PI) / 180 : value;
                void applyConstraint(type, finalValue);
                setPendingPaletteConstraint(null);
              }}
              onCancel={() => setPendingPaletteConstraint(null)}
            />
          </div>
        </div>
      )}

      {textDialogOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTextDialogOpen(false);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <TextInputModal
              onConfirm={applyText}
              onCancel={() => setTextDialogOpen(false)}
            />
          </div>
        </div>
      )}

      {underlayEditorOpen && activeSketch && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setUnderlayEditorOpen(false);
          }}
        >
          <ImageUnderlayModal
            underlays={activeSketch.imageUnderlays ?? []}
            attachPoint={(() => {
              const point = activeSketch.primitives.find(
                (primitive) =>
                  primitive.type === "point" &&
                  selectedPrimitives.includes(primitive.id),
              );
              return point?.type === "point"
                ? { x: point.x, y: point.y }
                : null;
            })()}
            onUpdate={updateUnderlay}
            onDelete={deleteUnderlay}
            onClose={() => setUnderlayEditorOpen(false)}
          />
        </div>
      )}

      {analysisOpen && activeSketch && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAnalysisOpen(false);
          }}
        >
          <div className="w-80 rounded border border-gray-600 bg-gray-800 p-4 text-gray-200 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Sketch analysis</h2>
              <button
                className="text-gray-400 hover:text-white"
                onClick={() => setAnalysisOpen(false)}
                aria-label="Close sketch analysis"
              >
                ✕
              </button>
            </div>
            {(() => {
              const analysis = analyzeSketch(activeSketch);
              return (
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <dt className="text-gray-400">Closed profiles</dt>
                  <dd>{analysis.closedProfiles}</dd>
                  <dt className="text-gray-400">Open profiles</dt>
                  <dd>{analysis.openProfiles}</dd>
                  <dt className="text-gray-400">Intersections</dt>
                  <dd>{analysis.intersections}</dd>
                  <dt className="text-gray-400">Max curvature</dt>
                  <dd>{analysis.maxCurvature.toFixed(3)} 1/unit</dd>
                </dl>
              );
            })()}
          </div>
        </div>
      )}

      <input
        ref={dxfInputRef}
        type="file"
        accept=".dxf"
        className="hidden"
        onChange={handleDxfFile}
        aria-label="Import DXF file"
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFile}
        aria-label="Insert image underlay"
      />

      {pendingPathPattern && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setPendingPathPattern(null);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <PathPatternInputModal
              candidates={pendingPathPattern.candidates}
              defaultCount={pendingPathPattern.defaultCount}
              onConfirm={(count, pathId, align) =>
                applyPathPattern(count, pathId, align)
              }
              onCancel={() => setPendingPathPattern(null)}
            />
          </div>
        </div>
      )}

      {pendingCircularPattern && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setPendingCircularPattern(null);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <CircularPatternInputModal
              defaultCount={pendingCircularPattern.defaultCount}
              defaultAngle={pendingCircularPattern.defaultAngle}
              onConfirm={(count, angle) => applyCircularPattern(count, angle)}
              onCancel={() => setPendingCircularPattern(null)}
            />
          </div>
        </div>
      )}

      {pendingPattern && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingPattern(null);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <PatternInputModal
              defaultCount={pendingPattern.defaultCount}
              defaultX={pendingPattern.defaultX}
              defaultY={pendingPattern.defaultY}
              onConfirm={(count, x, y) => applyPattern(count, x, y)}
              onCancel={() => setPendingPattern(null)}
            />
          </div>
        </div>
      )}

      {pendingRotate && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingRotate(null);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <ValueInputModal
              label="Rotation angle"
              unit="deg"
              defaultValue={pendingRotate.defaultValue}
              onConfirm={(value) => applyRotate(value)}
              onCancel={() => setPendingRotate(null)}
            />
          </div>
        </div>
      )}

      {pendingScale && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingScale(null);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <ValueInputModal
              label="Scale factor"
              unit="ratio"
              defaultValue={pendingScale.defaultValue}
              onConfirm={(value) => applyScale(value)}
              onCancel={() => setPendingScale(null)}
            />
          </div>
        </div>
      )}

      {pendingTransform && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingTransform(null);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <VectorInputModal
              title={pendingTransform.mode === "move" ? "Move by" : "Copy by"}
              defaultX={pendingTransform.defaultX}
              defaultY={pendingTransform.defaultY}
              onConfirm={(x, y) => applyTransform(x, y)}
              onCancel={() => setPendingTransform(null)}
            />
          </div>
        </div>
      )}

      {pendingOffset && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingOffset(null);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <ValueInputModal
              label="Offset distance"
              unit="units"
              defaultValue={pendingOffset.defaultValue}
              onConfirm={(value) => applyOffset(value)}
              onCancel={() => setPendingOffset(null)}
            />
          </div>
        </div>
      )}

      {pendingCorner && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingCorner(null);
          }}
        >
          <div className="p-2 bg-gray-800 rounded border border-gray-600 shadow-xl">
            <ValueInputModal
              label={
                pendingCorner.operation === "fillet"
                  ? "Fillet radius"
                  : "Chamfer distance"
              }
              unit="units"
              defaultValue={pendingCorner.defaultValue}
              onConfirm={(value) => applyCorner(value)}
              onCancel={() => setPendingCorner(null)}
            />
          </div>
        </div>
      )}

      {layersOpen && activeSketch && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLayersOpen(false);
          }}
        >
          <div
            className="w-[28rem] max-w-[calc(100vw-2rem)] rounded border border-gray-600 bg-gray-800 p-4 shadow-xl"
            role="dialog"
            aria-label="Sketch layers"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-100">
                Sketch layers
              </h2>
              <button
                className="text-gray-400 hover:text-white"
                onClick={() => setLayersOpen(false)}
                aria-label="Close layers"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className={`flex items-center gap-2 rounded border p-2 ${
                    layer.id === activeLayer?.id
                      ? "border-blue-500 bg-blue-950/30"
                      : "border-gray-700"
                  }`}
                >
                  <input
                    type="color"
                    value={layer.color}
                    aria-label={`${layer.name} colour`}
                    onChange={(event) =>
                      handleLayerUpdate(layer.id, { color: event.target.value })
                    }
                    className="h-6 w-8 cursor-pointer rounded border border-gray-600 bg-transparent"
                  />
                  <input
                    value={layer.name}
                    aria-label={`${layer.name} name`}
                    onChange={(event) =>
                      handleLayerUpdate(layer.id, { name: event.target.value })
                    }
                    className="min-w-0 flex-1 rounded bg-gray-700 px-2 py-1 text-xs text-white"
                  />
                  <select
                    value={layer.linetype}
                    aria-label={`${layer.name} linetype`}
                    onChange={(event) =>
                      handleLayerUpdate(layer.id, {
                        linetype: event.target.value as SketchLayer["linetype"],
                      })
                    }
                    className="rounded bg-gray-700 px-1 py-1 text-xs text-white"
                  >
                    <option value="continuous">Continuous</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                    <option value="center">Center</option>
                  </select>
                  <label className="flex items-center gap-1 text-[10px] text-gray-400">
                    <input
                      type="checkbox"
                      aria-label={`${layer.name} visible`}
                      checked={layer.visible}
                      onChange={(event) =>
                        handleLayerUpdate(layer.id, {
                          visible: event.target.checked,
                        })
                      }
                    />
                    Vis
                  </label>
                  <button
                    className="rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-200 hover:bg-blue-600"
                    onClick={() => {
                      setActiveLayerId(layer.id);
                      handleAssignLayer(layer.id);
                    }}
                    title="Assign selected geometry to this layer"
                  >
                    Assign
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                onClick={handleAddLayer}
              >
                + Layer
              </button>
              <span className="text-[10px] text-gray-400">
                {selectedPrimitives.length} selected
              </span>
            </div>
            <div className="mt-4 border-t border-gray-700 pt-3">
              <h3 className="text-xs font-semibold text-gray-200">
                Sketch variables
              </h3>
              <p className="mt-1 text-[10px] text-gray-400">
                Use these names in dimension expressions, for example{" "}
                <span className="font-mono">width / 2</span>.
              </p>
              <div className="mt-2 space-y-1">
                {Object.entries(activeSketch.variables ?? {}).map(
                  ([name, value]) => (
                    <div key={name} className="flex items-center gap-1">
                      <span className="w-24 truncate font-mono text-xs text-gray-200">
                        {name}
                      </span>
                      <input
                        defaultValue={value}
                        onChange={(event) =>
                          handleVariableValue(name, event.target.value)
                        }
                        aria-label={`${name} value`}
                        className="min-w-0 flex-1 rounded bg-gray-700 px-2 py-1 text-xs text-white"
                      />
                      <button
                        onClick={() => handleRemoveVariable(name)}
                        className="rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-200 hover:bg-red-600"
                        aria-label={`Remove ${name}`}
                      >
                        Remove
                      </button>
                    </div>
                  ),
                )}
              </div>
              <div className="mt-2 flex items-center gap-1">
                <input
                  value={newVariableName}
                  onChange={(event) => setNewVariableName(event.target.value)}
                  placeholder="name"
                  aria-label="New variable name"
                  className="min-w-0 flex-1 rounded bg-gray-700 px-2 py-1 text-xs text-white"
                />
                <input
                  value={newVariableValue}
                  onChange={(event) => setNewVariableValue(event.target.value)}
                  placeholder="value"
                  aria-label="New variable value"
                  className="w-20 rounded bg-gray-700 px-2 py-1 text-xs text-white"
                />
                <button
                  onClick={handleAddVariable}
                  className="rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-500"
                >
                  + Variable
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SketchCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onRun={runSketchCommand}
        availability={commandAvailability}
      />
      <SketchControlsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
};

export default SketchModeContent;
