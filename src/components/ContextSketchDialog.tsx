import React, { useMemo, useState } from "react";
import {
  addContextCircle,
  addContextLine,
  contextSketchBounds,
  emptyContextSketch,
  removeLastContextEntity,
  type ContextSketchContext,
  type ContextSketchDocument,
  type ContextSketchPoint,
  type ContextSketchReference,
} from "../model/contextSketch";

export interface ContextSketchDialogProps {
  context: ContextSketchContext;
  sourceLabel: string;
  references: readonly ContextSketchReference[];
  sketches: readonly ContextSketchDocument[];
  readOnly?: boolean;
  onSketchesChange: (sketches: ContextSketchDocument[]) => void;
  onClose: () => void;
}

function pointFromEvent(
  event: React.PointerEvent<SVGSVGElement>,
): ContextSketchPoint | null {
  const svg = event.currentTarget;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

export const ContextSketchDialog: React.FC<ContextSketchDialogProps> = ({
  context,
  sourceLabel,
  references,
  sketches,
  readOnly = false,
  onSketchesChange,
  onClose,
}) => {
  const [name, setName] = useState(
    context === "assembly" ? "Assembly sketch" : "Drawing sketch",
  );
  const [draft, setDraft] = useState<ContextSketchDocument>(() =>
    emptyContextSketch(context, name, references),
  );
  const [tool, setTool] = useState<"line" | "circle">("line");
  const [first, setFirst] = useState<ContextSketchPoint | null>(null);
  const [showReferences, setShowReferences] = useState(true);

  const bounds = useMemo(() => contextSketchBounds(draft), [draft]);
  const pad = Math.max(
    10,
    Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.08,
  );
  const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${
    bounds.maxX - bounds.minX + pad * 2
  } ${bounds.maxY - bounds.minY + pad * 2}`;

  const addPoint = (point: ContextSketchPoint) => {
    if (readOnly) return;
    if (tool === "circle") {
      setDraft((current) => addContextCircle(current, point, 6));
      return;
    }
    if (!first) {
      setFirst(point);
      return;
    }
    setDraft((current) => addContextLine(current, first, point));
    setFirst(null);
  };

  const save = () => {
    if (readOnly) return;
    onSketchesChange([
      ...sketches,
      { ...draft, name: name.trim() || draft.name, updatedAt: Date.now() },
    ]);
    setDraft(emptyContextSketch(context, name, references));
    setFirst(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="In-context sketch"
      data-testid="context-sketch-dialog"
      className="pointer-events-auto absolute inset-0 z-[90] flex items-center justify-center bg-black/55 p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92%] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-900 text-xs text-gray-200 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2">
          <div>
            <div className="text-sm font-semibold">In-context sketch</div>
            <div className="text-[10px] text-gray-500">
              {context === "assembly" ? "Assembly" : "Drawing"} · {sourceLabel}
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-800"
            >
              Close
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={save}
              data-testid="context-sketch-save"
              className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              Save sketch
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-56 flex-none space-y-3 border-r border-gray-700 p-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">
                Name
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Context sketch name"
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1"
              />
            </label>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                Tool
              </div>
              <div className="mt-1 flex gap-1">
                {(["line", "circle"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Sketch tool ${value}`}
                    aria-pressed={tool === value}
                    onClick={() => {
                      setTool(value);
                      setFirst(null);
                    }}
                    className={`flex-1 rounded px-2 py-1 capitalize ${
                      tool === value
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-gray-300">
              <input
                type="checkbox"
                aria-label="Show source references"
                checked={showReferences}
                onChange={(event) => setShowReferences(event.target.checked)}
              />
              Show source references
            </label>
            <div className="rounded border border-gray-700 bg-gray-950/60 p-2 text-[10px] text-gray-400">
              {references.length} reference body
              {references.length === 1 ? "" : "s"} ·{" "}
              {draft.lines.length + draft.circles.length} authored entities
              <div className="mt-1 text-gray-500">
                Lines snap in the plane; source edges stay linked by body id.
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setDraft((current) => removeLastContextEntity(current));
                  setFirst(null);
                }}
                className="flex-1 rounded bg-gray-800 px-2 py-1 hover:bg-gray-700 disabled:opacity-40"
              >
                Undo last
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setDraft(emptyContextSketch(context, name, references));
                  setFirst(null);
                }}
                className="flex-1 rounded bg-gray-800 px-2 py-1 hover:bg-gray-700 disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            {sketches.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                  Saved ({sketches.length})
                </div>
                <div className="space-y-1">
                  {sketches.map((sketch) => (
                    <div
                      key={sketch.id}
                      className="rounded border border-gray-700 bg-gray-800/70 px-2 py-1"
                    >
                      <div className="truncate text-[11px]">{sketch.name}</div>
                      <div className="text-[9px] text-gray-500">
                        {sketch.lines.length + sketch.circles.length} entities ·{" "}
                        {sketch.plane}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="min-h-[360px] flex-1 bg-gray-950">
            <svg
              viewBox={viewBox}
              preserveAspectRatio="xMidYMid meet"
              className="h-full min-h-[360px] w-full cursor-crosshair"
              data-testid="context-sketch-canvas"
              onPointerDown={(event) => {
                const point = pointFromEvent(event);
                if (point) addPoint(point);
              }}
            >
              <defs>
                <pattern
                  id="context-grid"
                  width="10"
                  height="10"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 10 0 L 0 0 0 10"
                    fill="none"
                    stroke="#1f2937"
                    strokeWidth="0.3"
                  />
                </pattern>
              </defs>
              <rect
                x={bounds.minX - pad}
                y={bounds.minY - pad}
                width={bounds.maxX - bounds.minX + pad * 2}
                height={bounds.maxY - bounds.minY + pad * 2}
                fill="url(#context-grid)"
              />
              <line
                x1={bounds.minX - pad}
                y1={0}
                x2={bounds.maxX + pad}
                y2={0}
                stroke="#334155"
                strokeWidth="0.6"
              />
              <line
                x1={0}
                y1={bounds.minY - pad}
                x2={0}
                y2={bounds.maxY + pad}
                stroke="#334155"
                strokeWidth="0.6"
              />
              {showReferences &&
                draft.references.map((reference) => (
                  <g key={reference.id}>
                    {reference.segments.map((segment, index) => (
                      <line
                        key={`${reference.id}-${index}`}
                        x1={segment.a.x}
                        y1={segment.a.y}
                        x2={segment.b.x}
                        y2={segment.b.y}
                        stroke="#38bdf8"
                        strokeWidth="0.55"
                        strokeDasharray="2 1.4"
                        opacity="0.7"
                      />
                    ))}
                    <text
                      x={reference.segments[0]?.a.x ?? 0}
                      y={(reference.segments[0]?.a.y ?? 0) - 1.5}
                      fill="#7dd3fc"
                      fontSize="2.5"
                    >
                      {reference.sourceLabel}
                    </text>
                  </g>
                ))}
              {draft.lines.map((line) => (
                <line
                  key={line.id}
                  x1={line.p1.x}
                  y1={line.p1.y}
                  x2={line.p2.x}
                  y2={line.p2.y}
                  stroke="#f8fafc"
                  strokeWidth="0.8"
                />
              ))}
              {draft.circles.map((circle) => (
                <circle
                  key={circle.id}
                  cx={circle.center.x}
                  cy={circle.center.y}
                  r={circle.radius}
                  fill="none"
                  stroke="#f8fafc"
                  strokeWidth="0.8"
                />
              ))}
              {first && (
                <circle cx={first.x} cy={first.y} r="1.3" fill="#f59e0b" />
              )}
            </svg>
          </div>
        </div>
        <div className="border-t border-gray-700 px-3 py-1.5 text-[10px] text-gray-500">
          Click once to start a line, again to finish. Circle tool places a 6 mm
          circle. References are projected from the active {context} context.
        </div>
      </div>
    </div>
  );
};

export default ContextSketchDialog;
