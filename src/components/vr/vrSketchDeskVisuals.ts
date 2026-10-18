import * as THREE from "three";
import type { SketchPlane } from "@vitekk02/cadjs";
import type { VRSketchContext, VRSketchPhase } from "./vrSketchSystem";

// Must match vrSketchSystem DESK_HEIGHT and buildVRRoom desk footprint
const DESK_HEIGHT = 0.75;
const DESK_HALF_X = 1.6 / 2;
const DESK_HALF_Z = 0.8 / 2;

// PiP panel: world placement above/behind the user's default stance, tilted down
const PIP_SIZE = new THREE.Vector2(0.6, 0.45);
const PIP_POSITION = new THREE.Vector3(0, 1.95, -0.85);
const PIP_TILT_X = THREE.MathUtils.degToRad(35);
const PIP_RT_SIZE = new THREE.Vector2(768, 576);

// PiP content shows the full desk footprint top-down, with margin
const PIP_WORLD_SPAN_X = DESK_HALF_X * 2 + 0.3;
const PIP_WORLD_SPAN_Z = DESK_HALF_Z * 2 + 0.3;

// Head pitch (radians) needed before the PiP fades in / out
const PIP_PITCH_ON = THREE.MathUtils.degToRad(12);
const PIP_PITCH_OFF = THREE.MathUtils.degToRad(4);

export interface SketchPrimitiveLite {
  id: string;
  type: string;
  x?: number;
  y?: number;
  p1Id?: string;
  p2Id?: number | string;
  centerId?: string;
  radius?: number;
}

export interface DeskSketchVisuals {
  syncSketch: (
    phase: VRSketchPhase,
    context: VRSketchContext | null,
    plane: SketchPlane | null,
    primitives: SketchPrimitiveLite[] | null,
  ) => void;
  updateHeadPitch: (camera: THREE.Camera) => void;
  renderPiP: () => void;
  dispose: () => void;
}

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 72px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffe08a";
    ctx.fillText(text, 128, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.14, 0.07, 1);
  return sprite;
}

export function createDeskSketchVisuals(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): DeskSketchVisuals {
  // ---- Desk grid (XZ plane at desk height) ----
  const gridGroup = new THREE.Group();
  gridGroup.name = "vr-desk-grid";
  gridGroup.visible = false;
  {
    const minor: number[] = [];
    const major: number[] = [];
    const push = (
      arr: number[],
      x1: number,
      z1: number,
      x2: number,
      z2: number,
    ) => {
      arr.push(x1, 0, z1, x2, 0, z2);
    };
    for (let x = -DESK_HALF_X; x <= DESK_HALF_X + 1e-6; x += 0.05) {
      const isMajor = Math.abs((x / 0.25) % 1) < 1e-6;
      push(isMajor ? major : minor, x, -DESK_HALF_Z, x, DESK_HALF_Z);
    }
    for (let z = -DESK_HALF_Z; z <= DESK_HALF_Z + 1e-6; z += 0.05) {
      const isMajor = Math.abs((z / 0.25) % 1) < 1e-6;
      push(isMajor ? major : minor, -DESK_HALF_X, z, DESK_HALF_X, z);
    }
    const mk = (pts: number[], color: number, opacity: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const lines = new THREE.LineSegments(geo, mat);
      lines.renderOrder = 5;
      return lines;
    };
    gridGroup.add(mk(minor, 0x8899bb, 0.22));
    gridGroup.add(mk(major, 0x99ccff, 0.5));
    gridGroup.position.set(0, DESK_HEIGHT + 0.001, 0);
  }
  scene.add(gridGroup);

  // ---- PiP content scene (2D sketch space, top-down ortho) ----
  const pipScene = new THREE.Scene();
  pipScene.background = new THREE.Color(0x0b0e14);
  const pipCam = new THREE.OrthographicCamera(
    -PIP_WORLD_SPAN_X / 2,
    PIP_WORLD_SPAN_X / 2,
    PIP_WORLD_SPAN_Z / 2,
    -PIP_WORLD_SPAN_Z / 2,
    0.01,
    10,
  );
  pipCam.position.set(0, 0.5, 0);
  pipCam.up.set(0, 0, -1); // desk +X right, +Z down in top-down view
  pipCam.lookAt(0, 0, 0);

  // Desk outline + grid in PiP space (mirrors physical desk)
  {
    const outline = new THREE.BufferGeometry();
    const hx = DESK_HALF_X;
    const hz = DESK_HALF_Z;
    outline.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz, -hx, 0, -hz],
        3,
      ),
    );
    const outlineLine = new THREE.Line(
      outline,
      new THREE.LineBasicMaterial({ color: 0x335577 }),
    );
    pipScene.add(outlineLine);
  }

  const contentGroup = new THREE.Group();
  contentGroup.name = "vr-pip-sketch";
  pipScene.add(contentGroup);

  const pipLineMaterial = new THREE.LineBasicMaterial({ color: 0x66ff99 });
  const pipDotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pipDotGeometry = new THREE.SphereGeometry(0.008, 10, 10);

  const renderTarget = new THREE.WebGLRenderTarget(
    PIP_RT_SIZE.x,
    PIP_RT_SIZE.y,
    { colorSpace: THREE.SRGBColorSpace },
  );

  // ---- PiP panel in the VR world ----
  const panelMat = new THREE.MeshBasicMaterial({
    map: renderTarget.texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(PIP_SIZE.x, PIP_SIZE.y),
    panelMat,
  );
  panel.name = "vr-sketch-pip";
  panel.position.copy(PIP_POSITION);
  panel.rotation.x = PIP_TILT_X;
  panel.renderOrder = 10;
  panel.visible = false;
  scene.add(panel);

  // ---- State ----
  let deskActive = false;
  let targetOpacity = 0;
  let currentOpacity = 0;
  let lastPrimitiveCount = -1;
  let lastSignature = "";
  const pointIndex = new Map<string, { x: number; y: number }>();

  const clearContent = () => {
    for (const child of [...contentGroup.children]) {
      contentGroup.remove(child);
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      } else if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Line ||
        child instanceof THREE.LineSegments
      ) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    }
    pointIndex.clear();
  };

  const rebuildContent = (primitives: SketchPrimitiveLite[]) => {
    for (const p of primitives) {
      if (
        p.type === "point" &&
        typeof p.x === "number" &&
        typeof p.y === "number"
      ) {
        pointIndex.set(p.id, { x: p.x, y: p.y });
      }
    }
    for (const p of primitives) {
      if (
        p.type === "point" &&
        typeof p.x === "number" &&
        typeof p.y === "number"
      ) {
        const dot = new THREE.Mesh(pipDotGeometry, pipDotMaterial);
        dot.position.set(p.x, 0, p.y);
        contentGroup.add(dot);
      } else if (p.type === "line") {
        const a = pointIndex.get(String(p.p1Id));
        const b = pointIndex.get(String(p.p2Id));
        if (!a || !b) continue;
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a.x, 0, a.y),
          new THREE.Vector3(b.x, 0, b.y),
        ]);
        contentGroup.add(new THREE.Line(geo, pipLineMaterial));
        // dimension label: length in mm at midpoint, offset perpendicular
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > 0.005) {
          const label = makeLabelSprite(`${(len * 1000).toFixed(1)}`);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = (b.x - a.x) / len;
          const dy = (b.y - a.y) / len;
          label.position.set(mx + -dy * 0.045, 0, my + dx * 0.045);
          label.scale.set(0.16, 0.08, 1);
          contentGroup.add(label);
        }
      } else if (p.type === "circle") {
        const c = pointIndex.get(String(p.centerId));
        if (!c || typeof p.radius !== "number") continue;
        const segs = 48;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= segs; i++) {
          const t = (i / segs) * Math.PI * 2;
          pts.push(
            new THREE.Vector3(
              c.x + Math.cos(t) * p.radius,
              0,
              c.y + Math.sin(t) * p.radius,
            ),
          );
        }
        contentGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            pipLineMaterial,
          ),
        );
        const label = makeLabelSprite(`R${(p.radius * 1000).toFixed(1)}`);
        label.position.set(c.x, 0, c.y - p.radius - 0.04);
        label.scale.set(0.16, 0.08, 1);
        contentGroup.add(label);
      }
    }
  };

  const signatureOf = (primitives: SketchPrimitiveLite[]): string => {
    let s = "";
    for (const p of primitives) {
      s += `${p.id}:${p.x?.toFixed(4) ?? ""},${p.y?.toFixed(4) ?? ""},${p.radius?.toFixed(4) ?? ""};`;
    }
    return s;
  };

  const syncSketch = (
    phase: VRSketchPhase,
    context: VRSketchContext | null,
    _plane: SketchPlane | null,
    primitives: SketchPrimitiveLite[] | null,
  ) => {
    deskActive = phase === "drawing" && context === "desk";
    gridGroup.visible = deskActive;
    panel.visible = deskActive;
    if (!deskActive) {
      clearContent();
      lastPrimitiveCount = -1;
      lastSignature = "";
      return;
    }
    const prims = primitives ?? [];
    const sig = signatureOf(prims);
    if (prims.length !== lastPrimitiveCount || sig !== lastSignature) {
      lastPrimitiveCount = prims.length;
      lastSignature = sig;
      clearContent();
      rebuildContent(prims);
    }
  };

  const updateHeadPitch = (camera: THREE.Camera) => {
    if (!deskActive) {
      targetOpacity = 0;
    } else {
      const fwd = camera.getWorldDirection(new THREE.Vector3());
      const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
      if (currentOpacity >= 0.95 && pitch < PIP_PITCH_OFF) targetOpacity = 0;
      else if (currentOpacity <= 0.05 && pitch > PIP_PITCH_ON)
        targetOpacity = 1;
    }
    currentOpacity = THREE.MathUtils.lerp(currentOpacity, targetOpacity, 0.08);
    panelMat.opacity = currentOpacity;
    panel.visible = deskActive && currentOpacity > 0.02;
  };

  const renderPiP = () => {
    if (!panel.visible || currentOpacity < 0.05) return;
    renderer.setRenderTarget(renderTarget);
    renderer.render(pipScene, pipCam);
    renderer.setRenderTarget(null);
  };

  const dispose = () => {
    clearContent();
    gridGroup.children.forEach((child) => {
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    scene.remove(gridGroup);
    scene.remove(panel);
    pipLineMaterial.dispose();
    pipDotMaterial.dispose();
    pipDotGeometry.dispose();
    panel.geometry.dispose();
    panelMat.dispose();
    renderTarget.dispose();
    pipScene.clear();
  };

  return { syncSketch, updateHeadPitch, renderPiP, dispose };
}
