// Browser client for the Node slicer daemon (slicers/daemon.mjs).
//
// The wizard posts the selection STL + profileParams here, streams the
// job's NDJSON log, and fetches the gcode when the job lands. The gcode is
// then handed to the printer adapter (OctoPrint/Moonraker) — the browser
// never spawns a process itself.

export const SLICER_DAEMON_PORT = 8631;

export interface SlicerSliceRequest {
  kind: "orca" | "prusaslicer" | "cura";
  stlBytes: Uint8Array;
  stlName: string;
  params: Record<string, string>;
}

export interface SlicerJobEvent {
  event: "start" | "log" | "done";
  bin?: string;
  input?: string;
  output?: string;
  line?: string;
  file?: string;
  error?: string;
}

export type SlicerHealth =
  | {
      ok: true;
      printDir?: string;
      orca: string | null;
      prusaslicer: string | null;
      cura: string | null;
    }
  | { ok: false; error: string };

function daemonUrl(): string {
  const w = window as unknown as { __scadgenSlicerDaemon?: string };
  return w.__scadgenSlicerDaemon ?? `http://127.0.0.1:${SLICER_DAEMON_PORT}`;
}

function b64(bytes: Uint8Array): string {
  const arr = new Array<string>(bytes.length);
  for (let i = 0; i < bytes.length; i++)
    arr[i] = String.fromCharCode(bytes[i]!);
  return btoa(arr.join(""));
}

export async function health(base?: string): Promise<SlicerHealth> {
  const b = base ?? daemonUrl();
  try {
    const r = await fetch(`${b}/health`);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return (await r.json()) as SlicerHealth;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function submitSlice(
  req: SlicerSliceRequest,
  base?: string,
): Promise<
  { jobId: string; status: string; output?: string } | { error: string }
> {
  const b = base ?? daemonUrl();
  try {
    const r = await fetch(`${b}/slice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: req.kind,
        stlB64: b64(req.stlBytes),
        stlName: req.stlName,
        params: req.params,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      jobId?: string;
      status?: string;
      output?: string;
      error?: string;
    };
    if (!r.ok || j.error) return { error: j.error ?? `HTTP ${r.status}` };
    if (!j.jobId || !j.status)
      return { error: j.error ?? "bad response shape" };
    const out: { jobId: string; status: string; output?: string } = {
      jobId: j.jobId,
      status: j.status,
    };
    if (j.output !== undefined) out.output = j.output;
    return out;
  } catch (e) {
    return { error: String(e) };
  }
}

/** Stream job events until `done` (4xx/5xx → throw with the event's error). */
export async function watchJob(
  jobId: string,
  onEvent: (e: SlicerJobEvent) => void,
  base?: string,
): Promise<{ file?: string; error?: string }> {
  const b = base ?? daemonUrl();
  const res = await fetch(`${b}/job/events/${jobId}`, {
    headers: { Accept: "application/x-ndjson" },
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let result: { file?: string; error?: string } = {};
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "").trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const evt = JSON.parse(line) as SlicerJobEvent;
      onEvent(evt);
      if (evt.event === "done") {
        if (evt.file !== undefined) result.file = evt.file;
        if (evt.error !== undefined) result.error = evt.error;
      }
    }
  }
  return result;
}

export async function fetchGcode(
  jobId: string,
  base?: string,
): Promise<Uint8Array> {
  const b = base ?? daemonUrl();
  const r = await fetch(`${b}/job/gcode/${jobId}`);
  if (!r.ok) throw new Error(`gcode fetch failed: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function storeGcode(
  gcode: Uint8Array,
  filename?: string,
  base?: string,
): Promise<{ path: string } | { error: string }> {
  const b = base ?? daemonUrl();
  const r = await fetch(`${b}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gcodeB64: b64(gcode),
      ...(filename ? { filename } : {}),
    }),
  });
  const j = (await r.json().catch(() => ({}))) as {
    path?: string;
    error?: string;
  };
  if (!r.ok || j.error) return { error: j.error ?? `HTTP ${r.status}` };
  return { path: j.path ?? "" };
}
