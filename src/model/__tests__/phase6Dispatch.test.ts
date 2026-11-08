import { beforeEach, describe, expect, it } from "vitest";
import { ScadgenHistory } from "../featureEngine";
import { scadgenExecutor } from "../executor";
import {
  PHASE6_DISPATCH,
  phase6BlockedFeatures,
  phase6DispatchEntry,
  phase6DispatchError,
} from "../phase6Dispatch";
import type { ScadgenFeatureNode } from "../onshapeHistory";

const phase6Node = (
  featureId: string,
  featureType: string,
): ScadgenFeatureNode => ({
  featureId,
  featureType,
  name: featureType,
  namespace: "",
  parameters: [],
  subFeatures: [],
  suppressed: false,
});

describe("P6-02 Phase 6 dispatch registry", () => {
  it("registers every required Phase 6 feature exactly once", () => {
    const required = [
      "baseFlange",
      "edgeFlange",
      "bend",
      "corner",
      "relief",
      "louver",
      "hem",
      "flatPattern",
      "bendTable",
      "frame",
      "structuralMember",
      "cutList",
      "surfaceLoft",
      "surfaceFill",
      "surfaceOffset",
      "ruledSurface",
      "knitSurface",
      "trimSurface",
      "extendSurface",
      "thickenSurface",
      "replaceFace",
      "solidToSurface",
      "convertSurface",
    ];
    for (const featureType of required)
      expect(phase6DispatchEntry(featureType), featureType).toBeDefined();
    const types = PHASE6_DISPATCH.map((entry) => entry.featureType);
    expect(new Set(types).size).toBe(types.length);
  });

  it("routes aliases to real executor cases and names blocked kernel gaps", () => {
    expect(phase6DispatchEntry("edgeFlange")).toMatchObject({
      executorCase: "flange",
      state: "alias",
    });
    expect(phase6DispatchEntry("flatPattern")).toMatchObject({
      executorCase: "unfold",
      state: "alias",
    });
    expect(phase6DispatchEntry("knitSurface")).toMatchObject({
      executorCase: "knitSurface",
      state: "executor",
    });
    expect(phase6DispatchEntry("convertSurface")).toMatchObject({
      executorCase: "convertSurface",
      state: "executor",
    });
    expect(phase6DispatchEntry("solidToSurface")).toMatchObject({
      executorCase: "solidToSurface",
      state: "executor",
    });
    expect(phase6DispatchEntry("extendSurface")).toMatchObject({
      executorCase: "extendSurface",
      state: "executor",
    });
    expect(phase6DispatchEntry("baseFlange")).toMatchObject({
      executorCase: "baseFlange",
      state: "executor",
    });
    expect(phase6DispatchEntry("relief")).toMatchObject({
      executorCase: "relief",
      state: "executor",
    });
    expect(phase6DispatchEntry("corner")).toMatchObject({
      executorCase: "corner",
      state: "executor",
    });
    expect(phase6DispatchEntry("structuralMember")).toMatchObject({
      executorCase: "structuralMember",
      state: "executor",
    });
    expect(phase6DispatchEntry("louver")).toMatchObject({
      executorCase: "louver",
      state: "executor",
    });
    expect(phase6DispatchEntry("frame")).toMatchObject({
      executorCase: "frame",
      state: "executor",
    });
    expect(phase6DispatchEntry("frameGroup")).toMatchObject({
      executorCase: "frameGroup",
      state: "executor",
    });
    expect(phase6DispatchEntry("replaceFace")).toMatchObject({
      executorCase: "replaceFace",
      state: "executor",
    });
    expect(phase6DispatchError("notAFeature")).toBe(
      "unknown feature type 'notAFeature'",
    );
    expect(phase6BlockedFeatures()).toEqual([]);
  });

  it("marks an unhandled registered feature as a named executor error", async () => {
    const h = new ScadgenHistory();
    scadgenExecutor.attach(h);
    h.add(phase6Node("Fknit", "knitSurface"));
    await scadgenExecutor.whenIdle();
    expect(scadgenExecutor.lastReport.Fknit?.status).toBe("ERROR");
    expect(scadgenExecutor.lastReport.Fknit?.detail).toContain("knitSurface");
    expect(h.toListResponse().featureStates.Fknit?.featureStatus).toBe("ERROR");
  });

  beforeEach(() => {
    scadgenExecutor.outputs.clear();
  });
});
