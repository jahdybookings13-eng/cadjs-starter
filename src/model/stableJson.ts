/**
 * Canonical JSON for save/compare paths. Object keys are sorted recursively so
 * two equal documents produced by different code paths serialize to the same
 * bytes; array order is preserved because feature order is semantic.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** Structural equality by canonical JSON, for tests and save comparisons. */
export function stableJsonEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort())
      out[key] = canonicalize(src[key]);
    return out;
  }
  return value;
}
