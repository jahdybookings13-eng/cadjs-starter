/**
 * Internal: bundler-resolved asset URLs.
 *
 * In the published bundle (ESM or CJS), `new URL(packageName/path,
 * import.meta.url)` is recognized by Vite, webpack 5, esbuild, Parcel, and
 * Rollup-with-asset-plugin: each rewrites it to a hashed asset URL pointing
 * at the WASM file inside `node_modules/<package>/`. Tests (Vitest) bypass
 * this path entirely by calling `configureCadjs({ occWasmUrl,
 * planegcsWasmUrl })` with paths resolved via `require.resolve`.
 */

export function defaultOccWasmUrl(): string {
  return new URL("opencascade.js/dist/opencascade.full.wasm", import.meta.url)
    .href;
}

export function defaultPlanegcsWasmUrl(): string {
  return new URL(
    "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm",
    import.meta.url,
  ).href;
}
