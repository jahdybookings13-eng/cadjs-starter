import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  Sketch,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  isDimensionalConstraint,
} from "../../../types/sketch-types";
import { SKETCH as SKETCH_THEME } from "../../../theme";
import {
  SKETCH_CONFIG,
  createLine2FromPoints,
  worldToSketch2D,
  SketchTo3D,
} from "../sketch-helpers";
import { useRaycastToObjects } from "../../shared/useRaycastToObjects";
import { SketchContextMenu } from "../types";
import { SKETCH_LABEL_OFFSET_VISIBLE_TOL } from "../../../sketch-tolerances";

interface UseSketchSelectionParams {
  generateId: (prefix: string) => string;
  sketchTo3DRef: React.MutableRefObject<SketchTo3D>;
  // Live mirror of activeSketch, drag handlers can't capture the React state cleanly.
  activeSketchRef: React.MutableRefObject<Sketch | null>;
  setSelectedConstraintId: (id: string | null) => void;
  setEditingConstraintId: (id: string | null) => void;
  setContextMenu: React.Dispatch<React.SetStateAction<SketchContextMenu>>;
  closeContextMenu: () => void;
  sketchObjectsRef: React.MutableRefObject<THREE.Object3D[]>;
}

export function useSketchSelection({
  generateId: _generateId,
  sketchTo3DRef,
  activeSketchRef,
  setSelectedConstraintId,
  setEditingConstraintId,
  setContextMenu,
  closeContextMenu,
  sketchObjectsRef,
}: UseSketchSelectionParams) {
  void _generateId;
  const {
    activeSketch,
    updateConstraint,
    updatePrimitivesAndSolve,
    solveSketch,
    pushSketchUndo,
  } = useCadCore();
  const { scene, camera, renderer, getMouseIntersection, requestRender } =
    useCadVisualizer();

  const { GLYPH_DRAG_THRESHOLD_PX, POINT_HIT_RADIUS_PX, LINE_HIT_THRESHOLD } =
    SKETCH_CONFIG;

  const [selectedPrimitives, setSelectedPrimitives] = useState<string[]>([]);

  const isDraggingRef = useRef(false);
  const dragStartPointRef = useRef<THREE.Vector3 | null>(null);
  const draggedPrimitiveIdsRef = useRef<string[]>([]);
  const dragOriginalPositionsRef = useRef<
    Map<string, { x: number; y: number }>
  >(new Map());
  // rAF-coalesced solve dispatch: handleDragMove stores the latest update in
  // pendingDragUpdatesRef and schedules one rAF; the callback fires
  // updatePrimitivesAndSolve once per frame regardless of mouse polling rate.
  const pendingDragUpdatesRef = useRef<Map<
    string,
    { x: number; y: number }
  > | null>(null);
  const dragRafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (dragRafIdRef.current !== null) {
        cancelAnimationFrame(dragRafIdRef.current);
        dragRafIdRef.current = null;
      }
    };
  }, []);

  const isGlyphDraggingRef = useRef(false);
  const glyphDragConstraintIdRef = useRef<string | null>(null);
  const glyphDragStartScreenRef = useRef<{ x: number; y: number } | null>(null);
  const glyphDragAnchor2DRef = useRef<{ x: number; y: number } | null>(null);
  const glyphDragLeaderRef = useRef<Line2 | null>(null);
  const glyphDragSpriteRef = useRef<THREE.Sprite | null>(null);

  const lastGlyphClickRef = useRef<{
    constraintId: string;
    time: number;
  } | null>(null);

  const { raycastToObjects } = useRaycastToObjects(LINE_HIT_THRESHOLD);

  // Returns every primitive reachable through shared points, so dragging a rectangle
  // edge takes the shared corners (and adjacent edges) along with it.
  const findConnectedPrimitives = useCallback(
    (primitiveId: string): string[] => {
      if (!activeSketch) return [primitiveId];

      const connected = new Set<string>();
      const visited = new Set<string>();
      const queue = [primitiveId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const primitive = activeSketch.primitives.find(
          (p) => p.id === currentId,
        );
        if (!primitive) continue;

        const pointIds: string[] = [];
        if (isSketchLine(primitive)) {
          pointIds.push(primitive.p1Id, primitive.p2Id);
          connected.add(currentId);
        } else if (isSketchCircle(primitive)) {
          pointIds.push(primitive.centerId);
          connected.add(currentId);
        } else if (isSketchArc(primitive)) {
          pointIds.push(primitive.centerId, primitive.startId, primitive.endId);
          connected.add(currentId);
        } else if (isSketchPoint(primitive)) {
          pointIds.push(currentId);
        }

        for (const pointId of pointIds) {
          for (const other of activeSketch.primitives) {
            if (visited.has(other.id)) continue;

            let sharesPoint = false;
            if (isSketchLine(other)) {
              sharesPoint = other.p1Id === pointId || other.p2Id === pointId;
            } else if (isSketchCircle(other)) {
              sharesPoint = other.centerId === pointId;
            } else if (isSketchArc(other)) {
              sharesPoint =
                other.centerId === pointId ||
                other.startId === pointId ||
                other.endId === pointId;
            }

            if (sharesPoint) {
              queue.push(other.id);
            }
          }
        }
      }

      return Array.from(connected);
    },
    [activeSketch],
  );

  const selectPrimitive = useCallback((id: string, addToSelection: boolean) => {
    setSelectedPrimitives((prev) => {
      if (addToSelection) {
        if (prev.includes(id)) {
          return prev.filter((p) => p !== id);
        }
        return [...prev, id];
      } else {
        if (prev.length === 1 && prev[0] === id) {
          return [];
        }
        return [id];
      }
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPrimitives([]);
    setSelectedConstraintId(null);
  }, [setSelectedConstraintId]);

  const handleDragMove = useCallback(
    (event: MouseEvent) => {
      const currentSketch = activeSketchRef.current;
      if (
        !isDraggingRef.current ||
        !dragStartPointRef.current ||
        !currentSketch
      )
        return;

      const point3D = getMouseIntersection(event);
      if (!point3D) return;

      const point = worldToSketch2D(point3D, currentSketch.plane);
      const deltaX = point.x - dragStartPointRef.current.x;
      const deltaY = point.y - dragStartPointRef.current.y;

      const updates: Map<string, { x: number; y: number }> = new Map();
      for (const primitiveId of draggedPrimitiveIdsRef.current) {
        const originalPos = dragOriginalPositionsRef.current.get(primitiveId);
        if (!originalPos) continue;

        updates.set(primitiveId, {
          x: originalPos.x + deltaX,
          y: originalPos.y + deltaY,
        });
      }

      // Multiple mousemoves between frames overwrite the same ref, so the
      // solver sees exactly one update per frame regardless of polling rate.
      pendingDragUpdatesRef.current = updates;
      if (dragRafIdRef.current === null) {
        dragRafIdRef.current = requestAnimationFrame(() => {
          dragRafIdRef.current = null;
          const pending = pendingDragUpdatesRef.current;
          if (pending) {
            pendingDragUpdatesRef.current = null;
            updatePrimitivesAndSolve(pending);
          }
        });
      }
    },
    [getMouseIntersection, updatePrimitivesAndSolve, activeSketchRef],
  );

  const handleDragEnd = useCallback(async () => {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;
    dragStartPointRef.current = null;
    draggedPrimitiveIdsRef.current = [];
    dragOriginalPositionsRef.current.clear();

    // Cancel any in-flight rAF and apply the latest pending update
    // synchronously so the released position is committed before solveSketch
    // settles. Without this, a release between a scheduled rAF and the next
    // frame would leave the final cursor position uncommitted.
    if (dragRafIdRef.current !== null) {
      cancelAnimationFrame(dragRafIdRef.current);
      dragRafIdRef.current = null;
    }
    const pending = pendingDragUpdatesRef.current;
    if (pending) {
      pendingDragUpdatesRef.current = null;
      await updatePrimitivesAndSolve(pending);
    }

    await solveSketch();
  }, [solveSketch, updatePrimitivesAndSolve]);

  const startDrag = useCallback(
    (event: MouseEvent, primitiveIds: string[]) => {
      if (!activeSketch) return;

      const point3D = getMouseIntersection(event);
      if (!point3D) return;

      const point = worldToSketch2D(point3D, activeSketch.plane);

      const pointsToMove: string[] = [];

      for (const primitiveId of primitiveIds) {
        const primitive = activeSketch.primitives.find(
          (p) => p.id === primitiveId,
        );
        if (!primitive) continue;

        if (isSketchPoint(primitive)) {
          pointsToMove.push(primitiveId);
        } else if (isSketchLine(primitive)) {
          if (!pointsToMove.includes(primitive.p1Id)) {
            pointsToMove.push(primitive.p1Id);
          }
          if (!pointsToMove.includes(primitive.p2Id)) {
            pointsToMove.push(primitive.p2Id);
          }
        } else if (isSketchCircle(primitive)) {
          if (!pointsToMove.includes(primitive.centerId)) {
            pointsToMove.push(primitive.centerId);
          }
        } else if (isSketchArc(primitive)) {
          if (!pointsToMove.includes(primitive.centerId)) {
            pointsToMove.push(primitive.centerId);
          }
          if (!pointsToMove.includes(primitive.startId)) {
            pointsToMove.push(primitive.startId);
          }
          if (!pointsToMove.includes(primitive.endId)) {
            pointsToMove.push(primitive.endId);
          }
        }
      }

      // User-fixed points stay anchored during drag.
      const movablePoints = pointsToMove.filter((pointId) => {
        const p = activeSketch.primitives.find((pr) => pr.id === pointId);
        return !(p && isSketchPoint(p) && p.fixed);
      });

      // Don't mark these points as fixed, letting the solver find the nearest valid
      // configuration is what makes H/V constraints clamp the drag direction.
      dragOriginalPositionsRef.current.clear();
      for (const pointId of movablePoints) {
        const pointPrimitive = activeSketch.primitives.find(
          (p) => p.id === pointId,
        );
        if (pointPrimitive && isSketchPoint(pointPrimitive)) {
          dragOriginalPositionsRef.current.set(pointId, {
            x: pointPrimitive.x,
            y: pointPrimitive.y,
          });
        }
      }

      pushSketchUndo();
      isDraggingRef.current = true;
      dragStartPointRef.current = point.clone();
      draggedPrimitiveIdsRef.current = movablePoints;
    },
    [activeSketch, getMouseIntersection, pushSketchUndo],
  );

  const cleanupGlyphDrag = useCallback(() => {
    if (glyphDragLeaderRef.current && scene) {
      scene.remove(glyphDragLeaderRef.current);
      glyphDragLeaderRef.current.geometry.dispose();
      (glyphDragLeaderRef.current.material as LineMaterial).dispose();
      requestRender();
    }
    isGlyphDraggingRef.current = false;
    glyphDragConstraintIdRef.current = null;
    glyphDragStartScreenRef.current = null;
    glyphDragAnchor2DRef.current = null;
    glyphDragSpriteRef.current = null;
    glyphDragLeaderRef.current = null;
  }, [scene, requestRender]);

  const handleSelectMode = useCallback(
    (event: MouseEvent, isRightClick: boolean = false) => {
      if (event.type === "mousemove" && glyphDragConstraintIdRef.current) {
        const startScreen = glyphDragStartScreenRef.current;
        if (!startScreen) return;
        const dx = event.clientX - startScreen.x;
        const dy = event.clientY - startScreen.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (!isGlyphDraggingRef.current && dist >= GLYPH_DRAG_THRESHOLD_PX) {
          isGlyphDraggingRef.current = true;
        }

        if (isGlyphDraggingRef.current) {
          const point3D = getMouseIntersection(event);
          if (point3D && activeSketch) {
            const sketch2D = worldToSketch2D(point3D, activeSketch.plane);
            const anchor = glyphDragAnchor2DRef.current;
            if (anchor) {
              const newOffsetX = sketch2D.x - anchor.x;
              const newOffsetY = sketch2D.y - anchor.y;

              const sprite = glyphDragSpriteRef.current;
              if (sprite) {
                const plane = activeSketch.plane;
                const newPos = new THREE.Vector3()
                  .copy(plane.origin)
                  .addScaledVector(plane.xAxis, anchor.x + newOffsetX)
                  .addScaledVector(plane.yAxis, anchor.y + newOffsetY);
                newPos.addScaledVector(plane.normal, 0.15);
                sprite.position.copy(newPos);

                // Leader points back to the geometry anchor, not the label's default position.
                const geoAnchor = sprite.userData.geometryAnchor2D || anchor;
                const geoPos = new THREE.Vector3()
                  .copy(plane.origin)
                  .addScaledVector(plane.xAxis, geoAnchor.x)
                  .addScaledVector(plane.yAxis, geoAnchor.y);
                geoPos.addScaledVector(plane.normal, 0.15);

                if (glyphDragLeaderRef.current) {
                  scene?.remove(glyphDragLeaderRef.current);
                  glyphDragLeaderRef.current.geometry.dispose();
                  (
                    glyphDragLeaderRef.current.material as LineMaterial
                  ).dispose();
                }

                if (
                  Math.abs(newOffsetX) > SKETCH_LABEL_OFFSET_VISIBLE_TOL ||
                  Math.abs(newOffsetY) > SKETCH_LABEL_OFFSET_VISIBLE_TOL
                ) {
                  const leaderLine = createLine2FromPoints(
                    [
                      geoPos.x,
                      geoPos.y,
                      geoPos.z,
                      newPos.x,
                      newPos.y,
                      newPos.z,
                    ],
                    SKETCH_THEME.constraintGlyph,
                    0.5,
                  );
                  leaderLine.renderOrder = 999;
                  scene?.add(leaderLine);
                  glyphDragLeaderRef.current = leaderLine;
                } else {
                  glyphDragLeaderRef.current = null;
                }
                requestRender();
              }
            }
          }
        }
        return;
      }

      if (event.type === "mouseup" && glyphDragConstraintIdRef.current) {
        const constraintId = glyphDragConstraintIdRef.current;
        if (isGlyphDraggingRef.current) {
          const point3D = getMouseIntersection(event);
          if (point3D && activeSketch) {
            const sketch2D = worldToSketch2D(point3D, activeSketch.plane);
            const anchor = glyphDragAnchor2DRef.current;
            if (anchor) {
              const finalOffset = {
                x: sketch2D.x - anchor.x,
                y: sketch2D.y - anchor.y,
              };
              pushSketchUndo();
              updateConstraint(constraintId, { labelOffset: finalOffset });
            }
          }
          if (glyphDragLeaderRef.current && scene) {
            scene.remove(glyphDragLeaderRef.current);
            glyphDragLeaderRef.current.geometry.dispose();
            (glyphDragLeaderRef.current.material as LineMaterial).dispose();
            // Drop from sketchObjectsRef so the render-effect rerun doesn't double-dispose.
            const idx = sketchObjectsRef.current.indexOf(
              glyphDragLeaderRef.current,
            );
            if (idx >= 0) sketchObjectsRef.current.splice(idx, 1);
            requestRender();
          }
        } else {
          const now = Date.now();
          const lastClick = lastGlyphClickRef.current;
          if (
            lastClick &&
            lastClick.constraintId === constraintId &&
            now - lastClick.time < SKETCH_CONFIG.DOUBLE_CLICK_THRESHOLD
          ) {
            const constraint = activeSketch?.constraints.find(
              (c) => c.id === constraintId,
            );
            if (constraint && isDimensionalConstraint(constraint)) {
              setEditingConstraintId(constraintId);
              lastGlyphClickRef.current = null;
            }
          } else {
            lastGlyphClickRef.current = { constraintId, time: now };
            setSelectedConstraintId(constraintId);
            setSelectedPrimitives([]);
          }
        }
        isGlyphDraggingRef.current = false;
        glyphDragConstraintIdRef.current = null;
        glyphDragStartScreenRef.current = null;
        glyphDragAnchor2DRef.current = null;
        glyphDragSpriteRef.current = null;
        glyphDragLeaderRef.current = null;
        return;
      }

      if (event.type === "mousemove" && isDraggingRef.current) {
        handleDragMove(event);
        return;
      }
      if (event.type === "mouseup" && isDraggingRef.current) {
        handleDragEnd();
        return;
      }

      if (event.type !== "mousedown") return;

      const objects = sketchObjectsRef.current;
      if (objects.length === 0) {
        if (!isRightClick) {
          clearSelection();
        }
        closeContextMenu();
        return;
      }

      // Glyphs sit on top, so pick them before primitives.
      if (camera && renderer) {
        const glyphSprites = sketchObjectsRef.current.filter(
          (obj) =>
            obj.userData.isConstraintGlyph && obj instanceof THREE.Sprite,
        ) as THREE.Sprite[];

        if (glyphSprites.length > 0) {
          const rect = renderer.domElement.getBoundingClientRect();
          const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
          );
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(mouse, camera);
          const glyphHits = raycaster.intersectObjects(glyphSprites);

          if (glyphHits.length > 0) {
            const hitGlyph = glyphHits[0]!.object as THREE.Sprite;
            const constraintId = hitGlyph.userData.constraintId as string;

            if (isRightClick) {
              // Right-click on glyph: open context menu with constraintId
              setContextMenu({
                visible: true,
                x: event.clientX,
                y: event.clientY,
                primitiveIds: [],
                primitiveTypes: [],
                constraintId,
              });
            } else {
              // Left-click: initiate potential glyph drag
              glyphDragConstraintIdRef.current = constraintId;
              glyphDragStartScreenRef.current = {
                x: event.clientX,
                y: event.clientY,
              };
              glyphDragSpriteRef.current = hitGlyph;
              glyphDragAnchor2DRef.current = hitGlyph.userData.anchor2D || null;
            }
            return;
          }
        }
      }

      const handleFoundPrimitive = (
        primitiveId: string,
        primitiveType: string,
      ) => {
        if (isRightClick) {
          let primitiveIds: string[];
          let primitiveTypes: string[];

          if (selectedPrimitives.includes(primitiveId)) {
            primitiveIds = [...selectedPrimitives];
            primitiveTypes = primitiveIds.map((id) => {
              const prim = activeSketch?.primitives.find((p) => p.id === id);
              return prim?.type || "unknown";
            });
          } else {
            primitiveIds = [primitiveId];
            primitiveTypes = [primitiveType];
          }

          setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            primitiveIds,
            primitiveTypes,
          });
          return;
        }

        const addToSelection = event.shiftKey;

        if (selectedPrimitives.includes(primitiveId) && !addToSelection) {
          const connectedPrimitives = findConnectedPrimitives(primitiveId);
          startDrag(event, connectedPrimitives);
          return;
        }

        selectPrimitive(primitiveId, addToSelection);
      };

      // Pick points in screen space, Line2's hit threshold otherwise lets nearby lines win.
      if (renderer && camera && activeSketch) {
        const rect = renderer.domElement.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        let closestPointId: string | null = null;
        let closestDist: number = POINT_HIT_RADIUS_PX;

        for (const primitive of activeSketch.primitives) {
          if (!isSketchPoint(primitive)) continue;
          const pos3D = sketchTo3DRef.current(primitive.x, primitive.y, 0.1);
          const projected = pos3D.project(camera);
          const screenX = (projected.x * 0.5 + 0.5) * rect.width;
          const screenY = (-projected.y * 0.5 + 0.5) * rect.height;
          const dist = Math.hypot(screenX - clickX, screenY - clickY);
          if (dist < closestDist) {
            closestDist = dist;
            closestPointId = primitive.id;
          }
        }

        if (closestPointId) {
          handleFoundPrimitive(closestPointId, "point");
          return;
        }
      }

      const intersects = raycastToObjects(event, objects, true);

      if (intersects.length > 0) {
        for (const intersect of intersects) {
          let obj: THREE.Object3D | null = intersect.object;
          while (obj) {
            if (obj.userData.primitiveId) {
              handleFoundPrimitive(
                obj.userData.primitiveId as string,
                obj.userData.type as string,
              );
              return;
            }
            obj = obj.parent;
          }
        }
      }

      if (isRightClick) {
        closeContextMenu();
      } else if (!event.shiftKey) {
        clearSelection();
      }
    },
    [
      raycastToObjects,
      selectPrimitive,
      clearSelection,
      closeContextMenu,
      selectedPrimitives,
      activeSketch,
      startDrag,
      handleDragMove,
      handleDragEnd,
      findConnectedPrimitives,
      renderer,
      camera,
      scene,
      getMouseIntersection,
      pushSketchUndo,
      updateConstraint,
      setContextMenu,
      setSelectedConstraintId,
      setEditingConstraintId,
      sketchObjectsRef,
      sketchTo3DRef,
      GLYPH_DRAG_THRESHOLD_PX,
      POINT_HIT_RADIUS_PX,
      requestRender,
    ],
  );

  const isGlyphDraggingActiveRef = glyphDragConstraintIdRef;

  return {
    selectedPrimitives,
    selectPrimitive,
    clearSelection,
    handleSelectMode,
    cleanupGlyphDrag,
    isGlyphDraggingActiveRef,
  };
}
