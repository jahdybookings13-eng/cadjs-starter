import { describe, expect, it } from "vitest";
import { ScadgenHistory } from "../featureEngine";
import {
  applyFilletEdit,
  buildEdgeFilletNode,
  modifyFillet,
} from "../filletEdit";
import { parseQuantityExpression } from "../onshapeHistory";

const node = () =>
  buildEdgeFilletNode("Ff", "Fillet", "Fbody", ["Fbody_E0"], 0.002);

describe("modifyFillet (history edit)", () => {
  it("rewrites radius with a typed expression", () => {
    const edited = applyFilletEdit(node(), { radius: 0.005 });
    const r = edited.parameters.find(
      (p) => p.kind === "quantity" && p.parameterId === "radius",
    );
    expect(r?.kind === "quantity" && r.value).toBe(0.005);
    expect(r?.kind === "quantity" && r.units).toBe("m");
    expect(
      r?.kind === "quantity" && parseQuantityExpression(r.expression),
    ).toBeCloseTo(0.005, 12);
  });
  it("rewrites the edge set preserving the source feature", () => {
    const edited = applyFilletEdit(node(), {
      edgeTags: ["Fbody_E1", "Fbody_E2"],
    });
    const e = edited.parameters.find(
      (p) => p.kind === "queryList" && p.parameterId === "entities",
    );
    expect(
      e?.kind === "queryList" && e.queries.map((q) => q.entityTag),
    ).toEqual(["Fbody_E1", "Fbody_E2"]);
    expect(
      e?.kind === "queryList" &&
        e.queries.every(
          (q) => q.creationFeatureId === "Fbody" && q.entityType === "EDGE",
        ),
    ).toBe(true);
  });
  it("rejects non-fillet nodes and non-positive radius", () => {
    const box = { ...node(), featureType: "extrude" };
    expect(() => applyFilletEdit(box, { radius: 1 })).toThrow(/not a fillet/);
    expect(() => applyFilletEdit(node(), { radius: 0 })).toThrow(/must be > 0/);
  });
  it("modifyFillet updates the stored node and reports misses", () => {
    const h = new ScadgenHistory();
    h.add(node());
    expect(modifyFillet(h, "Ff", { radius: 0.004 })).toBe(true);
    const p = h
      .get("Ff")!
      .parameters.find(
        (x) => x.kind === "quantity" && x.parameterId === "radius",
      );
    expect(p?.kind === "quantity" && p.value).toBe(0.004);
    expect(modifyFillet(h, "Nope", { radius: 1 })).toBe(false);
  });
});
