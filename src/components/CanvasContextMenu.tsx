import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

import {
  allowedOperations,
  type MenuOp,
  type SelectionKind,
} from "../model/operationMenu";
import { MODE_OPERATION_IDS } from "../model/operationsCatalog";

interface CanvasContextMenuProps {
  x: number;
  y: number;
  selectionKind: SelectionKind;
  availableOps?: ReadonlySet<string>;
  onClose: () => void;
  onRunOperation: (id: string) => void;
  onAppearance: () => void;
}

function menuItems(
  kind: SelectionKind,
  availableOps?: ReadonlySet<string>,
): MenuOp[] {
  const seen = new Set<string>();
  return allowedOperations(kind).filter((op) => {
    if (seen.has(op.id)) return false;
    seen.add(op.id);
    return (
      MODE_OPERATION_IDS.has(op.id) || !availableOps || availableOps.has(op.id)
    );
  });
}

export const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  x,
  y,
  selectionKind,
  availableOps,
  onClose,
  onRunOperation,
  onAppearance,
}) => {
  const items = useMemo(
    () => menuItems(selectionKind, availableOps),
    [selectionKind, availableOps],
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-testid="canvas-context-menu"]')) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 252));
  const top = Math.max(8, Math.min(y, window.innerHeight - 528));

  return createPortal(
    <div
      role="menu"
      aria-label={
        selectionKind === "empty" ? "Create features" : "Body operations"
      }
      data-testid="canvas-context-menu"
      className="fixed z-[120] max-h-[min(70vh,520px)] w-60 overflow-y-auto rounded-md border border-[var(--cad-border-strong)] bg-white py-1 text-[var(--cad-text)] shadow-2xl"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--cad-text-muted)]">
        {selectionKind === "empty" ? "Create" : "Selected body"}
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-[var(--cad-text-muted)]">
          No operations for this selection.
        </div>
      ) : (
        items.map((op) => (
          <button
            key={op.id}
            type="button"
            role="menuitem"
            aria-label={op.label}
            data-testid={`canvas-op-${op.id}`}
            title={op.note ?? op.label}
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--cad-chrome-hover)] focus:bg-[var(--cad-chrome-hover)] focus:outline-none"
            onClick={() => {
              onClose();
              if (op.id === "appearance") onAppearance();
              else onRunOperation(op.id);
            }}
          >
            <span className="truncate">{op.label}</span>
            <span className="flex-none text-[9px] uppercase tracking-wide text-[var(--cad-text-faint)]">
              {op.featureType ?? ""}
            </span>
          </button>
        ))
      )}
      <div className="my-1 border-t border-[var(--cad-border)]" />
      <button
        type="button"
        role="menuitem"
        aria-label="All operations"
        data-testid="canvas-op-all"
        className="w-full px-3 py-1.5 text-left text-xs text-[var(--cad-text-muted)] hover:bg-[var(--cad-chrome-hover)]"
        onClick={onClose}
      >
        Use Operations toolbar for all features
      </button>
    </div>,
    document.body,
  );
};
