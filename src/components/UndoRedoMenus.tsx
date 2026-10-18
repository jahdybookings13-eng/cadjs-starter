import React from "react";
import type { UndoableSnapshot } from "@vitekk02/cadjs";

/**
 * Undo/redo button pair with stack-history dropdowns. Switches to the
 * sketch-scoped undo stack when sketch mode is active.
 *
 * The composer owns dropdown open/close state + click-outside dismissal so the
 * Undo and Redo dropdowns stay mutually exclusive (opening one closes the other).
 */
interface UndoRedoMenusProps {
  // Phase
  inSketch: boolean;

  // Sketch-mode stack
  canUndoSketch: boolean;
  canRedoSketch: boolean;
  undoSketch: () => void;
  redoSketch: () => void;

  // Main stack
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  undoActionName: string | null;
  redoActionName: string | null;
  undoStack: UndoableSnapshot[];
  redoStack: UndoableSnapshot[];

  // Dropdown UI state — owned by composer for click-outside coordination.
  undoDropdownOpen: boolean;
  redoDropdownOpen: boolean;
  setUndoDropdownOpen: (v: boolean) => void;
  setRedoDropdownOpen: (v: boolean) => void;
  undoDropdownRef: React.RefObject<HTMLDivElement | null>;
  redoDropdownRef: React.RefObject<HTMLDivElement | null>;
}

export const UndoRedoMenus: React.FC<UndoRedoMenusProps> = ({
  inSketch,
  canUndoSketch,
  canRedoSketch,
  undoSketch,
  redoSketch,
  canUndo,
  canRedo,
  undo,
  redo,
  undoActionName,
  redoActionName,
  undoStack,
  redoStack,
  undoDropdownOpen,
  redoDropdownOpen,
  setUndoDropdownOpen,
  setRedoDropdownOpen,
  undoDropdownRef,
  redoDropdownRef,
}) => {
  const effectiveCanUndo = inSketch ? canUndoSketch : canUndo;
  const effectiveCanRedo = inSketch ? canRedoSketch : canRedo;
  const effectiveUndo = inSketch ? undoSketch : undo;
  const effectiveRedo = inSketch ? redoSketch : redo;
  const undoTitle = inSketch
    ? "Undo sketch action (Ctrl+Z)"
    : undoActionName
      ? `Undo ${undoActionName} (Ctrl+Z)`
      : "Undo (Ctrl+Z)";
  const redoTitle = inSketch
    ? "Redo sketch action (Ctrl+Y)"
    : redoActionName
      ? `Redo ${redoActionName} (Ctrl+Y)`
      : "Redo (Ctrl+Y)";

  return (
    <div className="flex items-center gap-0.5">
      {/* Undo button with dropdown */}
      <div className="relative" ref={undoDropdownRef}>
        <div className="flex">
          <button
            className={`flex-none px-2 py-1.5 text-sm ${!inSketch && canUndo ? "rounded-l" : "rounded"} ${
              effectiveCanUndo
                ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                : "bg-gray-800 text-gray-500 cursor-not-allowed"
            }`}
            onClick={() => {
              effectiveUndo();
              setUndoDropdownOpen(false);
            }}
            disabled={!effectiveCanUndo}
            title={undoTitle}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H3M3 10l4-4M3 10l4 4"
              />
            </svg>
          </button>
          {!inSketch && (
            <button
              className={`flex-none px-1 py-1.5 text-sm rounded-r border-l border-gray-600 ${
                canUndo
                  ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                  : "bg-gray-800 text-gray-500 cursor-not-allowed"
              }`}
              onClick={() => {
                setUndoDropdownOpen(!undoDropdownOpen);
                setRedoDropdownOpen(false);
              }}
              disabled={!canUndo}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>
        {!inSketch && undoDropdownOpen && undoStack.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
            {[...undoStack].reverse().map((snapshot, idx) => (
              <button
                key={snapshot.timestamp}
                className="w-full px-3 py-1.5 text-sm text-left text-gray-200 hover:bg-gray-700"
                onClick={() => {
                  for (let i = 0; i <= idx; i++) {
                    undo();
                  }
                  setUndoDropdownOpen(false);
                }}
              >
                {snapshot.actionName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Redo button with dropdown */}
      <div className="relative" ref={redoDropdownRef}>
        <div className="flex">
          <button
            className={`flex-none px-2 py-1.5 text-sm ${!inSketch && canRedo ? "rounded-l" : "rounded"} ${
              effectiveCanRedo
                ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                : "bg-gray-800 text-gray-500 cursor-not-allowed"
            }`}
            onClick={() => {
              effectiveRedo();
              setRedoDropdownOpen(false);
            }}
            disabled={!effectiveCanRedo}
            title={redoTitle}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h10M21 10l-4-4M21 10l-4 4"
              />
            </svg>
          </button>
          {!inSketch && (
            <button
              className={`flex-none px-1 py-1.5 text-sm rounded-r border-l border-gray-600 ${
                canRedo
                  ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                  : "bg-gray-800 text-gray-500 cursor-not-allowed"
              }`}
              onClick={() => {
                setRedoDropdownOpen(!redoDropdownOpen);
                setUndoDropdownOpen(false);
              }}
              disabled={!canRedo}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>
        {!inSketch && redoDropdownOpen && redoStack.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
            {[...redoStack].reverse().map((snapshot, idx) => (
              <button
                key={snapshot.timestamp}
                className="w-full px-3 py-1.5 text-sm text-left text-gray-200 hover:bg-gray-700"
                onClick={() => {
                  for (let i = 0; i <= idx; i++) {
                    redo();
                  }
                  setRedoDropdownOpen(false);
                }}
              >
                {snapshot.actionName}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
