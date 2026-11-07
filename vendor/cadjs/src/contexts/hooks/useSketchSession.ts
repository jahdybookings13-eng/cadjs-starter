import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConstraintResult,
  Sketch,
  SketchConstraint,
  SketchPrimitive,
} from "../../types/sketch-types";
import { SceneMode } from "../../scene-operations/types";
import {
  addPrimitiveToSketch,
  addConstraintToSketch,
  removePrimitiveFromSketch,
  removeConstraintFromSketch,
} from "../../scene-operations/sketch-operations";
import { SketchSolverService } from "../../services/SketchSolverService";
import { notify } from "../../config";

/**
 * Owns the sketch session: the `activeSketch` being edited (if any), the
 * persistent `sketches` list, the bookkeeping refs that the constraint solver
 * and undo stack consume, and the methods that mutate sketch state.
 *
 * Refs:
 * - `activeSketchRef` mirrors `activeSketch` so undo/redo callbacks captured
 *   by useSketchMode don't see a stale closure.
 * - `sketchesRef` mirrors `sketches` for useUndoStack snapshots.
 * - `solveVersionRef` is the request-versioning counter for the constraint
 *   solver; consumers increment it before each solve so out-of-order async
 *   results can be discarded.
 * - `previewConstraintSnapshotRef` holds the pre-preview sketch state so
 *   `cancelConstraintPreview` can restore it.
 * - `previewVersionRef` is the same versioning idea for constraint previews.
 *
 * Solver-coupled and lifecycle methods (startSketch, finishSketch, etc.) still
 * live in CoreContext for now, they have heavy cross-deps with mutations,
 * undo, and feature tree, and will be migrated in subsequent steps.
 */
export interface SketchSessionDeps {
  idCounter: number;
  setIdCounter: React.Dispatch<React.SetStateAction<number>>;
  /** From useUndoStack, pushes a specific sketch snapshot onto the sketch
   *  undo stack. Used by `commitConstraintPreview` which has a separate
   *  pre-preview snapshot distinct from `activeSketch`. */
  pushSketchSnapshot: (sketch: Sketch) => void;
}

export interface SketchSessionApi {
  // State
  activeSketch: Sketch | null;
  sketches: Sketch[];
  previousMode: SceneMode;
  editingSketchId: string | null;

  // Setters (exposed for composer + undo restore + lifecycle methods that
  // still live in CoreContext)
  setActiveSketch: React.Dispatch<React.SetStateAction<Sketch | null>>;
  setSketches: React.Dispatch<React.SetStateAction<Sketch[]>>;
  setPreviousMode: React.Dispatch<React.SetStateAction<SceneMode>>;
  setEditingSketchId: React.Dispatch<React.SetStateAction<string | null>>;

  // Refs
  activeSketchRef: React.MutableRefObject<Sketch | null>;
  sketchesRef: React.MutableRefObject<Sketch[]>;
  solveVersionRef: React.MutableRefObject<number>;
  previewConstraintSnapshotRef: React.MutableRefObject<Sketch | null>;
  previewVersionRef: React.MutableRefObject<number>;

  // Simple primitive/constraint methods (no solver / no cross-hook deps)
  addPrimitive: (primitive: SketchPrimitive) => void;
  updatePrimitive: (
    primitiveId: string,
    updates: Partial<SketchPrimitive>,
  ) => void;
  addConstraint: (constraint: SketchConstraint) => void;
  removePrimitive: (primitiveId: string) => void;
  removeConstraint: (constraintId: string) => void;
  updateConstraint: (
    constraintId: string,
    updates: Partial<SketchConstraint>,
  ) => void;
  cancelConstraintPreview: () => void;

  // Solver-coupled methods
  updatePrimitivesAndSolve: (
    updates: Map<string, { x: number; y: number }>,
  ) => Promise<void>;
  updatePrimitivePropertyAndSolve: (
    primitiveId: string,
    updates: Partial<SketchPrimitive>,
  ) => Promise<void>;
  addConstraintAndSolve: (
    constraint: SketchConstraint,
  ) => Promise<ConstraintResult>;
  previewConstraint: (
    constraint: SketchConstraint,
  ) => Promise<ConstraintResult>;
  commitConstraintPreview: () => void;
  solveSketch: () => Promise<Sketch | null>;
}

export function useSketchSession(deps: SketchSessionDeps): SketchSessionApi {
  const [activeSketch, setActiveSketch] = useState<Sketch | null>(null);
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [previousMode, setPreviousMode] = useState<SceneMode>("move");
  const [editingSketchId, setEditingSketchId] = useState<string | null>(null);

  const solveVersionRef = useRef(0);
  const solveFailedNotifiedRef = useRef(false);
  const previewConstraintSnapshotRef = useRef<Sketch | null>(null);
  const previewVersionRef = useRef(0);

  const activeSketchRef = useRef<Sketch | null>(activeSketch);
  useEffect(() => {
    activeSketchRef.current = activeSketch;
  }, [activeSketch]);

  const sketchesRef = useRef<Sketch[]>(sketches);
  useEffect(() => {
    sketchesRef.current = sketches;
  }, [sketches]);

  const { idCounter, setIdCounter, pushSketchSnapshot } = deps;

  const addPrimitive = useCallback(
    (primitive: SketchPrimitive) => {
      setActiveSketch((currentSketch) => {
        if (!currentSketch) {
          console.warn("No active sketch to add primitive to");
          return null;
        }
        const result = addPrimitiveToSketch(
          currentSketch,
          primitive,
          idCounter,
        );
        // idCounter is bumped by the hook generating these IDs, not here.
        return result.sketch;
      });
    },
    [idCounter],
  );

  const updatePrimitive = useCallback(
    (primitiveId: string, updates: Partial<SketchPrimitive>) => {
      setActiveSketch((currentSketch) => {
        if (!currentSketch) {
          console.warn("No active sketch to update primitive in");
          return null;
        }
        const updatedPrimitives = currentSketch.primitives.map((p) => {
          if (p.id === primitiveId) {
            return { ...p, ...updates } as SketchPrimitive;
          }
          return p;
        });
        return { ...currentSketch, primitives: updatedPrimitives };
      });
    },
    [],
  );

  const addConstraint = useCallback(
    (constraint: SketchConstraint) => {
      if (!activeSketch) {
        console.warn("No active sketch to add constraint to");
        return;
      }
      const result = addConstraintToSketch(activeSketch, constraint, idCounter);
      setActiveSketch(result.sketch);
      setIdCounter(result.nextId);
    },
    [activeSketch, idCounter, setIdCounter],
  );

  const removePrimitive = useCallback((primitiveId: string) => {
    setActiveSketch((currentSketch) => {
      if (!currentSketch) {
        console.warn("No active sketch to remove primitive from");
        return null;
      }
      const result = removePrimitiveFromSketch(currentSketch, primitiveId);
      return result.sketch;
    });
  }, []);

  const removeConstraint = useCallback((constraintId: string) => {
    setActiveSketch((currentSketch) => {
      if (!currentSketch) {
        console.warn("No active sketch to remove constraint from");
        return null;
      }
      const result = removeConstraintFromSketch(currentSketch, constraintId);
      return result.sketch;
    });
  }, []);

  const updateConstraint = useCallback(
    (constraintId: string, updates: Partial<SketchConstraint>) => {
      setActiveSketch((currentSketch) => {
        if (!currentSketch) return null;
        return {
          ...currentSketch,
          constraints: currentSketch.constraints.map((c) =>
            // Cast: spreading a Partial of a discriminated union widens the
            // result; in practice the type field never changes, so the merged
            // object stays in the same arm of the union.
            c.id === constraintId
              ? ({ ...c, ...updates } as SketchConstraint)
              : c,
          ),
        };
      });
    },
    [],
  );

  const cancelConstraintPreview = useCallback(() => {
    const snapshot = previewConstraintSnapshotRef.current;
    if (snapshot) {
      setActiveSketch(snapshot);
    }
    previewConstraintSnapshotRef.current = null;
    previewVersionRef.current++;
  }, []);

  // ── Solver-coupled methods ─────────────────────────────────────────────────

  const updatePrimitivesAndSolve = useCallback(
    async (updates: Map<string, { x: number; y: number }>) => {
      const currentVersion = ++solveVersionRef.current;

      const currentSketch = activeSketchRef.current;
      if (!currentSketch) return;

      const updatedPrimitives = currentSketch.primitives.map((p) => {
        const update = updates.get(p.id);
        if (update && p.type === "point") {
          return { ...p, x: update.x, y: update.y } as SketchPrimitive;
        }
        return p;
      });
      const sketchToSolve: Sketch = {
        ...currentSketch,
        primitives: updatedPrimitives,
      };

      try {
        const solver = SketchSolverService.getInstance();
        const result = await solver.solve(sketchToSolve);

        if (solveVersionRef.current !== currentVersion) return;

        if (result.success) {
          solveFailedNotifiedRef.current = false;
          setActiveSketch(result.sketch);
        } else {
          // Don't commit the failed drag step, leave the prior accepted
          // state in place. Notify once until the next successful solve.
          if (!solveFailedNotifiedRef.current) {
            notify(
              "Sketch solve failed: constraints cannot be satisfied",
              "warning",
            );
            solveFailedNotifiedRef.current = true;
          }
        }
      } catch (error) {
        console.error("Sketch solve error during drag:", error);
        if (solveVersionRef.current === currentVersion) {
          setActiveSketch(sketchToSolve);
        }
      }
    },
    [],
  );

  const updatePrimitivePropertyAndSolve = useCallback(
    async (primitiveId: string, updates: Partial<SketchPrimitive>) => {
      const currentVersion = ++solveVersionRef.current;

      const sketchPromise = new Promise<Sketch | null>((resolve) => {
        setActiveSketch((currentSketch) => {
          if (!currentSketch) {
            resolve(null);
            return null;
          }
          const updatedPrimitives = currentSketch.primitives.map((p) => {
            if (p.id === primitiveId)
              return { ...p, ...updates } as SketchPrimitive;
            return p;
          });
          const updatedSketch = {
            ...currentSketch,
            primitives: updatedPrimitives,
          };
          resolve(updatedSketch);
          return updatedSketch;
        });
      });

      const sketchToSolve = await sketchPromise;
      if (!sketchToSolve) return;
      if (solveVersionRef.current !== currentVersion) return;

      try {
        const solver = SketchSolverService.getInstance();
        const result = await solver.solve(sketchToSolve);
        if (solveVersionRef.current !== currentVersion) return;
        if (result.success) {
          setActiveSketch(result.sketch);
        }
      } catch (error) {
        console.error("Sketch solve error during property update:", error);
      }
    },
    [],
  );

  // Adds the constraint, solves, and rolls back if the result is redundant or conflicting.
  const addConstraintAndSolve = useCallback(
    async (constraint: SketchConstraint): Promise<ConstraintResult> => {
      let preConstraintSketch: Sketch | null = null;

      // Funnel through a setActiveSketch updater so we read+write the latest sketch atomically.
      const sketchPromise = new Promise<{
        sketch: Sketch;
        nextId: number;
      } | null>((resolve) => {
        setActiveSketch((currentSketch) => {
          if (!currentSketch) {
            console.warn("No active sketch to add constraint to");
            resolve(null);
            return null;
          }
          preConstraintSketch = currentSketch;
          const addResult = addConstraintToSketch(
            currentSketch,
            constraint,
            idCounter,
          );
          resolve({ sketch: addResult.sketch, nextId: addResult.nextId });
          return addResult.sketch;
        });
      });

      const result = await sketchPromise;
      if (!result) return { sketch: null, status: "failed" };

      const { sketch: sketchToSolve, nextId } = result;

      // Bump idCounter before solving so a thrown solve doesn't leak a reused id.
      setIdCounter(nextId);

      try {
        const solver = SketchSolverService.getInstance();
        const solveResult = await solver.solve(sketchToSolve);

        if (solveResult.success) {
          if (solveResult.status === "overconstrained") {
            const isRedundant =
              (solveResult.redundantConstraintIds?.length ?? 0) > 0;
            const isConflicting =
              (solveResult.conflictingConstraintIds?.length ?? 0) > 0;
            const status = isConflicting
              ? ("conflicting" as const)
              : ("redundant" as const);

            console.warn(
              `Constraint ${constraint.type} is ${status}. Rolling back.`,
              isRedundant
                ? `Redundant IDs: ${solveResult.redundantConstraintIds}`
                : "",
              isConflicting
                ? `Conflicting IDs: ${solveResult.conflictingConstraintIds}`
                : "",
            );

            if (preConstraintSketch) {
              setActiveSketch(preConstraintSketch);
            }
            return { sketch: null, status };
          }

          setActiveSketch(solveResult.sketch);
          return { sketch: solveResult.sketch, status: "applied" };
        } else {
          if (preConstraintSketch) {
            setActiveSketch(preConstraintSketch);
          }
          notify(
            "Sketch solve failed: constraints cannot be satisfied",
            "warning",
          );
          return { sketch: null, status: "failed" };
        }
      } catch (error) {
        console.error("Sketch solve error:", error);
        notify(
          `Sketch solve failed: ${error instanceof Error ? error.message : "unknown error"}`,
          "warning",
        );
        return { sketch: null, status: "failed" };
      }
    },
    [idCounter, setIdCounter],
  );

  // Preview a constraint without committing (snapshot-based, supports debounced iteration)
  const previewConstraint = useCallback(
    async (constraint: SketchConstraint): Promise<ConstraintResult> => {
      // On first call, save the current sketch as snapshot
      if (previewConstraintSnapshotRef.current === null) {
        const current = activeSketchRef.current;
        if (!current) return { sketch: null, status: "failed" };
        previewConstraintSnapshotRef.current = current;
      }

      const version = ++previewVersionRef.current;
      const snapshot = previewConstraintSnapshotRef.current;

      // Always start from the snapshot, add the new constraint
      const addResult = addConstraintToSketch(snapshot, constraint, idCounter);

      try {
        const solver = SketchSolverService.getInstance();
        const solveResult = await solver.solve(addResult.sketch);

        if (previewVersionRef.current !== version) {
          return { sketch: null, status: "failed" };
        }

        if (solveResult.success) {
          if (solveResult.status === "overconstrained") {
            setActiveSketch(snapshot);
            const isConflicting =
              (solveResult.conflictingConstraintIds?.length ?? 0) > 0;
            return {
              sketch: null,
              status: isConflicting ? "conflicting" : "redundant",
            };
          }
          setActiveSketch(solveResult.sketch);
          return { sketch: solveResult.sketch, status: "applied" };
        } else {
          setActiveSketch(snapshot);
          return { sketch: null, status: "failed" };
        }
      } catch {
        if (previewVersionRef.current === version) {
          setActiveSketch(snapshot);
        }
        return { sketch: null, status: "failed" };
      }
    },
    [idCounter],
  );

  const commitConstraintPreview = useCallback(() => {
    const snapshot = previewConstraintSnapshotRef.current;
    if (snapshot) pushSketchSnapshot(snapshot);
    previewConstraintSnapshotRef.current = null;
    previewVersionRef.current++;
  }, [pushSketchSnapshot]);

  const solveSketch = useCallback(async (): Promise<Sketch | null> => {
    let sketchToSolve: Sketch | null = null;
    setActiveSketch((current) => {
      sketchToSolve = current;
      return current;
    });

    if (!sketchToSolve) {
      console.warn("No active sketch to solve");
      return null;
    }

    try {
      const solver = SketchSolverService.getInstance();
      const result = await solver.solve(sketchToSolve);
      if (result.success) {
        setActiveSketch(result.sketch);
        return result.sketch;
      } else {
        notify(
          "Sketch solve failed: constraints cannot be satisfied",
          "warning",
        );
        return null;
      }
    } catch (error) {
      console.error("Sketch solve error:", error);
      notify(
        `Sketch solve failed: ${error instanceof Error ? error.message : "unknown error"}`,
        "warning",
      );
      return null;
    }
  }, []);

  return {
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
    solveVersionRef,
    previewConstraintSnapshotRef,
    previewVersionRef,
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
  };
}
