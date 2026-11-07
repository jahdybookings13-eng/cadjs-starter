import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { FeatureNode, Sketch } from "../../types/sketch-types";
import { SceneElement } from "../../scene-operations/types";
import {
  createMeshFromBrep,
  createMeshFromGeometry,
  createMeshFromPath,
  disposeAndRemove,
  getAllFaces,
} from "../../scene-operations/mesh-operations";
import { createGeometryFromBRep } from "../../convertBRepToGeometry";
import {
  UndoableSnapshot,
  MAX_UNDO_STEPS,
  MAX_SKETCH_UNDO_STEPS,
} from "../../scene-operations/undo-types";

/**
 * Owns the global undo/redo stacks plus the sketch-scoped undo/redo stacks.
 *
 * `captureSnapshot` reads from refs so async ops can push undo without stale
 * closures. `restoreSnapshot` rebuilds meshes from the snapshot's BRep data
 * and pushes the result back through `mutations.setElements` etc.
 *
 * Sketch undo is intentionally a separate stack, it tracks primitive/constraint
 * changes within an active sketch session. Cleared when finishSketch/cancelSketch
 * leaves the session (the leave is itself a main-stack undo entry).
 */
export interface UndoStackApi {
  undoStack: UndoableSnapshot[];
  redoStack: UndoableSnapshot[];
  pushUndo: (actionName: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoActionName: string | null;
  redoActionName: string | null;

  pushSketchUndo: () => void;
  /** Push a specific sketch snapshot onto the sketch undo stack, used by
   *  constraint-preview commit, which has a separate snapshot ref distinct
   *  from `activeSketchRef`. */
  pushSketchSnapshot: (sketch: Sketch) => void;
  undoSketch: () => void;
  redoSketch: () => void;
  canUndoSketch: boolean;
  canRedoSketch: boolean;

  /** Stack refs exposed for composer-level edge cases (e.g. boolean op rolling
   *  back its own undo entry on failure). */
  undoStackRef: React.MutableRefObject<UndoableSnapshot[]>;
  redoStackRef: React.MutableRefObject<UndoableSnapshot[]>;
  sketchUndoStackRef: React.MutableRefObject<Sketch[]>;
  sketchRedoStackRef: React.MutableRefObject<Sketch[]>;
  bumpVersion: () => void;
}

export interface UseUndoStackDeps {
  // Read at snapshot time
  elementsRef: React.MutableRefObject<SceneElement[]>;
  idCounterRef: React.MutableRefObject<number>;
  featureTreeRef: React.MutableRefObject<FeatureNode[]>;
  sketchesRef: React.MutableRefObject<Sketch[]>;
  activeSketchRef: React.MutableRefObject<Sketch | null>;
  // Async-op gate, undo is suppressed while a long op is in flight.
  isOperationPendingRef: React.MutableRefObject<boolean>;
  // Three.js objects map, restoreSnapshot rebuilds it from BRep.
  objectsMap: Map<string, THREE.Object3D>;
  // State setters used by restoreSnapshot.
  setElements: React.Dispatch<React.SetStateAction<SceneElement[]>>;
  setSelectedElements: React.Dispatch<React.SetStateAction<string[]>>;
  setIdCounter: React.Dispatch<React.SetStateAction<number>>;
  setFeatureTree: React.Dispatch<React.SetStateAction<FeatureNode[]>>;
  setSketches: React.Dispatch<React.SetStateAction<Sketch[]>>;
  setActiveSketch: React.Dispatch<React.SetStateAction<Sketch | null>>;
}

export type UndoSnapshotInputs = Pick<
  UseUndoStackDeps,
  "elementsRef" | "idCounterRef" | "featureTreeRef" | "sketchesRef"
>;

// Position/rotation on SceneElement are THREE class instances; without a deep
// clone, a TransformControls drag after the snapshot mutates the snapshot too.
export function buildUndoSnapshot(
  deps: UndoSnapshotInputs,
  actionName: string,
): UndoableSnapshot {
  return {
    elements: deps.elementsRef.current.map((el) => ({
      ...el,
      position: el.position.clone(),
      rotation: el.rotation?.clone(),
    })),
    idCounter: deps.idCounterRef.current,
    featureTree: [...deps.featureTreeRef.current],
    sketches: [...deps.sketchesRef.current],
    actionName,
    timestamp: Date.now(),
  };
}

export function useUndoStack(deps: UseUndoStackDeps): UndoStackApi {
  const undoStackRef = useRef<UndoableSnapshot[]>([]);
  const redoStackRef = useRef<UndoableSnapshot[]>([]);
  const sketchUndoStackRef = useRef<Sketch[]>([]);
  const sketchRedoStackRef = useRef<Sketch[]>([]);
  const [undoRedoVersion, setUndoRedoVersion] = useState(0);

  const bumpVersion = useCallback(() => setUndoRedoVersion((v) => v + 1), []);

  const captureSnapshot = useCallback(
    (actionName: string): UndoableSnapshot =>
      buildUndoSnapshot(
        {
          elementsRef: deps.elementsRef,
          idCounterRef: deps.idCounterRef,
          featureTreeRef: deps.featureTreeRef,
          sketchesRef: deps.sketchesRef,
        },
        actionName,
      ),
    [
      deps.elementsRef,
      deps.idCounterRef,
      deps.featureTreeRef,
      deps.sketchesRef,
    ],
  );

  const restoreSnapshot = useCallback(
    (snapshot: UndoableSnapshot) => {
      const {
        objectsMap,
        setElements,
        setSelectedElements,
        setIdCounter,
        setFeatureTree,
        setSketches,
      } = deps;

      const oldEntries = Array.from(objectsMap.entries());
      for (const [, obj] of oldEntries) {
        disposeAndRemove(obj);
      }
      objectsMap.clear();

      for (const el of snapshot.elements) {
        let mesh: THREE.Group;
        if (el.elementType === "path" && el.pathData) {
          mesh = createMeshFromPath(el.pathData.points);
        } else if (el.edgeGeometry) {
          const geom =
            el.faceGeometry ?? createGeometryFromBRep(getAllFaces(el.brep));
          mesh = createMeshFromGeometry(geom, el.edgeGeometry);
        } else {
          mesh = createMeshFromBrep(el.brep);
        }
        mesh.position.copy(el.position);
        if (el.rotation) {
          mesh.rotation.copy(el.rotation);
        }
        mesh.userData.nodeId = el.nodeId;
        objectsMap.set(el.nodeId, mesh);
      }

      setElements(snapshot.elements);
      setIdCounter(snapshot.idCounter);
      setFeatureTree(snapshot.featureTree);
      setSketches(snapshot.sketches);
      setSelectedElements([]);
    },
    [deps],
  );

  const pushUndo = useCallback(
    (actionName: string) => {
      const snapshot = captureSnapshot(actionName);
      undoStackRef.current = [...undoStackRef.current, snapshot];
      if (undoStackRef.current.length > MAX_UNDO_STEPS) {
        undoStackRef.current = undoStackRef.current.slice(
          undoStackRef.current.length - MAX_UNDO_STEPS,
        );
      }
      redoStackRef.current = [];
      bumpVersion();
    },
    [captureSnapshot, bumpVersion],
  );

  const undo = useCallback(() => {
    if (deps.isOperationPendingRef.current) return;
    if (undoStackRef.current.length === 0) return;

    const snapshot = undoStackRef.current[undoStackRef.current.length - 1]!;
    undoStackRef.current = undoStackRef.current.slice(0, -1);

    const currentSnapshot = captureSnapshot(snapshot.actionName);
    redoStackRef.current = [...redoStackRef.current, currentSnapshot];

    restoreSnapshot(snapshot);
    bumpVersion();
  }, [
    captureSnapshot,
    restoreSnapshot,
    bumpVersion,
    deps.isOperationPendingRef,
  ]);

  const redo = useCallback(() => {
    if (deps.isOperationPendingRef.current) return;
    if (redoStackRef.current.length === 0) return;

    const snapshot = redoStackRef.current[redoStackRef.current.length - 1]!;
    redoStackRef.current = redoStackRef.current.slice(0, -1);

    const currentSnapshot = captureSnapshot(snapshot.actionName);
    undoStackRef.current = [...undoStackRef.current, currentSnapshot];

    restoreSnapshot(snapshot);
    bumpVersion();
  }, [
    captureSnapshot,
    restoreSnapshot,
    bumpVersion,
    deps.isOperationPendingRef,
  ]);

  const pushSketchSnapshot = useCallback(
    (sketch: Sketch) => {
      sketchUndoStackRef.current = [...sketchUndoStackRef.current, sketch];
      if (sketchUndoStackRef.current.length > MAX_SKETCH_UNDO_STEPS) {
        sketchUndoStackRef.current = sketchUndoStackRef.current.slice(
          sketchUndoStackRef.current.length - MAX_SKETCH_UNDO_STEPS,
        );
      }
      sketchRedoStackRef.current = [];
      bumpVersion();
    },
    [bumpVersion],
  );

  const pushSketchUndo = useCallback(() => {
    const sketch = deps.activeSketchRef.current;
    if (sketch) pushSketchSnapshot(sketch);
  }, [deps.activeSketchRef, pushSketchSnapshot]);

  const undoSketch = useCallback(() => {
    if (sketchUndoStackRef.current.length === 0) return;

    const snapshot =
      sketchUndoStackRef.current[sketchUndoStackRef.current.length - 1]!;
    sketchUndoStackRef.current = sketchUndoStackRef.current.slice(0, -1);

    const current = deps.activeSketchRef.current;
    if (current) {
      sketchRedoStackRef.current = [...sketchRedoStackRef.current, current];
    }

    deps.setActiveSketch(snapshot);
    bumpVersion();
  }, [deps, bumpVersion]);

  const redoSketch = useCallback(() => {
    if (sketchRedoStackRef.current.length === 0) return;

    const snapshot =
      sketchRedoStackRef.current[sketchRedoStackRef.current.length - 1]!;
    sketchRedoStackRef.current = sketchRedoStackRef.current.slice(0, -1);

    const current = deps.activeSketchRef.current;
    if (current) {
      sketchUndoStackRef.current = [...sketchUndoStackRef.current, current];
    }

    deps.setActiveSketch(snapshot);
    bumpVersion();
  }, [deps, bumpVersion]);

  // The `undoRedoVersion >= 0` check is a deliberate read of the version state
  // to make these values re-evaluate when stacks mutate (the stacks live in refs).
  const canUndo = undoRedoVersion >= 0 && undoStackRef.current.length > 0;
  const canRedo = undoRedoVersion >= 0 && redoStackRef.current.length > 0;
  const undoActionName = canUndo
    ? undoStackRef.current[undoStackRef.current.length - 1]!.actionName
    : null;
  const redoActionName = canRedo
    ? redoStackRef.current[redoStackRef.current.length - 1]!.actionName
    : null;
  const canUndoSketch =
    undoRedoVersion >= 0 && sketchUndoStackRef.current.length > 0;
  const canRedoSketch =
    undoRedoVersion >= 0 && sketchRedoStackRef.current.length > 0;

  return {
    undoStack: undoStackRef.current,
    redoStack: redoStackRef.current,
    pushUndo,
    undo,
    redo,
    canUndo,
    canRedo,
    undoActionName,
    redoActionName,
    pushSketchUndo,
    pushSketchSnapshot,
    undoSketch,
    redoSketch,
    canUndoSketch,
    canRedoSketch,
    undoStackRef,
    redoStackRef,
    sketchUndoStackRef,
    sketchRedoStackRef,
    bumpVersion,
  };
}
