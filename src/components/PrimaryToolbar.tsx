import React, { useEffect, useRef, useState } from "react";
import { SceneMode, type UndoableSnapshot } from "@vitekk02/cadjs";
import FileMenu from "./FileMenu";
import { UndoRedoMenus } from "./UndoRedoMenus";

interface PrimaryToolbarProps {
  mode: SceneMode;
  setMode: (m: SceneMode) => void;
  isLocked: boolean;
  isOperationPending: boolean;
  isBooleanMode: boolean;
  sketchIsSelectingPlane: boolean;
  onSketchClick: () => void;
  showGroundPlane: boolean;
  toggleGroundPlane: () => void;
  onFitAll: () => void;

  // Undo/redo — forwarded to <UndoRedoMenus />.
  inSketch: boolean;
  canUndoSketch: boolean;
  canRedoSketch: boolean;
  undoSketch: () => void;
  redoSketch: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  undoActionName: string | null;
  redoActionName: string | null;
  undoStack: UndoableSnapshot[];
  redoStack: UndoableSnapshot[];
  undoDropdownOpen: boolean;
  redoDropdownOpen: boolean;
  setUndoDropdownOpen: (v: boolean) => void;
  setRedoDropdownOpen: (v: boolean) => void;
  undoDropdownRef: React.RefObject<HTMLDivElement | null>;
  redoDropdownRef: React.RefObject<HTMLDivElement | null>;
}

export function getModeLabel(
  mode: SceneMode,
  sketchIsSelectingPlane: boolean,
): string {
  switch (mode) {
    case "sketch":
      return sketchIsSelectingPlane ? "Select Plane" : "Sketch";
    case "extrude":
      return "Extrude";
    case "fillet":
      return "Fillet";
    case "move":
      return "Move";
    case "combine":
      return "Combine";
    case "sweep":
      return "Sweep";
    case "loft":
      return "Loft";
    case "revolve":
      return "Revolve";
    case "measure":
      return "Measure";
    default:
      return mode.charAt(0).toUpperCase() + mode.slice(1);
  }
}

export const PrimaryToolbar: React.FC<PrimaryToolbarProps> = (props) => {
  const {
    mode,
    setMode,
    isLocked,
    isOperationPending,
    isBooleanMode,
    sketchIsSelectingPlane,
    onSketchClick,
    showGroundPlane,
    toggleGroundPlane,
    onFitAll,
  } = props;

  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        overflowMenuRef.current &&
        !overflowMenuRef.current.contains(e.target as Node)
      ) {
        setOverflowMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [overflowMenuOpen]);

  const overflowItems: { label: string; mode: SceneMode }[] = [
    { label: "Combine", mode: "combine" },
    { label: "Fillet", mode: "fillet" },
    { label: "Sweep", mode: "sweep" },
    { label: "Loft", mode: "loft" },
    { label: "Revolve", mode: "revolve" },
    { label: "Measure", mode: "measure" },
  ];

  return (
    <div className="flex-none h-12 bg-gray-900 border-b border-gray-700 flex items-center z-30">
      <div className="flex items-center px-3 gap-1 min-w-0 flex-1">
        <FileMenu />

        <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

        {/* Core buttons — always visible */}
        <button
          className={`flex-none px-3 py-1.5 text-sm rounded ${
            isOperationPending
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : mode === "sketch"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
          }`}
          disabled={isOperationPending}
          data-testid="tool-sketch"
          onClick={onSketchClick}
        >
          Sketch
        </button>
        <button
          className={`flex-none px-3 py-1.5 text-sm rounded ${
            isLocked
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : mode === "extrude"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
          }`}
          disabled={isLocked}
          data-testid="tool-extrude"
          onClick={() => setMode("extrude")}
        >
          Extrude
        </button>
        <button
          className={`flex-none px-3 py-1.5 text-sm rounded ${
            isLocked
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : mode === "move"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
          }`}
          disabled={isLocked}
          onClick={() => setMode("move")}
        >
          Move
        </button>

        {/* Secondary buttons — desktop only inline */}
        <div className="hidden lg:contents">
          <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : isBooleanMode
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            data-testid="tool-combine"
            onClick={() => setMode("combine")}
          >
            Boolean
          </button>

          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "fillet"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("fillet")}
          >
            Fillet
          </button>
          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "sweep"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("sweep")}
          >
            Sweep
          </button>
          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "loft"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("loft")}
          >
            Loft
          </button>
          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "revolve"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("revolve")}
          >
            Revolve
          </button>

          <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "measure"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("measure")}
          >
            Measure
          </button>

          <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

          <button
            className={`flex-none px-2 py-1.5 text-sm rounded ${
              showGroundPlane
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            onClick={toggleGroundPlane}
            title={showGroundPlane ? "Hide Grid" : "Show Grid"}
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
                strokeWidth={1.5}
                d="M3 3h18v18H3V3zM3 9h18M3 15h18M9 3v18M15 3v18"
              />
            </svg>
          </button>

          <button
            className="flex-none px-2 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            onClick={onFitAll}
            title="Fit All (F)"
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
                strokeWidth={1.5}
                d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M8 8h8v8H8z"
              />
            </svg>
          </button>
        </div>

        {/* Overflow "More" dropdown — mobile only */}
        <div className="lg:hidden relative" ref={overflowMenuRef}>
          <button
            className="flex-none px-2 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
            title="More tools"
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
                d="M12 5v.01M12 12v.01M12 19v.01"
              />
            </svg>
          </button>
          {overflowMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-44 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50">
              {overflowItems.map((item) => (
                <button
                  key={item.mode}
                  className={`w-full px-3 py-2 text-sm text-left ${
                    isLocked
                      ? "text-gray-500 cursor-not-allowed"
                      : mode === item.mode
                        ? "bg-blue-600 text-white"
                        : "text-gray-200 hover:bg-gray-700"
                  }`}
                  disabled={isLocked}
                  onClick={() => {
                    setMode(item.mode);
                    setOverflowMenuOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
              <div className="border-t border-gray-600 my-1" />
              <button
                className={`w-full px-3 py-2 text-sm text-left ${
                  showGroundPlane ? "text-blue-400" : "text-gray-200"
                } hover:bg-gray-700`}
                onClick={() => {
                  toggleGroundPlane();
                  setOverflowMenuOpen(false);
                }}
              >
                {showGroundPlane ? "Hide Grid" : "Show Grid"}
              </button>
              <button
                className="w-full px-3 py-2 text-sm text-left text-gray-200 hover:bg-gray-700"
                onClick={() => {
                  onFitAll();
                  setOverflowMenuOpen(false);
                }}
              >
                Fit All
              </button>
            </div>
          )}
        </div>

        <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

        <UndoRedoMenus
          inSketch={props.inSketch}
          canUndoSketch={props.canUndoSketch}
          canRedoSketch={props.canRedoSketch}
          undoSketch={props.undoSketch}
          redoSketch={props.redoSketch}
          canUndo={props.canUndo}
          canRedo={props.canRedo}
          undo={props.undo}
          redo={props.redo}
          undoActionName={props.undoActionName}
          redoActionName={props.redoActionName}
          undoStack={props.undoStack}
          redoStack={props.redoStack}
          undoDropdownOpen={props.undoDropdownOpen}
          redoDropdownOpen={props.redoDropdownOpen}
          setUndoDropdownOpen={props.setUndoDropdownOpen}
          setRedoDropdownOpen={props.setRedoDropdownOpen}
          undoDropdownRef={props.undoDropdownRef}
          redoDropdownRef={props.redoDropdownRef}
        />

        <div className="ml-auto flex-none text-sm text-gray-400">
          {getModeLabel(mode, sketchIsSelectingPlane)}
        </div>
      </div>
    </div>
  );
};
