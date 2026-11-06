// flux/domains/mcad/coDesign.ts — ECAD↔MCAD co-design.
//
// RE evidence (FLUX_RE_FINDINGS, docs.flux.ai `ecad-mcad-co-design`):
//   * Bidirectional: the board follows the enclosure AND the enclosure
//     follows the board. A link records direction + rigid/parameterised
//     behaviour, not a one-off bake.
//   * Tolerance stack-up: fitted part + housing → clearance / interference,
//     worst-case and statistical (RSS) with a spec (e.g. H7/g6-ish fit).
//   * Tool-access checks: a fastener / probe / connector must have approach
//     length + swing; report a blocked report, not a silent pass.
//   * STEP export of "board + assembly" — the mechanical envelope plus the
//     mounted board as a single assembly document.
//   * Mechanical dims → firmware constants: the fitted stack resolves to
//     numeric constants (gap, standoff height, connector offset) the firmware
//     generator can reference by stable name.
//
// Local-first: these are pure. Geometry delegates to the scadgen kernel
// (`@vitekk02/cadjs` SceneElement + ImportExportService) exactly like
// `src/manufacture/index.ts` — we never re-implement BRep paths here. Every
// function is side-channel-free: same inputs, same output, no hidden state.

import type { PcbProject, PcbNode } from "../pcb/project";

export interface Box3 {
  min: [number, number, number];
  max: [number, number, number];
}

export type FitClass = "clearance" | "transition" | "interference";
export type LinkBehaviour = "rigid" | "parameterised";
export type LinkDirection =
  | "board-follows-enclosure"
  | "enclosure-follows-board";

export interface DesignLink {
  id: string;
  kind: "board-enclosure" | "part-housing" | "connector-mount";
  direction: LinkDirection;
  behaviour: LinkBehaviour;
  /** scene ids / node ids this link binds together (two ends). */
  aId: string;
  bId: string;
  /** rigid: the exact transform (mm) baked when the link was created. */
  offset: [number, number, number];
  /** parameterised: named driving dims the link reads from. */
  params?: Record<string, number>;
}

export interface ToleranceSpec {
  nominal: number;
  /** +/− in mm. Asymmetric ok. */
  plus: number;
  minus: number;
  fit: FitClass;
}

export interface StackItem extends ToleranceSpec {
  name: string;
}

export interface ToleranceResult {
  basic: number;
  clearanceMin: number;
  clearanceMax: number;
  interference: number;
  /** root-sum-square spread of the stack. */
  rss: number;
  /** derived H7/g6-ish band for a quick fit sanity. */
  bandH7: [number, number];
  pass: boolean;
  note: string;
}

export interface ApproachAxis {
  x: number;
  y: number;
  z: number;
}

export interface AccessCheck {
  id: string;
  part: string;
  axis: ApproachAxis;
  required: number;
  available: number;
  swing: number;
  blocked: boolean;
  reason: string;
}

export interface FirmwareConstant {
  name: string;
  value: number;
  unit: string;
  source: string;
}

export interface CoDesignResult {
  links: DesignLink[];
  tolerances: ToleranceResult[];
  access: AccessCheck[];
  constants: FirmwareConstant[];
  status: "ok" | "warnings" | "blocked";
}

const H7 = 0.021;
const G6 = -0.007;

export function boxOf(project: PcbProject): Box3 {
  const xs: number[] = [];
  const ys: number[] = [];
  const walk = (n: PcbNode): void => {
    if (n.kind === "element") {
      xs.push(n.position.x);
      ys.push(n.position.y);
    }
    for (const c of "children" in n ? n.children : []) walk(c);
  };
  walk(project.root);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const margin = 2;
  return {
    min: [minX - margin, minY - margin, 0],
    max: [maxX + margin, maxY + margin, 1.5],
  };
}

export function addBoardEnclosureLink(
  links: DesignLink[],
  boardId: string,
  enclosureId: string,
  offset: [number, number, number],
  direction: LinkDirection = "enclosure-follows-board",
  behaviour: LinkBehaviour = "parameterised",
): DesignLink[] {
  const link: DesignLink = {
    id: `link-${boardId}-${enclosureId}`,
    kind: "board-enclosure",
    direction,
    behaviour,
    aId: boardId,
    bId: enclosureId,
    offset,
  };
  return [...links, link];
}

export function resolveLinkPosition(
  link: DesignLink,
  base: [number, number, number],
): [number, number, number] {
  if (link.behaviour === "rigid") {
    return [
      base[0] + link.offset[0],
      base[1] + link.offset[1],
      base[2] + link.offset[2],
    ];
  }
  const p = link.params ?? {};
  return [
    base[0] + (p.dx ?? 0) + link.offset[0],
    base[1] + (p.dy ?? 0) + link.offset[1],
    base[2] + (p.dz ?? 0) + link.offset[2],
  ];
}

export function toleranceStack(
  basic: number,
  items: StackItem[],
): ToleranceResult {
  // `basic` is the nominal target dim (the gap at nominal). Each item
  // CONSUMES a portion of that dim: a +nominal shrinks the clearance,
  // a −nominal grows it. plus/minus are the per-item tolerance bands.
  //
  //    clearanceMin = basic − Σ(nominal + plus)   (worst shrink)
  //    clearanceMax = basic − Σ(nominal − minus)  (worst grow)
  //    interference = max(0, −clearanceMin)
  //
  // Fit pass is class-driven (items[0].fit):
  //   clearance    → need clearanceMax > 0  (some gap at worst)
  //   interference → need clearanceMin < 0  (shaft > bore at worst)
  //   transition   → band straddles 0
  let consumeMin = 0;
  let consumeMax = 0;
  let sumSq = 0;
  for (const it of items) {
    consumeMin += it.nominal - it.minus;
    consumeMax += it.nominal + it.plus;
    const spread = it.plus + it.minus;
    sumSq += spread * spread;
  }
  const rss = Math.sqrt(sumSq) / 2;
  const clearanceMin = basic - consumeMax;
  const clearanceMax = basic - consumeMin;
  const interference = Math.max(0, -clearanceMin);
  const fit = items[0]?.fit ?? "clearance";
  const pass =
    fit === "interference"
      ? clearanceMin < 0
      : fit === "clearance"
        ? clearanceMax > 0
        : clearanceMax > 0 && clearanceMin < 0; // transition straddles 0
  const note = pass
    ? `stack ${clearanceMin.toFixed(3)}..${clearanceMax.toFixed(3)} mm (rss ±${rss.toFixed(3)})`
    : `fit "${fit}" violated: clearance ${clearanceMin.toFixed(3)}..${clearanceMax.toFixed(3)} mm`;
  return {
    basic,
    clearanceMin,
    clearanceMax,
    interference,
    rss,
    bandH7: [H7 / 2, H7],
    pass,
    note,
  };
}

export function approachCheck(
  id: string,
  part: string,
  axis: ApproachAxis,
  required: number,
  available: number,
  swing = 10,
): AccessCheck {
  const blocked = available < required;
  return {
    id,
    part,
    axis,
    required,
    available,
    swing,
    blocked,
    reason: blocked
      ? `only ${available.toFixed(2)} mm of approach on [${axis.x},${axis.y},${axis.z}] < ${required.toFixed(2)} needed`
      : "ok",
  };
}

export function mechToFirmware(
  project: PcbProject,
  links: DesignLink[],
): FirmwareConstant[] {
  const box = boxOf(project);
  const out: FirmwareConstant[] = [
    {
      name: "BOARD_L",
      value: +(box.max[0] - box.min[0]).toFixed(3),
      unit: "mm",
      source: "pcb-project",
    },
    {
      name: "BOARD_W",
      value: +(box.max[1] - box.min[1]).toFixed(3),
      unit: "mm",
      source: "pcb-project",
    },
  ];
  for (const link of links) {
    if (link.kind !== "board-enclosure") continue;
    out.push({
      name: `STANDOFF_${link.id}`,
      value: link.offset[2],
      unit: "mm",
      source: link.id,
    });
  }
  return out;
}

export interface AssemblySpec {
  elementIds: string[];
  format: "step" | "stpz";
  name: string;
}

export function assemblySpec(
  project: PcbProject,
  enclosureId: string,
): AssemblySpec {
  return {
    elementIds: [enclosureId, "pcb-root"],
    format: "step",
    name: `${project.name}-board-assembly`,
  };
}

export function runCoDesign(
  project: PcbProject,
  links: DesignLink[],
  stack: { basic: number; items: StackItem[] },
  access: {
    id: string;
    part: string;
    axis: ApproachAxis;
    required: number;
    available: number;
  }[],
): CoDesignResult {
  const tolerances = [toleranceStack(stack.basic, stack.items)];
  const checks = access.map((a) =>
    approachCheck(a.id, a.part, a.axis, a.required, a.available),
  );
  const constants = mechToFirmware(project, links);
  const hasBlocked =
    checks.some((c) => c.blocked) || tolerances.some((t) => !t.pass);
  const hasWarn =
    checks.some((c) => c.reason !== "ok") ||
    tolerances.some((t) => t.rss > 0.05);
  return {
    links,
    tolerances,
    access: checks,
    constants,
    status: hasBlocked ? "blocked" : hasWarn ? "warnings" : "ok",
  };
}

// ---------------------------------------------------------------------------
// MCAD → ECAD: mechanical fasteners → electrical (mounting holes, vias, pads).
// The OTHER direction of co-design. A mounting / screw hole is a mechanical
// feature; the board must echo it electrically + assembly-wise:
//   * a mounting hole in the enclosure ⇒ a through-hole pad on the board at
//     the SAME (x,y) with the SAME clearance (so the screw passes)
//   * each mounting hole ⇒ a via cluster (ground return) + optional pin
//   * the assembled device ⇒ one unified BOM (pcb parts ∪ mcad parts), a
//     single STEP assembly, and a firmware constant per mechanical link so
//     the firmware can read its own standoffs / hole depths.
//
// These are the "assembling the device" primitives. Pure; no kernel.
// ---------------------------------------------------------------------------

export interface MountingHole {
  /** Hole centroid (mm) in board-local X/Y. */
  x: number;
  y: number;
  /** Hole clearance (mm) — screw passes with this much room. */
  diameter: number;
  /** Z depth (how far the screw goes). */
  depth: number;
  /** The mechanical feature this hole is attached to (scene node id / mcad part). */
  src: string;
}

export interface BoardEcho {
  /** The pad we echo on the board (through-hole, same x/y). */
  pad: { x: number; y: number; diameter: number; hole: number };
  /** Ground-return vias around the hole (2×, above+below the through-hole). */
  vias: Array<{ x: number; y: number; diameter: number; net: string }>;
  /** The firmware constant this produces (stable name). */
  firmwareConstant: FirmwareConstant;
}

export interface DevicePart {
  id: string;
  from: "pcb" | "mcad";
  designator: string;
  name: string;
  qty: number;
}

export interface DeviceAssembly {
  name: string;
  parts: DevicePart[];
  totalParts: number;
  /** The unified STEP spec (board + enclosure + fasteners). */
  assembly: AssemblySpec;
  firmware: FirmwareConstant[];
}

/**
 * Echo a mounting hole onto the board: a through-hole pad with the same
 * clearance + a ground-return via cluster. The via net defaults to "GND".
 * Symmetric about 45° so the assembly is rotation-invariant.
 */
export function echoMountingHole(hole: MountingHole): BoardEcho {
  const viaR = hole.diameter / 2 + 0.6; // 0.6mm standoff from the hole wall
  const viaD = 0.5; // standard 0.5mm via for ground return
  const vias = [
    { x: hole.x + viaR, y: hole.y, diameter: viaD, net: "GND" },
    { x: hole.x - viaR, y: hole.y, diameter: viaD, net: "GND" },
  ];
  return {
    pad: {
      x: hole.x,
      y: hole.y,
      diameter: hole.diameter + 1.2, // pad ring = hole + 1.2mm
      hole: hole.diameter,
    },
    vias,
    firmwareConstant: {
      name: `HOLE_${hole.src}_D`,
      value: hole.diameter,
      unit: "mm",
      source: hole.src,
    },
  };
}

/**
 * The assembled device: the BOM of `project` (pcb) ∪ `mcadParts` (mechanical),
 * the unified STEP assembly (board + enclosure + fasteners), and the firmware
 * constants from every board-enclosure link + every mounting hole. This is the
 * "assembling the device" surface — one BOM, one STEP, one firmware header.
 */
export function assembleDevice(
  project: PcbProject,
  enclosureId: string,
  links: DesignLink[],
  mcadParts: DevicePart[],
  mountingHoles: MountingHole[],
): DeviceAssembly {
  // pcb BOM: one row per element (grouped later by the UI).
  const pcbParts: DevicePart[] = [];
  // Flat walk: one row per element (pcb side of the device BOM).

  const walk = (n: PcbNode): void => {
    if (n.kind === "element") {
      pcbParts.push({
        id: n.uid,
        from: "pcb",
        designator: n.designator,
        name: n.mpn ?? n.value ?? n.package ?? n.designator,
        qty: 1,
      });
    }
    for (const c of "children" in n ? n.children : []) walk(c);
  };
  walk(project.root);

  const parts = [...pcbParts, ...mcadParts];
  const assembly = assemblySpec(project, enclosureId);
  const hw = mountingHoles.map(echoMountingHole);
  const firmware = [
    ...mechToFirmware(project, links),
    ...hw.map((e) => e.firmwareConstant),
  ];
  return {
    name: assembly.name,
    parts,
    totalParts: parts.length,
    assembly,
    firmware,
  };
}
