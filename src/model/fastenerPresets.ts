// src/model/fastenerPresets.ts
//
// Fastener preset library: a catalog of (family × size × head × tip) presets
// where each preset is a single, named, validated `FastenerSpec` that
// composes into one feature-tree node.
//
// The model is intentionally simple and fully driven by:
//   - threadStandards  (size/pitch/majorD/mode per ISO / ASME B1.1 / NPT)
//   - headShapes       (profile geometry per head shape / tip style)
//   - CLEARANCE_FITS   (ISO 273 fits)
//
// Adding a new preset = adding a row to FASTENER_FAMILIES.

import {
  type ThreadStandard,
  THREAD_SIZES,
  CLEARANCE_FITS,
  clearanceOf,
} from "./threadStandards";
import {
  headShapeIds,
  tipStyleIds,
  type HeadShapeId,
  type TipStyle,
} from "./headShapes";

// ---------------------------------------------------------------------------
// Core model
// ---------------------------------------------------------------------------

export type FastenerFamily =
  | "bolt"
  | "stud"
  | "machineScrew"
  | "selfTap"
  | "selfDrill"
  | "woodScrew"
  | "cskScrew"
  | "tNut"
  | "wingNut"
  | "eyeBolt"
  | "screwHole";

export interface FastenerSpec {
  id: string; // unique preset id, e.g. "hex-bolt-iso-m6"
  family: FastenerFamily;
  standard: ThreadStandard;
  size: string;
  mode: "coarse" | "fine";
  head: HeadShapeId;
  tip: TipStyle;
  /** Total shank/tip length in meters (the part that enters material). */
  length: number;
  /** ISO 273 fit id (see CLEARANCE_FITS) for screwHole / clearance bores. */
  clearance?: string;
  /** Thread engagement (1 for single, 2, 3 for multi). */
  engagement?: number;
  label: string;
}

export interface FamilyPreset {
  id: string; // family id
  label: string;
  familiesForStandard: Record<ThreadStandard, FastenerFamily>;
  defaultStandard: ThreadStandard;
  defaultMode: "coarse" | "fine";
  defaultHead: HeadShapeId;
  defaultTip: TipStyle;
  defaultLength: number;
  defaultClearance?: string;
  description: string;
}

export const FASTENER_FAMILIES: FamilyPreset[] = [
  {
    id: "hex-bolt",
    label: "Hex bolt (ISO 4014)",
    defaultStandard: "iso",
    defaultMode: "coarse",
    defaultHead: "hex",
    defaultTip: "threaded",
    defaultLength: 0.02,
    description: "External hex head, fully threaded.",
    familiesForStandard: {
      iso: "bolt",
      unified: "bolt",
      npt: "bolt",
    },
  },
  {
    id: "stud",
    label: "Stud (ISO 7414)",
    defaultStandard: "iso",
    defaultMode: "coarse",
    defaultHead: "none",
    defaultTip: "threaded",
    defaultLength: 0.03,
    description: "Plain cylindric shank with external threads, no head.",
    familiesForStandard: {
      iso: "stud",
      unified: "stud",
      npt: "stud",
    },
  },
  {
    id: "machine-screw",
    label: "Machine screw",
    defaultStandard: "iso",
    defaultMode: "coarse",
    defaultHead: "socketHex",
    defaultTip: "threaded",
    defaultLength: 0.015,
    description: "Headed external thread (socket- or pan-).",
    familiesForStandard: {
      iso: "machineScrew",
      unified: "machineScrew",
      npt: "machineScrew",
    },
  },
  {
    id: "self-tap",
    label: "Self-tap screw (HSS tap)",
    defaultStandard: "unified",
    defaultMode: "fine",
    defaultHead: "hex",
    defaultTip: "partialThread",
    defaultLength: 0.02,
    description:
      "Taps its own threads on process; pointed tip with partial thread.",
    familiesForStandard: {
      iso: "selfTap",
      unified: "selfTap",
      npt: "selfTap",
    },
  },
  {
    id: "self-drill",
    label: "Self-drill (Tek) screw",
    defaultStandard: "unified",
    defaultMode: "fine",
    defaultHead: "pan",
    defaultTip: "pointed",
    defaultLength: 0.015,
    description: "Drills + taps in one pass; sharp 14° point.",
    familiesForStandard: {
      iso: "selfDrill",
      unified: "selfDrill",
      npt: "selfDrill",
    },
  },
  {
    id: "wood-screw",
    label: "Wood screw",
    defaultStandard: "unified",
    defaultMode: "coarse",
    defaultHead: "pan",
    defaultTip: "pointed",
    defaultLength: 0.03,
    description: "Coarse wood thread + pointed tip; head sinks into the wood.",
    familiesForStandard: {
      iso: "woodScrew",
      unified: "woodScrew",
      npt: "woodScrew",
    },
  },
  {
    id: "csk-screw",
    label: "Countersunk (CSK) machine screw",
    defaultStandard: "iso",
    defaultMode: "coarse",
    defaultHead: "countersunk",
    defaultTip: "threaded",
    defaultLength: 0.015,
    description: "82° countersunk head, flush with the surface.",
    familiesForStandard: {
      iso: "cskScrew",
      unified: "cskScrew",
      npt: "cskScrew",
    },
  },
  {
    id: "t-nut",
    label: "T-nut (internal 60°)",
    defaultStandard: "iso",
    defaultMode: "coarse",
    defaultHead: "tNut",
    defaultTip: "none",
    defaultLength: 0.005,
    description: "Internal thread; threaded hole for a mating bolt.",
    familiesForStandard: {
      iso: "tNut",
      unified: "tNut",
      npt: "tNut",
    },
  },
  {
    id: "wing-nut",
    label: "Wing nut (DIN 315)",
    defaultStandard: "unified",
    defaultMode: "coarse",
    defaultHead: "wing",
    defaultTip: "none",
    defaultLength: 0.005,
    description: "Internal thread with hand-turning wings.",
    familiesForStandard: {
      iso: "wingNut",
      unified: "wingNut",
      npt: "wingNut",
    },
  },
  {
    id: "eye-bolt",
    label: "Eye bolt (DIN 580)",
    defaultStandard: "unified",
    defaultMode: "coarse",
    defaultHead: "round",
    defaultTip: "none",
    defaultLength: 0.01,
    description: "Round eye head; internal thread.",
    familiesForStandard: {
      iso: "eyeBolt",
      unified: "eyeBolt",
      npt: "eyeBolt",
    },
  },
  {
    id: "screw-hole",
    label: "Screw hole (ISO 273 fit)",
    defaultStandard: "iso",
    defaultMode: "coarse",
    defaultHead: "none",
    defaultTip: "none",
    defaultLength: 0.02,
    defaultClearance: "none",
    description:
      "Hole slot: raw bore / clearance (m1-m4) / tapped hole. No thread op unless 'tapped'.",
    familiesForStandard: {
      iso: "screwHole",
      unified: "screwHole",
      npt: "screwHole",
    },
  },
];

// ---------------------------------------------------------------------------
// Preset index + resolution
// ---------------------------------------------------------------------------

/**
 * Generate the canonical preset for (family, standard, size, head, tip).
 * Returns null if any element is invalid for that family/standard combination.
 */
export function buildPresetId(
  raw: Pick<FastenerSpec, "family" | "standard" | "size" | "head" | "tip">,
): string | null {
  const { family, standard, size, head, tip } = raw;
  if (!family) return null;
  // size must be valid
  const set = THREAD_SIZES[standard];
  if (!set) return null;
  const validSizes = [...set.coarse, ...set.fine];
  if (!validSizes.includes(size)) return null;
  if (!headShapeIds.includes(head)) return null;
  if (!tipStyleIds.includes(tip)) return null;
  // family-specific rules
  switch (family) {
    case "bolt":
    case "machineScrew":
    case "cskScrew":
      if (tip === "partialThread") return null; // fully threaded by definition
      break;
    case "stud":
      if (head !== "none") return null; // studs have no head
      if (tip !== "threaded") return null;
      break;
    case "selfTap":
      if (tip !== "partialThread" && tip !== "pointed") return null;
      break;
    case "selfDrill":
      if (tip !== "pointed") return null;
      break;
    case "woodScrew":
      if (tip !== "pointed") return null;
      break;
    case "tNut":
    case "wingNut":
    case "eyeBolt":
      if (tip !== "none") return null;
      break;
    case "screwHole":
      if (head !== "none" || tip !== "none") return null;
      break;
  }
  return `${head}-${family}-${standard}-${size}`.toLowerCase();
}

/**
 * Resolve a FastenerSpec from a raw (family, standard, size, head, tip,
 * [clearance, length, engagement]) tuple. Throws on invalid sizes so the UI
 * can surface a clear error ("unknown 'M7' size for 'unified'").
 */
export function resolvePreset(
  raw: Omit<FastenerSpec, "id" | "label" | "family"> & {
    family: FastenerFamily;
  },
): FastenerSpec {
  const sizes = THREAD_SIZES[raw.standard];
  if (!sizes) throw new Error(`fastener: unknown standard "${raw.standard}"`);
  if (!sizes.coarse.includes(raw.size) && !sizes.fine.includes(raw.size)) {
    throw new Error(
      `fastener: "${raw.size}" is not a valid ${raw.standard} size. ` +
        `Pick one of: ${[...sizes.coarse, ...sizes.fine].join(", ")}`,
    );
  }
  const cid = raw.clearance;
  if (cid && !clearanceOf(cid)) {
    throw new Error(
      `fastener: clearance "${cid}" not in ISO 273 fits. ` +
        `Pick one of: ${CLEARANCE_FITS.map((f) => f.id).join(", ")}`,
    );
  }
  const id =
    buildPresetId({
      family: raw.family,
      standard: raw.standard,
      size: raw.size,
      head: raw.head,
      tip: raw.tip,
    }) ?? `${raw.family}-${raw.standard}-${raw.size}-${raw.head}-${raw.tip}`;
  const spec: FastenerSpec = {
    id,
    family: raw.family,
    standard: raw.standard,
    size: raw.size,
    mode: raw.mode,
    head: raw.head,
    tip: raw.tip,
    length: raw.length,
    engagement: raw.engagement ?? 1,
    label: labelFor(raw) + (cid ? ` · ${clearanceOf(cid)?.label ?? cid}` : ""),
  };
  if (cid) spec.clearance = cid;
  return spec;
}

function labelFor(r: {
  family: FastenerFamily;
  standard: ThreadStandard;
  size: string;
  head: HeadShapeId;
  tip: TipStyle;
  mode: "coarse" | "fine";
}): string {
  const fam = FAMILY_LABELS[r.family];
  const std = r.standard;
  const size = r.size;
  const m = r.mode === "fine" ? " (fine)" : "";
  const hd = r.head === "none" ? "" : ` [${labelShape(r.head)}]`;
  const tp = r.tip === "none" ? "" : ` ${labelTip(r.tip)}`;
  return `${fam} ${std === "iso" ? size : size}${m}${hd}${tp}`.trim();
}

function labelShape(h: HeadShapeId): string {
  return {
    hex: "hex",
    socketHex: "socket hex",
    pan: "pan",
    countersunk: "CSK 82°",
    countersink: "CSK 90°",
    square: "square",
    oval: "oval",
    round: "round",
    button: "button",
    cheese: "cheese",
    tNut: "T-nut",
    wing: "wing",
    none: "",
  }[h];
}
function labelTip(t: TipStyle): string {
  return {
    threaded: "",
    partialThread: "part. thread",
    pointed: "pointed",
    flat: "flat",
    countersunk: "CSK end",
    none: "",
  }[t];
}

const FAMILY_LABELS: Record<FastenerFamily, string> = {
  bolt: "hex-bolt",
  stud: "stud",
  machineScrew: "machine screw",
  selfTap: "self-tap",
  selfDrill: "self-drill",
  woodScrew: "wood screw",
  cskScrew: "CSK screw",
  tNut: "T-nut",
  wingNut: "wing nut",
  eyeBolt: "eye bolt",
  screwHole: "screw hole",
};

// ---------------------------------------------------------------------------
// Validation: list every valid preset for a fastener.
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  validSizes: string[]; // sizes for the chosen standard
}

export function validateFastener(
  family: FastenerFamily,
  standard: ThreadStandard,
  size: string,
  head: HeadShapeId,
  tip: TipStyle,
): ValidationResult {
  const errors: string[] = [];
  const sizes = THREAD_SIZES[standard];
  const validSizes = sizes ? [...sizes.coarse, ...sizes.fine] : [];
  if (!sizes) errors.push(`unknown standard "${standard}"`);
  else if (!sizes.coarse.includes(size) && !sizes.fine.includes(size))
    errors.push(
      `size "${size}" not in ${standard}; pick from: ${validSizes.join(", ")}`,
    );
  if (!headShapeIds.includes(head))
    errors.push(`head "${head}" not in: ${headShapeIds.join(", ")}`);
  if (!tipStyleIds.includes(tip))
    errors.push(`tip "${tip}" not in: ${tipStyleIds.join(", ")}`);
  // family rules
  if (family === "stud" && head !== "none")
    errors.push("stud: head must be 'none'");
  if (family === "stud" && tip !== "threaded")
    errors.push("stud: tip must be 'threaded'");
  if (family === "screwHole" && (head !== "none" || tip !== "none"))
    errors.push("screwHole: head and tip must be 'none' (use a hole + thread)");
  if (
    (family === "tNut" || family === "wingNut" || family === "eyeBolt") &&
    tip !== "none"
  ) {
    errors.push(`${family}: tip must be 'none' (it's an internal thread)`);
  }
  return { ok: errors.length === 0, errors, validSizes };
}
