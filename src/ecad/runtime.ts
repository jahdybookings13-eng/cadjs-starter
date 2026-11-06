// ecad/runtime.ts — ScadGen virtual firmware runtime.
//
// Tier 1 (every board): user firmware is JavaScript written against an
// Arduino-flavored API (pinMode / digitalWrite / analogWrite / analogRead /
// delay / millis / tone / Serial + Display / Servo objects bound by wiring).
// The API surface matches the board's real pin map, so a sketch written for
// an Uno uses D0..D13/A0..A5 and one written for a Pico uses GP0..GP28.
//
// The runtime is pure TS + an injectable clock, so unit tests run it on
// virtual time with zero waits while the app runs it on wall time.
//
// Tier 2 (AVR boards): see avr.ts — avr8js runs real compiled .hex.

export type PinValue = number;

export interface HalHooks {
  /** A digital output changed (pin logical name, 0..1). */
  onDigitalWrite(pin: string, value: 0 | 1): void;
  /** A PWM duty changed (pin logical name, 0..255). */
  onAnalogWrite(pin: string, value: number): void;
  /** Servo angle changed (pin logical name, 0..180). */
  onServoWrite(pin: string, degrees: number): void;
  /** Tone started/stopped on a pin. */
  onTone(pin: string, freq: number | null): void;
  /** Serial text emitted (already line-assembled). */
  onSerial(text: string): void;
}

export interface RuntimeOptions {
  /** Logical pin name -> initial state (e.g. inputs pulled up). */
  inputs?: Record<string, PinValue>;
  /** Display object bound into the sketch scope (wiring-dependent). */
  display?: DisplayApi | null;
  /** Servo object bound into the sketch scope. */
  servo?: ServoApi | null;
  /** Extra named globals (advanced). */
  globals?: Record<string, unknown>;
  /** Clock source; defaults to Date.now-based wall time. */
  clock?: Clock;
  /** Called when the sketch throws (runtime keeps running loop()-less). */
  onError?(err: unknown): void;
}

export interface Clock {
  now(): number;
  /** Schedule `fn` after `ms`. Return a cancel fn. */
  after(ms: number, fn: () => void): () => void;
}

export const wallClock: Clock = {
  now: () => Date.now(),
  after: (ms, fn) => {
    const t = setTimeout(fn, Math.max(0, ms));
    return () => clearTimeout(t);
  },
};

/** Deterministic clock for tests: you advance it, nothing runs early. */
export class VirtualClock implements Clock {
  private t = 0;
  private timers: { at: number; fn: () => void; seq: number }[] = [];
  private seq = 0;
  now(): number {
    return this.t;
  }
  after(ms: number, fn: () => void): () => void {
    const entry = { at: this.t + Math.max(0, ms), fn, seq: this.seq++ };
    this.timers.push(entry);
    return () => {
      this.timers = this.timers.filter((x) => x !== entry);
    };
  }
  /** Run everything scheduled within the next `dtMs` of virtual time. */
  async advance(dtMs: number): Promise<void> {
    const until = this.t + Math.max(0, dtMs);
    const drain = () =>
      // A macrotask boundary lets the ENTIRE suspended continuation chain
      // (await setup → loop → delay resumption → yield → next loop) settle
      // before the next timer is examined — one microtask hop is not enough.
      new Promise<void>((res) => {
        if (typeof setImmediate === "function") setImmediate(res);
        else setTimeout(res, 0);
      });
    await drain();
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.timers[0];
      if (!next || next.at > until) {
        this.t = Math.max(this.t, until);
        return;
      }
      this.t = next.at;
      this.timers.shift();
      next.fn();
      await drain();
    }
  }
  pending(): number {
    return this.timers.length;
  }
}

// ---------------------------------------------------------------------------
// Bound objects
// ---------------------------------------------------------------------------

export interface DisplayApi {
  clear(): void;
  /** Draw text at (col,row) or pixel (x,y) depending on driver. */
  text(str: string, x: number, y: number, color?: number): void;
  pixel(x: number, y: number, on: number | boolean, color?: number): void;
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill?: boolean,
    color?: number,
  ): void;
  fill(color?: number): void;
  /** Display resolution [w,h]. */
  readonly size: [number, number];
}

export interface ServoApi {
  attach(pin: string): void;
  write(deg: number): void;
  detach(): void;
}

class BoundDisplay implements DisplayApi {
  constructor(
    private impl: DisplayBackend,
    readonly size: [number, number],
  ) {}
  clear(): void {
    this.impl.clear();
  }
  text(str: string, x: number, y: number, color?: number): void {
    this.impl.text(String(str), x, y, color);
  }
  pixel(x: number, y: number, on: number | boolean, color?: number): void {
    this.impl.pixel(x, y, !!on, color);
  }
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill?: boolean,
    color?: number,
  ): void {
    this.impl.rect(x, y, w, h, fill, color);
  }
  fill(color?: number): void {
    this.impl.fill(color);
  }
}

export interface DisplayBackend {
  clear(): void;
  text(str: string, x: number, y: number, color?: number): void;
  pixel(x: number, y: number, on: boolean, color?: number): void;
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: boolean | undefined,
    color?: number,
  ): void;
  fill(color?: number): void;
  /** Character-cell LCDs (16x2) get grid semantics; others are pixel-based. */
  readonly grid?: { cols: number; rows: number };
}

class BoundServo implements ServoApi {
  constructor(
    private hooks: HalHooks,
    private pin: string | null,
  ) {}
  attach(pin: string): void {
    this.pin = pin;
  }
  write(deg: number): void {
    if (this.pin == null) return;
    const clamped = Math.max(0, Math.min(180, Math.round(deg)));
    this.hooks.onServoWrite(this.pin, clamped);
  }
  detach(): void {
    this.pin = null;
  }
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export interface RuntimeState {
  running: boolean;
  error: string | null;
  digital: Record<string, 0 | 1>;
  pwm: Record<string, number>;
  servo: Record<string, number>;
  tones: Record<string, number | null>;
  serial: string[];
}

export class McuRuntime {
  readonly boardId: string;
  readonly pinNames: string[];
  private hooks: HalHooks;
  private clock: Clock;
  private digital = new Map<string, 0 | 1>();
  private pwm = new Map<string, number>();
  private servoDeg = new Map<string, number>();
  private tones = new Map<string, number | null>();
  private inputValues: Record<string, PinValue>;
  private serialBuf: string[] = [];
  private serialLine = "";
  private running = false;
  private cancelled = false;
  private cancelTimers: (() => void)[] = [];
  error: string | null = null;

  constructor(
    boardId: string,
    pinNames: string[],
    hooks: HalHooks,
    opts: RuntimeOptions = {},
  ) {
    this.boardId = boardId;
    this.pinNames = [...pinNames];
    this.hooks = hooks;
    this.clock = opts.clock ?? wallClock;
    this.inputValues = { ...opts.inputs };
    this.opts = opts;
  }
  private opts: RuntimeOptions;

  get isRunning(): boolean {
    return this.running;
  }

  /** Firmware source; set via deploy() before start(). */
  private source = "";

  deploy(source: string): void {
    this.source = source;
    this.error = null;
  }

  /** External input state change (button pressed, pot turned). */
  setInput(pin: string, value: PinValue): void {
    this.inputValues[pin] = value;
  }

  private snapshotSerial(): string[] {
    return [...this.serialBuf];
  }

  state(): RuntimeState {
    return {
      running: this.running,
      error: this.error,
      digital: Object.fromEntries(this.digital),
      pwm: Object.fromEntries(this.pwm),
      servo: Object.fromEntries(this.servoDeg),
      tones: Object.fromEntries(this.tones),
      serial: this.snapshotSerial(),
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.source.trim()) {
      this.error = "no firmware deployed";
      return;
    }
    this.running = true;
    this.cancelled = false;
    const display = this.opts.display
      ? new BoundDisplay(this.opts.display, this.opts.display.size ?? [128, 64])
      : null;
    const servo = new BoundServo(this.hooks, null);
    const api = this.buildApi(servo, display);
    let setup: () => unknown;
    let loop: (() => unknown) | undefined;
    try {
      const factory = new Function(
        ...Object.keys(api),
        `"use strict";\n${this.source}\n;return { setup: typeof setup === "function" ? setup : null, loop: typeof loop === "function" ? loop : null };`,
      ) as (...args: unknown[]) => {
        setup: (() => unknown) | null;
        loop: (() => unknown) | null;
      };
      const bound = factory(...Object.values(api));
      if (!bound.setup && !bound.loop) {
        throw new Error("firmware must define setup() and/or loop()");
      }
      setup = () => (bound.setup ? bound.setup() : undefined);
      loop = bound.loop ? () => bound.loop!() : undefined;
    } catch (err) {
      this.running = false;
      this.error = `compile: ${err instanceof Error ? err.message : String(err)}`;
      this.opts.onError?.(err);
      return;
    }
    try {
      await setup();
    } catch (err) {
      this.fail(err);
      return;
    }
    if (!loop) {
      this.running = false;
      return;
    }
    // loop forever (until stop()); a sync throw kills the loop, async loop
    // functions are awaited so delay() inside them yields.
    for (;;) {
      if (this.cancelled) break;
      try {
        await loop();
      } catch (err) {
        this.fail(err);
        return;
      }
      // yield so the host stays responsive when the sketch has no delay()
      await new Promise<void>((res) => {
        const cancel = this.clock.after(0, res);
        this.cancelTimers.push(cancel);
      });
    }
    this.running = false;
  }

  stop(): void {
    this.cancelled = true;
    this.running = false;
    for (const c of this.cancelTimers) c();
    this.cancelTimers = [];
  }

  private fail(err: unknown): void {
    this.running = false;
    this.error = `runtime: ${err instanceof Error ? err.message : String(err)}`;
    this.opts.onError?.(err);
  }

  private buildApi(
    servo: BoundServo,
    display: DisplayApi | null,
  ): Record<string, unknown> {
    const resolve = (pin: string | number): string => String(pin);
    const serialWrite = (s: string) => {
      for (const ch of s) {
        if (ch === "\n") {
          this.serialBuf.push(this.serialLine);
          this.hooks.onSerial(this.serialLine + "\n");
          this.serialLine = "";
          if (this.serialBuf.length > 200) this.serialBuf.shift();
        } else {
          this.serialLine += ch;
        }
      }
    };
    const api: Record<string, unknown> = {
      pinMode: (pin: string | number, mode: string) => {
        void pin;
        void mode; // no-op in virtual tier (kept for Arduino parity)
      },
      digitalWrite: (pin: string | number, value: number | boolean) => {
        const name = resolve(pin);
        const v: 0 | 1 = value === true || value === 1 ? 1 : 0;
        this.digital.set(name, v);
        this.hooks.onDigitalWrite(name, v);
      },
      analogWrite: (pin: string | number, value: number) => {
        const name = resolve(pin);
        const v = Math.max(0, Math.min(255, Math.round(value)));
        this.pwm.set(name, v);
        this.hooks.onAnalogWrite(name, v);
      },
      digitalRead: (pin: string | number): 0 | 1 => {
        const name = resolve(pin);
        const v = this.inputValues[name];
        return v === undefined || v === 0 ? 0 : 1;
      },
      analogRead: (pin: string | number): number => {
        const name = resolve(pin);
        const v = this.inputValues[name] ?? 0;
        return Math.max(0, Math.min(1023, Math.round(v)));
      },
      tone: (pin: string | number, freq: number) => {
        const name = resolve(pin);
        this.tones.set(name, freq);
        this.hooks.onTone(name, freq);
      },
      noTone: (pin: string | number) => {
        const name = resolve(pin);
        this.tones.set(name, null);
        this.hooks.onTone(name, null);
      },
      delay: (ms: number) =>
        new Promise<void>((res) => {
          const cancel = this.clock.after(ms, res);
          this.cancelTimers.push(cancel);
        }),
      delayMicroseconds: (us: number) =>
        new Promise<void>((res) => {
          const cancel = this.clock.after(us / 1000, res);
          this.cancelTimers.push(cancel);
        }),
      millis: () => Math.round(this.clock.now()),
      micros: () => Math.round(this.clock.now() * 1000),
      map: (
        x: number,
        inMin: number,
        inMax: number,
        outMin: number,
        outMax: number,
      ) => ((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin,
      constrain: (x: number, lo: number, hi: number) =>
        Math.max(lo, Math.min(hi, x)),
      Serial: {
        begin: () => {},
        print: (s: unknown) => serialWrite(String(s)),
        println: (s: unknown = "") => serialWrite(String(s) + "\n"),
        printf: (fmt: string, ...args: unknown[]) =>
          serialWrite(fmtPrintf(fmt, args)),
        available: () => 0,
        read: () => -1,
      },
      HIGH: 1,
      LOW: 0,
      INPUT: 0,
      OUTPUT: 1,
      INPUT_PULLUP: 2,
    };
    if (display) api.Display = display;
    api.Servo = {
      attach: (pin: string) => servo.attach(pin),
      write: (deg: number) => servo.write(deg),
      detach: () => servo.detach(),
    };
    for (const [k, v] of Object.entries(this.opts.globals ?? {})) api[k] = v;
    return api;
  }
}

/** Minimal %s/%d/%f/%x printf for Serial.printf. */
export function fmtPrintf(fmt: string, args: unknown[]): string {
  let i = 0;
  return fmt.replace(/%[sdxf]/g, (m) => {
    const v = args[i++];
    if (m === "%d") return String(Math.round(Number(v)));
    if (m === "%f") return Number(v).toFixed(2);
    if (m === "%x") return (Number(v) >>> 0).toString(16);
    return String(v);
  });
}
