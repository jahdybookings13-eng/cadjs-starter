import type { SketchLine, SketchPoint, SketchPrimitive } from "@vitekk02/cadjs";

/**
 * A compact single-stroke engraving font. Glyphs live on a 4 x 6 grid with the
 * baseline at y=0. Text is emitted as ordinary sketch lines, not a new
 * primitive type, so it can be constrained, trimmed, patterned and finished
 * like any other profile geometry.
 */
type Stroke = readonly (readonly [number, number])[];
type Glyph = readonly Stroke[];

const GLYPHS: Record<string, Glyph> = {
  A: [
    [
      [0, 0],
      [0, 4],
      [2, 6],
      [4, 4],
      [4, 0],
    ],
    [
      [0, 3],
      [4, 3],
    ],
  ],
  B: [
    [
      [0, 0],
      [0, 6],
      [3, 6],
      [4, 5],
      [4, 4],
      [3, 3],
      [0, 3],
    ],
    [
      [3, 3],
      [4, 2],
      [4, 1],
      [3, 0],
      [0, 0],
    ],
  ],
  C: [
    [
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
    ],
  ],
  D: [
    [
      [0, 0],
      [0, 6],
      [2, 6],
      [4, 4],
      [4, 2],
      [2, 0],
      [0, 0],
    ],
  ],
  E: [
    [
      [4, 6],
      [0, 6],
      [0, 0],
      [4, 0],
    ],
    [
      [0, 3],
      [3, 3],
    ],
  ],
  F: [
    [
      [4, 6],
      [0, 6],
      [0, 0],
    ],
    [
      [0, 3],
      [3, 3],
    ],
  ],
  G: [
    [
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 3],
      [2, 3],
    ],
  ],
  H: [
    [
      [0, 0],
      [0, 6],
    ],
    [
      [4, 0],
      [4, 6],
    ],
    [
      [0, 3],
      [4, 3],
    ],
  ],
  I: [
    [
      [1, 6],
      [3, 6],
    ],
    [
      [2, 6],
      [2, 0],
    ],
    [
      [1, 0],
      [3, 0],
    ],
  ],
  J: [
    [
      [4, 6],
      [4, 1],
      [3, 0],
      [1, 0],
      [0, 1],
    ],
  ],
  K: [
    [
      [0, 0],
      [0, 6],
    ],
    [
      [4, 6],
      [0, 3],
      [4, 0],
    ],
  ],
  L: [
    [
      [0, 6],
      [0, 0],
      [4, 0],
    ],
  ],
  M: [
    [
      [0, 0],
      [0, 6],
      [2, 3],
      [4, 6],
      [4, 0],
    ],
  ],
  N: [
    [
      [0, 0],
      [0, 6],
      [4, 0],
      [4, 6],
    ],
  ],
  O: [
    [
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
      [0, 1],
      [1, 0],
    ],
  ],
  P: [
    [
      [0, 0],
      [0, 6],
      [3, 6],
      [4, 5],
      [4, 4],
      [3, 3],
      [0, 3],
    ],
  ],
  Q: [
    [
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
      [0, 1],
      [1, 0],
    ],
    [
      [2, 2],
      [4, 0],
    ],
  ],
  R: [
    [
      [0, 0],
      [0, 6],
      [3, 6],
      [4, 5],
      [4, 4],
      [3, 3],
      [0, 3],
    ],
    [
      [2, 3],
      [4, 0],
    ],
  ],
  S: [
    [
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
      [0, 4],
      [1, 3],
      [3, 3],
      [4, 2],
      [4, 1],
      [3, 0],
      [1, 0],
      [0, 1],
    ],
  ],
  T: [
    [
      [0, 6],
      [4, 6],
    ],
    [
      [2, 6],
      [2, 0],
    ],
  ],
  U: [
    [
      [0, 6],
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 6],
    ],
  ],
  V: [
    [
      [0, 6],
      [2, 0],
      [4, 6],
    ],
  ],
  W: [
    [
      [0, 6],
      [1, 0],
      [2, 4],
      [3, 0],
      [4, 6],
    ],
  ],
  X: [
    [
      [0, 0],
      [4, 6],
    ],
    [
      [0, 6],
      [4, 0],
    ],
  ],
  Y: [
    [
      [0, 6],
      [2, 3],
      [4, 6],
    ],
    [
      [2, 3],
      [2, 0],
    ],
  ],
  Z: [
    [
      [0, 6],
      [4, 6],
      [0, 0],
      [4, 0],
    ],
  ],
  "0": [
    [
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
      [0, 1],
      [1, 0],
    ],
    [
      [1, 1],
      [3, 5],
    ],
  ],
  "1": [
    [
      [1, 5],
      [2, 6],
      [2, 0],
    ],
    [
      [1, 0],
      [3, 0],
    ],
  ],
  "2": [
    [
      [0, 5],
      [1, 6],
      [3, 6],
      [4, 5],
      [4, 4],
      [0, 0],
      [4, 0],
    ],
  ],
  "3": [
    [
      [0, 6],
      [4, 6],
      [2, 3],
      [4, 1],
      [3, 0],
      [1, 0],
      [0, 1],
    ],
  ],
  "4": [
    [
      [3, 0],
      [3, 6],
      [0, 2],
      [4, 2],
    ],
  ],
  "5": [
    [
      [4, 6],
      [0, 6],
      [0, 3],
      [3, 3],
      [4, 2],
      [4, 1],
      [3, 0],
      [1, 0],
      [0, 1],
    ],
  ],
  "6": [
    [
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 2],
      [3, 3],
      [0, 3],
    ],
  ],
  "7": [
    [
      [0, 6],
      [4, 6],
      [1, 0],
    ],
  ],
  "8": [
    [
      [1, 3],
      [0, 4],
      [0, 5],
      [1, 6],
      [3, 6],
      [4, 5],
      [4, 4],
      [3, 3],
      [1, 3],
      [0, 2],
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 2],
      [3, 3],
    ],
  ],
  "9": [
    [
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
      [0, 4],
      [1, 3],
      [4, 3],
    ],
  ],
  ".": [
    [
      [2, 0],
      [2, 0.4],
    ],
  ],
  ",": [
    [
      [2.4, 0.5],
      [1.4, -1],
    ],
  ],
  "-": [
    [
      [1, 3],
      [3, 3],
    ],
  ],
  "+": [
    [
      [2, 1],
      [2, 5],
    ],
    [
      [0, 3],
      [4, 3],
    ],
  ],
  "/": [
    [
      [0, 0],
      [4, 6],
    ],
  ],
  "\\": [
    [
      [0, 6],
      [4, 0],
    ],
  ],
  ":": [
    [
      [2, 1],
      [2, 1.4],
    ],
    [
      [2, 4],
      [2, 4.4],
    ],
  ],
  "!": [
    [
      [2, 6],
      [2, 1.8],
    ],
    [
      [2, 0],
      [2, 0.5],
    ],
  ],
  "?": [
    [
      [0, 5],
      [1, 6],
      [3, 6],
      [4, 5],
      [4, 4],
      [2, 2.5],
      [2, 1.8],
    ],
    [
      [2, 0],
      [2, 0.5],
    ],
  ],
  "(": [
    [
      [3, 6],
      [1, 4],
      [1, 2],
      [3, 0],
    ],
  ],
  ")": [
    [
      [1, 6],
      [3, 4],
      [3, 2],
      [1, 0],
    ],
  ],
  "[": [
    [
      [3, 6],
      [1, 6],
      [1, 0],
      [3, 0],
    ],
  ],
  "]": [
    [
      [1, 6],
      [3, 6],
      [3, 0],
      [1, 0],
    ],
  ],
  "'": [
    [
      [2, 6],
      [2, 4.5],
    ],
  ],
  '"': [
    [
      [1.5, 6],
      [1.5, 4.5],
    ],
    [
      [2.5, 6],
      [2.5, 4.5],
    ],
  ],
  "=": [
    [
      [0, 4],
      [4, 4],
    ],
    [
      [0, 2],
      [4, 2],
    ],
  ],
  "<": [
    [
      [4, 6],
      [0, 3],
      [4, 0],
    ],
  ],
  ">": [
    [
      [0, 6],
      [4, 3],
      [0, 0],
    ],
  ],
  _: [
    [
      [0, 0],
      [4, 0],
    ],
  ],
  "*": [
    [
      [2, 1],
      [2, 5],
    ],
    [
      [0.5, 2],
      [3.5, 4],
    ],
    [
      [0.5, 4],
      [3.5, 2],
    ],
  ],
  "%": [
    [
      [0, 0],
      [4, 6],
    ],
    [
      [0, 5],
      [1, 6],
      [1, 5],
      [0, 5],
    ],
    [
      [3, 0],
      [4, 1],
      [4, 0],
      [3, 0],
    ],
  ],
};

export interface TextToSketchOptions {
  x?: number;
  y?: number;
  height?: number;
  rotation?: number;
  generateId: (prefix: string) => string;
}

export interface TextToSketchResult {
  points: SketchPoint[];
  primitives: SketchPrimitive[];
  width: number;
  height: number;
  lineCount: number;
}

const GLYPH_WIDTH = 4;
const GLYPH_HEIGHT = 6;
const ADVANCE = 6;

export function normalizedGlyph(char: string): string {
  return char.toUpperCase();
}

/** Width of a single line of text in sketch units. */
export function sketchTextWidth(text: string, height: number): number {
  if (text.length === 0) return 0;
  return ((text.length - 1) * ADVANCE + GLYPH_WIDTH) * (height / GLYPH_HEIGHT);
}

/**
 * Convert text to line primitives. Lowercase is folded to uppercase because
 * this is a single-stroke engineering font. Newlines start a new baseline;
 * unsupported characters render as a blank advance.
 */
export function textToSketchPrimitives(
  text: string,
  options: TextToSketchOptions,
): TextToSketchResult {
  const height = Math.max(0.01, options.height ?? 10);
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const rotation = options.rotation ?? 0;
  const scale = height / GLYPH_HEIGHT;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const originX = x;
  const originY = y;
  const points: SketchPoint[] = [];
  const primitives: SketchPrimitive[] = [];
  let width = 0;
  let cursorX = 0;
  let cursorY = 0;

  const map = (gx: number, gy: number) => {
    const sx = gx * scale;
    const sy = gy * scale;
    return {
      x: originX + cursorX + sx * cos - sy * sin,
      y: originY + cursorY + sx * sin + sy * cos,
    };
  };

  for (const char of text) {
    if (char === "\n") {
      width = Math.max(width, cursorX);
      cursorX = 0;
      cursorY -= ADVANCE * scale;
      continue;
    }
    const glyph = GLYPHS[normalizedGlyph(char)];
    if (!glyph) {
      cursorX += ADVANCE * scale;
      continue;
    }

    const localPoints = new Map<string, SketchPoint>();
    const point = (gx: number, gy: number): SketchPoint => {
      const key = `${gx},${gy}`;
      const existing = localPoints.get(key);
      if (existing) return existing;
      const p = map(gx, gy);
      const created: SketchPoint = {
        id: options.generateId("pt"),
        type: "point",
        x: p.x,
        y: p.y,
      };
      localPoints.set(key, created);
      points.push(created);
      return created;
    };

    for (const stroke of glyph) {
      for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1]!;
        const b = stroke[i]!;
        const p1 = point(a[0], a[1]);
        const p2 = point(b[0], b[1]);
        if (p1.id === p2.id) continue;
        primitives.push({
          id: options.generateId("ln"),
          type: "line",
          p1Id: p1.id,
          p2Id: p2.id,
        } satisfies SketchLine);
      }
    }
    cursorX += ADVANCE * scale;
  }

  width = Math.max(
    width,
    Math.max(0, cursorX - (ADVANCE - GLYPH_WIDTH) * scale),
  );
  return {
    points,
    primitives,
    width,
    height: Math.abs(cursorY) + height,
    lineCount: primitives.length,
  };
}
