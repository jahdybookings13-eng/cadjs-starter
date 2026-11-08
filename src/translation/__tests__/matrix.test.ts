import { describe, expect, it } from "vitest";
import { TRANSLATION_CAPABILITIES } from "../capabilities.js";
import {
  TRANSLATION_MATRIX,
  matrixSummary,
  translationMatrixRow,
} from "../matrix.js";

describe("translation matrix", () => {
  it("has exactly one row per local format and a fixture for each", () => {
    expect(TRANSLATION_MATRIX).toHaveLength(TRANSLATION_CAPABILITIES.length);
    expect(new Set(TRANSLATION_MATRIX.map((row) => row.format)).size).toBe(
      TRANSLATION_MATRIX.length,
    );
    for (const row of TRANSLATION_MATRIX) {
      expect(row.fixture).toMatch(/^fixtures\//);
    }
  });

  it("marks executed geometry formats as pass and PDF as export-only", () => {
    for (const format of ["stl", "step", "iges", "3mf"] as const) {
      const row = translationMatrixRow(format);
      expect(row.import).toBe("pass");
      expect(row.measure).toBe("pass");
      expect(row.edit).toBe("pass");
      expect(row.saveReload).toBe("pass");
      expect(row.export).toBe("pass");
    }
    const pdf = translationMatrixRow("pdf");
    expect(pdf.import).toBe("unsupported");
    expect(pdf.export).toBe("pass");
    expect(matrixSummary()).toMatchObject({
      total: 8,
      supported: 5,
      unsupported: 3,
    });
  });

  it("keeps Parasolid, ACIS and JT unsupported with a named reason", () => {
    for (const format of ["parasolid", "acis", "jt"] as const) {
      const row = translationMatrixRow(format);
      expect(row.import).toBe("unsupported");
      expect(row.export).toBe("unsupported");
      expect(row.reason).toMatch(/OpenCascade build does not expose/);
    }
  });
});
