import { describe, expect, it } from "vitest";
import { TranslationError } from "../errors.js";
import {
  fromMillimeters,
  parseDocumentUnit,
  parseLength,
  parseLengthWithUnit,
  toMillimeters,
} from "../units.js";

describe("translation units", () => {
  it("converts every supported unit to millimetres and back", () => {
    const cases = [
      ["mm", 1],
      ["cm", 10],
      ["m", 1000],
      ["in", 25.4],
      ["ft", 304.8],
    ] as const;
    for (const [unit, factor] of cases) {
      expect(toMillimeters(2, unit)).toBeCloseTo(2 * factor, 9);
      expect(fromMillimeters(2 * factor, unit)).toBeCloseTo(2, 9);
    }
  });

  it("accepts unit aliases and case", () => {
    expect(parseDocumentUnit("Millimeters")).toBe("mm");
    expect(parseDocumentUnit(" IN ")).toBe("in");
    expect(parseDocumentUnit("feet")).toBe("ft");
  });

  it("rejects unknown units with a named code", () => {
    try {
      parseDocumentUnit("furlong");
      throw new Error("expected parseDocumentUnit to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TranslationError);
      expect((error as TranslationError).code).toBe("INVALID_UNIT");
      expect((error as Error).message).toMatch(/Unknown unit/);
    }
  });

  it("rejects blank, non-finite and non-positive lengths", () => {
    expect(() => parseLength("", "mm")).toThrow(/cannot be blank/);
    expect(() => parseLength("abc", "mm")).toThrow(/not a finite number/);
    expect(() => parseLength(0, "mm", { positive: true })).toThrow(
      /greater than zero/,
    );
  });

  it("parses a number with an explicit unit suffix", () => {
    expect(parseLengthWithUnit("1 in")).toBeCloseTo(25.4, 9);
    expect(parseLengthWithUnit(" 2.5 cm ")).toBeCloseTo(25, 9);
    expect(() => parseLengthWithUnit("12.5")).toThrow(/number and unit/);
  });
});
