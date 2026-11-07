import { Brep, BrepJSON, CompoundBrep, CompoundBrepJSON } from "../geometry";
import * as THREE from "three";
import { SceneElement, nodeId as toNodeId } from "../scene-operations/types";
import { OccWorkerClient } from "./OccWorkerClient";
import type {
  WorkerImportResult,
  WorkerExportResult,
  Vec3,
  EulerJSON,
} from "../workers/occ-worker-types";
import { reconstructEdgeGeometry } from "../workers/geometry-reconstruction";
import { toVec3, toEulerJSON } from "../vectorHelpers";
import type { Sketch, SketchPlane, FeatureNode } from "../types/sketch-types";

/** Result of importing geometry from STL, only solid bodies, no parametric history. */
export interface ImportResult {
  brep: Brep;
  position: THREE.Vector3;
  occBrep?: string | undefined;
  edgeGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
}

/** JSON-friendly mirror of `SketchPlane` (THREE.Vector3 axes flattened to plain x/y/z records). */
export interface SketchPlaneJSON {
  type: SketchPlane["type"];
  origin: Vec3;
  normal: Vec3;
  xAxis: Vec3;
  yAxis: Vec3;
  offset?: number;
  sourceElementId?: string;
}

/** JSON-friendly mirror of `Sketch`, same shape with `plane` flattened. */
export interface SketchJSON extends Omit<Sketch, "plane"> {
  plane: SketchPlaneJSON;
}

/** JSON-friendly mirror of `SceneElement`. Renderer-only fields (BufferGeometry, Float32Array) are dropped, they get rebuilt from `brep` on import. */
export interface SceneElementJSON {
  nodeId: string;
  brepJson: BrepJSON | CompoundBrepJSON;
  position: Vec3;
  rotation?: EulerJSON;
  elementType?: "profile" | "path";
  occBrep?: string;
  pathData?: { points: Vec3[] };
  sketchPlane?: SketchPlaneJSON;
}

/**
 * Native CADjs project file. Carries enough state to fully restore an
 * editing session, geometry, sketches, and the parametric feature tree.
 *
 * Distinct from STL import/export, which trades the parametric history
 * for binary-mesh interop with 3D-printing toolchains.
 */
export interface CadjsProjectFile {
  schemaVersion: 1;
  cadjsVersion?: string;
  idCounter: number;
  elements: SceneElementJSON[];
  sketches: SketchJSON[];
  featureTree: FeatureNode[];
}

/** State passed to `exportProject` / returned from `importProject`. */
export interface CadjsProjectState {
  elements: SceneElement[];
  sketches: Sketch[];
  featureTree: FeatureNode[];
  idCounter: number;
}

const PROJECT_SCHEMA_VERSION = 1 as const;
const PROJECT_FILE_EXTENSION = "cadjs.json";
const PROJECT_MIME_TYPE = "application/json";

function planeToJSON(plane: SketchPlane): SketchPlaneJSON {
  const out: SketchPlaneJSON = {
    type: plane.type,
    origin: toVec3(plane.origin),
    normal: toVec3(plane.normal),
    xAxis: toVec3(plane.xAxis),
    yAxis: toVec3(plane.yAxis),
  };
  if (plane.offset !== undefined) out.offset = plane.offset;
  if (plane.sourceElementId !== undefined)
    out.sourceElementId = plane.sourceElementId;
  return out;
}

function planeFromJSON(json: SketchPlaneJSON): SketchPlane {
  const plane: SketchPlane = {
    type: json.type,
    origin: new THREE.Vector3(json.origin.x, json.origin.y, json.origin.z),
    normal: new THREE.Vector3(json.normal.x, json.normal.y, json.normal.z),
    xAxis: new THREE.Vector3(json.xAxis.x, json.xAxis.y, json.xAxis.z),
    yAxis: new THREE.Vector3(json.yAxis.x, json.yAxis.y, json.yAxis.z),
  };
  if (json.offset !== undefined) plane.offset = json.offset;
  if (json.sourceElementId !== undefined)
    plane.sourceElementId = toNodeId(json.sourceElementId);
  return plane;
}

function elementToJSON(el: SceneElement): SceneElementJSON {
  const out: SceneElementJSON = {
    nodeId: el.nodeId,
    brepJson: el.brep.toJSON() as BrepJSON | CompoundBrepJSON,
    position: toVec3(el.position),
  };
  if (el.rotation) out.rotation = toEulerJSON(el.rotation);
  if (el.elementType) out.elementType = el.elementType;
  if (el.occBrep !== undefined) out.occBrep = el.occBrep;
  if (el.pathData)
    out.pathData = {
      points: el.pathData.points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    };
  if (el.sketchPlane) out.sketchPlane = planeToJSON(el.sketchPlane);
  return out;
}

function elementFromJSON(json: SceneElementJSON): SceneElement {
  const brep =
    json.brepJson.type === "compound"
      ? CompoundBrep.fromJSON(json.brepJson as CompoundBrepJSON)
      : Brep.fromJSON(json.brepJson);

  const el: SceneElement = {
    brep,
    nodeId: toNodeId(json.nodeId),
    position: new THREE.Vector3(
      json.position.x,
      json.position.y,
      json.position.z,
    ),
  };
  if (json.rotation) {
    el.rotation = new THREE.Euler(
      json.rotation.x,
      json.rotation.y,
      json.rotation.z,
      json.rotation.order as THREE.EulerOrder,
    );
  }
  if (json.elementType) el.elementType = json.elementType;
  if (json.occBrep !== undefined) el.occBrep = json.occBrep;
  if (json.pathData)
    el.pathData = {
      points: json.pathData.points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    };
  if (json.sketchPlane) el.sketchPlane = planeFromJSON(json.sketchPlane);
  return el;
}

function sketchToJSON(s: Sketch): SketchJSON {
  return {
    id: s.id,
    plane: planeToJSON(s.plane),
    primitives: s.primitives,
    constraints: s.constraints,
    dof: s.dof,
    status: s.status,
  };
}

function sketchFromJSON(json: SketchJSON): Sketch {
  return {
    id: json.id,
    plane: planeFromJSON(json.plane),
    primitives: json.primitives,
    constraints: json.constraints,
    dof: json.dof,
    status: json.status,
  };
}

export class ImportExportService {
  private static instance: ImportExportService;

  private constructor() {}

  static getInstance(): ImportExportService {
    if (!ImportExportService.instance) {
      ImportExportService.instance = new ImportExportService();
    }
    return ImportExportService.instance;
  }

  /** Export geometry as binary STL (no sketches/history). */
  async export(elements: SceneElement[]): Promise<Blob> {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerExportResult>({
      type: "exportFile",
      payload: {
        elements: elements.map((el) => ({
          brepJson: el.brep.toJSON(),
          position: toVec3(el.position),
          occBrep: el.occBrep,
          rotation: el.rotation ? toEulerJSON(el.rotation) : undefined,
        })),
        format: "stl",
      },
    });
    return new Blob([raw.fileBytes as Uint8Array<ArrayBuffer>], {
      type: "model/stl",
    });
  }

  /** Import geometry from binary STL, no sketches/history attached. */
  async import(arrayBuffer: ArrayBuffer): Promise<ImportResult[]> {
    return this.importInternal(arrayBuffer, "stl");
  }

  /**
   * Export geometry as STEP (ISO 10303). Lossless for the analytic BRep
   * geometry CADjs produces, preserves planes, cylinders, B-splines instead
   * of tessellating to triangles. Sketches and feature history are not
   * carried; use `exportProject` for those.
   *
   * Plain STEPControl_* output: geometry only, no colors / names / assembly
   * hierarchy. Each element becomes its own STEP root.
   */
  async exportStep(elements: SceneElement[]): Promise<Blob> {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerExportResult>({
      type: "exportFile",
      payload: {
        elements: elements.map((el) => ({
          brepJson: el.brep.toJSON(),
          position: toVec3(el.position),
          occBrep: el.occBrep,
          rotation: el.rotation ? toEulerJSON(el.rotation) : undefined,
        })),
        format: "step",
      },
    });
    return new Blob([raw.fileBytes as Uint8Array<ArrayBuffer>], {
      type: "model/step",
    });
  }

  /** Import geometry from a STEP file. Multi-root files decompose into one element per root. */
  async importStep(arrayBuffer: ArrayBuffer): Promise<ImportResult[]> {
    return this.importInternal(arrayBuffer, "step");
  }

  private async importInternal(
    arrayBuffer: ArrayBuffer,
    format: "stl" | "step",
  ): Promise<ImportResult[]> {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerImportResult>({
      type: "importFile",
      payload: {
        fileBytes: new Uint8Array(arrayBuffer),
        format,
      },
    });
    return raw.elements.map((el) => ({
      brep: Brep.fromJSON(el.brepJson),
      position: new THREE.Vector3(el.position.x, el.position.y, el.position.z),
      occBrep: el.occBrep,
      edgeGeometry: el.edgePositions
        ? reconstructEdgeGeometry(el.edgePositions)
        : undefined,
      vertexPositions: el.vertexPositions,
    }));
  }

  /**
   * Serialise the full editor state as a `.cadjs.json` project file. Pure
   * JSON, no OCC worker round-trip, no STL conversion. Sketches and the
   * feature tree round-trip losslessly; renderer-only fields (BufferGeometry,
   * Float32Array vertex caches) are dropped and rebuilt on import.
   */
  exportProject(state: CadjsProjectState): Blob {
    const file: CadjsProjectFile = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      idCounter: state.idCounter,
      elements: state.elements.map(elementToJSON),
      sketches: state.sketches.map(sketchToJSON),
      featureTree: state.featureTree,
    };
    return new Blob([JSON.stringify(file, null, 2)], {
      type: PROJECT_MIME_TYPE,
    });
  }

  /** Inverse of `exportProject`. Throws on schema-version mismatch or malformed input. */
  async importProject(arrayBuffer: ArrayBuffer): Promise<CadjsProjectState> {
    const text = new TextDecoder("utf-8").decode(arrayBuffer);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Project file is not a JSON object");
    }
    const file = parsed as Partial<CadjsProjectFile>;
    if (file.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported project file version: ${String(file.schemaVersion)} (expected ${PROJECT_SCHEMA_VERSION})`,
      );
    }
    if (
      !Array.isArray(file.elements) ||
      !Array.isArray(file.sketches) ||
      !Array.isArray(file.featureTree)
    ) {
      throw new Error(
        "Project file is missing one of: elements, sketches, featureTree",
      );
    }
    if (
      typeof file.idCounter !== "number" ||
      !Number.isFinite(file.idCounter)
    ) {
      throw new Error("Project file has invalid idCounter");
    }
    return {
      elements: file.elements.map(elementFromJSON),
      sketches: file.sketches.map(sketchFromJSON),
      featureTree: file.featureTree,
      idCounter: file.idCounter,
    };
  }

  /** Default file extension used by `exportProject` consumers. */
  static readonly PROJECT_FILE_EXTENSION = PROJECT_FILE_EXTENSION;
}
