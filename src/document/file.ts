// src/document/file.ts — document-level export/import files.
//
// This is intentionally separate from the scene's .cadjs.json export: a
// document file carries every tab, the active tab and the project settings, so
// the Documents page can round-trip a whole local document.

import type { ProjectDoc } from "../project/model";
import {
  type CadDocument,
  designFromProject,
  newDocument,
  normalizeDocument,
} from "./model";

export const DOCUMENT_FILE_SCHEMA = "scadgen.document";
export const DOCUMENT_FILE_VERSION = 1;

export interface DocumentFile {
  schema: typeof DOCUMENT_FILE_SCHEMA;
  version: typeof DOCUMENT_FILE_VERSION;
  document: CadDocument;
  project?: ProjectDoc;
}

export function documentFilePayload(
  doc: CadDocument,
  project?: ProjectDoc | null,
): string {
  const file: DocumentFile = {
    schema: DOCUMENT_FILE_SCHEMA,
    version: DOCUMENT_FILE_VERSION,
    document: doc,
    ...(project ? { project } : {}),
  };
  return JSON.stringify(file, null, 2);
}

export interface ParsedDocumentFile {
  document: CadDocument;
  project: ProjectDoc | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Accept our document file, a bare CadDocument, or a legacy ProjectDoc
 * (v:1 + design) so an old local export is not a dead end.
 */
export function parseDocumentFile(text: string): ParsedDocumentFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Document file is not valid JSON.");
  }
  const wrapper = asRecord(raw);
  if (!wrapper) throw new Error("Document file is not an object.");

  const project = asRecord(wrapper.project) as unknown as ProjectDoc | null;
  const candidate =
    asRecord(wrapper.document) ??
    (Array.isArray(wrapper.tabs) ? wrapper : null);
  if (candidate) {
    const document = normalizeDocument(candidate);
    if (!document) throw new Error("Document file has no valid tabs.");
    return { document, project };
  }

  // Legacy ProjectDoc: its design blob becomes the first Part Studio.
  if (wrapper.v === 1 && wrapper.design) {
    const projectDoc = wrapper as unknown as ProjectDoc;
    const document = newDocument({
      projectId:
        typeof wrapper.id === "string" && wrapper.id
          ? wrapper.id
          : `prj_import_${Date.now().toString(36)}`,
      name:
        typeof wrapper.name === "string" && wrapper.name.trim()
          ? wrapper.name
          : "Imported project",
      seedDesign: designFromProject(projectDoc),
    });
    return { document, project: projectDoc };
  }

  throw new Error("Unsupported document file. Expected a ScadGen document.");
}

export function downloadTextFile(
  filename: string,
  text: string,
  type = "application/json",
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
  return cleaned || "document";
}

export function downloadDocumentFile(
  doc: CadDocument,
  project?: ProjectDoc | null,
): void {
  downloadTextFile(
    `${safeFilename(doc.name)}.cadjs-doc.json`,
    documentFilePayload(doc, project),
  );
}
