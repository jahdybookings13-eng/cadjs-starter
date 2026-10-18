import {
  DimensionalConstraint,
  isDimensionalConstraint,
  PLANE_SELECTOR,
  type ConstraintType,
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
import DimensionInput from "../../components/DimensionInput";
import SketchContextMenu from "../../components/SketchContextMenu";
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

  const {
    sketchSubMode,
    setSketchSubMode,
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
  } = useSketchMode();

  // Local UI state for the plane-selection overlay's offset input.
  const [planeOffset, setPlaneOffset] = useState(0);

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
    setPendingDimensionPrimitiveId(constraint.id);
    setDimensionSource("constraintEdit");
    setDimensionInputVisible(true);
  }, [editingConstraintId, activeSketch, renderer, camera]);

  const handleDimensionSubmit = async (value: number) => {
    handleConstraintPreviewCancel();
    if (
      dimensionSource === "constraintEdit" &&
      editingConstraintRef.current &&
      activeSketch
    ) {
      const { id: oldId, type, primitiveIds } = editingConstraintRef.current;
      const finalValue = type === "angle" ? (value * Math.PI) / 180 : value;
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
        driving: true,
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
      applyLineLengthConstraint(pendingDimensionPrimitiveId, value);
    } else if (dimensionSource === "dimensionMode" && activeSketch) {
      const primitive = activeSketch.primitives.find(
        (p) => p.id === pendingDimensionPrimitiveId,
      );
      if (!primitive) return;

      if (primitive.type === "line") {
        await applyConstraint("distance", value);
      } else if (primitive.type === "circle" || primitive.type === "arc") {
        await applyConstraint("radius", value);
      }
    }

    setDimensionInputVisible(false);
    setPendingDimensionPrimitiveId(null);
    setDimensionSource(null);
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

  const showPanel = !isSelectingPlane && !!activeSketch;

  return (
    <>
      {/* Constraint feedback toast (redundant / conflicting). */}
      {constraintFeedback && (
        <div
          className={`absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded shadow-lg text-sm font-medium z-50 pointer-events-none ${
            constraintFeedback.type === "redundant"
              ? "bg-yellow-500 text-black"
              : "bg-red-500 text-white"
          }`}
        >
          {constraintFeedback.message}
        </div>
      )}

      {/* Generic dimension input overlay (line length / radius / constraint edit). */}
      <DimensionInput
        visible={dimensionInputVisible}
        position={dimensionInputPosition}
        label={dimensionInputLabel}
        initialValue={dimensionInputValue}
        onSubmit={handleDimensionSubmit}
        onCancel={handleDimensionCancel}
        onChange={handleDimensionChange}
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
                  value={planeOffset}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setPlaneOffset(v);
                    setSketchPlaneOffset(v);
                  }}
                  className="w-16 px-1 py-0.5 text-xs rounded bg-gray-700 border border-gray-600 text-white text-center"
                />
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
          />,
          panelSlot,
        )}
    </>
  );
};

export default SketchModeContent;
