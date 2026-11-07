import { useCallback } from "react";
import { useCadCore } from "../../../contexts/CoreContext";
import { debugLog } from "../../../config";
import {
  Sketch,
  SketchCircle,
  SketchArc,
  SketchConstraint,
  ConstraintType,
  ConstraintResultStatus,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  findSketchPoint,
  findSketchLine,
  makeSketchConstraint,
} from "../../../types/sketch-types";
import { SketchContextMenu } from "../types";

interface UseSketchConstraintsParams {
  generateId: (prefix: string) => string;
  /** Live mirror of `activeSketch` to avoid stale closures during context menu pre-fill. */
  activeSketchRef: React.MutableRefObject<Sketch | null>;
  /** Current selection (from useSketchSelection). */
  selectedPrimitives: string[];
  /** Clears both selection and constraint highlight. */
  clearSelection: () => void;
  /** Context menu state (read for primitiveIds during apply). */
  contextMenu: SketchContextMenu;
  setContextMenu: React.Dispatch<React.SetStateAction<SketchContextMenu>>;
  closeContextMenu: () => void;
  setSelectedConstraintId: (id: string | null) => void;
  showConstraintFeedback: (status: ConstraintResultStatus) => void;
  /** Constraint preview lifecycle (parent-owned so closeContextMenu can use them). */
  isPreviewingRef: React.MutableRefObject<boolean>;
  previewDebounceRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  previewConstraintIdRef: React.MutableRefObject<string | null>;
}

/**
 * Constraint application subsystem for sketch mode.
 * Owns: applyConstraint, applyConstraintToContextMenuPrimitives, the live
 * preview pipeline (handleConstraintPreviewChange/Cancel), constraint+primitive
 * deletion, fix-point toggle, getCurrentValueForConstraint pre-fill, and the
 * pointOnLine closest-line picker.
 */
export function useSketchConstraints({
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
}: UseSketchConstraintsParams) {
  const {
    activeSketch,
    addConstraintAndSolve,
    removeConstraint,
    updatePrimitive,
    removePrimitive,
    solveSketch,
    pushSketchUndo,
    previewConstraint,
    commitConstraintPreview,
    cancelConstraintPreview,
  } = useCadCore();

  // Distance from a point to a line segment (used by pointOnLine closest-line picker).
  const getDistanceToLine = useCallback(
    (px: number, py: number, lineId: string): number => {
      if (!activeSketch) return Infinity;

      const line = activeSketch.primitives.find((p) => p.id === lineId);
      if (!line || !isSketchLine(line)) return Infinity;

      const p1 = activeSketch.primitives.find((p) => p.id === line.p1Id);
      const p2 = activeSketch.primitives.find((p) => p.id === line.p2Id);
      if (!p1 || !p2 || !isSketchPoint(p1) || !isSketchPoint(p2))
        return Infinity;

      const x1 = p1.x,
        y1 = p1.y;
      const x2 = p2.x,
        y2 = p2.y;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;

      if (lenSq === 0) {
        return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      }

      let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const closestX = x1 + t * dx;
      const closestY = y1 + t * dy;
      return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
    },
    [activeSketch],
  );

  const applyConstraint = useCallback(
    async (type: ConstraintType, value?: number) => {
      if (selectedPrimitives.length === 0 || !activeSketch) {
        console.warn("No primitives selected for constraint");
        return;
      }

      pushSketchUndo();

      const getPrimitive = (id: string) =>
        activeSketch.primitives.find((p) => p.id === id);

      let lastResult: { status: ConstraintResultStatus } = {
        status: "applied",
      };

      const singlePrimitiveConstraints: ConstraintType[] = [
        "horizontal",
        "vertical",
        "radius",
        "diameter",
      ];

      if (
        singlePrimitiveConstraints.includes(type) &&
        selectedPrimitives.length > 1
      ) {
        debugLog(
          `Applying ${type} constraint to ${selectedPrimitives.length} primitives`,
        );
        for (const primitiveId of selectedPrimitives) {
          const constraint = makeSketchConstraint(
            generateId("const"),
            type,
            [primitiveId],
            value,
          );
          debugLog("Applying constraint:", constraint);
          const result = await addConstraintAndSolve(constraint);
          if (result.status !== "applied") lastResult = result;
        }
      } else if (type === "pointOnLine" && selectedPrimitives.length > 2) {
        // Special case: pointOnLine with multiple primitives.
        // Find the point/circle and the CLOSEST line (not just the first one).
        let pointOrCircleId: string | null = null;
        const lineIds: string[] = [];

        for (const id of selectedPrimitives) {
          const prim = getPrimitive(id);
          if (!prim) continue;

          if (isSketchPoint(prim) || isSketchCircle(prim)) {
            if (!pointOrCircleId) pointOrCircleId = id;
          } else if (isSketchLine(prim)) {
            lineIds.push(id);
          }
        }

        if (pointOrCircleId && lineIds.length > 0) {
          const pointOrCircle = getPrimitive(pointOrCircleId);
          let px = 0,
            py = 0;

          if (pointOrCircle) {
            if (isSketchPoint(pointOrCircle)) {
              px = pointOrCircle.x;
              py = pointOrCircle.y;
            } else if (isSketchCircle(pointOrCircle)) {
              const centerPoint = activeSketch.primitives.find(
                (p) => p.id === pointOrCircle.centerId,
              );
              if (centerPoint && isSketchPoint(centerPoint)) {
                px = centerPoint.x;
                py = centerPoint.y;
              }
            }
          }

          let closestLineId = lineIds[0]!;
          let minDistance = Infinity;

          for (const lineId of lineIds) {
            const distance = getDistanceToLine(px, py, lineId);
            if (distance < minDistance) {
              minDistance = distance;
              closestLineId = lineId;
            }
          }

          debugLog(
            `pointOnLine: selected closest line ${closestLineId} at distance ${minDistance.toFixed(4)}`,
          );

          const constraint = makeSketchConstraint(
            generateId("const"),
            type,
            [pointOrCircleId, closestLineId],
            value,
          );
          debugLog("Applying pointOnLine constraint:", constraint);
          lastResult = await addConstraintAndSolve(constraint);
        } else {
          console.warn(
            "Could not find point/circle and line for pointOnLine constraint",
          );
        }
      } else if (type === "pointOnCircle" && selectedPrimitives.length > 2) {
        // Special case: pointOnCircle with multiple primitives
        let pointId: string | null = null;
        let circleId: string | null = null;

        for (const id of selectedPrimitives) {
          const prim = getPrimitive(id);
          if (!prim) continue;

          if (isSketchPoint(prim)) {
            if (!pointId) pointId = id;
          } else if (isSketchCircle(prim) || isSketchArc(prim)) {
            if (!circleId) circleId = id;
          }
        }

        if (pointId && circleId) {
          const constraint = makeSketchConstraint(
            generateId("const"),
            type,
            [pointId, circleId],
            value,
          );
          debugLog("Applying pointOnCircle constraint:", constraint);
          lastResult = await addConstraintAndSolve(constraint);
        } else {
          console.warn(
            "Could not find point and circle for pointOnCircle constraint",
          );
        }
      } else if (type === "tangent" && selectedPrimitives.length > 2) {
        // Special case: tangent with multiple primitives
        let lineId: string | null = null;
        let circleId: string | null = null;

        for (const id of selectedPrimitives) {
          const prim = getPrimitive(id);
          if (!prim) continue;

          if (isSketchLine(prim)) {
            if (!lineId) lineId = id;
          } else if (isSketchCircle(prim)) {
            if (!circleId) circleId = id;
          }
        }

        if (lineId && circleId) {
          const constraint = makeSketchConstraint(
            generateId("const"),
            type,
            [lineId, circleId],
            value,
          );
          debugLog("Applying tangent constraint:", constraint);
          lastResult = await addConstraintAndSolve(constraint);
        } else {
          console.warn("Could not find line and circle for tangent constraint");
        }
      } else {
        // Apply constraint to all selected primitives together
        const constraint = makeSketchConstraint(
          generateId("const"),
          type,
          [...selectedPrimitives],
          value,
        );
        debugLog("Applying constraint:", constraint);
        lastResult = await addConstraintAndSolve(constraint);
      }

      showConstraintFeedback(lastResult.status);
      clearSelection();
    },
    [
      selectedPrimitives,
      activeSketch,
      generateId,
      addConstraintAndSolve,
      clearSelection,
      pushSketchUndo,
      showConstraintFeedback,
      getDistanceToLine,
    ],
  );

  const getCurrentValueForConstraint = useCallback(
    (type: ConstraintType): number | undefined => {
      const sketch = activeSketchRef.current;
      if (!sketch) return undefined;
      const ids = contextMenu.primitiveIds;
      if (ids.length === 0) return undefined;

      if (type === "distance") {
        if (ids.length === 1 && ids[0]) {
          const line = findSketchLine(sketch.primitives, ids[0]);
          if (line) {
            const p1 = findSketchPoint(sketch.primitives, line.p1Id);
            const p2 = findSketchPoint(sketch.primitives, line.p2Id);
            if (p1 && p2) {
              return Math.hypot(p2.x - p1.x, p2.y - p1.y);
            }
          }
        } else if (ids.length === 2 && ids[0] && ids[1]) {
          const pt1 = findSketchPoint(sketch.primitives, ids[0]);
          const pt2 = findSketchPoint(sketch.primitives, ids[1]);
          if (pt1 && pt2) {
            return Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
          }
        }
      } else if (type === "radius") {
        if (ids.length === 1) {
          const circle = sketch.primitives.find(
            (p): p is SketchCircle | SketchArc =>
              p.id === ids[0] && (isSketchCircle(p) || isSketchArc(p)),
          );
          if (circle) return circle.radius;
        }
      }
      return undefined;
    },
    [contextMenu.primitiveIds, activeSketchRef],
  );

  const handleConstraintPreviewChange = useCallback(
    (type: ConstraintType, value: number, overridePrimitiveIds?: string[]) => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current);
      }
      previewDebounceRef.current = setTimeout(() => {
        // Generate a stable constraint ID for all preview iterations
        if (!previewConstraintIdRef.current) {
          previewConstraintIdRef.current = generateId("const");
        }
        isPreviewingRef.current = true;
        const constraint: SketchConstraint = {
          id: previewConstraintIdRef.current,
          type,
          primitiveIds: overridePrimitiveIds ?? [...contextMenu.primitiveIds],
          value,
          driving: true,
        };
        previewConstraint(constraint);
      }, 150);
    },
    [
      contextMenu.primitiveIds,
      generateId,
      previewConstraint,
      previewDebounceRef,
      previewConstraintIdRef,
      isPreviewingRef,
    ],
  );

  const handleConstraintPreviewCancel = useCallback(() => {
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
      previewDebounceRef.current = null;
    }
    if (isPreviewingRef.current) {
      cancelConstraintPreview();
      isPreviewingRef.current = false;
      previewConstraintIdRef.current = null;
    }
  }, [
    cancelConstraintPreview,
    previewDebounceRef,
    isPreviewingRef,
    previewConstraintIdRef,
  ]);

  const deleteConstraint = useCallback(
    (constraintId: string) => {
      pushSketchUndo();
      removeConstraint(constraintId);
      solveSketch();
      setSelectedConstraintId(null);
      closeContextMenu();
    },
    [
      pushSketchUndo,
      removeConstraint,
      solveSketch,
      closeContextMenu,
      setSelectedConstraintId,
    ],
  );

  const toggleFixPoint = useCallback(() => {
    if (!activeSketch || selectedPrimitives.length === 0) return;
    pushSketchUndo();
    for (const primId of selectedPrimitives) {
      const prim = activeSketch.primitives.find((p) => p.id === primId);
      if (prim && isSketchPoint(prim)) {
        updatePrimitive(primId, { fixed: !prim.fixed });
      }
    }
    solveSketch();
  }, [
    activeSketch,
    selectedPrimitives,
    pushSketchUndo,
    updatePrimitive,
    solveSketch,
  ]);

  const deleteSelectedPrimitives = useCallback(() => {
    if (!activeSketch || selectedPrimitives.length === 0) return;
    pushSketchUndo();
    for (const primId of selectedPrimitives) {
      removePrimitive(primId);
    }
    clearSelection();
    solveSketch();
  }, [
    activeSketch,
    selectedPrimitives,
    pushSketchUndo,
    removePrimitive,
    solveSketch,
    clearSelection,
  ]);

  const applyConstraintToContextMenuPrimitives = useCallback(
    async (type: ConstraintType, value?: number) => {
      if (contextMenu.primitiveIds.length === 0) {
        console.warn("No primitives in context menu for constraint");
        closeContextMenu();
        return;
      }

      // If we were previewing, commit the preview (undo is handled by commitConstraintPreview)
      if (isPreviewingRef.current) {
        if (previewDebounceRef.current) {
          clearTimeout(previewDebounceRef.current);
          previewDebounceRef.current = null;
        }
        commitConstraintPreview();
        isPreviewingRef.current = false;
        previewConstraintIdRef.current = null;
        showConstraintFeedback("applied");
        // Close menu without cancelling preview (already committed)
        setContextMenu({
          visible: false,
          x: 0,
          y: 0,
          primitiveIds: [],
          primitiveTypes: [],
        });
        return;
      }

      pushSketchUndo();

      let lastResult: { status: ConstraintResultStatus } = {
        status: "applied",
      };

      const singlePrimitiveConstraints: ConstraintType[] = [
        "horizontal",
        "vertical",
        "radius",
        "diameter",
      ];

      if (
        singlePrimitiveConstraints.includes(type) &&
        contextMenu.primitiveIds.length > 1
      ) {
        debugLog(
          `Applying ${type} constraint to ${contextMenu.primitiveIds.length} primitives from context menu`,
        );
        for (const primitiveId of contextMenu.primitiveIds) {
          const constraint = makeSketchConstraint(
            generateId("const"),
            type,
            [primitiveId],
            value,
          );
          const result = await addConstraintAndSolve(constraint);
          if (result.status !== "applied") lastResult = result;
        }
      } else {
        const constraint = makeSketchConstraint(
          generateId("const"),
          type,
          [...contextMenu.primitiveIds],
          value,
        );
        debugLog("Applying constraint from context menu:", constraint);
        lastResult = await addConstraintAndSolve(constraint);
      }

      showConstraintFeedback(lastResult.status);
      closeContextMenu();
    },
    [
      contextMenu.primitiveIds,
      generateId,
      addConstraintAndSolve,
      closeContextMenu,
      pushSketchUndo,
      showConstraintFeedback,
      commitConstraintPreview,
      setContextMenu,
      isPreviewingRef,
      previewDebounceRef,
      previewConstraintIdRef,
    ],
  );

  return {
    getDistanceToLine,
    applyConstraint,
    getCurrentValueForConstraint,
    handleConstraintPreviewChange,
    handleConstraintPreviewCancel,
    deleteConstraint,
    toggleFixPoint,
    deleteSelectedPrimitives,
    applyConstraintToContextMenuPrimitives,
  };
}
