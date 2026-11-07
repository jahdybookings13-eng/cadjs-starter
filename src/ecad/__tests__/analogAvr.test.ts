// ecad/__tests__/analogAvr.test.ts — the compiled-firmware analog path.
//
// A hand-assembled ATmega328P program starts an ADC conversion on ADC0, waits,
// reads ADCH/ADCL and writes the high byte to PORTB. The board is wired to a
// real 1k/1k divider, so PORTB only changes if EcadSim solved the divider and
// fed that voltage into avr8js's ADC peripheral.

import { describe, expect, it } from "vitest";
import { EcadSim } from "../sim";
import { brne, ldi, sbiw, toHex, wordsToImage } from "../hex";

// I/O-space encodings (data address − 0x20).
// OUT encodes the full 5-bit register number (unlike LDI's reg-16 field) and
// only reaches classic I/O 0x00-0x3F. ADC registers are extended I/O, so they
// need the two-word LDS/STS forms.
const out = (reg: number, io: number): number =>
  0xb800 | ((io & 0x30) << 5) | ((reg & 0x1f) << 4) | (io & 0x0f);
const sts = (reg: number, addr: number): number[] => [
  0x9200 | ((reg & 0x1f) << 4),
  addr,
];
const lds = (reg: number, addr: number): number[] => [
  0x9000 | ((reg & 0x1f) << 4),
  addr,
];

// ADC registers are extended I/O: these are DATA addresses for STS/LDS.
const ADMUX = 0x7c;
const ADCSRA = 0x7a;
const ADCL = 0x78;
const ADCH = 0x79;
const PORTB = 0x05;
const DDRB = 0x04;

function adcHex(): string {
  const prog: number[] = [
    ldi(20, 0xff),
    out(20, DDRB),
    ldi(20, 0x40), // REFS0: AVCC reference, MUX=0 (ADC0)
    ...sts(20, ADMUX),
    ldi(20, 0xc0), // ADEN | ADSC
    ...sts(20, ADCSRA),
    // ~8k iterations ≈ 33k cycles (2 ms), so many samples land per 16 ms tick.
    ldi(24, 0x20),
    ldi(25, 0x00),
    sbiw(24, 1),
    brne(-2),
    ...lds(18, ADCL),
    ...lds(19, ADCH),
    out(19, PORTB),
  ];
  // Back to the ADMUX reload (word 2), so each pass samples again.
  prog.push(rjmpWords(2 - (prog.length + 1)));
  return toHex(wordsToImage(prog, 256), 256);
}

function rjmpWords(k: number): number {
  return 0xc000 | (k & 0xfff);
}

describe("compiled AVR firmware reads analog voltages", () => {
  it("samples a solved divider through the avr8js ADC into PORTB", async () => {
    const sim = new EcadSim();
    const uno = sim.insert("arduino-uno");
    sim.deploy(uno.id, { hex: adcHex() });
    const run = await sim.run(uno.id);
    expect(run.running).toBe(true);

    const bat = sim.insert("battery-5v");
    const r1 = sim.insert("resistor-220");
    const r2 = sim.insert("resistor-1k");
    sim.wire(`${bat.id}.+`, `${r1.id}.1`);
    sim.wire(`${r1.id}.2`, `${uno.id}.A0`);
    sim.wire(`${uno.id}.A0`, `${r2.id}.1`);
    sim.wire(`${r2.id}.2`, `${bat.id}.-`);

    for (let i = 0; i < 4; i++) sim.tick(16);
    // 5 V across 220 + 1k gives ~4.1 V at A0 → 839 counts → ADCH = 3.
    expect(sim.nodeVoltage(uno.id, "A0")).toBeCloseTo(4.1, 1);
    expect(sim.pinDrive(uno.id, "8").digital).toBe(1);
    expect(sim.pinDrive(uno.id, "9").digital).toBe(1);
    expect(sim.pinDrive(uno.id, "10").digital).toBe(0);
    sim.stop(uno.id);
  }, 30_000);
});
