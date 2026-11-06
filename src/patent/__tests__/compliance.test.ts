import { describe, it, expect } from "vitest";
import {
  checkComplianceLocal,
  RULES,
  PATENT_ACTIONS,
  type PatentFigureRequest,
  type GeometryView,
} from "../index";

const svgView: GeometryView = { path: "/figs/front.svg", viewName: "front" };
const dxfView: GeometryView = { path: "/figs/iso.dxf", viewName: "isometric" };
const pngView: GeometryView = { path: "/figs/render.png", viewName: "render" };

function req(
  overrides: Partial<PatentFigureRequest> = {},
): PatentFigureRequest {
  return {
    geometryViews: [svgView, dxfView],
    figureLabel: "FIG. 1",
    ...overrides,
  };
}

describe("patent compliance (37 CFR 1.84 / MPEP 608.02)", () => {
  it("passes cleanly for numbered SVG views", () => {
    const issues = checkComplianceLocal(req());
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("flags a missing / malformed figure label", () => {
    const issues = checkComplianceLocal(req({ figureLabel: "Figure One" }));
    const label = issues.find((i) => i.rule === RULES.FIGURE_NUMBER);
    expect(label).toBeDefined();
    expect(label?.severity).toBe("error");
  });

  it("flags empty view list", () => {
    const issues = checkComplianceLocal(req({ geometryViews: [] }));
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("warns on raster (photography) views", () => {
    const issues = checkComplianceLocal(req({ geometryViews: [pngView] }));
    const photo = issues.find((i) => i.rule === RULES.NO_PHOTO);
    expect(photo).toBeDefined();
    expect(photo?.severity).toBe("warning");
  });

  it("warns when claims text has no reference numerals", () => {
    const issues = checkComplianceLocal(
      req({ claimsText: "a widget attached to a base" }),
    );
    const nums = issues.find((i) => i.rule === RULES.REFERENCE_NUMERAL);
    expect(nums).toBeDefined();
    expect(nums?.severity).toBe("warning");
  });

  it("does not flag claims text that has numerals", () => {
    const issues = checkComplianceLocal(
      req({ claimsText: "A widget (10) attached to a base (20)." }),
    );
    expect(
      issues.find((i) => i.rule === RULES.REFERENCE_NUMERAL),
    ).toBeUndefined();
  });

  it("exposes the full RULES table", () => {
    expect(RULES.BLACK_LINES_ONLY).toContain("37 CFR 1.84");
    expect(RULES.MARGIN_BOTTOM).toContain("37 CFR 1.84");
    expect(RULES.REFERENCE_NUMERAL).toContain("37 CFR 1.152");
    expect(RULES.SHEET_SIZE).toContain("37 CFR 1.85");
  });

  it("PATENT_ACTIONS lists all bus actions", () => {
    expect(PATENT_ACTIONS).toContain("patent.generateFigure");
    expect(PATENT_ACTIONS).toContain("patent.checkCompliance");
    expect(PATENT_ACTIONS).toContain("patent.exportSheet");
  });
});
