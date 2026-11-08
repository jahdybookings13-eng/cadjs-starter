// src/document/model.ts — the persisted document/tab model.
//
// Onshape structures work as one document containing named tabs (Part Studio,
// Assembly, Drawing, ...). Before this module, ScadGen had a single implicit
// editor document; there was nowhere to persist "which Part Studio am I in".
//
// This module is pure: it owns the shape, the tab operations and migration
// from the old single-design project blob. Persistence lives in store.ts.
//
// Each Part Studio tab carries its design as a serialized documentStore blob
// (the exact `scadgen.project.v1` JSON). Assembly and Drawing tabs carry their
// own small payloads instead; they reference a source Part Studio and do not
// pretend to be geometry documents.

import { emptyAssemblyTab } from "../assemblies/document";
import { emptyDrawingTab } from "../drawings/model";
import { emptyPhase7TabDesign } from "../phase7/store";
import { camStudioTabDesign, emptyCamDocument } from "../cam/model";
import { emptyRenderDocument, renderStudioTabDesign } from "../render/model";
import {
  emptySimulationDocument,
  simulationStudioTabDesign,
} from "../sim/model";
import { emptyPcbStudio, pcbStudioTabDesign } from "../pcb/empty";

export const DOCUMENT_VERSION = 1 as const;

export type DocumentTabKind =
  | "partstudio"
  | "assembly"
  | "drawing"
  | "variablestudio"
  | "featurestudio"
  | "renderstudio"
  | "simulationstudio"
  | "camstudio"
  | "pcbstudio";

export const DOCUMENT_TAB_KINDS: readonly DocumentTabKind[] = [
  "partstudio",
  "assembly",
  "drawing",
  "variablestudio",
  "featurestudio",
  "renderstudio",
  "simulationstudio",
  "camstudio",
  "pcbstudio",
];

export const TAB_KIND_LABEL: Record<DocumentTabKind, string> = {
  partstudio: "Part Studio",
  assembly: "Assembly",
  drawing: "Drawing",
  variablestudio: "Variable Studio",
  featurestudio: "Feature Studio",
  renderstudio: "Render Studio",
  simulationstudio: "Simulation Studio",
  camstudio: "CAM Studio",
  pcbstudio: "ScadStudio:pcb",
};

export interface DocumentTab {
  id: string;
  name: string;
  kind: DocumentTabKind;
  /** Serialized design (documentStore.ProjectDoc JSON). Never undefined. */
  design: string;
  createdAt: number;
  updatedAt: number;
}

export interface CadDocument {
  v: typeof DOCUMENT_VERSION;
  /** The project id this document belongs to (the share-link path param). */
  id: string;
  name: string;
  tabs: DocumentTab[];
  activeTabId: string;
  updatedAt: number;
  /** Small canvas preview captured before opening the Documents page. */
  thumbnail?: string;
  /** Set while the document is in the local trash (removed from the list). */
  trashedAt?: number;
}

let tabSeq = 0;

export function nextTabId(now = Date.now()): string {
  tabSeq += 1;
  return `tab_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}${tabSeq}`;
}

/** An empty design in the same schema documentStore.loadProject accepts. */
export function emptyDesign(now = Date.now()): string {
  return JSON.stringify({
    v: 1,
    savedAt: now,
    nodes: [],
    assets: [],
  });
}

function emptyDesignForKind(kind: DocumentTabKind, now: number): string {
  if (kind === "assembly") return JSON.stringify(emptyAssemblyTab(""));
  if (kind === "drawing") return JSON.stringify(emptyDrawingTab("", null));
  if (kind === "variablestudio" || kind === "featurestudio")
    return emptyPhase7TabDesign(kind);
  if (kind === "camstudio") return camStudioTabDesign(emptyCamDocument());
  if (kind === "renderstudio")
    return renderStudioTabDesign(emptyRenderDocument());
  if (kind === "simulationstudio")
    return simulationStudioTabDesign(emptySimulationDocument());
  if (kind === "pcbstudio") return pcbStudioTabDesign(emptyPcbStudio());
  return emptyDesign(now);
}

export function newDocumentTab(
  kind: DocumentTabKind = "partstudio",
  opts: { name?: string; design?: string; now?: number } = {},
): DocumentTab {
  const now = opts.now ?? Date.now();
  return {
    id: nextTabId(now),
    name: opts.name?.trim() || TAB_KIND_LABEL[kind],
    kind,
    design: opts.design ?? emptyDesignForKind(kind, now),
    createdAt: now,
    updatedAt: now,
  };
}

export function newDocument(opts: {
  projectId: string;
  name?: string;
  /** Design for the first Part Studio tab (migration / seed). */
  seedDesign?: string;
  now?: number;
}): CadDocument {
  const now = opts.now ?? Date.now();
  const first = newDocumentTab("partstudio", {
    design: opts.seedDesign ?? emptyDesign(now),
    now,
  });
  return {
    v: DOCUMENT_VERSION,
    id: opts.projectId,
    name: opts.name?.trim() || "Untitled",
    tabs: [first],
    activeTabId: first.id,
    updatedAt: now,
  };
}

/**
 * The old project model kept one design directly on ProjectDoc. It is the same
 * shape documentStore writes, so migration is a re-serialization, not a
 * geometry rewrite.
 */
export function designFromProject(project: {
  design?: {
    savedAt?: number;
    nodes?: unknown[];
    assets?: unknown[];
    ecad?: unknown;
  };
}): string {
  const design = project.design ?? {};
  const doc: Record<string, unknown> = {
    v: 1,
    savedAt: design.savedAt ?? Date.now(),
    nodes: design.nodes ?? [],
    assets: design.assets ?? [],
  };
  if (design.ecad !== undefined) doc.ecad = design.ecad;
  return JSON.stringify(doc);
}

export function findTab(doc: CadDocument, tabId: string): DocumentTab | null {
  return doc.tabs.find((t) => t.id === tabId) ?? null;
}

export function activeTab(doc: CadDocument): DocumentTab | null {
  return findTab(doc, doc.activeTabId) ?? doc.tabs[0] ?? null;
}

export function setActiveTab(doc: CadDocument, tabId: string): CadDocument {
  if (!findTab(doc, tabId) || doc.activeTabId === tabId) return doc;
  return { ...doc, activeTabId: tabId, updatedAt: Date.now() };
}

/** Append a tab and make it active (Onshape opens what you just created). */
export function addTab(doc: CadDocument, tab: DocumentTab): CadDocument {
  if (findTab(doc, tab.id)) return doc;
  return {
    ...doc,
    tabs: [...doc.tabs, tab],
    activeTabId: tab.id,
    updatedAt: Date.now(),
  };
}

export function renameTab(
  doc: CadDocument,
  tabId: string,
  name: string,
): CadDocument {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  const target = findTab(doc, tabId);
  if (!target || target.name === trimmed) return doc;
  return {
    ...doc,
    tabs: doc.tabs.map((t) =>
      t.id === tabId ? { ...t, name: trimmed, updatedAt: Date.now() } : t,
    ),
    updatedAt: Date.now(),
  };
}

export function duplicateTab(
  doc: CadDocument,
  tabId: string,
): { document: CadDocument; tab: DocumentTab } | null {
  const source = findTab(doc, tabId);
  if (!source) return null;
  const now = Date.now();
  const copy: DocumentTab = {
    ...source,
    id: nextTabId(now),
    name: uniqueTabName(doc, source.name),
    createdAt: now,
    updatedAt: now,
  };
  const at = doc.tabs.findIndex((t) => t.id === tabId);
  const tabs = [...doc.tabs];
  tabs.splice(at + 1, 0, copy);
  return {
    tab: copy,
    document: {
      ...doc,
      tabs,
      activeTabId: copy.id,
      updatedAt: now,
    },
  };
}

function uniqueTabName(doc: CadDocument, base: string): string {
  const taken = new Set(doc.tabs.map((t) => t.name));
  let candidate = `${base} copy`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base} copy ${n}`;
    n += 1;
  }
  return candidate;
}

export function moveTab(
  doc: CadDocument,
  tabId: string,
  toIndex: number,
): CadDocument {
  const from = doc.tabs.findIndex((t) => t.id === tabId);
  if (from === -1) return doc;
  const clamped = Math.max(0, Math.min(doc.tabs.length - 1, toIndex));
  if (from === clamped) return doc;
  const tabs = [...doc.tabs];
  const [tab] = tabs.splice(from, 1);
  if (!tab) return doc;
  tabs.splice(clamped, 0, tab);
  return { ...doc, tabs, updatedAt: Date.now() };
}

/**
 * Remove a tab. Refuses to remove the last tab. If the removed tab was active,
 * the neighbour becomes active.
 */
export function deleteTab(doc: CadDocument, tabId: string): CadDocument | null {
  if (doc.tabs.length <= 1) return null;
  const index = doc.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return null;
  const tabs = doc.tabs.filter((t) => t.id !== tabId);
  const active =
    doc.activeTabId === tabId
      ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? tabs[0]!.id)
      : doc.activeTabId;
  return { ...doc, tabs, activeTabId: active, updatedAt: Date.now() };
}

export function writeTabDesign(
  doc: CadDocument,
  tabId: string,
  design: string,
  now = Date.now(),
): CadDocument {
  if (!findTab(doc, tabId)) return doc;
  return {
    ...doc,
    tabs: doc.tabs.map((t) =>
      t.id === tabId ? { ...t, design, updatedAt: now } : t,
    ),
    updatedAt: now,
  };
}

export function renameDocument(
  doc: CadDocument,
  name: string,
  now = Date.now(),
): CadDocument {
  const trimmed = name.trim();
  if (!trimmed || trimmed === doc.name) return doc;
  return { ...doc, name: trimmed, updatedAt: now };
}

export function trashDocument(doc: CadDocument, now = Date.now()): CadDocument {
  if (doc.trashedAt) return doc;
  return { ...doc, trashedAt: now, updatedAt: now };
}

export function restoreDocument(
  doc: CadDocument,
  now = Date.now(),
): CadDocument {
  if (!doc.trashedAt) return doc;
  const next = { ...doc, updatedAt: now };
  delete next.trashedAt;
  return next;
}

export function setDocumentThumbnail(
  doc: CadDocument,
  thumbnail: string,
  now = Date.now(),
): CadDocument {
  if (!thumbnail.startsWith("data:image/") || thumbnail.length > 1_500_000)
    return doc;
  return { ...doc, thumbnail, updatedAt: now };
}

/**
 * Copy a document under a new project id, regenerating every tab id so the
 * copy can be edited independently. The design payloads are immutable strings
 * at this layer and are shared intentionally; writes always replace a tab.
 */
export function duplicateDocumentAs(
  doc: CadDocument,
  opts: { projectId: string; name?: string; now?: number },
): CadDocument {
  const now = opts.now ?? Date.now();
  const idMap = new Map<string, string>();
  const tabs = doc.tabs.map((tab) => {
    const id = nextTabId(now);
    idMap.set(tab.id, id);
    return {
      ...tab,
      id,
      createdAt: now,
      updatedAt: now,
      design: tab.design,
    };
  });
  const activeTabId = idMap.get(doc.activeTabId) ?? tabs[0]!.id;
  const next: CadDocument = {
    ...doc,
    id: opts.projectId,
    name: opts.name?.trim() || doc.name,
    tabs,
    activeTabId,
    updatedAt: now,
  };
  delete next.trashedAt;
  return next;
}

/** Duplicate several tabs in one document operation. Unknown ids are ignored. */
export function duplicateTabs(
  doc: CadDocument,
  tabIds: readonly string[],
): { document: CadDocument; tabs: DocumentTab[] } {
  let next = doc;
  const tabs: DocumentTab[] = [];
  for (const tabId of tabIds) {
    const result = duplicateTab(next, tabId);
    if (!result) continue;
    next = result.document;
    tabs.push(result.tab);
  }
  return { document: next, tabs };
}

/** Delete several tabs, activating the nearest surviving tab when necessary. */
export function deleteTabs(
  doc: CadDocument,
  tabIds: readonly string[],
  now = Date.now(),
): CadDocument | null {
  const ids = new Set(tabIds);
  if (ids.size === 0) return doc;
  const tabs = doc.tabs.filter((tab) => !ids.has(tab.id));
  if (tabs.length === 0) return null;
  const firstRemoved = doc.tabs.findIndex((tab) => ids.has(tab.id));
  const activeTabId = ids.has(doc.activeTabId)
    ? tabs[Math.min(Math.max(firstRemoved, 0), tabs.length - 1)]!.id
    : doc.activeTabId;
  return { ...doc, tabs, activeTabId, updatedAt: now };
}

export interface DocumentUsageAsset {
  assetId: string;
  name: string;
  format: string;
  tabs: string[];
}

export interface DocumentUsage {
  assets: DocumentUsageAsset[];
  nodeCount: number;
  tabBytes: number;
  parseErrors: string[];
}

/** Where-used report: which tabs carry each imported asset, plus document size. */
export function documentUsage(doc: CadDocument): DocumentUsage {
  const assets = new Map<string, DocumentUsageAsset>();
  const parseErrors: string[] = [];
  let nodeCount = 0;
  let tabBytes = 0;

  for (const tab of doc.tabs) {
    tabBytes += new TextEncoder().encode(tab.design).length;
    try {
      const design = JSON.parse(tab.design) as {
        nodes?: unknown[];
        assets?: Array<{ assetId?: string; name?: string; format?: string }>;
      };
      nodeCount += Array.isArray(design.nodes) ? design.nodes.length : 0;
      for (const asset of design.assets ?? []) {
        if (typeof asset.assetId !== "string" || !asset.assetId) continue;
        const existing = assets.get(asset.assetId) ?? {
          assetId: asset.assetId,
          name: asset.name ?? asset.assetId,
          format: asset.format ?? "asset",
          tabs: [],
        };
        if (!existing.tabs.includes(tab.name)) existing.tabs.push(tab.name);
        assets.set(asset.assetId, existing);
      }
    } catch {
      parseErrors.push(`${tab.name}: corrupt design`);
    }
  }

  return {
    assets: [...assets.values()].sort((a, b) => a.name.localeCompare(b.name)),
    nodeCount,
    tabBytes,
    parseErrors,
  };
}

/**
 * Repair anything read from storage. Tabs are user data, so repair is
 * conservative: keep every valid tab, drop duplicates, restore a missing
 * active tab, and only synthesize a Part Studio when there is genuinely
 * nothing left.
 */
export function normalizeDocument(raw: unknown): CadDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Partial<CadDocument>;
  if (typeof input.id !== "string" || !input.id) return null;
  if (input.v !== DOCUMENT_VERSION) return null;

  const seen = new Set<string>();
  const tabs: DocumentTab[] = [];
  for (const candidate of Array.isArray(input.tabs) ? input.tabs : []) {
    if (!candidate || typeof candidate !== "object") continue;
    const t = candidate as Partial<DocumentTab>;
    if (typeof t.id !== "string" || !t.id || seen.has(t.id)) continue;
    const kind = DOCUMENT_TAB_KINDS.includes(t.kind as DocumentTabKind)
      ? (t.kind as DocumentTabKind)
      : "partstudio";
    seen.add(t.id);
    tabs.push({
      id: t.id,
      kind,
      name:
        typeof t.name === "string" && t.name.trim()
          ? t.name.trim()
          : TAB_KIND_LABEL[kind],
      design: typeof t.design === "string" ? t.design : emptyDesign(),
      createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
      updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
    });
  }

  const now = Date.now();
  if (tabs.length === 0) {
    tabs.push(newDocumentTab("partstudio", { now }));
  }
  const activeTabId =
    typeof input.activeTabId === "string" &&
    tabs.some((t) => t.id === input.activeTabId)
      ? input.activeTabId
      : tabs[0]!.id;

  return {
    v: DOCUMENT_VERSION,
    id: input.id,
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : "Untitled",
    tabs,
    activeTabId,
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : now,
    ...(typeof input.thumbnail === "string" &&
    input.thumbnail.startsWith("data:image/") &&
    input.thumbnail.length <= 1_500_000
      ? { thumbnail: input.thumbnail }
      : {}),
    ...(typeof input.trashedAt === "number" && input.trashedAt > 0
      ? { trashedAt: input.trashedAt }
      : {}),
  };
}
