import React, { useEffect, useMemo, useRef, useState } from "react";
import { SceneMode, type UndoableSnapshot } from "@vitekk02/cadjs";
import { UndoRedoMenus } from "./UndoRedoMenus";
import {
  FASTENER_FAMILIES,
  resolvePreset,
  type FastenerFamily,
  type FastenerSpec,
} from "../model/fastenerPresets";
import { type HeadShapeId, type TipStyle } from "../model/headShapes";
import { type ThreadStandard, THREAD_SIZES } from "../model/threadStandards";
import {
  PRIMITIVE_SHAPES,
  defaultPrimitiveOptions,
  type ShapeKind,
} from "../model/primitiveLibrary";
import {
  defaultToolbarCustomization,
  isToolbarToolVisible,
  loadToolbarCustomization,
  resetToolbarCustomization,
  saveToolbarCustomization,
  toggleToolbarTool,
  type ToolbarCustomization,
} from "../model/toolbarCustomization";
import { ToolbarCustomizer } from "./ToolbarCustomizer";
import { OperationsMenu } from "./OperationsMenu";
import { TOOL_SEARCH_OPEN_EVENT } from "../model/toolSearch";

interface PrimaryToolbarProps {
  mode: SceneMode;
  setMode: (m: SceneMode) => void;
  isLocked: boolean;
  isOperationPending: boolean;
  isBooleanMode: boolean;
  sketchIsSelectingPlane: boolean;
  onSketchClick: () => void;
  showGroundPlane: boolean;
  toggleGroundPlane: () => void;
  onFitAll: () => void;
  onSelectFastener?: (spec: FastenerSpec) => void;
  onSelectPrimitive?: (kind: ShapeKind, opts: Record<string, unknown>) => void;
  availableOps?: ReadonlySet<string>;
  onRunOperation?: (id: string) => void;
  appearancePanelOpen?: boolean;
  onToggleAppearance?: () => void;
  // Undo/redo — forwarded to <UndoRedoMenus />.
  inSketch: boolean;
  canUndoSketch: boolean;
  canRedoSketch: boolean;
  undoSketch: () => void;
  redoSketch: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  undoActionName: string | null;
  redoActionName: string | null;
  undoStack: UndoableSnapshot[];
  redoStack: UndoableSnapshot[];
  undoDropdownOpen: boolean;
  redoDropdownOpen: boolean;
  setUndoDropdownOpen: (v: boolean) => void;
  setRedoDropdownOpen: (v: boolean) => void;
  undoDropdownRef: React.RefObject<HTMLDivElement | null>;
  redoDropdownRef: React.RefObject<HTMLDivElement | null>;
}

export function getModeLabel(
  mode: SceneMode,
  sketchIsSelectingPlane: boolean,
): string {
  switch (mode) {
    case "sketch":
      return sketchIsSelectingPlane ? "Select Plane" : "Sketch";
    case "extrude":
      return "Extrude";
    case "fillet":
      return "Fillet";
    case "move":
      return "Move";
    case "combine":
      return "Combine";
    case "sweep":
      return "Sweep";
    case "loft":
      return "Loft";
    case "revolve":
      return "Revolve";
    case "measure":
      return "Measure";
    default:
      return mode.charAt(0).toUpperCase() + mode.slice(1);
  }
}

type ToolGlyphName =
  | "sketch"
  | "extrude"
  | "move"
  | "fasteners"
  | "primitives"
  | "boolean"
  | "fillet"
  | "sweep"
  | "loft"
  | "revolve"
  | "measure"
  | "appearance"
  | "people";

function ToolGlyph({ name }: { name: ToolGlyphName }) {
  const common = {
    className: "cad-tool-icon",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  } as const;

  switch (name) {
    case "sketch":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="m4 20 4.2-1 10-10-3.2-3.2-10 10L4 20Zm9.8-12.4 3.2 3.2M14 4l1.5-1.5a1.4 1.4 0 0 1 2 0l4 4a1.4 1.4 0 0 1 0 2L20 10"
          />
        </svg>
      );
    case "extrude":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M5 9h14v10H5V9Zm0 0 3-3h14v10l-3 3M8 6v10M8 16h14"
          />
        </svg>
      );
    case "move":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3m-3 15-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3"
          />
        </svg>
      );
    case "fasteners":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M14.5 3.5 20.5 9.5M13 5l6 6M11 7l6 6-7.5 7.5H4.5v-5L11 7Zm-2 8 3 3"
          />
        </svg>
      );
    case "primitives":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v9m8-4.5-8 4.5m-8-4.5 8 4.5m0 9v-9"
          />
        </svg>
      );
    case "boolean":
      return (
        <svg {...common}>
          <circle cx="9" cy="12" r="5.5" strokeWidth={1.7} />
          <circle cx="15" cy="12" r="5.5" strokeWidth={1.7} />
        </svg>
      );
    case "fillet":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M4 20V9a5 5 0 0 1 5-5h11M4 20h16"
          />
          <path strokeWidth={1.4} d="M9 4v5H4" strokeDasharray="2 2" />
        </svg>
      );
    case "sweep":
      return (
        <svg {...common}>
          <rect x="4" y="8" width="6" height="8" rx="1" strokeWidth={1.7} />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M10 12c3-5 7-5 10 0m-2-3 2 3-3 2"
          />
        </svg>
      );
    case "loft":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M5 5h7v3H5V5Zm7 11h7v3h-7v-3ZM6 8c0 4 1 5 5 8m6-8c0 4-1 5-5 8"
          />
        </svg>
      );
    case "revolve":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeWidth={1.7} d="M12 3v18" />
          <ellipse cx="12" cy="12" rx="6" ry="3.2" strokeWidth={1.7} />
          <path
            strokeLinecap="round"
            strokeWidth={1.7}
            d="M6 9c0 1.6 2.7 2.8 6 2.8s6-1.2 6-2.8"
          />
        </svg>
      );
    case "measure":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="m4 16 12-12 4 4L8 20l-4-4Zm3-1 1.5 1.5M9.5 12.5 11 14m1.5-4.5L14 11m1.5-4.5L17 8"
          />
        </svg>
      );
    case "appearance":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M12 3c-4.4 0-8 3.6-8 8s3.6 8 8 8h1.5a2 2 0 0 0 0-4H13a2 2 0 0 1 0-4h3a5 5 0 0 0 0-10h-4Z"
          />
          <circle cx="7.5" cy="9" r="1" fill="currentColor" stroke="none" />
          <circle cx="10" cy="6.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="14" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" strokeWidth={1.7} />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14.5a5 5 0 0 1 3.5 5.5"
          />
        </svg>
      );
  }
}

const STANDARD_OPTIONS: { id: ThreadStandard; label: string }[] = [
  { id: "iso", label: "ISO M" },
  { id: "unified", label: "UNF" },
  { id: "npt", label: "NPT" },
];

const HEAD_OPTIONS: { id: HeadShapeId; label: string }[] = [
  { id: "hex", label: "Hex" },
  { id: "socketHex", label: "Socket hex" },
  { id: "pan", label: "Pan" },
  { id: "countersunk", label: "CSK" },
  { id: "round", label: "Round" },
  { id: "none", label: "None" },
];

const TIP_OPTIONS: { id: TipStyle; label: string }[] = [
  { id: "threaded", label: "Threaded" },
  { id: "partialThread", label: "Partial" },
  { id: "pointed", label: "Pointed" },
  { id: "flat", label: "Flat" },
  { id: "none", label: "None" },
];

function tipsAllowedFor(family: FastenerFamily): TipStyle[] {
  switch (family) {
    case "stud":
    case "bolt":
    case "machineScrew":
    case "cskScrew":
      return ["threaded", "flat", "pointed"];
    case "selfTap":
      return ["partialThread", "pointed"];
    case "selfDrill":
    case "woodScrew":
      return ["pointed"];
    case "tNut":
    case "wingNut":
    case "eyeBolt":
    case "screwHole":
      return ["none"];
  }
}

function headsAllowedFor(family: FastenerFamily): HeadShapeId[] {
  switch (family) {
    case "stud":
      return ["none"];
    case "screwHole":
      return ["none"];
    case "tNut":
      return ["tNut"];
    case "wingNut":
      return ["wing"];
    case "eyeBolt":
      return ["round"];
    case "cskScrew":
      return ["countersunk"];
    case "selfDrill":
    case "woodScrew":
      return ["pan", "socketHex"];
    default:
      return ["hex", "socketHex", "pan", "countersunk", "round", "none"];
  }
}

const FastenerDropdown: React.FC<{
  onSelect: (spec: FastenerSpec) => void;
  isLocked: boolean;
  hidden?: boolean;
}> = ({ onSelect, isLocked, hidden = false }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [famIdx, setFamIdx] = useState(0);
  const [std, setStd] = useState<ThreadStandard>("iso");
  const [size, setSize] = useState("M6");
  const [head, setHead] = useState<HeadShapeId>("hex");
  const [tip, setTip] = useState<TipStyle>("threaded");
  const [err, setErr] = useState<string | null>(null);

  const family = FASTENER_FAMILIES[famIdx]!;
  const familyId = family.familiesForStandard[std];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const sizes = useMemo(() => {
    const set = THREAD_SIZES[std];
    if (!set) return [] as string[];
    return [...set.coarse, ...set.fine];
  }, [std]);

  const validHeads = useMemo(
    () =>
      headsAllowedFor(familyId).filter((id) =>
        HEAD_OPTIONS.some((o) => o.id === id),
      ),
    [familyId],
  );
  const validTips = useMemo(
    () =>
      tipsAllowedFor(familyId).filter((id) =>
        TIP_OPTIONS.some((o) => o.id === id),
      ),
    [familyId],
  );

  // Cascade: family picks standard/size/head/tip defaults; standard picks size.
  const pickFamily = (i: number) => {
    setFamIdx(i);
    const f = FASTENER_FAMILIES[i]!;
    setStd(f.defaultStandard);
    const set = THREAD_SIZES[f.defaultStandard];
    if (set) setSize(set.coarse[0] ?? set.fine[0] ?? "M6");
    setHead(f.defaultHead);
    setTip(f.defaultTip);
    setErr(null);
  };
  const pickStd = (s: ThreadStandard) => {
    setStd(s);
    const fam = FASTENER_FAMILIES[famIdx]!;
    const set = THREAD_SIZES[s];
    if (set) setSize(set.coarse[0] ?? set.fine[0] ?? "M6");
    setHead(fam.defaultHead);
    setTip(fam.defaultTip);
    setErr(null);
  };

  const commit = () => {
    try {
      const spec = resolvePreset({
        family: familyId,
        standard: std,
        size,
        mode: family.defaultMode,
        head,
        tip,
        length: family.defaultLength,
        ...(familyId === "screwHole"
          ? { clearance: family.defaultClearance ?? "none" }
          : {}),
      });
      onSelect(spec);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="relative" ref={ref} hidden={hidden}>
      <button
        className="cad-tool"
        disabled={isLocked}
        data-testid="tool-fasteners"
        onClick={() => setOpen((v) => !v)}
        title="Fasteners"
        aria-label="Fasteners"
      >
        <ToolGlyph name="fasteners" />
        <span className="cad-tool-label">Fasteners</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 flex w-72 flex-col gap-2 rounded-md border border-[var(--cad-border-strong)] bg-[var(--cad-chrome-raised)] p-3 shadow-xl">
          <label className="text-xs text-gray-400">Family</label>
          <select
            aria-label="Fastener family"
            className="w-full rounded border border-[var(--cad-border)] bg-white px-2 py-1 text-sm text-[var(--cad-text)]"
            value={famIdx}
            onChange={(e) => pickFamily(Number(e.target.value))}
          >
            {FASTENER_FAMILIES.map((f, i) => (
              <option key={f.id} value={i}>
                {f.label}
              </option>
            ))}
          </select>
          <label className="text-xs text-gray-400">Standard</label>
          <select
            aria-label="Fastener standard"
            className="w-full rounded border border-[var(--cad-border)] bg-white px-2 py-1 text-sm text-[var(--cad-text)]"
            value={std}
            onChange={(e) => pickStd(e.target.value as ThreadStandard)}
          >
            {STANDARD_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="text-xs text-gray-400">Size</label>
          <select
            aria-label="Fastener size"
            className="w-full rounded border border-[var(--cad-border)] bg-white px-2 py-1 text-sm text-[var(--cad-text)]"
            value={size}
            onChange={(e) => {
              setSize(e.target.value);
              setErr(null);
            }}
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-[var(--cad-text-muted)]">
                Head
              </label>
              <select
                aria-label="Fastener head"
                className="w-full rounded border border-[var(--cad-border)] bg-white px-2 py-1 text-sm text-[var(--cad-text)]"
                value={head}
                onChange={(e) => {
                  setHead(e.target.value as HeadShapeId);
                  setErr(null);
                }}
              >
                {validHeads.map((id) => (
                  <option key={id} value={id}>
                    {HEAD_OPTIONS.find((o) => o.id === id)?.label ?? id}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-[var(--cad-text-muted)]">
                Tip
              </label>
              <select
                aria-label="Fastener tip"
                className="w-full rounded border border-[var(--cad-border)] bg-white px-2 py-1 text-sm text-[var(--cad-text)]"
                value={tip}
                onChange={(e) => {
                  setTip(e.target.value as TipStyle);
                  setErr(null);
                }}
              >
                {validTips.map((id) => (
                  <option key={id} value={id}>
                    {TIP_OPTIONS.find((o) => o.id === id)?.label ?? id}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {err && <div className="text-xs text-red-600">{err}</div>}
          <button
            className="mt-1 px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white"
            data-testid="fastener-confirm"
            onClick={commit}
          >
            Insert
          </button>
        </div>
      )}
    </div>
  );
};

const PrimitiveDropdown: React.FC<{
  onSelect: (kind: ShapeKind) => void;
  isLocked: boolean;
  hidden?: boolean;
}> = ({ onSelect, isLocked, hidden = false }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref} hidden={hidden}>
      <button
        className="cad-tool"
        disabled={isLocked}
        data-testid="tool-primitives"
        aria-label="Primitives"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        title="Primitives"
      >
        <ToolGlyph name="primitives" />
        <span className="cad-tool-label">Primitives</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Primitives"
          className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border border-[var(--cad-border-strong)] bg-[var(--cad-chrome-raised)] py-1 shadow-xl"
        >
          {PRIMITIVE_SHAPES.map(({ kind, label }) => (
            <button
              key={kind}
              role="menuitem"
              aria-label={label}
              className="w-full px-3 py-1.5 text-left text-xs text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
              onClick={() => {
                onSelect(kind);
                setOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const PrimaryToolbar: React.FC<PrimaryToolbarProps> = (props) => {
  const {
    mode,
    setMode,
    isLocked,
    isOperationPending,
    isBooleanMode,
    sketchIsSelectingPlane,
    onSketchClick,
    showGroundPlane,
    toggleGroundPlane,
    onFitAll,
  } = props;

  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [customization, setCustomization] = useState<ToolbarCustomization>(
    () =>
      typeof window === "undefined"
        ? defaultToolbarCustomization()
        : loadToolbarCustomization(window.localStorage),
  );
  const [customizerAt, setCustomizerAt] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  const updateCustomization = (next: ToolbarCustomization) => {
    setCustomization(next);
    saveToolbarCustomization(
      typeof window === "undefined" ? null : window.localStorage,
      next,
    );
  };
  const hiddenFor = (id: string) => !isToolbarToolVisible(customization, id);

  useEffect(() => {
    if (!overflowMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        overflowMenuRef.current &&
        !overflowMenuRef.current.contains(e.target as Node)
      ) {
        setOverflowMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [overflowMenuOpen]);

  const overflowItems: { label: string; mode: SceneMode; id: string }[] = [
    { label: "Combine", mode: "combine", id: "boolean" },
    { label: "Fillet", mode: "fillet", id: "fillet" },
    { label: "Sweep", mode: "sweep", id: "sweep" },
    { label: "Loft", mode: "loft", id: "loft" },
    { label: "Revolve", mode: "revolve", id: "revolve" },
    { label: "Measure", mode: "measure", id: "measure" },
  ].filter((item) => !hiddenFor(item.id));

  return (
    <div
      className="cad-chrome cad-feature-toolbar z-30 flex h-10 flex-none items-center border-b"
      onContextMenu={(event) => {
        event.preventDefault();
        setCustomizerAt({ x: event.clientX, y: event.clientY });
      }}
    >
      <div className="cad-toolbar-scroll flex min-w-0 flex-1 items-center gap-0.5 px-2">
        <button
          type="button"
          className="cad-icon-button cad-toolbar-search-trigger"
          data-testid="tool-search-trigger"
          aria-label="Search tools and commands"
          title="Search tools and commands (Ctrl/Cmd+K)"
          onClick={() =>
            window.dispatchEvent(new Event(TOOL_SEARCH_OPEN_EVENT))
          }
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4 flex-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
            />
          </svg>
          <span className="cad-toolbar-search-label">Search tools</span>
          <span className="cad-kbd cad-toolbar-search-kbd">⌘K</span>
        </button>

        {/* Core buttons — always visible */}
        <button
          className="cad-tool"
          data-active={mode === "sketch"}
          disabled={isOperationPending}
          data-testid="tool-sketch"
          hidden={hiddenFor("sketch")}
          onClick={onSketchClick}
          title="Sketch"
          aria-label="Sketch"
        >
          <ToolGlyph name="sketch" />
          <span className="cad-tool-label cad-tool-label-visible">Sketch</span>
        </button>
        <button
          className="cad-tool"
          data-active={mode === "extrude"}
          disabled={isLocked}
          data-testid="tool-extrude"
          hidden={hiddenFor("extrude")}
          onClick={() => setMode("extrude")}
          title="Extrude"
          aria-label="Extrude"
        >
          <ToolGlyph name="extrude" />
          <span className="cad-tool-label">Extrude</span>
        </button>
        <button
          className="cad-tool"
          data-active={false}
          disabled={isLocked}
          hidden={hiddenFor("move")}
          onClick={() => setMode("move")}
          title="Move"
          aria-label="Move"
        >
          <ToolGlyph name="move" />
          <span className="cad-tool-label">Move</span>
        </button>

        <FastenerDropdown
          isLocked={isLocked}
          hidden={hiddenFor("fasteners")}
          onSelect={(spec) => props.onSelectFastener?.(spec)}
        />

        <PrimitiveDropdown
          isLocked={isLocked}
          hidden={hiddenFor("primitives")}
          onSelect={(kind) =>
            props.onSelectPrimitive?.(kind, defaultPrimitiveOptions(kind))
          }
        />

        <OperationsMenu
          isLocked={isLocked}
          hidden={hiddenFor("operations")}
          availableOps={props.availableOps}
          onRunOperation={(id) => props.onRunOperation?.(id)}
        />

        <button
          className="cad-tool"
          data-active={props.appearancePanelOpen}
          disabled={isLocked}
          data-testid="tool-appearance"
          hidden={hiddenFor("appearance")}
          onClick={props.onToggleAppearance}
          title="Appearance"
          aria-label="Appearance"
        >
          <ToolGlyph name="appearance" />
          <span className="cad-tool-label">Appearance</span>
        </button>

        {/* Secondary buttons — desktop only inline */}
        <div className="hidden lg:contents">
          <div className="cad-divider" />

          <button
            className="cad-tool"
            data-active={isBooleanMode}
            disabled={isLocked}
            data-testid="tool-combine"
            hidden={hiddenFor("boolean")}
            onClick={() => setMode("combine")}
            title="Boolean"
            aria-label="Boolean"
          >
            <ToolGlyph name="boolean" />
            <span className="cad-tool-label">Boolean</span>
          </button>

          <button
            className="cad-tool"
            data-active={mode === "fillet"}
            disabled={isLocked}
            hidden={hiddenFor("fillet")}
            onClick={() => setMode("fillet")}
            title="Fillet / Chamfer"
            aria-label="Fillet / Chamfer"
          >
            <ToolGlyph name="fillet" />
            <span className="cad-tool-label">Fillet</span>
          </button>
          <button
            className="cad-tool"
            data-active={mode === "sweep"}
            disabled={isLocked}
            hidden={hiddenFor("sweep")}
            onClick={() => setMode("sweep")}
            title="Sweep"
            aria-label="Sweep"
          >
            <ToolGlyph name="sweep" />
            <span className="cad-tool-label">Sweep</span>
          </button>
          <button
            className="cad-tool"
            data-active={mode === "loft"}
            disabled={isLocked}
            hidden={hiddenFor("loft")}
            onClick={() => setMode("loft")}
            title="Loft"
            aria-label="Loft"
          >
            <ToolGlyph name="loft" />
            <span className="cad-tool-label">Loft</span>
          </button>
          <button
            className="cad-tool"
            data-active={mode === "revolve"}
            disabled={isLocked}
            hidden={hiddenFor("revolve")}
            onClick={() => setMode("revolve")}
            title="Revolve"
            aria-label="Revolve"
          >
            <ToolGlyph name="revolve" />
            <span className="cad-tool-label">Revolve</span>
          </button>

          <div className="cad-divider" />

          <button
            className="cad-tool"
            data-active={mode === "measure"}
            disabled={isLocked}
            hidden={hiddenFor("measure")}
            onClick={() => setMode("measure")}
            title="Measure"
            aria-label="Measure"
          >
            <ToolGlyph name="measure" />
            <span className="cad-tool-label">Measure</span>
          </button>

          <div className="cad-divider" />

          <button
            className="cad-icon-button"
            data-active={showGroundPlane}
            onClick={toggleGroundPlane}
            hidden={hiddenFor("grid")}
            title={showGroundPlane ? "Hide grid" : "Show grid"}
            aria-label={showGroundPlane ? "Hide grid" : "Show grid"}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 3h18v18H3V3zM3 9h18M3 15h18M9 3v18M15 3v18"
              />
            </svg>
          </button>

          <button
            className="cad-icon-button"
            onClick={onFitAll}
            hidden={hiddenFor("fit")}
            title="Fit all (F)"
            aria-label="Fit all"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M8 8h8v8H8z"
              />
            </svg>
          </button>
        </div>

        {/* Overflow "More" dropdown — mobile only */}
        <div className="lg:hidden relative" ref={overflowMenuRef}>
          <button
            className="cad-icon-button"
            onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
            title="More tools"
            aria-label="More tools"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01"
              />
            </svg>
          </button>
          {overflowMenuOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border border-[var(--cad-border-strong)] bg-[var(--cad-chrome-raised)] shadow-xl">
              {overflowItems.map((item) => (
                <button
                  key={item.mode}
                  aria-label={item.label}
                  className={`w-full px-3 py-2 text-left text-xs ${
                    isLocked
                      ? "cursor-not-allowed text-[var(--cad-text-faint)]"
                      : mode === item.mode
                        ? "bg-[var(--cad-accent-strong)] text-white"
                        : "text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
                  }`}
                  disabled={isLocked}
                  onClick={() => {
                    setMode(item.mode);
                    setOverflowMenuOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--cad-border)]" />
              <button
                aria-label={showGroundPlane ? "Hide grid" : "Show grid"}
                hidden={hiddenFor("grid")}
                className={`w-full px-3 py-2 text-left text-xs ${
                  showGroundPlane
                    ? "text-[var(--cad-accent)]"
                    : "text-[var(--cad-text)]"
                } hover:bg-[var(--cad-chrome-hover)]`}
                onClick={() => {
                  toggleGroundPlane();
                  setOverflowMenuOpen(false);
                }}
              >
                {showGroundPlane ? "Hide Grid" : "Show Grid"}
              </button>
              <button
                className="w-full px-3 py-2 text-left text-xs text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
                hidden={hiddenFor("fit")}
                onClick={() => {
                  onFitAll();
                  setOverflowMenuOpen(false);
                }}
              >
                Fit All
              </button>
            </div>
          )}
        </div>

        <div className="cad-divider" />

        <div className="cad-undo-redo flex flex-none items-center">
          <UndoRedoMenus
            inSketch={props.inSketch}
            canUndoSketch={props.canUndoSketch}
            canRedoSketch={props.canRedoSketch}
            undoSketch={props.undoSketch}
            redoSketch={props.redoSketch}
            canUndo={props.canUndo}
            canRedo={props.canRedo}
            undo={props.undo}
            redo={props.redo}
            undoActionName={props.undoActionName}
            redoActionName={props.redoActionName}
            undoStack={props.undoStack}
            redoStack={props.redoStack}
            undoDropdownOpen={props.undoDropdownOpen}
            redoDropdownOpen={props.redoDropdownOpen}
            setUndoDropdownOpen={props.setUndoDropdownOpen}
            setRedoDropdownOpen={props.setRedoDropdownOpen}
            undoDropdownRef={props.undoDropdownRef}
            redoDropdownRef={props.redoDropdownRef}
          />
        </div>
      </div>
      {customizerAt && (
        <ToolbarCustomizer
          customization={customization}
          x={customizerAt.x}
          y={customizerAt.y}
          onToggle={(id) =>
            updateCustomization(toggleToolbarTool(customization, id))
          }
          onReset={() => updateCustomization(resetToolbarCustomization())}
          onClose={() => setCustomizerAt(null)}
        />
      )}
    </div>
  );
};
