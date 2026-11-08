import React, { useEffect, useState } from "react";
import { BrowserSection } from "@vitekk02/cadjs";
import BrowserPanel from "./FeatureTree";

interface BrowserSidePanelProps {
  sections: BrowserSection[];
  selectedElementId: string | undefined;
  selectedFeatureId?: string | undefined;
  onSelectNode: (elementId: string, featureId?: string) => void;
  onSelectFeature?: ((featureId: string) => void) | undefined;
  onToggleVisibility: (nodeId: string) => void;
  onToggleElementVisibility?: ((elementId: string) => void) | undefined;
  onToggleSectionExpanded: (sectionId: string) => void;
  onToggleItemExpanded: (nodeId: string) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onRenameFeature?: ((featureId: string, newName: string) => void) | undefined;
  onDeleteFeature?: ((featureId: string, nodeId: string) => void) | undefined;
  onEditSketch: (sketchId: string) => void;
  rollbackActive?: boolean | undefined;
  rollbackLabel?: string | undefined;
  onSetFeatureSuppressed?:
    | ((featureId: string, suppressed: boolean) => void)
    | undefined;
  onRollbackToFeature?: ((featureId: string) => void) | undefined;
  onClearRollback?: (() => void) | undefined;
  onMoveFeature?: ((featureId: string, direction: -1 | 1) => void) | undefined;
  onReorderFeature?: ((featureId: string, toIndex: number) => void) | undefined;
  onEditFeature?: ((featureId: string) => void) | undefined;
  onRetryFeature?: ((featureId: string) => void) | undefined;
  onMoveFeatureWithDependents?:
    | ((featureId: string, direction: -1 | 1) => void)
    | undefined;
  onStepRollback?: ((delta: -1 | 1) => void) | undefined;
  onSetFeatureFolder?:
    | ((featureId: string, folder: string | null) => void)
    | undefined;
}

const matchesLg = (): boolean =>
  typeof window !== "undefined"
    ? window.matchMedia("(min-width: 1024px)").matches
    : true;

export const BrowserSidePanel: React.FC<BrowserSidePanelProps> = ({
  sections,
  selectedElementId,
  selectedFeatureId,
  onSelectNode,
  onSelectFeature,
  onToggleVisibility,
  onToggleElementVisibility,
  onToggleSectionExpanded,
  onToggleItemExpanded,
  onRenameNode,
  onDeleteNode,
  onRenameFeature,
  onDeleteFeature,
  onEditSketch,
  rollbackActive,
  rollbackLabel,
  onSetFeatureSuppressed,
  onRollbackToFeature,
  onClearRollback,
  onMoveFeature,
  onReorderFeature,
  onSetFeatureFolder,
  onEditFeature,
  onRetryFeature,
  onMoveFeatureWithDependents,
  onStepRollback,
}) => {
  const [open, setOpen] = useState(matchesLg);
  const featureCount = sections.reduce(
    (count, section) =>
      section.sectionType === "origin" ? count : count + section.count,
    0,
  );

  useEffect(() => {
    const lgQuery = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setOpen(e.matches);
    lgQuery.addEventListener("change", handler);
    return () => lgQuery.removeEventListener("change", handler);
  }, []);

  return (
    <>
      {!open && (
        <button
          className="cad-icon-button fixed left-2 top-24 z-40 border border-[var(--cad-border)] bg-white shadow-md"
          onClick={() => setOpen(true)}
          title="Show feature list"
          aria-label="Show feature list"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      )}

      {open && (
        <div className="cad-feature-list flex w-60 flex-none flex-col overflow-hidden border-r border-[var(--cad-border)] bg-white max-lg:absolute max-lg:z-30 max-lg:h-full max-lg:shadow-2xl">
          <div className="flex h-9 flex-none items-center gap-1.5 border-b border-[var(--cad-border)] px-2">
            <svg
              aria-hidden="true"
              className="h-4 w-4 text-[var(--cad-text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.7}
                d="M4 6h16M4 12h10M4 18h7"
              />
            </svg>
            <span className="text-[12px] font-semibold text-[#202124]">
              Features
            </span>
            {featureCount > 0 && (
              <span className="text-[11px] font-normal text-[var(--cad-text-faint)]">
                ({featureCount})
              </span>
            )}
            <button
              className="cad-icon-button ml-auto !h-6 !min-w-6 !px-0"
              onClick={() => setOpen(false)}
              title="Collapse feature list"
              aria-label="Collapse feature list"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </div>
          <BrowserPanel
            sections={sections}
            selectedElementId={selectedElementId}
            selectedFeatureId={selectedFeatureId}
            onSelectNode={onSelectNode}
            onSelectFeature={onSelectFeature}
            onToggleVisibility={onToggleVisibility}
            onToggleElementVisibility={onToggleElementVisibility}
            onToggleSectionExpanded={onToggleSectionExpanded}
            onToggleItemExpanded={onToggleItemExpanded}
            onRenameNode={onRenameNode}
            onDeleteNode={onDeleteNode}
            onRenameFeature={onRenameFeature}
            onDeleteFeature={onDeleteFeature}
            onEditSketch={onEditSketch}
            rollbackActive={rollbackActive}
            rollbackLabel={rollbackLabel}
            onSetFeatureSuppressed={onSetFeatureSuppressed}
            onRollbackToFeature={onRollbackToFeature}
            onClearRollback={onClearRollback}
            onMoveFeature={onMoveFeature}
            onReorderFeature={onReorderFeature}
            onSetFeatureFolder={onSetFeatureFolder}
            onEditFeature={onEditFeature}
            onRetryFeature={onRetryFeature}
            onMoveFeatureWithDependents={onMoveFeatureWithDependents}
            onStepRollback={onStepRollback}
          />
        </div>
      )}
    </>
  );
};
