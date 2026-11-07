import { useCallback, useRef } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  SketchPoint,
  SketchLine,
  SketchArc,
  SketchConstraint,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  findSketchPoint,
  findSketchLine,
} from "../../../types/sketch-types";
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
} from "../../../scene-operations/sketch-intersection-utils";
import { SKETCH as SKETCH_THEME } from "../../../theme";
import {
  pointToLineDistance,
  getAdaptiveSegments,
  screenPxToSketchUnits,
  createLine2FromPoints,
  worldToSketch2D,
  SketchTo3D,
} from "../sketch-helpers";
import {
  SKETCH_PARAM_ENDPOINT_TOL,
  SKETCH_PARAM_MATCH_TOL,
  SKETCH_ANGLE_DEDUP_RAD,
  SKETCH_ANGLE_WRAP_RAD,
  SKETCH_ARC_ENDPOINT_BUFFER_RAD,
  POINT_COINCIDENCE_TOL_MM,
} from "../../../sketch-tolerances";
import { SKETCH_PREVIEW_Z_LIFT_MM } from "../../../visual-constants";

interface UseSketchTrimExtendParams {
  generateId: (prefix: string) => string;
  sketchTo3DRef: React.MutableRefObject<SketchTo3D>;
}

export function useSketchTrimExtend({
  generateId,
  sketchTo3DRef,
}: UseSketchTrimExtendParams) {
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

  // Trim and extend share this hover overlay; trimHoveredPrimRef and extendHoveredRef
  // alternate based on which mode is active.
  const trimHighlightRef = useRef<THREE.Object3D | null>(null);
  const trimHoveredPrimRef = useRef<{
    primId: string;
    startParam: number;
    endParam: number;
  } | null>(null);

  const extendHoveredRef = useRef<{
    primId: string;
    pointId: string;
    isStart: boolean;
    targetPoint: { x: number; y: number };
  } | null>(null);

  const cleanupTrimHighlight = useCallback(() => {
    if (trimHighlightRef.current && scene) {
      scene.remove(trimHighlightRef.current);
      if (trimHighlightRef.current instanceof THREE.Group) {
        trimHighlightRef.current.traverse((child) => {
          if (
            child instanceof Line2 ||
            child instanceof THREE.Line ||
            child instanceof THREE.Mesh
          ) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
      } else if (
        trimHighlightRef.current instanceof Line2 ||
        trimHighlightRef.current instanceof THREE.Line
      ) {
        trimHighlightRef.current.geometry.dispose();
        (trimHighlightRef.current.material as THREE.Material).dispose();
      }
      trimHighlightRef.current = null;
      requestRender();
    }
    trimHoveredPrimRef.current = null;
    extendHoveredRef.current = null;
  }, [scene, requestRender]);

  const applyTrimConstraints = useCallback(
    async (
      newPoints: { id: string; x: number; y: number }[],
      intersections: IntersectionResult[],
    ) => {
      if (!activeSketch || newPoints.length === 0) return;

      for (const pt of newPoints) {
        let bestIx: IntersectionResult | null = null;
        let bestDist = POINT_COINCIDENCE_TOL_MM;
        for (const ix of intersections) {
          const d = Math.hypot(pt.x - ix.point.x, pt.y - ix.point.y);
          if (d < bestDist) {
            bestDist = d;
            bestIx = ix;
          }
        }
        if (!bestIx) continue;

        const otherPrim = activeSketch.primitives.find(
          (p) => p.id === bestIx!.otherPrimId,
        );
        if (!otherPrim) continue;

        let constraintType: "pointOnLine" | "pointOnCircle" | null = null;
        if (isSketchLine(otherPrim)) {
          constraintType = "pointOnLine";
        } else if (isSketchCircle(otherPrim) || isSketchArc(otherPrim)) {
          constraintType = "pointOnCircle";
        }
        if (!constraintType) continue;

        const constraint: SketchConstraint = {
          id: generateId("const"),
          type: constraintType,
          primitiveIds: [pt.id, bestIx.otherPrimId],
          driving: true,
        };
        // Redundant/conflicting are intentionally swallowed, the trim already cut the primitive.
        await addConstraintAndSolve(constraint);
      }
    },
    [activeSketch, generateId, addConstraintAndSolve],
  );

  const handleTrimMode = useCallback(
    async (event: MouseEvent, point: THREE.Vector3) => {
      if (!activeSketch) return;

      const pt2d = worldToSketch2D(point, activeSketch.plane);
      if (!pt2d) return;
      const cursorPoint = { x: pt2d.x, y: pt2d.y };

      if (event.type === "mousemove") {
        cleanupTrimHighlight();

        // Find closest primitive to cursor
        let bestPrimId: string | null = null;
        let bestDist =
          camera && renderer
            ? screenPxToSketchUnits(camera, renderer, 15)
            : 0.5;

        for (const prim of activeSketch.primitives) {
          if (isSketchPoint(prim)) continue;
          if ((prim as { origin?: boolean }).origin) continue;

          let dist = Infinity;
          if (isSketchLine(prim)) {
            const p1 = findSketchPoint(activeSketch.primitives, prim.p1Id);
            const p2 = findSketchPoint(activeSketch.primitives, prim.p2Id);
            if (p1 && p2) {
              dist = pointToLineDistance(
                cursorPoint,
                { x: p1.x, y: p1.y },
                { x: p2.x, y: p2.y },
              );
            }
          } else if (isSketchCircle(prim)) {
            const center = findSketchPoint(
              activeSketch.primitives,
              prim.centerId,
            );
            if (center) {
              dist = Math.abs(
                Math.hypot(cursorPoint.x - center.x, cursorPoint.y - center.y) -
                  prim.radius,
              );
            }
          } else if (isSketchArc(prim)) {
            const center = findSketchPoint(
              activeSketch.primitives,
              prim.centerId,
            );
            if (center) {
              const radialDist = Math.abs(
                Math.hypot(cursorPoint.x - center.x, cursorPoint.y - center.y) -
                  prim.radius,
              );
              const arcAngles = getArcAngles(activeSketch, prim);
              if (arcAngles) {
                const cursorAngle = Math.atan2(
                  cursorPoint.y - center.y,
                  cursorPoint.x - center.x,
                );
                if (
                  isAngleInArcRange(
                    cursorAngle,
                    arcAngles.startAngle,
                    arcAngles.endAngle,
                  )
                ) {
                  dist = radialDist;
                }
              }
            }
          }

          if (dist < bestDist) {
            bestDist = dist;
            bestPrimId = prim.id;
          }
        }

        if (bestPrimId) {
          const intersections = findAllIntersections(activeSketch, bestPrimId);
          const segment = identifyTrimSegment(
            activeSketch,
            bestPrimId,
            intersections,
            cursorPoint,
          );

          if (segment && intersections.length > 0) {
            trimHoveredPrimRef.current = {
              primId: bestPrimId,
              startParam: segment.startParam,
              endParam: segment.endParam,
            };

            const prim = activeSketch.primitives.find(
              (p) => p.id === bestPrimId,
            );
            if (prim && sketchTo3DRef.current) {
              let positions: number[] | null = null;

              if (isSketchLine(prim)) {
                const p1 = findSketchPoint(activeSketch.primitives, prim.p1Id);
                const p2 = findSketchPoint(activeSketch.primitives, prim.p2Id);
                if (p1 && p2) {
                  const s = segment.startParam;
                  const e = segment.endParam;
                  const sx = p1.x + s * (p2.x - p1.x);
                  const sy = p1.y + s * (p2.y - p1.y);
                  const ex = p1.x + e * (p2.x - p1.x);
                  const ey = p1.y + e * (p2.y - p1.y);
                  const start3d = sketchTo3DRef.current(
                    sx,
                    sy,
                    SKETCH_PREVIEW_Z_LIFT_MM,
                  );
                  const end3d = sketchTo3DRef.current(
                    ex,
                    ey,
                    SKETCH_PREVIEW_Z_LIFT_MM,
                  );
                  positions = [
                    start3d.x,
                    start3d.y,
                    start3d.z,
                    end3d.x,
                    end3d.y,
                    end3d.z,
                  ];
                }
              } else if (isSketchCircle(prim) || isSketchArc(prim)) {
                const center = findSketchPoint(
                  activeSketch.primitives,
                  prim.centerId,
                );
                if (center) {
                  const radius = prim.radius;
                  const sAngle = segment.startParam;
                  const eAngle = segment.endParam;
                  let angleDiff = eAngle - sAngle;
                  if (angleDiff <= 0) angleDiff += Math.PI * 2;
                  const segCount = getAdaptiveSegments(
                    camera,
                    renderer,
                    radius,
                    angleDiff,
                  );
                  positions = [];
                  for (let i = 0; i <= segCount; i++) {
                    const t = i / segCount;
                    const angle = sAngle + angleDiff * t;
                    const lx = center.x + Math.cos(angle) * radius;
                    const ly = center.y + Math.sin(angle) * radius;
                    const pt3d = sketchTo3DRef.current!(
                      lx,
                      ly,
                      SKETCH_PREVIEW_Z_LIFT_MM,
                    );
                    positions.push(pt3d.x, pt3d.y, pt3d.z);
                  }
                }
              }

              if (positions && positions.length >= 6) {
                const line = createLine2FromPoints(
                  positions,
                  SKETCH_THEME.trimHighlight,
                  3.0,
                );
                line.renderOrder = 1000;
                if (scene) {
                  scene.add(line);
                  requestRender();
                }
                trimHighlightRef.current = line;
              }
            }
          }
        }
      } else if (event.type === "mousedown") {
        if (!trimHoveredPrimRef.current) return;

        const { primId, startParam, endParam } = trimHoveredPrimRef.current;
        cleanupTrimHighlight();

        pushSketchUndo();

        const prim = activeSketch.primitives.find((p) => p.id === primId);
        if (!prim) return;

        // Reuse a coincident SketchPoint when possible, profile detection
        // (isSketchClosed / sortEdgesForWire) needs trimmed primitives to share IDs at junctions.
        const findExistingPoint = (
          x: number,
          y: number,
          tolerance = POINT_COINCIDENCE_TOL_MM,
        ): SketchPoint | null => {
          for (const p of activeSketch.primitives) {
            if (isSketchPoint(p) && Math.hypot(p.x - x, p.y - y) < tolerance) {
              return p;
            }
          }
          return null;
        };

        const intersections = findAllIntersections(activeSketch, primId);

        if (isSketchLine(prim)) {
          const p1 = findSketchPoint(activeSketch.primitives, prim.p1Id);
          const p2 = findSketchPoint(activeSketch.primitives, prim.p2Id);
          if (!p1 || !p2) return;

          const isStartSegment = startParam < SKETCH_PARAM_ENDPOINT_TOL;
          const isEndSegment = endParam > 1 - SKETCH_PARAM_ENDPOINT_TOL;

          if (isStartSegment && isEndSegment) {
            removePrimitive(primId);
          } else if (isStartSegment) {
            const newX = p1.x + endParam * (p2.x - p1.x);
            const newY = p1.y + endParam * (p2.y - p1.y);
            removePrimitive(primId);
            const existing = findExistingPoint(newX, newY);
            const newPtId = existing ? existing.id : generateId("point");
            if (!existing) {
              addPrimitive({ id: newPtId, type: "point", x: newX, y: newY });
            }
            addPrimitive({
              id: generateId("line"),
              type: "line" as const,
              p1Id: newPtId,
              p2Id: prim.p2Id,
              construction: prim.construction,
            });
            const newPts = existing ? [] : [{ id: newPtId, x: newX, y: newY }];
            await applyTrimConstraints(newPts, intersections);
          } else if (isEndSegment) {
            const newX = p1.x + startParam * (p2.x - p1.x);
            const newY = p1.y + startParam * (p2.y - p1.y);
            removePrimitive(primId);
            const existing = findExistingPoint(newX, newY);
            const newPtId = existing ? existing.id : generateId("point");
            if (!existing) {
              addPrimitive({ id: newPtId, type: "point", x: newX, y: newY });
            }
            addPrimitive({
              id: generateId("line"),
              type: "line" as const,
              p1Id: prim.p1Id,
              p2Id: newPtId,
              construction: prim.construction,
            });
            const newPts = existing ? [] : [{ id: newPtId, x: newX, y: newY }];
            await applyTrimConstraints(newPts, intersections);
          } else {
            const splitPts: { id: string; x: number; y: number }[] = [];
            const newlyCreatedPts: { id: string; x: number; y: number }[] = [];
            const sortedParams = intersections
              .map((ix) => ix.tSource)
              .filter(
                (t) =>
                  t > SKETCH_PARAM_ENDPOINT_TOL &&
                  t < 1 - SKETCH_PARAM_ENDPOINT_TOL,
              )
              .sort((a, b) => a - b);

            for (const t of sortedParams) {
              const x = p1.x + t * (p2.x - p1.x);
              const y = p1.y + t * (p2.y - p1.y);
              const existing = findExistingPoint(x, y);
              const id = existing ? existing.id : generateId("point");
              splitPts.push({ id, x, y });
              if (!existing) {
                newlyCreatedPts.push({ id, x, y });
              }
            }

            removePrimitive(primId);

            for (const pt of newlyCreatedPts) {
              addPrimitive({ id: pt.id, type: "point", x: pt.x, y: pt.y });
            }

            const orderedPtIds = [
              prim.p1Id,
              ...splitPts.map((p) => p.id),
              prim.p2Id,
            ];
            const newLines: { id: string; p1Id: string; p2Id: string }[] = [];
            for (let i = 0; i < orderedPtIds.length - 1; i++) {
              newLines.push({
                id: generateId("line"),
                p1Id: orderedPtIds[i]!,
                p2Id: orderedPtIds[i + 1]!,
              });
            }

            const boundaries = [0, ...sortedParams, 1];
            let skipIdx = -1;
            for (let i = 0; i < boundaries.length - 1; i++) {
              if (
                Math.abs(boundaries[i]! - startParam) <
                  SKETCH_PARAM_MATCH_TOL &&
                Math.abs(boundaries[i + 1]! - endParam) < SKETCH_PARAM_MATCH_TOL
              ) {
                skipIdx = i;
                break;
              }
            }

            const usedPtIds = new Set<string>();
            for (let i = 0; i < newLines.length; i++) {
              if (i === skipIdx) continue;
              const line = newLines[i]!;
              usedPtIds.add(line.p1Id);
              usedPtIds.add(line.p2Id);
              addPrimitive({
                id: line.id,
                type: "line" as const,
                p1Id: line.p1Id,
                p2Id: line.p2Id,
                construction: prim.construction,
              });
            }

            await applyTrimConstraints(newlyCreatedPts, intersections);
          }
        } else if (isSketchCircle(prim)) {
          if (intersections.length >= 2) {
            const center = findSketchPoint(
              activeSketch.primitives,
              prim.centerId,
            );
            if (!center) return;

            // Same dedup as identifyCircleTrimSegment.
            const rawAngles = intersections
              .map((ix) => normalizeAngle(ix.tSource))
              .sort((a, b) => a - b);
            const angles: number[] = [];
            for (const a of rawAngles) {
              if (
                angles.length === 0 ||
                a - angles[angles.length - 1]! > SKETCH_ANGLE_DEDUP_RAD
              ) {
                angles.push(a);
              }
            }
            if (
              angles.length >= 2 &&
              angles[0]! + 2 * Math.PI - angles[angles.length - 1]! <
                SKETCH_ANGLE_DEDUP_RAD
            ) {
              angles.pop();
            }

            if (angles.length < 2) return;

            removePrimitive(primId);

            const isAngleClose = (a: number, b: number) => {
              const diff = Math.abs(a - b);
              return (
                diff < SKETCH_ANGLE_WRAP_RAD ||
                Math.abs(diff - 2 * Math.PI) < SKETCH_ANGLE_WRAP_RAD
              );
            };
            let skipIdx = -1;
            for (let i = 0; i < angles.length; i++) {
              const segStart = angles[i]!;
              const segEnd = angles[(i + 1) % angles.length]!;
              if (
                isAngleClose(normalizeAngle(startParam), segStart) &&
                isAngleClose(normalizeAngle(endParam), segEnd)
              ) {
                skipIdx = i;
                break;
              }
            }

            const anglePtIds: string[] = [];
            const newCirclePts: { id: string; x: number; y: number }[] = [];
            for (const angle of angles) {
              const x = center.x + prim.radius * Math.cos(angle);
              const y = center.y + prim.radius * Math.sin(angle);
              const existing = findExistingPoint(x, y);
              const ptId = existing ? existing.id : generateId("point");
              anglePtIds.push(ptId);
              if (!existing) {
                addPrimitive({
                  id: ptId,
                  type: "point" as const,
                  x,
                  y,
                });
                newCirclePts.push({ id: ptId, x, y });
              }
            }

            for (let i = 0; i < angles.length; i++) {
              if (i === skipIdx) continue;
              const arcStartPtId = anglePtIds[i]!;
              const arcEndPtId = anglePtIds[(i + 1) % angles.length]!;
              addPrimitive({
                id: generateId("arc"),
                type: "arc" as const,
                centerId: prim.centerId,
                startId: arcStartPtId,
                endId: arcEndPtId,
                radius: prim.radius,
                construction: prim.construction,
              });
            }

            await applyTrimConstraints(newCirclePts, intersections);

            // Split lines that hit the circle so they share IDs at the new arc endpoints.
            const lineIntersections = new Map<
              string,
              { tOther: number; ptId: string }[]
            >();
            for (const ix of intersections) {
              const otherPrim = activeSketch.primitives.find(
                (p) => p.id === ix.otherPrimId,
              );
              if (!otherPrim || !isSketchLine(otherPrim)) continue;

              const ixAngle = normalizeAngle(ix.tSource);
              let matchedPtId: string | null = null;
              for (let j = 0; j < angles.length; j++) {
                if (Math.abs(ixAngle - angles[j]!) < SKETCH_ANGLE_DEDUP_RAD) {
                  matchedPtId = anglePtIds[j] ?? null;
                  break;
                }
              }
              if (!matchedPtId) continue;

              if (
                ix.tOther < SKETCH_PARAM_ENDPOINT_TOL ||
                ix.tOther > 1 - SKETCH_PARAM_ENDPOINT_TOL
              )
                continue;

              if (!lineIntersections.has(ix.otherPrimId)) {
                lineIntersections.set(ix.otherPrimId, []);
              }
              lineIntersections
                .get(ix.otherPrimId)!
                .push({ tOther: ix.tOther, ptId: matchedPtId });
            }

            for (const [lineId, splits] of lineIntersections) {
              const linePrim = findSketchLine(activeSketch.primitives, lineId);
              if (!linePrim) continue;

              splits.sort((a, b) => a.tOther - b.tOther);
              removePrimitive(lineId);

              const orderedPtIds = [
                linePrim.p1Id,
                ...splits.map((s) => s.ptId),
                linePrim.p2Id,
              ];
              for (let i = 0; i < orderedPtIds.length - 1; i++) {
                addPrimitive({
                  id: generateId("line"),
                  type: "line" as const,
                  p1Id: orderedPtIds[i]!,
                  p2Id: orderedPtIds[i + 1]!,
                  construction: linePrim.construction,
                });
              }
            }
          }
        } else if (isSketchArc(prim)) {
          const center = findSketchPoint(
            activeSketch.primitives,
            prim.centerId,
          );
          const arcAngles = getArcAngles(activeSketch, prim);
          if (!center || !arcAngles) return;

          // Drop intersections at the arc's own endpoints, those are joins, not cuts.
          const sA = normalizeAngle(arcAngles.startAngle);
          const eA = normalizeAngle(arcAngles.endAngle);
          const filteredIntersections = intersections.filter((ix) => {
            const ixAngle = normalizeAngle(ix.tSource);
            const dStart = Math.min(
              Math.abs(ixAngle - sA),
              2 * Math.PI - Math.abs(ixAngle - sA),
            );
            const dEnd = Math.min(
              Math.abs(ixAngle - eA),
              2 * Math.PI - Math.abs(ixAngle - eA),
            );
            return (
              dStart > SKETCH_ARC_ENDPOINT_BUFFER_RAD &&
              dEnd > SKETCH_ARC_ENDPOINT_BUFFER_RAD
            );
          });

          if (filteredIntersections.length === 0) {
            removePrimitive(primId);
            await solveSketch();
            return;
          }

          const isAngleCloseArc = (a: number, b: number) => {
            const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
            return (
              diff < SKETCH_ANGLE_WRAP_RAD ||
              Math.abs(diff - 2 * Math.PI) < SKETCH_ANGLE_WRAP_RAD
            );
          };

          const isStartSegment = isAngleCloseArc(
            startParam,
            arcAngles.startAngle,
          );
          const isEndSegment = isAngleCloseArc(endParam, arcAngles.endAngle);

          if (isStartSegment && isEndSegment) {
            removePrimitive(primId);
          } else if (isStartSegment) {
            const newX = center.x + prim.radius * Math.cos(endParam);
            const newY = center.y + prim.radius * Math.sin(endParam);
            removePrimitive(primId);
            const existing = findExistingPoint(newX, newY);
            const newPtId = existing ? existing.id : generateId("point");
            if (!existing) {
              addPrimitive({
                id: newPtId,
                type: "point" as const,
                x: newX,
                y: newY,
              });
            }
            addPrimitive({
              id: generateId("arc"),
              type: "arc" as const,
              centerId: prim.centerId,
              startId: newPtId,
              endId: prim.endId,
              radius: prim.radius,
              construction: prim.construction,
            });
            const newPts = existing ? [] : [{ id: newPtId, x: newX, y: newY }];
            await applyTrimConstraints(newPts, intersections);

            for (const ix of filteredIntersections) {
              const otherPrim = activeSketch.primitives.find(
                (p) => p.id === ix.otherPrimId,
              );
              if (!otherPrim || !isSketchLine(otherPrim)) continue;
              if (
                ix.tOther < SKETCH_PARAM_ENDPOINT_TOL ||
                ix.tOther > 1 - SKETCH_PARAM_ENDPOINT_TOL
              )
                continue;
              const ixAngle = normalizeAngle(ix.tSource);
              const trimAngle = normalizeAngle(endParam);
              if (
                Math.abs(ixAngle - trimAngle) > SKETCH_ANGLE_WRAP_RAD &&
                Math.abs(ixAngle - trimAngle - 2 * Math.PI) >
                  SKETCH_ANGLE_WRAP_RAD
              )
                continue;
              removePrimitive(ix.otherPrimId);
              addPrimitive({
                id: generateId("line"),
                type: "line" as const,
                p1Id: otherPrim.p1Id,
                p2Id: newPtId,
                construction: otherPrim.construction,
              });
              addPrimitive({
                id: generateId("line"),
                type: "line" as const,
                p1Id: newPtId,
                p2Id: otherPrim.p2Id,
                construction: otherPrim.construction,
              });
            }
          } else if (isEndSegment) {
            const newX = center.x + prim.radius * Math.cos(startParam);
            const newY = center.y + prim.radius * Math.sin(startParam);
            removePrimitive(primId);
            const existing = findExistingPoint(newX, newY);
            const newPtId = existing ? existing.id : generateId("point");
            if (!existing) {
              addPrimitive({
                id: newPtId,
                type: "point" as const,
                x: newX,
                y: newY,
              });
            }
            addPrimitive({
              id: generateId("arc"),
              type: "arc" as const,
              centerId: prim.centerId,
              startId: prim.startId,
              endId: newPtId,
              radius: prim.radius,
              construction: prim.construction,
            });
            const newPts = existing ? [] : [{ id: newPtId, x: newX, y: newY }];
            await applyTrimConstraints(newPts, intersections);

            for (const ix of filteredIntersections) {
              const otherPrim = activeSketch.primitives.find(
                (p) => p.id === ix.otherPrimId,
              );
              if (!otherPrim || !isSketchLine(otherPrim)) continue;
              if (
                ix.tOther < SKETCH_PARAM_ENDPOINT_TOL ||
                ix.tOther > 1 - SKETCH_PARAM_ENDPOINT_TOL
              )
                continue;
              const ixAngle = normalizeAngle(ix.tSource);
              const trimAngle = normalizeAngle(startParam);
              if (
                Math.abs(ixAngle - trimAngle) > SKETCH_ANGLE_WRAP_RAD &&
                Math.abs(ixAngle - trimAngle - 2 * Math.PI) >
                  SKETCH_ANGLE_WRAP_RAD
              )
                continue;
              removePrimitive(ix.otherPrimId);
              addPrimitive({
                id: generateId("line"),
                type: "line" as const,
                p1Id: otherPrim.p1Id,
                p2Id: newPtId,
                construction: otherPrim.construction,
              });
              addPrimitive({
                id: generateId("line"),
                type: "line" as const,
                p1Id: newPtId,
                p2Id: otherPrim.p2Id,
                construction: otherPrim.construction,
              });
            }
          } else {
            const arcStart = normalizeAngle(arcAngles.startAngle);
            const ixAngles = filteredIntersections
              .map((ix) => normalizeAngle(ix.tSource))
              .filter((a) =>
                isAngleInArcRange(a, arcAngles.startAngle, arcAngles.endAngle),
              )
              .sort((a, b) => {
                const da = normalizeAngle(a - arcStart);
                const db = normalizeAngle(b - arcStart);
                return da - db;
              });

            const allAngles = [
              arcStart,
              ...ixAngles,
              normalizeAngle(arcAngles.endAngle),
            ];

            let skipIdx = -1;
            for (let i = 0; i < allAngles.length - 1; i++) {
              if (
                isAngleCloseArc(normalizeAngle(startParam), allAngles[i]!) &&
                isAngleCloseArc(normalizeAngle(endParam), allAngles[i + 1]!)
              ) {
                skipIdx = i;
                break;
              }
            }

            removePrimitive(primId);

            const anglePtIds: string[] = [];
            const newArcSplitPts: { id: string; x: number; y: number }[] = [];
            for (const angle of ixAngles) {
              const x = center.x + prim.radius * Math.cos(angle);
              const y = center.y + prim.radius * Math.sin(angle);
              const existing = findExistingPoint(x, y);
              const ptId = existing ? existing.id : generateId("point");
              anglePtIds.push(ptId);
              if (!existing) {
                addPrimitive({
                  id: ptId,
                  type: "point" as const,
                  x,
                  y,
                });
                newArcSplitPts.push({ id: ptId, x, y });
              }
            }

            const allPtIds = [prim.startId, ...anglePtIds, prim.endId];

            for (let i = 0; i < allPtIds.length - 1; i++) {
              if (i === skipIdx) continue;
              addPrimitive({
                id: generateId("arc"),
                type: "arc" as const,
                centerId: prim.centerId,
                startId: allPtIds[i]!,
                endId: allPtIds[i + 1]!,
                radius: prim.radius,
                construction: prim.construction,
              });
            }

            await applyTrimConstraints(newArcSplitPts, filteredIntersections);

            const arcLineIntersections = new Map<
              string,
              { tOther: number; ptId: string }[]
            >();
            for (const ix of filteredIntersections) {
              const otherPrim = activeSketch.primitives.find(
                (p) => p.id === ix.otherPrimId,
              );
              if (!otherPrim || !isSketchLine(otherPrim)) continue;

              const ixAngle = normalizeAngle(ix.tSource);
              let matchedPtId: string | null = null;
              for (let j = 0; j < ixAngles.length; j++) {
                if (Math.abs(ixAngle - ixAngles[j]!) < SKETCH_ANGLE_DEDUP_RAD) {
                  matchedPtId = anglePtIds[j] ?? null;
                  break;
                }
              }
              if (!matchedPtId) continue;
              if (
                ix.tOther < SKETCH_PARAM_ENDPOINT_TOL ||
                ix.tOther > 1 - SKETCH_PARAM_ENDPOINT_TOL
              )
                continue;

              if (!arcLineIntersections.has(ix.otherPrimId)) {
                arcLineIntersections.set(ix.otherPrimId, []);
              }
              arcLineIntersections
                .get(ix.otherPrimId)!
                .push({ tOther: ix.tOther, ptId: matchedPtId });
            }

            for (const [lineId, splits] of arcLineIntersections) {
              const linePrim = findSketchLine(activeSketch.primitives, lineId);
              if (!linePrim) continue;

              splits.sort((a, b) => a.tOther - b.tOther);
              removePrimitive(lineId);

              const orderedPtIds = [
                linePrim.p1Id,
                ...splits.map((s) => s.ptId),
                linePrim.p2Id,
              ];
              for (let i = 0; i < orderedPtIds.length - 1; i++) {
                addPrimitive({
                  id: generateId("line"),
                  type: "line" as const,
                  p1Id: orderedPtIds[i]!,
                  p2Id: orderedPtIds[i + 1]!,
                  construction: linePrim.construction,
                });
              }
            }
          }
        }

        await solveSketch();
      }
    },
    [
      activeSketch,
      scene,
      camera,
      renderer,
      cleanupTrimHighlight,
      pushSketchUndo,
      solveSketch,
      removePrimitive,
      addPrimitive,
      generateId,
      applyTrimConstraints,
      sketchTo3DRef,
      requestRender,
    ],
  );

  const handleExtendMode = useCallback(
    (event: MouseEvent, point: THREE.Vector3) => {
      if (!activeSketch) return;

      const pt2d = worldToSketch2D(point, activeSketch.plane);
      if (!pt2d) return;
      const cursorPoint = { x: pt2d.x, y: pt2d.y };

      const snapDist =
        camera && renderer ? screenPxToSketchUnits(camera, renderer, 15) : 0.5;

      if (event.type === "mousemove") {
        cleanupTrimHighlight();

        const endpoint = findClosestEndpoint(
          activeSketch,
          cursorPoint,
          snapDist,
        );
        if (!endpoint) return;

        const prim = activeSketch.primitives.find(
          (p) => p.id === endpoint.primitiveId,
        );
        if (!prim) return;
        if ((prim as { origin?: boolean }).origin) return;

        let target: {
          point: { x: number; y: number };
          targetPrimId: string;
        } | null = null;
        if (isSketchLine(prim)) {
          target = findNearestExtendTarget(
            activeSketch,
            endpoint.primitiveId,
            endpoint.isStart,
          );
        } else if (isSketchArc(prim)) {
          target = findNearestArcExtendTarget(
            activeSketch,
            endpoint.primitiveId,
            endpoint.isStart,
          );
        }
        if (!target) return;

        if (sketchTo3DRef.current) {
          const endpointPrim = findSketchPoint(
            activeSketch.primitives,
            endpoint.pointId,
          );
          if (!endpointPrim) return;

          const group = new THREE.Group();

          const from3d = sketchTo3DRef.current(
            endpointPrim.x,
            endpointPrim.y,
            SKETCH_PREVIEW_Z_LIFT_MM,
          );
          const to3d = sketchTo3DRef.current(
            target.point.x,
            target.point.y,
            SKETCH_PREVIEW_Z_LIFT_MM,
          );
          const positions = [
            from3d.x,
            from3d.y,
            from3d.z,
            to3d.x,
            to3d.y,
            to3d.z,
          ];
          const dashedLine = createLine2FromPoints(
            positions,
            SKETCH_THEME.extendPreview,
            3.0,
            true,
          );
          dashedLine.renderOrder = 1000;
          group.add(dashedLine);

          const circleRadius = screenPxToSketchUnits(camera!, renderer!, 6);
          const circleGeom = new THREE.CircleGeometry(circleRadius, 24);
          const circleMat = new THREE.MeshBasicMaterial({
            color: SKETCH_THEME.extendPreview,
            depthTest: false,
            transparent: true,
            opacity: 0.8,
          });
          const circleMesh = new THREE.Mesh(circleGeom, circleMat);
          const circlePt3d = sketchTo3DRef.current(
            endpointPrim.x,
            endpointPrim.y,
            0.03,
          );
          circleMesh.position.set(circlePt3d.x, circlePt3d.y, circlePt3d.z);
          circleMesh.renderOrder = 1000;
          group.add(circleMesh);

          if (scene) {
            scene.add(group);
            requestRender();
          }
          trimHighlightRef.current = group;

          extendHoveredRef.current = {
            primId: endpoint.primitiveId,
            pointId: endpoint.pointId,
            isStart: endpoint.isStart,
            targetPoint: target.point,
          };
        }
      } else if (event.type === "mousedown") {
        if (!extendHoveredRef.current) return;

        const { pointId, targetPoint } = extendHoveredRef.current;
        cleanupTrimHighlight();

        pushSketchUndo();
        updatePrimitive(pointId, { x: targetPoint.x, y: targetPoint.y });
        solveSketch();
      }
    },
    [
      activeSketch,
      camera,
      renderer,
      scene,
      cleanupTrimHighlight,
      pushSketchUndo,
      solveSketch,
      updatePrimitive,
      sketchTo3DRef,
      requestRender,
    ],
  );

  return {
    cleanupTrimHighlight,
    handleTrimMode,
    handleExtendMode,
  };
}
