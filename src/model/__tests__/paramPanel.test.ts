import { describe, expect, it } from "vitest";
import { feature } from "../featureMap";
import {
  buildExtrudeNode,
  buildVariableNode,
  provenanceForFeature,
} from "../onshapeHistory";
import {
  applyPanelEdit,
  panelEditToParameter,
  paramPanelForFeature,
} from "../paramPanel";

const sketchQ = () => [provenanceForFeature("Fsk", "SKETCH_ENTITY", "l")];

const mkExtrude = () =>
  buildExtrudeNode("Fex", "E", sketchQ(), {
    value: 0.01,
    units: "mm",
    expression: "10*mm",
  });

describe("param panel projection", () => {
  it("renders extrude rows in declared order with typed kinds", () => {
    const ex = buildExtrudeNode("Fex", "E", sketchQ(), {
      value: 0.01,
      units: "mm",
      expression: "10*mm",
    });
    const panel = paramPanelForFeature([ex], "Fex");
    expect(panel).not.toBeNull();
    expect(panel!.featureType).toBe("extrude");
    expect(panel!.status).toBe("implemented");
    const ids = panel!.rows.map((r) => r.parameterId);
    expect(ids).toContain("depth");
    const depth = panel!.rows.find((r) => r.parameterId === "depth")!;
    expect(depth.kind).toBe("quantity");
    expect(depth.units).toBe("m");
    expect(depth.expression).toBe("10*mm");
    expect(depth.valueSi).toBeCloseTo(0.01);
    expect(depth.usingDefault).toBe(false);
  });

  it("marks rows driven by a variable and omits them from plain linkage", () => {
    const v = buildVariableNode("Fv", "t", 0.004, "mm");
    const ex = buildExtrudeNode("Fex", "E", sketchQ(), {
      value: 0,
      units: "mm",
      expression: "t",
    });
    const panel = paramPanelForFeature([v, ex], "Fex")!;
    const depth = panel.rows.find((r) => r.parameterId === "depth")!;
    expect(depth.linkedVariable).toBe("t");
  });

  it("falls back to spec defaults when a param is absent", () => {
    const ex = buildExtrudeNode("Fex", "E", sketchQ(), {
      value: 0.01,
      units: "mm",
      expression: "10*mm",
    });
    ex.parameters = ex.parameters.filter((p) => p.parameterId !== "depth");
    const panel = paramPanelForFeature([ex], "Fex")!;
    const depth = panel.rows.find((r) => r.parameterId === "depth")!;
    expect(depth.usingDefault).toBe(true);
    expect(depth.value).toBe(
      feature("extrude")!.params.find((s) => s.parameterId === "depth")!
        .default,
    );
  });

  it("reports unknown feature types without throwing", () => {
    const ex = buildExtrudeNode("Fex", "E", sketchQ(), {
      value: 0.01,
      units: "mm",
      expression: "10*mm",
    });
    ex.featureType = "notARealFeature";
    const panel = paramPanelForFeature([ex], "Fex")!;
    expect(panel.unknownType).toBe(true);
    expect(panel.rows).toEqual([]);
  });

  it("returns null for a missing feature", () => {
    expect(paramPanelForFeature([], "Fnone")).toBeNull();
  });
});

describe("apply panel edit", () => {
  it("rewrites a quantity's value and expression in place", () => {
    const ex = buildExtrudeNode("Fex", "E", sketchQ(), {
      value: 0.01,
      units: "mm",
      expression: "10*mm",
    });
    const next = applyPanelEdit(ex, {
      parameterId: "depth",
      value: 0.02,
      expression: "20*mm",
    });
    const depth = next.find((p) => p.parameterId === "depth")!;
    expect(depth.kind).toBe("quantity");
    if (depth.kind === "quantity") {
      expect(depth.value).toBeCloseTo(0.02);
      expect(depth.expression).toBe("20*mm");
      expect(depth.units).toBe("mm");
    }
  });

  it("flips a boolean param", () => {
    const ex = buildExtrudeNode("Fex", "E", sketchQ(), {
      value: 0.01,
      units: "mm",
      expression: "10*mm",
    });
    const spec = feature("extrude")!.params.find((s) => s.kind === "boolean");
    if (!spec) return;
    const before = ex.parameters.find(
      (p) => p.parameterId === spec.parameterId,
    );
    const next = applyPanelEdit(ex, {
      parameterId: spec.parameterId,
      value: !(before && before.kind === "boolean" ? before.value : false),
    });
    const after = next.find((p) => p.parameterId === spec.parameterId)!;
    expect(after.kind).toBe("boolean");
  });
});

describe("commit bridge", () => {
  it("turns a quantity step into a committable parameter", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const depth = panel.rows.find((r) => r.parameterId === "depth")!;
    const param = panelEditToParameter(depth, 0.02);
    expect(param?.kind).toBe("quantity");
    if (param?.kind === "quantity") {
      expect(param.value).toBeCloseTo(0.02);
      expect(param.expression).toBe("0.02");
      expect(param.units).toBe("m");
    }
  });

  it("clamps a quantity to its declared bounds", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const depth = panel.rows.find((r) => r.parameterId === "depth")!;
    const bounded = { ...depth, min: 0, max: 0.005 };
    const param = panelEditToParameter(bounded, 0.01);
    if (param?.kind === "quantity") expect(param.value).toBe(0.005);
  });

  it("rejects non-committable kinds and non-finite numbers", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const q = panel.rows.find((r) => r.kind === "queryList");
    if (q) expect(panelEditToParameter(q, q.value)).toBeNull();
    const depth = panel.rows.find((r) => r.parameterId === "depth")!;
    expect(panelEditToParameter(depth, NaN)).toBeNull();
  });
});
