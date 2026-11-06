// ecad/avr.ts — real firmware emulation for AVR boards via avr8js.
//
// A compiled .hex runs instruction-by-instruction against a virtual ATmega;
// GPIO ports, timers, and USART are avr8js peripherals. Board pin maps from
// the catalog translate (PORT, bit) -> Arduino pin names so the simulator's
// LED/screen objects light up exactly like the hardware would.

export interface AvrPortListener {
  (value: number): void;
}

export interface AvrEmulator {
  /** Execute up to `cycles` clock cycles. Returns cycles executed. */
  step(cycles: number): number;
  /** Listen for a port's output register changes (value = full 8-bit PORTx). */
  onPort(port: "A" | "B" | "C" | "D", fn: AvrPortListener): void;
  /** Serial bytes transmitted by the firmware (UART0). */
  onSerial(fn: (chunk: string) => void): void;
  cycles: number;
  dispose(): void;
}

export interface AvrFactoryResult {
  ok: true;
  emulator: AvrEmulator;
}
export interface AvrFactoryError {
  ok: false;
  reason: string;
}

const CLOCK_HZ = 16_000_000;
const FLASH_WORDS = 32 * 1024; // ATmega328P

/**
 * Build an emulator for an ATmega328P-class board. Fails honestly when the
 * avr8js dependency is unavailable (it is a runtime dependency of the app,
 * so this only happens in stripped builds).
 */
export async function makeAvr328p(
  hex: string,
): Promise<AvrFactoryResult | AvrFactoryError> {
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
  const cpu = new mod.CPU(new Uint16Array(FLASH_WORDS));
  const image = flashImage(hex, FLASH_WORDS * 2);
  for (let w = 0; w < FLASH_WORDS; w++) {
    cpu.progMem[w] = (image[w * 2] ?? 0) | ((image[w * 2 + 1] ?? 0) << 8);
  }
  const portConfigs: Record<"A" | "B" | "C" | "D", unknown> = {
    A: mod.portAConfig,
    B: mod.portBConfig,
    C: mod.portCConfig,
    D: mod.portDConfig,
  };
  const ports = new Map<
    string,
    {
      port: import("avr8js").AVRIOPort;
      listeners: AvrPortListener[];
      last: number;
    }
  >();
  const serialListeners: ((chunk: string) => void)[] = [];
  let usart: import("avr8js").AVRUSART | null = null;
  try {
    usart = new mod.AVRUSART(cpu, mod.usart0Config, CLOCK_HZ);
    usart.onLineTransmit = (line: string) => {
      for (const fn of serialListeners)
        fn(line.endsWith("\n") ? line : line + "\n");
    };
  } catch {
    usart = null; // boards without UART0 — serial stays empty
  }
  for (const key of ["A", "B", "C", "D"] as const) {
    const cfg = portConfigs[key];
    if (!cfg) continue;
    const port = new mod.AVRIOPort(cpu, cfg as never);
    const entry = { port, listeners: [] as AvrPortListener[], last: 0 };
    port.addListener((value: number) => {
      entry.last = value;
      for (const fn of entry.listeners) fn(value);
    });
    ports.set(key, entry);
  }
  const emulator: AvrEmulator = {
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
    get cycles() {
      return cpu.cycles;
    },
    dispose() {
      ports.clear();
      serialListeners.length = 0;
      if (usart) usart.onLineTransmit = null;
      usart = null;
    },
  };
  return { ok: true, emulator };
}

/**
 * Map a catalog AVR board pin (name -> avrPort/avrBit) onto port listeners.
 * Returns pin-name -> latest output-register bit.
 */
export function watchAvrPins(
  emulator: AvrEmulator,
  pins: {
    name: string;
    avrPort?: "A" | "B" | "C" | "D" | undefined;
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
    emulator.onPort(port as "A" | "B" | "C" | "D", (value) => {
      for (const { name, bit } of list)
        onChange(name, (value >> bit) & 1 ? 1 : 0);
    });
  }
}
