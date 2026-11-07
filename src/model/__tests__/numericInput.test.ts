import { describe, expect, it } from "vitest";
import { parseNumericInput } from "../numericInput";

describe("parseNumericInput", () => {
  it("keeps plain numbers and scientific notation working", () => {
    expect(parseNumericInput("12.5", "length")).toEqual({
      ok: true,
      value: 12.5,
    });
    expect(parseNumericInput("1e-3", "length")).toEqual({
      ok: true,
      value: 0.001,
    });
  });

  it("evaluates arithmetic in length fields", () => {
    expect(parseNumericInput("2+3*4", "length")).toEqual({
      ok: true,
      value: 14,
    });
    expect(parseNumericInput("1/2", "length")).toEqual({
      ok: true,
      value: 0.5,
    });
  });

  it("converts length units to the engine's metres", () => {
    const tenMm = parseNumericInput("10 mm", "length");
    expect(tenMm.ok).toBe(true);
    if (tenMm.ok) expect(tenMm.value).toBeCloseTo(0.01);

    const inches = parseNumericInput("2*25.4 mm", "length");
    expect(inches.ok).toBe(true);
    if (inches.ok) expect(inches.value).toBeCloseTo(0.0508);

    const mixed = parseNumericInput("1 in + 2 cm", "length");
    expect(mixed.ok).toBe(true);
    if (mixed.ok) expect(mixed.value).toBeCloseTo(0.0454);
  });

  it("returns angle expressions in degrees for the degree-based callers", () => {
    const fortyFive = parseNumericInput("45 deg", "angle");
    expect(fortyFive.ok).toBe(true);
    if (fortyFive.ok) expect(fortyFive.value).toBeCloseTo(45);

    const halfTurn = parseNumericInput("180 deg / 2", "angle");
    expect(halfTurn.ok).toBe(true);
    if (halfTurn.ok) expect(halfTurn.value).toBeCloseTo(90);
  });

  it("rejects a unit that does not match the field", () => {
    expect(parseNumericInput("10 mm", "angle").ok).toBe(false);
    expect(parseNumericInput("45 deg", "length").ok).toBe(false);
    expect(parseNumericInput("10 mm", "unitless").ok).toBe(false);
  });

  it("rejects malformed expressions", () => {
    expect(parseNumericInput("2*", "length").ok).toBe(false);
    expect(parseNumericInput("", "length").ok).toBe(false);
  });
});
