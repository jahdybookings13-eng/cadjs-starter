// src/document/snapshots.ts — local named document history.
//
// A snapshot is a full copy of the CadDocument at a point in time, kept
// separately from the live undo stack. It is deliberately not an undo entry:
// restoring one replaces every tab (the same path a reload uses), while undo
// only walks the scene's edit history.

import { type CadDocument, normalizeDocument, nextTabId } from "./model";

export const SNAPSHOTS_KEY = "scadgen.snapshots.v1";
export const MAX_SNAPSHOTS = 20;

export interface DocumentSnapshot {
  id: string;
  documentId: string;
  name: string;
  createdAt: number;
  doc: CadDocument;
}

type SnapshotMap = Record<string, DocumentSnapshot[]>;

let seq = 0;

function snapshotId(now: number): string {
  seq += 1;
  return `snap_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}${seq}`;
}

function readAll(): SnapshotMap {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SnapshotMap;
  } catch {
    return {};
  }
}

function writeAll(map: SnapshotMap): void {
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(map));
  } catch {
    throw new Error(
      "Snapshot storage is full or unavailable. Delete old snapshots and retry.",
    );
  }
}

function cloneDocument(doc: CadDocument): CadDocument {
  return JSON.parse(JSON.stringify(doc)) as CadDocument;
}

export function listSnapshots(documentId: string): DocumentSnapshot[] {
  return [...(readAll()[documentId] ?? [])].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

export function createSnapshot(
  doc: CadDocument,
  name?: string,
  now = Date.now(),
): DocumentSnapshot {
  const snapshot: DocumentSnapshot = {
    id: snapshotId(now),
    documentId: doc.id,
    name: name?.trim() || `Snapshot ${new Date(now).toLocaleString()}`,
    createdAt: now,
    doc: cloneDocument(doc),
  };
  const all = readAll();
  const list = [snapshot, ...(all[doc.id] ?? [])]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_SNAPSHOTS);
  all[doc.id] = list;
  writeAll(all);
  return snapshot;
}

export function restoreSnapshot(
  documentId: string,
  snapshotIdToRestore: string,
): CadDocument | null {
  const snapshot = (readAll()[documentId] ?? []).find(
    (item) => item.id === snapshotIdToRestore,
  );
  if (!snapshot) return null;
  const restored = normalizeDocument(snapshot.doc);
  if (!restored) return null;
  // A restore is a new version of the same document, not a second document.
  // Keep tab ids stable; only the document timestamp changes.
  return { ...restored, id: documentId, updatedAt: Date.now() };
}

export function deleteSnapshot(
  documentId: string,
  snapshotIdToDelete: string,
): boolean {
  const all = readAll();
  const before = all[documentId] ?? [];
  const after = before.filter((item) => item.id !== snapshotIdToDelete);
  if (after.length === before.length) return false;
  all[documentId] = after;
  writeAll(all);
  return true;
}

export function pruneSnapshots(
  documentId: string,
  keep = MAX_SNAPSHOTS,
): number {
  const all = readAll();
  const before = all[documentId] ?? [];
  const after = [...before]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(1, keep));
  if (after.length === before.length) return 0;
  all[documentId] = after;
  writeAll(all);
  return before.length - after.length;
}

/** Test/debug helper: make a cloned document with fresh tab ids. */
export function snapshotWithFreshTabs(doc: CadDocument): CadDocument {
  const copy = cloneDocument(doc);
  copy.tabs = copy.tabs.map((tab) => ({ ...tab, id: nextTabId() }));
  copy.activeTabId = copy.tabs[0]?.id ?? copy.activeTabId;
  return copy;
}
