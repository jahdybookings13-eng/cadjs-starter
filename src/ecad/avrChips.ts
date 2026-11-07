// ecad/avrChips.ts — the AVR chip truth the emulator needs, per MCU.
//
// Every constant here was read from the avr-libc device headers that ship
// inside @horang-corp/avr-gcc-wasm (iom328p.h, iomxx0_1.h for the ATmega2560,
// iom32u4.h, iotnx5.h for the ATtiny85), converted to the **data-space**
// addresses avr8js uses (I/O address + 0x20) and word offsets for interrupt
// slots. The 328P profile reproduces avr8js's own timer0/1/2 configs exactly,
// which is why the existing Uno/Nano behaviour is unchanged.
//
// avr8js is not 328P-only: the CPU takes the flash size and SRAM end and turns
// on a 22-bit program counter above 128 KB, ports A–L are exported, and the
// library ships an ATtiny25/45/85 Timer1 plus USI. What was missing was the
// per-chip register map — that is this file.
//
// What is *not* here: the in-browser C++ toolchain. Its prebuilt Arduino core
// objects, crt and avr5 libc are ATmega328P artefacts, so `buildable` stays
// true only for the 328P; the other chips run a .hex you built elsewhere.
//
// Pure data + lookups: no avr8js, no DOM, so this is node-testable.

export type AvrChipId = "ATmega328P" | "ATmega2560" | "ATmega32U4" | "ATtiny85";

export interface AvrPortSpec {
  letter: string;
  /** Data-space addresses of PINx / DDRx / PORTx. */
  PIN: number;
  DDR: number;
  PORT: number;
}

export interface AvrTimerRegs {
  kind: "avr-timer";
  name: string;
  bits: 8 | 16;
  TCCRA: number;
  TCCRB: number;
  TCCRC: number;
  TCNT: number;
  OCRA: number;
  OCRB: number;
  OCRC: number;
  ICR: number;
  TIFR: number;
  TIMSK: number;
  captureInterrupt: number;
  compAInterrupt: number;
  compBInterrupt: number;
  ovfInterrupt: number;
  TOV: number;
  OCFA: number;
  OCFB: number;
  TOIE: number;
  OCIEA: number;
  OCIEB: number;
  /** Prescaler per CS value (index = CS). */
  dividers: readonly number[];
  compPortA?: number;
  compPinA?: number;
  compPortB?: number;
  compPinB?: number;
  externalClockPort?: number;
  externalClockPin?: number;
}

export interface AvrAttinyTimerSpec {
  kind: "attiny-timer1";
  name: string;
}

export type AvrTimerSpec = AvrTimerRegs | AvrAttinyTimerSpec;

export interface AvrUsartSpec {
  name: string;
  rxCompleteInterrupt: number;
  dataRegisterEmptyInterrupt: number;
  txCompleteInterrupt: number;
  UCSRA: number;
  UCSRB: number;
  UCSRC: number;
  UBRRL: number;
  UBRRH: number;
  UDR: number;
}

export interface AvrChipProfile {
  id: AvrChipId;
  /** Catalog mcu string, uppercased for matching. */
  mcu: string;
  flashBytes: number;
  /** RAMEND from the device header. */
  ramEnd: number;
  clockHz: number;
  ports: AvrPortSpec[];
  timers: AvrTimerSpec[];
  usarts: AvrUsartSpec[];
  /** TWI register block (0xB8.. on every chip that has one). */
  twi: { twiInterrupt: number } | null;
  /** True only when the shipped wasm toolchain has core objects for this MCU. */
  buildable: boolean;
  /** One-line honest note about the serial path, when it is not plain USART0. */
  serialNote?: string;
}

const TIMER01_DIVIDERS = [0, 1, 8, 64, 256, 1024, 0, 0] as const;
const TIMER2_DIVIDERS = [0, 1, 8, 32, 64, 128, 256, 1024] as const;

/** Data-space port addresses: I/O + 0x20 for I/O-mapped, header value otherwise. */
const PORT = (letter: string, io: number): AvrPortSpec => ({
  letter,
  PIN: io,
  DDR: io + 1,
  PORT: io + 2,
});

type TimerInit = Omit<
  AvrTimerRegs,
  | "kind"
  | "TOV"
  | "OCFA"
  | "OCFB"
  | "TOIE"
  | "OCIEA"
  | "OCIEB"
  | "TCCRC"
  | "OCRC"
> &
  Partial<
    Pick<
      AvrTimerRegs,
      "TOV" | "OCFA" | "OCFB" | "TOIE" | "OCIEA" | "OCIEB" | "TCCRC" | "OCRC"
    >
  >;

/** 8/16-bit timer with the 328P-family TIFR/TIMSK bit layout unless overridden. */
function timer(init: TimerInit): AvrTimerRegs {
  return {
    kind: "avr-timer",
    TOV: 1,
    OCFA: 2,
    OCFB: 4,
    TOIE: 1,
    OCIEA: 2,
    OCIEB: 4,
    TCCRC: 0,
    OCRC: 0,
    ...init,
  };
}

const usart = (
  name: string,
  base: number,
  rxCompleteInterrupt: number,
  dataRegisterEmptyInterrupt: number,
  txCompleteInterrupt: number,
): AvrUsartSpec => ({
  name,
  rxCompleteInterrupt,
  dataRegisterEmptyInterrupt,
  txCompleteInterrupt,
  UCSRA: base,
  UCSRB: base + 1,
  UCSRC: base + 2,
  UBRRL: base + 4,
  UBRRH: base + 5,
  UDR: base + 6,
});

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const atmega328p: AvrChipProfile = {
  id: "ATmega328P",
  mcu: "ATMEGA328P",
  flashBytes: 32 * 1024, // FLASHEND 0x7FFF
  ramEnd: 0x8ff,
  clockHz: 16_000_000,
  ports: [PORT("B", 0x23), PORT("C", 0x26), PORT("D", 0x29)],
  timers: [
    timer({
      name: "Timer0",
      bits: 8,
      TCCRA: 0x44,
      TCCRB: 0x45,
      TCNT: 0x46,
      OCRA: 0x47,
      OCRB: 0x48,
      ICR: 0,
      TIFR: 0x35,
      TIMSK: 0x6e,
      captureInterrupt: 0,
      compAInterrupt: 0x1c,
      compBInterrupt: 0x1e,
      ovfInterrupt: 0x20,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x2b,
      compPinA: 6,
      compPortB: 0x2b,
      compPinB: 5,
      externalClockPort: 0x2b,
      externalClockPin: 4,
    }),
    timer({
      name: "Timer1",
      bits: 16,
      TCCRA: 0x80,
      TCCRB: 0x81,
      TCCRC: 0x82,
      TCNT: 0x84,
      OCRA: 0x88,
      OCRB: 0x8a,
      ICR: 0x86,
      TIFR: 0x36,
      TIMSK: 0x6f,
      captureInterrupt: 0x14,
      compAInterrupt: 0x16,
      compBInterrupt: 0x18,
      ovfInterrupt: 0x1a,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x25,
      compPinA: 1,
      compPortB: 0x25,
      compPinB: 2,
      externalClockPort: 0x2b,
      externalClockPin: 5,
    }),
    timer({
      name: "Timer2",
      bits: 8,
      TCCRA: 0xb0,
      TCCRB: 0xb1,
      TCNT: 0xb2,
      OCRA: 0xb3,
      OCRB: 0xb4,
      ICR: 0,
      TIFR: 0x37,
      TIMSK: 0x70,
      captureInterrupt: 0,
      compAInterrupt: 0x0e,
      compBInterrupt: 0x10,
      ovfInterrupt: 0x12,
      dividers: TIMER2_DIVIDERS,
      compPortA: 0x25,
      compPinA: 3,
      compPortB: 0x2b,
      compPinB: 3,
    }),
  ],
  usarts: [usart("USART0", 0xc0, 0x24, 0x26, 0x28)],
  twi: { twiInterrupt: 0x30 }, // TWI_vect 24 × 2
  buildable: true,
};

const atmega2560: AvrChipProfile = {
  id: "ATmega2560",
  mcu: "ATMEGA2560",
  flashBytes: 256 * 1024, // FLASHEND 0x3FFFF → 22-bit PC in avr8js
  ramEnd: 0x21ff,
  clockHz: 16_000_000,
  ports: [
    PORT("A", 0x20),
    PORT("B", 0x23),
    PORT("C", 0x26),
    PORT("D", 0x29),
    PORT("E", 0x2c),
    PORT("F", 0x2f),
    PORT("G", 0x32),
    PORT("H", 0x100),
    PORT("J", 0x103),
    PORT("K", 0x106),
    PORT("L", 0x109),
  ],
  timers: [
    // Timers 0–2 keep the 328P register addresses; the vector slots differ.
    timer({
      name: "Timer0",
      bits: 8,
      TCCRA: 0x44,
      TCCRB: 0x45,
      TCNT: 0x46,
      OCRA: 0x47,
      OCRB: 0x48,
      ICR: 0,
      TIFR: 0x35,
      TIMSK: 0x6e,
      captureInterrupt: 0,
      compAInterrupt: 0x2a,
      compBInterrupt: 0x2c,
      ovfInterrupt: 0x2e,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x25,
      compPinA: 7,
      compPortB: 0x34,
      compPinB: 5,
      externalClockPort: 0x2b,
      externalClockPin: 4,
    }),
    timer({
      name: "Timer1",
      bits: 16,
      TCCRA: 0x80,
      TCCRB: 0x81,
      TCCRC: 0x82,
      TCNT: 0x84,
      OCRA: 0x88,
      OCRB: 0x8a,
      ICR: 0x86,
      TIFR: 0x36,
      TIMSK: 0x6f,
      captureInterrupt: 0x20,
      compAInterrupt: 0x22,
      compBInterrupt: 0x24,
      ovfInterrupt: 0x28,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x25,
      compPinA: 5,
      compPortB: 0x25,
      compPinB: 6,
      externalClockPort: 0x2b,
      externalClockPin: 5,
    }),
    timer({
      name: "Timer2",
      bits: 8,
      TCCRA: 0xb0,
      TCCRB: 0xb1,
      TCNT: 0xb2,
      OCRA: 0xb3,
      OCRB: 0xb4,
      ICR: 0,
      TIFR: 0x37,
      TIMSK: 0x70,
      captureInterrupt: 0,
      compAInterrupt: 0x1a,
      compBInterrupt: 0x1c,
      ovfInterrupt: 0x1e,
      dividers: TIMER2_DIVIDERS,
      compPortA: 0x25,
      compPinA: 4,
      compPortB: 0x102,
      compPinB: 6,
    }),
    timer({
      name: "Timer3",
      bits: 16,
      TCCRA: 0x90,
      TCCRB: 0x91,
      TCNT: 0x94,
      OCRA: 0x98,
      OCRB: 0x9a,
      OCRC: 0x9c,
      ICR: 0x96,
      TIFR: 0x38,
      TIMSK: 0x71,
      captureInterrupt: 0x3e,
      compAInterrupt: 0x40,
      compBInterrupt: 0x42,
      ovfInterrupt: 0x46,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x2e,
      compPinA: 3,
      compPortB: 0x2e,
      compPinB: 4,
    }),
    timer({
      name: "Timer4",
      bits: 16,
      TCCRA: 0xa0,
      TCCRB: 0xa1,
      TCNT: 0xa4,
      OCRA: 0xa8,
      OCRB: 0xaa,
      OCRC: 0xac,
      ICR: 0xa6,
      TIFR: 0x39,
      TIMSK: 0x72,
      captureInterrupt: 0x52,
      compAInterrupt: 0x54,
      compBInterrupt: 0x56,
      ovfInterrupt: 0x5a,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x102,
      compPinA: 3,
      compPortB: 0x102,
      compPinB: 4,
    }),
    timer({
      name: "Timer5",
      bits: 16,
      TCCRA: 0x120,
      TCCRB: 0x121,
      TCNT: 0x124,
      OCRA: 0x128,
      OCRB: 0x12a,
      OCRC: 0x12c,
      ICR: 0x126,
      TIFR: 0x3a,
      TIMSK: 0x73,
      captureInterrupt: 0x5c,
      compAInterrupt: 0x5e,
      compBInterrupt: 0x60,
      ovfInterrupt: 0x64,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x10b,
      compPinA: 3,
      compPortB: 0x10b,
      compPinB: 4,
    }),
  ],
  usarts: [
    // USART0 has the 328P registers but the 2560 vector slots.
    usart("USART0", 0xc0, 0x32, 0x34, 0x36),
    usart("USART1", 0xc8, 0x48, 0x4a, 0x4c),
    usart("USART2", 0xd0, 0x66, 0x68, 0x6a),
    usart("USART3", 0x130, 0x6c, 0x6e, 0x70),
  ],
  twi: { twiInterrupt: 0x4e }, // TWI_vect 39 × 2
  buildable: false,
};

const atmega32u4: AvrChipProfile = {
  id: "ATmega32U4",
  mcu: "ATMEGA32U4",
  flashBytes: 32 * 1024, // FLASHEND 0x7FFF
  ramEnd: 0xaff, // RAMSTART 0x100 + RAMSIZE 0xA00 - 1
  clockHz: 16_000_000,
  ports: [
    PORT("B", 0x23),
    PORT("C", 0x26),
    PORT("D", 0x29),
    PORT("E", 0x2c),
    PORT("F", 0x2f),
  ],
  timers: [
    timer({
      name: "Timer0",
      bits: 8,
      TCCRA: 0x44,
      TCCRB: 0x45,
      TCNT: 0x46,
      OCRA: 0x47,
      OCRB: 0x48,
      ICR: 0,
      TIFR: 0x35,
      TIMSK: 0x6e,
      captureInterrupt: 0,
      compAInterrupt: 0x2a,
      compBInterrupt: 0x2c,
      ovfInterrupt: 0x2e,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x25,
      compPinA: 7,
      compPortB: 0x29,
      compPinB: 0,
      externalClockPort: 0x29,
      externalClockPin: 4,
    }),
    timer({
      name: "Timer1",
      bits: 16,
      TCCRA: 0x80,
      TCCRB: 0x81,
      TCCRC: 0x82,
      TCNT: 0x84,
      OCRA: 0x88,
      OCRB: 0x8a,
      ICR: 0x86,
      TIFR: 0x36,
      TIMSK: 0x6f,
      captureInterrupt: 0x20,
      compAInterrupt: 0x22,
      compBInterrupt: 0x24,
      ovfInterrupt: 0x28,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x25,
      compPinA: 5,
      compPortB: 0x25,
      compPinB: 6,
      externalClockPort: 0x29,
      externalClockPin: 5,
    }),
    timer({
      name: "Timer3",
      bits: 16,
      TCCRA: 0x90,
      TCCRB: 0x91,
      TCNT: 0x94,
      OCRA: 0x98,
      OCRB: 0x9a,
      OCRC: 0x9c,
      ICR: 0x96,
      TIFR: 0x38,
      TIMSK: 0x71,
      captureInterrupt: 0x3e,
      compAInterrupt: 0x40,
      compBInterrupt: 0x42,
      ovfInterrupt: 0x46,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x28,
      compPinA: 6,
      compPortB: 0x29,
      compPinB: 6,
    }),
    // Timer4 is the 10-bit high-speed timer on the 32U4; avr8js models 8/16-bit
    // counters, so it is deliberately absent rather than wrong.
  ],
  usarts: [usart("USART1", 0xc8, 0x32, 0x34, 0x36)],
  twi: { twiInterrupt: 0x48 }, // TWI_vect 36 × 2
  buildable: false,
  serialNote:
    "ATmega32U4: `Serial` is USB CDC and is not emulated — `Serial1` (USART1) is.",
};

const attiny85: AvrChipProfile = {
  id: "ATtiny85",
  mcu: "ATTINY85",
  flashBytes: 8 * 1024, // FLASHEND 0x1FFF
  ramEnd: 0x25f,
  clockHz: 8_000_000, // internal RC default; Arduino cores ship 8 MHz
  ports: [PORT("B", 0x36)], // PINB I/O 0x16
  timers: [
    timer({
      name: "Timer0",
      bits: 8,
      TCCRA: 0x4a, // TCCR0A I/O 0x2A
      TCCRB: 0x53, // TCCR0B I/O 0x33
      TCNT: 0x52,
      OCRA: 0x49,
      OCRB: 0x48,
      ICR: 0,
      TIFR: 0x58,
      TIMSK: 0x59,
      captureInterrupt: 0,
      // ATtiny85 vector table is 1-word RJMP entries → slot = vector number.
      compAInterrupt: 10,
      compBInterrupt: 11,
      ovfInterrupt: 5,
      // TIFR/TIMSK put OCF0B/OCIE0B in bit 3, unlike the 328P's bit 2.
      OCFB: 8,
      OCIEB: 8,
      dividers: TIMER01_DIVIDERS,
      compPortA: 0x38,
      compPinA: 0,
      compPortB: 0x38,
      compPinB: 1,
    }),
    { kind: "attiny-timer1", name: "Timer1" },
  ],
  usarts: [],
  twi: null, // the ATtiny85 has USI, not a TWI block
  buildable: false,
  serialNote:
    "ATtiny85 has no USART — serial output is not available on this chip.",
};

export const AVR_CHIPS: readonly AvrChipProfile[] = [
  atmega328p,
  atmega2560,
  atmega32u4,
  attiny85,
];

/** Profile for a catalog `mcu` string, or null when we have no AVR map for it. */
export function chipFor(mcu: string | undefined): AvrChipProfile | null {
  if (!mcu) return null;
  const key = mcu.trim().toUpperCase();
  return AVR_CHIPS.find((c) => c.mcu === key) ?? null;
}

// ---------------------------------------------------------------------------
// Arduino pin -> (port, bit) for chips whose catalog pins carry no avrPort
// ---------------------------------------------------------------------------

type PinRef = readonly [port: string, bit: number];

const MEGA_DIGITAL: readonly string[] = [
  // D0..D53 — ATmega2560 Arduino pinout (port letter + bit).
  "E0",
  "E1",
  "E4",
  "E5",
  "G5",
  "E3",
  "H3",
  "H4",
  "H5",
  "H6",
  "B4",
  "B5",
  "B6",
  "B7",
  "J1",
  "J0",
  "H1",
  "H0",
  "D3",
  "D2",
  "D1",
  "D0",
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "C7",
  "C6",
  "C5",
  "C4",
  "C3",
  "C2",
  "C1",
  "C0",
  "D7",
  "G2",
  "G1",
  "G0",
  "L7",
  "L6",
  "L5",
  "L4",
  "L3",
  "L2",
  "L1",
  "L0",
  "B3",
  "B2",
  "B1",
  "B0",
];

const LEONARDO_DIGITAL: readonly string[] = [
  // D0..D13 — ATmega32U4 Arduino pinout.
  "D2",
  "D3",
  "D1",
  "D0",
  "D4",
  "C6",
  "D7",
  "E6",
  "B4",
  "B5",
  "B6",
  "B7",
  "D6",
  "C7",
];

function pinMapOf(chip: AvrChipProfile): Record<string, PinRef> {
  const map: Record<string, PinRef> = {};
  if (chip.id === "ATmega2560") {
    MEGA_DIGITAL.forEach((ref, i) => {
      map[String(i)] = [ref.slice(0, 1), Number(ref.slice(1))] as const;
    });
    // A0..A7 = PF0..PF7, A8..A15 = PK0..PK7
    for (let i = 0; i < 16; i++) {
      map[`A${i}`] = i < 8 ? (["F", i] as const) : (["K", i - 8] as const);
    }
  } else if (chip.id === "ATmega32U4") {
    LEONARDO_DIGITAL.forEach((ref, i) => {
      map[String(i)] = [ref.slice(0, 1), Number(ref.slice(1))] as const;
    });
    // A0..A5 = PF7..PF0 (A4/A5 are the I2C pins), matching Leonardo headers.
    map.A0 = ["F", 7];
    map.A1 = ["F", 6];
    map.A2 = ["F", 5];
    map.A3 = ["F", 4];
    map.A4 = ["F", 1];
    map.A5 = ["F", 0];
  } else if (chip.id === "ATtiny85") {
    for (let bit = 0; bit <= 5; bit++) map[`PB${bit}`] = ["B", bit];
  } else {
    // 328P: catalog pins already carry avrPort/avrBit; keep a fallback for
    // Arduino-numbered digital pins (D13 = PB5 on Uno/Nano).
    for (let pin = 0; pin <= 7; pin++) map[String(pin)] = ["D", pin];
    for (let pin = 8; pin <= 13; pin++) map[String(pin)] = ["B", pin - 8];
    for (let pin = 0; pin <= 5; pin++) map[`A${pin}`] = ["C", pin];
  }
  return map;
}

const PIN_MAPS: Record<AvrChipId, Record<string, PinRef>> = {
  ATmega328P: pinMapOf(atmega328p),
  ATmega2560: pinMapOf(atmega2560),
  ATmega32U4: pinMapOf(atmega32u4),
  ATtiny85: pinMapOf(attiny85),
};

export interface ChipPin {
  name: string;
  port: string;
  bit: number;
}

/**
 * Resolve a placed board's pin to (port, bit) for the chip it carries.
 * Catalog pin maps win; the chip table fills the gap for boards whose pins
 * only know Arduino numbers (Mega, Leonardo).
 */
export function chipPinOf(
  mcu: string | undefined,
  pin: {
    name: string;
    avrPort?: string | undefined;
    avrBit?: number | undefined;
  },
): ChipPin | null {
  if (pin.avrPort !== undefined && pin.avrBit !== undefined) {
    return { name: pin.name, port: pin.avrPort, bit: pin.avrBit };
  }
  const chip = chipFor(mcu);
  if (!chip) return null;
  const ref = PIN_MAPS[chip.id][pin.name];
  return ref ? { name: pin.name, port: ref[0], bit: ref[1] } : null;
}

/** True when a board's family carries an AVR we can emulate. */
export function isAvrFamily(family: string | undefined): boolean {
  return family === "avr" || family === "avr32u4";
}
