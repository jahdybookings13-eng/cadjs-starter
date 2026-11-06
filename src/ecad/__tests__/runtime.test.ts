// ecad/__tests__/runtime.test.ts — the virtual firmware tier: sketches run on
// a deterministic virtual clock; HAL effects land as observable state.

import { describe, expect, it } from "vitest";
import { McuRuntime, VirtualClock, fmtPrintf } from "../runtime";
import { MonoDriver, SevenSegDriver, ColorDriver } from "../displays";

const PINS = ["0", "1", "2", "13", "A0", "GND"];

function makeRuntime(clock: VirtualClock, code: string) {
  const events: {
    digital: [string, 0 | 1][];
    serial: string[];
    servo: [string, number][];
  } = {
    digital: [],
    serial: [],
    servo: [],
  };
  const display = new MonoDriver(128, 64);
  const rt = new McuRuntime(
    "test-board",
    PINS,
    {
      onDigitalWrite: (pin, v) => events.digital.push([pin, v]),
      onAnalogWrite: () => {},
      onServoWrite: (pin, deg) => events.servo.push([pin, deg]),
      onTone: () => {},
      onSerial: (text) => events.serial.push(text),
    },
    { clock, display },
  );
  rt.deploy(code);
  return { rt, events, display };
}

describe("virtual firmware runtime", () => {
  it("blinks a pin on the virtual clock", async () => {
    const clock = new VirtualClock();
    const { rt } = makeRuntime(
      clock,
      `function setup() { pinMode(13, OUTPUT); }
       async function loop() {
         digitalWrite(13, HIGH);
         await delay(500);
         digitalWrite(13, LOW);
         await delay(500);
       }`,
    );
    void rt.start();
    await clock.advance(50);
    await clock.advance(600); // t=650: LOW @ 500
    expect(rt.state().digital["13"]).toBe(0);
    await clock.advance(600); // t=1250: HIGH @ 1000
    expect(rt.state().digital["13"]).toBe(1);
    await clock.advance(500); // t=1750: LOW @ 1500
    expect(rt.state().digital["13"]).toBe(0);
    rt.stop();
  });

  it("captures Serial.println output line by line", async () => {
    const clock = new VirtualClock();
    const { rt } = makeRuntime(
      clock,
      `function setup() { Serial.begin(9600); }
       let n = 0;
       async function loop() {
         Serial.println("tick " + n++);
         await delay(1000);
       }`,
    );
    void rt.start();
    await clock.advance(2500);
    const serial = rt.state().serial;
    expect(serial).toEqual(["tick 0", "tick 1", "tick 2"]);
    rt.stop();
  });

  it("drives the display and enforces servo bounds", async () => {
    const clock = new VirtualClock();
    const { rt, events, display } = makeRuntime(
      clock,
      `function setup() { Servo.attach("9"); }
       async function loop() {
         Display.clear();
         Display.text("SCADGEN", 0, 0);
         Servo.write(200); // clamps to 180
         await delay(100);
         Servo.write(-5); // clamps to 0
         await delay(100);
       }`,
    );
    void rt.start();
    await clock.advance(150);
    // "S" glyph (0x7e,0x11,0x11,0x11,0x7e) drawn at (0,0): pixel(0,1) is on
    expect(display.buffer.get(0, 1)).toBe(true);
    expect(display.buffer.get(0, 0)).toBe(false);
    await clock.advance(300);
    expect(events.servo.map(([, d]) => d)).toContain(180);
    expect(events.servo.some(([, d]) => d > 180 || d < 0)).toBe(false);
    rt.stop();
  });

  it("reports compile errors instead of crashing", async () => {
    const clock = new VirtualClock();
    const { rt } = makeRuntime(clock, `function setup( { }`);
    void rt.start();
    expect(rt.state().error).toContain("compile:");
    expect(rt.isRunning).toBe(false);
  });

  it("stops cleanly (no more timers, no more writes)", async () => {
    const clock = new VirtualClock();
    const { rt, events } = makeRuntime(
      clock,
      `async function loop() {
         digitalWrite(13, HIGH);
         await delay(100);
         digitalWrite(13, LOW);
         await delay(100);
       }`,
    );
    void rt.start();
    await clock.advance(500);
    rt.stop();
    const count = events.digital.length;
    await clock.advance(5000);
    expect(events.digital.length).toBe(count);
    expect(clock.pending()).toBe(0);
  });

  it("reads inputs (buttons/pots) through digitalRead/analogRead", async () => {
    const clock = new VirtualClock();
    const { rt } = makeRuntime(
      clock,
      `async function loop() {
         digitalWrite(13, digitalRead("2") ? LOW : HIGH);
         Serial.println(String(analogRead("A0")));
         await delay(100);
       }`,
    );
    void rt.start();
    rt.setInput("2", 0); // pressed (pullup)
    rt.setInput("A0", 512);
    await clock.advance(150);
    expect(rt.state().digital["13"]).toBe(1);
    expect(rt.state().serial[0]).toBe("512");
    rt.setInput("2", 1); // released
    await clock.advance(300);
    expect(rt.state().digital["13"]).toBe(0);
    rt.stop();
  });

  it("printf-format helper handles %d %f %s %x", () => {
    expect(fmtPrintf("v=%d f=%f s=%s x=%x", [42, 3.14159, "hi", 255])).toBe(
      "v=42 f=3.14 s=hi x=ff",
    );
  });

  it("color + 7-segment drivers buffer their panels", () => {
    const tft = new ColorDriver(160, 128);
    tft.fill(0xff0000);
    expect(tft.buffer.rgba[0]).toBe(255);
    expect(tft.buffer.rgba[1]).toBe(0);
    const seg = new SevenSegDriver();
    seg.text("12:34");
    expect(seg.digits.join("")).toBe("1234");
    expect(seg.showColon).toBe(true);
  });
});
