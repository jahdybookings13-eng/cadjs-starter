# cadjs-starter

A reference React + Three.js + Vite app built on the [`@vitekk02/cadjs`](https://www.npmjs.com/package/@vitekk02/cadjs) library. Use it as a working demo or as a starting point for your own CAD tooling.

For the in-browser Onshape designer parity scope (everything inside the designer and its controls — no API, App Store or cloud services), current capability matrix and phased delivery plan, see [`ONSHAPE_PARITY.md`](./ONSHAPE_PARITY.md).

Phase 0 instrumentation is generated, not hand-maintained: [`CONTROL_INVENTORY.md`](./CONTROL_INVENTORY.md) lists every visible control and its handler/evidence, [`PARITY_STATUS.md`](./PARITY_STATUS.md) shows matrix ownership and coverage, and [`parity/budgets.json`](./parity/budgets.json) records the browser budgets. Phase 1 adds the local document shell; its exit script and measured results are in [`parity/phase-demos/phase-1.md`](./parity/phase-demos/phase-1.md). Run `npm run inventory:controls` after UI changes and `npm run test:bible` for the full gate.

## What's inside

- **`src/index.tsx`**: entry. Wires `configureCadjs` with Vite-resolved WASM URLs, mounts the provider tree (`ToastProvider` → `CadCoreProvider` → `CadVisualizerProvider`), shows a `LoadingScreen` while WASM boots.
- **`src/scenes/simpleCadScene.tsx`**: primary editor: viewport, mode switching (sketch / extrude / fillet / sweep / loft / revolve / measure / combine), keyboard shortcuts, undo/redo, ViewCube, feature tree.
- **`src/document/`**: local document model and storage: IndexedDB with a localStorage mirror, Part Studio tabs, named snapshots, browse/sort rules, and document-file import/export.
- **`src/components/`**: reusable UI: `DocumentsPage`, `DocumentPanel`, `DocumentToolbar`, `DocumentTabBar`, `DimensionInput`, `SketchContextMenu`, `PlaneSelector`, `ViewCube`, `FeatureTree`, `FileMenu`, `ModeInfoCard`, `LoadingScreen`, …
- **`src/navbar/`**: `Navbar`, `SketchToolbar`, `ConstraintPanel`, `ValueInputModal`.

All UI components consume the library through its public entry points (`@vitekk02/cadjs`, `@vitekk02/cadjs/react`), with no deep imports.

## Run it

```bash
npm install
npm run dev
```

Opens at <http://localhost:3000>. Vite serves the starter and pulls `@vitekk02/cadjs` from npm.

## Build it

```bash
npm run build
npm run preview   # serve the built bundle locally
```

Output goes to `dist/`.

## Fork as a starting point

1. Clone this repository, or copy its contents into your own.
2. Rename in `package.json`. Keep `@vitekk02/cadjs` as a dependency or replace it with your fork.
3. Keep the `configureCadjs(...)` call in `src/index.tsx`. That is where you wire your bundler's WASM URL strategy.
4. Replace `simpleCadScene.tsx` with your own UI. The providers and hooks are framework-agnostic to your visual design.

## Cross-origin isolation

OpenCascade.js uses `SharedArrayBuffer`, which requires cross-origin isolation. Vite is already configured (`vite.config.mts`) with the right headers:

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy:   same-origin
```

If you deploy elsewhere, replicate these headers on your CDN/host.

## License

ISC
