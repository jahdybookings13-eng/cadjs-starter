import React, { useEffect, useRef, FC } from "react";
import { Icon } from "./icons/BrowserIcons";

interface BrowserContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string;
  nodeLabel: string;
  nodeVisible: boolean;
  onClose: () => void;
  onRename: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onDeleteFeature?: ((featureId: string, nodeId: string) => void) | undefined;
  onToggleVisibility: (nodeId: string) => void;
  onEditSketch?: ((sketchId: string) => void) | undefined;
  sourceSketchId?: string | undefined;
  feature?:
    | {
        id: string;
        suppressed: boolean;
        index: number;
        count: number;
        folder?: string | undefined;
        dependents?: { id: string; name: string }[] | undefined;
        status?: string | undefined;
        featureOnly?: boolean | undefined;
      }
    | undefined;
  rollbackActive?: boolean | undefined;
  onSetFeatureSuppressed?:
    | ((featureId: string, suppressed: boolean) => void)
    | undefined;
  onRollbackToFeature?: ((featureId: string) => void) | undefined;
  onClearRollback?: (() => void) | undefined;
  onMoveFeature?: ((featureId: string, direction: -1 | 1) => void) | undefined;
  onMoveFeatureWithDependents?:
    | ((featureId: string, direction: -1 | 1) => void)
    | undefined;
  onRetryFeature?: ((featureId: string) => void) | undefined;
  onEditFeature?: ((featureId: string) => void) | undefined;
  onSetFeatureFolder?:
    | ((featureId: string, folder: string | null) => void)
    | undefined;
}

const itemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)] focus:bg-[var(--cad-chrome-hover)] focus:outline-none disabled:cursor-not-allowed disabled:text-[var(--cad-text-faint)] disabled:hover:bg-transparent";

const Separator: FC = () => (
  <div className="my-1 border-t border-[var(--cad-border)]" />
);

const BrowserContextMenu: FC<BrowserContextMenuProps> = ({
  visible,
  x,
  y,
  nodeId,
  nodeLabel,
  nodeVisible,
  onClose,
  onRename,
  onDelete,
  onDeleteFeature,
  onToggleVisibility,
  onEditSketch,
  sourceSketchId,
  feature,
  rollbackActive,
  onSetFeatureSuppressed,
  onRollbackToFeature,
  onClearRollback,
  onMoveFeature,
  onMoveFeatureWithDependents,
  onRetryFeature,
  onSetFeatureFolder,
  onEditFeature,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const viewportWidth =
    typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight =
    typeof window === "undefined" ? 800 : window.innerHeight;
  const left = Math.max(8, Math.min(x, viewportWidth - 240));
  const top = Math.max(8, Math.min(y, viewportHeight - 548));

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${nodeLabel}`}
      data-testid="browser-context-menu"
      className="cad-light-panel fixed z-[120] max-h-[min(70vh,540px)] w-[232px] overflow-y-auto rounded-md border border-[var(--cad-border-strong)] bg-white py-1 text-[var(--cad-text)] shadow-2xl"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="truncate px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--cad-text-muted)]">
        {nodeLabel}
      </div>

      {onEditSketch && sourceSketchId && (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              onEditSketch(sourceSketchId);
              onClose();
            }}
          >
            Edit Sketch
          </button>
          <Separator />
        </>
      )}

      {feature && (
        <>
          {onEditFeature && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                onEditFeature(feature.id);
                onClose();
              }}
            >
              Edit Feature
            </button>
          )}
          {onRetryFeature && feature.status === "ERROR" && (
            <button
              type="button"
              role="menuitem"
              className={`${itemClass} text-amber-700`}
              onClick={() => {
                onRetryFeature(feature.id);
                onClose();
              }}
            >
              Retry Feature
            </button>
          )}
          {onSetFeatureSuppressed && (
            <button
              type="button"
              role="menuitem"
              aria-label={
                feature.suppressed ? "Unsuppress feature" : "Suppress feature"
              }
              className={itemClass}
              onClick={() => {
                onSetFeatureSuppressed(feature.id, !feature.suppressed);
                onClose();
              }}
            >
              {feature.suppressed ? "Unsuppress" : "Suppress"}
            </button>
          )}
          {onMoveFeature && (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={feature.index <= 0}
                className={itemClass}
                onClick={() => {
                  onMoveFeature(feature.id, -1);
                  onClose();
                }}
              >
                Move Up
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={
                  feature.index < 0 || feature.index >= feature.count - 1
                }
                className={itemClass}
                onClick={() => {
                  onMoveFeature(feature.id, 1);
                  onClose();
                }}
              >
                Move Down
              </button>
            </>
          )}
          {onMoveFeatureWithDependents &&
            feature.dependents &&
            feature.dependents.length > 0 && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={feature.index <= 0}
                  className={itemClass}
                  onClick={() => {
                    onMoveFeatureWithDependents(feature.id, -1);
                    onClose();
                  }}
                >
                  Move with Dependents Up
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    feature.index < 0 || feature.index >= feature.count - 1
                  }
                  className={itemClass}
                  onClick={() => {
                    onMoveFeatureWithDependents(feature.id, 1);
                    onClose();
                  }}
                >
                  Move with Dependents Down
                </button>
              </>
            )}
          {feature.dependents && feature.dependents.length > 0 && (
            <div
              role="status"
              className="border-y border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] leading-tight text-amber-900"
            >
              Used by {feature.dependents.length}:{" "}
              {feature.dependents.map((dependent) => dependent.name).join(", ")}
              <span className="mt-0.5 block text-amber-800/80">
                Suppress also suppresses these; a plain reorder stops before
                them. Move with Dependents carries them along.
              </span>
            </div>
          )}
          {onSetFeatureFolder && (
            <button
              type="button"
              role="menuitem"
              aria-label={
                feature.folder ? "Remove from folder" : "Move to folder"
              }
              className={itemClass}
              onClick={() => {
                const name = window.prompt(
                  "Folder name (blank removes the feature from its folder)",
                  feature.folder ?? "",
                );
                if (name === null) return;
                onSetFeatureFolder(feature.id, name.trim() || null);
                onClose();
              }}
            >
              {feature.folder ? "Remove from Folder" : "Move to Folder…"}
            </button>
          )}
          {onRollbackToFeature && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                onRollbackToFeature(feature.id);
                onClose();
              }}
            >
              Rollback to Here
            </button>
          )}
          {rollbackActive && onClearRollback && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                onClearRollback();
                onClose();
              }}
            >
              Clear Rollback
            </button>
          )}
          <Separator />
        </>
      )}

      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          onRename(nodeId);
          onClose();
        }}
      >
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        className={`${itemClass} text-red-600`}
        onClick={() => {
          if (feature?.id && onDeleteFeature)
            onDeleteFeature(feature.id, nodeId);
          else onDelete(nodeId);
          onClose();
        }}
      >
        Delete
      </button>
      <Separator />
      <button
        type="button"
        role="menuitem"
        aria-label={nodeVisible ? "Hide node" : "Show node"}
        className={itemClass}
        onClick={() => {
          onToggleVisibility(nodeId);
          onClose();
        }}
      >
        {nodeVisible ? (
          <>
            <Icon name="eye-off" className="h-3.5 w-3.5" /> Hide
          </>
        ) : (
          <>
            <Icon name="eye" className="h-3.5 w-3.5" /> Show
          </>
        )}
      </button>
    </div>
  );
};

export default BrowserContextMenu;
