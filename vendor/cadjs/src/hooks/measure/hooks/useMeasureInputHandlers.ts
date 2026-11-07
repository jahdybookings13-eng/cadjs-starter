import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { OccWorkerClient } from "../../../services/OccWorkerClient";
import type {
  EulerJSON,
  WorkerEdgeDirectionResult,
  WorkerEdgeLengthResult,
} from "../../../workers/occ-worker-types";
import { isDescendantOf } from "../../../scene-operations/mesh-operations";
import { isElement3D, SceneElement } from "../../../scene-operations/types";
import {
  computeAngleBetweenVectors,
  computePointDistance,
  findNearestVertex,
} from "../../../scene-operations/measure-operations";
import {
  Measurement,
  MeasureSubMode,
} from "../../../scene-operations/measure-types";
import { MEASURE, SELECTION } from "../../../theme";
import { toEulerJSON, toVec3 } from "../../../vectorHelpers";
import {
  buildAngleAnnotation,
  buildDistanceAnnotation,
  buildEdgeLengthAnnotation,
  createLine2,
  createPointMarker,
  createValueSprite,
  tagOverlays,
} from "../measure-rendering";
import { useRaycastToObjects } from "../../shared/useRaycastToObjects";
import { createModeInputHandlers } from "../../shared/createModeInputHandlers";
import { useModeInputHoldRefs } from "../../shared/useModeInputHoldRefs";
import type { EdgeOverlayBag } from "./useEdgeOverlay";
import type { MeasurementSelection } from "./useMeasurementSelection";
import type { MeasurementStateBag } from "./useMeasurementState";

interface UseMeasureInputHandlersParams {
  stateBag: MeasurementStateBag;
  selection: MeasurementSelection;
  edgeOverlay: EdgeOverlayBag;
  setSubMode: (next: MeasureSubMode) => void;
}

// Resolved pick kinds; carries the raycaster so onPickStart can re-use it for
// async sub-flows (avoiding an inert second raycast).
type MeasurePick =
  | { kind: "measurement-row"; measureId: string }
  | { kind: "raycast"; raycaster: THREE.Raycaster };

export function useMeasureInputHandlers({
  stateBag,
  selection,
  edgeOverlay,
  setSubMode,
}: UseMeasureInputHandlersParams) {
  const { elements, getObject } = useCadCore();
  const { scene, forceSceneUpdate, navToolActiveRef } = useCadVisualizer();
  const { raycasterFromEvent } = useRaycastToObjects();

  const {
    state,
    setState,
    overlayObjectsRef,
    previewObjectsRef,
    measurementsRef,
    pinnedMeasurementsRef,
    hoveredBodyRef,
    measureIdRef,
    selectedMeasurementIdRef,
    bumpVersion,
    cleanupPreview,
    cleanupOverlays,
    resetBodyHover,
  } = stateBag;
  const { selectMeasurement } = selection;
  const {
    edgeOverlayGroupRef,
    edgeSegmentsRef,
    activeElementRef,
    buildEdgeOverlays,
  } = edgeOverlay;

  const isApplyingRef = useRef(false);
  const holdRefs = useModeInputHoldRefs<MeasurePick>();
  // Token bumped on every pick so async sub-mode resolutions can detect a
  // newer click and bail. Without this, two rapid edge-length / angle clicks
  // race the worker round-trip and produce duplicate or misordered annotations.
  const pickTokenRef = useRef(0);
  const subModeRef = useRef(state.subMode);
  subModeRef.current = state.subMode;
  const firstPointRef = useRef(state.firstPoint);
  firstPointRef.current = state.firstPoint;
  const firstEdgeRef = useRef(state.firstEdge);
  firstEdgeRef.current = state.firstEdge;
  const hoveredEdgeIndexRef = useRef(state.hoveredEdgeIndex);
  hoveredEdgeIndexRef.current = state.hoveredEdgeIndex;

  const getPickableObjects = useCallback((): THREE.Object3D[] => {
    const objects: THREE.Object3D[] = [];
    elements.forEach((el) => {
      if (isElement3D(el)) {
        const obj = getObject(el.nodeId);
        if (obj) objects.push(obj);
      }
    });
    return objects;
  }, [elements, getObject]);

  const findElementByHit = useCallback(
    (hitObject: THREE.Object3D): SceneElement | null => {
      for (const el of elements) {
        if (!isElement3D(el)) continue;
        const obj = getObject(el.nodeId);
        if (obj && isDescendantOf(hitObject, obj)) {
          return el;
        }
      }
      return null;
    },
    [elements, getObject],
  );

  // Annotation overlays for completed measurements live on `measurement.overlayObjects`
  // , they must NOT be tracked in `overlayObjectsRef` (which is only for the transient
  // first-click marker), or `cleanupOverlays()` on mode exit will dispose them and
  // pinned measurements vanish from the scene.
  const addAnnotationToScene = useCallback(
    (objs: THREE.Object3D[]) => {
      if (!scene) return;
      for (const obj of objs) scene.add(obj);
    },
    [scene],
  );

  const handleDistancePick = useCallback(
    (raycaster: THREE.Raycaster) => {
      const objects = getPickableObjects();
      const intersects = raycaster.intersectObjects(objects, true);
      if (intersects.length === 0) return;

      const hit = intersects[0]!;
      const hitElement = findElementByHit(hit.object);
      if (!hitElement) return;

      let worldPoint = hit.point.clone();
      const snap = findNearestVertex(worldPoint, hitElement, 0.15);
      if (snap) worldPoint = snap.position;

      if (!firstPointRef.current) {
        cleanupPreview();
        const marker = createPointMarker(worldPoint);
        if (scene) {
          scene.add(marker);
          overlayObjectsRef.current.push(marker);
        }
        setState((prev) => ({
          ...prev,
          firstPoint: worldPoint,
          statusText: "Click second point",
        }));
        forceSceneUpdate();
        return;
      }

      cleanupPreview();
      cleanupOverlays();

      const distance = computePointDistance(firstPointRef.current, worldPoint);
      const overlays = buildDistanceAnnotation(
        firstPointRef.current,
        worldPoint,
        distance,
      );
      addAnnotationToScene(overlays);

      measureIdRef.current++;
      const measureId = `measure-${measureIdRef.current}`;
      tagOverlays(overlays, measureId);
      const measurement: Measurement = {
        type: "distance",
        id: measureId,
        pointA: firstPointRef.current.clone(),
        pointB: worldPoint.clone(),
        distance,
        pinned: false,
        overlayObjects: overlays,
      };
      measurementsRef.current.push(measurement);
      bumpVersion();

      setState((prev) => ({
        ...prev,
        firstPoint: null,
        statusText: `Distance: ${distance.toFixed(3)}, Click first point for new measurement`,
      }));
      forceSceneUpdate();
    },
    [
      scene,
      addAnnotationToScene,
      getPickableObjects,
      findElementByHit,
      cleanupPreview,
      cleanupOverlays,
      bumpVersion,
      forceSceneUpdate,
      setState,
      measurementsRef,
      measureIdRef,
      overlayObjectsRef,
    ],
  );

  const handleEdgeLengthPick = useCallback(
    async (raycaster: THREE.Raycaster) => {
      if (!edgeOverlayGroupRef.current) return;

      const edgeObjects: THREE.Object3D[] = [];
      edgeOverlayGroupRef.current.traverse((child) => {
        if (child instanceof Line2) edgeObjects.push(child);
      });

      (raycaster.params as { Line2?: { threshold: number } }).Line2 = {
        threshold: 8,
      };
      const edgeIntersects = raycaster.intersectObjects(edgeObjects);
      if (edgeIntersects.length === 0) return;

      const edgeIndex = edgeIntersects[0]!.object.userData.edgeIndex as number;
      const elementId = activeElementRef.current;
      if (!elementId) return;

      const element = elements.find((el) => el.nodeId === elementId);
      if (!element) return;

      const myToken = pickTokenRef.current;
      try {
        const client = OccWorkerClient.getInstance();
        const rotation =
          element.rotation &&
          (element.rotation.x !== 0 ||
            element.rotation.y !== 0 ||
            element.rotation.z !== 0)
            ? (toEulerJSON(element.rotation) as EulerJSON)
            : undefined;

        const lengthResult = await client.send<WorkerEdgeLengthResult>({
          type: "edgeLength",
          payload: {
            brepJson: element.brep.toJSON(),
            position: toVec3(element.position),
            edgeIndex,
            occBrep: element.occBrep,
            rotation,
          },
        });

        // Drop stale resolution if the user clicked again or switched sub-mode.
        if (pickTokenRef.current !== myToken) return;
        const length = lengthResult.length;
        const edgeData = edgeSegmentsRef.current.find(
          (e) => e.edgeIndex === edgeIndex,
        );
        if (!edgeData) return;

        const overlays = buildEdgeLengthAnnotation(edgeData, length);
        addAnnotationToScene(overlays);

        measureIdRef.current++;
        const measureId = `measure-${measureIdRef.current}`;
        tagOverlays(overlays, measureId);
        const measurement: Measurement = {
          type: "edge-length",
          id: measureId,
          elementNodeId: elementId,
          edgeIndex,
          edgeSegments: edgeData.segments,
          midpoint: edgeData.midpoint,
          length,
          pinned: false,
          overlayObjects: overlays,
        };
        measurementsRef.current.push(measurement);
        bumpVersion();

        setState((prev) => ({
          ...prev,
          statusText: `Edge length: ${length.toFixed(3)}, Hover and click another edge`,
        }));
        forceSceneUpdate();
      } catch (error) {
        console.error(
          "[useMeasureMode] Edge length measurement failed:",
          error,
        );
      }
    },
    [
      elements,
      addAnnotationToScene,
      bumpVersion,
      forceSceneUpdate,
      setState,
      activeElementRef,
      edgeOverlayGroupRef,
      edgeSegmentsRef,
      measureIdRef,
      measurementsRef,
    ],
  );

  const handleAnglePick = useCallback(
    async (raycaster: THREE.Raycaster) => {
      if (!edgeOverlayGroupRef.current) return;

      const edgeObjects: THREE.Object3D[] = [];
      edgeOverlayGroupRef.current.traverse((child) => {
        if (child instanceof Line2) edgeObjects.push(child);
      });

      (raycaster.params as { Line2?: { threshold: number } }).Line2 = {
        threshold: 8,
      };
      const edgeIntersects = raycaster.intersectObjects(edgeObjects);
      if (edgeIntersects.length === 0) return;

      const edgeIndex = edgeIntersects[0]!.object.userData.edgeIndex as number;
      const elementId = activeElementRef.current;
      if (!elementId) return;

      const firstEdge = firstEdgeRef.current;
      if (!firstEdge) {
        edgeOverlayGroupRef.current.children.forEach((child) => {
          if (child instanceof Line2 && child.userData.isMeasureEdge) {
            const mat = child.material as LineMaterial;
            if (child.userData.edgeIndex === edgeIndex) {
              mat.color.set(MEASURE.edgeHighlight);
              mat.opacity = 1.0;
            }
          }
        });

        setState((prev) => ({
          ...prev,
          firstEdge: { elementId, edgeIndex },
          statusText: "Click second edge for angle measurement",
        }));
        forceSceneUpdate();
        return;
      }

      const myToken = pickTokenRef.current;
      try {
        const element = elements.find(
          (el) => el.nodeId === firstEdge.elementId,
        );
        if (!element) return;

        const client = OccWorkerClient.getInstance();
        const rotation =
          element.rotation &&
          (element.rotation.x !== 0 ||
            element.rotation.y !== 0 ||
            element.rotation.z !== 0)
            ? (toEulerJSON(element.rotation) as EulerJSON)
            : undefined;

        const [resultA, resultB] = await Promise.all([
          client.send<WorkerEdgeDirectionResult>({
            type: "edgeDirection",
            payload: {
              brepJson: element.brep.toJSON(),
              position: toVec3(element.position),
              edgeIndex: firstEdge.edgeIndex,
              occBrep: element.occBrep,
              rotation,
            },
          }),
          client.send<WorkerEdgeDirectionResult>({
            type: "edgeDirection",
            payload: {
              brepJson: element.brep.toJSON(),
              position: toVec3(element.position),
              edgeIndex: edgeIndex,
              occBrep: element.occBrep,
              rotation,
            },
          }),
        ]);

        // Drop stale resolution if the user clicked again or switched sub-mode.
        if (pickTokenRef.current !== myToken) return;
        const dirA = resultA.direction;
        const dirB = resultB.direction;
        const vecA = new THREE.Vector3(dirA.x, dirA.y, dirA.z);
        const vecB = new THREE.Vector3(dirB.x, dirB.y, dirB.z);

        const edgeA = edgeSegmentsRef.current.find(
          (e) => e.edgeIndex === firstEdge.edgeIndex,
        );
        const edgeB = edgeSegmentsRef.current.find(
          (e) => e.edgeIndex === edgeIndex,
        );
        let vertex: THREE.Vector3;
        if (edgeA && edgeB) {
          const aStart = new THREE.Vector3(
            edgeA.segments[0]!,
            edgeA.segments[1]!,
            edgeA.segments[2]!,
          );
          const aEnd = new THREE.Vector3(
            edgeA.segments[edgeA.segments.length - 3]!,
            edgeA.segments[edgeA.segments.length - 2]!,
            edgeA.segments[edgeA.segments.length - 1]!,
          );
          const bStart = new THREE.Vector3(
            edgeB.segments[0]!,
            edgeB.segments[1]!,
            edgeB.segments[2]!,
          );
          const bEnd = new THREE.Vector3(
            edgeB.segments[edgeB.segments.length - 3]!,
            edgeB.segments[edgeB.segments.length - 2]!,
            edgeB.segments[edgeB.segments.length - 1]!,
          );

          const pairs = [
            {
              point: aStart,
              dist: Math.min(
                aStart.distanceTo(bStart),
                aStart.distanceTo(bEnd),
              ),
            },
            {
              point: aEnd,
              dist: Math.min(aEnd.distanceTo(bStart), aEnd.distanceTo(bEnd)),
            },
            {
              point: bStart,
              dist: Math.min(
                bStart.distanceTo(aStart),
                bStart.distanceTo(aEnd),
              ),
            },
            {
              point: bEnd,
              dist: Math.min(bEnd.distanceTo(aStart), bEnd.distanceTo(aEnd)),
            },
          ];
          pairs.sort((a, b) => a.dist - b.dist);
          vertex = pairs[0]!.point;
        } else {
          vertex = new THREE.Vector3(
            edgeA?.midpoint.x ?? 0,
            edgeA?.midpoint.y ?? 0,
            edgeA?.midpoint.z ?? 0,
          );
        }

        if (edgeA) {
          const midA = new THREE.Vector3(
            edgeA.midpoint.x,
            edgeA.midpoint.y,
            edgeA.midpoint.z,
          );
          const toMidA = midA.clone().sub(vertex);
          if (toMidA.lengthSq() < 1e-8) {
            toMidA.set(
              edgeA.segments[edgeA.segments.length - 3]! - vertex.x,
              edgeA.segments[edgeA.segments.length - 2]! - vertex.y,
              edgeA.segments[edgeA.segments.length - 1]! - vertex.z,
            );
          }
          if (vecA.dot(toMidA) < 0) vecA.negate();
        }
        if (edgeB) {
          const midB = new THREE.Vector3(
            edgeB.midpoint.x,
            edgeB.midpoint.y,
            edgeB.midpoint.z,
          );
          const toMidB = midB.clone().sub(vertex);
          if (toMidB.lengthSq() < 1e-8) {
            toMidB.set(
              edgeB.segments[edgeB.segments.length - 3]! - vertex.x,
              edgeB.segments[edgeB.segments.length - 2]! - vertex.y,
              edgeB.segments[edgeB.segments.length - 1]! - vertex.z,
            );
          }
          if (vecB.dot(toMidB) < 0) vecB.negate();
        }

        const angleDeg = computeAngleBetweenVectors(vecA, vecB);
        const overlays = buildAngleAnnotation(vertex, vecA, vecB, angleDeg);
        addAnnotationToScene(overlays);

        measureIdRef.current++;
        const measureId = `measure-${measureIdRef.current}`;
        tagOverlays(overlays, measureId);
        const measurement: Measurement = {
          type: "angle",
          id: measureId,
          vertex: vertex.clone(),
          directionA: vecA.clone(),
          directionB: vecB.clone(),
          angleDegrees: angleDeg,
          pinned: false,
          overlayObjects: overlays,
        };
        measurementsRef.current.push(measurement);
        bumpVersion();

        edgeOverlayGroupRef.current?.children.forEach((child) => {
          if (child instanceof Line2 && child.userData.isMeasureEdge) {
            (child.material as LineMaterial).opacity = 0;
          }
        });

        setState((prev) => ({
          ...prev,
          firstEdge: null,
          secondEdge: null,
          statusText: `Angle: ${angleDeg.toFixed(1)}°, Click first edge for new angle`,
        }));
        forceSceneUpdate();
      } catch (error) {
        console.error("[useMeasureMode] Angle measurement failed:", error);
      }
    },
    [
      elements,
      addAnnotationToScene,
      bumpVersion,
      forceSceneUpdate,
      setState,
      activeElementRef,
      edgeOverlayGroupRef,
      edgeSegmentsRef,
      measureIdRef,
      measurementsRef,
    ],
  );

  const onMeasureMouseMove = useCallback(
    (event: MouseEvent) => {
      const raycaster = raycasterFromEvent(event);
      if (!raycaster) return;

      if (subModeRef.current === "distance") {
        if (firstPointRef.current) {
          const objects = getPickableObjects();
          const intersects = raycaster.intersectObjects(objects, true);
          if (intersects.length > 0) {
            const hit = intersects[0]!;
            const hitElement = findElementByHit(hit.object);
            let worldPoint = hit.point.clone();
            if (hitElement) {
              const snap = findNearestVertex(worldPoint, hitElement, 0.15);
              if (snap) worldPoint = snap.position;
            }

            cleanupPreview();
            const dist = computePointDistance(
              firstPointRef.current,
              worldPoint,
            );

            const previewLine = createLine2(
              [
                firstPointRef.current.x,
                firstPointRef.current.y,
                firstPointRef.current.z,
                worldPoint.x,
                worldPoint.y,
                worldPoint.z,
              ],
              MEASURE.lineHover,
              1.0,
              true,
            );
            if (scene) {
              scene.add(previewLine);
              previewObjectsRef.current.push(previewLine);
            }

            const mid = firstPointRef.current
              .clone()
              .add(worldPoint)
              .multiplyScalar(0.5);
            mid.y += 0.15;
            const label = createValueSprite(
              `${dist.toFixed(3)}`,
              mid,
              MEASURE.lineHover,
            );
            if (scene) {
              scene.add(label);
              previewObjectsRef.current.push(label);
            }
            forceSceneUpdate();
          }
        } else {
          const objects = getPickableObjects();
          const intersects = raycaster.intersectObjects(objects, true);
          if (intersects.length > 0) {
            const hitElement = findElementByHit(intersects[0]!.object);
            if (hitElement && hitElement.nodeId !== hoveredBodyRef.current) {
              resetBodyHover();
              hoveredBodyRef.current = hitElement.nodeId;
              const obj = getObject(hitElement.nodeId);
              if (obj) {
                obj.traverse((child) => {
                  if (
                    child instanceof THREE.Mesh &&
                    !child.userData.isEdgeOverlay &&
                    !child.userData.isHelper
                  ) {
                    (child.material as THREE.MeshStandardMaterial).color.set(
                      SELECTION.hover,
                    );
                  }
                });
              }
              forceSceneUpdate();
            } else if (!hitElement && hoveredBodyRef.current) {
              resetBodyHover();
              forceSceneUpdate();
            }
          } else if (hoveredBodyRef.current) {
            resetBodyHover();
            forceSceneUpdate();
          }
        }
      } else if (
        subModeRef.current === "edge-length" ||
        subModeRef.current === "angle"
      ) {
        const objects = getPickableObjects();
        const intersects = raycaster.intersectObjects(objects, true);

        if (intersects.length > 0) {
          const hitElement = findElementByHit(intersects[0]!.object);
          if (hitElement) {
            if (activeElementRef.current !== hitElement.nodeId) {
              buildEdgeOverlays(hitElement.nodeId);
            }

            if (edgeOverlayGroupRef.current) {
              const edgeObjects: THREE.Object3D[] = [];
              edgeOverlayGroupRef.current.traverse((child) => {
                if (child instanceof THREE.LineSegments)
                  edgeObjects.push(child);
              });

              (raycaster.params as { Line2?: { threshold: number } }).Line2 = {
                threshold: 8,
              };
              const edgeIntersects = raycaster.intersectObjects(edgeObjects);

              let newHovered: number | null = null;
              if (edgeIntersects.length > 0) {
                newHovered = edgeIntersects[0]!.object.userData
                  .edgeIndex as number;
              }

              if (newHovered !== hoveredEdgeIndexRef.current) {
                edgeOverlayGroupRef.current.children.forEach((child) => {
                  if (child instanceof Line2 && child.userData.isMeasureEdge) {
                    const idx = child.userData.edgeIndex;
                    const mat = child.material as LineMaterial;
                    const firstEdge = firstEdgeRef.current;
                    if (
                      subModeRef.current === "angle" &&
                      firstEdge &&
                      idx === firstEdge.edgeIndex
                    ) {
                      mat.color.set(MEASURE.edgeHighlight);
                      mat.opacity = 1.0;
                    } else if (idx === newHovered) {
                      mat.color.set(MEASURE.lineHover);
                      mat.opacity = 1.0;
                    } else {
                      mat.opacity = 0;
                    }
                  }
                });
                setState((prev) => ({
                  ...prev,
                  hoveredEdgeIndex: newHovered,
                  hoveredElementId: hitElement.nodeId,
                }));
                forceSceneUpdate();
              }
            }

            if (hitElement.nodeId !== hoveredBodyRef.current) {
              resetBodyHover();
              hoveredBodyRef.current = hitElement.nodeId;
              const obj = getObject(hitElement.nodeId);
              if (obj) {
                obj.traverse((child) => {
                  if (
                    child instanceof THREE.Mesh &&
                    !child.userData.isEdgeOverlay &&
                    !child.userData.isHelper
                  ) {
                    (child.material as THREE.MeshStandardMaterial).color.set(
                      SELECTION.hover,
                    );
                  }
                });
              }
            }
          }
        } else {
          if (edgeOverlayGroupRef.current) {
            edgeOverlayGroupRef.current.children.forEach((child) => {
              if (child instanceof Line2 && child.userData.isMeasureEdge) {
                const mat = child.material as LineMaterial;
                const firstEdge = firstEdgeRef.current;
                if (
                  subModeRef.current === "angle" &&
                  firstEdge &&
                  child.userData.edgeIndex === firstEdge.edgeIndex
                ) {
                  mat.color.set(MEASURE.edgeHighlight);
                  mat.opacity = 1.0;
                } else {
                  mat.opacity = 0;
                }
              }
            });
          }
          if (hoveredEdgeIndexRef.current !== null) {
            setState((prev) => ({
              ...prev,
              hoveredEdgeIndex: null,
              hoveredElementId: null,
            }));
          }
          if (hoveredBodyRef.current) resetBodyHover();
          forceSceneUpdate();
        }
      }
    },
    [
      raycasterFromEvent,
      getPickableObjects,
      findElementByHit,
      getObject,
      buildEdgeOverlays,
      cleanupPreview,
      resetBodyHover,
      forceSceneUpdate,
      previewObjectsRef,
      hoveredBodyRef,
      edgeOverlayGroupRef,
      activeElementRef,
      setState,
      scene,
    ],
  );

  const handlers = useMemo(
    () =>
      createModeInputHandlers<MeasurePick, never>(
        {
          pickTargets: (raycaster) => {
            // Clicks on existing measurement annotations select that measurement.
            const measureOverlayObjects: THREE.Object3D[] = [];
            for (const m of measurementsRef.current)
              measureOverlayObjects.push(...m.overlayObjects);
            for (const m of pinnedMeasurementsRef.current)
              measureOverlayObjects.push(...m.overlayObjects);
            if (measureOverlayObjects.length > 0) {
              (raycaster.params as { Line2?: { threshold: number } }).Line2 = {
                threshold: 6,
              };
              const measureHits = raycaster.intersectObjects(
                measureOverlayObjects,
                true,
              );
              if (measureHits.length > 0) {
                const hitMeasureId = measureHits[0]!.object.userData
                  .measurementId as string | undefined;
                if (hitMeasureId) {
                  return {
                    picks: [],
                    resolved: {
                      kind: "measurement-row",
                      measureId: hitMeasureId,
                    },
                  };
                }
              }
            }
            return { picks: [], resolved: { kind: "raycast", raycaster } };
          },
          onPickStart: (resolved) => {
            // Bump the pick token so any in-flight async edge-length / angle
            // worker call from a previous click bails on resolve.
            pickTokenRef.current++;
            if (resolved.kind === "measurement-row") {
              selectMeasurement(
                resolved.measureId === selectedMeasurementIdRef.current
                  ? null
                  : resolved.measureId,
              );
              return;
            }

            if (selectedMeasurementIdRef.current) selectMeasurement(null);

            if (subModeRef.current === "distance") {
              handleDistancePick(resolved.raycaster);
            } else if (subModeRef.current === "edge-length") {
              void handleEdgeLengthPick(resolved.raycaster);
            } else if (subModeRef.current === "angle") {
              void handleAnglePick(resolved.raycaster);
            }
          },
          onPickFromMenu: () => {
            // Measure does not use Select Other.
          },
          onCancel: () => {
            if (subModeRef.current === "distance" && firstPointRef.current) {
              cleanupPreview();
              cleanupOverlays();
              setState((prev) => ({
                ...prev,
                firstPoint: null,
                statusText: "Click first point",
              }));
              forceSceneUpdate();
            } else if (subModeRef.current === "angle" && firstEdgeRef.current) {
              if (edgeOverlayGroupRef.current) {
                edgeOverlayGroupRef.current.children.forEach((child) => {
                  if (child instanceof Line2 && child.userData.isMeasureEdge) {
                    (child.material as LineMaterial).opacity = 0;
                  }
                });
              }
              setState((prev) => ({
                ...prev,
                firstEdge: null,
                statusText: "Click first edge",
              }));
              forceSceneUpdate();
            }
          },
          extraKeys: {
            d: () => {
              pickTokenRef.current++;
              setSubMode("distance");
            },
            D: () => {
              pickTokenRef.current++;
              setSubMode("distance");
            },
            e: () => {
              pickTokenRef.current++;
              setSubMode("edge-length");
            },
            E: () => {
              pickTokenRef.current++;
              setSubMode("edge-length");
            },
            a: () => {
              pickTokenRef.current++;
              setSubMode("angle");
            },
            A: () => {
              pickTokenRef.current++;
              setSubMode("angle");
            },
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
    [
      raycasterFromEvent,
      navToolActiveRef,
      handleDistancePick,
      handleEdgeLengthPick,
      handleAnglePick,
      selectMeasurement,
      selectedMeasurementIdRef,
      cleanupPreview,
      cleanupOverlays,
      forceSceneUpdate,
      setState,
      edgeOverlayGroupRef,
      measurementsRef,
      pinnedMeasurementsRef,
      setSubMode,
      holdRefs,
    ],
  );

  // The factory's `handleKeyDown` filters Escape, Enter, and `extraKeys`. The
  // measure hook's existing public surface includes a `handleKeyDown` that
  // also rejects keys when typing in inputs. We wrap to preserve that gate.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      handlers.handleKeyDown(event);
    },
    [handlers],
  );

  return {
    handleMouseDown: handlers.handleMouseDown,
    handleMouseMove: onMeasureMouseMove,
    handleKeyDown,
  };
}
