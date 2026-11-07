import { useCallback, useRef } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import { InferencePoint, Guideline } from "../../useSketchInference";
import { INFERENCE } from "../../../theme";
import { createLine2FromPoints, SketchTo3D } from "../sketch-helpers";
import { SKETCH_PLANE_Z_LIFT_MM } from "../../../visual-constants";

interface UseSketchInferenceRenderParams {
  /**
   * Ref to the live 2D sketch -> 3D world conversion function. Held by the
   * parent because the conversion depends on the active sketch's plane.
   */
  sketchTo3DRef: React.MutableRefObject<SketchTo3D>;
}

/**
 * Renders inference snap glyphs and alignment guidelines into the scene.
 * Owns the THREE objects' lifecycle (creation + disposal); driven by the
 * `useSketchInference` hook's findInferencePoints / findGuidelines output.
 */
export function useSketchInferenceRender({
  sketchTo3DRef,
}: UseSketchInferenceRenderParams) {
  const { scene, requestRender } = useCadVisualizer();

  const inferenceObjectsRef = useRef<THREE.Object3D[]>([]);
  const guidelineObjectsRef = useRef<THREE.Object3D[]>([]);

  const cleanupInferenceObjects = useCallback(() => {
    if (scene) {
      inferenceObjectsRef.current.forEach((obj) => {
        scene.remove(obj);
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof Line2 ||
          obj instanceof THREE.Line
        ) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        } else if (obj instanceof THREE.Sprite) {
          (obj.material as THREE.SpriteMaterial).map?.dispose();
          obj.material.dispose();
        }
      });
      inferenceObjectsRef.current = [];

      guidelineObjectsRef.current.forEach((obj) => {
        scene.remove(obj);
        if (obj instanceof Line2 || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      guidelineObjectsRef.current = [];
      requestRender();
    }
  }, [scene, requestRender]);

  const renderInferencePoint = useCallback(
    (inferencePoint: InferencePoint) => {
      if (!scene) return;

      cleanupInferenceObjects();

      let geometry: THREE.BufferGeometry;
      let color: number;

      switch (inferencePoint.type) {
        case "endpoint":
          geometry = new THREE.BoxGeometry(0.09, 0.09, 0.02);
          color = INFERENCE.endpoint;
          break;
        case "midpoint": {
          const triangleShape = new THREE.Shape();
          triangleShape.moveTo(0, 0.06);
          triangleShape.lineTo(-0.05, -0.03);
          triangleShape.lineTo(0.05, -0.03);
          triangleShape.lineTo(0, 0.06);
          geometry = new THREE.ShapeGeometry(triangleShape);
          color = INFERENCE.midpoint;
          break;
        }
        case "center":
          geometry = new THREE.CircleGeometry(0.05, 16);
          color = INFERENCE.center;
          break;
        case "quadrant": {
          const diamondShape = new THREE.Shape();
          diamondShape.moveTo(0, 0.05);
          diamondShape.lineTo(-0.05, 0);
          diamondShape.lineTo(0, -0.05);
          diamondShape.lineTo(0.05, 0);
          diamondShape.lineTo(0, 0.05);
          geometry = new THREE.ShapeGeometry(diamondShape);
          color = INFERENCE.quadrant;
          break;
        }
        case "intersection":
          geometry = new THREE.BoxGeometry(0.07, 0.07, 0.02);
          color = INFERENCE.intersection;
          break;
        default:
          geometry = new THREE.CircleGeometry(0.04, 8);
          color = INFERENCE.default;
      }

      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const pos3D = sketchTo3DRef.current(
        inferencePoint.position.x,
        inferencePoint.position.y,
        0.2,
      );
      mesh.position.copy(pos3D);
      mesh.renderOrder = 1000;

      scene.add(mesh);
      inferenceObjectsRef.current.push(mesh);
      requestRender();
    },
    [scene, cleanupInferenceObjects, sketchTo3DRef, requestRender],
  );

  const renderGuidelines = useCallback(
    (currentGuidelines: Guideline[]) => {
      if (!scene) return;

      guidelineObjectsRef.current.forEach((obj) => {
        scene.remove(obj);
        if (obj instanceof Line2 || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      guidelineObjectsRef.current = [];

      for (const guideline of currentGuidelines) {
        const s3d = sketchTo3DRef.current(
          guideline.start.x,
          guideline.start.y,
          SKETCH_PLANE_Z_LIFT_MM,
        );
        const e3d = sketchTo3DRef.current(
          guideline.end.x,
          guideline.end.y,
          SKETCH_PLANE_Z_LIFT_MM,
        );
        const positions = [s3d.x, s3d.y, s3d.z, e3d.x, e3d.y, e3d.z];
        const line = createLine2FromPoints(
          positions,
          guideline.color,
          1.0,
          true,
        );
        line.material.transparent = true;
        line.material.opacity = 0.6;
        line.material.depthTest = false;
        line.renderOrder = 999;

        scene.add(line);
        guidelineObjectsRef.current.push(line);
      }
      requestRender();
    },
    [scene, sketchTo3DRef, requestRender],
  );

  return {
    cleanupInferenceObjects,
    renderInferencePoint,
    renderGuidelines,
  };
}
