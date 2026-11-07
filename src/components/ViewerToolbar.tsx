import React from "react";
import type { ShareRole } from "../project/model";

const ROLE_LABEL: Record<ShareRole, string> = {
  view: "View only",
  comment: "Commenter",
  edit: "Editor",
};

interface ViewerToolbarProps {
  projectName: string;
  role: ShareRole;
  onShare: () => void;
  onFitAll: () => void;
}

/**
 * The non-editing toolbar. It intentionally has no Sketch/extrude/fillet
 * entries: a viewer keeps camera and tree navigation, but the edit surface is
 * not mounted at all.
 */
export function ViewerToolbar({
  projectName,
  role,
  onShare,
  onFitAll,
}: ViewerToolbarProps) {
  return (
    <div className="flex-none h-12 bg-gray-900 border-b border-gray-700 flex items-center gap-2 px-3 z-30">
      <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-200">
        {projectName}
      </div>
      <span className="rounded bg-amber-500/15 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-300">
        {ROLE_LABEL[role]}
      </span>
      <button
        onClick={onFitAll}
        className="rounded bg-gray-700 px-2 py-1.5 text-xs text-gray-100 hover:bg-gray-600"
      >
        Fit
      </button>
      <button
        onClick={onShare}
        className="rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
        data-testid="tool-share"
      >
        People
      </button>
    </div>
  );
}

export default ViewerToolbar;
