/** 3D-print wizard UI.
 *
 *  Steps: detect → profile → slice (Node daemon) → upload → start → monitor.
 *  Parent scene supplies onGetStl() / onGetBbox() for the current selection.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  KIND_LABEL,
  type PrinterKind,
  type PrinterTarget,
  type SlicerKind,
  type WizardState,
  estimateSlice,
  getAdapter,
  initialWizardState,
  wizardCancel,
  wizardDetect,
  wizardPause,
  wizardPollMonitor,
  wizardResume,
  wizardSelectProfile,
  wizardStart,
  STEP_LABEL,
} from "../printers";
import {
  cloneProfile,
  loadProfiles,
  removeProfile,
  resetProfiles,
  upsertProfile,
  profileParams,
  type PrintProfile,
} from "../printers/profileStore";
import {
  fetchGcode,
  health,
  submitSlice,
  watchJob,
  type SlicerJobEvent,
} from "../printers/slicerDaemon";
import { fitsOnBed, type SelectionStl } from "../printers/exportSelection";

const SLICER_KINDS: { value: SlicerKind; label: string }[] = [
  { value: "orca", label: "OrcaSlicer" },
  { value: "prusaslicer", label: "PrusaSlicer" },
  { value: "cura", label: "Cura (CuraEngine)" },
];

interface BboxMM {
  min: [number, number, number];
  max: [number, number, number];
}

interface PrintWizardProps {
  onClose: () => void;
  onGetStl: () => Promise<Uint8Array>;
  onGetBbox: () => Promise<BboxMM>;
  onGetSelectionStl?: () => Promise<SelectionStl>;
  defaultTarget?: Partial<PrinterTarget>;
}

const STEP_ORDER: WizardState["step"][] = [
  "detect",
  "profile",
  "slice",
  "upload",
  "start",
  "monitor",
  "done",
];

const Nr: React.FC<{
  label: string;
  v: number;
  set: (v: number) => void;
  step?: number;
  min?: number;
}> = ({ label, v, set, step, min }) => (
  <label className="flex items-center justify-between gap-1">
    <span className="text-xs text-gray-400">{label}</span>
    <input
      type="number"
      aria-label={label}
      className="w-20 bg-gray-800 text-gray-100 rounded px-1 py-0.5 text-xs"
      value={v}
      step={step ?? 1}
      min={min ?? 0}
      onChange={(e) => set(parseFloat(e.target.value))}
    />
  </label>
);

export const PrintWizard: React.FC<PrintWizardProps> = ({
  onClose,
  onGetStl,
  onGetBbox,
  onGetSelectionStl,
  defaultTarget,
}) => {
  const [state, setState] = useState<WizardState>(initialWizardState());
  const stateRef = useRef(state);
  stateRef.current = state;

  const [slicer, setSlicer] = useState<SlicerKind>("orca");
  const [slicerHealth, setSlicerHealth] = useState<string | null>(null);
  const [printerKind, setPrinterKind] = useState<PrinterKind>(
    defaultTarget?.kind ?? "octoprint",
  );
  const [printerUrl, setPrinterUrl] = useState(
    defaultTarget?.baseUrl ?? "http://192.168.1.50:5000",
  );
  const [printerKey, setPrinterKey] = useState(defaultTarget?.apiKey ?? "");
  const [busy, setBusy] = useState(false);
  const [profileList, setProfileList] = useState<PrintProfile[]>([]);
  const [editing, setEditing] = useState<PrintProfile | null>(null);
  const [sliceLog, setSliceLog] = useState<string[]>([]);
  const [slicerBusy, setSlicerBusy] = useState(false);
  const [selection, setSelection] = useState<SelectionStl | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!onGetSelectionStl) return;
      try {
        const sel = await onGetSelectionStl();
        if (!cancelled) setSelection(sel);
      } catch {
        if (!cancelled) setSelection(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onGetSelectionStl]);

  useEffect(() => {
    let cancelled = false;
    health().then((h) => {
      if (cancelled) return;
      setSlicerHealth(
        h.ok
          ? `${h.orca ? "Orca ✓" : "Orca ✗"}  ${h.prusaslicer ? "Prusa ✓" : "Prusa ✗"}  ${h.cura ? "Cura ✓" : "Cura ✗"}`
          : `daemon offline (${h.error})`,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const kind = state.target?.kind;
    if (kind) setProfileList(loadProfiles(kind as PrinterKind));
  }, [state.target?.kind]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const run = useCallback(
    async (next: () => Promise<WizardState> | WizardState) => {
      setBusy(true);
      try {
        const r = await next();
        setState(r);
      } catch (e) {
        setState((s) => ({
          ...s,
          step: "error",
          errorMessage: String(e),
        }));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const stopMonitor = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startMonitor = useCallback(() => {
    stopMonitor();
    timerRef.current = setInterval(async () => {
      const s = stateRef.current;
      const next = await wizardPollMonitor(s);
      setState(next);
    }, 3000);
  }, [stopMonitor]);

  useEffect(() => {
    if (state.step === "monitor") startMonitor();
    else stopMonitor();
  }, [state.step, startMonitor, stopMonitor]);

  const doDetect = () =>
    run(async () => {
      const t: PrinterTarget = {
        id: defaultTarget?.id ?? `printer_${Date.now().toString(36)}`,
        kind: printerKind,
        baseUrl: printerUrl.trim(),
      };
      if (printerKey) t.apiKey = printerKey;
      if (defaultTarget?.name !== undefined) t.name = defaultTarget.name;
      return wizardDetect(state, t);
    });

  const doProfile = (p: PrintProfile) => {
    void run(async () => wizardSelectProfile(state, p));
  };

  const doSaveProfile = () => {
    if (!editing || !state.target) return;
    const kind = state.target.kind as PrinterKind;
    setProfileList(upsertProfile(kind, editing));
    setEditing(null);
  };

  const doDeleteProfile = (id: string) => {
    if (!state.target) return;
    setProfileList(removeProfile(state.target.kind as PrinterKind, id));
  };

  const doResetProfiles = () => {
    if (!state.target) return;
    setProfileList(resetProfiles(state.target.kind as PrinterKind));
  };

  const doSlice = async () => {
    const s = stateRef.current;
    const target = s.target;
    const current = target ? loadProfiles(target.kind as PrinterKind) : null;
    const active = current?.find((p) => p.id === s.profile?.id) ?? s.profile;
    if (!active) {
      void run(async () => wizardSelectProfile(s, active!));
      return;
    }
    let stl = selection;
    if (!stl) {
      try {
        const bytes = await onGetStl();
        const bb = await onGetBbox();
        stl = {
          stlBytes: bytes,
          stlName: s.stlName ?? `scadgen_${Date.now().toString(36)}.stl`,
          bboxMM: [
            bb.min[0],
            bb.min[1],
            bb.min[2],
            bb.max[0],
            bb.max[1],
            bb.max[2],
          ],
          sizeMM: [
            bb.max[0] - bb.min[0],
            bb.max[1] - bb.min[1],
            bb.max[2] - bb.min[2],
          ],
          bodyCount: 1,
        };
      } catch (e) {
        setState((prev) => ({
          ...prev,
          step: "error",
          errorMessage: `stl export failed: ${e}`,
        }));
        return;
      }
    }
    setSelection(stl);
    setSlicerBusy(true);
    setSliceLog([]);
    try {
      const params = profileParams(active);
      const h = await health();
      if (!h.ok) throw new Error(`Slicer daemon offline (${h.error})`);
      const sub = await submitSlice({
        kind: slicer,
        stlBytes: stl.stlBytes,
        stlName: stl.stlName,
        params,
      });
      const j = sub as { jobId?: string; error?: string };
      if (!j.jobId || j.error)
        throw new Error(j.error ?? "slicer submit failed");
      const watch = await watchJob(j.jobId, (e: SlicerJobEvent) => {
        if (e.event === "log")
          setSliceLog((l) => [...l.slice(-200), e.line ?? ""]);
        if (e.event === "start")
          setSliceLog([`slicer: ${e.bin ?? ""}`, e.input ?? ""]);
        if (e.event === "done")
          setSliceLog((l) => [
            ...l,
            e.error ? `ERROR: ${e.error}` : `sliced → ${e.file ?? "gcode"}`,
          ]);
      });
      const gcode = await fetchGcode(j.jobId);
      const est = estimateSlice(stl.sizeMM, active as never);
      const next: WizardState = {
        ...s,
        step: "upload",
        profile: active,
        stlBytes: stl.stlBytes,
        stlName: stl.stlName,
        slices: { ...est, gcodePath: watch.file ?? "job" },
        gcodePath: null,
        gcodeBytes: gcode,
        uploading: false,
        errorMessage: null,
        monitor: null,
      };
      setState(next);
    } catch (e) {
      setState((prev) => ({
        ...prev,
        step: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setSlicerBusy(false);
    }
  };

  const doUpload = () =>
    run(async () => {
      const s = stateRef.current;
      if (!s.target || !s.gcodeBytes || !s.stlName)
        return {
          ...s,
          step: "error" as const,
          errorMessage: "missing target or gcode",
        };
      const adapter = getAdapter(s.target.kind as PrinterKind);
      const r = await adapter.upload(s.target, s.stlName, s.gcodeBytes);
      if (!r.ok)
        return {
          ...s,
          step: "error" as const,
          errorMessage: r.error ?? "upload failed",
        };
      return {
        ...s,
        step: "start" as const,
        gcodePath: r.remotePath ?? null,
        uploading: false,
      };
    });

  const doStart = () => run(() => wizardStart(stateRef.current));
  const doCancel = () => run(() => wizardCancel(stateRef.current));
  const doPause = () => run(() => wizardPause(stateRef.current));
  const doResume = () => run(() => wizardResume(stateRef.current));

  const doDownloadGcode = async () => {
    const s = stateRef.current;
    if (!s.gcodeBytes) return;
    const bytes = s.gcodeBytes;
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const blob = new Blob([ab], {
      type: "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = s.gcodePath?.endsWith(".gcode")
      ? s.gcodePath
      : "scadgen.gcode";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const target = state.target as PrinterTarget | null;
  const activeProfile = state.profile;
  const fit =
    selection && activeProfile
      ? fitsOnBed(selection.sizeMM, {
          bedMM: activeProfile.bedMM,
          buildHeightMM: activeProfile.buildHeightMM,
        })
      : null;

  const setSupportStyle = (p: PrintProfile) => (v: string) => {
    setEditing({
      ...p,
      support: {
        ...p.support,
        style: v as PrintProfile["support"]["style"],
      },
    });
  };

  const mutateProfile = (fn: (p: PrintProfile) => void) => {
    if (!editing) return;
    const np: PrintProfile = {
      ...editing,
      nozzle: { ...editing.nozzle },
      bed: { ...editing.bed },
      lines: { ...editing.lines },
      layers: { ...editing.layers },
      tolerance: { ...editing.tolerance },
      support: { ...editing.support },
      cooling: { ...editing.cooling },
      speeds: { ...editing.speeds },
    };
    fn(np);
    setEditing(np);
  };

  const numSet =
    (fn: (np: PrintProfile, val: number) => void) => (val: number) => {
      mutateProfile((np) => fn(np, val));
    };

  // Profile editor
  const renderProfileEditor = (p: PrintProfile, key: string) => (
    <div key={key} className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <label className="text-gray-300">{p.name}</label>
        <span className="text-gray-500">{p.material}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Nr
          label="Nozzle °C"
          v={p.nozzle.nozzleC}
          set={numSet((np, val) => {
            np.nozzle.nozzleC = val;
          })}
        />
        <Nr
          label="Nozzle (1st) °C"
          v={p.nozzle.nozzleCInitial}
          set={numSet((np, val) => {
            np.nozzle.nozzleCInitial = val;
          })}
        />
        <Nr
          label="Bed °C"
          v={p.bed.bedC}
          set={numSet((np, val) => {
            np.bed.bedC = val;
          })}
        />
        <Nr
          label="Bed (1st) °C"
          v={p.bed.bedCInitial}
          set={numSet((np, val) => {
            np.bed.bedCInitial = val;
          })}
        />
        <Nr
          label="Chamber °C"
          v={p.nozzle.chamberC}
          set={numSet((np, val) => {
            np.nozzle.chamberC = val;
          })}
        />
        <Nr
          label="Layer mm"
          v={p.layers.heightMM}
          step={0.01}
          set={numSet((np, val) => {
            np.layers.heightMM = val;
          })}
        />
        <Nr
          label="1st layer mm"
          v={p.layers.initialLayerHeightMM}
          step={0.01}
          set={numSet((np, val) => {
            np.layers.initialLayerHeightMM = val;
          })}
        />
        <Nr
          label="Top layers"
          v={p.layers.top}
          step={1}
          set={numSet((np, val) => {
            np.layers.top = val;
          })}
        />
        <Nr
          label="Bottom layers"
          v={p.layers.bottom}
          step={1}
          set={numSet((np, val) => {
            np.layers.bottom = val;
          })}
        />
        <Nr
          label="Walls"
          v={p.layers.walls}
          step={1}
          min={1}
          set={numSet((np, val) => {
            np.layers.walls = val;
          })}
        />
        <Nr
          label="Line width mm"
          v={p.lines.widthMM}
          step={0.02}
          set={numSet((np, val) => {
            np.lines.widthMM = val;
          })}
        />
        <Nr
          label="Infill line mm"
          v={p.lines.sparseInfillWidthMM}
          step={0.02}
          set={numSet((np, val) => {
            np.lines.sparseInfillWidthMM = val;
          })}
        />
        <Nr
          label="Shell offset mm"
          v={p.tolerance.shellOffsetMM}
          step={0.05}
          set={numSet((np, val) => {
            np.tolerance.shellOffsetMM = val;
          })}
        />
        <Nr
          label="Max print speed mm/min"
          v={p.speeds.print}
          step={5}
          set={numSet((np, val) => {
            np.speeds.print = val;
          })}
        />
      </div>
      <select
        className="w-full bg-gray-800 text-gray-100 rounded px-2 py-1 text-xs"
        value={p.support.style}
        onChange={(e) => setSupportStyle(p)(e.target.value)}
      >
        <option value="none">Support: none</option>
        <option value="normal">Support: normal</option>
        <option value="organica">Support: organic</option>
        <option value="tree">Support: tree</option>
      </select>
      <div className="flex gap-2">
        <button
          onClick={doSaveProfile}
          className="flex-1 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(null)}
          className="flex-1 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-label="Print wizard"
    >
      <div className="w-[640px] max-w-[95vw] max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl">
        <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">
            3D Print — {selection ? selection.bodyCount : 1} body(ies)
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <ol className="flex items-center gap-1 px-5 pt-3 text-[11px] text-gray-500 flex-wrap">
          {STEP_ORDER.map((s, i) => (
            <li
              key={s}
              className={state.step === s ? "text-white font-semibold" : ""}
            >
              {i + 1}. {STEP_LABEL[s]}
            </li>
          ))}
        </ol>

        <div className="p-5 space-y-4 text-sm text-gray-100">
          {/* DETECT step */}
          {state.step === "detect" && (
            <div className="space-y-3">
              <p>
                Enter your printer's IP and API key to connect.
                {slicerHealth && (
                  <div className="text-xs mt-2">{slicerHealth}</div>
                )}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-400">Printer kind</span>
                  <select
                    aria-label="Printer kind"
                    className="w-full bg-gray-800 text-gray-100 rounded px-2 py-1 text-xs"
                    value={printerKind}
                    onChange={(e) =>
                      setPrinterKind(e.target.value as PrinterKind)
                    }
                  >
                    {(Object.keys(KIND_LABEL) as PrinterKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400">IP / URL</span>
                  <input
                    type="text"
                    aria-label="Printer IP or URL"
                    className="w-full bg-gray-800 text-gray-100 rounded px-2 py-1 text-xs"
                    placeholder="http://192.168.1.50:5000"
                    value={printerUrl}
                    onChange={(e) => setPrinterUrl(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400">API key</span>
                  <input
                    type="password"
                    aria-label="Printer API key"
                    className="w-full bg-gray-800 text-gray-100 rounded px-2 py-1 text-xs"
                    placeholder="abc123…"
                    value={printerKey}
                    onChange={(e) => setPrinterKey(e.target.value)}
                  />
                </label>
              </div>
              <button
                onClick={doDetect}
                disabled={busy}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded font-semibold"
              >
                Detect
              </button>
            </div>
          )}

          {/* PROFILE step */}
          {state.step === "profile" && target && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 justify-between">
                <p>
                  {state.detectInfo || KIND_LABEL[target.kind as PrinterKind]}
                </p>
                <select
                  aria-label="Printer profile"
                  className="bg-gray-800 text-gray-100 rounded px-2 py-1 text-xs"
                  value={
                    editing?.id ?? state.profile?.id ?? profileList[0]?.id ?? ""
                  }
                  onChange={(e) => {
                    const p = profileList.find((x) => x.id === e.target.value);
                    if (p) setEditing(cloneProfile(p));
                  }}
                >
                  {profileList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const first = state.profile ?? profileList[0];
                    if (!first) return;
                    setEditing(cloneProfile(first));
                  }}
                  className="py-1 px-2 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                  disabled={!state.profile && profileList.length === 0}
                >
                  Edit
                </button>
                <button
                  onClick={doResetProfiles}
                  className="py-1 px-2 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                >
                  Reset
                </button>
              </div>
              {editing && renderProfileEditor(editing, editing.id)}
              <button
                onClick={() => {
                  const p = state.profile ?? profileList[0];
                  if (p && !editing) doProfile(p);
                }}
                disabled={busy || (!state.profile && profileList.length === 0)}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded font-semibold"
              >
                Next →
              </button>
            </div>
          )}

          {/* SLICE step */}
          {state.step === "slice" && state.profile && (
            <div className="space-y-3">
              <p>Slicing with {state.profile.name} on:</p>
              <select
                aria-label="Slicer"
                className="bg-gray-800 text-gray-100 rounded px-2 py-1 text-xs"
                value={slicer}
                onChange={(e) => setSlicer(e.target.value as SlicerKind)}
              >
                {SLICER_KINDS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {slicerHealth && (
                <div className="text-xs text-gray-500">{slicerHealth}</div>
              )}
              {slicerBusy && (
                <div className="text-xs text-gray-400 animate-pulse">
                  Slicing… see log below
                </div>
              )}
              <div className="max-h-48 overflow-y-auto bg-black/40 rounded p-2 font-mono text-xs space-y-0.5">
                {sliceLog.map((l, i) => (
                  <div key={i} className="whitespace-pre-wrap">
                    {l}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={doSlice}
                  disabled={busy || slicerBusy}
                  className="py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded font-semibold"
                >
                  Slice
                </button>
              </div>
            </div>
          )}

          {/* UPLOAD step */}
          {state.step === "upload" && state.slices && (
            <div className="space-y-3">
              <p>Sliced → {state.slices.gcodePath || "gcode ready"}</p>
              <p>Estimated time: {state.slices.estimatedMinutes} min</p>
              <div className="flex gap-2">
                <button
                  onClick={doUpload}
                  disabled={busy}
                  className="py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded font-semibold"
                >
                  Upload
                </button>
                <button
                  onClick={doDownloadGcode}
                  className="py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  Download .gcode
                </button>
              </div>
            </div>
          )}

          {/* START step */}
          {state.step === "start" && (
            <div className="space-y-3">
              <p>G-code uploaded. Ready to start the print.</p>
              <div className="flex gap-2">
                <button
                  onClick={doStart}
                  disabled={busy}
                  className="py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded font-semibold"
                >
                  Start print
                </button>
                <button
                  onClick={doDownloadGcode}
                  className="py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  Download .gcode
                </button>
              </div>
            </div>
          )}

          {/* MONITOR step */}
          {state.step === "monitor" && state.monitor && (
            <div className="space-y-3">
              <p className="flex items-center gap-2">
                {state.monitor.status}
                {state.monitor.progress > 0 && (
                  <span className="text-xs">
                    {Math.round(state.monitor.progress * 100)}%
                  </span>
                )}
                {state.monitor.etaSeconds !== null && (
                  <span className="text-xs">
                    ~{Math.ceil(state.monitor.etaSeconds / 60)} min left
                  </span>
                )}
              </p>
              <div className="h-2 bg-gray-700 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${state.monitor.progress * 100}%` }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={doPause}
                  disabled={busy}
                  className="py-1 px-3 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                >
                  Pause
                </button>
                <button
                  onClick={doResume}
                  disabled={busy}
                  className="py-1 px-3 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                >
                  Resume
                </button>
                <button
                  onClick={doCancel}
                  disabled={busy}
                  className="py-1 px-3 bg-red-700 hover:bg-red-600 rounded text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* DONE step */}
          {state.step === "done" && (
            <div className="space-y-3">
              <p className="text-green-400">Print complete or cancelled.</p>
              <div className="flex gap-2">
                <button
                  onClick={doDownloadGcode}
                  className="py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  Download .gcode
                </button>
                <button
                  onClick={onClose}
                  className="py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* ERROR step */}
          {state.step === "error" && (
            <div className="space-y-3">
              <p className="text-red-400">
                {state.errorMessage ?? "Something went wrong."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
          <span>{STEP_LABEL[state.step]}</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
