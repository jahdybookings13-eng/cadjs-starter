import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  buildToolSearchIndex,
  searchTools,
  TOOL_SEARCH_OPEN_EVENT,
  type ToolSearchEntry,
} from "../model/toolSearch";

interface GlobalToolSearchProps {
  inSketch: boolean;
  /** Omit feature operations the live scene bus cannot dispatch. */
  availableOps?: ReadonlySet<string>;
  onRun: (entry: ToolSearchEntry) => void;
}

const KIND_LABEL: Record<ToolSearchEntry["kind"], string> = {
  mode: "Tool",
  op: "Feature",
  sketch: "Sketch",
  command: "Command",
};

export const GlobalToolSearch: React.FC<GlobalToolSearchProps> = ({
  inSketch,
  availableOps,
  onRun,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const entries = useMemo(
    () =>
      buildToolSearchIndex(
        availableOps ? { inSketch, availableOps } : { inSketch },
      ),
    [inSketch, availableOps],
  );
  const results = useMemo(() => searchTools(query, entries), [query, entries]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => restoreFocusRef.current?.focus());
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(TOOL_SEARCH_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(TOOL_SEARCH_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setQuery("");
    setActiveIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => restoreFocusRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last!.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first!.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) =>
      results.length === 0 ? 0 : Math.min(index, results.length - 1),
    );
  }, [results.length]);

  if (!open) return null;

  const run = (entry: ToolSearchEntry) => {
    setOpen(false);
    onRun(entry);
    requestAnimationFrame(() => restoreFocusRef.current?.focus());
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-search-title"
        data-testid="tool-search-dialog"
        className="cad-light-panel w-full max-w-xl overflow-hidden rounded-xl border border-[var(--cad-border-strong)] bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-gray-700 px-4 py-3">
          <svg
            aria-hidden="true"
            className="h-4 w-4 flex-none text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
            />
          </svg>
          <h2 id="tool-search-title" className="sr-only">
            Search tools and commands
          </h2>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="tool-search-results"
            aria-autocomplete="list"
            aria-activedescendant={
              results.length > 0
                ? `tool-search-option-${activeIndex}`
                : undefined
            }
            aria-label="Search tools and commands"
            aria-keyshortcuts="Control+K Meta+K"
            data-testid="tool-search-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) =>
                  results.length === 0 ? 0 : (index + 1) % results.length,
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) =>
                  results.length === 0
                    ? 0
                    : (index - 1 + results.length) % results.length,
                );
              } else if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                run(results[activeIndex]);
              }
            }}
            placeholder="Search tools, features and commands…"
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 placeholder:text-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close tool search"
            className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Esc
          </button>
        </div>

        <div
          id="tool-search-results"
          role="listbox"
          aria-label="Matching tools and commands"
          className="max-h-[55vh] overflow-y-auto p-2"
        >
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-300">
              No tools match “{query}”.
            </div>
          ) : (
            results.slice(0, 50).map((entry, index) => (
              <button
                key={`${entry.kind}:${entry.id}`}
                id={`tool-search-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                data-testid="tool-search-result"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => run(entry)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${
                  index === activeIndex ? "bg-blue-600" : "hover:bg-gray-800"
                }`}
              >
                <span
                  className={`mt-0.5 flex-none rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                    index === activeIndex
                      ? "bg-blue-500 text-white"
                      : "bg-gray-800 text-gray-300"
                  }`}
                >
                  {KIND_LABEL[entry.kind]}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-100">
                    {entry.label}
                  </span>
                  <span
                    className={`block truncate text-xs ${
                      index === activeIndex ? "text-blue-100" : "text-gray-400"
                    }`}
                  >
                    {entry.description}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-gray-700 px-4 py-2 text-[11px] text-gray-400">
          <span>↑↓ navigate · Enter run · Esc close</span>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};
