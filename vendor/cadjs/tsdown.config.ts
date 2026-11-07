import { defineConfig } from "tsdown";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The worker is spawned via `new Worker(new URL("../workers/occ-worker.ts",
// import.meta.url))` from src/services/OccWorkerClient.ts. That source path
// works for source-mode dev (Vite alias), where Vite recognizes the pattern
// and emits the worker chunk. tsdown 0.21 / rolldown emits the worker as a
// separate entry into dist/workers/ but does not rewrite the URL — confirmed
// by removing this hook and observing the literal "../workers/occ-worker.ts"
// in the published bundle. We patch every emitted *.mjs/*.cjs in dist/ so the
// URL resolves to the bundled worker chunk.
//
// Audit C8 status (verified against tsdown 0.21.10 / rolldown 1.0.0-rc.17):
// no native `new URL(..., import.meta.url)` worker rewrite is exposed, so the
// regex rewrite stays. `assertWorkerUrlsResolved` below is the regression
// canary — if either bundler ever starts rewriting the URL natively, the
// patch is a no-op (no replacement occurs) and the assertion still passes.
// Conversely, if a future tsdown version changes the emitted source URL,
// the assertion fails the build and forces an update here. Revisit when
// rolldown ships a stable 1.x with documented worker entry handling.

/**
 * Single source-of-truth for the worker filename. Both the rewrite and the
 * dangling-reference assertion derive from this; changing it requires only
 * one edit.
 */
const WORKER_NAME = "occ-worker";

interface WorkerUrlPatch {
  ext: ".mjs" | ".cjs";
  /** The literal source URL emitted by the bundler before the patch. */
  from: string;
  /** What it should resolve to in the published bundle. */
  to: string;
}

const SOURCE_URL = `../workers/${WORKER_NAME}.ts`;
const WORKER_URL_PATCHES: WorkerUrlPatch[] = [
  { ext: ".mjs", from: SOURCE_URL, to: `./workers/${WORKER_NAME}.mjs` },
  { ext: ".cjs", from: SOURCE_URL, to: `./workers/${WORKER_NAME}.cjs` },
];

/**
 * Fragments that must NOT appear in any emitted main-bundle file post-patch.
 * A silent regression here ships a 404 to every consumer at runtime; we fail
 * the build instead.
 */
const DANGLING_PATTERNS = [`${WORKER_NAME}.ts`, `../workers/${WORKER_NAME}`];

async function patchWorkerUrls(distDir: string): Promise<void> {
  const entries = await readdir(distDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const patch = WORKER_URL_PATCHES.find((p) => entry.name.endsWith(p.ext));
    if (!patch) continue;
    const path = join(distDir, entry.name);
    const text = await readFile(path, "utf8");
    if (!text.includes(patch.from)) continue;
    await writeFile(path, text.split(patch.from).join(patch.to));
  }
}

async function assertWorkerUrlsResolved(distDir: string): Promise<void> {
  const entries = await readdir(distDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    // Only check main-bundle outputs. The worker file itself (./workers/...)
    // is allowed to contain its own filename references.
    if (!entry.name.endsWith(".mjs") && !entry.name.endsWith(".cjs")) continue;
    const path = join(distDir, entry.name);
    const text = await readFile(path, "utf8");
    for (const pat of DANGLING_PATTERNS) {
      if (text.includes(pat)) {
        throw new Error(
          `[tsdown] Worker URL patch missed "${pat}" in ${path}. ` +
            `Update WORKER_NAME / WORKER_URL_PATCHES in tsdown.config.ts.`,
        );
      }
    }
  }
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/react.ts",
    [`workers/${WORKER_NAME}`]: `src/workers/${WORKER_NAME}.ts`,
  },
  format: ["esm", "cjs"],
  target: "es2020",
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: [
      "react",
      "react-dom",
      "three",
      "opencascade.js",
      "@salusoft89/planegcs",
    ],
  },
  onSuccess: async () => {
    await patchWorkerUrls("dist");
    await assertWorkerUrlsResolved("dist");
  },
});
