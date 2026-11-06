// src/model/__tests__/threadStandards.test.ts
// Coverage: ISO/UNF/NPT tables, depth formula, size index, clearance fits.

import { describe, it, expect } from "vitest";
import {
  resolveThread,
  depthFor,
  pitchOf,
  THREAD_SIZES,
  CLEARANCE_FITS,
  clearanceOf,
  ISO_SIZES,
  UNIFIED_SIZES,
  NPT_SIZES,
} from "../threadStandards";

describe("threadStandards", () => {
  it("ISO M6 coarse resolves to pitch 1 mm and depth 0.541275 mm (single-engage)", () => {
    const s = resolveThread("iso", "M6", "coarse", 1);
    expect(s.pitch).toBeCloseTo(0.001, 12);
    expect(s.majorD).toBeCloseTo(0.006, 12);
    expect(s.depth).toBeCloseTo(0.001 * 0.541275, 12);
  });

  it("ISO depth is 0.54127 · pitch for iso + unified", () => {
    for (const s of ["M3", "M4", "M5", "M8", "M10"] as const) {
      const r = resolveThread("iso", s, "coarse");
      expect(r.depth / r.pitch).toBeCloseTo(0.541275, 6);
    }
    const u = resolveThread("unified", "1/4-20", "coarse");
    expect(u.depth / u.pitch).toBeCloseTo(0.541275, 6);
  });

  it("NPT depth uses 0.141 · majorD", () => {
    const n = resolveThread("npt", '1/4"', "coarse");
    expect(n.depth / n.majorD).toBeCloseTo(0.141, 5);
    expect(n.taperPerLength).toBeCloseTo(0.0155, 6);
  });

  it("engagement scales depth multiplicatively", () => {
    const a = resolveThread("iso", "M6", "coarse", 1);
    const b = resolveThread("iso", "M6", "coarse", 2);
    expect(b.depth).toBeCloseTo(2 * a.depth, 10);
    expect(b.pitch).toBe(a.pitch);
  });

  it("depthFor() + pitchOf() are consistent with resolveThread", () => {
    expect(depthFor("iso", "M4", "coarse")).toBeCloseTo(
      resolveThread("iso", "M4", "coarse").depth,
      12,
    );
    expect(pitchOf("unified", "1/2-13", "coarse")).toBeCloseTo(
      resolveThread("unified", "1/2-13", "coarse").pitch,
      12,
    );
  });

  it("every THREAD_SIZES row resolves with positive pitch + depth", () => {
    for (const [std, set] of Object.entries(THREAD_SIZES)) {
      expect(set.coarse.length).toBeGreaterThan(0);
      for (const size of [...set.coarse, ...set.fine] as string[]) {
        const r = resolveThread(std as "iso", size, "coarse");
        expect(r.pitch, `${std}/${size}`).toBeGreaterThan(0);
        expect(r.depth, `${std}/${size}`).toBeGreaterThan(0);
        expect(r.majorD, `${std}/${size}`).toBeGreaterThan(0);
      }
    }
  });

  it("unknown size throws a helpful error", () => {
    expect(() => resolveThread("iso", "M99", "coarse")).toThrow(
      /unknown iso size "M99"/,
    );
    expect(() => pitchOf("unified", "bogus", "coarse")).toThrow(
      /unknown unified/,
    );
  });

  it("ISO_SIZES / UNIFIED_SIZES / NPT_SIZES are non-empty, disjoint families", () => {
    expect(ISO_SIZES.length).toBeGreaterThan(0);
    expect(UNIFIED_SIZES.length).toBeGreaterThan(0);
    expect(NPT_SIZES.length).toBeGreaterThan(0);
    // "M6" is a metric designator only — shouldn't appear in the unified list.
    expect(UNIFIED_SIZES).not.toContain("M6");
  });

  it("CLEARANCE_FITS is the ISO 273 family (m1..m4 + tapped + none)", () => {
    const ids = new Set(CLEARANCE_FITS.map((f) => f.id));
    for (const id of ["none", "m1", "m2", "m3", "m4", "tapped"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // The tapped fit is the only one that also has a thread op.
    const tapped = clearanceOf("tapped");
    expect(tapped?.tapped).toBe(true);
    for (const id of ["none", "m1", "m2", "m3", "m4"]) {
      expect(clearanceOf(id)?.tapped).toBe(false);
    }
    // m1/m2/m3 are increasing (looser fit per larger dia range).
    const m1 = clearanceOf("m1");
    const m3 = clearanceOf("m3");
    expect(m3!.multiplier).toBeGreaterThan(m1!.multiplier);
  });
});
