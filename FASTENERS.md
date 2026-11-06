# Fastener / Thread Subsystem

Status: **landed + tested** (bolt M6 + screwHole M6 e2e green through the real OCC
worker; 299 unit tests green; tsc + eslint clean).

## What it is

A library of named fastener presets (bolt / stud / machineScrew / selfTap / woodScrew
/ cskScrew / tNut / wingNut / eyeBolt / screwHole) × (ISO / UNF / NPT) × (head
shape) × (thread tip style). Each preset composes into ONE feature-tree node the
tree, undo/redo, VR select, and documentStore round-trip as a single unit.

## Files

- `src/model/threadStandards.ts` — ISO 68-1, ASME B1.1, NPT pitch/depth tables.
  `resolveThread(standard, size, mode, engagement)` → `{ pitch, majorD, depth,
  taperPerLength }` in meters. `clearanceOf(fit)` → ISO 273 clearance diameters.
- `src/model/headShapes.ts` — `headProfile(shapeId, majorD)` → 2D half-outline in
  `(r, z)`; `tipProfile(style, majorD, pitch)` → shank tip outline. Hex/shank,
  socket, csk, wing, eye, none supported.
- `src/model/fastenerPresets.ts` — `FASTENER_FAMILIES[]` catalog (11 families),
  `FastenerSpec`, `FastenerFamily`, `resolvePreset(familyId, standard, size, mode,
  head, tip, length, clearance?, engagement?)`, `validateFastener(spec)`.
- `src/model/fasteners.ts` — builders:
  - `buildFastenerPresetNode(spec, featureId)` → one `fastener` node. Profile =
    merged head + shank half-outline. The `axl` line in the sketch is the revolve
    axis (sketch Y = world Z = bolt axis). Executor runs revolve 360°, then applies
    a `thread` sub-node to the shank band.
  - `buildScrewHolePresetNode(spec, featureId)` → one `screwHole` node. Bore profile
    + optional internal `thread` sub-node when fit is "tapped".
- `src/model/featureMap.ts` — `fastener` and `screwHole` feature entries (statuses
  `implemented`).
- `src/model/executor.ts` — `case "fastener" | "screwHole"`: revolve the profile,
  detect the shank band from vertex radii, run `threadBRep` inline. `flattenNodes`
  post-orders sub-features and **skips** `thread` children of `fastener`/`screwHole`
  so the parent applies threading directly (avoids a second revolve pass).
- `src/scenes/simpleCadScene.tsx` — debug hooks `__cadDebug.scadgen.fastener(spec)`
  and `screwHole(spec)` (each returns the fid). Bus ids `fastener.add` /
  `screwHole.add` (drive the hooks).
- `src/components/PrimaryToolbar.tsx` — Fasteners dropdown (family → standard →
  size → mode → head → tip → length). `onSelectFastener` prop.
- `e2e/parity-ops.spec.ts:967` — "fastener + screwHole hooks emit revolved bodies
  through the kernel" (bolt M6 hex = 1211 faces, screwHole M6 = 80 faces, invalid
  M99 → NOT_IN_REPORT).

## Public API (scene debug surface)

```ts
const fid = __cadDebug.scadgen.fastener({
  family: "bolt", standard: "iso", size: "M6", mode: "coarse",
  head: "hex", tip: "threaded", length: 0.02,
});
const bore = __cadDebug.scadgen.screwHole({
  standard: "iso", size: "M6", mode: "coarse", length: 0.015, clearance: "m2",
});
```

## Invariants

- **Whole fastener = one node.** Profile sub-node + thread sub-node are children;
  undo removes/rewinds the parent, never orphans the parts.
- **Revolve axis = sketch Y (world Z).** The `axl` line spans the profile z-range
  on x=0. `construction: true` on `ax0`/`ax1`/`axl` so the XZ plane axis is excluded
  from BRep conversion.
- **Thread geometry is inline.** No second revolve — the parent applies `threadBRep`
  to the shank band directly after the revolve.
- **Rad, not meters, for the revolve angle.** See UNDO.md "Known pitfalls" — the
  library revolve path once shipped `units: "m"` for `angleForward`, breaking all
  revolve ops. Fixed in `primitiveLibrary.ts` with a `rad(radians)` helper.
- **Sub-features are addressable.** `${fid}#profile_sk`, `${fid}#thread` are stable
  ids; undo, documentStore, and VR all treat them as one unit.

## Not done

- VR select/grab of a single sub-part of a fastener (whole-fastener select only).
- Param panel rows for `family`/`head`/`tip` enums (model-side is wired; UI picker
  unfinished).
- `screwHole` clearance fit → real internal-thread morphology (today the bore is a
  plain cylinder; the thread groove cuts only when `fit === "tapped"`).
- Imperial tap/female internal threads (NPT + ASME internal not in tables yet).
- Hex-driven fasteners that engage a socket (no separate socket-body node).