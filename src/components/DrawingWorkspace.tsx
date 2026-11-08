import React, { useMemo, useState } from "react";
import type { BomRow } from "../assemblies/bom";
import {
  activeSheetIndex,
  addDrawingSheet,
  applyDrawingBom,
  drawingBomColumns,
  drawingBomIssues,
  drawingPdf,
  drawingPrintHtml,
  drawingRender,
  drawingSheets,
  drawingSourceSignature,
  drawingSvg,
  drawingSvgSheets,
  duplicateActiveSheet,
  moveActiveSheet,
  parseDrawingScale,
  removeActiveSheet,
  renumberBalloons,
  setActiveSheet,
  sheetAt,
  syncDrawingBalloons,
  updateActiveSheet,
  GDT_CHARACTERISTICS,
  type DimensionTolerance,
  type DrawingBalloon,
  type DrawingBody,
  type DrawingBomColumn,
  type DrawingDimension,
  type DrawingDimensionKind,
  type DrawingGdt,
  type DrawingNote,
  type DrawingTabData,
  type DrawingViewConfig,
  type DrawingViewId,
  type GdtCharacteristic,
  type SheetOrientation,
  type SheetSize,
  type TitleBlockVariant,
} from "../drawings/model";
import {
  drawingDwg,
  drawingDxfSheets,
  verifyDrawingExport,
  type DrawingDwgVersion,
} from "../drawings/dwg";

interface DrawingWorkspaceProps {
  data: DrawingTabData;
  bodies: readonly DrawingBody[];
  bom: readonly BomRow[];
  sourceLabel: string;
  onChange: (data: DrawingTabData) => void;
}

function download(name: string, content: BlobPart, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const DrawingWorkspace: React.FC<DrawingWorkspaceProps> = ({
  data,
  bodies,
  bom,
  sourceLabel,
  onChange,
}) => {
  const [noteText, setNoteText] = useState("");
  const [balloonLabel, setBalloonLabel] = useState("");
  const [detailCenterX, setDetailCenterX] = useState("0");
  const [detailCenterY, setDetailCenterY] = useState("0");
  const [detailRadius, setDetailRadius] = useState("50");
  const [auxDirection, setAuxDirection] = useState<[string, string, string]>([
    "0.707",
    "0",
    "0.707",
  ]);
  const [gdtType, setGdtType] = useState<
    "feature-control" | "datum" | "surface-finish" | "weld"
  >("feature-control");
  const [gdtCharacteristic, setGdtCharacteristic] =
    useState<GdtCharacteristic>("flatness");
  const [gdtTolerance, setGdtTolerance] = useState("0.1");
  const [gdtDiameter, setGdtDiameter] = useState(false);
  const [gdtDatums, setGdtDatums] = useState("");
  const [gdtDatum, setGdtDatum] = useState("A");
  const [gdtRa, setGdtRa] = useState("3.2");
  const [gdtBodyId, setGdtBodyId] = useState("");
  const [balloonBodyId, setBalloonBodyId] = useState("");
  const [dimensionBodyId, setDimensionBodyId] = useState("");
  const [dimensionEdgeIndex, setDimensionEdgeIndex] = useState("");
  const [dimensionView, setDimensionView] = useState<DrawingViewId>("front");
  const [dimensionAxis, setDimensionAxis] = useState<"horizontal" | "vertical">(
    "horizontal",
  );
  const [weldType, setWeldType] = useState<
    "fillet" | "groove" | "plug" | "spot" | "seam"
  >("fillet");
  const [weldSize, setWeldSize] = useState("3");
  const [weldLength, setWeldLength] = useState("");
  const [weldPitch, setWeldPitch] = useState("");
  const [weldAllAround, setWeldAllAround] = useState(false);
  const [brokenCenterX, setBrokenCenterX] = useState("0");
  const [brokenCenterY, setBrokenCenterY] = useState("0");
  const [brokenRadius, setBrokenRadius] = useState("20");
  const [dwgStatus, setDwgStatus] = useState("");
  const [dwgVersion, setDwgVersion] = useState<DrawingDwgVersion>("R2000");
  const [selectedView, setSelectedView] = useState<DrawingViewId>("front");
  const [dimensionKind, setDimensionKind] =
    useState<DrawingDimensionKind>("linear");
  const [toleranceType, setToleranceType] =
    useState<DimensionTolerance["type"]>("none");
  const [toleranceUpper, setToleranceUpper] = useState("0.1");
  const [toleranceLower, setToleranceLower] = useState("0.1");
  const [toleranceFit, setToleranceFit] = useState("H7/g6");
  const [dimensionTextSize, setDimensionTextSize] = useState("3.5");
  const [customViewLabel, setCustomViewLabel] = useState("CUSTOM VIEW");
  const [customViewDirection, setCustomViewDirection] = useState<
    [string, string, string]
  >(["0.707", "0.707", "0.707"]);
  const [exportReport, setExportReport] = useState<ReturnType<
    typeof verifyDrawingExport
  > | null>(null);
  const sheetIndex = activeSheetIndex(data);
  const sheet = sheetAt(data, sheetIndex);
  const sheets = drawingSheets(data);
  const svg = useMemo(
    () => drawingSvg(data, bodies, sheet.showBom ? bom : [], sheetIndex),
    [data, bodies, bom, sheet.showBom, sheetIndex],
  );
  const sourceSignature = useMemo(
    () => drawingSourceSignature(bodies, bom),
    [bodies, bom],
  );
  const isStale = Boolean(
    data.sourceSignature && data.sourceSignature !== sourceSignature,
  );
  const visibleBom = useMemo(
    () => applyDrawingBom(bom, data.bom),
    [bom, data.bom],
  );
  const bomColumns = drawingBomColumns(data);
  const bomIssues = drawingBomIssues(
    { ...data, balloons: data.balloons },
    visibleBom,
  );
  const bomExportBlocked = bomIssues.some(
    (issue) => issue.severity === "error",
  );
  const selectedConfig = sheet.viewConfig?.[selectedView] ?? {};
  const selectedScale =
    selectedConfig.scale ??
    sheet.viewScales?.[selectedView] ??
    sheet.scaleValue ??
    parseDrawingScale(sheet.scale) ??
    undefined;
  const dimensionEdges = useMemo(() => {
    if (!dimensionBodyId) return [];
    const render = drawingRender(
      data,
      bodies,
      sheet.showBom ? bom : [],
      sheetIndex,
    );
    const view = render.views.find(
      (candidate) => candidate.id === dimensionView,
    );
    const seen = new Set<number>();
    return (view?.visible ?? [])
      .flatMap((edge) => {
        if (
          edge.bodyId !== dimensionBodyId ||
          edge.edgeIndex === undefined ||
          seen.has(edge.edgeIndex)
        )
          return [];
        seen.add(edge.edgeIndex);
        return [
          {
            edgeIndex: edge.edgeIndex,
            ...(edge.topologyId ? { topologyId: edge.topologyId } : {}),
            length:
              edge.fullA && edge.fullB
                ? Math.hypot(
                    edge.fullB[0] - edge.fullA[0],
                    edge.fullB[1] - edge.fullA[1],
                  )
                : Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]),
          },
        ];
      })
      .sort((a, b) => a.edgeIndex - b.edgeIndex);
  }, [
    bom,
    bodies,
    data,
    dimensionBodyId,
    dimensionView,
    sheet.showBom,
    sheetIndex,
  ]);

  const patch = (next: Partial<typeof sheet>) =>
    onChange(updateActiveSheet(data, { ...sheet, ...next }));

  const patchView = (next: Partial<DrawingViewConfig>) => {
    const current = sheet.viewConfig?.[selectedView] ?? {};
    patch({
      viewConfig: {
        ...sheet.viewConfig,
        [selectedView]: { ...current, ...next },
      },
    });
  };

  const clearViewField = (key: "parent" | "alignment") => {
    const current = { ...(sheet.viewConfig?.[selectedView] ?? {}) };
    delete current[key];
    patch({
      viewConfig: { ...sheet.viewConfig, [selectedView]: current },
    });
  };

  const patchViewScale = (value: string) => {
    const scale = Number(value);
    const next = { ...(sheet.viewScales ?? {}) };
    if (scale > 0) next[selectedView] = scale;
    else delete next[selectedView];
    patch({ viewScales: next });
  };

  const updateDimension = (id: string, next: Partial<DrawingDimension>) =>
    onChange({
      ...data,
      dimensions: (data.dimensions ?? []).map((dimension) =>
        dimension.id === id ? { ...dimension, ...next } : dimension,
      ),
    });

  const patchBom = (next: Partial<NonNullable<DrawingTabData["bom"]>>) =>
    onChange({ ...data, bom: { ...(data.bom ?? {}), ...next } });

  const toggleBomColumn = (column: DrawingBomColumn) => {
    const current = drawingBomColumns(data);
    const next = current.includes(column)
      ? current.filter((item) => item !== column)
      : [...current, column];
    patchBom({ columns: next });
  };

  const moveBomRow = (key: string, direction: -1 | 1) => {
    const order = visibleBom.map((row) => row.key);
    const index = order.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    patchBom({ rowOrder: order });
  };

  const setBomOverride = (
    key: string,
    next: NonNullable<NonNullable<DrawingTabData["bom"]>["overrides"]>[string],
  ) =>
    patchBom({
      overrides: {
        ...(data.bom?.overrides ?? {}),
        [key]: { ...(data.bom?.overrides?.[key] ?? {}), ...next },
      },
    });

  const addCustomView = () => {
    const direction = {
      x: Number(customViewDirection[0]) || 0,
      y: Number(customViewDirection[1]) || 0,
      z: Number(customViewDirection[2]) || 1,
    };
    if (Math.hypot(direction.x, direction.y, direction.z) < 1e-9) return;
    const id = `custom_${Date.now().toString(36)}`;
    patch({
      customViews: [
        ...(sheet.customViews ?? []),
        {
          id,
          label: customViewLabel.trim() || "CUSTOM VIEW",
          direction,
        },
      ],
    });
  };

  const removeCustomView = (id: string) =>
    patch({
      customViews: (sheet.customViews ?? []).filter((view) => view.id !== id),
    });

  const printDrawing = () => {
    const html = drawingPrintHtml(data, bodies, bom);
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
  };

  const runExportVerification = () => {
    setExportReport(verifyDrawingExport(data, bodies, bom, dwgVersion));
  };

  const exportSvg = () =>
    download(
      `${sheet.number || "drawing"}-sheets.svg`,
      drawingSvgSheets(data, bodies, sheet.showBom ? bom : []),
      "image/svg+xml",
    );

  const exportPdf = () =>
    download(
      `${sheet.number || "drawing"}.pdf`,
      drawingPdf(data, bodies, sheet.showBom ? bom : []),
      "application/pdf",
    );

  const exportDxf = () =>
    download(
      `${sheet.number || "drawing"}-sheets.dxf`,
      drawingDxfSheets(data, bodies, sheet.showBom ? bom : []),
      "application/dxf",
    );

  const exportDwg = () => {
    const result = drawingDwg(
      data,
      bodies,
      sheet.showBom ? bom : [],
      dwgVersion,
    );
    download(
      `${sheet.number || "drawing"}-${result.version}.dwg`,
      new Uint8Array(result.data),
      "application/acad",
    );
    const notices = [
      ...result.warnings,
      ...result.skipped.map((item) => `skipped ${item}`),
      ...result.downgraded.map((item) => `downgraded ${item}`),
    ];
    setDwgStatus(
      notices.length
        ? `DWG ${result.version} written with ${notices.length} notice(s): ${notices
            .slice(0, 2)
            .join("; ")}`
        : `DWG ${result.version} written (${result.signature})`,
    );
  };

  const addNote = () => {
    const text = noteText.trim();
    if (!text) return;
    const note: DrawingNote = {
      id: `note_${Date.now().toString(36)}`,
      sheet: sheetIndex,
      text,
      x: 12,
      y: 12 + data.notes.filter((n) => n.sheet === sheetIndex).length * 5,
    };
    onChange({ ...data, notes: [...data.notes, note] });
    setNoteText("");
  };

  const addGdt = () => {
    const item: DrawingGdt = {
      id: `gdt_${Date.now().toString(36)}`,
      sheet: sheetIndex,
      type: gdtType,
      x: 12,
      y: 44 + (data.gdt ?? []).filter((g) => g.sheet === sheetIndex).length * 9,
      ...(gdtBodyId ? { bodyId: gdtBodyId } : {}),
      ...(gdtType === "feature-control"
        ? {
            characteristic: gdtCharacteristic,
            tolerance: Math.max(0, Number(gdtTolerance) || 0.1),
            diameter: gdtDiameter,
            datums: gdtDatums
              .split(/[\s,]+/)
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : {}),
      ...(gdtType === "datum" ? { datum: gdtDatum || "A" } : {}),
      ...(gdtType === "surface-finish"
        ? { ra: Math.max(0, Number(gdtRa) || 3.2) }
        : {}),
      ...(gdtType === "weld"
        ? {
            weldType,
            weldSize: Math.max(0, Number(weldSize) || 3),
            ...(Number(weldLength) > 0
              ? { weldLength: Number(weldLength) }
              : {}),
            ...(Number(weldPitch) > 0 ? { weldPitch: Number(weldPitch) } : {}),
            allAround: weldAllAround,
          }
        : {}),
    };
    onChange({ ...data, gdt: [...(data.gdt ?? []), item] });
  };

  const addDimension = () => {
    const selectedEdge = dimensionEdges.find(
      (edge) => String(edge.edgeIndex) === dimensionEdgeIndex,
    );
    const tolerance =
      toleranceType === "none"
        ? undefined
        : toleranceType === "fit"
          ? ({ type: "fit", fit: toleranceFit || "H7" } as const)
          : ({
              type: toleranceType,
              upper: Math.abs(Number(toleranceUpper) || 0.1),
              lower: -Math.abs(Number(toleranceLower) || 0.1),
            } as const);
    const item: DrawingDimension = {
      id: `dim_${Date.now().toString(36)}`,
      sheet: sheetIndex,
      view: dimensionView,
      axis: dimensionAxis,
      kind: dimensionKind,
      ...(dimensionBodyId ? { bodyId: dimensionBodyId } : {}),
      ...(dimensionBodyId && dimensionEdgeIndex !== ""
        ? { edgeIndex: Number(dimensionEdgeIndex) }
        : {}),
      ...(selectedEdge?.topologyId
        ? { anchorId: selectedEdge.topologyId }
        : {}),
      ...(dimensionKind === "radius" || dimensionKind === "diameter"
        ? { circleIndex: 0 }
        : {}),
      ...(tolerance ? { tolerance } : {}),
      textSize: Math.max(1, Number(dimensionTextSize) || 3.5),
      offset: 7,
    };
    onChange({ ...data, dimensions: [...(data.dimensions ?? []), item] });
  };

  const addBalloon = () => {
    const label = balloonLabel.trim();
    if (!label) return;
    const balloon: DrawingBalloon = {
      id: `balloon_${Date.now().toString(36)}`,
      sheet: sheetIndex,
      label,
      x: 34,
      y: 34 + data.balloons.filter((b) => b.sheet === sheetIndex).length * 8,
      ...(balloonBodyId ? { bodyId: balloonBodyId } : {}),
    };
    const linked = syncDrawingBalloons(
      { ...data, balloons: [...data.balloons, balloon] },
      visibleBom,
      bodies,
    );
    onChange(linked);
    setBalloonLabel("");
  };

  return (
    <div
      data-testid="drawing-workspace"
      className="cad-studio-light absolute inset-0 z-20 flex bg-gray-900 text-xs text-gray-200"
    >
      <div className="w-72 flex-none border-r border-gray-700 p-3 space-y-3 overflow-y-auto">
        <div>
          <div className="text-sm font-semibold">Drawing</div>
          <div className="text-[10px] text-gray-500">
            Source: {sourceLabel || "active Part Studio"}
          </div>
          {!data.sourceSignature ? (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...data,
                  sourceSignature,
                  sourceUpdatedAt: Date.now(),
                })
              }
              className="mt-1 text-[10px] text-sky-300 underline"
            >
              Bind current source
            </button>
          ) : null}
          {isStale ? (
            <div
              data-testid="drawing-stale"
              className="mt-1 rounded border border-amber-700 bg-amber-950/50 p-1 text-[10px] text-amber-300"
            >
              Source changed since this drawing was updated.
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...data,
                    sourceSignature,
                    sourceUpdatedAt: Date.now(),
                  })
                }
                className="ml-1 underline"
              >
                Update drawing
              </button>
            </div>
          ) : null}
        </div>

        <section className="space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">
              Sheet {sheetIndex + 1} / {sheets.length}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Add drawing sheet"
                onClick={() => onChange(addDrawingSheet(data))}
                className="rounded bg-gray-700 px-1.5 py-0.5 hover:bg-gray-600"
              >
                +
              </button>
              <button
                type="button"
                aria-label="Remove drawing sheet"
                disabled={sheets.length <= 1}
                onClick={() => onChange(removeActiveSheet(data))}
                className="rounded bg-gray-700 px-1.5 py-0.5 hover:bg-gray-600 disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Duplicate drawing sheet"
                onClick={() => onChange(duplicateActiveSheet(data))}
                className="rounded bg-gray-700 px-1.5 py-0.5 hover:bg-gray-600"
              >
                ⧉
              </button>
              <button
                type="button"
                aria-label="Move sheet left"
                disabled={sheetIndex === 0}
                onClick={() => onChange(moveActiveSheet(data, -1))}
                className="rounded bg-gray-700 px-1.5 py-0.5 hover:bg-gray-600 disabled:opacity-40"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Move sheet right"
                disabled={sheetIndex === sheets.length - 1}
                onClick={() => onChange(moveActiveSheet(data, 1))}
                className="rounded bg-gray-700 px-1.5 py-0.5 hover:bg-gray-600 disabled:opacity-40"
              >
                →
              </button>
            </div>
          </div>
          <select
            aria-label="Drawing sheet"
            value={sheetIndex}
            onChange={(e) =>
              onChange(setActiveSheet(data, Number(e.target.value)))
            }
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1"
          >
            {sheets.map((s, index) => (
              <option key={`${s.number}-${index}`} value={index}>
                {index + 1}. {s.number} · {s.title}
              </option>
            ))}
          </select>
        </section>

        <label className="block text-[10px] text-gray-500">
          Sheet size
          <select
            aria-label="Sheet size"
            value={sheet.size}
            onChange={(e) => patch({ size: e.target.value as SheetSize })}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          >
            <option value="A0">A0</option>
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="A3">A3</option>
            <option value="A4">A4</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1">
          <input
            aria-label="Custom sheet width"
            value={sheet.format?.width ?? ""}
            onChange={(e) => {
              const width = Number(e.target.value);
              if (!(width > 0)) return;
              patch({
                format: {
                  name: sheet.format?.name ?? "CUSTOM",
                  width,
                  height: sheet.format?.height ?? 210,
                },
              });
            }}
            placeholder="Custom W mm"
            className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
          />
          <input
            aria-label="Custom sheet height"
            value={sheet.format?.height ?? ""}
            onChange={(e) => {
              const height = Number(e.target.value);
              if (!(height > 0)) return;
              patch({
                format: {
                  name: sheet.format?.name ?? "CUSTOM",
                  width: sheet.format?.width ?? 297,
                  height,
                },
              });
            }}
            placeholder="Custom H mm"
            className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
          />
        </div>
        <label className="block text-[10px] text-gray-500">
          Orientation
          <select
            aria-label="Sheet orientation"
            value={sheet.orientation}
            onChange={(e) =>
              patch({ orientation: e.target.value as SheetOrientation })
            }
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          >
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </label>
        <label className="block text-[10px] text-gray-500">
          Projection angle
          <select
            aria-label="Projection angle"
            value={sheet.projectionAngle ?? "third"}
            onChange={(e) =>
              patch({
                projectionAngle: e.target.value === "first" ? "first" : "third",
              })
            }
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          >
            <option value="third">Third angle</option>
            <option value="first">First angle</option>
          </select>
        </label>
        <label className="block text-[10px] text-gray-500">
          Title
          <input
            aria-label="Drawing title"
            value={sheet.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          />
        </label>
        <label className="block text-[10px] text-gray-500">
          Drawing number
          <input
            aria-label="Drawing number"
            value={sheet.number}
            onChange={(e) => patch({ number: e.target.value })}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          />
        </label>
        <label className="block text-[10px] text-gray-500">
          Title block
          <select
            aria-label="Title block variant"
            value={sheet.titleBlock ?? "standard"}
            onChange={(e) =>
              patch({ titleBlock: e.target.value as TitleBlockVariant })
            }
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          >
            <option value="standard">Standard</option>
            <option value="compact">Compact</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              ["Revision", "revision"],
              ["Date", "date"],
              ["Drawn by", "drawnBy"],
              ["Checked by", "checkedBy"],
              ["Approved by", "approvedBy"],
              ["Material", "material"],
              ["Finish", "finish"],
              ["Weight", "weight"],
            ] as const
          ).map(([label, key]) => (
            <input
              key={key}
              aria-label={`Title block ${label}`}
              value={sheet[key] ?? ""}
              onChange={(e) => patch({ [key]: e.target.value })}
              placeholder={label}
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            />
          ))}
        </div>
        <label className="block text-[10px] text-gray-500">
          Scale
          <input
            aria-label="Drawing scale"
            value={sheet.scale}
            onChange={(e) => patch({ scale: e.target.value })}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          />
        </label>
        <label className="block text-[10px] text-gray-500">
          Scale factor
          <input
            aria-label="Drawing scale factor"
            value={sheet.scaleValue ?? ""}
            onChange={(e) => patch({ scaleValue: Number(e.target.value) || 1 })}
            placeholder="1:1 = 1"
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          />
        </label>
        <label className="block text-[10px] text-gray-500">
          Exploded view offset (mm)
          <input
            aria-label="Drawing explode"
            value={sheet.explode ?? 0}
            onChange={(e) =>
              patch({ explode: Math.max(0, Number(e.target.value) || 0) })
            }
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-gray-300">
          <input
            type="checkbox"
            aria-label="Show BOM table"
            checked={sheet.showBom}
            onChange={(e) => patch({ showBom: e.target.checked })}
          />
          BOM table
        </label>
        <label className="flex items-center gap-2 text-[11px] text-gray-300">
          <input
            type="checkbox"
            aria-label="Show hidden lines"
            checked={sheet.showHiddenLines}
            onChange={(e) => patch({ showHiddenLines: e.target.checked })}
          />
          Hidden lines
        </label>
        <label className="flex items-center gap-2 text-[11px] text-gray-300">
          <input
            type="checkbox"
            aria-label="Monochrome plot"
            checked={sheet.plotStyle === "monochrome"}
            onChange={(e) =>
              patch({ plotStyle: e.target.checked ? "monochrome" : "color" })
            }
          />
          Monochrome plot
        </label>
        <label className="block text-[10px] text-gray-500">
          Line weight (mm)
          <input
            aria-label="Plot line weight"
            value={sheet.lineWeight ?? 0.35}
            onChange={(e) =>
              patch({
                lineWeight: Math.max(0.05, Number(e.target.value) || 0.35),
              })
            }
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          />
        </label>
        <label className="block text-[10px] text-gray-500">
          Sheet template
          <select
            aria-label="Sheet template"
            value={sheet.template ?? "ISO"}
            onChange={(e) =>
              patch({
                template: e.target.value as "NONE" | "ISO" | "ANSI" | "CUSTOM",
              })
            }
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-100"
          >
            <option value="NONE">None</option>
            <option value="ISO">ISO</option>
            <option value="ANSI">ANSI</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-gray-300">
          <input
            type="checkbox"
            aria-label="Zone grid"
            checked={sheet.showZones === true}
            onChange={(e) => patch({ showZones: e.target.checked })}
          />
          Zone grid
        </label>

        <section className="space-y-1 rounded bg-gray-800/60 p-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            View configuration
          </div>
          <select
            aria-label="Configured view"
            value={selectedView}
            onChange={(e) => setSelectedView(e.target.value as DrawingViewId)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
          >
            {[
              "front",
              "top",
              "right",
              "iso",
              "section",
              "detail",
              "auxiliary",
              "broken-out",
            ].map((view) => (
              <option key={view} value={view}>
                {view}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-1">
            <input
              aria-label="View label"
              value={selectedConfig.label ?? ""}
              disabled={selectedConfig.locked === true}
              onChange={(e) => patchView({ label: e.target.value })}
              placeholder="label"
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            />
            <input
              aria-label="View scale"
              value={selectedScale ?? ""}
              disabled={selectedConfig.locked === true}
              onChange={(e) => patchViewScale(e.target.value)}
              placeholder="scale"
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            />
            {(["x", "y", "w", "h"] as const).map((key) => (
              <input
                key={key}
                aria-label={`View ${key}`}
                data-testid={`drawing-view-${key}`}
                value={selectedConfig[key] ?? ""}
                disabled={selectedConfig.locked === true}
                onChange={(e) => patchView({ [key]: Number(e.target.value) })}
                placeholder={key.toUpperCase()}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <select
              aria-label="View parent"
              value={selectedConfig.parent ?? ""}
              disabled={selectedConfig.locked === true}
              onChange={(e) =>
                e.target.value
                  ? patchView({ parent: e.target.value as DrawingViewId })
                  : clearViewField("parent")
              }
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            >
              <option value="">No parent</option>
              {["front", "top", "right", "iso"].map((view) => (
                <option key={view} value={view}>
                  {view}
                </option>
              ))}
            </select>
            <select
              aria-label="View alignment"
              value={selectedConfig.alignment ?? ""}
              disabled={selectedConfig.locked === true}
              onChange={(e) =>
                e.target.value
                  ? patchView({
                      alignment: e.target.value as
                        | "left"
                        | "right"
                        | "above"
                        | "below",
                    })
                  : clearViewField("alignment")
              }
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            >
              <option value="">No alignment</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-[10px] text-gray-300">
            <input
              type="checkbox"
              aria-label="Suppress view"
              checked={selectedConfig.suppressed === true}
              onChange={(e) => patchView({ suppressed: e.target.checked })}
            />
            Suppressed
          </label>
          <label className="flex items-center gap-2 text-[10px] text-gray-300">
            <input
              type="checkbox"
              aria-label="Lock view"
              checked={selectedConfig.locked === true}
              onChange={(e) => patchView({ locked: e.target.checked })}
            />
            Locked
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(["X", "Y", "Z"] as const).map((label, index) => (
              <input
                key={label}
                aria-label={`Custom view direction ${label}`}
                value={customViewDirection[index]}
                onChange={(e) => {
                  const next: [string, string, string] = [
                    ...customViewDirection,
                  ];
                  next[index] = e.target.value;
                  setCustomViewDirection(next);
                }}
                placeholder={label}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
            ))}
          </div>
          <div className="flex gap-1">
            <input
              aria-label="Custom view label"
              value={customViewLabel}
              onChange={(e) => setCustomViewLabel(e.target.value)}
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            />
            <button
              type="button"
              onClick={addCustomView}
              className="rounded bg-gray-700 px-1 py-1 text-[10px] hover:bg-gray-600"
            >
              Add view
            </button>
          </div>
          {(sheet.customViews ?? []).map((view) => (
            <div
              key={view.id}
              className="flex items-center justify-between gap-1 rounded bg-gray-900/60 px-1.5 py-0.5 text-[10px]"
            >
              <span className="truncate">{view.label}</span>
              <button
                type="button"
                aria-label={`Remove ${view.label}`}
                data-testid={`drawing-remove-custom-view-${view.id}`}
                onClick={() => removeCustomView(view.id)}
                className="text-red-300"
              >
                ×
              </button>
            </div>
          ))}
        </section>

        <section className="space-y-1 rounded bg-gray-800/60 p-2">
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              aria-label="Section view"
              checked={Boolean(sheet.section)}
              onChange={(e) =>
                patch({
                  section: e.target.checked
                    ? {
                        axis: sheet.section?.axis ?? "x",
                        offset: sheet.section?.offset ?? 0,
                      }
                    : null,
                })
              }
            />
            Section A-A
          </label>
          {sheet.section && (
            <div className="grid grid-cols-2 gap-1">
              <select
                aria-label="Section axis"
                value={sheet.section.axis}
                onChange={(e) =>
                  patch({
                    section: {
                      ...sheet.section!,
                      axis: e.target.value as "x" | "y" | "z",
                    },
                  })
                }
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                <option value="x">X plane</option>
                <option value="y">Y plane</option>
                <option value="z">Z plane</option>
              </select>
              <input
                aria-label="Section offset"
                value={String(sheet.section.offset)}
                onChange={(e) =>
                  patch({
                    section: {
                      ...sheet.section!,
                      offset: Number(e.target.value) || 0,
                    },
                  })
                }
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
            </div>
          )}
          {sheet.section && (
            <div className="grid grid-cols-2 gap-1">
              <select
                aria-label="Section direction"
                value={sheet.section.direction ?? 1}
                onChange={(e) =>
                  patch({
                    section: {
                      ...sheet.section!,
                      direction: Number(e.target.value) === -1 ? -1 : 1,
                    },
                  })
                }
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                <option value="1">Positive side</option>
                <option value="-1">Negative side</option>
              </select>
              <input
                aria-label="Section depth"
                value={sheet.section.depth ?? ""}
                onChange={(e) =>
                  patch({
                    section: {
                      ...sheet.section!,
                      depth: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                placeholder="Depth"
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
              <input
                aria-label="Section hatch angle"
                value={sheet.section.hatchAngle ?? 45}
                onChange={(e) =>
                  patch({
                    section: {
                      ...sheet.section!,
                      hatchAngle: Number(e.target.value) || 45,
                    },
                  })
                }
                placeholder="Hatch angle"
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
              <input
                aria-label="Section hatch spacing"
                value={sheet.section.hatchSpacing ?? 3}
                onChange={(e) =>
                  patch({
                    section: {
                      ...sheet.section!,
                      hatchSpacing: Math.max(0.5, Number(e.target.value) || 3),
                    },
                  })
                }
                placeholder="Hatch spacing"
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
            </div>
          )}
        </section>

        <section className="space-y-1 rounded bg-gray-800/60 p-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Custom views
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              aria-label="Detail view"
              checked={Boolean(sheet.detail)}
              onChange={(e) =>
                patch({
                  detail: e.target.checked
                    ? {
                        label: "DETAIL A",
                        parent: "front",
                        centerX: Number(detailCenterX) || 0,
                        centerY: Number(detailCenterY) || 0,
                        radius: Math.max(0.1, Number(detailRadius) || 50),
                        scale: 2,
                      }
                    : null,
                })
              }
            />
            Detail view
          </label>
          {sheet.detail && (
            <div className="grid grid-cols-3 gap-1">
              <input
                aria-label="Detail center X"
                value={detailCenterX}
                onChange={(e) => {
                  setDetailCenterX(e.target.value);
                  patch({
                    detail: {
                      ...sheet.detail!,
                      centerX: Number(e.target.value) || 0,
                    },
                  });
                }}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="center X"
              />
              <input
                aria-label="Detail center Y"
                value={detailCenterY}
                onChange={(e) => {
                  setDetailCenterY(e.target.value);
                  patch({
                    detail: {
                      ...sheet.detail!,
                      centerY: Number(e.target.value) || 0,
                    },
                  });
                }}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="center Y"
              />
              <input
                aria-label="Detail radius"
                value={detailRadius}
                onChange={(e) => {
                  setDetailRadius(e.target.value);
                  patch({
                    detail: {
                      ...sheet.detail!,
                      radius: Math.max(0.1, Number(e.target.value) || 0.1),
                    },
                  });
                }}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="radius"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              aria-label="Auxiliary view"
              checked={Boolean(sheet.auxiliary)}
              onChange={(e) =>
                patch({
                  auxiliary: e.target.checked
                    ? {
                        label: "AUXILIARY",
                        direction: {
                          x: Number(auxDirection[0]) || 0,
                          y: Number(auxDirection[1]) || 0,
                          z: Number(auxDirection[2]) || 1,
                        },
                      }
                    : null,
                })
              }
            />
            Auxiliary view
          </label>
          {sheet.auxiliary && (
            <div className="grid grid-cols-3 gap-1">
              {(["X", "Y", "Z"] as const).map((label, index) => (
                <input
                  key={label}
                  aria-label={`Auxiliary direction ${label}`}
                  value={auxDirection[index]}
                  onChange={(e) => {
                    const next: [string, string, string] = [...auxDirection];
                    next[index] = e.target.value;
                    setAuxDirection(next);
                    patch({
                      auxiliary: {
                        ...sheet.auxiliary!,
                        direction: {
                          x: Number(next[0]) || 0,
                          y: Number(next[1]) || 0,
                          z: Number(next[2]) || 0,
                        },
                      },
                    });
                  }}
                  className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                  placeholder={label}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-1 rounded bg-gray-800/60 p-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              BOM table
            </div>
            <span className="text-[10px] text-gray-500">
              {bomIssues.length ? `${bomIssues.length} issue(s)` : "consistent"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                "item",
                "number",
                "name",
                "description",
                "qty",
                "material",
                "revision",
                "vendor",
              ] as DrawingBomColumn[]
            ).map((column) => (
              <label
                key={column}
                className="flex items-center gap-1 text-[10px]"
              >
                <input
                  type="checkbox"
                  aria-label={`BOM column ${column}`}
                  checked={bomColumns.includes(column)}
                  onChange={() => toggleBomColumn(column)}
                />
                {column}
              </label>
            ))}
          </div>
          {visibleBom.map((row, index) => (
            <div key={row.key} className="space-y-0.5 rounded bg-gray-800 p-1">
              <div className="flex items-center gap-1">
                <span className="w-4 text-[10px] text-gray-500">
                  {row.item ?? index + 1}
                </span>
                <input
                  aria-label={`BOM item ${row.key}`}
                  value={row.item ?? index + 1}
                  onChange={(e) =>
                    setBomOverride(row.key, {
                      item: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-10 rounded border border-gray-700 bg-gray-900 px-1 text-[10px]"
                />
                <input
                  aria-label={`BOM number ${row.key}`}
                  value={row.number}
                  onChange={(e) =>
                    setBomOverride(row.key, { number: e.target.value })
                  }
                  className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-1 text-[10px]"
                />
                <button
                  type="button"
                  aria-label={`Move BOM row ${row.key} up`}
                  onClick={() => moveBomRow(row.key, -1)}
                  className="text-gray-400"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move BOM row ${row.key} down`}
                  onClick={() => moveBomRow(row.key, 1)}
                  className="text-gray-400"
                >
                  ↓
                </button>
              </div>
              <input
                aria-label={`BOM description ${row.key}`}
                value={row.description}
                onChange={(e) =>
                  setBomOverride(row.key, { description: e.target.value })
                }
                placeholder="Description"
                className="w-full rounded border border-gray-700 bg-gray-900 px-1 text-[10px]"
              />
            </div>
          ))}
          {bomIssues.slice(0, 2).map((issue) => (
            <p key={issue.message} className="text-[10px] text-amber-300">
              {issue.message}
            </p>
          ))}
        </section>

        <section className="space-y-1 rounded bg-gray-800/60 p-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Associative dimensions
          </div>
          <div className="grid grid-cols-3 gap-1">
            <select
              aria-label="Dimension view"
              value={dimensionView}
              onChange={(e) => {
                setDimensionView(e.target.value as DrawingViewId);
                setDimensionEdgeIndex("");
              }}
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            >
              {(
                [
                  "front",
                  "top",
                  "right",
                  "iso",
                  "section",
                  "detail",
                  "auxiliary",
                  "broken-out",
                ] as const
              ).map((view) => (
                <option key={view} value={view}>
                  {view}
                </option>
              ))}
            </select>
            <select
              aria-label="Dimension axis"
              value={dimensionAxis}
              onChange={(e) =>
                setDimensionAxis(e.target.value as "horizontal" | "vertical")
              }
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
            <button
              type="button"
              onClick={addDimension}
              className="rounded bg-gray-700 px-1 py-1 text-[10px] hover:bg-gray-600"
            >
              Add dimension
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <select
              aria-label="Dimension kind"
              value={dimensionKind}
              onChange={(e) =>
                setDimensionKind(e.target.value as DrawingDimensionKind)
              }
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            >
              <option value="linear">Linear</option>
              <option value="ordinate">Ordinate</option>
              <option value="angular">Angular</option>
              <option value="radius">Radius</option>
              <option value="diameter">Diameter</option>
            </select>
            <input
              aria-label="Dimension text size"
              value={dimensionTextSize}
              onChange={(e) => setDimensionTextSize(e.target.value)}
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              placeholder="Text size"
            />
            <select
              aria-label="Dimension tolerance"
              value={toleranceType}
              onChange={(e) =>
                setToleranceType(e.target.value as DimensionTolerance["type"])
              }
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            >
              <option value="none">No tolerance</option>
              <option value="symmetric">Symmetric</option>
              <option value="limits">Limits</option>
              <option value="fit">ISO fit</option>
            </select>
            {toleranceType === "fit" ? (
              <input
                aria-label="Dimension fit"
                value={toleranceFit}
                onChange={(e) => setToleranceFit(e.target.value)}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="H7/g6"
              />
            ) : toleranceType === "none" ? null : (
              <>
                <input
                  aria-label="Dimension tolerance upper"
                  value={toleranceUpper}
                  onChange={(e) => setToleranceUpper(e.target.value)}
                  className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                  placeholder="+ upper"
                />
                <input
                  aria-label="Dimension tolerance lower"
                  value={toleranceLower}
                  onChange={(e) => setToleranceLower(e.target.value)}
                  className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                  placeholder="- lower"
                />
              </>
            )}
          </div>
          <select
            aria-label="Anchor dimension to body"
            value={dimensionBodyId}
            onChange={(e) => {
              setDimensionBodyId(e.target.value);
              setDimensionEdgeIndex("");
            }}
            className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
          >
            <option value="">All projected geometry</option>
            {bodies.map((body) => (
              <option key={body.id} value={body.id}>
                {body.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Dimension edge"
            value={dimensionEdgeIndex}
            onChange={(e) => setDimensionEdgeIndex(e.target.value)}
            disabled={!dimensionBodyId || dimensionEdges.length === 0}
            className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px] disabled:opacity-40"
          >
            <option value="">Body projected bounds</option>
            {dimensionEdges.map((edge) => (
              <option key={edge.edgeIndex} value={String(edge.edgeIndex)}>
                Edge {edge.edgeIndex + 1} · {edge.length.toFixed(1)} mm
              </option>
            ))}
          </select>
          {(data.dimensions ?? [])
            .filter((item) => item.sheet === sheetIndex)
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-1 rounded bg-gray-800 px-1.5 py-0.5 text-[10px]"
              >
                <span className="truncate">
                  {item.view} · {item.kind ?? "linear"} · {item.axis}
                  {item.bodyId ? " · body-linked" : ""}
                  {item.edgeIndex !== undefined ? " · edge" : ""}
                </span>
                <input
                  aria-label={`Offset ${item.id}`}
                  data-testid={`drawing-dimension-offset-${item.id}`}
                  value={item.offset ?? 7}
                  onChange={(e) =>
                    updateDimension(item.id, {
                      offset: Number(e.target.value) || 0,
                    })
                  }
                  className="w-9 rounded border border-gray-700 bg-gray-900 px-1 text-[10px]"
                />
                <button
                  type="button"
                  aria-label={`Delete ${item.id}`}
                  data-testid={`drawing-dimension-delete-${item.id}`}
                  onClick={() =>
                    onChange({
                      ...data,
                      dimensions: (data.dimensions ?? []).filter(
                        (dimension) => dimension.id !== item.id,
                      ),
                    })
                  }
                  className="text-red-300"
                >
                  ×
                </button>
              </div>
            ))}
        </section>

        <section className="space-y-1 rounded bg-gray-800/60 p-2">
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              aria-label="Broken-out view"
              checked={Boolean(sheet.brokenOut)}
              onChange={(e) =>
                patch({
                  brokenOut: e.target.checked
                    ? {
                        label: "BROKEN OUT",
                        parent: "front",
                        centerX: Number(brokenCenterX) || 0,
                        centerY: Number(brokenCenterY) || 0,
                        radius: Math.max(0.1, Number(brokenRadius) || 20),
                        scale: 2,
                      }
                    : null,
                })
              }
            />
            Broken-out view
          </label>
          {sheet.brokenOut && (
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ["X", brokenCenterX, setBrokenCenterX, "centerX"],
                  ["Y", brokenCenterY, setBrokenCenterY, "centerY"],
                  ["R", brokenRadius, setBrokenRadius, "radius"],
                ] as const
              ).map(([label, value, setValue, key]) => (
                <input
                  key={label}
                  aria-label={`Broken-out ${key}`}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    patch({
                      brokenOut: {
                        ...sheet.brokenOut!,
                        [key]: Math.max(
                          key === "radius" ? 0.1 : -1e9,
                          Number(e.target.value) || 0,
                        ),
                      },
                    });
                  }}
                  className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-1 rounded bg-gray-800/60 p-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            GD&amp;T &amp; weld
          </div>
          <div className="grid grid-cols-2 gap-1">
            <select
              aria-label="GD&T type"
              value={gdtType}
              onChange={(e) =>
                setGdtType(
                  e.target.value as
                    | "feature-control"
                    | "datum"
                    | "surface-finish"
                    | "weld",
                )
              }
              className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
            >
              <option value="feature-control">Feature control</option>
              <option value="datum">Datum</option>{" "}
              <option value="surface-finish">Surface finish</option>
              <option value="weld">Weld symbol</option>
            </select>
            {gdtType === "feature-control" && (
              <select
                aria-label="GD&T characteristic"
                value={gdtCharacteristic}
                onChange={(e) =>
                  setGdtCharacteristic(e.target.value as GdtCharacteristic)
                }
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                {GDT_CHARACTERISTICS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            )}
          </div>
          {gdtType === "feature-control" && (
            <div className="grid grid-cols-2 gap-1">
              <input
                aria-label="GD&T tolerance"
                value={gdtTolerance}
                onChange={(e) => setGdtTolerance(e.target.value)}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="Tolerance"
              />
              <input
                aria-label="GD&T datums"
                value={gdtDatums}
                onChange={(e) => setGdtDatums(e.target.value)}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="A B C"
              />
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                <input
                  type="checkbox"
                  aria-label="Diameter zone"
                  checked={gdtDiameter}
                  onChange={(e) => setGdtDiameter(e.target.checked)}
                />
                ⌀ zone
              </label>
            </div>
          )}
          {gdtType === "datum" && (
            <input
              aria-label="Datum label"
              value={gdtDatum}
              onChange={(e) => setGdtDatum(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              placeholder="Datum A"
            />
          )}
          {gdtType === "surface-finish" && (
            <input
              aria-label="Surface finish Ra"
              value={gdtRa}
              onChange={(e) => setGdtRa(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              placeholder="Ra"
            />
          )}
          {gdtType === "weld" && (
            <div className="grid grid-cols-2 gap-1">
              <select
                aria-label="Weld type"
                value={weldType}
                onChange={(e) =>
                  setWeldType(
                    e.target.value as
                      | "fillet"
                      | "groove"
                      | "plug"
                      | "spot"
                      | "seam",
                  )
                }
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                <option value="fillet">Fillet</option>
                <option value="groove">Groove</option>
                <option value="plug">Plug</option>
                <option value="spot">Spot</option>
                <option value="seam">Seam</option>
              </select>
              <input
                aria-label="Weld size"
                value={weldSize}
                onChange={(e) => setWeldSize(e.target.value)}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="Size"
              />
              <input
                aria-label="Weld length"
                value={weldLength}
                onChange={(e) => setWeldLength(e.target.value)}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="Length"
              />
              <input
                aria-label="Weld pitch"
                value={weldPitch}
                onChange={(e) => setWeldPitch(e.target.value)}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="Pitch"
              />
              <label className="col-span-2 flex items-center gap-1 text-[10px] text-gray-400">
                <input
                  type="checkbox"
                  aria-label="All-around weld"
                  checked={weldAllAround}
                  onChange={(e) => setWeldAllAround(e.target.checked)}
                />
                All-around weld
              </label>
            </div>
          )}
          <select
            aria-label="Anchor GD&T to body"
            value={gdtBodyId}
            onChange={(e) => setGdtBodyId(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
          >
            <option value="">Free sheet position</option>
            {bodies.map((body) => (
              <option key={body.id} value={body.id}>
                {body.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addGdt}
            className="w-full rounded bg-gray-700 py-1 text-[10px] hover:bg-gray-600"
          >
            Add GD&amp;T annotation
          </button>
          {(data.gdt ?? [])
            .filter((item) => item.sheet === sheetIndex)
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-1 rounded bg-gray-800 px-1.5 py-0.5 text-[10px]"
              >
                <span className="truncate">
                  {item.type === "feature-control"
                    ? `${item.characteristic} ${item.diameter ? "⌀" : ""}${item.tolerance}`
                    : item.type === "datum"
                      ? `Datum ${item.datum}`
                      : `Ra ${item.ra}`}
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${item.id}`}
                  data-testid={`drawing-gdt-delete-${item.id}`}
                  onClick={() =>
                    onChange({
                      ...data,
                      gdt: (data.gdt ?? []).filter((g) => g.id !== item.id),
                    })
                  }
                  className="text-red-300"
                >
                  ×
                </button>
              </div>
            ))}
        </section>

        <section className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Notes &amp; balloons
          </div>
          <div className="flex gap-1">
            <input
              aria-label="New note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Note text"
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
            />
            <button
              type="button"
              aria-label="Add note"
              onClick={addNote}
              className="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600"
            >
              +
            </button>
          </div>
          <select
            aria-label="Anchor balloon to body"
            value={balloonBodyId}
            onChange={(e) => setBalloonBodyId(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
          >
            <option value="">Free sheet position</option>
            {bodies.map((body) => (
              <option key={body.id} value={body.id}>
                {body.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            <input
              aria-label="New balloon"
              value={balloonLabel}
              onChange={(e) => setBalloonLabel(e.target.value)}
              placeholder="Balloon label"
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
            />
            <button
              type="button"
              aria-label="Add balloon"
              onClick={addBalloon}
              className="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600"
            >
              +
            </button>
          </div>
          {data.notes
            .filter((note) => note.sheet === sheetIndex)
            .map((note) => (
              <div
                key={note.id}
                className="space-y-0.5 rounded bg-gray-800 p-1 text-[10px]"
              >
                <div className="flex items-center gap-1">
                  <input
                    aria-label={`Note text ${note.id}`}
                    data-testid={`drawing-note-text-${note.id}`}
                    value={note.text}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        notes: data.notes.map((n) =>
                          n.id === note.id ? { ...n, text: e.target.value } : n,
                        ),
                      })
                    }
                    className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-1 text-[10px]"
                  />
                  <button
                    type="button"
                    aria-label={`Delete ${note.id}`}
                    data-testid={`drawing-note-delete-${note.id}`}
                    onClick={() =>
                      onChange({
                        ...data,
                        notes: data.notes.filter((n) => n.id !== note.id),
                      })
                    }
                    className="text-red-300"
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(["x", "y", "textSize", "landing"] as const).map((key) => (
                    <input
                      key={key}
                      aria-label={`Note ${key} ${note.id}`}
                      data-testid={`drawing-note-${key}-${note.id}`}
                      value={note[key] ?? (key === "landing" ? 7 : "")}
                      onChange={(e) =>
                        onChange({
                          ...data,
                          notes: data.notes.map((n) =>
                            n.id === note.id
                              ? { ...n, [key]: Number(e.target.value) || 0 }
                              : n,
                          ),
                        })
                      }
                      className="rounded border border-gray-700 bg-gray-900 px-1 text-[10px]"
                      placeholder={key}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  <input
                    type="checkbox"
                    aria-label="Note leader"
                    checked={note.leader === true}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        notes: data.notes.map((n) =>
                          n.id === note.id
                            ? { ...n, leader: e.target.checked }
                            : n,
                        ),
                      })
                    }
                  />
                  Leader
                </label>
              </div>
            ))}
          {data.balloons
            .filter((balloon) => balloon.sheet === sheetIndex)
            .map((balloon) => (
              <div
                key={balloon.id}
                className="space-y-0.5 rounded bg-gray-800 p-1 text-[10px]"
              >
                <div className="flex items-center gap-1">
                  <input
                    aria-label={`Balloon label ${balloon.id}`}
                    data-testid={`drawing-balloon-label-${balloon.id}`}
                    value={balloon.label}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        balloons: data.balloons.map((b) =>
                          b.id === balloon.id
                            ? { ...b, label: e.target.value }
                            : b,
                        ),
                      })
                    }
                    className="w-12 rounded border border-gray-700 bg-gray-900 px-1 text-[10px]"
                  />
                  <button
                    type="button"
                    aria-label={`Delete ${balloon.id}`}
                    data-testid={`drawing-balloon-delete-${balloon.id}`}
                    onClick={() =>
                      onChange({
                        ...data,
                        balloons: data.balloons.filter(
                          (b) => b.id !== balloon.id,
                        ),
                      })
                    }
                    className="text-red-300"
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(["x", "y", "textSize", "landing"] as const).map((key) => (
                    <input
                      key={key}
                      aria-label={`Balloon ${key} ${balloon.id}`}
                      data-testid={`drawing-balloon-${key}-${balloon.id}`}
                      value={balloon[key] ?? (key === "landing" ? 7 : "")}
                      onChange={(e) =>
                        onChange({
                          ...data,
                          balloons: data.balloons.map((b) =>
                            b.id === balloon.id
                              ? { ...b, [key]: Number(e.target.value) || 0 }
                              : b,
                          ),
                        })
                      }
                      className="rounded border border-gray-700 bg-gray-900 px-1 text-[10px]"
                      placeholder={key}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  <input
                    type="checkbox"
                    aria-label="Balloon leader"
                    checked={balloon.leader === true}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        balloons: data.balloons.map((b) =>
                          b.id === balloon.id
                            ? { ...b, leader: e.target.checked }
                            : b,
                        ),
                      })
                    }
                  />
                  Leader
                </label>
              </div>
            ))}
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onChange(renumberBalloons(data))}
              className="rounded bg-gray-700 px-1 py-1 text-[10px] hover:bg-gray-600"
            >
              Renumber balloons
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(syncDrawingBalloons(data, visibleBom, bodies))
              }
              className="rounded bg-gray-700 px-1 py-1 text-[10px] hover:bg-gray-600"
            >
              Link to BOM
            </button>
          </div>
        </section>

        {bomExportBlocked ? (
          <p className="rounded border border-red-800 bg-red-950/40 p-1 text-[10px] text-red-300">
            Fix BOM errors before exporting.
          </p>
        ) : null}
        <button
          type="button"
          onClick={exportSvg}
          disabled={bomExportBlocked}
          className="w-full rounded bg-blue-700 py-1.5 font-medium hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export SVG
        </button>
        <button
          type="button"
          onClick={exportPdf}
          disabled={bomExportBlocked}
          className="w-full rounded bg-blue-700 py-1.5 font-medium hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export PDF
        </button>
        <button
          type="button"
          onClick={exportDxf}
          disabled={bomExportBlocked}
          className="w-full rounded bg-gray-700 py-1.5 font-medium hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export DXF
        </button>
        <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
          <span>DWG release</span>
          <select
            aria-label="DWG release"
            value={dwgVersion}
            onChange={(event) =>
              setDwgVersion(event.target.value as DrawingDwgVersion)
            }
            className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-200"
          >
            <option value="R2000">R2000 (AC1015)</option>
            <option value="R2004">R2004 (AC1018)</option>
            <option value="R2018">R2018 (AC1032)</option>
          </select>
        </div>
        <button
          type="button"
          onClick={exportDwg}
          disabled={bomExportBlocked}
          className="w-full rounded bg-gray-700 py-1.5 font-medium hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export DWG
        </button>
        <button
          type="button"
          onClick={printDrawing}
          className="w-full rounded bg-gray-700 py-1.5 font-medium hover:bg-gray-600"
        >
          Print / plot
        </button>
        <button
          type="button"
          onClick={runExportVerification}
          className="w-full rounded bg-gray-700 py-1.5 font-medium hover:bg-gray-600"
        >
          Verify export
        </button>
        {exportReport ? (
          <p
            data-testid="drawing-export-verification"
            className={`text-[10px] leading-4 ${exportReport.ok ? "text-emerald-300" : "text-amber-300"}`}
          >
            {exportReport.ok ? "Export verified" : "Export issues"}:{" "}
            {exportReport.sheets} sheet(s), PDF {exportReport.pdfPages}, DXF{" "}
            {exportReport.dxfLayouts}, DWG {exportReport.dwgLayouts}, BOM{" "}
            {exportReport.bomRows} row(s).
            {exportReport.issues.length
              ? ` ${exportReport.issues.join("; ")}`
              : ""}
          </p>
        ) : null}
        {dwgStatus ? (
          <p
            data-testid="drawing-dwg-status"
            className="text-[10px] leading-4 text-gray-400"
          >
            {dwgStatus}
          </p>
        ) : null}
        <p className="text-[10px] leading-4 text-gray-500">
          Orthographic views with hidden-line removal, optional section A-A,
          multi-sheet PDF/DXF/SVG, binary DWG R2000/R2004/R2018, and
          assembly-linked BOM.
        </p>
      </div>
      <div className="min-w-0 flex-1 overflow-auto bg-gray-800 p-4">
        <div
          className="drawing-sheet-frame mx-auto bg-white shadow-xl"
          style={{ width: "min(100%, 1100px)" }}
          data-testid="drawing-preview"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
};

export default DrawingWorkspace;
