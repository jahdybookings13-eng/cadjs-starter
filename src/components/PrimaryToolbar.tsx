import React, { useEffect, useMemo, useRef, useState } from "react";
import { SceneMode, type UndoableSnapshot } from "@vitekk02/cadjs";
import FileMenu from "./FileMenu";
import { UndoRedoMenus } from "./UndoRedoMenus";
import {
  FASTENER_FAMILIES,
  resolvePreset,
  type FastenerFamily,
  type FastenerSpec,
} from "../model/fastenerPresets";
import { type HeadShapeId, type TipStyle } from "../model/headShapes";
import { type ThreadStandard, THREAD_SIZES } from "../model/threadStandards";

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
  /** Open the people/share panel. */
  onShare?: () => void;

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
}> = ({ onSelect, isLocked }) => {
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
    <div className="relative" ref={ref}>
      <button
        className={`flex-none px-3 py-1.5 text-sm rounded ${
          isLocked
            ? "bg-gray-800 text-gray-500 cursor-not-allowed"
            : "bg-gray-700 hover:bg-gray-600 text-gray-200"
        }`}
        disabled={isLocked}
        data-testid="tool-fasteners"
        onClick={() => setOpen((v) => !v)}
        title="Fasteners"
      >
        Fasteners
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 p-3 flex flex-col gap-2">
          <label className="text-xs text-gray-400">Family</label>
          <select
            className="w-full bg-gray-900 text-sm rounded px-2 py-1 text-gray-200"
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
            className="w-full bg-gray-900 text-sm rounded px-2 py-1 text-gray-200"
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
            className="w-full bg-gray-900 text-sm rounded px-2 py-1 text-gray-200"
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
              <label className="text-xs text-gray-400">Head</label>
              <select
                className="w-full bg-gray-900 text-sm rounded px-2 py-1 text-gray-200"
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
              <label className="text-xs text-gray-400">Tip</label>
              <select
                className="w-full bg-gray-900 text-sm rounded px-2 py-1 text-gray-200"
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
          {err && <div className="text-xs text-red-400">{err}</div>}
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

export const PrimaryToolbar: React.FC<PrimaryToolbarProps> = (props) => {
  const {
    mode,
    setMode,
    isLocked,
    isOperationPending,
    isBooleanMode,
    sketchIsSelectingPlane,
    onSketchClick,
    onShare,
    showGroundPlane,
    toggleGroundPlane,
    onFitAll,
  } = props;

  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

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

  const overflowItems: { label: string; mode: SceneMode }[] = [
    { label: "Combine", mode: "combine" },
    { label: "Fillet", mode: "fillet" },
    { label: "Sweep", mode: "sweep" },
    { label: "Loft", mode: "loft" },
    { label: "Revolve", mode: "revolve" },
    { label: "Measure", mode: "measure" },
  ];

  return (
    <div className="flex-none h-12 bg-gray-900 border-b border-gray-700 flex items-center z-30">
      <div className="flex items-center px-3 gap-1 min-w-0 flex-1">
        <FileMenu />

        <button
          className="flex-none px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white"
          data-testid="tool-share"
          onClick={onShare}
        >
          People
        </button>

        <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

        {/* Core buttons — always visible */}
        <button
          className={`flex-none px-3 py-1.5 text-sm rounded ${
            isOperationPending
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : mode === "sketch"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
          }`}
          disabled={isOperationPending}
          data-testid="tool-sketch"
          onClick={onSketchClick}
        >
          Sketch
        </button>
        <button
          className={`flex-none px-3 py-1.5 text-sm rounded ${
            isLocked
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : mode === "extrude"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
          }`}
          disabled={isLocked}
          data-testid="tool-extrude"
          onClick={() => setMode("extrude")}
        >
          Extrude
        </button>
        <button
          className={`flex-none px-3 py-1.5 text-sm rounded ${
            isLocked
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : mode === "move"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
          }`}
          disabled={isLocked}
          onClick={() => setMode("move")}
        >
          Move
        </button>

        <FastenerDropdown
          isLocked={isLocked}
          onSelect={(spec) => props.onSelectFastener?.(spec)}
        />

        {/* Secondary buttons — desktop only inline */}
        <div className="hidden lg:contents">
          <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : isBooleanMode
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            data-testid="tool-combine"
            onClick={() => setMode("combine")}
          >
            Boolean
          </button>

          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "fillet"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("fillet")}
          >
            Fillet
          </button>
          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "sweep"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("sweep")}
          >
            Sweep
          </button>
          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "loft"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("loft")}
          >
            Loft
          </button>
          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "revolve"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("revolve")}
          >
            Revolve
          </button>

          <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

          <button
            className={`flex-none px-3 py-1.5 text-sm rounded ${
              isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : mode === "measure"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            disabled={isLocked}
            onClick={() => setMode("measure")}
          >
            Measure
          </button>

          <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

          <button
            className={`flex-none px-2 py-1.5 text-sm rounded ${
              showGroundPlane
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
            onClick={toggleGroundPlane}
            title={showGroundPlane ? "Hide Grid" : "Show Grid"}
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
            className="flex-none px-2 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            onClick={onFitAll}
            title="Fit All (F)"
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
            className="flex-none px-2 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
            title="More tools"
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
            <div className="absolute top-full left-0 mt-1 w-44 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50">
              {overflowItems.map((item) => (
                <button
                  key={item.mode}
                  className={`w-full px-3 py-2 text-sm text-left ${
                    isLocked
                      ? "text-gray-500 cursor-not-allowed"
                      : mode === item.mode
                        ? "bg-blue-600 text-white"
                        : "text-gray-200 hover:bg-gray-700"
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
              <div className="border-t border-gray-600 my-1" />
              <button
                className={`w-full px-3 py-2 text-sm text-left ${
                  showGroundPlane ? "text-blue-400" : "text-gray-200"
                } hover:bg-gray-700`}
                onClick={() => {
                  toggleGroundPlane();
                  setOverflowMenuOpen(false);
                }}
              >
                {showGroundPlane ? "Hide Grid" : "Show Grid"}
              </button>
              <button
                className="w-full px-3 py-2 text-sm text-left text-gray-200 hover:bg-gray-700"
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

        <div className="flex-none w-px h-6 bg-gray-600 mx-1" />

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

        <div className="ml-auto flex-none text-sm text-gray-400">
          {getModeLabel(mode, sketchIsSelectingPlane)}
        </div>
      </div>
    </div>
  );
};
