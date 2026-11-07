#!/usr/bin/env node
// scripts/avr-assets.mjs — stage the in-browser AVR toolchain where the app
// can fetch it.
//
// @horang-corp/avr-gcc-wasm ships the actual compilers (cc1plus / avr-as /
// avr-ld / avr-objcopy built to WebAssembly) plus prebuilt Arduino core
// objects. They are fetched at runtime by URL, so bundlers cannot discover
// them; Vite only serves files that live in public/. This copies them once and
// skips the work on later runs (sentinel = package version).
//
// Run by `predev` / `prebuild`, or manually: npm run avr:assets

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "@horang-corp", "avr-gcc-wasm");
const dest = join(root, "public", "avr");
const sentinel = join(dest, ".version");

if (!existsSync(join(pkg, "tools", "cc1plus.wasm"))) {
  console.error(
    "avr-assets: @horang-corp/avr-gcc-wasm is not installed (npm install first).",
  );
  process.exit(1);
}

const version = JSON.parse(
  readFileSync(join(pkg, "package.json"), "utf8"),
).version;
const staged = existsSync(sentinel)
  ? readFileSync(sentinel, "utf8").trim()
  : "";
const complete =
  staged === version &&
  existsSync(join(dest, "tools", "cc1plus.wasm")) &&
  existsSync(join(dest, "assets", "manifest.json"));

if (complete) {
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const dir of ["tools", "assets"]) {
  cpSync(join(pkg, dir), join(dest, dir), { recursive: true });
}
writeFileSync(sentinel, `${version}\n`);
console.log(`avr-assets: staged avr-gcc-wasm ${version} into public/avr/`);
