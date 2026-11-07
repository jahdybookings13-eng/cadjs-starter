// src/ecad/circuitPip.ts — the live top-down circuit card for a board.
//
// Pure data + canvas paint: no THREE, no DOM. The VR component
// (components/vr/vrCircuitPip.ts) turns the snapshot into a floating texture;
// the desk can draw the same thing later. Everything comes from EcadSim, so
// the card is the circuit that is actually wired — pads, wires, live drive,
// serial — not a picture of the catalog entry.
//
// Coordinates: board-local millimetres, top-down. x is the model's x; y is the
// model's z (both mapped straight through), so the card matches what you see
// looking down at the board in the room.

import { type BoardPart, type EcadPart } from "./catalog";
import type { EcadSim } from "./sim";

export interface PipPin {
  name: string;
  /** Board-local mm (top-down). */
  x: number;
  y: number;
  /** Pin is being driven high / pwm / servo / tone right now. */
  hot: boolean;
  /** A wire leaves this pin. */
  wired: boolean;
}

export interface PipHeader {
  label: string;
  edge: "top" | "bottom" | "left" | "right";
  pins: PipPin[];
}

export interface PipModule {
  instId: string;
  label: string;
  kind: EcadPart["category"];
  /** Live state line ("LED 100%", "servo 90°", "ssd1306 128×64"). */
  state: string;
  lit: boolean;
  /** Margin anchor in board-local mm (right of the board). */
  x: number;
  y: number;
}

export interface PipWire {
  from: { x: number; y: number; name: string };
  to: { x: number; y: number; name: string };
  live: boolean;
}

export interface CircuitPipSnapshot {
  instId: string;
  title: string;
  subtitle: string;
  board: { w: number; h: number };
  chips: { name: string; x: number; y: number; w: number; h: number }[];
  headers: PipHeader[];
  modules: PipModule[];
  wires: PipWire[];
  /** Last non-empty serial line, or null. */
  serial: string | null;
  running: boolean;
}

/** Board-local mm position of every pin, from the catalog's header geometry. */
function pinPositions(part: BoardPart): Map<string, { x: number; y: number }> {
  const { w, h } = part.size;
  const out = new Map<string, { x: number; y: number }>();
  for (const header of part.headers) {
    const inset = 1 + header.pitch / 2;
    header.pins.forEach((pin, i) => {
      // `start` is mm along the edge from its negative end.
      const along = -h / 2 + header.start + i * header.pitch;
      let x = 0;
      let y = 0;
      if (header.edge === "left") {
        x = -w / 2 + inset;
        y = along;
      } else if (header.edge === "right") {
        x = w / 2 - inset;
        y = along;
      } else if (header.edge === "top") {
        x = -w / 2 + header.start + i * header.pitch;
        y = h / 2 - inset;
      } else {
        x = -w / 2 + header.start + i * header.pitch;
        y = -h / 2 + inset;
      }
      out.set(pin.name, { x, y });
    });
  }
  return out;
}

function moduleState(
  sim: EcadSim,
  part: EcadPart,
  instId: string,
): { text: string; lit: boolean } {
  if (part.category === "peripheral") {
    switch (part.kind) {
      case "led":
      case "rgbled": {
        const level = sim.ledLevel(instId);
        return { text: `LED ${Math.round(level * 100)}%`, lit: level > 0.02 };
      }
      case "servo": {
        const angle = sim.servoAngle(instId);
        return { text: `servo ${angle.toFixed(0)}°`, lit: angle > 0 };
      }
      case "buzzer": {
        const tone = sim.buzzerTone(instId);
        return {
          text: tone ? `buzz ${Math.round(tone)}Hz` : "buzz —",
          lit: tone !== null,
        };
      }
      case "button":
        return { text: "button", lit: false };
      default:
        return { text: "pot", lit: false };
    }
  }
  if (part.category === "display")
    return {
      text: `${part.driver} ${part.res.w}×${part.res.h}`,
      lit: true,
    };
  return { text: part.name, lit: false };
}

/**
 * Build the card for a placed board, or null when the instance isn't a board.
 * Safe to call every few frames: it only walks this board's own wires/pins.
 */
export function circuitPipSnapshot(
  sim: EcadSim,
  boardInst: string,
): CircuitPipSnapshot | null {
  const part = sim.partOf(boardInst);
  if (!part || part.category !== "board") return null;
  const board = part as BoardPart;
  const pins = pinPositions(board);
  const status = sim.status(boardInst);

  const headers: PipHeader[] = board.headers.map((header) => ({
    label: header.label,
    edge: header.edge,
    pins: header.pins.map((pin) => {
      const drive = sim.pinDrive(boardInst, pin.name);
      const pos = pins.get(pin.name) ?? { x: 0, y: 0 };
      return {
        name: pin.name,
        x: pos.x,
        y: pos.y,
        hot:
          drive.digital === 1 ||
          drive.pwm > 0 ||
          drive.servo > 0 ||
          drive.tone !== null,
        wired: sim.peerOf(boardInst, pin.name) !== null,
      };
    }),
  }));

  // Modules: every part wired to this board, stacked down the right margin.
  const peers = new Map<string, string[]>();
  for (const wire of sim.wiresFor(boardInst)) {
    const mine = wire.from.inst === boardInst ? wire.from : wire.to;
    const other = wire.from.inst === boardInst ? wire.to : wire.from;
    const list = peers.get(other.inst) ?? [];
    list.push(mine.pin);
    peers.set(other.inst, list);
  }

  const modules: PipModule[] = [];
  let i = 0;
  for (const instId of peers.keys()) {
    const peerPart = sim.partOf(instId);
    if (!peerPart) continue;
    const state = moduleState(sim, peerPart, instId);
    modules.push({
      instId,
      label: peerPart.name,
      kind: peerPart.category,
      state: state.text,
      lit: state.lit,
      x: board.size.w / 2 + 22,
      y:
        -board.size.h / 2 +
        ((i + 0.5) * board.size.h) / Math.max(1, peers.size),
    });
    i += 1;
  }
  const moduleAt = new Map(modules.map((m) => [m.instId, m]));

  const wires: PipWire[] = [];
  for (const wire of sim.wiresFor(boardInst)) {
    const mine = wire.from.inst === boardInst ? wire.from : wire.to;
    const other = wire.from.inst === boardInst ? wire.to : wire.from;
    const from = pins.get(mine.pin);
    const mod = moduleAt.get(other.inst);
    if (!from || !mod) continue;
    const drive = sim.pinDrive(boardInst, mine.pin);
    wires.push({
      from: { x: from.x, y: from.y, name: mine.pin },
      to: { x: mod.x, y: mod.y, name: other.pin },
      live: drive.digital === 1 || drive.pwm > 0,
    });
  }

  const serialLines = sim.serial(boardInst).filter((line) => line.length > 0);
  const last = serialLines.length ? serialLines[serialLines.length - 1]! : null;

  return {
    instId: boardInst,
    title: board.name,
    subtitle: `${board.size.w.toFixed(0)}×${board.size.h.toFixed(0)} mm · ${
      status.tier ?? "no firmware"
    }${status.running ? " · running" : ""}`,
    board: { w: board.size.w, h: board.size.h },
    chips: board.chips.map((chip) => ({ ...chip })),
    headers,
    modules,
    wires,
    serial: last ? last.slice(0, 48) : null,
    running: status.running,
  };
}

/* ------------------------------------------------------------------------- */
/* Paint                                                                      */
/* ------------------------------------------------------------------------- */

const BG = "#0b0e14";
const BOARD = "#14532d";
const BOARD_EDGE = "#2f7d4f";
const CHIP = "#0f172a";
const PAD = "#94a3b8";
const PAD_LIVE = "#fbbf24";
const PAD_IDLE = "#475569";
const WIRE = "#334155";
const WIRE_LIVE = "#22c55e";
const MODULE = "#1e293b";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";

/**
 * Paint a snapshot onto any 2D context. Deterministic: same snapshot, same
 * pixels (no time, no randomness), so it can be diffed in tests.
 */
export function drawCircuitPip(
  ctx: CanvasRenderingContext2D,
  snap: CircuitPipSnapshot,
  W: number,
  H: number,
): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = TEXT;
  ctx.font = "600 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(snap.title, 14, 12);
  ctx.fillStyle = MUTED;
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillText(snap.subtitle, 14, 32);

  const padX = 14;
  const padTop = 52;
  const padBottom = 30;
  const moduleCol = Math.min(132, Math.max(90, W * 0.3));
  const availW = W - padX * 2 - moduleCol;
  const availH = H - padTop - padBottom;
  const scale = Math.min(
    availW / Math.max(1, snap.board.w),
    availH / Math.max(1, snap.board.h),
  );
  if (!Number.isFinite(scale) || scale <= 0) return;

  const bw = snap.board.w * scale;
  const bh = snap.board.h * scale;
  const ox = padX + (availW - bw) / 2;
  const oy = padTop + (availH - bh) / 2;
  const X = (x: number) => ox + (x + snap.board.w / 2) * scale;
  const Y = (y: number) => oy + (y + snap.board.h / 2) * scale;

  const moduleX = W - padX - moduleCol;
  const moduleW = moduleCol;
  const moduleH = 22;

  // Wires first (under the board + modules)
  for (const wire of snap.wires) {
    const x1 = X(wire.from.x);
    const y1 = Y(wire.from.y);
    const x2 = moduleX;
    const y2 = Y(wire.to.y);
    const midX = x1 + (x2 - x1) * 0.55;
    ctx.strokeStyle = wire.live ? WIRE_LIVE : WIRE;
    ctx.lineWidth = wire.live ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(midX, y1);
    ctx.lineTo(midX, y2);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Board
  ctx.fillStyle = BOARD;
  ctx.fillRect(ox, oy, bw, bh);
  ctx.strokeStyle = BOARD_EDGE;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox, oy, bw, bh);

  // Chips
  ctx.fillStyle = CHIP;
  for (const chip of snap.chips) {
    const cx = X(chip.x - chip.w / 2);
    const cy = Y(chip.y - chip.h / 2);
    const cw = Math.max(2, chip.w * scale);
    const ch = Math.max(2, chip.h * scale);
    ctx.fillRect(cx, cy, cw, ch);
  }

  // Pads + wired pin labels
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "8px ui-monospace, monospace";
  for (const header of snap.headers) {
    for (const pin of header.pins) {
      const px = X(pin.x);
      const py = Y(pin.y);
      ctx.fillStyle = pin.hot ? PAD_LIVE : pin.wired ? PAD : PAD_IDLE;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      if (pin.wired || pin.hot) {
        ctx.fillStyle = pin.hot ? PAD_LIVE : MUTED;
        // Nudge the label inward so it doesn't leave the board.
        const inward =
          header.edge === "left" ? 10 : header.edge === "right" ? -10 : 0;
        const inwardY =
          header.edge === "top" ? -9 : header.edge === "bottom" ? 9 : 0;
        ctx.fillText(pin.name, px + inward, py + inwardY);
      }
    }
  }

  // Modules
  modules: for (let i = 0; i < snap.modules.length; i++) {
    const mod = snap.modules[i]!;
    const my = Y(mod.y) - moduleH / 2;
    if (my + moduleH > padTop + availH + 6) continue modules;
    ctx.fillStyle = MODULE;
    ctx.fillRect(moduleX, my, moduleW, moduleH);
    ctx.strokeStyle = mod.lit ? WIRE_LIVE : BOARD_EDGE;
    ctx.lineWidth = mod.lit ? 1.6 : 1;
    ctx.strokeRect(moduleX, my, moduleW, moduleH);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = TEXT;
    ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(mod.label.slice(0, 20), moduleX + 5, my + 3);
    ctx.fillStyle = mod.lit ? WIRE_LIVE : MUTED;
    ctx.font = "8px ui-monospace, monospace";
    ctx.fillText(mod.state.slice(0, 22), moduleX + 5, my + 12);
  }

  // Footer: serial line, or an honest "nothing yet".
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = snap.serial ? WIRE_LIVE : MUTED;
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText(snap.serial ? `> ${snap.serial}` : "> serial idle", 14, H - 10);
}
