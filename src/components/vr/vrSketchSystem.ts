import * as THREE from "three";
import {
  createSketchPlane,
  createSketchPlaneFromNormal,
  type SketchPlane,
  type SketchPlaneType,
  type SketchPoint,
  type SketchLine,
  type SketchCircle,
  type SketchArc,
  type SketchConstraint,
} from "@vitekk02/cadjs";
import {
  buildSketchNode,
  type ProvenanceQuery,
  type ScadgenFeatureNode,
} from "../../model/onshapeHistory";

const FEATURE_ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
let featureSeq = 0;
export function makeOnshapeStyleFeatureId(): string {
  let tag = "";
  for (let i = 0; i < 16; i++) {
    tag +=
      FEATURE_ID_ALPHABET[
        Math.floor(Math.random() * FEATURE_ID_ALPHABET.length)
      ];
  }
  return `F${tag}_${++featureSeq}`;
}

export type VRSketchPhase = "idle" | "selecting-plane" | "drawing";
export type VRSketchSubMode = "line" | "rectangle" | "circle" | "arc" | "point";
export type VRSketchContext = "desk" | "face" | "origin" | "freehand";

export type VRRayTarget =
  | { kind: "body-face"; plane: SketchPlane; point: THREE.Vector3 }
  | { kind: "desk"; point: THREE.Vector3 }
  | {
      kind: "origin-plane";
      planeType: "XY" | "XZ" | "YZ";
      point: THREE.Vector3;
    }
  | { kind: "freehand" };

export interface VRSketchState {
  phase: VRSketchPhase;
  subMode: VRSketchSubMode;
  sketchingContext: VRSketchContext | null;
  sketchFeatureId: string | null;
  isChaining: boolean;
  lastPointId: string | null;
  lastPointWorld: THREE.Vector3 | null;
  sketchPlane: SketchPlane | null;
  previewLine: THREE.Line | null;
  targetMarker: THREE.Mesh | null;
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

  // Part 1: plane selection by ray target
  classifyRayTarget: (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    scene: THREE.Scene,
  ) => VRRayTarget;
  beginSketchOnPlane: (plane: SketchPlane, context: VRSketchContext) => void;
  rayToSketchPoint: (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
  ) => THREE.Vector3 | null;
  updateTargetMarker: (target: VRRayTarget) => void;
  clearTargetMarker: () => void;

  // Point/Line operations (existing)
  placePoint: (worldPos: THREE.Vector3) => {
    pointId: string;
    isExisting: boolean;
  };
  connectLine: (p1Id: string, p2Id: string) => string;

  // New drawing operations
  drawRectangle: (
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
  ) => Promise<void>;
  drawCircle: (
    centerPos: THREE.Vector3,
    radiusPos: THREE.Vector3,
  ) => Promise<void>;
  drawArc: (
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    bulgePos: THREE.Vector3,
  ) => Promise<void>;
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
  getFeatureHistoryNode: () => ScadgenFeatureNode | null;
  updatePreview: (handWorldPos: THREE.Vector3) => void;
  clearPreview: () => void;
  setAxisSnap: (axis: "x" | "y" | "z" | null) => void;
  projectToSketchPlane: (worldPos: THREE.Vector3) => THREE.Vector3;
  worldToSketch: (worldPos: THREE.Vector3) => { x: number; y: number };
  sketchToWorld: (x: number, y: number) => THREE.Vector3;
  projectWithAxisSnap: (
    worldPos: THREE.Vector3,
    lastPoint: THREE.Vector3,
  ) => THREE.Vector3;
  dispose: () => void;
}

const DESK_HEIGHT = 0.75;
const POINT_SNAP_DISTANCE = 0.02;
const GRIP_PLACE_DISTANCE = 0.5;

// Must match buildVRRoom DEFAULTS: desk 1.6 x 0.8 centred on origin
const DESK_HALF_X = 1.6 / 2;
const DESK_HALF_Z = 0.8 / 2;

// Origin plane handles: square region around world origin
const ORIGIN_PLANE_HALF = 0.8;

// Max ray distance for target classification
const MAX_TARGET_DIST = 1.5;

// Freehand sketch plane sits this far in front of the hand, facing it
const FREEHAND_PLANE_DIST = 0.4;

const TARGET_MARKER_COLORS: Record<VRRayTarget["kind"], number> = {
  "body-face": 0x00ffff,
  desk: 0xffffff,
  "origin-plane": 0xffff00,
  freehand: 0xff8800,
};

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

export function createVRSketchSystem(
  addPrimitive: (primitive: Record<string, unknown>) => void,
  addConstraintAndSolve: (constraint: SketchConstraint) => void | Promise<void>,
  solveSketch: () => Promise<void>,
  pushSketchUndo: () => void,
  activeSketchRef: {
    current: {
      primitives: Array<{ id: string; type: string; x?: number; y?: number }>;
    } | null;
  },
): VRSketchSystem {
  const state: VRSketchState = {
    phase: "idle",
    subMode: "line",
    sketchingContext: null,
    sketchFeatureId: null,
    isChaining: false,
    lastPointId: null,
    lastPointWorld: null,
    sketchPlane: null,
    previewLine: null,
    targetMarker: null,
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

  const startSketchOnPlane = (planeType: string, offset = 0): SketchPlane => {
    const type = planeType.toUpperCase() as SketchPlaneType;
    const plane = createSketchPlane(type);
    if (offset !== 0) {
      plane.origin.addScaledVector(plane.normal, offset);
      plane.offset = offset;
    }
    beginSketchOnPlane(plane, "origin");
    return plane;
  };

  const startSketchOnDesk = (): SketchPlane => {
    const plane = createSketchPlane("XZ", new THREE.Vector3(0, DESK_HEIGHT, 0));
    beginSketchOnPlane(plane, "desk");
    return plane;
  };

  const beginSketchOnPlane = (plane: SketchPlane, context: VRSketchContext) => {
    state.sketchPlane = plane;
    state.sketchingContext = context;
    state.sketchFeatureId = makeOnshapeStyleFeatureId();
    state.phase = "drawing";
    state.isChaining = false;
    state.lastPointId = null;
    state.lastPointWorld = null;
    state.axisSnapAxis = null;
  };

  const deskPlaneObj = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -DESK_HEIGHT,
  );

  const intersectDesk = (ray: THREE.Ray): THREE.Vector3 | null => {
    const hit = new THREE.Vector3();
    if (ray.intersectPlane(deskPlaneObj, hit) === null) return null;
    if (hit.distanceTo(ray.origin) > MAX_TARGET_DIST) return null;
    return hit;
  };

  const intersectOriginPlanes = (
    ray: THREE.Ray,
  ): { planeType: "XY" | "XZ" | "YZ"; point: THREE.Vector3 } | null => {
    const candidates: {
      planeType: "XY" | "XZ" | "YZ";
      normal: THREE.Vector3;
      inPlane: (p: THREE.Vector3) => boolean;
    }[] = [
      {
        planeType: "XY",
        normal: new THREE.Vector3(0, 0, 1),
        inPlane: (p) =>
          Math.abs(p.x) < ORIGIN_PLANE_HALF &&
          Math.abs(p.y) < ORIGIN_PLANE_HALF,
      },
      {
        planeType: "XZ",
        normal: new THREE.Vector3(0, 1, 0),
        inPlane: (p) =>
          Math.abs(p.x) < ORIGIN_PLANE_HALF &&
          Math.abs(p.z) < ORIGIN_PLANE_HALF,
      },
      {
        planeType: "YZ",
        normal: new THREE.Vector3(1, 0, 0),
        inPlane: (p) =>
          Math.abs(p.y) < ORIGIN_PLANE_HALF &&
          Math.abs(p.z) < ORIGIN_PLANE_HALF,
      },
    ];
    let best: { planeType: "XY" | "XZ" | "YZ"; point: THREE.Vector3 } | null =
      null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const plane = new THREE.Plane(c.normal, 0);
      const hit = new THREE.Vector3();
      if (ray.intersectPlane(plane, hit) === null) continue;
      const dist = hit.distanceTo(ray.origin);
      if (dist > MAX_TARGET_DIST || !c.inPlane(hit)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = { planeType: c.planeType, point: hit };
      }
    }
    return best;
  };

  const classifyRayTarget = (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    scene: THREE.Scene,
  ): VRRayTarget => {
    const ray = new THREE.Ray(origin, dir.clone().normalize());

    // 1. CAD body faces (meshes tagged with userData.id)
    const raycaster = new THREE.Raycaster(
      ray.origin,
      ray.direction,
      0,
      MAX_TARGET_DIST,
    );
    const intersects = raycaster.intersectObjects(scene.children, true);
    for (const hit of intersects) {
      const mesh = hit.object as THREE.Mesh;
      if (!(mesh.userData as Record<string, unknown>)?.id) continue;
      if (mesh.visible === false) continue;
      const face = hit.face;
      if (!face || hit.faceIndex === undefined) continue;
      const normal = face.normal
        .clone()
        .transformDirection(mesh.matrixWorld)
        .normalize();
      const plane = createSketchPlaneFromNormal(
        normal,
        hit.point.clone(),
        mesh.userData.id as never,
      );
      return { kind: "body-face", plane, point: hit.point.clone() };
    }

    // 2. Desk surface, clamped to its footprint
    const deskHit = intersectDesk(ray);
    if (
      deskHit &&
      Math.abs(deskHit.x) < DESK_HALF_X &&
      Math.abs(deskHit.z) < DESK_HALF_Z
    ) {
      return { kind: "desk", point: deskHit };
    }

    // 3. Origin planes within their bounded handle squares
    const originHit = intersectOriginPlanes(ray);
    if (originHit) return { kind: "origin-plane", ...originHit };

    // 4. Nothing → 3D freehand
    return { kind: "freehand" };
  };

  const rayToSketchPoint = (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
  ): THREE.Vector3 | null => {
    const ray = new THREE.Ray(origin, dir.clone().normalize());

    if (state.sketchingContext === "desk") {
      const hit = intersectDesk(ray);
      if (!hit) return null;
      hit.x = THREE.MathUtils.clamp(hit.x, -DESK_HALF_X, DESK_HALF_X);
      hit.z = THREE.MathUtils.clamp(hit.z, -DESK_HALF_Z, DESK_HALF_Z);
      hit.y = DESK_HEIGHT;
      return hit;
    }

    if (state.sketchPlane) {
      const normal = state.sketchPlane.normal.clone().normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal,
        state.sketchPlane.origin,
      );
      const hit = new THREE.Vector3();
      if (ray.intersectPlane(plane, hit) === null) return null;
      if (hit.distanceTo(origin) > MAX_TARGET_DIST * 2) return null;
      return hit;
    }

    return null;
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
    const u = state.sketchPlane.xAxis.clone().normalize();
    const v = state.sketchPlane.yAxis.clone().normalize();
    return { x: local.dot(u), y: local.dot(v) };
  };

  const sketchToWorld = (x: number, y: number): THREE.Vector3 => {
    if (!state.sketchPlane) return new THREE.Vector3(x, y, 0);
    const origin = new THREE.Vector3(
      state.sketchPlane.origin.x,
      state.sketchPlane.origin.y,
      state.sketchPlane.origin.z,
    );
    return origin
      .clone()
      .add(state.sketchPlane.xAxis.clone().multiplyScalar(x))
      .add(state.sketchPlane.yAxis.clone().multiplyScalar(y));
  };

  const projectWithAxisSnap = (
    worldPos: THREE.Vector3,
    lastPoint: THREE.Vector3,
  ): THREE.Vector3 => {
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

  const findNearbyPoint = (sketchPos: {
    x: number;
    y: number;
  }): string | null => {
    const sketch = activeSketchRef.current;
    if (!sketch) return null;
    for (const p of sketch.primitives) {
      if (p.type !== "point" || p.x === undefined || p.y === undefined)
        continue;
      const dx = p.x - sketchPos.x;
      const dy = p.y - sketchPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < POINT_SNAP_DISTANCE) {
        return p.id;
      }
    }
    return null;
  };

  const placePoint = (
    worldPos: THREE.Vector3,
  ): { pointId: string; isExisting: boolean } => {
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

  const drawRectangle = async (
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
  ) => {
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

    addPrimitive({
      id: generateId("ln"),
      type: "line",
      p1Id: blId,
      p2Id: brId,
    });
    addPrimitive({
      id: generateId("ln"),
      type: "line",
      p1Id: brId,
      p2Id: trId,
    });
    addPrimitive({
      id: generateId("ln"),
      type: "line",
      p1Id: trId,
      p2Id: tlId,
    });
    addPrimitive({
      id: generateId("ln"),
      type: "line",
      p1Id: tlId,
      p2Id: blId,
    });

    await solveSketch();
  };

  const drawCircle = async (
    centerPos: THREE.Vector3,
    radiusPos: THREE.Vector3,
  ) => {
    const center2D = worldToSketch(centerPos);
    const radius2D = worldToSketch(radiusPos);
    const radius = Math.sqrt(
      Math.pow(radius2D.x - center2D.x, 2) +
        Math.pow(radius2D.y - center2D.y, 2),
    );

    if (radius < 0.1) return;

    pushSketchUndo();

    const centerId = generateId("pt");
    addPrimitive({ id: centerId, type: "point", x: center2D.x, y: center2D.y });
    addPrimitive({ id: generateId("cir"), type: "circle", centerId, radius });

    await solveSketch();
  };

  const drawArc = async (
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    bulgePos: THREE.Vector3,
  ) => {
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

    const cx =
      start2D.x +
      (dy2 * (dx1 * dx1 + dy1 * dy1) - dy1 * (dx2 * dx2 + dy2 * dy2)) /
        (2 * det);
    const cy =
      start2D.y +
      (dx1 * (dx2 * dx2 + dy2 * dy2) - dx2 * (dx1 * dx1 + dy1 * dy1)) /
        (2 * det);
    const radius = Math.sqrt(
      (cx - start2D.x) * (cx - start2D.x) + (cy - start2D.y) * (cy - start2D.y),
    );

    pushSketchUndo();

    const centerId = generateId("pt");
    const startId = generateId("pt");
    const endId = generateId("pt");

    addPrimitive({ id: centerId, type: "point", x: cx, y: cy });
    addPrimitive({ id: startId, type: "point", x: start2D.x, y: start2D.y });
    addPrimitive({ id: endId, type: "point", x: end2D.x, y: end2D.y });
    addPrimitive({
      id: generateId("arc"),
      type: "arc",
      centerId,
      startId,
      endId,
      radius,
    });

    await solveSketch();
  };

  const drawSinglePoint = async (worldPos: THREE.Vector3) => {
    const pos2D = worldToSketch(worldPos);
    pushSketchUndo();
    addPrimitive({
      id: generateId("pt"),
      type: "point",
      x: pos2D.x,
      y: pos2D.y,
      fixed: false,
    });
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

  const getFeatureHistoryNode = (): ScadgenFeatureNode | null => {
    const featureId = state.sketchFeatureId;
    if (!featureId || state.sketchingContext === null) return null;
    const prims = activeSketchRef.current?.primitives ?? [];
    const entityTags = prims.filter((p) => p.type !== "point").map((p) => p.id);
    const planeRef: ProvenanceQuery | null = state.sketchPlane
      ? {
          entityType:
            state.sketchingContext === "face" ? "FACE" : "SKETCH_ENTITY",
          historyType: "CREATION",
          creationFeatureId: null,
          entityTag: state.sketchPlane.type,
          disambiguation: state.sketchingContext,
        }
      : null;
    const live = activeSketchRef.current as unknown as {
      primitives: unknown[];
      constraints?: unknown[];
    } | null;
    const v = (vec: { x: number; y: number; z: number } | undefined) =>
      vec ? [vec.x, vec.y, vec.z] : [0, 0, 0];
    const snapshot = state.sketchPlane
      ? {
          id: featureId,
          plane: {
            type: state.sketchPlane.type,
            origin: v(state.sketchPlane.origin),
            normal: v(state.sketchPlane.normal),
            xAxis: v(state.sketchPlane.xAxis),
            yAxis: v(state.sketchPlane.yAxis),
            offset: state.sketchPlane.offset ?? 0,
          },
          primitives: live?.primitives ?? [],
          constraints: live?.constraints ?? [],
        }
      : undefined;
    return buildSketchNode(
      featureId,
      "VR Sketch",
      entityTags,
      planeRef,
      snapshot,
    );
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
    state.sketchingContext = null;
    state.sketchFeatureId = null;
    state.axisSnapAxis = null;
    clearTargetMarker();
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
      previewGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      const material = new THREE.LineBasicMaterial({
        color: 0x44aaff,
        transparent: true,
        opacity: 0.6,
      });
      state.previewLine = new THREE.Line(previewGeometry, material);
      state.previewLine.frustumCulled = false;
    }

    const positions = state.previewLine.geometry.attributes
      .position as THREE.BufferAttribute;
    positions.setXYZ(
      0,
      state.lastPointWorld.x,
      state.lastPointWorld.y,
      state.lastPointWorld.z,
    );
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

  const updateTargetMarker = (target: VRRayTarget) => {
    if (target.kind === "freehand") {
      clearTargetMarker();
      return;
    }
    const show = target.point;
    if (!state.targetMarker) {
      const geo = new THREE.RingGeometry(0.018, 0.026, 32);
      const mat = new THREE.MeshBasicMaterial({
        color: TARGET_MARKER_COLORS[target.kind],
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });
      state.targetMarker = new THREE.Mesh(geo, mat);
      state.targetMarker.frustumCulled = false;
      state.targetMarker.renderOrder = 10;
    } else {
      (state.targetMarker.material as THREE.MeshBasicMaterial).color.setHex(
        TARGET_MARKER_COLORS[target.kind],
      );
    }
    state.targetMarker.position.copy(show);
    const normal =
      target.kind === "body-face"
        ? target.plane.normal.clone().normalize()
        : target.kind === "desk"
          ? new THREE.Vector3(0, 1, 0)
          : createSketchPlane(target.planeType).normal.clone().normalize();
    state.targetMarker.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    );
  };

  const clearTargetMarker = () => {
    if (state.targetMarker) {
      state.targetMarker.parent?.remove(state.targetMarker);
      state.targetMarker.geometry.dispose();
      (state.targetMarker.material as THREE.Material).dispose();
      state.targetMarker = null;
    }
  };

  const dispose = () => {
    clearPreview();
    clearTargetMarker();
  };

  return {
    state,
    setPhase: (phase) => {
      state.phase = phase;
    },
    setSubMode: (mode) => {
      state.subMode = mode;
    },
    startSketchOnPlane,
    startSketchOnDesk,
    beginSketchOnPlane,
    classifyRayTarget,
    rayToSketchPoint,
    updateTargetMarker,
    clearTargetMarker,
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
    getFeatureHistoryNode,
    cancelSketch,
    updatePreview,
    clearPreview,
    setAxisSnap: (axis) => {
      state.axisSnapAxis = axis;
    },
    projectToSketchPlane,
    worldToSketch,
    sketchToWorld,
    projectWithAxisSnap,
    dispose,
  };
}

export { DESK_HEIGHT, GRIP_PLACE_DISTANCE };
