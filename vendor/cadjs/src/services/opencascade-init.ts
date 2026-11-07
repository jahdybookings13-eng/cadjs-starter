// src/services/opencascade-init.ts
import opencascade from "opencascade.js/dist/opencascade.full.js";
import type { OpenCascadeInstance } from "opencascade.js";
import { resolveOccWasmUrl } from "../config";

export interface InitializeOpenCascadeOptions {
  /**
   * URL or path to `opencascade.full.wasm`. Overrides
   * `configureCadjs({ occWasmUrl })` and the auto-resolved default.
   */
  wasmUrl?: string;
}

type OpencascadeFactory = (opts: {
  locateFile: (file: string) => string;
}) => Promise<OpenCascadeInstance>;

export async function initializeOpenCascade(
  opts: InitializeOpenCascadeOptions = {},
) {
  const wasmUrl = opts.wasmUrl ?? resolveOccWasmUrl();

  return await (opencascade as unknown as OpencascadeFactory)({
    locateFile: (file: string) => {
      if (file.endsWith(".wasm")) {
        return wasmUrl;
      }
      return file;
    },
  });
}
