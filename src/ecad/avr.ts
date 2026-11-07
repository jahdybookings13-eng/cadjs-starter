// ecad/avr.ts — real firmware emulation for AVR boards via avr8js.
//
// A compiled .hex runs instruction-by-instruction against a virtual ATmega;
// GPIO ports, timers, USARTs and TWI are avr8js peripherals. Board pin maps
// from the catalog translate (port, bit) -> Arduino pin names so the
// simulator's LED/screen objects light up exactly like the hardware would.
//
// The chip is chosen from the board's `mcu` (see avrChips.ts): ATmega328P,
// ATmega2560, ATmega32U4 and ATtiny85 all get their own flash size, SRAM end,
// ports, timers and serial ports. avr8js handles the 2560's 256 KB flash and
// 22-bit program counter by itself once the program memory is that large.

import type {
  AVRIOPort,
  AVRPortConfig,
  AVRTimerConfig,
  AVRUSART,
} from "avr8js";

/** avr8js exports the AVRUSART class and usart0Config, but not this type. */
interface UsartRegs {
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
import {
  chipFor,
  type AvrChipProfile,
  type AvrPortSpec,
  type AvrTimerRegs,
  type AvrUsartSpec,
} from "./avrChips";
import type { I2cHandler } from "./avrPeripherals";

export interface AvrEmulator {
  /** Chip this emulator was built for (catalog mcu string). */
  chip: string;
  /** Board clock — ATtiny85 runs 8 MHz, everything else here 16 MHz. */
  clockHz: number;
  /** Execute up to `cycles` clock cycles. Returns cycles executed. */
  step(cycles: number): number;
  /** Listen for a port's output register changes (value = full 8-bit PORTx). */
  onPort(port: string, fn: AvrPortListener): void;
  /** Serial bytes transmitted by the firmware. */
  onSerial(fn: (chunk: string) => void): void;
  /** Attach a TWI (I2C) device handler — compiled sketches talk to displays. */
  i2c(handler: I2cHandler): void;
  /** Drive an ADC channel in volts (0..5) — analogRead() sees it. */
  setAnalog(channel: number, volts: number): void;
  cycles: number;
  dispose(): void;
}

export interface AvrPortListener {
  (value: number): void;
}

export interface AvrFactoryResult {
  ok: true;
  emulator: AvrEmulator;
}
export interface AvrFactoryError {
  ok: false;
  reason: string;
}

const REGISTER_SPACE = 0x100;

/**
 * Build an emulator for a board's MCU. Fails honestly when the chip has no
 * profile or the avr8js dependency is unavailable (it is a runtime dependency
 * of the app, so the latter only happens in stripped builds).
 */
export async function makeAvrChip(
  hex: string,
  mcu: string,
): Promise<AvrFactoryResult | AvrFactoryError> {
  const profile = chipFor(mcu);
  if (!profile) {
    return { ok: false, reason: `no AVR emulation profile for ${mcu}` };
  }
  let mod: typeof import("avr8js");
  try {
    mod = await import("avr8js");
  } catch (err) {
    return {
      ok: false,
      reason: `avr8js unavailable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const { flashImage } = await import("./hex");

  const flashWords = Math.floor(profile.flashBytes / 2);
  // avr8js sizes the data array as SRAM + 0x100 register space and points SP
  // at its end, so deriving the SRAM length from RAMEND lands SP on RAMEND.
  const sramBytes = profile.ramEnd + 1 - REGISTER_SPACE;
  const cpu = new mod.CPU(new Uint16Array(flashWords), sramBytes);

  // Compiled Arduino firmware is not bare register code: delay()/millis() ride
  // Timer0 overflows, timing-sensitive sketches use the other timers. Without
  // these peripherals a real .hex links fine and then hangs on its first delay.
  for (const spec of profile.timers) {
    if (spec.kind === "attiny-timer1") {
      new mod.ATtinyTimer1(cpu, mod.attinyTimer1Config);
    } else {
      new mod.AVRTimer(cpu, timerConfig(spec));
    }
  }

  const image = flashImage(hex, profile.flashBytes);
  for (let w = 0; w < flashWords; w++) {
    cpu.progMem[w] = (image[w * 2] ?? 0) | ((image[w * 2 + 1] ?? 0) << 8);
  }

  const ports = new Map<
    string,
    { port: AVRIOPort; listeners: AvrPortListener[]; last: number }
  >();
  for (const spec of profile.ports) {
    const port = new mod.AVRIOPort(cpu, portConfig(spec));
    const entry = { port, listeners: [] as AvrPortListener[], last: 0 };
    port.addListener((value: number) => {
      entry.last = value;
      for (const fn of entry.listeners) fn(value);
    });
    ports.set(spec.letter, entry);
  }

  // Real ADC peripheral: the analog half of the board is not a lookup table.
  // ATtiny85's ADC register map differs, so it gets none rather than a lie.
  const adc =
    profile.id === "ATtiny85" ? null : new mod.AVRADC(cpu, mod.adcConfig);

  const serialListeners: ((chunk: string) => void)[] = [];
  const usarts: AVRUSART[] = [];
  for (const spec of profile.usarts) {
    const usart = new mod.AVRUSART(cpu, usartConfig(spec), profile.clockHz);
    usart.onLineTransmit = (line: string) => {
      for (const fn of serialListeners)
        fn(line.endsWith("\n") ? line : line + "\n");
    };
    usarts.push(usart);
  }

  const emulator: AvrEmulator = {
    chip: profile.id,
    clockHz: profile.clockHz,
    step(cycles: number): number {
      const target = cpu.cycles + cycles;
      while (cpu.cycles < target) {
        mod.avrInstruction(cpu);
        cpu.tick();
        if (cpu.pc === 0 && cpu.cycles > 0) break; // program wrapped / reset
      }
      return cpu.cycles;
    },
    onPort(port, fn) {
      ports.get(port)?.listeners.push(fn);
    },
    onSerial(fn) {
      serialListeners.push(fn);
    },
    setAnalog(channel: number, volts: number) {
      if (!adc || channel < 0 || channel >= adc.channelValues.length) return;
      adc.channelValues[channel] = volts;
    },
    i2c(handler) {
      if (!profile.twi) return; // ATtiny85 has USI, not a TWI block
      const twi = new mod.AVRTWI(
        cpu,
        { ...mod.twiConfig, twiInterrupt: profile.twi.twiInterrupt },
        profile.clockHz,
      );
      // avr8js hands each TWI phase to the handler and waits for the matching
      // complete*() call; without it Wire.endTransmission() spins on TWINT.
      twi.eventHandler = {
        start: (repeated: boolean) => {
          handler.start(repeated);
          twi.completeStart();
        },
        stop: () => {
          handler.stop();
          twi.completeStop();
        },
        connectToSlave: (addr: number, write: boolean) => {
          handler.connect(addr, write);
          twi.completeConnect(true);
        },
        writeByte: (value: number) => {
          handler.write(value);
          twi.completeWrite(true);
        },
        readByte: () => {
          twi.completeRead(handler.read());
        },
      };
    },
    get cycles() {
      return cpu.cycles;
    },
    dispose() {
      ports.clear();
      serialListeners.length = 0;
      for (const usart of usarts) usart.onLineTransmit = null;
      usarts.length = 0;
    },
  };
  return { ok: true, emulator };
}

/** Back-compat entry point: ATmega328P (Uno / Nano). */
export function makeAvr328p(
  hex: string,
): Promise<AvrFactoryResult | AvrFactoryError> {
  return makeAvrChip(hex, "ATmega328P");
}

/** Chip profile for a board's MCU (null when we cannot emulate it). */
export function profileFor(mcu: string): AvrChipProfile | null {
  return chipFor(mcu);
}

function timerConfig(spec: AvrTimerRegs): AVRTimerConfig {
  return {
    bits: spec.bits,
    dividers: {
      0: spec.dividers[0] ?? 0,
      1: spec.dividers[1] ?? 0,
      2: spec.dividers[2] ?? 0,
      3: spec.dividers[3] ?? 0,
      4: spec.dividers[4] ?? 0,
      5: spec.dividers[5] ?? 0,
      6: spec.dividers[6] ?? 0,
      7: spec.dividers[7] ?? 0,
    },
    captureInterrupt: spec.captureInterrupt,
    compAInterrupt: spec.compAInterrupt,
    compBInterrupt: spec.compBInterrupt,
    compCInterrupt: 0,
    ovfInterrupt: spec.ovfInterrupt,
    TIFR: spec.TIFR,
    OCRA: spec.OCRA,
    OCRB: spec.OCRB,
    OCRC: spec.OCRC,
    ICR: spec.ICR,
    TCNT: spec.TCNT,
    TCCRA: spec.TCCRA,
    TCCRB: spec.TCCRB,
    TCCRC: spec.TCCRC,
    TIMSK: spec.TIMSK,
    TOV: spec.TOV,
    OCFA: spec.OCFA,
    OCFB: spec.OCFB,
    OCFC: 0,
    TOIE: spec.TOIE,
    OCIEA: spec.OCIEA,
    OCIEB: spec.OCIEB,
    OCIEC: 0,
    compPortA: spec.compPortA ?? 0,
    compPinA: spec.compPinA ?? 0,
    compPortB: spec.compPortB ?? 0,
    compPinB: spec.compPinB ?? 0,
    compPortC: 0,
    compPinC: 0,
    externalClockPort: spec.externalClockPort ?? 0,
    externalClockPin: spec.externalClockPin ?? 0,
  };
}

function portConfig(spec: AvrPortSpec): AVRPortConfig {
  // Interrupt routing is deliberately empty: the chip's pin-change/external
  // vector slots are not what this tier drives, and a wrong slot would jump
  // into unrelated firmware. Output register writes are what the 3D layer reads.
  return {
    PIN: spec.PIN,
    DDR: spec.DDR,
    PORT: spec.PORT,
    externalInterrupts: [],
  };
}

function usartConfig(spec: AvrUsartSpec): UsartRegs {
  return {
    rxCompleteInterrupt: spec.rxCompleteInterrupt,
    dataRegisterEmptyInterrupt: spec.dataRegisterEmptyInterrupt,
    txCompleteInterrupt: spec.txCompleteInterrupt,
    UCSRA: spec.UCSRA,
    UCSRB: spec.UCSRB,
    UCSRC: spec.UCSRC,
    UBRRL: spec.UBRRL,
    UBRRH: spec.UBRRH,
    UDR: spec.UDR,
  };
}

/**
 * Map placed board pins onto port listeners for the chip they belong to.
 * Returns via `onChange(pinName, bitValue)` whenever the output register moves.
 */
export function watchAvrPins(
  emulator: AvrEmulator,
  pins: {
    name: string;
    avrPort?: string | undefined;
    avrBit?: number | undefined;
  }[],
  onChange: (pin: string, value: 0 | 1) => void,
): void {
  const byPort = new Map<string, { name: string; bit: number }[]>();
  for (const pin of pins) {
    if (!pin.avrPort || pin.avrBit === undefined) continue;
    const list = byPort.get(pin.avrPort) ?? [];
    list.push({ name: pin.name, bit: pin.avrBit });
    byPort.set(pin.avrPort, list);
  }
  for (const [port, list] of byPort) {
    emulator.onPort(port, (value) => {
      for (const { name, bit } of list)
        onChange(name, (value >> bit) & 1 ? 1 : 0);
    });
  }
}
