/*
 * Project persistence: the whole document is the feature node list (every
 * parameter, sketch snapshot, and appearance lives on the nodes) plus the
 * import-asset bytes. localStorage is the desk store; saveProject/loadProject
 * are pure string<->state so files, cloud, and paste all reuse them.
 */
import {
  allImportAssets,
  clearImportAssets,
  restoreImportAsset,
  type ImportAsset,
} from "./assets";
import { scadgenHistory } from "./featureEngine";
import type { ScadgenFeatureNode } from "./onshapeHistory";

const KEY = "scadgen.project.v1";

interface ProjectDoc {
  v: 1;
  savedAt: number;
  nodes: ScadgenFeatureNode[];
  assets: Array<Omit<ImportAsset, "bytes"> & { bytesB64: string }>;
}

function toB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function saveProject(): string {
  const doc: ProjectDoc = {
    v: 1,
    savedAt: Date.now(),
    nodes: scadgenHistory.serializeNodes(),
    assets: allImportAssets().map((a) => ({
      assetId: a.assetId,
      format: a.format,
      name: a.name,
      bytesB64: toB64(a.bytes),
    })),
  };
  const text = JSON.stringify(doc);
  try {
    localStorage.setItem(KEY, text);
  } catch {
    /* desk only: quota is not an error for the returned string */
  }
  return text;
}

export function loadProject(text?: string): number {
  const src = text ?? localStorage.getItem(KEY) ?? "";
  if (!src) return 0;
  const doc = JSON.parse(src) as ProjectDoc;
  if (doc.v !== 1 || !Array.isArray(doc.nodes))
    throw new Error("documentStore: unsupported project file");
  clearImportAssets();
  for (const a of doc.assets ?? [])
    restoreImportAsset({
      assetId: a.assetId,
      format: a.format,
      name: a.name,
      bytes: fromB64(a.bytesB64),
    });
  scadgenHistory.restoreNodes(doc.nodes);
  return doc.nodes.length;
}

export function hasStoredProject(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
