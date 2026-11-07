import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import * as THREE from "three";
import { Brep, Vertex, Edge, cloneBrep } from "../geometry";
import { debugLog, notify } from "../config";
import { handleSetMode as handleSetModeOp } from "../scene-operations/selection-operations";
import { booleanOp } from "../scene-operations/boolean-operations";
import {
  SceneElement,
  SceneMode,
  CombineOperationType,
  BooleanOperationOptions,
  NodeId,
  nodeId as toNodeId,
  combineToBoolean,
  OP_LABEL,
} from "../scene-operations/types";
import {
  createMeshFromBrep,
  createMeshFromGeometry,
  createMeshFromPath,
  disposeAndRemove,
  getAllFaces,
} from "../scene-operations/mesh-operations";
import { createGeometryFromBRep } from "../convertBRepToGeometry";
import {
  Sketch,
  SketchPlane,
  SketchPrimitive,
  SketchConstraint,
  FeatureNode,
  OperationType,
  ConstraintResult,
} from "../types/sketch-types";
import {
  countOperationsOfType,
  applyBooleanOperationToTree,
  applyExtrudeToTree,
  applyFilletToTree,
  applySweepToTree,
  applyRevolveToTree,
  removeNodeById as removeNodeByIdOp,
  removeNodesByElementId,
} from "../scene-operations/feature-tree-operations";
import {
  createSketch as createSketchOp,
  addPrimitiveToSketch,
  addConstraintToSketch,
  removePrimitiveFromSketch,
  removeConstraintFromSketch,
} from "../scene-operations/sketch-operations";
import { SketchSolverService } from "../services/SketchSolverService";
import { SketchToBrepService } from "../services/SketchToBrepService";
import { OccWorkerClient } from "../services/OccWorkerClient";
import type { WorkerProcessProfileResult } from "../workers/occ-worker-types";
import { reconstructEdgeGeometry } from "../workers/geometry-reconstruction";
import {
  UndoableSnapshot,
  MAX_UNDO_STEPS,
  MAX_SKETCH_UNDO_STEPS,
} from "../scene-operations/undo-types";
import { ImportExportService } from "../services/ImportExportService";
import { importElements as importElementsOp } from "../scene-operations/import-operations";
import { Measurement } from "../scene-operations/measure-types";
import { useMeasurements } from "./hooks/useMeasurements";
import { useFeatureTreeState } from "./hooks/useFeatureTreeState";
import { useAsyncPendingGuard } from "./hooks/useAsyncPendingGuard";
import { useElementMutations } from "./hooks/useElementMutations";
import { useUndoStack } from "./hooks/useUndoStack";
import { useSketchSession } from "./hooks/useSketchSession";
import { useLatest } from "./hooks/useLatest";

export interface CadCoreContextType {
  elements: SceneElement[];
  selectedElements: string[];
  mode: SceneMode;
  idCounter: number;
  objectsMap: Map<string, THREE.Object3D>;

  setMode: (mode: SceneMode) => void;
  addElement: (
    brep: Brep,
    position: THREE.Vector3,
    object?: THREE.Object3D,
  ) => void;
  removeElement: (nodeId: string) => void;
  updateElementPosition: (nodeId: string, position: THREE.Vector3) => void;
  selectElement: (nodeId: string) => void;
  deselectElement: (nodeId: string) => void;
  deselectAll: () => void;
  combineSelectedElements: (
    opType: CombineOperationType,
    options: BooleanOperationOptions,
  ) => Promise<boolean | string>;
  updateElementRotation: (nodeId: string, rotation: THREE.Euler) => void;
  getObject: (nodeId: string) => THREE.Object3D | undefined;
  getAllObjects: () => Map<string, THREE.Object3D>;
  createMeshFromBrep: (brep: Brep) => THREE.Object3D;
  updateElementBrep: (
    nodeId: string,
    brep: Brep,
    newPosition?: THREE.Vector3,
    featureUpdate?: { type: OperationType; consumedElementId?: string },
    edgeGeometry?: THREE.BufferGeometry,
    occBrep?: string,
    faceGeometry?: THREE.BufferGeometry,
    vertexPositions?: Float32Array,
  ) => void;
  loftElements: (
    profileNodeIds: string[],
    resultBrep: Brep,
    resultPosition: THREE.Vector3,
    edgeGeometry?: THREE.BufferGeometry,
    occBrep?: string,
    vertexPositions?: Float32Array,
    faceGeometry?: THREE.BufferGeometry,
  ) => void;
  duplicateSelectedElements: () => void;

  activeSketch: Sketch | null;
  updateSketch: (updater: (sketch: Sketch) => Sketch) => void;
  sketches: Sketch[];
  startSketch: (plane: SketchPlane) => string;
  editSketch: (sketchId: string) => void;
  editingSketchId: string | null;
  addPrimitive: (primitive: SketchPrimitive) => void;
  updatePrimitive: (
    primitiveId: string,
    updates: Partial<SketchPrimitive>,
  ) => void;
  updatePrimitivesAndSolve: (
    updates: Map<string, { x: number; y: number }>,
  ) => Promise<void>;
  updatePrimitivePropertyAndSolve: (
    primitiveId: string,
    updates: Partial<SketchPrimitive>,
  ) => Promise<void>;
  addConstraint: (constraint: SketchConstraint) => void;
  addConstraintAndSolve: (
    constraint: SketchConstraint,
  ) => Promise<ConstraintResult>;
  previewConstraint: (
    constraint: SketchConstraint,
  ) => Promise<ConstraintResult>;
  cancelConstraintPreview: () => void;
  commitConstraintPreview: () => void;
  removePrimitive: (primitiveId: string) => void;
  removeConstraint: (constraintId: string) => void;
  updateConstraint: (
    constraintId: string,
    updates: Partial<SketchConstraint>,
  ) => void;
  finishSketch: () => Promise<boolean>;
  cancelSketch: () => void;
  solveSketch: () => Promise<Sketch | null>;

  featureTree: FeatureNode[];
  toggleNodeVisibility: (nodeId: string) => void;
  toggleNodeExpanded: (nodeId: string) => void;
  renameNode: (nodeId: string, newName: string) => void;
  deleteNode: (nodeId: string) => void;
  sectionExpandedState: Record<string, boolean>;
  toggleSectionExpanded: (sectionId: string) => void;
  originVisibility: Record<string, boolean>;
  toggleOriginVisibility: (id: string) => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoActionName: string | null;
  redoActionName: string | null;
  undoStack: UndoableSnapshot[];
  redoStack: UndoableSnapshot[];
  pushUndo: (actionName: string) => void;
  pushSketchUndo: () => void;
  undoSketch: () => void;
  redoSketch: () => void;
  canUndoSketch: boolean;
  canRedoSketch: boolean;

  importFile: (file: File) => Promise<void>;
  exportFile: () => Promise<void>;
  exportStepFile: () => Promise<void>;
  importProject: (file: File) => Promise<void>;
  exportProject: () => Promise<void>;

  pinnedMeasurements: Measurement[];
  addPinnedMeasurement: (measurement: Measurement) => void;
  removePinnedMeasurement: (id: string) => void;
  clearPinnedMeasurements: () => void;

  isOperationPending: boolean;
}

export const CadCoreContext = createContext<CadCoreContextType | undefined>(
  undefined,
);

interface FeatureUpdateConfig {
  label: string;
  counterKey: OperationType;
  applyToTree?: (
    prev: FeatureNode[],
    nodeId: string,
    name: string,
    consumedId?: string,
  ) => FeatureNode[];
}

const FEATURE_UPDATE_CONFIG: Record<string, FeatureUpdateConfig> = {
  extrude: {
    label: "Extrude",
    counterKey: "extrude",
    applyToTree: (prev, nodeId, name) => applyExtrudeToTree(prev, nodeId, name),
  },
  fillet: {
    label: "Fillet",
    counterKey: "fillet",
    applyToTree: (prev, nodeId, name) =>
      applyFilletToTree(prev, nodeId, name, "fillet"),
  },
  chamfer: {
    label: "Chamfer",
    counterKey: "chamfer",
    applyToTree: (prev, nodeId, name) =>
      applyFilletToTree(prev, nodeId, name, "chamfer"),
  },
  sweep: {
    label: "Sweep",
    counterKey: "sweep",
    applyToTree: (prev, nodeId, name, consumedId) =>
      consumedId ? applySweepToTree(prev, nodeId, consumedId, name) : prev,
  },
  revolve: {
    label: "Revolve",
    counterKey: "revolve",
    applyToTree: (prev, nodeId, name) => applyRevolveToTree(prev, nodeId, name),
  },
  // difference's tree update happens via applyBooleanOperationToTree in combineSelectedElementsImpl; consumed element removal is handled inline below.
  difference: { label: "Cut", counterKey: "difference" },
};

export const CadCoreProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const mutations = useElementMutations();
  const {
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
    getObject: getObjectImpl,
    getAllObjects,
  } = mutations;
  const [mode, setMode] = useState<SceneMode>("move");

  // sketchSession is constructed in two halves to break the dep cycle with
  // useUndoStack. The state half (refs + setters) is needed by useUndoStack
  // for snapshots; the methods half needs `pushSketchSnapshot` from useUndoStack.
  // We just declare bare refs/state up front and pass them around.

  const measurements = useMeasurements();

  const featureTreeState = useFeatureTreeState({
    applyVisibility: (elementId, visible) => {
      const obj = objectsMap.get(elementId);
      if (obj) obj.visible = visible;
    },
  });
  const {
    featureTree,
    setFeatureTree,
    sectionExpandedState,
    originVisibility,
    toggleNodeVisibility,
    toggleNodeExpanded,
    renameNode: renameNodeImpl,
    toggleSectionExpanded,
    toggleOriginVisibility,
  } = featureTreeState;

  // elementsRef/selectedElementsRef live in useElementMutations now.

  // sketch refs (solveVersionRef, previewConstraintSnapshotRef, previewVersionRef,
  // activeSketchRef) live in useSketchSession now.

  const pendingGuard = useAsyncPendingGuard();
  const { isOperationPending, isOperationPendingRef, setOperationPending } =
    pendingGuard;

  // Refs for useUndoStack to read at snapshot time without stale closures.
  // idCounterRef now lives in useElementMutations (synced + bumped on every add).
  const featureTreeRef = useLatest(featureTree);
  // sketchesRef lives in useSketchSession now.

  // Forward-ref containers for the sketch session's refs/setters. These get
  // populated by the actual useSketchSession call below; useUndoStack reads
  // them post-mount via the same MutableRefObject contract.
  const sketchActiveSketchHolder = useRef<Sketch | null>(null);
  const sketchSketchesHolder = useRef<Sketch[]>([]);
  const sketchSetters = useRef<{
    setActiveSketch: React.Dispatch<React.SetStateAction<Sketch | null>>;
    setSketches: React.Dispatch<React.SetStateAction<Sketch[]>>;
  }>({
    setActiveSketch: () => {
      /* bound after sketchSession runs */
    },
    setSketches: () => {
      /* bound after sketchSession runs */
    },
  });

  // useUndoStack reads sketchActiveSketchHolder/sketchSketchesHolder for
  // snapshot capture; the actual hook below populates them via useEffect.
  const undoApiPlaceholder = useUndoStack({
    elementsRef,
    idCounterRef,
    featureTreeRef,
    sketchesRef: sketchSketchesHolder,
    activeSketchRef: sketchActiveSketchHolder,
    isOperationPendingRef,
    objectsMap,
    setElements,
    setSelectedElements,
    setIdCounter,
    setFeatureTree,
    setSketches: ((updater) =>
      sketchSetters.current.setSketches(updater)) as React.Dispatch<
      React.SetStateAction<Sketch[]>
    >,
    setActiveSketch: ((updater) =>
      sketchSetters.current.setActiveSketch(updater)) as React.Dispatch<
      React.SetStateAction<Sketch | null>
    >,
  });
  const undoApi = undoApiPlaceholder;

  const sketchSession = useSketchSession({
    idCounter,
    setIdCounter,
    pushSketchSnapshot: undoApi.pushSketchSnapshot,
  });
  const {
    activeSketch,
    sketches,
    previousMode,
    editingSketchId,
    setActiveSketch,
    setSketches,
    setPreviousMode,
    setEditingSketchId,
    activeSketchRef,
    sketchesRef,
    addPrimitive,
    updatePrimitive,
    addConstraint,
    removePrimitive,
    removeConstraint,
    updateConstraint,
    cancelConstraintPreview,
    updatePrimitivesAndSolve,
    updatePrimitivePropertyAndSolve,
    addConstraintAndSolve,
    previewConstraint,
    commitConstraintPreview,
    solveSketch,
  } = sketchSession;

  // Forward refs/setters from the post-mount sketch session into the holder
  // placeholders that useUndoStack captured at the top of this component.
  // Inline assignment (vs useEffect) keeps the holder current for callbacks
  // that fire during this same render, a useEffect alongside this would
  // drift one render late under React StrictMode.
  sketchActiveSketchHolder.current = activeSketchRef.current;
  sketchSketchesHolder.current = sketchesRef.current;
  sketchSetters.current = { setActiveSketch, setSketches };
  const {
    pushUndo,
    undo,
    redo,
    canUndo,
    canRedo,
    undoActionName,
    redoActionName,
    pushSketchUndo,
    undoSketch,
    redoSketch,
    canUndoSketch,
    canRedoSketch,
    undoStackRef,
    redoStackRef,
    sketchUndoStackRef,
    sketchRedoStackRef,
    bumpVersion: setUndoRedoVersionBump,
  } = undoApi;
  const setUndoRedoVersion = useCallback(
    (updater: number | ((v: number) => number)) => {
      // Callers may pass a functional updater; the value is unused, just bump.
      void updater;
      setUndoRedoVersionBump();
    },
    [setUndoRedoVersionBump],
  );

  const handleSetMode = useCallback(
    (newMode: SceneMode) => {
      if (isOperationPendingRef.current) return;

      // Sketch mode requires explicit Finish/Cancel to exit.
      if (activeSketchRef.current && mode === "sketch" && newMode !== "sketch")
        return;

      if (newMode === "sketch" && mode !== "sketch") {
        setPreviousMode(mode);
      }
      // Snapshot + race-merged updater. The op runs Three.js material resets
      // / helper hides inside its body, those fire once against the
      // snapshot. The setElements updater takes a fast path when no
      // concurrent setState landed in the same tick and re-derives the pure
      // `selected: false` reset against `prev` otherwise, so a racing op's
      // elements update is preserved.
      const snapshot = elementsRef.current;
      const result = handleSetModeOp(snapshot, newMode, objectsMap);
      setMode(result.mode);
      setSelectedElements([]);
      setElements((prev) =>
        prev === snapshot
          ? result.updatedElements
          : prev.map((el) => ({ ...el, selected: false })),
      );
    },
    [objectsMap, mode],
  );

  const addElement = useCallback(
    (brep: Brep, position: THREE.Vector3, object?: THREE.Object3D) => {
      pushUndo("Add Shape");
      return addElementInternal(brep, position, object);
    },
    [addElementInternal, pushUndo],
  );

  const removeElement = useCallback(
    (nodeId: string) => {
      pushUndo("Delete");
      removeElementInternal(nodeId);
      setFeatureTree(
        (prev) => removeNodesByElementId(prev, new Set([nodeId])).updatedTree,
      );
    },
    [removeElementInternal, pushUndo, setFeatureTree],
  );

  const deselectAll = useCallback(() => {
    mutations.deselectAll(mode);
  }, [mutations, mode]);

  const combineSelectedElementsImpl = useCallback(
    async (
      opType: CombineOperationType,
      options: BooleanOperationOptions,
    ): Promise<boolean | string> => {
      const effectiveSelected = [options.targetId, ...options.toolIds];
      if (effectiveSelected.length < 2) return "need at least 2 elements";

      const opLabel = OP_LABEL[opType];
      const operation = combineToBoolean(opType);
      pushUndo(opLabel);
      setOperationPending(true);

      try {
        const result = await booleanOp(
          operation,
          elementsRef.current,
          effectiveSelected,
          idCounterRef.current,
          objectsMap,
          options,
        );

        if (!result.ok) {
          notify(`${opLabel} failed: ${result.reason}`, "error");
          undoStackRef.current = undoStackRef.current.slice(0, -1);
          setUndoRedoVersion((v) => v + 1);
          return result.reason;
        }

        const value = result.value;
        // Bump idCounterRef synchronously so any addElementInternal racing this
        // op (or this op being called twice in flight) claims a fresh ID.
        idCounterRef.current = value.nextIdCounter;
        // Functional updater: booleanOp resolved using elementsRef.current at
        // await time, so commit the canonical post-op array.
        setElements(() => value.updatedElements);
        setSelectedElements(value.updatedSelectedElements);
        setIdCounter(value.nextIdCounter);

        const newNodeId = toNodeId(`node_${value.nextIdCounter}`);
        const consumedIds = options.keepTools
          ? [options.targetId]
          : effectiveSelected;
        setFeatureTree((prev) => {
          const name = `${opLabel} ${countOperationsOfType(prev, operation) + 1}`;
          return applyBooleanOperationToTree(
            prev,
            consumedIds,
            newNodeId,
            operation,
            name,
          );
        });
        return true;
      } catch (error) {
        console.error(`${opLabel} error:`, error);
        notify(
          `${opLabel} failed: ${error instanceof Error ? error.message : "unknown error"}`,
          "error",
        );
        undoStackRef.current = undoStackRef.current.slice(0, -1);
        setUndoRedoVersion((v) => v + 1);
        return error instanceof Error ? error.message : "unknown error";
      } finally {
        setOperationPending(false);
      }
    },
    [objectsMap, pushUndo],
  );

  const updateElementBrep = useCallback(
    (
      nodeId: string,
      newBrep: Brep,
      newPosition?: THREE.Vector3,
      featureUpdate?: { type: OperationType; consumedElementId?: string },
      edgeGeometry?: THREE.BufferGeometry,
      occBrep?: string,
      faceGeometry?: THREE.BufferGeometry,
      vertexPositions?: Float32Array,
    ) => {
      // Read via ref: chained updateElementBrep + removeElement calls would otherwise
      // see a stale `elements` and clobber each other.
      const existingElement = elementsRef.current.find(
        (el) => el.nodeId === nodeId,
      );
      if (!existingElement) {
        console.warn(`Element ${nodeId} not found for brep update`);
        return;
      }

      const config = featureUpdate
        ? FEATURE_UPDATE_CONFIG[featureUpdate.type]
        : undefined;
      pushUndo(config?.label ?? "Update Shape");

      const position = newPosition || existingElement.position;

      let mesh: THREE.Group;
      if (edgeGeometry) {
        let geom: THREE.BufferGeometry;
        if (faceGeometry) {
          // OCC-tessellated faces are smooth; the BRep fallback exposes triangle internals.
          geom = faceGeometry;
        } else {
          const faces = getAllFaces(newBrep);
          geom = createGeometryFromBRep(faces);
        }
        mesh = createMeshFromGeometry(geom, edgeGeometry);
      } else {
        mesh = createMeshFromBrep(newBrep);
      }
      mesh.position.copy(position);
      if (existingElement.rotation) {
        mesh.rotation.copy(existingElement.rotation);
      }
      mesh.userData.nodeId = nodeId;

      const oldObj = objectsMap.get(nodeId);
      if (oldObj) {
        const parent = oldObj.parent;
        disposeAndRemove(oldObj);
        if (parent) parent.add(mesh);
      }

      objectsMap.set(nodeId, mesh);

      setElements((prevElements) =>
        prevElements.map((element) => {
          if (element.nodeId === nodeId) {
            const is3DOperation =
              featureUpdate?.type === "extrude" ||
              featureUpdate?.type === "sweep" ||
              featureUpdate?.type === "loft" ||
              featureUpdate?.type === "revolve";
            return {
              ...element,
              brep: newBrep,
              position,
              occBrep,
              edgeGeometry,
              faceGeometry,
              vertexPositions,
              ...(is3DOperation ? { sketchPlane: undefined } : {}),
            };
          }
          return element;
        }),
      );

      if (config?.applyToTree) {
        const consumedId = featureUpdate!.consumedElementId;
        setFeatureTree((prev) => {
          const name = `${config.label} ${countOperationsOfType(prev, config.counterKey) + 1}`;
          return config.applyToTree!(prev, nodeId, name, consumedId);
        });
      }

      if (
        featureUpdate?.type === "difference" &&
        featureUpdate.consumedElementId
      ) {
        removeElementInternal(featureUpdate.consumedElementId);
      }
    },
    [objectsMap, pushUndo],
  );

  const loftElementsImpl = useCallback(
    (
      profileNodeIds: string[],
      resultBrep: Brep,
      resultPosition: THREE.Vector3,
      edgeGeometry?: THREE.BufferGeometry,
      occBrep?: string,
      vertexPositions?: Float32Array,
      faceGeometry?: THREE.BufferGeometry,
    ) => {
      if (profileNodeIds.length < 2) return;

      pushUndo("Loft");

      const consumedIds = profileNodeIds.map(toNodeId);

      let mesh: THREE.Group;
      if (edgeGeometry) {
        let geom: THREE.BufferGeometry;
        if (faceGeometry) {
          geom = faceGeometry;
        } else {
          const faces = getAllFaces(resultBrep);
          geom = createGeometryFromBRep(faces);
        }
        mesh = createMeshFromGeometry(geom, edgeGeometry);
      } else {
        mesh = createMeshFromBrep(resultBrep);
      }

      const newIdCounter = idCounterRef.current + 1;
      const newNodeId = toNodeId(`node_${newIdCounter}`);
      idCounterRef.current = newIdCounter;

      mesh.position.copy(resultPosition);
      mesh.userData.nodeId = newNodeId;
      objectsMap.set(newNodeId, mesh);

      const newElements = elementsRef.current.filter(
        (el) => !consumedIds.includes(el.nodeId),
      );
      const newElement: SceneElement = {
        brep: resultBrep,
        nodeId: newNodeId,
        position: resultPosition.clone(),
        selected: false,
        occBrep,
        edgeGeometry,
        vertexPositions,
      };
      newElements.push(newElement);

      for (const nodeId of consumedIds) {
        disposeAndRemove(objectsMap.get(nodeId));
        objectsMap.delete(nodeId);
      }

      // Functional updater: newElements derived from elementsRef.current; commit
      // the canonical post-op array.
      setElements(() => newElements);
      setSelectedElements([]);
      setIdCounter(newIdCounter);

      setFeatureTree((prev) => {
        const name = `Loft ${countOperationsOfType(prev, "loft") + 1}`;
        return applyBooleanOperationToTree(
          prev,
          consumedIds,
          newNodeId,
          "loft",
          name,
        );
      });
    },
    [objectsMap, pushUndo],
  );

  const duplicateSelectedElementsImpl = useCallback(() => {
    // Read selectedElements / elements / idCounter from refs so chained calls
    // in one tick (or calls that race a pending state update) don't see a
    // stale closure.
    const currentSelected = selectedElementsRef.current;
    if (currentSelected.length === 0) return;

    pushUndo("Duplicate");

    const newElements: SceneElement[] = [];
    let nextId = idCounterRef.current;

    for (const nodeId of currentSelected) {
      const element = elementsRef.current.find((el) => el.nodeId === nodeId);
      if (!element) continue;

      nextId++;
      const newNodeId = toNodeId(`node_${nextId}`);

      const newBrep = cloneBrep(element.brep);
      const newPosition = element.position
        .clone()
        .add(new THREE.Vector3(1, 1, 0));
      const newRotation = element.rotation
        ? element.rotation.clone()
        : undefined;
      const newEdgeGeometry = element.edgeGeometry
        ? element.edgeGeometry.clone()
        : undefined;
      const newVertexPositions = element.vertexPositions
        ? new Float32Array(element.vertexPositions)
        : undefined;
      const newPathData = element.pathData
        ? { points: element.pathData.points.map((p) => ({ ...p })) }
        : undefined;

      let mesh: THREE.Group;
      if (newEdgeGeometry) {
        const faces = getAllFaces(newBrep);
        const geom = createGeometryFromBRep(faces);
        mesh = createMeshFromGeometry(geom, newEdgeGeometry);
      } else if (newPathData) {
        mesh = createMeshFromPath(newPathData.points);
      } else {
        mesh = createMeshFromBrep(newBrep);
      }
      mesh.position.copy(newPosition);
      if (newRotation) mesh.rotation.copy(newRotation);
      mesh.userData.nodeId = newNodeId;

      const oldObj = objectsMap.get(nodeId);
      if (oldObj && oldObj.parent) {
        oldObj.parent.add(mesh);
      }
      objectsMap.set(newNodeId, mesh);

      const newElement: SceneElement = {
        brep: newBrep,
        nodeId: newNodeId,
        position: newPosition,
        selected: false,
        rotation: newRotation,
        elementType: element.elementType,
        pathData: newPathData,
        occBrep: element.occBrep,
        edgeGeometry: newEdgeGeometry,
        vertexPositions: newVertexPositions,
        sketchPlane: element.sketchPlane,
      };
      newElements.push(newElement);
    }

    // Bump idCounterRef synchronously so any addElement racing this duplicate
    // claims a fresh ID rather than colliding with one we just allocated.
    idCounterRef.current = nextId;
    setElements((prev) => [...prev, ...newElements]);
    setIdCounter(nextId);

    setSelectedElements(newElements.map((el) => el.nodeId));

    setFeatureTree((prev) => {
      let tree = [...prev];
      for (const newEl of newElements) {
        const originalNodeId = currentSelected[newElements.indexOf(newEl)];
        let originalName = "Body";
        const findName = (nodes: FeatureNode[]): string | null => {
          for (const n of nodes) {
            if (n.elementId === originalNodeId) return n.name;
            if (n.children) {
              const found = findName(n.children);
              if (found) return found;
            }
          }
          return null;
        };
        const found = findName(tree);
        if (found) originalName = found;

        tree = [
          ...tree,
          {
            id: `body_${newEl.nodeId}`,
            type: "body" as const,
            name: `Copy of ${originalName}`,
            visible: true,
            elementId: newEl.nodeId,
          },
        ];
      }
      return tree;
    });
  }, [objectsMap, pushUndo]);

  const startSketch = useCallback(
    (plane: SketchPlane): string => {
      const result = createSketchOp(plane, idCounterRef.current);
      idCounterRef.current = result.nextId;
      setActiveSketch(result.sketch);
      setIdCounter(result.nextId);
      // Don't overwrite previousMode if we re-entered from plane selection, that path already
      // captured the originating mode and we want to restore back to it on cancel.
      if (mode !== "sketch") {
        setPreviousMode(mode);
      }
      setMode("sketch");
      return result.sketch.id;
    },
    [mode, idCounterRef, setIdCounter, setActiveSketch, setPreviousMode],
  );

  const editSketch = useCallback(
    (sketchId: string) => {
      if (isOperationPendingRef.current) {
        console.warn("Cannot edit sketch while an operation is pending");
        return;
      }

      if (activeSketch) {
        console.warn("Cannot edit sketch while another sketch is active");
        return;
      }

      const sketch = sketches.find((s) => s.id === sketchId);
      if (!sketch) {
        console.warn(`Sketch ${sketchId} not found`);
        return;
      }

      const sketchNode = featureTree.find(
        (n) => n.id === sketchId && n.type === "sketch",
      );
      if (!sketchNode) {
        console.warn(`Feature tree node for sketch ${sketchId} not found`);
        return;
      }

      pushUndo("Edit Sketch");

      for (const child of sketchNode.children ?? []) {
        if (child.elementId) {
          removeElementInternal(child.elementId);
        }
      }

      setFeatureTree((prev) =>
        prev.map((node) =>
          node.id === sketchId ? { ...node, children: [] } : node,
        ),
      );

      setEditingSketchId(sketchId);
      setActiveSketch(structuredClone(sketch));
      if (mode !== "sketch") {
        setPreviousMode(mode);
      }
      setMode("sketch");
    },
    [
      activeSketch,
      sketches,
      featureTree,
      mode,
      pushUndo,
      removeElementInternal,
    ],
  );

  const finishSketch = useCallback(async (): Promise<boolean> => {
    if (!activeSketch) {
      console.warn("No active sketch to finish");
      return false;
    }

    pushUndo("Finish Sketch");
    setOperationPending(true);

    sketchUndoStackRef.current = [];
    sketchRedoStackRef.current = [];

    try {
      const solver = SketchSolverService.getInstance();
      const result = await solver.solve(activeSketch);
      const finishedSketch = result.sketch;

      if (editingSketchId) {
        setSketches((prev) =>
          prev.map((s) => (s.id === editingSketchId ? finishedSketch : s)),
        );
      } else {
        setSketches((prev) => [...prev, finishedSketch]);
      }

      const sketchService = SketchToBrepService.getInstance();

      // Profile detection handles T-junctions left by trim/extend; closed-wire fallback below.
      const conversionResult =
        await sketchService.convertSketchToProfiles(finishedSketch);

      if (conversionResult.success && conversionResult.profiles.length > 0) {
        const profileChildren: FeatureNode[] = [];

        // Track idCounter locally, React batches setIdCounter, so reading state
        // between profile loops would give us back the same starting value.
        let currentIdCounter = idCounterRef.current;
        const newProfileElements: SceneElement[] = [];

        for (let i = 0; i < conversionResult.profiles.length; i++) {
          const profile = conversionResult.profiles[i]!;

          if (profile.brep.faces.length > 0) {
            currentIdCounter++;
            const nodeId = toNodeId(`node_${currentIdCounter}`);

            // Exact center, no grid snap: snapping would drift each profile by up to ±0.25
            // and break the relative alignment between sibling profiles.
            const position = new THREE.Vector3(
              profile.center.x,
              profile.center.y,
              profile.center.z,
            );

            let edgeGeometry: THREE.BufferGeometry | undefined;
            let vertexPositions: Float32Array | undefined;
            let occBrep: string | undefined;
            try {
              const client = OccWorkerClient.getInstance();
              const profileResult =
                await client.send<WorkerProcessProfileResult>({
                  type: "processProfile",
                  payload: {
                    brepJson: profile.brep.toJSON(),
                    occBrep: profile.occBrep,
                  },
                });

              if (profileResult.edgePositions) {
                edgeGeometry = reconstructEdgeGeometry(
                  profileResult.edgePositions,
                );
              }
              if (profileResult.vertexPositions) {
                vertexPositions = profileResult.vertexPositions;
              }
              if (profileResult.occBrep) {
                occBrep = profileResult.occBrep;
              }
            } catch (e) {
              console.warn("Failed to compute profile edge geometry:", e);
            }

            let mesh: THREE.Group;
            if (edgeGeometry) {
              const faces = getAllFaces(profile.brep);
              const faceGeometry = createGeometryFromBRep(faces);
              mesh = createMeshFromGeometry(faceGeometry, edgeGeometry);
            } else {
              mesh = createMeshFromBrep(profile.brep);
            }
            mesh.position.copy(position);
            mesh.userData.nodeId = nodeId;

            objectsMap.set(nodeId, mesh);

            const newElement: SceneElement = {
              brep: profile.brep,
              nodeId,
              position: position.clone(),
              selected: false,
              sketchPlane: finishedSketch.plane,
              edgeGeometry,
              vertexPositions,
              occBrep,
            };
            newProfileElements.push(newElement);

            profileChildren.push({
              id: profile.id,
              type: "profile",
              name: `Profile ${i + 1} (area: ${profile.area.toFixed(2)})`,
              visible: true,
              sourceSketchId: finishedSketch.id,
              elementId: nodeId,
            });
          }
        }

        // Functional updater, editSketch's removeElementInternal may have a setElements pending.
        idCounterRef.current = currentIdCounter;
        setElements((prev) => [...prev, ...newProfileElements]);
        setIdCounter(currentIdCounter);

        if (editingSketchId) {
          setFeatureTree((prev) =>
            prev.map((node) =>
              node.id === editingSketchId && node.type === "sketch"
                ? { ...node, children: profileChildren }
                : node,
            ),
          );
        } else {
          const sketchNode: FeatureNode = {
            id: finishedSketch.id,
            type: "sketch",
            name: `Sketch ${sketches.length + 1}`,
            visible: true,
            expanded: true,
            children: profileChildren,
            sourceSketchId: finishedSketch.id,
          };
          setFeatureTree((prev) => [...prev, sketchNode]);
        }
      } else if (!sketchService.isSketchClosed(finishedSketch)) {
        // No profiles found AND sketch is open → try wire path for sweep
        debugLog(
          "[finishSketch] Open sketch detected, creating path element for sweep",
        );
        const wireResult =
          await sketchService.convertSketchToWire(finishedSketch);

        if (wireResult && wireResult.points.length >= 2) {
          const vertices = wireResult.points.map(
            (p) => new Vertex(p.x, p.y, p.z),
          );
          const edges: Edge[] = [];
          for (let i = 0; i < vertices.length - 1; i++) {
            edges.push(new Edge(vertices[i]!, vertices[i + 1]!));
          }
          const pathBrep = new Brep(vertices, edges, []);

          const currentId = idCounterRef.current + 1;
          idCounterRef.current = currentId;
          const nodeId = toNodeId(`node_${currentId}`);
          const position = new THREE.Vector3(0, 0, 0);

          const mesh = createMeshFromPath(wireResult.points);
          mesh.position.copy(position);
          mesh.userData.nodeId = nodeId;
          objectsMap.set(nodeId, mesh);

          const pathElement: SceneElement = {
            brep: pathBrep,
            nodeId,
            position: position.clone(),
            selected: false,
            elementType: "path",
            pathData: { points: wireResult.points },
          };

          setElements((prev) => [...prev, pathElement]);
          setIdCounter(currentId);

          const pathChild: FeatureNode = {
            id: `${finishedSketch.id}_path`,
            type: "body",
            name: "Path",
            visible: true,
            sourceSketchId: finishedSketch.id,
            elementId: nodeId,
          };

          if (editingSketchId) {
            setFeatureTree((prev) =>
              prev.map((node) =>
                node.id === editingSketchId && node.type === "sketch"
                  ? { ...node, children: [pathChild] }
                  : node,
              ),
            );
          } else {
            const sketchNode: FeatureNode = {
              id: finishedSketch.id,
              type: "sketch",
              name: `Sketch ${sketches.length + 1} (Path)`,
              visible: true,
              expanded: true,
              children: [pathChild],
              sourceSketchId: finishedSketch.id,
            };
            setFeatureTree((prev) => [...prev, sketchNode]);
          }
        } else {
          console.warn("[finishSketch] Open sketch produced no valid wire");
        }
      } else {
        // Closed sketch but profile detection found nothing, fall back to a single union body.
        const brep = await sketchService.convertSketchToBrep(finishedSketch);

        if (
          brep.vertices.length > 0 ||
          brep.edges.length > 0 ||
          brep.faces.length > 0
        ) {
          const position = new THREE.Vector3(0, 0, 0);
          const nodeId = addElementInternal(brep, position);

          const bodyChild: FeatureNode = {
            id: `${finishedSketch.id}_body`,
            type: "body",
            name: "Body",
            visible: true,
            sourceSketchId: finishedSketch.id,
            elementId: nodeId,
          };

          if (editingSketchId) {
            setFeatureTree((prev) =>
              prev.map((node) =>
                node.id === editingSketchId && node.type === "sketch"
                  ? { ...node, children: [bodyChild] }
                  : node,
              ),
            );
          } else {
            const sketchNode: FeatureNode = {
              id: finishedSketch.id,
              type: "sketch",
              name: `Sketch ${sketches.length + 1}`,
              visible: true,
              expanded: true,
              children: [bodyChild],
              sourceSketchId: finishedSketch.id,
            };
            setFeatureTree((prev) => [...prev, sketchNode]);
          }
        } else {
          console.warn(
            "Sketch produced empty BRep - no vertices, edges, or faces",
          );
        }
      }

      setActiveSketch(null);
      setEditingSketchId(null);
      setMode(previousMode);
      setOperationPending(false);
      return true;
    } catch (error) {
      console.error("Error finishing sketch:", error);
      notify(
        `Error finishing sketch: ${error instanceof Error ? error.message : "unknown error"}`,
        "error",
      );
      undoStackRef.current = undoStackRef.current.slice(0, -1);
      setUndoRedoVersion((v) => v + 1);
      setActiveSketch(null);
      setEditingSketchId(null);
      setMode(previousMode);
      setOperationPending(false);
      return false;
    }
  }, [
    activeSketch,
    previousMode,
    addElementInternal,
    sketches.length,
    pushUndo,
    editingSketchId,
  ]);

  const cancelSketch = useCallback(() => {
    sketchUndoStackRef.current = [];
    sketchRedoStackRef.current = [];
    setActiveSketch(null);
    setMode(previousMode);
    if (editingSketchId) {
      setEditingSketchId(null);
      // Undo restores pre-edit profiles + feature-tree children consumed by editSketch.
      undo();
    }
  }, [previousMode, editingSketchId, undo]);

  const deleteNodeImpl = useCallback(
    (nodeId: string) => {
      pushUndo("Delete");

      function findNode(nodes: FeatureNode[]): FeatureNode | null {
        for (const node of nodes) {
          if (node.id === nodeId) return node;
          if (node.children) {
            const found = findNode(node.children);
            if (found) return found;
          }
        }
        return null;
      }

      const node = findNode(featureTree);
      if (!node) return;

      if (node.elementId) {
        removeElementInternal(node.elementId);
      }

      if (node.children) {
        for (const child of node.children) {
          if (child.elementId) {
            removeElementInternal(child.elementId);
          }
        }
      }

      setFeatureTree((prev) => removeNodeByIdOp(prev, nodeId).updatedTree);
    },
    [featureTree, removeElementInternal, pushUndo],
  );

  const importFile = useCallback(
    async (file: File) => {
      const ieService = ImportExportService.getInstance();
      const buffer = await file.arrayBuffer();
      const ext = file.name.split(".").pop()?.toLowerCase();

      let results;
      if (ext === "stl") {
        results = await ieService.import(buffer);
      } else if (ext === "step" || ext === "stp") {
        results = await ieService.importStep(buffer);
      } else {
        throw new Error(`Unsupported file format: .${ext}`);
      }

      pushUndo("Import");

      const result = importElementsOp(
        elementsRef.current,
        results,
        idCounterRef.current,
        objectsMap,
      );
      idCounterRef.current = result.nextId;
      // Functional updater: importElementsOp computed result from elementsRef.current
      // at await-resolve time; commit the canonical array.
      setElements(() => result.updatedElements);
      setIdCounter(result.nextId);

      const importNodes: FeatureNode[] = result.nodeIds.map((nodeId, i) => ({
        id: `import_${nodeId}`,
        type: "body" as const,
        name: results.length === 1 ? file.name : `${file.name} [${i + 1}]`,
        visible: true,
        elementId: nodeId,
      }));
      setFeatureTree((prev) => [...prev, ...importNodes]);
    },
    [objectsMap, pushUndo],
  );

  const exportFile = useCallback(async () => {
    const currentElements = elementsRef.current;
    if (currentElements.length === 0) return;

    const ieService = ImportExportService.getInstance();
    const blob = await ieService.export(currentElements);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "export.stl";
    a.click();
    URL.revokeObjectURL(url);
  }, [elementsRef]);

  const exportStepFile = useCallback(async () => {
    const currentElements = elementsRef.current;
    if (currentElements.length === 0) return;

    const ieService = ImportExportService.getInstance();
    const blob = await ieService.exportStep(currentElements);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "export.step";
    a.click();
    URL.revokeObjectURL(url);
  }, [elementsRef]);

  const exportProject = useCallback(async () => {
    const ieService = ImportExportService.getInstance();
    const blob = ieService.exportProject({
      elements: elementsRef.current,
      sketches: sketchesRef.current,
      featureTree: featureTreeRef.current,
      idCounter: idCounterRef.current,
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project.${ImportExportService.PROJECT_FILE_EXTENSION}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [elementsRef, sketchesRef, featureTreeRef, idCounterRef]);

  const importProject = useCallback(
    async (file: File) => {
      const ieService = ImportExportService.getInstance();
      const buffer = await file.arrayBuffer();
      const project = await ieService.importProject(buffer);

      pushUndo("Open Project");

      // Drop existing meshes: detach from scene + dispose, then clear the
      // objectsMap so the scene-sync effect doesn't re-attach them when the
      // new elements come in.
      for (const obj of Array.from(objectsMap.values())) {
        disposeAndRemove(obj);
      }
      objectsMap.clear();

      // Build fresh meshes for the imported elements and seed objectsMap before
      // the elements state update so the scene-sync effect sees a coherent map.
      for (const el of project.elements) {
        const mesh = createMeshFromBrep(el.brep);
        mesh.position.copy(el.position);
        if (el.rotation) mesh.rotation.copy(el.rotation);
        objectsMap.set(el.nodeId, mesh);
      }

      setElements(() => project.elements);
      setSelectedElements([]);
      setIdCounter(project.idCounter);
      idCounterRef.current = project.idCounter;
      setFeatureTree(() => project.featureTree);
      setSketches(() => project.sketches);
      setActiveSketch(() => null);
    },
    [
      objectsMap,
      pushUndo,
      setElements,
      setSelectedElements,
      setIdCounter,
      setFeatureTree,
      setSketches,
      setActiveSketch,
      idCounterRef,
    ],
  );

  return (
    <CadCoreContext.Provider
      value={{
        elements,
        selectedElements,
        mode,
        idCounter,
        objectsMap,
        setMode: handleSetMode,
        addElement,
        removeElement,
        updateElementPosition,
        selectElement,
        deselectElement,
        deselectAll,
        combineSelectedElements: combineSelectedElementsImpl,
        updateElementRotation,
        getObject: getObjectImpl,
        getAllObjects,
        createMeshFromBrep,
        updateElementBrep,
        loftElements: loftElementsImpl,
        duplicateSelectedElements: duplicateSelectedElementsImpl,
        activeSketch,
        updateSketch: (updater) =>
          setActiveSketch((current) => (current ? updater(current) : current)),
        sketches,
        startSketch,
        editSketch,
        editingSketchId,
        addPrimitive,
        updatePrimitive,
        updatePrimitivesAndSolve,
        updatePrimitivePropertyAndSolve,
        addConstraint,
        addConstraintAndSolve,
        previewConstraint,
        cancelConstraintPreview,
        commitConstraintPreview,
        removePrimitive,
        removeConstraint,
        updateConstraint,
        finishSketch,
        cancelSketch,
        solveSketch,
        featureTree,
        toggleNodeVisibility,
        toggleNodeExpanded,
        renameNode: renameNodeImpl,
        deleteNode: deleteNodeImpl,
        sectionExpandedState,
        toggleSectionExpanded,
        originVisibility,
        toggleOriginVisibility,
        undo,
        redo,
        canUndo,
        canRedo,
        undoActionName,
        redoActionName,
        undoStack: undoStackRef.current,
        redoStack: redoStackRef.current,
        pushUndo,
        pushSketchUndo,
        undoSketch,
        redoSketch,
        canUndoSketch,
        canRedoSketch,
        importFile,
        exportFile,
        exportStepFile,
        importProject,
        exportProject,
        pinnedMeasurements: measurements.pinnedMeasurements,
        addPinnedMeasurement: measurements.addPinnedMeasurement,
        removePinnedMeasurement: measurements.removePinnedMeasurement,
        clearPinnedMeasurements: measurements.clearPinnedMeasurements,
        isOperationPending,
      }}
    >
      {children}
    </CadCoreContext.Provider>
  );
};

export const useCadCore = () => {
  const context = useContext(CadCoreContext);
  if (context === undefined) {
    throw new Error("useCadCore must be used within a CadCoreProvider");
  }
  return context;
};
