// ecad/esp32Worker.ts — the classic ESP32 tier, off the main thread.
//
// The Xtensa LX6 interpreter advances ~40–50M cycles/s on a laptop, so a
// 240 MHz firmware runs slower than real time; the worker gives it an 8 ms
// wall slice per turn and yields, keeping the page responsive. Serial text and
// GPIO edges are posted as they drain; `input` messages drive pads the way the
// board's buttons and sensors would.

import { makeEsp32, type Esp32Emulator } from "./esp32";

type Incoming =
  | {
      type: "start";
      payload: string;
      mcu: string;
      wifi?: string | null;
      bleElf?: Uint8Array | null;
    }
  | { type: "input"; pin: number; level: 0 | 1 }
  | { type: "serial"; line: string }
  | { type: "stop" };

type Outgoing =
  | {
      type: "started";
      chipLabel: string;
      imageBytes: number;
      layout: string;
      wifi: string | null;
      ble: boolean;
    }
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

let emulator: Esp32Emulator | null = null;
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
  while (running && performance.now() - started < 8) {
    const ran = emulator.step(250_000);
    if (ran <= 0) break;
  }
  emulator.drain(
    (text) => post({ type: "serial", text }),
    (pin, high) => {
      pins[String(pin)] = high ? 1 : 0;
      flushPins();
    },
  );
  if (emulator.stopCode !== null) {
    running = false;
    post({
      type: "error",
      message: `ESP32 stopped (code ${emulator.stopCode}) — unimplemented instruction or exception`,
    });
    return;
  }
  timer = setTimeout(slice, 0);
}

async function start(
  payload: string,
  mcu: string,
  wifi: string | null | undefined,
  bleElf: Uint8Array | null | undefined,
): Promise<void> {
  running = false;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  emulator?.dispose();
  emulator = null;
  for (const key of Object.keys(pins)) delete pins[key];

  const booted = await makeEsp32(payload, mcu, {
    ...(wifi === undefined ? {} : { wifi }),
    bleElf: bleElf ?? null,
  });
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
    layout: booted.layout,
    wifi: emulator.wifi,
    ble: emulator.ble,
  });
  slice();
}

scope.addEventListener("message", (event) => {
  const message = event.data;
  if (!message) return;
  if (message.type === "start") {
    void start(message.payload, message.mcu, message.wifi, message.bleElf);
    return;
  }
  if (message.type === "input") {
    emulator?.setGpioInput(message.pin, message.level === 1);
    return;
  }
  if (message.type === "serial") {
    emulator?.writeLine(message.line);
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
