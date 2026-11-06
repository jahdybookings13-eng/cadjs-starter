# Fastener Preset Library — Plan

Goal: a full selectable fastener library. Every common screw/bolt, every head
shape, threaded/tipped/pointed tips, metric (ISO) + imperial (SAE/UNC/UNF/NPT),
exposed as presets. Each preset = named, indexed entry. Instantiating a preset
composes the existing kernel ops (revolve for head+shank, boolean fuse, thread
for the tip, cone/chamfer for point) into ONE feature tree node that the tree,
history, undo/redo, VR select, and flux all treat as a single fastener.

## Evidence (what already exists)

- **Kernel op `thread`** (`threadBRep`): ISO/UNIFIED groove cut, torus-ring per
  pitch, `kind: external | internal`. Already dispatched in
  `executor.ts:2293` (`case "thread"`) with cylindrical-band auto-detection.
- **Kernel features** all present: `revolve`, `boolean`, `hole`, `thread`,
  `chamfer`, `cylinder`, `cone`, `pattern`, `featurePattern`.
- **Thread tables** (`threadStandards.ts`): ISO_COARSE M1.6–M24, ISO_FINE,
  UNIFIED (UNC/UNF), NPT. `resolveThread(standard, size, mode, engagement)`.
- **Node builders** (`primitives.ts`): `buildThreadNode`, `buildCylinderNodes`,
  `buildConeNodes`, `buildRevolveNode`, `buildChamferNode`, `cloneFeatureNodes`,
  `buildFeaturePatternNode`.
- **featureMap**: `thread` entry exists with standard/size/mode/kind/engagement
  params.
- **Scene wiring**: `fastener.thread(...)` hook already calls
  `buildThreadNode` (`simpleCadScene.tsx:761`).
- **Persistence**: `documentStore.ts` serializes the full node tree.
- **Cloning**: `cloneFeatureNodes` already renames featureIds + shifts origins
  (the "save a tree, take it apart" primitive).

## Gaps (this feature)

1. **No fastener product** — only a generic `thread` op. No bolt/screw that
   combines head + shank + threaded tip + (optional) point in one node.
2. **No head-shape definitions** — hex, socket-head (cap), pan, flat/counter-
   sunk, countersink, square, oval, round, button, cheese, T-nut, wing.
3. **No tip styles** — threaded (full/partial), pointed (self-drilling),
   flat, countersunk, cone.
4. **No preset registry** — sizes are free strings; no validated, indexable
   preset list; wrong size → silent runtime error.
5. **NPT depth formula bug** — `threadStandards.ts:92-95` collapses 0.8 to 5/8
   and double-multiplies; depth math mixes up the 5H/8 formula.
6. **Zero tests** for threads / fasteners (tables, builder, featureMap,
   band-detect, happy + error paths, preset resolution).

## Design

### 1. Fastener preset model (`src/model/fasteners.ts`)

```
type HeadType =
  | "hex"            // external hex (bolt)
  | "socketHex"      // socket head cap (Allen) bolt
  | "pan"            // pan head
  | "countersunk"    // flat / countersunk
  | "countersink"    // 82° countersink (tapered flat)
  | "square"
  | "oval"
  | "round"          // carriage
  | "button"
  | "cheese"         // slotted
  | "tNut"           // T-nut (threaded)
  | "wing"           // wing / thumb
  | "none";          // stud / shank only (bolt, both ends threaded)

type TipType =
  | "threaded"       // full M3x8 tap (whole length)
  | "partialThread"  // head + shank + threaded tip (machine screw w/ shank)
  | "pointed"        // pointed tip (self-tapping / self-drilling)
  | "flat"           // flat-cut tip
  | "countersunk"    // countersunk chamfer tip
  | "none";          // no tip treatment

interface FastenerSpec {
  id: string;             // "iso-M6-12-hex-partialThread"
  standard: "iso" | "unified" | "npt";
  threadId: string;       // "M6" / "3/16-18" / "1/4-10"
  size: string;           // human: "M6" / "3/16-18"
  mode: "coarse" | "fine";
  kind: "external" | "internal";  // bolt=head+ext-thread; screwHole=int-thread
  head: HeadType;
  tip: TipType;
  length: number;         // m (engagement length under head)
  clearance: "none" | "m1" | "m2" | "m3" | "m4" | "tapped"; // ISO 273 hole fit
}

interface FastenerPreset {
  spec: FastenerSpec;
  label: string;          // "M6 Hex Bolt, partial thread, 12 mm"
  family: FastenerFamily;
  heads: string[];                // selectable head shapes
  tips: string[];                 // selectable tip shapes
  sizes: string[];                // valid thread sizes for this family
  clearance: string[];            // valid ISO 273 hole fits
}

type FastenerFamily =
  | "bolt"            // head + shank + thread (machine bolt)
  | "bolt-stud"       // both ends threaded, no head
  | "screw-machine"   // head + full/partial thread (M3x8, #8-32)
  | "screw-selfTap"   // pointed tip, sometimes w/ shank (ST)
  | "screw-selfDrill" // hard pointed tip (SDS)
  | "screw-wood"      // sharp point, often w/ pan/round head
  | "screw-countersunk" // flat/CSK screw
  | "screw-shackle"   // round-headed wood/tent screw
  | "screw-shepherd"  // long point, timber
  | "screw-dowel"     // threaded rod
  | "screw-helical"   // hanger bolt / jack screw
  | "screw-eyebolt"   // ring/eye head
  | "screw-wingNut"   // thumb screw
  | "screw-tNut"      // T-nut
  | "screw-screw"     // general (fallback)
  | "screw-hole"      // internal: a tapped/clearance hole (no solid)
  | "screw-holeClearance" // ISO 273 clearance hole only (no thread)

interface FamilyPreset {
  family: FastenerFamily;
  label: string;
  description: string;
  defaults: Partial<FastenerSpec>;
  requiredHeads: HeadType[];      // heads that make sense for this family
  requiredTips: TipType[];
  suggestedClearance: string[];   // for *hole* families
  threadStandards: ThreadStandard[]; // iso / unified / both
}
```

The preset library is a pure table. `FASTENER_FAMILIES` = the list of
families; `FASTENER_HEADS`, `FASTENER_TIPS`, `FASTENER_SIZE_TABLES`,
`FASTENER_CLEARANCE_FITS` are the building blocks. `resolveFastener(presetId:
string, overrides): FastenerSpec -> ThreadSpec + head dims + tip dims` is the
single resolution entry.

### 2. Head-shape geometry tables (`src/model/headShapes.ts`)

Each head gets its nominal (ISO 2716-ish) geometry in terms of the nominal
diameter `d`:

| head       | A (head dia) | C (head height) | hexAcrossFlats | socket |
|------------|--------------|-----------------|----------------|--------|
| hex        | 1.85d        | 0.73d           | 1.53d (AF)     | –      |
| socketHex  | 2.0d         | 0.8d            | 1.73d (AF)     | 0.6d   |
| pan        | 1.9d         | 0.4d            | –              | –      |
| countersunk| 1.8d         | 0.32d (taper)   | 90° CSK        | –      |
| countersink| 1.4d (82°)   | 0.25d (taper)   | 82° CSK        | –      |
| square     | 1.7d         | 0.7d            | flat           | –      |
| oval       | 1.8d         | 0.5d            | flat           | –      |
| round      | 1.8d         | 0.6d            | flat           | –      |
| button     | 2.0d         | 0.25d           | flat           | –      |
| cheese     | 1.9d         | 0.35d           | slot 0.5d      | –      |
| tNut       | 1.5d         | 0.8d            | flat           | –      |
| wing       | 2.2d         | 0.4d            | wing ±0.6d     | –      |
| none       | –            | –               | –              | –      |

`headProfile(head: HeadType, d: number): HeadProfile` returns `{topR,
bottomR, height, acrossFlats?, hProfile: boolean|'hex'|'oval'|"pan"|...}`.
Revolve profiles take the full 3-D shape (e.g. hex head = 6-sided prism
replaced by a revolve of the AF/2 radius profile, i.e. the *envelope* circle;
true hex is a 6-gon sketch+extrude. For parity we can ship the envelope-
revolve (smooth) for most, and switch hex to the 6-gon extrude to get a real
hex. Same for square (4-gon extrude).)

### 3. Tip-shape geometry tables (`src/model/headShapes.ts`)

| tip            | profile                  |
|---------------|--------------------------|
| threaded      | full/partial M{n}: thread op over the length |
| partialThread | shank (plain, 1.0d) + thread on the last 0.4d |
| pointed       | sharp 14° point cone tip (self-tap) |
| flat          | flat cut (no chamfer) |
| countersunk   | 82° taper (CSK)              |
| none          | plain end |

`tipProfile(tip: TipType, d: number, length: number): TipProfile` returns
shank-diameter + the tip geometry (point angle / chamfer / none).

### 4. Preset composition → node tree

`buildFastenerPresetNode(spec: FastenerSpec, featureId): NodeWithTree`
returns a *single* top feature node whose `subFeatures` is the composition:

```
fastener (top node, featureType="fastener", params=head/tip/size/length/…)
├── shank        (cylinder: d x shank length)         [if partialThread]
├── head         (per head-type: revolve/sketch-prism) [if head != "none"]
└── thread       (thread op: external, on the tip length)
    ├── [taper]  cone tip for pointed/CSK             [if tip = pointed/CSK]
```

When `family == screw-hole`:
```
screwHole (top, featureType="screwHole", params=clearance/thread/hole…)
└── bore (hole op) [clearance = clearanceD; threaded = thread op: internal]
```

`cloneFeatureNodes` is what makes "take apart" trivial: each sub-node has a
stable `featureId` so it can be listed, selected, suppressed, or detached.

### 5. featureMap additions

New feature type (the FUTURE extension point):
```
featureType: "fastener"
label: "Fastener"
kernelOp: "fastener"   // (resolved via composition; no direct kernel op)
selectionKinds: ["body"]
status: "implemented"
params:
  - string  family     (bolt / bolt-stud / screw-machine / self-tap / …)
  - enum    standard   (iso / unified / npt)
  - string  threadId   (M6 / 3/16-18 / …) — validated against size tables
  - enum    mode       (coarse / fine)
  - number  length     (m, engagement under head)
  - enum    head       (hex / socketHex / pan / …)
  - enum    tip        (threaded / partialThread / pointed / flat / CSK / none)
  - enum    clearance  (none / m1..m4 / tapped) — for internal / screw-hole
```

And a hidden-but-present `screwHole` type for the clearance/tapped-hole
feature (a hole that's been tapped with an internal thread op), so a
"screw hole" is a first-class feature in its own right (pickable, param-
editable, VR-selectable).

### 6. Scene + UI + Voice wiring

- `src/scenes/simpleCadScene.tsx`: add a `fasteners` API surface: `addFastener(
  presetId|spec, placement?)` returns the new fastener node's `featureId`.
  Mirror and place next to the existing `fastener.thread` hook.
- `PrimaryToolbar.tsx`: add a **⚙ Fasteners** dropdown. Menu = families →
  sizes (validated, indexable) → heads → tips. Pick one = add a fastener at
  the selection, or with default orientation.
- `Voice / Flux`: expose `flux.addFastener` through the same `bus` path
  (`fastener` → subagent "parts"), so voice says "M6 hex bolt, partial
  thread" and the orchestrator resolves the preset. (Optional, later.)
- `paramPanel`: a fastener gets param rows for head / tip / size / clearance
  so the user can swap the head or tip post-hoc without rebuilding.

### 7. NPT / depth fixes (threadStandards.ts)

The math today:
```ts
const depth = (standard === "npt" ? 0.8 : (0.541275 * H_OVER_P) / 0.866025) * pitch * engagement;
```
- `H_OVER_P` = 0.866025 (H/P). So `(0.541275 * 0.866025) / 0.866025` = 0.541275 —
  i.e. the `0.54127*P` iso depth. Good.
- NPT depth should be `0.8 * P` (B1.20.1: H = 0.5413P; but NPT uses a 60° V
  with a 0.8·P crest; 0.8·P = the "5H/8" of an NPT). Keep NPT branch at 0.8·P;
  drop the *second* `* pitch * engagement` which is double-applied. Currently
  it's `0.8 * pitch * engagement` for NPT — correct. The metric branch
  collapses `H_OVER_P` to 1, leaving `0.541275 * pitch * engagement` —
  correct.

  The actual bug: `depth` doubles-uses `engagement` (it's both the multiplier
  for single-engage and a separate engineering multiplier). Fix: make
  `engagement` pure multiplier (multiplicative). The current code already
  multiplies by `engagement` once; that's correct, but the comment is
  confusing. We write the formula:
  - metric: `depth = 5H/8 = 0.54127·P · engagement`
  - NPT:    `depth = 0.1407·majorDia · (1) / P = 0.8·P · engagement`
  and add a `depthFor()` helper so the executor uses the same line as the
  table. No formula change; clarity + clarity-comment fix + one test.

### 8. Size validation + preset index

`src/model/fastenerPresets.ts`:
- `listPresets(family?) : FastenerPreset[]` — the index.
- `resolvePreset(id): FastenerPreset | undefined`.
- `validateFastener(spec): {ok:true} | {ok:false, error}` — checks the
  `threadId` is in the table for the standard+mode, the head is allowed for
  the family, the tip is allowed, clearance is one of the ISO 273 set, and
  the `length` is ≥ `minThreadFor(size, tip)`.
- A typed `THREAD_SIZES: Record<ThreadStandard, {coarse: string[]; fine:
  string[]}>` and `CLEARANCE_FITS: Record<"none"|"m1"|"m2"|"m3"|"m4"|"tapped",
  {label: string; multiplier: number}>` (ISO 273: clearance = 1.111d for M ≤
  M6, 1.113d for M8..M12, 1.12d for M14..M24; tapped = 0.75d).

### 9. Tests (`src/model/__tests__/fasteners.test.ts`)

- **Tables**: for every ISO coarse/fine + every UNIFIED + every NPT row,
  `resolveThread` returns positive pitch, majorD, depth; and a known value
  (M6 coarse → pitch 1 mm, depth ≈ 0.5413 mm).
- **Depth formula**: metric depth = 0.54127·P (single-engage); NPT depth =
  0.8·P; engagement multiplier applied multiplicatively.
- **Head-shape profile**: each head type produces consistent geometry
  (A < 2.2d, C is sane, acrossFlats > 0 for hex).
- **Tip profile**: pointed tip angle == 14° (in `tipProfile`), CSK == 82°,
  threaded tip emits a thread call with the right length.
- **Composition (buildFastenerPresetNode)**: a hex bolt partial-thread M6×12
  returns a tree with exactly `[head, shank, thread]` sub-nodes, stable
  featureId suffixes, and a top node with `featureType=fastener` + the right
  params.
- **Validation**: resolvePreset("iso-M6-12-hex-partialThread") is a valid
  spec; an invalid size → `validateFastener` errors with a helpful "valid
  sizes: [M1.6, M2, …]" list.
- **Clearance / tapping**: a `screwHole` with clearance "tapped" composes
  `[bore, thread-internal]`; "m3" composes `[bore-cleared]` (no thread).
- **FeatureMap**: `fastener` + `screwHole` entries have the right
  `params[].kind` and `selectionKinds`, and `featureMapFor("fastener")`
  returns the entry with `status === "implemented"`.
- **Scene hook shape**: `buildFastenerPresetNode` is the same shape the
  existing `buildThreadNode` / `buildHoleNode` return (verifies the scene
  `fastener` hook can drop it into `scadgenHistory.add` directly).

### 10. Documentation

- `UNDONE.md`: mark Phase 7 thread item → "fastener preset library
  implemented (bolt/screw/self-tap/self-drill + 12 head shapes + 6 tip styles
  + ISO/UNF/NPT + ISO-273 clearance, validated + tested)."
- New doc `FASTENERS.md`: the API surface, how to compose a fastener, how to
  add a new head/tip/family.

## Build order (each independently shippable + testable)

1. **threadStandards.ts** — fix the depth comment, add `depthFor()`, add
   `THREAD_SIZES` export, add `CLEARANCE_FITS` (ISO 273), write unit tests.
2. **headShapes.ts** — `headProfile()` + `tipProfile()` tables, tests.
3. **fastenerPresets.ts** — preset model + index + `resolvePreset` +
   `validateFastener`, tests.
4. **fasteners.ts** — `buildFastenerPresetNode(spec, fid): NodeWithTree`
   composition, tests (composition, params, stability).
5. **featureMap.ts** — add `fastener` + `screwHole` entries, tests.
6. **simpleCadScene.tsx** — `addFastener` scene hook, drop the node into
   `scadgenHistory`; mirror the existing `fastener.thread` hook pattern.
7. **PrimaryToolbar.tsx** — the ⚙ Fasteners dropdown (family → size → head →
   tip), each pick = one `addFastener` call.
8. **paramPanel** — expose head/tip/size/clearance rows so the user can swap
   post-hoc.
9. **Voice / Flux (optional, later)** — `flux.addFastener` bus entry;
   orchestrator routes plain-English "M6 hex bolt, partial thread" to the
   parts sub-agent.
10. **FASTENERS.md** — API surface + how to add a head/tip/family.

Each of 1–6 is independently tsc/eslint/test-verifiable and ships before the
next. The UI (7–8) and voice (9) are separate slices that consume the model
but don't block it.

## Acceptance criteria

- [ ] `resolveThread` depth formula correct for iso/unified (0.54127·P) and
      npt (0.8·P), engagement applied multiplicatively, tested.
- [ ] `THREAD_SIZES` exported and used by `validateFastener`; wrong size
      → helpful "valid: [...]" error.
- [ ] Every head shape (12) has a sane geometric profile; tests assert
      A, C, and (for hex) AF are positive and the hex is a 6-gon extrude, not
      a cylinder.
- [ ] Every tip style (6) has a geometric profile; pointed == 14°, CSK == 82°.
- [ ] A preset like `iso-M6-12-socketHex-partialThread` resolves to a valid
      spec and composes into a 3-node tree `[head, shank, thread]` with stable
      featureId suffixes `#head`, `#shank`, `#thread`.
- [ ] A `screwHole` with `clearance=tapped` composes `[bore, thread-internal]`;
      with `clearance=m3` composes `[bore-cleared]` (no thread).
- [ ] The scene `addFastener` hook returns a new `featureId` and the node
      appears in `featureTree` + the desktop `FeatureTree` panel.
- [ ] The ⚙ Fasteners dropdown in the toolbar lets the user pick family →
      size → head → tip and places the fastener.
- [ ] Full test suite green, tsc clean, eslint clean.
- [ ] Fastener nodes flow through `cloneFeatureNodes` (take apart) and
      `documentStore.saveProject` (save) cleanly.

## Constraints

- No new top-level repo. Everything under `src/model/` + `src/scenes/` +
  `src/components/`.
- No new kernel ops. Compose from the existing `revolve`/`boolean`/`hole`/
  `thread`/`cone`/`cylinder`/`chamfer`/`pattern` set.
- No paid services. The preset tables are pure data + math; no fetch.
- One fastener = one top feature node. The tree, undo/redo, VR select, and
  flux all treat it as a single thing (the sub-`.head/.shank/.thread` nodes
  are children, not separate top-level features).