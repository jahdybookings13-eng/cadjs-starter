// PCB adapter: the real manufacturing export lives here now. Wraps the
// fabrication package (Gerber/drill/CPL/BoM) built entirely in-browser.
// No KiCad/atopile/ZapTrace process is spawned and nothing is mislabeled.

import {
  buildFabrication,
  type PcbFabFile,
  type PcbFabIssue,
} from "./fabrication";
import type { PcbStudioDocument } from "./model";

export interface PcbExportResult {
  ok: boolean;
  files: PcbFabFile[];
  /** ZIP of every file, ready to download. */
  zip: Uint8Array;
  issues: PcbFabIssue[];
  stats: {
    layers: number;
    pads: number;
    traces: number;
    vias: number;
    holes: number;
    components: number;
    bytes: number;
  };
}

export async function exportManufacturing(
  doc: PcbStudioDocument,
): Promise<PcbExportResult> {
  const fab = buildFabrication(doc);
  return {
    ok: fab.ok,
    files: fab.files,
    zip: fab.zip,
    issues: fab.issues,
    stats: fab.stats,
  };
}

export const PCB_ACTIONS = [
  "pcb.buildBoard",
  "pcb.exportManufacturing",
  "pcb.runDrc",
  "pcb.runErc",
  "pcb.autoroute",
  "pcb.autoPlace",
] as const;

export type { PcbFabFile, PcbFabIssue };
