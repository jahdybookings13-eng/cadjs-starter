import { describe, expect, it } from "vitest";
import {
  TRANSLATION_CAPABILITIES,
  assertTranslationSupported,
  getTranslationCapability,
  translationDisabledReason,
  translationFormatForFileName,
} from "../capabilities.js";
import { TranslationError } from "../errors.js";

describe("translation capabilities", () => {
  it("declares all local formats with a stable extension map", () => {
    expect(TRANSLATION_CAPABILITIES.map((entry) => entry.format)).toEqual([
      "stl",
      "step",
      "iges",
      "3mf",
      "pdf",
      "parasolid",
      "acis",
      "jt",
    ]);
    expect(translationFormatForFileName("part.IGS")?.format).toBe("iges");
    expect(translationFormatForFileName("part.3mf")?.format).toBe("3mf");
    expect(translationFormatForFileName("part.x_t")?.format).toBe("parasolid");
    expect(translationFormatForFileName("part.unknown")).toBeNull();
  });

  it("allows IGES import/export and PDF export", () => {
    expect(() => assertTranslationSupported("iges", "import")).not.toThrow();
    expect(() => assertTranslationSupported("iges", "export")).not.toThrow();
    expect(() => assertTranslationSupported("pdf", "export")).not.toThrow();
    expect(translationDisabledReason("pdf", "import")).toMatch(/PDF/);
  });

  it("names the missing kernel binding for Parasolid, ACIS and JT", () => {
    for (const format of ["parasolid", "acis", "jt"] as const) {
      expect(() => assertTranslationSupported(format, "import")).toThrow(
        TranslationError,
      );
      expect(() => assertTranslationSupported(format, "export")).toThrow(
        /OpenCascade build does not expose/,
      );
      expect(translationDisabledReason(format, "export")).toMatch(
        /OpenCascade build does not expose/,
      );
    }
  });

  it("throws a typed error for an unknown format", () => {
    expect(() => getTranslationCapability("obj" as never)).toThrow(
      TranslationError,
    );
  });
});
