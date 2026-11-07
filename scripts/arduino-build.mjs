#!/usr/bin/env node
// scripts/arduino-build.mjs — compile real Arduino C++ firmware to Intel HEX
// for ScadGen's AVR tier, using a locally installed toolchain.
//
// ScadGen runs firmware two ways: the virtual JS tier (in-app, any board) and
// the AVR tier (real machine code via avr8js). The AVR tier needs a .hex, and
// producing one requires a C++ toolchain — there is no in-browser compiler
// today. This bridge is the honest half: build here, then use "upload .hex" in
// the ECAD panel (or ecad.uploadHex on the bus) to run it in the scene.
//
// Usage:
//   node scripts/arduino-build.mjs firmware/blink/blink.ino
//   node scripts/arduino-build.mjs sketch.ino --board arduino:avr:nano --out firmware/blink.hex
//
// Requires arduino-cli (https://arduino.github.io/arduino-cli/). If you have a
// bare avr-g++ instead, produce a .hex with it and skip this script — the app
// only cares that the file is Intel HEX.

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

function usage(code) {
  const text = `arduino-build — compile an Arduino C++ sketch to Intel HEX for ScadGen

  node scripts/arduino-build.mjs <sketch.ino> [--board <fqbn>] [--out <file.hex>]

  --board  arduino-cli FQBN (default arduino:avr:uno)
  --out    output path (default <sketch dir>/<sketch name>.hex)

Needs arduino-cli on PATH. Without it, build the .hex however you like and
upload it in the ECAD panel — the AVR tier only needs valid Intel HEX.`;
  console.log(text);
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  usage(argv.length === 0 ? 2 : 0);
}

let sketch = null;
let board = "arduino:avr:uno";
let out = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--board") board = argv[++i];
  else if (a === "--out") out = argv[++i];
  else if (!a.startsWith("-")) sketch = a;
}
if (!sketch) usage(2);

const sketchPath = resolve(sketch);
const sketchName = basename(sketchPath).replace(/\.[^.]+$/, "");
const outPath = out
  ? resolve(out)
  : join(dirname(sketchPath), `${sketchName}.hex`);

const probe = spawnSync("arduino-cli", ["version"], { encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  console.error(
    "arduino-cli not found. Install it (https://arduino.github.io/arduino-cli/),\n" +
      "or build a .hex with avr-g++ and upload it in the ECAD panel.",
  );
  process.exit(1);
}

const buildDir = mkdtempSync(join(tmpdir(), "scadgen-fw-"));
console.log(`compiling ${sketchPath}\n  board ${board}\n  out   ${outPath}`);

const res = spawnSync(
  "arduino-cli",
  ["compile", "--fqbn", board, "--output-dir", buildDir, sketchPath],
  { stdio: "inherit" },
);
if (res.status !== 0) {
  console.error(`arduino-cli compile failed (exit ${res.status}).`);
  process.exit(res.status ?? 1);
}

const hexFile = readdirSync(buildDir).find((f) => f.endsWith(".hex"));
if (!hexFile) {
  console.error(`no .hex produced in ${buildDir} — is this an AVR board?`);
  process.exit(1);
}
const hex = readFileSync(join(buildDir, hexFile), "utf8");
const records = hex.split(/\r?\n/).filter((l) => l.startsWith(":")).length;
if (records === 0) {
  console.error(`${hexFile} is not Intel HEX.`);
  process.exit(1);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, hex);
console.log(`wrote ${outPath} (${records} Intel HEX records)`);
console.log("Next: ECAD panel → code tab → upload .hex");
