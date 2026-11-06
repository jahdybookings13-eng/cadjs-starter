// ecad/displays.ts — display backends for the virtual ECAD screens.
//
// Every driver writes into a plain typed-array buffer (no DOM, no canvas) so
// unit tests can assert pixels in node. `scene.ts` blits the buffer onto a
// THREE.CanvasTexture once per frame in the app.

import type { DisplayBackend } from "./runtime";

// ---------------------------------------------------------------------------
// Classic 5x7 bitmap font (public-domain Adafruit GFX-style table), ASCII
// 32..126. Each glyph is 5 column-bytes, LSB = top row.
// ---------------------------------------------------------------------------

const FONT_5X7: Record<string, number[]> = {
  " ": [0x00, 0x00, 0x00, 0x00, 0x00],
  "!": [0x00, 0x00, 0x5f, 0x00, 0x00],
  '"': [0x00, 0x07, 0x00, 0x07, 0x00],
  "#": [0x14, 0x7f, 0x14, 0x7f, 0x14],
  $: [0x24, 0x2a, 0x7f, 0x2a, 0x12],
  "%": [0x23, 0x13, 0x08, 0x64, 0x62],
  "&": [0x36, 0x49, 0x55, 0x22, 0x50],
  "'": [0x00, 0x05, 0x03, 0x00, 0x00],
  "(": [0x00, 0x1c, 0x22, 0x41, 0x00],
  ")": [0x00, 0x41, 0x22, 0x1c, 0x00],
  "*": [0x14, 0x08, 0x3e, 0x08, 0x14],
  "+": [0x08, 0x08, 0x3e, 0x08, 0x08],
  ",": [0x00, 0x50, 0x30, 0x00, 0x00],
  "-": [0x08, 0x08, 0x08, 0x08, 0x08],
  ".": [0x00, 0x60, 0x60, 0x00, 0x00],
  "/": [0x20, 0x10, 0x08, 0x04, 0x02],
  "0": [0x3e, 0x51, 0x49, 0x45, 0x3e],
  "1": [0x00, 0x42, 0x7f, 0x40, 0x00],
  "2": [0x42, 0x61, 0x51, 0x49, 0x46],
  "3": [0x21, 0x41, 0x45, 0x4b, 0x31],
  "4": [0x18, 0x14, 0x12, 0x7f, 0x10],
  "5": [0x27, 0x45, 0x45, 0x45, 0x39],
  "6": [0x3c, 0x4a, 0x49, 0x49, 0x30],
  "7": [0x01, 0x71, 0x09, 0x05, 0x03],
  "8": [0x36, 0x49, 0x49, 0x49, 0x36],
  "9": [0x06, 0x49, 0x49, 0x29, 0x1e],
  ":": [0x00, 0x36, 0x36, 0x00, 0x00],
  ";": [0x00, 0x56, 0x36, 0x00, 0x00],
  "<": [0x08, 0x14, 0x22, 0x41, 0x00],
  "=": [0x14, 0x14, 0x14, 0x14, 0x14],
  ">": [0x00, 0x41, 0x22, 0x14, 0x08],
  "?": [0x02, 0x01, 0x51, 0x09, 0x06],
  "@": [0x32, 0x49, 0x79, 0x41, 0x3e],
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e],
  B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x22, 0x1c],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x49, 0x49, 0x7a],
  H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x00, 0x41, 0x7f, 0x41, 0x00],
  J: [0x20, 0x40, 0x41, 0x3f, 0x01],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x0c, 0x02, 0x7f],
  N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31],
  T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  V: [0x1f, 0x20, 0x40, 0x20, 0x1f],
  W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07],
  Z: [0x61, 0x51, 0x49, 0x45, 0x43],
  "[": [0x00, 0x7f, 0x41, 0x41, 0x00],
  "\\": [0x02, 0x04, 0x08, 0x10, 0x20],
  "]": [0x00, 0x41, 0x41, 0x7f, 0x00],
  "^": [0x04, 0x02, 0x01, 0x02, 0x04],
  _: [0x40, 0x40, 0x40, 0x40, 0x40],
  "`": [0x00, 0x01, 0x02, 0x04, 0x00],
  a: [0x20, 0x54, 0x54, 0x54, 0x78],
  b: [0x7f, 0x48, 0x44, 0x44, 0x38],
  c: [0x38, 0x44, 0x44, 0x44, 0x20],
  d: [0x38, 0x44, 0x44, 0x48, 0x7f],
  e: [0x38, 0x54, 0x54, 0x54, 0x18],
  f: [0x08, 0x7e, 0x09, 0x01, 0x02],
  g: [0x0c, 0x52, 0x52, 0x52, 0x3e],
  h: [0x7f, 0x08, 0x04, 0x04, 0x78],
  i: [0x00, 0x44, 0x7d, 0x40, 0x00],
  j: [0x20, 0x40, 0x44, 0x3d, 0x00],
  k: [0x7f, 0x10, 0x28, 0x44, 0x00],
  l: [0x00, 0x41, 0x7f, 0x40, 0x00],
  m: [0x7c, 0x04, 0x18, 0x04, 0x78],
  n: [0x7c, 0x08, 0x04, 0x04, 0x78],
  o: [0x38, 0x44, 0x44, 0x44, 0x38],
  p: [0x7c, 0x14, 0x14, 0x14, 0x08],
  q: [0x08, 0x14, 0x14, 0x18, 0x7c],
  r: [0x7c, 0x08, 0x04, 0x04, 0x08],
  s: [0x48, 0x54, 0x54, 0x54, 0x20],
  t: [0x04, 0x3f, 0x44, 0x40, 0x20],
  u: [0x3c, 0x40, 0x40, 0x20, 0x7c],
  v: [0x1c, 0x20, 0x40, 0x20, 0x1c],
  w: [0x3c, 0x40, 0x30, 0x40, 0x3c],
  x: [0x44, 0x28, 0x10, 0x28, 0x44],
  y: [0x0c, 0x50, 0x50, 0x50, 0x3c],
  z: [0x44, 0x64, 0x54, 0x4c, 0x44],
  "{": [0x00, 0x08, 0x36, 0x41, 0x00],
  "|": [0x00, 0x00, 0x7f, 0x00, 0x00],
  "}": [0x00, 0x41, 0x36, 0x08, 0x00],
  "~": [0x08, 0x04, 0x08, 0x10, 0x08],
};

const FALLBACK_GLYPH: number[] = [0x00, 0x00, 0x51, 0x09, 0x06]; // "?"

const glyphOf = (ch: string): number[] => FONT_5X7[ch] ?? FALLBACK_GLYPH;

/** Glyph advance width in font pixels (5 + 1 spacing). */
export const FONT_ADVANCE = 6;
export const FONT_HEIGHT = 7;

// ---------------------------------------------------------------------------
// Buffers
// ---------------------------------------------------------------------------

/** 1-bit monochrome panel (SSD1306 / SH1106 / e-paper / MAX7219). */
export class MonoBuffer {
  readonly w: number;
  readonly h: number;
  readonly bits: Uint8Array;
  dirty = true;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.bits = new Uint8Array(Math.ceil((w * h) / 8));
  }
  private idx(x: number, y: number): [number, number] {
    const i = y * this.w + x;
    return [i >> 3, 1 << (i & 7)];
  }
  pixel(x: number, y: number, on: boolean): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [byte, bit] = this.idx(x, y);
    if (on) this.bits[byte] = (this.bits[byte] ?? 0) | bit;
    else this.bits[byte] = (this.bits[byte] ?? 0) & ~bit;
    this.dirty = true;
  }
  get(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const [byte, bit] = this.idx(x, y);
    return ((this.bits[byte] ?? 0) & bit) !== 0;
  }
  clear(): void {
    this.bits.fill(0);
    this.dirty = true;
  }
  fill(): void {
    this.bits.fill(0xff);
    this.dirty = true;
  }
}

/** RGB color panel (ST7735 / ILI9341). RGBA8. */
export class ColorBuffer {
  readonly w: number;
  readonly h: number;
  readonly rgba: Uint8ClampedArray;
  dirty = true;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.rgba = new Uint8ClampedArray(w * h * 4);
  }
  pixel(x: number, y: number, r: number, g2: number, b: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.rgba[i] = r;
    this.rgba[i + 1] = g2;
    this.rgba[i + 2] = b;
    this.rgba[i + 3] = 255;
    this.dirty = true;
  }
  fillRGB(r: number, g2: number, b: number): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) this.pixel(x, y, r, g2, b);
  }
  clear(): void {
    this.rgba.fill(0);
    this.dirty = true;
  }
}

/** Character-cell LCD (HD44780 16x2). */
export class CharGridBuffer {
  readonly cols: number;
  readonly rows: number;
  readonly cells: string[][];
  dirty = true;
  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.cells = Array.from({ length: rows }, () =>
      Array<string>(cols).fill(" "),
    );
  }
  set(col: number, row: number, ch: string): void {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    this.cells[row]![col] = ch[0] ?? " ";
    this.dirty = true;
  }
  text(str: string, col: number, row: number): void {
    [...str].forEach((ch, i) => this.set(col + i, row, ch));
  }
  clear(): void {
    for (const row of this.cells) row.fill(" ");
    this.dirty = true;
  }
  line(row: number): string {
    return (this.cells[row] ?? []).join("");
  }
}

// ---------------------------------------------------------------------------
// Text rendering helpers on pixel buffers
// ---------------------------------------------------------------------------

export function drawGlyph5x7(
  mono: {
    w: number;
    h: number;
    pixel(x: number, y: number, on: boolean): void;
  },
  ch: string,
  x: number,
  y: number,
  on = true,
  scale = 1,
): void {
  const glyph = glyphOf(ch);
  for (let col = 0; col < 5; col++) {
    const bits = glyph[col] ?? 0;
    for (let row = 0; row < FONT_HEIGHT; row++) {
      const on2 = (bits >> row) & 1;
      if (!on2) continue;
      for (let sx = 0; sx < scale; sx++)
        for (let sy = 0; sy < scale; sy++)
          mono.pixel(x + col * scale + sx, y + row * scale + sy, on);
    }
  }
}

export function drawText5x7(
  mono: {
    w: number;
    h: number;
    pixel(x: number, y: number, on: boolean): void;
  },
  str: string,
  x: number,
  y: number,
  on = true,
  scale = 1,
): void {
  let cx = x;
  for (const ch of str) {
    if (ch === "\n") {
      cx = x;
      y += (FONT_HEIGHT + 2) * scale;
      continue;
    }
    drawGlyph5x7(mono, ch, cx, y, on, scale);
    cx += FONT_ADVANCE * scale;
  }
}

export function drawTextRGB(
  buf: ColorBuffer,
  str: string,
  x: number,
  y: number,
  color: [number, number, number],
  scale = 1,
): void {
  let cx = x;
  for (const ch of str) {
    if (ch === "\n") {
      cx = x;
      y += (FONT_HEIGHT + 2) * scale;
      continue;
    }
    const glyph = glyphOf(ch);
    for (let col = 0; col < 5; col++) {
      const bits = glyph[col] ?? 0;
      for (let row = 0; row < FONT_HEIGHT; row++) {
        if (!((bits >> row) & 1)) continue;
        for (let sx = 0; sx < scale; sx++)
          for (let sy = 0; sy < scale; sy++)
            buf.pixel(
              cx + col * scale + sx,
              y + row * scale + sy,
              color[0],
              color[1],
              color[2],
            );
      }
    }
    cx += FONT_ADVANCE * scale;
  }
}

export function fillRectMono(
  mono: {
    w: number;
    h: number;
    pixel(x: number, y: number, on: boolean): void;
  },
  x: number,
  y: number,
  w: number,
  h: number,
  on = true,
): void {
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) mono.pixel(x + xx, y + yy, on);
}

// ---------------------------------------------------------------------------
// Drivers (implement DisplayBackend for the runtime)
// ---------------------------------------------------------------------------

/** SSD1306 / SH1106 / e-paper: monochrome pixel canvas. */
export class MonoDriver implements DisplayBackend {
  readonly buffer: MonoBuffer;
  readonly size: [number, number];
  constructor(w: number, h: number) {
    this.buffer = new MonoBuffer(w, h);
    this.size = [w, h];
  }
  clear(): void {
    this.buffer.clear();
  }
  text(str: string, x: number, y: number): void {
    drawText5x7(this.buffer, str, x, y, true);
  }
  pixel(x: number, y: number, on: boolean): void {
    this.buffer.pixel(x, y, on);
  }
  rect(x: number, y: number, w: number, h: number, fill?: boolean): void {
    if (fill) {
      fillRectMono(this.buffer, x, y, w, h, true);
      return;
    }
    for (let i = 0; i < w; i++) {
      this.buffer.pixel(x + i, y, true);
      this.buffer.pixel(x + i, y + h - 1, true);
    }
    for (let j = 0; j < h; j++) {
      this.buffer.pixel(x, y + j, true);
      this.buffer.pixel(x + w - 1, y + j, true);
    }
  }
  fill(): void {
    this.buffer.fill();
  }
}

/** ST7735 / ILI9341: RGB canvas. `color` args are packed 0xRRGGBB. */
export class ColorDriver implements DisplayBackend {
  readonly buffer: ColorBuffer;
  readonly size: [number, number];
  constructor(w: number, h: number) {
    this.buffer = new ColorBuffer(w, h);
    this.size = [w, h];
  }
  private unpack(color: number | undefined): [number, number, number] {
    const c = color ?? 0xffffff;
    return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
  }
  clear(): void {
    this.buffer.clear();
  }
  fill(color?: number): void {
    const [r, g2, b] = this.unpack(color);
    this.buffer.fillRGB(r, g2, b);
  }
  text(str: string, x: number, y: number, color?: number): void {
    drawTextRGB(this.buffer, str, x, y, this.unpack(color), 2);
  }
  pixel(x: number, y: number, on: boolean, color?: number): void {
    const [r, g2, b] = on
      ? this.unpack(color)
      : ([0, 0, 0] as [number, number, number]);
    this.buffer.pixel(x, y, r, g2, b);
  }
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill?: boolean,
    color?: number,
  ): void {
    const [r, g2, b] = this.unpack(color ?? 0xffffff);
    const x2 = Math.min(x + w, this.buffer.w);
    const y2 = Math.min(y + h, this.buffer.h);
    for (let yy = Math.max(0, y); yy < y2; yy++)
      for (let xx = Math.max(0, x); xx < x2; xx++) {
        const edge = xx === x || yy === y || xx === x2 - 1 || yy === y2 - 1;
        if (fill || edge) this.buffer.pixel(xx, yy, r, g2, b);
      }
  }
}

/** HD44780 16x2 via I2C backpack: character grid. */
export class CharLcdDriver implements DisplayBackend {
  readonly grid: { cols: number; rows: number };
  readonly buffer: CharGridBuffer;
  readonly size: [number, number];
  constructor(cols: number, rows: number) {
    this.grid = { cols, rows };
    this.buffer = new CharGridBuffer(cols, rows);
    this.size = [cols, rows];
  }
  clear(): void {
    this.buffer.clear();
  }
  text(str: string, x: number, y: number): void {
    this.buffer.text(String(str), x, y);
  }
  pixel(): void {
    /* no pixels on a character LCD */
  }
  rect(): void {
    /* no rects on a character LCD */
  }
  fill(): void {
    this.buffer.clear();
  }
}

/** TM1637 4-digit 7-segment. */
export class SevenSegDriver implements DisplayBackend {
  readonly size: [number, number] = [4, 1];
  digits: (string | null)[] = [null, null, null, null];
  dirty = true;
  private colon = false;
  clear(): void {
    this.digits = [null, null, null, null];
    this.dirty = true;
  }
  /** "12:34" style strings land left-aligned on the 4 digits. */
  text(str: string): void {
    const clean = str.replace(/[^0-9:-]/g, "");
    this.colon = clean.includes(":");
    const nums = clean.replace(/:/g, "").slice(0, 4).split("");
    while (nums.length < 4) nums.push(" ");
    this.digits = nums.map((c) => (/[0-9]/.test(c) ? c : " "));
    this.dirty = true;
  }
  text2(str: string, _x: number, _y: number): void {
    this.text(str);
  }
  pixel(): void {
    /* digits only */
  }
  rect(): void {
    /* digits only */
  }
  fill(): void {
    this.clear();
  }
  get showColon(): boolean {
    return this.colon;
  }
}

/** MAX7219 8x8 matrix — MonoBuffer at part resolution. */
export class MatrixDriver extends MonoDriver {
  constructor() {
    super(8, 8);
  }
}

/** Display backend factory from a DisplayPart. */
export function makeDisplayBackend(
  driver: string,
  res: { w: number; h: number },
  grid?: { cols: number; rows: number },
): DisplayBackend & { buffer?: unknown } {
  switch (driver) {
    case "ssd1306":
    case "sh1106":
    case "epaper":
      return new MonoDriver(res.w, res.h);
    case "st7735":
    case "ili9341":
      return new ColorDriver(res.w, res.h);
    case "hd44780":
      return new CharLcdDriver(grid?.cols ?? 16, grid?.rows ?? 2);
    case "tm1637":
      return new SevenSegDriver();
    case "max7219":
      return new MatrixDriver();
    default:
      return new MonoDriver(res.w, res.h);
  }
}
