import * as THREE from "three";
import { Brep, CompoundBrep } from "../../geometry";
import { SceneElement } from "../../scene-operations/types";
import { HELPERS } from "../../theme";

/**
 * Build a LineSegments overlay highlighting all edges of an element's BRep.
 * Returns null if the element has no edges to draw.
 */
export function createEdgeHelpers(
  element: SceneElement,
): THREE.LineSegments | null {
  if (!element || !element.brep) return null;

  let brepToVisualize: Brep;
  if (element.brep instanceof CompoundBrep) {
    const unifiedBrep = element.brep.cachedUnifiedBRep;
    if (unifiedBrep) {
      brepToVisualize = unifiedBrep;
    } else {
      console.warn("CompoundBrep has no unified BRep cached yet");
      if (element.brep.children.length > 0) {
        brepToVisualize = element.brep.children[0]!;
      } else {
        return null;
      }
    }
  } else {
    brepToVisualize = element.brep;
  }

  if (!brepToVisualize.edges || brepToVisualize.edges.length === 0) return null;

  const edgePositions: number[] = [];
  brepToVisualize.edges.forEach((edge) => {
    edgePositions.push(
      edge.start.x,
      edge.start.y,
      edge.start.z,
      edge.end.x,
      edge.end.y,
      edge.end.z,
    );
  });

  if (edgePositions.length === 0) return null;

  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(edgePositions, 3),
  );

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: HELPERS.edgeColor,
    linewidth: 2,
    depthTest: false,
  });

  const lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  lines.renderOrder = 999;
  lines.userData.isHelper = true;
  lines.userData.helperType = "edge";
  lines.userData.elementId = element.nodeId;

  return lines;
}

/**
 * Build a Group containing one small sphere per BRep vertex.
 * Returns null if the element has no vertices.
 */
export function createVertexHelpers(
  element: SceneElement,
): THREE.Object3D | null {
  if (!element || !element.brep) return null;

  let brepToVisualize: Brep;
  if (element.brep instanceof CompoundBrep) {
    const unifiedBrep = element.brep.cachedUnifiedBRep;
    if (unifiedBrep) {
      brepToVisualize = unifiedBrep;
    } else {
      console.warn("CompoundBrep has no unified BRep cached yet");
      if (element.brep.children.length > 0) {
        brepToVisualize = element.brep.children[0]!;
      } else {
        return null;
      }
    }
  } else {
    brepToVisualize = element.brep;
  }

  if (!brepToVisualize.vertices || brepToVisualize.vertices.length === 0)
    return null;

  const vertexGroup = new THREE.Group();

  brepToVisualize.vertices.forEach((vertex) => {
    const sphereGeometry = new THREE.SphereGeometry(0.05, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: HELPERS.vertexColor,
      transparent: false,
      depthTest: false,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(vertex.x, vertex.y, vertex.z);
    sphere.renderOrder = 1000;
    vertexGroup.add(sphere);
  });

  vertexGroup.userData.isHelper = true;
  vertexGroup.userData.helperType = "vertex";
  vertexGroup.userData.elementId = element.nodeId;

  return vertexGroup;
}
