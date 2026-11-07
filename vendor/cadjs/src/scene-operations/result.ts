/**
 * `Result<T>` is reserved for operations with **real, user-recoverable failure
 * modes**, primarily OCC operations that can fail mid-computation (boolean,
 * extrude, sweep, loft, revolve, fillet, resize, import). Pure data
 * transformations (element/selection/mesh/sketch/browser/feature-tree/measure
 * helpers) return bare values; they have no failure mode the caller can
 * recover from, only programmer bugs.
 *
 * If you find yourself wrapping a pure transform in Result<T>, the right
 * answer is usually to throw on invariant violation (programmer bug) and
 * leave the happy path unwrapped. Don't half-apply this abstraction.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (reason: string): Result<never> => ({ ok: false, reason });
