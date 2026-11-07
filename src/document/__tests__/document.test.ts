import { describe, it, expect, beforeEach } from "vitest";

// Node test env has no localStorage; stub it before store.ts touches it.
if (
  typeof globalThis.localStorage === "undefined" ||
  globalThis.localStorage === null
) {
  const mem = new Map<string, string>();
  const store = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: store,
    configurable: true,
  });
}

import {
  activeTab,
  addTab,
  deleteTab,
  designFromProject,
  duplicateTab,
  emptyDesign,
  findTab,
  moveTab,
  newDocument,
  newDocumentTab,
  normalizeDocument,
  renameTab,
  setActiveTab,
  writeTabDesign,
} from "../model";
import {
  DOCUMENTS_KEY,
  __resetDocumentStoreForTests,
  ensureDocument,
  getDocument,
  listDocuments,
  saveDocument,
} from "../store";

beforeEach(() => {
  localStorage.clear();
  __resetDocumentStoreForTests();
});

describe("document model", () => {
  it("creates a document with one active Part Studio tab", () => {
    const doc = newDocument({ projectId: "prj_1", name: "Bracket" });
    expect(doc.name).toBe("Bracket");
    expect(doc.tabs).toHaveLength(1);
    expect(doc.tabs[0]!.kind).toBe("partstudio");
    expect(doc.tabs[0]!.name).toBe("Part Studio");
    expect(doc.activeTabId).toBe(doc.tabs[0]!.id);
    expect(activeTab(doc)?.id).toBe(doc.tabs[0]!.id);
  });

  it("adds, renames and duplicates tabs, activating the new tab", () => {
    const doc = newDocument({ projectId: "prj_1" });
    const sketch = newDocumentTab("partstudio", { name: "Housing" });
    const added = addTab(doc, sketch);
    expect(added.activeTabId).toBe(sketch.id);

    const renamed = renameTab(added, sketch.id, "  Housing v2  ");
    expect(findTab(renamed, sketch.id)?.name).toBe("Housing v2");
    // Blank names are refused rather than producing an unnamed tab.
    expect(renameTab(renamed, sketch.id, "   ")).toBe(renamed);

    const dup = duplicateTab(renamed, sketch.id);
    expect(dup).not.toBeNull();
    expect(dup!.document.tabs).toHaveLength(3);
    expect(dup!.tab.name).toBe("Housing v2 copy");
    expect(dup!.document.activeTabId).toBe(dup!.tab.id);
    expect(findTab(dup!.document, dup!.tab.id)?.design).toBe(
      findTab(renamed, sketch.id)?.design,
    );
  });

  it("moves tabs without changing the active tab", () => {
    const doc = newDocument({ projectId: "prj_1" });
    const a = doc.tabs[0]!;
    const b = newDocumentTab("partstudio", { name: "B" });
    const c = newDocumentTab("partstudio", { name: "C" });
    const three = addTab(addTab(doc, b), c);
    expect(three.activeTabId).toBe(c.id);

    const moved = moveTab(three, a.id, 2);
    expect(moved.tabs.map((t) => t.name)).toEqual(["B", "C", "Part Studio"]);
    expect(moved.activeTabId).toBe(c.id);

    // Out-of-range indices clamp instead of throwing.
    expect(moveTab(three, a.id, 99).tabs.at(-1)?.id).toBe(a.id);
  });

  it("deletes tabs and activates a neighbour, but never the last tab", () => {
    const doc = newDocument({ projectId: "prj_1" });
    const b = newDocumentTab("partstudio", { name: "B" });
    const two = addTab(doc, b);

    const afterDelete = deleteTab(two, b.id);
    expect(afterDelete).not.toBeNull();
    expect(afterDelete!.tabs).toHaveLength(1);
    expect(afterDelete!.activeTabId).toBe(doc.tabs[0]!.id);

    expect(deleteTab(afterDelete!, afterDelete!.tabs[0]!.id)).toBeNull();
    expect(deleteTab(two, "missing")).toBeNull();
  });

  it("writes a tab's design without disturbing other tabs", () => {
    const doc = newDocument({ projectId: "prj_1" });
    const other = newDocumentTab("partstudio", { name: "Other" });
    const two = addTab(doc, other);
    const design = JSON.stringify({ v: 1, savedAt: 5, nodes: [], assets: [] });

    const next = writeTabDesign(two, doc.tabs[0]!.id, design, 42);
    expect(findTab(next, doc.tabs[0]!.id)).toMatchObject({
      design,
      updatedAt: 42,
    });
    // Editing an unknown tab is a no-op, not a crash.
    expect(writeTabDesign(two, "missing", design)).toBe(two);
  });

  it("normalizes corrupted storage instead of losing every tab", () => {
    const now = 1000;
    const normalized = normalizeDocument({
      v: 1,
      id: "prj_1",
      name: "  ",
      tabs: [
        { id: "a", kind: "partstudio", name: "", design: "{}" },
        { id: "a", kind: "partstudio", name: "duplicate id" },
        { id: "b", kind: "nonsense", name: "Bad kind" },
        null,
      ],
      activeTabId: "gone",
      updatedAt: now,
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.name).toBe("Untitled");
    expect(normalized!.tabs.map((t) => t.id)).toEqual(["a", "b"]);
    expect(normalized!.tabs[0]!.name).toBe("Part Studio");
    expect(normalized!.tabs[1]!.kind).toBe("partstudio");
    expect(normalized!.activeTabId).toBe("a");
  });

  it("rejects documents that cannot be repaired", () => {
    expect(normalizeDocument(null)).toBeNull();
    expect(normalizeDocument({ v: 2, id: "x", tabs: [] })).toBeNull();
    expect(normalizeDocument({ v: 1, tabs: [] })).toBeNull();
  });
});

describe("document store", () => {
  it("round-trips a document keyed by project id", () => {
    const doc = newDocument({ projectId: "prj_1", name: "Bracket" });
    saveDocument(doc);
    expect(getDocument("prj_1")?.name).toBe("Bracket");
    expect(listDocuments()).toHaveLength(1);
    expect(getDocument("prj_missing")).toBeNull();
  });

  it("migrates the project's existing design into the first Part Studio", () => {
    const design = {
      savedAt: 7,
      nodes: [{ featureId: "f1" }, { featureId: "f2" }],
      assets: [{ assetId: "a1" }],
    };
    const doc = ensureDocument({ id: "prj_1", name: "Legacy", design });
    expect(doc.tabs).toHaveLength(1);
    expect(JSON.parse(doc.tabs[0]!.design)).toMatchObject({
      v: 1,
      savedAt: 7,
      nodes: [{ featureId: "f1" }, { featureId: "f2" }],
      assets: [{ assetId: "a1" }],
    });

    const parsed = JSON.parse(designFromProject({ design }));
    expect(parsed.ecad).toBeUndefined();
    // ECAD data rides along with the design, not in a separate tab store.
    expect(
      JSON.parse(designFromProject({ design: { ...design, ecad: { x: 1 } } })),
    ).toMatchObject({ ecad: { x: 1 } });
  });

  it("reopens the same document and keeps later tab edits", () => {
    const first = ensureDocument({ id: "prj_1", name: "Bracket" });
    const tab = newDocumentTab("partstudio", { name: "Second" });
    const edited = writeTabDesign(
      addTab(first, tab),
      first.tabs[0]!.id,
      emptyDesign(1),
      2,
    );
    saveDocument(edited);

    const reopened = ensureDocument({ id: "prj_1", name: "ignored" });
    expect(reopened.activeTabId).toBe(tab.id);
    expect(reopened.tabs.map((t) => t.name)).toEqual(["Part Studio", "Second"]);
    expect(reopened.tabs[0]!.design).toBe(emptyDesign(1));
  });

  it("repairs a corrupted entry on read", () => {
    localStorage.setItem(
      DOCUMENTS_KEY,
      JSON.stringify({
        prj_1: {
          v: 1,
          id: "wrong",
          name: "Broken",
          tabs: [],
          activeTabId: "x",
        },
      }),
    );
    const doc = ensureDocument({ id: "prj_1", name: "Bracket" });
    expect(doc.id).toBe("prj_1");
    expect(doc.tabs).toHaveLength(1);
    expect(activeTab(doc)).not.toBeNull();
  });

  it("survives a malformed store without throwing", () => {
    localStorage.setItem(DOCUMENTS_KEY, "{not json");
    expect(listDocuments()).toEqual([]);
    const doc = ensureDocument({ id: "prj_1", name: "Bracket" });
    expect(doc.tabs).toHaveLength(1);
  });

  it("does not let setActiveTab accept an unknown tab", () => {
    const doc = newDocument({ projectId: "prj_1" });
    expect(setActiveTab(doc, "missing")).toBe(doc);
  });
});
