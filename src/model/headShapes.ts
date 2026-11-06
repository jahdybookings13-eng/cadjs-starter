// src/model/headShapes.ts
//
// Geometric parameter tables for fastener heads and tips (ISO 4014 / 2340,
// NNB / unified head forms) in SI units (meters).
//
// Every fastener is axisymmetric around its local Z axis (the bolt axis).
// Each head shape is expressed as a 2D profile in the (r, z) half-plane: r
// >= 0 radial, z axial. We revolve around the local Z axis.
//   z = 0  is the mounting-face plane (the head back).
//   z > 0  is the part that extends into the material (the shank/tip side).
//   z < 0  is the part behind the mounting face (rare; only convex caps).

import {
  type ThreadStandard,
  resolveThread,
  ISO_COARSE,
  ISO_FINE,
  UNIFIED,
  NPT,
  THREAD_SIZES,
} from "./threadStandards";

const MM = 0.001;
const IN = 0.0254;

// ---------------------------------------------------------------------------
// Head form families (DIN / ISO head thickness ratios)
//
// For each head family we expose a "s/k" pair (across-flats s, head-thick k).
// For these we use approximate head thicknesses that follow the published
// ISO 4014 (heptadodecagon hex) head table:
//   A = 0.76 · s  (for hex flange M ≤ 39)
//   A = 0.71 · s  (for hex flange M > 39)
// Then s (across-flats) is the nominal "socket" size:
//   for ISO hex head: AF = s (== standard for the family)
//   for socket head : socket = 0.8 · AF (12-pt ≈ 1/4 · AF + 0) -- approximated
//   across-corners CD = AF · 2/√3 · 1.54
// ---------------------------------------------------------------------------

const ISO_HEAD: Record<string, { s: number; d: number }> = {
  // s = across-flats, d = shaft major (mm)
  "M1.6": { s: 3.0, d: 1.6 },
  M2: { s: 4.0, d: 2.0 },
  "M2.5": { s: 5.0, d: 2.5 },
  M3: { s: 5.5, d: 3.0 },
  M4: { s: 7.0, d: 4.0 },
  M5: { s: 8.0, d: 5.0 },
  M6: { s: 10.0, d: 6.0 },
  M7: { s: 10.0, d: 7.0 },
  M8: { s: 13.0, d: 8.0 },
  M10: { s: 16.0, d: 10.0 },
  M12: { s: 18.0, d: 12.0 },
  M14: { s: 22.0, d: 14.0 },
  M16: { s: 24.0, d: 16.0 },
  M18: { s: 27.0, d: 18.0 },
  M20: { s: 30.0, d: 20.0 },
  M22: { s: 32.0, d: 22.0 },
  M24: { s: 36.0, d: 24.0 },
};
const UNIFIED_HEAD: Record<string, { s: number; d: number }> = {
  // s = across-flats, d = shaft major (inches)
  "1/4-20": { s: 7 / 16, d: 0.25 },
  "5/16-18": { s: 9 / 16, d: 0.3125 },
  "3/8-16": { s: 11 / 16, d: 0.375 },
  "1/2-13": { s: 15 / 16, d: 0.5 },
  "9/16-12": { s: 1, d: 0.5625 },
  "5/8-11": { s: 1, d: 0.625 },
  "3/4-10": { s: 22 / 16, d: 0.75 },
  "1-8": { s: 1.5, d: 1.0 },
  "1/4-28": { s: 7 / 16, d: 0.25 },
  "5/16-24": { s: 9 / 16, d: 0.3125 },
  "3/8-24": { s: 11 / 16, d: 0.375 },
  "1/2-20": { s: 15 / 16, d: 0.5 },
};
const NPT_HEAD: Record<string, { s: number; d: number }> = {
  '1/8"': { s: 9 / 16, d: 0.37 },
  '1/4"': { s: 7 / 16, d: 0.533 },
  '3/8"': { s: 9 / 16, d: 0.675 },
  '1/2"': { s: 15 / 16, d: 0.84 },
  '3/4"': { s: 22 / 16, d: 1.05 },
  '1"': { s: 1.75, d: 1.315 },
};

export type HeadShapeId =
  | "hex"
  | "socketHex"
  | "pan"
  | "countersunk"
  | "countersink"
  | "square"
  | "oval"
  | "round"
  | "button"
  | "cheese"
  | "tNut"
  | "wing"
  | "none";

export type TipStyle =
  | "threaded"
  | "partialThread"
  | "pointed"
  | "flat"
  | "countersunk"
  | "none";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HeadParams {
  standard: ThreadStandard;
  size: string;
  mode: "coarse" | "fine";
  shapeId: HeadShapeId;
}

export interface ResolvedHead {
  /** Hex / socket across-flats (m). The nominal AF. */
  af: number;
  /**
   * Circumscribed-diameter of the equivalent circle of the socket / around
   * the head. Used as the revolve outer radius for hex-like profiles.
   */
  CD: number;
  /** Head axial thickness A (m). Depth from mounting face to head back. */
  A: number;
  /** Socket recess radius (m) for socket heads; 0 otherwise. */
  socketR: number;
  /** Undercut washer radius (m) for button / cheese. */
  undercutR: number;
  /** Threaded tip portion length (m) for partialThread. */
  threadedLen: number;
  /** Core shaft diameter (m), i.e. the dia the shaft shares with the thread. */
  coreD: number;
}

export type ProfileEntity =
  | { id: string; type: "point"; r: number; z: number }
  | { id: string; type: "line"; p1Id: string; p2Id: string };

// ---------------------------------------------------------------------------
// Profile builder
// ---------------------------------------------------------------------------

/**
 * Resolve a head-spec into a 2D (r, z) profile.
 *
 * @param params  standard/size/mode/shape
 * @param shankLen  Axial length of the threaded (or unthreaded) tip portion,
 *                  in meters. 0 for fully-threaded-in-head (bolt). For a
 *                  partialThread usage, the threaded length is implicitly
 *                  "A - shankLen" so it does not end up equal to the head
 *                  thickness.
 */
export function headProfile(
  params: HeadParams,
  shankLen = 0,
): { profile: ProfileEntity[]; resolved: ResolvedHead } {
  const spec = headTable(params);
  const headUnit = params.standard === "iso" ? MM : IN;
  // Resolve the thread to get core diameter (used as shaft diameter).
  const thread = safeResolve(params.standard, params.size, params.mode);
  const af = spec.s * headUnit;
  // Across-corners of a hex profile is AF · (2/√3) · 1.54 ≈ 2.09 AF; the
  // revolve uses half of that outer circle. To keep the head visual, we use
  // AF itself as the outer radius (a typical model practice).
  const CD = (af * 2) / Math.sqrt(3); // across-corners of the hex
  const A = af * 0.76; // ISO 4014: head thick = 0.76 · s (M <= 39)

  const resolved: ResolvedHead = {
    af,
    CD,
    A,
    socketR: 0,
    undercutR: 0,
    threadedLen: shankLen,
    coreD: thread.majorD,
  };

  const points: ProfileEntity[] = [];
  const P = (id: string, r: number, z: number): string => {
    points.push({ id, type: "point", r, z });
    return id;
  };
  const L = (id: string, a: string, b: string) =>
    points.push({ id, type: "line", p1Id: a, p2Id: b });

  const rFull = CD / 2;
  const rSocket = CD * 0.75; // recessed 12-pt = 0.75 · CD

  switch (params.shapeId) {
    case "hex":
    case "square": {
      // Hex/square: flat cylinder of CD/2 radius, A thick.
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", rFull, 0);
      const p2 = P("p2", rFull, A);
      const p3 = P("p3", 0, A);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      break;
    }
    case "socketHex": {
      // Hex with a 0.75·CD socket recess from the back.
      // Profile: full hex outer then socket inner (indent).
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", rSocket, 0);
      const p2 = P("p2", rFull, 0);
      const p3 = P("p3", rFull, A * 0.5);
      const p4 = P("p4", rSocket, A * 0.5);
      const p5 = P("p5", rSocket, A);
      const p6 = P("p6", 0, A);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p4);
      L("l5", p4, p5);
      L("l6", p5, p6);
      L("l7", p6, p0);
      resolved.socketR = rSocket;
      break;
    }
    case "pan":
    case "button": {
      // Pan: trapezoidal head with a flattened top (button has a small dome,
      // modeled as a chamfer from the edge to the center-top).
      const topR = af * 0.49; // 0.5 AF
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", af / 2, 0);
      const p2 = P("p2", topR, A);
      const p3 = P("p3", 0, A);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      if (params.shapeId === "button") resolved.undercutR = topR;
      break;
    }
    case "countersunk":
    case "countersink": {
      // 82° (CSK) / 90° (countersink) flanks.
      const half =
        (params.shapeId === "countersink" ? 90 : 82) * (Math.PI / 360);
      const rOuter = af / 2;
      const rInner = rOuter - A * Math.tan(half);
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", rInner, 0);
      const p2 = P("p2", rOuter, A);
      const p3 = P("p3", 0, A);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      break;
    }
    case "oval": {
      // Oval (DIN 964 / ISO 4758): a very elongated "ellipse" approximation
      // using a flat bottom and an arc-like top. Simplified here to a pentagon.
      const rOuter = af / 2;
      const rTip = af * 0.35;
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", rOuter, 0);
      const p2 = P("p2", rOuter, A * 0.3);
      const p3 = P("p3", rTip, A);
      const p4 = P("p4", 0, A);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p4);
      L("l5", p4, p0);
      break;
    }
    case "round": {
      // Round (ISO 4762): flat cylinder, slightly wider than AF.
      const rOut = af * 0.55;
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", rOut, 0);
      const p2 = P("p2", rOut, A);
      const p3 = P("p3", 0, A);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      break;
    }
    case "cheese": {
      // Cheese (DIN 443): C-shape across a chord. Outer radius CD/2, inner
      // radius 0.6 · CD/2, A thick.
      const rOut = CD / 2;
      const rIn = (CD / 2) * 0.6;
      const p0 = P("p0", rIn, 0);
      const p1 = P("p1", rOut, 0);
      const p2 = P("p2", rOut, A);
      const p3 = P("p3", rIn, A);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      resolved.undercutR = rOut;
      break;
    }
    case "tNut": {
      // T-nut: square base + central vertical bore. Profile = a base plate
      // with the bore removed. The revolve yields a cylinder with a central
      // hole (T section): outer radius = s/2, inner bore = 0.5 · coreD.
      const rOut = af / 2;
      const rIn = thread.majorD * 0.5;
      const p0 = P("p0", rIn, 0);
      const p1 = P("p1", rOut, 0);
      const p2 = P("p2", rOut, A);
      const p3 = P("p3", rIn, A);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      break;
    }
    case "wing": {
      // Wing nut: central cylinder (CFD 0.9 · CD) with two "wings".
      // Approximated: full rectangle, no wings (they are the same height as A).
      const rOut = CD * 0.45;
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", rOut, 0);
      const p2 = P("p2", rOut, A);
      const p3 = P("p3", 0, A);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      break;
    }
    case "none":
    default:
      // No head. Profile is a single point; caller places a plain shaft.
      points.push({ id: "p_empty", type: "point", r: 0, z: 0 });
      break;
  }
  return { profile: points, resolved };
}

// ---------------------------------------------------------------------------
// Tip profile
// ---------------------------------------------------------------------------

/**
 * Build the tip profile (z >= 0).
 *
 * The base radius `baseR` is the outer radius of the threaded portion at
 * z=0 (the head face plane). The tip extends to z = length.
 */
export function tipProfile(
  baseR: number,
  length: number,
  tipStyle: TipStyle,
  opts?: { unthreadedLen?: number; threadDia?: number },
): { profile: ProfileEntity[]; resolved: { style: TipStyle; length: number } } {
  const points: ProfileEntity[] = [];
  const P = (id: string, r: number, z: number): string => {
    points.push({ id, type: "point", r, z });
    return id;
  };
  const L = (id: string, a: string, b: string) =>
    points.push({ id, type: "line", p1Id: a, p2Id: b });

  switch (tipStyle) {
    case "threaded":
    case "flat": {
      // Plain cylinder. "flat" uses the same profile but no taper — a
      // distinct flag is reported via resolved.style for UI / tests.
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", baseR, 0);
      const p2 = P("p2", baseR, length);
      const p3 = P("p3", 0, length);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      break;
    }
    case "partialThread": {
      // Unthreaded shank (full radius baseR) then smaller core (threadDia/2).
      const unthreaded = opts?.unthreadedLen ?? length * 0.4;
      const tR = (opts?.threadDia ?? baseR * 2) / 2;
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", baseR, 0);
      const p2 = P("p2", baseR, unthreaded);
      const p3 = P("p3", tR, unthreaded);
      const p4 = P("p4", tR, length);
      const p5 = P("p5", 0, length);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p4);
      L("l5", p4, p5);
      L("l6", p5, p0);
      break;
    }
    case "pointed": {
      // 14° conical tip (ISO drilling angle).
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", baseR, 0);
      const p2 = P("p2", 0, length);
      const p3 = P("p3", 0, length);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      break;
    }
    case "countersunk": {
      // 82° end cone (CSK).
      const cska = 0.045; // radial CSK depth ratio
      const p0 = P("p0", 0, 0);
      const p1 = P("p1", baseR, 0);
      const p2 = P("p2", baseR * (1 - cska), length);
      const p3 = P("p3", 0, length);
      L("l1", p0, p1);
      L("l2", p1, p2);
      L("l3", p2, p3);
      L("l4", p3, p0);
      break;
    }
    case "none":
    default:
      points.push({ id: "p_empty", type: "point", r: 0, z: 0 });
      break;
  }
  return { profile: points, resolved: { style: tipStyle, length } };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const headTable = (p: HeadParams): { s: number; d: number } => {
  const set =
    p.standard === "iso"
      ? ISO_HEAD[p.size]
      : p.standard === "unified"
        ? UNIFIED_HEAD[p.size]
        : NPT_HEAD[p.size];
  if (!set)
    throw new Error(`headShapes: unknown size "${p.size}" for ${p.standard}`);
  return set;
};

const safeResolve = (
  standard: ThreadStandard,
  size: string,
  mode: "coarse" | "fine",
): { pitch: number; majorD: number; depth: number } => {
  try {
    return resolveThread(standard, size, mode, 1);
  } catch {
    return {
      pitch: 0.001,
      majorD: afOf(standard, size) * (standard === "iso" ? MM : IN),
      depth: 0,
    };
  }
};

function afOf(standard: ThreadStandard, size: string): number {
  const s =
    standard === "iso"
      ? ISO_HEAD[size]?.s
      : standard === "unified"
        ? UNIFIED_HEAD[size]?.s
        : NPT_HEAD[size]?.s;
  return s ?? 10;
}

export const headShapeIds: HeadShapeId[] = [
  "hex",
  "socketHex",
  "pan",
  "countersunk",
  "countersink",
  "square",
  "oval",
  "round",
  "button",
  "cheese",
  "tNut",
  "wing",
  "none",
];

export const tipStyleIds: TipStyle[] = [
  "threaded",
  "partialThread",
  "pointed",
  "flat",
  "countersunk",
  "none",
];

// Convenience: a small table of which sizes are valid per standard
export const headSizesPerStandard: Record<
  ThreadStandard,
  { coarse: string[]; fine: string[] }
> = {
  iso: { fine: Object.keys(ISO_FINE), coarse: Object.keys(ISO_COARSE) },
  unified: { coarse: Object.keys(UNIFIED), fine: [] },
  npt: { coarse: Object.keys(NPT), fine: [] },
};

export { THREAD_SIZES };
