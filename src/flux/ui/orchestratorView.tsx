// flux/ui/orchestratorView.tsx — the master orchestrator surface.
//
// Renders, for ONE file/project:
//   * the single floating chat panel (chatPanel.tsx)
//   * a radial "Actions" menu over the canvas (top-level + submenus) that
//     drives orchestrator.runTurn — identical content to the desk dropdown and
//     the VR radial (menuByGroup from the registry).
//
// This is the "master orchestrator window" the user sees. Sub-agents (pcb /
// mcad / firmware / parts) have no panel of their own; their rows appear INSIDE
// the chat panel, tagged. One window, one thread, one input — operable from the
// desk radial, VR, voice, or `bus.run("flux.runTurn", key, selection)`.

import React, { useMemo, useState } from "react";
import type { BrainConfig, SelectedPart } from "../agent/context";
import type { Orchestrator } from "../agent/orchestrator";
import { menuByGroup, type SubmenuGroup } from "../agent/registry";
import ChatPanel from "./chatPanel";

interface OrchestratorViewProps {
  projectRef: string;
  projectName: string;
  orchestrator: Orchestrator;
  selection: SelectedPart[];
  brain: BrainConfig;
}

const SUBMENU_ORDER: string[] = [
  "addSubcircuit",
  "componentAnalysis",
  "detailedReviews",
  "manufacturingPrep",
  "advancedSimulation",
];

export function OrchestratorView(
  props: OrchestratorViewProps,
): React.ReactElement | null {
  const { projectRef, projectName, orchestrator, selection, brain } = props;
  const [menuOpen, setMenuOpen] = useState(false);

  const menu = useMemo(() => menuByGroup(), []);
  const topLevel = menu.root;

  // The radial menu: a two-tier overlay. Tier 1 = top-level actions + the
  // submenu group headers. Tier 2 (on hover) = the submenu's actions.
  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-flux-view>
      <ChatPanel
        projectRef={projectRef}
        projectName={projectName}
        orchestrator={orchestrator}
        selection={selection}
        brain={brain}
      />
      {menuOpen && (
        <div className="absolute bottom-20 left-4 z-30 pointer-events-auto w-72 bg-gray-800/95 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700">
            <span className="text-xs font-medium text-gray-200">Actions</span>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {topLevel.map((a) => (
              <ActionItem key={a.key} a={a} onPick={() => setMenuOpen(false)} />
            ))}
            {SUBMENU_ORDER.filter((g) => g !== "root").map((g) => (
              <Submenu
                key={g}
                name={g}
                actions={menu[g as SubmenuGroup]}
                onPick={() => setMenuOpen(false)}
              />
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="absolute bottom-4 left-4 z-30 pointer-events-auto px-3 py-1.5 rounded bg-gray-800/95 border border-gray-700 hover:border-blue-500 text-xs text-gray-200"
        title="Open the flux action menu"
      >
        {menuOpen ? "×" : "⚡ Actions"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------------

interface ActionItemProps {
  a: { key: string; label: string; desc?: string; kind: string };
  onPick: () => void;
}

const ActionItem: React.FC<ActionItemProps> = ({ a, onPick }) => {
  const kindIcon: Record<string, string> = {
    mutate: "✚",
    analyze: "🔍",
    generate: "📄",
    review: "🛡",
    help: "❔",
  };
  return (
    <button
      onClick={onPick}
      className="w-full text-left px-3 py-1.5 hover:bg-gray-700/60 flex items-center gap-2"
      title={a.desc}
    >
      <span className="text-gray-500 text-[10px] w-4 flex-none">
        {kindIcon[a.kind] ?? "•"}
      </span>
      <span className="text-[12px] text-gray-200">{a.label}</span>
    </button>
  );
};

interface SubmenuProps {
  name: string;
  actions: Array<{ key: string; label: string; desc?: string; kind: string }>;
  onPick: () => void;
}

const Submenu: React.FC<SubmenuProps> = ({ name, actions, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-gray-700/40">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={humanSubmenu(name)}
        aria-expanded={open}
        className="w-full text-left px-3 py-1.5 text-[13px] font-semibold text-blue-300 hover:bg-gray-700/40 flex items-center justify-between"
      >
        <span>{humanSubmenu(name)}</span>
        <span className="text-gray-500">{open ? "−" : "+"}</span>
      </button>
      {open &&
        actions.map((a) => <ActionItem key={a.key} a={a} onPick={onPick} />)}
    </div>
  );
};

function humanSubmenu(g: string): string {
  switch (g) {
    case "addSubcircuit":
      return "Add subcircuit";
    case "componentAnalysis":
      return "Component analysis";
    case "detailedReviews":
      return "Detailed reviews";
    case "manufacturingPrep":
      return "Manufacturing prep";
    case "advancedSimulation":
      return "Advanced simulation";
    default:
      return g;
  }
}

// The orchestrator is the master conductor; this file exposes ONE view for it.
export default OrchestratorView;
