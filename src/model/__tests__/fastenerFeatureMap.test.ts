// src/model/__tests__/fastenerFeatureMap.test.ts
// Coverage: featureMap entries for fastener + screwHole.

import { describe, it, expect } from "vitest";
import { FEATURE_MAP, feature, featuresBySelection } from "../featureMap";

describe("FEATURE_MAP: fastener + screwHole entries", () => {
  const fastener = FEATURE_MAP.find((e) => e.featureType === "fastener");

  it("fastener is status=implemented with kernelOp fastener", () => {
    expect(fastener).toBeDefined();
    expect(fastener?.status).toBe("implemented");
    expect(fastener?.kernelOp).toBe("fastener");
  });

  it("fastener has enum params for the full preset catalogue (family, standard, head, tip)", () => {
    const fam = fastener?.params.find((p) => p.parameterId === "family");
    const std = fastener?.params.find((p) => p.parameterId === "standard");
    const head = fastener?.params.find((p) => p.parameterId === "head");
    const tip = fastener?.params.find((p) => p.parameterId === "tip");
    const clr = fastener?.params.find((p) => p.parameterId === "clearance");
    expect(fam).toBeDefined();
    expect(fam?.kind).toBe("enum");
    expect(fam?.enumValues?.length).toBe(11); // 11 families
    expect(std).toBeDefined();
    expect(std?.kind).toBe("enum");
    expect(std?.enumValues).toEqual(["iso", "unified", "npt"]);
    expect(head).toBeDefined();
    expect(head?.kind).toBe("enum");
    expect(head?.enumValues).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(tip).toBeDefined();
    expect(tip?.kind).toBe("enum");
    expect(tip?.enumValues).toEqual(
      expect.arrayContaining([
        "threaded",
        "partialThread",
        "pointed",
        "flat",
        "countersunk",
        "none",
      ]),
    );
    expect(clr).toBeDefined();
    expect(clr?.kind).toBe("enum");
    expect(clr?.enumValues).toEqual(
      expect.arrayContaining(["none", "m1", "m2", "m3", "m4", "tapped"]),
    );
  });

  it("screwHole is status=implemented with kernelOp screwHole", () => {
    const hole = FEATURE_MAP.find((e) => e.featureType === "screwHole");
    expect(hole).toBeDefined();
    expect(hole?.status).toBe("implemented");
    expect(hole?.kernelOp).toBe("screwHole");
    const clr = hole?.params.find((p) => p.parameterId === "clearance");
    expect(clr).toBeDefined();
    // ISO 273 fit: "tapped" is one of the options
    expect(clr?.enumValues).toContain("tapped");
  });

  it("featureMap entry lookup by type works", () => {
    expect(feature("fastener")?.featureType).toBe("fastener");
    expect(feature("screwHole")?.featureType).toBe("screwHole");
    expect(feature("does-not-exist")).toBeUndefined();
  });

  it("featuresBySelection contains the new types where applicable", () => {
    // screwHole should be reachable from a plane-face selection
    const onPlane = featuresBySelection("plane-face");
    expect(onPlane.some((e) => e.featureType === "screwHole")).toBe(true);
    // fastener reachable from `empty`
    const onEmpty = featuresBySelection("empty");
    expect(onEmpty.some((e) => e.featureType === "fastener")).toBe(true);
  });
});
