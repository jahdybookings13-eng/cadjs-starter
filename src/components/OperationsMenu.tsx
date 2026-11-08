import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  buildOperationsCatalog,
  countOperations,
  type OperationGroup,
} from "../model/operationsCatalog";

interface OperationsMenuProps {
  isLocked: boolean;
  availableOps?: ReadonlySet<string> | undefined;
  onRunOperation: (id: string) => void;
  hidden?: boolean;
}

const OperationsGlyph: React.FC = () => (
  <svg
    className="cad-tool-icon"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.7}
      d="M5 4h6v6H5V4Zm8 0h6v6h-6V4ZM5 14h6v6H5v-6Zm8 0h6v6h-6v-6Z"
    />
  </svg>
);

function filteredGroups(
  groups: OperationGroup[],
  query: string,
): OperationGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) => ({
      ...group,
      ops: group.ops.filter(
        (op) =>
          op.label.toLowerCase().includes(needle) ||
          op.id.toLowerCase().includes(needle) ||
          group.label.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.ops.length > 0);
}

export const OperationsMenu: React.FC<OperationsMenuProps> = ({
  isLocked,
  availableOps,
  onRunOperation,
  hidden = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const catalog = useMemo(
    () => buildOperationsCatalog(availableOps),
    [availableOps],
  );
  const groups = useMemo(
    () => filteredGroups(catalog, query),
    [catalog, query],
  );
  const total = countOperations(catalog);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const run = (id: string) => {
    setOpen(false);
    setQuery("");
    onRunOperation(id);
  };

  return (
    <div className="relative" ref={rootRef} hidden={hidden}>
      <button
        className="cad-tool"
        disabled={isLocked}
        data-testid="tool-operations"
        aria-label="Operations"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title="All features and operations"
      >
        <OperationsGlyph />
        <span className="cad-tool-label">Operations</span>
        <svg
          aria-hidden="true"
          className="cad-tool-caret"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="m7 10 5 5 5-5"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Feature operations"
          data-testid="operations-menu"
          className="absolute left-0 top-full z-50 mt-1 flex max-h-[min(76vh,640px)] w-[330px] flex-col overflow-hidden rounded-md border border-[var(--cad-border-strong)] bg-[var(--cad-chrome-raised)] shadow-2xl"
        >
          <div className="border-b border-[var(--cad-border)] p-2">
            <label className="sr-only" htmlFor="operations-search">
              Search operations
            </label>
            <input
              ref={searchRef}
              id="operations-search"
              data-testid="operations-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${total} operations…`}
              aria-label="Search operations"
              className="w-full rounded border border-[var(--cad-border)] bg-white px-2 py-1.5 text-xs text-[var(--cad-text)] placeholder:text-[var(--cad-text-faint)] focus:border-[var(--cad-accent)] focus:outline-none"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {groups.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[var(--cad-text-muted)]">
                {catalog.length === 0
                  ? "Loading live operations…"
                  : `No operation matches “${query.trim()}”.`}
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.id} role="group" aria-label={group.label}>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--cad-text-muted)]">
                    {group.label}
                  </div>
                  {group.ops.map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      role="menuitem"
                      aria-label={op.label}
                      data-testid={`operation-${op.id}`}
                      title={op.note ?? op.label}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)] focus:bg-[var(--cad-chrome-hover)] focus:outline-none"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => run(op.id)}
                    >
                      <span className="truncate">{op.label}</span>
                      <span className="flex-none text-[9px] uppercase tracking-wide text-[var(--cad-text-faint)]">
                        {op.featureType ?? ""}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--cad-border)] px-3 py-1.5 text-[10px] text-[var(--cad-text-muted)]">
            <span>{total} live operations</span>
            <span>Esc to close</span>
          </div>
        </div>
      )}
    </div>
  );
};
