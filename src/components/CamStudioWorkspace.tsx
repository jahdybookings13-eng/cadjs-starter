import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CAM_TOOL_LIBRARY,
  buildSetupSheet,
  camId,
  camToolFromPreset,
  emptyCamDocument,
  formatCamLength,
  formatMinutes,
  generateToolpaths,
  generateToolpathsAsync,
  postProcess,
  simulateToolpaths,
  stockBounds,
  stockFromBody,
  validateCamDocument,
  type CamDocument,
  type CamOperation,
  type CamStock,
  type CamToolpath,
  type CamToolpathResult,
  type CamTool,
  type OperationKind,
  type PostId,
  type StockKind,
} from "../cam";
import {
  camFlatPatternFromPhase6,
  flatPatternCamDxf,
  generateFlatPatternToolpath,
  type CamFlatPattern,
} from "../cam/flatPattern";
import type { FlatPatternDrawing } from "../model/phase6";
import { downloadTextFile } from "../document/file";

export interface CamStudioWorkspaceProps {
  document: CamDocument;
  readOnly?: boolean;
  onChange: (document: CamDocument) => void;
}

type Section = "stock" | "tools" | "operations" | "flat";
type OutputView = "post" | "setup" | "paths" | "checks";

function inputClass(): string {
  return "w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500";
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
        <span>{label}</span>
        {hint && <span className="text-gray-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  disabled,
  step = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  step?: number;
}) {
  return (
    <input
      type="number"
      aria-label="Numeric value"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className={inputClass()}
    />
  );
}

function VecField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: { x: number; y: number; z: number };
  onChange: (value: { x: number; y: number; z: number }) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-gray-400">{label}</div>
      <div className="grid grid-cols-3 gap-1">
        {(["x", "y", "z"] as const).map((axis) => (
          <label key={axis} className="relative">
            <span className="absolute left-1.5 top-1 text-[10px] uppercase text-gray-500">
              {axis}
            </span>
            <input
              type="number"
              aria-label={`${axis} coordinate`}
              value={value[axis]}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...value, [axis]: Number(event.target.value) })
              }
              className={`${inputClass()} pl-5`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function operationDefaults(
  document: CamDocument,
  kind: OperationKind,
): CamOperation {
  const tool = document.tools[0];
  const bounds = stockBounds(document.stock);
  const width = Math.max(1, bounds.max.x - bounds.min.x);
  const height = Math.max(1, bounds.max.y - bounds.min.y);
  const is3d =
    kind === "adaptive" ||
    kind === "parallel" ||
    kind === "pencil" ||
    kind === "rest";
  return {
    id: camId("op"),
    name:
      kind === "face"
        ? "Face top"
        : kind === "drill"
          ? "Drill holes"
          : kind === "pocket"
            ? "Pocket"
            : kind === "chamfer"
              ? "Chamfer"
              : kind === "adaptive"
                ? "Adaptive clear"
                : kind === "parallel"
                  ? "Parallel finish"
                  : kind === "pencil"
                    ? "Pencil finish"
                    : kind === "rest"
                      ? "Rest machining"
                      : "Outside contour",
    kind,
    toolId: tool?.id ?? "",
    depth: is3d
      ? Math.max(
          1,
          document.surface ? Math.max(...document.surface.heights, 0) : 2,
        )
      : kind === "face"
        ? 0.5
        : kind === "chamfer"
          ? 1
          : 5,
    stepdown: is3d ? 1 : kind === "face" ? 0.5 : 2,
    stepover: Math.max(1, (tool?.diameter ?? 6) * 0.5),
    leadIn: 2,
    leadOut: 1,
    profile: {
      x: bounds.min.x + width * 0.15,
      y: bounds.min.y + height * 0.15,
      width: width * 0.7,
      height: height * 0.7,
    },
    holes:
      kind === "drill"
        ? [
            { x: bounds.min.x + width * 0.3, y: bounds.min.y + height * 0.5 },
            { x: bounds.min.x + width * 0.7, y: bounds.min.y + height * 0.5 },
          ]
        : [],
    tabs:
      kind === "contour" || kind === "pocket"
        ? { count: 4, width: 4, height: 1 }
        : null,
    order: document.operations.reduce(
      (max, operation) => Math.max(max, operation.order + 1),
      0,
    ),
  };
}

function demoSurface(
  document: CamDocument,
): NonNullable<CamDocument["surface"]> {
  const bounds = stockBounds(document.stock);
  const cols = 21;
  const rows = 13;
  const cell = (bounds.max.x - bounds.min.x) / (cols - 1);
  const heights = Array.from({ length: cols * rows }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const inPocket = col > 5 && col < 15 && row > 3 && row < 9;
    const inStep = col > 16 && row > 2 && row < 10;
    return inPocket ? 4 : inStep ? 2 : 0;
  });
  return {
    origin: { x: bounds.min.x, y: bounds.min.y, z: bounds.max.z },
    cell,
    cols,
    rows,
    heights,
  };
}

function demoFlatPattern(document: CamDocument): CamFlatPattern {
  const drawing: FlatPatternDrawing = {
    units: "mm",
    outline: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 50 },
      { x: 0, y: 50 },
      { x: 0, y: 0 },
    ],
    holes: [
      [
        { x: 12, y: 12 },
        { x: 22, y: 12 },
        { x: 22, y: 22 },
        { x: 12, y: 22 },
        { x: 12, y: 12 },
      ],
    ],
    bends: [
      {
        start: { x: 36, y: 2 },
        end: { x: 36, y: 48 },
        angleDeg: 90,
        direction: "up",
        id: "bend-1",
        flangeLengthMM: 20,
      },
      {
        start: { x: 56, y: 2 },
        end: { x: 56, y: 48 },
        angleDeg: 90,
        direction: "down",
        id: "bend-2",
        flangeLengthMM: 20,
      },
    ],
  };
  return camFlatPatternFromPhase6(drawing, {
    source: "Bracket flat pattern",
    units: document.stock.units,
  });
}

function demoDocument(): CamDocument {
  const document = emptyCamDocument("Bracket CAM");
  const endmill = camToolFromPreset(0);
  const ballmill = camToolFromPreset(2);
  const drill = camToolFromPreset(3);
  if (!endmill || !ballmill || !drill) return document;
  document.tools = [endmill, ballmill, drill];
  document.stock = stockFromBody(
    {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 80, y: 50, z: 12 },
    },
    "box",
    2,
  );
  document.surface = demoSurface(document);
  document.operations = [
    {
      ...operationDefaults(document, "face"),
      id: camId("op"),
      name: "Face top",
      depth: 0.5,
      stepdown: 0.5,
      order: 0,
    },
    {
      ...operationDefaults(document, "contour"),
      id: camId("op"),
      name: "Outside contour",
      toolId: endmill.id,
      depth: 12,
      stepdown: 3,
      order: 1,
    },
    {
      ...operationDefaults(document, "drill"),
      id: camId("op"),
      name: "Mounting holes",
      toolId: drill.id,
      depth: 12,
      stepdown: 4,
      order: 2,
      holes: [
        { x: 15, y: 12 },
        { x: 65, y: 12 },
        { x: 15, y: 38 },
        { x: 65, y: 38 },
      ],
    },
    {
      ...operationDefaults(document, "parallel"),
      id: camId("op"),
      name: "Parallel finish",
      toolId: ballmill.id,
      depth: 4,
      stepdown: 1,
      stepover: 2,
      order: 3,
    },
  ];
  return document;
}

export const CamStudioWorkspace: React.FC<CamStudioWorkspaceProps> = ({
  document,
  readOnly = false,
  onChange,
}) => {
  const [section, setSection] = useState<Section>("stock");
  const [outputView, setOutputView] = useState<OutputView>("post");
  const [selectedToolId, setSelectedToolId] = useState<string | null>(
    document.tools[0]?.id ?? null,
  );
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(
    document.operations[0]?.id ?? null,
  );
  const [message, setMessage] = useState("");
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [generated, setGenerated] = useState<{
    document: CamDocument;
    result: CamToolpathResult;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generationMs, setGenerationMs] = useState<number | null>(null);
  const [generationMemory, setGenerationMemory] = useState("n/a");
  const [flatPath, setFlatPath] = useState<CamToolpath | null>(null);
  const cancelRef = useRef(false);
  const screenshotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!document.tools.some((tool) => tool.id === selectedToolId)) {
      setSelectedToolId(document.tools[0]?.id ?? null);
    }
    if (
      !document.operations.some(
        (operation) => operation.id === selectedOperationId,
      )
    ) {
      setSelectedOperationId(document.operations[0]?.id ?? null);
    }
  }, [
    document.tools,
    document.operations,
    selectedToolId,
    selectedOperationId,
  ]);

  const issues = useMemo(() => validateCamDocument(document), [document]);
  const paths = useMemo(() => {
    try {
      return { result: generateToolpaths(document), error: "" };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [document]);
  const activeResult =
    generated?.document === document ? generated.result : paths.result;
  const simulation = useMemo(() => {
    if (!activeResult) return { result: null, error: "" };
    try {
      return {
        result: simulateToolpaths(document, activeResult),
        error: "",
      };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [document, activeResult]);
  const posted = useMemo(() => {
    try {
      return { result: postProcess(document), error: "" };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [document]);
  const sheet = useMemo(() => {
    try {
      return {
        result: buildSetupSheet(document, { screenshots }),
        error: "",
      };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [document, screenshots]);
  const selectedTool =
    document.tools.find((tool) => tool.id === selectedToolId) ?? null;
  const selectedOperation =
    document.operations.find(
      (operation) => operation.id === selectedOperationId,
    ) ?? null;

  const commit = (next: CamDocument) => {
    if (!readOnly) onChange(next);
  };
  const updateStock = (patch: Partial<CamStock>) =>
    commit({ ...document, stock: { ...document.stock, ...patch } });
  const updateTool = (id: string, patch: Partial<CamTool>) =>
    commit({
      ...document,
      tools: document.tools.map((tool) =>
        tool.id === id ? { ...tool, ...patch } : tool,
      ),
    });
  const updateOperation = (id: string, patch: Partial<CamOperation>) =>
    commit({
      ...document,
      operations: document.operations.map((operation) =>
        operation.id === id ? { ...operation, ...patch } : operation,
      ),
    });
  const addTool = (index: number) => {
    const tool = camToolFromPreset(index);
    if (!tool) return;
    commit({ ...document, tools: [...document.tools, tool] });
    setSelectedToolId(tool.id);
  };
  const addOperation = (kind: OperationKind) => {
    const operation = operationDefaults(document, kind);
    commit({ ...document, operations: [...document.operations, operation] });
    setSelectedOperationId(operation.id);
  };
  const removeSelectedOperation = () => {
    if (!selectedOperation) return;
    commit({
      ...document,
      operations: document.operations.filter(
        (operation) => operation.id !== selectedOperation.id,
      ),
    });
    setSelectedOperationId(null);
  };
  const handleScreenshot = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setMessage("Screenshot must be PNG, JPEG or WebP.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setScreenshots((current) => [
          ...current.slice(-2),
          reader.result as string,
        ]);
        setMessage("Screenshot added to the setup sheet.");
      }
    };
    reader.readAsDataURL(file);
  };
  const loadDemo = () => {
    const demo = demoDocument();
    commit(demo);
    setSelectedToolId(demo.tools[0]?.id ?? null);
    setSelectedOperationId(demo.operations[0]?.id ?? null);
    setGenerated(null);
    setMessage("Loaded the local CAM demo with a 3D height-map surface.");
  };
  const runGeneration = async () => {
    if (generating) return;
    cancelRef.current = false;
    setGenerating(true);
    setProgress(0);
    setMessage("");
    const started = performance.now();
    try {
      const result = await generateToolpathsAsync(document, {
        shouldCancel: () => cancelRef.current,
        onProgress: (done, total) => setProgress(total > 0 ? done / total : 0),
      });
      if (cancelRef.current) return;
      const memory = (
        performance as Performance & {
          memory?: { usedJSHeapSize?: number };
        }
      ).memory?.usedJSHeapSize;
      setGenerated({ document, result });
      setGenerationMs(performance.now() - started);
      setGenerationMemory(
        typeof memory === "number"
          ? `${(memory / 1024 / 1024).toFixed(1)} MB used`
          : "memory n/a",
      );
      setMessage(
        `Generated ${result.paths.length} operation(s) with checked simulation.`,
      );
    } catch (error) {
      setGenerated(null);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
    }
  };
  const stock = (() => {
    try {
      return stockBounds(document.stock);
    } catch {
      return null;
    }
  })();
  const width = stock ? stock.max.x - stock.min.x : 100;
  const height = stock ? stock.max.y - stock.min.y : 80;
  const pad = Math.max(width, height) * 0.12 + 4;
  const viewWidth = width + pad * 2;
  const viewHeight = height + pad * 2;
  const px = (x: number) => (stock ? x - stock.min.x + pad : x);
  const py = (y: number) => (stock ? height - (y - stock.min.y) + pad : y);
  const selectedPath = activeResult?.paths.find(
    (path) => path.operationId === selectedOperationId,
  );

  return (
    <div
      className="cad-studio-light absolute inset-0 z-20 flex flex-col bg-gray-950 text-gray-200"
      data-testid="cam-studio-workspace"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-700 bg-gray-900 px-4 py-2">
        <div className="min-w-0">
          <input
            value={document.name}
            readOnly={readOnly}
            aria-label="CAM program name"
            onChange={(event) =>
              commit({ ...document, name: event.target.value })
            }
            className="w-64 rounded border border-transparent bg-transparent text-sm font-medium text-gray-100 outline-none hover:border-gray-700 focus:border-blue-500"
          />
          <div className="text-[11px] text-gray-500">
            CAM Studio · {document.tools.length} tool(s) ·{" "}
            {document.operations.length} operation(s)
            {activeResult
              ? ` · ${formatMinutes(activeResult.estimatedMinutes)} cutting`
              : ""}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <select
            value={document.post}
            aria-label="Post processor"
            disabled={readOnly}
            onChange={(event) =>
              commit({ ...document, post: event.target.value as PostId })
            }
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1"
          >
            <option value="grbl">GRBL</option>
            <option value="linuxcnc">LinuxCNC</option>
            <option value="fanuc">Generic Fanuc</option>
          </select>
          <button
            type="button"
            aria-label={
              generating ? "Generating toolpath" : "Generate toolpath"
            }
            onClick={() => void runGeneration()}
            disabled={
              readOnly || generating || document.operations.length === 0
            }
            className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {generating
              ? `Generate ${Math.round(progress * 100)}%`
              : "Generate"}
          </button>
          {generating && (
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="rounded border border-amber-700 px-2 py-1 text-amber-300"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={loadDemo}
            disabled={readOnly || generating}
            className="rounded border border-gray-700 px-2 py-1 hover:border-gray-500 disabled:opacity-40"
          >
            Load demo
          </button>
          <span
            className={`rounded px-2 py-1 ${
              issues.length
                ? "bg-red-950 text-red-300"
                : "bg-emerald-950 text-emerald-300"
            }`}
          >
            {issues.length ? `${issues.length} issue(s)` : "Ready"}
          </span>
        </div>
      </div>

      {message && (
        <div className="border-b border-gray-800 bg-gray-900 px-4 py-1 text-[11px] text-sky-300">
          {message}
          <button
            type="button"
            onClick={() => setMessage("")}
            className="ml-2 text-gray-500 hover:text-gray-200"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[360px] flex-none flex-col border-r border-gray-700 bg-gray-900/60">
          <div className="flex border-b border-gray-800">
            {(["stock", "tools", "operations", "flat"] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Show ${value} section`}
                  onClick={() => setSection(value)}
                  className={`flex-1 px-2 py-2 text-[11px] capitalize ${
                    section === value
                      ? "border-b-2 border-blue-500 text-gray-100"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {value}
                </button>
              ),
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {section === "stock" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Stock kind">
                    <select
                      value={document.stock.kind}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateStock({ kind: event.target.value as StockKind })
                      }
                      className={inputClass()}
                    >
                      <option value="box">Bounding box</option>
                      <option value="cylinder">Cylindrical</option>
                      <option value="custom">Custom</option>
                    </select>
                  </Field>
                  <Field label="Units">
                    <select
                      value={document.stock.units}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateStock({
                          units: event.target.value === "in" ? "in" : "mm",
                        })
                      }
                      className={inputClass()}
                    >
                      <option value="mm">mm</option>
                      <option value="in">in</option>
                    </select>
                  </Field>
                </div>
                {document.stock.kind === "box" && (
                  <VecField
                    label="Stock size"
                    value={document.stock.size}
                    disabled={readOnly}
                    onChange={(size) => updateStock({ size })}
                  />
                )}
                {document.stock.kind === "cylinder" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Diameter">
                      <NumberInput
                        value={document.stock.diameter}
                        disabled={readOnly}
                        onChange={(diameter) => updateStock({ diameter })}
                      />
                    </Field>
                    <Field label="Height">
                      <NumberInput
                        value={document.stock.height}
                        disabled={readOnly}
                        onChange={(height) => updateStock({ height })}
                      />
                    </Field>
                  </div>
                )}
                {document.stock.kind === "custom" && (
                  <div className="space-y-2">
                    <VecField
                      label="Custom minimum"
                      value={
                        document.stock.customBounds?.min ?? {
                          x: 0,
                          y: 0,
                          z: 0,
                        }
                      }
                      disabled={readOnly}
                      onChange={(min) =>
                        updateStock({
                          customBounds: {
                            min,
                            max: document.stock.customBounds?.max ?? {
                              x: 100,
                              y: 80,
                              z: 20,
                            },
                          },
                        })
                      }
                    />
                    <VecField
                      label="Custom maximum"
                      value={
                        document.stock.customBounds?.max ?? {
                          x: 100,
                          y: 80,
                          z: 20,
                        }
                      }
                      disabled={readOnly}
                      onChange={(max) =>
                        updateStock({
                          customBounds: {
                            min: document.stock.customBounds?.min ?? {
                              x: 0,
                              y: 0,
                              z: 0,
                            },
                            max,
                          },
                        })
                      }
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Margin">
                    <NumberInput
                      value={document.stock.margin}
                      disabled={readOnly}
                      onChange={(margin) => updateStock({ margin })}
                    />
                  </Field>
                  <Field label="Work origin">
                    <div className="text-[11px] text-gray-300">
                      {formatCamLength(
                        document.stock.origin.x,
                        document.stock.units,
                      )}{" "}
                      /{" "}
                      {formatCamLength(
                        document.stock.origin.y,
                        document.stock.units,
                      )}{" "}
                      /{" "}
                      {formatCamLength(
                        document.stock.origin.z,
                        document.stock.units,
                      )}
                    </div>
                  </Field>
                </div>
                <VecField
                  label="Origin position"
                  value={document.stock.origin}
                  disabled={readOnly}
                  onChange={(origin) => updateStock({ origin })}
                />
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    const current = stockBounds(document.stock);
                    const changed = stockFromBody(
                      current,
                      document.stock.kind,
                      document.stock.margin,
                      document.stock.units,
                    );
                    updateStock(changed);
                  }}
                  className="w-full rounded border border-gray-700 px-2 py-1 text-[11px] hover:border-gray-500 disabled:opacity-40"
                >
                  Fit stock to current bounds
                </button>
              </div>
            )}

            {section === "tools" && (
              <div className="space-y-3">
                <div className="flex gap-1">
                  <select
                    defaultValue="0"
                    disabled={readOnly}
                    aria-label="Add tool from library"
                    onChange={(event) => {
                      addTool(Number(event.target.value));
                      event.currentTarget.value = "0";
                    }}
                    className={inputClass()}
                  >
                    {CAM_TOOL_LIBRARY.map((tool, index) => (
                      <option key={tool.name} value={index}>
                        Add {tool.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  {document.tools.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setSelectedToolId(tool.id)}
                      className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                        tool.id === selectedToolId
                          ? "border-blue-500 bg-blue-950/40 text-gray-100"
                          : "border-gray-800 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      <span className="block">{tool.name}</span>
                      <span className="text-[10px] text-gray-500">
                        {tool.kind} · {tool.diameter} {document.stock.units} ·{" "}
                        {tool.feed} feed
                      </span>
                    </button>
                  ))}
                  {document.tools.length === 0 && (
                    <p className="text-[11px] text-gray-500">
                      Add a tool before posting an operation.
                    </p>
                  )}
                </div>
                {selectedTool && (
                  <div className="space-y-2 border-t border-gray-800 pt-2">
                    <Field label="Tool name">
                      <input
                        aria-label="Tool name"
                        value={selectedTool.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateTool(selectedTool.id, {
                            name: event.target.value,
                          })
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Kind">
                        <select
                          value={selectedTool.kind}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateTool(selectedTool.id, {
                              kind: event.target.value as CamTool["kind"],
                            })
                          }
                          className={inputClass()}
                        >
                          <option value="endmill">Endmill</option>
                          <option value="ballmill">Ballmill</option>
                          <option value="drill">Drill</option>
                          <option value="chamfer">Chamfer</option>
                        </select>
                      </Field>
                      <Field label="Material">
                        <input
                          aria-label="Tool material"
                          value={selectedTool.material}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateTool(selectedTool.id, {
                              material: event.target.value,
                            })
                          }
                          className={inputClass()}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["diameter", "Diameter"],
                          ["flutes", "Flutes"],
                          ["fluteLength", "Flute length"],
                          ["feed", "Feed"],
                          ["speed", "Speed"],
                          ["safeZ", "Safe Z"],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key} label={label}>
                          <NumberInput
                            value={selectedTool[key]}
                            disabled={readOnly}
                            onChange={(value) =>
                              updateTool(selectedTool.id, { [key]: value })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={readOnly || document.tools.length <= 1}
                      onClick={() => {
                        commit({
                          ...document,
                          tools: document.tools.filter(
                            (tool) => tool.id !== selectedTool.id,
                          ),
                        });
                        setSelectedToolId(
                          document.tools.find(
                            (tool) => tool.id !== selectedTool.id,
                          )?.id ?? null,
                        );
                      }}
                      className="w-full rounded border border-red-900 px-2 py-1 text-[11px] text-red-300 disabled:opacity-40"
                    >
                      Delete tool
                    </button>
                  </div>
                )}
              </div>
            )}

            {section === "flat" && (
              <div className="space-y-3">
                <p className="text-[11px] text-gray-500">
                  The Phase 6 developed outline is the cut contour. Bend lines
                  stay on BEND_UP/BEND_DOWN DXF layers and are never cut.
                </p>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    try {
                      const pattern = demoFlatPattern(document);
                      onChange({ ...document, flatPattern: pattern });
                      setFlatPath(null);
                      setMessage(
                        `Loaded ${pattern.bends.length} bend lines and ${pattern.holes.length} hole contour(s).`,
                      );
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Could not load the flat pattern.",
                      );
                    }
                  }}
                  className="w-full rounded border border-gray-700 px-2 py-1 text-[11px] hover:border-gray-500 disabled:opacity-40"
                >
                  Load demo flat pattern
                </button>
                {document.flatPattern ? (
                  <div className="space-y-2 rounded border border-gray-800 bg-gray-950/60 p-2">
                    <div className="text-xs text-gray-200">
                      {document.flatPattern.source}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {document.flatPattern.width.toFixed(1)} ×{" "}
                      {document.flatPattern.height.toFixed(1)}{" "}
                      {document.flatPattern.units} ·{" "}
                      {document.flatPattern.bends.length} bends ·{" "}
                      {document.flatPattern.holes.length} holes
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => {
                          try {
                            const path = generateFlatPatternToolpath(
                              document,
                              document.flatPattern!,
                              { depth: document.stock.size.z, leadIn: 1 },
                            );
                            setFlatPath(path);
                            setMessage(
                              `${path.operationName}: ${path.moves.length} moves, ${path.cutLength.toFixed(1)} ${document.stock.units} cut.`,
                            );
                          } catch (error) {
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : "Flat-pattern path failed.",
                            );
                          }
                        }}
                        className="rounded bg-blue-600 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                      >
                        Generate profile path
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const result = flatPatternCamDxf(
                              document.flatPattern!,
                              { title: document.name },
                            );
                            downloadTextFile(
                              result.fileName,
                              result.dxf,
                              "application/dxf",
                            );
                            setMessage(
                              `DXF: ${result.cutEntities} cut and ${result.bendEntities} bend entities.`,
                            );
                          } catch (error) {
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : "DXF export failed.",
                            );
                          }
                        }}
                        className="rounded border border-gray-700 px-2 py-1 text-[11px]"
                      >
                        Export DXF
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => {
                          onChange({ ...document, flatPattern: undefined });
                          setFlatPath(null);
                        }}
                        className="rounded border border-gray-800 px-2 py-1 text-[11px] text-gray-500"
                      >
                        Clear
                      </button>
                    </div>
                    {flatPath && (
                      <div className="mt-2 rounded bg-gray-900 p-2 text-[10px] text-gray-400">
                        {flatPath.moves.length} moves · cut{" "}
                        {flatPath.cutLength.toFixed(1)} · rapid{" "}
                        {flatPath.rapidLength.toFixed(1)} ·{" "}
                        {flatPath.estimatedMinutes.toFixed(2)} min
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    No flat pattern loaded. The demo preserves the developed
                    outline, holes and bend annotations.
                  </p>
                )}
              </div>
            )}

            {section === "operations" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      "face",
                      "contour",
                      "pocket",
                      "drill",
                      "chamfer",
                      "adaptive",
                      "parallel",
                      "pencil",
                      "rest",
                    ] as const
                  ).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      disabled={readOnly || document.tools.length === 0}
                      title={
                        document.tools.length === 0
                          ? "Add a tool before creating an operation"
                          : `Add ${kind} operation`
                      }
                      onClick={() => addOperation(kind)}
                      className="rounded border border-gray-700 px-1 py-1 text-[10px] capitalize hover:border-gray-500 disabled:opacity-40"
                    >
                      + {kind}
                    </button>
                  ))}
                </div>
                <div className="space-y-1">
                  {[...document.operations]
                    .sort((a, b) => a.order - b.order)
                    .map((operation) => (
                      <button
                        key={operation.id}
                        type="button"
                        onClick={() => setSelectedOperationId(operation.id)}
                        className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                          operation.id === selectedOperationId
                            ? "border-blue-500 bg-blue-950/40 text-gray-100"
                            : "border-gray-800 text-gray-400 hover:border-gray-600"
                        }`}
                      >
                        <span className="block">
                          {operation.order + 1}. {operation.name}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {operation.kind} · {operation.depth}{" "}
                          {document.stock.units} deep
                        </span>
                      </button>
                    ))}
                  {document.operations.length === 0 && (
                    <p className="text-[11px] text-gray-500">
                      Add a face, contour, pocket, drill or chamfer operation.
                    </p>
                  )}
                </div>
                {selectedOperation && (
                  <div className="space-y-2 border-t border-gray-800 pt-2">
                    <Field label="Operation name">
                      <input
                        aria-label="Operation name"
                        value={selectedOperation.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateOperation(selectedOperation.id, {
                            name: event.target.value,
                          })
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Kind">
                        <select
                          value={selectedOperation.kind}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateOperation(selectedOperation.id, {
                              kind: event.target.value as OperationKind,
                            })
                          }
                          className={inputClass()}
                        >
                          <option value="face">Face</option>
                          <option value="contour">Contour</option>
                          <option value="pocket">Pocket</option>
                          <option value="drill">Drill</option>
                          <option value="chamfer">Chamfer</option>
                          <option value="adaptive">3D adaptive</option>
                          <option value="parallel">3D parallel</option>
                          <option value="pencil">3D pencil</option>
                          <option value="rest">3D rest</option>
                        </select>
                      </Field>
                      <Field label="Tool">
                        <select
                          value={selectedOperation.toolId}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateOperation(selectedOperation.id, {
                              toolId: event.target.value,
                            })
                          }
                          className={inputClass()}
                        >
                          <option value="">Select tool</option>
                          {document.tools.map((tool) => (
                            <option key={tool.id} value={tool.id}>
                              {tool.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["depth", "Depth"],
                          ["stepdown", "Stepdown"],
                          ["stepover", "Stepover"],
                          ["leadIn", "Lead-in"],
                          ["leadOut", "Lead-out"],
                          ["order", "Order"],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key} label={label}>
                          <NumberInput
                            value={selectedOperation[key]}
                            disabled={readOnly}
                            onChange={(value) =>
                              updateOperation(selectedOperation.id, {
                                [key]: value,
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    {selectedOperation.kind !== "drill" && (
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ["x", "Profile X"],
                            ["y", "Profile Y"],
                            ["width", "Profile width"],
                            ["height", "Profile height"],
                          ] as const
                        ).map(([key, label]) => (
                          <Field key={key} label={label}>
                            <NumberInput
                              value={selectedOperation.profile[key]}
                              disabled={readOnly}
                              onChange={(value) =>
                                updateOperation(selectedOperation.id, {
                                  profile: {
                                    ...selectedOperation.profile,
                                    [key]: value,
                                  },
                                })
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    )}
                    {selectedOperation.kind === "drill" && (
                      <Field label="Holes" hint="x, y per line">
                        <textarea
                          aria-label="Hole coordinates"
                          value={selectedOperation.holes
                            .map((hole) => `${hole.x}, ${hole.y}`)
                            .join("\n")}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateOperation(selectedOperation.id, {
                              holes: event.target.value
                                .split("\n")
                                .map((line) => line.split(",").map(Number))
                                .filter(
                                  (parts) =>
                                    parts.length >= 2 &&
                                    parts.every((value) =>
                                      Number.isFinite(value),
                                    ),
                                )
                                .map(([x, y]) => ({ x: x!, y: y! })),
                            })
                          }
                          rows={3}
                          className={`${inputClass()} font-mono`}
                        />
                      </Field>
                    )}
                    {(selectedOperation.kind === "contour" ||
                      selectedOperation.kind === "pocket") && (
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="Tabs">
                          <NumberInput
                            value={selectedOperation.tabs?.count ?? 0}
                            disabled={readOnly}
                            onChange={(count) =>
                              updateOperation(selectedOperation.id, {
                                tabs: {
                                  count,
                                  width: selectedOperation.tabs?.width ?? 4,
                                  height: selectedOperation.tabs?.height ?? 1,
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label="Tab width">
                          <NumberInput
                            value={selectedOperation.tabs?.width ?? 4}
                            disabled={readOnly}
                            onChange={(width) =>
                              updateOperation(selectedOperation.id, {
                                tabs: {
                                  count: selectedOperation.tabs?.count ?? 0,
                                  width,
                                  height: selectedOperation.tabs?.height ?? 1,
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label="Tab height">
                          <NumberInput
                            value={selectedOperation.tabs?.height ?? 1}
                            disabled={readOnly}
                            onChange={(height) =>
                              updateOperation(selectedOperation.id, {
                                tabs: {
                                  count: selectedOperation.tabs?.count ?? 0,
                                  width: selectedOperation.tabs?.width ?? 4,
                                  height,
                                },
                              })
                            }
                          />
                        </Field>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={removeSelectedOperation}
                      className="w-full rounded border border-red-900 px-2 py-1 text-[11px] text-red-300 disabled:opacity-40"
                    >
                      Delete operation
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="max-h-32 overflow-auto border-t border-gray-800 bg-gray-950/80 p-2">
            {issues.length === 0 ? (
              <p className="text-[10px] text-emerald-400">
                Stock, tools and operations validate.
              </p>
            ) : (
              issues.slice(0, 6).map((issue) => (
                <div
                  key={`${issue.path}-${issue.code}`}
                  className="text-[10px] text-red-300"
                >
                  {issue.path}: {issue.message}
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[var(--cad-bg)]">
          <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-500">
            <span>Stock + toolpath preview</span>
            <span className="ml-auto">
              {stock
                ? `${formatCamLength(width, document.stock.units)} × ${formatCamLength(height, document.stock.units)}`
                : "invalid stock"}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
            <svg
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              className="h-full max-h-[620px] w-full"
              role="img"
              aria-label="CAM stock and toolpath preview"
            >
              <defs>
                <pattern
                  id="cam-grid"
                  width="10"
                  height="10"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 10 0 L 0 0 0 10"
                    fill="none"
                    stroke="#d5dbe3"
                    strokeWidth="0.3"
                  />
                </pattern>
              </defs>
              <rect
                width={viewWidth}
                height={viewHeight}
                fill="url(#cam-grid)"
              />
              {stock &&
                (document.stock.kind === "cylinder" ? (
                  <ellipse
                    cx={px((stock.min.x + stock.max.x) / 2)}
                    cy={py((stock.min.y + stock.max.y) / 2)}
                    rx={(stock.max.x - stock.min.x) / 2}
                    ry={(stock.max.y - stock.min.y) / 2}
                    fill="#e8f1fb"
                    stroke="#64748b"
                    strokeWidth="1"
                  />
                ) : (
                  <rect
                    x={pad}
                    y={pad}
                    width={width}
                    height={height}
                    fill="#e8f1fb"
                    stroke="#64748b"
                    strokeWidth="1"
                  />
                ))}
              {document.operations
                .filter((operation) => operation.kind !== "drill")
                .map((operation) => (
                  <rect
                    key={`profile-${operation.id}`}
                    x={px(operation.profile.x)}
                    y={py(operation.profile.y + operation.profile.height)}
                    width={operation.profile.width}
                    height={operation.profile.height}
                    fill="none"
                    stroke={
                      operation.id === selectedOperationId
                        ? "#b45309"
                        : "#475569"
                    }
                    strokeDasharray="3 2"
                    strokeWidth="0.8"
                  />
                ))}
              {document.operations
                .filter((operation) => operation.kind === "drill")
                .flatMap((operation) =>
                  operation.holes.map((hole, index) => (
                    <circle
                      key={`${operation.id}-${index}`}
                      cx={px(hole.x)}
                      cy={py(hole.y)}
                      r="1.5"
                      fill="#b45309"
                    />
                  )),
                )}
              {activeResult?.paths.map((path, index) => {
                const points = path.moves
                  .map((move) => `${px(move.x)},${py(move.y)}`)
                  .join(" ");
                return (
                  <polyline
                    key={path.operationId}
                    points={points}
                    fill="none"
                    stroke={
                      path.operationId === selectedOperationId
                        ? "#0369a1"
                        : [
                            "#0284c7",
                            "#7c3aed",
                            "#047857",
                            "#e11d48",
                            "#b45309",
                          ][index % 5]
                    }
                    strokeWidth={
                      path.operationId === selectedOperationId ? "1.4" : "0.9"
                    }
                    opacity={path.operationId === selectedOperationId ? 1 : 0.7}
                  />
                );
              })}
              {selectedPath && selectedPath.moves.length > 0 && (
                <text x={pad} y={viewHeight - 6} fill="#0e7490" fontSize="4">
                  {selectedPath.operationName} · {selectedPath.moves.length}{" "}
                  moves · {formatMinutes(selectedPath.estimatedMinutes)}
                </text>
              )}
            </svg>
          </div>
          <div className="border-t border-gray-800 px-3 py-2 text-[11px] text-gray-500">
            {paths.error
              ? paths.error
              : activeResult
                ? `${activeResult.cutLength.toFixed(1)} ${document.stock.units} cutting · ${formatMinutes(activeResult.estimatedMinutes)} estimated${generationMs !== null ? ` · generated in ${generationMs.toFixed(0)} ms · ${generationMemory}` : ""}`
                : "Add a tool and an operation to generate a path."}
          </div>
        </main>

        <aside className="flex w-[420px] flex-none flex-col border-l border-gray-700 bg-gray-900/60">
          <div className="flex border-b border-gray-800">
            {(["post", "setup", "paths", "checks"] as const).map((view) => (
              <button
                key={view}
                type="button"
                aria-label={`Show ${view} output`}
                onClick={() => setOutputView(view)}
                className={`flex-1 px-2 py-2 text-[11px] uppercase tracking-wide ${
                  outputView === view
                    ? "border-b-2 border-blue-500 text-gray-100"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {view}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {outputView === "post" && (
              <div className="flex h-full flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!posted.result}
                    onClick={() => {
                      if (!posted.result) return;
                      downloadTextFile(
                        `${document.name.replace(/[^A-Za-z0-9._-]+/g, "-") || "cam"}.nc`,
                        posted.result.program,
                        "text/plain",
                      );
                    }}
                    className="rounded bg-blue-600 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                  >
                    Download .nc
                  </button>
                  <span className="text-[10px] text-gray-500">
                    {posted.result
                      ? `${posted.result.operations.length} op(s) · ${formatMinutes(posted.result.estimatedMinutes)}`
                      : "post unavailable"}
                  </span>
                </div>
                {posted.error && (
                  <div className="rounded border border-red-900 bg-red-950/40 p-2 text-[11px] text-red-300">
                    {posted.error}
                  </div>
                )}
                <pre className="min-h-0 flex-1 overflow-auto rounded border border-gray-800 bg-white p-2 font-mono text-[10px] leading-4 text-gray-300">
                  {posted.result?.program ?? "No G-code yet."}
                </pre>
              </div>
            )}
            {outputView === "setup" && (
              <div className="flex h-full flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!sheet.result}
                    onClick={() => {
                      if (!sheet.result) return;
                      downloadTextFile(
                        sheet.result.fileName,
                        sheet.result.html,
                        "text/html",
                      );
                    }}
                    className="rounded bg-blue-600 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                  >
                    Download setup sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => screenshotRef.current?.click()}
                    className="rounded border border-gray-700 px-2 py-1 text-[11px]"
                  >
                    Add screenshot
                  </button>
                  <input
                    ref={screenshotRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      void handleScreenshot(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <span className="text-[10px] text-gray-500">
                    {screenshots.length} image(s)
                  </span>
                </div>
                {sheet.error && (
                  <div className="rounded border border-red-900 bg-red-950/40 p-2 text-[11px] text-red-300">
                    {sheet.error}
                  </div>
                )}
                {sheet.result && (
                  <iframe
                    title="Setup sheet preview"
                    srcDoc={sheet.result.html}
                    className="min-h-0 flex-1 rounded border border-gray-800 bg-white"
                  />
                )}
              </div>
            )}
            {outputView === "paths" && (
              <div className="space-y-2 text-[11px]">
                {paths.error && (
                  <div className="rounded border border-red-900 bg-red-950/40 p-2 text-red-300">
                    {paths.error}
                  </div>
                )}
                {activeResult?.paths.map((path) => (
                  <div
                    key={path.operationId}
                    className="rounded border border-gray-800 p-2"
                  >
                    <div className="font-medium text-gray-200">
                      {path.operationName}
                    </div>
                    <div className="text-gray-500">
                      {path.moves.length} moves · {path.cutLength.toFixed(2)}{" "}
                      cut · {path.rapidLength.toFixed(2)} rapid ·{" "}
                      {formatMinutes(path.estimatedMinutes)}
                    </div>
                  </div>
                ))}
                {!activeResult && !paths.error && (
                  <p className="text-gray-500">No generated paths.</p>
                )}
              </div>
            )}
            {outputView === "checks" && (
              <div className="space-y-2 text-[11px]">
                {simulation.error && (
                  <div className="rounded border border-red-900 bg-red-950/40 p-2 text-red-300">
                    {simulation.error}
                  </div>
                )}
                {simulation.result && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border border-gray-800 p-2">
                        <div className="text-gray-500">Collisions</div>
                        <div className="text-lg text-gray-200">
                          {simulation.result.collisions}
                        </div>
                      </div>
                      <div className="rounded border border-gray-800 p-2">
                        <div className="text-gray-500">Gouges</div>
                        <div className="text-lg text-gray-200">
                          {simulation.result.gouges}
                        </div>
                      </div>
                      <div className="rounded border border-gray-800 p-2">
                        <div className="text-gray-500">Missing links</div>
                        <div className="text-lg text-gray-200">
                          {simulation.result.missingLinks}
                        </div>
                      </div>
                      <div className="rounded border border-gray-800 p-2">
                        <div className="text-gray-500">Remaining stock</div>
                        <div className="text-lg text-gray-200">
                          {simulation.result.remainingPercent}%
                        </div>
                      </div>
                    </div>
                    <div className="text-gray-500">
                      {simulation.result.checkedMoves} moves checked ·{" "}
                      {simulation.result.outOfBounds} out-of-bounds
                    </div>
                    {simulation.result.issues
                      .slice(0, 12)
                      .map((issue, index) => (
                        <div
                          key={`${issue.code}-${issue.path}-${index}`}
                          className="rounded border border-red-900/60 bg-red-950/20 p-2 text-red-300"
                        >
                          <span className="font-mono text-[10px]">
                            {issue.code}
                          </span>{" "}
                          {issue.message}
                        </div>
                      ))}
                    {simulation.result.issues.length === 0 && (
                      <p className="text-emerald-400">
                        No collisions, gouges or missing links.
                      </p>
                    )}
                  </>
                )}
                {!simulation.result && !simulation.error && (
                  <p className="text-gray-500">
                    Generate a path to simulate it.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="border-t border-gray-800 p-2 text-[10px] text-gray-500">
            Local CAM data only. Post output uses the selected post; no machine
            is connected.
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CamStudioWorkspace;
