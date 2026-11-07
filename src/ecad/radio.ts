// ecad/radio.ts — in-world RF: a spatial, channelised link between placed
// transmitter and receiver parts. Pure maths + types; `sim.ts` owns the
// instances, wiring and pin state, so the whole medium runs in node tests.
//
// This is the physical layer, not Wi-Fi: an OOK transmitter keys its DATA pin
// and every receiver on the same channel reproduces those edges on OUT.
// Framing, addressing, retries, association — a hand-built "router" — is
// firmware's job, which is what makes a device testable here.
//
// Link budget: free-space path loss plus the parts' own loss (antenna,
// enclosure, matching), compared against receiver sensitivity:
//
//   RSSI(dBm) = P_tx - 20log10(d_m) - 20log10(f_MHz) + 27.55 - loss_tx - loss_rx
//
// The stock pair (10 dBm, 25 dB each end, -95 dBm sensitivity) reaches ~31 m,
// so desk-to-across-the-room links and a long throw does not.

import type { EcadPart, RadioCapability } from "./catalog";
import { MM_PER_M } from "./oneToOne";

export interface RadioPosition {
  x: number;
  y: number;
  z: number;
}

export interface RadioTransmitter {
  id: string;
  /** Centre frequency in MHz. */
  mhz: number;
  powerDbm: number;
  lossDb?: number | undefined;
  position: RadioPosition;
}

export interface RadioReceiver {
  id: string;
  mhz: number;
  sensitivityDbm: number;
  lossDb?: number | undefined;
  position: RadioPosition;
}

export interface RadioDelivery {
  rx: string;
  level: 0 | 1;
  meters: number;
  /** Modelled received power at the receiver. */
  dbm: number;
}

/** One over-the-air edge, kept for the readout, the AI and tests. */
export interface RadioFrame {
  /** Sim clock, ms. */
  at: number;
  tx: string;
  rx: string;
  level: 0 | 1;
  meters: number;
  dbm: number;
}

/** Channels match within 5 kHz, so 433.92 typed by hand always matches. */
export function channelMatches(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.005;
}

/** The radio capability of a placed part, or null when it has no radio. */
export function radioOf(part: EcadPart | undefined): RadioCapability | null {
  return part?.category === "peripheral" && part.radio ? part.radio : null;
}

/** Straight-line distance in metres (instance positions are millimetres). */
export function distanceMeters(a: RadioPosition, b: RadioPosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) / MM_PER_M;
}

/** Free-space path loss in dB at `meters` for `mhz`. */
export function pathLossDb(meters: number, mhz: number): number {
  return 20 * Math.log10(Math.max(0.05, meters)) + 20 * Math.log10(mhz) - 27.55;
}

/** Modelled received power (dBm) at `meters` from the transmitter. */
export function receivedDbm(
  tx: { powerDbm: number; lossDb?: number | undefined },
  rx: { lossDb?: number | undefined },
  mhz: number,
  meters: number,
): number {
  return (
    tx.powerDbm - pathLossDb(meters, mhz) - (tx.lossDb ?? 0) - (rx.lossDb ?? 0)
  );
}

/** Farthest distance (metres) at which `rx` still hears `tx` on `mhz`. */
export function reachMeters(
  tx: { powerDbm: number; lossDb?: number | undefined },
  rx: { sensitivityDbm: number; lossDb?: number | undefined },
  mhz: number,
): number {
  const budget =
    tx.powerDbm -
    (tx.lossDb ?? 0) -
    (rx.lossDb ?? 0) -
    rx.sensitivityDbm +
    27.55 -
    20 * Math.log10(mhz);
  return Math.pow(10, budget / 20);
}

/** The receivers that hear one keyed edge: same channel, in range. */
export function deliverEdge(
  tx: RadioTransmitter,
  receivers: Iterable<RadioReceiver>,
  level: 0 | 1,
): RadioDelivery[] {
  const out: RadioDelivery[] = [];
  for (const rx of receivers) {
    if (rx.id === tx.id) continue;
    if (!channelMatches(tx.mhz, rx.mhz)) continue;
    const meters = distanceMeters(tx.position, rx.position);
    const dbm = receivedDbm(tx, rx, tx.mhz, meters);
    if (dbm < rx.sensitivityDbm) continue;
    out.push({ rx: rx.id, level, meters, dbm });
  }
  return out;
}
