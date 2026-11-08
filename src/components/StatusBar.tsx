import React from "react";
import * as THREE from "three";
import { SceneElement, SceneMode, Sketch } from "@vitekk02/cadjs";

interface StatusBarProps {
  cursorPosition: THREE.Vector3 | null;
  mode: SceneMode;
  activeSketch: Sketch | null;
  moveSelectedObject: string | null;
  elements: SceneElement[];
}

export const StatusBar: React.FC<StatusBarProps> = ({
  cursorPosition,
  mode,
  activeSketch,
  moveSelectedObject,
  elements,
}) => {
  const selectedElement = moveSelectedObject
    ? (elements.find((el) => el.nodeId === moveSelectedObject) ?? null)
    : null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 hidden h-6 items-center overflow-hidden whitespace-nowrap border-t border-[var(--cad-border)] bg-[var(--cad-chrome)] px-3 font-mono text-[10px] text-[var(--cad-text-muted)] sm:flex">
      <span className="flex-none tabular-nums">
        X {cursorPosition ? cursorPosition.x.toFixed(2) : "—"} &nbsp; Y{" "}
        {cursorPosition ? cursorPosition.y.toFixed(2) : "—"} &nbsp; Z{" "}
        {cursorPosition ? cursorPosition.z.toFixed(2) : "—"}
      </span>

      {mode === "sketch" && activeSketch && (
        <span className="hidden md:contents">
          <div className="mx-2 h-3.5 w-px flex-none bg-[var(--cad-border)]" />
          <span className="flex-none text-[var(--cad-accent)]">
            {activeSketch.plane.type}
          </span>
          <div className="mx-2 h-3.5 w-px flex-none bg-[var(--cad-border)]" />
          <span className="flex-none">
            DOF{" "}
            <span
              className={
                activeSketch.dof === 0 ? "text-emerald-400" : "text-amber-300"
              }
            >
              {activeSketch.dof}
            </span>
          </span>
          <div className="mx-2 h-3.5 w-px flex-none bg-[var(--cad-border)]" />
          <span
            className={`flex-none ${
              activeSketch.status === "fully_constrained"
                ? "text-emerald-400"
                : activeSketch.status === "overconstrained"
                  ? "text-red-400"
                  : "text-amber-300"
            }`}
          >
            {activeSketch.status === "fully_constrained"
              ? "Constrained"
              : activeSketch.status === "overconstrained"
                ? "Over-constrained"
                : "Under-constrained"}
          </span>
          <div className="mx-2 h-3.5 w-px flex-none bg-[var(--cad-border)]" />
          <span className="flex-none">
            {activeSketch.primitives.length}P {activeSketch.constraints.length}C
          </span>
        </span>
      )}

      {selectedElement && moveSelectedObject && (
        <span className="ml-auto flex-none truncate">
          {moveSelectedObject} ({selectedElement.position.x.toFixed(1)},{" "}
          {selectedElement.position.y.toFixed(1)},{" "}
          {selectedElement.position.z.toFixed(1)})
        </span>
      )}

      <span className="ml-auto flex flex-none items-center gap-3 pl-4">
        <span className="text-[var(--cad-text-faint)]">Units: mm</span>
        <span className="rounded border border-[var(--cad-border)] px-1 text-[9px] uppercase tracking-wide text-[var(--cad-text-faint)]">
          {mode}
        </span>
      </span>
    </div>
  );
};
