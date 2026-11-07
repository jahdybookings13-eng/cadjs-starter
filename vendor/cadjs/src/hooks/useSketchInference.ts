import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  Sketch,
  SketchPrimitive,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
} from "../types/sketch-types";
import { INFERENCE } from "../theme";
import { SKETCH_ZERO_LENGTH_TOL } from "../sketch-tolerances";
import { LINEAR_TOL } from "../tolerances";

// Inference point types matching Fusion 360
export type InferenceType =
  | "endpoint"
  | "midpoint"
  | "center"
  | "quadrant"
  | "intersection"
  | "perpendicular"
  | "tangent"
  | "horizontal"
  | "vertical";

export interface InferencePoint {
  position: THREE.Vector3;
  type: InferenceType;
  sourceId: string; // primitive ID that generated this inference
  priority: number; // lower = higher priority
}

export interface Guideline {
  type: "horizontal" | "vertical" | "perpendicular" | "tangent";
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: number;
}

export interface UseSketchInferenceResult {
  findInferencePoints: (sketch: Sketch) => InferencePoint[];
  findNearestSnap: (
    cursorPosition: THREE.Vector3,
    inferencePoints: InferencePoint[],
    snapDistance: number,
  ) => InferencePoint | null;
  findGuidelines: (
    cursorPosition: THREE.Vector3,
    sketch: Sketch,
    chainStartPoint: THREE.Vector3 | null,
    tolerance: number,
  ) => Guideline[];
  isHorizontalAligned: (
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    tolerance: number,
  ) => boolean;
  isVerticalAligned: (
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    tolerance: number,
  ) => boolean;
}

// Priority values (lower = higher priority)
const INFERENCE_PRIORITY = {
  endpoint: 1,
  midpoint: 2,
  center: 3,
  quadrant: 4,
  intersection: 5,
  perpendicular: 6,
  tangent: 7,
  horizontal: 8,
  vertical: 8,
};

export function useSketchInference(): UseSketchInferenceResult {
  // Get point position from sketch
  const getPointPosition = useCallback(
    (sketch: Sketch, pointId: string): THREE.Vector3 | null => {
      const point = sketch.primitives.find(
        (p) => p.id === pointId && isSketchPoint(p),
      );
      if (point && isSketchPoint(point)) {
        return new THREE.Vector3(point.x, point.y, 0);
      }
      return null;
    },
    [],
  );

  // Single-slot cache: mousemoves on a stable sketch all share one reference
  // (CoreContext mutators always create a new Sketch object via spread), so
  // reference equality is a sound cache key without adding a revision counter.
  const inferenceCacheRef = useRef<{
    sketch: Sketch | null;
    points: InferencePoint[];
  }>({
    sketch: null,
    points: [],
  });

  // Find all inference points in a sketch
  const findInferencePoints = useCallback(
    (sketch: Sketch): InferencePoint[] => {
      if (inferenceCacheRef.current.sketch === sketch) {
        return inferenceCacheRef.current.points;
      }

      const points: InferencePoint[] = [];

      for (const primitive of sketch.primitives) {
        if (isSketchPoint(primitive)) {
          // Endpoint inference for standalone points
          points.push({
            position: new THREE.Vector3(primitive.x, primitive.y, 0),
            type: "endpoint",
            sourceId: primitive.id,
            priority: INFERENCE_PRIORITY.endpoint,
          });
        } else if (isSketchLine(primitive)) {
          const p1 = getPointPosition(sketch, primitive.p1Id);
          const p2 = getPointPosition(sketch, primitive.p2Id);

          if (p1 && p2) {
            // Endpoints
            points.push({
              position: p1.clone(),
              type: "endpoint",
              sourceId: primitive.id,
              priority: INFERENCE_PRIORITY.endpoint,
            });
            points.push({
              position: p2.clone(),
              type: "endpoint",
              sourceId: primitive.id,
              priority: INFERENCE_PRIORITY.endpoint,
            });

            // Midpoint
            const midpoint = new THREE.Vector3()
              .addVectors(p1, p2)
              .multiplyScalar(0.5);
            points.push({
              position: midpoint,
              type: "midpoint",
              sourceId: primitive.id,
              priority: INFERENCE_PRIORITY.midpoint,
            });
          }
        } else if (isSketchCircle(primitive)) {
          const center = getPointPosition(sketch, primitive.centerId);

          if (center) {
            // Center point
            points.push({
              position: center.clone(),
              type: "center",
              sourceId: primitive.id,
              priority: INFERENCE_PRIORITY.center,
            });

            // Quadrant points (0°, 90°, 180°, 270°)
            const radius = primitive.radius;
            const quadrantAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
            for (const angle of quadrantAngles) {
              points.push({
                position: new THREE.Vector3(
                  center.x + Math.cos(angle) * radius,
                  center.y + Math.sin(angle) * radius,
                  0,
                ),
                type: "quadrant",
                sourceId: primitive.id,
                priority: INFERENCE_PRIORITY.quadrant,
              });
            }
          }
        } else if (isSketchArc(primitive)) {
          const center = getPointPosition(sketch, primitive.centerId);
          const start = getPointPosition(sketch, primitive.startId);
          const end = getPointPosition(sketch, primitive.endId);

          if (center) {
            // Center point
            points.push({
              position: center.clone(),
              type: "center",
              sourceId: primitive.id,
              priority: INFERENCE_PRIORITY.center,
            });
          }

          if (start) {
            // Start point
            points.push({
              position: start.clone(),
              type: "endpoint",
              sourceId: primitive.id,
              priority: INFERENCE_PRIORITY.endpoint,
            });
          }

          if (end) {
            // End point
            points.push({
              position: end.clone(),
              type: "endpoint",
              sourceId: primitive.id,
              priority: INFERENCE_PRIORITY.endpoint,
            });
          }

          // Midpoint of arc
          if (center && start && end) {
            const startAngle = Math.atan2(
              start.y - center.y,
              start.x - center.x,
            );
            const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
            let midAngle = (startAngle + endAngle) / 2;

            // Handle wrap-around
            let angleDiff = endAngle - startAngle;
            if (angleDiff < 0) angleDiff += Math.PI * 2;
            if (angleDiff > Math.PI) {
              midAngle += Math.PI;
            }

            const radius = primitive.radius;
            points.push({
              position: new THREE.Vector3(
                center.x + Math.cos(midAngle) * radius,
                center.y + Math.sin(midAngle) * radius,
                0,
              ),
              type: "midpoint",
              sourceId: primitive.id,
              priority: INFERENCE_PRIORITY.midpoint,
            });
          }
        }
      }

      // Find line-line intersections
      const lines = sketch.primitives.filter(isSketchLine);
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
          const line1 = lines[i]!;
          const line2 = lines[j]!;

          const p1 = getPointPosition(sketch, line1.p1Id);
          const p2 = getPointPosition(sketch, line1.p2Id);
          const p3 = getPointPosition(sketch, line2.p1Id);
          const p4 = getPointPosition(sketch, line2.p2Id);

          if (p1 && p2 && p3 && p4) {
            const intersection = lineLineIntersection(p1, p2, p3, p4);
            if (intersection) {
              // Check if intersection is within both line segments (extended a bit)
              const t1 = getParameterOnLine(p1, p2, intersection);
              const t2 = getParameterOnLine(p3, p4, intersection);
              if (t1 >= -0.1 && t1 <= 1.1 && t2 >= -0.1 && t2 <= 1.1) {
                points.push({
                  position: intersection,
                  type: "intersection",
                  sourceId: `${line1.id}:${line2.id}`,
                  priority: INFERENCE_PRIORITY.intersection,
                });
              }
            }
          }
        }
      }

      inferenceCacheRef.current = { sketch, points };
      return points;
    },
    [getPointPosition],
  );

  // Find nearest snap point
  const findNearestSnap = useCallback(
    (
      cursorPosition: THREE.Vector3,
      inferencePoints: InferencePoint[],
      snapDistance: number,
    ): InferencePoint | null => {
      let nearest: InferencePoint | null = null;
      let minDist = snapDistance;

      for (const point of inferencePoints) {
        const dist = cursorPosition.distanceTo(point.position);
        if (dist < minDist) {
          // If same distance, prefer higher priority (lower number)
          if (
            !nearest ||
            dist < minDist - SKETCH_ZERO_LENGTH_TOL ||
            point.priority < nearest.priority
          ) {
            nearest = point;
            minDist = dist;
          }
        }
      }

      return nearest;
    },
    [],
  );

  // Check horizontal alignment
  const isHorizontalAligned = useCallback(
    (p1: THREE.Vector3, p2: THREE.Vector3, tolerance: number): boolean => {
      return Math.abs(p1.y - p2.y) < tolerance;
    },
    [],
  );

  // Check vertical alignment
  const isVerticalAligned = useCallback(
    (p1: THREE.Vector3, p2: THREE.Vector3, tolerance: number): boolean => {
      return Math.abs(p1.x - p2.x) < tolerance;
    },
    [],
  );

  // Find guidelines for the current cursor position
  const findGuidelines = useCallback(
    (
      cursorPosition: THREE.Vector3,
      sketch: Sketch,
      chainStartPoint: THREE.Vector3 | null,
      tolerance: number,
    ): Guideline[] => {
      const guidelines: Guideline[] = [];

      // If chaining, check for horizontal/vertical alignment with chain start
      if (chainStartPoint) {
        if (isHorizontalAligned(chainStartPoint, cursorPosition, tolerance)) {
          // Horizontal guideline
          guidelines.push({
            type: "horizontal",
            start: new THREE.Vector3(
              chainStartPoint.x - 10,
              chainStartPoint.y,
              0,
            ),
            end: new THREE.Vector3(cursorPosition.x + 10, chainStartPoint.y, 0),
            color: INFERENCE.guidelineChain,
          });
        }

        if (isVerticalAligned(chainStartPoint, cursorPosition, tolerance)) {
          // Vertical guideline
          guidelines.push({
            type: "vertical",
            start: new THREE.Vector3(
              chainStartPoint.x,
              chainStartPoint.y - 10,
              0,
            ),
            end: new THREE.Vector3(chainStartPoint.x, cursorPosition.y + 10, 0),
            color: INFERENCE.guidelineChain,
          });
        }
      }

      // Check alignment with existing points
      for (const primitive of sketch.primitives) {
        if (isSketchPoint(primitive)) {
          const pointPos = new THREE.Vector3(primitive.x, primitive.y, 0);

          if (isHorizontalAligned(pointPos, cursorPosition, tolerance)) {
            guidelines.push({
              type: "horizontal",
              start: new THREE.Vector3(pointPos.x - 5, pointPos.y, 0),
              end: new THREE.Vector3(cursorPosition.x + 5, pointPos.y, 0),
              color: INFERENCE.guidelinePoint,
            });
          }

          if (isVerticalAligned(pointPos, cursorPosition, tolerance)) {
            guidelines.push({
              type: "vertical",
              start: new THREE.Vector3(pointPos.x, pointPos.y - 5, 0),
              end: new THREE.Vector3(pointPos.x, cursorPosition.y + 5, 0),
              color: INFERENCE.guidelinePoint,
            });
          }
        }
      }

      return guidelines;
    },
    [isHorizontalAligned, isVerticalAligned],
  );

  return {
    findInferencePoints,
    findNearestSnap,
    findGuidelines,
    isHorizontalAligned,
    isVerticalAligned,
  };
}

// Helper: Line-line intersection
function lineLineIntersection(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  p4: THREE.Vector3,
): THREE.Vector3 | null {
  const x1 = p1.x,
    y1 = p1.y;
  const x2 = p2.x,
    y2 = p2.y;
  const x3 = p3.x,
    y3 = p3.y;
  const x4 = p4.x,
    y4 = p4.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) {
    return null; // Lines are parallel
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

  return new THREE.Vector3(x1 + t * (x2 - x1), y1 + t * (y2 - y1), 0);
}

// Helper: Get parameter t where point lies on line p1->p2
function getParameterOnLine(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  point: THREE.Vector3,
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if (Math.abs(dx) > LINEAR_TOL && Math.abs(dx) >= Math.abs(dy)) {
    return (point.x - p1.x) / dx;
  } else if (Math.abs(dy) > LINEAR_TOL) {
    return (point.y - p1.y) / dy;
  }
  return 0;
}
