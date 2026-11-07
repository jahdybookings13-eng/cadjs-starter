// src/document/store.ts — local document persistence.
//
// IndexedDB is the durable copy when the browser provides it. A synchronous
// localStorage mirror stays in the same shape so the scene keeps its synchronous
// read path and so a browser without IndexedDB still works. Hydration happens
// once during boot, before the scene resolves its active tab.
//
// Every save is written to the mirror immediately and queued to IndexedDB. The
// status subscription is how quota/private-mode failures reach the UI instead
// of being swallowed.

import {
  type CadDocument,
  designFromProject,
  newDocument,
  normalizeDocument,
} from "./model";
import {
  hasIndexedDb,
  idbDeleteDocument,
  idbLoadDocuments,
  idbSaveDocument,
} from "./idb";

export const DOCUMENTS_KEY = "scadgen.documents.v1";

type DocumentMap = Record<string, CadDocument>;

export type DocumentBackend = "indexeddb" | "localstorage";

export interface DocumentStorageStatus {
  backend: DocumentBackend;
  hydrated: boolean;
  pendingWrites: number;
  lastError: string | null;
}

let cache: DocumentMap | null = null;
let hydration: Promise<void> | null = null;
let hydrated = false;
let backend: DocumentBackend = "localstorage";
let lastError: string | null = null;
let pendingWrites = 0;
const pending = new Set<Promise<void>>();
const listeners = new Set<(status: DocumentStorageStatus) => void>();

function currentStatus(): DocumentStorageStatus {
  return { backend, hydrated, pendingWrites, lastError };
}

export function getDocumentStorageStatus(): DocumentStorageStatus {
  return currentStatus();
}

export function subscribeDocumentStorage(
  listener: (status: DocumentStorageStatus) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearDocumentStorageError(): void {
  if (!lastError) return;
  lastError = null;
  notify();
}

function notify(): void {
  const status = currentStatus();
  for (const listener of [...listeners]) {
    try {
      listener(status);
    } catch {
      /* a broken UI subscriber must not stop persistence */
    }
  }
}

function reportError(message: string): void {
  lastError = message;
  notify();
}

function normalizeMap(value: unknown): DocumentMap {
  if (!value || typeof value !== "object") return {};
  const out: DocumentMap = {};
  for (const [projectId, raw] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const doc = normalizeDocument(raw);
    // A stored doc whose id disagrees with its key is corruption, not a
    // second document; trust the key and repair the id.
    if (doc) out[projectId] = { ...doc, id: projectId };
  }
  return out;
}

function readLocal(): DocumentMap {
  try {
    const raw = localStorage.getItem(DOCUMENTS_KEY);
    if (!raw) return {};
    return normalizeMap(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

function writeLocal(map: DocumentMap): boolean {
  try {
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(map));
    return true;
  } catch {
    reportError(
      backend === "indexeddb"
        ? "The local document mirror is full. IndexedDB is keeping the latest save."
        : "Document save failed: local storage is full or unavailable.",
    );
    return false;
  }
}

function readAll(): DocumentMap {
  if (cache) return cache;
  cache = readLocal();
  return cache;
}

function queueIdbSave(doc: CadDocument): void {
  pendingWrites += 1;
  notify();
  let task: Promise<void>;
  task = idbSaveDocument(doc)
    .catch((error: unknown) => {
      reportError(
        `IndexedDB save failed: ${errorMessage(error)}. The localStorage mirror has the latest copy.`,
      );
    })
    .finally(() => {
      pendingWrites -= 1;
      pending.delete(task);
      notify();
    });
  pending.add(task);
}

function queueIdbDelete(id: string): void {
  pendingWrites += 1;
  notify();
  let task: Promise<void>;
  task = idbDeleteDocument(id)
    .catch((error: unknown) => {
      reportError(`IndexedDB delete failed: ${errorMessage(error)}`);
    })
    .finally(() => {
      pendingWrites -= 1;
      pending.delete(task);
      notify();
    });
  pending.add(task);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Load the durable copy once. Local documents that predate IndexedDB are
 * migrated in; when both copies exist, the newest updatedAt wins per document.
 * A failed IndexedDB open degrades to the localStorage mirror and reports it.
 */
export function hydrateDocuments(): Promise<void> {
  if (hydration) return hydration;
  hydration = (async () => {
    const local = readLocal();
    if (!hasIndexedDb()) {
      cache = local;
      hydrated = true;
      notify();
      return;
    }

    try {
      const remote = await idbLoadDocuments();
      backend = "indexeddb";
      const merged: DocumentMap = { ...local };
      const remoteMap = new Map<string, CadDocument>();
      for (const raw of remote) {
        const doc = normalizeDocument(raw);
        if (doc) remoteMap.set(doc.id, doc);
      }

      for (const [id, doc] of remoteMap) {
        const mirrored = merged[id];
        if (!mirrored || doc.updatedAt > mirrored.updatedAt) merged[id] = doc;
      }

      for (const [id, doc] of Object.entries(merged)) {
        const remoteDoc = remoteMap.get(id);
        if (!remoteDoc || doc.updatedAt > remoteDoc.updatedAt) {
          void idbSaveDocument(doc).catch((error: unknown) => {
            reportError(`IndexedDB migration failed: ${errorMessage(error)}`);
          });
        }
      }

      cache = merged;
      writeLocal(merged);
    } catch (error) {
      backend = "localstorage";
      cache = local;
      reportError(
        `IndexedDB unavailable; using the localStorage fallback. ${errorMessage(error)}`,
      );
    } finally {
      hydrated = true;
      notify();
    }
  })();
  return hydration;
}

/** Wait for queued IndexedDB writes. Used by e2e/round-trip checks. */
export async function flushDocumentWrites(): Promise<void> {
  await hydrateDocuments();
  while (pending.size > 0) await Promise.all([...pending]);
}

export function listDocuments(): CadDocument[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDocument(projectId: string): CadDocument | null {
  return readAll()[projectId] ?? null;
}

export function saveDocument(doc: CadDocument): void {
  const map = readAll();
  map[doc.id] = doc;
  cache = map;
  writeLocal(map);
  if (hasIndexedDb()) queueIdbSave(doc);
}

export function deleteDocument(projectId: string): boolean {
  const map = readAll();
  if (!map[projectId]) return false;
  delete map[projectId];
  cache = map;
  writeLocal(map);
  if (hasIndexedDb()) queueIdbDelete(projectId);
  return true;
}

/**
 * The document for this project, created (and migrated) on first use.
 *
 * Migration: the first tab is seeded with the project's existing design blob,
 * so a project created before documents existed opens as one Part Studio with
 * its feature history intact — never an empty canvas.
 */
export function ensureDocument(project: {
  id: string;
  name: string;
  design?: {
    savedAt?: number;
    nodes?: unknown[];
    assets?: unknown[];
    ecad?: unknown;
  };
}): CadDocument {
  const existing = getDocument(project.id);
  if (existing) {
    const normalized = normalizeDocument(existing);
    if (normalized) {
      if (JSON.stringify(normalized) !== JSON.stringify(existing))
        saveDocument(normalized);
      return normalized;
    }
  }
  const doc = newDocument({
    projectId: project.id,
    name: project.name,
    seedDesign: designFromProject(project),
  });
  saveDocument(doc);
  return doc;
}

/** Test isolation: forget module-level caches without touching storage. */
export function __resetDocumentStoreForTests(): void {
  cache = null;
  hydration = null;
  hydrated = false;
  backend = "localstorage";
  lastError = null;
  pendingWrites = 0;
  pending.clear();
}
