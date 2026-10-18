import React, { FC, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PickItem } from "@vitekk02/cadjs";

interface SelectOtherMenuProps {
  visible: boolean;
  x: number;
  y: number;
  items: PickItem[];
  onPick: (item: PickItem) => void;
  onHover?: ((item: PickItem | null) => void) | undefined;
  onClose: () => void;
}

const SelectOtherMenu: FC<SelectOtherMenuProps> = ({
  visible,
  x,
  y,
  items,
  onPick,
  onHover,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  useLayoutEffect(() => {
    if (!visible) return;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    setClamped({ left, top });
  }, [visible, x, y, items.length]);

  useEffect(() => {
    if (!visible) return;
    const handleDocMouseDown = (event: MouseEvent) => {
      const el = menuRef.current;
      if (el && !el.contains(event.target as Node)) {
        onHover?.(null);
        onClose();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onHover?.(null);
        onClose();
      }
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [visible, onClose, onHover]);

  if (!visible || items.length === 0) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="bg-gray-800 rounded shadow-lg border border-gray-600 py-1 min-w-[180px] max-h-[320px] overflow-y-auto"
      style={{
        position: "fixed",
        left: `${clamped.left}px`,
        top: `${clamped.top}px`,
        zIndex: 9999,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1 text-xs text-gray-400 border-b border-gray-700">
        Select Other
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onMouseEnter={() => onHover?.(item)}
          onMouseLeave={() => onHover?.(null)}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onHover?.(null);
            onPick(item);
          }}
          className="w-full px-3 py-1.5 text-left text-sm text-white hover:bg-gray-700 flex justify-between items-center gap-3"
        >
          <span className="truncate">{item.label}</span>
          <span className="text-xs text-gray-400 tabular-nums">
            {item.distance.toFixed(2)}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
};

export default SelectOtherMenu;
