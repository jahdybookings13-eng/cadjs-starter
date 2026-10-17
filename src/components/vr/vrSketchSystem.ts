import * as THREE from "three";
import {
  createSketchPlane,
  type SketchPlane,
  type SketchPoint,
  type SketchLine,
  type SketchCircle,
  type SketchArc,
  type SketchConstraint,
} from "@vitekk02/cadjs";

export type VRSketchPhase = "idle" | "selecting-plane" | "drawing";
export type VRSketchSubMode = "line" | "rectangle" | "circle" | "arc" | "point";

export interface VRSketchState {
  phase: VRSketchPhase;
  subMode: VRSketchSubMode;
  isChaining: boolean;
  lastPointId: string | null;
  lastPointWorld: THREE.Vector3 | null;
  sketchPlane: SketchPlane | null;
  previewLine: THREE.Line | null;
  axisSnapAxis: "x" | "y" | "z" | null;
  // Rectangle state
  rectStartPos: THREE.Vector3 | null;
  isDrawingRect: boolean;
  // Circle state
  circleCenterPos: THREE.Vector3 | null;
  isDrawingCircle: boolean;
  // Arc state
  arcStep: number; // 0=idle, 1=start set, 2=end set, 3=bulge
  arcStartPos: THREE.Vector3 | null;
  arcEndPos: THREE.Vector3 | null;
  isDrawingArc: boolean;
}

export interface VRSketchSystem {
  state: VRSketchState;
  setPhase: (phase: VRSketchPhase) => void;
  setSubMode: (mode: VRSketchSubMode) => void;
  startSketchOnPlane: (planeType: string, offset?: number) => SketchPlane;
  startSketchOnDesk: () => SketchPlane;
  
  // Point/Line operations (existing)
  placePoint: (worldPos: THREE.Vector3) => { pointId: string; isExisting: boolean };
  connectLine: (p1Id: string, p2Id: string) => string;
  
  // New drawing operations
  drawRectangle: (startPos: THREE.Vector3, endPos: THREE.Vector3) => Promise<void>;
  drawCircle: (centerPos: THREE.Vector3, radiusPos: THREE.Vector3) => Promise<void>;
  drawArc: (startPos: THREE.Vector3, endPos: THREE.Vector3, bulgePos: THREE.Vector3) => Promise<void>;
  drawSinglePoint: (worldPos: THREE.Vector3) => Promise<void>;
  
  // Drawing state management
  startRectangle: (pos: THREE.Vector3) => void;
  updateRectanglePreview: (pos: THREE.Vector3) => void;
  finishRectangle: (pos: THREE.Vector3) => Promise<void>;
  
  startCircle: (pos: THREE.Vector3) => void;
  updateCirclePreview: (pos: THREE.Vector3) => void;
  finishCircle: (pos: THREE.Vector3) => Promise<void>;
  
  startArc: (pos: THREE.Vector3) => void;
  setArcEnd: (pos: THREE.Vector3) => void;
  finishArc: (pos: THREE.Vector3) => Promise<void>;
  
  finishChain: () => void;
  cancelSketch: () => void;
  updatePreview: (handWorldPos: THREE.Vector3) => void;
  clearPreview: () => void;
  setAxisSnap: (axis: "x" | "y" | "z" | null) => void;
  projectToSketchPlane: (worldPos: THREE.Vector3) => THREE.Vector3;
  worldToSketch: (worldPos: THREE.Vector3) => { x: number; y: number };
  sketchToWorld: (x: number, y: number) => THREE.Vector3;
  projectWithAxisSnap: (worldPos: THREE.Vector3, lastPoint: THREE.Vector3) => THREE.Vector3;
  dispose: () => void;
}

const DESK_HEIGHT = 0.75;
const POINT_SNAP_DISTANCE = 0.02;
const GRIP_PLACE_DISTANCE = 0.5;

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

export function createVRSketchSystem(
  addPrimitive: (primitive: Record<string, unknown>) => void,
  addConstraintAndSolve: (constraint: SketchConstraint) => Promise<void>,
  solveSketch: () => Promise<void>,
  pushSketchUndo: () => void,
  activeSketchRef: { current: { primitives: Array<{ id: string; type: string; x?: number; y?: number }> } | null },
): VRSketchSystem {
  const state: VRSketchState = {
    phase: "idle",
    subMode: "line",
    isChaining: false,
    lastPointId: null,
    lastPointWorld: null,
    sketchPlane: null,
    previewLine: null,
    axisSnapAxis: null,
    rectStartPos: null,
    isDrawingRect: false,
    circleCenterPos: null,
    isDrawingCircle: false,
    arcStep: 0,
    arcStartPos: null,
    arcEndPos: null,
    isDrawingArc: false,
  };

  let previewGeometry: THREE.BufferGeometry | null = null;

  const startSketchOnPlane = (planeType: string, _offset = 0): SketchPlane => {
    const plane = createSketchPlane(planeType as "xy" | "xz" | "yz");
    state.sketchPlane = plane;
    state.phase = "drawing";
    state.isChaining = false;
    state.lastPointId = null;
    state.lastPointWorld = null;
    return plane;
  };

  const startSketchOnDesk = (): SketchPlane => {
    const plane = createSketchPlane("xz");
    state.sketchPlane = plane;
    state.phase = "drawing";
    state.isChaining = false;
    state.lastPointId = null;
    state.lastPointWorld = null;
    return plane;
  };

  const projectToSketchPlane = (worldPos: THREE.Vector3): THREE.Vector3 => {
    if (!state.sketchPlane) return worldPos.clone();
    const normal = new THREE.Vector3(
      state.sketchPlane.normal.x,
      state.sketchPlane.normal.y,
      state.sketchPlane.normal.z,
    ).normalize();
    const planePoint = new THREE.Vector3(
      state.sketchPlane.origin.x,
      state.sketchPlane.origin.y,
      state.sketchPlane.origin.z,
    );
    const diff = worldPos.clone().sub(planePoint);
    const dist = diff.dot(normal);
    return worldPos.clone().sub(normal.clone().multiplyScalar(dist));
  };

  const worldToSketch = (worldPos: THREE.Vector3): { x: number; y: number } => {
    if (!state.sketchPlane) return { x: worldPos.x, y: worldPos.y };
    const projected = projectToSketchPlane(worldPos);
    const origin = new THREE.Vector3(
      state.sketchPlane.origin.x,
      state.sketchPlane.origin.y,
      state.sketchPlane.origin.z,
    );
    const local = projected.clone().sub(origin);
    const u = new THREE.Vector3(state.sketchPlane.u.x, state.sketchPlane.u.y, state.sketchPlane.u.z).normalize();
    const v = new THREE.Vector3(state.sketchPlane.v.x, state.sketchPlane.v.y, state.sketchPlane.v.z).normalize();
    return { x: local.dot(u), y: local.dot(v) };
  };

  const sketchToWorld = (x: number, y: number): THREE.Vector3 => {
    if (!state.sketchPlane) return new THREE.Vector3(x, y, 0);
    const origin = new THREE.Vector3(
      state.sketchPlane.origin.x,
      state.sketchPlane.origin.y,
      state.sketchPlane.origin.z,
    );
    const u = new THREE.Vector3(state.sketchPlane.u.x, state.sketchPlane.u.y, state.sketchPlane.u.z).normalize();
    const v = new THREE.Vector3(state.sketchPlane.v.x, state.sketchPlane.v.y, state.sketchPlane.v.z).normalize();
    return origin.clone().add(u.clone().multiplyScalar(x)).add(v.clone().multiplyScalar(y));
  };

  const projectWithAxisSnap = (worldPos: THREE.Vector3, lastPoint: THREE.Vector3): THREE.Vector3 => {
    if (!state.axisSnapAxis) return projectToSketchPlane(worldPos);
    const projected = projectToSketchPlane(worldPos);
    const snapped = lastPoint.clone();
    switch (state.axisSnapAxis) {
      case "x":
        snapped.x = projected.x;
        break;
      case "y":
        snapped.y = projected.y;
        break;
      case "z":
        snapped.z = projected.z;
        break;
    }
    return snapped;
  };

  const findNearbyPoint = (sketchPos: { x: number; y: number }): string | null => {
    const sketch = activeSketchRef.current;
    if (!sketch) return null;
    for (const p of sketch.primitives) {
      if (p.type !== "point" || p.x === undefined || p.y === undefined) continue;
      const dx = p.x - sketchPos.x;
      const dy = p.y - sketchPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < POINT_SNAP_DISTANCE) {
        return p.id;
      }
    }
    return null;
  };

  const placePoint = (worldPos: THREE.Vector3): { pointId: string; isExisting: boolean } => {
    const sketchPos = worldToSketch(worldPos);
    const nearbyId = findNearbyPoint(sketchPos);
    if (nearbyId) {
      return { pointId: nearbyId, isExisting: true };
    }
    const pointId = generateId("pt");
    pushSketchUndo();
    addPrimitive({
      id: pointId,
      type: "point",
      x: sketchPos.x,
      y: sketchPos.y,
    });
    return { pointId, isExisting: false };
  };

  const connectLine = (p1Id: string, p2Id: string): string => {
    if (p1Id === p2Id) return "";
    const lineId = generateId("ln");
    pushSketchUndo();
    addPrimitive({
      id: lineId,
      type: "line",
      p1Id,
      p2Id,
    });
    return lineId;
  };

  const drawRectangle = async (startPos: THREE.Vector3, endPos: THREE.Vector3) => {
    const start2D = worldToSketch(startPos);
    const end2D = worldToSketch(endPos);
    
    const minX = Math.min(start2D.x, end2D.x);
    const maxX = Math.max(start2D.x, end2D.x);
    const minY = Math.min(start2D.y, end2D.y);
    const maxY = Math.max(start2D.y, end2D.y);
    
    if (Math.abs(maxX - minX) < 0.05 || Math.abs(maxY - minY) < 0.05) return;
    
    pushSketchUndo();
    
    const blId = generateId("pt");
    const brId = generateId("pt");
    const trId = generateId("pt");
    const tlId = generateId("pt");
    
    addPrimitive({ id: blId, type: "point", x: minX, y: minY });
    addPrimitive({ id: brId, type: "point", x: maxX, y: minY });
    addPrimitive({ id: trId, type: "point", x: maxX, y: maxY });
    addPrimitive({ id: tlId, type: "point", x: minX, y: maxY });
    
    addPrimitive({ id: generateId("ln"), type: "line", p1Id: blId, p2Id: brId });
    addPrimitive({ id: generateId("ln"), type: "line", p1Id: brId, p2Id: trId });
    addPrimitive({ id: generateId("ln"), type: "line", p1Id: trId, p2Id: tlId });
    addPrimitive({ id: generateId("ln"), type: "line", p1Id: tlId, p2Id: blId });
    
    await solveSketch();
  };
  
  const drawCircle = async (centerPos: THREE.Vector3, radiusPos: THREE.Vector3) => {
    const center2D = worldToSketch(centerPos);
    const radius2D = worldToSketch(radiusPos);
    const radius = Math.sqrt(Math.pow(radius2D.x - center2D.x, 2) + Math.pow(radius2D.y - center2D.y, 2));
    
    if (radius < 0.1) return;
    
    pushSketchUndo();
    
    const centerId = generateId("pt");
    addPrimitive({ id: centerId, type: "point", x: center2D.x, y: center2D.y });
    addPrimitive({ id: generateId("cir"), type: "circle", centerId, radius });
    
    await solveSketch();
  };
  
  const drawArc = async (startPos: THREE.Vector3, endPos: THREE.Vector3, bulgePos: THREE.Vector3) => {
    // 3-point arc calculation (simplified)
    const start2D = worldToSketch(startPos);
    const end2D = worldToSketch(endPos);
    const bulge2D = worldToSketch(bulgePos);
    
    // Calculate center and radius from 3 points
    const dx1 = end2D.x - start2D.x;
    const dy1 = end2D.y - start2D.y;
    const dx2 = bulge2D.x - start2D.x;
    const dy2 = bulge2D.y - start2D.y;
    
    const det = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(det) < 0.001) return; // Collinear points
    
    const cx = start2D.x + (dy2 * (dx1 * dx1 + dy1 * dy1) - dy1 * (dx2 * dx2 + dy2 * dy2)) / (2 * det);
    const cy = start2D.y + (dx1 * (dx2 * dx2 + dy2 * dy2) - dx2 * (dx1 * dx1 + dy1 * dy1)) / (2 * det);
    const radius = Math.sqrt((cx - start2D.x) * (cx - start2D.x) + (cy - start2D.y) * (cy - start2D.y));
    
    pushSketchUndo();
    
    const centerId = generateId("pt");
    const startId = generateId("pt");
    const endId = generateId("pt");
    
    addPrimitive({ id: centerId, type: "point", x: cx, y: cy });
    addPrimitive({ id: startId, type: "point", x: start2D.x, y: start2D.y });
    addPrimitive({ id: endId, type: "point", x: end2D.x, y: end2D.y });
    addPrimitive({ id: generateId("arc"), type: "arc", centerId, startId, endId, radius });
    
    await solveSketch();
  };
  
  const drawSinglePoint = async (worldPos: THREE.Vector3) => {
    const pos2D = worldToSketch(worldPos);
    pushSketchUndo();
    addPrimitive({ id: generateId("pt"), type: "point", x: pos2D.x, y: pos2D.y, fixed: false });
    await solveSketch();
  };
  
  const startRectangle = (pos: THREE.Vector3) => {
    state.rectStartPos = pos.clone();
    state.isDrawingRect = true;
  };
  
  const updateRectanglePreview = (pos: THREE.Vector3) => {
    // TODO: Add rectangle preview rendering
  };
  
  const finishRectangle = async (pos: THREE.Vector3) => {
    if (state.rectStartPos) {
      await drawRectangle(state.rectStartPos, pos);
    }
    state.rectStartPos = null;
    state.isDrawingRect = false;
  };
  
  const startCircle = (pos: THREE.Vector3) => {
    state.circleCenterPos = pos.clone();
    state.isDrawingCircle = true;
  };
  
  const updateCirclePreview = (pos: THREE.Vector3) => {
    // TODO: Add circle preview rendering
  };
  
  const finishCircle = async (pos: THREE.Vector3) => {
    if (state.circleCenterPos) {
      await drawCircle(state.circleCenterPos, pos);
    }
    state.circleCenterPos = null;
    state.isDrawingCircle = false;
  };
  
  const startArc = (pos: THREE.Vector3) => {
    state.arcStartPos = pos.clone();
    state.arcStep = 1;
    state.isDrawingArc = true;
  };
  
  const setArcEnd = (pos: THREE.Vector3) => {
    state.arcEndPos = pos.clone();
    state.arcStep = 2;
  };
  
  const finishArc = async (pos: THREE.Vector3) => {
    if (state.arcStartPos && state.arcEndPos) {
      await drawArc(state.arcStartPos, state.arcEndPos, pos);
    }
    state.arcStartPos = null;
    state.arcEndPos = null;
    state.arcStep = 0;
    state.isDrawingArc = false;
  };

  const finishChain = () => {
    state.isChaining = false;
    state.lastPointId = null;
    state.lastPointWorld = null;
  };

  const cancelSketch = () => {
    state.phase = "idle";
    state.isChaining = false;
    state.lastPointId = null;
    state.lastPointWorld = null;
    state.sketchPlane = null;
    state.axisSnapAxis = null;
    // Reset drawing states
    state.rectStartPos = null;
    state.isDrawingRect = false;
    state.circleCenterPos = null;
    state.isDrawingCircle = false;
    state.arcStartPos = null;
    state.arcEndPos = null;
    state.arcStep = 0;
    state.isDrawingArc = false;
    clearPreview();
  };

  const updatePreview = (handWorldPos: THREE.Vector3) => {
    if (!state.lastPointWorld) return;
    let targetPos: THREE.Vector3;
    if (state.axisSnapAxis) {
      targetPos = projectWithAxisSnap(handWorldPos, state.lastPointWorld);
    } else if (state.sketchPlane) {
      targetPos = projectToSketchPlane(handWorldPos);
    } else {
      targetPos = handWorldPos;
    }

    if (!state.previewLine) {
      previewGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(6);
      previewGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: 0x44aaff,
        transparent: true,
        opacity: 0.6,
      });
      state.previewLine = new THREE.Line(previewGeometry, material);
      state.previewLine.frustumCulled = false;
    }

    const positions = state.previewLine.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, state.lastPointWorld.x, state.lastPointWorld.y, state.lastPointWorld.z);
    positions.setXYZ(1, targetPos.x, targetPos.y, targetPos.z);
    positions.needsUpdate = true;
  };

  const clearPreview = () => {
    if (state.previewLine) {
      state.previewLine.geometry.dispose();
      (state.previewLine.material as THREE.Material).dispose();
      state.previewLine = null;
    }
    previewGeometry = null;
  };

  const dispose = () => {
    clearPreview();
  };

  return {
    state,
    setPhase: (phase) => { state.phase = phase; },
    setSubMode: (mode) => { state.subMode = mode; },
    startSketchOnPlane,
    startSketchOnDesk,
    placePoint,
    connectLine,
    drawRectangle,
    drawCircle,
    drawArc,
    drawSinglePoint,
    startRectangle,
    updateRectanglePreview,
    finishRectangle,
    startCircle,
    updateCirclePreview,
    finishCircle,
    startArc,
    setArcEnd,
    finishArc,
    finishChain,
    cancelSketch,
    updatePreview,
    clearPreview,
    setAxisSnap: (axis) => { state.axisSnapAxis = axis; },
    projectToSketchPlane,
    worldToSketch,
    sketchToWorld,
    projectWithAxisSnap,
    dispose,
  };
}

export { DESK_HEIGHT, GRIP_PLACE_DISTANCE };
