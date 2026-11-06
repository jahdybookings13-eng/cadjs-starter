// flux/domains/pcb/sim.ts — pure electrical analysis (no kernel).
//
// The math behind the simulation/analysis actions: RC/RLC filters (Bode,
// -3dB), voltage dividers, RC timing, LC resonance, basic DC current flow,
// ripple estimate, and Monte-Carlo envelope sampling. All deterministic given
// a seed so they unit-test cleanly. The Shortcircuit backend (spice.ts)
// handles the heavy SPICE transient; this module is the fast, local, exact
// small-signal layer the orchestrator uses for instant answers.

// Seeded PRNG (mulberry32) so Monte-Carlo is reproducible in tests.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VoltageDivider {
  vout: number;
  ratio: number;
  current: number; // total draw, A
}

/** R1 from V to out, R2 from out to GND. */
export function voltageDivider(
  vIn: number,
  r1: number,
  r2: number,
): VoltageDivider {
  const r = r2 / (r1 + r2);
  const current = r1 + r2 > 0 ? vIn / (r1 + r2) : 0;
  return { vout: vIn * r, ratio: r, current };
}

export interface RcFilter {
  fc: number; // -3dB cutoff, Hz
  order: 1;
  rolloffDbPerDecade: number;
  type: "lp" | "hp";
}

export function rcFilter(
  r: number,
  c: number, // farads
  type: "lp" | "hp" = "lp",
): RcFilter {
  const fc = 1 / (2 * Math.PI * r * c);
  return { fc, order: 1, rolloffDbPerDecade: 20, type };
}

export interface RlcPoint {
  f: number;
  magDb: number;
  phaseDeg: number;
}

/**
 * Series RLC low-pass magnitude/phase, sampled. Used by passiveFilterAnalysis
 * and activeFilterAnalysis (op-amp gain applied by the caller).
 */
export function rlcBode(
  r: number,
  l: number, // H
  c: number, // F
  fMin: number,
  fMax: number,
  n: number,
): RlcPoint[] {
  const pts: RlcPoint[] = [];
  const w0 = 1 / Math.sqrt(l * c);
  for (let i = 0; i < n; i += 1) {
    const f = fMin * Math.pow(fMax / fMin, i / (n - 1));
    const w = 2 * Math.PI * f;
    const zc = r + (w * l - 1 / (w * c));
    const mag = 1 / Math.hypot(1, zc / (w * l + 1e-30));
    const phase = Math.atan2(-(w * l - 1 / (w * c)), 1) * (180 / Math.PI);
    pts.push({
      f,
      magDb: 20 * Math.log10(Math.max(mag, 1e-9)),
      phaseDeg: phase,
    });
  }
  void w0;
  return pts;
}

/** RC one-shot time constants. */
export function rcTiming(
  r: number,
  c: number,
): {
  tau: number;
  chargeT: number; // ~5 tau
  highT: number; // 555: 1.386 R_total C
} {
  const tau = r * c;
  return { tau, chargeT: 5 * tau, highT: 1.386 * r * c };
}

/** Series/parallel LC resonance + Q + -3dB width. */
export function lcResonance(
  l: number,
  c: number,
  r: number,
): { f0: number; Q: number; bandwidth: number } {
  const f0 = 1 / (2 * Math.PI * Math.sqrt(l * c));
  const Q = (1 / r) * Math.sqrt(l / c);
  return { f0, Q, bandwidth: f0 / Q };
}

/** Pass a DC source through a series resistor: I = V/R. */
export function dcCurrent(v: number, r: number): number {
  return r > 0 ? v / r : 0;
}

/**
 * Peak-to-
/**
 * Peak-to-peak ripple on a cap-drop output: Vripple = Iload / (f * C).
 */
export function rippleEstimate(
  iLoad: number, // A
  f: number, // Hz
  c: number, // F
): { vpp: number } {
  return { vpp: c > 0 ? iLoad / (f * c) : 0 };
}

export interface MonteCarloRun {
  iterations: number;
  seed: number;
  samples: number[];
  yieldLow: number;
  yieldIn: number;
  yieldHigh: number;
}

export function monteCarlo(
  seed: number,
  iterations: number,
  sample: (rng: () => number) => number,
  windowLo?: number,
  windowHi?: number,
): MonteCarloRun {
  const rng = mulberry32(seed);
  const samples: number[] = new Array(iterations);
  let low = 0;
  let inWin = 0;
  let high = 0;
  for (let i = 0; i < iterations; i += 1) {
    const v = sample(rng);
    samples[i] = v;
    if (windowLo !== undefined && windowHi !== undefined) {
      if (v < windowLo) low += 1;
      else if (v > windowHi) high += 1;
      else inWin += 1;
    }
  }
  const n = iterations || 1;
  return {
    iterations,
    seed,
    samples,
    yieldLow: low / n,
    yieldIn: inWin / n,
    yieldHigh: high / n,
  };
}

export function drawTol(
  rng: () => number,
  nominal: number,
  tolFrac: number,
): number {
  return nominal * (1 + (rng() * 2 - 1) * tolFrac);
}
