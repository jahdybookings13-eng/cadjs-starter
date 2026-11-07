// e2e/ecad-cpp-peripherals.spec.ts — compiled Arduino C++ must reach the same
// peripherals the virtual tier does: USART (Serial), Timer1/servo pulses, and
// TWI (I2C) to an SSD1306. This compiles in the browser and then observes the
// sim's serial log, servo angle and display buffer.

import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

interface PeriphWindow {
  __ecad?: {
    sim: {
      instances: Map<string, { id: string; partId: string }>;
      tick: (dtMs: number) => void;
      serial: (id: string) => string[];
      servoAngle: (id: string) => number;
      monoBuffer: (
        id: string,
      ) => { get: (x: number, y: number) => boolean } | null;
      status: (id: string) => { tier: string | null; running: boolean };
    };
  };
  __cadDebug?: {
    scadgen?: {
      bus?: {
        run: (id: string, ...args: unknown[]) => unknown;
      };
    };
  };
}

const SKETCH = `#include <Wire.h>
#include <Servo.h>
Servo arm;
void setup() {
  Serial.begin(9600);
  Wire.begin();
  arm.attach(9);
  Serial.println("cpp boot");
}
void loop() {
  arm.write(90);
  Wire.beginTransmission(0x3C);
  Wire.write(0x00);
  Wire.write(0x21); Wire.write(0); Wire.write(127);
  Wire.write(0x22); Wire.write(0); Wire.write(7);
  Wire.endTransmission();
  Wire.beginTransmission(0x3C);
  Wire.write(0x40);
  for (int i = 0; i < 16; i++) Wire.write(0xFF);
  Wire.endTransmission();
  Serial.println("frame");
  delay(200);
}`;

test("ecad: compiled C++ drives Serial, a servo and an I2C OLED", async ({
  page,
}) => {
  await loadAppReady(page);

  const setup = await page.evaluate(async (sketch) => {
    const w = window as unknown as PeriphWindow;
    const bus = w.__cadDebug?.scadgen?.bus;
    if (!bus) throw new Error("no bus");
    const uno = bus.run("ecad.insert", {
      part: "arduino-uno",
      x: 0,
      y: 0,
      z: 0,
    }) as { id: string };
    const oled = bus.run("ecad.insert", {
      part: "ssd1306-128x64",
      x: 0.12,
      y: 0,
      z: 0,
    }) as { id: string };
    const servo = bus.run("ecad.insert", {
      part: "servo-sg90",
      x: -0.12,
      y: 0,
      z: 0.05,
    }) as { id: string };
    bus.run("ecad.wire", { from: `${uno.id}.A4`, to: `${oled.id}.SDA` });
    bus.run("ecad.wire", { from: `${uno.id}.A5`, to: `${oled.id}.SCL` });
    bus.run("ecad.wire", { from: `${uno.id}.9`, to: `${servo.id}.SIG` });
    bus.run("ecad.wire", { from: `${uno.id}.5V`, to: `${servo.id}.VCC` });
    bus.run("ecad.wire", { from: `${uno.id}.GND`, to: `${servo.id}.GND` });

    const built = (await bus.run("ecad.buildFirmware", {
      board: uno.id,
      code: sketch,
    })) as {
      ok: boolean;
      error?: string;
      stderr?: string[];
      result?: { flashBytes: number; fitsTarget: boolean };
    };
    return { uno: uno.id, oled: oled.id, servo: servo.id, built };
  }, SKETCH);

  // Surface the compiler's own words instead of a bare failure.
  expect(setup.built.ok, setup.built.stderr?.join("\n") ?? "build failed").toBe(
    true,
  );
  expect(setup.built.result?.fitsTarget).toBe(true);

  const seen = await page.evaluate(
    async ({ uno, oled, servo }) => {
      const sim = (window as unknown as PeriphWindow).__ecad!.sim;
      for (let i = 0; i < 200; i++) {
        sim.tick(20);
        await new Promise((r) => setTimeout(r, 2));
      }
      const mono = sim.monoBuffer(uno);
      return {
        serial: sim.serial(uno),
        servo: sim.servoAngle(servo),
        topLeft: mono ? mono.get(0, 0) : false,
        pageOne: mono ? mono.get(0, 8) : true,
        tier: sim.status(uno).tier,
      };
    },
    { uno: setup.uno, oled: setup.oled, servo: setup.servo },
  );

  expect(seen.tier).toBe("hex");
  expect(seen.serial).toContain("cpp boot");
  expect(seen.serial).toContain("frame");
  expect(seen.servo).toBeGreaterThan(80);
  expect(seen.servo).toBeLessThan(100);
  expect(seen.topLeft).toBe(true);
  expect(seen.pageOne).toBe(false);
});
