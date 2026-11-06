// src/model/__tests__/headShapes.test.ts
// Coverage: profile shape, solver, shape validity.

import { describe, it, expect } from "vitest";
import {
  headProfile,
  tipProfile,
  headShapeIds,
  tipStyleIds,
  type HeadShapeId,
} from "../headShapes";

describe("headShapes", () => {
  it("lists 13 head shapes including hex and socket kinds", () => {
    expect(headShapeIds).toHaveLength(13);
    expect(headShapeIds).toContain("hex");
    expect(headShapeIds).toContain("socketHex");
    expect(headShapeIds).toContain("tNut");
    expect(headShapeIds).toContain("wing");
    expect(headShapeIds).toContain("none");
  });

  it("lists 6 tip styles including CSK, pointed, partialThread", () => {
    expect(tipStyleIds).toHaveLength(6);
    expect(tipStyleIds).toContain("threaded");
    expect(tipStyleIds).toContain("partialThread");
    expect(tipStyleIds).toContain("pointed");
    expect(tipStyleIds).toContain("countersunk");
    expect(tipStyleIds).toContain("flat");
    expect(tipStyleIds).toContain("none");
  });

  it("hex profile: radius = CD/2, thick = A, af > 0", () => {
    const h = headProfile({
      standard: "iso",
      size: "M6",
      mode: "coarse",
      shapeId: "hex",
    });
    expect(h.resolved.af).toBeCloseTo(0.01, 12); // s=10mm
    expect(h.resolved.A).toBeCloseTo(0.0076, 12); // A = 0.76·af
    expect(h.resolved.CD).toBeGreaterThan(0);
    expect(h.profile.length).toBeGreaterThanOrEqual(4);
  });

  it("socket hex has a positive socketR", () => {
    const h = headProfile({
      standard: "iso",
      size: "M8",
      mode: "coarse",
      shapeId: "socketHex",
    });
    expect(h.resolved.socketR).toBeGreaterThan(0.005);
  });

  it("countersunk/resolved threadedLen tracks shank param", () => {
    const none = headProfile({
      standard: "iso",
      size: "M6",
      mode: "coarse",
      shapeId: "countersunk",
    });
    expect(none.resolved.threadedLen).toBe(0);
    const shanked = headProfile(
      { standard: "iso", size: "M6", mode: "coarse", shapeId: "countersunk" },
      0.01,
    );
    expect(shanked.resolved.threadedLen).toBeCloseTo(0.01, 12);
  });

  it("unknown size throws a helpful error", () => {
    expect(() =>
      headProfile({
        standard: "iso",
        size: "M99",
        mode: "coarse",
        shapeId: "hex",
      }),
    ).toThrow(/unknown size "M99"/);
  });

  it("tipProfile: threaded style is a plain cylinder", () => {
    const t = tipProfile(0.003, 0.02, "threaded");
    expect(t.resolved.style).toBe("threaded");
    // points: 4 (0,0) (r,0) (r,L) (0,L) and lines.
    const pts = t.profile.filter((p) => p.type === "point") as {
      r: number;
      z: number;
    }[];
    expect(pts.length).toBe(4);
  });

  it("tipProfile: partialThread produces shank + smaller core", () => {
    const t = tipProfile(0.003, 0.02, "partialThread", {
      unthreadedLen: 0.01,
      threadDia: 0.005,
    });
    const pts = t.profile.filter((p) => p.type === "point") as { r: number }[];
    // should cover both radii (shank 0.003, core 0.0025)
    expect(pts.some((p) => Math.abs(p.r - 0.003) < 1e-9)).toBe(true);
    expect(pts.some((p) => Math.abs(p.r - 0.0025) < 1e-9)).toBe(true);
  });

  it("tipProfile: pointed = a single-taper cone to zero radius", () => {
    const t = tipProfile(0.003, 0.005, "pointed");
    const pts = t.profile.filter((p) => p.type === "point") as { r: number }[];
    expect(pts.some((p) => Math.abs(p.r) < 1e-12)).toBe(true);
  });
});
