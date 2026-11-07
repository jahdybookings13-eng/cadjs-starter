// Three.js mesh construction, traversal, and disposal helpers.
// No Result<T>: builders return Group/Mesh; failures are programmer bugs that
// should throw, not be encoded in a return type. See ./result.ts for the policy.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Brep, CompoundBrep, Face } from "../geometry";
import { createGeometryFromBRep } from "../convertBRepToGeometry";
import { BODY, DEBUG, SWEEP } from "../theme";
import { SceneElement, NodeId } from "./types";
import { thickAxisCount } from "./brep-utils";

/** Get current window resolution for LineMaterial, with fallback for non-browser environments */
function getResolution(): THREE.Vector2 {
  const w = typeof window !== "undefined" ? window.innerWidth : 1920;
  const h = typeof window !== "undefined" ? window.innerHeight : 1080;
  return new THREE.Vector2(w, h);
}

export function createMeshFromBrep(brep: Brep): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: BODY.default,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.2,
  });

  const faces = getAllFaces(brep);
  if (faces.length > 0) {
    const geometry = createGeometryFromBRep(faces);
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    // Add visible edge lines (dark outlines like Fusion 360)
    const edges = new THREE.EdgesGeometry(geometry, BODY.edgeAngleDeg);
    const lineGeo = new LineSegmentsGeometry();
    lineGeo.setPositions(edges.attributes.position!.array as Float32Array);
    const edgeMaterial = new LineMaterial({
      color: BODY.edge,
      linewidth: BODY.edgeWidth,
      resolution: getResolution(),
    });
    const edgeLines = new LineSegments2(lineGeo, edgeMaterial);
    edgeLines.userData.isEdgeOverlay = true;
    group.add(edgeLines);
    edges.dispose();

    return group;
  } else {
    console.error("Invalid BREP structure:", brep);
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const errorMaterial = new THREE.MeshStandardMaterial({
      color: DEBUG.invalidMesh,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geometry, errorMaterial));
    return group;
  }
}

/**
 * Create a Three.js Group from pre-built BufferGeometry (e.g. from OCC direct tessellation).
 * Produces the same Group structure as createMeshFromBrep: Mesh + edge overlay LineSegments.
 * If edgeGeometry is provided (from OCC topological edges), it is used for the edge overlay;
 * otherwise falls back to EdgesGeometry using the `BODY.edgeAngleDeg` threshold.
 */
export function createMeshFromGeometry(
  geometry: THREE.BufferGeometry,
  edgeGeometry?: THREE.BufferGeometry,
): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: BODY.default,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.2,
  });

  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  const edgeMat = new LineMaterial({
    color: BODY.edge,
    linewidth: BODY.edgeWidth,
    resolution: getResolution(),
  });

  if (edgeGeometry) {
    const lineGeo = new LineSegmentsGeometry();
    lineGeo.setPositions(
      edgeGeometry.attributes.position!.array as Float32Array,
    );
    const edgeLines = new LineSegments2(lineGeo, edgeMat);
    edgeLines.userData.isEdgeOverlay = true;
    group.add(edgeLines);
  } else {
    const edges = new THREE.EdgesGeometry(geometry, BODY.edgeAngleDeg);
    const lineGeo = new LineSegmentsGeometry();
    lineGeo.setPositions(edges.attributes.position!.array as Float32Array);
    const edgeLines = new LineSegments2(lineGeo, edgeMat);
    edgeLines.userData.isEdgeOverlay = true;
    group.add(edgeLines);
    edges.dispose();
  }

  return group;
}

/**
 * Create a Three.js Group for a path element (open wire with no faces).
 * Renders as a line with point markers.
 */
export function createMeshFromPath(
  points: { x: number; y: number; z: number }[],
): THREE.Group {
  const group = new THREE.Group();

  if (points.length < 2) return group;

  // Create line geometry from path points
  const linePoints = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: SWEEP.pathPreview,
    linewidth: 2,
  });
  const line = new THREE.Line(lineGeometry, lineMaterial);
  line.userData.isPathLine = true;
  group.add(line);

  // Create point markers at each vertex
  const pointGroup = new THREE.Group();
  pointGroup.userData.isHelper = true;
  const sphereGeometry = new THREE.SphereGeometry(0.06, 8, 8);
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color: SWEEP.pathPoint,
  });

  for (const pt of points) {
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(pt.x, pt.y, pt.z);
    pointGroup.add(sphere);
  }
  group.add(pointGroup);

  return group;
}

/**
 * Recursively dispose all GPU resources (geometries + materials) on an Object3D tree.
 * Call after removing an object from the scene to prevent memory leaks.
 */
export function disposeObject3D(obj: THREE.Object3D): void {
  // Three.js's `Object3D` doesn't declare `.geometry` / `.material`, those live
  // on subtypes (Mesh, Line, LineSegments, Points, LineSegments2, …). Cast to
  // an optional-fields shape so we can dispose without enumerating every
  // subtype, and use a runtime `dispose()` check to skip arbitrary props.
  type GeomMatHolder = {
    geometry?: { dispose?: () => void };
    material?: THREE.Material | THREE.Material[];
  };
  obj.traverse((child) => {
    const holder = child as unknown as GeomMatHolder;
    const geometry = holder.geometry;
    if (geometry && typeof geometry.dispose === "function") {
      geometry.dispose();
    }
    const material = holder.material;
    if (material) {
      if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
      } else {
        disposeMaterial(material);
      }
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

/**
 * Detach `obj` from its parent and dispose all GPU resources beneath it.
 * Use whenever a Group permanently leaves the scene (removeElement, undo
 * snapshot restore, boolean operand consumption). For callers that re-parent
 * the object instead, use `disposeObject3D` directly.
 */
export function disposeAndRemove(obj: THREE.Object3D | undefined | null): void {
  if (!obj) return;
  if (obj.parent) obj.parent.remove(obj);
  disposeObject3D(obj);
}

export function getAllFaces(brep: Brep): Face[] {
  if (brep instanceof CompoundBrep) {
    const unifiedBrep = brep.cachedUnifiedBRep;
    if (unifiedBrep && unifiedBrep.faces && unifiedBrep.faces.length > 0) {
      return unifiedBrep.faces;
    }

    const allFaces: Face[] = [];
    brep.children.forEach((child) => {
      allFaces.push(...getAllFaces(child));
    });
    return allFaces;
  } else if (brep.faces && brep.faces.length > 0) {
    return brep.faces;
  }
  return [];
}

/** Find the first child Mesh inside a Group returned by createMeshFromBrep.
 *  Skips LineSegments2 (edge overlays) which also extend THREE.Mesh. */
export function findChildMesh(obj: THREE.Object3D): THREE.Mesh | null {
  if (obj instanceof THREE.Mesh && !obj.userData.isEdgeOverlay) return obj;
  let found: THREE.Mesh | null = null;
  obj.traverse((child) => {
    if (
      !found &&
      child instanceof THREE.Mesh &&
      !child.userData.isEdgeOverlay
    ) {
      found = child;
    }
  });
  return found;
}

/**
 * Check if a Three.js object is a descendant (child, grandchild, etc.) of another object.
 * Walks up the parent chain from child to see if it reaches parent.
 */
export function isDescendantOf(
  child: THREE.Object3D,
  parent: THREE.Object3D,
): boolean {
  let current: THREE.Object3D | null = child;
  while (current) {
    if (current === parent) return true;
    current = current.parent;
  }
  return false;
}

export function getObject(
  objectsMap: Map<string, THREE.Object3D>,
  nodeId: string,
): THREE.Object3D | undefined {
  return objectsMap.get(nodeId);
}

export function getAllObjects(
  objectsMap: Map<string, THREE.Object3D>,
): Map<string, THREE.Object3D> {
  return objectsMap;
}

/**
 * Collect only the pickable Mesh children from scene elements,
 * skipping edge overlays and helpers that inflate the hit area.
 * The Raycaster's default Line.threshold (1 world unit) makes
 * LineSegments (EdgesGeometry) hit-test far beyond the visible body.
 * By returning only Mesh leaves we avoid that inflation.
 */
export function collectPickableMeshes(
  elements: { nodeId: string }[],
  getObject: (nodeId: string) => THREE.Object3D | undefined,
): THREE.Object3D[] {
  const meshes: THREE.Object3D[] = [];
  elements.forEach((el) => {
    const obj = getObject(el.nodeId);
    if (obj) {
      obj.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          !child.userData.isEdgeOverlay &&
          !child.userData.isHelper
        ) {
          meshes.push(child);
        }
      });
    }
  });
  return meshes;
}

export interface PickItem {
  key: string;
  label: string;
  distance: number;
  // String, not NodeId: some modes (fillet) reuse PickItem for synthetic edge
  // markers ("edge-3"). Modes that pass this to scene-element APIs mint at the
  // boundary via `nodeId(item.elementId)`.
  elementId: string;
  faceIndex?: number;
  object: THREE.Object3D;
}

/**
 * Raycast all pickable meshes under the cursor, walk each hit back to its owning
 * element, and return a deduplicated, distance-sorted list suitable for a
 * "Select Other" popup.
 *
 * - `filter` removes elements before the raycast runs (e.g. `isElement3D` for
 *   body-only modes).
 * - `includeFaces: true` emits one entry per (element, face) pair the ray passed
 *   through. Face entries are labeled so users can disambiguate "back of body A"
 *   vs. "front of body B"; callers typically still select by `elementId`.
 * - `includeFaces: false` emits one entry per element (the nearest hit wins).
 * - `nameFor` lets the caller override the display label.
 */
export function collectPicksUnderCursor<T extends { nodeId: string }>(
  raycaster: THREE.Raycaster,
  elements: T[],
  getObject: (nodeId: string) => THREE.Object3D | undefined,
  opts: {
    includeFaces?: boolean;
    filter?: (el: T) => boolean;
    nameFor?: (el: T, index: number) => string;
  } = {},
): PickItem[] {
  const { includeFaces = false, filter, nameFor } = opts;

  const candidates = filter ? elements.filter(filter) : elements;
  if (candidates.length === 0) return [];

  const meshes = collectPickableMeshes(candidates, getObject);
  if (meshes.length === 0) return [];

  const intersects = raycaster.intersectObjects(meshes, false);
  if (intersects.length === 0) return [];

  // Pre-resolve each element's root object so we can map hits → element via
  // isDescendantOf (same pattern used by every mode hook today).
  const roots = candidates
    .map((el, index) => {
      const obj = getObject(el.nodeId);
      if (!obj) return null;
      return {
        elementId: el.nodeId,
        label: nameFor ? nameFor(el, index) : `Body ${index + 1}`,
        root: obj,
      };
    })
    .filter(
      (r): r is { elementId: string; label: string; root: THREE.Object3D } =>
        r !== null,
    );

  const seen = new Map<string, PickItem>();

  for (const hit of intersects) {
    const owner = roots.find((r) => isDescendantOf(hit.object, r.root));
    if (!owner) continue;

    if (includeFaces && hit.faceIndex != null) {
      const key = `${owner.elementId}:f${hit.faceIndex}`;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          label: `${owner.label}, Face ${hit.faceIndex}`,
          distance: hit.distance,
          elementId: owner.elementId,
          faceIndex: hit.faceIndex,
          object: hit.object,
        });
      }
    } else {
      const key = owner.elementId;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          label: owner.label,
          distance: hit.distance,
          elementId: owner.elementId,
          object: hit.object,
        });
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.distance - b.distance);
}

/**
 * Strict "is this a 3D solid" check for menu labelling. Differs from
 * `isElement3D` in `types.ts` (which considers a flat sketch with X+Y extent
 * to be 3D for compatibility with combine/fillet/measure call sites): here we
 * require non-zero thickness on ALL three axes so that flat profiles get
 * labelled as profiles.
 */
function isSolidBody(el: SceneElement): boolean {
  return thickAxisCount(el.brep) === 3;
}

/**
 * Build a `nameFor` callback for `collectPicksUnderCursor` that labels each
 * element as "Body N" or "Profile N", numbered separately so the user can
 * tell what kind of thing each menu row will select.
 */
export function makeBodyOrProfileLabel(elements: SceneElement[]) {
  // Pre-assign a stable index per element across the full scene so labels
  // stay consistent regardless of which subset the raycaster considers.
  const labels = new Map<string, string>();
  let bodyN = 0;
  let profileN = 0;
  for (const el of elements) {
    if (isSolidBody(el)) {
      bodyN += 1;
      labels.set(el.nodeId, `Body ${bodyN}`);
    } else {
      profileN += 1;
      labels.set(el.nodeId, `Profile ${profileN}`);
    }
  }
  return (el: SceneElement, index: number) =>
    labels.get(el.nodeId) ?? `Element ${index + 1}`;
}
