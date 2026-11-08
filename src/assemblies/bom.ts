// Assembly BOM — pure grouping from assembly instances to part records/bodies.
// The assembly stores body/part references, not copied geometry, so the BOM
// follows edits in the Part Studio instead of drifting from a snapshot.
//
// Subassemblies are emitted as their own row, followed by their children at
// depth + 1. Leaf instances are grouped by part id across the whole tree, so
// repeated parts (including parts inside repeated subassemblies) get one row.

import {
  DEFAULT_BOM_COLUMNS,
  type Assembly,
  type AssemblyBomColumn,
  type AssemblyBomOverride,
  type AssemblyInstance,
} from "./model";
import type { BodyRecord, PartRecord } from "../model/parts";
import type { Phase6BodyKind, SheetMetalBodyMeta } from "../model/phase6";

export type BomMode = "structured" | "indented" | "flat";

export interface BomRow {
  key: string;
  /** Stable item number consumed by drawings and balloons. */
  item?: number;
  name: string;
  number: string;
  description: string;
  materialId: string | null;
  qty: number;
  revision?: string;
  vendor?: string;
  /** Phase 6 body classification, when the BOM row is a body. */
  bodyKind?: Phase6BodyKind;
  /** Phase 6 sheet-metal metadata, when the body has a rule. */
  sheetMetal?: SheetMetalBodyMeta;
  /** Indentation depth for the indented mode (subassemblies are one level). */
  depth: number;
}

interface BomContext {
  bodies: readonly BodyRecord[];
  parts: readonly PartRecord[];
  overrides: Readonly<Record<string, AssemblyBomOverride>>;
  rows: Map<string, BomRow>;
  ordered: string[];
}

function leafRow(
  inst: AssemblyInstance,
  context: BomContext,
  depth: number,
): BomRow {
  const bodyById = new Map(context.bodies.map((b) => [b.id, b]));
  const partById = new Map(context.parts.map((p) => [p.id, p]));
  const body =
    (inst.bodyId ? bodyById.get(inst.bodyId) : undefined) ??
    bodyById.get(inst.partId);
  const part =
    partById.get(inst.partId) ??
    (body?.partId ? partById.get(body.partId) : undefined);
  const key = part?.id ?? body?.id ?? inst.partId ?? inst.id;
  const override = context.overrides[key];
  const metadata = inst.metadata ?? {};
  return {
    key,
    name: part?.name ?? body?.name ?? inst.partId ?? inst.id,
    number: override?.number ?? metadata.number ?? part?.number ?? "",
    description:
      override?.description ?? metadata.description ?? part?.description ?? "",
    materialId:
      override?.materialId ?? metadata.material ?? body?.materialId ?? null,
    qty: 1,
    depth,
    ...(body?.kind ? { bodyKind: body.kind } : {}),
    ...(body?.sheetMetal ? { sheetMetal: { ...body.sheetMetal } } : {}),
    ...((override?.revision ?? metadata.revision)
      ? { revision: override?.revision ?? metadata.revision }
      : {}),
    ...((override?.vendor ?? metadata.vendor)
      ? { vendor: override?.vendor ?? metadata.vendor }
      : {}),
  };
}

function addLeaf(
  inst: AssemblyInstance,
  context: BomContext,
  depth: number,
): void {
  const row = leafRow(inst, context, depth);
  const existing = context.rows.get(row.key);
  if (existing) {
    existing.qty += 1;
    existing.depth = Math.min(existing.depth, depth);
    return;
  }
  context.rows.set(row.key, row);
  context.ordered.push(row.key);
}

function addAssembly(
  asm: Assembly,
  context: BomContext,
  depth: number,
  parentPath: string,
  parentQty: number,
): void {
  for (const inst of asm.instances) {
    if (inst.visible === false || inst.suppressed === true) continue;
    const path = parentPath ? `${parentPath}/${inst.id}` : inst.id;
    if (inst.subassembly) {
      const key = `sub:${path}`;
      const label = inst.name ?? inst.subassembly.name ?? "Subassembly";
      const row: BomRow = {
        key,
        name: label,
        number: "",
        description: "Subassembly",
        materialId: null,
        qty: parentQty,
        depth,
      };
      context.rows.set(key, row);
      context.ordered.push(key);
      addAssembly(inst.subassembly, context, depth + 1, path, 1);
    } else {
      addLeaf(inst, context, depth);
    }
  }
}

export function assemblyBom(
  asm: Assembly,
  bodies: readonly BodyRecord[],
  parts: readonly PartRecord[],
): BomRow[] {
  const context: BomContext = {
    bodies,
    parts,
    overrides: asm.bomOverrides ?? {},
    rows: new Map(),
    ordered: [],
  };
  addAssembly(asm, context, 0, "", 1);

  const rows = context.ordered
    .map((key) => context.rows.get(key)!)
    .filter(Boolean);

  return rows
    .sort((a, b) => {
      // Subassemblies lead their children, then numbered parts, then unnumbered.
      if (a.key.startsWith("sub:") !== b.key.startsWith("sub:"))
        return a.key.startsWith("sub:") ? -1 : 1;
      if (a.number && !b.number) return -1;
      if (!a.number && b.number) return 1;
      return a.number.localeCompare(b.number) || a.name.localeCompare(b.name);
    })
    .map((row, index) => ({ ...row, item: index + 1 }));
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function bomColumns(asm: Assembly): readonly AssemblyBomColumn[] {
  const configured = asm.bomColumns;
  if (!configured?.length) return DEFAULT_BOM_COLUMNS;
  const known = new Set(DEFAULT_BOM_COLUMNS.map((column) => column.id));
  return configured.filter((column) => known.has(column.id));
}

export function bomCsv(
  rows: readonly BomRow[],
  columns: readonly AssemblyBomColumn[] = DEFAULT_BOM_COLUMNS,
): string {
  const visible = columns.filter((column) => column.visible);
  const value = (row: BomRow, index: number, id: AssemblyBomColumn["id"]) => {
    switch (id) {
      case "item":
        return String(row.item ?? index + 1);
      case "number":
        return row.number;
      case "name":
        return row.name;
      case "description":
        return row.description;
      case "material":
        return row.materialId ?? "";
      case "qty":
        return String(row.qty);
      case "revision":
        return row.revision ?? "";
      case "vendor":
        return row.vendor ?? "";
    }
  };
  const header = visible.map((column) => column.label);
  const body = rows.map((row, index) =>
    visible.map((column) => value(row, index, column.id)),
  );
  return [header, ...body]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
}

/** Flatten an indented/structured BOM for display and CSV export. */
export function flattenBom(rows: readonly BomRow[], mode: BomMode): BomRow[] {
  if (mode === "indented") return rows.map((row) => ({ ...row }));
  return rows.map((row) => ({ ...row, depth: 0 }));
}
