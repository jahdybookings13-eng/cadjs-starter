// ecad/firmwareWorker.ts — the virtual firmware tier, off the main thread.
//
// Every board runs this tier, so every board inherits the same guarantee: a
// sketch with a synchronous infinite loop burns its own worker and the app
// keeps rendering. HAL writes are coalesced and posted as one state message;
// serial lines, display ops and errors go through as they happen.

import { McuRuntime, type DisplayApi } from "./runtime";

type StartMessage = {
  type: "start";
  boardId: string;
  pins: string[];
  source: string;
  inputs: Record<string, number>;
  globals: Record<string, unknown>;
  displaySize: [number, number] | null;
};

type Incoming =
  | StartMessage
  | { type: "input"; pin: string; value: number }
  | { type: "stop" };

type Outgoing =
  | {
      type: "state";
      digital: Record<string, 0 | 1>;
      pwm: Record<string, number>;
      servo: Record<string, number>;
      tones: Record<string, number | null>;
    }
  | { type: "serial"; text: string }
  | { type: "display"; op: string; args: unknown[] }
  | { type: "error"; message: string }
  | { type: "started" }
  | { type: "done" };

const scope = self as unknown as {
  addEventListener(
    type: "message",
    handler: (event: MessageEvent<Incoming>) => void,
  ): void;
  postMessage(message: Outgoing): void;
};

const post = (message: Outgoing) => scope.postMessage(message);

let runtime: McuRuntime | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;
const digital: Record<string, 0 | 1> = {};
const pwm: Record<string, number> = {};
const servo: Record<string, number> = {};
const tones: Record<string, number | null> = {};

function flushSoon(): void {
  if (pending !== null) return;
  pending = setTimeout(() => {
    pending = null;
    post({
      type: "state",
      digital: { ...digital },
      pwm: { ...pwm },
      servo: { ...servo },
      tones: { ...tones },
    });
  }, 0);
}

function remoteDisplay(size: [number, number]): DisplayApi {
  return {
    size,
    clear: () => post({ type: "display", op: "clear", args: [] }),
    text: (str, x, y, color) =>
      post({ type: "display", op: "text", args: [str, x, y, color ?? 0] }),
    pixel: (x, y, on, color) =>
      post({ type: "display", op: "pixel", args: [x, y, !!on, color ?? 0] }),
    rect: (x, y, w, h, fill, color) =>
      post({
        type: "display",
        op: "rect",
        args: [x, y, w, h, !!fill, color ?? 0],
      }),
    fill: (color) => post({ type: "display", op: "fill", args: [color ?? 0] }),
  };
}

function start(message: StartMessage): void {
  runtime?.stop();
  for (const key of Object.keys(digital)) delete digital[key];
  for (const key of Object.keys(pwm)) delete pwm[key];
  for (const key of Object.keys(servo)) delete servo[key];
  for (const key of Object.keys(tones)) delete tones[key];

  const display = message.displaySize
    ? remoteDisplay(message.displaySize)
    : null;
  runtime = new McuRuntime(
    message.boardId,
    message.pins,
    {
      onDigitalWrite: (pin, value) => {
        digital[pin] = value;
        flushSoon();
      },
      onAnalogWrite: (pin, value) => {
        pwm[pin] = value;
        flushSoon();
      },
      onServoWrite: (pin, deg) => {
        servo[pin] = deg;
        flushSoon();
      },
      onTone: (pin, freq) => {
        tones[pin] = freq;
        flushSoon();
      },
      onSerial: (text) => post({ type: "serial", text }),
    },
    {
      display,
      inputs: message.inputs,
      globals: message.globals,
      onError: (err) =>
        post({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
    },
  );
  runtime.deploy(message.source);
  post({ type: "started" });
  void runtime.start().then(() => post({ type: "done" }));
}

scope.addEventListener("message", (event) => {
  const message = event.data;
  if (!message) return;
  if (message.type === "start") {
    start(message);
    return;
  }
  if (message.type === "input") {
    runtime?.setInput(message.pin, message.value);
    return;
  }
  if (message.type === "stop") {
    runtime?.stop();
    runtime = null;
    post({ type: "done" });
  }
});
