// Measured sheet-metal budget: true unfold, bend-table lookup and DXF export
// for a multi-bend enclosure. Kept separate from the frame and drawing budgets.
import {
  flatPatternDxf,
  lookupBend,
  type BendTable,
  type FlatPatternDrawing,
  type Phase6Result,
} from "./phase6";
import {
  computeTrueFlatPattern,
  type FlatPatternBendInput,
} from "./phase6FlatPatternCalc";

export const SHEET_METAL_PERFORMANCE_BUDGET_MS = {
  unfold: 25,
  bendTable: 10,
  dxf: 50,
  total: 100,
} as const;

export interface SheetMetalPerformanceReport {
  bendCount: number;
  holeCount: number;
  timings: {
    unfold: number;
    bendTable: number;
    dxf: number;
    total: number;
  };
  budget: typeof SHEET_METAL_PERFORMANCE_BUDGET_MS;
  budgetMet: boolean;
}

const now = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function benchmarkBends(): FlatPatternBendInput[] {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `b${index + 1}`,
    angleDeg: index % 3 === 0 ? 45 : 90,
    radiusMM: 1.5,
    thicknessMM: 1.5,
    kFactor: 0.44,
    flangeLengthMM: 35 + index * 2,
    direction: index % 2 === 0 ? "up" : "down",
    reliefMM: 2,
  }));
}

function benchmarkTable(): BendTable {
  return {
    id: "bench-bend-table",
    name: "Bench steel",
    rows: [
      {
        material: "steel",
        thicknessMM: 1.5,
        radiusMM: 1.5,
        angleDeg: 90,
        allowanceMM: 3.2,
        deductionMM: 2.4,
      },
      {
        material: "steel",
        thicknessMM: 1.5,
        radiusMM: 1.5,
        angleDeg: 45,
        allowanceMM: 1.1,
        deductionMM: 0.4,
      },
    ],
    overrides: [{ bendId: "b1", allowanceMM: 3.4 }],
  };
}

export function measureSheetMetalPipeline(): Phase6Result<SheetMetalPerformanceReport> {
  const bends = benchmarkBends();
  const table = benchmarkTable();
  const started = now();

  const unfolded = computeTrueFlatPattern({
    baseLengthMM: 300,
    baseWidthMM: 200,
    bends,
  });
  if (!unfolded.ok) return unfolded;
  const afterUnfold = now();

  for (const bend of bends) {
    const lookup = lookupBend(
      table,
      {
        material: "steel",
        thicknessMM: bend.thicknessMM,
        radiusMM: bend.radiusMM,
        angleDeg: bend.angleDeg,
      },
      bend.id,
    );
    if (!lookup.ok) return lookup;
  }
  const afterLookup = now();

  const height = unfolded.value.developedWidthMM;
  const drawing: FlatPatternDrawing = {
    outline: [
      { x: 0, y: 0 },
      { x: unfolded.value.developedLengthMM, y: 0 },
      { x: unfolded.value.developedLengthMM, y: height },
      { x: 0, y: height },
    ],
    holes: Array.from({ length: 4 }, (_, index) => {
      const x = 20 + index * 25;
      return [
        { x, y: 15 },
        { x: x + 8, y: 15 },
        { x: x + 8, y: 23 },
        { x, y: 23 },
      ];
    }),
    bends: unfolded.value.bendLines.map((bend) => ({
      start: { x: bend.offsetMM, y: 5 },
      end: { x: bend.offsetMM, y: height - 5 },
      angleDeg: bend.angleDeg,
      direction: bend.direction,
      radiusMM: 1.5,
      id: bend.id,
      flangeLengthMM: 35,
      reliefMM: bend.reliefMM,
    })),
    units: "mm",
    closed: true,
  };
  const dxf = flatPatternDxf(drawing, { title: "P6-SM-16 enclosure" });
  if (!dxf.ok) return dxf;
  const finished = now();

  const timings = {
    unfold: afterUnfold - started,
    bendTable: afterLookup - afterUnfold,
    dxf: finished - afterLookup,
    total: finished - started,
  };
  return {
    ok: true,
    value: {
      bendCount: bends.length,
      holeCount: drawing.holes?.length ?? 0,
      timings,
      budget: SHEET_METAL_PERFORMANCE_BUDGET_MS,
      budgetMet:
        timings.unfold <= SHEET_METAL_PERFORMANCE_BUDGET_MS.unfold &&
        timings.bendTable <= SHEET_METAL_PERFORMANCE_BUDGET_MS.bendTable &&
        timings.dxf <= SHEET_METAL_PERFORMANCE_BUDGET_MS.dxf &&
        timings.total <= SHEET_METAL_PERFORMANCE_BUDGET_MS.total,
    },
  };
}
