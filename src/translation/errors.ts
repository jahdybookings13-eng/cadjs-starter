/** Stable, user-surfaceable translation failure codes. */
export type TranslationErrorCode =
  | "UNSUPPORTED_TRANSLATION"
  | "INVALID_UNIT"
  | "INVALID_LENGTH"
  | "INVALID_FILE"
  | "EMPTY_MODEL";

export class TranslationError extends Error {
  constructor(
    readonly code: TranslationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TranslationError";
  }
}

export function isTranslationError(error: unknown): error is TranslationError {
  return error instanceof TranslationError;
}
