/*
 * Fastener thread tables: ISO 68-1 metric + ASME B1.1 unified + NPT.
 * Geometry comes from the published formulas (H = 0.866025·P, basic cut
 * depth = 5H/8 = 0.54127·P); the lookup rows are the standard pitch lists.
 * Values in meters to match the engine's unit system.
 */
const MM = 0.001;
const IN = 0.0254;

export type ThreadStandard = "iso" | "unified" | "npt";

export interface ThreadSpec {
  pitch: number;
  majorD: number;
  depth: number;
  taperPerLength: number;
}

const ISO_COARSE: Record<string, [number, number]> = {
  "M1.6": [0.35, 1.6],
  M2: [0.4, 2],
  "M2.5": [0.45, 2.5],
  M3: [0.5, 3],
  M4: [0.7, 4],
  M5: [0.8, 5],
  M6: [1, 6],
  M7: [1, 7],
  M8: [1.25, 8],
  M10: [1.5, 10],
  M12: [1.75, 12],
  M14: [2, 14],
  M16: [2, 16],
  M18: [2.5, 18],
  M20: [2.5, 20],
  M22: [2.5, 22],
  M24: [3, 24],
};
const ISO_FINE: Record<string, [number, number]> = {
  ...ISO_COARSE,
  M8: [1, 8],
  M10: [1.25, 10],
  M12: [1.25, 12],
  M14: [1.5, 14],
  M16: [1.5, 16],
  M18: [2, 18],
  M20: [2, 20],
  M22: [2, 22],
  M24: [2, 24],
  M5: [0.5, 5],
  M6: [0.75, 6],
};
const UNIFIED: Record<string, [number, number]> = {
  "1/4-20": [1 / 20, 0.25],
  "5/16-18": [1 / 18, 0.3125],
  "3/8-16": [1 / 16, 0.375],
  "1/2-13": [1 / 13, 0.5],
  "9/16-12": [1 / 12, 0.5625],
  "5/8-11": [1 / 11, 0.625],
  "3/4-10": [1 / 10, 0.75],
  "1-8": [1 / 8, 1],
  "1/4-28": [1 / 28, 0.25],
  "5/16-24": [1 / 24, 0.3125],
  "3/8-24": [1 / 24, 0.375],
  "1/2-20": [1 / 20, 0.5],
};
const NPT: Record<string, [number, number]> = {
  '1/8"': [27, 0.37],
  '1/4"': [18, 0.533],
  '3/8"': [18, 0.675],
  '1/2"': [14, 0.84],
  '3/4"': [14, 1.05],
  '1"': [11.5, 1.315],
};
const H_OVER_P = 0.866025;

export function resolveThread(
  standard: ThreadStandard,
  size: string,
  mode: "coarse" | "fine",
  engagement = 1,
): ThreadSpec {
  const row =
    standard === "iso"
      ? (mode === "fine" ? ISO_FINE : ISO_COARSE)[size]
      : standard === "unified"
        ? UNIFIED[size]
        : NPT[size];
  if (!row) throw new Error(`thread: unknown ${standard} size "${size}"`);
  const unit = standard === "iso" ? MM : IN;
  const pitch = row[0] * unit;
  const major = row[1] * unit;
  const depth =
    (standard === "npt" ? 0.8 : (0.541275 * H_OVER_P) / 0.866025) *
    pitch *
    engagement;
  return {
    pitch,
    majorD: major,
    depth,
    taperPerLength: standard === "npt" ? 0.0155 : 0,
  };
}

export const ISO_SIZES = Object.keys(ISO_COARSE);
