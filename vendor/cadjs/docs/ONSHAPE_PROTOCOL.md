# ONSHAPE LIVE PROTOCOL MAP — captured via REA browser session (2026-10-17)

Source: authenticated Chrome session (port 9222), Part Studio "Clip"
`doc 267156a68038556d4561375c / wsm 1ad637c5939bebed3d2203e2 / eid 7559a971914d9ddb6e0e3637`.
Captured live during editor load (Evidence `ev_098749cb…` scenario network events). 178 responses observed; the **engine-relevant** subset is below. This is the door list for "the boiler" — every capability Onshape's front-end pulls to build the app.

> API version: `/api/v14/…` (base `https://cad.onshape.com`). Auth = Onshape session cookie + `X-CSRF-TOKEN` (from `/api/v14/clientinfo/xsrf`). For clean machine-readable JSON, prefer the official `onshape-clients` TS lib (already cloned in `~/references/onshape-clients`) with a Personal Access Token — see route at bottom.

## 1. FEATURE / TOOL CATALOG (the buttons)
- `GET /api/v14/toolbar/tools` → every tool/command id + label + which feature it launches. **THE button list.**
- `GET /api/v14/toolbar/toolbars?name=all-user-removed-tools` → user tool customization model.

## 2. GEOMETRY KERNEL + PARAMETER SCHEMA (the engine)
- `GET /api/v14/elementLibrary/standardlibrarydefinitions` → the **FeatureScript standard library**: every feature type + its full parameter schema. This is the parametric engine definition.
- `POST /api/v14/documents/{did}:{wsi}/modelingServiceRequest` → the **live geometry-kernel channel** (server C++ engine). Invoked on EVERY op (rebuild, tessellate, measure, feature commit). This is the only thing doc-mining can never give you: the real kernel request/response wire protocol.
- `GET /api/v14/documents/{did}/partstudios/{wsi}/{eid}/features` → a document's feature tree as data (BTMFeature array).
- `GET /api/v14/globaltreenodes` → global feature/instance tree node catalog.
- `GET /api/v14/documents/{did}/elements?…` → element (part studio / drawing / FS) listing.

## 3. DOCUMENT / CAPABILITY / CONTEXT
- `GET /api/v14/documents/{did}` + `/permissionset` + `/workspaces/{wsi}/default`
- `GET /api/v14/capabilities/allcurrent/` → every capability flag (WEB.*) the build supports.
- `GET /api/v14/capabilities/check/?capabilities=…` → feature-gate probe (dialog/UX toggles).
- `GET /api/v14/applications/standard?documentId=…` → which apps run against a doc.
- `GET /api/v14/elements/translatorFormats/{did}/w/{wsi}/{eid}` → import/export format capability per element.
- `GET /api/v14/documents/getImportFormatData` → supported CAD interchange formats.

## 4. CLIENT KERNEL MODULES (shipped JS/WASM, already pulled to /tmp/rea-onshape/js)
- `js/woolsthorpe.*.js` (15.7 MB) — main app + BTM feature model (333 `featureType`, 438 `QueryList`, `GBTMFeature` tree ops, per-feature dialogs).
- `js/serialize.*.js` (4.8 MB) — BTM wire (featureSpecName, featureId, queryVariable, geometryMate).
- `js/webgl.*.js` (2 MB) + `js/GraphicsWebAssemblyUtils.wasm` — client graphics WASM (tessellation/display; the *geometric* kernel is server-side via modelingServiceRequest).

## 5. WHAT'S STILL TO PULL (clean route)
The two static catalogs (`toolbar/tools`, `standardlibrarydefinitions`) + a live `modelingServiceRequest` round-trip are the remaining raw payloads. Chrome's JSON viewer blocks REA `Response.body()` on top-document 200 JSON, so get them by official REST + PAT (onshape-clients), NOT browser navigation:
1. `featurespecs` / stdlib JSON → feeds VR panel auto-gen + AI co-pilot vocabulary.
2. One captured `modelingServiceRequest` req+resp (do an extrude, capture the POST body via DevTools Network → Save) → the geometry wire contract for scadgen's kernel calls.

## 6. KEY PATHS
- Doc-mined boiler (all 1,389 FS fns, 54 modules, param schemas, gap vs cadjs): `~/cadjs/docs/ONSHAPE_BOILERPLATE.md`
- BTM protocol decode: `~/cadjs/docs/ONSHAPE_MAP.md`
- Shipped kernel chunks: `/tmp/rea-onshape/js` (woolsthorpe/serialize/webgl/wasm)
- Official refs: `~/references/onshape-clients`, `onshape-openapi`, `onshapedrawingjson`
