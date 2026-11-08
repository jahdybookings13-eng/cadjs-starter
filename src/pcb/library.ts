// Built-in footprint library + custom-part creation.
//
// Every part carries explicit pads (position, size, layer, shape, drill) and a
// silkscreen outline. The footprint envelope is the courtyard used by DRC and
// placement. Pin↔pad mapping is by pin id, so a missing pad is a visible error
// rather than an implicit assumption.

import type {
  PcbLibraryPart,
  PcbLibraryPin,
  PcbPad,
  PcbSilkRect,
} from "./types";

function smd(
  pin: string,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: PcbPad["shape"] = "rect",
): PcbPad {
  return { pin, x, y, w, h, layer: "top", shape };
}

function tht(
  pin: string,
  x: number,
  y: number,
  drill: number,
  padMM: number,
): PcbPad {
  return {
    pin,
    x,
    y,
    w: padMM,
    h: padMM,
    layer: "both",
    shape: "round",
    drill,
  };
}

function pins(
  entries: Array<[string, string, PcbLibraryPin["kind"], PcbLibraryPin["dir"]]>,
): PcbLibraryPin[] {
  return entries.map(([pin, name, kind, dir]) => ({
    pin,
    name,
    kind,
    ...(dir ? { dir } : {}),
  }));
}

/** TQFP-32 pads: 8 per side, 0.8 mm pitch, 0.6 × 1.5 mm. */
function tqfp32Pads(): PcbPad[] {
  const out: PcbPad[] = [];
  const hw = 4.25;
  const start = 2.8;
  for (let i = 0; i < 8; i += 1) {
    const y = start - i * 0.8;
    // Side pads are long in the outward axis and narrow across the pitch.
    out.push(smd(String(i + 1), -hw, y, 1.5, 0.6));
    out.push(smd(String(9 + i), start - i * 0.8, -hw, 0.6, 1.5));
    out.push(smd(String(17 + i), hw, -(start - i * 0.8), 1.5, 0.6));
    out.push(smd(String(25 + i), -(start - i * 0.8), hw, 0.6, 1.5));
  }
  return out.sort((a, b) => Number(a.pin) - Number(b.pin));
}

const MCU_PINS = pins([
  ["1", "VCC", "power", "power"],
  ["2", "GND", "gnd", "power"],
  ["3", "D0", "signal", "bidir"],
  ["4", "D1", "signal", "bidir"],
  ["5", "D2", "signal", "bidir"],
  ["6", "D3", "signal", "bidir"],
  ["7", "D4", "signal", "bidir"],
  ["8", "RESET", "signal", "in"],
  ["9", "D5", "signal", "bidir"],
  ["10", "D6", "signal", "bidir"],
  ["11", "D7", "signal", "bidir"],
  ["12", "A0", "signal", "in"],
  ["13", "A1", "signal", "in"],
  ["14", "A2", "signal", "in"],
  ["15", "A3", "signal", "in"],
  ["16", "A4", "signal", "in"],
  ["17", "A5", "signal", "in"],
  ["18", "A6", "signal", "in"],
  ["19", "A7", "signal", "in"],
  ["20", "AREF", "signal", "in"],
  ["21", "GND2", "gnd", "power"],
  ["22", "AVCC", "power", "power"],
  ["23", "SDA", "signal", "bidir"],
  ["24", "SCL", "signal", "out"],
  ["25", "TX", "signal", "out"],
  ["26", "RX", "signal", "in"],
  ["27", "MISO", "signal", "out"],
  ["28", "MOSI", "signal", "out"],
  ["29", "SCK", "signal", "out"],
  ["30", "SS", "signal", "out"],
  ["31", "XTAL1", "signal", "in"],
  ["32", "XTAL2", "signal", "out"],
]);

const PASSIVE_SILK: PcbSilkRect[] = [
  { x: 0, y: -0.55, w: 2.0, h: 0.18 },
  { x: 0, y: 0.55, w: 2.0, h: 0.18 },
];

export const BUILTIN_LIBRARY: readonly PcbLibraryPart[] = [
  {
    id: "mcu-328p",
    name: "ATmega328P MCU",
    type: "mcu",
    mpn: "ATMEGA328P-AU",
    package: "TQFP-32",
    prefix: "U",
    widthMM: 9.4,
    heightMM: 9.4,
    height3DMM: 1.2,
    model3D: "builtin://tqfp-32",
    color: "#20252b",
    pins: MCU_PINS,
    pads: tqfp32Pads(),
    silk: [{ x: 0, y: 0, w: 7.2, h: 7.2 }],
  },
  {
    id: "resistor-0805",
    name: "10k resistor",
    type: "resistor",
    mpn: "RC0805FR-0710KL",
    package: "0805",
    prefix: "R",
    widthMM: 3.2,
    heightMM: 1.6,
    height3DMM: 0.55,
    model3D: "builtin://r-0805",
    color: "#d7c7a1",
    pins: [
      { pin: "1", name: "A", kind: "signal", dir: "passive" },
      { pin: "2", name: "B", kind: "signal", dir: "passive" },
    ],
    pads: [smd("1", -0.95, 0, 1.0, 1.3), smd("2", 0.95, 0, 1.0, 1.3)],
    silk: PASSIVE_SILK,
  },
  {
    id: "capacitor-0805",
    name: "100nF capacitor",
    type: "capacitor",
    mpn: "CL21B104KBCNNNC",
    package: "0805",
    prefix: "C",
    widthMM: 3.2,
    heightMM: 1.6,
    height3DMM: 0.8,
    model3D: "builtin://c-0805",
    color: "#b39b72",
    pins: [
      { pin: "1", name: "+", kind: "power", dir: "passive" },
      { pin: "2", name: "-", kind: "gnd", dir: "passive" },
    ],
    pads: [smd("1", -0.95, 0, 1.0, 1.3), smd("2", 0.95, 0, 1.0, 1.3)],
    silk: PASSIVE_SILK,
  },
  {
    id: "led-0805",
    name: "Status LED",
    type: "led",
    mpn: "LTST-C171KRKT",
    package: "0805",
    prefix: "D",
    widthMM: 3.2,
    heightMM: 1.6,
    height3DMM: 0.8,
    model3D: "builtin://led-0805",
    color: "#ef4444",
    pins: [
      { pin: "1", name: "A", kind: "signal", dir: "passive" },
      { pin: "2", name: "K", kind: "gnd", dir: "passive" },
    ],
    pads: [smd("1", -0.95, 0, 1.0, 1.3), smd("2", 0.95, 0, 1.0, 1.3)],
    silk: PASSIVE_SILK,
  },
  {
    id: "header-1x4",
    name: "1×4 pin header",
    type: "connector",
    mpn: "PZ254-1-04",
    package: "THT-1x4",
    prefix: "J",
    widthMM: 10.2,
    heightMM: 2.5,
    height3DMM: 2.5,
    model3D: "builtin://header-1x4",
    color: "#30343b",
    pins: [
      { pin: "1", name: "VCC", kind: "power", dir: "power" },
      { pin: "2", name: "GND", kind: "gnd", dir: "power" },
      { pin: "3", name: "TX", kind: "signal", dir: "in" },
      { pin: "4", name: "RX", kind: "signal", dir: "out" },
    ],
    pads: [
      tht("1", -3.81, 0, 1.0, 1.7),
      tht("2", -1.27, 0, 1.0, 1.7),
      tht("3", 1.27, 0, 1.0, 1.7),
      tht("4", 3.81, 0, 1.0, 1.7),
    ],
    silk: [{ x: 0, y: 0, w: 10.2, h: 2.5 }],
  },
];

export const PCB_LIBRARY: readonly PcbLibraryPart[] = BUILTIN_LIBRARY;

/** Merge built-ins with the document's locally authored parts. */
export function allLibraryParts(doc: {
  library: readonly PcbLibraryPart[];
}): PcbLibraryPart[] {
  const byId = new Map<string, PcbLibraryPart>();
  for (const part of BUILTIN_LIBRARY) byId.set(part.id, part);
  for (const part of doc.library) byId.set(part.id, part);
  return [...byId.values()];
}

export function libraryPart(
  doc: { library: readonly PcbLibraryPart[] },
  id: string,
): PcbLibraryPart | null {
  return allLibraryParts(doc).find((part) => part.id === id) ?? null;
}

export interface CustomPartInput {
  name: string;
  prefix: string;
  mpn?: string;
  package?: string;
  type?: string;
  widthMM?: number;
  heightMM?: number;
  height3DMM?: number;
  model3D?: string;
  color?: string;
  pins?: Array<{ pin: string; name: string; kind?: PcbLibraryPin["kind"] }>;
  /** Optional explicit pads; when omitted a sensible default is generated. */
  pads?: PcbPad[];
  silk?: PcbSilkRect[];
}

let customSeq = 0;

/**
 * Author a local part. With no pads supplied we generate a real two-pad SMD
 * footprint (0805 geometry) for 2-pin parts, or a DIP-like two-row footprint
 * for larger pin counts. The result is persisted in the document library.
 */
export function createCustomPart(input: CustomPartInput): PcbLibraryPart {
  const cleanName = input.name.trim() || "Custom part";
  const prefix = (input.prefix.trim() || "X").toUpperCase().slice(0, 3);
  customSeq += 1;
  const id = `custom-${Date.now().toString(36)}-${customSeq.toString(36)}`;
  const inputPins =
    input.pins && input.pins.length > 0
      ? input.pins
      : [
          { pin: "1", name: "1", kind: "signal" as const },
          { pin: "2", name: "2", kind: "signal" as const },
        ];
  const libraryPins: PcbLibraryPin[] = inputPins.map((pin) => ({
    pin: pin.pin,
    name: pin.name,
    kind: pin.kind ?? "signal",
    dir: "passive",
  }));
  const pads =
    input.pads && input.pads.length > 0
      ? input.pads
      : defaultPads(libraryPins.length);
  const width =
    input.widthMM && input.widthMM > 0
      ? input.widthMM
      : libraryPins.length <= 2
        ? 3.2
        : Math.max(7.6, Math.ceil(libraryPins.length / 2) * 2.54 + 2.5);
  const height =
    input.heightMM && input.heightMM > 0
      ? input.heightMM
      : libraryPins.length <= 2
        ? 1.6
        : 7.6;
  return {
    id,
    name: cleanName,
    type: input.type?.trim() || "custom",
    mpn: input.mpn?.trim() ?? "",
    package: input.package?.trim() || "CUSTOM",
    prefix,
    widthMM: width,
    heightMM: height,
    height3DMM: input.height3DMM && input.height3DMM > 0 ? input.height3DMM : 1,
    model3D: input.model3D?.trim() || "builtin://custom-box",
    color: input.color || "#3f4750",
    pins: libraryPins,
    pads,
    silk: input.silk ?? [{ x: 0, y: 0, w: width, h: height }],
    custom: true,
  };
}

function defaultPads(pinCount: number): PcbPad[] {
  if (pinCount <= 2) {
    return [smd("1", -0.95, 0, 1.0, 1.3), smd("2", 0.95, 0, 1.0, 1.3)];
  }
  const perSide = Math.ceil(pinCount / 2);
  const pitch = 2.54;
  const top = ((perSide - 1) * pitch) / 2;
  const out: PcbPad[] = [];
  for (let i = 0; i < pinCount; i += 1) {
    const left = i < perSide;
    const row = left ? i : i - perSide;
    out.push(
      smd(String(i + 1), left ? -4.2 : 4.2, top - row * pitch, 1.6, 1.2),
    );
  }
  return out;
}
