// src/document/model.ts — the persisted document/tab model.
//
// Onshape structures work as one document containing named tabs (Part Studio,
// Assembly, Drawing, ...). Before this module, ScadGen had a single implicit
// editor document; there was nowhere to persist "which Part Studio am I in".
//
// This module is pure: it owns the shape, the tab operations and migration
// from the old single-design project blob. Persistence lives in store.ts.
//
// Each tab carries its design as a serialized documentStore blob (the exact
// `scadgen.project.v1` JSON). That keeps tabs independent without inventing a
// second geometry format: switching a tab is serialize-active-tab, restore-
// target-tab, the same path a reload uses.

export const DOCUMENT_VERSION = 1 as const;

export type DocumentTabKind =
  | "partstudio"
  | "assembly"
  | "drawing"
  | "variablestudio"
  | "featurestudio";

export const DOCUMENT_TAB_KINDS: readonly DocumentTabKind[] = [
  "partstudio",
  "assembly",
  "drawing",
  "variablestudio",
  "featurestudio",
];

export const TAB_KIND_LABEL: Record<DocumentTabKind, string> = {
  partstudio: "Part Studio",
  assembly: "Assembly",
  drawing: "Drawing",
  variablestudio: "Variable Studio",
  featurestudio: "Feature Studio",
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

export function newDocumentTab(
  kind: DocumentTabKind = "partstudio",
  opts: { name?: string; design?: string; now?: number } = {},
): DocumentTab {
  const now = opts.now ?? Date.now();
  return {
    id: nextTabId(now),
    name: opts.name?.trim() || TAB_KIND_LABEL[kind],
    kind,
    design: opts.design ?? emptyDesign(now),
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
 * Remove a tab. Refuses to remove the last tab — a document always has at
 * least one Part Studio, matching Onshape's behaviour. If the removed tab was
 * active, the neighbour becomes active.
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
  };
}
