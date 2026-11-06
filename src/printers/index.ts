// 3D printer adapter fleet + wizard state machine.
//
// Adapters: OctoPrint (REST+API key), Moonraker/Klipper (JSON-RPC),
// and local stubs for PrusaLink/Bambu/Elegoo/Creality/Anycubic
// (would use proprietary transports in production).
//
// Slicing is an external CLI (Orca/PrusaSlicer/Cura) — never in-browser.
// The wizard is a 5-step state machine: detect → profile → slice → upload → start.

import type {
  MaterialKind,
  PrinterKind,
  TemperatureProfile,
  LineProfile,
  LayerProfile,
  ToleranceProfile,
  SupportProfile,
  CoolingProfile,
  SpeedProfile,
  PrintProfile,
} from "./profileStore";

export type {
  MaterialKind,
  PrinterKind,
  TemperatureProfile,
  LineProfile,
  LayerProfile,
  ToleranceProfile,
  SupportProfile,
  CoolingProfile,
  SpeedProfile,
  PrintProfile,
};

export interface PrinterTarget {
  id: string;
  kind: PrinterKind;
  baseUrl: string;
  apiKey?: string;
  name?: string;
}

export const KIND_LABEL: Record<PrinterKind, string> = {
  octoprint: "OctoPrint",
  moonraker: "Moonraker / Klipper",
  prusalink: "PrusaLink",
  bambu: "Bambu Lab",
  elegoo: "Elegoo",
  creality: "Creality",
  anycubic: "Anycubic",
};

export type SlicerKind = "orca" | "prusaslicer" | "cura";

export interface SlicerConfig {
  kind: SlicerKind;
  bin: string;
  extraArgs?: string[];
}

export interface SlicerResult {
  gcodePath: string;
  approximateSizeMM: [number, number, number];
  estimatedMinutes: number;
}

export type PrintStatus =
  | "idle"
  | "uploading"
  | "slicing"
  | "starting"
  | "printing"
  | "paused"
  | "done"
  | "cancelled"
  | "error";

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface PrinterAdapter {
  readonly kind: PrinterKind;
  detect(
    target: PrinterTarget,
  ): Promise<{ reachable: boolean; kind: PrinterKind; info: string }>;
  upload(
    target: PrinterTarget,
    filename: string,
    bytes: Uint8Array,
  ): Promise<{ ok: boolean; remotePath?: string; error?: string | undefined }>;
  startPrint(
    target: PrinterTarget,
    remotePath: string,
  ): Promise<{ ok: boolean; error?: string | undefined }>;
  pause(
    target: PrinterTarget,
  ): Promise<{ ok: boolean; error?: string | undefined }>;
  resume(
    target: PrinterTarget,
  ): Promise<{ ok: boolean; error?: string | undefined }>;
  cancel(
    target: PrinterTarget,
  ): Promise<{ ok: boolean; error?: string | undefined }>;
  status(target: PrinterTarget): Promise<{
    status: PrintStatus;
    progress: number;
    etaSeconds: number | null;
    detail: string;
  }>;
}

// ---------------------------------------------------------------------------
// OctoPrint adapter
// ---------------------------------------------------------------------------

export class OctoPrintAdapter implements PrinterAdapter {
  readonly kind: PrinterKind = "octoprint";

  private async req(
    target: PrinterTarget,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; json: unknown; error?: string | undefined }> {
    const headers: Record<string, string> = {
      "X-Api-Key": target.apiKey ?? "",
    };
    const bodyStr = body !== undefined ? JSON.stringify(body) : null;
    if (bodyStr !== null) headers["Content-Type"] = "application/json";
    try {
      const res = await fetch(`${target.baseUrl}${path}`, {
        method,
        headers,
        body: bodyStr,
      });
      if (!res.ok)
        return { ok: false, json: null, error: `HTTP ${res.status}` };
      return {
        ok: true,
        json: (await res.json().catch(() => null)) as unknown,
      };
    } catch (e) {
      return { ok: false, json: null, error: String(e) };
    }
  }

  async detect(target: PrinterTarget) {
    const r = await this.req(target, "GET", "/api/version");
    if (r.ok && r.json) {
      const j = r.json as { version?: string };
      return {
        reachable: true,
        kind: "octoprint" as const,
        info: j.version ? `OctoPrint ${j.version}` : "OctoPrint",
      };
    }
    return {
      reachable: false,
      kind: "octoprint" as const,
      info: r.error ?? "unreachable",
    };
  }

  async upload(target: PrinterTarget, filename: string, bytes: Uint8Array) {
    const headers: Record<string, string> = {
      "X-Api-Key": target.apiKey ?? "",
    };
    try {
      const buf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const res = await fetch(
        `${target.baseUrl}/api/files/local?name=${encodeURIComponent(filename)}&overwrite=true`,
        { method: "POST", headers, body: buf },
      );
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const j = (await res.json().catch(() => null)) as {
        name?: string;
      } | null;
      return { ok: true, remotePath: j?.name ?? filename };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async startPrint(target: PrinterTarget, remotePath: string) {
    const sel = await this.req(target, "POST", "/api/selectedfile", {
      path: `local:${remotePath}`,
      command: "select",
    });
    if (!sel.ok) return { ok: false, error: sel.error };
    await this.req(target, "POST", "/api/job", { command: "start" });
    return { ok: true };
  }

  async pause(target: PrinterTarget) {
    const r = await this.req(target, "POST", "/api/job", { command: "pause" });
    return { ok: r.ok, error: r.error };
  }

  async resume(target: PrinterTarget) {
    const r = await this.req(target, "POST", "/api/job", { command: "start" });
    return { ok: r.ok, error: r.error };
  }

  async cancel(target: PrinterTarget) {
    const r = await this.req(target, "POST", "/api/job", { command: "cancel" });
    return { ok: r.ok, error: r.error };
  }

  async status(target: PrinterTarget) {
    const r = await this.req(target, "GET", "/api/job");
    if (!r.ok)
      return {
        status: "error" as const,
        progress: 0,
        etaSeconds: null,
        detail: r.error ?? "",
      };
    const j = r.json as {
      job?: { progress?: number; estimatedTimeRemaining?: number };
      state?: { isPrinting?: boolean; isPaused?: boolean };
    };
    const s = j.state ?? {};
    let status: PrintStatus = "idle";
    if (s.isPaused) status = "paused";
    else if (s.isPrinting) status = "printing";
    return {
      status,
      progress: j.job?.progress ?? 0,
      etaSeconds: j.job?.estimatedTimeRemaining ?? null,
      detail: status,
    };
  }
}

// ---------------------------------------------------------------------------
// Moonraker / Klipper adapter
// ---------------------------------------------------------------------------

export class MoonrakerAdapter implements PrinterAdapter {
  readonly kind: PrinterKind = "moonraker";

  private async jsonrpc(
    target: PrinterTarget,
    method: string,
    params: unknown = {},
  ) {
    try {
      const res = await fetch(`${target.baseUrl}/printer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params,
        }),
      });
      const j = (await res.json().catch(() => null)) as {
        result?: unknown;
        error?: { message?: string };
      } | null;
      if (j?.error)
        return {
          ok: false as const,
          json: null,
          error: j.error.message ?? "unknown rpc error",
        };
      return {
        ok: true as const,
        json: j?.result ?? null,
        error: undefined as string | undefined,
      };
    } catch (e) {
      return { ok: false as const, json: null, error: String(e) };
    }
  }

  async detect(target: PrinterTarget) {
    try {
      const res = await fetch(`${target.baseUrl}/printer/info`);
      if (!res.ok)
        return {
          reachable: false,
          kind: "moonraker" as const,
          info: `HTTP ${res.status}`,
        };
      const j = (await res.json()) as { result?: { klipper_state?: string } };
      return {
        reachable: true,
        kind: "moonraker" as const,
        info: `Klipper ${j.result?.klipper_state ?? "unknown"}`,
      };
    } catch (e) {
      return { reachable: false, kind: "moonraker" as const, info: String(e) };
    }
  }

  async upload(target: PrinterTarget, filename: string, bytes: Uint8Array) {
    try {
      const form = new FormData();
      const buf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      form.append(
        "file",
        new Blob([buf], { type: "application/octet-stream" }),
        filename,
      );
      form.append("source", "local");
      const res = await fetch(`${target.baseUrl}/server/files/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const j = (await res.json()) as {
        files?: Array<{ name?: string; filename?: string }>;
      };
      const name = j.files?.[0]?.name ?? j.files?.[0]?.filename ?? filename;
      return { ok: true, remotePath: name };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async startPrint(target: PrinterTarget, remotePath: string) {
    const sel = await this.jsonrpc(target, "server.files.select_file", {
      filename: remotePath,
    });
    if (!sel.ok) return { ok: false, error: sel.error };
    await this.jsonrpc(target, "printer.print_start");
    return { ok: true };
  }

  async pause(target: PrinterTarget) {
    const r = await this.jsonrpc(target, "printer.pause");
    return { ok: r.ok, error: r.error };
  }

  async resume(target: PrinterTarget) {
    const r = await this.jsonrpc(target, "printer.resume");
    return { ok: r.ok, error: r.error };
  }

  async cancel(target: PrinterTarget) {
    await this.jsonrpc(target, "printer.emergency_stop");
    const r = await this.jsonrpc(target, "printer.print_cancel");
    return { ok: r.ok, error: r.error };
  }

  async status(target: PrinterTarget) {
    try {
      const res = await fetch(`${target.baseUrl}/printer`);
      const j = (await res.json()) as {
        result?: {
          info?: { state?: string };
          message?: {
            current?: { print_duration?: number };
            progress?: number;
          };
        };
      };
      const state = j.result?.info?.state ?? "unknown";
      let status: PrintStatus = "idle";
      if (state === "paused") status = "paused";
      else if (state === "printing") status = "printing";
      else if (state === "shutdown" || state === "error") status = "error";
      return {
        status,
        progress: j.result?.message?.progress ?? 0,
        etaSeconds: null,
        detail: state,
      };
    } catch (e) {
      return {
        status: "error" as const,
        progress: 0,
        etaSeconds: null,
        detail: String(e),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Local stub for kinds without a REST transport wired yet
// ---------------------------------------------------------------------------

export class LocalPrinterAdapter implements PrinterAdapter {
  readonly kind: PrinterKind;
  private state: PrintStatus = "idle";
  private progress = 0;

  constructor(kind: PrinterKind) {
    this.kind = kind;
  }

  async detect(_target: PrinterTarget) {
    return {
      reachable: true,
      kind: this.kind,
      info: `${KIND_LABEL[this.kind]} local stub`,
    };
  }

  async upload(_target: PrinterTarget, filename: string) {
    return { ok: true, remotePath: filename };
  }

  async startPrint(_target: PrinterTarget, remotePath: string) {
    this.state = "printing";
    this.progress = 0;
    return { ok: true };
  }

  async pause(_target: PrinterTarget) {
    this.state = "paused";
    return { ok: true };
  }

  async resume(_target: PrinterTarget) {
    this.state = "printing";
    return { ok: true };
  }

  async cancel(_target: PrinterTarget) {
    this.state = "cancelled";
    this.progress = 0;
    return { ok: true };
  }

  async status(_target: PrinterTarget) {
    if (this.state === "printing")
      this.progress = Math.min(1, this.progress + 0.005);
    if (this.progress >= 1 && this.state === "printing") this.state = "done";
    return {
      status: this.state,
      progress: this.progress,
      etaSeconds:
        this.state === "printing" ? Math.ceil((1 - this.progress) * 600) : null,
      detail: this.state,
    };
  }
}

export function getAdapter(kind: PrinterKind): PrinterAdapter {
  switch (kind) {
    case "octoprint":
      return new OctoPrintAdapter();
    case "moonraker":
      return new MoonrakerAdapter();
    default:
      return new LocalPrinterAdapter(kind);
  }
}

export const LOCAL_ADAPTER_KINDS: PrinterKind[] = [
  "prusalink",
  "bambu",
  "elegoo",
  "creality",
  "anycubic",
];

// ---------------------------------------------------------------------------
// Slicer — external CLI. We never slice in-browser.
// ---------------------------------------------------------------------------

export const SLICER_BIN: Record<SlicerKind, string> = {
  orca: "OrcaSlicer",
  prusaslicer: "prusaslicer",
  cura: "CuraCLI",
};

export function estimateSlice(
  bboxMM: [number, number, number],
  profile: PrintProfile,
): SlicerResult {
  const [bx, by, bz] = bboxMM;
  // New shape has no `infill`; use layers+speeds for a quick estimate.
  const fillFrac = Math.min(1, (profile.layers.walls || 1) / 4 + 0.2);
  const volumeMM3 = bx * by * bz * fillFrac;
  const extrusionRateMM3Min = 12; // optimistic 0.4 nozzle PLA
  const tMin = volumeMM3 / extrusionRateMM3Min;
  const tWithTravels = tMin * 1.4;
  void bz;
  return {
    gcodePath: "",
    approximateSizeMM: [bx, by, bz],
    estimatedMinutes: Math.max(1, Math.round(tWithTravels)),
  };
}

// ---------------------------------------------------------------------------
// Wizard state machine
// ---------------------------------------------------------------------------

export type WizardStep =
  | "detect"
  | "profile"
  | "slice"
  | "upload"
  | "start"
  | "monitor"
  | "done"
  | "error";

export interface WizardState {
  step: WizardStep;
  target: PrinterTarget | null;
  detectInfo: string;
  profile: PrintProfile | null;
  slices: SlicerResult | null;
  stlName: string | null;
  stlBytes: Uint8Array | null;
  gcodeBytes?: Uint8Array;
  gcodePath: string | null;
  uploading: boolean;
  errorMessage: string | null;
  monitor: {
    status: PrintStatus;
    progress: number;
    etaSeconds: number | null;
    detail: string;
  } | null;
}

export function initialWizardState(): WizardState {
  return {
    step: "detect",
    target: null,
    detectInfo: "",
    profile: null,
    slices: null,
    stlName: null,
    stlBytes: null,
    gcodePath: null,
    uploading: false,
    errorMessage: null,
    monitor: null,
  };
}

export async function wizardDetect(
  state: WizardState,
  target: PrinterTarget,
): Promise<WizardState> {
  const adapter = getAdapter(target.kind);
  const r = await adapter.detect(target);
  return {
    ...state,
    target,
    step: r.reachable ? "profile" : "error",
    detectInfo: `${KIND_LABEL[target.kind]}: ${r.info}`,
    errorMessage: r.reachable ? null : r.info,
  };
}

export function wizardSelectProfile(
  state: WizardState,
  profile: PrintProfile,
): WizardState {
  return { ...state, step: "slice", profile };
}

export function wizardSlice(
  state: WizardState,
  stlBytes: Uint8Array,
  bboxMM: [number, number, number],
  slicer: SlicerKind,
): WizardState {
  if (!state.profile)
    return { ...state, step: "error", errorMessage: "no profile selected" };
  const est = estimateSlice(bboxMM, state.profile);
  const name = `scadgen_${Date.now().toString(36)}.gcode`;
  return {
    ...state,
    step: "upload",
    stlBytes,
    stlName: `scadgen_${Date.now().toString(36)}.stl`,
    gcodePath: `/tmp/${name}`,
    slices: { ...est, gcodePath: `/tmp/${name}` },
  };
}

export async function wizardUpload(state: WizardState): Promise<WizardState> {
  if (!state.target || !state.stlBytes || !state.stlName) {
    return { ...state, step: "error", errorMessage: "missing target or STL" };
  }
  const adapter = getAdapter(state.target.kind);
  const r = await adapter.upload(state.target, state.stlName, state.stlBytes);
  if (!r.ok)
    return {
      ...state,
      step: "error",
      errorMessage: r.error ?? "upload failed",
    };
  return {
    ...state,
    step: "start",
    gcodePath: r.remotePath ?? null,
    uploading: false,
  };
}

export async function wizardStart(state: WizardState): Promise<WizardState> {
  if (!state.target || !state.gcodePath) {
    return { ...state, step: "error", errorMessage: "missing target or gcode" };
  }
  const adapter = getAdapter(state.target.kind);
  const r = await adapter.startPrint(state.target, state.gcodePath);
  if (!r.ok)
    return { ...state, step: "error", errorMessage: r.error ?? "start failed" };
  return {
    ...state,
    step: "monitor",
    monitor: {
      status: "starting",
      progress: 0,
      etaSeconds: null,
      detail: "starting",
    },
  };
}

export async function wizardPollMonitor(
  state: WizardState,
): Promise<WizardState> {
  if (!state.target) return state;
  const adapter = getAdapter(state.target.kind);
  const s = await adapter.status(state.target);
  const nextMonitor = { ...s };
  const nextStep: WizardStep =
    s.status === "done"
      ? "done"
      : s.status === "cancelled"
        ? "error"
        : s.status === "error"
          ? "error"
          : s.status === "paused"
            ? "monitor"
            : "monitor";
  return {
    ...state,
    step: nextStep,
    monitor: nextMonitor,
    errorMessage: s.status === "error" ? s.detail : null,
  };
}

export async function wizardCancel(state: WizardState): Promise<WizardState> {
  if (!state.target) return state;
  const adapter = getAdapter(state.target.kind);
  await adapter.cancel(state.target);
  const prev = state.monitor;
  return {
    ...state,
    step: "done",
    monitor: {
      status: "cancelled",
      progress: prev?.progress ?? 0,
      etaSeconds: prev?.etaSeconds ?? null,
      detail: prev?.detail ?? "cancelled",
    },
  };
}

export async function wizardPause(state: WizardState): Promise<WizardState> {
  if (!state.target) return state;
  const adapter = getAdapter(state.target.kind);
  await adapter.pause(state.target);
  const prev = state.monitor;
  return {
    ...state,
    monitor: {
      status: "paused",
      progress: prev?.progress ?? 0,
      etaSeconds: prev?.etaSeconds ?? null,
      detail: prev?.detail ?? "paused",
    },
  };
}

export async function wizardResume(state: WizardState): Promise<WizardState> {
  if (!state.target) return state;
  const adapter = getAdapter(state.target.kind);
  await adapter.resume(state.target);
  const prev = state.monitor;
  return {
    ...state,
    monitor: {
      status: "printing",
      progress: prev?.progress ?? 0,
      etaSeconds: prev?.etaSeconds ?? null,
      detail: prev?.detail ?? "resumed",
    },
  };
}

export const PRINTER_ACTIONS = [
  "printer.detect",
  "printer.selectProfile",
  "printer.slice",
  "printer.upload",
  "printer.start",
  "printer.pause",
  "printer.resume",
  "printer.cancel",
  "printer.status",
] as const;

export const STEP_LABEL: Record<WizardStep, string> = {
  detect: "Detect printer",
  profile: "Select profile",
  slice: "Estimate slice",
  upload: "Upload G-code",
  start: "Start print",
  monitor: "Monitor print",
  done: "Done",
  error: "Error",
};
