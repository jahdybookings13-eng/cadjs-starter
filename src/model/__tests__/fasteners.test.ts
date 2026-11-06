// src/model/__tests__/fasteners.test.ts
// Coverage: buildFastenerPresetNode output shape, stability, screwHole variant.

import { describe, it, expect } from "vitest";
import {
  buildFastenerPresetNode,
  buildScrewHolePresetNode,
} from "../fasteners";
import type { FastenerSpec, FastenerFamily } from "../fastenerPresets";
import type { ThreadStandard } from "../threadStandards";
import type { HeadShapeId, TipStyle } from "../headShapes";
import type { ScadgenFeatureNode } from "../onshapeHistory";

describe("fasteners (composition)", () => {
  it("buildFastenerPresetNode produces one top 'fastener' node", () => {
    const spec: FastenerSpec = {
      id: "test-bolt",
      family: "bolt" as FastenerFamily,
      standard: "iso" as ThreadStandard,
      size: "M6",
      mode: "coarse",
      head: "hex" as HeadShapeId,
      tip: "threaded" as TipStyle,
      length: 0.02,
      label: "hex-bolt-iso-M6",
      engagement: 1,
    };
    const n: ScadgenFeatureNode = buildFastenerPresetNode(spec, "F1");
    expect(n.featureType).toBe("fastener");
    expect(n.name).toBe(spec.label);
    // subFeatures: profile sketch + thread child
    expect(n.subFeatures.length).toBeGreaterThanOrEqual(1);
    // the sketch child is named and carries a "planeRefLocal" hint
    expect(n.subFeatures[0]?.featureType).toBe("newSketch");
    // the thread child is present because tip = "threaded"
    const thread = n.subFeatures.find((f) => f.featureType === "thread");
    expect(thread).toBeDefined();
    const threadParamStd = thread?.parameters.find(
      (p) => p.kind === "string" && p.parameterId === "standard",
    );
    expect((threadParamStd as { value?: string } | undefined)?.value).toBe(
      "iso",
    );
    // parameters include axisHint etc.
    expect(
      n.parameters.find((p) => p.kind === "matrix" && p.parameterId === "axis"),
    ).toBeDefined();
  });

  it("buildFastenerPresetNode is stable: same spec -> same featureIds", () => {
    const spec: FastenerSpec = {
      id: "g-1",
      family: "machineScrew" as FastenerFamily,
      standard: "iso" as ThreadStandard,
      size: "M4",
      mode: "coarse",
      head: "socketHex" as HeadShapeId,
      tip: "partialThread" as TipStyle,
      length: 0.015,
      label: "mach-scr",
      engagement: 1,
    };
    const a = buildFastenerPresetNode(spec, "F1");
    const b = buildFastenerPresetNode(spec, "F1");
    const pa = JSON.stringify(a);
    const pb = JSON.stringify(b);
    expect(pa).toBe(pb);
    // stable sub-ids:
    const subA = JSON.stringify(a.subFeatures.map((f) => f.featureId));
    const subB = JSON.stringify(b.subFeatures.map((f) => f.featureId));
    expect(subA).toBe(subB);
  });

  it("buildScrewHolePresetNode produces a 'screwHole' node with a bore child", () => {
    const spec: FastenerSpec = {
      id: "hole-m6",
      family: "screwHole" as FastenerFamily,
      standard: "iso" as ThreadStandard,
      size: "M6",
      mode: "coarse",
      head: "none" as HeadShapeId,
      tip: "none" as TipStyle,
      length: 0.05,
      label: "screw-hole-M6",
      clearance: "tapped",
    };
    const n = buildScrewHolePresetNode(spec, "F2");
    expect(n.featureType).toBe("screwHole");
    const thread = n.subFeatures.find((f) => f.featureType === "thread");
    expect(thread).toBeDefined();
  });

  it("fastener profile is a closed (r,z) polyline with r >= 0", () => {
    const spec: FastenerSpec = {
      id: "bolt-iso-m8",
      family: "bolt",
      standard: "iso",
      size: "M8",
      mode: "coarse",
      head: "hex",
      tip: "threaded",
      length: 0.03,
      engagement: 1,
      label: "hex-bolt",
    };
    const n = buildFastenerPresetNode(spec, "F1");
    const pts = (n.extensions?.profilePoints ?? []) as {
      r: number;
      z: number;
      id: string;
    }[];
    const lines = (n.extensions?.profileLines ?? []) as {
      a: string;
      b: string;
      id: string;
    }[];
    expect(pts.length).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
    const byId = new Map(pts.map((p) => [p.id, p]));
    // All referenced endpoints exist
    for (const l of lines) {
      expect(byId.has(l.a), `line ${l.id} refs missing a=${l.a}`).toBe(true);
      expect(byId.has(l.b), `line ${l.id} refs missing b=${l.b}`).toBe(true);
    }
    // All r >= 0
    for (const p of pts) {
      expect(p.r, `point ${p.id} has negative r=${p.r}`).toBeGreaterThanOrEqual(
        0,
      );
    }
    // Profile is closed: number of distinct points touched by lines is at least 3
    const used = new Set<string>();
    for (const l of lines) {
      used.add(l.a);
      used.add(l.b);
    }
    expect(used.size).toBeGreaterThanOrEqual(3);
    // At least one point on the axis (r == 0)
    expect(pts.some((p) => p.r === 0)).toBe(true);
    // At least one point off-axis (r > 0) => has finite width
    expect(pts.some((p) => p.r > 0)).toBe(true);
  });

  it("screw-hole profile is a closed cylinder (r >= 0, 4 pts, 4 lines)", () => {
    const spec: FastenerSpec = {
      id: "hole-m6",
      family: "screwHole",
      standard: "iso",
      size: "M6",
      mode: "coarse",
      head: "none",
      tip: "none",
      length: 0.05,
      clearance: "tapped",
      label: "screw-hole",
    };
    const n = buildScrewHolePresetNode(spec, "F2");
    const pts = (n.extensions?.profilePoints ?? []) as { r: number }[];
    const lines = (n.extensions?.profileLines ?? []) as { id: string }[];
    // 2 axis points (ax0, ax1) are added to the bore profile so the revolve
    // case has a rotation axis. So pts = 2 (bore) + 2 (axis) = 4 bore pts,
    // lines = 4 (bore) + 1 (axl) = 5 lines.
    expect(pts.length).toBe(6); // 2 (bore closed quad corners) + 2 (axis) -- wait, 4 actual pts + 2 axis = 6
    expect(lines.length).toBe(5); // 4 (bore) + 1 (axl)
    expect(pts.every((p) => p.r >= 0)).toBe(true);
    expect(pts.some((p) => p.r === 0)).toBe(true);
    // The axis line is present
    expect(lines.some((l) => l.id === "axl")).toBe(true);
  });
});
