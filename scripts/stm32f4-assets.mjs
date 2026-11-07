// scripts/stm32f4-assets.mjs — stage the STM32F4 core's WASM + per-chip SVDs
// in public/, because the npm entry that bundles them uses node:fs and cannot
// be part of a browser build. The emulator itself is the package's universal
// `./emulator` entry, which takes these as URLs.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = "node_modules/stm32f4-emu/site/vendor";
const dest = "public/stm32f4";
const files = [
  "stm32_periph_wasm_bg.wasm",
  "stm32f401.svd",
  "stm32f407.svd",
  "stm32f411.svd",
  "stm32f429.svd",
];

if (!existsSync(src)) {
  console.warn("stm32f4-emu not installed; skipping STM32F4 assets");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const file of files) copyFileSync(join(src, file), join(dest, file));
console.log(`stm32f4-assets: ${files.length} files -> ${dest}`);
