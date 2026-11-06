#!/usr/bin/env node
// Slicer daemon: Node side of the local print pipeline.
//
// Endpoints:
//   GET  /health                       daemon + slicer availability
//   GET  /jobs                         job list with last event
//   POST /slice                        {kind, stlB64, stlName?, params} -> {jobId, status}
//   GET  /job/<id>/events              NDJSON stream: start / log / done
//   GET  /job/<id>/gcode               sliced gcode file bytes
//   POST /print                        {gcodeB64, filename?} -> stored under ~/Prints
//
// The browser prepares the slice config from its PrintProfile
// (profileStore.profileParams) and posts the selection STL; the daemon
// assembles a .3mf project, spawns the slicer CLI from PATH (or the
// --orca/--prusaslicer/--cura / SLICER_* override), and streams progress.
// The wizard then uploads the gcode to the printer over its adapter.
//
//   node slicers/daemon.mjs [port=8631] [--orca /path] [--prusaslicer /p] [--cura /p]

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";

const port = Number(process.argv[2] ?? 8631);
const printDir = path.resolve(os.homedir(), "Prints");
const jobsDir = path.join(printDir, "jobs");
mkdirSync(jobsDir, { recursive: true });

const argValues = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a?.startsWith("--")) argValues[a.slice(2)] = process.argv[i + 1];
}
const BIN = {
  orca: argValues.orca ?? process.env.SLICER_ORCA ?? null,
  prusaslicer: argValues.prusaslicer ?? process.env.SLICER_PRUSASLICER ?? null,
  cura: argValues.cura ?? process.env.SLICER_CURA ?? null,
};

function which(bin, override) {
  if (override && existsSync(override)) return override;
  const names =
    bin === "cura"
      ? ["CuraEngine", "CuraEngineCLI", "curaengine"]
      : bin === "prusaslicer"
        ? ["PrusaSlicer", "prusaslicer"]
        : ["OrcaSlicer", "oraslicer", "orca"];
  for (const d of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean))
    for (const n of names) {
      const p = path.join(d, n);
      if (existsSync(p)) return p;
    }
  return null;
}

const KIND_LABEL = {
  orca: "OrcaSlicer",
  prusaslicer: "PrusaSlicer",
  cura: "Cura (CuraEngine)",
};

const ETAG = "http://schemas.microsoft.com/3dmanufacturing/2015/02";

function xmlEscape(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// .3mf slice config: every key lands verbatim in the project's slice
// configuration, so profile temps / line widths / tolerance / support all
// reach the gcode.
function build3mf(stlName, params, stlBytes) {
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rel0" Type="${ETAG}/3D_Manufacturing" Target="/3DModel/3dmodel.model"/>` +
    `<Relationship Id="rel1" Type="${ETAG}/Metadata" Target="/Metadata/core.xml"/>` +
    `<Relationship Id="rel2" Type="${ETAG}/Slice_Configuration" Target="/SliceConfig/params.cfg"/></Relationships>`;
  const metadata =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<metadata xmlns="http://schemas.microsoft.com/3dmanufacturing/v1/property_schema.xsd">` +
    `<name>scadgen</name><manufacturer>scadgen</manufacturer><model>print</model><units>millimeter</units></metadata>`;
  const cfg = [
    "; scadgen slice config (profile-mapped keys)",
    ...Object.entries(params).map(([k, v]) => `${k}=${v}`),
  ].join("\n") + "\n";
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="cfg" ContentType="text/plain"/>` +
    `<Default Extension="stl" ContentType="application/octet-stream"/></Types>`;
  const model =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/v1/3dobjectschema">` +
    `<resources><object id="1" type="model"><mesh>` +
    `<vtl name="imported: ${xmlEscape(stlName)}"/>` +
    `</mesh></object></resources>` +
    `<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build></model>`;
  return zipStore([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "3DModel/3dmodel.model", data: Buffer.from(model, "utf8") },
    { name: "Metadata/core.xml", data: Buffer.from(metadata, "utf8") },
    { name: "SliceConfig/params.cfg", data: Buffer.from(cfg, "utf8") },
    { name: `Meshes/${stlName}`, data: stlBytes },
  ]);
}

function zipStore(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameB = Buffer.from(f.name, "utf8");
    const lb = Buffer.alloc(30 + nameB.length);
    lb.writeUInt32LE(0x04034b50, 0);
    lb.writeUInt16LE(20, 4);
    lb.writeUInt16LE(0x0800, 6);
    lb.writeUInt16LE(0, 8);
    lb.writeUInt16LE(0, 10);
    lb.writeUInt16LE(0, 12);
    lb.writeUInt32LE(0, 14);
    lb.writeUInt32LE(f.data.length, 18);
    lb.writeUInt32LE(f.data.length, 22);
    lb.writeUInt16LE(nameB.length, 26);
    lb.writeUInt16LE(0, 28);
    nameB.copy(lb, 30);
    local.push(lb, f.data);
    const cb = Buffer.alloc(46 + nameB.length);
    cb.writeUInt32LE(0x02014b50, 0);
    cb.writeUInt16LE(20, 4);
    cb.writeUInt16LE(20, 6);
    cb.writeUInt16LE(0x0800, 8);
    cb.writeUInt16LE(0, 10);
    cb.writeUInt16LE(0, 12);
    cb.writeUInt16LE(0, 14);
    cb.writeUInt32LE(0, 16);
    cb.writeUInt32LE(f.data.length, 20);
    cb.writeUInt32LE(f.data.length, 24);
    cb.writeUInt16LE(nameB.length, 28);
    cb.writeUInt32LE(offset, 42);
    nameB.copy(cb, 46);
    central.push(cb);
    offset += lb.length + f.data.length;
  }
  const cdB = Buffer.concat(central);
  const eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0);
  eo.writeUInt16LE(central.length, 8);
  eo.writeUInt16LE(central.length, 10);
  eo.writeUInt32LE(cdB.length, 12);
  eo.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, eo]);
}

/** jobId -> job state */
const jobs = new Map();
/** jobId -> NDJSON stream listener */
const listeners = new Map();

function emitJob(jobId, evt) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.events.push(evt);
  if (job.events.length > 2000) job.events.splice(0, job.events.length - 2000);
  if (evt.event === "done") {
    job.status = "done";
    job.error = evt.error ?? null;
  }
  const l = listeners.get(jobId);
  if (l) l(evt);
}

function runSlicerJob(kind, stlB64, params, stlName) {
  const bin = which(kind, BIN[kind]);
  if (!bin)
    return {
      error:
        `${KIND_LABEL[kind]} not found. Install it in PATH ` +
        `or pass --${kind} / SLICER_${kind.toUpperCase()}.`,
    };
  const jobId = randomUUID();
  const jobDir = path.join(jobsDir, jobId);
  mkdirSync(jobDir, { recursive: true });
  const out3mf = path.join(jobDir, "job.3mf");
  const outGcode = path.join(jobDir, "out.gcode");
  const stlBytes = Buffer.from(stlB64, "base64");
  writeFileSync(out3mf, build3mf(stlName, params, stlBytes));
  const cmds =
    kind === "cura"
      ? ["--output", outGcode, "-j", out3mf]
      : ["-i", out3mf, "-o", outGcode];
  const child = spawn(bin, cmds, { stdio: ["ignore", "pipe", "pipe"] });
  jobs.set(jobId, {
    status: "running",
    events: [
      {
        event: "start",
        bin,
        input: out3mf,
        output: outGcode,
      },
    ],
    error: null,
    outGcode,
    child,
  });
  const flush = { buf: "" };
  const onData = (d) => {
    flush.buf += d.toString("utf8");
    for (;;) {
      const i = flush.buf.indexOf("\n");
      if (i < 0) break;
      const line = flush.buf.slice(0, i).replace(/\r$/, "").trim();
      flush.buf = flush.buf.slice(i + 1);
      if (line) emitJob(jobId, { event: "log", line });
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("error", (e) =>
    emitJob(jobId, { event: "done", error: e.message }),
  );
  child.on("close", (code) => {
    const j = jobs.get(jobId);
    if (!j) return;
    if (code === 0 && existsSync(j.outGcode))
      emitJob(jobId, { event: "done", file: j.outGcode });
    else
      emitJob(jobId, { event: "done", error: `slicer exited ${code}` });
  });
  return { jobId, status: "running", output: outGcode };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const send = (status, body, type = "application/json") => {
    if (res.writableEnded) return;
    res.writeHead(status, { "Content-Type": type });
    res.end(body);
  };
  const takeBody = async () => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
  try {
    if (url.pathname === "/health") {
      return send(
        200,
        JSON.stringify({
          ok: true,
          printDir,
          orca: which("orca", BIN.orca),
          prusaslicer: which("prusaslicer", BIN.prusaslicer),
          cura: which("cura", BIN.cura),
        }),
      );
    }
    if (url.pathname === "/jobs") {
      return send(
        200,
        JSON.stringify(
          [...jobs.entries()].map(([id, j]) => ({
            id,
            status: j.status,
            last: j.events[j.events.length - 1] ?? null,
            error: j.error ?? null,
          })),
        ),
      );
    }
    if (url.pathname === "/slice" && req.method === "POST") {
      const body = await takeBody();
      if (body.kind !== "orca" && body.kind !== "prusaslicer" && body.kind !== "cura")
        return send(400, JSON.stringify({ error: "bad kind" }));
      const r = runSlicerJob(
        body.kind,
        body.stlB64,
        body.params ?? {},
        body.stlName ?? "part.stl",
      );
      if (r.error) return send(500, JSON.stringify({ error: r.error }));
      return send(200, JSON.stringify(r));
    }
    if (url.pathname.startsWith("/job/events/")) {
      const jobId = url.pathname.slice("/job/events/".length);
      const job = jobs.get(jobId);
      if (!job) return send(404, JSON.stringify({ error: "unknown job" }));
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      });
      for (const e of job.events) res.write(JSON.stringify(e) + "\n");
      listeners.set(jobId, (e) => {
        res.write(JSON.stringify(e) + "\n");
        if (e.event === "done") {
          listeners.delete(jobId);
          res.end();
        }
      });
      req.on("close", () => listeners.delete(jobId));
      return;
    }
    if (url.pathname.startsWith("/job/gcode/")) {
      const jobId = url.pathname.slice("/job/gcode/".length);
      const job = jobs.get(jobId);
      if (!job || !existsSync(job.outGcode))
        return send(404, JSON.stringify({ error: "gcode not ready" }));
      const bytes = readFileSync(job.outGcode);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${path.basename(job.outGcode)}"`,
      });
      return void res.end(bytes);
    }
    if (url.pathname === "/print" && req.method === "POST") {
      const body = await takeBody();
      const gcode = Buffer.from(body.gcodeB64, "base64");
      const name = body.filename ?? "scadgen.gcode";
      const dest = path.join(printDir, name);
      writeFileSync(dest, gcode);
      return send(200, JSON.stringify({ ok: true, path: dest, bytes: gcode.length }));
    }
    send(404, JSON.stringify({ error: "not found" }));
  } catch (e) {
    send(500, JSON.stringify({ error: (e as Error)?.message ?? "server error" }));
  }
});

server.listen(port, () => {
  console.log(`[slicer-daemon] pid ${process.pid} listening on :${port}`);
  console.log(`[slicer-daemon] print dir: ${printDir}`);
  for (const k of ["orca", "prusaslicer", "cura"] as const)
    console.log(`[slicer-daemon] ${k}: ${which(k, BIN[k]) ?? "not found"}`);
});

function shutdown() {
  for (const [, j] of jobs) {
    try {
      j.child?.kill();
    } catch {
      /* already dead */
    }
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);