import React, { FC, useState } from "react";
import { SketchSubMode } from "@vitekk02/cadjs/react";
import {
  ConstraintType,
  DimensionalConstraintType,
  GeometricConstraintType,
  Sketch,
  getAvailableConstraints,
  getConstraintIcon,
  getConstraintLabel,
  getDefaultValue,
  isSketchLine,
  isSketchPoint,
  requiresValue,
} from "@vitekk02/cadjs";
import ValueInputModal from "./ValueInputModal";

interface SketchToolbarProps {
  activeSketch: Sketch | null;
  sketchSubMode: SketchSubMode;
  onSubModeChange: (mode: SketchSubMode) => void;
  onFinishSketch: () => void;
  onCancelSketch: () => void;
  onSolveSketch: () => void;
  selectedPrimitives: string[];
  onApplyConstraint: (type: ConstraintType, value?: number) => void;
  isChaining?: boolean;
  isOperationPending?: boolean;
  onToggleFixPoint?: () => void;
  gridSpacing?: number;
  onGridSpacingChange?: (spacing: number) => void;
  polygonSides?: number;
  onPolygonSidesChange?: (sides: number) => void;
  conicRho?: number;
  onConicRhoChange?: (rho: number) => void;
  gridSnapEnabled?: boolean;
  onGridSnapToggle?: () => void;
  onOpenPalette: () => void;
  onOpenHelp: () => void;
  onMirror: () => void;
  onCorner: (operation: "fillet" | "chamfer") => void;
  onOffset: () => void;
  onJoin: () => void;
  onTransform: (mode: "move" | "copy" | "rotate" | "scale") => void;
  onPattern: () => void;
  onPatternCircular: () => void;
  onPatternPath: () => void;
  onText: () => void;
  onImportDxf: () => void;
  onAddImage: () => void;
  onEditUnderlay: () => void;
  onInclude: () => void;
}

const GEOMETRIC_CONSTRAINTS: GeometricConstraintType[] = [
  "horizontal",
  "vertical",
  "parallel",
  "perpendicular",
  "tangent",
  "equal",
  "coincident",
  "concentric",
  "pointOnLine",
  "pointOnCircle",
  "midpoint",
  "symmetric",
];

const DIMENSIONAL_CONSTRAINTS: DimensionalConstraintType[] = [
  "distance",
  "distanceX",
  "distanceY",
  "angle",
  "radius",
  "diameter",
];

const SketchToolbar: FC<SketchToolbarProps> = ({
  activeSketch,
  sketchSubMode,
  onSubModeChange,
  onFinishSketch,
  onCancelSketch,
  onSolveSketch,
  selectedPrimitives,
  onApplyConstraint,
  isChaining = false,
  isOperationPending = false,
  onToggleFixPoint,
  gridSpacing = 0.5,
  onGridSpacingChange,
  polygonSides = 6,
  onPolygonSidesChange,
  conicRho = 0.5,
  onConicRhoChange,
  gridSnapEnabled = true,
  onGridSnapToggle,
  onOpenPalette,
  onOpenHelp,
  onMirror,
  onCorner,
  onOffset,
  onJoin,
  onTransform,
  onPattern,
  onPatternCircular,
  onPatternPath,
  onText,
  onImportDxf,
  onAddImage,
  onEditUnderlay,
  onInclude,
}) => {
  const [pendingConstraint, setPendingConstraint] =
    useState<ConstraintType | null>(null);
  const [defaultValue, setDefaultValue] = useState<number | undefined>(
    undefined,
  );
  const [constraintDropdownOpen, setConstraintDropdownOpen] = useState(false);
  const constraintDropdownRef = React.useRef<HTMLDivElement>(null);

  if (!activeSketch) return null;

  const availableConstraints = getAvailableConstraints(
    selectedPrimitives,
    activeSketch.primitives,
  );
  const mirrorAxisCount = activeSketch.primitives.filter(
    (primitive) =>
      selectedPrimitives.includes(primitive.id) &&
      isSketchLine(primitive) &&
      !primitive.origin,
  ).length;
  const mirrorEnabled =
    mirrorAxisCount === 1 &&
    selectedPrimitives.length > 1 &&
    !isOperationPending;
  const selectedLineCount = activeSketch.primitives.filter(
    (primitive) =>
      selectedPrimitives.includes(primitive.id) &&
      isSketchLine(primitive) &&
      !primitive.origin,
  ).length;
  const cornerEnabled =
    selectedLineCount === 2 &&
    selectedPrimitives.length === 2 &&
    !isOperationPending;
  const selectedArcCount = activeSketch.primitives.filter(
    (primitive) =>
      selectedPrimitives.includes(primitive.id) && primitive.type === "arc",
  ).length;
  const filletEnabled =
    (cornerEnabled ||
      (selectedLineCount === 1 &&
        selectedArcCount === 1 &&
        selectedPrimitives.length === 2) ||
      (selectedArcCount === 2 && selectedPrimitives.length === 2)) &&
    !isOperationPending;
  const selectedOffsetTarget = activeSketch?.primitives.find(
    (primitive) => primitive.id === selectedPrimitives[0],
  );
  const offsetEnabled =
    selectedPrimitives.length === 1 &&
    !!selectedOffsetTarget &&
    (selectedOffsetTarget.type === "circle" ||
      selectedOffsetTarget.type === "arc" ||
      (selectedOffsetTarget.type === "line" && !selectedOffsetTarget.origin)) &&
    !isOperationPending;
  const joinEnabled = cornerEnabled;
  const transformEnabled = selectedPrimitives.length > 0 && !isOperationPending;
  const patternEnabled = transformEnabled;

  const handleConstraintClick = (type: ConstraintType) => {
    if (requiresValue(type)) {
      const value = getDefaultValue(
        type,
        selectedPrimitives,
        activeSketch.primitives,
      );
      setDefaultValue(value);
      setPendingConstraint(type);
    } else {
      onApplyConstraint(type);
    }
  };

  const handleValueConfirm = (value: number) => {
    if (pendingConstraint) {
      const finalValue =
        pendingConstraint === "angle" ? (value * Math.PI) / 180 : value;
      onApplyConstraint(pendingConstraint, finalValue);
      setPendingConstraint(null);
      setDefaultValue(undefined);
    }
  };

  const handleValueCancel = () => {
    setPendingConstraint(null);
    setDefaultValue(undefined);
  };

  const toolBtn = (mode: SketchSubMode, label: string, shortcut: string) => (
    <button
      className={`flex-none px-2 py-1 text-sm rounded ${
        isOperationPending
          ? "bg-gray-800 text-gray-500 cursor-not-allowed"
          : sketchSubMode === mode
            ? "bg-blue-600 text-white"
            : "bg-gray-700 hover:bg-gray-600 text-gray-200"
      }`}
      disabled={isOperationPending}
      onClick={() => onSubModeChange(mode)}
      title={`${label} (${shortcut})`}
    >
      {label}
    </button>
  );

  const constraintBtn = (type: ConstraintType) => {
    const available =
      availableConstraints.includes(type) && !isOperationPending;
    const icon = getConstraintIcon(type);
    const label = getConstraintLabel(type);

    return (
      <button
        key={type}
        onClick={() => available && handleConstraintClick(type)}
        disabled={!available}
        className={`flex-none px-1.5 py-1 text-xs rounded font-mono ${
          available
            ? "bg-gray-700 hover:bg-blue-500 text-gray-200 cursor-pointer"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        title={label}
      >
        {icon}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1 w-full min-w-0 relative">
      {/* Drawing tools */}
      {toolBtn("line", "Line", "L / LINE")}
      {toolBtn("midpointLine", "Mid Line", "MIDLINE / ML")}
      {toolBtn("rectangle", "Rect", "R / REC")}
      {toolBtn("centerRectangle", "Center Rect", "CRECT")}
      {toolBtn("slot", "Slot", "SLOT")}
      {toolBtn("polygon", "Polygon", "POL")}
      {toolBtn("circle", "Circle", "C / CIRCLE")}
      {toolBtn("circle3p", "3Pt Circle", "CIRCLE3P / 3P")}
      {toolBtn("ellipse", "Ellipse", "ELLIPSE / EL")}
      {toolBtn("ellipticalArc", "Elliptical Arc", "ELLIPTICALARC / EAR")}
      {toolBtn("spline", "Spline", "SPLINE / SPL")}
      {toolBtn("bezier", "Bezier", "BEZIER / BZ")}
      {toolBtn("conic", "Conic", "CONIC / CO")}
      {toolBtn("arc", "Arc", "A / ARC")}
      {toolBtn("point", "Point", "P / PO")}
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          isOperationPending
            ? "bg-gray-800 text-gray-500 cursor-not-allowed"
            : "bg-gray-700 hover:bg-gray-600 text-gray-200"
        }`}
        disabled={isOperationPending}
        onClick={onText}
        title="Insert single-stroke sketch text (TEXT / T)"
      >
        Text
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          isOperationPending
            ? "bg-gray-800 text-gray-500 cursor-not-allowed"
            : "bg-gray-700 hover:bg-gray-600 text-gray-200"
        }`}
        disabled={isOperationPending}
        onClick={onImportDxf}
        title="Import 2D DXF entities into this sketch"
      >
        DXF
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          isOperationPending
            ? "bg-gray-800 text-gray-500 cursor-not-allowed"
            : "bg-gray-700 hover:bg-gray-600 text-gray-200"
        }`}
        disabled={isOperationPending}
        onClick={onAddImage}
        title="Insert a raster image underlay"
      >
        Image
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          (activeSketch.imageUnderlays?.length ?? 0) > 0 && !isOperationPending
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={
          (activeSketch.imageUnderlays?.length ?? 0) === 0 || isOperationPending
        }
        onClick={onEditUnderlay}
        title="Move, scale, fade or delete an image underlay"
      >
        Underlay
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          isOperationPending
            ? "bg-gray-800 text-gray-500 cursor-not-allowed"
            : "bg-gray-700 hover:bg-gray-600 text-gray-200"
        }`}
        disabled={isOperationPending}
        onClick={onInclude}
        title="Project selected 3D BRep edges into this sketch"
      >
        Include
      </button>
      {toolBtn("dimension", "Dim", "D / DIM")}
      {toolBtn("select", "Select", "S / SELECT")}

      {sketchSubMode === "conic" && onConicRhoChange && (
        <select
          className="flex-none px-1 py-1 text-xs bg-gray-700 text-gray-200 rounded border border-gray-600"
          value={conicRho}
          onChange={(e) => onConicRhoChange(Number(e.target.value))}
          title="Conic rho"
          aria-label="Conic rho"
        >
          {[0.25, 0.35, 0.5, 0.65, 0.75].map((rho) => (
            <option key={rho} value={rho}>
              rho {rho}
            </option>
          ))}
        </select>
      )}

      {sketchSubMode === "polygon" && onPolygonSidesChange && (
        <select
          className="flex-none px-1 py-1 text-xs bg-gray-700 text-gray-200 rounded border border-gray-600"
          value={polygonSides}
          onChange={(e) => onPolygonSidesChange(parseInt(e.target.value, 10))}
          title="Polygon sides"
          aria-label="Polygon sides"
        >
          {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((sides) => (
            <option key={sides} value={sides}>
              {sides} sides
            </option>
          ))}
        </select>
      )}

      {/* Separator */}
      <div className="flex-none w-px h-5 bg-gray-600 mx-1" />

      {/* Trim/Extend/Mirror */}
      {toolBtn("trim", "Trim", "T / TR")}
      {toolBtn("extend", "Extend", "E / EX")}
      {toolBtn("split", "Split", "SPLIT / SP")}
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          mirrorEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!mirrorEnabled}
        onClick={onMirror}
        title="Mirror about the selected line (MI)"
      >
        Mirror
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          transformEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!transformEnabled}
        onClick={() => onTransform("move")}
        title="Move selected geometry by an X/Y vector (MOVE / M)"
      >
        Move
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          transformEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!transformEnabled}
        onClick={() => onTransform("copy")}
        title="Copy selected geometry by an X/Y vector (COPY / CP)"
      >
        Copy
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          transformEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!transformEnabled}
        onClick={() => onTransform("rotate")}
        title="Rotate selected geometry around a selected point or its centre (ROTATE / RO)"
      >
        Rotate
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          transformEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!transformEnabled}
        onClick={() => onTransform("scale")}
        title="Scale selected geometry around a selected point or its centre (SCALE / SC)"
      >
        Scale
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          patternEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!patternEnabled}
        onClick={onPattern}
        title="Create a linear pattern with count and X/Y spacing (PATTERN / AR)"
      >
        Pattern
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          patternEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!patternEnabled}
        onClick={onPatternCircular}
        title="Create a circular pattern around the selection centre (CIRCULAR)"
      >
        Circular
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          patternEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!patternEnabled}
        onClick={onPatternPath}
        title="Copy selected geometry along a selected curve (PATHPATTERN)"
      >
        Path
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          offsetEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!offsetEnabled}
        onClick={onOffset}
        title="Offset the selected line, circle or arc (OFFSET / O)"
      >
        Offset
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          joinEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!joinEnabled}
        onClick={onJoin}
        title="Join two collinear selected lines (JOIN / J)"
      >
        Join
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          filletEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!filletEnabled}
        onClick={() => onCorner("fillet")}
        title="Fillet a selected line/line, line/arc or arc/arc corner (FILLET / F)"
      >
        Fillet
      </button>
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          cornerEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
            : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-500"
        }`}
        disabled={!cornerEnabled}
        onClick={() => onCorner("chamfer")}
        title="Chamfer the corner between two selected lines (CHAMFER / CHA)"
      >
        Chamfer
      </button>

      {/* Separator */}
      <div className="flex-none w-px h-5 bg-gray-600 mx-1" />

      {/* Construction toggle */}
      <button
        className={`flex-none px-2 py-1 text-sm rounded ${
          isOperationPending
            ? "bg-gray-800 text-gray-500 cursor-not-allowed"
            : "bg-gray-700 hover:bg-orange-600 text-gray-200"
        }`}
        disabled={isOperationPending}
        onClick={() => {
          const event = new KeyboardEvent("keydown", { key: "x" });
          window.dispatchEvent(event);
        }}
        title="Toggle Construction (X; AutoCAD X is EXPLODE)"
      >
        Constr
      </button>

      {/* Fix/Unfix button */}
      {onToggleFixPoint &&
        (() => {
          const hasPointSelected = selectedPrimitives.some((id) => {
            const prim = activeSketch.primitives.find((p) => p.id === id);
            return prim && isSketchPoint(prim);
          });
          return (
            <button
              className={`flex-none px-2 py-1 text-sm rounded ${
                !hasPointSelected || isOperationPending
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-gray-700 hover:bg-green-600 text-gray-200"
              }`}
              disabled={!hasPointSelected || isOperationPending}
              onClick={onToggleFixPoint}
              title="Fix/Unfix Point (palette: FIX)"
            >
              Fix
            </button>
          );
        })()}

      {/* Separator */}
      <div className="flex-none w-px h-5 bg-gray-600 mx-1" />

      {/* Grid controls */}
      {onGridSnapToggle && (
        <button
          className={`flex-none px-1.5 py-1 text-xs rounded font-mono ${
            gridSnapEnabled
              ? "bg-blue-600 text-white"
              : "bg-gray-700 hover:bg-gray-600 text-gray-400"
          }`}
          onClick={onGridSnapToggle}
          title={gridSnapEnabled ? "Disable Grid Snap" : "Enable Grid Snap"}
        >
          ⊞
        </button>
      )}
      {onGridSpacingChange && (
        <select
          className="flex-none px-1 py-1 text-xs bg-gray-700 text-gray-200 rounded border border-gray-600"
          value={gridSpacing}
          onChange={(e) => onGridSpacingChange(parseFloat(e.target.value))}
          title="Grid Spacing"
        >
          <option value={0.1}>0.1</option>
          <option value={0.25}>0.25</option>
          <option value={0.5}>0.5</option>
          <option value={1.0}>1.0</option>
          <option value={2.0}>2.0</option>
        </select>
      )}

      {/* Separator */}
      <div className="flex-none w-px h-5 bg-gray-600 mx-1" />

      {/* Constraints — inline on lg+, dropdown on < lg */}
      <div className="hidden lg:contents">
        {/* Geometric constraints */}
        {GEOMETRIC_CONSTRAINTS.map((type) => constraintBtn(type))}

        {/* Separator */}
        <div className="flex-none w-px h-5 bg-gray-600 mx-1" />

        {/* Dimensional constraints */}
        {DIMENSIONAL_CONSTRAINTS.map((type) => constraintBtn(type))}
      </div>

      {/* Constraint dropdown for < lg */}
      <div className="lg:hidden relative" ref={constraintDropdownRef}>
        <button
          className="flex-none px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          onClick={() => setConstraintDropdownOpen(!constraintDropdownOpen)}
          title="Constraints"
        >
          Constraints
        </button>
        {constraintDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 p-2 min-w-[200px]">
            <div className="text-xs text-gray-500 mb-1">Geometric</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {GEOMETRIC_CONSTRAINTS.map((type) => constraintBtn(type))}
            </div>
            <div className="text-xs text-gray-500 mb-1">Dimensional</div>
            <div className="flex flex-wrap gap-1">
              {DIMENSIONAL_CONSTRAINTS.map((type) => constraintBtn(type))}
            </div>
          </div>
        )}
      </div>

      {/* Chain indicator */}
      {isChaining && (
        <span className="flex-none text-xs text-green-400 ml-1">Chain</span>
      )}

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Actions on the right */}
      <button
        className="flex-none px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 font-mono"
        onClick={onOpenPalette}
        title="Command palette (Ctrl+K / Cmd+K) — every 2D command and AutoCAD alias"
        aria-label="Open command palette"
        data-testid="sketch-command-palette"
      >
        ⌘K
      </button>
      <button
        className="flex-none px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
        onClick={onOpenHelp}
        title="2D controls and shortcuts (F1)"
        aria-label="Open 2D controls help"
        data-testid="sketch-controls-help"
      >
        ?
      </button>
      <button
        className={`flex-none px-3 py-1 text-sm rounded font-semibold ${
          isOperationPending
            ? "bg-gray-600 text-gray-400 cursor-wait"
            : "bg-green-600 hover:bg-green-500 text-white"
        }`}
        disabled={isOperationPending}
        onClick={onFinishSketch}
        title="Finish sketch and create 3D body (Esc / Enter)"
      >
        {isOperationPending ? "Finishing..." : "Finish ✓"}
      </button>
      <button
        className={`flex-none px-2 py-1 text-xs rounded ${
          isOperationPending
            ? "bg-gray-800 text-gray-500 cursor-not-allowed"
            : "bg-red-700 hover:bg-red-500 text-gray-300"
        }`}
        disabled={isOperationPending}
        onClick={onCancelSketch}
        title="Discard sketch"
      >
        ✕
      </button>

      {/* Value input dropdown for dimensional constraints */}
      {pendingConstraint && (
        <div className="absolute top-full mt-1 left-0 z-50">
          <ValueInputModal
            constraintType={pendingConstraint}
            defaultValue={defaultValue}
            onConfirm={handleValueConfirm}
            onCancel={handleValueCancel}
          />
        </div>
      )}
    </div>
  );
};

export default SketchToolbar;
