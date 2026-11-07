// Pure scene-element transforms (add/remove/updatePosition/updateRotation).
// No Result<T>: any "failure" here is an invariant violation (programmer bug),
// not a user-recoverable error. See ./result.ts for the policy.
import * as THREE from "three";
import { Brep, CompoundBrep } from "../geometry";
import { SceneElement, NodeId, nodeId as toNodeId } from "./types";
import { createMeshFromBrep, disposeAndRemove } from "./mesh-operations";
import { transformBrepVertices } from "../convertBRepToGeometry";

export function addElement(
  elements: SceneElement[],
  brep: Brep,
  position: THREE.Vector3,
  idCounter: number,
  objectsMap: Map<string, THREE.Object3D>,
  object?: THREE.Object3D,
): { updatedElements: SceneElement[]; nextId: number; nodeId: NodeId } {
  const nextId = idCounter + 1;
  const nodeId = toNodeId(`node_${nextId}`);

  if (!object) {
    object = createMeshFromBrep(brep);
    object.position.copy(position);
  }

  object.userData.nodeId = nodeId;
  objectsMap.set(nodeId, object);

  const newElement = {
    brep,
    nodeId,
    position,
    selected: false,
  };

  return {
    updatedElements: [...elements, newElement],
    nextId,
    nodeId,
  };
}

export function removeElement(
  elements: SceneElement[],
  selectedElements: string[],
  nodeId: string,
  objectsMap: Map<string, THREE.Object3D>,
): { updatedElements: SceneElement[]; updatedSelectedElements: string[] } {
  disposeAndRemove(objectsMap.get(nodeId));
  objectsMap.delete(nodeId);

  return {
    updatedElements: elements.filter((el) => el.nodeId !== nodeId),
    updatedSelectedElements: selectedElements.filter((id) => id !== nodeId),
  };
}

function findChildElements(
  elements: SceneElement[],
  parentNodeId: string,
): SceneElement[] {
  return elements.filter(
    (el) => el.sketchPlane?.sourceElementId === parentNodeId,
  );
}

export function updateElementPosition(
  elements: SceneElement[],
  nodeId: string,
  position: THREE.Vector3,
  objectsMap: Map<string, THREE.Object3D>,
): SceneElement[] {
  const elementIndex = elements.findIndex((el) => el.nodeId === nodeId);
  if (elementIndex === -1) return elements;

  const movedElement = elements[elementIndex]!;
  const delta = position.clone().sub(movedElement.position);

  const object = objectsMap.get(nodeId);
  if (object) {
    object.position.copy(position);
  }

  // Find child elements (sketches/profiles created on this body's face)
  const children = findChildElements(elements, nodeId);
  const childIds = new Set(children.map((c) => c.nodeId));

  return elements.map((el) => {
    if (el.nodeId === nodeId) {
      return { ...el, position };
    }
    if (childIds.has(el.nodeId)) {
      const newChildPos = el.position.clone().add(delta);
      const childObj = objectsMap.get(el.nodeId);
      if (childObj) {
        childObj.position.copy(newChildPos);
      }
      // Update sketchPlane origin so re-entering sketch works correctly
      const updatedSketchPlane = el.sketchPlane
        ? {
            ...el.sketchPlane,
            origin: el.sketchPlane.origin.clone().add(delta),
          }
        : el.sketchPlane;
      return { ...el, position: newChildPos, sketchPlane: updatedSketchPlane };
    }
    return el;
  });
}

export function updateElementRotation(
  elements: SceneElement[],
  nodeId: string,
  rotation: THREE.Euler,
  objectsMap: Map<string, THREE.Object3D>,
): SceneElement[] {
  const element = elements.find((el) => el.nodeId === nodeId);
  if (!element) return elements;

  // Compute rotation delta as quaternion
  const oldQuat = new THREE.Quaternion().setFromEuler(
    element.rotation || new THREE.Euler(),
  );
  const newQuat = new THREE.Quaternion().setFromEuler(rotation);
  const deltaQuat = newQuat.clone().multiply(oldQuat.clone().invert());

  const obj = objectsMap.get(nodeId);
  if (obj) {
    obj.rotation.copy(rotation);
  }

  // Find child elements
  const children = findChildElements(elements, nodeId);
  const childIds = new Set(children.map((c) => c.nodeId));

  const parentPos = element.position.clone();

  return elements.map((el) => {
    if (el.nodeId === nodeId) {
      return { ...el, rotation };
    }
    if (childIds.has(el.nodeId)) {
      // Orbit child around parent position
      const relativePos = el.position.clone().sub(parentPos);
      relativePos.applyQuaternion(deltaQuat);
      const newChildPos = parentPos.clone().add(relativePos);

      // Compose child rotation
      const childQuat = new THREE.Quaternion().setFromEuler(
        el.rotation || new THREE.Euler(),
      );
      childQuat.premultiply(deltaQuat);
      const newChildRot = new THREE.Euler().setFromQuaternion(childQuat);

      // Update Three.js object
      const childObj = objectsMap.get(el.nodeId);
      if (childObj) {
        childObj.position.copy(newChildPos);
        childObj.rotation.copy(newChildRot);
      }

      // Update sketchPlane vectors
      let updatedSketchPlane = el.sketchPlane;
      if (updatedSketchPlane) {
        const newOrigin = parentPos
          .clone()
          .add(
            updatedSketchPlane.origin
              .clone()
              .sub(parentPos)
              .applyQuaternion(deltaQuat),
          );
        const newNormal = updatedSketchPlane.normal
          .clone()
          .applyQuaternion(deltaQuat);
        const newXAxis = updatedSketchPlane.xAxis
          .clone()
          .applyQuaternion(deltaQuat);
        const newYAxis = updatedSketchPlane.yAxis
          .clone()
          .applyQuaternion(deltaQuat);
        updatedSketchPlane = {
          ...updatedSketchPlane,
          origin: newOrigin,
          normal: newNormal,
          xAxis: newXAxis,
          yAxis: newYAxis,
        };
      }

      return {
        ...el,
        position: newChildPos,
        rotation: newChildRot,
        sketchPlane: updatedSketchPlane,
      };
    }
    return el;
  });
}
