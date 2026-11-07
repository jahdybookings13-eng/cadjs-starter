// Smart mock for OccWorkerClient that routes through the real OCC dispatch logic.
// Only the Worker transport is bypassed -- all handler/helper functions run for real.
//
// Lazy imports inside send() break a circular dependency:
// mock -> opencascade-instance -> ... -> OccWorkerClient.

import type { WorkerRequest } from "../../src/workers/occ-worker-types";

export class OccWorkerClient {
  private static _instance: OccWorkerClient | null = null;

  static getInstance(): OccWorkerClient {
    if (!OccWorkerClient._instance) {
      OccWorkerClient._instance = new OccWorkerClient();
    }
    return OccWorkerClient._instance;
  }

  static isAvailable(): boolean {
    return true;
  }

  async waitForReady(): Promise<void> {
    return Promise.resolve();
  }

  async send<T = unknown>(request: Omit<WorkerRequest, "id">): Promise<T> {
    const { getOcInstance } =
      await import("../../src/services/opencascade-instance");
    const { dispatchOccRequest } =
      await import("../../src/workers/occ-dispatch");
    const oc = await getOcInstance();
    return dispatchOccRequest(oc, request as WorkerRequest) as T;
  }

  cancel(): void {}

  dispose(): void {
    OccWorkerClient._instance = null;
  }
}
