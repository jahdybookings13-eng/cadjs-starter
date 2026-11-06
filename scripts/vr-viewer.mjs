#!/usr/bin/env node
// VR live viewer: the AI drives the headless VR env through HTTP; you watch
// the actual headset view live in a browser. Edit code -> vite HMR reloads ->
// this auto-re-enters VR -> the viewer keeps showing the world. No screenshots
// sent back and forth.
//
//   npm run dev &                                  # app on https://localhost:3000
//   node scripts/vr-viewer.mjs                     # viewer on http://localhost:4399
//   node scripts/vr-viewer.mjs --steps vr-steps.json   # auto-run + hotswap steps file
//
// AI API (JSON):
//   POST /do     {"method":"lookDown","args":[]}          -> result
//   POST /steps  {"steps":[{do|shot|wait|enter|url}...]}  -> {results, logs, errors}
//   GET  /state  -> {active, mode, fb, errors, logs}
//   GET  /shot   -> current frame PNG/JPEG bytes
//   GET  /stream -> SSE: frame + state events (viewer UI)

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const FAKE_XR = path.join(ROOT, "e2e", "vr-fake-xr.js");
const NOISE =
  /favicon|Download the React DevTools|WebGPU|deprecat|Scene, camera, or renderer not available|already been passed to createRoot/i;
const LOG_RE =
  /BELT|ARMED|SKETCH|EXTRUDE|VR |grabb|grab|select|constraint|solve/i;
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
  "selection",
  "selectFirst",
  "spawnBox",
  "triad",
  "subSelection",
  "debugRaycast",
  "hoverBeam",
  "selectBeam",
  "spawnFree",
  "spawnTriad",
  "spawnDesk",
  "attachToFace",
  "moveTriad",
  "rotateTriad",
  "selectPlane",
  "clearTriad",
  "beamState",
  "setBeamDistance",
  "enableDebug",
]);

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : dflt;
}
const PORT = Number(arg("--port", "4399"));
const APP = arg("--app", process.env.E2E_BASE_URL || "https://localhost:3000");
const STEPS_FILE = arg("--steps", "vr-steps.json");

// ---------- runtime state ----------
const errors = [];
const logs = [];
let lastFrame = null; // {buf, mime}
// eslint-disable-next-line no-unused-vars
let lastFrameAt = 0;
let sessionActive = false;
let busy = false;
const clients = new Set();

function send(type, data) {
  const msg = `event: ${type}\ndata: ${data}\n\n`;
  for (const res of clients) res.write(msg);
}
function pushState() {
  send(
    "state",
    JSON.stringify({
      active: sessionActive,
      busy,
      mode: stateMode,
      errors: errors.slice(-12),
      logs: logs.slice(-40),
      selection: stateSelection,
      triad: stateTriad,
      beam: stateBeam,
    }),
  );
}
let stateMode = null;
let stateSelection = null;
let stateTriad = null;
let stateBeam = null;

function note(text) {
  logs.push(text);
  if (logs.length > 300) logs.shift();
  pushState();
}

// ---------- browser ----------
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !NOISE.test(t)) {
    errors.push({ kind: "console", text: t, at: Date.now() });
    pushState();
  } else if (LOG_RE.test(t) && !NOISE.test(t)) {
    logs.push(t);
    if (logs.length > 300) logs.shift();
    pushState();
  }
});
page.on("pageerror", (e) => {
  errors.push({
    kind: "pageerror",
    text: String(e?.stack || e),
    at: Date.now(),
  });
  pushState();
});

let entering = null;
async function enterVR() {
  if (entering) return entering;
  entering = (async () => {
    const already = await page
      .evaluate(() => window.__vr?.sessionActive?.())
      .catch(() => false);
    if (already) {
      sessionActive = true;
      pushState();
      return;
    }
    await page.getByTestId("cad-canvas").waitFor({ timeout: 30_000 });
    const btn = page.getByRole("button", { name: "VR", exact: true });
    await btn.waitFor({ timeout: 20_000 });
    await btn.click();
    await page.waitForFunction(
      () => {
        const v = window.__vr;
        return v && v.sessionActive() && v.info().fb;
      },
      undefined,
      { timeout: 25_000 },
    );
    await page.evaluate(() => window.__vr.enableDebug());
    sessionActive = true;
    pushState();
  })().finally(() => {
    entering = null;
  });
  return entering;
}

async function focusVRCanvas() {
  try {
    await page.evaluate(() => {
      const id = "vr-viewer-focus";
      let st = document.getElementById(id);
      if (!st) {
        st = document.createElement("style");
        st.id = id;
        document.head.appendChild(st);
      }

      st.textContent = `
        html,body{margin:0!important;background:#000!important;overflow:hidden!important}
        body *:not(canvas):not(:has(canvas)){display:none!important}
        [data-testid="cad-canvas"]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;display:block!important;z-index:2147483647!important}
        [data-testid="cad-canvas"] canvas{width:100%!important;height:100%!important;display:block!important}
      `;
    });
  } catch {
    /* viewer only */
  }
}

page.on("load", () => {
  // vite HMR / full reload: re-enter VR automatically once the app is ready
  if (page.url().startsWith("http")) {
    setTimeout(
      () =>
        enterVR().catch(() => {
          sessionActive = false;
          pushState();
        }),
      500,
    );
  }
});

await page.addInitScript({ path: FAKE_XR });
await page.goto(APP);
await enterVR();

// ---------- screencast ----------
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
  lastFrame = Buffer.from(data, "base64");
  lastFrameAt = Date.now();
  send("frame", data);
  try {
    await cdp.send("Page.screencastFrameAck", { sessionId });
  } catch {
    /* gone */
  }
});
await cdp.send("Page.startScreencast", {
  format: "jpeg",
  quality: 70,
  maxWidth: 1280,
  maxHeight: 720,
  everyNthFrame: 2,
});

async function captureViewerFrame() {
  try {
    const buf = await page
      .locator('[data-testid="cad-canvas"] canvas')
      .screenshot({ type: "jpeg", quality: 70 });
    lastFrame = buf;
    lastFrameAt = Date.now();
    send("frame", buf.toString("base64"));
    return;
  } catch {
    /* canvas element screenshot failed */
  }

  try {
    const box = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="cad-canvas"] canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return {
        x: Math.max(0, Math.floor(r.x)),
        y: Math.max(0, Math.floor(r.y)),
        width: Math.floor(r.width),
        height: Math.floor(r.height),
      };
    });

    if (box) {
      const buf = await page.screenshot({
        type: "jpeg",
        quality: 70,
        clip: box,
      });
      lastFrame = buf;
      lastFrameAt = Date.now();
      send("frame", buf.toString("base64"));
      return;
    }
  } catch {
    /* canvas clip failed */
  }

  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 70 });
    lastFrame = buf;
    lastFrameAt = Date.now();
    send("frame", buf.toString("base64"));
  } catch {
    /* page not ready */
  }
}

setInterval(() => {
  focusVRCanvas().catch(() => {});
}, 1000);

setInterval(() => {
  captureViewerFrame().catch(() => {});
}, 500);

// ---------- step runner ----------
async function runSteps(steps) {
  if (busy) throw new Error("runner busy");
  busy = true;
  pushState();
  const results = [];
  try {
    for (const step of steps) {
      if (step.enter) {
        if (!sessionActive) await enterVR();
      } else if (step.wait) {
        await page.evaluate((n) => window.__vr.frame(n), step.wait);
      } else if (step.do) {
        if (!ALLOWED.has(step.do)) throw new Error(`bad method ${step.do}`);
        const res = await page.evaluate(
          ([m, a]) => window.__vr[m](...a),
          [step.do, step.args || []],
        );
        if (res !== undefined) results.push({ method: step.do, result: res });
        if (step.do === "mode") {
          stateMode = res;
        }
        if (step.do === "selection" || step.do === "selectFirst") {
          stateSelection = res;
        }
        if (
          step.do === "triad" ||
          step.do === "spawnFree" ||
          step.do === "spawnTriad" ||
          step.do === "spawnDesk" ||
          step.do === "attachToFace" ||
          step.do === "moveTriad" ||
          step.do === "rotateTriad" ||
          step.do === "selectPlane" ||
          step.do === "clearTriad"
        ) {
          stateTriad = res;
        }
        if (step.do === "beamState" || step.do === "setBeamDistance") {
          stateBeam = res;
        }
      }
    }
  } finally {
    busy = false;
    pushState();
  }
  return { results, errors: errors.slice(-8), logs: logs.slice(-20) };
}

let stepsTimer = null;
async function runStepsFile() {
  const file = path.resolve(STEPS_FILE);
  if (!fs.existsSync(file)) return;
  try {
    const steps = JSON.parse(fs.readFileSync(file, "utf8"));
    await runSteps(steps);
  } catch (e) {
    logs.push(`steps-file error: ${e.message}`);
    pushState();
  }
}
if (fs.existsSync(path.resolve(STEPS_FILE))) {
  fs.watch(path.resolve(STEPS_FILE), () => {
    clearTimeout(stepsTimer);
    stepsTimer = setTimeout(runStepsFile, 300);
  });
  runStepsFile();
}

// ---------- http ----------
const HTML = `<!doctype html><meta charset=utf-8><title>VR Live Viewer — Watch Only</title>
<style>
 body{margin:0;background:#05060a;color:#ddd;font:13px/1.4 ui-monospace,monospace;display:flex;height:100vh;overflow:hidden}
 #stage{flex:1;display:flex;align-items:center;justify-content:center;background:#000}
 #f{max-width:100%;max-height:100vh;image-rendering:auto}
 #side{width:360px;padding:10px;overflow:auto;border-left:#222 solid 1px;background:#08090f}
 h3{margin:12px 0 4px;color:#8af;font-size:12px;text-transform:uppercase}
 #st{color:#ccc;font-size:12px}
 #hint{color:#7aa;padding:8px;border:1px solid #243;background:#101826;border-radius:6px;font-size:12px}
 #state{color:#bcd;white-space:pre-wrap;font-size:12px}
 #errs{color:#f77;white-space:pre-wrap;font-size:11px;max-height:140px;overflow:auto}
 #lg{color:#9a9;white-space:pre-wrap;font-size:11px;max-height:420px;overflow:auto}
 .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#f33;margin-right:4px}
 .on{background:#3d3}
</style>
<div id=stage><img id=f alt="VR headset view"></div>
<div id=side>
 <div id=st><span class=dot id=dot></span><b>VR LIVE VIEWER</b> <span id=mode></span></div>
 <h3>Role</h3>
 <div id=hint>Watch-only viewport. You confirm the live VR world here; the AI drives via POST /do and POST /steps.</div>
 <h3>State</h3><div id=state></div>
 <h3>Errors</h3><div id=errs></div>
 <h3>Activity</h3><div id=lg></div>
</div>
<script>
const img=document.getElementById('f'),dot=document.getElementById('dot'),
 mode=document.getElementById('mode'),state=document.getElementById('state'),
 errs=document.getElementById('errs'),lg=document.getElementById('lg');
const es=new EventSource('/stream');
es.addEventListener('frame',e=>{img.src='data:image/jpeg;base64,'+e.data;});
function render(s){
 dot.className='dot'+(s.active?' on':'');
 mode.textContent=(s.busy?' · running':'')+(s.mode?' · mode: '+s.mode:'');
const selRaw=s.selection;let sel='none';if(selRaw&&selRaw.kind){sel=selRaw.kind+(selRaw.ids&&selRaw.ids.length?': '+selRaw.ids[0]:'');}else if(Array.isArray(selRaw)&&selRaw.length){sel=selRaw.map(x=>x.nodeId).join(', ');}
const tr=s.triad;const triad=tr&&tr.placed?(tr.host+' '+tr.activePlane):'none';
const bm=s.beam;const beam=bm&&bm.target?('d='+Number(bm.distance).toFixed(2)+' @ '+bm.target.map(v=>Number(v).toFixed(2)).join(',')):'none';
state.textContent=['active: '+s.active,'busy: '+s.busy,'mode: '+s.mode,'selection: '+sel,'triad: '+triad,'beam: '+beam].join('\\n');
 errs.textContent=s.errors.map(x=>x.kind+': '+x.text.slice(0,200)).join('\\n');
 lg.textContent=s.logs.join('\\n');lg.scrollTop=lg.scrollHeight;
}
fetch('/state').then(r=>r.json()).then(render).catch(()=>{});
es.addEventListener('state',e=>render(JSON.parse(e.data)));
</script>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(HTML);
    } else if (req.method === "GET" && url.pathname === "/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      clients.add(res);
      req.on("close", () => clients.delete(res));
      pushState();
    } else if (req.method === "GET" && url.pathname === "/shot") {
      res.writeHead(lastFrame ? 200 : 503, { "content-type": "image/jpeg" });
      res.end(lastFrame || "");
    } else if (req.method === "GET" && url.pathname === "/state") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          active: sessionActive,
          busy,
          mode: stateMode,
          selection: stateSelection,
          triad: stateTriad,
          beam: stateBeam,
          errors: errors.slice(-10),
          logs: logs.slice(-20),
        }),
      );
    } else if (req.method === "POST" && url.pathname === "/do") {
      const { method, args = [] } = JSON.parse(await body(req));
      if (!ALLOWED.has(method)) throw new Error(`bad method ${method}`);
      note(`AI: ${method}(${JSON.stringify(args)})`);
      const result = await page.evaluate(
        ([m, a]) => window.__vr[m](...a),
        [method, args],
      );
      if (method === "mode") stateMode = result;
      if (method === "selection" || method === "selectFirst")
        stateSelection = result;
      if (
        method === "triad" ||
        method === "spawnFree" ||
        method === "spawnTriad" ||
        method === "spawnDesk" ||
        method === "attachToFace" ||
        method === "moveTriad" ||
        method === "rotateTriad" ||
        method === "selectPlane" ||
        method === "clearTriad"
      )
        stateTriad = result;
      if (method === "beamState" || method === "setBeamDistance")
        stateBeam = result;
      if (method === "endSession") sessionActive = false;
      pushState();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));
    } else if (req.method === "POST" && url.pathname === "/steps") {
      const { steps } = JSON.parse(await body(req));
      note(`AI steps: ${steps.length} action(s)`);
      const out = await runSteps(steps);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...out }));
    } else if (req.method === "POST" && url.pathname === "/clear") {
      errors.length = 0;
      logs.length = 0;
      pushState();
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});
function body(req) {
  return new Promise((res) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => res(d));
  });
}
server.listen(PORT, "127.0.0.1", () => {
  console.log(`VR viewer:  http://localhost:${PORT}   (open this — you watch, AI drives)
AI API:       POST /do {"method","args"} · POST /steps {"steps":[...]} · GET /state · GET /shot · POST /clear
App:          ${APP} · steps hotswap: ${path.resolve(STEPS_FILE)}${fs.existsSync(path.resolve(STEPS_FILE)) ? "" : " (absent)"}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    try {
      await cdp.send("Page.stopScreencast");
    } catch {
      /* gone */
    }
    await browser.close().catch(() => {});
    process.exit(0);
  });
}
