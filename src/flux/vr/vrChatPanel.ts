// flux/vr/vrChatPanel.ts — the floating VR chat window (one thread per file).
//
// Twin of `vrParamPanel.ts`: owns its own canvas + CanvasTexture + mesh,
// raycast-interactive, header bar "one thread". Renders the SAME ordered
// TraceRow stream the desk panel does (chatPanelCanvas) — so VR, desk, voice,
// and ActionBus all show one conversation, just on different surfaces.
//
// No model knowledge beyond TraceRow / AgentId types. The caller feeds it the
// orchestrator's trace rows; it redraws on `refresh`.

import * as THREE from "three";
import type { TraceRow } from "../agent/trace";
import {
  drawChat,
  chatHitTest,
  layoutChat,
  CHAT_THEME,
  type ChatLayout,
  type ChatRegion,
} from "./chatPanelCanvas";

const CANVAS_W = 560;
const PANEL_W = 0.9; // metres
const PANEL_H = 1.1;

export interface VRChatPanel {
  /** Show the panel bound to a file/project (null hides it). */
  show: (rows: TraceRow[], projectRef: string | null) => void;
  /** Redraw when trace rows changed. */
  refresh: (rows: TraceRow[]) => void;
  /** Test a world-space ray; returns the hit region + local px. */
  raycast: (
    raycaster: THREE.Raycaster,
  ) => { region: ChatRegion; x: number; y: number } | null;
  mesh: THREE.Mesh;
  dispose: () => void;
}

export function createVRChatPanel(scene: THREE.Scene): VRChatPanel {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable for VR chat panel");
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W, PANEL_H),
    material,
  );
  mesh.name = "vr-flux-chat";
  mesh.visible = false;
  mesh.renderOrder = 13; // above the param panel (12)
  scene.add(mesh);

  let rows: TraceRow[] = [];
  let projectRef: string | null = null;
  let layout: ChatLayout | null = null;

  const redraw = (rs: TraceRow[]) => {
    rows = rs;
    layout = layoutChat(rows, CANVAS_W, canvas.height);
    drawChat(ctx, layout, CHAT_THEME);
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
    tex.dispose();
    tex.image = canvas;
    tex.needsUpdate = true;
  };

  const show = (rs: TraceRow[], ref: string | null) => {
    projectRef = ref;
    if (!ref) {
      mesh.visible = false;
      layout = null;
      rows = [];
      return;
    }
    redraw(rs);
    mesh.visible = true;
  };

  const refresh = (rs: TraceRow[]) => {
    if (!projectRef) return;
    redraw(rs);
  };

  const raycast = (raycaster: THREE.Raycaster) => {
    if (!mesh.visible || !layout) return null;
    const hits = raycaster.intersectObject(mesh, false);
    const first = hits[0];
    if (!first || !first.uv) return null;
    const px = first.uv.x * CANVAS_W;
    const py = (1 - first.uv.y) * layout.height;
    const region = chatHitTest(layout, px, py);
    if (!region) return null;
    return { region, x: px, y: py };
  };

  const dispose = () => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    tex.dispose();
  };

  return { show, refresh, raycast, mesh, dispose };
}
