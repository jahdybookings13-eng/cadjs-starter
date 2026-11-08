/*
 * Hole tables. ISO metric diameters are millimetres in the source tables;
 * unified/NPT rows are inches. Everything converts to metres here. ISO 273
 * close/normal/loose classes drive clearance; tapped holes use the standard
 * coarse pitch and the ISO 68-1 5H/8 depth.
 */
export type HoleStandard = "CUSTOM" | "ISO_METRIC" | "UNIFIED" | "NPT";
export type HoleFit = "CUSTOM" | "CLEARANCE" | "TAPPED";
export type HoleFitClass = "CLOSE" | "NORMAL" | "LOOSE";

export interface HoleSpec {
  radius: number;
  tapRadius: number;
  pitch: number;
  threadDepth: number;
  /** Radial change per unit depth; NPT uses 1/16 in per inch. */
  taperPerLength: number;
}

const MM = 0.001;
const IN = 0.0254;

const METRIC: Record<
  string,
  {
    pitch: number;
    close: number;
    normal: number;
    loose: number;
    tap: number;
  }
> = {
  M3: { pitch: 0.5, close: 3.2, normal: 3.4, loose: 3.6, tap: 2.5 },
  M4: { pitch: 0.7, close: 4.3, normal: 4.5, loose: 4.8, tap: 3.3 },
  M5: { pitch: 0.8, close: 5.3, normal: 5.5, loose: 5.8, tap: 4.2 },
  M6: { pitch: 1, close: 6.4, normal: 6.6, loose: 7, tap: 5 },
  M8: { pitch: 1.25, close: 8.4, normal: 9, loose: 10, tap: 6.8 },
  M10: { pitch: 1.5, close: 10.5, normal: 11, loose: 12, tap: 8.5 },
  M12: { pitch: 1.75, close: 13, normal: 13.5, loose: 14.5, tap: 10.2 },
};

const UNIFIED: Record<string, { tpi: number; major: number }> = {
  "1/4-20": { tpi: 20, major: 0.25 },
  "5/16-18": { tpi: 18, major: 0.3125 },
  "3/8-16": { tpi: 16, major: 0.375 },
  "1/2-13": { tpi: 13, major: 0.5 },
};

const NPT: Record<string, { tpi: number; major: number }> = {
  "1/8-27": { tpi: 27, major: 0.405 },
  "1/4-18": { tpi: 18, major: 0.54 },
  "3/8-18": { tpi: 18, major: 0.675 },
  "1/2-14": { tpi: 14, major: 0.84 },
};

function specOf(
  clearanceDiameter: number,
  tapDiameter: number,
  pitch: number,
  taperPerLength = 0,
): HoleSpec {
  return {
    radius: clearanceDiameter / 2,
    tapRadius: tapDiameter / 2,
    pitch,
    threadDepth: 0.541275 * pitch,
    taperPerLength,
  };
}

export const HOLE_SIZES = [
  ...Object.keys(METRIC),
  ...Object.keys(UNIFIED),
  ...Object.keys(NPT),
];

/** Resolve a standard/fit pair, or null for a custom hole. */
export function resolveHoleSpec(
  standard: HoleStandard,
  size: string,
  fit: HoleFit,
  fitClass: HoleFitClass = "NORMAL",
): HoleSpec | null {
  if (standard === "CUSTOM" || fit === "CUSTOM") return null;
  if (standard === "ISO_METRIC") {
    const row = METRIC[size];
    if (!row) return null;
    return specOf(
      (fit === "TAPPED"
        ? row.tap
        : row[fitClass.toLowerCase() as "close" | "normal" | "loose"]) * MM,
      row.tap * MM,
      row.pitch * MM,
    );
  }
  if (standard === "UNIFIED") {
    const row = UNIFIED[size];
    if (!row) return null;
    const pitch = IN / row.tpi;
    const major = IN * row.major;
    const cls =
      fitClass === "CLOSE" ? 0 : fitClass === "LOOSE" ? IN / 32 : IN / 64;
    return specOf(
      fit === "TAPPED" ? major - pitch : major + cls,
      major - pitch,
      pitch,
    );
  }
  if (standard === "NPT") {
    const row = NPT[size];
    if (!row) return null;
    const pitch = IN / row.tpi;
    const major = IN * row.major;
    return specOf(major, major - pitch, pitch, 1 / 16);
  }
  return null;
}
