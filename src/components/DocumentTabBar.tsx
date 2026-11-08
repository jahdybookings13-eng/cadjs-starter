import React, { useEffect, useRef, useState } from "react";
import {
  DOCUMENT_TAB_KINDS,
  TAB_KIND_LABEL,
  type CadDocument,
  type DocumentTab,
  type DocumentTabKind,
} from "../document";
import { tabKindDisabledReason } from "../document/studios";

function TabGlyph({ kind }: { kind: DocumentTabKind }) {
  const common = {
    className: "h-3.5 w-3.5 flex-none",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  } as const;

  switch (kind) {
    case "assembly":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="8" height="7" rx="1" strokeWidth={1.6} />
          <rect x="13" y="13" width="8" height="7" rx="1" strokeWidth={1.6} />
          <path strokeWidth={1.6} d="M11 7.5h4v9h-2" />
        </svg>
      );
    case "drawing":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="1.5" strokeWidth={1.6} />
          <path strokeWidth={1.6} d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case "featurestudio":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="m8 7-4 5 4 5M16 7l4 5-4 5M13.5 5l-3 14"
          />
        </svg>
      );
    case "variablestudio":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeWidth={1.7}
            d="m7 8 10 8M17 8 7 16"
          />
        </svg>
      );
    case "partstudio":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v9m8-4.5-8 4.5m-8-4.5 8 4.5m0 9v-9"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="1.5" strokeWidth={1.6} />
          <path strokeWidth={1.6} d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
  }
}

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
  onOpenTabManager?: (() => void) | undefined;
}

/**
 * The document tab manager. Every control maps to a real document operation in
 * src/document/model.ts. Part Studio, Assembly, Drawing, Variable Studio and
 * Feature Studio all have authorable workspaces.
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
  onOpenTabManager,
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
    if (locked || tabKindDisabledReason(kind)) return;
    setCreateOpen(false);
    onCreate(kind);
  };

  return (
    <div
      ref={rootRef}
      className="cad-tabbar relative z-40 flex h-9 flex-none items-stretch border-t text-xs"
      data-testid="document-tabs"
    >
      <div
        role="tablist"
        aria-label="Document tabs"
        className="order-2 flex min-w-0 flex-1 items-stretch overflow-x-auto"
      >
        {visibleTabs.map((tab) => {
          const isActive = tab.id === doc.activeTabId;
          const isRenaming = renaming === tab.id;
          const tabIndex = doc.tabs.findIndex((item) => item.id === tab.id);
          return (
            <div
              key={tab.id}
              className={`group relative flex items-stretch border-r border-[var(--cad-border)] ${
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
                  className="w-32 border-t-2 border-[var(--cad-accent)] bg-white px-3 text-[var(--cad-text)] outline-none"
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
                  className={`cad-tab flex items-center gap-2 whitespace-nowrap px-3 text-[12px] ${
                    isActive
                      ? ""
                      : "disabled:opacity-40 disabled:hover:bg-transparent"
                  }`}
                >
                  <TabGlyph kind={tab.kind} />
                  <span>{tab.name}</span>
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
                  className="bg-[var(--cad-chrome-raised)] px-1.5 text-[var(--cad-text-faint)] opacity-0 transition-opacity hover:text-[var(--cad-text)] group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ⋯
                </button>
              )}
            </div>
          );
        })}
        {visibleTabs.length === 0 && (
          <span className="flex items-center px-3 text-[11px] text-[var(--cad-text-faint)]">
            No tabs match
          </span>
        )}
      </div>

      {/* Rendered outside the scrolling tab strip so the menu is never clipped
          by it. Anchored to the bar, not to an individual tab. */}
      {menuTab && (
        <div
          role="menu"
          className="absolute bottom-full right-28 z-50 mb-1 min-w-[190px] rounded-md border border-[var(--cad-border-strong)] bg-[var(--cad-chrome-raised)] py-1 shadow-xl"
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
          <div className="my-1 border-t border-[var(--cad-border)]" />
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

      <div className="order-first relative flex items-center pl-1.5 pr-1">
        {onOpenTabManager && (
          <button
            type="button"
            aria-label="Tab manager"
            title="Tab manager"
            data-testid="document-tab-manager"
            onClick={onOpenTabManager}
            className="cad-icon-button !h-6 !min-w-6 !px-0"
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <rect
                x="4"
                y="4"
                width="16"
                height="16"
                rx="1.5"
                strokeWidth={1.7}
              />
              <path strokeWidth={1.7} d="M9 4v16M9 9h11M9 15h11" />
            </svg>
          </button>
        )}
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
          className="cad-icon-button !h-6 !min-w-6 !px-0 text-base leading-none"
        >
          +
        </button>
        {createOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-0 z-50 mb-1 min-w-[240px] rounded-md border border-[var(--cad-border-strong)] bg-[var(--cad-chrome-raised)] py-1 shadow-xl"
          >
            {DOCUMENT_TAB_KINDS.map((kind) => {
              const disabledReason = tabKindDisabledReason(kind);
              return (
                <button
                  key={kind}
                  role="menuitem"
                  data-testid={`document-tab-create-${kind}`}
                  disabled={Boolean(disabledReason)}
                  onClick={() => create(kind)}
                  title={
                    disabledReason ?? `Create a ${TAB_KIND_LABEL[kind]} tab`
                  }
                  className={`w-full px-3 py-1.5 text-left ${
                    disabledReason
                      ? "cursor-not-allowed text-[var(--cad-text-faint)]"
                      : "text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
                  }`}
                >
                  <span>{TAB_KIND_LABEL[kind]}</span>
                  {disabledReason && (
                    <span className="mt-0.5 block text-[10px] text-[var(--cad-text-faint)]">
                      {disabledReason}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <label className="order-3 relative flex flex-none items-center border-l border-[var(--cad-border)] px-2">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-[var(--cad-text-faint)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
          />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find tab"
          aria-label="Search tabs"
          data-testid="document-tab-search"
          className="h-6 w-24 rounded border border-[var(--cad-border)] bg-white pl-7 pr-5 text-[11px] text-[var(--cad-text)] outline-none placeholder:text-[var(--cad-text-faint)] focus:border-[var(--cad-accent)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear tab search"
            className="absolute right-2 rounded px-1 text-[10px] text-[var(--cad-text-faint)] hover:text-[var(--cad-text)]"
          >
            ×
          </button>
        )}
      </label>
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
        ? "cursor-not-allowed text-[var(--cad-text-faint)]"
        : "text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
    }`}
  >
    {label}
  </button>
);

export default DocumentTabBar;
