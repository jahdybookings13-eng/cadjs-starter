/**
 * Shared dispatch function for OCC worker requests.
 * Used by both the actual Web Worker and the test mock to route
 * request types to handler functions.
 */

import type { OpenCascadeInstance } from "opencascade.js";
import type { WorkerRequest } from "./occ-worker-types";
import {
  handleExtrude,
  handleSweep,
  handleLoft,
  handleRevolve,
  handleFillet,
  handleChamfer,
  handleBoolean,
  handleEdgeAnalysis,
  handlePreviewGeometry,
  handleSketchToBrep,
  handleSketchToProfiles,
  handleProcessProfile,
  handleUnifyCompound,
  handleImportFile,
  handleExportFile,
  handleEdgeLength,
  handleEdgeDirection,
  handleSketchToWire,
  handleShell,
  handleDraft,
  handlePattern,
  handleProjectCurves,
  handleSurfaceOp,
  handleThread,
  handleHem,
  handleWrapCurves,
  handleMoveFace,
  handleSection,
  handleThicken,
  handleSplit,
  handleDeleteFace,
  handleFlange,
  handleHole,
} from "./occ-worker-handlers";
import { assertNever } from "../utils/assertNever";

/**
 * Required keys per request type, asserted at runtime before dispatch. The
 * discriminated union catches static type errors; this catches malformed
 * structured-clone payloads (rare, but the alternative is a deep OCC stack
 * with no actionable error).
 */
const REQUIRED_KEYS: { [K in WorkerRequest["type"]]?: readonly string[] } = {
  extrude: ["brepJson", "depth", "direction"],
  sweep: ["brepJson", "profilePosition", "pathPoints"],
  loft: ["profiles"],
  revolve: ["brepJson", "profilePosition", "axisOrigin", "axisDir"],
  fillet: ["brepJson", "position", "edgeIndices", "radius"],
  chamfer: ["brepJson", "position", "edgeIndices", "distance"],
  boolean: ["operation", "operands"],
  edgeAnalysis: ["brepJson", "position"],
  previewGeometry: ["brepJson"],
  sketchToBrep: ["primitives", "plane"],
  sketchToProfiles: ["primitives", "plane", "sketchId"],
  processProfile: ["brepJson"],
  unifyCompound: ["childrenBrepJson"],
  shell: ["brepJson", "faceIndices", "thickness"],
  draft: ["brepJson", "faceIndices", "angleDeg", "neutralNormal"],
  pattern: ["brepJson", "kind", "count"],
  projectCurves: [
    "brepJson",
    "targetBrepJson",
    "edgeIndices",
    "direction",
  ],
  surfaceOp: ["kind", "brepJson"],
  section: ["brepJson", "planeOrigin", "planeNormal"],
  thread: ["brepJson", "origin", "axisDir", "radius", "pitch", "height", "depth", "kind"],
  hem: ["brepJson", "origin", "bendDir", "bendLineDir", "thickness"],
  wrapCurves: ["brepJson", "axisOrigin", "axisDir", "radius", "polylines"],
  moveFace: ["brepJson", "faceIndex", "distance"],
  thicken: ["brepJson", "faceIndices", "thickness"],
  split: ["brepJson", "planeOrigin", "planeNormal"],
  deleteFace: ["brepJson", "faceIndices"],
  flange: [
    "brepJson",
    "position",
    "origin",
    "bendDir",
    "bendLineDir",
    "angle",
    "thickness",
    "relief",
  ],
  hole: ["brepJson", "centers", "axisDir", "radius", "length"],
};

function assertPayload(request: WorkerRequest): void {
  const payload = request.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object") {
    throw new Error(
      `worker[${request.type}]: payload missing or not an object`,
    );
  }
  const required = REQUIRED_KEYS[request.type];
  if (!required) return;
  for (const key of required) {
    if (!(key in payload)) {
      throw new Error(`worker[${request.type}]: payload.${key} missing`);
    }
  }
}

// Discriminated-union dispatch: `request.type` narrows `request.payload` to
// the specific shape each handler expects, so the boundary doesn't need an
// `any` cast. __init / __cancel are control messages handled by the worker
// shim before dispatch, they fall through to the default.
export function dispatchOccRequest(
  oc: OpenCascadeInstance,
  request: WorkerRequest,
): unknown {
  assertPayload(request);
  switch (request.type) {
    case "extrude":
      return handleExtrude(oc, request.payload);
    case "sweep":
      return handleSweep(oc, request.payload);
    case "loft":
      return handleLoft(oc, request.payload);
    case "revolve":
      return handleRevolve(oc, request.payload);
    case "fillet":
      return handleFillet(oc, request.payload);
    case "chamfer":
      return handleChamfer(oc, request.payload);
    case "boolean":
      return handleBoolean(oc, request.payload);
    case "edgeAnalysis":
      return handleEdgeAnalysis(oc, request.payload);
    case "previewGeometry":
      return handlePreviewGeometry(oc, request.payload);
    case "sketchToBrep":
      return handleSketchToBrep(oc, request.payload);
    case "sketchToProfiles":
      return handleSketchToProfiles(oc, request.payload);
    case "processProfile":
      return handleProcessProfile(oc, request.payload);
    case "unifyCompound":
      return handleUnifyCompound(oc, request.payload);
    case "importFile":
      return handleImportFile(oc, request.payload);
    case "exportFile":
      return handleExportFile(oc, request.payload);
    case "edgeLength":
      return handleEdgeLength(oc, request.payload);
    case "edgeDirection":
      return handleEdgeDirection(oc, request.payload);
    case "sketchToWire":
      return handleSketchToWire(oc, request.payload);
    case "shell":
      return handleShell(oc, request.payload);
    case "draft":
      return handleDraft(oc, request.payload);
    case "pattern":
      return handlePattern(oc, request.payload);
    case "projectCurves":
      return handleProjectCurves(oc, request.payload);
    case "surfaceOp":
      return handleSurfaceOp(oc, request.payload);
    case "section":
      return handleSection(oc, request.payload);
    case "thread":
      return handleThread(oc, request.payload);
    case "hem":
      return handleHem(oc, request.payload);
    case "wrapCurves":
      return handleWrapCurves(oc, request.payload);
    case "moveFace":
      return handleMoveFace(oc, request.payload);
    case "thicken":
      return handleThicken(oc, request.payload);
    case "split":
      return handleSplit(oc, request.payload);
    case "deleteFace":
      return handleDeleteFace(oc, request.payload);
    case "flange":
      return handleFlange(oc, request.payload);
    case "hole":
      return handleHole(oc, request.payload);
    case "__init":
    case "__cancel":
      // Control messages are filtered by the worker shim (`occ-worker.ts`)
      // before dispatch. Reaching here means a caller bypassed the shim.
      throw new Error(
        `dispatchOccRequest received control message "${request.type}" that should have been handled upstream`,
      );
    default:
      // Compile-time exhaustiveness over WorkerRequest; throws at runtime
      // for defence-in-depth if a future caller forges an unknown type.
      return assertNever(request, "dispatchOccRequest");
  }
}
