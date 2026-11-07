import { useCallback } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { OccWorkerClient } from "../../../services/OccWorkerClient";
import type { WorkerEdgeAnalysisResult } from "../../../workers/occ-worker-types";
import {
  isSketchLine,
  isSketchPoint,
  type SketchPoint,
} from "../../../types/sketch-types";
import { FILLET, REVOLVE, SELECTION } from "../../../theme";
import { toEulerJSON, toVec3 } from "../../../vectorHelpers";
import { isFlatShape } from "../revolve-helpers";
import type { RevolveStateBag } from "./useRevolveState";

interface UseRevolveAxisSelectionParams {
  stateBag: RevolveStateBag;
}

export function useRevolveAxisSelection({
  stateBag,
}: UseRevolveAxisSelectionParams) {
  const { elements, sketches, getObject } = useCadCore();
  const { scene, forceSceneUpdate } = useCadVisualizer();
  const {
    state,
    setState,
    edgeSegmentsRef,
    edgeOverlayGroupRef,
    hoveredEdgeRef,
    axisLineRef,
    sketchLineOverlayRef,
    bodyEdgeOverlayRef,
  } = stateBag;

  /** Build per-edge overlay lines from the selected profile's OCC edge data. */
  const buildEdgeOverlay = useCallback(
    async (nodeId: string) => {
      const element = elements.find((el) => el.nodeId === nodeId);
      if (!element) return;

      const client = OccWorkerClient.getInstance();
      const result = await client.send<WorkerEdgeAnalysisResult>({
        type: "edgeAnalysis",
        payload: {
          brepJson: element.brep.toJSON(),
          position: toVec3(element.position),
          occBrep: element.occBrep,
          rotation: element.rotation
            ? toEulerJSON(element.rotation)
            : undefined,
          allEdges: true,
        },
      });

      const edgeDataArr = result.edges;
      if (!edgeDataArr || edgeDataArr.length === 0) return;

      edgeSegmentsRef.current = edgeDataArr.map((e) => ({
        edgeIndex: e.edgeIndex,
        segments: e.segments,
        midpoint: e.midpoint,
      }));

      const group = new THREE.Group();
      group.userData.isHelper = true;

      for (const edge of edgeSegmentsRef.current) {
        const pairs = edge.segments;
        const strip: number[] = [];
        for (let i = 0; i < pairs.length; i += 6) {
          if (strip.length === 0)
            strip.push(pairs[i]!, pairs[i + 1]!, pairs[i + 2]!);
          strip.push(pairs[i + 3]!, pairs[i + 4]!, pairs[i + 5]!);
        }
        const geom = new LineGeometry();
        geom.setPositions(strip);
        const mat = new LineMaterial({
          color: REVOLVE.axisLine,
          linewidth: FILLET.edgeWidth,
          depthTest: false,
          resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
        });
        const line = new Line2(geom, mat);
        line.computeLineDistances();
        line.renderOrder = 999;
        line.userData.edgeIndex = edge.edgeIndex;
        group.add(line);
      }

      const obj = getObject(nodeId);
      if (obj && obj.parent) {
        obj.parent.add(group);
      } else if (scene) {
        scene.add(group);
      }
      edgeOverlayGroupRef.current = group;
      forceSceneUpdate();
    },
    [
      elements,
      getObject,
      scene,
      forceSceneUpdate,
      edgeSegmentsRef,
      edgeOverlayGroupRef,
    ],
  );

  /** Build overlays for sketch lines from completed sketches (Priority 2 axis source). */
  const buildSketchLineOverlays = useCallback(() => {
    if (!scene) return;

    const group = new THREE.Group();
    group.userData.isHelper = true;

    for (const sketch of sketches) {
      const plane = sketch.plane;
      const points = new Map<string, SketchPoint>();
      for (const prim of sketch.primitives) {
        if (isSketchPoint(prim)) {
          points.set(prim.id, prim);
        }
      }

      for (const prim of sketch.primitives) {
        if (!isSketchLine(prim)) continue;
        const p1 = points.get(prim.p1Id);
        const p2 = points.get(prim.p2Id);
        if (!p1 || !p2) continue;

        const start3d = plane.origin
          .clone()
          .add(plane.xAxis.clone().multiplyScalar(p1.x))
          .add(plane.yAxis.clone().multiplyScalar(p1.y));
        const end3d = plane.origin
          .clone()
          .add(plane.xAxis.clone().multiplyScalar(p2.x))
          .add(plane.yAxis.clone().multiplyScalar(p2.y));

        if (start3d.distanceTo(end3d) < 1e-6) continue;

        const geom = new LineGeometry();
        geom.setPositions([
          start3d.x,
          start3d.y,
          start3d.z,
          end3d.x,
          end3d.y,
          end3d.z,
        ]);
        const mat = new LineMaterial({
          color: REVOLVE.sketchLineAxis,
          linewidth: FILLET.edgeWidth,
          depthTest: false,
          resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
        });
        const line = new Line2(geom, mat);
        line.computeLineDistances();
        line.renderOrder = 999;
        line.userData.sketchLineStart = start3d;
        line.userData.sketchLineEnd = end3d;
        line.userData.axisSourceType = "sketchLine";
        group.add(line);
      }
    }

    if (group.children.length > 0) {
      scene.add(group);
      sketchLineOverlayRef.current = group;
      forceSceneUpdate();
    }
  }, [sketches, scene, forceSceneUpdate, sketchLineOverlayRef]);

  /** Build overlays for linear edges of other 3D bodies (Priority 3 axis source). */
  const buildOtherBodyEdgeOverlays = useCallback(
    async (selectedNodeId: string) => {
      if (!scene) return;

      const client = OccWorkerClient.getInstance();
      const group = new THREE.Group();
      group.userData.isHelper = true;

      const otherElements = elements.filter(
        (el) => el.nodeId !== selectedNodeId && !isFlatShape(el.brep),
      );

      for (const el of otherElements) {
        let result: WorkerEdgeAnalysisResult;
        try {
          result = await client.send<WorkerEdgeAnalysisResult>({
            type: "edgeAnalysis",
            payload: {
              brepJson: el.brep.toJSON(),
              position: toVec3(el.position),
              occBrep: el.occBrep,
              rotation: el.rotation ? toEulerJSON(el.rotation) : undefined,
              allEdges: true,
            },
          });
        } catch {
          continue;
        }

        const edgeDataArr = result.edges;
        if (!edgeDataArr) continue;

        for (const edge of edgeDataArr) {
          // Linear edges have exactly 2 points (6 floats)
          if (edge.segments.length !== 6) continue;

          const start = new THREE.Vector3(
            edge.segments[0],
            edge.segments[1],
            edge.segments[2],
          );
          const end = new THREE.Vector3(
            edge.segments[3],
            edge.segments[4],
            edge.segments[5],
          );

          if (start.distanceTo(end) < 1e-6) continue;

          const geom = new LineGeometry();
          geom.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
          const mat = new LineMaterial({
            color: REVOLVE.bodyEdgeAxis,
            linewidth: FILLET.edgeWidth,
            depthTest: false,
            resolution: new THREE.Vector2(
              window.innerWidth,
              window.innerHeight,
            ),
          });
          const line = new Line2(geom, mat);
          line.computeLineDistances();
          line.renderOrder = 999;
          line.userData.bodyEdgeStart = start;
          line.userData.bodyEdgeEnd = end;
          line.userData.axisSourceType = "bodyEdge";
          group.add(line);
        }
      }

      if (group.children.length > 0) {
        scene.add(group);
        bodyEdgeOverlayRef.current = group;
        forceSceneUpdate();
      }
    },
    [elements, scene, forceSceneUpdate, bodyEdgeOverlayRef],
  );

  /** Remove all axis-source overlay groups (profile edges, sketch lines, body edges). */
  const removeEdgeOverlay = useCallback(() => {
    const disposeGroup = (group: THREE.Group) => {
      group.children.forEach((child) => {
        if (child instanceof Line2) {
          child.geometry.dispose();
          (child.material as LineMaterial).dispose();
        } else if (
          child instanceof THREE.LineSegments ||
          child instanceof THREE.Line
        ) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material)
            child.material.dispose();
        }
      });
      group.parent?.remove(group);
    };
    if (edgeOverlayGroupRef.current) {
      disposeGroup(edgeOverlayGroupRef.current);
      edgeOverlayGroupRef.current = null;
    }
    if (sketchLineOverlayRef.current) {
      disposeGroup(sketchLineOverlayRef.current);
      sketchLineOverlayRef.current = null;
    }
    if (bodyEdgeOverlayRef.current) {
      disposeGroup(bodyEdgeOverlayRef.current);
      bodyEdgeOverlayRef.current = null;
    }
    edgeSegmentsRef.current = [];
    hoveredEdgeRef.current = null;
  }, [
    edgeOverlayGroupRef,
    sketchLineOverlayRef,
    bodyEdgeOverlayRef,
    edgeSegmentsRef,
    hoveredEdgeRef,
  ]);

  /** Remove the extended axis visualization line. */
  const removeAxisLine = useCallback(() => {
    if (axisLineRef.current) {
      axisLineRef.current.geometry.dispose();
      if (axisLineRef.current.material instanceof THREE.Material)
        axisLineRef.current.material.dispose();
      axisLineRef.current.parent?.remove(axisLineRef.current);
      axisLineRef.current = null;
    }
  }, [axisLineRef]);

  /** Show extended axis visualization (5-unit overshoot on both ends). */
  const showAxisLine = useCallback(
    (start: THREE.Vector3, end: THREE.Vector3) => {
      removeAxisLine();
      const dir = end.clone().sub(start).normalize();
      const extendedStart = start.clone().sub(dir.clone().multiplyScalar(5));
      const extendedEnd = end.clone().add(dir.clone().multiplyScalar(5));

      const geom = new THREE.BufferGeometry().setFromPoints([
        extendedStart,
        extendedEnd,
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: REVOLVE.axisLine,
        linewidth: 2,
        depthTest: false,
      });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 999;
      line.userData.isHelper = true;
      if (scene) scene.add(line);
      axisLineRef.current = line;
      forceSceneUpdate();
    },
    [scene, forceSceneUpdate, removeAxisLine, axisLineRef],
  );

  /** Flip the axis direction by swapping start and end points. */
  const flipAxis = useCallback(() => {
    if (
      state.phase !== "SET_ANGLE" ||
      !state.axisEdgeStart ||
      !state.axisEdgeEnd
    )
      return;

    const newStart = state.axisEdgeEnd.clone();
    const newEnd = state.axisEdgeStart.clone();

    showAxisLine(newStart, newEnd);

    setState((prev) => ({
      ...prev,
      axisEdgeStart: newStart,
      axisEdgeEnd: newEnd,
    }));
  }, [
    state.phase,
    state.axisEdgeStart,
    state.axisEdgeEnd,
    showAxisLine,
    setState,
  ]);

  /** Select a world origin axis (X / Y / Z) as the revolve axis, bypasses SELECT_AXIS. */
  const selectOriginAxis = useCallback(
    (axis: "X" | "Y" | "Z") => {
      if (state.phase !== "SELECT_AXIS") return;

      const start = new THREE.Vector3(0, 0, 0);
      const end = new THREE.Vector3(
        axis === "X" ? 1 : 0,
        axis === "Y" ? 1 : 0,
        axis === "Z" ? 1 : 0,
      );

      removeEdgeOverlay();
      showAxisLine(start, end);

      setState((prev) => ({
        ...prev,
        phase: "SET_ANGLE",
        axisEdgeStart: start,
        axisEdgeEnd: end,
        showDimensionInput: true,
        dimensionInputPosition: {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        },
      }));
    },
    [state.phase, removeEdgeOverlay, showAxisLine, setState],
  );

  /**
   * Try to pick an axis from sketch-line or body-edge overlays.
   * Returns the start/end if hit, or null. Profile edges (Priority 1) are checked
   * by the caller before this, so this only covers Priorities 2 and 3.
   */
  const pickExtraOverlayAxis = useCallback(
    (
      raycaster: THREE.Raycaster,
    ): { start: THREE.Vector3; end: THREE.Vector3 } | null => {
      // Priority 2: sketch line overlays
      if (
        sketchLineOverlayRef.current &&
        sketchLineOverlayRef.current.children.length > 0
      ) {
        const hits = raycaster.intersectObjects(
          sketchLineOverlayRef.current.children,
          false,
        );
        if (hits.length > 0) {
          const obj = hits[0]!.object;
          const start = obj.userData.sketchLineStart as THREE.Vector3;
          const end = obj.userData.sketchLineEnd as THREE.Vector3;
          if (start && end) return { start: start.clone(), end: end.clone() };
        }
      }

      // Priority 3: other body edge overlays
      if (
        bodyEdgeOverlayRef.current &&
        bodyEdgeOverlayRef.current.children.length > 0
      ) {
        const hits = raycaster.intersectObjects(
          bodyEdgeOverlayRef.current.children,
          false,
        );
        if (hits.length > 0) {
          const obj = hits[0]!.object;
          const start = obj.userData.bodyEdgeStart as THREE.Vector3;
          const end = obj.userData.bodyEdgeEnd as THREE.Vector3;
          if (start && end) return { start: start.clone(), end: end.clone() };
        }
      }

      return null;
    },
    [sketchLineOverlayRef, bodyEdgeOverlayRef],
  );

  /** Reset hover color on the secondary overlay groups (sketch + body edges). */
  const resetExtraOverlayHover = useCallback(() => {
    if (sketchLineOverlayRef.current) {
      sketchLineOverlayRef.current.children.forEach((child) => {
        if (child instanceof Line2) {
          (child.material as LineMaterial).color.set(REVOLVE.sketchLineAxis);
        }
      });
    }
    if (bodyEdgeOverlayRef.current) {
      bodyEdgeOverlayRef.current.children.forEach((child) => {
        if (child instanceof Line2) {
          (child.material as LineMaterial).color.set(REVOLVE.bodyEdgeAxis);
        }
      });
    }
  }, [sketchLineOverlayRef, bodyEdgeOverlayRef]);

  /**
   * Apply profile selection: tint the body, set phase to SELECT_AXIS, build all
   * three overlay sets. Used by both handleMouseDown and Select Other menu picks.
   */
  const selectProfileById = useCallback(
    (nodeId: string) => {
      const obj = getObject(nodeId);
      if (obj) {
        obj.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            !child.userData.isEdgeOverlay &&
            !child.userData.isHelper
          ) {
            (child.material as THREE.MeshStandardMaterial).color.set(
              SELECTION.selected,
            );
          }
        });
      }
      setState((prev) => ({
        ...prev,
        phase: "SELECT_AXIS",
        selectedElement: nodeId,
      }));
      void buildEdgeOverlay(nodeId);
      buildSketchLineOverlays();
      void buildOtherBodyEdgeOverlays(nodeId);
    },
    [
      getObject,
      buildEdgeOverlay,
      buildSketchLineOverlays,
      buildOtherBodyEdgeOverlays,
      setState,
    ],
  );

  return {
    buildEdgeOverlay,
    buildSketchLineOverlays,
    buildOtherBodyEdgeOverlays,
    removeEdgeOverlay,
    showAxisLine,
    removeAxisLine,
    flipAxis,
    selectOriginAxis,
    pickExtraOverlayAxis,
    resetExtraOverlayHover,
    selectProfileById,
  };
}

export type RevolveAxisSelection = ReturnType<typeof useRevolveAxisSelection>;
