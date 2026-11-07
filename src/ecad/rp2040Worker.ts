// ecad/rp2040Worker.ts — the RP2040 tier, off the main thread.
//
// 125 MHz of Cortex-M0+ is far too much to execute inside a render frame, so
// the core runs here and posts only what the scene needs: output-pin changes
// and UART0 lines. The worker yields between slices, so a fixpoint sketch still
// leaves the app responsive (same guarantee as the virtual-firmware worker).

import { makeRp2040, type Rp2040Emulator } from "./rp2040";

type Incoming = { type: "start"; payload: string } | { type: "stop" };

type Outgoing =
  | { type: "started"; bootPc: number; imageBytes: number }
  | { type: "pins"; pins: Record<string, 0 | 1> }
  | { type: "serial"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

const scope = self as unknown as {
  addEventListener(
    type: "message",
    handler: (event: MessageEvent<Incoming>) => void,
  ): void;
  postMessage(message: Outgoing): void;
};

const post = (message: Outgoing) => scope.postMessage(message);

let emulator: Rp2040Emulator | null = null;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let flush: ReturnType<typeof setTimeout> | null = null;
const pins: Record<string, 0 | 1> = {};

function flushPins(): void {
  if (flush !== null) return;
  flush = setTimeout(() => {
    flush = null;
    post({ type: "pins", pins: { ...pins } });
  }, 0);
}

function slice(): void {
  if (!running || !emulator) return;
  const started = performance.now();
  // ~8 ms of wall time per turn keeps input and stop messages responsive.
  while (running && performance.now() - started < 8) emulator.step(512);
  timer = setTimeout(slice, 0);
}

function start(payload: string): void {
  running = false;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  emulator?.dispose();
  for (const key of Object.keys(pins)) delete pins[key];

  const booted = makeRp2040(payload);
  if (!booted.ok) {
    post({ type: "error", message: booted.reason });
    return;
  }
  emulator = booted.emulator;
  emulator.onPin((gpio, high) => {
    pins[String(gpio)] = high ? 1 : 0;
    flushPins();
  });
  emulator.onSerial((text) => post({ type: "serial", text }));
  running = true;
  post({
    type: "started",
    bootPc: booted.bootPc,
    imageBytes: booted.imageBytes,
  });
  slice();
}

scope.addEventListener("message", (event) => {
  const message = event.data;
  if (!message) return;
  if (message.type === "start") {
    start(message.payload);
    return;
  }
  if (message.type === "stop") {
    running = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    emulator?.dispose();
    emulator = null;
    post({ type: "done" });
  }
});
