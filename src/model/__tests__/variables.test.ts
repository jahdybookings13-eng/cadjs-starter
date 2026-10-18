import { describe, expect, it } from "vitest";
import { ScadgenHistory } from "../featureEngine";
import { quantityOfTest, scadgenExecutor } from "../executor";
import { DIM_ANGLE, DIM_LENGTH, dimsEqual, evalExpr } from "../expression";
import {
  buildExtrudeNode,
  buildVariableNode,
  provenanceForFeature,
} from "../onshapeHistory";
import { variablesForFeature, variablesPanelRows } from "../variables";

describe("dimensional evaluator", () => {
  it("accepts coherent math", () => {
    const r = evalExpr("(10*mm) / (2*mm)");
    expect(r.ok && r.value === 5 && dimsEqual(r.dim, {})).toBe(true);
    const a = evalExpr("2*m*3");
    expect(a.ok && dimsEqual(a.dim, DIM_LENGTH)).toBe(true);
  });
  it("rejects length + angle", () => {
    const r = evalExpr("5*mm + 30*deg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("add");
  });
  it("tracks typed variables in scope", () => {
    const r = evalExpr("w + 5*mm", {
      w: { value: 0.02, dim: DIM_LENGTH },
    });
    expect(r.ok).toBe(true);
    const bad = evalExpr("w + 5", { w: { value: 0.02, dim: DIM_LENGTH } });
    expect(bad.ok).toBe(false);
  });
});

describe("typed variable enforcement in rebuild", () => {
  it("distance var rejects angle expression", async () => {
    const h = new ScadgenHistory();
    scadgenExecutor.attach(h);
    scadgenExecutor.outputs.clear();
    const v = buildVariableNode("Fv", "w", 0.02, "mm");
    v.parameters[2] = {
      kind: "quantity",
      parameterId: "value",
      value: 0.02,
      units: "mm",
      expression: "45*deg",
    };
    h.add(v);
    await scadgenExecutor.whenIdle();
    expect(h.toListResponse().featureStates["Fv"]?.featureStatus).toBe("ERROR");
    expect(scadgenExecutor.lastReport["Fv"]?.detail).toContain("distance");
  });
  it("depth parameter rejects dimension-mismatched scope", () => {
    const scope = { t: { value: 0.785, dim: { rad: 1 } } };
    const node = buildExtrudeNode(
      "Fex",
      "E",
      [provenanceForFeature("Fnone", "SKETCH_ENTITY", "x")],
      { value: 0, units: "m", expression: "t*rad" },
    );
    expect(() => quantityOfTest(node, "depth", scope)).toThrow(/depth/);
    const okNode = buildExtrudeNode(
      "Fex2",
      "E2",
      [provenanceForFeature("Fnone", "SKETCH_ENTITY", "x")],
      { value: 0, units: "m", expression: "2*mm" },
    );
    expect(quantityOfTest(okNode, "depth", scope)).toBeCloseTo(0.002);
  });
});

describe("variable usage index", () => {
  const mk = () => {
    const d1 = buildVariableNode("Fv1", "d", 0.02, "mm");
    const d2 = buildVariableNode("Fv2", "h2", 0, "mm");
    d2.parameters[2] = {
      kind: "quantity",
      parameterId: "value",
      value: 0,
      units: "mm",
      expression: "d*2",
    };
    const ex = buildExtrudeNode(
      "Fex",
      "Block",
      [provenanceForFeature("Fsk", "SKETCH_ENTITY", "l")],
      { value: 0, units: "mm", expression: "h2" },
    );
    return [d1, d2, ex] as const;
  };
  it("rows list transitive consumers", () => {
    const rows = variablesPanelRows([...mk()]);
    const d = rows.find((r) => r.name === "d");
    expect(d?.usedBy.map((u) => u.featureId)).toEqual(["Fex"]);
  });
  it("feature context query returns full variable closure", () => {
    const nodes = [...mk()];
    expect(variablesForFeature(nodes, "Fex").sort()).toEqual(["d", "h2"]);
    expect(variablesForFeature(nodes, "Fv1")).toEqual([]);
  });
});
