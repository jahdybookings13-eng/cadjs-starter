import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Brep } from "../../geometry";
import {
  addElement as addElementOp,
  removeElement as removeElementOp,
  updateElementPosition as updateElementPositionOp,
  updateElementRotation as updateElementRotationOp,
} from "../../scene-operations/element-operations";
import {
  selectElement as selectElementOp,
  deselectElement as deselectElementOp,
  handleSetMode as handleSetModeOp,
  applySelectionMaterial,
} from "../../scene-operations/selection-operations";
import { BODY, SELECTION } from "../../theme";
import { SceneElement, NodeId } from "../../scene-operations/types";
import {
  getObject as getObjectOp,
  getAllObjects as getAllObjectsOp,
} from "../../scene-operations/mesh-operations";

/**
 * Owns the canonical scene-element state plus the basic mutations that don't
 * cross-cut undo/featureTree/sketch. The composer wraps these with `pushUndo`
 * + tree updates to build the public `addElement` / `removeElement` /
 * `updateElementBrep` methods.
 *
 * `*Internal` variants exist because some composer-level orchestrators (sweep
 * chained with brep update + remove path, finishSketch's commit) call mutations
 * without pushing undo separately, they manage their own snapshot.
 */

// Pure helper extracted from addElementInternal so the closure-resilient ID
// allocation can be unit-tested without a React renderer.
export function applyAddElement(
  ctx: {
    idCounterRef: React.MutableRefObject<number>;
    setElements: React.Dispatch<React.SetStateAction<SceneElement[]>>;
    setIdCounter: React.Dispatch<React.SetStateAction<number>>;
    objectsMap: Map<string, THREE.Object3D>;
  },
  brep: Brep,
  position: THREE.Vector3,
  object?: THREE.Object3D,
): NodeId {
  const claimedFromId = ctx.idCounterRef.current;
  ctx.idCounterRef.current = claimedFromId + 1;
  let nodeId: NodeId | undefined;
  ctx.setElements((prevElements) => {
    const result = addElementOp(
      prevElements,
      brep,
      position,
      claimedFromId,
      ctx.objectsMap,
      object,
    );
    nodeId = result.nodeId;
    return result.updatedElements;
  });
  ctx.setIdCounter(claimedFromId + 1);
  return nodeId!;
}

// Pure helper extracted from removeElementInternal, reads selection from a
// ref so chained ops in one tick see fresh state.
export function applyRemoveElement(
  ctx: {
    selectedElementsRef: React.MutableRefObject<string[]>;
    setElements: React.Dispatch<React.SetStateAction<SceneElement[]>>;
    setSelectedElements: React.Dispatch<React.SetStateAction<string[]>>;
    objectsMap: Map<string, THREE.Object3D>;
  },
  nodeId: string,
): void {
  ctx.setElements((prevElements) => {
    const result = removeElementOp(
      prevElements,
      ctx.selectedElementsRef.current,
      nodeId,
      ctx.objectsMap,
    );
    ctx.setSelectedElements(result.updatedSelectedElements);
    return result.updatedElements;
  });
}

// Shared shape for the selection helpers below.
/** @internal */
export interface SelectionCtx {
  elementsRef: React.MutableRefObject<SceneElement[]>;
  selectedElementsRef: React.MutableRefObject<string[]>;
  setElements: React.Dispatch<React.SetStateAction<SceneElement[]>>;
  setSelectedElements: React.Dispatch<React.SetStateAction<string[]>>;
  objectsMap: Map<string, THREE.Object3D>;
}

// Snapshot+race-merged updater. Side effects (Three.js material mutation,
// setSelectedElements) fire once against the snapshot. The setElements
// updater takes a fast path when no concurrent setState landed in the same
// tick (`prev === snapshot`) and re-derives against `prev` otherwise, so a
// racing op's elements update is preserved instead of being clobbered.
//
// Strict-mode double-invocation of the updater body is safe: the body is pure
// (no Three.js mutation, no setSelectedElements). Material mutations against a
// node that a racing op removed from objectsMap are no-ops because
// applySelectionMaterial skips falsy `objectsMap.get(id)`.
/** @internal */
export function applySelectElement(ctx: SelectionCtx, nodeId: string): void {
  const snapshot = ctx.elementsRef.current;
  const result = selectElementOp(
    snapshot,
    ctx.selectedElementsRef.current,
    nodeId,
  );
  applySelectionMaterial(
    ctx.objectsMap,
    result.affectedNodeIds,
    SELECTION.selected,
  );
  ctx.setSelectedElements(result.updatedSelectedElements);
  ctx.setElements((prev) =>
    prev === snapshot
      ? result.updatedElements
      : selectElementOp(prev, ctx.selectedElementsRef.current, nodeId)
          .updatedElements,
  );
}

/** @internal */
export function applyDeselectElement(ctx: SelectionCtx, nodeId: string): void {
  const snapshot = ctx.elementsRef.current;
  const result = deselectElementOp(
    snapshot,
    ctx.selectedElementsRef.current,
    nodeId,
  );
  applySelectionMaterial(ctx.objectsMap, result.affectedNodeIds, BODY.default);
  ctx.setSelectedElements(result.updatedSelectedElements);
  ctx.setElements((prev) =>
    prev === snapshot
      ? result.updatedElements
      : deselectElementOp(prev, ctx.selectedElementsRef.current, nodeId)
          .updatedElements,
  );
}

// `handleSetModeOp` itself does the Three.js material reset + helper hide
// inside its body. That fires once when called against the snapshot. The
// slow-path re-derive is the pure tail of the op (`{...el, selected: false}`);
// re-running the Three.js side effects is unnecessary because the snapshot
// pass already settled them.
/** @internal */
export function applyDeselectAll(ctx: SelectionCtx, mode: string): void {
  const snapshot = ctx.elementsRef.current;
  const result = handleSetModeOp(snapshot, mode, ctx.objectsMap);
  ctx.setSelectedElements([]);
  ctx.setElements((prev) =>
    prev === snapshot
      ? result.updatedElements
      : prev.map((el) => ({ ...el, selected: false })),
  );
}
export interface ElementMutationsApi {
  // ── State ────────────────────────────────────────────────────────────────
  elements: SceneElement[];
  selectedElements: string[];
  idCounter: number;
  objectsMap: Map<string, THREE.Object3D>;

  // ── Refs (read by composer-level async ops) ──────────────────────────────
  elementsRef: React.MutableRefObject<SceneElement[]>;
  selectedElementsRef: React.MutableRefObject<string[]>;
  idCounterRef: React.MutableRefObject<number>;

  // ── Setters exposed to composer / undo ───────────────────────────────────
  setElements: React.Dispatch<React.SetStateAction<SceneElement[]>>;
  setSelectedElements: React.Dispatch<React.SetStateAction<string[]>>;
  setIdCounter: React.Dispatch<React.SetStateAction<number>>;

  // ── Internal mutations (no undo push) ───────────────────────────────────
  addElementInternal: (
    brep: Brep,
    position: THREE.Vector3,
    object?: THREE.Object3D,
  ) => NodeId;
  removeElementInternal: (nodeId: string) => void;
  updateElementPosition: (nodeId: string, position: THREE.Vector3) => void;
  updateElementRotation: (nodeId: string, rotation: THREE.Euler) => void;

  // ── Selection (does not push undo) ──────────────────────────────────────
  selectElement: (nodeId: string) => void;
  deselectElement: (nodeId: string) => void;
  /** Clear selection in the current `mode` (caller passes mode). */
  deselectAll: (mode: string) => void;

  // ── Object lookup ───────────────────────────────────────────────────────
  getObject: (nodeId: string) => THREE.Object3D | undefined;
  getAllObjects: () => Map<string, THREE.Object3D>;
}

export function useElementMutations(): ElementMutationsApi {
  const [elements, setElements] = useState<SceneElement[]>([]);
  const [selectedElements, setSelectedElements] = useState<string[]>([]);

  // objectsMap is a stable mutable singleton; useState here only runs the
  // initializer once. React doesn't observe its mutations, so don't compare by reference.
  const [objectsMap] = useState<Map<string, THREE.Object3D>>(new Map());
  const [idCounter, setIdCounter] = useState(0);

  // Refs mirror state for async ops that capture them once and read across
  // many event-loop ticks (boolean ops, OCC worker round-trips, sketch solve,
  // sweep/loft profile updates). Pure useState reads in those code paths
  // would close over a stale snapshot from before the first await, then
  // overwrite a concurrent setState with the stale value on commit.
  //
  // The useEffect sync is the React-recommended workaround when refs and
  // state must coexist, do not collapse to a single source-of-truth (refs
  // alone don't trigger re-renders; state alone is stale across awaits).
  const elementsRef = useRef<SceneElement[]>(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  const selectedElementsRef = useRef<string[]>(selectedElements);
  useEffect(() => {
    selectedElementsRef.current = selectedElements;
  }, [selectedElements]);
  // idCounterRef is bumped synchronously inside addElementInternal to claim
  // each ID before any concurrent caller can, closure-captured `idCounter`
  // would let two same-tick adds collide on the same node ID.
  const idCounterRef = useRef<number>(idCounter);
  useEffect(() => {
    idCounterRef.current = idCounter;
  }, [idCounter]);

  const addElementInternal = useCallback(
    (brep: Brep, position: THREE.Vector3, object?: THREE.Object3D) =>
      applyAddElement(
        { idCounterRef, setElements, setIdCounter, objectsMap },
        brep,
        position,
        object,
      ),
    [objectsMap],
  );

  // Functional updater is required: callers like sweep/loft chain updateElementBrep
  // then removeElement in the same tick, and a closed-over `elements` here would
  // clobber the prior update.
  const removeElementInternal = useCallback(
    (nodeId: string) =>
      applyRemoveElement(
        { selectedElementsRef, setElements, setSelectedElements, objectsMap },
        nodeId,
      ),
    [objectsMap],
  );

  const updateElementPosition = useCallback(
    (nodeId: string, position: THREE.Vector3) => {
      setElements((prevElements) =>
        updateElementPositionOp(prevElements, nodeId, position, objectsMap),
      );
    },
    [objectsMap],
  );

  const updateElementRotation = useCallback(
    (nodeId: string, rotation: THREE.Euler) => {
      setElements((prevElements) =>
        updateElementRotationOp(prevElements, nodeId, rotation, objectsMap),
      );
    },
    [objectsMap],
  );

  const selectElement = useCallback(
    (nodeId: string) =>
      applySelectElement(
        {
          elementsRef,
          selectedElementsRef,
          setElements,
          setSelectedElements,
          objectsMap,
        },
        nodeId,
      ),
    [objectsMap],
  );

  const deselectElement = useCallback(
    (nodeId: string) =>
      applyDeselectElement(
        {
          elementsRef,
          selectedElementsRef,
          setElements,
          setSelectedElements,
          objectsMap,
        },
        nodeId,
      ),
    [objectsMap],
  );

  const deselectAll = useCallback(
    (mode: string) =>
      applyDeselectAll(
        {
          elementsRef,
          selectedElementsRef,
          setElements,
          setSelectedElements,
          objectsMap,
        },
        mode,
      ),
    [objectsMap],
  );

  const getObject = useCallback(
    (nodeId: string) => getObjectOp(objectsMap, nodeId),
    [objectsMap],
  );

  const getAllObjects = useCallback(
    () => getAllObjectsOp(objectsMap),
    [objectsMap],
  );

  return {
    elements,
    selectedElements,
    idCounter,
    objectsMap,
    elementsRef,
    selectedElementsRef,
    idCounterRef,
    setElements,
    setSelectedElements,
    setIdCounter,
    addElementInternal,
    removeElementInternal,
    updateElementPosition,
    updateElementRotation,
    selectElement,
    deselectElement,
    deselectAll,
    getObject,
    getAllObjects,
  };
}
