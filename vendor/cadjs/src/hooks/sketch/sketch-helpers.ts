import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { SKETCH as SKETCH_THEME } from "../../theme";
import { SketchPlane } from "../../types/sketch-types";
import { SKETCH_PLANE_Z_LIFT_MM } from "../../visual-constants";
import {
  ellipseGeometry,
  ellipticalArcGeometry,
  polygonGeometry,
  slotGeometry,
} from "./sketch-geometry";

/**
 * Configuration constants for sketch mode behavior.
 * All distance values are in world units.
 */
export const SKETCH_CONFIG = {
  /** Distance in world units to snap to existing points when drawing */
  SNAP_DISTANCE: 0.3,
  /** Visual size of point primitives in world units */
  POINT_SIZE: 0.08,
  /** Maximum number of primitives that can be selected at once */
  MAX_SELECTION: 2,
  /** Distance in world units to snap to inference points (endpoints, midpoints, etc.) */
  INFERENCE_SNAP_DISTANCE: 0.4,
  /** Tolerance in radians for detecting horizontal/vertical alignment (~3.4 degrees) */
  ALIGNMENT_TOLERANCE: 0.06,
  /** Time threshold in milliseconds for detecting double-click */
  DOUBLE_CLICK_THRESHOLD: 300,
  /** Screen-space pixel radius for point selection (proximity check) */
  POINT_HIT_RADIUS_PX: 12,
  /** Extra pixels of tolerance for Line2 screen-space raycast */
  LINE_HIT_THRESHOLD: 8,
  /** Pixel threshold before a constraint glyph mousedown becomes a drag */
  GLYPH_DRAG_THRESHOLD_PX: 5,
} as const;

/** Colors for sketch visualization (hex values), Fusion 360 style */
export const COLORS = {
  /** Under-constrained geometry (needs more constraints) */
  underconstrained: SKETCH_THEME.underconstrained,
  /** Fully constrained geometry */
  constrained: SKETCH_THEME.constrained,
  /** Over-constrained geometry (conflicting constraints) */
  overconstrained: SKETCH_THEME.overconstrained,
  /** Preview while drawing */
  preview: SKETCH_THEME.preview,
  /** Point primitives (unconstrained) */
  point: SKETCH_THEME.point,
  /** Selected elements */
  selected: SKETCH_THEME.selected,
  /** Selected line primitives */
  selectedLine: SKETCH_THEME.selectedLine,
  /** Selected point primitives */
  selectedPoint: SKETCH_THEME.selectedPoint,
} as const;

/** Distance from a 2D point to a line segment (p1→p2) */
export function pointToLineDistance(
  pt: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) return Math.hypot(pt.x - p1.x, pt.y - p1.y);
  const t = Math.max(
    0,
    Math.min(1, ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / len2),
  );
  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;
  return Math.hypot(pt.x - projX, pt.y - projY);
}

/** Helper: create a Line2 with LineMaterial for consistent thin-line rendering */
export function createLine2FromPoints(
  positions: number[],
  color: number,
  linewidth: number,
  dashed: boolean = false,
): Line2 {
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color,
    linewidth,
    dashed,
    ...(dashed ? { dashSize: 0.15, gapSize: 0.1 } : {}),
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });
  if (dashed) {
    material.defines.USE_DASH = "";
  }
  const line = new Line2(geometry, material);
  line.computeLineDistances();
  return line;
}

/** Get the number of screen pixels that correspond to one sketch-space unit */
export function getPixelsPerUnit(
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
): number {
  const p1 = new THREE.Vector3(0, 0, 0).project(camera);
  const p2 = new THREE.Vector3(1, 0, 0).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return Math.abs(p2.x - p1.x) * 0.5 * rect.width;
}

/** Convert a pixel radius to sketch-space units based on current camera zoom */
export function screenPxToSketchUnits(
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  px: number,
): number {
  const pixelsPerUnit = getPixelsPerUnit(camera, renderer);
  return pixelsPerUnit > 0 ? px / pixelsPerUnit : 0.5;
}

/** Calculate adaptive segment count for circle/arc rendering based on screen size.
 *  Targets ~4 screen pixels per segment for visually smooth curves. */
export function getAdaptiveSegments(
  camera: THREE.Camera | null,
  renderer: THREE.WebGLRenderer | null,
  radius: number,
  sweepAngle: number = Math.PI * 2,
): number {
  if (!camera || !renderer) return sweepAngle >= Math.PI * 2 ? 64 : 32;
  const pixelsPerUnit = getPixelsPerUnit(camera, renderer);
  const arcLengthPx = radius * pixelsPerUnit * Math.abs(sweepAngle);
  const raw = Math.ceil(arcLengthPx / 4);
  return Math.max(8, Math.min(256, raw));
}

/** Helper: create a constraint glyph sprite at a given position */
export function createConstraintGlyph(
  text: string,
  position: THREE.Vector3,
  selected: boolean = false,
): THREE.Sprite {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fontSize = 32;
  const padding = 16;

  // Measure text width to size the canvas dynamically
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d")!;
  measureCtx.font = `bold ${fontSize}px sans-serif`;
  const textWidth = measureCtx.measureText(text).width;

  // Pill shape: width adapts to text, height stays fixed
  const height = 64;
  const width = Math.max(height, Math.ceil(textWidth + padding * 2));
  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // Dark pill/circle background (blue when selected)
  const radius = height / 2;
  ctx.beginPath();
  if (width <= height) {
    // Circle for short text
    ctx.arc(width / 2, height / 2, radius - 4, 0, Math.PI * 2);
  } else {
    // Pill shape for longer text
    const r = radius - 4;
    ctx.moveTo(r + 4, 4);
    ctx.lineTo(width - r - 4, 4);
    ctx.arc(width - r - 4, height / 2, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(r + 4, height - 4);
    ctx.arc(r + 4, height / 2, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
  }
  ctx.fillStyle = selected
    ? SKETCH_THEME.constraintFillSelectedCss
    : SKETCH_THEME.constraintFillCss;
  ctx.fill();
  if (selected) {
    ctx.strokeStyle = SKETCH_THEME.constraintStrokeSelectedCss;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.fillStyle = selected
    ? SKETCH_THEME.constraintTextSelectedCss
    : SKETCH_THEME.constraintTextCss;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  // Scale X proportionally so wider labels aren't squished
  const baseScale = 0.35;
  const aspect = width / height;
  sprite.scale.set(baseScale * aspect, baseScale, baseScale);
  sprite.renderOrder = 1001;
  return sprite;
}

/** Conversion from 2D sketch coords to 3D world coords. */
export type SketchTo3D = (
  x: number,
  y: number,
  zOffset?: number,
) => THREE.Vector3;

/** Convert a 3D world point to 2D sketch coordinates (inverse of sketchTo3D). */
export function worldToSketch2D(
  point3D: THREE.Vector3,
  plane: SketchPlane,
): THREE.Vector3 {
  const delta = point3D.clone().sub(plane.origin);
  return new THREE.Vector3(delta.dot(plane.xAxis), delta.dot(plane.yAxis), 0);
}

/** Snap a sketch-space point to the grid when grid snap is enabled. */
export function snapToGrid(
  point: THREE.Vector3,
  gridSpacing: number,
  snapEnabled: boolean,
): THREE.Vector3 {
  if (snapEnabled) {
    point.x = Math.round(point.x / gridSpacing) * gridSpacing;
    point.y = Math.round(point.y / gridSpacing) * gridSpacing;
  }
  return point;
}

/** Build a Line2 preview between two sketch-space points. */
export function createLinePreview(
  start: THREE.Vector3,
  end: THREE.Vector3,
  sketchTo3D: SketchTo3D,
): Line2 {
  const s3d = sketchTo3D(start.x, start.y, SKETCH_PLANE_Z_LIFT_MM);
  const e3d = sketchTo3D(end.x, end.y, SKETCH_PLANE_Z_LIFT_MM);
  const positions = [s3d.x, s3d.y, s3d.z, e3d.x, e3d.y, e3d.z];
  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Build a Line2 rectangle preview from two opposite corners. */
export function createRectanglePreview(
  corner1: THREE.Vector3,
  corner2: THREE.Vector3,
  sketchTo3D: SketchTo3D,
): Line2 {
  const bl = sketchTo3D(corner1.x, corner1.y, SKETCH_PLANE_Z_LIFT_MM);
  const br = sketchTo3D(corner2.x, corner1.y, SKETCH_PLANE_Z_LIFT_MM);
  const tr = sketchTo3D(corner2.x, corner2.y, SKETCH_PLANE_Z_LIFT_MM);
  const tl = sketchTo3D(corner1.x, corner2.y, SKETCH_PLANE_Z_LIFT_MM);
  const positions = [
    bl.x,
    bl.y,
    bl.z,
    br.x,
    br.y,
    br.z,
    tr.x,
    tr.y,
    tr.z,
    tl.x,
    tl.y,
    tl.z,
    bl.x,
    bl.y,
    bl.z, // close the loop
  ];
  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Build a Line2 circle preview at the given center / radius (sketch-space). */
export function createCirclePreview(
  center: THREE.Vector3,
  radius: number,
  sketchTo3D: SketchTo3D,
  camera: THREE.Camera | null,
  renderer: THREE.WebGLRenderer | null,
): Line2 {
  const segments = getAdaptiveSegments(camera, renderer, radius);
  const positions: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const sx = center.x + Math.cos(angle) * radius;
    const sy = center.y + Math.sin(angle) * radius;
    const p3d = sketchTo3D(sx, sy, SKETCH_PLANE_Z_LIFT_MM);
    positions.push(p3d.x, p3d.y, p3d.z);
  }
  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Build a closed Line2 preview of an ellipse from centre, major and minor picks. */
export function createEllipsePreview(
  center: THREE.Vector3,
  majorPoint: THREE.Vector3,
  minorPoint: THREE.Vector3,
  sketchTo3D: SketchTo3D,
  camera: THREE.Camera | null,
  renderer: THREE.WebGLRenderer | null,
): Line2 | null {
  const ellipse = ellipseGeometry(center, majorPoint, minorPoint);
  if (!ellipse) return null;

  const segments = getAdaptiveSegments(camera, renderer, ellipse.majorRadius);
  const cosR = Math.cos(ellipse.rotation);
  const sinR = Math.sin(ellipse.rotation);
  const positions: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const sx =
      ellipse.center.x +
      ellipse.majorRadius * cosA * cosR -
      ellipse.minorRadius * sinA * sinR;
    const sy =
      ellipse.center.y +
      ellipse.majorRadius * cosA * sinR +
      ellipse.minorRadius * sinA * cosR;
    const p3d = sketchTo3D(sx, sy, SKETCH_PLANE_Z_LIFT_MM);
    positions.push(p3d.x, p3d.y, p3d.z);
  }
  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Build a Line2 preview of an elliptical arc between two picks. */
export function createEllipticalArcPreview(
  center: THREE.Vector3,
  majorPoint: THREE.Vector3,
  minorPoint: THREE.Vector3,
  startPoint: THREE.Vector3,
  endPoint: THREE.Vector3,
  sketchTo3D: SketchTo3D,
  camera: THREE.Camera | null,
  renderer: THREE.WebGLRenderer | null,
): Line2 | null {
  const arc = ellipticalArcGeometry(
    center,
    majorPoint,
    minorPoint,
    startPoint,
    endPoint,
  );
  if (!arc) return null;

  const sweep = arc.endAngle - arc.startAngle;
  const segments = getAdaptiveSegments(
    camera,
    renderer,
    arc.majorRadius,
    sweep,
  );
  const cosR = Math.cos(arc.rotation);
  const sinR = Math.sin(arc.rotation);
  const positions: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = arc.startAngle + (sweep * i) / segments;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const sx =
      arc.center.x +
      arc.majorRadius * cosA * cosR -
      arc.minorRadius * sinA * sinR;
    const sy =
      arc.center.y +
      arc.majorRadius * cosA * sinR +
      arc.minorRadius * sinA * cosR;
    const p3d = sketchTo3D(sx, sy, SKETCH_PLANE_Z_LIFT_MM);
    positions.push(p3d.x, p3d.y, p3d.z);
  }
  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Build a Catmull-Rom preview through the picked spline points. */
export function createSplinePreview(
  points: { x: number; y: number }[],
  sketchTo3D: SketchTo3D,
): Line2 | null {
  if (points.length < 2) return null;

  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p.x, p.y, 0)),
    false,
    "catmullrom",
    0.5,
  );
  const samples = curve.getPoints(
    Math.max(16, Math.min(128, points.length * 16)),
  );
  const positions: number[] = [];
  for (const sample of samples) {
    const p3d = sketchTo3D(sample.x, sample.y, SKETCH_PLANE_Z_LIFT_MM);
    positions.push(p3d.x, p3d.y, p3d.z);
  }
  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Evaluate a cubic Bezier at t (four control points). */
export function sampleCubicBezier(
  points: { x: number; y: number }[],
  t: number,
): { x: number; y: number } | null {
  if (points.length !== 4) return null;
  const [p0, p1, p2, p3] = points as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
  };
}

/** Evaluate a rational quadratic conic at t. */
export function sampleRationalConic(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  rho: number,
  t: number,
  startWeight = 1,
  endWeight = 1,
): { x: number; y: number } {
  const u = 1 - t;
  const w = Math.max(0.01, rho);
  const w0 = Math.max(0.01, startWeight);
  const w2 = Math.max(0.01, endWeight);
  const denominator = w0 * u * u + 2 * w * u * t + w2 * t * t;
  return {
    x:
      (w0 * u * u * start.x + 2 * w * u * t * control.x + w2 * t * t * end.x) /
      denominator,
    y:
      (w0 * u * u * start.y + 2 * w * u * t * control.y + w2 * t * t * end.y) /
      denominator,
  };
}

/** Build a preview for a Bezier. Pass 2-4 points; four draws the curve. */
export function createBezierPreview(
  points: { x: number; y: number }[],
  sketchTo3D: SketchTo3D,
): Line2 | null {
  if (points.length < 2) return null;
  const samples: { x: number; y: number }[] = [];
  if (points.length === 4) {
    for (let i = 0; i <= 64; i++) {
      const p = sampleCubicBezier(points, i / 64);
      if (p) samples.push(p);
    }
  } else {
    samples.push(...points);
  }
  const positions: number[] = [];
  for (const sample of samples) {
    const p3d = sketchTo3D(sample.x, sample.y, SKETCH_PLANE_Z_LIFT_MM);
    positions.push(p3d.x, p3d.y, p3d.z);
  }
  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Build a preview for a rational quadratic conic. */
export function createConicPreview(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  rho: number,
  sketchTo3D: SketchTo3D,
): Line2 {
  const positions: number[] = [];
  for (let i = 0; i <= 64; i++) {
    const sample = sampleRationalConic(start, control, end, rho, i / 64);
    const p3d = sketchTo3D(sample.x, sample.y, SKETCH_PLANE_Z_LIFT_MM);
    positions.push(p3d.x, p3d.y, p3d.z);
  }
  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Build a closed Line2 preview of a stadium slot. */
export function createSlotPreview(
  centerA: THREE.Vector3,
  centerB: THREE.Vector3,
  radius: number,
  sketchTo3D: SketchTo3D,
  camera: THREE.Camera | null,
  renderer: THREE.WebGLRenderer | null,
): Line2 | null {
  const slot = slotGeometry(centerA, centerB, radius);
  if (!slot) return null;

  const positions: number[] = [];
  const push = (p: { x: number; y: number }) => {
    const p3d = sketchTo3D(p.x, p.y, SKETCH_PLANE_Z_LIFT_MM);
    positions.push(p3d.x, p3d.y, p3d.z);
  };

  push(slot.topA);
  push(slot.topB);

  const segments = getAdaptiveSegments(camera, renderer, radius, Math.PI);
  const addCap = (center: { x: number; y: number }, startAngle: number) => {
    for (let i = 1; i <= segments; i++) {
      const angle = startAngle - (Math.PI * i) / segments;
      push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
  };

  addCap(centerB, Math.atan2(slot.topB.y - centerB.y, slot.topB.x - centerB.x));
  push(slot.bottomA);
  addCap(
    centerA,
    Math.atan2(slot.bottomA.y - centerA.y, slot.bottomA.x - centerA.x),
  );
  push(slot.topA);

  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Build a closed Line2 preview of a regular polygon. */
export function createPolygonPreview(
  center: THREE.Vector3,
  vertex: THREE.Vector3,
  sides: number,
  sketchTo3D: SketchTo3D,
): Line2 | null {
  const polygon = polygonGeometry(center, vertex, sides);
  if (!polygon) return null;

  const positions: number[] = [];
  for (const p of polygon.vertices) {
    const p3d = sketchTo3D(p.x, p.y, SKETCH_PLANE_Z_LIFT_MM);
    positions.push(p3d.x, p3d.y, p3d.z);
  }
  if (positions.length >= 3) {
    positions.push(positions[0]!, positions[1]!, positions[2]!);
  }

  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}

/** Build a Line2 arc preview going CCW from start through end around center. */
export function createArcPreview(
  center: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
  sketchTo3D: SketchTo3D,
  camera: THREE.Camera | null,
  renderer: THREE.WebGLRenderer | null,
): Line2 {
  const radius = center.distanceTo(start);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);

  const angleDiff = endAngle - startAngle;
  const normalizedDiff = angleDiff > 0 ? angleDiff : angleDiff + Math.PI * 2;
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
    const sx = center.x + Math.cos(currentAngle) * radius;
    const sy = center.y + Math.sin(currentAngle) * radius;
    const p3d = sketchTo3D(sx, sy, SKETCH_PLANE_Z_LIFT_MM);
    positions.push(p3d.x, p3d.y, p3d.z);
  }

  return createLine2FromPoints(positions, COLORS.preview, 1.5);
}
