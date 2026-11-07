# cadjs

Web CAD library: BRep geometry, OpenCascade.js operations, sketch solver, and optional React bindings.

> **Status:** unstable (`0.1.1`). Public API may change.

## Demo

Live: [cad-js.vercel.app](https://cad-js.vercel.app/) · Source: [`cadjs-starter`](https://github.com/vitekk02/cadjs-starter)

## Install

```bash
npm install @vitekk02/cadjs three react react-dom
```

`react`, `react-dom`, and `three` are peer dependencies, install them in your app. The library declares them as peers so it doesn't pin or duplicate copies.

`@vitekk02/cadjs` itself depends on `opencascade.js` (WASM) and `@salusoft89/planegcs` (constraint solver).

## WASM modules, works out of the box

`@vitekk02/cadjs` depends on two WebAssembly modules: `opencascade.full.wasm` (OpenCascade.js) and `planegcs.wasm` (sketch solver). Since both are declared as `dependencies`, they always exist in your `node_modules`. The library auto-resolves them via:

```ts
new URL("opencascade.js/dist/opencascade.full.wasm", import.meta.url);
new URL(
  "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm",
  import.meta.url,
);
```

Modern bundlers (Vite, webpack 5, esbuild, Parcel, Rollup with the asset plugin) recognize this pattern and emit each WASM as a hashed asset. **You usually do not need to wire any URLs yourself.**

You **do** need cross-origin isolation headers in your dev server and in production (for `SharedArrayBuffer`):

```ts
// vite.config.ts
server: {
  headers: {
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
  },
},
```

### Override the URLs (advanced)

If you serve the WASM from a CDN, a custom static path, or use a bundler that doesn't transform `new URL(..., import.meta.url)`, set the URLs explicitly:

```ts
import { configureCadjs } from "@vitekk02/cadjs";

configureCadjs({
  occWasmUrl: "/wasm/opencascade.full.wasm",
  planegcsWasmUrl: "/wasm/planegcs.wasm",
});
```

Vite's `?url` import works too:

```ts
import occWasmUrl from "opencascade.js/dist/opencascade.full.wasm?url";
import planegcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";

configureCadjs({ occWasmUrl, planegcsWasmUrl });
```

## Hook notifications into your toast system

Library hooks publish operational errors and warnings (e.g. "Loft produced empty result") through an optional `notify` callback you wire at config time. The library does **not** ship a toast UI, bring your own (Sonner, react-hot-toast, an in-app banner, anything). If you don't wire `notify`, errors and warnings fall back to `console.error` / `console.warn` so they're never silently swallowed.

```ts
import { configureCadjs } from "@vitekk02/cadjs";
import { toast } from "sonner";

configureCadjs({
  notify: (message, type) => {
    if (type === "error") toast.error(message);
    else if (type === "warning") toast.warning(message);
    else if (type === "success") toast.success(message);
    else toast(message);
  },
});
```

`type` is `"error" | "warning" | "success" | "info"` (`NotifyType`).

## Verbose logging

Pass `debug: true` to enable verbose `console.log` output from library internals (constraint application, sweep positioning, etc). Off by default.

```ts
configureCadjs({ debug: true });
```

## Public API surface

Two entry points:

```ts
import {} from /* core */ "@vitekk02/cadjs"; // geometry, services, scene operations, sketch types
import {} from /* React */ "@vitekk02/cadjs/react"; // providers, hooks (requires react/react-dom)
```

### Core (`@vitekk02/cadjs`)

| Group            | Exports                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geometry         | `Brep`, `Vertex`, `Edge`, `Face`, `CompoundBrep`, `BrepGraph`, `cloneBrep`                                                                                              |
| Theme            | `BODY`, `SELECTION`, `SKETCH`, `HELPERS`, `VIEWCUBE`, …                                                                                                                 |
| Services         | `OccWorkerClient`, `SketchSolverService`, `SketchToBrepService`, `ImportExportService`                                                                                  |
| Config           | `configureCadjs`, `getCadjsConfig`, `resolveOccWasmUrl`, `resolvePlanegcsWasmUrl`, `NotifyType`                                                                         |
| Scene operations | `unionSelectedElements`, `differenceSelectedElements`, `extrudeBRep`, `sweepBRep`, `loftBReps`, `revolveBRep`, `filletBRep`, `chamferBRep`, `ungroupSelectedElement`, … |
| Sketch types     | `Sketch`, `SketchPrimitive`, `SketchConstraint`, `SketchPlane`, type guards                                                                                             |

### React (`@vitekk02/cadjs/react`)

| Group     | Exports                                                                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Providers | `CadCoreProvider`, `CadVisualizerProvider`                                                                                                                                                                                                     |
| Hooks     | `useCadCore`, `useCadVisualizer`                                                                                                                                                                                                               |
| Modes     | `useMoveMode`, `useExtrudeMode`, `useFilletMode`, `useSweepMode`, `useLoftMode`, `useRevolveMode`, `useCombineMode`, `useSketchMode`, `useMeasureMode`, `useCameraAnimation`, `useSketchInference`, `useSelectOther`, `useVisualizerResize`, … |

## Custom modes and operations

The library leaves the door open for consumers to add their own interaction modes and operation types without forking. The contract is intentionally small: opened type unions plus a per-element metadata slot.

### A custom mode is just a hook

`SceneMode` is `BuiltInSceneMode | (string & {})`, built-in values still autocomplete, but `setMode("drill")` typechecks. Write a hook the same way `useExtrudeMode` is written, gate its effects on `mode === "drill"`, and trigger it via `setMode`.

```tsx
import { useEffect } from "react";
import { useCadCore } from "@vitekk02/cadjs/react";

export function useDrillMode() {
  const { mode, selectedElements, updateElementBrep } = useCadCore();

  useEffect(() => {
    if (mode !== "drill") return;
    // Wire your mousedown/mousemove/mouseup handlers, run OCC operations,
    // then call updateElementBrep(...) with the result.
    return () => {
      /* cleanup */
    };
  }, [mode, selectedElements]);
}
```

Activate it from the UI:

```tsx
const { setMode } = useCadCore();
<button onClick={() => setMode("drill")}>Drill</button>;
```

The library does not gate any built-in behavior on the mode string (only `"sketch"` is special-cased internally). Built-in modes you don't override keep working unchanged.

### Per-element user data

`SceneElement.userData?: Record<string, unknown>` is the consumer-defined slot. It survives `updateElementBrep`, `updateElementPosition`, and `updateElementRotation` automatically (shallow spread). Use it for material tags, custom IDs, anything else.

> **Snapshot semantics:** `userData` is shared by reference across undo snapshots. Treat it as immutable per snapshot, or mutate knowingly. It is not serialized by import/export.

> **Note:** `addElement` does not currently accept `userData` at construction time. Populate it via a follow-up state update if you need it on a fresh element.

### Custom operation types in the feature tree

`OperationType` is `BuiltInOperationType | (string & {})`, feature-tree nodes can carry any string. Pair this with the starter's `BrowserPanel` props to render them:

```tsx
<BrowserPanel
  /* ...other props... */
  iconForType={(t) => (t === "drill" ? <DrillIcon /> : undefined)}
  labelForType={(t) => (t === "drill" ? "Drill" : undefined)}
/>
```

Both props fall through to the built-in icon switch when they return `undefined`, so the built-in operation icons keep working.

## Quick example: standalone (no React)

The geometry classes (`Brep`, `Vertex`, `Edge`, `Face`) are pure TypeScript and can be used without React or even without OpenCascade. Heavier operations (boolean ops, extrude, fillet, file I/O) run through the OCC Web Worker, exposed via `OccWorkerClient`.

```ts
import { Brep, Vertex, Face, OccWorkerClient } from "@vitekk02/cadjs";

// Build a triangle BRep in-memory (no WASM needed).
const v1 = new Vertex(0, 0, 0);
const v2 = new Vertex(1, 0, 0);
const v3 = new Vertex(0, 1, 0);
const triangle = new Brep([v1, v2, v3], [], [new Face([v1, v2, v3])]);

// Hand it off to the OCC worker for an analytic operation (e.g. extrude).
import type { WorkerGeometryResult } from "@vitekk02/cadjs";

const occ = OccWorkerClient.getInstance();
await occ.waitForReady(); // resolves once the worker WASM is initialised
const { brepJson } = await occ.send<WorkerGeometryResult>({
  type: "extrude",
  payload: {
    brepJson: triangle.toJSON(),
    depth: 10,
    direction: 1,
  },
});
const prism = Brep.fromJSON(brepJson); // 3D solid back as a Brep
```

The `OccWorkerClient` is request/response over `postMessage`, so it works in any environment where Web Workers and `SharedArrayBuffer` are available (a normal browser tab with COOP/COEP headers, an Electron renderer, etc.). For Node / SSR, instantiate the worker only on the client.

## Quick example: React app

Wrap your tree with the providers, then use the hooks for each interaction mode:

```tsx
import {
  CadCoreProvider,
  CadVisualizerProvider,
  useCadCore,
  useCadVisualizer,
  useExtrudeMode,
} from "@vitekk02/cadjs/react";
import { configureCadjs } from "@vitekk02/cadjs";

// WASM URLs are auto-resolved from node_modules, no need to wire them up.
// Add `notify` to forward library errors/warnings into your toast system.
configureCadjs({
  notify: (msg, type) => yourToastSystem(msg, type),
});

function App() {
  return (
    <CadCoreProvider>
      <CadVisualizerProvider>
        <Editor />
      </CadVisualizerProvider>
    </CadCoreProvider>
  );
}

function Editor() {
  const { elements, selectedElements, setMode } = useCadCore();
  const extrude = useExtrudeMode();
  // … render Three.js canvas, toolbars, etc.
}
```

A full reference implementation (sketch tools, fillet/chamfer, sweep, loft, undo/redo, file import/export) lives in the `cadjs-starter` package.

## License

MIT
