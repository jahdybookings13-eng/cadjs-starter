import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  browseDocuments,
  deleteDocument,
  documentKindLabel,
  duplicateDocumentAs,
  ensureDocument,
  getDocument,
  hydrateDocuments,
  listDocuments,
  normalizeDocument,
  renameDocument,
  restoreDocument,
  saveDocument,
  trashDocument,
  type CadDocument,
  type DocumentKindFilter,
  type DocumentScope,
  type DocumentSort,
} from "../document";
import {
  createProject,
  deleteProject,
  getActiveProjectId,
  getProject,
  listProjects,
  saveProject,
  setActiveProjectId,
  type ProjectDoc,
} from "../project";
import { downloadDocumentFile, parseDocumentFile } from "../document/file";
import { useToast } from "../contexts/ToastContext";

export interface DocumentsPageProps {
  currentProjectId: string;
  onClose: () => void;
  onOpen: (projectId: string) => void;
}

type Layout = "grid" | "list";
type NameDialog =
  | { mode: "create"; value: string }
  | { mode: "rename"; id: string; value: string }
  | null;

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SCOPE_LABEL: Record<DocumentScope, string> = {
  all: "All",
  recent: "Recent",
  trash: "Trash",
};

const DocumentsPage: React.FC<DocumentsPageProps> = ({
  currentProjectId,
  onClose,
  onOpen,
}) => {
  const { showToast } = useToast();
  const [docs, setDocs] = useState<CadDocument[]>([]);
  const [projects, setProjects] = useState<Record<string, ProjectDoc>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<DocumentScope>("all");
  const [kind, setKind] = useState<DocumentKindFilter>("all");
  const [sort, setSort] = useState<DocumentSort>("updated");
  const [layout, setLayout] = useState<Layout>("grid");
  const [dialog, setDialog] = useState<NameDialog>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    const projectList = listProjects();
    const map: Record<string, ProjectDoc> = {};
    for (const project of projectList) map[project.id] = project;
    const nextDocs = projectList.map(
      (project) => getDocument(project.id) ?? ensureDocument(project),
    );
    setProjects(map);
    setDocs(nextDocs);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void hydrateDocuments().then(() => {
      if (!cancelled) refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const filtered = useMemo(
    () =>
      browseDocuments(docs, {
        query,
        scope,
        kind,
        sort,
      }),
    [docs, query, scope, kind, sort],
  );

  const openDocument = useCallback(
    (id: string) => {
      setActiveProjectId(id);
      onOpen(id);
    },
    [onOpen],
  );

  const submitName = () => {
    if (!dialog) return;
    const name = dialog.value.trim();
    if (!name) return;
    try {
      if (dialog.mode === "create") {
        const project = createProject({ name });
        const doc = ensureDocument(project);
        saveDocument({ ...doc, name });
        saveProject({ ...project, name, updatedAt: Date.now() });
        setDialog(null);
        openDocument(project.id);
        return;
      }
      const doc = getDocument(dialog.id);
      if (!doc) {
        showToast("Document not found", "error");
        return;
      }
      saveDocument(renameDocument(doc, name));
      const project = getProject(dialog.id);
      if (project) {
        saveProject({ ...project, name, updatedAt: Date.now() });
      }
      setDialog(null);
      refresh();
      showToast("Document renamed", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const duplicate = (doc: CadDocument) => {
    try {
      const sourceProject = projects[doc.id];
      const copyName = `${doc.name} copy`;
      // Creating a project makes it active. Duplicating a card must not switch
      // the editor's open document behind the overlay; the user stays on the
      // document they had open (and a reload reopens that same one).
      const activeBefore = getActiveProjectId();
      const project = createProject({
        name: copyName,
        ...(sourceProject ? { settings: sourceProject.settings } : {}),
      });
      if (activeBefore) setActiveProjectId(activeBefore);
      const copy = duplicateDocumentAs(doc, {
        projectId: project.id,
        name: copyName,
      });
      saveDocument(copy);
      saveProject({ ...project, name: copyName, updatedAt: Date.now() });
      refresh();
      showToast(`Duplicated ${doc.name}`, "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const moveToTrash = (doc: CadDocument) => {
    try {
      saveDocument(trashDocument(doc));
      if (doc.id === currentProjectId) {
        const next = listDocuments().find(
          (candidate) => !candidate.trashedAt && candidate.id !== doc.id,
        );
        if (next) {
          setActiveProjectId(next.id);
          onOpen(next.id);
          return;
        }
        const project = createProject({ name: "Untitled" });
        ensureDocument(project);
        setActiveProjectId(project.id);
        onOpen(project.id);
        return;
      }
      refresh();
      showToast("Moved to trash", "info");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const restore = (doc: CadDocument) => {
    try {
      saveDocument(restoreDocument(doc));
      refresh();
      showToast("Document restored", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const deleteForever = (doc: CadDocument) => {
    try {
      deleteDocument(doc.id);
      deleteProject(doc.id);
      refresh();
      showToast("Document permanently deleted", "info");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const exportDocument = (doc: CadDocument) => {
    try {
      downloadDocumentFile(doc, projects[doc.id] ?? null);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const importDocument = async (file: File) => {
    setImporting(true);
    try {
      const parsed = parseDocumentFile(await file.text());
      const project = createProject({
        name: parsed.document.name,
        ...(parsed.project ? { settings: parsed.project.settings } : {}),
      });
      const imported = normalizeDocument({
        ...parsed.document,
        id: project.id,
        name: parsed.document.name,
      });
      if (!imported) throw new Error("Document has no valid tabs.");
      saveDocument(imported);
      saveProject({ ...project, name: imported.name, updatedAt: Date.now() });
      setActiveProjectId(project.id);
      showToast("Document imported", "success");
      openDocument(project.id);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const card = (doc: CadDocument) => {
    const trashed = Boolean(doc.trashedAt);
    const project = projects[doc.id];
    const isCurrent = doc.id === currentProjectId;
    return (
      <article
        key={doc.id}
        data-testid={`document-card-${doc.id}`}
        className={`group flex flex-col overflow-hidden rounded-lg border bg-gray-900 text-left ${
          isCurrent ? "border-blue-500" : "border-gray-700"
        }`}
      >
        <button
          type="button"
          aria-label={trashed ? `${doc.name} is in trash` : `Open ${doc.name}`}
          disabled={trashed}
          onClick={() => openDocument(doc.id)}
          className="relative block aspect-video w-full overflow-hidden bg-gray-800 text-left disabled:cursor-default"
        >
          {doc.thumbnail ? (
            <img
              src={doc.thumbnail}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[radial-gradient(circle_at_30%_20%,#1e3a5f,#111827)] text-gray-300">
              <span className="text-2xl font-semibold">
                {doc.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-gray-500">
                No preview yet
              </span>
            </div>
          )}
          {isCurrent && (
            <span className="absolute left-2 top-2 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Open
            </span>
          )}
          {trashed && (
            <span className="absolute right-2 top-2 rounded bg-amber-700 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Trash
            </span>
          )}
        </button>

        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-gray-100">
              {doc.name}
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {documentKindLabel(doc)} · {doc.tabs.length}{" "}
              {doc.tabs.length === 1 ? "tab" : "tabs"}
            </p>
            <p className="text-[11px] text-gray-500">
              {trashed ? "Deleted" : "Updated"} {formatDate(doc.updatedAt)}
            </p>
          </div>

          <div className="mt-auto flex flex-wrap gap-1.5">
            {!trashed && (
              <button
                type="button"
                onClick={() => openDocument(doc.id)}
                className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500"
              >
                Open
              </button>
            )}
            {trashed ? (
              <>
                <button
                  type="button"
                  onClick={() => restore(doc)}
                  className="rounded bg-green-700 px-2 py-1 text-[11px] text-white hover:bg-green-600"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => deleteForever(doc)}
                  className="rounded bg-red-800 px-2 py-1 text-[11px] text-white hover:bg-red-700"
                >
                  Delete forever
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setDialog({ mode: "rename", id: doc.id, value: doc.name })
                  }
                  className="rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-600"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => duplicate(doc)}
                  className="rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-600"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => exportDocument(doc)}
                  className="rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-600"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => moveToTrash(doc)}
                  className="rounded bg-red-900/70 px-2 py-1 text-[11px] text-red-100 hover:bg-red-800"
                >
                  Delete
                </button>
              </>
            )}
          </div>
          {project && (
            <p
              className="truncate text-[10px] text-gray-600"
              title={project.id}
            >
              {project.id}
            </p>
          )}
        </div>
      </article>
    );
  };

  return (
    <div
      data-testid="documents-page"
      className="fixed inset-0 z-[90] flex flex-col bg-gray-950 text-gray-100"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-800 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-gray-800 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700"
        >
          ← Back to editor
        </button>
        <h1 className="text-base font-semibold">Documents</h1>
        <span className="text-xs text-gray-500">local, on this machine</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="documents-new"
            onClick={() => setDialog({ mode: "create", value: "Untitled" })}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            New document
          </button>
          <button
            type="button"
            data-testid="documents-import"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
            className="rounded bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.cadjs-doc.json,.cadjs.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importDocument(file);
            }}
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 px-4 py-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents…"
          aria-label="Search documents"
          className="w-56 rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-blue-500"
        />
        <div className="flex overflow-hidden rounded border border-gray-700">
          {(Object.keys(SCOPE_LABEL) as DocumentScope[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              aria-label={`Show ${SCOPE_LABEL[value]}`}
              aria-pressed={scope === value}
              className={`px-2.5 py-1.5 text-xs ${
                scope === value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-900 text-gray-300 hover:bg-gray-800"
              }`}
            >
              {SCOPE_LABEL[value]}
            </button>
          ))}
        </div>
        <select
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as DocumentKindFilter)
          }
          aria-label="Filter by tab kind"
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200"
        >
          <option value="all">All kinds</option>
          <option value="partstudio">Part Studio</option>
          <option value="assembly">Assembly</option>
          <option value="drawing">Drawing</option>
          <option value="variablestudio">Variable Studio</option>
          <option value="featurestudio">Feature Studio</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as DocumentSort)}
          aria-label="Sort documents"
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200"
        >
          <option value="updated">Recently updated</option>
          <option value="name">Name A–Z</option>
          <option value="created">Oldest created</option>
        </select>
        <div className="ml-auto flex overflow-hidden rounded border border-gray-700">
          {(["grid", "list"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLayout(value)}
              aria-label={`${value} view`}
              aria-pressed={layout === value}
              className={`px-2.5 py-1.5 text-xs capitalize ${
                layout === value
                  ? "bg-gray-700 text-white"
                  : "bg-gray-900 text-gray-400 hover:bg-gray-800"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {loading ? (
          <p className="text-sm text-gray-500">Loading local documents…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded border border-dashed border-gray-800 p-8 text-center text-sm text-gray-500">
            {scope === "trash"
              ? "Trash is empty."
              : "No documents match. Create one or clear the filters."}
          </div>
        ) : (
          <div
            className={
              layout === "grid"
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                : "flex flex-col gap-2"
            }
          >
            {filtered.map(card)}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800 px-4 py-2 text-[11px] text-gray-500">
        {filtered.length} document{filtered.length === 1 ? "" : "s"} shown ·
        IndexedDB when available, localStorage fallback · full document files
        round-trip all tabs
      </footer>

      {dialog && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog.mode === "create" ? "New document" : "Rename document"
            }
            className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-2xl"
          >
            <h2 className="text-sm font-semibold text-gray-100">
              {dialog.mode === "create" ? "New document" : "Rename document"}
            </h2>
            <input
              autoFocus
              value={dialog.value}
              aria-label="Document name"
              onChange={(event) =>
                setDialog({ ...dialog, value: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") submitName();
                if (event.key === "Escape") setDialog(null);
              }}
              className="mt-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded bg-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitName}
                aria-label={
                  dialog.mode === "create"
                    ? "Create document"
                    : "Rename document"
                }
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                {dialog.mode === "create" ? "Create" : "Rename"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
