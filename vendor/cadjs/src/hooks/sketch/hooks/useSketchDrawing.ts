import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  Sketch,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  SketchEllipse,
  SketchEllipticalArc,
  SketchSpline,
  SketchBezier,
  SketchConic,
  SketchConstraint,
  ConstraintResultStatus,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  isSketchBezier,
  isSketchConic,
  isSketchEllipticalArc,
  isSketchSpline,
} from "../../../types/sketch-types";
import { InferencePoint } from "../../useSketchInference";
import { PendingLineDimension } from "../types";
import {
  nearestOnBezier,
  nearestOnConic,
  nearestOnEllipticalArc,
  nearestOnSpline,
  splitArcAtPoint,
  splitBezierAtPoint,
  splitCircleAtPoint,
  splitConicAtPoint,
  splitEllipticalArcAtPoint,
  splitLineAtPoint,
  splitSplineAtPoint,
} from "../sketch-split";
import {
  circleThroughThreePoints,
  distanceToLine,
  ellipseGeometry,
  ellipticalArcGeometry,
  polygonGeometry,
  slotGeometry,
} from "../sketch-geometry";
import {
  SKETCH_CONFIG,
  COLORS,
  pointToLineDistance,
  createLine2FromPoints,
  getAdaptiveSegments,
  createLinePreview,
  createRectanglePreview,
  createCirclePreview,
  createEllipsePreview,
  createEllipticalArcPreview,
  createSplinePreview,
  createBezierPreview,
  createConicPreview,
  createPolygonPreview,
  createSlotPreview,
  SketchTo3D,
} from "../sketch-helpers";
import {
  SKETCH_POINT_SNAP_TOL,
  SKETCH_ZERO_LENGTH_TOL,
} from "../../../sketch-tolerances";
import { SKETCH_PLANE_Z_LIFT_MM } from "../../../visual-constants";

interface UseSketchDrawingParams {
  generateId: (prefix: string) => string;
  sketchTo3DRef: React.MutableRefObject<SketchTo3D>;
  cleanupInferenceObjects: () => void;
  showConstraintFeedback: (
    status: ConstraintResultStatus,
    constraintIds?: string[],
  ) => void;
  // Ctrl-held suppresses auto-constraints; lastSnapRef reflects the latest inference snap.
  ctrlHeldRef: React.MutableRefObject<boolean>;
  lastSnapRef: React.MutableRefObject<InferencePoint | null>;
  polygonSides?: number;
  conicRho?: number;
  /** Chained line mode that tags every segment with one polyline id. */
  polylineMode?: boolean;
}

export function useSketchDrawing({
  generateId,
  sketchTo3DRef,
  cleanupInferenceObjects: _cleanupInferenceObjects,
  showConstraintFeedback,
  ctrlHeldRef,
  lastSnapRef,
  polygonSides = 6,
  conicRho = 0.5,
  polylineMode = false,
}: UseSketchDrawingParams) {
  void _cleanupInferenceObjects;
  const {
    activeSketch,
    addPrimitive,
    updatePrimitive,
    removePrimitive,
    addConstraintAndSolve,
    solveSketch,
    pushSketchUndo,
  } = useCadCore();
  const { scene, camera, renderer, requestRender } = useCadVisualizer();

  const { DOUBLE_CLICK_THRESHOLD, SNAP_DISTANCE } = SKETCH_CONFIG;

  const isDrawingRef = useRef(false);
  const previewObjectRef = useRef<THREE.Object3D | null>(null);
  const centerPointRef = useRef<THREE.Vector3 | null>(null);

  const [isChaining, setIsChaining] = useState(false);
  const polylineModeRef = useRef(polylineMode);
  polylineModeRef.current = polylineMode;
  const activePolylineIdRef = useRef<string | null>(null);
  const chainStartPointRef = useRef<THREE.Vector3 | null>(null);
  const chainStartPointIdRef = useRef<string | null>(null);
  const chainStartIsExistingRef = useRef<boolean>(false);
  const lastClickTimeRef = useRef<number>(0);
  const chainStartSnapRef = useRef<InferencePoint | null>(null);

  const [pendingLineDimension, setPendingLineDimension] =
    useState<PendingLineDimension | null>(null);

  const rectStartRef = useRef<THREE.Vector3 | null>(null);
  const centerRectRef = useRef<THREE.Vector3 | null>(null);
  const isCenterRectDrawingRef = useRef(false);
  const midpointLineSourceRef = useRef<{
    lineId: string;
    midpoint: THREE.Vector3;
  } | null>(null);
  const slotStepRef = useRef(0);
  const slotStartRef = useRef<THREE.Vector3 | null>(null);
  const slotEndRef = useRef<THREE.Vector3 | null>(null);
  const polygonStepRef = useRef(0);
  const polygonCenterRef = useRef<THREE.Vector3 | null>(null);
  const ellipseStepRef = useRef(0);
  const ellipseCenterRef = useRef<THREE.Vector3 | null>(null);
  const ellipseMajorRef = useRef<THREE.Vector3 | null>(null);
  const ellipticalArcStepRef = useRef(0);
  const ellipticalArcCenterRef = useRef<THREE.Vector3 | null>(null);
  const ellipticalArcMajorRef = useRef<THREE.Vector3 | null>(null);
  const ellipticalArcMinorRef = useRef<THREE.Vector3 | null>(null);
  const ellipticalArcStartRef = useRef<THREE.Vector3 | null>(null);

  const arcStepRef = useRef<number>(0);
  const arcStartPointRef = useRef<THREE.Vector3 | null>(null);
  const arcEndPointRef = useRef<THREE.Vector3 | null>(null);

  const circle3pStepRef = useRef<number>(0);
  const circle3pPointsRef = useRef<THREE.Vector3[]>([]);
  const splinePointsRef = useRef<THREE.Vector3[]>([]);
  const splineLastClickTimeRef = useRef(0);
  const splineLastPointRef = useRef<THREE.Vector3 | null>(null);
  const bezierPointsRef = useRef<THREE.Vector3[]>([]);
  const conicPointsRef = useRef<THREE.Vector3[]>([]);

  const findNearbyPoint = useCallback(
    (point: THREE.Vector3): SketchPoint | null => {
      if (!activeSketch) return null;

      for (const primitive of activeSketch.primitives) {
        if (isSketchPoint(primitive)) {
          const dist = Math.sqrt(
            Math.pow(point.x - primitive.x, 2) +
              Math.pow(point.y - primitive.y, 2),
          );
          if (dist < SNAP_DISTANCE) {
            return primitive;
          }
        }
      }
      return null;
    },
    [activeSketch, SNAP_DISTANCE],
  );

  const getOrCreatePoint = useCallback(
    (
      point: THREE.Vector3,
      fixed: boolean = false,
      pushUndo: boolean = true,
    ): { id: string; isExisting: boolean } => {
      const nearbyPoint = findNearbyPoint(point);
      if (nearbyPoint) {
        return { id: nearbyPoint.id, isExisting: true };
      }

      const newPoint: SketchPoint = {
        id: generateId("pt"),
        type: "point",
        x: point.x,
        y: point.y,
        fixed,
      };
      if (pushUndo) pushSketchUndo();
      addPrimitive(newPoint);
      return { id: newPoint.id, isExisting: false };
    },
    [findNearbyPoint, addPrimitive, generateId, pushSketchUndo],
  );

  const cleanupDrawingPreview = useCallback(() => {
    if (previewObjectRef.current && scene) {
      scene.remove(previewObjectRef.current);
      const preview = previewObjectRef.current;
      if (
        preview instanceof Line2 ||
        preview instanceof THREE.Line ||
        preview instanceof THREE.Mesh
      ) {
        preview.geometry.dispose();
        (preview.material as THREE.Material).dispose();
      }
      previewObjectRef.current = null;
      requestRender();
    }
  }, [scene, requestRender]);

  // Returns the post-solve sketch so callers can read updated coords.
  const autoApplyHVConstraint = useCallback(
    async (
      lineId: string,
      p1: THREE.Vector3,
      p2: THREE.Vector3,
    ): Promise<Sketch | null> => {
      const horizontalTolerance = SKETCH_CONFIG.ALIGNMENT_TOLERANCE;
      const verticalTolerance = SKETCH_CONFIG.ALIGNMENT_TOLERANCE;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.abs(Math.atan2(dy, dx));

      if (
        angle < horizontalTolerance ||
        Math.abs(angle - Math.PI) < horizontalTolerance
      ) {
        const constraint: SketchConstraint = {
          id: generateId("const"),
          type: "horizontal",
          primitiveIds: [lineId],
          driving: true,
        };
        const result = await addConstraintAndSolve(constraint);
        if (result.status === "applied") {
          return result.sketch;
        }
        return null;
      }

      if (
        Math.abs(angle - Math.PI / 2) < verticalTolerance ||
        Math.abs(angle + Math.PI / 2) < verticalTolerance
      ) {
        const constraint: SketchConstraint = {
          id: generateId("const"),
          type: "vertical",
          primitiveIds: [lineId],
          driving: true,
        };
        const result = await addConstraintAndSolve(constraint);
        if (result.status === "applied") {
          return result.sketch;
        }
        return null;
      }

      return null;
    },
    [generateId, addConstraintAndSolve],
  );

  const autoApplyCoincidentConstraint = useCallback(
    async (
      pointId: string,
      isExisting: boolean,
      snapInfo: InferencePoint | null,
    ) => {
      if (isExisting || !snapInfo || !activeSketch) return;

      const sourcePrim = activeSketch.primitives.find(
        (p) => p.id === snapInfo.sourceId,
      );
      if (!sourcePrim) return;

      let constraint: SketchConstraint | null = null;

      if (snapInfo.type === "center" && isSketchCircle(sourcePrim)) {
        constraint = {
          id: generateId("const"),
          type: "coincident",
          primitiveIds: [pointId, sourcePrim.centerId],
          driving: true,
        };
      } else if (
        snapInfo.type === "quadrant" &&
        (isSketchCircle(sourcePrim) || isSketchArc(sourcePrim))
      ) {
        constraint = {
          id: generateId("const"),
          type: "pointOnCircle",
          primitiveIds: [pointId, snapInfo.sourceId],
          driving: true,
        };
      } else if (snapInfo.type === "endpoint") {
        if (isSketchLine(sourcePrim)) {
          const p1 = activeSketch.primitives.find(
            (p) => p.id === sourcePrim.p1Id,
          );
          const p2 = activeSketch.primitives.find(
            (p) => p.id === sourcePrim.p2Id,
          );
          let targetPointId: string | null = null;
          if (p1 && isSketchPoint(p1)) {
            const dist = Math.hypot(
              p1.x - snapInfo.position.x,
              p1.y - snapInfo.position.y,
            );
            if (dist < SKETCH_POINT_SNAP_TOL) targetPointId = p1.id;
          }
          if (!targetPointId && p2 && isSketchPoint(p2)) {
            const dist = Math.hypot(
              p2.x - snapInfo.position.x,
              p2.y - snapInfo.position.y,
            );
            if (dist < SKETCH_POINT_SNAP_TOL) targetPointId = p2.id;
          }
          if (targetPointId && targetPointId !== pointId) {
            constraint = {
              id: generateId("const"),
              type: "coincident",
              primitiveIds: [pointId, targetPointId],
              driving: true,
            };
          }
        }
      }

      if (constraint) {
        await addConstraintAndSolve(constraint);
      }
    },
    [activeSketch, generateId, addConstraintAndSolve],
  );

  const autoApplyPerpendicularConstraint = useCallback(
    async (
      lineId: string,
      p1: THREE.Vector3,
      p2: THREE.Vector3,
    ): Promise<boolean> => {
      if (!activeSketch) return false;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      const tolerance = SKETCH_CONFIG.ALIGNMENT_TOLERANCE;

      for (const prim of activeSketch.primitives) {
        if (!isSketchLine(prim) || prim.id === lineId) continue;

        const pt1 = activeSketch.primitives.find((p) => p.id === prim.p1Id);
        const pt2 = activeSketch.primitives.find((p) => p.id === prim.p2Id);
        if (!pt1 || !pt2 || !isSketchPoint(pt1) || !isSketchPoint(pt2))
          continue;

        const existingAngle = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x);
        let diff = Math.abs(angle - existingAngle);
        diff = diff % Math.PI;
        if (diff > Math.PI / 2) diff = Math.PI - diff;

        if (Math.abs(diff - Math.PI / 2) < tolerance) {
          const constraint: SketchConstraint = {
            id: generateId("const"),
            type: "perpendicular",
            primitiveIds: [lineId, prim.id],
            driving: true,
          };
          const result = await addConstraintAndSolve(constraint);
          if (result.status === "applied") {
            return true;
          }
        }
      }
      return false;
    },
    [activeSketch, generateId, addConstraintAndSolve],
  );

  const autoApplyParallelConstraint = useCallback(
    async (
      lineId: string,
      p1: THREE.Vector3,
      p2: THREE.Vector3,
    ): Promise<boolean> => {
      if (!activeSketch) return false;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      const tolerance = SKETCH_CONFIG.ALIGNMENT_TOLERANCE;

      for (const prim of activeSketch.primitives) {
        if (!isSketchLine(prim) || prim.id === lineId || prim.origin) continue;

        const pt1 = activeSketch.primitives.find((p) => p.id === prim.p1Id);
        const pt2 = activeSketch.primitives.find((p) => p.id === prim.p2Id);
        if (!pt1 || !pt2 || !isSketchPoint(pt1) || !isSketchPoint(pt2))
          continue;

        const existingAngle = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x);
        let diff = Math.abs(angle - existingAngle) % Math.PI;
        if (diff > Math.PI / 2) diff = Math.PI - diff;

        if (diff < tolerance) {
          const constraint: SketchConstraint = {
            id: generateId("const"),
            type: "parallel",
            primitiveIds: [lineId, prim.id],
            driving: true,
          };
          const result = await addConstraintAndSolve(constraint);
          if (result.status === "applied") {
            return true;
          }
        }
      }
      return false;
    },
    [activeSketch, generateId, addConstraintAndSolve],
  );

  const autoApplyTangentConstraint = useCallback(
    async (
      lineId: string,
      p1: THREE.Vector3,
      p2: THREE.Vector3,
    ): Promise<boolean> => {
      if (!activeSketch) return false;

      const ldx = p2.x - p1.x;
      const ldy = p2.y - p1.y;
      const lineLen = Math.sqrt(ldx * ldx + ldy * ldy);
      if (lineLen < SKETCH_ZERO_LENGTH_TOL) return false;

      for (const prim of activeSketch.primitives) {
        if (!isSketchCircle(prim) && !isSketchArc(prim)) continue;

        const centerPrim = activeSketch.primitives.find(
          (p) => p.id === prim.centerId,
        );
        if (!centerPrim || !isSketchPoint(centerPrim)) continue;

        const radius = prim.radius;
        const cx = centerPrim.x;
        const cy = centerPrim.y;

        const dist = pointToLineDistance(
          { x: cx, y: cy },
          { x: p1.x, y: p1.y },
          { x: p2.x, y: p2.y },
        );

        if (Math.abs(dist - radius) < radius * 0.05 + 0.02) {
          const constraint: SketchConstraint = {
            id: generateId("const"),
            type: "tangent",
            primitiveIds: [lineId, prim.id],
            driving: true,
          };
          const result = await addConstraintAndSolve(constraint);
          if (result.status === "applied") {
            return true;
          }
        }
      }
      return false;
    },
    [activeSketch, generateId, addConstraintAndSolve],
  );

  const calculateArcFromThreePoints = useCallback(
    (
      start: THREE.Vector3,
      end: THREE.Vector3,
      bulge: THREE.Vector3,
    ): { center: THREE.Vector3; radius: number } | null => {
      const circle = circleThroughThreePoints(
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
        { x: bulge.x, y: bulge.y },
      );
      if (!circle) return null;

      return {
        center: new THREE.Vector3(circle.center.x, circle.center.y, 0),
        radius: circle.radius,
      };
    },
    [],
  );

  const create3PointArcPreview = useCallback(
    (
      start: THREE.Vector3,
      end: THREE.Vector3,
      bulge: THREE.Vector3,
    ): Line2 | null => {
      const arc = calculateArcFromThreePoints(start, end, bulge);
      if (!arc) {
        const s3d = sketchTo3DRef.current(
          start.x,
          start.y,
          SKETCH_PLANE_Z_LIFT_MM,
        );
        const b3d = sketchTo3DRef.current(
          bulge.x,
          bulge.y,
          SKETCH_PLANE_Z_LIFT_MM,
        );
        const e3d = sketchTo3DRef.current(end.x, end.y, SKETCH_PLANE_Z_LIFT_MM);
        const positions = [
          s3d.x,
          s3d.y,
          s3d.z,
          b3d.x,
          b3d.y,
          b3d.z,
          e3d.x,
          e3d.y,
          e3d.z,
        ];
        return createLine2FromPoints(positions, COLORS.preview, 1.5);
      }

      const { center, radius } = arc;
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
      const bulgeAngle = Math.atan2(bulge.y - center.y, bulge.x - center.x);

      let angleDiff = endAngle - startAngle;
      while (angleDiff < 0) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI * 2) angleDiff -= Math.PI * 2;

      let bulgeOnArc = bulgeAngle - startAngle;
      while (bulgeOnArc < 0) bulgeOnArc += Math.PI * 2;
      while (bulgeOnArc > Math.PI * 2) bulgeOnArc -= Math.PI * 2;

      const useShortArc = bulgeOnArc <= angleDiff;
      const sweepAngle = useShortArc ? angleDiff : -(Math.PI * 2 - angleDiff);

      const segments = getAdaptiveSegments(
        camera,
        renderer,
        radius,
        Math.abs(sweepAngle),
      );
      const positions: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + sweepAngle * t;
        const sx = center.x + Math.cos(angle) * radius;
        const sy = center.y + Math.sin(angle) * radius;
        const p3d = sketchTo3DRef.current(sx, sy, SKETCH_PLANE_Z_LIFT_MM);
        positions.push(p3d.x, p3d.y, p3d.z);
      }

      return createLine2FromPoints(positions, COLORS.preview, 1.5);
    },
    [calculateArcFromThreePoints, camera, renderer, sketchTo3DRef],
  );

  const handleLineDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      const now = Date.now();

      if (event.type === "mousedown") {
        if (isChaining && chainStartPointRef.current) {
          const timeSinceLastClick = now - lastClickTimeRef.current;
          if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
            cleanupDrawingPreview();
            setIsChaining(false);
            chainStartPointRef.current = null;
            chainStartPointIdRef.current = null;
            chainStartIsExistingRef.current = false;
            activePolylineIdRef.current = null;
            lastClickTimeRef.current = 0;
            return;
          }
        }

        lastClickTimeRef.current = now;

        if (!isChaining) {
          pushSketchUndo();
          activePolylineIdRef.current = polylineModeRef.current
            ? generateId("pline")
            : null;
          const { id: p1Id, isExisting: p1IsExisting } =
            getOrCreatePoint(point);
          const p1Prim = activeSketch?.primitives.find((p) => p.id === p1Id);
          const actualP1 =
            p1Prim && isSketchPoint(p1Prim)
              ? new THREE.Vector3(p1Prim.x, p1Prim.y, 0)
              : point.clone();
          chainStartPointRef.current = actualP1;
          chainStartPointIdRef.current = p1Id;
          chainStartIsExistingRef.current = p1IsExisting;
          chainStartSnapRef.current = lastSnapRef.current;
          setIsChaining(true);
        } else if (chainStartPointRef.current) {
          pushSketchUndo();
          const startPoint = chainStartPointRef.current.clone();
          const { id: p2Id, isExisting: p2IsExisting } =
            getOrCreatePoint(point);

          const p2Prim = activeSketch?.primitives.find((p) => p.id === p2Id);
          const actualP2 =
            p2Prim && isSketchPoint(p2Prim)
              ? new THREE.Vector3(p2Prim.x, p2Prim.y, 0)
              : point.clone();

          if (p2Id !== chainStartPointIdRef.current) {
            const lineId = generateId("ln");
            const line: SketchLine = {
              id: lineId,
              type: "line",
              p1Id: chainStartPointIdRef.current!,
              p2Id,
              ...(activePolylineIdRef.current
                ? { polylineId: activePolylineIdRef.current }
                : {}),
            };
            addPrimitive(line);

            // Auto-constraint priority: H/V → perpendicular → parallel → tangent → coincident.
            // Ctrl suppresses all; snapping to an existing endpoint suppresses H/V (the
            // existing geometry already pins the orientation).
            const suppressAuto = ctrlHeldRef.current;
            const suppressHV =
              suppressAuto || p2IsExisting || chainStartIsExistingRef.current;

            let hvApplied = false;
            if (!suppressHV) {
              const hvSketchResult = await autoApplyHVConstraint(
                lineId,
                startPoint,
                actualP2,
              );
              hvApplied = hvSketchResult !== null;
            }

            let perpApplied = false;
            if (!suppressAuto && !hvApplied) {
              perpApplied = await autoApplyPerpendicularConstraint(
                lineId,
                startPoint,
                actualP2,
              );
            }

            let parallelApplied = false;
            if (!suppressAuto && !hvApplied && !perpApplied) {
              parallelApplied = await autoApplyParallelConstraint(
                lineId,
                startPoint,
                actualP2,
              );
            }

            if (
              !suppressAuto &&
              !hvApplied &&
              !perpApplied &&
              !parallelApplied
            ) {
              await autoApplyTangentConstraint(lineId, startPoint, actualP2);
            }

            if (!suppressAuto) {
              await autoApplyCoincidentConstraint(
                chainStartPointIdRef.current!,
                chainStartIsExistingRef.current,
                chainStartSnapRef.current,
              );
              await autoApplyCoincidentConstraint(
                p2Id,
                p2IsExisting,
                lastSnapRef.current,
              );
            }

            const solvedSketch = await solveSketch();

            const finalSketch = solvedSketch;
            let finalP2 = actualP2.clone();
            if (finalSketch) {
              const solvedPoint = finalSketch.primitives.find(
                (p) => p.id === p2Id,
              );
              if (solvedPoint && isSketchPoint(solvedPoint)) {
                finalP2 = new THREE.Vector3(solvedPoint.x, solvedPoint.y, 0);
              }
            }

            const lineLength = startPoint.distanceTo(finalP2);
            const mid2D = new THREE.Vector3()
              .addVectors(startPoint, finalP2)
              .multiplyScalar(0.5);
            const midpoint = sketchTo3DRef.current(mid2D.x, mid2D.y, 0);
            setPendingLineDimension({
              lineId,
              p1: startPoint.clone(),
              p2: finalP2.clone(),
              length: lineLength,
              midpoint,
            });

            // Chain continues from the post-solve position so subsequent constraints
            // are evaluated against the actual placement, not the cursor target.
            chainStartPointRef.current = finalP2.clone();
            chainStartPointIdRef.current = p2Id;
            chainStartIsExistingRef.current = p2IsExisting;
            chainStartSnapRef.current = lastSnapRef.current;
          }
        }
      } else if (event.type === "mousemove") {
        if (!isChaining || !chainStartPointRef.current) return;

        cleanupDrawingPreview();
        const preview = createLinePreview(
          chainStartPointRef.current,
          point,
          sketchTo3DRef.current,
        );
        if (scene) {
          scene.add(preview);
          previewObjectRef.current = preview;
          requestRender();
        }
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      getOrCreatePoint,
      addPrimitive,
      solveSketch,
      generateId,
      isChaining,
      autoApplyHVConstraint,
      autoApplyCoincidentConstraint,
      autoApplyPerpendicularConstraint,
      autoApplyParallelConstraint,
      autoApplyTangentConstraint,
      activeSketch,
      pushSketchUndo,
      DOUBLE_CLICK_THRESHOLD,
      ctrlHeldRef,
      lastSnapRef,
      sketchTo3DRef,
      requestRender,
    ],
  );

  const handleMidpointLineDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        if (!midpointLineSourceRef.current) {
          if (!activeSketch) return;

          let best: {
            lineId: string;
            midpoint: THREE.Vector3;
            distance: number;
          } | null = null;

          for (const primitive of activeSketch.primitives) {
            if (!isSketchLine(primitive) || primitive.origin) continue;
            const p1 = activeSketch.primitives.find(
              (p) => p.id === primitive.p1Id,
            );
            const p2 = activeSketch.primitives.find(
              (p) => p.id === primitive.p2Id,
            );
            if (!p1 || !p2 || !isSketchPoint(p1) || !isSketchPoint(p2)) {
              continue;
            }

            const distance = pointToLineDistance(point, p1, p2);
            if (
              distance <= SNAP_DISTANCE * 2 &&
              (!best || distance < best.distance)
            ) {
              best = {
                lineId: primitive.id,
                midpoint: new THREE.Vector3(
                  (p1.x + p2.x) / 2,
                  (p1.y + p2.y) / 2,
                  0,
                ),
                distance,
              };
            }
          }

          if (best) {
            midpointLineSourceRef.current = {
              lineId: best.lineId,
              midpoint: best.midpoint,
            };
          }
          return;
        }

        const source = midpointLineSourceRef.current;
        cleanupDrawingPreview();
        pushSketchUndo();

        const { id: startId } = getOrCreatePoint(source.midpoint, false, false);
        const { id: endId } = getOrCreatePoint(point, false, false);

        if (startId !== endId) {
          addPrimitive({
            id: generateId("ln"),
            type: "line",
            p1Id: startId,
            p2Id: endId,
          });

          // The start point is the true midpoint, not just placed there once.
          await addConstraintAndSolve({
            id: generateId("const"),
            type: "midpoint",
            primitiveIds: [startId, source.lineId],
            driving: true,
          });
          await solveSketch();
        }

        midpointLineSourceRef.current = null;
        return;
      }

      if (event.type !== "mousemove") return;
      if (!midpointLineSourceRef.current) return;

      cleanupDrawingPreview();
      const preview = createLinePreview(
        midpointLineSourceRef.current.midpoint,
        point,
        sketchTo3DRef.current,
      );
      if (scene) {
        scene.add(preview);
        previewObjectRef.current = preview;
        requestRender();
      }
    },
    [
      activeSketch,
      SNAP_DISTANCE,
      scene,
      cleanupDrawingPreview,
      getOrCreatePoint,
      addPrimitive,
      addConstraintAndSolve,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      requestRender,
    ],
  );

  const handleRectangleDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        isDrawingRef.current = true;
        rectStartRef.current = point.clone();
      } else if (event.type === "mousemove") {
        if (!isDrawingRef.current || !rectStartRef.current) return;

        cleanupDrawingPreview();
        const preview = createRectanglePreview(
          rectStartRef.current,
          point,
          sketchTo3DRef.current,
        );
        if (scene) {
          scene.add(preview);
          previewObjectRef.current = preview;
          requestRender();
        }
      } else if (event.type === "mouseup") {
        if (!isDrawingRef.current || !rectStartRef.current) return;

        cleanupDrawingPreview();

        const start = rectStartRef.current;
        const width = Math.abs(point.x - start.x);
        const height = Math.abs(point.y - start.y);

        if (width > 0.05 && height > 0.05) {
          const minX = Math.min(start.x, point.x);
          const maxX = Math.max(start.x, point.x);
          const minY = Math.min(start.y, point.y);
          const maxY = Math.max(start.y, point.y);

          pushSketchUndo();

          const blId = generateId("pt");
          const brId = generateId("pt");
          const trId = generateId("pt");
          const tlId = generateId("pt");

          const blPt: SketchPoint = {
            id: blId,
            type: "point",
            x: minX,
            y: minY,
          };
          const brPt: SketchPoint = {
            id: brId,
            type: "point",
            x: maxX,
            y: minY,
          };
          const trPt: SketchPoint = {
            id: trId,
            type: "point",
            x: maxX,
            y: maxY,
          };
          const tlPt: SketchPoint = {
            id: tlId,
            type: "point",
            x: minX,
            y: maxY,
          };

          addPrimitive(blPt);
          addPrimitive(brPt);
          addPrimitive(trPt);
          addPrimitive(tlPt);

          const bottomId = generateId("ln");
          const rightId = generateId("ln");
          const topId = generateId("ln");
          const leftId = generateId("ln");

          const bottomLine: SketchLine = {
            id: bottomId,
            type: "line",
            p1Id: blId,
            p2Id: brId,
          };
          const rightLine: SketchLine = {
            id: rightId,
            type: "line",
            p1Id: brId,
            p2Id: trId,
          };
          const topLine: SketchLine = {
            id: topId,
            type: "line",
            p1Id: trId,
            p2Id: tlId,
          };
          const leftLine: SketchLine = {
            id: leftId,
            type: "line",
            p1Id: tlId,
            p2Id: blId,
          };

          addPrimitive(bottomLine);
          addPrimitive(rightLine);
          addPrimitive(topLine);
          addPrimitive(leftLine);

          const hBottom: SketchConstraint = {
            id: generateId("const"),
            type: "horizontal",
            primitiveIds: [bottomId],
            driving: true,
          };
          const hTop: SketchConstraint = {
            id: generateId("const"),
            type: "horizontal",
            primitiveIds: [topId],
            driving: true,
          };
          const vRight: SketchConstraint = {
            id: generateId("const"),
            type: "vertical",
            primitiveIds: [rightId],
            driving: true,
          };
          const vLeft: SketchConstraint = {
            id: generateId("const"),
            type: "vertical",
            primitiveIds: [leftId],
            driving: true,
          };

          await addConstraintAndSolve(hBottom);
          await addConstraintAndSolve(hTop);
          await addConstraintAndSolve(vRight);
          await addConstraintAndSolve(vLeft);

          await solveSketch();
        }

        isDrawingRef.current = false;
        rectStartRef.current = null;
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      addPrimitive,
      addConstraintAndSolve,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      requestRender,
    ],
  );

  const handleCenterRectangleDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        isCenterRectDrawingRef.current = true;
        centerRectRef.current = point.clone();
        return;
      }

      if (event.type === "mousemove") {
        if (!isCenterRectDrawingRef.current || !centerRectRef.current) return;

        cleanupDrawingPreview();
        const center = centerRectRef.current;
        const opposite = new THREE.Vector3(
          center.x * 2 - point.x,
          center.y * 2 - point.y,
          0,
        );
        const preview = createRectanglePreview(
          opposite,
          point,
          sketchTo3DRef.current,
        );
        if (scene) {
          scene.add(preview);
          previewObjectRef.current = preview;
          requestRender();
        }
        return;
      }

      if (event.type !== "mouseup") return;
      if (!isCenterRectDrawingRef.current || !centerRectRef.current) return;

      cleanupDrawingPreview();
      const center = centerRectRef.current;
      const halfWidth = Math.abs(point.x - center.x);
      const halfHeight = Math.abs(point.y - center.y);

      if (halfWidth > 0.05 && halfHeight > 0.05) {
        pushSketchUndo();

        const minX = center.x - halfWidth;
        const maxX = center.x + halfWidth;
        const minY = center.y - halfHeight;
        const maxY = center.y + halfHeight;

        const centerId = generateId("pt");
        const blId = generateId("pt");
        const brId = generateId("pt");
        const trId = generateId("pt");
        const tlId = generateId("pt");

        addPrimitive({ id: centerId, type: "point", x: center.x, y: center.y });
        addPrimitive({ id: blId, type: "point", x: minX, y: minY });
        addPrimitive({ id: brId, type: "point", x: maxX, y: minY });
        addPrimitive({ id: trId, type: "point", x: maxX, y: maxY });
        addPrimitive({ id: tlId, type: "point", x: minX, y: maxY });

        const bottomId = generateId("ln");
        const rightId = generateId("ln");
        const topId = generateId("ln");
        const leftId = generateId("ln");

        addPrimitive({
          id: bottomId,
          type: "line",
          p1Id: blId,
          p2Id: brId,
        });
        addPrimitive({
          id: rightId,
          type: "line",
          p1Id: brId,
          p2Id: trId,
        });
        addPrimitive({
          id: topId,
          type: "line",
          p1Id: trId,
          p2Id: tlId,
        });
        addPrimitive({
          id: leftId,
          type: "line",
          p1Id: tlId,
          p2Id: blId,
        });

        const sideConstraints: SketchConstraint[] = [
          {
            id: generateId("const"),
            type: "horizontal",
            primitiveIds: [bottomId],
            driving: true,
          },
          {
            id: generateId("const"),
            type: "horizontal",
            primitiveIds: [topId],
            driving: true,
          },
          {
            id: generateId("const"),
            type: "vertical",
            primitiveIds: [rightId],
            driving: true,
          },
          {
            id: generateId("const"),
            type: "vertical",
            primitiveIds: [leftId],
            driving: true,
          },
        ];

        for (const constraint of sideConstraints) {
          await addConstraintAndSolve(constraint);
        }

        // The centre is the symmetry point for both diagonals. That makes it
        // the true midpoint of each diagonal, not a decorative point.
        await addConstraintAndSolve({
          id: generateId("const"),
          type: "symmetric",
          primitiveIds: [blId, trId, centerId],
          driving: true,
        });
        await addConstraintAndSolve({
          id: generateId("const"),
          type: "symmetric",
          primitiveIds: [brId, tlId, centerId],
          driving: true,
        });

        await solveSketch();
      }

      isCenterRectDrawingRef.current = false;
      centerRectRef.current = null;
    },
    [
      scene,
      cleanupDrawingPreview,
      addPrimitive,
      addConstraintAndSolve,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      requestRender,
    ],
  );

  const handleSlotDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        if (slotStepRef.current === 0) {
          slotStartRef.current = point.clone();
          slotStepRef.current = 1;
          return;
        }

        if (slotStepRef.current === 1) {
          const start = slotStartRef.current;
          if (start && start.distanceTo(point) > 0.1) {
            slotEndRef.current = point.clone();
            slotStepRef.current = 2;
          }
          return;
        }

        cleanupDrawingPreview();
        const start = slotStartRef.current;
        const end = slotEndRef.current;

        if (start && end) {
          const radius = distanceToLine(point, start, end);
          const slot = slotGeometry(start, end, radius);

          if (slot) {
            pushSketchUndo();

            const aId = generateId("pt");
            const bId = generateId("pt");
            const aTopId = generateId("pt");
            const aBottomId = generateId("pt");
            const bTopId = generateId("pt");
            const bBottomId = generateId("pt");

            const points: SketchPoint[] = [
              { id: aId, type: "point", x: slot.a.x, y: slot.a.y },
              { id: bId, type: "point", x: slot.b.x, y: slot.b.y },
              { id: aTopId, type: "point", x: slot.topA.x, y: slot.topA.y },
              {
                id: aBottomId,
                type: "point",
                x: slot.bottomA.x,
                y: slot.bottomA.y,
              },
              { id: bTopId, type: "point", x: slot.topB.x, y: slot.topB.y },
              {
                id: bBottomId,
                type: "point",
                x: slot.bottomB.x,
                y: slot.bottomB.y,
              },
            ];
            for (const p of points) addPrimitive(p);

            const leftArcId = generateId("arc");
            const rightArcId = generateId("arc");
            addPrimitive({
              id: leftArcId,
              type: "arc",
              centerId: aId,
              startId: aTopId,
              endId: aBottomId,
              radius: slot.radius,
            });
            addPrimitive({
              id: rightArcId,
              type: "arc",
              centerId: bId,
              startId: bBottomId,
              endId: bTopId,
              radius: slot.radius,
            });

            const topLineId = generateId("ln");
            const bottomLineId = generateId("ln");
            addPrimitive({
              id: topLineId,
              type: "line",
              p1Id: aTopId,
              p2Id: bTopId,
            });
            addPrimitive({
              id: bottomLineId,
              type: "line",
              p1Id: bBottomId,
              p2Id: aBottomId,
            });

            const constraints: SketchConstraint[] = [
              {
                id: generateId("const"),
                type: "symmetric",
                primitiveIds: [aTopId, aBottomId, aId],
                driving: true,
              },
              {
                id: generateId("const"),
                type: "symmetric",
                primitiveIds: [bTopId, bBottomId, bId],
                driving: true,
              },
              {
                id: generateId("const"),
                type: "parallel",
                primitiveIds: [topLineId, bottomLineId],
                driving: true,
              },
              {
                id: generateId("const"),
                type: "equal",
                primitiveIds: [leftArcId, rightArcId],
                driving: true,
              },
            ];

            for (const constraint of constraints) {
              await addConstraintAndSolve(constraint);
            }
            await solveSketch();
          }
        }

        slotStepRef.current = 0;
        slotStartRef.current = null;
        slotEndRef.current = null;
        return;
      }

      if (event.type !== "mousemove") return;
      const start = slotStartRef.current;
      if (!start || slotStepRef.current === 0) return;

      cleanupDrawingPreview();

      if (slotStepRef.current === 1) {
        const preview = createLinePreview(start, point, sketchTo3DRef.current);
        if (scene) {
          scene.add(preview);
          previewObjectRef.current = preview;
          requestRender();
        }
        return;
      }

      const end = slotEndRef.current;
      if (!end) return;

      const radius = distanceToLine(point, start, end);
      const preview = createSlotPreview(
        start,
        end,
        radius,
        sketchTo3DRef.current,
        camera,
        renderer,
      );
      if (scene && preview) {
        scene.add(preview);
        previewObjectRef.current = preview;
        requestRender();
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      addPrimitive,
      addConstraintAndSolve,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      camera,
      renderer,
      requestRender,
    ],
  );

  const handlePolygonDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        if (polygonStepRef.current === 0) {
          polygonCenterRef.current = point.clone();
          polygonStepRef.current = 1;
          return;
        }

        cleanupDrawingPreview();
        const center = polygonCenterRef.current;
        if (center) {
          const polygon = polygonGeometry(center, point, polygonSides);
          if (polygon) {
            pushSketchUndo();

            const centerId = generateId("pt");
            addPrimitive({
              id: centerId,
              type: "point",
              x: center.x,
              y: center.y,
            });

            const circleId = generateId("cir");
            addPrimitive({
              id: circleId,
              type: "circle",
              centerId,
              radius: polygon.radius,
              construction: true,
            });

            const vertexIds = polygon.vertices.map(() => generateId("pt"));
            for (let i = 0; i < polygon.vertices.length; i++) {
              const vertex = polygon.vertices[i]!;
              addPrimitive({
                id: vertexIds[i]!,
                type: "point",
                x: vertex.x,
                y: vertex.y,
              });
            }

            const lineIds = polygon.vertices.map(() => generateId("ln"));
            for (let i = 0; i < vertexIds.length; i++) {
              addPrimitive({
                id: lineIds[i]!,
                type: "line",
                p1Id: vertexIds[i]!,
                p2Id: vertexIds[(i + 1) % vertexIds.length]!,
              });
            }

            for (const vertexId of vertexIds) {
              await addConstraintAndSolve({
                id: generateId("const"),
                type: "pointOnCircle",
                primitiveIds: [vertexId, circleId],
                driving: true,
              });
            }
            for (let i = 1; i < lineIds.length; i++) {
              await addConstraintAndSolve({
                id: generateId("const"),
                type: "equal",
                primitiveIds: [lineIds[0]!, lineIds[i]!],
                driving: true,
              });
            }

            await solveSketch();
          }
        }

        polygonStepRef.current = 0;
        polygonCenterRef.current = null;
        return;
      }

      if (event.type !== "mousemove") return;
      if (polygonStepRef.current !== 1 || !polygonCenterRef.current) return;

      cleanupDrawingPreview();
      const preview = createPolygonPreview(
        polygonCenterRef.current,
        point,
        polygonSides,
        sketchTo3DRef.current,
      );
      if (scene && preview) {
        scene.add(preview);
        previewObjectRef.current = preview;
        requestRender();
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      addPrimitive,
      addConstraintAndSolve,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      requestRender,
      polygonSides,
    ],
  );

  const handleCircleDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        isDrawingRef.current = true;
        centerPointRef.current = point.clone();
      } else if (event.type === "mousemove") {
        if (!isDrawingRef.current || !centerPointRef.current) return;

        cleanupDrawingPreview();
        const radius = centerPointRef.current.distanceTo(point);
        const preview = createCirclePreview(
          centerPointRef.current,
          radius,
          sketchTo3DRef.current,
          camera,
          renderer,
        );
        if (scene) {
          scene.add(preview);
          previewObjectRef.current = preview;
          requestRender();
        }
      } else if (event.type === "mouseup") {
        if (!isDrawingRef.current || !centerPointRef.current) return;

        cleanupDrawingPreview();

        const radius = centerPointRef.current.distanceTo(point);
        if (radius > 0.1) {
          pushSketchUndo();
          const { id: centerId } = getOrCreatePoint(centerPointRef.current);

          const circle: SketchCircle = {
            id: generateId("cir"),
            type: "circle",
            centerId,
            radius,
          };
          addPrimitive(circle);

          await solveSketch();
        }

        isDrawingRef.current = false;
        centerPointRef.current = null;
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      camera,
      renderer,
      getOrCreatePoint,
      addPrimitive,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      requestRender,
    ],
  );

  const handleArcDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        if (arcStepRef.current === 0) {
          arcStartPointRef.current = point.clone();
          arcStepRef.current = 1;
        } else if (arcStepRef.current === 1) {
          arcEndPointRef.current = point.clone();
          arcStepRef.current = 2;
        } else if (arcStepRef.current === 2) {
          cleanupDrawingPreview();

          if (arcStartPointRef.current && arcEndPointRef.current) {
            const arcSpec = calculateArcFromThreePoints(
              arcStartPointRef.current,
              arcEndPointRef.current,
              point,
            );

            if (arcSpec) {
              pushSketchUndo();
              const { center, radius } = arcSpec;
              const { id: centerId } = getOrCreatePoint(center);
              const { id: startId } = getOrCreatePoint(
                arcStartPointRef.current,
              );
              const { id: endId } = getOrCreatePoint(arcEndPointRef.current);

              const startAngle = Math.atan2(
                arcStartPointRef.current.y - center.y,
                arcStartPointRef.current.x - center.x,
              );
              const endAngle = Math.atan2(
                arcEndPointRef.current.y - center.y,
                arcEndPointRef.current.x - center.x,
              );
              const bulgeAngle = Math.atan2(
                point.y - center.y,
                point.x - center.x,
              );

              let angleDiff = endAngle - startAngle;
              while (angleDiff < 0) angleDiff += Math.PI * 2;
              while (angleDiff > Math.PI * 2) angleDiff -= Math.PI * 2;

              let bulgeOffset = bulgeAngle - startAngle;
              while (bulgeOffset < 0) bulgeOffset += Math.PI * 2;
              while (bulgeOffset > Math.PI * 2) bulgeOffset -= Math.PI * 2;

              const bulgeOnCCW = bulgeOffset <= angleDiff;

              const arc: SketchArc = {
                id: generateId("arc"),
                type: "arc",
                centerId,
                startId: bulgeOnCCW ? startId : endId,
                endId: bulgeOnCCW ? endId : startId,
                radius,
              };
              addPrimitive(arc);
              await solveSketch();
            }
          }

          arcStepRef.current = 0;
          arcStartPointRef.current = null;
          arcEndPointRef.current = null;
        }
      } else if (event.type === "mousemove") {
        cleanupDrawingPreview();

        if (arcStepRef.current === 1 && arcStartPointRef.current) {
          const preview = createLinePreview(
            arcStartPointRef.current,
            point,
            sketchTo3DRef.current,
          );
          if (scene) {
            scene.add(preview);
            previewObjectRef.current = preview;
            requestRender();
          }
        } else if (
          arcStepRef.current === 2 &&
          arcStartPointRef.current &&
          arcEndPointRef.current
        ) {
          const preview = create3PointArcPreview(
            arcStartPointRef.current,
            arcEndPointRef.current,
            point,
          );
          if (scene && preview) {
            scene.add(preview);
            previewObjectRef.current = preview;
            requestRender();
          }
        }
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      create3PointArcPreview,
      calculateArcFromThreePoints,
      getOrCreatePoint,
      addPrimitive,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      requestRender,
    ],
  );

  const handleCircle3PointDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        if (circle3pStepRef.current === 0) {
          circle3pPointsRef.current = [point.clone()];
          circle3pStepRef.current = 1;
          return;
        }

        if (circle3pStepRef.current === 1) {
          circle3pPointsRef.current.push(point.clone());
          circle3pStepRef.current = 2;
          return;
        }

        const [first, second] = circle3pPointsRef.current;
        cleanupDrawingPreview();

        if (first && second) {
          const circle = circleThroughThreePoints(first, second, point);
          if (circle) {
            // One undo entry owns the points, the circle and its constraints.
            pushSketchUndo();

            const { id: centerId } = getOrCreatePoint(
              new THREE.Vector3(circle.center.x, circle.center.y, 0),
              false,
              false,
            );
            const { id: firstId } = getOrCreatePoint(first, false, false);
            const { id: secondId } = getOrCreatePoint(second, false, false);
            const { id: thirdId } = getOrCreatePoint(point, false, false);

            const circleId = generateId("cir");
            const circlePrimitive: SketchCircle = {
              id: circleId,
              type: "circle",
              centerId,
              radius: circle.radius,
            };
            addPrimitive(circlePrimitive);

            // The three picked points define the circle; point-on-circle
            // constraints keep it parametric after the tool finishes.
            for (const pointId of [firstId, secondId, thirdId]) {
              const constraint: SketchConstraint = {
                id: generateId("const"),
                type: "pointOnCircle",
                primitiveIds: [pointId, circleId],
                driving: true,
              };
              await addConstraintAndSolve(constraint);
            }

            await solveSketch();
          }
        }

        circle3pStepRef.current = 0;
        circle3pPointsRef.current = [];
        return;
      }

      if (event.type !== "mousemove") return;

      const first = circle3pPointsRef.current[0];
      if (!first || circle3pStepRef.current === 0) return;

      cleanupDrawingPreview();

      if (circle3pStepRef.current === 1) {
        const preview = createLinePreview(first, point, sketchTo3DRef.current);
        if (scene) {
          scene.add(preview);
          previewObjectRef.current = preview;
          requestRender();
        }
        return;
      }

      const second = circle3pPointsRef.current[1];
      if (!second) return;

      const circle = circleThroughThreePoints(first, second, point);
      if (!circle) return;

      const preview = createCirclePreview(
        new THREE.Vector3(circle.center.x, circle.center.y, 0),
        circle.radius,
        sketchTo3DRef.current,
        camera,
        renderer,
      );
      if (scene) {
        scene.add(preview);
        previewObjectRef.current = preview;
        requestRender();
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      getOrCreatePoint,
      addPrimitive,
      addConstraintAndSolve,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      camera,
      renderer,
      requestRender,
    ],
  );

  const handleEllipseDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        if (ellipseStepRef.current === 0) {
          ellipseCenterRef.current = point.clone();
          ellipseStepRef.current = 1;
          return;
        }

        if (ellipseStepRef.current === 1) {
          const center = ellipseCenterRef.current;
          if (!center || point.distanceTo(center) < 1e-6) return;
          ellipseMajorRef.current = point.clone();
          ellipseStepRef.current = 2;
          return;
        }

        cleanupDrawingPreview();
        const center = ellipseCenterRef.current;
        const majorPoint = ellipseMajorRef.current;
        if (center && majorPoint) {
          const ellipse = ellipseGeometry(center, majorPoint, point);
          if (ellipse) {
            // One undo entry owns the centre point and the ellipse.
            pushSketchUndo();
            const { id: centerId } = getOrCreatePoint(
              new THREE.Vector3(ellipse.center.x, ellipse.center.y, 0),
              false,
              false,
            );
            const primitive: SketchEllipse = {
              id: generateId("ell"),
              type: "ellipse",
              centerId,
              majorRadius: ellipse.majorRadius,
              minorRadius: ellipse.minorRadius,
              rotation: ellipse.rotation,
            };
            addPrimitive(primitive);
            await solveSketch();
          }
        }

        ellipseStepRef.current = 0;
        ellipseCenterRef.current = null;
        ellipseMajorRef.current = null;
        return;
      }

      if (event.type !== "mousemove") return;
      const center = ellipseCenterRef.current;
      if (!center) return;

      if (ellipseStepRef.current === 1) {
        cleanupDrawingPreview();
        const preview = createLinePreview(center, point, sketchTo3DRef.current);
        if (scene) {
          scene.add(preview);
          previewObjectRef.current = preview;
          requestRender();
        }
        return;
      }

      const majorPoint = ellipseMajorRef.current;
      if (ellipseStepRef.current !== 2 || !majorPoint) return;

      cleanupDrawingPreview();
      const preview = createEllipsePreview(
        center,
        majorPoint,
        point,
        sketchTo3DRef.current,
        camera,
        renderer,
      );
      if (scene && preview) {
        scene.add(preview);
        previewObjectRef.current = preview;
        requestRender();
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      getOrCreatePoint,
      addPrimitive,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      camera,
      renderer,
      requestRender,
    ],
  );

  const handleEllipticalArcDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        if (ellipticalArcStepRef.current === 0) {
          ellipticalArcCenterRef.current = point.clone();
          ellipticalArcStepRef.current = 1;
          return;
        }
        if (ellipticalArcStepRef.current === 1) {
          ellipticalArcMajorRef.current = point.clone();
          ellipticalArcStepRef.current = 2;
          return;
        }
        if (ellipticalArcStepRef.current === 2) {
          ellipticalArcMinorRef.current = point.clone();
          ellipticalArcStepRef.current = 3;
          return;
        }
        if (ellipticalArcStepRef.current === 3) {
          ellipticalArcStartRef.current = point.clone();
          ellipticalArcStepRef.current = 4;
          return;
        }

        cleanupDrawingPreview();
        const center = ellipticalArcCenterRef.current;
        const majorPoint = ellipticalArcMajorRef.current;
        const minorPoint = ellipticalArcMinorRef.current;
        const startPoint = ellipticalArcStartRef.current;
        if (center && majorPoint && minorPoint && startPoint) {
          const arc = ellipticalArcGeometry(
            center,
            majorPoint,
            minorPoint,
            startPoint,
            point,
          );
          if (arc) {
            pushSketchUndo();
            const { id: centerId } = getOrCreatePoint(
              new THREE.Vector3(arc.center.x, arc.center.y, 0),
              false,
              false,
            );
            const primitive: SketchEllipticalArc = {
              id: generateId("earc"),
              type: "ellipticalArc",
              centerId,
              majorRadius: arc.majorRadius,
              minorRadius: arc.minorRadius,
              rotation: arc.rotation,
              startAngle: arc.startAngle,
              endAngle: arc.endAngle,
            };
            addPrimitive(primitive);
            await solveSketch();
          }
        }

        ellipticalArcStepRef.current = 0;
        ellipticalArcCenterRef.current = null;
        ellipticalArcMajorRef.current = null;
        ellipticalArcMinorRef.current = null;
        ellipticalArcStartRef.current = null;
        return;
      }

      if (event.type !== "mousemove") return;
      const center = ellipticalArcCenterRef.current;
      const majorPoint = ellipticalArcMajorRef.current;
      if (!center || !majorPoint) return;

      cleanupDrawingPreview();
      let preview: Line2 | null = null;

      if (ellipticalArcStepRef.current === 1) {
        preview = createLinePreview(center, point, sketchTo3DRef.current);
      } else if (ellipticalArcStepRef.current === 2) {
        preview = createEllipsePreview(
          center,
          majorPoint,
          point,
          sketchTo3DRef.current,
          camera,
          renderer,
        );
      } else if (ellipticalArcStepRef.current === 3) {
        const minorPoint = ellipticalArcMinorRef.current;
        if (minorPoint) {
          preview = createEllipsePreview(
            center,
            majorPoint,
            minorPoint,
            sketchTo3DRef.current,
            camera,
            renderer,
          );
        }
      } else if (ellipticalArcStepRef.current === 4) {
        const minorPoint = ellipticalArcMinorRef.current;
        const startPoint = ellipticalArcStartRef.current;
        if (minorPoint && startPoint) {
          preview = createEllipticalArcPreview(
            center,
            majorPoint,
            minorPoint,
            startPoint,
            point,
            sketchTo3DRef.current,
            camera,
            renderer,
          );
        }
      }

      if (scene && preview) {
        scene.add(preview);
        previewObjectRef.current = preview;
        requestRender();
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      getOrCreatePoint,
      addPrimitive,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      camera,
      renderer,
      requestRender,
    ],
  );

  const resetSplineDraft = useCallback(() => {
    splinePointsRef.current = [];
    splineLastClickTimeRef.current = 0;
    splineLastPointRef.current = null;
  }, []);

  const handleSplineDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        const now = performance.now();
        const lastPoint = splineLastPointRef.current;
        const isDoubleClick =
          !!lastPoint &&
          now - splineLastClickTimeRef.current <= DOUBLE_CLICK_THRESHOLD &&
          point.distanceTo(lastPoint) < 1e-4;

        if (isDoubleClick) {
          // Drop the duplicate generated by the second click of a double-click.
          const draft = splinePointsRef.current.filter(
            (p, i, all) => i === 0 || p.distanceTo(all[i - 1]!) > 1e-6,
          );
          cleanupDrawingPreview();
          if (draft.length >= 3) {
            pushSketchUndo();
            const pointIds = draft.map(
              (p) => getOrCreatePoint(p, false, false).id,
            );
            const primitive: SketchSpline = {
              id: generateId("spl"),
              type: "spline",
              pointIds,
            };
            addPrimitive(primitive);
            await solveSketch();
          }
          resetSplineDraft();
          return;
        }

        splinePointsRef.current.push(point.clone());
        splineLastClickTimeRef.current = now;
        splineLastPointRef.current = point.clone();
        return;
      }

      if (event.type !== "mousemove" || splinePointsRef.current.length === 0) {
        return;
      }

      cleanupDrawingPreview();
      const preview = createSplinePreview(
        [...splinePointsRef.current, point],
        sketchTo3DRef.current,
      );
      if (scene && preview) {
        scene.add(preview);
        previewObjectRef.current = preview;
        requestRender();
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      getOrCreatePoint,
      addPrimitive,
      solveSketch,
      generateId,
      pushSketchUndo,
      resetSplineDraft,
      sketchTo3DRef,
      requestRender,
      DOUBLE_CLICK_THRESHOLD,
    ],
  );

  const handleBezierDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        if (bezierPointsRef.current.length >= 4) {
          bezierPointsRef.current = [];
        }
        bezierPointsRef.current.push(point.clone());
        if (bezierPointsRef.current.length === 4) {
          cleanupDrawingPreview();
          pushSketchUndo();
          const pointIds = bezierPointsRef.current.map(
            (p) => getOrCreatePoint(p, false, false).id,
          );
          const primitive: SketchBezier = {
            id: generateId("bez"),
            type: "bezier",
            pointIds,
          };
          addPrimitive(primitive);
          bezierPointsRef.current = [];
          await solveSketch();
        }
        return;
      }

      if (event.type !== "mousemove" || bezierPointsRef.current.length === 0) {
        return;
      }
      cleanupDrawingPreview();
      const preview = createBezierPreview(
        [...bezierPointsRef.current, point],
        sketchTo3DRef.current,
      );
      if (scene && preview) {
        scene.add(preview);
        previewObjectRef.current = preview;
        requestRender();
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      getOrCreatePoint,
      addPrimitive,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      requestRender,
    ],
  );

  const handleConicDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        if (conicPointsRef.current.length >= 3) conicPointsRef.current = [];
        conicPointsRef.current.push(point.clone());
        if (conicPointsRef.current.length === 3) {
          cleanupDrawingPreview();
          const [start, end, control] = conicPointsRef.current;
          if (start && end && control) {
            pushSketchUndo();
            const startId = getOrCreatePoint(start, false, false).id;
            const endId = getOrCreatePoint(end, false, false).id;
            const controlId = getOrCreatePoint(control, false, false).id;
            const primitive: SketchConic = {
              id: generateId("conic"),
              type: "conic",
              startId,
              controlId,
              endId,
              rho: conicRho,
            };
            addPrimitive(primitive);
            await solveSketch();
          }
          conicPointsRef.current = [];
        }
        return;
      }

      if (event.type !== "mousemove" || conicPointsRef.current.length === 0) {
        return;
      }
      cleanupDrawingPreview();
      const [start, end] = conicPointsRef.current;
      const preview = start
        ? end
          ? createConicPreview(
              start,
              end,
              point,
              conicRho,
              sketchTo3DRef.current,
            )
          : createLinePreview(start, point, sketchTo3DRef.current)
        : null;
      if (scene && preview) {
        scene.add(preview);
        previewObjectRef.current = preview;
        requestRender();
      }
    },
    [
      scene,
      cleanupDrawingPreview,
      getOrCreatePoint,
      addPrimitive,
      solveSketch,
      generateId,
      pushSketchUndo,
      sketchTo3DRef,
      requestRender,
      conicRho,
    ],
  );
  const handleSplitDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type !== "mousedown" || !activeSketch) return;

      type SplitTarget =
        | { kind: "line"; primitive: SketchLine }
        | { kind: "arc"; primitive: SketchArc }
        | { kind: "circle"; primitive: SketchCircle }
        | { kind: "bezier"; primitive: SketchBezier }
        | { kind: "conic"; primitive: SketchConic }
        | { kind: "spline"; primitive: SketchSpline }
        | { kind: "ellipticalArc"; primitive: SketchEllipticalArc };
      let target: SplitTarget | null = null;
      let closest: number = SNAP_DISTANCE;
      for (const primitive of activeSketch.primitives) {
        if (isSketchLine(primitive)) {
          if (primitive.origin) continue;
          const p1 = activeSketch.primitives.find(
            (p) => p.id === primitive.p1Id,
          );
          const p2 = activeSketch.primitives.find(
            (p) => p.id === primitive.p2Id,
          );
          if (!p1 || !p2 || !isSketchPoint(p1) || !isSketchPoint(p2)) continue;
          const distance = pointToLineDistance(point, p1, p2);
          if (distance <= closest) {
            closest = distance;
            target = { kind: "line", primitive };
          }
          continue;
        }

        if (isSketchArc(primitive)) {
          const center = activeSketch.primitives.find(
            (p) => p.id === primitive.centerId,
          );
          const start = activeSketch.primitives.find(
            (p) => p.id === primitive.startId,
          );
          const end = activeSketch.primitives.find(
            (p) => p.id === primitive.endId,
          );
          if (
            !center ||
            !start ||
            !end ||
            !isSketchPoint(center) ||
            !isSketchPoint(start) ||
            !isSketchPoint(end)
          ) {
            continue;
          }
          const radial = Math.hypot(point.x - center.x, point.y - center.y);
          const distance = Math.abs(radial - primitive.radius);
          if (distance > closest) continue;
          const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
          const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
          const tau = Math.PI * 2;
          const sweep = (((endAngle - startAngle) % tau) + tau) % tau;
          const clickAngle = Math.atan2(point.y - center.y, point.x - center.x);
          const local = (((clickAngle - startAngle) % tau) + tau) % tau;
          if (sweep < 1e-6 || local <= 1e-3 || local >= sweep - 1e-3) {
            continue;
          }
          closest = distance;
          target = { kind: "arc", primitive };
          continue;
        }

        if (isSketchCircle(primitive)) {
          const center = activeSketch.primitives.find(
            (p) => p.id === primitive.centerId,
          );
          if (!center || !isSketchPoint(center)) continue;
          const radial = Math.hypot(point.x - center.x, point.y - center.y);
          const distance = Math.abs(radial - primitive.radius);
          if (distance <= closest) {
            closest = distance;
            target = { kind: "circle", primitive };
          }
          continue;
        }

        if (isSketchBezier(primitive)) {
          const nearest = nearestOnBezier(activeSketch, primitive, point);
          if (nearest && nearest.distance <= closest) {
            closest = nearest.distance;
            target = { kind: "bezier", primitive };
          }
          continue;
        }

        if (isSketchConic(primitive)) {
          const nearest = nearestOnConic(activeSketch, primitive, point);
          if (nearest && nearest.distance <= closest) {
            closest = nearest.distance;
            target = { kind: "conic", primitive };
          }
          continue;
        }

        if (isSketchSpline(primitive)) {
          const nearest = nearestOnSpline(activeSketch, primitive, point);
          if (nearest && nearest.distance <= closest) {
            closest = nearest.distance;
            target = { kind: "spline", primitive };
          }
          continue;
        }

        if (isSketchEllipticalArc(primitive)) {
          const nearest = nearestOnEllipticalArc(
            activeSketch,
            primitive,
            point,
          );
          if (nearest && nearest.distance <= closest) {
            closest = nearest.distance;
            target = { kind: "ellipticalArc", primitive };
          }
        }
      }
      if (!target) return;

      if (target.kind === "line") {
        const result = splitLineAtPoint(
          activeSketch,
          target.primitive.id,
          { x: point.x, y: point.y },
          generateId,
        );
        if (!result.ok) return;
        pushSketchUndo();
        addPrimitive(result.point);
        updatePrimitive(result.lineId, { p2Id: result.point.id });
        addPrimitive(result.newLine);
      } else if (target.kind === "arc") {
        const result = splitArcAtPoint(
          activeSketch,
          target.primitive.id,
          { x: point.x, y: point.y },
          generateId,
        );
        if (!result.ok) return;
        pushSketchUndo();
        addPrimitive(result.point);
        updatePrimitive(result.arcId, { endId: result.point.id });
        addPrimitive(result.newArc);
      } else if (target.kind === "bezier") {
        const result = splitBezierAtPoint(
          activeSketch,
          target.primitive.id,
          { x: point.x, y: point.y },
          generateId,
        );
        if (!result.ok) return;
        pushSketchUndo();
        for (const splitPoint of result.points) addPrimitive(splitPoint);
        updatePrimitive(result.bezierId, {
          pointIds: result.leftPointIds,
        });
        addPrimitive(result.newBezier);
      } else if (target.kind === "conic") {
        const result = splitConicAtPoint(
          activeSketch,
          target.primitive.id,
          { x: point.x, y: point.y },
          generateId,
        );
        if (!result.ok) return;
        pushSketchUndo();
        for (const splitPoint of result.points) addPrimitive(splitPoint);
        updatePrimitive(result.conicId, {
          controlId: result.leftControlId,
          endId: result.point.id,
          rho: result.leftRho,
          startWeight: result.leftStartWeight,
          endWeight: result.leftEndWeight,
        });
        addPrimitive(result.newConic);
      } else if (target.kind === "spline") {
        const result = splitSplineAtPoint(
          activeSketch,
          target.primitive.id,
          { x: point.x, y: point.y },
          generateId,
        );
        if (!result.ok) return;
        pushSketchUndo();
        addPrimitive(result.point);
        updatePrimitive(result.splineId, {
          endT: result.endT,
          endId: result.endId,
        });
        addPrimitive(result.newSpline);
      } else if (target.kind === "ellipticalArc") {
        const result = splitEllipticalArcAtPoint(
          activeSketch,
          target.primitive.id,
          { x: point.x, y: point.y },
          generateId,
        );
        if (!result.ok) return;
        pushSketchUndo();
        updatePrimitive(result.ellipticalArcId, {
          endAngle: result.splitAngle,
        });
        addPrimitive(result.newArc);
      } else {
        const result = splitCircleAtPoint(
          activeSketch,
          target.primitive.id,
          { x: point.x, y: point.y },
          generateId,
        );
        if (!result.ok) return;
        pushSketchUndo();
        for (const splitPoint of result.points) addPrimitive(splitPoint);
        for (const arc of result.arcs) addPrimitive(arc);
        removePrimitive(result.circleId);
      }
      await solveSketch();
    },
    [
      activeSketch,
      addPrimitive,
      updatePrimitive,
      removePrimitive,
      solveSketch,
      generateId,
      pushSketchUndo,
      SNAP_DISTANCE,
    ],
  );

  const handlePointDraw = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (event.type === "mousedown") {
        pushSketchUndo();
        const newPoint: SketchPoint = {
          id: generateId("pt"),
          type: "point",
          x: point.x,
          y: point.y,
          fixed: false,
        };
        addPrimitive(newPoint);
        await solveSketch();
      }
    },
    [addPrimitive, solveSketch, generateId, pushSketchUndo],
  );

  const cancelCurrentOperation = useCallback(() => {
    cleanupDrawingPreview();
    setPendingLineDimension(null);

    if (isChaining) {
      setIsChaining(false);
      chainStartPointRef.current = null;
      chainStartPointIdRef.current = null;
      chainStartIsExistingRef.current = false;
      activePolylineIdRef.current = null;
      lastClickTimeRef.current = 0;
    }

    isDrawingRef.current = false;
    centerPointRef.current = null;
    rectStartRef.current = null;
    isCenterRectDrawingRef.current = false;
    centerRectRef.current = null;
    midpointLineSourceRef.current = null;
    slotStepRef.current = 0;
    slotStartRef.current = null;
    slotEndRef.current = null;
    polygonStepRef.current = 0;
    polygonCenterRef.current = null;
    ellipseStepRef.current = 0;
    ellipseCenterRef.current = null;
    ellipseMajorRef.current = null;
    ellipticalArcStepRef.current = 0;
    ellipticalArcCenterRef.current = null;
    ellipticalArcMajorRef.current = null;
    ellipticalArcMinorRef.current = null;
    ellipticalArcStartRef.current = null;

    arcStepRef.current = 0;
    arcStartPointRef.current = null;
    arcEndPointRef.current = null;

    circle3pStepRef.current = 0;
    circle3pPointsRef.current = [];
    bezierPointsRef.current = [];
    conicPointsRef.current = [];
    resetSplineDraft();
  }, [cleanupDrawingPreview, isChaining, resetSplineDraft]);

  const clearPendingLineDimension = useCallback(() => {
    setPendingLineDimension(null);
  }, []);

  const applyLineLengthConstraint = useCallback(
    async (lineId: string, length: number) => {
      pushSketchUndo();
      const constraint: SketchConstraint = {
        id: generateId("const"),
        type: "distance",
        primitiveIds: [lineId],
        value: length,
        driving: true,
      };
      const result = await addConstraintAndSolve(constraint);
      showConstraintFeedback(result.status, result.constraintIds);
      clearPendingLineDimension();
    },
    [
      generateId,
      addConstraintAndSolve,
      clearPendingLineDimension,
      pushSketchUndo,
      showConstraintFeedback,
    ],
  );

  const isDrawingActive = useCallback(() => {
    return (
      isChaining ||
      isDrawingRef.current ||
      isCenterRectDrawingRef.current ||
      midpointLineSourceRef.current !== null ||
      slotStepRef.current > 0 ||
      polygonStepRef.current > 0 ||
      ellipseStepRef.current > 0 ||
      ellipticalArcStepRef.current > 0 ||
      arcStepRef.current > 0 ||
      circle3pStepRef.current > 0 ||
      splinePointsRef.current.length > 0 ||
      bezierPointsRef.current.length > 0 ||
      conicPointsRef.current.length > 0
    );
  }, [isChaining]);

  const getChainStartPoint = useCallback(() => chainStartPointRef.current, []);

  return {
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
    isDrawingActive,
    getChainStartPoint,
  };
}
