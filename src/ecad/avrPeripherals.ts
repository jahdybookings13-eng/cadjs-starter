// ecad/avrPeripherals.ts — real peripherals for the compiled-firmware tier.
//
// A compiled Arduino sketch talks to an SSD1306 the same way the hardware
// does: TWI (I2C) transfers. This decodes those transfers into the sim's
// display buffer, so an OLED driven by real AVR machine code shows the same
// pixels as one driven by the virtual tier. No faking, no "pretend display".

import type { DisplayApi } from "./runtime";

export interface I2cHandler {
  start(repeated: boolean): void;
  stop(): void;
  connect(addr: number, write: boolean): void;
  write(byte: number): void;
  /** Master read (SSD1306 never needs it; provided so TWI can complete). */
  read(): number;
}

/**
 * SSD1306 / SH1106 command + data sink. Implements the addressing subset the
 * Adafruit and U8g2 drivers actually emit: column/page ranges, page select,
 * low/high column nibbles, and GDDRAM bytes at 8 vertical pixels per byte.
 */
export class Ssd1306Sink implements I2cHandler {
  private colStart = 0;
  private colEnd = 127;
  private pageStart = 0;
  private pageEnd = 7;
  private col = 0;
  private page = 0;
  private control: "cmd" | "data" | null = null;
  /** Remaining argument bytes for the current command. */
  private argsLeft = 0;
  private argBuf: number[] = [];
  private argTarget: "cols" | "pages" | null = null;

  constructor(private api: DisplayApi) {}

  start(_repeated: boolean): void {
    this.control = null;
    this.argsLeft = 0;
    this.argBuf = [];
    this.argTarget = null;
  }

  stop(): void {
    this.control = null;
  }

  connect(_addr: number, _write: boolean): void {
    this.control = null;
  }

  write(byte: number): void {
    if (this.control === null) {
      this.control = byte & 0x40 ? "data" : "cmd";
      return;
    }
    if (this.control === "data") {
      this.writeData(byte);
      return;
    }
    this.writeCommand(byte);
  }

  read(): number {
    return 0;
  }

  private writeData(byte: number): void {
    const height = this.api.size[1];
    for (let bit = 0; bit < 8; bit++) {
      const y = this.page * 8 + bit;
      if (y < height) this.api.pixel(this.col, y, (byte >> bit) & 1);
    }
    this.col += 1;
    if (this.col > this.colEnd) {
      this.col = this.colStart;
      this.page = this.page >= this.pageEnd ? this.pageStart : this.page + 1;
    }
  }

  private writeCommand(byte: number): void {
    if (this.argsLeft > 0) {
      this.argBuf.push(byte);
      this.argsLeft -= 1;
      if (this.argsLeft === 0 && this.argTarget) {
        if (this.argTarget === "cols") {
          this.colStart = this.argBuf[0] ?? 0;
          this.colEnd = this.argBuf[1] ?? this.colStart;
          this.col = this.colStart;
        } else {
          this.pageStart = this.argBuf[0] ?? 0;
          this.pageEnd = this.argBuf[1] ?? this.pageStart;
          this.page = this.pageStart;
        }
        this.argTarget = null;
        this.argBuf = [];
      }
      return;
    }

    if (byte === 0x21) {
      this.argTarget = "cols";
      this.argsLeft = 2;
      return;
    }
    if (byte === 0x22) {
      this.argTarget = "pages";
      this.argsLeft = 2;
      return;
    }
    // Commands with a single argument we don't model (contrast, timing, mux).
    if ([0x20, 0x81, 0xa8, 0xd3, 0xd5, 0xd9, 0xda, 0xdb, 0x8d].includes(byte)) {
      this.argTarget = null;
      this.argsLeft = 1;
      return;
    }
    if (byte >= 0xb0 && byte <= 0xb7) {
      this.page = byte & 0x07;
      this.col = this.colStart;
      return;
    }
    if (byte <= 0x0f) {
      this.col = (this.col & 0xf0) | (byte & 0x0f);
      return;
    }
    if (byte >= 0x10 && byte <= 0x1f) {
      this.col = (this.col & 0x0f) | ((byte & 0x0f) << 4);
      return;
    }
    // Display on/off, orientation, scroll and the rest need no buffer change.
  }
}

/** Only the SSD1306/SH1106 family has a real I2C command decoder here. */
export function i2cDisplaySink(
  api: DisplayApi,
  driver: string,
): Ssd1306Sink | null {
  return driver === "ssd1306" || driver === "sh1106"
    ? new Ssd1306Sink(api)
    : null;
}
