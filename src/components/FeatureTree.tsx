import React, { FC, useState, useRef, useEffect } from "react";
import { BrowserSection, BrowserItem, OperationType } from "@vitekk02/cadjs";
import { Icon } from "./icons/BrowserIcons";
import BrowserContextMenu from "./BrowserContextMenu";

interface BrowserPanelProps {
  sections: BrowserSection[];
  selectedElementId?: string | undefined;
  onSelectNode: (elementId: string) => void;
  onToggleVisibility: (nodeId: string) => void;
  onToggleSectionExpanded: (sectionId: string) => void;
  onToggleItemExpanded: (nodeId: string) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onEditSketch?: ((sketchId: string) => void) | undefined;
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
      className="flex-1 min-w-0 px-1 py-0 text-sm bg-gray-700 text-white rounded border border-blue-500 focus:outline-none"
    />
  );
};

const BrowserItemRow: FC<{
  item: BrowserItem;
  depth: number;
  selectedElementId?: string | undefined;
  renamingNodeId: string | null;
  onSelect: (elementId: string) => void;
  onToggleVisibility: (nodeId: string) => void;
  onToggleExpanded: (nodeId: string) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: BrowserItem,
    parentSketchId?: string,
  ) => void;
  onStartRename: (nodeId: string) => void;
  onFinishRename: (nodeId: string, newName: string) => void;
  onCancelRename: () => void;
  onEditSketch?: ((sketchId: string) => void) | undefined;
  parentSketchId?: string | undefined;
  iconForType?:
    | ((operationType: string) => React.ReactNode | undefined)
    | undefined;
  labelForType?: ((operationType: string) => string | undefined) | undefined;
}> = ({
  item,
  depth,
  selectedElementId,
  renamingNodeId,
  onSelect,
  onToggleVisibility,
  onToggleExpanded,
  onContextMenu,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onEditSketch,
  parentSketchId,
  iconForType,
  labelForType,
}) => {
  const isSelected =
    item.elementId != null && item.elementId === selectedElementId;
  const hasChildren = item.children && item.children.length > 0;
  const isRenaming = renamingNodeId === item.sourceNodeId;

  const handleClick = () => {
    if (item.elementId) {
      onSelect(item.elementId);
    }
  };

  const handleDoubleClick = () => {
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
    item.itemType !== "origin-point";

  return (
    <>
      <div
        className={`group flex items-center py-1 pr-1 cursor-pointer rounded-sm ${
          isSelected
            ? "bg-blue-900/60 border-l-2 border-blue-400"
            : "border-l-2 border-transparent hover:bg-gray-700/50"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) =>
          onContextMenu(
            e,
            item,
            item.itemType === "sketch" ? item.sourceNodeId : parentSketchId,
          )
        }
        data-testid={isUserFeature ? "feature-tree-row" : undefined}
      >
        {/* Expand chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren && item.sourceNodeId)
              onToggleExpanded(item.sourceNodeId);
          }}
          aria-label={hasChildren ? "Toggle children" : "No children"}
          className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-300 flex-none mr-0.5"
        >
          {hasChildren ? (
            <Icon name="chevron" className="w-3 h-3" expanded={item.expanded} />
          ) : null}
        </button>

        {/* Icon */}
        <span
          className={`mr-1.5 flex-none ${item.visible ? "text-gray-400" : "text-gray-600"}`}
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
            onSubmit={(name) => onFinishRename(item.sourceNodeId!, name)}
            onCancel={onCancelRename}
          />
        ) : (
          <span
            className={`text-sm truncate flex-1 min-w-0 ${
              item.visible ? "text-gray-200" : "text-gray-500"
            }`}
          >
            {item.itemType === "operation" && item.operationType
              ? (labelForType?.(item.operationType) ?? item.label)
              : item.label}
          </span>
        )}

        {/* Visibility eye (shown on hover or when hidden) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (item.sourceNodeId) onToggleVisibility(item.sourceNodeId);
          }}
          className={`flex-none ml-1 w-5 h-5 flex items-center justify-center rounded ${
            item.visible
              ? "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-200"
              : "text-gray-600 hover:text-gray-400"
          }`}
          title={item.visible ? "Hide" : "Show"}
        >
          {item.visible ? <Icon name="eye" /> : <Icon name="eye-off" />}
        </button>
      </div>

      {/* Children */}
      {hasChildren &&
        item.expanded &&
        item.children!.map((child) => (
          <BrowserItemRow
            key={child.id}
            item={child}
            depth={depth + 1}
            selectedElementId={selectedElementId}
            renamingNodeId={renamingNodeId}
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            onToggleExpanded={onToggleExpanded}
            onContextMenu={onContextMenu}
            onStartRename={onStartRename}
            onFinishRename={onFinishRename}
            onCancelRename={onCancelRename}
            onEditSketch={onEditSketch}
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
    className="w-full flex items-center py-1.5 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:bg-gray-700/30"
  >
    <Icon
      name="chevron"
      className="w-3 h-3 mr-1 flex-none"
      expanded={section.expanded}
    />
    <span className="flex-1 text-left">{section.label}</span>
    {section.count > 0 && (
      <span className="text-gray-500 font-normal normal-case tracking-normal">
        ({section.count})
      </span>
    )}
  </button>
);

const BrowserPanel: FC<BrowserPanelProps> = ({
  sections,
  selectedElementId,
  onSelectNode,
  onToggleVisibility,
  onToggleSectionExpanded,
  onToggleItemExpanded,
  onRenameNode,
  onDeleteNode,
  onEditSketch,
  iconForType,
  labelForType,
}) => {
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
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

  const handleFinishRename = (nodeId: string, newName: string) => {
    onRenameNode(nodeId, newName);
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
      className="h-full flex flex-col bg-gray-800/90"
      data-testid="feature-tree"
    >
      {/* Panel header */}
      <div className="flex-none px-3 py-2 border-b border-gray-700">
        <h2 className="text-white font-bold text-sm">Browser</h2>
      </div>

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
                    renamingNodeId={renamingNodeId}
                    onSelect={onSelectNode}
                    onToggleVisibility={onToggleVisibility}
                    onToggleExpanded={onToggleItemExpanded}
                    onContextMenu={handleContextMenu}
                    onStartRename={handleStartRename}
                    onFinishRename={handleFinishRename}
                    onCancelRename={handleCancelRename}
                    onEditSketch={onEditSketch}
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
          <div className="px-4 py-6 text-gray-500 text-sm text-center">
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
          onToggleVisibility={onToggleVisibility}
          onEditSketch={onEditSketch}
          sourceSketchId={contextMenu.parentSketchId}
        />
      )}
    </div>
  );
};

export default BrowserPanel;
