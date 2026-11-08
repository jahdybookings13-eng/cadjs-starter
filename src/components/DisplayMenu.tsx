import React, { useEffect, useRef, useState } from "react";
import {
  DISPLAY_STYLES,
  SECTION_AXES,
  type DisplayStyle,
  type SectionAxis,
} from "../model/display";

interface DisplayMenuProps {
  displayStyle: DisplayStyle;
  onDisplayStyleChange: (style: DisplayStyle) => void;
  projectionType: "perspective" | "orthographic";
  onToggleProjection: () => void;
  showGroundPlane: boolean;
  onToggleGroundPlane: () => void;
  sectionAxis: SectionAxis;
  onSectionAxisChange: (axis: SectionAxis) => void;
  sectionOffset: number;
  sectionMin: number;
  sectionMax: number;
  sectionStep: number;
  onSectionOffsetChange: (offset: number) => void;
  sectionFlip: boolean;
  onSectionFlipChange: (flip: boolean) => void;
  originVisibility: Record<string, boolean>;
  onToggleOrigin: (id: string) => void;
}

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 flex-none items-center justify-center ${
        checked ? "text-[var(--cad-accent)]" : "text-transparent"
      }`}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path
          d="m3 8.5 3 3 7-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const itemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]";

const ORIGIN_TOGGLES = [
  { id: "origin-xy", label: "XY plane" },
  { id: "origin-xz", label: "XZ plane" },
  { id: "origin-yz", label: "YZ plane" },
  { id: "origin-x-axis", label: "X axis" },
  { id: "origin-y-axis", label: "Y axis" },
  { id: "origin-z-axis", label: "Z axis" },
  { id: "origin-point", label: "Origin point" },
] as const;

export const DisplayMenu: React.FC<DisplayMenuProps> = ({
  displayStyle,
  onDisplayStyleChange,
  projectionType,
  onToggleProjection,
  showGroundPlane,
  onToggleGroundPlane,
  sectionAxis,
  onSectionAxisChange,
  sectionOffset,
  sectionMin,
  sectionMax,
  sectionStep,
  onSectionOffsetChange,
  sectionFlip,
  onSectionFlipChange,
  originVisibility,
  onToggleOrigin,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeStyle =
    DISPLAY_STYLES.find((style) => style.id === displayStyle) ??
    DISPLAY_STYLES[0]!;
  const projectionLabel =
    projectionType === "perspective" ? "Perspective" : "Orthographic";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        data-testid="display-menu"
        onClick={() => setOpen((value) => !value)}
        className="cad-icon-button"
        title={`Display: ${activeStyle.label}`}
        aria-label="Display settings"
        aria-haspopup="menu"
        aria-expanded={open}
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
            strokeWidth={1.7}
            d="M3.5 5.5h17v11h-17v-11Zm5 14h7M12 16.5v3"
          />
          <path strokeLinecap="round" strokeWidth={1.5} d="M7 9.5h3m-3 3h7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Display settings"
          data-testid="display-menu-panel"
          className="absolute right-0 top-full z-50 mt-1 w-[284px] rounded-md border border-[var(--cad-border-strong)] bg-white py-1 text-[var(--cad-text)] shadow-xl"
        >
          <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--cad-text-faint)]">
            Display style
          </div>
          {DISPLAY_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              role="menuitemradio"
              aria-label={style.label}
              aria-checked={displayStyle === style.id}
              data-testid={`display-style-${style.id}`}
              title={style.detail}
              className={itemClass}
              onClick={() => {
                onDisplayStyleChange(style.id);
                setOpen(false);
              }}
            >
              <CheckMark checked={displayStyle === style.id} />
              <span className="min-w-0 flex-1">{style.label}</span>
            </button>
          ))}

          <div className="my-1 border-t border-[var(--cad-border)]" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-label={projectionLabel}
            aria-checked={projectionType === "perspective"}
            data-testid="display-perspective"
            className={itemClass}
            onClick={() => {
              onToggleProjection();
              setOpen(false);
            }}
          >
            <CheckMark checked={projectionType === "perspective"} />
            <span className="flex-1">{projectionLabel}</span>
            <span className="text-[10px] text-[var(--cad-text-faint)]">
              projection
            </span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-label="Grid"
            aria-checked={showGroundPlane}
            data-testid="display-grid"
            className={itemClass}
            onClick={() => {
              onToggleGroundPlane();
              setOpen(false);
            }}
          >
            <CheckMark checked={showGroundPlane} />
            <span className="flex-1">Grid</span>
            <span className="text-[10px] text-[var(--cad-text-faint)]">
              ground plane
            </span>
          </button>

          <div className="my-1 border-t border-[var(--cad-border)]" />
          <div
            role="group"
            aria-label="Origin visibility"
            className="px-3 py-1.5"
          >
            <div className="text-[11px] font-medium">Origin</div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {ORIGIN_TOGGLES.map((item) => {
                const visible = originVisibility[item.id] ?? true;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-label={item.label}
                    aria-checked={visible}
                    data-testid={`display-${item.id}`}
                    className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] ${
                      visible
                        ? "border-[var(--cad-accent)] bg-[#e8f0fe] text-[var(--cad-accent)]"
                        : "border-[var(--cad-border)] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
                    }`}
                    onClick={() => onToggleOrigin(item.id)}
                  >
                    <CheckMark checked={visible} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="my-1 border-t border-[var(--cad-border)]" />
          <div role="group" aria-label="Section view" className="px-3 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium">Section view</span>
              <button
                type="button"
                aria-label="Turn off section view"
                aria-pressed={sectionAxis === "off"}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  sectionAxis === "off"
                    ? "bg-[var(--cad-accent)] text-white"
                    : "text-[var(--cad-text-muted)] hover:bg-[var(--cad-chrome-hover)]"
                }`}
                onClick={() => onSectionAxisChange("off")}
              >
                Off
              </button>
            </div>
            <div className="mt-1 flex gap-1">
              {SECTION_AXES.map((axis) => (
                <button
                  key={axis.id}
                  type="button"
                  aria-label={`${axis.label} section plane`}
                  aria-pressed={sectionAxis === axis.id}
                  data-testid={`display-section-${axis.id}`}
                  className={`flex-1 rounded border px-2 py-1 text-[11px] ${
                    sectionAxis === axis.id
                      ? "border-[var(--cad-accent)] bg-[#e8f0fe] text-[var(--cad-accent)]"
                      : "border-[var(--cad-border)] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
                  }`}
                  onClick={() => onSectionAxisChange(axis.id)}
                >
                  {axis.label}
                </button>
              ))}
            </div>
            {sectionAxis !== "off" && (
              <>
                <label className="mt-2 block text-[10px] text-[var(--cad-text-muted)]">
                  <span className="flex items-center justify-between">
                    <span>Offset</span>
                    <span className="font-mono tabular-nums">
                      {sectionOffset.toFixed(3)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={sectionMin}
                    max={sectionMax}
                    step={sectionStep}
                    value={sectionOffset}
                    aria-label="Section offset"
                    data-testid="display-section-offset"
                    onChange={(event) =>
                      onSectionOffsetChange(Number(event.target.value))
                    }
                    className="mt-1 w-full accent-[var(--cad-accent)]"
                  />
                </label>
                <button
                  type="button"
                  aria-label="Flip section side"
                  aria-pressed={sectionFlip}
                  className="mt-1 w-full rounded border border-[var(--cad-border)] px-2 py-1 text-[10px] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
                  onClick={() => onSectionFlipChange(!sectionFlip)}
                >
                  Flip side
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DisplayMenu;
