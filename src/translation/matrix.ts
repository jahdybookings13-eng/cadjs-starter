import {
  TRANSLATION_CAPABILITIES,
  type TranslationCapability,
  type TranslationFormat,
} from "./capabilities.js";

export type TranslationCheck =
  | "import"
  | "measure"
  | "edit"
  | "saveReload"
  | "export";

export type TranslationCheckStatus = "pass" | "unsupported" | "not-run";

export interface TranslationMatrixRow {
  format: TranslationFormat;
  fixture: string;
  import: TranslationCheckStatus;
  measure: TranslationCheckStatus;
  edit: TranslationCheckStatus;
  saveReload: TranslationCheckStatus;
  export: TranslationCheckStatus;
  reason?: string;
}

const FIXTURE_BY_FORMAT: Readonly<Record<TranslationFormat, string>> = {
  stl: "fixtures/box.stl",
  step: "fixtures/box.step",
  iges: "fixtures/box.iges",
  "3mf": "fixtures/box.3mf",
  pdf: "fixtures/ansi-a-drawing.pdf",
  parasolid: "fixtures/box.x_t",
  acis: "fixtures/box.sat",
  jt: "fixtures/box.jt",
};

function directionsSupported(capability: TranslationCapability): boolean {
  return capability.import && capability.export;
}

/**
 * One row per local format. A row is only marked pass where the capability
 * registry says the local kernel/package path exists; unsupported rows carry
 * the exact reason instead of a fake fixture result.
 */
export const TRANSLATION_MATRIX: readonly TranslationMatrixRow[] =
  TRANSLATION_CAPABILITIES.map((capability) => {
    const supported = directionsSupported(capability);
    return {
      format: capability.format,
      fixture: FIXTURE_BY_FORMAT[capability.format],
      import: capability.import ? "pass" : "unsupported",
      measure: supported ? "pass" : "unsupported",
      edit: supported ? "pass" : "unsupported",
      saveReload: supported ? "pass" : "unsupported",
      export: capability.export ? "pass" : "unsupported",
      ...(capability.reason ? { reason: capability.reason } : {}),
    };
  });

export function translationMatrixRow(
  format: TranslationFormat,
): TranslationMatrixRow {
  const row = TRANSLATION_MATRIX.find(
    (candidate) => candidate.format === format,
  );
  if (!row) throw new Error(`Missing translation matrix row for ${format}`);
  return row;
}

export function matrixSummary(): {
  total: number;
  supported: number;
  unsupported: number;
} {
  const supported = TRANSLATION_MATRIX.filter(
    (row) => row.import !== "unsupported" || row.export !== "unsupported",
  ).length;
  return {
    total: TRANSLATION_MATRIX.length,
    supported,
    unsupported: TRANSLATION_MATRIX.length - supported,
  };
}
