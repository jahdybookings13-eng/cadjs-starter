import React, { useEffect, useMemo, useState } from "react";
import {
  normalizeDocument,
  type CadDocument,
  type DocumentTab,
} from "../document";
import { documentUsage } from "../document/model";
import type { DocumentStorageStatus } from "../document/store";
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  type DocumentSnapshot,
} from "../document/snapshots";
import { useToast } from "../contexts/ToastContext";

export interface DocumentPanelProps {
  doc: CadDocument;
  projectId: string;
  projectName: string;
  dirty: boolean;
  storage: DocumentStorageStatus;
  onClose: () => void;
  onRenameDocument: (name: string) => void;
  onSelectTab: (tabId: string) => void;
  onMoveTab: (tabId: string, toIndex: number) => void;
  onDuplicateTabs: (tabIds: string[]) => void;
  onDeleteTabs: (tabIds: string[]) => void;
  onRestoreSnapshot: (snapshot: DocumentSnapshot) => void;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="border-b border-gray-800 px-3 py-3">
    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
      {title}
    </h3>
    {children}
  </section>
);

const DocumentPanel: React.FC<DocumentPanelProps> = ({
  doc,
  projectId,
  projectName,
  dirty,
  storage,
  onClose,
  onRenameDocument,
  onSelectTab,
  onMoveTab,
  onDuplicateTabs,
  onDeleteTabs,
  onRestoreSnapshot,
}) => {
  const { showToast } = useToast();
  const [tabQuery, setTabQuery] = useState("");
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set());
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[]>([]);
  const [docName, setDocName] = useState(doc.name);

  useEffect(() => setDocName(doc.name), [doc.name]);
  useEffect(() => {
    setSnapshots(listSnapshots(doc.id));
    setSelectedTabs(new Set());
  }, [doc.id]);

  const usage = useMemo(() => documentUsage(doc), [doc]);
  const tabs = useMemo(
    () =>
      doc.tabs.filter((tab) =>
        tab.name.toLowerCase().includes(tabQuery.trim().toLowerCase()),
      ),
    [doc.tabs, tabQuery],
  );

  const toggleSelected = (tabId: string) => {
    setSelectedTabs((current) => {
      const next = new Set(current);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };

  const commitDocumentName = () => {
    const trimmed = docName.trim();
    if (!trimmed || trimmed === doc.name) {
      setDocName(doc.name);
      return;
    }
    onRenameDocument(trimmed);
  };

  const create = () => {
    try {
      const snapshot = createSnapshot(doc, snapshotName);
      setSnapshotName("");
      setSnapshots(listSnapshots(doc.id));
      showToast(`Snapshot “${snapshot.name}” created`, "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const remove = (snapshot: DocumentSnapshot) => {
    try {
      deleteSnapshot(doc.id, snapshot.id);
      setSnapshots(listSnapshots(doc.id));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const restore = (snapshot: DocumentSnapshot) => {
    const restored = normalizeDocument(snapshot.doc);
    if (!restored) {
      showToast("Snapshot is corrupt", "error");
      return;
    }
    onRestoreSnapshot(snapshot);
  };

  const duplicateSelected = () => {
    const ids = [...selectedTabs];
    if (ids.length === 0) return;
    onDuplicateTabs(ids);
    setSelectedTabs(new Set());
  };

  const deleteSelected = () => {
    const ids = [...selectedTabs];
    if (ids.length === 0) return;
    if (doc.tabs.length - ids.length < 1) {
      showToast("A document must keep at least one tab", "warning");
      return;
    }
    onDeleteTabs(ids);
    setSelectedTabs(new Set());
  };

  const row = (tab: DocumentTab) => {
    const index = doc.tabs.findIndex((item) => item.id === tab.id);
    return (
      <div
        key={tab.id}
        className={`flex items-center gap-1 rounded px-1 py-1 ${
          tab.id === doc.activeTabId ? "bg-blue-900/40" : "hover:bg-gray-800"
        }`}
      >
        <input
          type="checkbox"
          checked={selectedTabs.has(tab.id)}
          onChange={() => toggleSelected(tab.id)}
          aria-label={`Select ${tab.name}`}
          className="h-3 w-3"
        />
        <button
          type="button"
          onClick={() => onSelectTab(tab.id)}
          className="min-w-0 flex-1 truncate text-left text-xs text-gray-200"
          title={tab.name}
        >
          {tab.name}
        </button>
        <button
          type="button"
          aria-label={`Move ${tab.name} left`}
          disabled={index === 0}
          onClick={() => onMoveTab(tab.id, index - 1)}
          className="rounded px-1 text-[11px] text-gray-400 hover:bg-gray-700 disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${tab.name} right`}
          disabled={index === doc.tabs.length - 1}
          onClick={() => onMoveTab(tab.id, index + 1)}
          className="rounded px-1 text-[11px] text-gray-400 hover:bg-gray-700 disabled:opacity-30"
        >
          ↓
        </button>
      </div>
    );
  };

  return (
    <aside
      data-testid="document-panel"
      className="absolute right-0 top-0 z-40 flex h-full w-80 max-w-[90vw] flex-col border-l border-gray-700 bg-gray-900/97 text-gray-200 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Document</div>
          <div className="truncate text-[10px] text-gray-500">
            {projectName}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close document panel"
          className="rounded px-2 py-1 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Properties">
          <label className="block text-[11px] text-gray-500">
            Name
            <input
              value={docName}
              aria-label="Document name"
              onChange={(event) => setDocName(event.target.value)}
              onBlur={commitDocumentName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setDocName(doc.name);
                  event.currentTarget.blur();
                }
              }}
              className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500"
            />
          </label>
          <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
            <dt className="text-gray-500">Project</dt>
            <dd className="truncate font-mono text-gray-300" title={projectId}>
              {projectId}
            </dd>
            <dt className="text-gray-500">Tabs</dt>
            <dd>{doc.tabs.length}</dd>
            <dt className="text-gray-500">Active</dt>
            <dd className="truncate">
              {doc.tabs.find((tab) => tab.id === doc.activeTabId)?.name ?? "—"}
            </dd>
            <dt className="text-gray-500">Updated</dt>
            <dd>{formatDate(doc.updatedAt)}</dd>
            <dt className="text-gray-500">Save state</dt>
            <dd className={dirty ? "text-amber-300" : "text-green-400"}>
              {dirty ? "Unsaved" : "Saved"}
            </dd>
            <dt className="text-gray-500">Storage</dt>
            <dd>
              {storage.backend === "indexeddb" ? "IndexedDB" : "localStorage"}
              {storage.pendingWrites > 0
                ? ` · ${storage.pendingWrites} pending`
                : ""}
            </dd>
          </dl>
          {storage.lastError && (
            <p className="mt-2 rounded bg-red-900/40 px-2 py-1 text-[10px] text-red-200">
              {storage.lastError}
            </p>
          )}
        </Section>

        <Section title={`Tabs (${doc.tabs.length})`}>
          <div className="mb-2 flex gap-1">
            <input
              value={tabQuery}
              onChange={(event) => setTabQuery(event.target.value)}
              placeholder="Find tab…"
              aria-label="Find tab"
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={duplicateSelected}
              disabled={selectedTabs.size === 0}
              className="rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-200 hover:bg-gray-600 disabled:opacity-40"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={selectedTabs.size === 0}
              className="rounded bg-red-900/70 px-2 py-1 text-[10px] text-red-100 hover:bg-red-800 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
          {selectedTabs.size > 0 && (
            <p className="mb-1 text-[10px] text-blue-300">
              {selectedTabs.size} selected
            </p>
          )}
          <div className="space-y-0.5">{tabs.map(row)}</div>
          {tabs.length === 0 && (
            <p className="py-2 text-[11px] text-gray-500">No tabs match.</p>
          )}
        </Section>

        <Section title="Named snapshots">
          <div className="flex gap-1">
            <input
              value={snapshotName}
              onChange={(event) => setSnapshotName(event.target.value)}
              placeholder="Snapshot name (optional)"
              aria-label="Snapshot name"
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={create}
              className="rounded bg-blue-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-blue-500"
            >
              Create
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-500">
            Separate from undo · newest 20 kept
          </p>
          <div className="mt-2 space-y-1">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="flex items-center gap-1 rounded bg-gray-800/60 px-1.5 py-1"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] text-gray-200">
                    {snapshot.name}
                  </div>
                  <div className="text-[9px] text-gray-500">
                    {formatDate(snapshot.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Restore ${snapshot.name}`}
                  onClick={() => restore(snapshot)}
                  className="rounded px-1 text-[10px] text-blue-300 hover:bg-gray-700"
                >
                  Restore
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${snapshot.name}`}
                  onClick={() => remove(snapshot)}
                  className="rounded px-1 text-[10px] text-red-300 hover:bg-gray-700"
                >
                  ×
                </button>
              </div>
            ))}
            {snapshots.length === 0 && (
              <p className="text-[11px] text-gray-500">No snapshots yet.</p>
            )}
          </div>
        </Section>

        <Section title="Where used">
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
            <dt className="text-gray-500">Features</dt>
            <dd>{usage.nodeCount}</dd>
            <dt className="text-gray-500">Design size</dt>
            <dd>{bytesLabel(usage.tabBytes)}</dd>
            <dt className="text-gray-500">Assets</dt>
            <dd>{usage.assets.length}</dd>
          </dl>
          <div className="mt-2 space-y-1">
            {usage.assets.map((asset) => (
              <div
                key={asset.assetId}
                className="rounded bg-gray-800/60 px-2 py-1"
              >
                <div className="truncate text-[11px] text-gray-200">
                  {asset.name}{" "}
                  <span className="text-gray-500">({asset.format})</span>
                </div>
                <div className="text-[10px] text-gray-500">
                  Used in: {asset.tabs.join(", ")}
                </div>
              </div>
            ))}
            {usage.assets.length === 0 && (
              <p className="text-[11px] text-gray-500">
                No imported assets in this document.
              </p>
            )}
          </div>
          {usage.parseErrors.length > 0 && (
            <p className="mt-2 text-[10px] text-red-300">
              {usage.parseErrors.join(" · ")}
            </p>
          )}
        </Section>
      </div>
    </aside>
  );
};

export default DocumentPanel;
