// src/model/__tests__/fastenerPresets.test.ts
// Coverage: model, validateFastener, resolvePreset, buildPresetId, families.

import { describe, it, expect } from "vitest";
import {
  FASTENER_FAMILIES,
  resolvePreset,
  validateFastener,
  buildPresetId,
  type FastenerSpec,
  type FastenerFamily,
} from "../fastenerPresets";

describe("fastenerPresets", () => {
  it("lists 11 families", () => {
    expect(FASTENER_FAMILIES).toHaveLength(11);
  });

  it("hex-bolt preset (iso, M6, hex, threaded) resolves cleanly", () => {
    const p: FastenerSpec = resolvePreset({
      family: "bolt",
      standard: "iso",
      size: "M6",
      mode: "coarse",
      head: "hex",
      tip: "threaded",
      length: 0.02,
    });
    expect(p.family).toBe("bolt");
    expect(p.standard).toBe("iso");
    expect(p.size).toBe("M6");
    expect(p.head).toBe("hex");
    expect(p.tip).toBe("threaded");
    expect(p.length).toBe(0.02);
    expect(p.engagement).toBe(1);
    expect(p.id).toContain("hex");
    expect(p.id).toContain("bolt");
    expect(p.id).toContain("iso");
    expect(p.label).toMatch(/hex-bolt/i);
  });

  it("buildPresetId rejects invalid combos", () => {
    // stud with a head -> invalid
    expect(
      buildPresetId({
        family: "stud",
        standard: "iso",
        size: "M6",
        head: "hex",
        tip: "threaded",
      }),
    ).toBeNull();
    // unknown size
    expect(
      buildPresetId({
        family: "bolt",
        standard: "iso",
        size: "M99",
        head: "hex",
        tip: "threaded",
      }),
    ).toBeNull();
    // bolt + partialThread (fully threaded by definition)
    expect(
      buildPresetId({
        family: "bolt",
        standard: "iso",
        size: "M6",
        head: "hex",
        tip: "partialThread",
      }),
    ).toBeNull();
  });

  it("resolvePreset throws for unknown size with a helpful message", () => {
    expect(() =>
      resolvePreset({
        family: "bolt",
        standard: "iso",
        size: "M99",
        mode: "coarse",
        head: "hex",
        tip: "threaded",
        length: 0.02,
      }),
    ).toThrow(/M99/);
  });

  it("validateFastener flags stud/head combo and lists sizes", () => {
    const bad = validateFastener("stud", "iso", "M6", "hex", "threaded");
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.includes("stud: head must be"))).toBe(true);
    const good = validateFastener("bolt", "iso", "M6", "hex", "threaded");
    expect(good.ok).toBe(true);
    expect(good.validSizes).toContain("M6");
    expect(good.validSizes).toContain("M3");
    expect(good.validSizes).not.toContain("M99");
  });

  it("every family+standard combo has at least one valid head/tip shape", () => {
    const sizesFor: Record<"iso" | "unified" | "npt", string> = {
      iso: "M6",
      unified: "1/4-20",
      npt: '1/4"',
    };
    const familyKey: Record<string, FastenerFamily> = {
      "hex-bolt": "bolt",
      stud: "stud",
      "machine-screw": "machineScrew",
      "self-tap": "selfTap",
      "self-drill": "selfDrill",
      "wood-screw": "woodScrew",
      "csk-screw": "cskScrew",
      "t-nut": "tNut",
      "wing-nut": "wingNut",
      "eye-bolt": "eyeBolt",
      "screw-hole": "screwHole",
    };
    for (const fam of FASTENER_FAMILIES) {
      for (const std of ["iso", "unified", "npt"] as const) {
        const size = sizesFor[std];
        // Each family fixes its own head/tip; pull defaults.
        // (the validation function checks the canonical choice per family)
        const head =
          fam.id === "screw-hole" || fam.id === "stud"
            ? "none"
            : fam.id === "t-nut"
              ? "tNut"
              : fam.id === "wing-nut"
                ? "wing"
                : fam.id === "eye-bolt"
                  ? "round"
                  : "hex";
        const tip =
          fam.id === "screw-hole" ||
          fam.id === "t-nut" ||
          fam.id === "wing-nut" ||
          fam.id === "eye-bolt"
            ? "none"
            : fam.id === "self-drill"
              ? "pointed"
              : fam.id === "self-tap"
                ? "partialThread"
                : fam.id === "bolt" ||
                    fam.id === "machine-screw" ||
                    fam.id === "csk-screw"
                  ? "threaded"
                  : fam.id === "wood-screw"
                    ? "pointed"
                    : "threaded";
        const v = validateFastener(familyKey[fam.id]!, std, size, head, tip);
        expect(v.ok, `${fam.id}/${std}: ${v.errors.join("; ") || "ok"}`).toBe(
          true,
        );
      }
    }
  });
});
