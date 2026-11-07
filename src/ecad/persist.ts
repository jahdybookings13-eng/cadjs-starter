// ecad/persist.ts — the serializable shape of the ECAD scene.
//
// Saving firmware alone is not enough: board *instance ids* are the key both
// wires and firmware use, and those ids are generated per session (b1, b2, …).
// So the thing that persists is the whole scene — parts, wires and the exact
// firmware text deployed to each board — and restoring it re-creates the ids.
//
// Stored in ProjectDoc.design.ecad (and the legacy document blob). Versioned:
// a snapshot from a future version is ignored rather than half-loaded.

import type { EcadPart } from "./catalog";

export const ECAD_SNAPSHOT_VERSION = 1 as const;

export interface EcadSnapshotInstance {
  id: string;
  partId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  /** Only for parts that are not in the catalog (accurate-size inline parts). */
  inlinePart?: EcadPart;
  /** Tuned RF channel in MHz, for parts that carry a radio. */
  radio?: number;
}

export interface EcadSnapshotWire {
  from: { inst: string; pin: string };
  to: { inst: string; pin: string };
}

export interface EcadSnapshotFirmware {
  inst: string;
  /** Registry id when the firmware came from the catalog, else "custom". */
  firmwareId: string | null;
  /** binary = attached image; rp2040/stm32f4/esp32 = runs on the in-app core. */
  tier: "virtual" | "hex" | "binary" | "rp2040" | "stm32f4" | "esp32" | null;
  /** The exact deployed text: ScadGen JS source, Intel HEX, or a data: URL. */
  source: string;
  title?: string;
}

export interface EcadSnapshot {
  v: typeof ECAD_SNAPSHOT_VERSION;
  savedAt: number;
  instances: EcadSnapshotInstance[];
  wires: EcadSnapshotWire[];
  firmware: EcadSnapshotFirmware[];
}

/** Guard for anything read back from storage, a file, or a peer's doc. */
export function isEcadSnapshot(value: unknown): value is EcadSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<EcadSnapshot>;
  return (
    s.v === ECAD_SNAPSHOT_VERSION &&
    Array.isArray(s.instances) &&
    Array.isArray(s.wires) &&
    Array.isArray(s.firmware)
  );
}
