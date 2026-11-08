// Browser Web Worker benchmark for P6-SU-16. Unlike the Node handler bench,
// this sends real messages through OccWorkerClient and measures the main-thread
// heartbeat gaps while the worker performs the OCC operations.
import {
  OccWorkerClient,
  SketchToBrepService,
  createSketchPlane,
  type Sketch,
  type SketchPrimitive,
  type WorkerGeometryResult,
  type WorkerSewResult,
} from "@vitekk02/cadjs";
import {
  SURFACE_PERFORMANCE_BUDGET_MS,
  type SurfacePerformanceTimings,
} from "./phase6SurfaceBudget";

export interface SurfaceWorkerPerformanceReport {
  patchCount: number;
  knitFaces: number;
  thickenFaces: number;
  timings: SurfacePerformanceTimings;
  budget: typeof SURFACE_PERFORMANCE_BUDGET_MS;
  budgetMet: boolean;
}

const now = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function rectangleSketch(
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Sketch {
  const corners = [
    { id: `${id}-p0`, type: "point" as const, x: x0, y: y0 },
    { id: `${id}-p1`, type: "point" as const, x: x1, y: y0 },
    { id: `${id}-p2`, type: "point" as const, x: x1, y: y1 },
    { id: `${id}-p3`, type: "point" as const, x: x0, y: y1 },
  ];
  const lines = corners.map((corner, index) => ({
    id: `${id}-l${index}`,
    type: "line" as const,
    p1Id: corner.id,
    p2Id: corners[(index + 1) % corners.length]!.id,
  }));
  return {
    id,
    plane: createSketchPlane("XY"),
    primitives: [...corners, ...lines] as SketchPrimitive[],
    constraints: [],
    dof: 0,
    status: "fully-constrained",
  } as unknown as Sketch;
}

async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; workerMs: number; uiStallMs: number }> {
  let last = now();
  let maxGap = 0;
  const timer = setInterval(() => {
    const tick = now();
    maxGap = Math.max(maxGap, tick - last);
    last = tick;
  }, 1);
  const started = now();
  const value = await fn();
  const finished = now();
  clearInterval(timer);
  const uiStallMs = Math.max(maxGap, finished - last);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { value, workerMs: finished - started, uiStallMs };
}

export async function measureSurfaceWorker(): Promise<SurfaceWorkerPerformanceReport> {
  const client = OccWorkerClient.getInstance();
  await client.waitForReady();
  const service = SketchToBrepService.getInstance();
  const patchA = await service.convertSketchToBrepWithShape(
    rectangleSketch("p6-su-16-a", 0, 0, 20, 20),
  );
  const patchB = await service.convertSketchToBrepWithShape(
    rectangleSketch("p6-su-16-b", 20, 0, 40, 20),
  );

  const knit = await timed(() =>
    client.send<WorkerSewResult>({
      type: "sew",
      payload: {
        sources: [patchA, patchB].map((patch) => ({
          brepJson: patch.brep.toJSON(),
          position: { x: 0, y: 0, z: 0 },
          ...(patch.occBrep !== undefined ? { occBrep: patch.occBrep } : {}),
        })),
        tolerance: 1e-6,
        makeSolid: false,
        mergeFaces: false,
      },
    }),
  );
  const thicken = await timed(() =>
    client.send<WorkerGeometryResult>({
      type: "thicken",
      payload: {
        brepJson: knit.value.brepJson,
        position: { x: 0, y: 0, z: 0 },
        ...(knit.value.occBrep !== undefined
          ? { occBrep: knit.value.occBrep }
          : {}),
        faceIndices: [0],
        thickness: 2,
      },
    }),
  );

  const timings: SurfacePerformanceTimings = {
    knit: knit.workerMs,
    thicken: thicken.workerMs,
    uiStall: Math.max(knit.uiStallMs, thicken.uiStallMs),
    total: knit.workerMs + thicken.workerMs,
  };
  return {
    patchCount: 2,
    knitFaces: knit.value.brepJson.faces.length,
    thickenFaces: thicken.value.brepJson.faces.length,
    timings,
    budget: SURFACE_PERFORMANCE_BUDGET_MS,
    budgetMet:
      timings.knit <= SURFACE_PERFORMANCE_BUDGET_MS.knit &&
      timings.thicken <= SURFACE_PERFORMANCE_BUDGET_MS.thicken &&
      timings.uiStall <= SURFACE_PERFORMANCE_BUDGET_MS.uiStall &&
      timings.total <= SURFACE_PERFORMANCE_BUDGET_MS.total,
  };
}
