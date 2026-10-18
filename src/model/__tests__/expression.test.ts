import { describe, expect, it } from "vitest";
import { evalExpr } from "../expression";
import { ScadgenHistory } from "../featureEngine";
import { scadgenExecutor } from "../executor";
import {
  buildExtrudeNode,
  buildVariableNode,
  parseQuantityExpression,
} from "../onshapeHistory";

describe("expression engine", () => {
  it("respects precedence and parens", () => {
    expect(evalExpr("2+3*4")).toMatchObject({ ok: true, value: 14 });
    expect(evalExpr("(2+3)*4")).toMatchObject({ ok: true, value: 20 });
    expect(evalExpr("10 mm")).toMatchObject({ ok: true, value: 0.01 });
    expect(evalExpr("2 m")).toMatchObject({ ok: true, value: 2 });
  });
  it("units are SI constants", () => {
    expect(evalExpr("76*mm")).toMatchObject({ ok: true, value: 0.076 });
    const deg = evalExpr("180*deg");
    expect(deg.ok && Math.abs(deg.value - Math.PI) < 1e-12).toBe(true);
  });
  it("resolves scoped variables", () => {
    expect(evalExpr("d*2", { d: 0.02 })).toMatchObject({
      ok: true,
      value: 0.04,
    });
  });
  it("errors on unknown identifiers and trailing input", () => {
    expect(evalExpr("nope*2").ok).toBe(false);
    expect(evalExpr("5 )").ok).toBe(false);
  });
  it("parseQuantityExpression delegates (round-trip contract)", () => {
    expect(parseQuantityExpression("76.0*mm")).toBeCloseTo(0.076);
    expect(parseQuantityExpression("garbage!!")).toBeNull();
  });
});

describe("variables through the rebuild loop", () => {
  it("variable node evaluates and feeds later variables", async () => {
    const h = new ScadgenHistory();
    scadgenExecutor.attach(h);
    scadgenExecutor.outputs.clear();
    h.add(buildVariableNode("Fv1", "d", 0.02, "mm"));
    const derived = buildVariableNode("Fv2", "d2", 0, "mm");
    derived.parameters[2] = {
      kind: "quantity",
      parameterId: "value",
      value: 0,
      units: "mm",
      expression: "d*2",
    };
    h.add(derived);
    h.add(
      buildExtrudeNode(
        "Fe",
        "E",
        [
          {
            entityType: "SKETCH_ENTITY",
            historyType: "CREATION",
            creationFeatureId: "Fghost",
            entityTag: "",
          },
        ],
        { value: 0, units: "mm", expression: "d2+5*mm" },
      ),
    );
    await scadgenExecutor.whenIdle();
    const st = h.toListResponse().featureStates;
    expect(st["Fv1"]?.featureStatus).toBe("OK");
    expect(st["Fv2"]?.featureStatus).toBe("OK");
    expect(st["Fe"]?.featureStatus).toBe("ERROR"); // unresolved ghost, not expression error
    expect(scadgenExecutor.lastReport["Fe"]?.detail).toContain("resolve");
  });

  it("bad expression marks variable ERROR with reason", async () => {
    const h = new ScadgenHistory();
    scadgenExecutor.attach(h);
    scadgenExecutor.outputs.clear();
    const bad = buildVariableNode("Fvb", "x", 0.01, "mm");
    bad.parameters[2] = {
      kind: "quantity",
      parameterId: "value",
      value: 0.01,
      units: "mm",
      expression: "undefinedVar*2",
    };
    h.add(bad);
    await scadgenExecutor.whenIdle();
    expect(h.toListResponse().featureStates["Fvb"]?.featureStatus).toBe(
      "ERROR",
    );
    expect(scadgenExecutor.lastReport["Fvb"]?.detail).toContain("undefinedVar");
  });
});
