// src/document/store.ts — localStorage persistence for documents and tabs.
//
// One key holds every document, keyed by project id, so opening a project is a
// single read and tabs survive a reload. This is deliberately the same seam as
// src/project/store.ts: a backend swap changes this file, not the UI.

import {
  type CadDocument,
  designFromProject,
  newDocument,
  normalizeDocument,
} from "./model";

export const DOCUMENTS_KEY = "scadgen.documents.v1";

type DocumentMap = Record<string, CadDocument>;

function readAll(): DocumentMap {
  try {
    const raw = localStorage.getItem(DOCUMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: DocumentMap = {};
    for (const [projectId, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const doc = normalizeDocument(value);
      // A stored doc whose id disagrees with its key is corruption, not a
      // second document; trust the key and repair the id.
      if (doc) out[projectId] = { ...doc, id: projectId };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(map: DocumentMap): void {
  try {
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(map));
  } catch {
    /* quota — the in-memory copy stays authoritative for this session */
  }
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
  writeAll(map);
}

export function deleteDocument(projectId: string): boolean {
  const map = readAll();
  if (!map[projectId]) return false;
  delete map[projectId];
  writeAll(map);
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
    // Persist repairs (missing active tab, duplicate ids) once, so every later
    // read sees the same document.
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
