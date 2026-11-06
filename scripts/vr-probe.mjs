#!/usr/bin/env node
// Headless VR probe: drives cadjs-starter's real WebXR path against a fake
// XR device, runs a step file, saves screenshots + state snapshots, prints
// a JSON summary (errors, shots) so iteration happens without a headset.
//
// Usage:
//   npm run dev &                       # vite on https://localhost:3000
//   node scripts/vr-probe.mjs steps.json
//   node scripts/vr-probe.mjs --do 'lookDown' --do 'wait:10'
//
// Step file: JSON array of steps. Each step is one of:
//   { "do": "<method>", "args": [...] }   -> calls window.__vr.<method>(...args)
//   { "shot": "name" }                    -> saves vr-shots/probe-<i>-<name>.png
//   { "enter": true }                     -> clicks VR button + waits for session
//   { "wait": n }                         -> n rAF frames (default 8 after enter)
//   { "url": "https://..." }              -> base url override (first step)
// Allowed __vr methods: sessionActive, frame, setHead, lookDown, lookUp,
// lookYaw, setHand, pointAt, press, axes, reset, endSession, info.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const FAKE_XR = path.join(ROOT, "e2e", "vr-fake-xr.js");
const SHOTS = path.join(ROOT, "vr-shots");
const ALLOWED = new Set([
  "sessionActive",
  "frame",
  "setHead",
  "lookDown",
  "lookUp",
  "lookYaw",
  "setHand",
  "pointAt",
  "press",
  "axes",
  "reset",
  "endSession",
  "info",
  "mode",
  "elements",
  "beltSeg",
  "enableDebug",
]);

function parseCli(argv) {
  const steps = [];
  let url = process.env.E2E_BASE_URL || "https://localhost:3000";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") url = argv[++i];
    else if (a === "--do") {
      const spec = argv[++i];
      const [m, rest] = spec.includes(":")
        ? [spec.slice(0, spec.indexOf(":")), spec.slice(spec.indexOf(":") + 1)]
        : [spec, ""];
      if (m === "shot") steps.push({ shot: rest || "shot" });
      else if (m === "wait") steps.push({ wait: Number(rest) || 8 });
      else steps.push({ do: m, args: rest ? JSON.parse(rest) : [] });
    } else if (!a.startsWith("--")) {
      const file = JSON.parse(fs.readFileSync(a, "utf8"));
      steps.push(...file);
      if (file.url) url = file.url;
    }
  }
  steps.unshift({ enter: true });
  return { url, steps };
}

const { url, steps } = parseCli(process.argv.slice(2));
fs.mkdirSync(SHOTS, { recursive: true });

const NOISE =
  /favicon|Download the React DevTools|WebGPU|deprecat|Scene, camera, or renderer not available|already been passed to createRoot/i;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();
const errors = [];
const logs = [];
const LOG_RE = /BELT|ARMED|SKETCH|EXTRUDE|VR |grabb|grab|select/i;
page.on("console", (m) => {
  if (m.type() === "error") errors.push({ kind: "console", text: m.text() });
  else if (LOG_RE.test(m.text()) && logs.length < 300) logs.push(m.text());
});
page.on("pageerror", (e) =>
  errors.push({ kind: "pageerror", text: String(e?.stack || e) }),
);

await page.addInitScript({ path: FAKE_XR });
await page.goto(url);
await page
  .getByText("Loading...")
  .waitFor({ state: "hidden", timeout: 30_000 });
await page.getByTestId("cad-canvas").waitFor({ timeout: 15_000 });

const shots = [];
const results = [];
let i = 0;
for (const step of steps) {
  i++;
  try {
    if (step.enter) {
      const btn = page.getByRole("button", { name: "VR", exact: true });
      await btn.waitFor({ timeout: 15_000 });
      await btn.click();
      await page.waitForFunction(
        () => {
          const v = window.__vr;
          return v && v.sessionActive() && v.info().fb;
        },
        undefined,
        { timeout: 20_000 },
      );
      await page.evaluate(() => {
        window.__vr.enableDebug();
        return window.__vr.frame(8);
      });
    } else if (step.wait) {
      await page.evaluate((n) => window.__vr.frame(n), step.wait);
    } else if (step.shot) {
      const f = path.join(
        SHOTS,
        `probe-${String(i).padStart(2, "0")}-${step.shot}.png`,
      );
      await page.screenshot({ path: f });
      shots.push(f);
    } else if (step.do) {
      if (!ALLOWED.has(step.do)) throw new Error(`bad method ${step.do}`);
      const res = await page.evaluate(
        ([m, a]) => window.__vr[m](...a),
        [step.do, step.args || []],
      );
      if (res !== undefined)
        results.push({ step: i, method: step.do, result: res });
    }
  } catch (err) {
    errors.push({
      kind: "step",
      text: `step ${i} (${step.do || step.shot || "enter"}): ${err.message}`,
    });
    if (step.shot) {
      const f = path.join(
        SHOTS,
        `probe-${String(i).padStart(2, "0")}-FAILED.png`,
      );
      await page.screenshot({ path: f }).catch(() => {});
      shots.push(f);
    }
  }
}

const finalInfo = await page
  .evaluate(() => window.__vr.info())
  .catch(() => null);
await browser.close();

const realErrors = errors.filter((e) => !NOISE.test(e.text));
console.log(
  JSON.stringify(
    {
      url,
      steps: steps.length,
      shots,
      results,
      logs,
      errors,
      realErrors,
      finalInfo,
    },
    null,
    2,
  ),
);
process.exit(realErrors.length ? 1 : 0);
