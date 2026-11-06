// VR parameter panel — a floating, raycast-interactive panel that renders a
// ParamPanel from paramPanelCanvas onto a CanvasTexture. Owns its own mesh,
// canvas, and pointer mapping; reports committed edits through onCommit.
// No model knowledge beyond PanelRow/ParamPanel types.
import * as THREE from "three";
import type { ParamPanel, PanelRow } from "../../model/paramPanel";
import {
  drawPanel,
  hitTest,
  resolveHitValue,
  layoutPanel,
  DEFAULT_THEME,
  type PanelLayout,
  type PanelHit,
} from "./paramPanelCanvas";

const CANVAS_W = 420;
const PANEL_W = 0.6; // metres
const PANEL_FILL_Y = 0.72; // fraction of panel occupied by canvas rows

export interface VRParamPanel {
  /** Show the panel for a feature; null hides it. */
  show: (panel: ParamPanel | null) => void;
  /** Draw/retexture if the panel data changed. */
  refresh: (panel: ParamPanel) => void;
  /** Test a world-space ray against the panel; returns the hit + local coords. */
  raycast: (
    raycaster: THREE.Raycaster,
  ) => { hit: PanelHit; row: PanelRow } | null;
  /** Apply an increment/decrement/toggle/enum hit; returns the new value or null. */
  applyHit: (hit: PanelHit) => { row: PanelRow; value: unknown } | null;
  mesh: THREE.Mesh;
  dispose: () => void;
}

export function createVRParamPanel(scene: THREE.Scene): VRParamPanel {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = 560;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for VR param panel");

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W, PANEL_W * PANEL_FILL_Y),
    material,
  );
  mesh.name = "vr-param-panel";
  mesh.visible = false;
  mesh.renderOrder = 12;
  scene.add(mesh);

  let current: ParamPanel | null = null;
  let layout: PanelLayout | null = null;

  const redraw = (panel: ParamPanel) => {
    layout = drawPanel(ctx, panel, CANVAS_W, DEFAULT_THEME);
    // Resize texture to the drawn height so the plane matches the content.
    tex.dispose();
    tex.image = canvas;
    tex.needsUpdate = true;
    const aspect = layout.height / CANVAS_W;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(PANEL_W, PANEL_W * aspect);
  };

  const show = (panel: ParamPanel | null) => {
    current = panel;
    if (!panel) {
      mesh.visible = false;
      layout = null;
      return;
    }
    redraw(panel);
    mesh.visible = true;
  };

  const refresh = (panel: ParamPanel) => {
    if (!current) return;
    current = panel;
    redraw(panel);
  };

  const raycast = (raycaster: THREE.Raycaster) => {
    if (!mesh.visible || !current || !layout) return null;
    const hits = raycaster.intersectObject(mesh, false);
    const first = hits[0];
    if (!first || !first.uv) return null;
    const px = first.uv.x * CANVAS_W;
    // uv.y is 0 at bottom; canvas y is 0 at top.
    const py = (1 - first.uv.y) * layout.height;
    const hit = hitTest(layout, px, py);
    if (!hit) return null;
    const row = current.rows.find((r) => r.parameterId === hit.parameterId);
    if (!row) return null;
    return { hit, row };
  };

  const applyHit = (hit: PanelHit) => {
    if (!current) return null;
    const row = current.rows.find((r) => r.parameterId === hit.parameterId);
    if (!row) return null;
    const value = resolveHitValue(row, hit);
    if (value === null || value === undefined) return null;
    return { row, value };
  };

  const dispose = () => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    tex.dispose();
  };

  return { show, refresh, raycast, applyHit, mesh, dispose };
}
