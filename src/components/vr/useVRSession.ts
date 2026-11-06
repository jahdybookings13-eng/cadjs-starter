import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Mesh, MeshStandardMaterial } from "three";
import { useCadVisualizer, useCadCore } from "@vitekk02/cadjs/react";
import {
  createSketchPlane,
  createSketchPlaneFromNormal,
  debugLog,
} from "@vitekk02/cadjs";
import { buildVRRoom, disposeVRRoom } from "./buildVRRoom";
import { buildVRControls } from "./buildVRControls";
import { createVRGrabSystem, type VRGrabSystem } from "./vrGrabSystem";
import { createSubPrimSelector, type SubPrimHit } from "./subPrimSelector";
import {
  createVRSketchSystem,
  makeOnshapeStyleFeatureId,
  type VRSketchSystem,
  DESK_HEIGHT,
} from "./vrSketchSystem";
import { buildVRNode, buildVRNodeOrMode } from "../../model/vrNodeBuilder";
import type { ScadgenFeatureNode } from "../../model/onshapeHistory";
import "../../model/bootstrap";
import {
  makeElementAuthor,
  pairNewElements,
} from "../../model/elementAuthoring";
import { scadgenHistory } from "../../model/featureEngine";
import { scadgenSceneSync } from "../../model/sceneSync";
import { resolveHitToTag } from "../../model/hitResolver";
import {
  createDeskSketchVisuals,
  type DeskSketchVisuals,
  type SketchPrimitiveLite,
} from "./vrSketchDeskVisuals";
import { createVRParamPanel, type VRParamPanel } from "./vrParamPanel";
import { createVRChatPanel, type VRChatPanel } from "../../flux/vr/vrChatPanel";
import type { TraceRow } from "../../flux/agent/trace";
import {
  paramPanelForFeature,
  panelEditToParameter,
  type PanelRow,
} from "../../model/paramPanel";

const MOVE_SPEED = 2.0;

// Body radius used for wall/desk standoff
const PLAYER_RADIUS = 0.3;

// Must match buildVRRoom: roomW/roomD = 5, so walls sit at +/-2.5
const ROOM_HALF = 2.5;
const WALL_LIMIT = ROOM_HALF - PLAYER_RADIUS;

// Must match buildVRRoom DEFAULTS: deskWidth 1.6, deskDepth 0.8, centred on origin
// Smaller buffer to allow getting closer to the table
const DESK_BUFFER = 0.1;
const DESK_BLOCK_X = 1.6 / 2 + DESK_BUFFER;
const DESK_BLOCK_Z = 0.8 / 2 + DESK_BUFFER;

type VRPlaneName = "XY" | "XZ" | "YZ";

interface VRTriadState {
  placed: boolean;
  host: "free" | "desk" | "plane" | "face";
  position: [number, number, number];
  orientation: [number, number, number, number];
  activePlane: VRPlaneName;
  attachedTo?:
    | {
        kind: "body" | "face" | "plane" | "desk";
        id?: string | undefined;
        normal?: [number, number, number] | undefined;
        point?: [number, number, number] | undefined;
      }
    | undefined;
}

interface VRBeamState {
  origin: [number, number, number];
  direction: [number, number, number];
  distance: number;
  target: [number, number, number];
}

const VR_TRIAD_SIZE = 0.5;

function makeVRLine(
  start: [number, number, number],
  end: [number, number, number],
  color: number,
): THREE.Line {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([...start, ...end], 3),
  );
  return new THREE.Line(
    g,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
}

function makeVrTriadPlane(
  activePlane: VRPlaneName,
  planeName: VRPlaneName,
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color: planeName === activePlane ? 0x55ccff : 0x112233,
    transparent: true,
    opacity: planeName === activePlane ? 0.55 : 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(VR_TRIAD_SIZE, VR_TRIAD_SIZE),
    material,
  );
  mesh.name = `vr-triad-plane-${planeName}`;

  if (planeName === "XY") mesh.position.set(0, 0, 0.001);
  if (planeName === "XZ") {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.001, 0);
  }
  if (planeName === "YZ") {
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(0.001, 0, 0);
  }

  return mesh;
}

function syncVrTriad(group: THREE.Object3D | null, activePlane: VRPlaneName) {
  if (!group) return;

  group.children.forEach((child) => {
    const mesh = child as THREE.Mesh & { isMesh?: boolean };
    if (!mesh.isMesh || !mesh.name.startsWith("vr-triad-plane-")) return;

    const planeName = mesh.name.replace("vr-triad-plane-", "") as VRPlaneName;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const isActive = planeName === activePlane;
    material.color.setHex(isActive ? 0x55ccff : 0x112233);
    material.opacity = isActive ? 0.55 : 0.22;
    material.needsUpdate = true;
  });
}

function ensureVrTriad(
  scene: THREE.Scene,
  position: [number, number, number],
  activePlane: VRPlaneName,
  orientation?: [number, number, number, number],
): THREE.Object3D {
  let group = scene.getObjectByName("vr-triad");

  if (!group) {
    group = new THREE.Group();
    group.name = "vr-triad";
    group.add(
      makeVRLine([0, 0, 0], [VR_TRIAD_SIZE, 0, 0], 0xff5555),
      makeVRLine([0, 0, 0], [0, VR_TRIAD_SIZE, 0], 0x55ff55),
      makeVRLine([0, 0, 0], [0, 0, VR_TRIAD_SIZE], 0x5555ff),
      makeVrTriadPlane(activePlane, "XY"),
      makeVrTriadPlane(activePlane, "XZ"),
      makeVrTriadPlane(activePlane, "YZ"),
    );
    scene.add(group);
  }

  group.position.set(position[0], position[1], position[2]);
  if (orientation) group.quaternion.set(...orientation);
  syncVrTriad(group, activePlane);
  return group;
}

function quatFromNormal(normal: [number, number, number]) {
  const n = new THREE.Vector3(...normal).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    n,
  );
  return [q.x, q.y, q.z, q.w] as [number, number, number, number];
}

function triadStateFromScene(
  scene: THREE.Scene,
  activePlane: VRPlaneName,
  host: VRTriadState["host"] = "free",
  attachedTo?: VRTriadState["attachedTo"],
): VRTriadState {
  const group = scene.getObjectByName("vr-triad");

  if (!group)
    return {
      placed: false,
      host,
      position: [0, 0, 0],
      orientation: [0, 0, 0, 1],
      activePlane,
      attachedTo,
    };

  return {
    placed: true,
    host,
    position: [group.position.x, group.position.y, group.position.z],
    orientation: [
      group.quaternion.x,
      group.quaternion.y,
      group.quaternion.z,
      group.quaternion.w,
    ],
    activePlane,
    attachedTo,
  };
}

function ensureVrBeamMarker(scene: THREE.Scene): THREE.Mesh {
  let marker = scene.getObjectByName("vr-beam-marker");
  if (marker) return marker as THREE.Mesh;

  marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0x55ccff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  marker.name = "vr-beam-marker";
  scene.add(marker);
  return marker as THREE.Mesh;
}

export function useVRSession() {
  const { renderer, scene, setContinuousRender } = useCadVisualizer();
  const {
    setMode,
    selectElement,
    deselectElement,
    addPrimitive,
    addConstraintAndSolve,
    solveSketch,
    pushSketchUndo,
    activeSketch,
    elements,
    addElement,
    getObject,
    idCounter,
    updateElementBrep,
    startSketch,
    finishSketch,
    cancelSketch,
    mode: currentMode,
  } = useCadCore();

  // Assembly selection bridge: keeps the assembly subsystem in sync with
  // what the VR grip is holding. Set from simpleCadScene so the VR loop
  // can mirror grab/release into assembly state (and vice-versa).
  interface AssemblyBridge {
    onGrab?: (instanceId: string) => void;
    onRelease?: () => void;
    onHover?: (instanceId: string | null) => void;
  }
  const assemblyBridgeRef = useRef<AssemblyBridge | null>(null);
  // Refs for cadCore functions so the animation loop always gets fresh references
  const setModeRef = useRef(setMode);
  const selectElementRef = useRef(selectElement);
  const deselectElementRef = useRef(deselectElement);
  const addPrimitiveRef = useRef(addPrimitive);
  const addConstraintAndSolveRef = useRef(addConstraintAndSolve);
  const solveSketchRef = useRef(solveSketch);
  const pushSketchUndoRef = useRef(pushSketchUndo);
  const activeSketchRef2 = useRef(activeSketch);
  const startSketchRef = useRef(startSketch);
  const finishSketchRef = useRef(finishSketch);
  const cancelSketchRef = useRef(cancelSketch);
  const currentModeRef = useRef(currentMode);
  const elementsRef = useRef(elements);
  const pendingSketchMapping = useRef<{
    featureId: string;
    before: Set<string>;
  } | null>(null);

  useEffect(() => {
    elementsRef.current = elements;
    const pending = pendingSketchMapping.current;
    if (pending) {
      const created = elements.find((el) => !pending.before.has(el.nodeId));
      if (created) {
        const node = scadgenHistory.get(pending.featureId);
        if (node) {
          node.extensions = {
            ...(node.extensions ?? {}),
            elementNodeId: created.nodeId,
          };
          scadgenHistory.touch(pending.featureId);
        }
        pendingSketchMapping.current = null;
      }
    }
  }, [elements]);

  useEffect(() => {
    scadgenSceneSync.configure(
      {
        updateElementBrep,
        postCreate: (nodeId, out) => {
          pendingAuthorFixups.current.set(nodeId, out);
        },
        createElement: makeElementAuthor(
          (b, p) =>
            (addElement as unknown as (b: unknown, p: unknown) => void)(b, p),
          () => idCounter,
        ),
        setElementHidden: (nodeId, hidden) => {
          const obj = getObject(nodeId);
          if (obj) obj.visible = hidden ? false : true;
        },
        setElementAppearance: (nodeId, ap) => {
          const obj = getObject(nodeId);
          if (!obj) return;
          obj.traverse((child) => {
            const mesh = child as Mesh & {
              isMesh?: boolean;
              material?: MeshStandardMaterial | MeshStandardMaterial[];
            };
            if (!mesh.isMesh) return;
            const mats = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            for (const mmb of mats) {
              if (!mmb) continue;
              const mm = mmb as MeshStandardMaterial;
              if (ap.color !== undefined) mm.color.set(ap.color);
              if (ap.opacity !== undefined) {
                mm.opacity = ap.opacity;
                mm.transparent = ap.opacity < 1;
                mm.depthWrite = ap.opacity >= 1;
              }
              mm.needsUpdate = true;
            }
          });
        },
      },
      scadgenHistory,
    );
  }, [updateElementBrep, addElement, idCounter, getObject]);

  useEffect(() => {
    if (!pendingAuthorFixups.current.size) {
      for (const el of elements) seenElementIds.current.add(el.nodeId);
      return;
    }
    const ids = elements.map((el) => el.nodeId);
    const pending = [...pendingAuthorFixups.current].map(
      ([predictedId, out]) => ({
        predictedId,
        brep: out.brep,
        position: out.position,
        occBrep: out.occBrep,
        edgeGeometry: out.edgeGeometry,
        faceGeometry: out.faceGeometry,
        vertexPositions: out.vertexPositions,
      }),
    );
    const pairs = pairNewElements(ids, seenElementIds.current, pending);
    for (const { actualId, item } of pairs) {
      if (actualId !== item.predictedId)
        scadgenSceneSync.remapElementId(item.predictedId, actualId);
      updateElementBrep(
        actualId,
        item.brep as never,
        item.position as never,
        undefined,
        item.edgeGeometry as never,
        item.occBrep,
        item.faceGeometry as never,
        item.vertexPositions as never,
      );
      pendingAuthorFixups.current.delete(item.predictedId);
    }
  }, [elements, updateElementBrep]);

  useEffect(() => {
    setModeRef.current = setMode;
    selectElementRef.current = selectElement;
    deselectElementRef.current = deselectElement;
    addPrimitiveRef.current = addPrimitive;
    addConstraintAndSolveRef.current = addConstraintAndSolve;
    solveSketchRef.current = solveSketch;
    pushSketchUndoRef.current = pushSketchUndo;
    activeSketchRef2.current = activeSketch;
    startSketchRef.current = startSketch;
    finishSketchRef.current = finishSketch;
    cancelSketchRef.current = cancelSketch;
    currentModeRef.current = currentMode;
  });
  const [inVR, setInVR] = useState(false);
  const [vrSupported, setVrSupported] = useState(false);
  const roomRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<ReturnType<typeof buildVRControls> | null>(null);
  const baseBackgroundRef = useRef<THREE.Color | THREE.Texture | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const hiddenInVR = useRef<THREE.Object3D[]>([]);
  const playerOffset = useRef(new THREE.Vector3());
  const lastTime = useRef(0);
  const carouselRotation = useRef(0);
  const carouselIndex = useRef(0);
  const lastButtonPressTime = useRef(0);
  const lastHoveredButtonIndex = useRef(-1);
  const BUTTON_PRESS_COOLDOWN = 500;
  const lastBackButtonPress = useRef(0);
  const grabSystemRef = useRef<VRGrabSystem | null>(null);
  const subPrimSelectorRef = useRef(createSubPrimSelector());
  const vrSubSelection = useRef<SubPrimHit | null>(null);
  const gripWasPressed = useRef(false);
  const GRIP_BUTTON_INDEX = 1;
  const beltGripActive = useRef(false);
  const beltGripPrevAngle = useRef(0);
  const sketchSystemRef = useRef<VRSketchSystem | null>(null);
  const deskVisualsRef = useRef<DeskSketchVisuals | null>(null);
  const paramPanelRef = useRef<VRParamPanel | null>(null);
  const fluxChatPanelRef = useRef<VRChatPanel | null>(null);
  // Live session getter for the VR flux chat panel. The scene pushes a
  // () => ({ ref, rows }) binding via __vrMechanics.setFluxSession; the render
  // loop calls it each frame, so the mesh always shows the current thread
  // without any polling.
  const fluxSessionRef = useRef<
    (() => { ref: string; rows: TraceRow[] }) | null
  >(null);
  const lastSketchHistoryRef = useRef<ScadgenFeatureNode | null>(null);
  const sketchGripWasPressed = useRef(false);
  const freehandStrokePending = useRef(false);
  const pendingAuthorFixups = useRef(
    new Map<string, import("../../model/executor").BodyOutput>(),
  );
  const seenElementIds = useRef(new Set<string>());
  const vrActionArmed = useRef<string | null>(null);
  const extrudeTriggerWasPressed = useRef(false);
  const sketchTriggerWasPressed = useRef(false);
  const leftGripWasPressed = useRef(false);
  const rightGripWasPressed = useRef(false);
  const vrTriadActivePlane = useRef<VRPlaneName>("XY");
  const vrTriadHost = useRef<VRTriadState["host"]>("free");
  const vrTriadAttachedTo = useRef<VRTriadState["attachedTo"] | undefined>(
    undefined,
  );
  const vrSceneRef = useRef(scene);
  const vrTriadGroupRef = useRef<THREE.Object3D | null>(null);
  const vrBeamState = useRef<VRBeamState>({
    origin: [0, 0, 0],
    direction: [0, 0, -1],
    distance: 1.0,
    target: [0, 0, -1],
  });
  const vrSetBeamRef = useRef<
    (
      origin: [number, number, number],
      direction: [number, number, number],
    ) => void
  >(() => {});

  useEffect(() => {
    vrSceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    const win = window as unknown as {
      __vrMechanics?: Record<string, unknown>;
    };

    const currentScene = () => vrSceneRef.current;

    const currentOrientation = (): [number, number, number, number] => {
      const group = currentScene()?.getObjectByName("vr-triad");
      if (!group) return [0, 0, 0, 1];
      return [
        group.quaternion.x,
        group.quaternion.y,
        group.quaternion.z,
        group.quaternion.w,
      ];
    };

    const currentPosition = (): [number, number, number] => {
      const group = currentScene()?.getObjectByName("vr-triad");
      if (!group) return [0, 1.5, 1.8];
      return [group.position.x, group.position.y, group.position.z];
    };

    const attachTriad = (
      sceneNow: THREE.Scene,
      position: [number, number, number],
      plane: VRPlaneName,
      host: VRTriadState["host"],
      attachedTo?: VRTriadState["attachedTo"],
      orientation: [number, number, number, number] = [0, 0, 0, 1],
    ) => {
      let group = sceneNow.getObjectByName("vr-triad");
      if (!group && vrTriadGroupRef.current) {
        group = vrTriadGroupRef.current;
        sceneNow.add(group);
      }
      if (!group) {
        group = ensureVrTriad(sceneNow, position, plane, orientation);
      } else {
        group.position.set(position[0], position[1], position[2]);
        group.quaternion.set(...orientation);
        syncVrTriad(group, plane);
      }
      vrTriadGroupRef.current = group;
      vrTriadHost.current = host;
      vrTriadAttachedTo.current = attachedTo;
      return group;
    };

    const readTriad = (
      sceneNow: THREE.Scene | null | undefined,
    ): VRTriadState => {
      if (!sceneNow)
        return {
          placed: false,
          host: vrTriadHost.current,
          position: [0, 0, 0],
          orientation: [0, 0, 0, 1],
          activePlane: vrTriadActivePlane.current,
          attachedTo: vrTriadAttachedTo.current,
        };
      if (!sceneNow.getObjectByName("vr-triad") && vrTriadGroupRef.current) {
        sceneNow.add(vrTriadGroupRef.current);
      }
      return triadStateFromScene(
        sceneNow,
        vrTriadActivePlane.current,
        vrTriadHost.current,
        vrTriadAttachedTo.current,
      );
    };

    const setBeam = (
      origin: [number, number, number],
      direction: [number, number, number],
    ) => {
      const o = new THREE.Vector3(...origin);
      const d = new THREE.Vector3(...direction).normalize();
      const target = o.clone().addScaledVector(d, vrBeamState.current.distance);
      vrBeamState.current = {
        origin: [o.x, o.y, o.z],
        direction: [d.x, d.y, d.z],
        distance: vrBeamState.current.distance,
        target: [target.x, target.y, target.z],
      };
      const sceneNow = currentScene();
      if (sceneNow) {
        const marker = ensureVrBeamMarker(sceneNow);
        marker.position.copy(target);
      }
    };
    vrSetBeamRef.current = setBeam;

    const serializeSubHit = (hit: SubPrimHit | null) => {
      if (!hit) return null;
      const id = String(
        hit.object.userData.id ??
          hit.object.userData.nodeId ??
          hit.object.name ??
          "unknown",
      );
      const resolved = resolveHitToTag(id, hit.tri);
      return {
        kind: hit.type,
        id,
        index: hit.index,
        position: [hit.position.x, hit.position.y, hit.position.z] as [
          number,
          number,
          number,
        ],
        normal: hit.normal
          ? ([hit.normal.x, hit.normal.y, hit.normal.z] as [
              number,
              number,
              number,
            ])
          : undefined,
        featureId: resolved?.featureId,
        faceTag: resolved?.faceTag,
      };
    };

    const castBeam = () => {
      const sceneNow = currentScene();
      if (!sceneNow) return null;
      const b = vrBeamState.current;
      const hit = subPrimSelectorRef.current.cast(
        new THREE.Vector3(...b.origin),
        new THREE.Vector3(...b.direction),
        sceneNow,
        b.distance,
      );
      vrSubSelection.current = hit;
      return hit;
    };

    win.__vrMechanics = {
      state: (): VRTriadState => readTriad(currentScene()),
      // --- Parameter panel control (edit a feature's params from VR/desk) ---
      openPanel: (featureId: string) => {
        const pp = paramPanelRef.current;
        if (!pp) return null;
        const panel = paramPanelForFeature(
          scadgenHistory.evaluatedNodes(),
          featureId,
        );
        if (!panel) return null;
        pp.show(panel);
        return { featureId, rows: panel.rows.length, label: panel.label };
      },
      closePanel: (): void => {
        paramPanelRef.current?.show(null);
      },
      panelRows: (featureId: string): PanelRow[] => {
        const panel = paramPanelForFeature(
          scadgenHistory.evaluatedNodes(),
          featureId,
        );
        return panel?.rows ?? [];
      },
      panelStep: (featureId: string, parameterId: string, delta: number) => {
        const pp = paramPanelRef.current;
        if (!pp) return null;
        const node = scadgenHistory.get(featureId);
        if (!node) return null;
        const panel = paramPanelForFeature(
          scadgenHistory.evaluatedNodes(),
          featureId,
        );
        const row = panel?.rows.find((r) => r.parameterId === parameterId);
        if (!row) return null;
        const next = Number(row.value) + delta;
        const param = panelEditToParameter(row, next);
        if (!param) return null;
        scadgenHistory.updateParameter(featureId, param);
        const refreshed = paramPanelForFeature(
          scadgenHistory.evaluatedNodes(),
          featureId,
        );
        if (refreshed) pp.refresh(refreshed);
        return next;
      },
      propertyPanel: (featureId: string) => {
        const panel = paramPanelForFeature(
          scadgenHistory.evaluatedNodes(),
          featureId,
        );
        if (!panel) return null;
        return panel.rows.map((r) => ({
          parameterId: r.parameterId,
          kind: r.kind,
          label: r.label,
          value: r.value,
          expression: r.expression,
          units: r.units,
          linkedVariable: r.linkedVariable,
          usingDefault: r.usingDefault,
        }));
      },
      // --- Flux chat panel control (the one per-file orchestrator window) ---
      // The scene pushes a session getter; the render loop reads it every
      // frame. One thread per file; VR is just another surface over it.
      setFluxSession: (g: () => { ref: string; rows: TraceRow[] }): void => {
        fluxSessionRef.current = g;
        const s = g();
        fluxChatPanelRef.current?.show(s.rows, s.ref);
      },
      subSelection: () => serializeSubHit(vrSubSelection.current),
      debugRaycast: () => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        const targets: THREE.Mesh[] = [];
        sceneNow.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.geometry && !obj.type.includes("Line"))
            targets.push(mesh);
        });
        const b = vrBeamState.current;
        const raycaster = new THREE.Raycaster(
          new THREE.Vector3(...b.origin),
          new THREE.Vector3(...b.direction),
          0,
          b.distance,
        );
        const raw = raycaster.intersectObjects(targets, false);
        const tagged: unknown[] = [];
        sceneNow.traverse((obj) => {
          const ud = obj.userData as Record<string, unknown>;
          if (ud.nodeId || ud.id) {
            tagged.push({
              type: obj.type,
              name: obj.name,
              visible: obj.visible,
              userData: Object.keys(ud),
              id: ud.id ?? ud.nodeId,
              pos: (() => {
                const p = obj.getWorldPosition(new THREE.Vector3());
                return [p.x, p.y, p.z];
              })(),
            });
          }
        });
        return {
          targetCount: targets.length,
          tagged,
          beam: b,
          targets: targets.map((m) => ({
            type: m.type,
            name: m.name,
            visible: m.visible,
            userData: Object.keys(m.userData),
            parentUserData: m.parent ? Object.keys(m.parent.userData) : [],
            pos: (() => {
              const p = m.getWorldPosition(new THREE.Vector3());
              return [p.x, p.y, p.z];
            })(),
          })),
          rawCount: raw.length,
          hits: raw.slice(0, 5).map((h) => ({
            name: h.object.name,
            type: h.object.type,
            userData: Object.keys(h.object.userData),
            parentUserData: h.object.parent
              ? Object.keys(h.object.parent.userData)
              : [],
            point: [h.point.x, h.point.y, h.point.z],
            distance: h.distance,
          })),
        };
      },
      hoverBeam: () => serializeSubHit(castBeam()),
      selectBeam: () => {
        const hit = castBeam();
        if (!hit) return null;
        const id = String(
          hit.object.userData.id ?? hit.object.userData.nodeId ?? "",
        );
        if (id) selectElementRef.current(id);
        return serializeSubHit(hit);
      },
      spawnFree: (
        position: [number, number, number] = [0, 1.5, 1.8],
        plane: VRPlaneName = "XY",
      ): VRTriadState | null => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        vrTriadActivePlane.current = plane;
        attachTriad(sceneNow, position, plane, "free", undefined, [0, 0, 0, 1]);
        return readTriad(sceneNow);
      },
      spawnTriad: (
        position: [number, number, number] = [0, 1.5, 1.8],
        plane: VRPlaneName = "XY",
      ): VRTriadState | null => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        vrTriadActivePlane.current = plane;
        attachTriad(sceneNow, position, plane, "free", undefined, [0, 0, 0, 1]);
        return readTriad(sceneNow);
      },
      spawnDesk: (): VRTriadState | null => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        vrTriadActivePlane.current = "XY";
        attachTriad(sceneNow, [0, 0.82, 0], "XY", "desk", {
          kind: "desk",
          point: [0, 0.82, 0],
          normal: [0, 1, 0],
        });
        return readTriad(sceneNow);
      },
      attachToFace: (
        point: [number, number, number] = [0, 0, 0],
        normal: [number, number, number] = [0, 0, 1],
        plane: VRPlaneName = "XY",
      ): VRTriadState | null => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        vrTriadActivePlane.current = plane;
        attachTriad(
          sceneNow,
          point,
          plane,
          "face",
          {
            kind: "face",
            point,
            normal,
          },
          quatFromNormal(normal),
        );
        return readTriad(sceneNow);
      },
      move: (
        position: [number, number, number] = [0, 1.5, 1.8],
      ): VRTriadState | null => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        attachTriad(
          sceneNow,
          position,
          vrTriadActivePlane.current,
          vrTriadHost.current,
          vrTriadAttachedTo.current,
          currentOrientation(),
        );
        return readTriad(sceneNow);
      },
      rotate: (
        orientation: [number, number, number, number] = [0, 0, 0, 1],
      ): VRTriadState | null => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        attachTriad(
          sceneNow,
          currentPosition(),
          vrTriadActivePlane.current,
          vrTriadHost.current,
          vrTriadAttachedTo.current,
          orientation,
        );
        return readTriad(sceneNow);
      },
      selectPlane: (plane: VRPlaneName = "XY"): VRTriadState | null => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        vrTriadActivePlane.current = plane;
        attachTriad(
          sceneNow,
          currentPosition(),
          plane,
          vrTriadHost.current,
          vrTriadAttachedTo.current,
          currentOrientation(),
        );
        return readTriad(sceneNow);
      },
      clear: (): VRTriadState | null => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        const group =
          sceneNow.getObjectByName("vr-triad") || vrTriadGroupRef.current;
        if (group) sceneNow.remove(group);
        vrTriadGroupRef.current = null;
        vrTriadHost.current = "free";
        vrTriadAttachedTo.current = undefined;
        return readTriad(sceneNow);
      },
      clearTriad: (): VRTriadState | null => {
        const sceneNow = currentScene();
        if (!sceneNow) return null;
        const group =
          sceneNow.getObjectByName("vr-triad") || vrTriadGroupRef.current;
        if (group) sceneNow.remove(group);
        vrTriadGroupRef.current = null;
        vrTriadHost.current = "free";
        vrTriadAttachedTo.current = undefined;
        return readTriad(sceneNow);
      },
      beamState: (): VRBeamState => vrBeamState.current,
      setBeamDistance: (distance = 1): VRBeamState => {
        vrBeamState.current.distance = distance;
        setBeam(vrBeamState.current.origin, vrBeamState.current.direction);
        return vrBeamState.current;
      },
    };

    return () => {
      delete win.__vrMechanics;
    };
  }, []);

  useEffect(() => {
    if (!("xr" in navigator) || !navigator.xr) {
      setVrSupported(false);
      return;
    }
    navigator.xr.isSessionSupported("immersive-vr").then((supported) => {
      setVrSupported(supported);
    });
  }, []);

  const enterVR = useCallback(async () => {
    if (!renderer || !scene || !navigator.xr) return;

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["hand-tracking", "bounded-floor"],
      });
      sessionRef.current = session;

      baseBackgroundRef.current = scene.background;
      scene.background = null;

      renderer.xr.enabled = true;
      await renderer.xr.setSession(session);
      setContinuousRender(true);

      // Room
      const room = buildVRRoom();
      roomRef.current = room;
      scene.add(room);

      // Picture-generated room (TripoSR from a canvas shot of this room).
      // Procedural room stays as the fallback; the GLB replaces its shell.
      void new GLTFLoader().load(
        "/vr/room.glb",
        (gltf) => {
          const model = gltf.scene;
          model.name = "vr-room-model";
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          // Backdrop relief on the far wall — the interior photo reconstructs
          // as one solid, so it decorates the room, it is not the room.
          const s = 2.4 / Math.max(size.x, size.z, 1e-6);
          model.scale.setScalar(s);
          box.setFromObject(model);
          const c = box.getCenter(new THREE.Vector3());
          model.position.set(-c.x, 1.5 - c.y, -2.3 - c.z);
          room.add(model);
          (
            window as unknown as { __vrRoomModelReady?: boolean }
          ).__vrRoomModelReady = true;
        },
        undefined,
        () => {
          /* no generated room file — keep procedural shell */
        },
      );

      // VR Controls
      const vrControls = buildVRControls();
      controlsRef.current = vrControls;
      scene.add(vrControls.group);

      // Grab system
      const grabSystem = createVRGrabSystem();
      grabSystemRef.current = grabSystem;

      // Sketch system — use the render-refreshed ref so point snapping sees live data
      const activeSketchRef = activeSketchRef2;
      const sketchSystem = createVRSketchSystem(
        (prim) => addPrimitiveRef.current(prim as any),
        (constraint) => {
          void addConstraintAndSolveRef.current(constraint as any);
        },
        async () => {
          await solveSketchRef.current();
        },
        () => pushSketchUndoRef.current(),
        activeSketchRef,
      );
      sketchSystemRef.current = sketchSystem;

      // Desk sketching visuals: grid on desk + overhead PiP (VR_SKETCH_SPEC Part 2)
      const deskVisuals: DeskSketchVisuals = createDeskSketchVisuals(
        scene,
        renderer,
      );
      deskVisualsRef.current = deskVisuals;

      // Parameter panel — floating, raycast-editable feature params
      paramPanelRef.current = createVRParamPanel(scene);

      // Flux copilot panel — the floating one-thread orchestrator window
      // (twin of the desk OrchestratorView). Positioned top-right at eye
      // height so it doesn't collide with the desk work area; faces the
      // player's initial spawn orientation.
      const fluxPanel = createVRChatPanel(scene);
      fluxPanel.show([], "scadgen-file");
      fluxPanel.mesh.position.set(0.95, 1.62, -1.5);
      fluxPanel.mesh.lookAt(0, 1.6, 0);
      fluxChatPanelRef.current = fluxPanel;

      // Hide origin helpers
      hiddenInVR.current = [];
      scene.traverse((child) => {
        if (child.userData?.isOriginHelper && child.visible) {
          child.visible = false;
          hiddenInVR.current.push(child);
        }
      });

      playerOffset.current.set(0, 0, 0);
      lastTime.current = performance.now();

      const headDir = new THREE.Vector3();
      const cam = renderer.xr.getCamera();

      const onSessionEnd = () => {
        renderer.setAnimationLoop(null);
        renderer.xr.enabled = false;

        if (roomRef.current) {
          scene.remove(roomRef.current);
          disposeVRRoom(roomRef.current);
          roomRef.current = null;
        }
        if (controlsRef.current) {
          scene.remove(controlsRef.current.group);
          controlsRef.current = null;
        }

        scene.background = baseBackgroundRef.current;
        baseBackgroundRef.current = null;

        for (const obj of hiddenInVR.current) obj.visible = true;
        hiddenInVR.current = [];

        playerOffset.current.set(0, 0, 0);
        carouselRotation.current = 0;
        carouselIndex.current = 0;
        lastBackButtonPress.current = 0;
        grabSystemRef.current = null;
        gripWasPressed.current = false;
        if (sketchSystemRef.current) {
          if (sketchSystemRef.current.state.previewLine) {
            scene.remove(sketchSystemRef.current.state.previewLine);
          }
          sketchSystemRef.current.dispose();
          sketchSystemRef.current = null;
        }
        sketchGripWasPressed.current = false;
        sketchTriggerWasPressed.current = false;
        leftGripWasPressed.current = false;
        rightGripWasPressed.current = false;

        if (deskVisualsRef.current) {
          deskVisualsRef.current.dispose();
          deskVisualsRef.current = null;
        }
        if (paramPanelRef.current) {
          paramPanelRef.current.dispose();
          paramPanelRef.current = null;
        }
        if (fluxChatPanelRef.current) {
          fluxChatPanelRef.current.dispose();
          fluxChatPanelRef.current = null;
        }

        sessionRef.current = null;
        setContinuousRender(false);
        setInVR(false);
      };

      session.addEventListener("end", onSessionEnd);

      renderer.setAnimationLoop((_timestamp, xrFrame) => {
        if (!xrFrame) {
          renderer.render(scene, cam);
          return;
        }

        // Flux chat panel — redraw from the scene's live session getter every
        // frame (same thread the desk / voice / bus surfaces feed).
        if (fluxChatPanelRef.current && fluxSessionRef.current) {
          const s = fluxSessionRef.current();
          fluxChatPanelRef.current.refresh(s.rows);
        }

        renderer.xr.updateCamera(cam);

        const refSpace = renderer.xr.getReferenceSpace();

        // === VR SKETCH MODE ===
        if (
          sketchSystemRef.current &&
          sketchSystemRef.current.state.phase !== "idle" &&
          refSpace
        ) {
          const sketch = sketchSystemRef.current;

          if (sketch.state.phase === "selecting-plane") {
            let rightHandPos: THREE.Vector3 | null = null;
            let rightHandQuat: THREE.Quaternion | null = null;

            for (const source of session.inputSources) {
              if (!source.targetRaySpace || source.handedness !== "right")
                continue;
              const pose = xrFrame.getPose(source.targetRaySpace, refSpace);
              if (!pose) continue;
              rightHandPos = new THREE.Vector3(
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z,
              );
              rightHandQuat = new THREE.Quaternion(
                pose.transform.orientation.x,
                pose.transform.orientation.y,
                pose.transform.orientation.z,
                pose.transform.orientation.w,
              );
              break;
            }

            if (rightHandPos && rightHandQuat) {
              const triggerPressed = (() => {
                for (const source of session.inputSources) {
                  if (source.handedness === "right" && source.gamepad)
                    return source.gamepad.buttons[0]?.pressed ?? false;
                }
                return false;
              })();

              const handDir = new THREE.Vector3(0, 0, -1).applyQuaternion(
                rightHandQuat,
              );
              const target = sketch.classifyRayTarget(
                rightHandPos,
                handDir,
                scene,
              );

              // Live hover feedback of the classified ray target
              sketch.updateTargetMarker(target);
              if (
                sketch.state.targetMarker &&
                !sketch.state.targetMarker.parent
              ) {
                scene.add(sketch.state.targetMarker);
              }

              if (triggerPressed && !sketchTriggerWasPressed.current) {
                sketch.clearTargetMarker();
                if (target.kind === "body-face") {
                  startSketchRef.current(target.plane);
                  sketch.beginSketchOnPlane(target.plane, "face");
                } else if (target.kind === "desk") {
                  const plane = createSketchPlane(
                    "XZ",
                    new THREE.Vector3(0, DESK_HEIGHT, 0),
                  );
                  startSketchRef.current(plane);
                  sketch.beginSketchOnPlane(plane, "desk");
                } else if (target.kind === "origin-plane") {
                  const plane = createSketchPlane(target.planeType);
                  startSketchRef.current(plane);
                  sketch.beginSketchOnPlane(plane, "origin");
                } else {
                  // 3D freehand: plane facing the hand, 0.4m ahead
                  const planeOrigin = rightHandPos
                    .clone()
                    .addScaledVector(handDir, 0.4);
                  const plane = createSketchPlaneFromNormal(
                    handDir.clone().negate(),
                    planeOrigin,
                  );
                  startSketchRef.current(plane);
                  sketch.beginSketchOnPlane(plane, "freehand");
                }
              }
              sketchTriggerWasPressed.current = triggerPressed;
            }
          }

          if (sketch.state.phase === "drawing") {
            let leftGrip = false;
            let rightGrip = false;
            let rightHandPos: THREE.Vector3 | null = null;
            let rightPointQuat: THREE.Quaternion | null = null;

            for (const source of session.inputSources) {
              if (!source.gripSpace || !source.gamepad) continue;
              const gripVal =
                source.gamepad.buttons[GRIP_BUTTON_INDEX]?.pressed ?? false;
              if (source.handedness === "left") leftGrip = gripVal;
              if (source.handedness === "right") {
                rightGrip = gripVal;
                const gripPose = xrFrame.getPose(source.gripSpace, refSpace);
                if (gripPose) {
                  rightHandPos = new THREE.Vector3(
                    gripPose.transform.position.x,
                    gripPose.transform.position.y,
                    gripPose.transform.position.z,
                  );
                }
                if (source.targetRaySpace) {
                  const rayPose = xrFrame.getPose(
                    source.targetRaySpace,
                    refSpace,
                  );
                  if (rayPose) {
                    rightPointQuat = new THREE.Quaternion(
                      rayPose.transform.orientation.x,
                      rayPose.transform.orientation.y,
                      rayPose.transform.orientation.z,
                      rayPose.transform.orientation.w,
                    );
                  }
                }
              }
            }

            // Both grips = axis snapping
            if (leftGrip && rightGrip) {
              if (!sketch.state.axisSnapAxis) {
                if (rightHandPos) {
                  const dy = Math.abs(
                    rightHandPos.y -
                      (sketch.state.lastPointWorld?.y ?? rightHandPos.y),
                  );
                  const dx = Math.abs(
                    rightHandPos.x -
                      (sketch.state.lastPointWorld?.x ?? rightHandPos.x),
                  );
                  const dz = Math.abs(
                    rightHandPos.z -
                      (sketch.state.lastPointWorld?.z ?? rightHandPos.z),
                  );
                  if (dy > dx && dy > dz) sketch.setAxisSnap("y");
                  else if (dx > dz) sketch.setAxisSnap("x");
                  else sketch.setAxisSnap("z");
                }
              }
            } else {
              sketch.setAxisSnap(null);
            }

            // Right hand for drawing
            if (rightHandPos && rightPointQuat) {
              const triggerPressed = (() => {
                for (const source of session.inputSources) {
                  if (source.handedness === "right" && source.gamepad) {
                    return source.gamepad.buttons[0]?.pressed ?? false;
                  }
                }
                return false;
              })();

              const handDir = new THREE.Vector3(0, 0, -1).applyQuaternion(
                rightPointQuat,
              );
              const context = sketch.state.sketchingContext;

              // Plane-locked contexts (desk/face/origin): trigger places points at ray landing
              if (
                context === "desk" ||
                context === "face" ||
                context === "origin"
              ) {
                const rawPoint = sketch.rayToSketchPoint(rightHandPos, handDir);
                if (rawPoint) {
                  if (triggerPressed && !sketchTriggerWasPressed.current) {
                    const placePos =
                      sketch.state.axisSnapAxis && sketch.state.lastPointWorld
                        ? sketch.projectWithAxisSnap(
                            rawPoint,
                            sketch.state.lastPointWorld,
                          )
                        : rawPoint;
                    const pointResult = sketch.placePoint(placePos);
                    if (sketch.state.isChaining && sketch.state.lastPointId) {
                      sketch.connectLine(
                        sketch.state.lastPointId,
                        pointResult.pointId,
                      );
                    }
                    sketch.state.isChaining = true;
                    sketch.state.lastPointId = pointResult.pointId;
                    sketch.state.lastPointWorld = placePos.clone();
                  }
                  if (sketch.state.isChaining) {
                    const previewTarget =
                      sketch.state.axisSnapAxis && sketch.state.lastPointWorld
                        ? sketch.projectWithAxisSnap(
                            rawPoint,
                            sketch.state.lastPointWorld,
                          )
                        : rawPoint;
                    sketch.updatePreview(previewTarget);
                    if (
                      sketch.state.previewLine &&
                      !sketch.state.previewLine.parent
                    ) {
                      scene.add(sketch.state.previewLine);
                    }
                  }
                }
              }

              // 3D FREEHAND: grip press starts a stroke, drag defines it,
              // release commits the point (VR_SKETCH_SPEC Part 3)
              if (context === "freehand") {
                if (rightGrip && !sketchGripWasPressed.current) {
                  if (sketch.state.isChaining && sketch.state.lastPointId) {
                    freehandStrokePending.current = true;
                  } else {
                    const placePos =
                      sketch.state.axisSnapAxis && sketch.state.lastPointWorld
                        ? sketch.projectWithAxisSnap(
                            rightHandPos,
                            sketch.state.lastPointWorld,
                          )
                        : sketch.projectToSketchPlane(rightHandPos);
                    const pointResult = sketch.placePoint(placePos);
                    sketch.state.isChaining = true;
                    sketch.state.lastPointId = pointResult.pointId;
                    sketch.state.lastPointWorld = placePos.clone();
                  }
                }
                if (
                  !rightGrip &&
                  sketchGripWasPressed.current &&
                  freehandStrokePending.current
                ) {
                  freehandStrokePending.current = false;
                  const placePos =
                    sketch.state.axisSnapAxis && sketch.state.lastPointWorld
                      ? sketch.projectWithAxisSnap(
                          rightHandPos,
                          sketch.state.lastPointWorld,
                        )
                      : sketch.projectToSketchPlane(rightHandPos);
                  const pointResult = sketch.placePoint(placePos);
                  if (sketch.state.isChaining && sketch.state.lastPointId) {
                    sketch.connectLine(
                      sketch.state.lastPointId,
                      pointResult.pointId,
                    );
                  }
                  sketch.state.lastPointId = pointResult.pointId;
                  sketch.state.lastPointWorld = placePos.clone();
                }
                if (sketch.state.isChaining) {
                  const previewTarget =
                    sketch.state.axisSnapAxis && sketch.state.lastPointWorld
                      ? sketch.projectWithAxisSnap(
                          rightHandPos,
                          sketch.state.lastPointWorld,
                        )
                      : sketch.projectToSketchPlane(rightHandPos);
                  sketch.updatePreview(previewTarget);
                  if (
                    sketch.state.previewLine &&
                    !sketch.state.previewLine.parent
                  ) {
                    scene.add(sketch.state.previewLine);
                  }
                }
              }

              sketchGripWasPressed.current = rightGrip;
              sketchTriggerWasPressed.current = triggerPressed;
            }

            // FINISH: both triggers pressed while both grips held
            let leftTrigger = false;
            let rightTrigger = false;
            for (const source of session.inputSources) {
              if (!source.gamepad) continue;
              const trig = source.gamepad.buttons[0]?.pressed ?? false;
              if (source.handedness === "left") leftTrigger = trig;
              if (source.handedness === "right") rightTrigger = trig;
            }
            if (leftGrip && rightGrip && leftTrigger && rightTrigger) {
              lastSketchHistoryRef.current = sketch.getFeatureHistoryNode();
              if (lastSketchHistoryRef.current) {
                scadgenHistory.add(lastSketchHistoryRef.current);
              }
              debugLog(
                lastSketchHistoryRef.current
                  ? `HISTORY: ${lastSketchHistoryRef.current.featureId} (${lastSketchHistoryRef.current.parameters.length} params) | tree=${scadgenHistory.size()}`
                  : "HISTORY: no node (empty sketch?)",
              );
              freehandStrokePending.current = false;
              sketch.finishChain();
              if (sketch.state.previewLine?.parent) {
                scene.remove(sketch.state.previewLine);
              }
              sketch.clearPreview();
              sketch.clearTargetMarker();
              sketch.setPhase("idle");
              if (lastSketchHistoryRef.current) {
                pendingSketchMapping.current = {
                  featureId: lastSketchHistoryRef.current.featureId,
                  before: new Set(elementsRef.current.map((el) => el.nodeId)),
                };
              }
              void finishSketchRef.current();
              setModeRef.current("move");
            }

            // CANCEL: left grip double-click
            if (leftGrip && !leftGripWasPressed.current) {
              const now2 = Date.now();
              if (now2 - lastBackButtonPress.current < 300) {
                if (sketch.state.previewLine?.parent) {
                  scene.remove(sketch.state.previewLine);
                }
                lastSketchHistoryRef.current = null;
                freehandStrokePending.current = false;
                sketch.cancelSketch();
                cancelSketchRef.current();
                setModeRef.current("move");
              }
              lastBackButtonPress.current = now2;
            }
            leftGripWasPressed.current = leftGrip;
            rightGripWasPressed.current = rightGrip;
          }
        } else if (
          sketchSystemRef.current &&
          sketchSystemRef.current.state.phase !== "idle"
        ) {
          if (sketchSystemRef.current.state.previewLine?.parent) {
            scene.remove(sketchSystemRef.current.state.previewLine);
          }
          sketchSystemRef.current.cancelSketch();
        }

        // === LOCOMOTION ===
        const now = performance.now();
        const dt = Math.min((now - lastTime.current) / 1000, 0.05);
        lastTime.current = now;

        // Basic locomotion without collision (for debugging)
        let stickX = 0;
        let stickY = 0;

        for (const source of session.inputSources) {
          const axes = source.gamepad?.axes;
          if (!axes) continue;

          // Prefer thumbstick (2/3), fall back to touchpad (0/1) for other mappings
          const x = axes[2] ?? axes[0] ?? 0;
          const y = axes[3] ?? axes[1] ?? 0;

          // Take whichever controller is actually deflected, preferring left
          if (Math.abs(x) + Math.abs(y) > Math.abs(stickX) + Math.abs(stickY)) {
            stickX = x;
            stickY = y;
          }
          if (
            source.handedness === "left" &&
            (Math.abs(x) > 0 || Math.abs(y) > 0)
          ) {
            stickX = x;
            stickY = y;
            break;
          }
        }

        // Deadzone to stop drift from resting stick noise
        const DEADZONE = 0.15;
        const mag = Math.hypot(stickX, stickY);
        if (mag > DEADZONE) {
          // Rescale so motion ramps from 0 at the deadzone edge
          const scaled = (mag - DEADZONE) / (1 - DEADZONE) / mag;
          stickX *= scaled;
          stickY *= scaled;

          // Head-relative movement: flatten camera basis onto the XZ plane
          const yaw = Math.atan2(
            2 *
              (cam.quaternion.w * cam.quaternion.y +
                cam.quaternion.x * cam.quaternion.z),
            1 -
              2 *
                (cam.quaternion.y * cam.quaternion.y +
                  cam.quaternion.x * cam.quaternion.x),
          );
          const sin = Math.sin(yaw);
          const cos = Math.cos(yaw);

          // forward = (-sin, -cos), right = (cos, -sin); stick +Y is pull-back
          const dx = (stickX * cos + stickY * sin) * MOVE_SPEED * dt;
          const dz = (-stickX * sin + stickY * cos) * MOVE_SPEED * dt;

          // --- COLLISION ---
          // Room translates opposite the player, so the player's position in
          // room space is -playerOffset. Resolve there, then map back.
          const curX = -playerOffset.current.x;
          const curZ = -playerOffset.current.z;

          // Walls: clamp to room half-extent minus body radius
          let nextX = Math.max(-WALL_LIMIT, Math.min(WALL_LIMIT, curX + dx));
          let nextZ = Math.max(-WALL_LIMIT, Math.min(WALL_LIMIT, curZ + dz));

          // Desk: solid from floor to 0.75m, and a standing body always spans
          // that range, so block the footprint. Skip if already inside it —
          // the desk is centred on the origin where local-floor spawns you,
          // so without this escape hatch you would be trapped at start.
          const insideDesk = (x: number, z: number) =>
            Math.abs(x) < DESK_BLOCK_X && Math.abs(z) < DESK_BLOCK_Z;

          if (!insideDesk(curX, curZ)) {
            // Axis-separated resolution so you slide along the edge instead
            // of stopping dead when you graze it.
            if (insideDesk(nextX, curZ)) nextX = curX;
            if (insideDesk(nextX, nextZ)) nextZ = curZ;
          }

          playerOffset.current.x = -nextX;
          playerOffset.current.z = -nextZ;

          if (roomRef.current) {
            roomRef.current.position.copy(playerOffset.current);
          }
          if (controlsRef.current) {
            controlsRef.current.group.position.copy(playerOffset.current);
          }
        }

        // === GAZE TRACKING ===
        if (controlsRef.current) {
          const ctrl = controlsRef.current;
          headDir.set(0, 0, -1).applyQuaternion(cam.quaternion);

          const lookingUp = ctrl.isLookingUp(headDir);
          const lookingDown = ctrl.isLookingDown(headDir);

          ctrl.headMenu.visible = lookingUp;
          if (lookingUp) {
            ctrl.updateHeadMenu(cam.quaternion, cam.position);
          }

          ctrl.carousel.visible = lookingDown;
          debugLog(`BELT VISIBLE: ${lookingDown}`);
          if (lookingDown) {
            ctrl.updateCarousel(
              cam.quaternion,
              cam.position,
              playerOffset.current,
              carouselRotation.current,
              carouselIndex.current,
            );

            const refSpace2 = renderer.xr.getReferenceSpace();

            // Grip-based belt scrolling: grip the belt, turn your hand to scroll it
            for (const source of session.inputSources) {
              if (!source.gripSpace || !source.gamepad || !refSpace2) continue;
              const gripPressed =
                source.gamepad.buttons[GRIP_BUTTON_INDEX]?.pressed ?? false;
              const pose = xrFrame.getPose(source.gripSpace, refSpace2);
              if (!pose) continue;

              const handPos = new THREE.Vector3(
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z,
              );

              const WAIST_HEIGHT = 0.8;
              const distToWaist = Math.abs(handPos.y - WAIST_HEIGHT);
              const horizontalDist = Math.sqrt(
                (handPos.x - cam.position.x) ** 2 +
                  (handPos.z - cam.position.z) ** 2,
              );

              if (distToWaist < 0.25 && horizontalDist < 0.35) {
                const handAngle = Math.atan2(
                  handPos.z - cam.position.z,
                  handPos.x - cam.position.x,
                );

                if (gripPressed && !beltGripActive.current) {
                  beltGripActive.current = true;
                  beltGripPrevAngle.current = handAngle;
                }

                if (gripPressed && beltGripActive.current) {
                  let delta = handAngle - beltGripPrevAngle.current;
                  if (delta > Math.PI) delta -= Math.PI * 2;
                  if (delta < -Math.PI) delta += Math.PI * 2;
                  carouselRotation.current -= delta;
                  beltGripPrevAngle.current = handAngle;

                  const totalItems = ctrl.carousel.children.length;
                  const anglePerItem = (Math.PI * 2) / totalItems;
                  const currentAngle =
                    ((carouselRotation.current % (Math.PI * 2)) + Math.PI * 2) %
                    (Math.PI * 2);
                  carouselIndex.current =
                    Math.round(currentAngle / anglePerItem) % totalItems;
                }

                if (!gripPressed && beltGripActive.current) {
                  beltGripActive.current = false;
                }

                break;
              }
            }

            // LEFT-HAND ORB HOVER: angle-based, like a clock position
            // Orb floats above/near the ring → nearest segment by angle wins
            // L3 (left thumbstick click) selects the hovered segment
            let hoveredButtonIndex = -1;
            let leftHandWorld: THREE.Vector3 | null = null;
            let l3Pressed = false;

            for (const source of session.inputSources) {
              if (
                source.handedness !== "left" ||
                !source.gripSpace ||
                !refSpace2
              )
                continue;
              const pose = xrFrame.getPose(source.gripSpace, refSpace2);
              if (!pose) continue;
              leftHandWorld = new THREE.Vector3(
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z,
              );
              if (source.gamepad) {
                // Quest 2 (oculus-touch profile): buttons[2] = thumbstick click = L3
                // buttons[3] = X button — fallback in case runtime shifts indices
                l3Pressed =
                  (source.gamepad.buttons[2]?.pressed ?? false) ||
                  (source.gamepad.buttons[3]?.pressed ?? false);
              }
              break;
            }

            if (leftHandWorld) {
              debugLog(
                `BELT DEBUG: leftHandWorld=${leftHandWorld.x.toFixed(2)},${leftHandWorld.y.toFixed(2)},${leftHandWorld.z.toFixed(2)} l3Pressed=${l3Pressed} hoveredButtonIndex=${hoveredButtonIndex}`,
              );
              // Belt world center = controls group pos + carousel local pos
              const beltCenter = playerOffset.current
                .clone()
                .add(ctrl.carousel.position);
              const theta = carouselRotation.current; // carousel.rotation.y
              const cosT = Math.cos(theta);
              const sinT = Math.sin(theta);
              const totalItems = ctrl.carousel.children.length;

              // Hand offset from belt center
              const hx = leftHandWorld.x - beltCenter.x;
              const hy = leftHandWorld.y - beltCenter.y;
              const hz = leftHandWorld.z - beltCenter.z;

              // Hover zone: orb above or near the ring — forgiving vertically
              const verticalDist = Math.abs(hy);
              const horizDist = Math.sqrt(hx * hx + hz * hz);

              if (verticalDist < 0.5 && horizDist < 0.6) {
                // Undo the carousel's Y rotation to get hand angle in belt-local space
                const lx = hx * cosT - hz * sinT;
                const lz = hx * sinT + hz * cosT;
                // Segment i center sits at local angle a where pos = (cos a * R, 0, -sin a * R)
                const localAngle = Math.atan2(-lz, lx);
                const anglePerItem = (Math.PI * 2) / totalItems;
                let idx = Math.round(localAngle / anglePerItem) % totalItems;
                if (idx < 0) idx += totalItems;
                hoveredButtonIndex = idx;
                carouselIndex.current = idx;
                lastHoveredButtonIndex.current = idx;
              }

              // L3 selects the hovered segment
              if (hoveredButtonIndex >= 0 && l3Pressed) {
                const currentTime = Date.now();
                if (
                  currentTime - lastButtonPressTime.current >=
                  BUTTON_PRESS_COOLDOWN
                ) {
                  const selectedButton =
                    ctrl.carousel.children[hoveredButtonIndex];
                  if (selectedButton) {
                    const actionName = selectedButton.userData.actionName as
                      | string
                      | undefined;
                    const featureType = selectedButton.userData.featureType as
                      | string
                      | undefined;
                    const result = buildVRNodeOrMode(
                      featureType ?? actionName ?? "",
                      actionName ?? "",
                    );
                    if (result?.kind === "mode") {
                      setModeRef.current(result.mode);
                      debugLog(`VR MODE: ${result.mode}`);
                    } else if (result?.kind === "node") {
                      vrActionArmed.current = featureType ?? actionName ?? "";
                      debugLog(
                        `VR ${(featureType ?? actionName ?? "").toUpperCase()} ARMED: pull trigger`,
                      );
                    } else {
                      debugLog(
                        `VR ${actionName ?? ""}: no buildable node or mode`,
                      );
                    }
                    lastButtonPressTime.current = currentTime;
                  }
                }
              }
            }
          }

          let pencilVisible = false;
          const refSpace = renderer.xr.getReferenceSpace();
          for (const source of session.inputSources) {
            if (source.handedness !== "right") continue;
            if (!source.gripSpace || !refSpace) continue;
            const grip = xrFrame.getPose(source.gripSpace, refSpace);
            if (!grip) continue;
            const handPos = new THREE.Vector3(
              grip.transform.position.x,
              grip.transform.position.y,
              grip.transform.position.z,
            );
            if (
              ctrl.isReachingBehindEar(handPos, cam.position, cam.quaternion)
            ) {
              pencilVisible = true;
              const rightEar = new THREE.Vector3(0.1, 0.1, -0.05)
                .applyQuaternion(cam.quaternion)
                .add(cam.position);
              ctrl.pencil.position.copy(rightEar);
              ctrl.pencil.quaternion.copy(cam.quaternion);
            }
          }
          ctrl.pencil.visible = pencilVisible;
        }

        // === CONTROLLER VISUALIZATION ===
        if (controlsRef.current) {
          const ctrl = controlsRef.current;
          const refSpace = renderer.xr.getReferenceSpace();

          if (refSpace) {
            for (const source of session.inputSources) {
              if (!source.targetRaySpace) continue;
              // targetRaySpace: -Z is GUARANTEED to be the pointing direction (WebXR spec)
              const pose = xrFrame.getPose(source.targetRaySpace, refSpace);
              if (!pose) continue;

              const handPos = new THREE.Vector3(
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z,
              );
              const handQuat = new THREE.Quaternion(
                pose.transform.orientation.x,
                pose.transform.orientation.y,
                pose.transform.orientation.z,
                pose.transform.orientation.w,
              );

              // Convert world position to controls group local space
              const localHandPos = handPos.clone().sub(playerOffset.current);

              const ray =
                source.handedness === "left" ? ctrl.leftRay : ctrl.rightRay;
              ray.position.copy(localHandPos);
              ray.quaternion.copy(handQuat);

              if (source.handedness === "right") {
                const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
                  handQuat,
                );
                vrSetBeamRef.current(
                  [handPos.x, handPos.y, handPos.z],
                  [dir.x, dir.y, dir.z],
                );
              }
            }
          }
        }

        // === GRAB SYSTEM (mode-independent) ===
        if (grabSystemRef.current) {
          const grab = grabSystemRef.current;
          const refSpace = renderer.xr.getReferenceSpace();
          if (refSpace) {
            // Find the primary grab controller (prefer right hand)
            let grabSource: XRInputSource | null = null;
            let grabPose: XRPose | null = null;
            for (const source of session.inputSources) {
              if (!source.gripSpace || !source.gamepad) continue;
              const pose = xrFrame.getPose(source.gripSpace, refSpace);
              if (!pose) continue;
              if (
                source.handedness === "right" ||
                (!grabSource && source.handedness === "left")
              ) {
                grabSource = source;
                grabPose = pose;
              }
            }

            if (grabSource && grabPose && scene) {
              const gripPressed =
                grabSource.gamepad?.buttons[GRIP_BUTTON_INDEX]?.pressed ??
                false;

              const handPos = new THREE.Vector3(
                grabPose.transform.position.x,
                grabPose.transform.position.y,
                grabPose.transform.position.z,
              );
              const handQuat = new THREE.Quaternion(
                grabPose.transform.orientation.x,
                grabPose.transform.orientation.y,
                grabPose.transform.orientation.z,
                grabPose.transform.orientation.w,
              );

              // Grab on press
              if (
                gripPressed &&
                !gripWasPressed.current &&
                !grab.state.heldObjectId
              ) {
                const handDir = new THREE.Vector3(0, 0, -1).applyQuaternion(
                  handQuat,
                );
                const grabbedId = grab.tryGrab(handPos, handDir, scene);
                if (grabbedId) {
                  selectElementRef.current(grabbedId);
                  assemblyBridgeRef.current?.onGrab?.(grabbedId);
                }
              }

              // Release on release
              if (
                !gripPressed &&
                gripWasPressed.current &&
                grab.state.heldObjectId
              ) {
                const heldId = grab.state.heldObjectId;
                grab.release();
                if (heldId) {
                  deselectElementRef.current(heldId);
                  assemblyBridgeRef.current?.onRelease?.();
                }
              }

              // Update position while held
              if (grab.state.heldObjectId) {
                grab.updateHeldPosition(handPos, handQuat);
              }

              gripWasPressed.current = gripPressed;
            }
          }
        }

        // VR belt-armed: right trigger commits the armed featureType via
        // buildVRNodeOrMode (extrude, revolve, sweep, loft, fillet, chamfer,
        // mirror). Sketch/shell/measure are applied immediately as modes in
        // the carousel handler above.
        const armed = vrActionArmed.current !== null;
        if (armed) {
          let rTrig = false;
          for (const source of session.inputSources) {
            if (source.handedness === "right" && source.gamepad) {
              rTrig = source.gamepad.buttons[0]?.pressed ?? false;
            }
          }
          if (rTrig && !extrudeTriggerWasPressed.current) {
            const featureType = vrActionArmed.current;
            vrActionArmed.current = null;
            if (featureType) {
              const node = buildVRNode(
                featureType,
                featureType.charAt(0).toUpperCase() + featureType.slice(1),
              );
              if (node) {
                scadgenHistory.add(node);
                debugLog(`VR ${featureType}: node added, rebuild queued`);
              } else {
                debugLog(
                  `VR ${featureType}: could not build (needs a selected sketch/body/edge first)`,
                );
              }
            }
          }
          extrudeTriggerWasPressed.current = rTrig;
        }

        // Desk sketch visuals (Part 2): grid + overhead PiP fade by head pitch
        const deskViz = deskVisualsRef.current;
        if (deskViz) {
          const sk = sketchSystemRef.current;
          const prims =
            (activeSketchRef.current?.primitives as unknown as
              | SketchPrimitiveLite[]
              | undefined) ?? null;
          deskViz.syncSketch(
            sk?.state.phase ?? "idle",
            sk?.state.sketchingContext ?? null,
            sk?.state.sketchPlane ?? null,
            prims,
          );
          deskViz.updateHeadPitch(
            renderer.xr.isPresenting ? renderer.xr.getCamera() : cam,
          );
          deskViz.renderPiP();
        }

        renderer.render(scene, cam);
      });

      setInVR(true);
    } catch (err) {
      console.error("VR session failed:", err);
    }
  }, [renderer, scene]);

  const exitVR = useCallback(() => {
    const session = sessionRef.current;
    if (session) session.end();
  }, []);

  return {
    inVR,
    vrSupported,
    enterVR,
    exitVR,
    lastSketchHistoryRef,
    assemblyBridgeRef,
  };
}
