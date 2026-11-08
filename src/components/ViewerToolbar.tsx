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
    <div className="cad-chrome z-30 flex h-10 flex-none items-center gap-2 border-b px-3">
      <div className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--cad-text)]">
        {projectName}
      </div>
      <span className="rounded border border-[var(--cad-border)] bg-[#f8f9fa] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--cad-text-muted)]">
        {ROLE_LABEL[role]}
      </span>
      <button
        type="button"
        onClick={onFitAll}
        className="cad-icon-button"
        title="Fit all (F)"
        aria-label="Fit all"
      >
        Fit
      </button>
      <button
        type="button"
        onClick={onShare}
        className="h-8 rounded bg-[#1a73e8] px-3 text-xs font-medium text-white hover:bg-[#1765cc]"
        data-testid="tool-share"
      >
        People
      </button>
    </div>
  );
}

export default ViewerToolbar;
