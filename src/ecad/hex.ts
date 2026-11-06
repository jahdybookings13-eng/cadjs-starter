// ecad/hex.ts — Intel HEX utilities + a tiny AVR assembler used to build the
// firmware binaries SHIPPED with the catalog (no local toolchain required).
//
// Every generated program is proven against avr8js in __tests__/hex.test.ts:
// the test runs the hex instruction-by-instruction and asserts the LED pin
// toggles with the right period. Encodings verified empirically:
//   sbi/cbi  1001 101x AAAA Abbb / 1001 1000 AAAA Abbb
//   ldi      1110 KKKK dddd KKKK (d = reg-16)
//   sbiw     0x9701 == sbiw r24,1
//   brne     1111 01kk kkkk kkkk (relative word offset)
//   rjmp     1100 kkkk kkkk kkkk
//   dec      1001 010d dddd 1010

export interface HexRecord {
  length: number;
  address: number;
  type: number;
  data: number[];
}

/** Parse an Intel HEX string into byte-addressed flash image chunks. */
export function parseHex(source: string): HexRecord[] {
  const records: HexRecord[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith(":")) continue;
    const bytes: number[] = [];
    for (let i = 1; i < line.length; i += 2)
      bytes.push(parseInt(line.slice(i, i + 2), 16));
    if (bytes.length < 5) continue;
    const length = bytes[0] ?? 0;
    const hi = bytes[1] ?? 0;
    const lo = bytes[2] ?? 0;
    const type = bytes[3] ?? 0xff;
    const rest = bytes.slice(4);
    if (length !== rest.length - 1) continue; // incl. checksum byte
    records.push({
      length,
      address: (hi << 8) | lo,
      type,
      data: rest.slice(0, length),
    });
  }
  return records;
}

/** Expand Intel HEX records into a sparse flash byte image (byte-addressed). */
export function flashImage(source: string, sizeBytes: number): Uint8Array {
  const image = new Uint8Array(sizeBytes);
  let high = 0;
  for (const rec of parseHex(source)) {
    if (rec.type === 0x00) {
      const base = high * 0x10000 + rec.address;
      rec.data.forEach((b, i) => {
        if (base + i < sizeBytes) image[base + i] = b;
      });
    } else if (rec.type === 0x04) {
      high = ((rec.data[0] ?? 0) << 8) | (rec.data[1] ?? 0);
    } else if (rec.type === 0x01) {
      break;
    }
  }
  return image;
}

function checksum(bytes: number[]): number {
  const sum = bytes.reduce((a, b) => a + b, 0);
  return -sum & 0xff;
}

/** Serialize a byte-addressed flash image (packed little-endian words) to Intel HEX. */
export function toHex(image: Uint8Array, wordCount: number): string {
  const lines: string[] = [];
  for (let w = 0; w < wordCount; w++) {
    const addr = w * 2;
    const lo = image[addr] ?? 0;
    const hi = image[addr + 1] ?? 0;
    if (lo === 0 && hi === 0) continue;
    const body = [2, (addr >> 8) & 0xff, addr & 0xff, 0x00, lo, hi];
    lines.push(
      `:${body.map((b) => b.toString(16).padStart(2, "0")).join("")}${checksum(body).toString(16).padStart(2, "0")}`,
    );
  }
  lines.push(":00000001FF");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// AVR assembler (the exact instructions the shipped firmware needs)
// ---------------------------------------------------------------------------

export const sbi = (ioAddr: number, bit: number): number =>
  0x9a00 | ((ioAddr & 0x1f) << 3) | (bit & 7);
export const cbi = (ioAddr: number, bit: number): number =>
  0x9800 | ((ioAddr & 0x1f) << 3) | (bit & 7);
export const ldi = (reg: number, imm: number): number =>
  0xe000 | ((imm & 0xf0) << 4) | ((reg - 16) << 4) | (imm & 0x0f);
export const dec = (reg: number): number =>
  0x9400 | (((reg >> 4) & 1) << 8) | ((reg & 0xf) << 4) | 0x0a;
export const sbiw = (reg: number, imm: number): number =>
  0x9700 | (((imm >> 4) & 0x3) << 8) | (((reg / 2) & 0x3) << 4) | (imm & 0xf);
export const rjmp = (k: number): number => 0xc000 | (k & 0xfff);
export const brne = (k: number): number => 0xf400 | ((k & 0x7f) << 3) | 0x1;

export const IORD = 0x20; // IO address -> data-space address offset (328P)

/**
 * Blink firmware for ATmega328P boards (Arduino Uno / Nano): toggles the
 * on-board LED pin (PB5, Arduino D13) with a ~262 ms software delay loop —
 * roughly 524 ms full period at 16 MHz. No Arduino core, no interrupts, no
 * stack: pure register loops so it runs identically under avr8js.
 */
export function assembleBlink(
  port: "B" | "C" | "D",
  bit: number,
  outerLoops = 16,
): number[] {
  const portIo = { A: 0x02, B: 0x05, C: 0x08, D: 0x0b }[port]; // PORTx IO addr (328P)
  const ddrIo = portIo - 1; // DDRx directly below PORTx on AVR
  const prog: number[] = [];
  prog.push(sbi(ddrIo, bit)); // 0: DDRx |= bit
  const loopStart = 1;
  prog.push(sbi(portIo, bit)); // on
  const delayStart = prog.length;
  // delay: outer(16) x inner(65535 x (sbiw+brne) = 4 cycles) ~ 262k cycles
  prog.push(ldi(26, outerLoops));
  const outer = prog.length;
  prog.push(ldi(24, 0xff));
  prog.push(ldi(25, 0xff));
  const inner = prog.length;
  prog.push(sbiw(24, 1));
  prog.push(brne(-2)); // back to the sbiw (relative to the next instruction)
  prog.push(dec(26));
  prog.push(brne(outer - (prog.length + 1))); // to outer
  prog.push(cbi(portIo, bit)); // off
  // second delay (reuse same body, inlined)
  prog.push(ldi(26, outerLoops));
  const outer2 = prog.length;
  prog.push(ldi(24, 0xff));
  prog.push(ldi(25, 0xff));
  const inner2 = prog.length;
  prog.push(sbiw(24, 1));
  prog.push(brne(-2));
  prog.push(dec(26));
  prog.push(brne(outer2 - (prog.length + 1)));
  prog.push(rjmp(loopStart - (prog.length + 1)));
  void delayStart;
  void inner;
  void inner2;
  return prog;
}

/** Words -> byte image (little-endian), ready for toHex(). */
export function wordsToImage(words: number[], sizeWords = 1024): Uint8Array {
  const image = new Uint8Array(sizeWords * 2);
  words.forEach((w, i) => {
    image[i * 2] = w & 0xff;
    image[i * 2 + 1] = (w >> 8) & 0xff;
  });
  return image;
}

/**
 * The shipped Uno blink .hex — assembled at module load, verified by tests
 * running it under avr8js and asserting PORTB5 toggling.
 */
export const UNO_BLINK_HEX = toHex(
  wordsToImage(assembleBlink("B", 5), 1024),
  1024,
);

/** Same program for Arduino Nano (also ATmega328P, LED on PB5/D13). */
export const NANO_BLINK_HEX = UNO_BLINK_HEX;
