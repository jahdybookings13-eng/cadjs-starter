/**
 * Main-thread singleton that communicates with the OCC Web Worker.
 * All OCC operations go through this client as pipeline-level messages.
 */

import type {
  WorkerRequest,
  WorkerResponse,
} from "../workers/occ-worker-types";
import { collectTransferables } from "../workers/geometry-reconstruction";
import { resolveOccWasmUrl, debugLog } from "../config";

export class OccWorkerClient {
  private static instance: OccWorkerClient | null = null;
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
    }
  >();
  private ready = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private nextId = 0;

  private constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Spawn the worker on first use. Constructor is now lazy so that simply
   * importing the module under SSR (Next.js, Remix) doesn't call `new Worker`
   *, that fails with `ReferenceError: Worker is not defined` in Node.
   */
  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") {
      throw new Error(
        "OccWorkerClient cannot be used in this environment: `Worker` is undefined. " +
          "If this is a server-side render, defer OCC operations to the browser.",
      );
    }
    const w = OccWorkerClient.spawnWorker();
    w.onmessage = this.handleMessage.bind(this);
    w.onerror = this.handleError.bind(this);
    this.worker = w;
    OccWorkerClient.sendInit(w);
    return w;
  }

  /**
   * `crypto.randomUUID` is unavailable in Node and on insecure contexts
   * (HTTP LAN dev). Fall back to a counter so the client still works there.
   */
  private generateId(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return `req-${++this.nextId}`;
  }

  /**
   * Spawn the OCC worker. Bundlers that recognize the
   * `new URL("./worker.ts", import.meta.url)` pattern (Vite, esbuild, webpack 5)
   * emit a separate worker chunk for this. Non-recognizing bundlers will need
   * to ship the worker file separately and override this; that hook is a
   * candidate for a future Phase if there's demand.
   */
  private static spawnWorker(): Worker {
    return new Worker(new URL("../workers/occ-worker.ts", import.meta.url), {
      type: "module",
    });
  }

  private static sendInit(worker: Worker): void {
    const wasmUrl = resolveOccWasmUrl();
    worker.postMessage({
      id: "__init",
      type: "__init",
      payload: { wasmUrl },
    } satisfies WorkerRequest);
  }

  static getInstance(): OccWorkerClient {
    if (!OccWorkerClient.instance) {
      OccWorkerClient.instance = new OccWorkerClient();
    }
    return OccWorkerClient.instance;
  }

  /**
   * Returns true once the worker's WASM module is ready.
   */
  static isAvailable(): boolean {
    return OccWorkerClient.instance?.ready ?? false;
  }

  /**
   * Wait for the worker WASM to be ready. Spawns the worker on first call,
   * without this, `readyPromise` would never resolve when callers wait before
   * any `send()`.
   */
  waitForReady(): Promise<void> {
    if (typeof Worker !== "undefined") this.ensureWorker();
    return this.readyPromise;
  }

  /**
   * Send a request to the worker and return a Promise for the result.
   * Uses UUID-based correlation and zero-copy transfer for typed arrays.
   */
  async send<T = unknown>(request: Omit<WorkerRequest, "id">): Promise<T> {
    const worker = this.ensureWorker();
    await this.readyPromise;

    const id = this.generateId();
    const fullRequest = { ...request, id } as WorkerRequest;

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Collect transferable ArrayBuffers for zero-copy. `collectTransferables`
      // walks the value defensively so passing the whole request is safe, the
      // cast through `unknown` bypasses the discriminated-union payload-property
      // check.
      const transferables = collectTransferables(fullRequest as unknown);
      if (transferables.length > 0) {
        worker.postMessage(fullRequest, transferables);
      } else {
        worker.postMessage(fullRequest);
      }
    });
  }

  /**
   * Cooperative cancellation, sends cancel message to worker.
   * Worker checks the cancelled set and skips work if possible.
   */
  cancel(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.reject(new Error("Cancelled"));
      this.pendingRequests.delete(requestId);
    }
    // Don't spawn a worker just to cancel, if no worker exists, nothing to cancel.
    if (!this.worker) return;
    this.worker.postMessage({
      id: this.generateId(),
      type: "__cancel",
      payload: { targetId: requestId },
    } satisfies WorkerRequest);
  }

  dispose(): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Worker disposed"));
    }
    this.pendingRequests.clear();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    OccWorkerClient.instance = null;
  }

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const response = event.data;

    if (response.id === "__init") {
      if (response.status === "success") {
        this.ready = true;
        this.readyResolve();
        debugLog("[OccWorkerClient] Worker WASM ready");
      } else {
        console.error(
          "[OccWorkerClient] Worker WASM init failed:",
          response.error,
        );
      }
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) return; // Already cancelled or unknown

    this.pendingRequests.delete(response.id);

    if (response.status === "success") {
      pending.resolve(response.result);
    } else if (response.status === "cancelled") {
      pending.reject(new Error("Operation cancelled"));
    } else {
      pending.reject(new Error(response.error || "Worker operation failed"));
    }
  }

  private handleError(event: ErrorEvent): void {
    console.error("[OccWorkerClient] Worker error:", event.message);

    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error(`Worker error: ${event.message}`));
    }
    this.pendingRequests.clear();

    this.ready = false;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    if (this.worker) this.worker.terminate();
    const w = OccWorkerClient.spawnWorker();
    w.onmessage = this.handleMessage.bind(this);
    w.onerror = this.handleError.bind(this);
    this.worker = w;
    OccWorkerClient.sendInit(w);
  }
}
