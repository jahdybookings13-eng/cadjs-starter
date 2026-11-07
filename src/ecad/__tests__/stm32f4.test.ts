// ecad/__tests__/stm32f4.test.ts — the F4 tier runs shipped, unmodified
// Cortex-M4 firmware. `blinky_f411` is a real arm-none-eabi build from the
// emulator package (MIT): it prints its banner over USART1 and drives the Black
// Pill LED on PC13, so both the CPU and the GPIO model have to be real for this
// file to pass.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeFirmware } from "stm32f4-emu";
import { dataUrlOf, inspectFirmware } from "../delivery";
import { chipKeyFor, makeStm32f4, setStm32f4Assets } from "../stm32f4";
import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";

// Node has no page to fetch public/stm32f4/ from, so feed the core and SVD from
// the package's staged assets — the same bytes the browser worker fetches.
const vendor = resolve("node_modules/stm32f4-emu/site/vendor");
setStm32f4Assets({
  wasmInit: new Uint8Array(
    readFileSync(resolve(vendor, "stm32_periph_wasm_bg.wasm")),
  ),
  svdXml: readFileSync(resolve(vendor, "stm32f411.svd"), "utf8"),
});

const blinky = () => dataUrlOf(decodeFirmware("blinky_f411"));

describe("STM32F4 execution", () => {
  it("maps catalog MCUs to the emulated F4 dies", () => {
    expect(chipKeyFor("STM32F411CEU6")).toBe("stm32f411");
    expect(chipKeyFor("STM32F407VGT6")).toBe("stm32f407");
    expect(chipKeyFor("STM32F429ZIT6")).toBe("stm32f429");
    expect(chipKeyFor("STM32F103C8T6")).toBeNull();
  });

  it("boots real Cortex-M4 firmware and reports UART + PC13", async () => {
    const made = await makeStm32f4(blinky(), "STM32F411CEU6");
    expect(made.ok).toBe(true);
    if (!made.ok) return;

    let serial = "";
    const high = new Set<string>();
    for (let i = 0; i < 24; i++) {
      made.emulator.step(250_000);
      made.emulator.drain(
        (text) => (serial += text),
        (name, level) => {
          if (level) high.add(name);
        },
      );
    }
    expect(serial).toContain("Blinky F411");
    expect(serial).toMatch(/tick 0 LED=ON/);
    expect(high.has("PC13")).toBe(true);
    expect(made.chipLabel).toContain("STM32F411");
    made.emulator.dispose();
  });

  it("refuses a non-F4 MCU and an oversized image", async () => {
    const wrongCore = await makeStm32f4(blinky(), "STM32F103C8T6");
    expect(wrongCore.ok).toBe(false);
    if (!wrongCore.ok) expect(wrongCore.reason).toMatch(/no STM32F4 core/);

    const oversized = await makeStm32f4(
      dataUrlOf(new Uint8Array(600 * 1024)),
      "STM32F411CEU6",
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.reason).toMatch(/600 KB but STM32F411/);
  });

  it("deploys real firmware to the Black Pill in the sim and lights PC13", async () => {
    const sim = new EcadSim(new VirtualClock());
    const board = sim.insert("stm32f4-blackpill", { x: 0, y: 0, z: 0 });
    const led = sim.insert("led-red", { x: -3, y: 0, z: 0 });
    sim.wire(`${board.id}.PC13`, `${led.id}.A`);
    sim.deploy(board.id, { binary: blinky(), name: "blinky_f411.bin" });
    expect(sim.firmwareOf(board.id)?.tier).toBe("stm32f4");

    await sim.run(board.id);
    expect(sim.status(board.id).tier).toBe("stm32f4");
    // The blinky has ms-scale delays, so look for the ON phase across ticks
    // instead of pinning the assertion to one arbitrary instruction count.
    let lit = false;
    for (let i = 0; i < 240 && !lit; i++) {
      sim.tick(0.5);
      lit = sim.ledLevel(led.id) === 1;
    }
    expect(lit).toBe(true);
    expect(sim.status(board.id).serial.join("")).toContain("Blinky F411");
    sim.stop(board.id);
  });

  it("verifies an F4 image against the board's flash", () => {
    const facts = inspectFirmware(blinky(), "STM32F411CEU6");
    expect(facts.issues).toEqual([]);
    expect(facts.summary).toMatch(/fits 512 KB flash/);
  });
});
