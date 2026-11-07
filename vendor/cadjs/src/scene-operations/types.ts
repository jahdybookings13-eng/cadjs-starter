import * as THREE from "three";
import { Brep } from "../geometry";
import { SketchPlane } from "../types/sketch-types";
import { thickAxisCount } from "./brep-utils";

/**
 * Branded string type for SceneElement identifiers (`SceneElement.nodeId`,
 * `BooleanOperationOptions.targetId/toolIds`, feature-tree `elementId`,
 * `BrowserItem.elementId/sourceNodeId`, `SketchPlane.sourceElementId`).
 *
 * The brand is structural: any plain string can be cast in via {@link nodeId},
 * but a function declared `(id: NodeId) => ...` no longer accepts a raw string.
 * That catches a whole class of "passed the wrong id" bugs (e.g. handing a
 * sketch-primitive id to `getObject(nodeId)`) without runtime overhead.
 *
 * **Not branded** in this batch: tree-node ids (`FeatureNode.id`,
 * `BrowserItem.id`), sketch primitive/constraint/profile ids. Those carry their
 * own identity classes; brands for them are queued as a follow-on (T4b).
 */
export type NodeId = string & { readonly __brand: "NodeId" };

/** Mint a NodeId from a plain string. Use at id-creation points only. */
export function nodeId(s: string): NodeId {
  return s as NodeId;
}

/** Type guard for NodeId at trust boundaries (deserialised JSON, DOM input). */
export function isNodeId(s: unknown): s is NodeId {
  return typeof s === "string" && s.length > 0;
}

export type BuiltInSceneMode =
  | "move"
  | "combine"
  | "sketch"
  | "extrude"
  | "fillet"
  | "sweep"
  | "loft"
  | "revolve"
  | "measure";

// Open union: built-in values still autocomplete; consumers can register
// their own modes via setMode("my-mode") without TS errors.
export type SceneMode = BuiltInSceneMode | (string & {});

/**
 * UI-facing combine operation. The internal pipeline (workers, feature tree,
 * occBrep dispatch) speaks {@link BooleanOperation} instead, translate at
 * the boundary with {@link combineToBoolean}.
 */
export type CombineOperationType = "join" | "cut" | "intersect";

/**
 * Internal/OCC-facing boolean operation. Aligned with `BRepAlgoAPI_Fuse/Cut/Common`
 * and persisted in feature-tree nodes and worker payloads. Do not rename
 * without updating those persisted strings in lockstep.
 */
export type BooleanOperation = "union" | "difference" | "intersection";

const COMBINE_TO_BOOLEAN: Record<CombineOperationType, BooleanOperation> = {
  join: "union",
  cut: "difference",
  intersect: "intersection",
};

export function combineToBoolean(op: CombineOperationType): BooleanOperation {
  return COMBINE_TO_BOOLEAN[op];
}

/**
 * Display labels for the user-facing combine operations. Use this Record
 * instead of inline ternaries in toolbars, undo labels, or progress messages.
 */
export const OP_LABEL: Record<CombineOperationType, string> = {
  join: "Join",
  cut: "Cut",
  intersect: "Intersect",
};

export interface BooleanOperationOptions {
  targetId: NodeId;
  toolIds: NodeId[];
  keepTools?: boolean | undefined;
}

export interface SceneElement {
  brep: Brep;
  nodeId: NodeId;
  position: THREE.Vector3;
  selected?: boolean | undefined;
  rotation?: THREE.Euler | undefined;
  elementType?: "profile" | "path" | undefined;
  pathData?: { points: { x: number; y: number; z: number }[] } | undefined;
  occBrep?: string | undefined;
  edgeGeometry?: THREE.BufferGeometry | undefined;
  faceGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
  sketchPlane?: SketchPlane | undefined;
  /**
   * Consumer-defined per-element state. Survives `updateElementBrep`,
   * `updateElementPosition`, and `updateElementRotation` via shallow spread.
   * Snapshots in the undo stack share this reference, treat as immutable
   * per snapshot, or accept that mutations are visible across history.
   * Not serialized by import/export.
   */
  userData?: Record<string, unknown> | undefined;
}

export function isElement3D(el: SceneElement): boolean {
  return thickAxisCount(el.brep) >= 2;
}
