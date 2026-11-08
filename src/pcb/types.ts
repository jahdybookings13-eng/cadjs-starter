// Shared PCB document types. Units are millimetres everywhere; the UI is the
// only place that converts. Layers are explicit so Gerber/DRC/assembly never
// have to guess what "layer 1" means.

import type { EcadSnapshot } from "../ecad/persist";
import type { PcbProject } from "../flux/domains/pcb/project";

export type PcbLayer = "top" | "bottom" | "inner1" | "inner2";

export const PCB_LAYERS: readonly PcbLayer[] = [
  "top",
  "bottom",
  "inner1",
  "inner2",
];

export function isPcbLayer(value: unknown): value is PcbLayer {
  return (
    value === "top" ||
    value === "bottom" ||
    value === "inner1" ||
    value === "inner2"
  );
}

export interface Pt {
  x: number;
  y: number;
}

export type PcbPadShape = "rect" | "round" | "oval";

/** A footprint pad. Coordinates are footprint-local (origin = part centre). */
export interface PcbPad {
  /** Pin id this pad belongs to; the pin↔pad map is explicit. */
  pin: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** `both` = plated through-hole / usable on either outer layer. */
  layer: PcbLayer | "both";
  shape: PcbPadShape;
  /** Plated hole diameter for through-hole pads. */
  drill?: number;
}

/** Footprint-local silkscreen rectangle (centre + size). */
export interface PcbSilkRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PcbLibraryPin {
  pin: string;
  name: string;
  kind: "power" | "signal" | "gnd" | "nc";
  /** Driver direction for output-conflict ERC. */
  dir?: "in" | "out" | "bidir" | "power" | "passive";
}

export interface PcbLibraryPart {
  id: string;
  name: string;
  type: string;
  mpn: string;
  package: string;
  prefix: string;
  /** Courtyard / body envelope in mm. */
  widthMM: number;
  heightMM: number;
  height3DMM: number;
  /** Local model reference used by the 3D assembly. */
  model3D?: string;
  color: string;
  pins: readonly PcbLibraryPin[];
  pads: readonly PcbPad[];
  silk: readonly PcbSilkRect[];
  /** True when this part was created locally and lives in the document. */
  custom?: boolean;
}

export interface PcbBoard {
  widthMM: number;
  heightMM: number;
  thicknessMM: number;
  layers: 2 | 4;
  solderMask: string;
}

export interface PcbTrace {
  id: string;
  net: string;
  layer: PcbLayer;
  widthMM: number;
  points: Pt[];
}

export interface PcbVia {
  id: string;
  net: string;
  x: number;
  y: number;
  drillMM: number;
  padMM: number;
  from: PcbLayer;
  to: PcbLayer;
}

export interface PcbZone {
  id: string;
  net: string;
  layer: PcbLayer;
  points: Pt[];
  clearanceMM: number;
  fill: "solid" | "hatch";
}

export interface PcbCutout {
  id: string;
  points: Pt[];
}

export interface PcbDesignRules {
  minTraceMM: number;
  minClearanceMM: number;
  minViaDrillMM: number;
  minViaPadMM: number;
  minAnnularMM: number;
  silkClearanceMM: number;
  courtyardMM: number;
}

// ---------------------------------------------------------------------------
// Schematic (multi-sheet). Symbols are placed instances; connectivity comes
// from wires that touch pins, plus global net labels and sheet ports.
// ---------------------------------------------------------------------------

export type SheetPortDirection = "input" | "output" | "bidirectional";

export interface SchematicPinPlacement {
  pin: string;
  x: number;
  y: number;
}

export interface SchematicSymbol {
  id: string;
  partId: string;
  designator: string;
  /** Body centre in sheet coordinates (mm). */
  x: number;
  y: number;
  pins: SchematicPinPlacement[];
}

export interface SchematicWire {
  id: string;
  net: string;
  points: Pt[];
}

export interface SchematicJunction {
  id: string;
  x: number;
  y: number;
}

export interface SchematicPowerPort {
  id: string;
  net: string;
  x: number;
  y: number;
  kind: "gnd" | "vcc";
}

export interface SchematicNetLabel {
  id: string;
  net: string;
  x: number;
  y: number;
}

export interface SchematicSheetPort {
  id: string;
  name: string;
  direction: SheetPortDirection;
  x: number;
  y: number;
}

export interface SchematicSheet {
  id: string;
  name: string;
  symbols: SchematicSymbol[];
  wires: SchematicWire[];
  junctions: SchematicJunction[];
  powerPorts: SchematicPowerPort[];
  labels: SchematicNetLabel[];
  ports: SchematicSheetPort[];
}

export interface PcbSchematic {
  sheets: SchematicSheet[];
}

// ---------------------------------------------------------------------------
// Persisted document
// ---------------------------------------------------------------------------

export interface PcbFix {
  kind: "trace" | "via" | "element" | "board" | "net" | "schematic" | "rule";
  id: string;
}

export interface PcbViolation {
  rule: string;
  severity: "error" | "warning";
  where: string;
  msg: string;
  source: "erc" | "drc";
  /** Stable code for tests, documentation and the UI fix action. */
  code: string;
  fix?: PcbFix;
  /** Measured value / limit for numeric rules, in mm. */
  actualMM?: number;
  limitMM?: number;
}

export interface Pcb3dBox {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  rotationDeg?: number;
  kind?: "board" | "component";
}

/**
 * PCB ↔ virtual-MCU link: binds a placed PCB element to an ECAD scene
 * instance so the PCB netlist can drive real ECAD wires.
 */
export interface PcbMcuLink {
  /** PCB element designator, e.g. "U1". */
  designator: string;
  /** Persisted ECAD instance id, e.g. "b1". */
  instance: string;
  /** Optional overrides: PCB pin id → ECAD pin name. */
  pins?: Record<string, string>;
}

export interface PcbStudioDocument {
  schema: "scadgen.scadstudio.pcb";
  v: 2;
  name: string;
  board: PcbBoard;
  project: PcbProject;
  traces: PcbTrace[];
  vias: PcbVia[];
  zones: PcbZone[];
  cutouts: PcbCutout[];
  schematic: PcbSchematic;
  /** Locally authored library parts (custom footprint persistence). */
  library: PcbLibraryPart[];
  /** Virtual MCU workbench: parts, wires and exact deployed firmware. */
  virtualMcu?: EcadSnapshot;
  /** PCB elements bound to virtual-MCU instances (netlist bridge). */
  virtualMcuLinks?: PcbMcuLink[];
  rules: PcbDesignRules;
  createdAt: number;
  updatedAt: number;
}
