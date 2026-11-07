import * as THREE from "three";
import { Brep } from "../../src/geometry";
import {
  SceneElement,
  BooleanOperationOptions,
} from "../../src/scene-operations/types";
import {
  addElement as addElementOp,
  removeElement as removeElementOp,
  updateElementPosition as updateElementPositionOp,
} from "../../src/scene-operations/element-operations";
import {
  selectElement as selectElementOp,
  deselectElement as deselectElementOp,
} from "../../src/scene-operations/selection-operations";
import { booleanOp } from "../../src/scene-operations/boolean-operations";

/**
 * Minimal stand-in for CadCoreContext used in workflow tests. Drives the same
 * scene-operations the React provider does, without mounting React or jsdom.
 *
 * Each operation mirrors the contract of the corresponding context method —
 * if the context-level operation chaining changes shape, these tests fail.
 */
export class WorkflowState {
  elements: SceneElement[] = [];
  selectedElements: string[] = [];
  idCounter = 0;
  objectsMap = new Map<string, THREE.Object3D>();

  addElement(brep: Brep, position: THREE.Vector3): string {
    const result = addElementOp(
      this.elements,
      brep,
      position,
      this.idCounter,
      this.objectsMap,
    );
    this.elements = result.updatedElements;
    this.idCounter = result.nextId;
    return result.nodeId;
  }

  removeElement(nodeId: string): void {
    const result = removeElementOp(
      this.elements,
      this.selectedElements,
      nodeId,
      this.objectsMap,
    );
    this.elements = result.updatedElements;
    this.selectedElements = result.updatedSelectedElements;
  }

  selectElement(nodeId: string): void {
    const result = selectElementOp(
      this.elements,
      this.selectedElements,
      nodeId,
    );
    this.elements = result.updatedElements;
    this.selectedElements = result.updatedSelectedElements;
  }

  deselectElement(nodeId: string): void {
    const result = deselectElementOp(
      this.elements,
      this.selectedElements,
      nodeId,
    );
    this.elements = result.updatedElements;
    this.selectedElements = result.updatedSelectedElements;
  }

  updateElementPosition(nodeId: string, position: THREE.Vector3): void {
    this.elements = updateElementPositionOp(
      this.elements,
      nodeId,
      position,
      this.objectsMap,
    );
  }

  async union(options?: BooleanOperationOptions): Promise<boolean> {
    return this.boolean("union", options);
  }

  async difference(options?: BooleanOperationOptions): Promise<boolean> {
    return this.boolean("difference", options);
  }

  async intersection(options?: BooleanOperationOptions): Promise<boolean> {
    return this.boolean("intersection", options);
  }

  private async boolean(
    operation: "union" | "difference" | "intersection",
    options?: BooleanOperationOptions,
  ): Promise<boolean> {
    const result = await booleanOp(
      operation,
      this.elements,
      this.selectedElements,
      this.idCounter,
      this.objectsMap,
      options,
    );
    if (!result.ok) return false;
    this.elements = result.value.updatedElements;
    this.selectedElements = result.value.updatedSelectedElements;
    this.idCounter = result.value.nextIdCounter;
    return true;
  }

  getElement(nodeId: string): SceneElement | undefined {
    return this.elements.find((el) => el.nodeId === nodeId);
  }
}
