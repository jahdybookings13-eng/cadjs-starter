// The package ships JS + wasm, no types. Declare only what we call.

declare module "@horang-corp/avr-gcc-wasm/firmware-builder" {
  export interface AvrGccBuildResult {
    hex: string;
    sensors: string[];
    target: {
      mcu: string;
      board: string;
      appFlashBytes: number;
    };
    bytes: number;
    hexBytes: number;
    flashBytes: number;
    fitsTarget: boolean;
    objectCount: number;
    memory: {
      linearPeakBytesByTool: Record<string, number>;
      linearPeakBytesTotalSequential: number;
    };
    timings: Record<string, number>;
    stderr: string[];
  }

  export interface AvrGccBuildOptions {
    source?: string;
    sensors?: string[];
    assetsBase?: string | URL;
  }

  export const SENSOR: { readonly OLED: "OLED"; readonly TOF: "TOF" };

  export function buildFirmware(
    options?: AvrGccBuildOptions | string[],
  ): Promise<AvrGccBuildResult>;

  export function setAssetsBase(base: string | URL): void;
}
