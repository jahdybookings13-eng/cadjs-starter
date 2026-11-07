// ecad/avrBuildWorker.ts — the thread the AVR toolchain runs on.
//
// Vite bundles this as a module worker (see avrBuild.ts). The compiler modules,
// linker objects and wasm binaries are fetched from `public/avr/` at runtime,
// which is why the request carries `assetsBase`.

import { buildFirmware } from "@horang-corp/avr-gcc-wasm/firmware-builder";
import { compilerErrorSummary, inoToCpp } from "./avrSource";
import type { AvrBuildOutcome, AvrBuildRequest } from "./avrBuild";

const scope = self as unknown as {
  addEventListener(
    type: "message",
    handler: (event: MessageEvent<AvrBuildRequest>) => void,
  ): void;
  postMessage(message: AvrBuildOutcome): void;
};

scope.addEventListener("message", (event) => {
  void (async () => {
    const { source, constants = {}, assetsBase } = event.data ?? {};
    try {
      const cpp = inoToCpp(source ?? "", constants);
      const built = await buildFirmware({
        source: cpp,
        sensors: [],
        ...(assetsBase ? { assetsBase } : {}),
      });
      scope.postMessage({
        ok: true,
        result: {
          hex: built.hex,
          flashBytes: built.flashBytes,
          fitsTarget: built.fitsTarget,
          bytes: built.bytes,
          ms: built.timings.totalMs ?? 0,
          stderr: built.stderr,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stderr = message.split("\n").filter(Boolean);
      scope.postMessage({
        ok: false,
        error: compilerErrorSummary(stderr),
        stderr,
      });
    }
  })();
});
