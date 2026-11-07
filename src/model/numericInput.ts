import {
  DIM_ANGLE,
  DIM_LENGTH,
  DIM_NONE,
  dimLabel,
  dimsEqual,
  evalExpr,
} from "./expression";

/** What the surrounding sketch field expects the entered value to mean. */
export type NumericInputMode = "length" | "angle" | "unitless";

export type ParsedNumericInput =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Parse a sketch numeric field. Plain numbers keep the app's existing raw
 * units. Expressions can carry units:
 *
 *   "2*25.4 mm" -> 0.0508 m (length fields)
 *   "45 deg"    -> 45     (angle fields still take/return degrees)
 *   "1/2"       -> 0.5
 *
 * Dimension mismatches are rejected instead of silently adding metres to
 * radians. Named-variable binding is a separate gap; no implicit variables are
 * invented here.
 */
export function parseNumericInput(
  text: string,
  mode: NumericInputMode,
): ParsedNumericInput {
  const raw = text.trim();
  if (!raw) return { ok: false, error: "Enter a value." };

  // Keep the existing fast path (and scientific notation) for plain numbers.
  const plain = Number(raw);
  if (Number.isFinite(plain)) return { ok: true, value: plain };

  const result = evalExpr(raw);
  if (!result.ok) return result;

  if (dimsEqual(result.dim, DIM_NONE)) {
    return { ok: true, value: result.value };
  }

  if (mode === "unitless") {
    return {
      ok: false,
      error: `Expected a unitless number, got ${dimLabel(result.dim)}.`,
    };
  }

  if (mode === "length") {
    if (!dimsEqual(result.dim, DIM_LENGTH)) {
      return {
        ok: false,
        error: `Expected a length, got ${dimLabel(result.dim)}.`,
      };
    }
    return { ok: true, value: result.value };
  }

  if (!dimsEqual(result.dim, DIM_ANGLE)) {
    return {
      ok: false,
      error: `Expected an angle, got ${dimLabel(result.dim)}.`,
    };
  }
  // The sketch angle callers work in degrees, even though the engine stores
  // radians. Evaluate the expression in radians, then hand back degrees.
  return { ok: true, value: (result.value * 180) / Math.PI };
}
