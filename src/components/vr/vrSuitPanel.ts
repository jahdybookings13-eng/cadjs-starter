// Suit settings panel — a floating, raycast-interactive panel that renders the
// ProjectDoc's settings rows onto a CanvasTexture. Mirror of vrParamPanel,
// specialized: same canvas kit (paramPanelCanvas), same uv→hit mapping, its
// own rows from suitPanel.ts, owns its mesh. Callers supply the active
// ProjectDoc and get back rows + edits.
import * as THREE from "three";
import type { ParamPanel, PanelRow } from "../../model/paramPanel";
import { applySuitEdit, suitPanelFor } from "../../project/suitPanel";
import type { ProjectDoc } from "../../project/model";
import {
  drawPanel,
  hitTest,
  resolveHitValue,
  DEFAULT_THEME,
  type PanelLayout,
  type PanelHit,
} from "./paramPanelCanvas";

const CANVAS_W = 420;
const PANEL_W = 0.62; // metres
const PANEL_FILL_Y = 0.72;

export interface VRSuitPanel {
  /** Build rows from the doc and (re)show the panel; null hides. */
  show: (doc: ProjectDoc | null) => void;
  /** Rebuild the panel's mesh from the doc WITHOUT touching visibility. */
  refresh: (doc: ProjectDoc) => void;
  /** Test panel pose in world space: position + outward normal (unit). */
  panelPose: () => {
    position: [number, number, number];
    normal: [number, number, number];
  } | null;
  /** World-space point for a row region (for synthetic pointer input). */
  hitPoint: (
    parameterId: string,
    region?: PanelHit["region"],
  ) => [number, number, number] | null;
  /** Test a world-space ray against the panel; returns the hit + local coords. */
  raycast: (
    raycaster: THREE.Raycaster,
  ) => { hit: PanelHit; row: PanelRow } | null;
  /** Apply an increment/decrement/toggle/enum hit; returns the new value or null. */
  applyHit: (
    doc: ProjectDoc,
    hit: PanelHit,
    /** Called when a value actually changed (persist side-effect hook). */
    onChange?: (doc: ProjectDoc, parameterId: string, value: unknown) => void,
  ) => { row: PanelRow; value: unknown } | null;
  mesh: THREE.Mesh;
  dispose: () => void;
}

export function createVRSuitPanel(scene: THREE.Scene): VRSuitPanel {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = 560;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for suit panel");

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
  mesh.name = "vr-suit-panel";
  mesh.visible = false;
  mesh.renderOrder = 12;
  scene.add(mesh);

  let current: ParamPanel | null = null;
  let layout: PanelLayout | null = null;

  const redraw = (panel: ParamPanel) => {
    layout = drawPanel(ctx, panel, CANVAS_W, DEFAULT_THEME);
    tex.dispose();
    tex.image = canvas;
    tex.needsUpdate = true;
    const aspect = layout.height / CANVAS_W;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(PANEL_W, PANEL_W * aspect);
  };

  const show = (doc: ProjectDoc | null) => {
    if (!doc) {
      current = null;
      layout = null;
      mesh.visible = false;
      return;
    }
    // Always refresh content — the panel is shared by reference across VR sessions.
    current = suitPanelFor(doc);
    mesh.visible = true;
    redraw(current);
  };

  const refresh = (doc: ProjectDoc) => {
    if (!current) return;
    current = suitPanelFor(doc);
    redraw(current);
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

  const applyHit = (
    doc: ProjectDoc,
    hit: PanelHit,
    onChange?: (doc: ProjectDoc, parameterId: string, value: unknown) => void,
  ) => {
    if (!current) return null;
    const row = current.rows.find((r) => r.parameterId === hit.parameterId);
    if (!row) return null;
    const value = resolveHitValue(row, hit);
    if (value === null || value === undefined) return null;
    // Apply onto the doc through the shared path so VR and desk agree on
    // validation & clamping.
    const changed = applySuitEdit(doc, hit.parameterId, value);
    if (!changed) return null;
    current = suitPanelFor(doc);
    redraw(current);
    onChange?.(doc, hit.parameterId, value);
    return { row, value };
  };

  const panelPose = () => {
    if (!mesh.visible) return null;
    mesh.updateWorldMatrix(true, false);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3(0, 0, 1);
    mesh.getWorldPosition(p);
    n.applyQuaternion(mesh.quaternion);
    return {
      position: [p.x, p.y, p.z] as [number, number, number],
      normal: [n.x, n.y, n.z] as [number, number, number],
    };
  };

  const hitPoint = (parameterId: string, region?: PanelHit["region"]) => {
    if (!current || !layout) return null;
    const rowHit = layout.rows.find((r) => r.row.parameterId === parameterId);
    if (!rowHit) return null;
    const want: PanelHit["region"] = region ?? "value";
    const reg =
      rowHit.regions.find((r) => r.region === want) ??
      rowHit.regions.find((r) => r.region === "value") ??
      rowHit.regions[0];
    if (!reg) return null;
    const cx = reg.x + reg.w / 2;
    const cy = rowHit.y + rowHit.height / 2;
    const H = (mesh.geometry as THREE.PlaneGeometry).parameters.height;
    const W = (mesh.geometry as THREE.PlaneGeometry).parameters.width;
    // canvas coords -> local plane coords (z=0, facing outward)
    const lx = (cx / CANVAS_W - 0.5) * W;
    const ly = (0.5 - cy / layout.height) * H;
    mesh.updateWorldMatrix(true, false);
    const v = new THREE.Vector3(lx, ly, 0).applyMatrix4(mesh.matrixWorld);
    return [v.x, v.y, v.z] as [number, number, number];
  };

  const dispose = () => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    tex.dispose();
  };

  return {
    show,
    refresh,
    panelPose,
    hitPoint,
    raycast,
    applyHit,
    mesh,
    dispose,
  };
}
