import { describe, it, expect, beforeEach } from "vitest";

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
  DOCUMENTS_KEY,
  browseDocuments,
  deleteTabs,
  documentUsage,
  duplicateDocumentAs,
  duplicateTabs,
  hydrateDocuments,
  listDocuments,
  newDocument,
  newDocumentTab,
  normalizeDocument,
  restoreDocument,
  saveDocument,
  setDocumentThumbnail,
  trashDocument,
  writeTabDesign,
  getDocumentStorageStatus,
  __resetDocumentStoreForTests,
} from "..";
import {
  MAX_SNAPSHOTS,
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  pruneSnapshots,
  restoreSnapshot,
} from "../snapshots";
import { documentFilePayload, parseDocumentFile } from "../file";

const assetDesign = JSON.stringify({
  v: 1,
  savedAt: 1,
  nodes: [{ featureId: "f1" }, { featureId: "f2" }],
  assets: [
    { assetId: "asset_1", name: "bracket.stl", format: "stl" },
    { assetId: "asset_2", format: "step" },
  ],
});

function baseDoc() {
  return newDocument({ projectId: "prj_phase1", name: "Bracket" });
}

beforeEach(() => {
  localStorage.clear();
  __resetDocumentStoreForTests();
});

describe("Phase 1 document model", () => {
  it("keeps thumbnails and trash state through normalization", () => {
    const thumb = "data:image/jpeg;base64,AAAA";
    const doc = setDocumentThumbnail(baseDoc(), thumb);
    const trashed = trashDocument(doc, 123);
    const normalized = normalizeDocument(trashed)!;
    expect(normalized.thumbnail).toBe(thumb);
    expect(normalized.trashedAt).toBe(123);
    expect(restoreDocument(normalized).trashedAt).toBeUndefined();
    expect(
      normalizeDocument({ ...normalized, thumbnail: "javascript:alert(1)" })!
        .thumbnail,
    ).toBeUndefined();
  });

  it("duplicates a document with fresh tab ids and no trash flag", () => {
    const doc = trashDocument(baseDoc());
    const second = newDocumentTab("partstudio", { name: "Second" });
    const withTab = {
      ...doc,
      tabs: [...doc.tabs, second],
      activeTabId: second.id,
    };
    const copy = duplicateDocumentAs(withTab, {
      projectId: "prj_copy",
      name: "Bracket copy",
    });
    expect(copy.id).toBe("prj_copy");
    expect(copy.name).toBe("Bracket copy");
    expect(copy.trashedAt).toBeUndefined();
    expect(copy.tabs).toHaveLength(2);
    expect(copy.tabs[0]!.id).not.toBe(withTab.tabs[0]!.id);
    expect(copy.activeTabId).toBe(copy.tabs[1]!.id);
    expect(copy.tabs[0]!.design).toBe(withTab.tabs[0]!.design);
  });

  it("bulk-duplicates and bulk-deletes tabs without deleting the last one", () => {
    const doc = baseDoc();
    const second = newDocumentTab("partstudio", { name: "Second" });
    const third = newDocumentTab("partstudio", { name: "Third" });
    const withTabs = {
      ...doc,
      tabs: [...doc.tabs, second, third],
      activeTabId: second.id,
    };

    const duplicated = duplicateTabs(withTabs, [second.id, third.id]);
    expect(duplicated.tabs).toHaveLength(2);
    expect(duplicated.document.tabs).toHaveLength(5);
    expect(duplicated.tabs.map((tab) => tab.name)).toEqual([
      "Second copy",
      "Third copy",
    ]);

    const deleted = deleteTabs(withTabs, [second.id, third.id]);
    expect(deleted).not.toBeNull();
    expect(deleted!.tabs).toHaveLength(1);
    expect(deleted!.activeTabId).toBe(doc.tabs[0]!.id);

    expect(
      deleteTabs(
        withTabs,
        withTabs.tabs.map((tab) => tab.id),
      ),
    ).toBeNull();
  });

  it("reports where-used assets and document size", () => {
    const doc = baseDoc();
    const withAsset = writeTabDesign(doc, doc.tabs[0]!.id, assetDesign);
    const usage = documentUsage(withAsset);
    expect(usage.nodeCount).toBe(2);
    expect(usage.tabBytes).toBeGreaterThan(0);
    expect(usage.assets).toHaveLength(2);
    expect(
      usage.assets.find((asset) => asset.assetId === "asset_1"),
    ).toMatchObject({
      name: "bracket.stl",
      tabs: ["Part Studio"],
    });
  });
});

describe("Phase 1 browse rules", () => {
  it("filters trash, search, kind and recent; sorts by name and update", () => {
    const now = 10_000_000;
    const old = {
      ...baseDoc(),
      id: "old",
      name: "Old",
      updatedAt: now - 20 * 24 * 60 * 60 * 1000,
    };
    const newer = {
      ...baseDoc(),
      id: "new",
      name: "New",
      updatedAt: now,
    };
    const trashed = {
      ...baseDoc(),
      id: "trash",
      name: "Gone",
      trashedAt: now,
      updatedAt: now,
    };
    const docs = [old, newer, trashed];

    expect(browseDocuments(docs, { now }).map((d) => d.id)).toEqual([
      "new",
      "old",
    ]);
    expect(
      browseDocuments(docs, { now, scope: "recent" }).map((d) => d.id),
    ).toEqual(["new"]);
    expect(
      browseDocuments(docs, { now, scope: "trash" }).map((d) => d.id),
    ).toEqual(["trash"]);
    expect(
      browseDocuments(docs, { now, query: "old" }).map((d) => d.id),
    ).toEqual(["old"]);
    expect(
      browseDocuments(docs, { now, sort: "name" }).map((d) => d.name),
    ).toEqual(["New", "Old"]);
    expect(
      browseDocuments(docs, { now, kind: "partstudio" }).map((d) => d.id),
    ).toEqual(["new", "old"]);
  });
});

describe("Phase 1 local snapshots", () => {
  it("creates, restores, deletes and caps named snapshots", () => {
    const doc = baseDoc();
    const first = createSnapshot(doc, "empty", 100);
    expect(listSnapshots(doc.id)).toHaveLength(1);
    expect(first.name).toBe("empty");
    expect(restoreSnapshot(doc.id, first.id)?.tabs).toHaveLength(1);
    expect(deleteSnapshot(doc.id, first.id)).toBe(true);
    expect(deleteSnapshot(doc.id, first.id)).toBe(false);

    for (let i = 0; i < MAX_SNAPSHOTS + 2; i += 1) {
      createSnapshot(doc, `snap ${i}`, 200 + i);
    }
    expect(listSnapshots(doc.id)).toHaveLength(MAX_SNAPSHOTS);
    expect(pruneSnapshots(doc.id, 2)).toBe(MAX_SNAPSHOTS - 2);
    expect(listSnapshots(doc.id)).toHaveLength(2);
  });

  it("refuses a corrupt snapshot instead of replacing the document", () => {
    const doc = baseDoc();
    const snap = createSnapshot(doc, "bad", 500);
    // A corrupt stored blob is rejected by normalizeDocument on restore.
    const raw = JSON.parse(
      localStorage.getItem("scadgen.snapshots.v1") ?? "{}",
    ) as Record<string, Array<{ id: string; doc: unknown }>>;
    raw[doc.id] = [{ ...snap, doc: { v: 99 } }];
    localStorage.setItem("scadgen.snapshots.v1", JSON.stringify(raw));
    expect(restoreSnapshot(doc.id, snap.id)).toBeNull();
  });
});

describe("Phase 1 document files", () => {
  it("round-trips a document file and accepts a bare document", () => {
    const source = baseDoc();
    const doc = writeTabDesign(source, source.tabs[0]!.id, assetDesign);
    const payload = documentFilePayload(doc);
    const parsed = parseDocumentFile(payload);
    expect(parsed.document.id).toBe(doc.id);
    expect(parsed.document.tabs[0]!.design).toBe(doc.tabs[0]!.design);
    expect(parseDocumentFile(JSON.stringify(doc)).document.name).toBe(
      "Bracket",
    );
  });

  it("migrates a legacy ProjectDoc export into one Part Studio", () => {
    const parsed = parseDocumentFile(
      JSON.stringify({
        v: 1,
        id: "legacy",
        name: "Legacy",
        design: {
          savedAt: 1,
          nodes: [{ featureId: "f1" }],
          assets: [],
        },
      }),
    );
    expect(parsed.document.name).toBe("Legacy");
    expect(parsed.document.tabs[0]!.name).toBe("Part Studio");
    expect(JSON.parse(parsed.document.tabs[0]!.design).nodes).toHaveLength(1);
  });

  it("rejects malformed files", () => {
    expect(() => parseDocumentFile("{nope")).toThrow(/valid JSON/);
    expect(() => parseDocumentFile('{"v":2}')).toThrow(/Unsupported/);
  });
});

describe("Phase 1 storage hydration", () => {
  it("hydrates to the localStorage fallback when IndexedDB is absent", async () => {
    await hydrateDocuments();
    const status = getDocumentStorageStatus();
    expect(status.hydrated).toBe(true);
    expect(status.backend).toBe("localstorage");
  });

  it("survives a corrupt localStorage mirror instead of crashing", async () => {
    localStorage.setItem(DOCUMENTS_KEY, "{not-json");
    __resetDocumentStoreForTests();
    await hydrateDocuments();
    expect(listDocuments()).toEqual([]);
    expect(getDocumentStorageStatus().hydrated).toBe(true);
  });

  it("surfaces a failed localStorage write and keeps the last good save", () => {
    const doc = baseDoc();
    saveDocument(doc);
    const lastGoodSave = localStorage.getItem(DOCUMENTS_KEY);

    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      if (key === DOCUMENTS_KEY) throw new Error("QuotaExceededError");
      originalSetItem(key, value);
    };
    const changed = { ...doc, name: "Changed in memory" };
    try {
      expect(() => saveDocument(changed)).not.toThrow();
      expect(listDocuments().find((item) => item.id === doc.id)?.name).toBe(
        changed.name,
      );
    } finally {
      localStorage.setItem = originalSetItem;
    }
    expect(getDocumentStorageStatus().lastError).toMatch(
      /full or unavailable/i,
    );
    expect(localStorage.getItem(DOCUMENTS_KEY)).toBe(lastGoodSave);
  });
});
