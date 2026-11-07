// Pure selection-state transforms + Three.js material updates.
// No Result<T>: nothing here can fail in a way the caller can recover from.
// See ./result.ts for the policy.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { CompoundBrep } from "../geometry";
import { SceneElement, SceneMode } from "./types";
import { BODY, SELECTION } from "../theme";

export function handleSetMode(
  elements: SceneElement[],
  newMode: SceneMode,
  objectsMap: Map<string, THREE.Object3D>,
): { updatedElements: SceneElement[]; mode: SceneMode } {
  const updatedElements = elements.map((element) => {
    const object = objectsMap.get(element.nodeId);
    if (object) {
      if (object instanceof THREE.Mesh) {
        const mat = object.material as THREE.MeshStandardMaterial;
        mat.color.set(BODY.default);
        mat.opacity = 1.0;
        mat.transparent = false;
        mat.needsUpdate = true;
      } else if (object instanceof THREE.Group) {
        object.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            !child.userData.isEdgeOverlay &&
            !child.userData.isHelper
          ) {
            const mat = child.material as THREE.MeshStandardMaterial;
            mat.color.set(BODY.default);
            mat.opacity = 1.0;
            mat.transparent = false;
            mat.needsUpdate = true;
          }
          if (child instanceof LineSegments2 && child.userData.isEdgeOverlay) {
            const mat = child.material;
            mat.opacity = 1.0;
            mat.transparent = false;
            mat.needsUpdate = true;
          }
        });
      }
      object.traverse((child) => {
        if (
          child.userData.helperType === "edge" ||
          child.userData.helperType === "vertex"
        ) {
          child.visible = false;
        }
      });
    }
    return { ...element, selected: false };
  });

  return { updatedElements, mode: newMode };
}

export interface SelectionChange {
  updatedElements: SceneElement[];
  updatedSelectedElements: string[];
  affectedNodeIds: string[];
}

function collectAffectedNodeIds(
  elements: SceneElement[],
  nodeId: string,
): string[] {
  const element = elements.find((el) => el.nodeId === nodeId);
  if (!element) return [];

  const nodes: string[] = [nodeId];

  if (element.brep instanceof CompoundBrep) {
    elements.forEach((el) => {
      if (el.brep === element.brep) nodes.push(el.nodeId);
    });
  } else {
    const parentElements = elements.filter(
      (el): el is SceneElement & { brep: CompoundBrep } =>
        el.brep instanceof CompoundBrep &&
        el.brep.children.some((child) => child === element.brep),
    );

    parentElements.forEach((parent) => {
      nodes.push(parent.nodeId);
      elements.forEach((el) => {
        if (el.brep === parent.brep || parent.brep.children.includes(el.brep)) {
          nodes.push(el.nodeId);
        }
      });
    });
  }

  return Array.from(new Set(nodes));
}

function applySelectionChange(
  elements: SceneElement[],
  selectedElements: string[],
  nodeId: string,
  isSelect: boolean,
): SelectionChange {
  const affectedNodeIds = collectAffectedNodeIds(elements, nodeId);
  if (affectedNodeIds.length === 0) {
    return {
      updatedElements: elements,
      updatedSelectedElements: selectedElements,
      affectedNodeIds,
    };
  }

  const affectedSet = new Set(affectedNodeIds);

  const updatedElements = elements.map((el) =>
    affectedSet.has(el.nodeId) ? { ...el, selected: isSelect } : el,
  );

  const updatedSelectedElements = isSelect
    ? Array.from(new Set([...selectedElements, ...affectedNodeIds]))
    : selectedElements.filter((id) => !affectedSet.has(id));

  return { updatedElements, updatedSelectedElements, affectedNodeIds };
}

export function selectElement(
  elements: SceneElement[],
  selectedElements: string[],
  nodeId: string,
): SelectionChange {
  return applySelectionChange(elements, selectedElements, nodeId, true);
}

export function deselectElement(
  elements: SceneElement[],
  selectedElements: string[],
  nodeId: string,
): SelectionChange {
  return applySelectionChange(elements, selectedElements, nodeId, false);
}

export function applySelectionMaterial(
  objectsMap: Map<string, THREE.Object3D>,
  nodeIds: string[],
  color: number | string,
): void {
  nodeIds.forEach((id) => {
    const object = objectsMap.get(id);
    if (object instanceof THREE.Mesh) {
      (object.material as THREE.MeshStandardMaterial).color.set(color);
    } else if (object instanceof THREE.Group) {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshStandardMaterial).color.set(color);
        }
      });
    }
  });
}
