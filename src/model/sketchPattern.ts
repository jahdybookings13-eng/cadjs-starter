import type { Sketch, SketchPoint, SketchPrimitive } from "@vitekk02/cadjs";
import { moveOrCopySelected, type MoveCopyResult } from "./sketchTransform";

/**
 * Create `count - 1` independent copies of the selection at multiples of the
 * X/Y spacing. The source geometry is not modified.
 */
export function linearPatternSelected(
  sketch: Sketch,
  selectedIds: string[],
  count: number,
  dx: number,
  dy: number,
  generateId: (prefix: string) => string,
): MoveCopyResult {
  if (!Number.isInteger(count) || count < 2 || count > 50) {
    return {
      ok: false,
      reason: "Pattern count must be an integer from 2 to 50.",
    };
  }
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { ok: false, reason: "Pattern spacing must be finite." };
  }
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { ok: false, reason: "Pattern spacing must be non-zero." };
  }

  const points: SketchPoint[] = [];
  const primitives: SketchPrimitive[] = [];

  for (let index = 1; index < count; index++) {
    const copy = moveOrCopySelected(
      sketch,
      selectedIds,
      "copy",
      dx * index,
      dy * index,
      generateId,
    );
    if (!copy.ok) return copy;
    points.push(...copy.points);
    primitives.push(...copy.primitives);
  }

  return {
    ok: true,
    pointUpdates: [],
    primitiveUpdates: [],
    points,
    primitives,
  };
}
