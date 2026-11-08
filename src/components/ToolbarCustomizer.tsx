import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  TOOLBAR_GROUPS,
  isToolbarToolVisible,
  type ToolbarCustomization,
} from "../model/toolbarCustomization";

export interface ToolbarCustomizerProps {
  customization: ToolbarCustomization;
  x: number;
  y: number;
  onToggle: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * Right-click popover for the primary toolbar. The position is the pointer
 * location; the panel stays inside the viewport on small screens.
 */
export const ToolbarCustomizer: React.FC<ToolbarCustomizerProps> = ({
  customization,
  x,
  y,
  onToggle,
  onReset,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left =
    typeof window === "undefined" ? x : Math.min(x, window.innerWidth - 292);
  const top =
    typeof window === "undefined" ? y : Math.min(y, window.innerHeight - 390);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Customize toolbar"
      data-testid="toolbar-customizer"
      className="cad-light-panel fixed z-[120] w-72 rounded-md border border-[var(--cad-border-strong)] bg-white p-3 text-xs text-[var(--cad-text)] shadow-2xl"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Customize toolbar</span>
        <button
          type="button"
          aria-label="Close toolbar customization"
          onClick={onClose}
          className="rounded px-1 text-gray-500 hover:bg-gray-700 hover:text-gray-100"
        >
          ×
        </button>
      </div>
      <p className="mb-2 text-[10px] text-gray-500">
        Right-click the toolbar to reopen. Unchecked tools are hidden, not
        removed from the app.
      </p>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {TOOLBAR_GROUPS.map((group) => (
          <section key={group.id} aria-label={group.label}>
            <div className="mb-1 text-[9px] uppercase tracking-wide text-gray-500">
              {group.label}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {group.tools.map((tool) => {
                const visible = isToolbarToolVisible(customization, tool.id);
                return (
                  <label
                    key={tool.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      aria-label={`Show ${tool.label}`}
                      onChange={() => onToggle(tool.id)}
                      className="accent-blue-500"
                    />
                    <span>{tool.label}</span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-gray-700 pt-2">
        <span className="text-[10px] text-gray-500">
          {customization.hidden.length} hidden
        </span>
        <button
          type="button"
          onClick={onReset}
          data-testid="toolbar-reset"
          className="rounded bg-gray-700 px-2 py-1 text-[11px] hover:bg-gray-600"
        >
          Reset toolbar
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default ToolbarCustomizer;
