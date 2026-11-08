// Phase 6 — model/data/export layer.
//
// This module owns the pure pieces of Phase 6 that do not depend on OCC:
// sheet-metal rules and bend tables, flat-pattern validation and DXF output,
// frame profiles and cut lists, surface-body classification, conversion
// diagnostics, unit formatting and persistence. Kernel geometry (base flange,
// bends, frame members, knit/trim/replace-face) is deliberately not claimed
// here.
import type { BodyOutput } from "./executor";
import { stableStringify } from "./stableJson";

export const PHASE6_SCHEMA_VERSION = 1 as const;

export type Phase6LengthUnit = "mm" | "in";
export type Phase6AngleUnit = "deg" | "rad";
export type Phase6BodyKind =
  | "solid"
  | "surface"
  | "sheetMetal"
  | "flatPattern"
  | "frame"
  | "unknown";

export interface Phase6Issue {
  path: string;
  message: string;
}

export type Phase6Result<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Phase6Issue[] };

const MM_PER_INCH = 25.4;
const EPS = 1e-9;

export function phase6Ok<T>(value: T): Phase6Result<T> {
  return { ok: true, value };
}

export function phase6Fail<T>(path: string, message: string): Phase6Result<T> {
  return { ok: false, errors: [{ path, message }] };
}

function finite(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: number): boolean {
  return finite(value) && value > 0;
}

function nonNegative(value: number): boolean {
  return finite(value) && value >= 0;
}

function nonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeLengthUnit(value: string): Phase6LengthUnit {
  return value.trim().toLowerCase() === "in" ||
    value.trim().toLowerCase() === "inch" ||
    value.trim().toLowerCase() === "inches"
    ? "in"
    : "mm";
}

export function toMillimetres(value: number, unit: Phase6LengthUnit): number {
  return unit === "in" ? value * MM_PER_INCH : value;
}

export function fromMillimetres(
  valueMM: number,
  unit: Phase6LengthUnit,
): number {
  return unit === "in" ? valueMM / MM_PER_INCH : valueMM;
}

export function formatLength(
  valueMM: number | null,
  unit: Phase6LengthUnit = "mm",
  precision = 2,
): string {
  if (valueMM === null || !finite(valueMM)) return "n/a";
  return `${fromMillimetres(valueMM, unit).toFixed(precision)} ${unit}`;
}

export function formatAngle(
  angleRad: number | null,
  unit: Phase6AngleUnit = "deg",
  precision = 2,
): string {
  if (angleRad === null || !finite(angleRad)) return "n/a";
  return unit === "deg"
    ? `${((angleRad * 180) / Math.PI).toFixed(precision)} deg`
    : `${angleRad.toFixed(precision)} rad`;
}

export function formatMass(
  massKg: number | null,
  unit: "kg" | "g" | "lb" = "kg",
  precision = 2,
): string {
  if (massKg === null || !finite(massKg)) return "n/a";
  if (unit === "g") return `${(massKg * 1000).toFixed(precision)} g`;
  if (unit === "lb") return `${(massKg * 2.2046226218).toFixed(precision)} lb`;
  return `${massKg.toFixed(precision)} kg`;
}

export function parseLengthToMM(
  text: string,
  defaultUnit: Phase6LengthUnit = "mm",
): number | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches)?\s*$/i.exec(
    text,
  );
  if (!match) return null;
  const raw = Number(match[1]);
  if (!finite(raw)) return null;
  const unit = (match[2] ?? defaultUnit).toLowerCase();
  if (unit === "in" || unit === "inch" || unit === "inches")
    return raw * MM_PER_INCH;
  if (unit === "cm") return raw * 10;
  if (unit === "m") return raw * 1000;
  return raw;
}

export function convertPhase6Length(
  valueMM: number,
  unit: Phase6LengthUnit,
): number {
  return unit === "in" ? valueMM / MM_PER_INCH : valueMM;
}

export function formatPhase6Length(
  valueMM: number,
  unit: Phase6LengthUnit = "mm",
  precision = 2,
): string {
  return `${convertPhase6Length(valueMM, unit).toFixed(precision)} ${unit}`;
}

export function parsePhase6Length(
  text: string,
  unit: Phase6LengthUnit = "mm",
): Phase6Result<number> {
  const value = parseLengthToMM(text, unit);
  return value === null
    ? phase6Fail("length", `"${text}" is not a valid length`)
    : phase6Ok(value);
}

export function convertPhase6Angle(
  value: number,
  from: Phase6AngleUnit,
  to: Phase6AngleUnit,
): number {
  const radians = from === "deg" ? (value * Math.PI) / 180 : value;
  return to === "deg" ? (radians * 180) / Math.PI : radians;
}

export function formatPhase6Angle(
  radians: number,
  unit: Phase6AngleUnit = "deg",
  precision = 1,
): string {
  return `${convertPhase6Angle(radians, "rad", unit).toFixed(precision)} ${unit}`;
}

export function parsePhase6Angle(
  text: string,
  unit: Phase6AngleUnit = "deg",
): Phase6Result<number> {
  const value = Number(text.trim());
  if (!finite(value))
    return phase6Fail("angle", `"${text}" is not a valid angle`);
  return phase6Ok(convertPhase6Angle(value, unit, "rad"));
}

export function formatKFactor(value: number, precision = 3): string {
  return value.toFixed(precision);
}

// ---------------------------------------------------------------------------
// Sheet-metal rules
// ---------------------------------------------------------------------------

export type SheetMetalRelief = "none" | "rectangular" | "round" | "tear";
export type SheetMetalCorner =
  | "closed"
  | "open"
  | "miter"
  | "overlap"
  | "underlap";
export type SheetMetalHem = "none" | "closed" | "open" | "rolled" | "teardrop";

export interface SheetMetalRule {
  id: string;
  name: string;
  material: string;
  thicknessMM: number;
  bendRadiusMM: number;
  /** Neutral-axis factor, 0..1. */
  kFactor: number;
  relief: SheetMetalRelief;
  reliefSizeMM: number;
  corner: SheetMetalCorner;
  hem: SheetMetalHem;
  /** Display/input unit for this rule; lengths stay stored in mm. */
  units?: Phase6LengthUnit;
  /** Optional table/style overrides; null derives from the K-factor. */
  bendAllowanceMM?: number | null;
  bendDeductionMM?: number | null;
  isDefault?: boolean;
}

export interface SheetMetalBodyMeta {
  ruleId: string;
  material: string;
  thicknessMM: number;
  bendCount: number;
  flatWidthMM: number;
  flatHeightMM: number;
  massKg: number | null;
  grainDirection: "x" | "y" | "none";
}

export function defaultSheetMetalRule(
  overrides: Partial<SheetMetalRule> = {},
): SheetMetalRule {
  return {
    id: "default-sheet-metal",
    name: "Default sheet metal",
    material: "steel",
    thicknessMM: 1.5,
    bendRadiusMM: 1.5,
    kFactor: 0.44,
    relief: "rectangular",
    reliefSizeMM: 1,
    corner: "closed",
    hem: "closed",
    units: "mm",
    bendAllowanceMM: null,
    bendDeductionMM: null,
    isDefault: true,
    ...overrides,
  };
}

export function validateSheetMetalRule(rule: SheetMetalRule): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!nonEmpty(rule.id))
    issues.push({ path: "rule.id", message: "id is required" });
  if (!nonEmpty(rule.name))
    issues.push({ path: "rule.name", message: "name is required" });
  if (!nonEmpty(rule.material))
    issues.push({ path: "rule.material", message: "material is required" });
  if (!positive(rule.thicknessMM))
    issues.push({
      path: "rule.thicknessMM",
      message: "thickness must be greater than zero",
    });
  if (!nonNegative(rule.bendRadiusMM))
    issues.push({
      path: "rule.bendRadiusMM",
      message: "bend radius cannot be negative",
    });
  if (!finite(rule.kFactor) || rule.kFactor < 0 || rule.kFactor > 1)
    issues.push({
      path: "rule.kFactor",
      message: "K-factor must be between 0 and 1",
    });
  if (!nonNegative(rule.reliefSizeMM))
    issues.push({
      path: "rule.reliefSizeMM",
      message: "relief size cannot be negative",
    });
  if (rule.units !== undefined && rule.units !== "mm" && rule.units !== "in")
    issues.push({ path: "rule.units", message: "units must be mm or in" });
  if (
    rule.bendAllowanceMM !== undefined &&
    rule.bendAllowanceMM !== null &&
    !nonNegative(rule.bendAllowanceMM)
  )
    issues.push({
      path: "rule.bendAllowanceMM",
      message: "bend allowance cannot be negative",
    });
  if (
    rule.bendDeductionMM !== undefined &&
    rule.bendDeductionMM !== null &&
    !nonNegative(rule.bendDeductionMM)
  )
    issues.push({
      path: "rule.bendDeductionMM",
      message: "bend deduction cannot be negative",
    });
  return issues;
}

export function createSheetMetalRule(input: {
  id?: string;
  name: string;
  material: string;
  thicknessMM: number;
  bendRadiusMM: number;
  kFactor: number;
  relief?: SheetMetalRelief;
  reliefSizeMM?: number;
  corner?: SheetMetalCorner;
  hem?: SheetMetalHem;
  units?: Phase6LengthUnit;
  bendAllowanceMM?: number | null;
  bendDeductionMM?: number | null;
  isDefault?: boolean;
}): Phase6Result<SheetMetalRule> {
  const rule: SheetMetalRule = {
    id: input.id?.trim() || `rule-${Date.now().toString(36)}`,
    name: input.name.trim(),
    material: input.material.trim(),
    thicknessMM: input.thicknessMM,
    bendRadiusMM: input.bendRadiusMM,
    kFactor: input.kFactor,
    relief: input.relief ?? "rectangular",
    reliefSizeMM: input.reliefSizeMM ?? 1,
    corner: input.corner ?? "closed",
    hem: input.hem ?? "closed",
    units: input.units ?? "mm",
    bendAllowanceMM: input.bendAllowanceMM ?? null,
    bendDeductionMM: input.bendDeductionMM ?? null,
    isDefault: input.isDefault ?? false,
  };
  const issues = validateSheetMetalRule(rule);
  return issues.length ? { ok: false, errors: issues } : phase6Ok(rule);
}

export function upsertSheetMetalRule(
  rules: readonly SheetMetalRule[],
  rule: SheetMetalRule,
): Phase6Result<SheetMetalRule[]> {
  const issues = validateSheetMetalRule(rule);
  if (issues.length) return { ok: false, errors: issues };
  const index = rules.findIndex((candidate) => candidate.id === rule.id);
  if (index < 0) return phase6Ok([...rules, rule]);
  const next = [...rules];
  next[index] = rule;
  return phase6Ok(next);
}

export function deleteSheetMetalRule(
  rules: readonly SheetMetalRule[],
  id: string,
): SheetMetalRule[] {
  return rules.filter((rule) => rule.id !== id);
}

export function duplicateSheetMetalRule(
  rule: SheetMetalRule,
  id = `${rule.id}-copy`,
): Phase6Result<SheetMetalRule> {
  return createSheetMetalRule({
    ...rule,
    id,
    name: `${rule.name} copy`,
    isDefault: false,
  });
}

/** Keep exactly one default rule after create/edit/delete. */
export function normalizeDefaultRule(
  rules: readonly SheetMetalRule[],
): SheetMetalRule[] {
  if (!rules.length) return [];
  const index = rules.findIndex((rule) => rule.isDefault);
  return rules.map((rule, at) => ({
    ...rule,
    isDefault: index < 0 ? at === 0 : at === index,
  }));
}

export function applySheetMetalRule(
  rule: SheetMetalRule,
  flatWidthMM: number,
  flatHeightMM: number,
  bendCount: number,
  densityKgM3: number | null = null,
): Phase6Result<SheetMetalBodyMeta> {
  const issues = validateSheetMetalRule(rule);
  if (!positive(flatWidthMM))
    issues.push({
      path: "body.flatWidthMM",
      message: "flat width must be greater than zero",
    });
  if (!positive(flatHeightMM))
    issues.push({
      path: "body.flatHeightMM",
      message: "flat height must be greater than zero",
    });
  if (!Number.isInteger(bendCount) || bendCount < 0)
    issues.push({
      path: "body.bendCount",
      message: "bend count must be a non-negative integer",
    });
  if (issues.length) return { ok: false, errors: issues };
  const massKg =
    densityKgM3 !== null && positive(densityKgM3)
      ? flatWidthMM * flatHeightMM * rule.thicknessMM * 1e-9 * densityKgM3
      : null;
  return phase6Ok({
    ruleId: rule.id,
    material: rule.material,
    thicknessMM: rule.thicknessMM,
    bendCount,
    flatWidthMM,
    flatHeightMM,
    massKg,
    grainDirection: "none",
  });
}

export interface SheetMetalFeatureValues {
  thickness: number;
  radius: number;
  angle: number;
  length?: number;
  kFactor: number;
  reliefSize?: number;
  gap?: number;
}

/** Validate feature-dialog values in the active length/angle units. */
export function validateSheetMetalFeatureValues(
  values: SheetMetalFeatureValues,
  unit: Phase6LengthUnit = "mm",
  angleUnit: Phase6AngleUnit = "rad",
): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  const mm = (value: number) => (unit === "in" ? value * MM_PER_INCH : value);
  const radians = (value: number) =>
    angleUnit === "deg" ? (value * Math.PI) / 180 : value;
  if (!positive(mm(values.thickness)))
    issues.push({
      path: "sheetMetal.thickness",
      message: "thickness must be greater than zero",
    });
  if (!nonNegative(mm(values.radius)))
    issues.push({
      path: "sheetMetal.radius",
      message: "bend radius cannot be negative",
    });
  if (
    !finite(radians(values.angle)) ||
    radians(values.angle) <= 0 ||
    radians(values.angle) > Math.PI
  )
    issues.push({
      path: "sheetMetal.angle",
      message: "angle must be greater than 0 and at most 180 degrees",
    });
  if (values.length !== undefined && !positive(mm(values.length)))
    issues.push({
      path: "sheetMetal.length",
      message: "length must be greater than zero",
    });
  if (!finite(values.kFactor) || values.kFactor < 0 || values.kFactor > 1)
    issues.push({
      path: "sheetMetal.kFactor",
      message: "K-factor must be between 0 and 1",
    });
  if (values.reliefSize !== undefined && !nonNegative(mm(values.reliefSize)))
    issues.push({
      path: "sheetMetal.reliefSize",
      message: "relief size cannot be negative",
    });
  if (values.gap !== undefined && !nonNegative(mm(values.gap)))
    issues.push({
      path: "sheetMetal.gap",
      message: "gap cannot be negative",
    });
  return issues;
}

// ---------------------------------------------------------------------------
// Bend tables
// ---------------------------------------------------------------------------

export interface BendTableRow {
  material: string;
  thicknessMM: number;
  radiusMM: number;
  angleDeg: number;
  allowanceMM: number;
  deductionMM: number;
}

export interface BendOverride {
  bendId: string;
  allowanceMM?: number;
  deductionMM?: number;
}

export interface BendTable {
  id: string;
  name: string;
  rows: BendTableRow[];
  /** Per-bend rows win over the material/thickness/radius lookup. */
  overrides?: BendOverride[];
}

export function bendAllowanceMM(
  angleRad: number,
  radiusMM: number,
  thicknessMM: number,
  kFactor: number,
): number {
  return angleRad * (radiusMM + kFactor * thicknessMM);
}

export function bendDeductionMM(
  angleRad: number,
  radiusMM: number,
  thicknessMM: number,
  kFactor: number,
): number {
  const allowance = bendAllowanceMM(angleRad, radiusMM, thicknessMM, kFactor);
  return Math.max(
    0,
    2 * (radiusMM + thicknessMM) * Math.tan(angleRad / 2) - allowance,
  );
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function headerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function columnIndex(
  header: readonly string[],
  names: readonly string[],
): number {
  const keys = header.map(headerKey);
  for (const name of names) {
    const found = keys.indexOf(name);
    if (found >= 0) return found;
  }
  return -1;
}

export function parseBendTableCsv(
  csv: string,
  opts: { id?: string; name?: string; overrides?: BendOverride[] } = {},
): Phase6Result<BendTable> {
  const rows = parseCsvRows(csv);
  if (rows.length < 2)
    return phase6Fail("bendTable", "CSV needs a header and at least one row");
  const header = rows[0]!;
  const material = columnIndex(header, ["material"]);
  const thickness = columnIndex(header, ["thicknessmm", "thickness"]);
  const radius = columnIndex(header, ["radiusmm", "radius", "insideradiusmm"]);
  const angle = columnIndex(header, ["angledeg", "angle"]);
  const allowance = columnIndex(header, [
    "allowancemm",
    "bendallowancemm",
    "bendallowance",
  ]);
  const deduction = columnIndex(header, [
    "deductionmm",
    "benddeductionmm",
    "benddeduction",
  ]);
  const errors: Phase6Issue[] = [];
  if (material < 0)
    errors.push({
      path: "bendTable.material",
      message: "missing material column",
    });
  if (thickness < 0)
    errors.push({
      path: "bendTable.thicknessMM",
      message: "missing thickness column",
    });
  if (radius < 0)
    errors.push({
      path: "bendTable.radiusMM",
      message: "missing radius column",
    });
  if (allowance < 0 && deduction < 0)
    errors.push({
      path: "bendTable.allowanceMM",
      message: "need an allowance or deduction column",
    });
  if (errors.length) return { ok: false, errors };

  const parsedRows: BendTableRow[] = [];
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index]!;
    if (!row.some((value) => value.trim().length > 0)) continue;
    const materialValue = (row[material] ?? "").trim();
    const thicknessMM = Number(row[thickness] ?? "");
    const radiusMM = Number(row[radius] ?? "");
    const angleDeg =
      angle >= 0 && (row[angle] ?? "").trim() ? Number(row[angle]) : 90;
    const allowanceMM =
      allowance >= 0 && (row[allowance] ?? "").trim()
        ? Number(row[allowance])
        : NaN;
    const deductionMM =
      deduction >= 0 && (row[deduction] ?? "").trim()
        ? Number(row[deduction])
        : NaN;
    if (!nonEmpty(materialValue)) {
      errors.push({
        path: `bendTable.rows[${index}].material`,
        message: "material is required",
      });
      continue;
    }
    if (!positive(thicknessMM) || !nonNegative(radiusMM) || !finite(angleDeg)) {
      errors.push({
        path: `bendTable.rows[${index}]`,
        message: "thickness must be > 0, radius >= 0 and angle numeric",
      });
      continue;
    }
    if (!finite(allowanceMM) && !finite(deductionMM)) {
      errors.push({
        path: `bendTable.rows[${index}]`,
        message: "allowance or deduction is required",
      });
      continue;
    }
    parsedRows.push({
      material: materialValue,
      thicknessMM,
      radiusMM,
      angleDeg,
      allowanceMM: finite(allowanceMM)
        ? allowanceMM
        : Math.max(
            0,
            bendAllowanceMM(
              (angleDeg * Math.PI) / 180,
              radiusMM,
              thicknessMM,
              0.44,
            ),
          ),
      deductionMM: finite(deductionMM)
        ? deductionMM
        : bendDeductionMM(
            (angleDeg * Math.PI) / 180,
            radiusMM,
            thicknessMM,
            0.44,
          ),
    });
  }
  if (!parsedRows.length)
    errors.push({ path: "bendTable.rows", message: "no valid rows" });
  if (errors.length) return { ok: false, errors };
  const table: BendTable = {
    id: opts.id?.trim() || `bend-table-${Date.now().toString(36)}`,
    name: opts.name?.trim() || "Bend table",
    rows: parsedRows,
    ...(opts.overrides?.length ? { overrides: opts.overrides } : {}),
  };
  const tableIssues = validateBendTable(table);
  return tableIssues.length
    ? { ok: false, errors: tableIssues }
    : phase6Ok(table);
}

export function validateBendTable(table: BendTable): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!nonEmpty(table.id))
    issues.push({ path: "bendTable.id", message: "id is required" });
  if (!nonEmpty(table.name))
    issues.push({ path: "bendTable.name", message: "name is required" });
  if (!table.rows.length)
    issues.push({
      path: "bendTable.rows",
      message: "at least one row is required",
    });
  const seenRows = new Set<string>();
  table.rows.forEach((row, index) => {
    const rowKey = [
      row.material.trim().toLowerCase(),
      row.thicknessMM,
      row.radiusMM,
      row.angleDeg,
    ].join("|");
    if (seenRows.has(rowKey))
      issues.push({
        path: `bendTable.rows[${index}]`,
        message: "duplicate material/thickness/radius/angle row",
      });
    seenRows.add(rowKey);
    if (!nonEmpty(row.material))
      issues.push({
        path: `bendTable.rows[${index}].material`,
        message: "material is required",
      });
    if (!positive(row.thicknessMM))
      issues.push({
        path: `bendTable.rows[${index}].thicknessMM`,
        message: "thickness must be greater than zero",
      });
    if (!nonNegative(row.radiusMM))
      issues.push({
        path: `bendTable.rows[${index}].radiusMM`,
        message: "radius cannot be negative",
      });
    if (!finite(row.angleDeg))
      issues.push({
        path: `bendTable.rows[${index}].angleDeg`,
        message: "angle is required",
      });
    if (!nonNegative(row.allowanceMM) || !nonNegative(row.deductionMM))
      issues.push({
        path: `bendTable.rows[${index}]`,
        message: "allowance and deduction cannot be negative",
      });
  });
  const seenBends = new Set<string>();
  (table.overrides ?? []).forEach((override, index) => {
    if (!nonEmpty(override.bendId))
      issues.push({
        path: `bendTable.overrides[${index}].bendId`,
        message: "bend id is required",
      });
    if (seenBends.has(override.bendId))
      issues.push({
        path: `bendTable.overrides[${index}].bendId`,
        message: `duplicate override for ${override.bendId}`,
      });
    seenBends.add(override.bendId);
    if (
      override.allowanceMM === undefined &&
      override.deductionMM === undefined
    )
      issues.push({
        path: `bendTable.overrides[${index}]`,
        message: "an override needs allowance or deduction",
      });
    if (
      override.allowanceMM !== undefined &&
      !nonNegative(override.allowanceMM)
    )
      issues.push({
        path: `bendTable.overrides[${index}].allowanceMM`,
        message: "allowance cannot be negative",
      });
    if (
      override.deductionMM !== undefined &&
      !nonNegative(override.deductionMM)
    )
      issues.push({
        path: `bendTable.overrides[${index}].deductionMM`,
        message: "deduction cannot be negative",
      });
  });
  return issues;
}

export function lookupBend(
  table: BendTable,
  input: {
    material: string;
    thicknessMM: number;
    radiusMM: number;
    angleDeg: number;
  },
  bendId?: string,
): Phase6Result<{ allowanceMM: number; deductionMM: number }> {
  const material = input.material.trim().toLowerCase();
  const matches = table.rows.filter(
    (row) =>
      row.material.trim().toLowerCase() === material &&
      Math.abs(row.thicknessMM - input.thicknessMM) < 1e-6 &&
      Math.abs(row.radiusMM - input.radiusMM) < 1e-6 &&
      Math.abs(row.angleDeg - input.angleDeg) < 1e-6,
  );
  if (!matches.length)
    return phase6Fail(
      "bendTable.lookup",
      `no row for ${input.material} ${input.thicknessMM}mm r${input.radiusMM} ${input.angleDeg}deg`,
    );
  const row = matches[0]!;
  const override = bendId
    ? table.overrides?.find((entry) => entry.bendId === bendId)
    : undefined;
  return phase6Ok({
    allowanceMM: override?.allowanceMM ?? row.allowanceMM,
    deductionMM: override?.deductionMM ?? row.deductionMM,
  });
}

// ---------------------------------------------------------------------------
// Flat-pattern drawing, validation and DXF
// ---------------------------------------------------------------------------

export interface Pt2 {
  x: number;
  y: number;
}

export interface FlatPatternBendLine {
  start: Pt2;
  end: Pt2;
  angleDeg: number;
  direction: "up" | "down" | "either";
  radiusMM?: number;
  id?: string;
  /** Developed flange length; zero means an invalid zero-length flange. */
  flangeLengthMM?: number;
  /** Applied bend relief width; zero means no relief. */
  reliefMM?: number;
  requiresRelief?: boolean;
}

export interface FlatPatternDrawing {
  outline: Pt2[];
  holes?: Pt2[][];
  bends?: FlatPatternBendLine[];
  units: Phase6LengthUnit;
  /** False marks an open/unclosed cut contour. Defaults to true. */
  closed?: boolean;
}

function samePoint(a: Pt2, b: Pt2, tolerance = 1e-6): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

function areaOf(points: readonly Pt2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function pointOnSegment(p: Pt2, a: Pt2, b: Pt2, tolerance = 1e-6): boolean {
  const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > tolerance) return false;
  const lengthSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  // A degenerate edge has no direction: it contains only its own point. Without
  // this guard the closing point appended by normalizedOutline makes every point
  // look "on the outline", disabling the hole/bend-outside checks.
  if (lengthSq <= tolerance * tolerance)
    return Math.abs(p.x - a.x) <= tolerance && Math.abs(p.y - a.y) <= tolerance;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  if (dot < -tolerance) return false;
  return dot <= lengthSq + tolerance;
}

function pointInPolygon(p: Pt2, polygon: readonly Pt2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (pointOnSegment(p, a, b)) return true;
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: Pt2, b: Pt2, c: Pt2, d: Pt2): boolean {
  const orient = (p: Pt2, q: Pt2, r: Pt2) =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function collinearOverlapLength(
  a: Pt2,
  b: Pt2,
  c: Pt2,
  d: Pt2,
  tolerance = 1e-6,
): number {
  const cross = (p: Pt2, q: Pt2, r: Pt2) =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (
    Math.abs(cross(a, b, c)) > tolerance ||
    Math.abs(cross(a, b, d)) > tolerance
  )
    return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= tolerance * tolerance) return 0;
  const project = (p: Pt2) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  const t0 = project(c);
  const t1 = project(d);
  const lo = Math.max(0, Math.min(t0, t1));
  const hi = Math.min(1, Math.max(t0, t1));
  return hi > lo + tolerance ? (hi - lo) * Math.sqrt(lengthSq) : 0;
}

function normalizedOutline(points: readonly Pt2[]): Pt2[] {
  if (!points.length) return [];
  const out = points.map((point) => ({ ...point }));
  if (!samePoint(out[0]!, out[out.length - 1]!)) out.push({ ...out[0]! });
  return out;
}

export function validateFlatPatternDrawing(
  drawing: FlatPatternDrawing,
): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  const outline = normalizedOutline(drawing.outline);
  if (drawing.closed === false)
    issues.push({
      path: "flatPattern.outline",
      message: "outline is open; close the cut contour before unfolding",
    });
  if (outline.length < 4)
    issues.push({
      path: "flatPattern.outline",
      message: "outline needs at least three points",
    });
  if (Math.abs(areaOf(outline)) < EPS)
    issues.push({
      path: "flatPattern.outline",
      message: "outline area is zero",
    });
  for (let i = 0; i < outline.length - 1; i++) {
    if (samePoint(outline[i]!, outline[i + 1]!))
      issues.push({
        path: `flatPattern.outline[${i}]`,
        message: "duplicate consecutive point",
      });
  }
  for (let i = 0; i < outline.length - 1; i++) {
    for (let j = i + 2; j < outline.length - 1; j++) {
      if (i === 0 && j === outline.length - 2) continue;
      if (
        segmentsIntersect(
          outline[i]!,
          outline[i + 1]!,
          outline[j]!,
          outline[j + 1]!,
        )
      )
        issues.push({
          path: `flatPattern.outline[${i}]`,
          message: "outline self-intersects",
        });
    }
  }
  for (let h = 0; h < (drawing.holes?.length ?? 0); h++) {
    const hole = drawing.holes![h]!;
    if (hole.length < 3) {
      issues.push({
        path: `flatPattern.holes[${h}]`,
        message: "hole needs at least three points",
      });
      continue;
    }
    for (const point of hole)
      if (!pointInPolygon(point, outline))
        issues.push({
          path: `flatPattern.holes[${h}]`,
          message: "hole is outside the outline",
        });
    const ring = normalizedOutline(hole);
    for (let i = 0; i < ring.length - 1; i++) {
      for (let j = i + 2; j < ring.length - 1; j++) {
        if (i === 0 && j === ring.length - 2) continue;
        if (segmentsIntersect(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!))
          issues.push({
            path: `flatPattern.holes[${h}]`,
            message: "hole contour self-intersects",
          });
      }
      for (let e = 0; e < outline.length - 1; e++) {
        if (
          segmentsIntersect(
            ring[i]!,
            ring[i + 1]!,
            outline[e]!,
            outline[e + 1]!,
          )
        )
          issues.push({
            path: `flatPattern.holes[${h}]`,
            message: "hole crosses the outline (non-manifold flat body)",
          });
      }
    }
    for (let other = h + 1; other < (drawing.holes?.length ?? 0); other++) {
      const peer = drawing.holes![other]!;
      if (pointInPolygon(hole[0]!, peer) || pointInPolygon(peer[0]!, hole))
        issues.push({
          path: `flatPattern.holes[${h}]`,
          message: `holes ${h} and ${other} overlap`,
        });
    }
  }
  for (let b = 0; b < (drawing.bends?.length ?? 0); b++) {
    const bend = drawing.bends![b]!;
    if (
      !pointInPolygon(bend.start, outline) ||
      !pointInPolygon(bend.end, outline)
    )
      issues.push({
        path: `flatPattern.bends[${b}]`,
        message: "bend line is outside the outline",
      });
    if (samePoint(bend.start, bend.end))
      issues.push({
        path: `flatPattern.bends[${b}]`,
        message: "bend line has zero length",
      });
    if (!finite(bend.angleDeg))
      issues.push({
        path: `flatPattern.bends[${b}].angleDeg`,
        message: "bend angle is required",
      });
    if (bend.flangeLengthMM !== undefined && !(bend.flangeLengthMM > 1e-9))
      issues.push({
        path: `flatPattern.bends[${b}].flangeLengthMM`,
        message: "flange has zero developed length",
      });
    if (
      bend.requiresRelief &&
      (bend.reliefMM === undefined || !(bend.reliefMM > 1e-9))
    )
      issues.push({
        path: `flatPattern.bends[${b}].reliefMM`,
        message: "bend requires relief but none is applied",
      });
    for (let other = b + 1; other < (drawing.bends?.length ?? 0); other++) {
      const peer = drawing.bends![other]!;
      if (
        segmentsIntersect(bend.start, bend.end, peer.start, peer.end) ||
        collinearOverlapLength(bend.start, bend.end, peer.start, peer.end) >
          1e-6
      )
        issues.push({
          path: `flatPattern.bends[${b}]`,
          message: `bend lines ${b} and ${other} overlap`,
        });
    }
  }
  if (drawing.units !== "mm" && drawing.units !== "in")
    issues.push({
      path: "flatPattern.units",
      message: "units must be mm or in",
    });
  return issues;
}

function dxfLine(layer: string, a: Pt2, b: Pt2): string {
  return [
    "0",
    "LINE",
    "8",
    layer,
    "10",
    a.x.toFixed(6),
    "20",
    a.y.toFixed(6),
    "30",
    "0.0",
    "11",
    b.x.toFixed(6),
    "21",
    b.y.toFixed(6),
    "31",
    "0.0",
  ].join("\n");
}

function dxfText(layer: string, at: Pt2, text: string): string {
  return [
    "0",
    "TEXT",
    "8",
    layer,
    "10",
    at.x.toFixed(6),
    "20",
    at.y.toFixed(6),
    "30",
    "0.0",
    "40",
    "2.5",
    "1",
    text.replace(/[\r\n]/g, " "),
  ].join("\n");
}

/** Deterministic, filesystem-safe name for a flat-pattern DXF. */
export function flatPatternDxfFileName(
  bodyId: string,
  units: Phase6LengthUnit,
  revision?: string,
): string {
  const slug = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const base = slug(bodyId) || "sheet-metal";
  const rev = revision ? slug(revision) : "";
  return `${base}-flat-pattern-${units}${rev ? `-${rev}` : ""}.dxf`;
}

export function flatPatternDxf(
  drawing: FlatPatternDrawing,
  opts: { title?: string } = {},
): Phase6Result<string> {
  const issues = validateFlatPatternDrawing(drawing);
  if (issues.length) return { ok: false, errors: issues };
  const units = drawing.units === "in" ? 1 : 4;
  const outline = normalizedOutline(drawing.outline);
  const lines: string[] = [];
  for (let i = 0; i < outline.length - 1; i++)
    lines.push(dxfLine("CUT", outline[i]!, outline[i + 1]!));
  for (const hole of drawing.holes ?? []) {
    const ring = normalizedOutline(hole);
    for (let i = 0; i < ring.length - 1; i++)
      lines.push(dxfLine("CUT", ring[i]!, ring[i + 1]!));
  }
  for (const bend of drawing.bends ?? []) {
    const layer =
      bend.direction === "up"
        ? "BEND_UP"
        : bend.direction === "down"
          ? "BEND_DOWN"
          : "BEND";
    lines.push(dxfLine(layer, bend.start, bend.end));
    const mid = {
      x: (bend.start.x + bend.end.x) / 2,
      y: (bend.start.y + bend.end.y) / 2,
    };
    lines.push(
      dxfText(layer, mid, `${bend.angleDeg.toFixed(1)} deg ${bend.direction}`),
    );
  }
  if (opts.title?.trim())
    lines.push(dxfText("ANNO", { x: 0, y: 0 }, opts.title.trim()));
  const header = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1009",
    "9",
    "$INSUNITS",
    "70",
    String(units),
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "TABLES",
    "0",
    "TABLE",
    "2",
    "LAYER",
    "70",
    "5",
    "0",
    "LAYER",
    "2",
    "CUT",
    "70",
    "0",
    "62",
    "7",
    "6",
    "CONTINUOUS",
    "0",
    "LAYER",
    "2",
    "BEND",
    "70",
    "0",
    "62",
    "1",
    "6",
    "CONTINUOUS",
    "0",
    "LAYER",
    "2",
    "BEND_UP",
    "70",
    "0",
    "62",
    "1",
    "6",
    "CONTINUOUS",
    "0",
    "LAYER",
    "2",
    "BEND_DOWN",
    "70",
    "0",
    "62",
    "3",
    "6",
    "CONTINUOUS",
    "0",
    "LAYER",
    "2",
    "ANNO",
    "70",
    "0",
    "62",
    "2",
    "6",
    "CONTINUOUS",
    "0",
    "ENDTAB",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
  ].join("\n");
  return phase6Ok(`${header}\n${lines.join("\n")}\n0\nENDSEC\n0\nEOF\n`);
}

// ---------------------------------------------------------------------------
// Frames: profiles, materials and cut lists
// ---------------------------------------------------------------------------

export type FrameProfileShape =
  | "squareTube"
  | "rectTube"
  | "roundTube"
  | "angle"
  | "channel"
  | "iBeam"
  | "custom";

export interface FrameMaterial {
  id: string;
  name: string;
  densityKgM3: number;
  color: string;
}

export interface FrameProfile {
  id: string;
  name: string;
  shape: FrameProfileShape;
  widthMM: number;
  heightMM: number;
  wallMM: number;
  areaMM2: number;
  materialId: string;
  densityKgM3: number;
  color: string;
  custom: boolean;
}

export const STANDARD_FRAME_MATERIALS: readonly FrameMaterial[] = [
  { id: "steel", name: "Steel", densityKgM3: 7850, color: "#9aa4ad" },
  { id: "aluminum", name: "Aluminum", densityKgM3: 2700, color: "#c9d1d9" },
  {
    id: "stainless",
    name: "Stainless steel",
    densityKgM3: 8000,
    color: "#b8c0c8",
  },
];

function roundTubeArea(diameterMM: number, wallMM: number): number {
  const inner = Math.max(0, diameterMM - 2 * wallMM);
  return (Math.PI / 4) * (diameterMM ** 2 - inner ** 2);
}

function rectTubeArea(
  widthMM: number,
  heightMM: number,
  wallMM: number,
): number {
  const innerW = Math.max(0, widthMM - 2 * wallMM);
  const innerH = Math.max(0, heightMM - 2 * wallMM);
  return widthMM * heightMM - innerW * innerH;
}

function angleArea(widthMM: number, heightMM: number, wallMM: number): number {
  return Math.max(0, wallMM * (widthMM + heightMM - wallMM));
}

function channelArea(
  widthMM: number,
  heightMM: number,
  wallMM: number,
): number {
  return Math.max(0, wallMM * (widthMM + 2 * heightMM - 2 * wallMM));
}

function iBeamArea(widthMM: number, heightMM: number, wallMM: number): number {
  return Math.max(
    0,
    2 * widthMM * wallMM + Math.max(0, heightMM - 2 * wallMM) * wallMM,
  );
}

function standardProfile(input: {
  id: string;
  name: string;
  shape: FrameProfileShape;
  widthMM: number;
  heightMM: number;
  wallMM: number;
  areaMM2: number;
  materialId?: string;
}): FrameProfile {
  const material =
    STANDARD_FRAME_MATERIALS.find((m) => m.id === input.materialId) ??
    STANDARD_FRAME_MATERIALS[0]!;
  return {
    id: input.id,
    name: input.name,
    shape: input.shape,
    widthMM: input.widthMM,
    heightMM: input.heightMM,
    wallMM: input.wallMM,
    areaMM2: input.areaMM2,
    materialId: material.id,
    densityKgM3: material.densityKgM3,
    color: material.color,
    custom: false,
  };
}

export const STANDARD_FRAME_PROFILES: readonly FrameProfile[] = [
  standardProfile({
    id: "sq-40-3",
    name: "Square tube 40 x 40 x 3",
    shape: "squareTube",
    widthMM: 40,
    heightMM: 40,
    wallMM: 3,
    areaMM2: rectTubeArea(40, 40, 3),
  }),
  standardProfile({
    id: "sq-50-3",
    name: "Square tube 50 x 50 x 3",
    shape: "squareTube",
    widthMM: 50,
    heightMM: 50,
    wallMM: 3,
    areaMM2: rectTubeArea(50, 50, 3),
  }),
  standardProfile({
    id: "rect-60-40-3",
    name: "Rectangular tube 60 x 40 x 3",
    shape: "rectTube",
    widthMM: 60,
    heightMM: 40,
    wallMM: 3,
    areaMM2: rectTubeArea(60, 40, 3),
  }),
  standardProfile({
    id: "rect-80-40-3",
    name: "Rectangular tube 80 x 40 x 3",
    shape: "rectTube",
    widthMM: 80,
    heightMM: 40,
    wallMM: 3,
    areaMM2: rectTubeArea(80, 40, 3),
  }),
  standardProfile({
    id: "round-42-3",
    name: "Round tube 42.4 x 3.2",
    shape: "roundTube",
    widthMM: 42.4,
    heightMM: 42.4,
    wallMM: 3.2,
    areaMM2: roundTubeArea(42.4, 3.2),
  }),
  standardProfile({
    id: "angle-40-4",
    name: "Angle 40 x 40 x 4",
    shape: "angle",
    widthMM: 40,
    heightMM: 40,
    wallMM: 4,
    areaMM2: angleArea(40, 40, 4),
  }),
  standardProfile({
    id: "channel-80-4",
    name: "Channel 80 x 40 x 4",
    shape: "channel",
    widthMM: 80,
    heightMM: 40,
    wallMM: 4,
    areaMM2: channelArea(80, 40, 4),
  }),
  standardProfile({
    id: "ibeam-100-50-5",
    name: "I-beam 100 x 50 x 5",
    shape: "iBeam",
    widthMM: 50,
    heightMM: 100,
    wallMM: 5,
    areaMM2: iBeamArea(50, 100, 5),
  }),
  standardProfile({
    id: "sq-30-2",
    name: "Square tube 30 x 30 x 2",
    shape: "squareTube",
    widthMM: 30,
    heightMM: 30,
    wallMM: 2,
    areaMM2: rectTubeArea(30, 30, 2),
  }),
  standardProfile({
    id: "sq-60-4",
    name: "Square tube 60 x 60 x 4",
    shape: "squareTube",
    widthMM: 60,
    heightMM: 60,
    wallMM: 4,
    areaMM2: rectTubeArea(60, 60, 4),
  }),
  standardProfile({
    id: "rect-100-50-4",
    name: "Rectangular tube 100 x 50 x 4",
    shape: "rectTube",
    widthMM: 100,
    heightMM: 50,
    wallMM: 4,
    areaMM2: rectTubeArea(100, 50, 4),
  }),
  standardProfile({
    id: "round-33-3",
    name: "Round tube 33.7 x 3.2",
    shape: "roundTube",
    widthMM: 33.7,
    heightMM: 33.7,
    wallMM: 3.2,
    areaMM2: roundTubeArea(33.7, 3.2),
  }),
  standardProfile({
    id: "round-48-3",
    name: "Round tube 48.3 x 3.2",
    shape: "roundTube",
    widthMM: 48.3,
    heightMM: 48.3,
    wallMM: 3.2,
    areaMM2: roundTubeArea(48.3, 3.2),
  }),
  standardProfile({
    id: "angle-50-5",
    name: "Angle 50 x 50 x 5",
    shape: "angle",
    widthMM: 50,
    heightMM: 50,
    wallMM: 5,
    areaMM2: angleArea(50, 50, 5),
  }),
  standardProfile({
    id: "channel-100-5",
    name: "Channel 100 x 50 x 5",
    shape: "channel",
    widthMM: 100,
    heightMM: 50,
    wallMM: 5,
    areaMM2: channelArea(100, 50, 5),
  }),
  standardProfile({
    id: "ibeam-120-60-6",
    name: "I-beam 120 x 60 x 6",
    shape: "iBeam",
    widthMM: 60,
    heightMM: 120,
    wallMM: 6,
    areaMM2: iBeamArea(60, 120, 6),
  }),
];

export function frameProfileDimensions(
  profile: FrameProfile,
  unit: Phase6LengthUnit = "mm",
): { width: number; height: number; wall: number } {
  const factor = unit === "in" ? 1 / MM_PER_INCH : 1;
  return {
    width: profile.widthMM * factor,
    height: profile.heightMM * factor,
    wall: profile.wallMM * factor,
  };
}

export function formatFrameProfileSize(
  profile: FrameProfile,
  unit: Phase6LengthUnit = "mm",
  precision = 2,
): string {
  const size = frameProfileDimensions(profile, unit);
  return `${size.width.toFixed(precision)} x ${size.height.toFixed(precision)} x ${size.wall.toFixed(precision)} ${unit}`;
}

export interface FrameProfileSearchOptions {
  shape?: FrameProfileShape;
  materialId?: string;
  unit?: Phase6LengthUnit;
}

export function searchFrameProfiles(
  profiles: readonly FrameProfile[],
  query: string,
  opts: FrameProfileSearchOptions = {},
): FrameProfile[] {
  const needle = query.trim().toLowerCase();
  return profiles.filter((profile) => {
    if (opts.shape && profile.shape !== opts.shape) return false;
    if (opts.materialId && profile.materialId !== opts.materialId) return false;
    if (!needle) return true;
    const size = frameProfileDimensions(profile, opts.unit ?? "mm");
    return [
      profile.id,
      profile.name,
      profile.shape,
      profile.materialId,
      String(profile.widthMM),
      String(profile.heightMM),
      String(profile.wallMM),
      size.width.toFixed(3),
      size.height.toFixed(3),
      size.wall.toFixed(3),
    ].some((value) => value.toLowerCase().includes(needle));
  });
}

export function groupFrameProfilesByShape(
  profiles: readonly FrameProfile[],
): Record<FrameProfileShape, FrameProfile[]> {
  const groups: Record<FrameProfileShape, FrameProfile[]> = {
    squareTube: [],
    rectTube: [],
    roundTube: [],
    angle: [],
    channel: [],
    iBeam: [],
    custom: [],
  };
  for (const profile of profiles) groups[profile.shape].push(profile);
  return groups;
}

export function validateFrameProfile(profile: FrameProfile): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!nonEmpty(profile.id))
    issues.push({ path: "frameProfile.id", message: "id is required" });
  if (!nonEmpty(profile.name))
    issues.push({ path: "frameProfile.name", message: "name is required" });
  if (!positive(profile.widthMM) || !positive(profile.heightMM))
    issues.push({
      path: "frameProfile.size",
      message: "width and height must be greater than zero",
    });
  if (!positive(profile.wallMM))
    issues.push({
      path: "frameProfile.wallMM",
      message: "wall must be greater than zero",
    });
  if (profile.wallMM * 2 >= Math.min(profile.widthMM, profile.heightMM))
    issues.push({
      path: "frameProfile.wallMM",
      message: "wall is too thick for the profile",
    });
  if (!positive(profile.areaMM2))
    issues.push({
      path: "frameProfile.areaMM2",
      message: "area must be greater than zero",
    });
  if (!positive(profile.densityKgM3))
    issues.push({
      path: "frameProfile.densityKgM3",
      message: "density must be greater than zero",
    });
  return issues;
}

export function createCustomFrameProfile(input: {
  id?: string;
  name: string;
  shape?: FrameProfileShape;
  widthMM: number;
  heightMM?: number;
  wallMM: number;
  areaMM2?: number;
  material: FrameMaterial;
  color?: string;
}): Phase6Result<FrameProfile> {
  const heightMM = input.heightMM ?? input.widthMM;
  const shape = input.shape ?? "custom";
  const area =
    input.areaMM2 ??
    (shape === "roundTube"
      ? roundTubeArea(input.widthMM, input.wallMM)
      : shape === "angle"
        ? angleArea(input.widthMM, heightMM, input.wallMM)
        : shape === "channel"
          ? channelArea(input.widthMM, heightMM, input.wallMM)
          : shape === "iBeam"
            ? iBeamArea(input.widthMM, heightMM, input.wallMM)
            : rectTubeArea(input.widthMM, heightMM, input.wallMM));
  const profile: FrameProfile = {
    id: input.id?.trim() || `frame-${Date.now().toString(36)}`,
    name: input.name.trim(),
    shape,
    widthMM: input.widthMM,
    heightMM,
    wallMM: input.wallMM,
    areaMM2: area,
    materialId: input.material.id,
    densityKgM3: input.material.densityKgM3,
    color: input.color?.trim() || input.material.color,
    custom: true,
  };
  const issues = validateFrameProfile(profile);
  return issues.length ? { ok: false, errors: issues } : phase6Ok(profile);
}

export function createFrameMaterial(input: {
  id?: string;
  name: string;
  densityKgM3: number;
  color?: string;
}): Phase6Result<FrameMaterial> {
  const material: FrameMaterial = {
    id: input.id?.trim() || `material-${Date.now().toString(36)}`,
    name: input.name.trim(),
    densityKgM3: input.densityKgM3,
    color: input.color?.trim() || "#9aa4ad",
  };
  const issues: Phase6Issue[] = [];
  if (!nonEmpty(material.id))
    issues.push({ path: "frameMaterial.id", message: "id is required" });
  if (!nonEmpty(material.name))
    issues.push({ path: "frameMaterial.name", message: "name is required" });
  if (!positive(material.densityKgM3))
    issues.push({
      path: "frameMaterial.densityKgM3",
      message: "density must be greater than zero",
    });
  return issues.length ? { ok: false, errors: issues } : phase6Ok(material);
}

export interface FrameMember {
  id: string;
  profileId: string;
  groupId: string;
  startMM: [number, number, number];
  endMM: [number, number, number];
  startAngleDeg?: number;
  endAngleDeg?: number;
  weldGapMM?: number;
}

export interface CutListRow {
  mark: string;
  profileId: string;
  profileName: string;
  materialId: string;
  lengthMM: number;
  angleStartDeg: number;
  angleEndDeg: number;
  qty: number;
  massKg: number;
  weldGapMM: number;
}

function distance3(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

export function frameCutList(
  members: readonly FrameMember[],
  profiles: readonly FrameProfile[],
): Phase6Result<CutListRow[]> {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const rows = new Map<string, CutListRow>();
  const errors: Phase6Issue[] = [];
  for (const member of members) {
    const profile = byId.get(member.profileId);
    if (!profile) {
      errors.push({
        path: `frame.members.${member.id}.profileId`,
        message: `unknown profile ${member.profileId}`,
      });
      continue;
    }
    const weldGap = Math.max(0, member.weldGapMM ?? 0);
    const length = Math.max(
      0,
      distance3(member.startMM, member.endMM) - weldGap,
    );
    if (!(length > EPS)) {
      errors.push({
        path: `frame.members.${member.id}`,
        message: "member has zero cut length",
      });
      continue;
    }
    const angleStart = member.startAngleDeg ?? 0;
    const angleEnd = member.endAngleDeg ?? 0;
    const key = [
      profile.id,
      length.toFixed(3),
      angleStart.toFixed(3),
      angleEnd.toFixed(3),
      weldGap.toFixed(3),
    ].join("|");
    const existing = rows.get(key);
    if (existing) {
      existing.qty += 1;
      continue;
    }
    rows.set(key, {
      mark: `M${rows.size + 1}`,
      profileId: profile.id,
      profileName: profile.name,
      materialId: profile.materialId,
      lengthMM: length,
      angleStartDeg: angleStart,
      angleEndDeg: angleEnd,
      qty: 1,
      massKg: profile.areaMM2 * length * 1e-9 * profile.densityKgM3,
      weldGapMM: weldGap,
    });
  }
  if (errors.length) return { ok: false, errors };
  return phase6Ok([...rows.values()]);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function cutListCsv(rows: readonly CutListRow[]): string {
  const header = [
    "Mark",
    "Profile",
    "Material",
    "Length (mm)",
    "Start angle (deg)",
    "End angle (deg)",
    "Qty",
    "Mass (kg)",
    "Weld gap (mm)",
  ];
  const body = rows.map((row) => [
    row.mark,
    row.profileName,
    row.materialId,
    row.lengthMM.toFixed(3),
    row.angleStartDeg.toFixed(3),
    row.angleEndDeg.toFixed(3),
    String(row.qty),
    row.massKg.toFixed(4),
    row.weldGapMM.toFixed(3),
  ]);
  return [header, ...body]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
}

export interface SheetMetalBomRow {
  partNumber: string;
  description: string;
  material: string;
  thicknessMM: number;
  flatWidthMM: number;
  flatHeightMM: number;
  bendCount: number;
  qty: number;
  massKg: number | null;
}

export function sheetMetalBomRow(
  meta: SheetMetalBodyMeta,
  input: {
    partNumber: string;
    description?: string;
    qty?: number;
  },
): Phase6Result<SheetMetalBomRow> {
  if (!nonEmpty(input.partNumber))
    return phase6Fail("sheetMetalBom.partNumber", "part number is required");
  const qty = input.qty ?? 1;
  if (!Number.isInteger(qty) || qty < 1)
    return phase6Fail(
      "sheetMetalBom.qty",
      "quantity must be a positive integer",
    );
  return phase6Ok({
    partNumber: input.partNumber.trim(),
    description: input.description?.trim() || "",
    material: meta.material,
    thicknessMM: meta.thicknessMM,
    flatWidthMM: meta.flatWidthMM,
    flatHeightMM: meta.flatHeightMM,
    bendCount: meta.bendCount,
    qty,
    massKg: meta.massKg === null ? null : meta.massKg * qty,
  });
}

export function sheetMetalBomCsv(rows: readonly SheetMetalBomRow[]): string {
  const header = [
    "Part number",
    "Description",
    "Material",
    "Thickness (mm)",
    "Flat width (mm)",
    "Flat height (mm)",
    "Bends",
    "Qty",
    "Mass (kg)",
  ];
  const body = rows.map((row) => [
    row.partNumber,
    row.description,
    row.material,
    row.thicknessMM.toFixed(3),
    row.flatWidthMM.toFixed(3),
    row.flatHeightMM.toFixed(3),
    String(row.bendCount),
    String(row.qty),
    row.massKg === null ? "" : row.massKg.toFixed(4),
  ]);
  return [header, ...body]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Body classification, surface diagnostics
// ---------------------------------------------------------------------------

const SURFACE_FEATURES = new Set([
  "surface",
  "boundarySurface",
  "constrainedSurface",
  "knitSurface",
  "trimSurface",
  "extendSurface",
  "replaceFace",
]);
const SHEET_METAL_FEATURES = new Set([
  "flange",
  "hem",
  "baseFlange",
  "edgeFlange",
  "bend",
  "corner",
  "louver",
]);
const FRAME_FEATURES = new Set(["frame", "structuralMember", "frameGroup"]);

export interface BodyClassification {
  kind: Phase6BodyKind;
  openShell: boolean;
  boundaryEdges: number;
  nonManifoldEdges: number;
}

export function phase6BodyKindLabel(kind: Phase6BodyKind): string {
  switch (kind) {
    case "sheetMetal":
      return "Sheet metal";
    case "flatPattern":
      return "Flat pattern";
    case "surface":
      return "Surface";
    case "frame":
      return "Frame member";
    case "solid":
      return "Solid";
    default:
      return "Unknown";
  }
}

function meshEdgeStats(out: BodyOutput): {
  boundaryEdges: number;
  nonManifoldEdges: number;
  boundaryLengthsMM: number[];
  boundaryEdgeKeys: string[];
  boundaryFaceIndices: number[];
} {
  const geo = out.faceGeometry;
  const position = geo?.attributes.position;
  const array = position?.array as ArrayLike<number> | undefined;
  if (!position || !array) {
    return {
      boundaryEdges: 0,
      nonManifoldEdges: 0,
      boundaryLengthsMM: [],
      boundaryEdgeKeys: [],
      boundaryFaceIndices: [],
    };
  }
  const index = geo?.index?.array as ArrayLike<number> | undefined;
  const step = position.itemSize || 3;
  const count = index
    ? Math.floor(index.length / 3)
    : Math.floor(position.count / 3);
  const keyOf = (i: number) => {
    const at = i * step;
    return `${(array[at] ?? 0).toFixed(6)},${(array[at + 1] ?? 0).toFixed(6)},${(array[at + 2] ?? 0).toFixed(6)}`;
  };
  const edgeCounts = new Map<string, number>();
  const edgeLengths = new Map<string, number>();
  const edgeFaces = new Map<string, number>();
  const addEdge = (a: number, b: number, triangle: number) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (!edgeFaces.has(key)) edgeFaces.set(key, triangle);
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    if (!edgeLengths.has(key)) {
      const ia = a * step;
      const ib = b * step;
      edgeLengths.set(
        key,
        Math.hypot(
          (array[ia] ?? 0) - (array[ib] ?? 0),
          (array[ia + 1] ?? 0) - (array[ib + 1] ?? 0),
          (array[ia + 2] ?? 0) - (array[ib + 2] ?? 0),
        ) * 1000,
      );
    }
  };
  for (let triangle = 0; triangle < count; triangle++) {
    const a = index ? Number(index[triangle * 3]) : triangle * 3;
    const b = index ? Number(index[triangle * 3 + 1]) : triangle * 3 + 1;
    const c = index ? Number(index[triangle * 3 + 2]) : triangle * 3 + 2;
    addEdge(a, b, triangle);
    addEdge(b, c, triangle);
    addEdge(c, a, triangle);
  }
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  const boundaryLengthsMM: number[] = [];
  const boundaryEdgeKeys: string[] = [];
  const boundaryFaceIndices = new Set<number>();
  for (const [key, count] of edgeCounts) {
    if (count === 1) {
      boundaryEdges++;
      boundaryEdgeKeys.push(key);
      const face = edgeFaces.get(key);
      if (face !== undefined) boundaryFaceIndices.add(face);
      const length = edgeLengths.get(key);
      if (length !== undefined) boundaryLengthsMM.push(length);
    } else if (count > 2) {
      nonManifoldEdges++;
    }
  }
  return {
    boundaryEdges,
    nonManifoldEdges,
    boundaryLengthsMM,
    boundaryEdgeKeys,
    boundaryFaceIndices: [...boundaryFaceIndices].sort((a, b) => a - b),
  };
}

export function classifyPhase6Body(
  out: BodyOutput,
  featureType?: string | null,
): BodyClassification {
  const stats = meshEdgeStats(out);
  const type = featureType ?? "";
  const kind: Phase6BodyKind = FRAME_FEATURES.has(type)
    ? "frame"
    : type === "unfold"
      ? "flatPattern"
      : SHEET_METAL_FEATURES.has(type)
        ? "sheetMetal"
        : SURFACE_FEATURES.has(type)
          ? "surface"
          : "solid";
  return {
    kind,
    openShell: stats.boundaryEdges > 0,
    boundaryEdges: stats.boundaryEdges,
    nonManifoldEdges: stats.nonManifoldEdges,
  };
}

export interface ConversionDiagnostics {
  ok: boolean;
  openEdges: number;
  nonManifoldEdges: number;
  gapsMM: number[];
  selfIntersections: number;
  sewingFailed: boolean;
  /** Stable `vertexA|vertexB` keys for every boundary edge. */
  offendingEdges: string[];
  /** Mesh triangle indices that own an offending boundary edge. */
  offendingFaces: number[];
  issues: Phase6Issue[];
}

type Vec3 = readonly [number, number, number];
interface MeshTriangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  keys: readonly [string, string, string];
  min: Vec3;
  max: Vec3;
}

function meshTriangles(out: BodyOutput): MeshTriangle[] {
  const geo = out.faceGeometry;
  const position = geo?.attributes.position;
  const array = position?.array as ArrayLike<number> | undefined;
  if (!position || !array) return [];
  const step = position.itemSize || 3;
  const index = geo?.index?.array as ArrayLike<number> | undefined;
  const count = index
    ? Math.floor(index.length / 3)
    : Math.floor(position.count / 3);
  const at = (i: number): Vec3 => {
    const offset = i * step;
    return [array[offset] ?? 0, array[offset + 1] ?? 0, array[offset + 2] ?? 0];
  };
  const key = (point: Vec3) => point.map((v) => v.toFixed(7)).join(",");
  const triangles: MeshTriangle[] = [];
  for (let i = 0; i < count; i++) {
    const ia = index ? Number(index[i * 3]) : i * 3;
    const ib = index ? Number(index[i * 3 + 1]) : i * 3 + 1;
    const ic = index ? Number(index[i * 3 + 2]) : i * 3 + 2;
    const a = at(ia);
    const b = at(ib);
    const c = at(ic);
    triangles.push({
      a,
      b,
      c,
      keys: [key(a), key(b), key(c)],
      min: [
        Math.min(a[0], b[0], c[0]),
        Math.min(a[1], b[1], c[1]),
        Math.min(a[2], b[2], c[2]),
      ],
      max: [
        Math.max(a[0], b[0], c[0]),
        Math.max(a[1], b[1], c[1]),
        Math.max(a[2], b[2], c[2]),
      ],
    });
  }
  return triangles;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function segmentTriangle(p0: Vec3, p1: Vec3, triangle: MeshTriangle): boolean {
  const direction = sub(p1, p0);
  const edge1 = sub(triangle.b, triangle.a);
  const edge2 = sub(triangle.c, triangle.a);
  const h = cross(direction, edge2);
  const det = dot(edge1, h);
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det;
  const s = sub(p0, triangle.a);
  const u = inv * dot(s, h);
  if (u < -1e-9 || u > 1 + 1e-9) return false;
  const q = cross(s, edge1);
  const v = inv * dot(direction, q);
  if (v < -1e-9 || u + v > 1 + 1e-9) return false;
  const t = inv * dot(edge2, q);
  return t > 1e-9 && t < 1 - 1e-9;
}

function trianglesIntersect(a: MeshTriangle, b: MeshTriangle): boolean {
  if (a.keys.some((key) => b.keys.includes(key))) return false;
  for (let axis = 0; axis < 3; axis++) {
    if (a.max[axis]! < b.min[axis]! - 1e-9) return false;
    if (b.max[axis]! < a.min[axis]! - 1e-9) return false;
  }
  const edgesA: Array<[Vec3, Vec3]> = [
    [a.a, a.b],
    [a.b, a.c],
    [a.c, a.a],
  ];
  const edgesB: Array<[Vec3, Vec3]> = [
    [b.a, b.b],
    [b.b, b.c],
    [b.c, b.a],
  ];
  return (
    edgesA.some(([start, end]) => segmentTriangle(start, end, b)) ||
    edgesB.some(([start, end]) => segmentTriangle(start, end, a))
  );
}

function countSelfIntersections(out: BodyOutput): number {
  const triangles = meshTriangles(out);
  let count = 0;
  for (let i = 0; i < triangles.length; i++) {
    for (let j = i + 1; j < triangles.length; j++) {
      if (trianglesIntersect(triangles[i]!, triangles[j]!)) count++;
    }
  }
  return count;
}

export function diagnoseSurfaceConversion(
  out: BodyOutput,
  toleranceMM = 0.01,
): ConversionDiagnostics {
  const stats = meshEdgeStats(out);
  const issues: Phase6Issue[] = [];
  if (stats.boundaryEdges > 0)
    issues.push({
      path: "conversion.openEdges",
      message: `${stats.boundaryEdges} boundary edge(s); surface is not closed`,
    });
  if (stats.nonManifoldEdges > 0)
    issues.push({
      path: "conversion.nonManifoldEdges",
      message: `${stats.nonManifoldEdges} non-manifold edge(s)`,
    });
  const gapsMM = stats.boundaryLengthsMM.filter(
    (length) => length > toleranceMM,
  );
  if (gapsMM.length)
    issues.push({
      path: "conversion.gaps",
      message: `${gapsMM.length} boundary edge(s) exceed ${toleranceMM} mm`,
    });
  const selfIntersections = countSelfIntersections(out);
  if (selfIntersections)
    issues.push({
      path: "conversion.selfIntersections",
      message: `${selfIntersections} self-intersecting triangle pair(s)`,
    });
  if (!out.faceGeometry && !out.brep)
    issues.push({
      path: "conversion.geometry",
      message: "no mesh or B-rep geometry to convert",
    });
  const sewingFailed = stats.boundaryEdges > 0 || stats.nonManifoldEdges > 0;
  if (sewingFailed)
    issues.push({
      path: "conversion.sewing",
      message: "sewing did not produce a closed manifold shell",
    });
  return {
    ok: issues.length === 0,
    openEdges: stats.boundaryEdges,
    nonManifoldEdges: stats.nonManifoldEdges,
    gapsMM,
    selfIntersections,
    sewingFailed,
    offendingEdges: stats.boundaryEdgeKeys,
    offendingFaces: stats.boundaryFaceIndices,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Phase 6 state persistence
// ---------------------------------------------------------------------------

export interface Phase6SheetMetalBodyRecord {
  bodyId: string;
  meta: SheetMetalBodyMeta;
}

export interface Phase6FrameGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface Phase6FlatPatternRecord {
  id: string;
  bodyId: string;
  drawing: FlatPatternDrawing;
}

export interface Phase6CutListRecord {
  id: string;
  rows: CutListRow[];
}

export interface Phase6SurfaceBodyRecord {
  bodyId: string;
  classification: BodyClassification;
}

export interface Phase6ConversionRecord {
  id: string;
  sourceBodyId: string;
  targetBodyId: string;
  diagnostics: ConversionDiagnostics;
  sourceKind?: Phase6BodyKind;
  targetKind?: Phase6BodyKind;
  toleranceMM?: number;
  status?: "ok" | "failed" | "suppressed";
}

export interface StructuralMemberRecord {
  id: string;
  groupId: string;
  profileId: string;
  bodyId: string;
  startMM: [number, number, number];
  endMM: [number, number, number];
  rotationRad: number;
  offsetMM: number;
  endCondition: "butt" | "miter" | "trim" | "extend";
}

export interface KnitResultRecord {
  id: string;
  surfaceBodyIds: string[];
  toleranceMM: number;
  stitchedEdgeCount: number;
  unstitchedEdges: string[];
  solidBodyId: string | null;
}

export interface ConversionFeatureRecord {
  id: string;
  sourceBodyId: string;
  targetKind: "solid" | "surface";
  toleranceMM: number;
  sew: boolean;
  merge: boolean;
  status: "pending" | "ok" | "failed" | "suppressed";
  revision: number;
}

export type SurfaceContinuity = "G0" | "G1" | "G2";
export type SurfaceTrimKeep = "positive" | "negative" | "both";
export type SurfaceExtendContinuity = "linear" | "natural";

export interface SurfaceOptions {
  bodyId: string;
  continuity: SurfaceContinuity;
  stitchToleranceMM: number;
  trimKeep: SurfaceTrimKeep;
  extendContinuity: SurfaceExtendContinuity;
  curvatureScale: number;
}

export function defaultSurfaceOptions(bodyId: string): SurfaceOptions {
  return {
    bodyId,
    continuity: "G1",
    stitchToleranceMM: 0.01,
    trimKeep: "positive",
    extendContinuity: "natural",
    curvatureScale: 1,
  };
}

export function validateSurfaceOptions(value: SurfaceOptions): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!nonEmpty(value.bodyId))
    issues.push({ path: "surface.bodyId", message: "body id is required" });
  if (!["G0", "G1", "G2"].includes(value.continuity))
    issues.push({ path: "surface.continuity", message: "invalid continuity" });
  if (!(value.stitchToleranceMM > 0))
    issues.push({
      path: "surface.stitchToleranceMM",
      message: "tolerance must be greater than zero",
    });
  if (!["positive", "negative", "both"].includes(value.trimKeep))
    issues.push({ path: "surface.trimKeep", message: "invalid trim side" });
  if (!["linear", "natural"].includes(value.extendContinuity))
    issues.push({
      path: "surface.extendContinuity",
      message: "invalid extension continuity",
    });
  if (!(value.curvatureScale > 0))
    issues.push({
      path: "surface.curvatureScale",
      message: "curvature scale must be greater than zero",
    });
  return issues;
}

export function serializeSurfaceOptions(
  values: readonly SurfaceOptions[],
): string {
  return JSON.stringify(values);
}

export function parseSurfaceOptions(
  text: string,
): Phase6Result<SurfaceOptions[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return phase6Fail("surface.options", "not valid JSON");
  }
  if (!Array.isArray(raw))
    return phase6Fail("surface.options", "options must be an array");
  const values: SurfaceOptions[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      return phase6Fail(
        `surface.options[${index}]`,
        "option must be an object",
      );
    const record = item as Record<string, unknown>;
    const value: SurfaceOptions = {
      bodyId: typeof record.bodyId === "string" ? record.bodyId : "",
      continuity:
        record.continuity === "G0" ||
        record.continuity === "G1" ||
        record.continuity === "G2"
          ? record.continuity
          : "G1",
      stitchToleranceMM:
        typeof record.stitchToleranceMM === "number"
          ? record.stitchToleranceMM
          : 0.01,
      trimKeep:
        record.trimKeep === "negative" || record.trimKeep === "both"
          ? record.trimKeep
          : "positive",
      extendContinuity:
        record.extendContinuity === "linear" ? "linear" : "natural",
      curvatureScale:
        typeof record.curvatureScale === "number" ? record.curvatureScale : 1,
    };
    const issues = validateSurfaceOptions(value);
    if (issues.length)
      return {
        ok: false,
        errors: issues.map((issue) => ({
          ...issue,
          path: `surface.options[${index}].${issue.path}`,
        })),
      };
    values.push(value);
  }
  return phase6Ok(values);
}

export interface Phase6State {
  v: typeof PHASE6_SCHEMA_VERSION;
  displayUnit: Phase6LengthUnit;
  rules: SheetMetalRule[];
  bendTables: BendTable[];
  frameProfiles: FrameProfile[];
  frameMaterials: FrameMaterial[];
  sheetMetalBodies: Phase6SheetMetalBodyRecord[];
  frameGroups: Phase6FrameGroup[];
  flatPatterns: Phase6FlatPatternRecord[];
  cutLists: Phase6CutListRecord[];
  surfaceBodies: Phase6SurfaceBodyRecord[];
  surfaceOptions: SurfaceOptions[];
  conversions: Phase6ConversionRecord[];
  structuralMembers: StructuralMemberRecord[];
  knitResults: KnitResultRecord[];
  conversionFeatures: ConversionFeatureRecord[];
}

export function emptyPhase6State(): Phase6State {
  return {
    v: PHASE6_SCHEMA_VERSION,
    displayUnit: "mm",
    rules: [defaultSheetMetalRule()],
    bendTables: [],
    frameProfiles: [...STANDARD_FRAME_PROFILES],
    frameMaterials: [...STANDARD_FRAME_MATERIALS],
    sheetMetalBodies: [],
    frameGroups: [],
    flatPatterns: [],
    cutLists: [],
    surfaceBodies: [],
    surfaceOptions: [],
    conversions: [],
    structuralMembers: [],
    knitResults: [],
    conversionFeatures: [],
  };
}

export function upsertSheetMetalBody(
  state: Phase6State,
  bodyId: string,
  meta: SheetMetalBodyMeta,
): Phase6State {
  return {
    ...state,
    sheetMetalBodies: [
      ...state.sheetMetalBodies.filter((entry) => entry.bodyId !== bodyId),
      { bodyId, meta },
    ],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function validatePhase6State(state: Phase6State): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (state.displayUnit !== "mm" && state.displayUnit !== "in")
    issues.push({ path: "displayUnit", message: "unit must be mm or in" });
  state.rules.forEach((rule, index) => {
    for (const issue of validateSheetMetalRule(rule))
      issues.push({ ...issue, path: `rules[${index}].${issue.path}` });
  });
  state.bendTables.forEach((table, index) => {
    for (const issue of validateBendTable(table))
      issues.push({ ...issue, path: `bendTables[${index}].${issue.path}` });
  });
  state.frameProfiles.forEach((profile, index) => {
    for (const issue of validateFrameProfile(profile))
      issues.push({ ...issue, path: `frameProfiles[${index}].${issue.path}` });
  });
  state.frameMaterials.forEach((material, index) => {
    if (!nonEmpty(material.id) || !nonEmpty(material.name))
      issues.push({
        path: `frameMaterials[${index}]`,
        message: "id and name are required",
      });
    if (!positive(material.densityKgM3))
      issues.push({
        path: `frameMaterials[${index}].densityKgM3`,
        message: "density must be greater than zero",
      });
  });
  state.sheetMetalBodies.forEach((entry, index) => {
    if (!nonEmpty(entry.bodyId))
      issues.push({
        path: `sheetMetalBodies[${index}].bodyId`,
        message: "body id is required",
      });
    const meta = entry.meta;
    if (!meta || typeof meta !== "object") {
      issues.push({
        path: `sheetMetalBodies[${index}].meta`,
        message: "metadata is required",
      });
      return;
    }
    if (!nonEmpty(meta.material))
      issues.push({
        path: `sheetMetalBodies[${index}].meta.material`,
        message: "material is required",
      });
    if (!positive(meta.thicknessMM))
      issues.push({
        path: `sheetMetalBodies[${index}].meta.thicknessMM`,
        message: "thickness must be greater than zero",
      });
    if (!Number.isInteger(meta.bendCount) || meta.bendCount < 0)
      issues.push({
        path: `sheetMetalBodies[${index}].meta.bendCount`,
        message: "bend count must be a non-negative integer",
      });
    if (!nonNegative(meta.flatWidthMM) || !nonNegative(meta.flatHeightMM))
      issues.push({
        path: `sheetMetalBodies[${index}].meta.flatSize`,
        message: "flat sizes must be non-negative",
      });
    if (!["x", "y", "none"].includes(meta.grainDirection))
      issues.push({
        path: `sheetMetalBodies[${index}].meta.grainDirection`,
        message: "grain direction must be x, y or none",
      });
  });
  state.frameGroups.forEach((group, index) => {
    if (!nonEmpty(group.id) || !nonEmpty(group.name))
      issues.push({
        path: `frameGroups[${index}]`,
        message: "id and name are required",
      });
  });
  const uniqueIds = (values: Array<{ id: string }>, path: string) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value.id))
        issues.push({
          path: `${path}[${index}].id`,
          message: `duplicate id ${value.id}`,
        });
      seen.add(value.id);
    });
  };
  uniqueIds(state.flatPatterns, "flatPatterns");
  uniqueIds(state.cutLists, "cutLists");
  uniqueIds(state.conversions, "conversions");
  uniqueIds(state.structuralMembers, "structuralMembers");
  uniqueIds(state.knitResults, "knitResults");
  uniqueIds(state.conversionFeatures, "conversionFeatures");
  state.flatPatterns.forEach((entry, index) => {
    if (!nonEmpty(entry.id) || !nonEmpty(entry.bodyId))
      issues.push({
        path: `flatPatterns[${index}]`,
        message: "id and body id are required",
      });
  });
  state.cutLists.forEach((entry, index) => {
    if (!nonEmpty(entry.id) || !Array.isArray(entry.rows))
      issues.push({
        path: `cutLists[${index}]`,
        message: "id and rows are required",
      });
  });
  state.surfaceBodies.forEach((entry, index) => {
    if (!nonEmpty(entry.bodyId))
      issues.push({
        path: `surfaceBodies[${index}].bodyId`,
        message: "body id is required",
      });
  });
  state.surfaceOptions.forEach((entry, index) => {
    for (const issue of validateSurfaceOptions(entry))
      issues.push({
        ...issue,
        path: `surfaceOptions[${index}].${issue.path}`,
      });
  });
  uniqueIds(
    state.surfaceOptions.map((entry) => ({ id: entry.bodyId })),
    "surfaceOptions",
  );
  state.conversions.forEach((entry, index) => {
    if (!nonEmpty(entry.sourceBodyId) || !nonEmpty(entry.targetBodyId))
      issues.push({
        path: `conversions[${index}]`,
        message: "source and target body ids are required",
      });
  });
  state.structuralMembers.forEach((entry, index) => {
    if (
      !nonEmpty(entry.id) ||
      !nonEmpty(entry.groupId) ||
      !nonEmpty(entry.profileId) ||
      !nonEmpty(entry.bodyId)
    )
      issues.push({
        path: `structuralMembers[${index}]`,
        message: "id, group, profile and body are required",
      });
    if (
      !entry.startMM.every(finite) ||
      !entry.endMM.every(finite) ||
      entry.startMM.every((value, at) => value === entry.endMM[at])
    )
      issues.push({
        path: `structuralMembers[${index}].ends`,
        message: "start and end must be finite and distinct",
      });
    if (!["butt", "miter", "trim", "extend"].includes(entry.endCondition))
      issues.push({
        path: `structuralMembers[${index}].endCondition`,
        message: "invalid end condition",
      });
  });
  state.knitResults.forEach((entry, index) => {
    if (!nonEmpty(entry.id) || !entry.surfaceBodyIds.length)
      issues.push({
        path: `knitResults[${index}]`,
        message: "id and at least one surface body are required",
      });
    if (!nonNegative(entry.toleranceMM))
      issues.push({
        path: `knitResults[${index}].toleranceMM`,
        message: "tolerance cannot be negative",
      });
    if (
      !Number.isInteger(entry.stitchedEdgeCount) ||
      entry.stitchedEdgeCount < 0
    )
      issues.push({
        path: `knitResults[${index}].stitchedEdgeCount`,
        message: "stitched edge count must be a non-negative integer",
      });
  });
  state.conversionFeatures.forEach((entry, index) => {
    if (!nonEmpty(entry.id) || !nonEmpty(entry.sourceBodyId))
      issues.push({
        path: `conversionFeatures[${index}]`,
        message: "id and source body are required",
      });
    if (entry.targetKind !== "solid" && entry.targetKind !== "surface")
      issues.push({
        path: `conversionFeatures[${index}].targetKind`,
        message: "target kind must be solid or surface",
      });
    if (!nonNegative(entry.toleranceMM))
      issues.push({
        path: `conversionFeatures[${index}].toleranceMM`,
        message: "tolerance cannot be negative",
      });
    if (!["pending", "ok", "failed", "suppressed"].includes(entry.status))
      issues.push({
        path: `conversionFeatures[${index}].status`,
        message: "invalid conversion status",
      });
  });
  return issues;
}

export function serializePhase6State(state: Phase6State): string {
  return JSON.stringify(state);
}

export function canonicalPhase6Json(state: Phase6State): string {
  return stableStringify(state);
}

export function parsePhase6State(text: string): Phase6Result<Phase6State> {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return phase6Fail("phase6", "not valid JSON");
  }
  const record = asRecord(raw);
  if (!record) return phase6Fail("phase6", "state must be an object");
  if (record.v !== undefined && record.v !== 0 && record.v !== 1)
    return phase6Fail(
      "phase6.v",
      `unsupported schema version ${String(record.v)}`,
    );
  const state: Phase6State = {
    v: PHASE6_SCHEMA_VERSION,
    displayUnit: record.displayUnit === "in" ? "in" : "mm",
    rules: unknownArray(record.rules) as SheetMetalRule[],
    bendTables: unknownArray(record.bendTables) as BendTable[],
    frameProfiles: unknownArray(record.frameProfiles) as FrameProfile[],
    frameMaterials: unknownArray(record.frameMaterials) as FrameMaterial[],
    sheetMetalBodies: unknownArray(
      record.sheetMetalBodies,
    ) as Phase6SheetMetalBodyRecord[],
    frameGroups: unknownArray(record.frameGroups) as Phase6FrameGroup[],
    flatPatterns: unknownArray(
      record.flatPatterns,
    ) as Phase6FlatPatternRecord[],
    cutLists: unknownArray(record.cutLists) as Phase6CutListRecord[],
    surfaceBodies: unknownArray(
      record.surfaceBodies,
    ) as Phase6SurfaceBodyRecord[],
    surfaceOptions: unknownArray(record.surfaceOptions) as SurfaceOptions[],
    conversions: unknownArray(record.conversions) as Phase6ConversionRecord[],
    structuralMembers: unknownArray(
      record.structuralMembers,
    ) as StructuralMemberRecord[],
    knitResults: unknownArray(record.knitResults) as KnitResultRecord[],
    conversionFeatures: unknownArray(
      record.conversionFeatures,
    ) as ConversionFeatureRecord[],
  };
  // v0 files had no frame materials; fall back to the standard set.
  if (!state.frameMaterials.length)
    state.frameMaterials = [...STANDARD_FRAME_MATERIALS];
  if (!state.frameProfiles.length)
    state.frameProfiles = [...STANDARD_FRAME_PROFILES];
  if (!state.rules.length) state.rules = [defaultSheetMetalRule()];
  const issues = validatePhase6State(state);
  if (issues.length) return { ok: false, errors: issues };
  return phase6Ok(state);
}

export function phase6RoundTrip(state: Phase6State): Phase6Result<Phase6State> {
  const parsed = parsePhase6State(serializePhase6State(state));
  if (!parsed.ok) return parsed;
  const before = canonicalPhase6Json(state);
  const after = canonicalPhase6Json(parsed.value);
  if (before !== after)
    return phase6Fail(
      "phase6.roundTrip",
      "serialized state does not round-trip canonically",
    );
  return parsed;
}
