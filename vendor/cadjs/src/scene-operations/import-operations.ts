import * as THREE from "three";
import { Brep } from "../geometry";
import { SceneElement, NodeId, nodeId as toNodeId } from "./types";
import {
  createMeshFromBrep,
  createMeshFromGeometry,
  getAllFaces,
} from "./mesh-operations";
import { createGeometryFromBRep } from "../convertBRepToGeometry";
import { ImportResult } from "../services/ImportExportService";

export function importElements(
  elements: SceneElement[],
  imports: ImportResult[],
  idCounter: number,
  objectsMap: Map<string, THREE.Object3D>,
): { updatedElements: SceneElement[]; nextId: number; nodeIds: NodeId[] } {
  const newElements = [...elements];
  const nodeIds: NodeId[] = [];
  let currentId = idCounter;

  for (const imp of imports) {
    currentId += 1;
    const nodeId = toNodeId(`node_${currentId}`);
    nodeIds.push(nodeId);

    // Use OCC edge geometry if available for clean edge overlay
    let mesh: THREE.Group;
    if (imp.edgeGeometry) {
      const faces = getAllFaces(imp.brep);
      const faceGeometry = createGeometryFromBRep(faces);
      mesh = createMeshFromGeometry(faceGeometry, imp.edgeGeometry);
    } else {
      mesh = createMeshFromBrep(imp.brep);
    }
    mesh.position.copy(imp.position);
    objectsMap.set(nodeId, mesh);

    newElements.push({
      brep: imp.brep,
      nodeId,
      position: imp.position,
      selected: false,
      occBrep: imp.occBrep,
      edgeGeometry: imp.edgeGeometry,
      vertexPositions: imp.vertexPositions,
    });
  }

  return {
    updatedElements: newElements,
    nextId: currentId,
    nodeIds,
  };
}
