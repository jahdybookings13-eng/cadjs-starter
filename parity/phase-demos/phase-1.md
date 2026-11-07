# Phase 1 demo — local document shell

Date: 2026-11-06
Build: working tree, Chromium 1440×900, fresh browser profile, Vite dev server.
Format: each step names an action, the expected observation and the durable
evidence artifact. Commands are run from the repository root.

## Script

1. **Create and persist a document.**
   - Action: open Documents → New document → name it `Phase One Case` → Create.
   - Expected: the editor opens the named document and the record appears in
     the `scadgen.documents` IndexedDB database.
   - Evidence: `e2e/documents-page.spec.ts` (`idbDocumentNames` poll).

2. **Survive a corrupt mirror.**
   - Action: overwrite `localStorage["scadgen.documents.v1"]` with invalid JSON,
     then reload.
   - Expected: the editor reopens `Phase One Case` from the good IndexedDB copy;
     the corrupt mirror does not hide or crash the document.
   - Evidence: `e2e/documents-page.spec.ts`; unit fallback in
     `src/document/__tests__/phase1.test.ts` ("survives a corrupt localStorage
     mirror").

3. **Organise documents.**
   - Action: open Documents → search `Phase One` → Rename to
     `Phase One Renamed` → Duplicate → Export.
   - Expected: one renamed card and one copy card; a `.cadjs-doc.json` download
     is produced.
   - Evidence: `e2e/documents-page.spec.ts`.

4. **Trash and restore.**
   - Action: delete the copy → Show Trash → Restore → Show All.
   - Expected: the copy is absent from All while trashed, visible in Trash, and
     returns after Restore.
   - Evidence: `e2e/documents-page.spec.ts`.

5. **Named snapshot across reload.**
   - Action: open the document panel → create snapshot `empty` → reload → reopen
     the panel → add a 20 mm box → Restore `empty`.
   - Expected: the snapshot is still listed after reload and restoring it removes
     the box.
   - Evidence: `e2e/documents-page.spec.ts` (`elementCount` 1 → 0).

6. **Tab manager.**
   - Action: create three Part Studios named `Part Studio`, `Cover` and `Base`;
     search `Cov`; press Alt+ArrowLeft/Right; drag `Base` onto the first tab;
     duplicate from the tab menu; select `Cover` and `Base` in the document
     panel and Duplicate.
   - Expected: search shows only `Cover`, keyboard and drag reorder change the
     real order, and duplicate/multi-select add independent tabs.
   - Evidence: `e2e/document-tabs.spec.ts`.

7. **Quota / failed write.**
   - Action: save a document, then make `localStorage.setItem` throw
     `QuotaExceededError` and save a changed copy.
   - Expected: the status reports that local storage is full/unavailable; the
     in-memory document updates, while the last serialized good save is
     unchanged.
   - Evidence: `src/document/__tests__/phase1.test.ts` ("surfaces a failed
     localStorage write and keeps the last good save").

8. **Full gate.**
   - Action: `npm run test:bible`.
   - Expected: typecheck, lint, all unit tests, production build, bundle budget,
     control inventory, parity matrix and budget schema pass.
   - Evidence: terminal output from the Phase 1 checkpoint.

## Current result

- Controls: 295 in 66 files; 0 dead, 0 unlabeled, 8 with direct test evidence.
- Matrix: 97 rows in 8 sections; 35.1% row coverage; 6 `SHIPPED`, 56 `PARTIAL`,
  31 `MISSING`, 4 `STUDIO`.
- Full gate: `npm run test:bible` passes — 603 unit tests passed, 4 skipped;
  typecheck, lint (0 errors, 27 pre-existing warnings), production build, bundle
  budget, control inventory, parity matrix and budget schema all pass.
- Perf: boot 7.96 s (budget 12 s), document reload 5.44 s (budget 15 s), box
  regeneration 216 ms (budget 5 s), orbit 61 fps (budget ≥30).
- Document tests: 26 passed (`src/document/__tests__`).
- Chromium: `e2e/documents-page.spec.ts` and `e2e/document-tabs.spec.ts` pass.
- Browser regression: the non-VR Chromium chunk passed **40 tests, 1 skipped**.
  The full 49-test Chromium run was split after the 10-minute tool cap; the 8
  existing VR specs were not rerun and are outside Phase 1.
- Persistence: IndexedDB + localStorage mirror; corrupt mirror recovery and
  quota reporting are covered.
- Snapshots: named, newest 20, whole-document restore, reload-persistent.
- Tabs: Part Studio only, because Assembly/Drawing/Variable Studio/Feature
  Studio workspaces do not exist yet. The create menu lists those kinds as
  disabled with a stated reason rather than opening empty tabs.

## Known limitations

- The Phase 1 workstream for five toolbar families and full keyboard-map
  customization is not complete. The document toolbar landed; feature/sketch
  context toolbars remain the existing surfaces, so 4.1.3 stays `PARTIAL`.
- The document panel reports design size and storage status, not per-operation
  performance timings, so its matrix row stays `PARTIAL`.
- Quota failure is simulated at the storage API boundary. Real browser quota
  exhaustion and private-mode behaviour are not exercised.
- The corrupt-write check covers a corrupt localStorage mirror with an intact
  IndexedDB copy. A corrupt IndexedDB record is dropped by normalization rather
  than quarantined or repaired.
- Document import and bulk tab delete have unit coverage but no browser test.
- Control evidence remains low: 8 direct references (3%) across 295 controls.
- Firefox/WebKit still run the smoke matrix; the tab and Documents specs are
  Chromium-only.
- The pre-existing VR specs were not rerun for this Phase 1 pass. They are
  unrelated to the document shell and made the full-suite run exceed the tool
  time cap.
