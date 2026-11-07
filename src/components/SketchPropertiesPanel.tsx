import React, { FC, useState, useEffect, useRef, useCallback } from "react";
import {
  Sketch,
  SketchPrimitive,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  findSketchPoint,
} from "@vitekk02/cadjs";

interface SketchPropertiesPanelProps {
  activeSketch: Sketch;
  selectedPrimitives: string[];
  onUpdatePoint: (
    updates: Map<string, { x: number; y: number }>,
  ) => Promise<void>;
  onUpdatePrimitiveProperty: (
    primitiveId: string,
    updates: Partial<SketchPrimitive>,
  ) => Promise<void>;
}

interface CoordinateEditorProps {
  label: string;
  pointId: string;
  x: number;
  y: number;
  onUpdate: (pointId: string, x: number, y: number) => void;
}

const CoordinateEditor: FC<CoordinateEditorProps> = ({
  label,
  pointId,
  x,
  y,
  onUpdate,
}) => {
  const [xStr, setXStr] = useState(x.toFixed(2));
  const [yStr, setYStr] = useState(y.toFixed(2));
  const xFocusRef = useRef(false);
  const yFocusRef = useRef(false);
  // Refs to avoid stale closures — always hold current string values
  const xStrRef = useRef(xStr);
  const yStrRef = useRef(yStr);
  xStrRef.current = xStr;
  yStrRef.current = yStr;
  // Snapshot values on focus for Escape revert
  const snapshotRef = useRef({ x: x.toFixed(2), y: y.toFixed(2) });

  // Sync from solver — skip when focused to prevent flicker
  useEffect(() => {
    if (!xFocusRef.current) setXStr(x.toFixed(2));
  }, [x]);
  useEffect(() => {
    if (!yFocusRef.current) setYStr(y.toFixed(2));
  }, [y]);

  const handleXChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setXStr(val);
      const newX = parseFloat(val);
      const newY = parseFloat(yStrRef.current);
      if (!isNaN(newX) && !isNaN(newY)) onUpdate(pointId, newX, newY);
    },
    [pointId, onUpdate],
  );

  const handleYChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setYStr(val);
      const newX = parseFloat(xStrRef.current);
      const newY = parseFloat(val);
      if (!isNaN(newX) && !isNaN(newY)) onUpdate(pointId, newX, newY);
    },
    [pointId, onUpdate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Stop propagation so global shortcuts (Ctrl+Z, Delete, etc.) don't fire
      e.stopPropagation();
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      } else if (e.key === "Escape") {
        // Revert to snapshot values
        setXStr(snapshotRef.current.x);
        setYStr(snapshotRef.current.y);
        const revX = parseFloat(snapshotRef.current.x);
        const revY = parseFloat(snapshotRef.current.y);
        if (!isNaN(revX) && !isNaN(revY)) onUpdate(pointId, revX, revY);
        (e.target as HTMLInputElement).blur();
      }
    },
    [pointId, onUpdate],
  );

  const handleFocusX = useCallback(() => {
    xFocusRef.current = true;
    snapshotRef.current = { x: xStrRef.current, y: yStrRef.current };
  }, []);

  const handleFocusY = useCallback(() => {
    yFocusRef.current = true;
    snapshotRef.current = { x: xStrRef.current, y: yStrRef.current };
  }, []);

  const inputCls =
    "w-16 px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none";

  return (
    <div className="mb-2">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 w-3">X</label>
        <input
          type="number"
          step="0.1"
          aria-label={`${label} X`}
          className={inputCls}
          value={xStr}
          onChange={handleXChange}
          onFocus={handleFocusX}
          onBlur={() => {
            xFocusRef.current = false;
          }}
          onKeyDown={handleKeyDown}
        />
        <label className="text-xs text-gray-400 w-3">Y</label>
        <input
          type="number"
          step="0.1"
          aria-label={`${label} Y`}
          className={inputCls}
          value={yStr}
          onChange={handleYChange}
          onFocus={handleFocusY}
          onBlur={() => {
            yFocusRef.current = false;
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
};

interface RadiusEditorProps {
  label: string;
  primitiveId: string;
  radius: number;
  onUpdate: (primitiveId: string, radius: number) => void;
}

const RadiusEditor: FC<RadiusEditorProps> = ({
  label,
  primitiveId,
  radius,
  onUpdate,
}) => {
  const [valStr, setValStr] = useState(radius.toFixed(3));
  const focusRef = useRef(false);
  const valStrRef = useRef(valStr);
  valStrRef.current = valStr;
  const snapshotRef = useRef(valStr);

  useEffect(() => {
    if (!focusRef.current) setValStr(radius.toFixed(3));
  }, [radius]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setValStr(val);
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) onUpdate(primitiveId, parsed);
    },
    [primitiveId, onUpdate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      } else if (e.key === "Escape") {
        setValStr(snapshotRef.current);
        const rev = parseFloat(snapshotRef.current);
        if (!isNaN(rev) && rev > 0) onUpdate(primitiveId, rev);
        (e.target as HTMLInputElement).blur();
      }
    },
    [primitiveId, onUpdate],
  );

  const inputCls =
    "w-16 px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none";

  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs text-gray-400 w-14">{label}</span>
      <input
        type="number"
        step="0.1"
        min="0.001"
        aria-label={`${label} radius`}
        className={inputCls}
        value={valStr}
        onChange={handleChange}
        onFocus={() => {
          focusRef.current = true;
          snapshotRef.current = valStrRef.current;
        }}
        onBlur={() => {
          focusRef.current = false;
        }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};

const ReadOnlyRow: FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center gap-2 mb-1">
    <span className="text-xs text-gray-400 w-14">{label}</span>
    <span className="text-xs text-gray-300">{value}</span>
  </div>
);

interface PrimitiveSectionProps {
  primitive: SketchPrimitive;
  allPrimitives: SketchPrimitive[];
  onUpdate: (pointId: string, x: number, y: number) => void;
  onUpdateRadius: (primitiveId: string, radius: number) => void;
}

const findPoint = (
  id: string,
  primitives: SketchPrimitive[],
): SketchPoint | undefined => findSketchPoint(primitives, id);

const PrimitiveSection: FC<PrimitiveSectionProps> = ({
  primitive,
  allPrimitives,
  onUpdate,
  onUpdateRadius,
}) => {
  if (isSketchPoint(primitive)) {
    return (
      <div>
        <div className="text-xs font-medium text-gray-200 mb-2">Point</div>
        <CoordinateEditor
          label="Position"
          pointId={primitive.id}
          x={primitive.x}
          y={primitive.y}
          onUpdate={onUpdate}
        />
      </div>
    );
  }

  if (isSketchLine(primitive)) {
    const p1 = findPoint(primitive.p1Id, allPrimitives);
    const p2 = findPoint(primitive.p2Id, allPrimitives);
    const length =
      p1 && p2 ? Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2) : 0;
    return (
      <div>
        <div className="text-xs font-medium text-gray-200 mb-2">
          Line{primitive.construction ? " (construction)" : ""}
        </div>
        <ReadOnlyRow label="Length" value={length.toFixed(3)} />
        {p1 && (
          <CoordinateEditor
            label="Point 1"
            pointId={p1.id}
            x={p1.x}
            y={p1.y}
            onUpdate={onUpdate}
          />
        )}
        {p2 && (
          <CoordinateEditor
            label="Point 2"
            pointId={p2.id}
            x={p2.x}
            y={p2.y}
            onUpdate={onUpdate}
          />
        )}
      </div>
    );
  }

  if (isSketchCircle(primitive)) {
    const center = findPoint(primitive.centerId, allPrimitives);
    return (
      <div>
        <div className="text-xs font-medium text-gray-200 mb-2">
          Circle{primitive.construction ? " (construction)" : ""}
        </div>
        <RadiusEditor
          label="Radius"
          primitiveId={primitive.id}
          radius={primitive.radius}
          onUpdate={onUpdateRadius}
        />
        {center && (
          <CoordinateEditor
            label="Center"
            pointId={center.id}
            x={center.x}
            y={center.y}
            onUpdate={onUpdate}
          />
        )}
      </div>
    );
  }

  if (isSketchArc(primitive)) {
    const center = findPoint(primitive.centerId, allPrimitives);
    const start = findPoint(primitive.startId, allPrimitives);
    const end = findPoint(primitive.endId, allPrimitives);
    return (
      <div>
        <div className="text-xs font-medium text-gray-200 mb-2">
          Arc{primitive.construction ? " (construction)" : ""}
        </div>
        <RadiusEditor
          label="Radius"
          primitiveId={primitive.id}
          radius={primitive.radius}
          onUpdate={onUpdateRadius}
        />
        {center && (
          <CoordinateEditor
            label="Center"
            pointId={center.id}
            x={center.x}
            y={center.y}
            onUpdate={onUpdate}
          />
        )}
        {start && (
          <CoordinateEditor
            label="Start"
            pointId={start.id}
            x={start.x}
            y={start.y}
            onUpdate={onUpdate}
          />
        )}
        {end && (
          <CoordinateEditor
            label="End"
            pointId={end.id}
            x={end.x}
            y={end.y}
            onUpdate={onUpdate}
          />
        )}
      </div>
    );
  }

  return <div className="text-xs text-gray-400">(no editable properties)</div>;
};

const SketchPropertiesPanel: FC<SketchPropertiesPanelProps> = ({
  activeSketch,
  selectedPrimitives,
  onUpdatePoint,
  onUpdatePrimitiveProperty,
}) => {
  const handleUpdate = useCallback(
    (pointId: string, x: number, y: number) => {
      onUpdatePoint(new Map([[pointId, { x, y }]]));
    },
    [onUpdatePoint],
  );

  const handleRadiusUpdate = useCallback(
    (primitiveId: string, radius: number) => {
      onUpdatePrimitiveProperty(primitiveId, {
        radius,
      } as Partial<SketchPrimitive>);
    },
    [onUpdatePrimitiveProperty],
  );

  // Resolve selected primitives
  const resolved = selectedPrimitives
    .map((id) => activeSketch.primitives.find((p) => p.id === id))
    .filter((p): p is SketchPrimitive => p !== undefined);

  const statusColor =
    activeSketch.status === "fully_constrained"
      ? "text-green-400"
      : activeSketch.status === "overconstrained"
        ? "text-red-400"
        : "text-blue-400";

  const statusLabel =
    activeSketch.status === "fully_constrained"
      ? "Fully Constrained"
      : activeSketch.status === "overconstrained"
        ? "Over-constrained"
        : "Under-constrained";

  return (
    <div className="h-full flex flex-col text-white select-none">
      {/* Header */}
      <div className="flex-none px-3 py-2 border-b border-gray-700">
        <div className="text-sm font-bold">Properties</div>
      </div>

      {/* Sketch info */}
      <div className="flex-none px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{activeSketch.plane.type}</span>
          <span className="text-gray-600">|</span>
          <span>DOF {activeSketch.dof}</span>
          <span className="text-gray-600">|</span>
          <span className={statusColor}>{statusLabel}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
        {resolved.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            Select a primitive to view properties
          </p>
        ) : (
          resolved.map((prim, idx) => (
            <div key={prim.id}>
              {idx > 0 && <hr className="border-gray-700 my-3" />}
              <PrimitiveSection
                primitive={prim}
                allPrimitives={activeSketch.primitives}
                onUpdate={handleUpdate}
                onUpdateRadius={handleRadiusUpdate}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SketchPropertiesPanel;
