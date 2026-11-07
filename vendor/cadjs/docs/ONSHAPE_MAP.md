# ONSHAPE → CADJS MAP

Reverse-engineering notes: Onshape's feature/geometry model → cadjs BRep ops.
Sources (cloned 2026-10-17, `~/references/`): `onshape-openapi` (191 REST paths),
`onshape-clients/typescript-node` (447 model files), `onshapedrawingjson` (drawing/view JSON schemas).

## 1. The feature tree IS plain JSON (verified from openapi spec)

Every feature is a `BTMFeature` — this is scadgen's parametric-history format:

```
BTMFeature {
  featureId: string          // stable ref, e.g. "F..."; what queries point at
  featureType: string        // "extrude" | "fillet" | "sketch" | ... (FS function name)
  name / namespace / nodeId  // user label + FS library + history-DAG node
  parameters: BTMParameter[] // the full definition, typed below
  subFeatures: BTMFeature[]  // recursive (sketch entities, mirror patterns...)
  suppressed: boolean
}
```

Parameter vocabulary (`BTMParameter`, 19 variants) — the bridge objects scadgen VR
needs for "sketches, surfaces, edges holding things, dimensions":

| Onshape parameter | Shape | scadgen meaning |
|---|---|---|
| `Quantity` | `{expression, units, value}` | dimension = live expression, not raw float → drives our constraint solver input |
| `QueryList` | entities + item queries (`"sketch1, face2"`) | topology handles: face/edge/vertex refs → cadjs sub-primitive selection |
| `Reference` | named entity ref | datum/origin plane selection |
| `Enum` / `String` / `Boolean` / `Array` | scalars/lists | mode toggles (join/cut, symmetric…) |
| `FeatureList` | feature ids | profile/body pickers |
| `Appearance` / `Material` | appearance refs | transparency/color parity |

Sketches are just features: `BTMSketch extends BTMFeature { entities: [...], constraints: [...] }`
→ same shape as cadjs `Sketch { primitives, constraints }`. VR sketch data ports 1:1.

## 2. Read AND write the tree with one REST call each

- `GET /partstudios/d/{did}/w/{wid}/e/{eid}/partid/{pid}/features` → `BTFeatureListResponse`
  (`features[]` as above + `featureStates` = build/rollback states). → import/replay any model.
- `GET /partstudios/.../featurespecs` → **`BTFeatureSpec[]` = the entire FeatureScript
  standard library as signatures** (`featureType`, `fullFeatureType`, `parameters: BTParameterSpec[]`,
  `uiHints`, `namespace`). The FS lib lives in a locked doc, but featurespecs exposes every
  function's parameter schema — **the open gold path, no browser RE needed**.
- `POST /partstudios/.../features` (`BTFeatureDefinitionCall {feature: BTMFeature}`) → create a
  feature by type + parameters. Geometry out: `gltf`, `stl`, `parasolid`, `tessellatededges`,
  `massproperties`, `boundingboxes` per partid.
- `features/featureid/{fid}` PUT/DELETE = edit/replay history; `features/updates` = rebuild.

Still NOT in the spec: per-featureType concrete payloads (what params `extrude` actually ships).
Getting them: (a) call featurespecs on any real doc (needs Onshape PAT), (b) a live tree fetch,
(c) REA runtime pass on the web app (blocked on opencode restart for `rea` MCP).

## 3. Feature → cadjs/OCC op mapping (start of cheat-sheet)

| Onshape featureType | OCC / cadjs op | cadjs entry point |
|---|---|---|
| sketch | planegcs solve + wire | `@salusoft89/planegcs` via useCadCore; `SketchToBrepRequest` |
| extrude | BRepPrimAPI_MakePrism | `extrudeBRep` |
| revolve | BRepPrimAPI_MakeRevol | `revolveBRep` |
| sweep | BRepOffsetAPI_MakePipe | `sweepBRep` (orientation/corner-mode ≈ Onshape enums) |
| loft | BRepOffsetAPI_ThruSections | `loftBReps` (ruled vs smooth = BRepOffset_Skin) |
| fillet | BRepFilletAPI_MakeFillet | `filletBRep` |
| chamfer | BRepFilletAPI_MakeChamfer | `chamferBRep` |
| combine join/cut/common | BRepAlgoAPI_Fuse/Cut/Common | `booleanOp` / `combineToBoolean` |
| shell/thicken | BRepOffsetAPI_MakeThickSolid | TODO kernel op (phase 8) |
| mirror/linearPattern | transform + fuse | TODO (phase 7); `TransformGroup` ref exists OSHAPE-side |
| measure/mass properties | GProp_GProps | measure mode; Onshape `massproperties` = parity oracle |

## 4. VR sketch UX mapping already built (cadjs-starter, wip/vr-toolbelt)

Onshape's selection grammar validated our VR_SKETCH_SPEC Part 1: plane picked by what the
ray hits — face → offset "face" plane (`createSketchPlaneFromNormal`, `sourceElementId` =
feature ref, same as Onshape QueryList), datum planes → named refs, nothing → freehand.
Onshape sketch planes carry `sourceElementId` → history linkage: VR-created sketch must store
the source face/feature id so editing the face re-drives the sketch (already plumbed via
SketchPlane.sourceElementId).

## 5. Open questions / next RE moves

1. PAT + one document → dump real `features` + `featurespecs` JSON → sample corpus
   (intent → geometry-code training pairs for the co-pilot).
2. REA runtime pass (post-restart): trace how the WASM kernel maps selection handles →
   topological T-tag ids; confirm sketch `entities` curve payload (lineSegments/circles/arcs shape).
3. `dcowden/featurescript` + `ReshefElisha/jarvis-onshape-mcp` not yet cloned — jarvis shows
   working protocol handling for create/edit loops.
4. onshapedrawingjson: view geometry is drawing-annotation-level (views/sections/dimensions),
   useful later for VR Measure-mode billboard parity, not for kernel mapping.

## 4. REA runtime pass — VERIFIED 2026-10-17 (first REA session, shipped-code evidence)

Tooling: `rea` MCP 6.5.0, Chrome 155 CDP (`--remote-debugging-port=9222 --remote-allow-origins`),
owned `capture_browser_scenario` (launch mode) with cookies as **secret refs** (values never in Evidence).
Artifacts kept: `~/OnshapeRE/` (bundle/, captures/, clip_features.json, elements.json, document.json,
scenario JSONs + cookie-fetch .mjs). Raw session-token temp files shredded.

### 4.1 Kernel identity — corrected
- `GraphicsWebAssemblyUtils.wasm` (29 KB, `/js/`) is **NOT the kernel**: emscripten+embind,
  only `emscripten::memory_view<T>` registrations; class names register at runtime.
- The real geometric kernel is **server-side FGS** (Feature Geometry Service): client carries
  `fgsVersion`, `cpuCount`, `gpuInfo` only in debug telemetry classes (serialize.js),
  plus `V3022_DETAILED_FGS_ERRORS` / `FGS_*` error-code enums (numeric codes 1032–1559 visible:
  e.g. FGS_SIMULATION_ERROR_SIMULATION_NON_CONVERGENT=1167, ISOCLINE_FAILED=1337,
  FGS_THICKNESS_INTERNAL_ERROR=1559). Implication for cadjs: client-side OCC WASM is
  architecturally ahead of Onshape's thin-client model; our BRep kernel is the differentiator.
- Client JS chunks (all fetched without auth): runtime / webpack-vendor / vendor-bundle /
  957 / **serialize** (4.8 MB — the BTM wire codec, class names un-minified as string literals) /
  webgl (2 MB) / **woolsthorpe** (15.7 MB — app codename). REA JS graph: 572 modules,
  13.5k data-flow edges (semantic coverage PARTIAL: vendor+woolsthorpe exhausted 1 GiB worker heap;
  parent Evidence ev_8550341da0f7f2fdec2013600df4a318486be6bb01e2e043253ead6406eacf10).

### 4.2 Wire protocol (runtime-captured, live doc "Clip" did=267156a68038556d4561375c)
- **REST** base is `/api/v14/...` (versioned! openapi clone is v13-era).
- Feature tree: `GET /api/v14/partstudios/d/{did}/w/{wid}/e/{eid}/features` →
  `BTFeatureListResponse-2457` (9.6 KB for Clip; keys: features[], defaultFeatures[],
  featureStates{BTMFeatureState-1688: featureStatus OK/inactive}, imports[], rollbackIndex,
  serializationVersion, sourceMicroversion, microversionSkew, rejectMicroversionSkew).
- `featurespecs` on the same doc: HTTP 200 but **body-read-failed** in scenario capture
  (huge stdlib response) — deferred; owner's `onshape-fs-library.md` dump covers it.
- **Binary topology channel**: `wss://cad-usw2.onshape.com/btwssm/{did}/{wsm}` ("bt wss microsession")
  — frames are BINARY (18–274 B seen in 30 s idle boot: ack/heartbeat-sized; geometry microsequences
  flow here, not REST). Modeling mutations go via REST `POST /api/v14/documents/{did}/{wvm}/{wsi}/modelingServiceRequest`.
- Element list shape: `[{name,id,type,elementType,unit fields (lengthUnits...), microversionId,...}]`.

### 4.3 Parametric identity scheme (from BTMSketch-151 sample)
- Entity IDs: 12-char random tags (`NDSTqM4C8OUM`), sub-points as suffix refs
  `.start` / `.end` / `.center` / `.endSnap0`.
- Constraints: `BTMSketchConstraint-2 {constraintType:"VERTICAL", parameters:[BTMParameterString-149
  {parameterId:"localFirst", value:<entityId>}], entityId}` — i.e. constraints reference entities by
  **string parameter slots**, exactly the QueryList-by-name pattern the handoff doc hypothesized.
- Every node carries `nodeId` (tree position) + `featureId` (Origin/Top/FcxbrpTD3WTdrQd_0 style:
  builtins named, user features `F`+16-char). `subFeatures[]` + `returnAfterSubfeatures` = FS expansion tree.

### 4.4 cadjs port actions from this evidence
1. History format v0 for scadgen = `{btType-prefixed node, featureId, nodeId, parameters as named
   slots, entity refs by string id}` → mirror in cadjs `HistoryNode` (skip OCC-tuple identity; Onshape
   proves opaque-string entity tags survive rebuild — same trick planegcs needs).
2. Solver bridge: BTMSketch entities → planegcs items; `.endSnap0` = datum/snap point convention —
   adopt `<entity>.<role>` suffix scheme in VR sketch spec (Part 2 grid dims).
3. VR selection handles (T-tag question) ANSWERED: selection is (featureId | entity-string-id), not
   opaque T-tags on this channel; topology tags live in the binary btwssm stream — needs one
   decode pass of a real geometry burst to map faces/edges (next REA step, owner document with parts).

### Known blockers/notes
- `capture_browser_scenario` connect-mode against manually-launched Chrome fails
  (`execution_failure`, provider-side; even with --remote-allow-origins) — use launch mode +
  secret-ref cookies (pattern: ~/OnshapeRE/scen_api.json).
- Onshape doc page has beforeunload; scenario `goto` on it hangs → drive a blank/owned tab instead.
- Keep `~/OnshapeRE/getcookies.mjs` private: it reads the live browser session (owner-approved lane).

## 5. SOLID-PAYLOAD RE PASS — CLOSED 2026-10-17 (owner extruded BasePlate sketch; captured live)

Artifacts: `~/OnshapeRE/baseplate_extrude_features_full.json` (66,587 B, REST
`GET /api/v14/partstudios/d/1a2ed.../w/cabb.../e/d5aa.../features`), `os_x.json` capture
(REA scenario: full doc-page boot incl. `btwssm` WSS activity log).

### 5.1 Typed `extrude` payload (btType `BTMFeature-134`, featureId `FyyYi1uuGPouazd_0`)
Parameter contract (all named slots, matching boilerplate §1 model):
- enums: domain=MODEL, bodyType=SOLID, operationType=NEW, surfaceOperationType=NEW,
  flatOperationType=REMOVE, endBound/startOffsetBound/secondDirectionBound=BLIND
- quantities (BTMParameterQuantity-147): value=SI number, **expression is the user string
  ("5 mm", "76.0*mm", "3 deg")** — units live in the expression, value can be 0.0 when
  expression is authoritative. cadjs note: keep both fields in HistoryNode.
- booleans: midplane, oppositeDirection, symmetric, hasDraft, hasOffset, hasExtrudeDirection,
  hasSecondDirection(+Offset/Draft trio), defaultScope=true, defaultSurfaceScope=true
- querylists (BTMParameterQueryList-148): entities, surfaceEntities, wallShape,
  endBoundEntity{Face,Body,Vertex}, startOffsetEntity, booleanScope, booleanSurfaceScope,
  secondDirectionBoundEntity{Face,Body,Vertex}, extrudeDirection
- full-defaults pattern: EVERY optional knob ships with a placeholder value/expr
  ("25 mm", "3 deg") — the tree is self-contained; no client-side defaults needed.

### 5.2 THE KEY FIND — selection/topology identity (the "T-tag" question) ANSWERED
`entities` is NOT a T-tag list. `BTMIndividualQuery-138.queryString` =
`query=qCompressed(1.0,"<5-char custom header><standard-base64 zlib 0x789c>",id);`
Decoded (539 B, MessagePack-ish): list of entity records with:
  entityType=EDGE|FACE, historyType=CREATION, **operationId=<creating featureId**
  (e.g. Fd54oLiN321xV1I_0)>, queryType=SKETCH_ENTITY, sketchEntityId=<12-char entity tag>,
  disambiguationType=TOPOLOGY, disambiguationData=[imprint: IMPRINT], derivedFrom=0.
=> Onshape selection = **deferred provenance query** (who created me + entity tag), not a
   static topology tag. Rebuild survives because refs re-resolve via CREATION history.
cadjs/scadgen: HistoryNode refs should store {creationFeatureId, entityTag, entityType,
disambiguation} — planegcs ids (12-char) + feature ids map 1:1. VR sub-primitive selection
can reuse the same triple. Decode helpers: fetch_feat.mjs pattern (owner-lane, values
never in Evidence params); qCompressed decode snippet in this file's history.

### 5.3 Method notes
- REA scenario response-body retention budget = 64 KiB (65,536 B): 66,587-B tree refused
  ("Body exceeds the 64 KiB retained-content budget") → full body fetched via owner-session
  CDP lane (file above, sha-verifiable). features tree = 67 KB for 1 extrude + 3 sketches.
- Doc page load pulls the tree over `btwssm` WSS, NOT REST (app never calls /features on boot;
  REST path is external-integration only). WSS frames: scenario logs sizes (max ~1.3 MB geometry
  burst) but not binary contents — decode needs CDP raw-frame capture (open).
- `fstable?tableType=X` EXECUTES X as an FS function against the studio (400 with semantic
  error when bogus) — server-side FS eval surface.

## 6. BOILERPLATE CODE PORT — scadgen-starter src/model/ (2026-10-17, ongoing)
Done: onshapeHistory.ts (sketch/extrude contracts from LIVE capture; fillet/shell/revolve/
sweep/loft/chamfer/boolean/mirror from op* map keys in ~/references/onshape-fs-library.md
§revolve=angle/axis/cornerType…, sweep=profiles/path/chordalTolerance…, loft=guideSubqueries…,
chamfer=chamferType/width/tangentPropagation, boolean=targets/tools/keepTools/makeSolid,
mirror via opTransform=entities/transform/orientWithDestination) + provenanceForFeature +
parse/formatQuantityExpression + matrix param kind.
featureEngine.ts: ScadgenHistory (tree, per-feature FeatureState, rollbackIndex, suppression,
updateParameter, remove, recompute events, toListResponse SCFeatureListResponse-1) + singleton.
VR wiring: finish gesture pushes getFeatureHistoryNode() into scadgenHistory.
Smoke-tested via tsx (9 engine events, 6 contract builders, "76.0*mm" round-trip).
TODO to "fully boilerplated": (1) executor: recompute events → cadjs geometry ops (extrudeBRep/
filletBRep/… per §3 table) with provenance-resolved inputs; (2) variables/expression engine
(ParameterExpression w/ units); (3) qCreatedBy-equivalent query resolver over the tree;
(4) VR param-edit UI (expression inputs); (5) featureStates ERROR/OK from kernel failures;
(6) hole/thread/pattern/multi-body contracts.

## 6.1 Executor landed (port P2, 2026-10-17)
src/model/executor.ts: ScadgenExecutor — debounced rebuild loop over
ScadgenHistory.evaluatedNodes() driving the real cadjs OCC ops
(SketchToBrepService, extrudeBRep, filletBRep, chamferBRep, loftBReps);
provenance registry (outputs Map + edgeTags per build) resolves
{creationFeatureId, entityTag} refs = scadgen qCreatedBy equivalent; featureStates
now driven by results (OK/ERROR/SUPPRESSED/UNKNOWN); sketch nodes embed BTMSketch-style
geometry snapshots (primitives+plane JSON) in extensions.sketch. bootstrap.ts attaches
executor→history on VR session import. tsc/eslint/build green (browser OCC run + scene
sync still to verify on device). Remaining: scene mesh sync (createMeshFromBrep/addElement
exported), revolve/sweep paths, booleanOp (needs SceneElement bridge), shell/mirror/pattern
ops, expression variables, VR param UI.

## 6.2 Scene sync landed (port P3, 2026-10-17)
src/model/sceneSync.ts: ScadgenSceneSync — on executor rebuild, extrude/fillet/chamfer/loft
outputs commit through the CORE store via updateElementBrep (web-mode applyExtrusion
semantics: profile element replaced in place, geometry extras + occBrep carried).
Profile→element mapping: VR finish diffs core `elements` before/after finishSketch() and
stamps extensions.elementNodeId on the sketch node + history.touch() re-run; sync is
idempotent per feature. executor += onRebuilt bus + edge/face/vertex geometry passthrough;
engine += touch(). bootstrap attaches history→executor→sceneSync. tsx smoke green
(no-commit-before-mapping / commit-once / double-apply-guard); tsc+eslint+build green.
Browser+Quest verification pending (OCC worker runtime, WebXR loop).

## 6.3 VR extrude gesture (port P3.5, 2026-10-17)
Belt Extrude arms local flag (global setMode untouched); right-trigger adds
buildExtrudeNode(defaults 10 mm, provenance entities from last mapped sketch) to
scadgenHistory → executor rebuild → sceneSync commits body in place. Full VR loop:
sketch on desk → finish → extrude → solid, all parametric + rebuildable from the tree.

## 6.4 Revolve + sweep (port P4a, 2026-10-17)
Executor gained revolve (axis via sketch-line provenance → world axis with plane
xAxis/yAxis transform; NORMAL fallback = plane normal; angle from Quantity) and sweep
(profile + chained path-line points → world polyline, degree-1-endpoint start ordering).
Belt: Revolve/Sweep arm → right trigger builds nodes (last mapped sketch; sweep needs
profile+path = last two). sceneSync COMMITTABLE extended.
Run-verified: pointToWorld XZ-desk math, axis normalize, 3-line chain→4 pts,
unresolved revolve/sweep → ERROR in report AND featureStates (loop test with ghosts).
OCC-side revolve/sweep execution still browser-pending.

## 6.5 P4b: gestures fixed + loft/fillet (2026-10-17)
DISCOVERY: P4a's belt-intercept edit had silently no-matched (prettier rewrap) —
revolve/sweep never armed and fell through to setMode. Fixed with exact-text anchor.
Added VR LOFT (last 2 mapped sketches → FACE-body queries; executor resolves by
creationFeatureId) and VR FILLET (last mapped body, entityTag "ALL" → executor's
all-edges fallback; 5 mm). Compiled-verified only; gesture paths need headset.
PRE-EXISTING tsc errors noted (not from this work): SceneOverlays:55,
SketchPropertiesPanel:378, SketchModeContent:363/416/551, simpleCadScene:109
(import.meta.env — tsconfig likely missing vite/client types) /388/389.

## 6.6 Boolean bridge (P4c, 2026-10-17)
Executor "boolean" case: OccWorkerClient.getInstance().send({type:"boolean"}) with
operands from resolved BodyOutputs (brep.toJSON + world position + occBrep), matching
cadjs react.mjs cut-extrusion protocol. mapBooleanOperation ADD/CUT/COMMON→union/
difference/intersection (exported, run-verified). Output = merged Brep in-place on
target element (resolveTargetElementId now reads "targets"); sceneSync hides tool
elements via core.setElementHidden (getObject().visible in VR wiring) and UN-hides on
rollback/error — both paths run-verified with fake-core test.
Node smoke: without Worker, boolean send fails gracefully → ERROR state, loop intact.
Real boolean math = browser-pending. VR gesture for target/tool pair = deferred
(needs body picking UI).

## 6.7 Test infrastructure + first real browser E2E pass (2026-10-17)
- Ported throwaway smokes into vitest (vitest.config.ts, src/model/__tests__/:
  geometry, executor states, sceneSync consumption). test:unit script. 12 tests.
  Lesson captured: injected executor.outputs must be set AFTER whenIdle() —
  scheduled rebuilds clear outputs asynchronously.
- Fixed ALL 13 pre-existing tsc errors: vite-env.d.ts, React19 RefObject|null props,
  MenuState contravariance via real PickItem typing + exactOptional undefined,
  isDimensionalConstraint narrowing, vite https conditional-spread. tsc fully green.
- Playwright: port param (E2E_PORT, ignoreHTTPSErrors, https autodetect) + chromium
  installed. Fixed 3 stale specs: button label is "Finish ✓" not "Finish", and
  Escape = two-level finish (app correct, specs wrong; page-snapshot proof).
- FULL SUITE GREEN: 5 e2e passed + 1 fixme-skipped, 12 unit passed, tsc green.
  NOTE: sketch-rectangle e2e exercises SketchToBrepService in a REAL browser —
  first live OCC-worker profile path observed end-to-end.

## 6.8 Primitives + pattern/mirror (P5, 2026-10-17)
src/model/primitives.ts: composite builders — box (rect sketch+extrude, XY),
cylinder/cone (XZ profile + revolve about edge line), sphere (arc+chord wire),
torus (offset circle + NORMAL-ish axis line). All units = meters.
Executor: sendBooleanOp helper (boolean case refactored onto it), case "pattern"
(transformBrepVertices translated copies + worker union; count/spacing/matrix params),
case "mirror" (scaleMatrix -1 on chosen axis; client-side, orientation flip =
EXPERIMENTAL, kernel tolerance unknown). sceneSync commits pattern (mirror = separate
body, review pending).
Unit tests: 20 passing incl. sphere/torus snapshot payload checks (snapshot lives in
node.extensions.sketch — caught by tests, not by reading my own code).
Interaction note per analyst direction: VR moves to DIRECT MANIPULATION (tap
surface/face → action), belt gestures demoted to fallback. Engine prerequisite:
faceTags/sub-selection provenance on outputs — not yet built.
Kernel-parity gaps documented: shell/hole/draft/rib = no worker op; variables,
multi-body, assemblies, drawings = roadmap.

## 6.9 Expression variables + live primitive verification (P5b, 2026-10-17)
src/model/expression.ts: recursive-descent evaluator — precedence, parens, unary minus,
unit constants, implicit multiplication ("10 mm" ≡ "10*mm", legacy-safe), scope dict,
structured {ok|error}. Both old hand-rolled parsers (executor parseExpr, history
parseQuantityExpression) now delegate; quantityOf/extrudeDepthOf evaluate expression
FIRST (was value-first; correct variable semantics).
featureType "variable" (buildVariableNode; varName string + quantity). Executor rebuild
maintains ordered scope across variable nodes (later shadow earlier; error → ERROR state
with reason, falls back to cached value).
Dev-only __cadDebug.scadgen hook (simpleCadScene) + e2e/primitives.spec.ts: box,
cylinder (revolve), sphere (arc+chord wire), torus (offset circle revolve), mirror
(negative-determinant scaleMatrix) — ALL OK with real OCC geometry in Chromium.
Mirror kernel tolerance confirmed empirically. Programmatic primitives do NOT yet
create scene elements (resolveTargetElementId needs source elementNodeId; VR sketch
path maps via finishSketch). Scene-authoring for primitives = UI-phase task.

## 6.10 Primitive scene authoring (P5c, 2026-10-17)
sceneSync can now AUTHOR elements for unmapped bodies: core.createElement(brep,pos)->nodeId.
Store quirk found: react addElement returns nodeId per applyAddElement, but the id is
assigned inside a deferred setElements updater (undefined under React 18 batching).
Fix: makeElementAuthor (src/model/elementAuthoring.ts) predicts the deterministic claim
(`node_${idCounter+1}`; idCounterRef advances synchronously per addElement call) —
unit-tested for bursts and external counter moves. authored: featureId->elementId map;
in-place ops (fillet/chamfer/boolean/pattern) replace source's element; MIRROR authors
its own element (mirror excluded from source-authored fallback — semantics bug found
via nElements=4: "mirror" was missing from COMMITTABLE).
Wire-ups: useVRSession + simpleCadScene configure cores with createElement/setElementHidden.
primitives e2e now asserts >=5 real scene elements; FULL GREEN: 6/6 e2e, 29 unit,
tsc, eslint (cleared ~64 pre-existing prettier errors in untouched VR/mode files).

## 6.11 STEP/STL import wiring (P6, 2026-10-17)
assets.ts in-memory registry (assetId→bytes+format; NOT serialized — project-persistence
gap documented). buildInsertNode → featureType "insertedBody" (assetId string, format
enum, placement matrix). Executor: ImportExportService.import(STL)/importStep(STEP);
multi-shell results unioned via sendBooleanOp; BodyOutput with occBrep passthrough.
e2e step-import.spec.ts: synthetic binary-SCADA… cube STL (12 tris) inserted into real
history → OK, sewn brep 8 verts/12 faces/18 edges, committed as 2nd scene element.
Bug hunt trail: malformed STL (forgot to advance cursor past normal → OCC threw raw
number 19691808); helper defined node-side but used in page.evaluate (scope bug);
React flush race. (Initial "STL export failed" report was a false alarm
from a stale hook closure exporting an empty list — see 6.12.)
Lint hygiene: vendored dead bundle src/lib/cadjs-react.mjs (435KB, unreferenced,
Sep 23 legacy) excluded from eslint; d.ts override stops fixer mangling triple-slash
vite/client reference; repo-wide eslint now 0 errors.

## 6.12 Export mystery resolved + authoring fixups (P6b, 2026-10-17)
Root cause of "STL export failed": NOT occBrep, NOT the worker — my debug hook closure
captured `elements` at first render (empty); exporting an empty element list → StlAPI
returns false ("STL export failed") / STEP says "no shapes to write". Probe must
re-fetch window.__cadDebug each poll (fresh hook object per render).
Authoring still hardened: postCreate fixup queue in both wiring points (pending map +
seenElementIds pairing via exported pairNewElements — robust to id skips), sceneSync.
remapElementId + configure() now resets synced/hidden/authored when rebound to a new
history (test-order leak that exposed the bug). sceneSync unit coverage: author+skip-
update path; 32 unit tests.
FULL ROUND-TRIP E2E: programmatic box → scene element → ExportService STL bytes →
insertedBody import → second element, states OK, geometry sewn. e2e 7/7+1 skip,
tsc OK, eslint 0 errors (6 pre-existing warnings), build green.

## 6.13 Dimensional typed variables + usage index (P6c, 2026-10-17)
expression.ts v2: values carry Dim exponent maps ({m:1},{rad:1}...); units are typed
constants; +- require equal dims (clear "cannot add m and rad" errors), * / combine
exponents; scope accepts plain numbers (dimensionless) or {value,dim}.
variable nodes now typed (varType distance|angle|number, derived from units default);
executor variable path enforces varType vs expression dim; feature quantity params
have EXPECTED_DIMS (depth/radius/width/thickness/spacing=length, angleForward=angle,
count=number) enforced by quantityOf throw → ERROR w/ reason.
variables.ts: collectVariables + variablesPanelRows (reverse-BFS transitive consumers:
feature using h2 counts as consumer of d when h2=d*2) + variablesForFeature(nodes, fid)
— THE CONTEXT QUERY for the VR variable surface. 39 unit tests.
INTERACTION CONTRACT (decisions needed from analyst):
 surfacing trigger: selection / hand-tracking hold / trigger-press-on-feature — panel
 content = variablesForFeature(selectedFeatureId); dismiss rules; head-locked anchor
 (fixed angular offset, NOT world position — size-independent by design); grouping by
 consumer chain; edit = typeahead on varType-checked expression; live propagation
 already works (expressions re-evaluate every rebuild).

## 6.14 Sub-selection provenance + VR variable-surface contract (P6d, 2026-10-17)
BodyOutput.faceTags (`fid_F{i}`) on ALL executor outputs incl. sketch profiles (1
face); faceOwnerOf/edgeOwnerOf tag→feature resolvers; e2e-proven (box ≥6 faces w/
owner, profile exactly 1). Debug hooks: tags(), varsFor(), varRows().
ANALYST DECISIONS (2026-17):
 a) variable panel = FULL consumer-chain list on select/hold; scrolling a row
    highlights its consumer parts in TRANSLUCENT RED on the object (reverse
    highlight needs: varsFor(feature) + usedBy(feature→elements via authored/
    elementNodeId) + per-face tags — all now exist engine-side; the red
    transparency/visibility tuning = VR-phase work).
 b) panel NOT always-on during hand manipulation: hold object w/ one hand, grab
    face/edge/cursor w/ other → move; surface shows just the ONE live value
    driving what's being moved (precision readout), not the whole tree.
 c) pinned/escape-hatch = open idea ("back wall" parking), deferred.

## 6.15 Sub-primitive bridge + element→feature reverse lookup (P6e, 2026-10-17)
subPrimBridge.ts: faceIndexFromTriangle(brep, triVerts) — vertex-key set membership
(6-decimal quantized, order-insensitive) maps a raycast triangle to topology face;
faceTagForTriangle yields `${fid}_F${i}` compatible with faceTags/faceOwnerOf.
sceneSync.featureForElement(nodeId) — authored map + node extensions reverse scan.
Analyst ruling on prior VR layer (src/components/vr, commits a7b4bfc/38c2c15): it is
BOILERPLATE, not canon — belt/grab/subPrimSelector/perspectiveScale carry ideas +
mechanics get rebuilt (graphics too). Engine keeps only the contracts: faceTags ↔
triangle bridge (done here), feature↔element link (done), varsFor/usedBy (P6c).
Old VR code stays building & typechecking until the VR-phase rewrite. 43 unit,
7/7 e2e, tsc/eslint/build green.

## 6.16 Context operation menu — ported, not invented (P6f, 2026-10-17)
src/model/operationMenu.ts: MENU_BY_SELECTION — Onshape's per-selection command sets
(empty/body/plane-face/curved-face/edge/vertex/line/arc/circle/point) ported from the
RECON inventory (BOILERPLATE §2.6/§4), each row {id,label,status,featureType}:
ready | kernel-unwired (cadjs has the machinery, tree binding pending: measure,
constraints, trim) | planned (port tiers 1–3: shell, hole, draft, move-face, split,
patterns) | deferred (6–7: sheet metal, wrap, threads, derived).
allowedOperations(kind) = only-executable list; menuFor(kind, includeUnavailable) =
full Onshape-fidelity list for future gray-out UI. Curved faces correctly can't
start sketches; move-face sits in planned for faces/edges/bodies. Every VR/desktop
menu binds to THIS table — owner's flow (select → filtered recipes → choose → hand
drives the recipe's pre-determined vector) is now an API contract. 48 unit, 7/7 e2e.

## 6.17 Cheap wins wired (P6g, 2026-10-17)
- MEASURE: src/model/measure.ts — worker edgeLength (1-based edgeIndex!) +
  straight-edge angle, polyline length, nearest-vertex distance (pure, documented
  heuristic). Debug hooks measEdge/measAngle/measDist/measPolyline/etags.
- CONSTRAINT/DIMENSION: executor case "constraint" — revives sketch snapshot,
  validateConstraint gate, makeSketchConstraint, SketchSolverService.solve
  (planegcs WASM, first in-browser proof in e2e/constraint-dimension.spec.ts:
  distance p1-p2→3 exact; one constraint on 8-DOF rect shears legitimately —
  solver correct, test honest), solved sketch → new profile output with own
  tags+snapshot (downstream extrudes can reference constraint feature directly).
- TRIM/EXTEND: src/model/constraints.ts pure snapshot ops
  (trimSnapshot via findAllIntersections+identifyTrimSegment; extendSnapshot
  ray-intersection semantics like Onshape). featureEngine.setSnapshot + hooks
  trimAt/extendTo/rect/constrain. buildRectangleProfileNodes.
- Menu: dimension/constrain/trim-extend/measure flipped to ready. NOTE: a
  status-flip patch WITHOUT assert silently missed (prettier had rewrapped the
  op() calls) — lesson applied retroactively with asserts.
56 unit, 8 e2e (+1 skip), tsc/eslint/build green.

## 6.18 Parity kernel ops landed — speedrun batch (P6h, 2026-10-18)
Kernel source verified: github.com/vitekk02/cadjs is MIT + full src; starter now
depends on file:../cadjs (local build, no registry). Added worker ops (cadjs):
shell (prism recipe: OuterWire → 2D MakeOffset → inner prism → cut; generic
MakeThickSolid NOT bound in current opencascade.js embind — documented, revisit),
draft (BRepOffsetAPI_DraftAngle_1 + CorrectWires; neutral-face convex heuristic),
pattern (linear+circular via gp_Trsf copies + OCC fuse in one worker call),
hole (circle wire → extruded drill → cut; throughAll via bbox diagonal).
891 cadjs tests green (6 new real-OCC handler tests). Starter: executor cases
shell/hole/draft + pattern kind=circular; builders; menu flipped shell/hole/
draft/circular-pattern → ready; hooks shell/draft/hole/circPattern/faceDirs.
Dimension guard caught bare expressions (units lesson: builders must emit
formatQuantityExpression or "N deg", not String()). e2e/parity-ops.spec: all four
on real kernel through browser. 56 unit, 9 e2e (+1 skip), tsc/eslint/build green.
Next parity tiers: curve pattern, modifyFillet, delete-face/heal, split, surface
tier. Intentional-mode resumes at the VR gate per owner.

## 6.19 Pre-exit fixes (P6h-b, 2026-10-18)
- shell: wire-offset now retries the opposite sign (orientation isn't guaranteed)
- holeBRep client API made honest: centers[]/radius/length/overdrive flat params
  (the per-hole-object signature implied multi-radius; worker is single-radius)
- audited new handlers for double-free: shell/hole/pattern deletion paths correct
  (catch-vs-finally verified); success-path source-shape leak matches house style
Rebuilt lib, api-report updated. cadjs 891, starter 56 unit + 9 e2e, all gates green.
