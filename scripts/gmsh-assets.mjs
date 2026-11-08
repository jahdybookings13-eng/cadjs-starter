#!/usr/bin/env node
// scripts/gmsh-assets.mjs — stage Gmsh's prebuilt ESM/WASM core in public/.
//
// Gmsh's Emscripten build creates its pthread worker from import.meta.url and
// passes a non-static worker options object. Vite cannot parse that form, so
// the module is served as a native asset and loaded with a runtime import.
// Run by `predev` / `prebuild`, or manually: npm run gmsh:assets

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "@loumalouomega", "gmsh-wasm");
const dist = join(pkg, "dist");
const dest = join(root, "public", "gmsh");
const sentinel = join(dest, ".version");
const files = [
  "gmsh.mjs",
  "gmsh-core.mjs",
  "gmsh-core.wasm",
  "gmsh-descriptor.mjs",
  "runtime.mjs",
];

if (!existsSync(join(dist, "gmsh-core.wasm"))) {
  console.error(
    "gmsh-assets: @loumalouomega/gmsh-wasm is not installed (npm install first).",
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
  staged === version && files.every((file) => existsSync(join(dest, file)));

if (complete) {
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const file of files) copyFileSync(join(dist, file), join(dest, file));
writeFileSync(sentinel, `${version}\n`);
console.log(`gmsh-assets: staged ${version} into public/gmsh/`);
