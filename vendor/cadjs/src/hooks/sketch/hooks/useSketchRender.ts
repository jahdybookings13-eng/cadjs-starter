import { useEffect } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  isSketchEllipse,
  isSketchEllipticalArc,
  isSketchSpline,
  isSketchBezier,
  isSketchConic,
  isSketchHatch,
  isConstructionPrimitive,
  isDimensionalConstraint,
  findSketchPoint,
  type Sketch,
  type SketchHatch,
  type SketchLayer,
  type SketchLine,
} from "../../../types/sketch-types";
import { SKETCH as SKETCH_THEME } from "../../../theme";
import {
  COLORS,
  SketchTo3D,
  createLine2FromPoints,
  createConstraintGlyph,
  getAdaptiveSegments,
  sampleCubicBezier,
  sampleRationalConic,
} from "../sketch-helpers";
import { SketchSubMode } from "../types";
import {
  SKETCH_LABEL_OFFSET_VISIBLE_TOL,
  SKETCH_ZERO_LENGTH_TOL,
} from "../../../sketch-tolerances";
import { SKETCH_PLANE_Z_LIFT_MM } from "../../../visual-constants";

function hatchLoopPoints(
  sketch: Sketch,
  hatch: SketchHatch,
): Array<{ x: number; y: number }> | null {
  const lines = hatch.boundaryIds
    .map((id) => sketch.primitives.find((p) => p.id === id))
    .filter((p): p is SketchLine => !!p && p.type === "line");
  if (lines.length < 3) return null;

  const byPoint = new Map<string, string[]>();
  let startPoint: string | null = null;
  for (const line of lines) {
    if (!startPoint) startPoint = line.p1Id;
    for (const pointId of [line.p1Id, line.p2Id]) {
      const list = byPoint.get(pointId) ?? [];
      list.push(line.id);
      byPoint.set(pointId, list);
    }
  }
  if (!startPoint) return null;

  const used = new Set<string>();
  const ids: string[] = [startPoint];
  let current = startPoint;
  let guard = 0;
  while (guard++ <= lines.length) {
    const nextId = (byPoint.get(current) ?? []).find((id) => !used.has(id));
    if (!nextId) break;
    const line = lines.find((entry) => entry.id === nextId);
    if (!line) break;
    used.add(nextId);
    current = line.p1Id === current ? line.p2Id : line.p1Id;
    if (current === startPoint) break;
    ids.push(current);
  }
  if (used.size !== lines.length) return null;

  const points = ids
    .map((id) => findSketchPoint(sketch.primitives, id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ x: p.x, y: p.y }));
  return points.length >= 3 ? points : null;
}

function hatchSegments(
  points: Array<{ x: number; y: number }>,
  spacing: number,
  angle: number,
): Array<[number, number, number, number]> {
  const step = Math.max(0.05, spacing);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rotated = points.map((p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));
  const minY = Math.min(...rotated.map((p) => p.y));
  const maxY = Math.max(...rotated.map((p) => p.y));
  const out: Array<[number, number, number, number]> = [];
  const backCos = Math.cos(angle);
  const backSin = Math.sin(angle);

  for (let y = minY + step / 2; y < maxY; y += step) {
    const xs: number[] = [];
    for (let i = 0; i < rotated.length; i++) {
      const a = rotated[i]!;
      const b = rotated[(i + 1) % rotated.length]!;
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x1 = xs[i]!;
      const x2 = xs[i + 1]!;
      out.push([
        x1 * backCos - y * backSin,
        x1 * backSin + y * backCos,
        x2 * backCos - y * backSin,
        x2 * backSin + y * backCos,
      ]);
    }
  }
  return out;
}

interface UseSketchRenderParams {
  /** Parent's THREE.Object3D array, mutated by this effect, read by selection picking. */
  sketchObjectsRef: React.MutableRefObject<THREE.Object3D[]>;
  /** Parent's 2D->3D projection function ref, set by this effect, read by drawing/inference/selection. */
  sketchTo3DRef: React.MutableRefObject<SketchTo3D>;
  /** From selection sub-hook, drives highlight color. */
  selectedPrimitives: string[];
  /** Parent state, drives e.g. trim-mode point dimming. */
  sketchSubMode: SketchSubMode;
  /** Parent state, drives constraint glyph highlight. */
  selectedConstraintId: string | null;
}

/**
 * Sketch primitive render effect, rebuilds Three.js sketch objects whenever
 * the sketch state changes. Owns the visible sketch: points, lines, circles,
 * arcs, constraint glyphs, dimension lines, leader lines, and closed-profile
 * fill geometry.
 *
 * Sets `sketchTo3DRef.current` on every run so drawing handlers and inference
 * render can project sketch-2D coords to 3D world coords on the active plane.
 *
 * Stores all created objects in `sketchObjectsRef.current` for picking and
 * cleanup; the array is mutated by selection's glyph drag commit too.
 */
export function useSketchRender({
  sketchObjectsRef,
  sketchTo3DRef,
  selectedPrimitives,
  sketchSubMode,
  selectedConstraintId,
}: UseSketchRenderParams): void {
  const { activeSketch } = useCadCore();
  const { scene, camera, renderer, sceneReady, requestRender } =
    useCadVisualizer();

  useEffect(() => {
    const cleanupObjects = () => {
      sketchObjectsRef.current.forEach((obj) => {
        scene?.remove(obj);
        try {
          if (
            obj instanceof Line2 ||
            obj instanceof THREE.Line ||
            obj instanceof THREE.Mesh
          ) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          } else if (obj instanceof THREE.Sprite) {
            (obj.material as THREE.SpriteMaterial).map?.dispose();
            obj.material.dispose();
          }
        } catch {
          /* already disposed by drag handler */
        }
      });
      sketchObjectsRef.current = [];
      requestRender();
    };

    if (!scene || !sceneReady || !activeSketch) {
      cleanupObjects();
      return;
    }

    cleanupObjects();

    const newObjects: THREE.Object3D[] = [];

    for (const underlay of activeSketch.imageUnderlays ?? []) {
      const texture = new THREE.TextureLoader().load(underlay.dataUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      const geometry = new THREE.PlaneGeometry(underlay.width, underlay.height);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: Math.max(0, Math.min(1, underlay.opacity ?? 0.55)),
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position
        .copy(activeSketch.plane.origin)
        .addScaledVector(activeSketch.plane.xAxis, underlay.x)
        .addScaledVector(activeSketch.plane.yAxis, underlay.y)
        .addScaledVector(activeSketch.plane.normal, -SKETCH_PLANE_Z_LIFT_MM);
      mesh.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          activeSketch.plane.xAxis,
          activeSketch.plane.yAxis,
          activeSketch.plane.normal,
        ),
      );
      if (underlay.rotation) {
        mesh.quaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            underlay.rotation,
          ),
        );
      }
      mesh.renderOrder = -1;
      scene.add(mesh);
      newObjects.push(mesh);
    }

    const layers = activeSketch.layers ?? [];
    const layerFor = (primitiveId: string): SketchLayer | undefined => {
      const prim = activeSketch.primitives.find((p) => p.id === primitiveId);
      return prim?.layerId
        ? layers.find((layer) => layer.id === prim.layerId)
        : layers[0];
    };

    const getColor = (primitiveId: string) => {
      const prim = activeSketch.primitives.find((p) => p.id === primitiveId);
      const construction = isConstructionPrimitive(prim);

      if (selectedPrimitives.includes(primitiveId)) {
        return construction
          ? SKETCH_THEME.constructionSelected
          : COLORS.selected;
      }
      if (construction) {
        return SKETCH_THEME.construction;
      }
      const layerColor = layerFor(primitiveId)?.color;
      if (layerColor) return new THREE.Color(layerColor).getHex();
      return activeSketch.status === "fully_constrained"
        ? COLORS.constrained
        : activeSketch.status === "overconstrained"
          ? COLORS.overconstrained
          : COLORS.underconstrained;
    };

    const isConstruction = (primitiveId: string): boolean =>
      isConstructionPrimitive(
        activeSketch.primitives.find((p) => p.id === primitiveId),
      );

    // Convert 2D sketch coordinates to 3D based on plane vectors
    const sketchTo3D = (
      x: number,
      y: number,
      zOffset: number = 0,
    ): THREE.Vector3 => {
      const plane = activeSketch.plane;
      return new THREE.Vector3()
        .copy(plane.origin)
        .addScaledVector(plane.xAxis, x)
        .addScaledVector(plane.yAxis, y)
        .addScaledVector(plane.normal, zOffset);
    };
    sketchTo3DRef.current = sketchTo3D;

    const pointMap = new Map<string, { x: number; y: number }>();

    // Visual extent for origin axis lines (large so they look infinite regardless of zoom).
    const AXIS_VIS_LEN = 10000;

    // Render each primitive
    for (const primitive of activeSketch.primitives) {
      const isSelected = selectedPrimitives.includes(primitive.id);
      const layer = layerFor(primitive.id);
      if (layer && !layer.visible) continue;
      const color = getColor(primitive.id);
      const constructionFlag = isConstruction(primitive.id);
      const styleDashed =
        constructionFlag || (!!layer && layer.linetype !== "continuous");
      const isOrigin = !!(primitive as { origin?: boolean }).origin;

      if (isSketchPoint(primitive)) {
        pointMap.set(primitive.id, { x: primitive.x, y: primitive.y });

        // Axis endpoint points (origin-flagged, but not at the origin itself) are invisible,
        // they exist only to define the axis line direction for the solver.
        if (isOrigin && (primitive.x !== 0 || primitive.y !== 0)) {
          continue;
        }

        // Render point as small flat circle (Fusion 360 style)
        // Dim points during trim mode so they don't obscure edges
        const isTrimMode = sketchSubMode === "trim";
        const size = isTrimMode ? 0.04 : isSelected ? 0.1 : 0.07;
        const geometry = new THREE.CircleGeometry(size, 16);
        const pointColor = isSelected
          ? COLORS.selectedPoint
          : isOrigin
            ? SKETCH_THEME.originPoint
            : primitive.fixed
              ? SKETCH_THEME.fixed
              : COLORS.point;
        const material = new THREE.MeshBasicMaterial({
          color: pointColor,
          depthTest: false,
          ...(isTrimMode ? { transparent: true, opacity: 0.25 } : {}),
        });
        const mesh = new THREE.Mesh(geometry, material);
        const pos = sketchTo3D(primitive.x, primitive.y, 0.1);
        mesh.position.copy(pos);
        mesh.renderOrder = 999;
        mesh.userData = {
          primitiveId: primitive.id,
          type: "point",
          isSketchPrimitive: true,
        };
        scene.add(mesh);
        newObjects.push(mesh);
      } else if (isSketchLine(primitive)) {
        const p1Prim = findSketchPoint(activeSketch.primitives, primitive.p1Id);
        const p2Prim = findSketchPoint(activeSketch.primitives, primitive.p2Id);

        if (!p1Prim || !p2Prim) {
          console.warn(
            "Could not find points for line:",
            primitive.p1Id,
            primitive.p2Id,
          );
          continue;
        }

        let start3D: THREE.Vector3;
        let end3D: THREE.Vector3;
        let lineColor: number;
        let lineWidth: number;
        let dashed: boolean;

        if (isOrigin) {
          // Render origin axis lines visually extended through the origin, with distinct colors.
          const dx = p2Prim.x - p1Prim.x;
          const dy = p2Prim.y - p1Prim.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          start3D = sketchTo3D(-ux * AXIS_VIS_LEN, -uy * AXIS_VIS_LEN, 0.02);
          end3D = sketchTo3D(ux * AXIS_VIS_LEN, uy * AXIS_VIS_LEN, 0.02);
          const isXAxis = Math.abs(uy) < Math.abs(ux);
          lineColor = isSelected
            ? COLORS.selectedLine
            : isXAxis
              ? SKETCH_THEME.xAxisLine
              : SKETCH_THEME.yAxisLine;
          lineWidth = isSelected ? 2.5 : 1.2;
          dashed = false;
        } else {
          start3D = sketchTo3D(p1Prim.x, p1Prim.y, 0.05);
          end3D = sketchTo3D(p2Prim.x, p2Prim.y, 0.05);
          lineColor = isSelected ? COLORS.selectedLine : color;
          lineWidth = isSelected ? 3.0 : 1.5;
          dashed = styleDashed;
        }

        const positions = [
          start3D.x,
          start3D.y,
          start3D.z,
          end3D.x,
          end3D.y,
          end3D.z,
        ];
        const line = createLine2FromPoints(
          positions,
          lineColor,
          lineWidth,
          dashed,
        );
        line.renderOrder = isOrigin ? 998 : 999;
        line.userData = {
          primitiveId: primitive.id,
          type: "line",
          isSketchPrimitive: true,
        };
        scene.add(line);
        newObjects.push(line);
      } else if (isSketchCircle(primitive)) {
        const centerPt = findSketchPoint(
          activeSketch.primitives,
          primitive.centerId,
        );
        if (centerPt) {
          const segments = getAdaptiveSegments(
            camera,
            renderer,
            primitive.radius,
          );
          const positions: number[] = [];
          for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const localX = centerPt.x + Math.cos(angle) * primitive.radius;
            const localY = centerPt.y + Math.sin(angle) * primitive.radius;
            const pt = sketchTo3D(localX, localY, SKETCH_PLANE_Z_LIFT_MM);
            positions.push(pt.x, pt.y, pt.z);
          }
          const lineWidth = isSelected ? 3.0 : 1.5;
          const line = createLine2FromPoints(
            positions,
            color,
            lineWidth,
            styleDashed,
          );
          line.renderOrder = 999;
          line.userData = {
            primitiveId: primitive.id,
            type: "circle",
            isSketchPrimitive: true,
          };
          scene.add(line);
          newObjects.push(line);
        } else {
          console.warn("Could not find center for circle:", primitive.centerId);
        }
      } else if (isSketchEllipse(primitive)) {
        const centerPt = findSketchPoint(
          activeSketch.primitives,
          primitive.centerId,
        );
        if (centerPt) {
          const segments = getAdaptiveSegments(
            camera,
            renderer,
            primitive.majorRadius,
          );
          const cosR = Math.cos(primitive.rotation);
          const sinR = Math.sin(primitive.rotation);
          const positions: number[] = [];
          for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const localX =
              centerPt.x +
              primitive.majorRadius * cosA * cosR -
              primitive.minorRadius * sinA * sinR;
            const localY =
              centerPt.y +
              primitive.majorRadius * cosA * sinR +
              primitive.minorRadius * sinA * cosR;
            const pt = sketchTo3D(localX, localY, SKETCH_PLANE_Z_LIFT_MM);
            positions.push(pt.x, pt.y, pt.z);
          }
          const lineWidth = isSelected ? 3.0 : 1.5;
          const line = createLine2FromPoints(
            positions,
            color,
            lineWidth,
            styleDashed,
          );
          line.renderOrder = 999;
          line.userData = {
            primitiveId: primitive.id,
            type: "ellipse",
            isSketchPrimitive: true,
          };
          scene.add(line);
          newObjects.push(line);
        } else {
          console.warn(
            "Could not find center for ellipse:",
            primitive.centerId,
          );
        }
      } else if (isSketchEllipticalArc(primitive)) {
        const centerPt = findSketchPoint(
          activeSketch.primitives,
          primitive.centerId,
        );
        if (centerPt) {
          const sweep = primitive.endAngle - primitive.startAngle;
          const segments = getAdaptiveSegments(
            camera,
            renderer,
            primitive.majorRadius,
            sweep,
          );
          const cosR = Math.cos(primitive.rotation);
          const sinR = Math.sin(primitive.rotation);
          const positions: number[] = [];
          for (let i = 0; i <= segments; i++) {
            const angle = primitive.startAngle + (sweep * i) / segments;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const localX =
              centerPt.x +
              primitive.majorRadius * cosA * cosR -
              primitive.minorRadius * sinA * sinR;
            const localY =
              centerPt.y +
              primitive.majorRadius * cosA * sinR +
              primitive.minorRadius * sinA * cosR;
            const pt = sketchTo3D(localX, localY, SKETCH_PLANE_Z_LIFT_MM);
            positions.push(pt.x, pt.y, pt.z);
          }
          const lineWidth = isSelected ? 3.0 : 1.5;
          const line = createLine2FromPoints(
            positions,
            color,
            lineWidth,
            styleDashed,
          );
          line.renderOrder = 999;
          line.userData = {
            primitiveId: primitive.id,
            type: "ellipticalArc",
            isSketchPrimitive: true,
          };
          scene.add(line);
          newObjects.push(line);
        }
      } else if (isSketchSpline(primitive)) {
        const splinePoints = primitive.pointIds
          .map((id) => findSketchPoint(activeSketch.primitives, id))
          .filter((p): p is NonNullable<typeof p> => p !== undefined);
        if (splinePoints.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(
            splinePoints.map((p) => new THREE.Vector3(p.x, p.y, 0)),
            false,
            "catmullrom",
            0.5,
          );
          const startT = Math.max(0, Math.min(1, primitive.startT ?? 0));
          const endT = Math.max(startT, Math.min(1, primitive.endT ?? 1));
          const steps = Math.max(16, Math.min(128, splinePoints.length * 16));
          const positions: number[] = [];
          for (let i = 0; i <= steps; i++) {
            const sample = curve.getPoint(
              startT + (endT - startT) * (i / steps),
            );
            const pt = sketchTo3D(sample.x, sample.y, SKETCH_PLANE_Z_LIFT_MM);
            positions.push(pt.x, pt.y, pt.z);
          }
          const line = createLine2FromPoints(
            positions,
            color,
            isSelected ? 3.0 : 1.5,
            styleDashed,
          );
          line.renderOrder = 999;
          line.userData = {
            primitiveId: primitive.id,
            type: "spline",
            isSketchPrimitive: true,
          };
          scene.add(line);
          newObjects.push(line);
        }
      } else if (isSketchBezier(primitive)) {
        const controlPoints = primitive.pointIds
          .map((id) => findSketchPoint(activeSketch.primitives, id))
          .filter((p): p is NonNullable<typeof p> => p !== undefined);
        if (controlPoints.length === 4) {
          const positions: number[] = [];
          for (let i = 0; i <= 64; i++) {
            const sample = sampleCubicBezier(controlPoints, i / 64);
            if (!sample) continue;
            const pt = sketchTo3D(sample.x, sample.y, SKETCH_PLANE_Z_LIFT_MM);
            positions.push(pt.x, pt.y, pt.z);
          }
          const line = createLine2FromPoints(
            positions,
            color,
            isSelected ? 3.0 : 1.5,
            styleDashed,
          );
          line.renderOrder = 999;
          line.userData = {
            primitiveId: primitive.id,
            type: "bezier",
            isSketchPrimitive: true,
          };
          scene.add(line);
          newObjects.push(line);
        }
      } else if (isSketchConic(primitive)) {
        const start = findSketchPoint(
          activeSketch.primitives,
          primitive.startId,
        );
        const control = findSketchPoint(
          activeSketch.primitives,
          primitive.controlId,
        );
        const end = findSketchPoint(activeSketch.primitives, primitive.endId);
        if (start && control && end) {
          const positions: number[] = [];
          for (let i = 0; i <= 64; i++) {
            const sample = sampleRationalConic(
              start,
              control,
              end,
              primitive.rho,
              i / 64,
              primitive.startWeight ?? 1,
              primitive.endWeight ?? 1,
            );
            const pt = sketchTo3D(sample.x, sample.y, SKETCH_PLANE_Z_LIFT_MM);
            positions.push(pt.x, pt.y, pt.z);
          }
          const line = createLine2FromPoints(
            positions,
            color,
            isSelected ? 3.0 : 1.5,
            styleDashed,
          );
          line.renderOrder = 999;
          line.userData = {
            primitiveId: primitive.id,
            type: "conic",
            isSketchPrimitive: true,
          };
          scene.add(line);
          newObjects.push(line);
        }
      } else if (isSketchHatch(primitive)) {
        const hatchPoints = hatchLoopPoints(activeSketch, primitive);
        if (hatchPoints) {
          const hatchLayer = primitive.layerId
            ? layers.find((entry) => entry.id === primitive.layerId)
            : layer;
          const hatchColor = new THREE.Color(hatchLayer?.color ?? "#94a3b8");
          const shape = new THREE.Shape(
            hatchPoints.map((p) => new THREE.Vector2(p.x, p.y)),
          );
          const fill = new THREE.Mesh(
            new THREE.ShapeGeometry(shape),
            new THREE.MeshBasicMaterial({
              color: hatchColor,
              transparent: true,
              opacity: primitive.pattern === "solid" ? 0.24 : 0.1,
              depthTest: false,
              side: THREE.DoubleSide,
            }),
          );
          fill.quaternion.setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(
              activeSketch.plane.xAxis,
              activeSketch.plane.yAxis,
              activeSketch.plane.normal,
            ),
          );
          fill.position.copy(activeSketch.plane.origin);
          fill.renderOrder = 996;
          fill.userData = {
            primitiveId: primitive.id,
            type: "hatch",
            isSketchPrimitive: true,
          };
          scene.add(fill);
          newObjects.push(fill);

          if (primitive.pattern !== "solid") {
            const segments = hatchSegments(
              hatchPoints,
              primitive.spacing,
              primitive.angle,
            );
            for (const [x1, y1, x2, y2] of segments) {
              const a = sketchTo3D(x1, y1, 0.04);
              const b = sketchTo3D(x2, y2, 0.04);
              const line = createLine2FromPoints(
                [a.x, a.y, a.z, b.x, b.y, b.z],
                isSelected ? COLORS.selectedLine : hatchColor.getHex(),
                1.0,
              );
              line.renderOrder = 997;
              line.userData = {
                primitiveId: primitive.id,
                type: "hatch",
                isSketchPrimitive: true,
              };
              scene.add(line);
              newObjects.push(line);
            }
            if (primitive.pattern === "cross") {
              const crossSegments = hatchSegments(
                hatchPoints,
                primitive.spacing,
                primitive.angle + Math.PI / 2,
              );
              for (const [x1, y1, x2, y2] of crossSegments) {
                const a = sketchTo3D(x1, y1, 0.04);
                const b = sketchTo3D(x2, y2, 0.04);
                const line = createLine2FromPoints(
                  [a.x, a.y, a.z, b.x, b.y, b.z],
                  isSelected ? COLORS.selectedLine : hatchColor.getHex(),
                  1.0,
                );
                line.renderOrder = 997;
                line.userData = {
                  primitiveId: primitive.id,
                  type: "hatch",
                  isSketchPrimitive: true,
                };
                scene.add(line);
                newObjects.push(line);
              }
            }
          }
        }
      } else if (isSketchArc(primitive)) {
        const centerPrim2D = findSketchPoint(
          activeSketch.primitives,
          primitive.centerId,
        );
        const startPrim2D = findSketchPoint(
          activeSketch.primitives,
          primitive.startId,
        );
        const endPrim2D = findSketchPoint(
          activeSketch.primitives,
          primitive.endId,
        );
        if (centerPrim2D && startPrim2D && endPrim2D) {
          const radius = primitive.radius;
          const startAngle = Math.atan2(
            startPrim2D.y - centerPrim2D.y,
            startPrim2D.x - centerPrim2D.x,
          );
          const endAngle = Math.atan2(
            endPrim2D.y - centerPrim2D.y,
            endPrim2D.x - centerPrim2D.x,
          );
          const angleDiff = endAngle - startAngle;
          const normalizedDiff =
            angleDiff > 0 ? angleDiff : angleDiff + Math.PI * 2;

          const segments = getAdaptiveSegments(
            camera,
            renderer,
            radius,
            normalizedDiff,
          );
          const positions: number[] = [];
          for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const currentAngle = startAngle + normalizedDiff * t;
            const localX = centerPrim2D.x + Math.cos(currentAngle) * radius;
            const localY = centerPrim2D.y + Math.sin(currentAngle) * radius;
            const pt = sketchTo3D(localX, localY, 0.05);
            positions.push(pt.x, pt.y, pt.z);
          }
          const lineWidth = isSelected ? 3.0 : 1.5;
          const line = createLine2FromPoints(
            positions,
            color,
            lineWidth,
            styleDashed,
          );
          line.userData = {
            primitiveId: primitive.id,
            type: "arc",
            isSketchPrimitive: true,
          };
          scene.add(line);
          newObjects.push(line);
        }
      }
    }

    const constraintGlyphMap: Record<string, string> = {
      horizontal: "H",
      vertical: "V",
      perpendicular: "⟂",
      parallel: "//",
      equal: "=",
      tangent: "T",
      coincident: "●",
      concentric: "◎",
      pointOnLine: "●",
      pointOnCircle: "●",
      midpoint: "M",
      symmetric: "⇔",
      distance: "D",
      distanceX: "Dx",
      distanceY: "Dy",
      angle: "∠",
      radius: "R",
      diameter: "⌀",
    };

    // Track glyph offset per primitive to stagger overlapping glyphs
    const glyphCountPerPrimitive = new Map<string, number>();

    for (const constraint of activeSketch.constraints) {
      // Skip glyph for constraints that already have a Tier 6A dimension display
      if (isDimensionalConstraint(constraint)) {
        const firstPrim = constraint.primitiveIds[0]
          ? activeSketch.primitives.find(
              (p) => p.id === constraint.primitiveIds[0],
            )
          : null;
        const hasDimensionDisplay =
          (constraint.type === "distance" &&
            firstPrim &&
            isSketchLine(firstPrim)) ||
          constraint.type === "radius" ||
          constraint.type === "diameter";
        if (hasDimensionDisplay) continue;
      }

      const glyphText = constraintGlyphMap[constraint.type] || "?";
      const firstPrimId = constraint.primitiveIds[0];
      if (!firstPrimId) continue;

      const prim = activeSketch.primitives.find((p) => p.id === firstPrimId);
      if (!prim) continue;

      let geometryAnchor2D: { x: number; y: number } | null = null;
      let perpOffset2D = { x: 0, y: 0 };

      if (isSketchLine(prim)) {
        const pt1 = pointMap.get(prim.p1Id);
        const pt2 = pointMap.get(prim.p2Id);
        if (pt1 && pt2) {
          const midX = (pt1.x + pt2.x) / 2;
          const midY = (pt1.y + pt2.y) / 2;
          geometryAnchor2D = { x: midX, y: midY };
          const dx = pt2.x - pt1.x;
          const dy = pt2.y - pt1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            perpOffset2D = { x: (-dy / len) * 0.25, y: (dx / len) * 0.25 };
          }
        }
      } else if (isSketchCircle(prim)) {
        const cp = pointMap.get(prim.centerId);
        if (cp) {
          geometryAnchor2D = { x: cp.x, y: cp.y };
          perpOffset2D = { x: prim.radius * 0.7, y: prim.radius * 0.7 };
        }
      } else if (isSketchPoint(prim)) {
        geometryAnchor2D = { x: prim.x, y: prim.y };
        perpOffset2D = { x: 0.2, y: 0.2 };
      }

      if (geometryAnchor2D) {
        const count = glyphCountPerPrimitive.get(firstPrimId) || 0;
        glyphCountPerPrimitive.set(firstPrimId, count + 1);
        const defaultLabelX = geometryAnchor2D.x + perpOffset2D.x;
        const defaultLabelY =
          geometryAnchor2D.y + perpOffset2D.y + count * 0.35;
        const defaultLabel2D = { x: defaultLabelX, y: defaultLabelY };

        const labelOff = constraint.labelOffset;
        const finalX = defaultLabel2D.x + (labelOff?.x || 0);
        const finalY = defaultLabel2D.y + (labelOff?.y || 0);
        const glyphPos = sketchTo3D(finalX, finalY, 0.15);

        const isSelected = constraint.id === selectedConstraintId;
        const sprite = createConstraintGlyph(glyphText, glyphPos, isSelected);
        sprite.userData.constraintId = constraint.id;
        sprite.userData.isConstraintGlyph = true;
        sprite.userData.anchor2D = defaultLabel2D;
        sprite.userData.geometryAnchor2D = geometryAnchor2D;
        scene.add(sprite);
        newObjects.push(sprite);

        // Draw leader line from geometry to label if label is offset
        if (
          labelOff &&
          (Math.abs(labelOff.x) > SKETCH_LABEL_OFFSET_VISIBLE_TOL ||
            Math.abs(labelOff.y) > SKETCH_LABEL_OFFSET_VISIBLE_TOL)
        ) {
          const geoPos = sketchTo3D(
            geometryAnchor2D.x,
            geometryAnchor2D.y,
            0.15,
          );
          const leaderLine = createLine2FromPoints(
            [geoPos.x, geoPos.y, geoPos.z, glyphPos.x, glyphPos.y, glyphPos.z],
            SKETCH_THEME.constraintGlyph,
            0.5,
          );
          leaderLine.renderOrder = 999;
          scene.add(leaderLine);
          newObjects.push(leaderLine);
        }
      }
    }

    for (const constraint of activeSketch.constraints) {
      if (!isDimensionalConstraint(constraint)) continue;

      const firstPrimId = constraint.primitiveIds[0];
      const prim = activeSketch.primitives.find((p) => p.id === firstPrimId);
      if (!prim) continue;

      if (constraint.type === "distance" && isSketchLine(prim)) {
        // Line distance: show extension lines + dimension line with value
        const pt1 = pointMap.get(prim.p1Id);
        const pt2 = pointMap.get(prim.p2Id);
        if (!pt1 || !pt2) continue;

        const dx = pt2.x - pt1.x;
        const dy = pt2.y - pt1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < SKETCH_ZERO_LENGTH_TOL) continue;

        const perpX = -dy / len;
        const perpY = dx / len;
        const offset = 0.5;

        const ext1Start = sketchTo3D(pt1.x, pt1.y, 0.12);
        const ext1End = sketchTo3D(
          pt1.x + perpX * offset,
          pt1.y + perpY * offset,
          0.12,
        );
        const ext2Start = sketchTo3D(pt2.x, pt2.y, 0.12);
        const ext2End = sketchTo3D(
          pt2.x + perpX * offset,
          pt2.y + perpY * offset,
          0.12,
        );

        const dimColor = SKETCH_THEME.constraintGlyph;
        const ext1 = createLine2FromPoints(
          [
            ext1Start.x,
            ext1Start.y,
            ext1Start.z,
            ext1End.x,
            ext1End.y,
            ext1End.z,
          ],
          dimColor,
          0.8,
        );
        ext1.renderOrder = 1000;
        scene.add(ext1);
        newObjects.push(ext1);

        const ext2 = createLine2FromPoints(
          [
            ext2Start.x,
            ext2Start.y,
            ext2Start.z,
            ext2End.x,
            ext2End.y,
            ext2End.z,
          ],
          dimColor,
          0.8,
        );
        ext2.renderOrder = 1000;
        scene.add(ext2);
        newObjects.push(ext2);

        const dimLine = createLine2FromPoints(
          [ext1End.x, ext1End.y, ext1End.z, ext2End.x, ext2End.y, ext2End.z],
          dimColor,
          1.0,
        );
        dimLine.renderOrder = 1000;
        scene.add(dimLine);
        newObjects.push(dimLine);

        const arrowSize = 0.12;
        const dirX = dx / len;
        const dirY = dy / len;
        for (const [base, sign] of [
          [ext1End, 1],
          [ext2End, -1],
        ] as [THREE.Vector3, number][]) {
          const tipX = base.x + sign * dirX * arrowSize;
          const tipY = base.y + sign * dirY * arrowSize;
          const wing1X = base.x - sign * dirX * 0.02 + perpX * arrowSize * 0.3;
          const wing1Y = base.y - sign * dirY * 0.02 + perpY * arrowSize * 0.3;
          const wing2X = base.x - sign * dirX * 0.02 - perpX * arrowSize * 0.3;
          const wing2Y = base.y - sign * dirY * 0.02 - perpY * arrowSize * 0.3;

          const arrowShape = new THREE.Shape();
          arrowShape.moveTo(tipX, tipY);
          arrowShape.lineTo(wing1X, wing1Y);
          arrowShape.lineTo(wing2X, wing2Y);
          arrowShape.closePath();
          const arrowGeo = new THREE.ShapeGeometry(arrowShape);
          const arrowMat = new THREE.MeshBasicMaterial({
            color: dimColor,
            depthTest: false,
          });
          const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
          arrowMesh.renderOrder = 1001;
          scene.add(arrowMesh);
          newObjects.push(arrowMesh);
        }

        const dimDefaultX = (pt1.x + pt2.x) / 2 + perpX * offset;
        const dimDefaultY = (pt1.y + pt2.y) / 2 + perpY * offset + 0.2;
        const dimDefault2D = { x: dimDefaultX, y: dimDefaultY };
        const dimGeoAnchor2D = {
          x: (pt1.x + pt2.x) / 2,
          y: (pt1.y + pt2.y) / 2,
        };
        const dimLabelOff = constraint.labelOffset;
        const dimFinalX = dimDefaultX + (dimLabelOff?.x || 0);
        const dimFinalY = dimDefaultY + (dimLabelOff?.y || 0);
        const dimLabelPos = sketchTo3D(dimFinalX, dimFinalY, 0.15);
        const valueText = constraint.value.toFixed(2);
        const isDimSelected = constraint.id === selectedConstraintId;
        const valueSprite = createConstraintGlyph(
          valueText,
          dimLabelPos,
          isDimSelected,
        );
        valueSprite.userData.constraintId = constraint.id;
        valueSprite.userData.isConstraintGlyph = true;
        valueSprite.userData.anchor2D = dimDefault2D;
        valueSprite.userData.geometryAnchor2D = dimGeoAnchor2D;
        valueSprite.scale.set(0.4, 0.4, 0.4);
        scene.add(valueSprite);
        newObjects.push(valueSprite);

        if (
          dimLabelOff &&
          (Math.abs(dimLabelOff.x) > SKETCH_LABEL_OFFSET_VISIBLE_TOL ||
            Math.abs(dimLabelOff.y) > SKETCH_LABEL_OFFSET_VISIBLE_TOL)
        ) {
          const geoPos = sketchTo3D(dimGeoAnchor2D.x, dimGeoAnchor2D.y, 0.15);
          const dimLeader = createLine2FromPoints(
            [
              geoPos.x,
              geoPos.y,
              geoPos.z,
              dimLabelPos.x,
              dimLabelPos.y,
              dimLabelPos.z,
            ],
            dimColor,
            0.5,
          );
          dimLeader.renderOrder = 999;
          scene.add(dimLeader);
          newObjects.push(dimLeader);
        }
      } else if (
        (constraint.type === "radius" || constraint.type === "diameter") &&
        isSketchCircle(prim)
      ) {
        // Radius/diameter: show leader line from center to edge with value
        const cp = pointMap.get(prim.centerId);
        if (!cp) continue;

        const edgeX = cp.x + prim.radius;
        const edgeY = cp.y;
        const dimColor = SKETCH_THEME.constraintGlyph;

        const leaderStart = sketchTo3D(cp.x, cp.y, 0.12);
        const leaderEnd = sketchTo3D(edgeX, edgeY, 0.12);
        const leader = createLine2FromPoints(
          [
            leaderStart.x,
            leaderStart.y,
            leaderStart.z,
            leaderEnd.x,
            leaderEnd.y,
            leaderEnd.z,
          ],
          dimColor,
          1.0,
        );
        leader.renderOrder = 1000;
        scene.add(leader);
        newObjects.push(leader);

        const radDefault2D = { x: (cp.x + edgeX) / 2, y: cp.y + 0.25 };
        const radGeoAnchor2D = { x: cp.x, y: cp.y };
        const radLabelOff = constraint.labelOffset;
        const radFinalX = radDefault2D.x + (radLabelOff?.x || 0);
        const radFinalY = radDefault2D.y + (radLabelOff?.y || 0);
        const labelPos = sketchTo3D(radFinalX, radFinalY, 0.15);
        const prefix = constraint.type === "radius" ? "R" : "⌀";
        const isRadDimSelected = constraint.id === selectedConstraintId;
        const valueSprite = createConstraintGlyph(
          `${prefix}${constraint.value.toFixed(2)}`,
          labelPos,
          isRadDimSelected,
        );
        valueSprite.userData.constraintId = constraint.id;
        valueSprite.userData.isConstraintGlyph = true;
        valueSprite.userData.anchor2D = radDefault2D;
        valueSprite.userData.geometryAnchor2D = radGeoAnchor2D;
        valueSprite.scale.set(0.4, 0.4, 0.4);
        scene.add(valueSprite);
        newObjects.push(valueSprite);

        if (
          radLabelOff &&
          (Math.abs(radLabelOff.x) > SKETCH_LABEL_OFFSET_VISIBLE_TOL ||
            Math.abs(radLabelOff.y) > SKETCH_LABEL_OFFSET_VISIBLE_TOL)
        ) {
          const geoPos = sketchTo3D(radGeoAnchor2D.x, radGeoAnchor2D.y, 0.15);
          const radLeader = createLine2FromPoints(
            [geoPos.x, geoPos.y, geoPos.z, labelPos.x, labelPos.y, labelPos.z],
            dimColor,
            0.5,
          );
          radLeader.renderOrder = 999;
          scene.add(radLeader);
          newObjects.push(radLeader);
        }
      }
    }

    // Find closed loops to render as translucent profiles
    const edges: Array<{
      p1: string;
      p2: string;
      p1Coords: { x: number; y: number };
      p2Coords: { x: number; y: number };
    }> = [];
    for (const prim of activeSketch.primitives) {
      if (isSketchLine(prim) && !prim.construction && !prim.origin) {
        const pt1 = pointMap.get(prim.p1Id);
        const pt2 = pointMap.get(prim.p2Id);
        if (pt1 && pt2) {
          edges.push({
            p1: prim.p1Id,
            p2: prim.p2Id,
            p1Coords: pt1,
            p2Coords: pt2,
          });
        }
      }
    }

    if (edges.length >= 3) {
      const adjacency = new Map<
        string,
        Array<{ to: string; coords: { x: number; y: number } }>
      >();
      for (const e of edges) {
        if (!adjacency.has(e.p1)) adjacency.set(e.p1, []);
        if (!adjacency.has(e.p2)) adjacency.set(e.p2, []);
        adjacency.get(e.p1)!.push({ to: e.p2, coords: e.p2Coords });
        adjacency.get(e.p2)!.push({ to: e.p1, coords: e.p1Coords });
      }

      const foundCycles: string[][] = [];
      const cycleSignatures = new Set<string>();

      for (const startNode of adjacency.keys()) {
        const stack: Array<{ node: string; path: string[] }> = [
          { node: startNode, path: [startNode] },
        ];
        while (stack.length > 0) {
          const { node, path } = stack.pop()!;
          if (path.length > 10) continue;

          const neighbors = adjacency.get(node) || [];
          for (const { to: neighbor } of neighbors) {
            if (neighbor === startNode && path.length >= 3) {
              const sorted = [...path].sort().join(",");
              if (!cycleSignatures.has(sorted)) {
                cycleSignatures.add(sorted);
                foundCycles.push([...path]);
              }
            } else if (!path.includes(neighbor)) {
              stack.push({ node: neighbor, path: [...path, neighbor] });
            }
          }
        }
      }

      for (const cycle of foundCycles) {
        const shapePoints: THREE.Vector2[] = [];
        for (const ptId of cycle) {
          const coords = pointMap.get(ptId);
          if (coords) {
            shapePoints.push(new THREE.Vector2(coords.x, coords.y));
          }
        }
        if (shapePoints.length >= 3) {
          let area = 0;
          for (let i = 0; i < shapePoints.length; i++) {
            const j = (i + 1) % shapePoints.length;
            area += shapePoints[i]!.x * shapePoints[j]!.y;
            area -= shapePoints[j]!.x * shapePoints[i]!.y;
          }
          area = Math.abs(area) / 2;
          if (area < SKETCH_ZERO_LENGTH_TOL) continue;

          const shape = new THREE.Shape(shapePoints);
          const shapeGeometry = new THREE.ShapeGeometry(shape);
          const shapeMaterial = new THREE.MeshBasicMaterial({
            color: SKETCH_THEME.profileFill,
            transparent: true,
            opacity: SKETCH_THEME.profileFillOpacity,
            depthTest: false,
            side: THREE.DoubleSide,
          });
          const shapeMesh = new THREE.Mesh(shapeGeometry, shapeMaterial);
          const quat = new THREE.Quaternion();
          quat.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            activeSketch.plane.normal,
          );
          shapeMesh.quaternion.copy(quat);
          shapeMesh.position.copy(activeSketch.plane.origin);
          shapeMesh.renderOrder = 997;
          scene.add(shapeMesh);
          newObjects.push(shapeMesh);
        }
      }
    }

    // Tag all sketch objects so the scene sync effect in VisualizerContext doesn't remove them
    for (const obj of newObjects) {
      obj.userData.isSketchObject = true;
    }
    sketchObjectsRef.current = newObjects;

    // On-demand renderer: must paint after each rebuild, sketch primitives aren't
    // in `elements`, so the VisualizerContext scene-sync effect doesn't fire.
    requestRender();

    // Hook unmounts when the mode-content registry swaps out SketchModeContent, the
    // activeSketch=null branch above doesn't fire on unmount, so we also tear down here.
    return cleanupObjects;
  }, [
    activeSketch,
    scene,
    sceneReady,
    selectedPrimitives,
    sketchSubMode,
    selectedConstraintId,
    camera,
    renderer,
    sketchObjectsRef,
    sketchTo3DRef,
    requestRender,
  ]);
}
