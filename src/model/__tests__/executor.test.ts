import { beforeEach, describe, expect, it } from "vitest";
import { ScadgenHistory } from "../featureEngine";
import { scadgenExecutor } from "../executor";
import {
  buildBooleanNode,
  buildRevolveNode,
  buildSketchNode,
  buildSweepNode,
  provenanceForFeature,
} from "../onshapeHistory";
import { buildLinearPatternNodes, buildMirrorNodes } from "../primitives";

const plane = {
  type: "XY" as const,
  origin: [0, 0, 0],
  normal: [0, 0, 1],
  xAxis: [1, 0, 0],
  yAxis: [0, 1, 0],
};
const sketch = (fid: string, primitives: unknown[] = []) =>
  buildSketchNode(fid, fid, ["ln1"], null, {
    id: fid,
    plane,
    primitives,
    constraints: [],
  });

describe("executor rebuild → featureStates", () => {
  let h: ScadgenHistory;
  beforeEach(() => {
    h = new ScadgenHistory();
    scadgenExecutor.attach(h);
    scadgenExecutor.outputs.clear();
  });

  it("empty sketch surfaces kernel ERROR as inactive error state", async () => {
    h.add(sketch("Fsk_0"));
    await scadgenExecutor.whenIdle();
    const st = h.toListResponse().featureStates["Fsk_0"];
    expect(st?.featureStatus).toBe("ERROR");
    expect(st?.inactive).toBe(true);
  });

  it("revolve with ghost profile reports ERROR", async () => {
    h.add(
      buildRevolveNode(
        "Frv",
        "R",
        [provenanceForFeature("Fghost", "SKETCH_ENTITY", "ln")],
        [provenanceForFeature("Fghost", "SKETCH_ENTITY", "l1")],
        { value: Math.PI, units: "rad", expression: "180 deg" },
      ),
    );
    await scadgenExecutor.whenIdle();
    expect(h.toListResponse().featureStates["Frv"]?.featureStatus).toBe(
      "ERROR",
    );
  });

  it("sweep with ghost path reports ERROR", async () => {
    h.add(
      buildSweepNode(
        "Fsw",
        "S",
        [provenanceForFeature("Fghost", "SKETCH_ENTITY", "ln")],
        [provenanceForFeature("Fghost", "SKETCH_ENTITY", "l2")],
      ),
    );
    await scadgenExecutor.whenIdle();
    expect(h.toListResponse().featureStates["Fsw"]?.featureStatus).toBe(
      "ERROR",
    );
  });

  it("pattern with ghost source reports ERROR", async () => {
    h.add(buildLinearPatternNodes("Fpt", "P", "Fghost", 3, [1, 0, 0], 0.01));
    await scadgenExecutor.whenIdle();
    expect(h.toListResponse().featureStates["Fpt"]?.featureStatus).toBe(
      "ERROR",
    );
  });

  it("mirror with ghost source reports ERROR", async () => {
    h.add(buildMirrorNodes("Fmr", "M", "Fghost", "X"));
    await scadgenExecutor.whenIdle();
    expect(h.toListResponse().featureStates["Fmr"]?.featureStatus).toBe(
      "ERROR",
    );
  });

  it("boolean without worker fails gracefully to ERROR", async () => {
    h.add(sketch("Fsk_A"));
    h.add(sketch("Fsk_B"));
    h.add(
      buildBooleanNode(
        "Fbl",
        "B",
        [provenanceForFeature("Fsk_A", "FACE", "")],
        [provenanceForFeature("Fsk_B", "FACE", "")],
        "CUT",
      ),
    );
    await scadgenExecutor.whenIdle();
    expect(h.toListResponse().featureStates["Fbl"]?.featureStatus).toBe(
      "ERROR",
    );
  });

  it("boolean with missing targets errors before worker call", async () => {
    h.add(
      buildBooleanNode(
        "Fbx",
        "Ghost",
        [provenanceForFeature("Fnone", "FACE", "")],
        [provenanceForFeature("Fnone2", "FACE", "")],
      ),
    );
    await scadgenExecutor.whenIdle();
    expect(h.toListResponse().featureStates["Fbx"]?.featureStatus).toBe(
      "ERROR",
    );
  });
});
