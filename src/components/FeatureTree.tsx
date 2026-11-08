import React, { FC, useState, useRef, useEffect } from "react";
import { BrowserSection, BrowserItem, OperationType } from "@vitekk02/cadjs";
import { Icon } from "./icons/BrowserIcons";
import BrowserContextMenu from "./BrowserContextMenu";

interface BrowserPanelProps {
  sections: BrowserSection[];
  selectedElementId?: string | undefined;
  /** History row selection for features with no body element of their own. */
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
  onEditSketch?: ((sketchId: string) => void) | undefined;
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
  /**
   * Optional override for operation-row icons. Receives the OperationType
   * string (built-in or custom). Return a node to render, or undefined to
   * fall back to the built-in icon switch.
   */
  iconForType?:
    | ((operationType: string) => React.ReactNode | undefined)
    | undefined;
  /**
   * Optional override for operation-row labels. Receives the OperationType
   * string (built-in or custom). Return a string to use, or undefined to
   * fall back to the row's default label.
   */
  labelForType?: ((operationType: string) => string | undefined) | undefined;
}

const ItemIcon: FC<{
  itemType: BrowserItem["itemType"];
  operationType?: OperationType | undefined;
  iconForType?:
    | ((operationType: string) => React.ReactNode | undefined)
    | undefined;
}> = ({ itemType, operationType, iconForType }) => {
  const cls = "w-4 h-4 flex-none";
  switch (itemType) {
    case "sketch":
      return <Icon name="sketch" className={cls} />;
    case "body":
      return <Icon name="body" className={cls} />;
    case "profile":
      return <Icon name="profile" className={cls} />;
    case "plane":
      return <Icon name="plane" className={cls} />;
    case "axis":
      return <Icon name="axis" className={cls} />;
    case "origin-point":
      return <Icon name="origin-point" className={cls} />;
    case "folder":
      return <Icon name="folder" className={cls} />;
    case "operation": {
      const custom = iconForType?.(operationType ?? "");
      if (custom !== undefined) return <>{custom}</>;
      switch (operationType) {
        case "union":
          return <Icon name="union" className={cls} />;
        case "difference":
          return <Icon name="difference" className={cls} />;
        case "intersection":
          return <Icon name="intersection" className={cls} />;
        case "extrude":
          return <Icon name="extrude" className={cls} />;
        case "sweep":
          return <Icon name="sweep" className={cls} />;
        case "loft":
          return <Icon name="loft" className={cls} />;
        case "fillet":
          return <Icon name="fillet" className={cls} />;
        case "chamfer":
          return <Icon name="chamfer" className={cls} />;
        case "revolve":
          return <Icon name="revolve" className={cls} />;
        default:
          return <Icon name="body" className={cls} />;
      }
    }
    default:
      return <Icon name="body" className={cls} />;
  }
};

const InlineRename: FC<{
  initialName: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}> = ({ initialName, onSubmit, onCancel }) => {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const trimmed = value.trim();
      if (trimmed) onSubmit(trimmed);
      else onCancel();
    } else if (e.key === "Escape") {
      onCancel();
    }
    e.stopPropagation();
  };

  return (
    <input
      ref={inputRef}
      value={value}
      aria-label="Rename feature"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== initialName) onSubmit(trimmed);
        else onCancel();
      }}
      className="flex-1 min-w-0 rounded border border-[var(--cad-accent)] bg-white px-1 py-0 text-sm text-[var(--cad-text)] focus:outline-none"
    />
  );
};

const BrowserItemRow: FC<{
  item: BrowserItem;
  depth: number;
  selectedElementId?: string | undefined;
  selectedFeatureId?: string | undefined;
  renamingNodeId: string | null;
  onSelect: (elementId: string, featureId?: string) => void;
  onSelectFeature?: ((featureId: string) => void) | undefined;
  onToggleVisibility: (nodeId: string) => void;
  onToggleElementVisibility?: ((elementId: string) => void) | undefined;
  onToggleExpanded: (nodeId: string) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: BrowserItem,
    parentSketchId?: string,
  ) => void;
  onStartRename: (nodeId: string) => void;
  onFinishRename: (nodeId: string, newName: string, featureId?: string) => void;
  onCancelRename: () => void;
  onEditSketch?: ((sketchId: string) => void) | undefined;
  onReorderFeature?: ((featureId: string, toIndex: number) => void) | undefined;
  onRollbackToFeature?: ((featureId: string) => void) | undefined;
  folderExpanded?: boolean | undefined;
  onToggleFolder?: ((folderId: string) => void) | undefined;
  parentSketchId?: string | undefined;
  iconForType?:
    | ((operationType: string) => React.ReactNode | undefined)
    | undefined;
  labelForType?: ((operationType: string) => string | undefined) | undefined;
}> = ({
  item,
  depth,
  selectedElementId,
  selectedFeatureId,
  renamingNodeId,
  onSelect,
  onSelectFeature,
  onToggleVisibility,
  onToggleElementVisibility,
  onToggleExpanded,
  onContextMenu,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onEditSketch,
  onReorderFeature,
  onRollbackToFeature,
  folderExpanded,
  onToggleFolder,
  parentSketchId,
  iconForType,
  labelForType,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const isFolder = item.itemType === "folder";
  const isExpanded = isFolder
    ? folderExpanded !== false
    : Boolean(item.expanded);
  const isSelected =
    !isFolder &&
    ((item.elementId != null && item.elementId === selectedElementId) ||
      (item.featureId != null && item.featureId === selectedFeatureId));
  const hasChildren = item.children && item.children.length > 0;
  const isRenaming = renamingNodeId === item.sourceNodeId;
  const status = item.featureStatus;
  const statusLabel = status === "ROLLED_BACK" ? "ROLLED BACK" : (status ?? "");
  const canDrag = Boolean(!isFolder && item.featureId && onReorderFeature);

  const handleClick = () => {
    if (isFolder) {
      onToggleFolder?.(item.id);
      return;
    }
    if (item.elementId) {
      // Pass the row's own feature: a failed feature resolves to the body it
      // was applied to, and the inspector must report that row's status.
      onSelect(item.elementId, item.featureId);
    } else if (item.featureId && onSelectFeature) {
      onSelectFeature(item.featureId);
    }
  };

  const handleDoubleClick = () => {
    if (isFolder) return;
    if (onEditSketch && item.itemType === "sketch" && item.sourceNodeId) {
      onEditSketch(item.sourceNodeId);
    } else if (
      onEditSketch &&
      (item.itemType === "profile" || item.itemType === "body") &&
      parentSketchId
    ) {
      onEditSketch(parentSketchId);
    } else if (item.sourceNodeId) {
      onStartRename(item.sourceNodeId);
    }
  };

  const isUserFeature =
    item.itemType !== "plane" &&
    item.itemType !== "axis" &&
    item.itemType !== "origin-point" &&
    item.itemType !== "folder";

  return (
    <>
      <div
        className={`group flex items-center py-1 pr-1 cursor-pointer rounded-sm ${
          dragOver
            ? "ring-1 ring-[#1a73e8]"
            : isSelected
              ? "border-l-2 border-[#1a73e8] bg-[#d2e3fc]"
              : "border-l-2 border-transparent hover:bg-[#f1f3f4]"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        draggable={canDrag}
        onDragStart={(e) => {
          if (!canDrag || !item.featureId) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(
            "application/x-scadgen-feature",
            item.featureId,
          );
        }}
        onDragOver={(e) => {
          if (
            isFolder ||
            item.featureIndex === undefined ||
            (!onReorderFeature && !onRollbackToFeature)
          )
            return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          if (isFolder || item.featureIndex === undefined) return;
          // The rollback bar drops onto a row: roll back after that feature.
          const bar = e.dataTransfer.getData("application/x-scadgen-rollback");
          if (bar && item.featureId && onRollbackToFeature) {
            e.preventDefault();
            onRollbackToFeature(item.featureId);
            return;
          }
          if (!onReorderFeature) return;
          const source = e.dataTransfer.getData(
            "application/x-scadgen-feature",
          );
          if (!source || source === item.featureId) return;
          e.preventDefault();
          // Insert-here: the half of the row under the cursor decides whether
          // the feature lands before or after this row.
          const rect = e.currentTarget.getBoundingClientRect();
          const after = e.clientY > rect.top + rect.height / 2;
          onReorderFeature(source, item.featureIndex + (after ? 1 : 0));
        }}
        onContextMenu={(e) =>
          onContextMenu(
            e,
            item,
            item.itemType === "sketch" && !item.featureOnly
              ? item.sourceNodeId
              : parentSketchId,
          )
        }
        data-testid={
          isFolder
            ? "feature-folder"
            : isUserFeature
              ? "feature-tree-row"
              : undefined
        }
        data-feature-id={item.featureId}
        data-feature-index={item.featureIndex}
        data-selected={isSelected ? "true" : "false"}
      >
        {/* Expand chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isFolder) onToggleFolder?.(item.id);
            else if (hasChildren && item.sourceNodeId)
              onToggleExpanded(item.sourceNodeId);
          }}
          aria-label={
            isFolder
              ? isExpanded
                ? "Collapse folder"
                : "Expand folder"
              : hasChildren
                ? "Toggle children"
                : "No children"
          }
          className="mr-0.5 flex h-4 w-4 flex-none items-center justify-center text-[#80868b] hover:text-[#3c4043]"
        >
          {hasChildren ? (
            <Icon name="chevron" className="w-3 h-3" expanded={isExpanded} />
          ) : null}
        </button>

        {/* Icon */}
        <span
          className={`mr-1.5 flex-none ${item.visible ? "text-[#5f6368]" : "text-[#bdc1c6]"}`}
        >
          <ItemIcon
            itemType={item.itemType}
            operationType={item.operationType}
            iconForType={iconForType}
          />
        </span>

        {/* Name or inline rename */}
        {isRenaming && item.sourceNodeId ? (
          <InlineRename
            initialName={item.label}
            onSubmit={(name) =>
              onFinishRename(item.sourceNodeId!, name, item.featureId)
            }
            onCancel={onCancelRename}
          />
        ) : (
          <span
            className={`min-w-0 flex-1 truncate text-[12px] ${
              item.visible ? "text-[#202124]" : "text-[#80868b]"
            }`}
          >
            {item.itemType === "operation" && item.operationType
              ? (labelForType?.(item.operationType) ?? item.label)
              : item.label}
          </span>
        )}

        {status && status !== "OK" && (
          <span
            data-testid="feature-status"
            title={
              item.featureDetail
                ? `${statusLabel}: ${item.featureDetail}`
                : statusLabel
            }
            className={`flex-none ml-1 px-1 py-px rounded text-[9px] font-semibold tracking-wide ${
              status === "ERROR"
                ? "bg-red-100 text-red-700"
                : status === "SUPPRESSED"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-[#e8eaed] text-[#5f6368]"
            }`}
          >
            {statusLabel}
          </span>
        )}

        {/* Visibility eye (shown on hover or when hidden) */}
        {!isFolder &&
          (item.sourceNodeId ||
            (item.elementId && onToggleElementVisibility)) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (item.sourceNodeId) onToggleVisibility(item.sourceNodeId);
                else if (item.elementId)
                  onToggleElementVisibility?.(item.elementId);
              }}
              className={`flex-none ml-1 w-5 h-5 flex items-center justify-center rounded ${
                item.visible
                  ? "text-[#80868b] opacity-0 hover:text-[#202124] group-hover:opacity-100"
                  : "text-[#bdc1c6] hover:text-[#5f6368]"
              }`}
              title={item.visible ? "Hide" : "Show"}
            >
              {item.visible ? <Icon name="eye" /> : <Icon name="eye-off" />}
            </button>
          )}
      </div>

      {status === "ERROR" && item.featureDetail && (
        <div
          data-testid="feature-error"
          role="alert"
          title={item.featureDetail}
          className="truncate pb-1 pl-8 pr-2 text-[10px] leading-tight text-red-600"
          style={{ paddingLeft: `${depth * 12 + 32}px` }}
        >
          {item.featureDetail}
        </div>
      )}

      {/* Children */}
      {hasChildren &&
        isExpanded &&
        item.children!.map((child) => (
          <BrowserItemRow
            key={child.id}
            item={child}
            depth={depth + 1}
            selectedElementId={selectedElementId}
            selectedFeatureId={selectedFeatureId}
            renamingNodeId={renamingNodeId}
            onSelect={onSelect}
            onSelectFeature={onSelectFeature}
            onToggleVisibility={onToggleVisibility}
            onToggleElementVisibility={onToggleElementVisibility}
            onToggleExpanded={onToggleExpanded}
            onContextMenu={onContextMenu}
            onStartRename={onStartRename}
            onFinishRename={onFinishRename}
            onCancelRename={onCancelRename}
            onEditSketch={onEditSketch}
            onReorderFeature={onReorderFeature}
            onRollbackToFeature={onRollbackToFeature}
            folderExpanded={folderExpanded}
            onToggleFolder={onToggleFolder}
            parentSketchId={
              item.itemType === "sketch" ? item.sourceNodeId : parentSketchId
            }
            iconForType={iconForType}
            labelForType={labelForType}
          />
        ))}
    </>
  );
};

const SectionHeader: FC<{
  section: BrowserSection;
  onToggle: (sectionId: string) => void;
}> = ({ section, onToggle }) => (
  <button
    onClick={() => onToggle(section.id)}
    aria-label={section.label}
    aria-expanded={section.expanded}
    className="flex w-full items-center px-2 py-1.5 text-[11px] font-medium text-[var(--cad-text-muted)] hover:bg-[var(--cad-chrome-hover)]"
  >
    <Icon
      name="chevron"
      className="w-3 h-3 mr-1 flex-none"
      expanded={section.expanded}
    />
    <span className="flex-1 text-left">{section.label}</span>
    {section.count > 0 && (
      <span className="font-normal text-[var(--cad-text-faint)]">
        ({section.count})
      </span>
    )}
  </button>
);

const BrowserPanel: FC<BrowserPanelProps> = ({
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
  iconForType,
  labelForType,
}) => {
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    item: BrowserItem | null;
    parentSketchId?: string | undefined;
  }>({ visible: false, x: 0, y: 0, item: null });

  const handleContextMenu = (
    e: React.MouseEvent,
    item: BrowserItem,
    parentSketchId?: string,
  ) => {
    // Only show context menu for items with a source node (not static origin items)
    if (!item.sourceNodeId) return;
    e.preventDefault();
    e.stopPropagation();
    // Onshape selects the row under the pointer before opening its menu, so
    // subsequent actions read exactly the feature the user right-clicked.
    if (item.elementId) onSelectNode(item.elementId, item.featureId);
    else if (item.featureId && onSelectFeature) onSelectFeature(item.featureId);
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      item,
      parentSketchId,
    });
  };

  const handleStartRename = (nodeId: string) => {
    setRenamingNodeId(nodeId);
  };

  const handleFinishRename = (
    nodeId: string,
    newName: string,
    featureId?: string,
  ) => {
    onRenameNode(nodeId, newName);
    if (featureId) onRenameFeature?.(featureId, newName);
    setRenamingNodeId(null);
  };

  const handleCancelRename = () => {
    setRenamingNodeId(null);
  };

  const hasAnyItems = sections.some(
    (s) => s.sectionType !== "origin" && s.count > 0,
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-transparent"
      data-testid="feature-tree"
    >
      {rollbackActive && (
        <div
          data-testid="rollback-banner"
          role="status"
          className="flex flex-none items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-900"
        >
          <span
            data-testid="rollback-bar"
            role="slider"
            aria-label="Rollback bar"
            aria-valuetext={rollbackLabel ?? "after a feature"}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("application/x-scadgen-rollback", "1");
            }}
            title="Drag onto a feature to roll back after it"
            className="flex-none cursor-grab select-none px-1 text-amber-700"
          >
            ⠿
          </span>
          <span className="text-[11px] leading-tight flex-1">
            Rolled back {rollbackLabel ?? "after a feature"}
          </span>
          {onStepRollback && (
            <button
              onClick={() => onStepRollback(1)}
              aria-label="Roll forward one feature"
              className="flex-none rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-300"
            >
              Forward
            </button>
          )}
          {onClearRollback && (
            <button
              onClick={onClearRollback}
              aria-label="Clear rollback"
              className="flex-none rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-700"
            >
              Resume
            </button>
          )}
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto py-0.5">
        {sections.map((section) => (
          <div key={section.id}>
            <SectionHeader
              section={section}
              onToggle={onToggleSectionExpanded}
            />
            {section.expanded && section.items.length > 0 && (
              <div className="pb-1">
                {section.items.map((item) => (
                  <BrowserItemRow
                    key={item.id}
                    item={item}
                    depth={1}
                    selectedElementId={selectedElementId}
                    selectedFeatureId={selectedFeatureId}
                    renamingNodeId={renamingNodeId}
                    onSelect={onSelectNode}
                    onSelectFeature={onSelectFeature}
                    onToggleVisibility={onToggleVisibility}
                    onToggleElementVisibility={onToggleElementVisibility}
                    onToggleExpanded={onToggleItemExpanded}
                    onContextMenu={handleContextMenu}
                    onStartRename={handleStartRename}
                    onFinishRename={handleFinishRename}
                    onCancelRename={handleCancelRename}
                    onEditSketch={onEditSketch}
                    onReorderFeature={onReorderFeature}
                    onRollbackToFeature={onRollbackToFeature}
                    folderExpanded={!collapsedFolders.has(item.id)}
                    onToggleFolder={toggleFolder}
                    iconForType={iconForType}
                    labelForType={labelForType}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {!hasAnyItems && (
          <div className="px-4 py-5 text-center text-xs leading-relaxed text-[var(--cad-text-faint)]">
            No features yet.
            <br />
            Create a sketch to get started.
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu.item && (
        <BrowserContextMenu
          visible={contextMenu.visible}
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.item.sourceNodeId ?? contextMenu.item.id}
          nodeLabel={contextMenu.item.label}
          nodeVisible={contextMenu.item.visible}
          onClose={() =>
            setContextMenu((prev) => ({ ...prev, visible: false }))
          }
          onRename={handleStartRename}
          onDelete={onDeleteNode}
          onDeleteFeature={onDeleteFeature}
          onToggleVisibility={
            contextMenu.item.featureOnly && contextMenu.item.elementId
              ? () => onToggleElementVisibility?.(contextMenu.item!.elementId!)
              : onToggleVisibility
          }
          onEditSketch={onEditSketch}
          sourceSketchId={contextMenu.parentSketchId}
          feature={
            contextMenu.item.featureId
              ? {
                  id: contextMenu.item.featureId,
                  suppressed: !!contextMenu.item.suppressed,
                  index: contextMenu.item.featureIndex ?? 0,
                  count: contextMenu.item.featureCount ?? 0,
                  folder: contextMenu.item.featureFolder,
                  dependents: contextMenu.item.featureDependents,
                  status: contextMenu.item.featureStatus,
                  featureOnly: contextMenu.item.featureOnly,
                }
              : undefined
          }
          rollbackActive={rollbackActive}
          onSetFeatureSuppressed={onSetFeatureSuppressed}
          onRollbackToFeature={onRollbackToFeature}
          onClearRollback={onClearRollback}
          onMoveFeature={onMoveFeature}
          onSetFeatureFolder={onSetFeatureFolder}
          onEditFeature={onEditFeature}
          onRetryFeature={onRetryFeature}
          onMoveFeatureWithDependents={onMoveFeatureWithDependents}
        />
      )}
    </div>
  );
};

export default BrowserPanel;
