import React, { FC, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SKETCH_GROUPS,
  SKETCH_PALETTE_COMMANDS,
  searchSketchCommands,
  type SketchCommand,
  type SketchCommandAvailability,
} from "../model/sketchControls";

interface SketchCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onRun: (command: SketchCommand) => void;
  availability: (command: SketchCommand) => SketchCommandAvailability;
}

/**
 * Keyboard-first command palette for sketch mode. Every command in the
 * registry is searchable by name, key, AutoCAD alias or cadjs id, so the
 * full 2D surface is reachable without hunting through the toolbar.
 */
const SketchCommandPalette: FC<SketchCommandPaletteProps> = ({
  open,
  onClose,
  onRun,
  availability,
}) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () => searchSketchCommands(query, SKETCH_PALETTE_COMMANDS),
    [query],
  );
  const safeIndex =
    visible.length === 0 ? -1 : Math.min(activeIndex, visible.length - 1);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || safeIndex < 0) return;
    document
      .getElementById(`sketch-command-${safeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, safeIndex]);

  if (!open) return null;

  const move = (delta: number) => {
    if (visible.length === 0) return;
    setActiveIndex((current) => {
      const next = Math.min(Math.max(current + delta, 0), visible.length - 1);
      return next;
    });
  };

  const runActive = () => {
    const command = visible[safeIndex];
    if (!command) return;
    if (!availability(command).enabled) return;
    onRun(command);
  };

  const grouped = SKETCH_GROUPS.map((group) => ({
    ...group,
    commands: visible.filter((command) => command.group === group.id),
  })).filter((group) => group.commands.length > 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center pt-[12vh] px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sketch-palette-title"
        className="w-full max-w-xl bg-gray-900 border border-gray-600 rounded-lg shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
          <span
            id="sketch-palette-title"
            className="text-xs uppercase tracking-wide text-gray-500"
          >
            Sketch command
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                event.stopPropagation();
                move(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                event.stopPropagation();
                move(-1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                runActive();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }
            }}
            placeholder="Type a command, key, or AutoCAD alias…"
            aria-label="Search sketch commands"
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none"
          />
          <kbd className="text-[10px] text-gray-500 border border-gray-700 rounded px-1">
            Esc
          </kbd>
        </div>

        <div
          role="listbox"
          aria-label="Sketch commands"
          className="max-h-[52vh] overflow-y-auto py-1"
        >
          {grouped.length === 0 && (
            <div className="px-4 py-6 text-sm text-gray-400">
              No command matches “{query}”.
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.id}>
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-500">
                {group.label}
              </div>
              {group.commands.map((command) => {
                const index = visible.indexOf(command);
                const state = availability(command);
                const active = index === safeIndex;
                return (
                  <button
                    key={command.id}
                    id={`sketch-command-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-disabled={!state.enabled}
                    title={state.reason}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (state.enabled) onRun(command);
                    }}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-3 ${
                      active ? "bg-blue-600/30" : "hover:bg-gray-800"
                    } ${state.enabled ? "cursor-pointer" : "opacity-45 cursor-not-allowed"}`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-100 truncate">
                        {command.label}
                      </span>
                      <span className="block text-[11px] text-gray-400 truncate">
                        {command.description}
                      </span>
                    </span>
                    <span className="flex-none text-right">
                      <span className="block text-[11px] text-gray-300 font-mono">
                        {command.keys.length > 0
                          ? command.keys.join(" / ")
                          : command.autocad[0] || "—"}
                      </span>
                      <span className="block text-[10px] text-gray-500 font-mono truncate max-w-[15rem]">
                        {command.autocad.length > 0
                          ? `ACAD ${command.autocad.join(" / ")}`
                          : command.cadjs[0]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-700 text-[10px] text-gray-500">
          <span>↑↓ navigate · Enter run · Esc close</span>
          <span>{visible.length} commands</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SketchCommandPalette;
