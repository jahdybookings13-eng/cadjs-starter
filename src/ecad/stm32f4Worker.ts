// ecad/stm32f4Worker.ts — the STM32F4 tier, off the main thread.
//
// The WASM Cortex-M4 core runs at the chip's clock (100 MHz on the F411) and
// manages real firmware loops; running it in the page would fight the render
// loop. The worker steps in ~8 ms slices, drains UART and pin edges, and posts
// only changes. Same contract as the RP2040 worker.

import { makeStm32f4, type Stm32f4Emulator } from "./stm32f4";

type Incoming =
  | { type: "start"; payload: string; mcu: string }
  | { type: "stop" };

type Outgoing =
  | { type: "started"; chipLabel: string; imageBytes: number }
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

let emulator: Stm32f4Emulator | null = null;
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
  while (running && performance.now() - started < 8) emulator.step(50_000);
  emulator.drain(
    (text) => post({ type: "serial", text }),
    (name, high) => {
      pins[name] = high ? 1 : 0;
      flushPins();
    },
  );
  timer = setTimeout(slice, 0);
}

async function start(payload: string, mcu: string): Promise<void> {
  running = false;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  emulator?.dispose();
  emulator = null;
  for (const key of Object.keys(pins)) delete pins[key];

  const booted = await makeStm32f4(payload, mcu);
  if (!booted.ok) {
    post({ type: "error", message: booted.reason });
    return;
  }
  emulator = booted.emulator;
  running = true;
  post({
    type: "started",
    chipLabel: booted.chipLabel,
    imageBytes: booted.imageBytes,
  });
  slice();
}

scope.addEventListener("message", (event) => {
  const message = event.data;
  if (!message) return;
  if (message.type === "start") {
    void start(message.payload, message.mcu);
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
