// vrCircuitPip.ts — the circuit card as a floating VR panel.
//
// Same shape as the suit/param panels: a canvas + CanvasTexture on a plane,
// double-sided, no depth write, pinned to the board you last held.
// The card content is drawn by the pure painter in ecad/circuitPip.ts, so the
// desk can render the identical card later without touching this file.
import * as THREE from "three";
import { drawCircuitPip, type CircuitPipSnapshot } from "../../ecad/circuitPip";

const CANVAS_W = 512;
const CANVAS_H = 340;
const PANEL_W = 0.42; // metres — readable at arm's length, not face-filling

export interface VRCircuitPip {
  /** Show/refresh the card for this snapshot (redraws only when it changed). */
  update: (snap: CircuitPipSnapshot) => void;
  hide: () => void;
  /** The snapshot currently painted (debug/e2e), or null when hidden. */
  lastSnapshot: () => CircuitPipSnapshot | null;
  mesh: THREE.Mesh;
  dispose: () => void;
}

export function createVRCircuitPip(scene: THREE.Scene): VRCircuitPip {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for circuit PiP");

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W, PANEL_W * (CANVAS_H / CANVAS_W)),
    material,
  );
  mesh.name = "vr-circuit-pip";
  mesh.visible = false;
  mesh.renderOrder = 11;
  scene.add(mesh);

  let snap: CircuitPipSnapshot | null = null;
  let signature = "";

  const update = (next: CircuitPipSnapshot) => {
    // Live circuit: pins/serial change every firmware tick. Repaint on change
    // only, so a steady board costs nothing per frame.
    const sig = JSON.stringify(next);
    if (sig !== signature) {
      signature = sig;
      drawCircuitPip(ctx, next, CANVAS_W, CANVAS_H);
      tex.needsUpdate = true;
    }
    snap = next;
    mesh.visible = true;
  };

  const hide = () => {
    mesh.visible = false;
    snap = null;
    signature = "";
  };

  const lastSnapshot = () => snap;

  const dispose = () => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    tex.dispose();
  };

  return { update, hide, lastSnapshot, mesh, dispose };
}
