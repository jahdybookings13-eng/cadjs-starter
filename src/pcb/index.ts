// PCB adapter skeleton (planning). Wraps KiCad headless / atopile / ZapTrace.
export interface PcbExportResult {
  gerberPath: string;
  bomPath: string;
}
export async function exportManufacturing(
  _projectId: string,
): Promise<PcbExportResult> {
  return { gerberPath: "", bomPath: "" };
}
export const PCB_ACTIONS = [
  "pcb.exportManufacturing",
  "pcb.runDrc",
  "pcb.runErc",
] as const;
