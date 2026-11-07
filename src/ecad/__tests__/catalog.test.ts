// ecad/__tests__/catalog.test.ts — the "all major microcontrollers" contract:
// the catalog must cover every major MCU family and display class, with valid
// pin maps and resolvable firmware references.

import { describe, expect, it } from "vitest";
import {
  allParts,
  boardsAll,
  displaysAll,
  findPartByName,
  getPart,
  hasPin,
  peripheralsAll,
  pinsOf,
  type BoardPart,
} from "../catalog";
import {
  ALL_FIRMWARE,
  firmwareFor,
  getFirmware,
  pinConstantsFor,
} from "../firmware";

describe("ecad catalog", () => {
  it("covers every major microcontroller board family", () => {
    const ids = boardsAll().map((b) => b.id);
    const must = [
      "arduino-uno",
      "arduino-nano",
      "arduino-mega",
      "arduino-leonardo",
      "arduino-due",
      "esp32-devkit",
      "esp32-s3",
      "esp8266-nodemcu",
      "rpi-pico",
      "rpi-pico-w",
      "stm32-bluepill",
      "stm32f4-blackpill",
      "teensy-40",
      "attiny85",
      "microbit-v2",
    ];
    for (const id of must) expect(ids, `missing board ${id}`).toContain(id);
  });

  it("covers the major display classes", () => {
    const drivers = displaysAll().map((d) => d.driver);
    for (const d of [
      "ssd1306",
      "sh1106",
      "st7735",
      "ili9341",
      "hd44780",
      "max7219",
      "tm1637",
      "epaper",
    ])
      expect(drivers, `missing display driver ${d}`).toContain(d);
  });

  it("has unique part ids and complete metadata", () => {
    const ids = allParts().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const part of allParts()) {
      expect(part.name.length).toBeGreaterThan(2);
      expect(part.size.w).toBeGreaterThan(0);
      expect(part.size.h).toBeGreaterThan(0);
      expect(pinsOf(part).length).toBeGreaterThan(0);
    }
  });

  it("gives every board usable power/ground pins", () => {
    for (const b of boardsAll()) {
      const fns = b.headers.flatMap((h) => h.pins.map((p) => p.fn));
      expect(fns, `${b.id} needs GND`).toContain("gnd");
      expect(
        fns.includes("vcc") || fns.includes("vin"),
        `${b.id} needs VCC or VIN`,
      ).toBe(true);
    }
  });

  it("declares runtime tiers honestly", () => {
    for (const b of boardsAll()) {
      expect(b.tiers.length).toBeGreaterThan(0);
      expect(b.tiers).toContain("virtual"); // every board runs virtual firmware
    }
    const uno = getPart("arduino-uno") as BoardPart;
    expect(uno.tiers).toContain("hex");
  });

  it("resolves every firmware reference on every part", () => {
    for (const part of allParts())
      for (const fid of part.firmware)
        expect(getFirmware(fid), `${part.id} -> ${fid}`).toBeDefined();
    for (const f of ALL_FIRMWARE)
      expect(f.source.trim().length).toBeGreaterThan(20);
  });

  it("filters firmware by board (universal sketches apply everywhere)", () => {
    const uno = firmwareFor("arduino-uno").map((f) => f.id);
    expect(uno).toContain("blink");
    expect(uno).toContain("blink-hex-uno");
    const pico = firmwareFor("rpi-pico").map((f) => f.id);
    expect(pico).toContain("blink");
    expect(pico).not.toContain("blink-hex-uno"); // hex builds are AVR-only
    const esp = firmwareFor("esp32-devkit").map((f) => f.id);
    expect(esp).toContain("wifi-scan");
  });

  it("provides pin constants for every board", () => {
    for (const b of boardsAll()) {
      const c = pinConstantsFor(b.id);
      expect(c.LED_PIN, b.id).toBeDefined();
    }
  });

  it("finds parts by name and validates pins", () => {
    expect(findPartByName("esp32").map((p) => p.id)).toContain("esp32-devkit");
    expect(findPartByName("oled").map((p) => p.category)).toContain("display");
    expect(hasPin("arduino-uno", "13")).toBe(true);
    expect(hasPin("arduino-uno", "D42")).toBe(false);
    expect(hasPin("rpi-pico", "GP25")).toBe(true);
    expect(peripheralsAll().length).toBeGreaterThanOrEqual(6);
  });
});
