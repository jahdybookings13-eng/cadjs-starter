import { describe, expect, it } from "vitest";
import {
  buildExtrudeNode,
  provenanceForFeature,
} from "../../../model/onshapeHistory";
import { paramPanelForFeature } from "../../../model/paramPanel";
import {
  layoutPanel,
  hitTest,
  resolveHitValue,
  DEFAULT_THEME,
} from "../paramPanelCanvas";

const sketchQ = () => [provenanceForFeature("Fsk", "SKETCH_ENTITY", "l")];

const mkExtrude = () =>
  buildExtrudeNode("Fex", "E", sketchQ(), {
    value: 0.01,
    units: "mm",
    expression: "10*mm",
  });

describe("panel layout", () => {
  it("gives every row a label and value region", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const layout = layoutPanel(panel, 320, DEFAULT_THEME);
    expect(layout.rows.length).toBe(panel.rows.length);
    for (const r of layout.rows) {
      expect(r.regions.some((x) => x.region === "label")).toBe(true);
    }
    expect(layout.height).toBeGreaterThan(0);
  });

  it("places quantity rows with decrement/increment/value regions", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const layout = layoutPanel(panel, 320, DEFAULT_THEME);
    const depth = layout.rows.find((r) => r.row.parameterId === "depth")!;
    const kinds = depth.regions.map((r) => r.region);
    expect(kinds).toContain("decrement");
    expect(kinds).toContain("increment");
    expect(kinds).toContain("value");
  });
});

describe("hit testing", () => {
  it("finds the increment control on a quantity row", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const layout = layoutPanel(panel, 320, DEFAULT_THEME);
    const depth = layout.rows.find((r) => r.row.parameterId === "depth")!;
    const inc = depth.regions.find((r) => r.region === "increment")!;
    const hit = hitTest(layout, inc.x + inc.w / 2, depth.y + depth.height / 2);
    expect(hit?.parameterId).toBe("depth");
    expect(hit?.region).toBe("increment");
  });

  it("returns null outside any row", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const layout = layoutPanel(panel, 320, DEFAULT_THEME);
    expect(hitTest(layout, -5, -5)).toBeNull();
  });
});

describe("hit to value resolution", () => {
  it("steps a quantity up and down within bounds", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const depth = panel.rows.find((r) => r.parameterId === "depth")!;
    const up = resolveHitValue(depth, {
      parameterId: "depth",
      rowIndex: 0,
      region: "increment",
    });
    expect(Number(up)).toBeCloseTo(0.011);
    const down = resolveHitValue(depth, {
      parameterId: "depth",
      rowIndex: 0,
      region: "decrement",
    });
    expect(Number(down)).toBeCloseTo(0.009);
  });

  it("toggles a boolean and ignores label hits", () => {
    const panel = paramPanelForFeature([mkExtrude()], "Fex")!;
    const bool = panel.rows.find((r) => r.kind === "boolean");
    if (bool) {
      const on = resolveHitValue(bool, {
        parameterId: bool.parameterId,
        rowIndex: 0,
        region: "toggle",
      });
      expect(typeof on).toBe("boolean");
      expect(on).toBe(bool.value !== true);
    }
    const depth = panel.rows.find((r) => r.parameterId === "depth")!;
    expect(
      resolveHitValue(depth, {
        parameterId: "depth",
        rowIndex: 0,
        region: "label",
      }),
    ).toBeNull();
  });
});
