// Print settings: full per-printer-kind profiles (heat, line, spacing,
// tolerance, supports, cooling, speeds) persisted to localStorage.
// 1 scene unit = 1 mm; every value here is slicer-native (mm / deg / mm·min⁻¹).
// The browser hands these values to the Node slicer daemon as a .3mf slice
// configuration; the profile is applied through the params() dict, so any
// value the user edits lands in the gcode.

export type PrinterKind =
  | "octoprint"
  | "moonraker"
  | "prusalink"
  | "bambu"
  | "elegoo"
  | "creality"
  | "anycubic";

export type MaterialKind = "PLA" | "PETG" | "ABS" | "TPU" | "ASA";

export interface TemperatureProfile {
  nozzleC: number;
  nozzleCInitial: number;
  bedC: number;
  bedCInitial: number;
  chamberC: number;
}

export interface LineProfile {
  widthMM: number;
  sparseInfillWidthMM: number;
  firstLayerWidthMM: number;
  initialLayerLineWidthMM: number;
}

export interface LayerProfile {
  heightMM: number;
  initialLayerHeightMM: number;
  top: number;
  bottom: number;
  walls: number;
}

export interface ToleranceProfile {
  /** Shell offset vs nominal feature size, mm. Negative = snug, positive = loose. */
  shellOffsetMM: number;
  /** XY shrinkage compensation on every perimeter, mm. 0 = off. */
  xyCompensationMM: number;
  /** Z scaling, % of model height. 100 = 1:1. */
  zScalingPercent: number;
}

export interface SupportProfile {
  style: "none" | "normal" | "organica" | "tree";
  interfaceLayers: number;
  interfaceLayersAtBridges: number;
  thresholdAngleDEG: number;
  zDistanceMM: number;
}

export interface CoolingProfile {
  partFanMinPercent: number;
  partFanMaxPercent: number;
  partFanMinSpeed: number;
  partFanMaxSpeed: number;
  initialFanSpeed: number;
  initialFanLayers: number;
  disableFirstLayer: boolean;
}

export interface SpeedProfile {
  print: number;
  initialLayer: number;
  travel: number;
  travelWithLift: number;
  minPrintSpeed: number;
}

export interface PrintProfile {
  id: string;
  name: string;
  material: MaterialKind;
  /** Build volume in mm [X, Y]. */
  bedMM: [number, number];
  buildHeightMM: number;
  nozzle: TemperatureProfile;
  bed: TemperatureProfile;
  lines: LineProfile;
  layers: LayerProfile;
  tolerance: ToleranceProfile;
  support: SupportProfile;
  cooling: CoolingProfile;
  speeds: SpeedProfile;
  /** Raw slicer key/value slices appended verbatim to the .3mf config. */
  extraParams: Record<string, string>;
}

interface MaterialBaseline {
  nozzleC: number;
  nozzleCInitial: number;
  bedC: number;
  bedCInitial: number;
  chamberC: number;
  cool: CoolingProfile;
  speeds: SpeedProfile;
}

const MATERIAL_BASELINES: Record<MaterialKind, MaterialBaseline> = {
  PLA: {
    nozzleC: 210,
    nozzleCInitial: 215,
    bedC: 60,
    bedCInitial: 60,
    chamberC: 0,
    cool: {
      partFanMinPercent: 30,
      partFanMaxPercent: 100,
      partFanMinSpeed: 10,
      partFanMaxSpeed: 30,
      initialFanSpeed: 50,
      initialFanLayers: 0,
      disableFirstLayer: false,
    },
    speeds: {
      print: 60,
      initialLayer: 25,
      travel: 120,
      travelWithLift: 60,
      minPrintSpeed: 20,
    },
  },
  PETG: {
    nozzleC: 240,
    nozzleCInitial: 245,
    bedC: 85,
    bedCInitial: 90,
    chamberC: 45,
    cool: {
      partFanMinPercent: 20,
      partFanMaxPercent: 70,
      partFanMinSpeed: 15,
      partFanMaxSpeed: 30,
      initialFanSpeed: 50,
      initialFanLayers: 0,
      disableFirstLayer: false,
    },
    speeds: {
      print: 50,
      initialLayer: 20,
      travel: 120,
      travelWithLift: 60,
      minPrintSpeed: 25,
    },
  },
  ABS: {
    nozzleC: 255,
    nozzleCInitial: 260,
    bedC: 110,
    bedCInitial: 110,
    chamberC: 60,
    cool: {
      partFanMinPercent: 10,
      partFanMaxPercent: 40,
      partFanMinSpeed: 10,
      partFanMaxSpeed: 30,
      initialFanSpeed: 20,
      initialFanLayers: 0,
      disableFirstLayer: true,
    },
    speeds: {
      print: 50,
      initialLayer: 20,
      travel: 100,
      travelWithLift: 50,
      minPrintSpeed: 30,
    },
  },
  TPU: {
    nozzleC: 230,
    nozzleCInitial: 235,
    bedC: 50,
    bedCInitial: 50,
    chamberC: 0,
    cool: {
      partFanMinPercent: 0,
      partFanMaxPercent: 40,
      partFanMinSpeed: 10,
      partFanMaxSpeed: 30,
      initialFanSpeed: 20,
      initialFanLayers: 0,
      disableFirstLayer: true,
    },
    speeds: {
      print: 25,
      initialLayer: 15,
      travel: 100,
      travelWithLift: 50,
      minPrintSpeed: 15,
    },
  },
  ASA: {
    nozzleC: 260,
    nozzleCInitial: 265,
    bedC: 110,
    bedCInitial: 110,
    chamberC: 60,
    cool: {
      partFanMinPercent: 10,
      partFanMaxPercent: 40,
      partFanMinSpeed: 10,
      partFanMaxSpeed: 30,
      initialFanSpeed: 20,
      initialFanLayers: 0,
      disableFirstLayer: true,
    },
    speeds: {
      print: 50,
      initialLayer: 20,
      travel: 100,
      travelWithLift: 50,
      minPrintSpeed: 30,
    },
  },
};

export const BEDS: Record<PrinterKind, [number, number]> = {
  octoprint: [220, 220],
  moonraker: [256, 256],
  prusalink: [250, 210],
  bambu: [256, 256],
  elegoo: [220, 220],
  creality: [220, 220],
  anycubic: [220, 220],
};

export const BUILD_HEIGHTS: Record<PrinterKind, number> = {
  octoprint: 250,
  moonraker: 256,
  prusalink: 210,
  bambu: 256,
  elegoo: 245,
  creality: 240,
  anycubic: 220,
};

export function buildDefaultProfile(
  kind: PrinterKind,
  material: MaterialKind = "PLA",
): PrintProfile {
  const base = MATERIAL_BASELINES[material];
  return {
    id: `${kind}-${material.toLowerCase()}-default`,
    name: `${material} · standard (default)`,
    material,
    bedMM: [BEDS[kind][0], BEDS[kind][1]],
    buildHeightMM: BUILD_HEIGHTS[kind] ?? 250,
    nozzle: {
      nozzleC: base.nozzleC,
      nozzleCInitial: base.nozzleCInitial,
      bedC: base.bedC,
      bedCInitial: base.bedCInitial,
      chamberC: base.chamberC,
    },
    bed: {
      nozzleC: 0,
      nozzleCInitial: 0,
      bedC: base.bedC,
      bedCInitial: base.bedCInitial,
      chamberC: 0,
    },
    lines: {
      widthMM: 0.4,
      sparseInfillWidthMM: 0.42,
      firstLayerWidthMM: 0.42,
      initialLayerLineWidthMM: 0.45,
    },
    layers: {
      heightMM: 0.2,
      initialLayerHeightMM: 0.3,
      top: 3,
      bottom: 3,
      walls: 3,
    },
    tolerance: { shellOffsetMM: 0, xyCompensationMM: 0, zScalingPercent: 100 },
    support: {
      style: "none",
      interfaceLayers: 2,
      interfaceLayersAtBridges: 1,
      thresholdAngleDEG: 45,
      zDistanceMM: 0.2,
    },
    cooling: { ...base.cool },
    speeds: { ...base.speeds },
    extraParams: {},
  };
}

export function buildProfilesForKind(kind: PrinterKind): PrintProfile[] {
  return ["PLA", "PETG", "ABS", "TPU", "ASA"].map((m) =>
    buildDefaultProfile(kind, m as MaterialKind),
  );
}

/** Map a profile onto the slicer params dict (.3mf slice config keys). */
export function profileParams(p: PrintProfile): Record<string, string> {
  return {
    layer_height: p.layers.heightMM.toFixed(3),
    initial_layer_height: p.layers.initialLayerHeightMM.toFixed(3),
    top_layers: String(p.layers.top),
    bottom_layers: String(p.layers.bottom),
    perimeter_count: String(p.layers.walls),
    perimeter_extrusion_width: p.lines.widthMM.toFixed(3),
    infill_extrusion_width: p.lines.sparseInfillWidthMM.toFixed(3),
    first_layer_line_width: p.lines.initialLayerLineWidthMM.toFixed(3),
    first_layer_height: p.layers.initialLayerHeightMM.toFixed(3),
    sparse_infill_below_line_width: (p.lines.widthMM + 0.5).toFixed(3),
    temperature: String(p.nozzle.nozzleC),
    temperature_initial_layer: String(p.nozzle.nozzleCInitial),
    bed_temperature: String(p.bed.bedC),
    bed_temperature_initial_layer: String(p.bed.bedCInitial),
    chamber_temperature: String(p.nozzle.chamberC),
    coolspeed_profile: p.cooling.disableFirstLayer ? "off" : "standard",
    fan_speed_min: String(p.cooling.partFanMinPercent),
    fan_speed_max: String(p.cooling.partFanMaxPercent),
    fan_speed_min_2: String(p.cooling.partFanMinPercent),
    fan_speed_max_2: String(p.cooling.partFanMaxPercent),
    cooling_enable: "1",
    fan_speed_zero_below_min: String(p.cooling.partFanMaxPercent),
    min_print_speed: String(p.speeds.minPrintSpeed),
    default_speed: String(p.speeds.print),
    initial_layer_speed: String(p.speeds.initialLayer),
    travel_speed: String(p.speeds.travel),
    travel_speed_with_lift: String(p.speeds.travelWithLift),
    fix_up_overhangs: "false",
    enable_support:
      p.support.style === "none" ? "false" : `#${p.support.style}`,
    support_type:
      p.support.style === "tree"
        ? "tree"
        : p.support.style === "none"
          ? "none"
          : "normal",
    support_interface_count: String(p.support.interfaceLayers),
    support_interface_height_tooth: String(p.support.interfaceLayers),
    support_adhesion_extrusion_width: p.lines.widthMM.toFixed(3),
    support_threshold_angle: String(p.support.thresholdAngleDEG),
    support_fan_speed_min: String(p.cooling.partFanMinPercent),
    support_fan_speed_max: String(p.cooling.partFanMaxPercent),
    ...(p.extraParams ?? {}),
  };
}

const PROFILE_KEY = "scadgen.printProfiles.v2";

export function loadProfiles(kind: PrinterKind): PrintProfile[] {
  if (typeof localStorage === "undefined") return buildProfilesForKind(kind);
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return buildProfilesForKind(kind);
    const all = JSON.parse(raw) as Record<string, PrintProfile[]>;
    const list = all[kind];
    return list && list.length > 0 ? list : buildProfilesForKind(kind);
  } catch {
    return buildProfilesForKind(kind);
  }
}

export function saveProfiles(
  kind: PrinterKind,
  profiles: PrintProfile[],
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const all: Record<string, PrintProfile[]> = raw
      ? (JSON.parse(raw) as Record<string, PrintProfile[]>)
      : {};
    all[kind] = profiles;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(all));
  } catch {
    /* quota / SSR — fall back to in-memory defaults on next load */
  }
}

export function upsertProfile(
  kind: PrinterKind,
  profile: PrintProfile,
): PrintProfile[] {
  const current = loadProfiles(kind);
  const idx = current.findIndex((p) => p.id === profile.id);
  const next = [...current];
  if (idx >= 0) next[idx] = profile;
  else next.push(profile);
  saveProfiles(kind, next);
  return next;
}

export function removeProfile(kind: PrinterKind, id: string): PrintProfile[] {
  const current = loadProfiles(kind);
  const next = current.filter((p) => p.id !== id);
  saveProfiles(kind, next);
  return next;
}

export function resetProfiles(kind: PrinterKind): PrintProfile[] {
  const next = buildProfilesForKind(kind);
  saveProfiles(kind, next);
  return next;
}

export function cloneProfile(profile: PrintProfile): PrintProfile {
  return JSON.parse(JSON.stringify(profile)) as PrintProfile;
}

export function materialBaseline(material: MaterialKind): MaterialBaseline {
  return MATERIAL_BASELINES[material];
}
