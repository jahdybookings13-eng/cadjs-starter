/**
 * Library-wide runtime configuration.
 *
 * cadjs depends on two WebAssembly modules at runtime: OpenCascade.js and
 * planegcs. Their .wasm files cannot be inlined into the published JS bundle,
 * each consumer must tell the library where to fetch them. The shape of that
 * URL depends on the bundler (Vite uses `?url`, webpack uses
 * `new URL(..., import.meta.url)`, etc.), so the library does not embed the
 * URLs itself.
 *
 * Call `configureCadjs({...})` once at app startup (before any service is
 * instantiated). The starter package shows the Vite pattern.
 */

import * as Theme from "./theme";

export type NotifyType = "error" | "warning" | "success" | "info";

/**
 * Names of the overridable theme sections. Listed explicitly (rather than
 * `keyof typeof Theme`) so future non-section exports from `theme.ts`,
 * including `THEME_DEFAULTS` itself, do not silently leak into
 * `ThemeOverrides`.
 */
export type ThemeKey =
  | "SCENE"
  | "LIGHTING"
  | "BODY"
  | "SELECTION"
  | "SKETCH"
  | "INFERENCE"
  | "SKETCH_PLANE"
  | "PLANE_SELECTOR"
  | "EXTRUDE"
  | "FILLET"
  | "SWEEP"
  | "LOFT"
  | "REVOLVE"
  | "COMBINE"
  | "MEASURE"
  | "DEBUG"
  | "VIEWCUBE"
  | "HELPERS";

type DeepPartial2<T> = {
  [K in keyof T]?: T[K] extends ReadonlyArray<unknown>
    ? T[K]
    : T[K] extends object
      ? Partial<T[K]>
      : T[K];
};

/**
 * Partial overrides for the visual theme, structured the same way as the
 * exports of `theme.ts`. Both top-level sections and the second level (e.g.
 * `LIGHTING.keyLight.color`) accept a partial object, anything you omit
 * keeps its default. Arrays (e.g. light positions) are replaced by reference.
 */
export type ThemeOverrides = {
  [K in ThemeKey]?: DeepPartial2<(typeof Theme)[K]>;
};

export interface CadjsConfig {
  /**
   * URL or path to `opencascade.full.wasm`.
   * Used by both the main-thread singleton (`opencascade-instance.ts`) and
   * forwarded to the OCC Web Worker via its init message.
   */
  occWasmUrl?: string;

  /**
   * URL or path to `planegcs.wasm`.
   * Forwarded to `make_gcs_wrapper(wasm_path)` inside `SketchSolverService`.
   */
  planegcsWasmUrl?: string;

  /**
   * User-facing notification sink. Library hooks call this to surface
   * operational errors/warnings (e.g. "Loft produced empty result") instead
   * of importing a UI provider. Wire it to your toast / notification system.
   *
   * The signature is intentionally pluggable, because different consumer apps
   * wire different toast libraries (or none in tests / Node-side rendering).
   * The library does not import a UI provider directly because doing so would
   * couple cadjs to a specific framework's component tree.
   *
   * If unset, errors and warnings fall back to `console.error`/`console.warn`
   * so they're never silently swallowed; info/success default to no-op.
   */
  notify?: (message: string, type?: NotifyType) => void;

  /**
   * Enable verbose `console.log` output from library internals (sketch
   * constraint application, sweep positioning, etc). Off by default, these
   * logs are useful when debugging but spammy in normal use.
   */
  debug?: boolean;

  /**
   * Partial overrides for the visual theme. Each section (BODY, SCENE,
   * SKETCH, …) and each second-level group inside LIGHTING accepts a partial
   * object; omitted keys keep their defaults.
   *
   * **Timing, must be set before any cadjs visualizer mounts.** Three.js
   * materials, textures and lights capture theme values once at construction
   * (in `initScene`, `mesh-operations`, `useGroundPlane`,
   * `helperVisualizations`, `element-helpers`, `convertBRepToGeometry`). A
   * `useEffect` is too late: React ref callbacks run before effects, so the
   * scene is already initialised. Call `configureCadjs({ theme })` at module
   * load (e.g. in your bundle entry, before `createRoot().render()`).
   * Objects constructed after the override is in place pick up the new
   * values; pre-existing materials are not retro-updated.
   */
  theme?: ThemeOverrides;
}

let config: CadjsConfig = {};

/**
 * Walk a `ThemeOverrides` object and mutate the live theme exports in place.
 * 2-level merge: scalars and arrays at the top level are replaced; nested
 * plain objects (e.g. `LIGHTING.keyLight`) get `Object.assign`-merged so
 * partial second-level overrides don't drop sibling fields. Identity of every
 * top-level theme export (and of the nested objects inside `LIGHTING`) is
 * preserved, so all existing imports of `BODY`, `SKETCH`, … continue to read
 * the latest values without any change.
 */
function applyThemeOverrides(overrides: ThemeOverrides): void {
  for (const sectionKey of Object.keys(overrides) as ThemeKey[]) {
    const section = Theme[sectionKey] as Record<string, unknown>;
    const override = overrides[sectionKey] as
      | Record<string, unknown>
      | undefined;
    if (!section || !override) continue;
    for (const key of Object.keys(override)) {
      const tv = section[key];
      const sv = override[key];
      const mergeable =
        tv &&
        typeof tv === "object" &&
        !Array.isArray(tv) &&
        sv &&
        typeof sv === "object" &&
        !Array.isArray(sv);
      if (mergeable) {
        Object.assign(tv as object, sv as object);
      } else {
        section[key] = sv;
      }
    }
  }
}

/**
 * Set library runtime configuration. Call once before instantiating any
 * service (`OccWorkerClient.getInstance()`, `SketchSolverService.getInstance()`,
 * etc) and, if `theme` is supplied, before any cadjs visualizer mounts.
 * Subsequent calls merge into the existing config; theme overrides are
 * applied to the live theme objects in place rather than carried in the
 * runtime snapshot, so `getCadjsConfig().theme` is always `undefined`.
 */
export function configureCadjs(next: CadjsConfig): void {
  if (next.theme) applyThemeOverrides(next.theme);
  const { theme: _ignored, ...rest } = next;
  config = { ...config, ...rest };
}

/**
 * Read the current configuration. Internal helpers and services use this to
 * fetch URLs at the moment they need them.
 */
export function getCadjsConfig(): Readonly<CadjsConfig> {
  return config;
}

import {
  defaultOccWasmUrl,
  defaultPlanegcsWasmUrl,
} from "./internal/asset-urls";

/**
 * Resolve the OpenCascade WASM URL.
 *
 * Order of resolution:
 *   1. Explicit override from `configureCadjs({ occWasmUrl })`.
 *   2. Default: bundler-resolved `new URL("opencascade.js/dist/opencascade.full.wasm", import.meta.url)`.
 *      Modern bundlers (Vite, webpack 5, esbuild, Parcel, Rollup with the asset
 *      plugin) treat the bare-specifier first segment as a node-resolution and
 *      emit the WASM as a hashed asset, so this "just works" for the common
 *      case without any consumer config.
 *
 * If you serve the WASM from a CDN, a custom static path, or use a bundler
 * that does not transform this pattern, set `configureCadjs({ occWasmUrl })`
 * yourself.
 */
export function resolveOccWasmUrl(): string {
  return config.occWasmUrl ?? defaultOccWasmUrl();
}

/**
 * Resolve the planegcs WASM URL. Same fallback rules as `resolveOccWasmUrl`.
 */
export function resolvePlanegcsWasmUrl(): string {
  return config.planegcsWasmUrl ?? defaultPlanegcsWasmUrl();
}

/**
 * Internal notification helper. Calls the consumer-provided sink if one is
 * configured; otherwise falls back to console for error/warning so the
 * consumer still sees real problems if they forgot to wire `notify`.
 */
export function notify(message: string, type: NotifyType = "info"): void {
  const sink = config.notify;
  if (sink) {
    sink(message, type);
    return;
  }
  if (type === "error") {
    console.error(`[cadjs] ${message}`);
  } else if (type === "warning") {
    console.warn(`[cadjs] ${message}`);
  }
}

/**
 * Internal debug-log helper. No-op unless `configureCadjs({ debug: true })`
 * was called.
 */
export function debugLog(...args: unknown[]): void {
  if (config.debug) {
    console.log(...args);
  }
}
