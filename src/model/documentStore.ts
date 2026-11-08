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
import { scadgenParts, type PartsSnapshot } from "./parts";
import type { Phase6State } from "./phase6";
import { scadgenPhase6 } from "./phase6Store";
import { scadgenPhase7Part, type Phase7PartState } from "../phase7/store";
import type { ScadgenFeatureNode } from "./onshapeHistory";
import { stableStringify } from "./stableJson";

const KEY = "scadgen.project.v1";

interface ProjectDoc {
  v: 1;
  savedAt: number;
  nodes: ScadgenFeatureNode[];
  /** Rollback bar position; absent in files saved before it was persisted. */
  rollbackIndex?: number | null;
  /** Parts, body names, materials, appearance and visibility state. */
  parts?: PartsSnapshot;
  assets: Array<Omit<ImportAsset, "bytes"> & { bytesB64: string }>;
  /** ECAD scene + firmware, when the project has one (ecad/persist.ts). */
  ecad?: unknown;
  /** Phase 6 rules, bend tables, frame profiles and materials. */
  phase6?: Phase6State;
  /** Phase 7 configuration tables, active row and non-destructive base. */
  phase7?: Phase7PartState;
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

function projectSnapshot(ecad?: unknown): ProjectDoc {
  const doc: ProjectDoc = {
    v: 1,
    savedAt: Date.now(),
    nodes: scadgenHistory.serializeNodes(),
    rollbackIndex: scadgenHistory.getRollbackIndex(),
    parts: scadgenParts.serialize(),
    phase6: scadgenPhase6.snapshot(),
    phase7: scadgenPhase7Part.snapshot(),
    // Asset Map order is insertion order, not memory order; sort so canonical
    // comparisons do not depend on which asset was loaded first.
    assets: allImportAssets()
      .map((a) => ({
        assetId: a.assetId,
        format: a.format,
        name: a.name,
        bytesB64: toB64(a.bytes),
      }))
      .sort((a, b) => a.assetId.localeCompare(b.assetId)),
  };
  // Only write the key when there is a scene, so CAD-only saves stay identical.
  if (ecad !== undefined) doc.ecad = ecad;
  return doc;
}

export function saveProject(ecad?: unknown): string {
  const text = JSON.stringify(projectSnapshot(ecad));
  try {
    localStorage.setItem(KEY, text);
  } catch {
    /* desk only: quota is not an error for the returned string */
  }
  return text;
}

/**
 * Byte-stable project text for acceptance comparisons. Same nodes, rollback,
 * parts and assets produce the same string regardless of save clock or object
 * key insertion order; `savedAt` is intentionally excluded.
 */
export function canonicalProjectJson(ecad?: unknown): string {
  const doc = projectSnapshot(ecad);
  const rest: Record<string, unknown> = { ...doc };
  delete rest.savedAt;
  return stableStringify(rest);
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
  scadgenHistory.restoreNodes(doc.nodes, doc.rollbackIndex ?? null);
  scadgenParts.restore(doc.parts ?? null);
  scadgenPhase6.restore(doc.phase6 ?? null);
  scadgenPhase7Part.restore(doc.phase7 ?? null);
  return doc.nodes.length;
}

export function hasStoredProject(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
