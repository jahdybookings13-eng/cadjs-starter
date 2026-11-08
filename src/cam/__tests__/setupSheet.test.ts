import { describe, expect, it } from "vitest";
import { buildSetupSheet, setupSheetFileName } from "../setupSheet";
import { sampleDocument } from "./fixtures";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("CAM setup sheet", () => {
  it("includes stock, tools, operations, time and screenshots", () => {
    const result = buildSetupSheet(sampleDocument(), {
      screenshots: [PNG],
      generatedAt: 0,
    });
    expect(result.fileName).toBe("Bracket-CAM-setup.html");
    expect(result.html).toContain("Bracket CAM");
    expect(result.html).toContain("Outside contour");
    expect(result.html).toContain("6 mm flat endmill");
    expect(result.html).toContain("100 × 80 × 20 mm");
    expect(result.html).toContain("Estimated cutting time");
    expect(result.html).toContain("Setup screenshot 1");
    expect(result.html).toContain(PNG);
    expect(result.estimatedMinutes).toBeGreaterThan(0);
  });

  it("rejects a non-image screenshot and invalid documents by name", () => {
    expect(() =>
      buildSetupSheet(sampleDocument(), { screenshots: ["file:///tmp/a.png"] }),
    ).toThrow(/data URL/);
    const bad = sampleDocument();
    bad.stock.size.x = 0;
    expect(() => buildSetupSheet(bad)).toThrow(/Stock X/);
  });

  it("builds a stable safe filename", () => {
    const document = sampleDocument();
    document.name = "  Bracket / v2  ";
    expect(setupSheetFileName(document)).toBe("Bracket-v2-setup.html");
  });
});
