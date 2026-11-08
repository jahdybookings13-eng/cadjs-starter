import React, { useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { NamedView } from "@vitekk02/cadjs/react";
import { Icon } from "./icons/BrowserIcons";

type NavTool = "orbit" | "pan" | "zoom";

interface NavigationBarProps {
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  navToolActiveRef: React.MutableRefObject<boolean>;
  onFitAll: () => void;
  onViewChange?: ((view: NamedView) => void) | undefined;
}

const VIEW_ITEMS: { label: string; view: NamedView }[] = [
  { label: "Front", view: "front" },
  { label: "Back", view: "back" },
  { label: "Top", view: "top" },
  { label: "Bottom", view: "bottom" },
  { label: "Left", view: "left" },
  { label: "Right", view: "right" },
  { label: "Isometric", view: "isometric" },
];

const NAV_TOOL_MOUSE: Record<NavTool, THREE.MOUSE> = {
  orbit: THREE.MOUSE.ROTATE,
  pan: THREE.MOUSE.PAN,
  zoom: THREE.MOUSE.DOLLY,
};

const NAV_TOOL_CURSOR: Record<NavTool, string> = {
  orbit: "grab",
  pan: "move",
  zoom: "ns-resize",
};

const NavigationBar: React.FC<NavigationBarProps> = ({
  controlsRef,
  navToolActiveRef,
  onFitAll,
  onViewChange,
}) => {
  const [activeTool, setActiveTool] = useState<NavTool | null>(null);
  const [viewsOpen, setViewsOpen] = useState(false);

  const deactivate = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.mouseButtons.LEFT = null as any;
      const canvas = controlsRef.current.domElement as HTMLElement;
      canvas.style.cursor = "";
    }
    navToolActiveRef.current = false;
    setActiveTool(null);
  }, [controlsRef, navToolActiveRef]);

  const activate = useCallback(
    (tool: NavTool) => {
      if (controlsRef.current) {
        controlsRef.current.mouseButtons.LEFT = NAV_TOOL_MOUSE[tool];
        const canvas = controlsRef.current.domElement as HTMLElement;
        canvas.style.cursor = NAV_TOOL_CURSOR[tool];
      }
      navToolActiveRef.current = true;
      setActiveTool(tool);
    },
    [controlsRef, navToolActiveRef],
  );

  const handleToggle = useCallback(
    (tool: NavTool) => {
      if (activeTool === tool) {
        deactivate();
      } else {
        activate(tool);
      }
    },
    [activeTool, activate, deactivate],
  );

  // Escape and right-click deactivation
  useEffect(() => {
    if (!activeTool) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        deactivate();
      }
    };
    const handleContextMenu = () => {
      deactivate();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [activeTool, deactivate]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      navToolActiveRef.current = false;
    };
  }, [navToolActiveRef]);

  const btnClass = (tool: NavTool) =>
    `cad-icon-button !h-7 !min-w-7 md:!h-6 md:!min-w-6 ${
      activeTool === tool ? "!bg-[var(--cad-accent-strong)] !text-white" : ""
    }`;

  return (
    <div className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-[var(--cad-border-strong)] bg-[var(--cad-chrome)]/95 px-1 py-0.5 shadow-lg backdrop-blur-sm">
      <button
        className={btnClass("orbit")}
        onClick={() => handleToggle("orbit")}
        title="Orbit (Alt+Left-click)"
        aria-label="Orbit"
      >
        <Icon name="orbit" className="h-5 w-5 md:h-4 md:w-4" />
      </button>
      <button
        className={btnClass("pan")}
        onClick={() => handleToggle("pan")}
        title="Pan"
        aria-label="Pan"
      >
        <Icon name="pan" className="h-5 w-5 md:h-4 md:w-4" />
      </button>
      <button
        className={btnClass("zoom")}
        onClick={() => handleToggle("zoom")}
        title="Zoom"
        aria-label="Zoom"
      >
        <Icon name="zoom" className="h-5 w-5 md:h-4 md:w-4" />
      </button>
      <div className="mx-0.5 h-4 w-px bg-[var(--cad-border)]" />
      <button
        className="cad-icon-button !h-7 !min-w-7 md:!h-6 md:!min-w-6"
        onClick={onFitAll}
        title="Fit all (F)"
        aria-label="Fit all"
      >
        <Icon name="fit-all" className="h-5 w-5 md:h-4 md:w-4" />
      </button>
      {onViewChange && (
        <div className="relative">
          <button
            type="button"
            className="cad-icon-button !h-7 !min-w-7 px-1.5 text-[10px] md:!h-6"
            onClick={() => setViewsOpen((value) => !value)}
            title="Standard views"
            aria-label="Standard views"
            aria-haspopup="menu"
            aria-expanded={viewsOpen}
          >
            Views
          </button>
          {viewsOpen && (
            <div
              role="menu"
              aria-label="Standard views"
              className="absolute bottom-full right-0 z-50 mb-1 w-40 rounded-md border border-[var(--cad-border-strong)] bg-white py-1 shadow-xl"
            >
              {VIEW_ITEMS.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  role="menuitem"
                  aria-label={item.label}
                  onClick={() => {
                    setViewsOpen(false);
                    onViewChange(item.view);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NavigationBar;
