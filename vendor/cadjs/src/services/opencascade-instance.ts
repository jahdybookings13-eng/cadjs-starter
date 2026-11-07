import type { OpenCascadeInstance } from "opencascade.js";
import { initializeOpenCascade } from "./opencascade-init";

/**
 * Lazy-init singleton for the main-thread OpenCascade WASM instance.
 *
 * The library's normal runtime path is `OccWorkerClient` (off-main-thread). This
 * module exists for tests and any consumer that genuinely needs the OCC
 * instance on the main thread (which is rare, prefer the worker).
 */

let oc: OpenCascadeInstance | null = null;
let initPromise: Promise<OpenCascadeInstance> | null = null;

/**
 * Returns a cached OpenCascade instance, initializing it on first call.
 * Subsequent callers receive the same instance (or wait on the in-flight init).
 * If init fails, the cached promise is cleared so the next caller can retry.
 */
export async function getOcInstance(): Promise<OpenCascadeInstance> {
  if (oc) return oc;

  if (!initPromise) {
    initPromise = initializeOpenCascade();
  }

  try {
    oc = await initPromise;
    return oc;
  } catch (error) {
    console.error("Error initializing OpenCascade.js:", error);
    initPromise = null;
    oc = null;
    throw error;
  }
}

/**
 * Drop the cached instance + in-flight init promise. Used by tests that
 * need a fresh init or by callers reacting to a fatal worker error.
 */
export function resetOcInstance(): void {
  oc = null;
  initPromise = null;
}
