// DXF sheet merge and binary DWG conversion.
//
// Kept out of ./model so the nasjidwg codec (1.6 MB) is only downloaded when
// Drawing Studio is opened, not during the CAD boot path.

import {
  BY_LAYER,
  explodeDimension,
  readDwg,
  readDxf,
  writeDwg2000,
  writeDwg2004,
  writeDwg2018,
  writeDxf,
  type DimensionEntity,
  type Drawing as CadDrawing,
  type Entity,
} from "nasjidwg";
import type { BomRow } from "../assemblies/bom";
import {
  applyDrawingBom,
  dimensionGeometry,
  drawingDxf,
  drawingPdf,
  drawingRender,
  drawingSheets,
  pdfText,
  type DrawingBody,
  type DrawingTabData,
} from "./model";

/** Native associative DIMENSION entities for one sheet. The rendered block
 *  keeps the exact SVG/DXF dimension picture, while the DIMENSION record
 *  carries the definition points, measurement and object association. */
function nativeDimensionsForSheet(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
  sheetIndex: number,
): { entities: Entity[]; blocks: CadDrawing["blocks"] } {
  const render = drawingRender(data, bodies, bom, sheetIndex);
  const entities: Entity[] = [];
  const blocks: CadDrawing["blocks"] = {};
  render.dimensions.forEach((dimension, index) => {
    const view = render.views.find(
      (candidate) => candidate.id === dimension.view,
    );
    const g = view ? dimensionGeometry(view, dimension) : null;
    if (!g) return;
    const horizontal = g.axis === "horizontal";
    const item: DimensionEntity = {
      type: "dimension",
      kind: "linear",
      dimensionType: 0,
      layer: "ANNOTATION",
      color: BY_LAYER,
      style: "Standard",
      definitionPoint: horizontal
        ? { x: g.x2, y: render.height - g.start, z: 0 }
        : { x: g.start, y: render.height - g.y2, z: 0 },
      textMidpoint: horizontal
        ? { x: (g.x1 + g.x2) / 2, y: render.height - g.start + 1, z: 0 }
        : { x: g.start + 1, y: render.height - (g.y1 + g.y2) / 2, z: 0 },
      point13: { x: g.x1, y: render.height - g.y1, z: 0 },
      point14: { x: g.x2, y: render.height - g.y2, z: 0 },
      rotation: horizontal ? 0 : Math.PI / 2,
      textRotation: 0,
      horizDirection: 0,
      measurement: g.value,
      text: g.value.toFixed(1),
    };
    const blockName = `*D${sheetIndex + 1}_${index}`;
    const drawn = explodeDimension(item);
    if (drawn.length) {
      item.blockName = blockName;
      blocks[blockName] = {
        name: blockName,
        basePoint: { x: 0, y: 0, z: 0 },
        entities: drawn,
      };
    }
    entities.push(item);
  });
  return { entities, blocks };
}

/**
 * Merge every sheet into one DXF as named paper-space layouts. The first
 * sheet is the current paper space; later sheets become `*Paper_Space<n>`
 * blocks with their own LAYOUT records. This is the same document object the
 * DWG writers consume, so DXF and DWG carry the same sheet tabs.
 */
function multiSheetCadDrawing(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
): CadDrawing {
  const sheets = drawingSheets(data);
  const first = readDxf(drawingDxf(data, bodies, bom, 0, false));
  const firstDimensions = nativeDimensionsForSheet(data, bodies, bom, 0);
  first.entities.push(...firstDimensions.entities);
  Object.assign(first.blocks, firstDimensions.blocks);
  first.dimStyles = first.dimStyles?.length
    ? first.dimStyles
    : [
        {
          name: "Standard",
          vars: { DIMSCALE: 1, DIMTXT: 3, DIMASZ: 2.5, DIMEXO: 1, DIMGAP: 0.5 },
        },
      ];
  if (sheets.length <= 1) return first;
  const blocks: CadDrawing["blocks"] = { ...first.blocks };
  const layouts: NonNullable<CadDrawing["layouts"]> = [
    { name: `Sheet 1 · ${sheets[0]?.number ?? "DWG"}`, tabOrder: 1 },
  ];
  for (let index = 1; index < sheets.length; index++) {
    const source = readDxf(drawingDxf(data, bodies, bom, index, false));
    const sheetDimensions = nativeDimensionsForSheet(data, bodies, bom, index);
    source.entities.push(...sheetDimensions.entities);
    Object.assign(blocks, sheetDimensions.blocks);
    const blockName = `*Paper_Space${index - 1}`;
    blocks[blockName] = {
      name: blockName,
      basePoint: { x: 0, y: 0, z: 0 },
      entities: source.entities,
      isLayout: true,
    };
    layouts.push({
      name: `Sheet ${index + 1} · ${sheets[index]?.number ?? "DWG"}`,
      blockName,
      tabOrder: index + 1,
    });
  }
  return {
    ...first,
    entities: [],
    paperSpace: first.entities,
    blocks,
    layouts,
    warnings: [],
  };
}

export function drawingDxfSheets(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
): string {
  return writeDxf(multiSheetCadDrawing(data, bodies, bom));
}

export type DrawingDwgVersion = "R2000" | "R2004" | "R2018";

const DWG_SIGNATURE: Record<DrawingDwgVersion, string> = {
  R2000: "AC1015",
  R2004: "AC1018",
  R2018: "AC1032",
};

export interface DrawingDwgResult {
  /** Binary AutoCAD DWG in the requested release. */
  data: Uint8Array;
  version: DrawingDwgVersion;
  /** Six-byte DWG version signature, e.g. `AC1015`. */
  signature: string;
  /** Sheet entities the DWG writer could not encode. */
  skipped: string[];
  /** Sheet entities written in a simpler DWG form. */
  downgraded: string[];
  /** Non-fatal DXF parse warnings from the intermediate sheet. */
  warnings: string[];
}

/** Write a real binary DWG from the same projected sheet used by the DXF/PDF
 *  exporters. `nasjidwg` reads the intermediate ASCII DXF and encodes the
 *  selected DWG release; this is a binary conversion, not a renamed DXF file. */
export function drawingDwg(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
  version: DrawingDwgVersion = "R2000",
): DrawingDwgResult {
  const drawing = multiSheetCadDrawing(data, bodies, bom);
  const result =
    version === "R2004"
      ? writeDwg2004(drawing)
      : version === "R2018"
        ? writeDwg2018(drawing)
        : writeDwg2000(drawing);
  return {
    data: result.data,
    version,
    signature: DWG_SIGNATURE[version],
    skipped: result.skipped,
    downgraded: result.downgraded,
    warnings: drawing.warnings,
  };
}

export interface DrawingExportVerification {
  sheets: number;
  scales: string[];
  bomRows: number;
  pdfPages: number;
  dxfLayouts: number;
  dwgLayouts: number;
  issues: string[];
  ok: boolean;
}

/** Verify the real exported files against the drawing definition. */
export function verifyDrawingExport(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
  dwgVersion: DrawingDwgVersion = "R2018",
): DrawingExportVerification {
  const sheets = drawingSheets(data);
  const pdf = drawingPdf(data, bodies, bom);
  const pdfPages = Number(pdf.match(/\/Count (\d+)/)?.[1] ?? 0);
  const dxf = readDxf(drawingDxfSheets(data, bodies, bom));
  const dxfLayouts = (dxf.layouts ?? []).filter((layout) =>
    /sheet/i.test(layout.name),
  ).length;
  const dwg = readDwg(drawingDwg(data, bodies, bom, dwgVersion).data);
  const dwgLayouts = (dwg.layouts ?? []).filter((layout) =>
    /sheet/i.test(layout.name),
  ).length;
  const bomRows = sheets.reduce(
    (sum, sheet) =>
      sum + (sheet.showBom ? applyDrawingBom(bom, data.bom).length : 0),
    0,
  );
  const issues: string[] = [];
  if (pdfPages !== sheets.length)
    issues.push(`PDF has ${pdfPages} pages; expected ${sheets.length}`);
  if (sheets.length > 1 && dxfLayouts !== sheets.length)
    issues.push(`DXF has ${dxfLayouts} layouts; expected ${sheets.length}`);
  if (sheets.length > 1 && dwgLayouts !== sheets.length)
    issues.push(`DWG has ${dwgLayouts} layouts; expected ${sheets.length}`);
  for (const sheet of sheets) {
    if (sheet.scale && !pdf.includes(pdfText(sheet.scale)))
      issues.push(`PDF does not show scale ${sheet.scale}`);
    if (sheet.showBom)
      for (const row of applyDrawingBom(bom, data.bom))
        if (row.number && !pdf.includes(pdfText(row.number)))
          issues.push(`PDF BOM missing ${row.number}`);
  }
  return {
    sheets: sheets.length,
    scales: sheets.map((sheet) => sheet.scale),
    bomRows,
    pdfPages,
    dxfLayouts,
    dwgLayouts,
    issues,
    ok: issues.length === 0,
  };
}
