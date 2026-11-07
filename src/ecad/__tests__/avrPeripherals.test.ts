// ecad/__tests__/avrPeripherals.test.ts — compiled firmware reaches the OLED
// over real I2C. These tests feed the exact transfer sequence an SSD1306 driver
// emits and assert the pixels land where the panel would show them.

import { describe, expect, it } from "vitest";
import { Ssd1306Sink, i2cDisplaySink } from "../avrPeripherals";
import type { DisplayApi } from "../runtime";

function recordingApi(): DisplayApi & {
  pixels: Map<string, number>;
} {
  const pixels = new Map<string, number>();
  return {
    pixels,
    size: [128, 64],
    clear: () => pixels.clear(),
    text: () => {},
    pixel: (x, y, on) => pixels.set(`${x},${y}`, on ? 1 : 0),
    rect: () => {},
    fill: () => {},
  };
}

/** One complete I2C write transaction (address + control + payload). */
function transfer(sink: Ssd1306Sink, control: number, bytes: number[]) {
  sink.start(false);
  sink.connect(0x3c, true);
  sink.write(control);
  for (const byte of bytes) sink.write(byte);
  sink.stop();
}

describe("Ssd1306Sink", () => {
  it("turns GDDRAM bytes into pixels, bit 0 = top row of the page", () => {
    const api = recordingApi();
    const sink = new Ssd1306Sink(api);
    transfer(sink, 0x00, [0x21, 0, 127]); // column range 0..127
    transfer(sink, 0x00, [0x22, 0, 7]); // page range 0..7
    transfer(sink, 0x40, [0b10101010]);

    expect(api.pixels.get("0,0")).toBe(0);
    expect(api.pixels.get("0,1")).toBe(1);
    expect(api.pixels.get("0,2")).toBe(0);
    expect(api.pixels.get("0,7")).toBe(1);
  });

  it("advances the column per data byte and selects pages with 0xB0+n", () => {
    const api = recordingApi();
    const sink = new Ssd1306Sink(api);
    transfer(sink, 0x00, [0xb1]); // page 1
    transfer(sink, 0x00, [0x00, 0x10]); // column 0
    transfer(sink, 0x40, [0xff, 0x00]);

    expect(api.pixels.get("0,8")).toBe(1); // page 1 starts at y=8
    expect(api.pixels.get("0,15")).toBe(1);
    expect(api.pixels.get("1,8")).toBe(0); // second byte cleared the next column
  });

  it("honours an explicit column range before drawing", () => {
    const api = recordingApi();
    const sink = new Ssd1306Sink(api);
    transfer(sink, 0x00, [0x21, 10, 10]);
    transfer(sink, 0x40, [0x01]);

    expect(api.pixels.get("10,0")).toBe(1);
    expect(api.pixels.get("11,0")).toBeUndefined();
  });

  it("only claims drivers it can decode", () => {
    const api = recordingApi();
    expect(i2cDisplaySink(api, "ssd1306")).toBeInstanceOf(Ssd1306Sink);
    expect(i2cDisplaySink(api, "sh1106")).toBeInstanceOf(Ssd1306Sink);
    expect(i2cDisplaySink(api, "ili9341")).toBeNull();
    expect(i2cDisplaySink(api, "hd44780")).toBeNull();
  });
});
