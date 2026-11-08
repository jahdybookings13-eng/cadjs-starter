import { TranslationError } from "./errors.js";

export type TranslationFormat =
  | "stl"
  | "step"
  | "iges"
  | "3mf"
  | "pdf"
  | "parasolid"
  | "acis"
  | "jt";

export type TranslationDirection = "import" | "export";

export interface TranslationCapability {
  format: TranslationFormat;
  label: string;
  extensions: readonly string[];
  import: boolean;
  export: boolean;
  /** Present when a direction is unavailable. Must name the missing binding. */
  reason?: string;
}

/**
 * Local capabilities only. Cloud translation is intentionally out of scope.
 * Parasolid/ACIS/JT are disabled because this OCC build has no kernel
 * bindings for them; they must never be emulated by a renamed mesh.
 */
export const TRANSLATION_CAPABILITIES: readonly TranslationCapability[] = [
  {
    format: "stl",
    label: "STL",
    extensions: [".stl"],
    import: true,
    export: true,
  },
  {
    format: "step",
    label: "STEP",
    extensions: [".step", ".stp"],
    import: true,
    export: true,
  },
  {
    format: "iges",
    label: "IGES",
    extensions: [".iges", ".igs"],
    import: true,
    export: true,
  },
  {
    format: "3mf",
    label: "3MF",
    extensions: [".3mf"],
    import: true,
    export: true,
  },
  {
    format: "pdf",
    label: "PDF",
    extensions: [".pdf"],
    import: false,
    export: true,
    reason:
      "PDF is a vector drawing export. This build has no PDF geometry importer.",
  },
  {
    format: "parasolid",
    label: "Parasolid",
    extensions: [".x_t", ".x_b"],
    import: false,
    export: false,
    reason:
      "The local OpenCascade build does not expose Parasolid bindings (X_T/X_B).",
  },
  {
    format: "acis",
    label: "ACIS",
    extensions: [".sat", ".sab"],
    import: false,
    export: false,
    reason:
      "The local OpenCascade build does not expose ACIS bindings (SAT/SAB).",
  },
  {
    format: "jt",
    label: "JT",
    extensions: [".jt"],
    import: false,
    export: false,
    reason:
      "The local OpenCascade build does not expose a JT reader or writer.",
  },
];

const BY_FORMAT = new Map(
  TRANSLATION_CAPABILITIES.map((capability) => [capability.format, capability]),
);

const BY_EXTENSION = new Map(
  TRANSLATION_CAPABILITIES.flatMap((capability) =>
    capability.extensions.map((extension) => [extension, capability] as const),
  ),
);

export function getTranslationCapability(
  format: TranslationFormat,
): TranslationCapability {
  const capability = BY_FORMAT.get(format);
  if (!capability) {
    throw new TranslationError(
      "UNSUPPORTED_TRANSLATION",
      `Unknown translation format: ${format}`,
    );
  }
  return capability;
}

/** Resolve an uploaded file by extension. Unknown extensions are named. */
export function translationFormatForFileName(
  fileName: string,
): TranslationCapability | null {
  const lower = fileName.toLowerCase();
  for (const [extension, capability] of BY_EXTENSION) {
    if (lower.endsWith(extension)) return capability;
  }
  return null;
}

export function translationDisabledReason(
  format: TranslationFormat,
  direction: TranslationDirection,
): string | null {
  const capability = getTranslationCapability(format);
  if (direction === "import" && capability.import) return null;
  if (direction === "export" && capability.export) return null;
  return (
    capability.reason ??
    `${capability.label} ${direction} is not supported by this build.`
  );
}

export function assertTranslationSupported(
  format: TranslationFormat,
  direction: TranslationDirection,
): void {
  const reason = translationDisabledReason(format, direction);
  if (reason) {
    throw new TranslationError(
      "UNSUPPORTED_TRANSLATION",
      `${getTranslationCapability(format).label} ${direction}: ${reason}`,
    );
  }
}
