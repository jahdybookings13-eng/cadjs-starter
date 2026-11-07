/**
 * OCC Web Worker entry point.
 * Initializes opencascade.js WASM and routes messages to handler functions.
 *
 * The WASM URL is supplied by the main thread in the `__init` message
 * (`payload.wasmUrl`). This avoids embedding a Vite-only `?url` import in the
 * library, which would break webpack/Rollup/Next.js consumers.
 */

import type { OpenCascadeInstance } from "opencascade.js";
import opencascade from "opencascade.js/dist/opencascade.full.js";
import type { WorkerRequest, WorkerResponse } from "./occ-worker-types";
import { collectTransferables } from "./geometry-reconstruction";
import { dispatchOccRequest } from "./occ-dispatch";
import { configureStepDefaults } from "../services/occ-io";

type OpencascadeFactory = (opts: {
  locateFile: (file: string) => string;
}) => Promise<OpenCascadeInstance>;

let oc: OpenCascadeInstance | null = null;

// `cancelledIds` is self-cleaning when the cancelled request actually
// arrives (we add on cancel, delete on receipt). But if a cancel targets
// a request that never reaches us, e.g. the main thread aborted it before
// posting, the id sits here indefinitely. Bound the map so a long session
// can't leak unbounded worker memory.
//
// Eviction: Map<id, enqueueTimestamp>. On insert, drop entries older than
// CANCELLATION_TTL_MS. The previous Set used clear-on-overflow, which would
// drop *recent* cancellations (the ones still in flight) under sustained
// pressure; timestamp eviction preserves the cancellations that matter.
const MAX_CANCELLED_IDS = 1024;
const CANCELLATION_TTL_MS = 60_000;
const cancelledIds = new Map<string, number>();
function evictExpired(now: number): void {
  for (const [id, ts] of cancelledIds) {
    if (now - ts > CANCELLATION_TTL_MS) cancelledIds.delete(id);
  }
}
function recordCancellation(targetId: string): void {
  const now = Date.now();
  evictExpired(now);
  // Hard cap: if the map is still full of fresh entries (unlikely, but
  // possible under extreme load), drop the oldest.
  if (cancelledIds.size >= MAX_CANCELLED_IDS) {
    const oldestId = cancelledIds.keys().next().value;
    if (oldestId !== undefined) cancelledIds.delete(oldestId);
  }
  cancelledIds.set(targetId, now);
}

function respond(response: WorkerResponse): void {
  const transferables = collectTransferables(response.result);
  if (transferables.length > 0) {
    // postMessage's transferables overload is awkwardly typed across worker
    // contexts; the runtime accepts any Transferable[].
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    self.postMessage(response, transferables as any);
  } else {
    self.postMessage(response);
  }
}

async function initOC(wasmUrl: string | undefined): Promise<void> {
  if (!wasmUrl) {
    respond({
      id: "__init",
      status: "error",
      error:
        "[cadjs/worker] opencascade WASM URL was not provided in the __init message. " +
        "Configure the main thread via configureCadjs({ occWasmUrl }) before instantiating OccWorkerClient.",
    });
    return;
  }

  try {
    oc = await (opencascade as unknown as OpencascadeFactory)({
      locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl : file),
    });
    configureStepDefaults(oc);
    respond({ id: "__init", status: "success" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    respond({
      id: "__init",
      status: "error",
      error: `WASM init failed: ${msg}`,
    });
  }
}

function handleMessage(request: WorkerRequest): void {
  // Control messages
  if (request.type === "__init") {
    initOC(request.payload?.wasmUrl);
    return;
  }

  if (request.type === "__cancel") {
    recordCancellation(request.payload.targetId);
    return;
  }

  // Check cancellation
  if (cancelledIds.has(request.id)) {
    cancelledIds.delete(request.id);
    respond({ id: request.id, status: "cancelled" });
    return;
  }

  // Ensure OC is ready
  if (!oc) {
    respond({
      id: request.id,
      status: "error",
      error: "OCC WASM not initialized",
    });
    return;
  }

  try {
    const result = dispatchOccRequest(oc, request);

    // Check cancellation after operation
    if (cancelledIds.has(request.id)) {
      cancelledIds.delete(request.id);
      respond({ id: request.id, status: "cancelled" });
      return;
    }

    respond({ id: request.id, status: "success", result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    respond({ id: request.id, status: "error", error: msg });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  handleMessage(event.data);
};
