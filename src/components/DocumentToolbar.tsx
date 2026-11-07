import React from "react";

interface DocumentToolbarProps {
  projectName: string;
  documentName: string;
  dirty: boolean;
  saving: boolean;
  canEdit: boolean;
  panelOpen: boolean;
  projectionType: "perspective" | "orthographic";
  onOpenDocuments: () => void;
  onSave: () => void;
  onExport: () => void;
  onTogglePanel: () => void;
  onHelp: () => void;
  onToggleProjection: () => void;
}

/** Desktop document chrome: navigation, save state, export, panel and help. */
export const DocumentToolbar: React.FC<DocumentToolbarProps> = ({
  projectName,
  documentName,
  dirty,
  saving,
  canEdit,
  panelOpen,
  projectionType,
  onOpenDocuments,
  onSave,
  onExport,
  onTogglePanel,
  onHelp,
  onToggleProjection,
}) => {
  return (
    <div
      data-testid="document-toolbar"
      className="flex-none h-9 bg-gray-950 border-b border-gray-800 flex items-center gap-1 px-2 text-xs z-40"
    >
      <button
        type="button"
        data-testid="open-documents"
        onClick={onOpenDocuments}
        className="rounded px-2 py-1 text-gray-300 hover:bg-gray-800 hover:text-white"
        title="Open the local Documents page"
      >
        Documents
      </button>
      <span className="text-gray-700">/</span>
      <span
        className="max-w-[160px] truncate text-gray-200"
        title={`${projectName} — ${documentName}`}
      >
        {documentName}
      </span>
      <span
        data-testid="document-dirty-state"
        className={`rounded px-1.5 py-0.5 text-[10px] ${
          dirty
            ? "bg-amber-500/15 text-amber-300"
            : "bg-green-500/10 text-green-400"
        }`}
      >
        {saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          data-testid="document-save"
          onClick={onSave}
          disabled={!canEdit || saving}
          className="rounded bg-gray-800 px-2 py-1 text-gray-100 hover:bg-gray-700 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          data-testid="document-export"
          onClick={onExport}
          className="rounded px-2 py-1 text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          Export
        </button>
        <button
          type="button"
          data-testid="document-panel-toggle"
          onClick={onTogglePanel}
          aria-pressed={panelOpen}
          className="rounded px-2 py-1 text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          Panel
        </button>
        <button
          type="button"
          data-testid="document-help"
          onClick={onHelp}
          className="rounded px-2 py-1 text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          Help
        </button>
        <button
          type="button"
          onClick={onToggleProjection}
          className="rounded px-2 py-1 text-gray-300 hover:bg-gray-800 hover:text-white"
          title="Toggle perspective / orthographic"
        >
          {projectionType === "perspective" ? "Persp" : "Ortho"}
        </button>
      </div>
    </div>
  );
};

export default DocumentToolbar;
