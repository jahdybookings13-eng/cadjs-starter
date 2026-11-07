import type { EcadLayer } from "./scene.js";

/**
 * 1:1 LAW — the VR world is real-world scale, in meters. Nothing is scaled
 * up or down to "look right": a 100mm board is a 0.1m board you can hold in a
 * palm, a 5m room is a room you stand in. This file is the law, made checkable:
 * it is dependency-free (no THREE runtime, no RAPIER) so the e2e suite can
 * import and enforce it without allocating the physics world.
 */

/** Millimeters per meter. */
export const MM_PER_M = 1000;
/** Millimeters -> scene meters. The single scale conversion. */
export const mmToM = (mm: number): number => mm / MM_PER_M;
/** Scene meters -> millimeters (for reporting / sim write-back). */
export const mToMm = (m: number): number => m * MM_PER_M;

/** A physically-plausible object spans 0.2mm (a micro-LED) to ~5m (a large part). */
export const PHYSICAL_MIN_M = 0.0002;
export const PHYSICAL_MAX_M = 5;

/** Is a world length (meters) a plausible physical object size? */
export function isPhysicalSizeM(meters: number): boolean {
  const m = Math.abs(meters);
  return m >= PHYSICAL_MIN_M && m <= PHYSICAL_MAX_M;
}

/** FR4 fiberglass / copper laminate density (kg/m^3) — real weight. */
export const FR4_DENSITY_KG_M3 = 1850;

/** Real world mass (kg) of a board from its mm size (volume * density). */
export function boardMassKg(wMm: number, hMm: number, tMm: number): number {
  const volM3 = mmToM(wMm) * mmToM(hMm) * mmToM(tMm);
  return volM3 * FR4_DENSITY_KG_M3;
}

export interface OneToOneOffender {
  id: string;
  /** Offending extents in meters. */
  meters: number[];
}

/** A 1:1 violation: these objects are not real-world scale. */
export class OneToOneScaleError extends Error {
  constructor(readonly offenders: OneToOneOffender[]) {
    const list = offenders
      .map(
        (o) =>
          `${o.id} [${o.meters.map((v) => v.toFixed(3) + "m").join(", ")}]`,
      )
      .join("; ");
    super(`1:1 violation — non-physical sizes: ${list}`);
    this.name = "OneToOneScaleError";
  }
}

/**
 * Walk every ECAD board and assert its size is physically plausible (0.2mm…5m).
 * Throws OneToOneScaleError with the offenders. This is the nag: call it in VR
 * (a HUD tick) and in the e2e suite (enforcement). It enforces 1:1 for
 * EVERYTHING — the boards are the objects; the guard rejects any object whose
 * size escaped the real scale (a scaling/small-enlarge bug).
 */
export function assertOneToOneScale(layer: EcadLayer): void {
  const offenders: OneToOneOffender[] = [];
  for (const [instId] of layer.sim.instances) {
    const m = layer.meters(instId);
    if (!m) continue;
    if (![m.w, m.h, m.t].every(isPhysicalSizeM))
      offenders.push({ id: instId, meters: [m.w, m.h, m.t] });
  }
  if (offenders.length) throw new OneToOneScaleError(offenders);
}
