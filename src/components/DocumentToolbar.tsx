import React, { useEffect, useRef, useState } from "react";
import FileMenu from "./FileMenu";
import DisplayMenu from "./DisplayMenu";
import { TOOL_SEARCH_OPEN_EVENT } from "../model/toolSearch";
import type { DisplayStyle, SectionAxis } from "../model/display";

interface DocumentToolbarProps {
  projectName: string;
  documentName: string;
  dirty: boolean;
  saving: boolean;
  canEdit: boolean;
  panelOpen: boolean;
  projectionType: "perspective" | "orthographic";
  displayStyle: DisplayStyle;
  showGroundPlane: boolean;
  sectionAxis: SectionAxis;
  sectionOffset: number;
  sectionMin: number;
  sectionMax: number;
  sectionStep: number;
  sectionFlip: boolean;
  originVisibility: Record<string, boolean>;
  onToggleOrigin: (id: string) => void;
  onOpenDocuments: () => void;
  onSave: () => void;
  onExport: () => void;
  onTogglePanel: () => void;
  onHelp: () => void;
  onToggleProjection: () => void;
  onDisplayStyleChange: (style: DisplayStyle) => void;
  onToggleGroundPlane: () => void;
  onSectionAxisChange: (axis: SectionAxis) => void;
  onSectionOffsetChange: (offset: number) => void;
  onSectionFlipChange: (flip: boolean) => void;
  onShare?: () => void;
}

type HeaderIcon =
  | "save"
  | "export"
  | "panel"
  | "help"
  | "perspective"
  | "orthographic"
  | "link";

function HeaderGlyph({ name }: { name: HeaderIcon }) {
  const common = {
    className: "h-4 w-4 flex-none",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  } as const;

  switch (name) {
    case "save":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M5 3h11l3 3v15H5V3Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M8 3v6h7V3M8 21v-7h8v7"
          />
        </svg>
      );
    case "export":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M12 15V3m0 0L8 7m4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"
          />
        </svg>
      );
    case "panel":
      return (
        <svg {...common}>
          <rect
            x="3.5"
            y="4.5"
            width="17"
            height="15"
            rx="1.5"
            strokeWidth={1.7}
          />
          <path strokeWidth={1.7} d="M15 4.5v15" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" strokeWidth={1.7} />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M9.4 9a2.7 2.7 0 1 1 3.8 2.5c-.8.4-1.2 1-1.2 1.9v.2"
          />
          <path strokeLinecap="round" strokeWidth={2} d="M12 17.2h.01" />
        </svg>
      );
    case "perspective":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10"
          />
        </svg>
      );
    case "orthographic":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="1" strokeWidth={1.7} />
          <path strokeWidth={1.7} d="M12 4v16M4 12h16" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M10 13a4 4 0 0 0 5.7.1l2.1-2.1a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 11a4 4 0 0 0-5.7-.1l-2.1 2.1a4 4 0 0 0 5.7 5.7l1.2-1.2"
          />
        </svg>
      );
  }
}

function BrandMark() {
  return (
    <span className="flex flex-none items-center gap-1.5">
      <svg aria-hidden="true" className="h-6 w-6 flex-none" viewBox="0 0 24 24">
        <path d="M12 2.3 20.2 7v10L12 21.7 3.8 17V7L12 2.3Z" fill="#21a366" />
        <path
          d="m12 6.2 4.6 2.6v6.4L12 17.8l-4.6-2.6V8.8L12 6.2Z"
          fill="#fff"
          fillOpacity=".92"
        />
        <path d="m12 6.2 4.6 2.6L12 11.4 7.4 8.8 12 6.2Z" fill="#188f58" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-[#3c4043]">
        cadjs
      </span>
    </span>
  );
}

/**
 * Desktop document chrome. Follows Onshape's document toolbar: brand and
 * document menu at the left, document/workspace identity, then the document
 * actions at the right with Share as the primary action.
 */
export const DocumentToolbar: React.FC<DocumentToolbarProps> = ({
  projectName,
  documentName,
  dirty,
  saving,
  canEdit,
  panelOpen,
  projectionType,
  displayStyle,
  showGroundPlane,
  sectionAxis,
  sectionOffset,
  sectionMin,
  sectionMax,
  sectionStep,
  sectionFlip,
  originVisibility,
  onToggleOrigin,
  onOpenDocuments,
  onSave,
  onExport,
  onTogglePanel,
  onHelp,
  onToggleProjection,
  onDisplayStyleChange,
  onToggleGroundPlane,
  onSectionAxisChange,
  onSectionOffsetChange,
  onSectionFlipChange,
  onShare,
}) => {
  const saveLabel = saving ? "Saving…" : dirty ? "Unsaved" : "Saved";
  const workspaceName =
    projectName && projectName !== documentName ? projectName : "Main";
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!helpMenuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!helpMenuRef.current?.contains(event.target as Node)) {
        setHelpMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelpMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [helpMenuOpen]);

  return (
    <div
      data-testid="document-toolbar"
      className="cad-chrome flex h-12 flex-none select-none items-center gap-2 border-b px-3 text-xs z-40"
    >
      <button
        type="button"
        data-testid="open-documents"
        onClick={onOpenDocuments}
        className="flex h-8 flex-none items-center rounded px-1 hover:bg-black/[0.04]"
        title="Back to Documents"
        aria-label="Back to Documents"
      >
        <BrandMark />
      </button>

      <FileMenu compact />

      <span className="h-5 w-px flex-none bg-[var(--cad-border)]" />

      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="max-w-[260px] truncate text-[15px] font-semibold text-[#202124]"
          title={`${projectName} — ${documentName}`}
        >
          {documentName}
        </span>
        <span className="cad-chrome-detail max-w-[120px] truncate text-[12px] text-[var(--cad-text-muted)]">
          {workspaceName}
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.href);
          }}
          className="cad-icon-button !h-6 !min-w-6 !px-0"
          title="Copy document link"
          aria-label="Copy document link"
        >
          <HeaderGlyph name="link" />
        </button>
        <span
          data-testid="document-dirty-state"
          className="flex-none text-[10px] font-medium text-[var(--cad-text-faint)]"
          title={dirty ? "Unsaved changes" : "All changes saved"}
        >
          {saveLabel}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          data-testid="document-save"
          onClick={onSave}
          disabled={!canEdit || saving}
          className="cad-icon-button"
          title="Save document"
          aria-label="Save document"
        >
          <HeaderGlyph name="save" />
        </button>
        <button
          type="button"
          data-testid="document-export"
          onClick={onExport}
          className="cad-icon-button"
          title="Export document"
          aria-label="Export document"
        >
          <HeaderGlyph name="export" />
        </button>
        <span className="mx-1 h-5 w-px flex-none bg-[var(--cad-border)]" />
        <button
          type="button"
          data-testid="document-panel-toggle"
          onClick={onTogglePanel}
          aria-pressed={panelOpen}
          className="cad-icon-button"
          title="Document panel"
          aria-label="Document panel"
        >
          <HeaderGlyph name="panel" />
        </button>
        <div className="relative" ref={helpMenuRef}>
          <button
            type="button"
            data-testid="document-help"
            onClick={() => setHelpMenuOpen((value) => !value)}
            className="cad-icon-button"
            title="Help menu"
            aria-label="Help"
            aria-haspopup="menu"
            aria-expanded={helpMenuOpen}
          >
            <HeaderGlyph name="help" />
          </button>
          {helpMenuOpen && (
            <div
              role="menu"
              aria-label="Help menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-md border border-[var(--cad-border-strong)] bg-white py-1 shadow-xl"
            >
              <HelpItem
                label="Keyboard shortcuts"
                onClick={() => {
                  setHelpMenuOpen(false);
                  onHelp();
                }}
              />
              <HelpItem
                label="Search tools"
                onClick={() => {
                  setHelpMenuOpen(false);
                  window.dispatchEvent(new Event(TOOL_SEARCH_OPEN_EVENT));
                }}
              />
              <div className="my-1 border-t border-[var(--cad-border)]" />
              <HelpItem
                label="Onshape help"
                onClick={() => {
                  setHelpMenuOpen(false);
                  window.open(
                    "https://cad.onshape.com/help/",
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              />
              <HelpItem
                label="Onshape what's new"
                onClick={() => {
                  setHelpMenuOpen(false);
                  window.open(
                    "https://www.onshape.com/en/products/whats-new",
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              />
            </div>
          )}
        </div>
        <DisplayMenu
          displayStyle={displayStyle}
          onDisplayStyleChange={onDisplayStyleChange}
          projectionType={projectionType}
          onToggleProjection={onToggleProjection}
          showGroundPlane={showGroundPlane}
          onToggleGroundPlane={onToggleGroundPlane}
          sectionAxis={sectionAxis}
          onSectionAxisChange={onSectionAxisChange}
          sectionOffset={sectionOffset}
          sectionMin={sectionMin}
          sectionMax={sectionMax}
          sectionStep={sectionStep}
          onSectionOffsetChange={onSectionOffsetChange}
          sectionFlip={sectionFlip}
          onSectionFlipChange={onSectionFlipChange}
          originVisibility={originVisibility}
          onToggleOrigin={onToggleOrigin}
        />
        {onShare && (
          <button
            type="button"
            data-testid="document-share"
            onClick={onShare}
            className="ml-1.5 h-8 rounded bg-[#1a73e8] px-3 text-[12px] font-medium text-white shadow-sm hover:bg-[#1765cc]"
          >
            Share
          </button>
        )}
      </div>
    </div>
  );
};

const HelpItem: React.FC<{ label: string; onClick: () => void }> = ({
  label,
  onClick,
}) => (
  <button
    type="button"
    role="menuitem"
    aria-label={label}
    onClick={onClick}
    className="w-full px-3 py-1.5 text-left text-[12px] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
  >
    {label}
  </button>
);

export default DocumentToolbar;
