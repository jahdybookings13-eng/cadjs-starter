#!/usr/bin/env node
// check-bundle.mjs — production budget for what the browser downloads before
// the first frame. Run after `npm run build`.
//
// It reads the initial <script>/<link> tags from dist/index.html (not worker
// chunks or lazily-fetched wasm), so a regression in the boot path fails here
// instead of being discovered on a headset.

import { readFileSync } from "node:fs";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { resolve } from "node:path";

const DIST = resolve("dist");
const BUDGET = {
  jsGzip: 0.8 * 1024 * 1024, // measured 0.62 MB after the Rapier/VR split
  cssGzip: 20 * 1024, // measured 7.0 KB
  rawJs: 3.5 * 1024 * 1024, // measured 2.77 MB
};

let html;
try {
  html = readFileSync(resolve(DIST, "index.html"), "utf8");
} catch {
  console.error("check-bundle: dist/index.html missing — run `npm run build`");
  process.exit(1);
}

const files = new Set();
for (const m of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
  files.add(m[1].replace(/^\//, ""));
}

if (!files.size) {
  console.error("check-bundle: no initial js/css found in dist/index.html");
  process.exit(1);
}

let jsRaw = 0;
let jsGzip = 0;
let cssGzip = 0;
console.log("initial payload");
for (const rel of [...files].sort()) {
  const bytes = readFileSync(resolve(DIST, rel));
  const gz = gzipSync(bytes).length;
  const br = brotliCompressSync(bytes).length;
  if (rel.endsWith(".css")) cssGzip += gz;
  else {
    jsRaw += bytes.length;
    jsGzip += gz;
  }
  console.log(
    `  ${rel}: ${(bytes.length / 1024).toFixed(1)} KB raw, ` +
      `${(gz / 1024).toFixed(1)} KB gzip, ${(br / 1024).toFixed(1)} KB brotli`,
  );
}
console.log(
  `total: ${(jsRaw / 1024 / 1024).toFixed(2)} MB raw JS, ` +
    `${(jsGzip / 1024 / 1024).toFixed(2)} MB gzip JS, ` +
    `${(cssGzip / 1024).toFixed(1)} KB gzip CSS`,
);

const failures = [];
if (jsGzip > BUDGET.jsGzip)
  failures.push(
    `JS gzip ${(jsGzip / 1024 / 1024).toFixed(2)} MB > ` +
      `${(BUDGET.jsGzip / 1024 / 1024).toFixed(2)} MB budget`,
  );
if (jsRaw > BUDGET.rawJs)
  failures.push(
    `JS raw ${(jsRaw / 1024 / 1024).toFixed(2)} MB > ` +
      `${(BUDGET.rawJs / 1024 / 1024).toFixed(2)} MB budget`,
  );
if (cssGzip > BUDGET.cssGzip)
  failures.push(
    `CSS gzip ${(cssGzip / 1024).toFixed(1)} KB > ` +
      `${(BUDGET.cssGzip / 1024).toFixed(0)} KB budget`,
  );

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log("bundle budget: PASS");
