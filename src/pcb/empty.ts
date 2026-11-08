// Lightweight empty PCB document helpers.
//
// The boot path (document tabs / scene) only needs to create an empty PCB tab.
// Keeping that here avoids pulling the full PCB engine into the initial bundle;
// the parser, DRC, router and fabrication modules are loaded on demand by the
// PCB workspace and Flux actions.

import { makeProject } from "../flux/domains/pcb/project";
import type {
  PcbDesignRules,
  PcbStudioDocument,
  SchematicSheet,
} from "./types";

export const SCADSTUDIO_PCB_NAME = "ScadStudio:pcb";
export const PCB_STUDIO_SCHEMA = "scadgen.scadstudio.pcb";
export const PCB_STUDIO_VERSION = 2 as const;

export const PCB_DEFAULT_RULES: PcbDesignRules = {
  minTraceMM: 0.15,
  minClearanceMM: 0.15,
  minViaDrillMM: 0.3,
  minViaPadMM: 0.6,
  minAnnularMM: 0.15,
  silkClearanceMM: 0.1,
  courtyardMM: 0.2,
};

let emptySeq = 0;

function emptyId(prefix: string): string {
  emptySeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${emptySeq.toString(36)}`;
}

function emptySchematic(): { sheets: SchematicSheet[] } {
  return {
    sheets: [
      {
        id: emptyId("sheet"),
        name: "Sheet 1",
        symbols: [],
        wires: [],
        junctions: [],
        powerPorts: [],
        labels: [],
        ports: [],
      },
    ],
  };
}

export function emptyPcbStudio(name = SCADSTUDIO_PCB_NAME): PcbStudioDocument {
  const created = Date.now();
  return {
    schema: PCB_STUDIO_SCHEMA,
    v: PCB_STUDIO_VERSION,
    name,
    board: {
      widthMM: 60,
      heightMM: 40,
      thicknessMM: 1.6,
      layers: 2,
      solderMask: "#0f7a4d",
    },
    project: makeProject(`scadstudio_pcb_${created.toString(36)}`, name),
    traces: [],
    vias: [],
    zones: [],
    cutouts: [],
    schematic: emptySchematic(),
    library: [],
    rules: { ...PCB_DEFAULT_RULES },
    createdAt: created,
    updatedAt: created,
  };
}

export function pcbStudioTabDesign(doc: PcbStudioDocument): string {
  return JSON.stringify(doc);
}
