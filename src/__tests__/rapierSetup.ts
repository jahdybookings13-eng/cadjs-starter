import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Boot the REAL RAPIER WASM in a Node/vitest env.
 *
 * rapier3d-compat ships its runtime as dist/rapier_wasm3d_bg.wasm and loads it
 * via fetch() by default — which fails in a headless Node env. Its init() also
 * accepts { module_or_path: <Uint8Array/Buffer> } (the documented async-init
 * path), and a second, no-arg init() call is a no-op once loaded. So we seed
 * the .wasm bytes once here, and RAPIER.init() (as called by
 * createPhysicsWorld) resolves it as a cheap idempotent no-op.
 *
 * This is the ONLY place that pokes the package's filesystem layout; tests use
 * this so the real world can run the exact same physics code the browser runs.
 */
let initPromise: Promise<
  typeof import("@dimforge/rapier3d-compat").default
> | null = null;

export function initRealRapier() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const require = createRequire(
      // Anchor to the repo's node_modules so this resolves regardless of cwd.
      new URL(".", import.meta.url).href,
    );
    const entry = require.resolve("@dimforge/rapier3d-compat");
    const RAPIER = (await import(entry)).default;
    const pkgRoot = join(dirname(dirname(entry))); // .../rapier3d-compat
    const wasm = readFileSync(join(pkgRoot, "dist", "rapier_wasm3d_bg.wasm"));
    await RAPIER.init({ module_or_path: wasm });
    return RAPIER;
  })().catch((e) => {
    // Don't cache a failure — let a later attempt retry (e.g. if the probe ran
    // first and the wasm moved).
    initPromise = null;
    throw e;
  });
  return initPromise;
}
