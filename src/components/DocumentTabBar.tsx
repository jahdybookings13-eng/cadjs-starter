import React, { useEffect, useRef, useState } from "react";
import {
  DOCUMENT_TAB_KINDS,
  TAB_KIND_LABEL,
  type CadDocument,
  type DocumentTab,
  type DocumentTabKind,
} from "../document";

export interface DocumentTabBarProps {
  doc: CadDocument;
  /** View-only share: tabs can be opened, not changed. */
  readOnly?: boolean;
  /** Mid-sketch / pending operation: switching would discard the operation. */
  busy?: boolean;
  onSelect: (tabId: string) => void;
  onCreate: (kind: DocumentTabKind) => void;
  onRename: (tabId: string, name: string) => void;
  onDuplicate: (tabId: string) => void;
  onMove: (tabId: string, toIndex: number) => void;
  onDelete: (tabId: string) => void;
}

/**
 * The document tab manager. Every control maps to a real document operation in
 * src/document/model.ts; kinds this build cannot author yet are listed but
 * disabled with a stated reason, never rendered as a working-looking button.
 */
export const DocumentTabBar: React.FC<DocumentTabBarProps> = ({
  doc,
  readOnly = false,
  busy = false,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onMove,
  onDelete,
}) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const locked = readOnly || busy;
  const menuIndex = menuFor ? doc.tabs.findIndex((t) => t.id === menuFor) : -1;
  const menuTab = menuIndex >= 0 ? doc.tabs[menuIndex]! : null;
  const visibleTabs = query.trim()
    ? doc.tabs.filter((tab) =>
        tab.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : doc.tabs;

  useEffect(() => {
    if (!createOpen && !menuFor) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setCreateOpen(false);
        setMenuFor(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [createOpen, menuFor]);

  const beginRename = (tab: DocumentTab) => {
    if (locked) return;
    setMenuFor(null);
    setRenaming(tab.id);
    setDraft(tab.name);
  };

  const commitRename = () => {
    if (renaming) onRename(renaming, draft);
    setRenaming(null);
    setDraft("");
  };

  const create = (kind: DocumentTabKind) => {
    if (locked) return;
    setCreateOpen(false);
    onCreate(kind);
  };

  return (
    <div
      ref={rootRef}
      className="relative flex-none flex items-stretch bg-gray-900 border-b border-gray-700 h-9 text-xs z-40"
      data-testid="document-tabs"
    >
      <div className="flex items-center gap-2 px-3 border-r border-gray-700 min-w-0">
        <span className="text-gray-500 hidden sm:inline">Document</span>
        <span
          className="text-gray-200 font-medium truncate max-w-[120px] sm:max-w-[180px]"
          title={doc.name}
        >
          {doc.name}
        </span>
        <span className="text-gray-500 hidden md:inline">
          {doc.tabs.length} {doc.tabs.length === 1 ? "tab" : "tabs"}
        </span>
        <div className="relative flex items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find tab"
            aria-label="Search tabs"
            data-testid="document-tab-search"
            className="w-20 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-200 outline-none focus:border-blue-500 lg:w-24"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear tab search"
              className="absolute right-0.5 rounded px-1 text-[10px] text-gray-500 hover:text-gray-200"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Document tabs"
        className="flex items-stretch overflow-x-auto min-w-0"
      >
        {visibleTabs.map((tab) => {
          const isActive = tab.id === doc.activeTabId;
          const isRenaming = renaming === tab.id;
          const tabIndex = doc.tabs.findIndex((item) => item.id === tab.id);
          return (
            <div
              key={tab.id}
              className={`relative flex items-stretch border-r border-gray-800 ${
                dragId === tab.id ? "opacity-50" : ""
              }`}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={draft}
                  aria-label={`Rename ${tab.name}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") {
                      setRenaming(null);
                      setDraft("");
                    }
                  }}
                  className="w-32 px-3 bg-gray-800 text-gray-100 outline-none border-t-2 border-blue-500"
                />
              ) : (
                <button
                  role="tab"
                  aria-selected={isActive}
                  title={`${TAB_KIND_LABEL[tab.kind]} — ${tab.name}`}
                  data-testid={`document-tab-${tab.id}`}
                  disabled={busy && !isActive}
                  draggable={!locked}
                  onDragStart={() => setDragId(tab.id)}
                  onDragOver={(event) => {
                    if (dragId && dragId !== tab.id) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragId && dragId !== tab.id) onMove(dragId, tabIndex);
                    setDragId(null);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                      return;
                    event.preventDefault();
                    const direction = event.key === "ArrowLeft" ? -1 : 1;
                    if (event.altKey) {
                      onMove(tab.id, tabIndex + direction);
                      return;
                    }
                    const next = doc.tabs[tabIndex + direction];
                    if (next) onSelect(next.id);
                  }}
                  onClick={() => {
                    if (isActive) return;
                    onSelect(tab.id);
                  }}
                  onDoubleClick={() => beginRename(tab)}
                  className={`px-3 flex items-center gap-2 border-t-2 whitespace-nowrap ${
                    isActive
                      ? "bg-gray-800 text-gray-100 border-blue-500"
                      : "text-gray-400 border-transparent hover:bg-gray-800/60 hover:text-gray-200 disabled:opacity-40 disabled:hover:bg-transparent"
                  }`}
                >
                  <span>{tab.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">
                    {tab.kind === "partstudio"
                      ? "PS"
                      : TAB_KIND_LABEL[tab.kind]
                          .split(" ")
                          .map((w) => w[0])
                          .join("")}
                  </span>
                </button>
              )}

              {isActive && !isRenaming && (
                <button
                  aria-label={`Tab actions for ${tab.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menuFor === tab.id}
                  data-testid="document-tab-menu"
                  onClick={() =>
                    setMenuFor((current) =>
                      current === tab.id ? null : tab.id,
                    )
                  }
                  className="px-1.5 text-gray-500 hover:text-gray-200 bg-gray-800"
                >
                  ⋯
                </button>
              )}
            </div>
          );
        })}
        {visibleTabs.length === 0 && (
          <span className="flex items-center px-3 text-[11px] text-gray-500">
            No tabs match
          </span>
        )}
      </div>

      {/* Rendered outside the scrolling tab strip so the menu is never clipped
          by it. Anchored to the bar, not to an individual tab. */}
      {menuTab && (
        <div
          role="menu"
          className="absolute top-full right-14 mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg py-1 z-50 min-w-[190px]"
        >
          <MenuItem
            label="Rename"
            disabled={locked}
            onClick={() => beginRename(menuTab)}
          />
          <MenuItem
            label="Duplicate"
            disabled={locked}
            onClick={() => {
              setMenuFor(null);
              onDuplicate(menuTab.id);
            }}
          />
          <MenuItem
            label="Move left"
            disabled={locked || menuIndex === 0}
            onClick={() => {
              setMenuFor(null);
              onMove(menuTab.id, menuIndex - 1);
            }}
          />
          <MenuItem
            label="Move right"
            disabled={locked || menuIndex === doc.tabs.length - 1}
            onClick={() => {
              setMenuFor(null);
              onMove(menuTab.id, menuIndex + 1);
            }}
          />
          <div className="border-t border-gray-600 my-1" />
          <MenuItem
            label="Delete"
            disabled={locked || doc.tabs.length <= 1}
            onClick={() => {
              setMenuFor(null);
              onDelete(menuTab.id);
            }}
          />
        </div>
      )}

      <div className="relative flex items-center px-2">
        <button
          aria-label="Create tab"
          aria-haspopup="menu"
          aria-expanded={createOpen}
          title={
            readOnly
              ? "View-only: cannot create tabs"
              : busy
                ? "Finish the current operation before creating a tab"
                : "Create a tab"
          }
          disabled={locked}
          data-testid="document-tab-add"
          onClick={() => setCreateOpen((v) => !v)}
          className="w-6 h-6 rounded text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
        >
          +
        </button>
        {createOpen && (
          <div
            role="menu"
            className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg py-1 z-50 min-w-[240px]"
          >
            {DOCUMENT_TAB_KINDS.map((kind) => {
              const enabled = kind === "partstudio";
              return (
                <button
                  key={kind}
                  role="menuitem"
                  disabled={!enabled}
                  data-testid={`document-tab-create-${kind}`}
                  onClick={() => enabled && create(kind)}
                  title={
                    enabled
                      ? "Create a Part Studio tab"
                      : `${TAB_KIND_LABEL[kind]} tabs are not implemented yet — see ONSHAPE_PARITY.md`
                  }
                  className={`w-full px-3 py-1.5 text-left flex items-center justify-between gap-3 ${
                    enabled
                      ? "text-gray-200 hover:bg-gray-700"
                      : "text-gray-500 cursor-not-allowed"
                  }`}
                >
                  <span>{TAB_KIND_LABEL[kind]}</span>
                  {!enabled && (
                    <span className="text-[10px] uppercase tracking-wide">
                      Planned
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const MenuItem: React.FC<{
  label: string;
  disabled: boolean;
  onClick: () => void;
}> = ({ label, disabled, onClick }) => (
  <button
    role="menuitem"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={`w-full px-3 py-1.5 text-left ${
      disabled
        ? "text-gray-500 cursor-not-allowed"
        : "text-gray-200 hover:bg-gray-700"
    }`}
  >
    {label}
  </button>
);

export default DocumentTabBar;
