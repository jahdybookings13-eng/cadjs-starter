// ecad/__tests__/esp32.test.ts — the classic ESP32 tier runs real Xtensa LX6
// firmware. The inputs are ESP-IDF 5.5.4's hello_world for esp32dev (example
// CC0-1.0) and Espressif's Apache-2.0 mask ROM, both staged in public/esp32/.
//
// A merged flash image is assembled from the same bootloader + partition table
// + app an `esptool merge_bin` produces: bootloader at 0x1000, partition table
// at 0x8000, app at 0x10000. Booting it has to go through the ROM, which then
// finds the bootloader and prints the IDF banner — there is no shortcut here.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dataUrlOf } from "../delivery";
import {
  esp32ChipKey,
  esp32ImageLayout,
  makeEsp32,
  setEsp32Assets,
} from "../esp32";
import { EcadSim } from "../sim";
import { VirtualClock } from "../runtime";

const dir = resolve("public/esp32");
const wasm = new Uint8Array(readFileSync(resolve(dir, "esp32sim.wasm")));
const rom = new Uint8Array(readFileSync(resolve(dir, "esp32_rev300_rom.elf")));
const bootloader = new Uint8Array(
  readFileSync(resolve(dir, "classic-hello-bootloader.bin")),
);
const ptable = new Uint8Array(
  readFileSync(resolve(dir, "classic-hello-ptable.bin")),
);
const app = new Uint8Array(
  readFileSync(resolve(dir, "classic-hello_world.bin")),
);
// Stock MicroPython v1.29.0 (ESP32_GENERIC): a combined image written at 0x1000.
const micropython = new Uint8Array(
  readFileSync(resolve(dir, "micropython-esp32.bin")),
);

/** The layout `esptool merge_bin` writes for the classic ESP32. */
function mergedImage(): Uint8Array {
  const image = new Uint8Array(0x10000 + app.length);
  image.fill(0xff);
  image.set(bootloader, 0x1000);
  image.set(ptable, 0x8000);
  image.set(app, 0x10000);
  return image;
}

beforeAll(() => setEsp32Assets({ wasm, rom }));
afterAll(() => setEsp32Assets(null));

describe("ESP32 image handling", () => {
  it("maps only the classic ESP32 and identifies flash layouts", () => {
    expect(esp32ChipKey("ESP32-WROOM-32")).toBe("esp32");
    expect(esp32ChipKey("ESP32-S3-WROOM-1")).toBeNull();
    expect(esp32ChipKey("ESP8266EX")).toBeNull();

    expect(esp32ImageLayout(mergedImage())).toBe("merged");
    expect(esp32ImageLayout(app)).toBe("app");
    expect(esp32ImageLayout(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("boots a merged flash image through the real mask ROM", async () => {
    const made = await makeEsp32(dataUrlOf(mergedImage()), "ESP32-WROOM-32");
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.layout).toBe("merged");
    expect(made.chipLabel).toContain("Xtensa LX6");

    let serial = "";
    for (let i = 0; i < 200 && !serial.includes("Hello world!"); i++) {
      made.emulator.step(1_000_000);
      made.emulator.drain((text) => (serial += text));
    }
    // ROM banner → 2nd-stage bootloader reading this project's flash image →
    // app banner. Any one of these missing means the boot was faked.
    expect(serial).toContain("ets Jul 29 2019");
    expect(serial).toContain("ESP-IDF 5.5.4 2nd stage bootloader");
    expect(serial).toContain("Partition Table");
    expect(serial).toContain("Loaded app from partition at offset 0x10000");
    expect(serial).toContain("Hello world!");
    expect(made.emulator.chip.arch).toBe("xtensa");
    made.emulator.dispose();
  }, 30_000);

  it("refuses an app-only image: the classic ESP32 cannot skip its ROM", async () => {
    const made = await makeEsp32(dataUrlOf(app), "ESP32-WROOM-32");
    expect(made.ok).toBe(false);
    if (!made.ok)
      expect(made.reason).toMatch(/no synthetic app boot|merged flash image/);
  });

  it("refuses the wrong core, the wrong container, and oversized images", async () => {
    const s3 = await makeEsp32(dataUrlOf(app), "ESP32-S3-WROOM-1");
    expect(s3.ok).toBe(false);
    if (!s3.ok) expect(s3.reason).toMatch(/no Xtensa LX6 core/);

    const garbage = await makeEsp32(
      dataUrlOf(new Uint8Array([1, 2, 3])),
      "ESP32-WROOM-32",
    );
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.reason).toMatch(/not an ESP32 image/);

    const oversized = new Uint8Array(4 * 1024 * 1024 + 1);
    oversized.fill(0xff);
    oversized[0x1000] = 0xe9;
    const big = await makeEsp32(dataUrlOf(oversized), "ESP32-WROOM-32");
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.reason).toMatch(/4096 KB|4 MB/);
  });

  it("refuses a merged image when the mask ROM is missing", async () => {
    setEsp32Assets({ wasm, rom: new Uint8Array(0) });
    const made = await makeEsp32(dataUrlOf(mergedImage()), "ESP32-WROOM-32");
    expect(made.ok).toBe(false);
    if (!made.ok) expect(made.reason).toMatch(/mask ROM is empty/);
    setEsp32Assets({ wasm, rom });
  });
});

describe("ESP32 in the sim", () => {
  it("deploys a merged image to the DevKit and shows its serial banner", async () => {
    const sim = new EcadSim(new VirtualClock());
    const board = sim.insert("esp32-devkit", { x: 0, y: 0, z: 0 });
    sim.deploy(board.id, {
      binary: dataUrlOf(mergedImage()),
      name: "hello.bin",
    });
    expect(sim.firmwareOf(board.id)?.tier).toBe("esp32");

    await sim.run(board.id);
    expect(sim.status(board.id).tier).toBe("esp32"); // 50 ms of board time per tick: the ESP32 takes ~0.4 s to reach the app
    // banner, and tick(0.5) would only mean 0.5 ms.
    for (let i = 0; i < 80; i++) {
      sim.tick(50);
      if (sim.status(board.id).serial.join("\n").includes("Hello world!"))
        break;
    }
    const serial = sim.status(board.id).serial.join("\n");
    expect(serial).toContain("ESP-IDF 5.5.4 2nd stage bootloader");
    expect(serial).toContain("Hello world!");
    sim.stop(board.id);
  }, 40_000);
});

describe("ESP32 pins, Wi-Fi and Bluetooth", () => {
  it("boots a combined image at 0x1000 and captures real GPIO edges", async () => {
    expect(esp32ImageLayout(micropython)).toBe("combined");
    const made = await makeEsp32(dataUrlOf(micropython), "ESP32-WROOM-32");
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.layout).toBe("combined");
    // The virtual access point is attached before boot; Bluetooth is not,
    // because no application ELF was supplied.
    expect(made.emulator.wifi).toBe("ssid=esp32sim,psk=esp32sim-pass");
    expect(made.emulator.ble).toBe(false);

    let serial = "";
    const edges: { pin: number; high: boolean }[] = [];
    const pump = () => {
      made.emulator.step(1_000_000);
      made.emulator.drain(
        (text) => (serial += text),
        (pin, high) => edges.push({ pin, high }),
      );
    };
    for (let i = 0; i < 250 && !serial.includes(">>>"); i++) pump();
    expect(serial).toContain("MicroPython v1.29.0");
    expect(serial).toContain("virtual AP 'esp32sim'");

    made.emulator.writeLine("import machine");
    made.emulator.writeLine("p = machine.Pin(2, machine.Pin.OUT)");
    made.emulator.writeLine("p.value(1)");
    for (let i = 0; i < 80 && !edges.some((e) => e.pin === 2 && e.high); i++)
      pump();
    expect(edges).toEqual(expect.arrayContaining([{ pin: 2, high: true }]));
    made.emulator.writeLine("p.value(0)");
    for (let i = 0; i < 80 && !edges.some((e) => e.pin === 2 && !e.high); i++)
      pump();
    expect(edges).toEqual(expect.arrayContaining([{ pin: 2, high: false }]));
    made.emulator.dispose();
  }, 60_000);

  it("lights a wired LED from MicroPython running on the sim", async () => {
    const sim = new EcadSim(new VirtualClock());
    const board = sim.insert("esp32-devkit", { x: 0, y: 0, z: 0 });
    const led = sim.insert("led-red", { x: 10, y: 0, z: 0 });
    sim.wire(`${board.id}.2`, `${led.id}.A`);
    sim.deploy(board.id, {
      binary: dataUrlOf(micropython),
      name: "micropython.bin",
    });
    expect(sim.firmwareOf(board.id)?.tier).toBe("esp32");
    await sim.run(board.id);
    const serial = () => sim.status(board.id).serial.join("");
    for (let i = 0; i < 150 && !serial().includes(">>>"); i++) sim.tick(50);
    expect(serial()).toContain("MicroPython v1.29.0");

    sim.writeLine(board.id, "import machine");
    sim.writeLine(board.id, "p = machine.Pin(2, machine.Pin.OUT)");
    sim.writeLine(board.id, "p.value(1)");
    for (let i = 0; i < 60 && sim.ledLevel(led.id) === 0; i++) sim.tick(50);
    expect(sim.ledLevel(led.id)).toBe(1);
    sim.writeLine(board.id, "p.value(0)");
    for (let i = 0; i < 60 && sim.ledLevel(led.id) !== 0; i++) sim.tick(50);
    expect(sim.ledLevel(led.id)).toBe(0);
    sim.stop(board.id);
  }, 90_000);

  it("refuses Bluetooth without an application ELF that names the controller", async () => {
    // The mask ROM is an ELF with symbols, but not this firmware's: esp32sim
    // says which symbol is missing instead of pretending the radio works.
    const made = await makeEsp32(dataUrlOf(mergedImage()), "ESP32-WROOM-32", {
      bleElf: rom,
    });
    expect(made.ok).toBe(false);
    if (!made.ok) expect(made.reason).toMatch(/Bluetooth/);
  });
});
