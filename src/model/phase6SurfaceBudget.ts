// Shared surface-performance budget for both the Node handler benchmark and
// the browser Web Worker benchmark. Keep one source of truth.
export const SURFACE_PERFORMANCE_BUDGET_MS = {
  knit: 100,
  thicken: 300,
  uiStall: 400,
  total: 500,
} as const;

// Kept separate from the multi-patch knit/thicken total: this is a single
// large planar surface, not a transport benchmark for a multi-patch body.
export const LARGE_SURFACE_THICKEN_BUDGET_MS = 300;

export interface SurfacePerformanceTimings {
  knit: number;
  thicken: number;
  uiStall: number;
  total: number;
}
