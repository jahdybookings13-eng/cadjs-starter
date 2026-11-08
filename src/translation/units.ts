import { TranslationError } from "./errors.js";

/** Units accepted at the UI/file boundary. Geometry stays in millimetres. */
export type DocumentUnit = "mm" | "cm" | "m" | "in" | "ft";

export const UNIT_TO_MM: Readonly<Record<DocumentUnit, number>> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

const UNIT_ALIASES: Readonly<Record<string, DocumentUnit>> = {
  mm: "mm",
  millimeter: "mm",
  millimeters: "mm",
  millimetre: "mm",
  millimetres: "mm",
  cm: "cm",
  centimeter: "cm",
  centimeters: "cm",
  centimetre: "cm",
  centimetres: "cm",
  m: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  in: "in",
  inch: "in",
  inches: "in",
  ft: "ft",
  foot: "ft",
  feet: "ft",
};

export function parseDocumentUnit(value: string): DocumentUnit {
  const unit = UNIT_ALIASES[value.trim().toLowerCase()];
  if (!unit) {
    throw new TranslationError(
      "INVALID_UNIT",
      `Unknown unit “${value}”. Expected mm, cm, m, in or ft.`,
    );
  }
  return unit;
}

/** Convert a UI/file-boundary length to the internal millimetre value. */
export function toMillimeters(value: number, unit: DocumentUnit): number {
  if (!Number.isFinite(value)) {
    throw new TranslationError(
      "INVALID_LENGTH",
      `Length must be a finite number (received ${String(value)}).`,
    );
  }
  return value * UNIT_TO_MM[unit];
}

/** Convert an internal millimetre value back to the requested document unit. */
export function fromMillimeters(value: number, unit: DocumentUnit): number {
  if (!Number.isFinite(value)) {
    throw new TranslationError(
      "INVALID_LENGTH",
      `Length must be a finite number (received ${String(value)}).`,
    );
  }
  return value / UNIT_TO_MM[unit];
}

/**
 * Parse a length typed by a user (or read from a file) and return millimetres.
 * Rejects blank, non-numeric, zero and negative values by name.
 */
export function parseLength(
  input: string | number,
  unit: DocumentUnit,
  options: { positive?: boolean } = {},
): number {
  const value = typeof input === "number" ? input : Number(input.trim());
  if (input === "" || (typeof input === "string" && input.trim() === "")) {
    throw new TranslationError("INVALID_LENGTH", "Length cannot be blank.");
  }
  if (!Number.isFinite(value)) {
    throw new TranslationError(
      "INVALID_LENGTH",
      `Length “${String(input)}” is not a finite number.`,
    );
  }
  if (options.positive && value <= 0) {
    throw new TranslationError(
      "INVALID_LENGTH",
      `Length must be greater than zero (received ${value}).`,
    );
  }
  return toMillimeters(value, unit);
}

/** Parse a length with an explicit unit suffix, e.g. `12.5 mm` or `1 in`. */
export function parseLengthWithUnit(input: string): number {
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*([a-zA-Z]+)\s*$/.exec(input);
  if (!match) {
    throw new TranslationError(
      "INVALID_LENGTH",
      `Length “${input}” must include a number and unit, e.g. 12.5 mm.`,
    );
  }
  return parseLength(match[1]!, parseDocumentUnit(match[2]!));
}
