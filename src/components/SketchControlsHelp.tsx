import React, { FC, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  SKETCH_COMMANDS,
  SKETCH_GROUPS,
  SKETCH_PARITY_GAPS,
  type SketchCommand,
} from "../model/sketchControls";

interface SketchControlsHelpProps {
  open: boolean;
  onClose: () => void;
}

const commandRows = (command: SketchCommand) => (
  <tr key={command.id} className="border-t border-gray-800">
    <td className="py-1 pr-3 text-gray-200">{command.label}</td>
    <td className="py-1 pr-3 font-mono text-[11px] text-gray-300 whitespace-nowrap">
      {command.keys.length > 0 ? command.keys.join(" / ") : "—"}
    </td>
    <td className="py-1 pr-3 font-mono text-[11px] text-gray-400">
      {command.autocad.length > 0 ? command.autocad.join(" / ") : "—"}
    </td>
    <td className="py-1 font-mono text-[11px] text-gray-500">
      {command.cadjs[0]}
    </td>
  </tr>
);

/** Full 2D control map, including an honest list of tools we do not have. */
const SketchControlsHelp: FC<SketchControlsHelpProps> = ({ open, onClose }) => {
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

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center pt-[8vh] px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sketch-controls-title"
        className="cad-light-panel max-h-[80vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[var(--cad-border-strong)] bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--cad-border)] bg-white px-4 py-2">
          <div>
            <h2 id="sketch-controls-title" className="text-sm text-gray-100">
              2D controls
            </h2>
            <p className="text-[11px] text-gray-500">
              Sketch mode · app keys, AutoCAD aliases and cadjs ids
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            aria-label="Close controls"
          >
            Close
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="text-xs text-gray-400 mb-3">
            Direct single keys keep the app&apos;s existing behavior. Type the
            AutoCAD alias in the command palette (
            <kbd className="px-1 border border-gray-700 rounded">Ctrl+K</kbd>)
            when an app key and AutoCAD differ. {SKETCH_COMMANDS.length}{" "}
            commands are mapped. Constraints are in the palette too; only
            solver-valid ones enable for the current selection, and dimensional
            constraints ask for a value.
          </p>

          {SKETCH_GROUPS.map((group) => {
            const commands = SKETCH_COMMANDS.filter(
              (command) => command.group === group.id,
            );
            if (commands.length === 0) return null;
            return (
              <section key={group.id} className="mb-4">
                <h3 className="text-[11px] uppercase tracking-wide text-blue-400 mb-1">
                  {group.label}
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-gray-500 text-left">
                      <th className="pb-1 pr-3 font-normal">Command</th>
                      <th className="pb-1 pr-3 font-normal">Key</th>
                      <th className="pb-1 pr-3 font-normal">AutoCAD</th>
                      <th className="pb-1 font-normal">cadjs</th>
                    </tr>
                  </thead>
                  <tbody>{commands.map(commandRows)}</tbody>
                </table>
              </section>
            );
          })}

          <section className="mb-2">
            <h3 className="text-[11px] uppercase tracking-wide text-amber-400 mb-1">
              Not in this engine yet
            </h3>
            <p className="text-[11px] text-gray-500 mb-2">
              These AutoCAD tools have no honest implementation here, so they
              have no buttons. They are the 2D parity backlog.
            </p>
            <ul className="grid md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {SKETCH_PARITY_GAPS.map((gap) => (
                <li key={gap.name} className="flex gap-2">
                  <span className="font-mono text-[11px] text-gray-500 w-14 flex-none">
                    {gap.autocad}
                  </span>
                  <span className="text-gray-300 flex-none">{gap.name}</span>
                  <span className="text-gray-500">{gap.note}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SketchControlsHelp;
