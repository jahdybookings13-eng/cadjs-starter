// Phase 6 → assembly BOM adapters.
//
// Drawings and the assembly BOM already consume `BomRow`; these adapters put
// cut-list and sheet-metal rows into that same shape instead of inventing a
// second table format that the drawing workspace cannot read.
import type { BomRow } from "./bom";
import type { CutListRow, SheetMetalBomRow } from "../model/phase6";

export function cutListBomRows(
  rows: readonly CutListRow[],
  prefix = "cut",
): BomRow[] {
  return rows.map((row, index) => ({
    key: `${prefix}-${row.mark}-${index}`,
    name: `${row.profileName} ${row.mark}`,
    number: row.mark,
    description: `${row.lengthMM.toFixed(1)} mm, ${row.angleStartDeg.toFixed(
      1,
    )}° / ${row.angleEndDeg.toFixed(1)}°`,
    materialId: row.materialId,
    qty: row.qty,
    depth: 0,
    bodyKind: "frame",
  }));
}

export function sheetMetalBomRows(
  rows: readonly SheetMetalBomRow[],
  prefix = "sheet",
): BomRow[] {
  return rows.map((row, index) => ({
    key: `${prefix}-${row.partNumber}-${index}`,
    name: row.description || row.partNumber,
    number: row.partNumber,
    description: `${row.thicknessMM.toFixed(2)} mm, ${row.flatWidthMM.toFixed(
      1,
    )} × ${row.flatHeightMM.toFixed(1)} mm, ${row.bendCount} bend${
      row.bendCount === 1 ? "" : "s"
    }`,
    materialId: row.material,
    qty: row.qty,
    depth: 0,
    bodyKind: "sheetMetal",
  }));
}
