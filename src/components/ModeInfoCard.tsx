import React, { useState, useEffect } from "react";
import { BuiltInSceneMode, SceneMode } from "@vitekk02/cadjs";

interface ModeInfoCardProps {
  mode: SceneMode;
  isSelectingPlane: boolean;
  activeSketch: boolean;
}

interface ControlEntry {
  keys: string[];
  description: string;
}

interface ModeInfo {
  name: string;
  controls: ControlEntry[];
}

const MODE_INFO: Record<BuiltInSceneMode, ModeInfo> = {
  move: {
    name: "Move",
    controls: [
      { keys: ["Click"], description: "Select body" },
      { keys: ["Drag"], description: "Move body" },
      { keys: ["Alt", "Drag"], description: "Rotate body" },
      { keys: ["Shift"], description: "Disable snap" },
      { keys: ["Del"], description: "Delete selected" },
      { keys: ["Ctrl", "D"], description: "Duplicate" },
    ],
  },
  combine: {
    name: "Combine",
    controls: [
      { keys: ["Click"], description: "Set target / tool" },
      { keys: ["Click"], description: "Deselect body" },
      { keys: ["T"], description: "Toggle join/cut/intersect" },
    ],
  },
  sketch: {
    name: "Sketch",
    controls: [
      { keys: ["Click"], description: "Add / select primitive" },
      { keys: ["Right-click"], description: "Constraint menu" },
      { keys: ["Ctrl", "Click"], description: "Multi-select" },
      { keys: ["Esc"], description: "Cancel drawing" },
      { keys: ["Ctrl", "Z"], description: "Undo" },
      { keys: ["Ctrl", "Y"], description: "Redo" },
    ],
  },
  extrude: {
    name: "Extrude",
    controls: [
      { keys: ["Click"], description: "Select profile" },
      { keys: ["Click arrow"], description: "Start drag" },
      { keys: ["Drag"], description: "Set depth" },
      { keys: ["Shift", "Drag"], description: "Symmetric" },
      { keys: ["T"], description: "Toggle join/cut" },
      { keys: ["Esc"], description: "Cancel" },
    ],
  },
  fillet: {
    name: "Fillet / Chamfer",
    controls: [
      { keys: ["Click"], description: "Select body" },
      { keys: ["Click edge"], description: "Toggle edge" },
      { keys: ["Ctrl", "Click"], description: "Multi-select edges" },
      { keys: ["T"], description: "Toggle fillet/chamfer" },
      { keys: ["Esc"], description: "Cancel" },
    ],
  },
  sweep: {
    name: "Sweep",
    controls: [
      { keys: ["Click"], description: "1. Select profile" },
      { keys: ["Click"], description: "2. Select path" },
      { keys: ["Esc"], description: "Cancel" },
    ],
  },
  loft: {
    name: "Loft",
    controls: [
      { keys: ["Click"], description: "Select profiles (2+)" },
      { keys: ["Click"], description: "Deselect profile" },
      { keys: ["Esc"], description: "Cancel" },
    ],
  },
  revolve: {
    name: "Revolve",
    controls: [
      { keys: ["Click"], description: "1. Select profile" },
      { keys: ["Click"], description: "2. Select axis" },
      { keys: ["Esc"], description: "Cancel" },
    ],
  },
  measure: {
    name: "Measure",
    controls: [
      { keys: ["D"], description: "Distance mode" },
      { keys: ["E"], description: "Edge length mode" },
      { keys: ["A"], description: "Angle mode" },
      { keys: ["Click"], description: "Set measure points" },
      { keys: ["P"], description: "Pin measurement" },
      { keys: ["Del"], description: "Remove pinned" },
      { keys: ["Esc"], description: "Clear" },
    ],
  },
};

const GLOBAL_CONTROLS: ControlEntry[] = [
  { keys: ["MMB"], description: "Orbit" },
  { keys: ["Ctrl", "Z"], description: "Undo" },
  { keys: ["Ctrl", "Y"], description: "Redo" },
  { keys: ["F"], description: "Fit all" },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1 py-0.5 text-[10px] font-mono bg-gray-700/50 rounded border border-gray-600/50 leading-none">
      {children}
    </kbd>
  );
}

function ControlRow({ entry }: { entry: ControlEntry }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] leading-snug">
      <span className="flex-none flex items-center gap-0.5">
        {entry.keys.map((k, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-gray-500">+</span>}
            <Kbd>{k}</Kbd>
          </React.Fragment>
        ))}
      </span>
      <span className="text-gray-400">{entry.description}</span>
    </div>
  );
}

const ModeInfoCard: React.FC<ModeInfoCardProps> = ({
  mode,
  isSelectingPlane,
  activeSketch,
}) => {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when mode changes
  useEffect(() => {
    setDismissed(false);
  }, [mode]);

  // Hide during sketch plane selection, or sketch mode without active sketch.
  // Move is the default navigation state; a persistent help card there is
  // visual noise rather than guidance, so only tool modes show it.
  if (dismissed) return null;
  if (mode === "move") return null;
  if (mode === "sketch" && isSelectingPlane) return null;
  if (mode === "sketch" && !activeSketch) return null;

  const info = MODE_INFO[mode as BuiltInSceneMode];
  if (!info) return null;

  return (
    <div className="cad-light-panel pointer-events-auto absolute bottom-10 right-3 z-20 w-52 select-none rounded border border-[var(--cad-border-strong)] bg-white/95 shadow-xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-700">
        <span className="text-xs font-medium text-gray-200">{info.name}</span>
        <button
          className="text-gray-500 hover:text-gray-300 text-sm leading-none p-0.5"
          onClick={() => setDismissed(true)}
          title="Dismiss"
        >
          &times;
        </button>
      </div>

      {/* Mode controls */}
      <div className="px-2.5 py-2 space-y-1.5">
        {info.controls.map((c, i) => (
          <ControlRow key={i} entry={c} />
        ))}
      </div>

      {/* Global controls */}
      <div className="px-2.5 py-1.5 border-t border-gray-700/50 space-y-1">
        {GLOBAL_CONTROLS.map((c, i) => (
          <ControlRow key={i} entry={c} />
        ))}
      </div>
    </div>
  );
};

export default ModeInfoCard;
