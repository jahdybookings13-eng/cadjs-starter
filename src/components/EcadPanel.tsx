// components/EcadPanel.tsx — the desktop ECAD workbench: place boards and
// screens, wire pins, write/deploy/run firmware, watch the serial monitor.
// Everything it does goes through the SAME bus actions the VR hands, voice,
// and the flux AI use (exit-ramp rule) — this panel is one more client.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Ecad } from "../ecad/install";
import { allParts, type EcadPart } from "../ecad/catalog";
import { firmwareFor, getFirmware } from "../ecad/firmware";
import { analyzeBoard, type StudioReport } from "../ecad/studio";
import { avrCppTarget, type AvrBuildOutcome } from "../ecad/avrBuild";
import { dataUrlOf } from "../ecad/delivery";

interface PlacedRow {
  id: string;
  part: string;
  name?: string | undefined;
}

const CATEGORY_LABEL: Record<EcadPart["category"], string> = {
  board: "Boards",
  display: "Screens",
  peripheral: "Peripherals",
};

/** Real Arduino C++ — compiled to AVR machine code in the browser. */
const CPP_EXAMPLE = `// Blink — compiled in the browser to ATmega328P machine code.
const int LED = LED_PIN;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  digitalWrite(LED, HIGH);
  delay(500);
  digitalWrite(LED, LOW);
  delay(500);
}
`;

export function EcadPanel({
  ecad,
  onClose,
  embedded = false,
}: {
  ecad: Ecad;
  onClose?: () => void;
  /** Fill the host panel instead of floating over the 3D scene. */
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<"place" | "code" | "serial">("place");
  const [placed, setPlaced] = useState<PlacedRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [serial, setSerial] = useState<string[]>([]);
  const [code, setCode] = useState<string>("");
  const [fwId, setFwId] = useState<string>("");
  const [report, setReport] = useState<StudioReport | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [wireFrom, setWireFrom] = useState("");
  const [wireTo, setWireTo] = useState("");
  const pollRef = useRef<number | null>(null);

  const catalog = useMemo(() => allParts(), []);
  const selectedPart = useMemo(() => {
    const inst = ecad.sim.instances.get(selected ?? "");
    return inst ? ecad.sim.partOf(inst.id) : undefined;
  }, [selected, ecad]);
  const selectedIsBoard = selectedPart?.category === "board";

  const refresh = useCallback(() => {
    setPlaced(
      [...ecad.sim.instances.values()].map((i) => ({
        id: i.id,
        part: i.partId,
        name: ecad.sim.partOf(i.id)?.name,
      })),
    );
    if (selected) {
      const st = ecad.sim.status(selected);
      setStatus(
        st.running
          ? `running (${st.tier})`
          : st.error
            ? `error: ${st.error}`
            : st.firmwareId
              ? `deployed: ${st.firmwareId}`
              : "idle",
      );
      setSerial(ecad.sim.serial(selected).slice(-30));
    }
  }, [ecad, selected]);

  useEffect(() => {
    refresh();
    pollRef.current = window.setInterval(refresh, 400);
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    const inst = ecad.sim.instances.get(selected);
    const part = inst ? ecad.sim.partOf(inst.id) : undefined;
    setReport(null);
    setBuildError(null);
    if (part?.category === "board") {
      const fws = firmwareFor(part.id);
      setFwId((cur) =>
        fws.some((f) => f.id === cur) ? cur : (fws[0]?.id ?? ""),
      );
      setCode((cur) =>
        cur ? cur : (getFirmware(fws[0]?.id ?? "")?.source ?? ""),
      );
    }
  }, [selected, ecad]);

  const place = (partId: string) => {
    const out = ecad.bus.run("ecad.insert", { part: partId }) as
      | { id?: string }
      | undefined;
    if (out?.id) setSelected(out.id);
    refresh();
  };

  const boardFirmware = useMemo(() => {
    const inst = ecad.sim.instances.get(selected ?? "");
    const part = inst ? ecad.sim.partOf(inst.id) : undefined;
    return part?.category === "board" ? firmwareFor(part.id) : [];
  }, [selected, ecad]);

  const run = async () => {
    if (!selected) return;
    try {
      await ecad.run(selected);
    } catch (err) {
      setStatus(String(err));
    }
    refresh();
  };

  /** C++ → .hex in the browser, then run it on the emulated board. */
  const buildCpp = async () => {
    if (!selected) return;
    setBuildError(null);
    setStatus("compiling C++…");
    try {
      const out = (await ecad.bus.run("ecad.buildFirmware", {
        board: selected,
        code,
      })) as AvrBuildOutcome | undefined;
      if (!out) {
        setStatus("build failed");
        return;
      }
      if (!out.ok) {
        setBuildError(out.stderr.length ? out.stderr.join("\n") : out.error);
        setStatus(out.error);
        return;
      }
      setStatus(
        `built ${out.result.flashBytes} B${out.result.fitsTarget ? "" : " (over flash budget)"}`,
      );
      try {
        ecad.bus.run("project.save", undefined);
      } catch {
        /* bare sim — explicit save still works */
      }
    } catch (err) {
      setBuildError(String(err));
      setStatus("build failed");
      return;
    }
    refresh();
  };

  return (
    <div
      data-testid="ecad-panel"
      className={
        embedded
          ? "flex h-full min-h-0 w-full flex-col bg-neutral-900/95 text-xs text-neutral-200"
          : "absolute right-2 top-2 z-40 flex max-h-[80vh] w-96 flex-col rounded-lg border border-neutral-700 bg-neutral-900/95 text-xs text-neutral-200 shadow-2xl"
      }
    >
      <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-2">
        <span className="font-semibold">ECAD · Virtual MCUs</span>
        <div className="flex gap-1">
          {(["place", "code", "serial"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-label={`ECAD ${t} tab`}
              className={`rounded px-2 py-0.5 ${tab === t ? "bg-blue-600" : "bg-neutral-800 hover:bg-neutral-700"}`}
            >
              {t}
            </button>
          ))}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close ECAD panel"
              className="rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {tab === "place" && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
          <div>
            <div className="mb-1 font-medium text-neutral-400">Catalog</div>
            {(["board", "display", "peripheral"] as const).map((cat) => (
              <div key={cat} className="mb-2">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                  {CATEGORY_LABEL[cat]}
                </div>
                <div className="flex flex-wrap gap-1">
                  {catalog
                    .filter((p) => p.category === cat)
                    .map((p) => (
                      <button
                        key={p.id}
                        data-testid={`ecad-add-${p.id}`}
                        onClick={() => place(p.id)}
                        title={"mcu" in p ? p.mcu : p.name}
                        className="rounded bg-neutral-800 px-1.5 py-0.5 hover:bg-blue-700"
                      >
                        {p.name}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 font-medium text-neutral-400">
              Placed ({placed.length})
            </div>
            {placed.map((row) => (
              <div
                key={row.id}
                className={`flex items-center justify-between rounded px-2 py-1 ${selected === row.id ? "bg-blue-900" : "hover:bg-neutral-800"}`}
              >
                <button
                  className="flex-1 text-left"
                  aria-label={`Select ${row.name ?? row.part}`}
                  onClick={() => setSelected(row.id)}
                >
                  <span className="mr-2 rounded bg-neutral-700 px-1">
                    {row.id}
                  </span>
                  {row.name ?? row.part}
                </button>
                <button
                  onClick={() => {
                    ecad.sim.remove(row.id);
                    ecad.layer.remove(row.id);
                    if (selected === row.id) setSelected(null);
                    refresh();
                  }}
                  aria-label={`Remove ${row.name ?? row.part}`}
                  className="px-1 text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="rounded border border-neutral-700 p-2">
            <div className="mb-1 font-medium text-neutral-400">
              Wire pins (&lt;instance&gt;.&lt;pin&gt;)
            </div>
            <div className="flex items-center gap-1">
              <input
                value={wireFrom}
                onChange={(e) => setWireFrom(e.target.value)}
                placeholder="b1.13"
                className="w-24 rounded bg-neutral-800 px-1 py-0.5"
              />
              <span>→</span>
              <input
                value={wireTo}
                onChange={(e) => setWireTo(e.target.value)}
                placeholder="p2.A"
                className="w-24 rounded bg-neutral-800 px-1 py-0.5"
              />
              <button
                onClick={() => {
                  try {
                    ecad.sim.wire(wireFrom, wireTo);
                    setStatus(`wired ${wireFrom} → ${wireTo}`);
                  } catch (err) {
                    setStatus(String(err));
                  }
                }}
                className="rounded bg-blue-700 px-2 py-0.5 hover:bg-blue-600"
              >
                wire
              </button>
            </div>
            <div className="mt-1 text-[10px] text-neutral-500">
              {ecad.sim.wires.length} wire(s):{" "}
              {ecad.sim.wires
                .map(
                  (w) =>
                    `${w.from.inst}.${w.from.pin}→${w.to.inst}.${w.to.pin}`,
                )
                .join("  ")}
            </div>
          </div>
          {selected && (
            <div className="rounded border border-neutral-700 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-neutral-400">{selected}</span>
                <span>{status}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => {
                    ecad.sim.press(selected);
                  }}
                  className="rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
                >
                  press
                </button>
                <button
                  onClick={() => {
                    ecad.sim.release(selected);
                  }}
                  className="rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
                >
                  release
                </button>
                <button
                  onClick={() => {
                    ecad.sim.setPot(selected, 512);
                  }}
                  className="rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
                >
                  pot 50%
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "code" && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          {!selectedIsBoard ? (
            <div className="text-neutral-500">
              Select a placed board in the Place tab to code it.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <select
                  data-testid="ecad-fw-select"
                  value={fwId}
                  onChange={(e) => {
                    setFwId(e.target.value);
                    setCode(getFirmware(e.target.value)?.source ?? "");
                  }}
                  className="flex-1 rounded bg-neutral-800 px-1 py-0.5"
                >
                  {boardFirmware.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title} [{f.tier}]
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!selected) return;
                    try {
                      ecad.sim.deploy(selected, { firmwareId: fwId });
                      setStatus(`deployed ${fwId}`);
                      // Persist immediately so the code survives a reload.
                      try {
                        ecad.bus.run("project.save", undefined);
                      } catch {
                        /* no scene bus (bare sim) — explicit save still works */
                      }
                    } catch (err) {
                      setStatus(String(err));
                    }
                    refresh();
                  }}
                  className="rounded bg-neutral-700 px-2 py-0.5 hover:bg-neutral-600"
                >
                  deploy
                </button>
                <label
                  title="Upload firmware: Intel HEX for AVR, a .bin/.hex/.elf for STM32F4, a .uf2 for RP2040, or an ESP32 flash image (merged at 0x0, or combined at 0x1000) — images run here; other MCUs are verified and attached for delivery"
                  className="cursor-pointer rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
                >
                  firmware
                  <input
                    data-testid="ecad-hex-upload"
                    type="file"
                    accept=".hex,.txt,.bin,.uf2,.elf,application/octet-stream"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !selected) return;
                      try {
                        if (/\.hex$/i.test(file.name)) {
                          ecad.sim.deploy(selected, { hex: await file.text() });
                        } else {
                          const bytes = new Uint8Array(
                            await file.arrayBuffer(),
                          );
                          ecad.sim.deploy(selected, {
                            binary: dataUrlOf(bytes),
                            name: file.name,
                          });
                        }
                        setStatus(`uploaded ${file.name}`);
                        try {
                          ecad.bus.run("project.save", undefined);
                        } catch {
                          /* ignore */
                        }
                      } catch (err) {
                        setStatus(String(err));
                      }
                      e.target.value = "";
                      refresh();
                    }}
                  />
                </label>
                {selectedPart?.category === "board" &&
                  selectedPart.tiers.includes("esp32") && (
                    <label
                      title="Application ELF for Bluetooth: esp32sim's VHCI controller needs the firmware's symbol table, which a .bin does not carry. Attach it, then run."
                      className="cursor-pointer rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
                    >
                      ble elf
                      <input
                        data-testid="ecad-elf-upload"
                        type="file"
                        accept=".elf,application/octet-stream"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !selected) return;
                          ecad.sim.setAppElf(
                            selected,
                            dataUrlOf(new Uint8Array(await file.arrayBuffer())),
                          );
                          setStatus(`BLE ELF ${file.name} — run to apply`);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                {avrCppTarget(selectedPart) && (
                  <>
                    <button
                      data-testid="ecad-build-cpp"
                      title="Compile this sketch as Arduino C++ to AVR machine code in the browser (ATmega328P)"
                      onClick={() => {
                        void buildCpp();
                      }}
                      className="rounded bg-indigo-700 px-2 py-0.5 hover:bg-indigo-600"
                    >
                      ⚙ build C++
                    </button>
                    <button
                      data-testid="ecad-cpp-example"
                      title="Load a C++ blink sketch"
                      onClick={() => {
                        setCode(CPP_EXAMPLE);
                        setReport(null);
                        setBuildError(null);
                      }}
                      className="rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
                    >
                      c++ sample
                    </button>
                  </>
                )}
              </div>
              <textarea
                data-testid="ecad-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setReport(null);
                }}
                spellCheck={false}
                className="h-56 w-full flex-1 resize-none rounded bg-neutral-950 p-2 font-mono text-[11px] text-green-300 outline-none"
              />
              {buildError && (
                <pre
                  data-testid="ecad-build-error"
                  className="max-h-28 overflow-auto whitespace-pre-wrap rounded border border-red-800 bg-red-950/40 p-2 text-[10px] text-red-200"
                >
                  {buildError}
                </pre>
              )}
              <div className="flex gap-1">
                <button
                  data-testid="ecad-run"
                  onClick={async () => {
                    if (!selected) return;
                    try {
                      ecad.sim.deploy(selected, { code });
                      await run();
                      // The sketch that just ran is the one to keep.
                      try {
                        ecad.bus.run("project.save", undefined);
                      } catch {
                        /* no scene bus — explicit save still works */
                      }
                    } catch (err) {
                      setStatus(String(err));
                    }
                  }}
                  className="rounded bg-green-700 px-3 py-1 hover:bg-green-600"
                >
                  ▶ run
                </button>
                <button
                  data-testid="ecad-stop"
                  onClick={() => {
                    if (selected) ecad.sim.stop(selected);
                    refresh();
                  }}
                  className="rounded bg-red-800 px-3 py-1 hover:bg-red-700"
                >
                  ■ stop
                </button>
                <button
                  data-testid="ecad-validate"
                  title="Check this firmware against the board, its pins and the wiring"
                  onClick={() => {
                    if (selected)
                      setReport(analyzeBoard(ecad.sim, selected, { code }));
                  }}
                  className="rounded bg-neutral-700 px-3 py-1 hover:bg-neutral-600"
                >
                  ✓ validate
                </button>
                <span className="flex-1 truncate text-right text-neutral-400">
                  {status}
                </span>
              </div>
              {report && (
                <div
                  data-testid="ecad-report"
                  data-verdict={report.verdict}
                  className="max-h-36 overflow-auto rounded border border-neutral-700 bg-neutral-950 p-2 text-[10px] leading-snug"
                >
                  <div
                    className={`mb-1 font-semibold uppercase tracking-wide ${
                      report.verdict === "ready"
                        ? "text-green-400"
                        : report.verdict === "needs-work"
                          ? "text-yellow-400"
                          : "text-red-400"
                    }`}
                  >
                    {report.verdict} · {report.boardName}
                  </div>
                  {report.findings.length === 0 ? (
                    <div className="text-neutral-400">
                      Compiles, every pin resolves, every pin is wired.
                    </div>
                  ) : (
                    report.findings.map((f, i) => (
                      <div
                        key={`${f.code}-${i}`}
                        className={
                          f.level === "error"
                            ? "text-red-300"
                            : f.level === "warn"
                              ? "text-yellow-300"
                              : "text-neutral-400"
                        }
                      >
                        {f.level}: {f.message}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "serial" && (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-neutral-400">
              Serial — {selected ?? "none"}
            </span>
            <button
              onClick={() => {
                if (selected) ecad.sim.clearSerial(selected);
                refresh();
              }}
              className="rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
            >
              clear
            </button>
          </div>
          <div
            data-testid="ecad-serial"
            className="min-h-0 flex-1 overflow-auto rounded bg-neutral-950 p-2 font-mono text-[11px] text-green-300"
          >
            {serial.length === 0 ? (
              <span className="text-neutral-600">— no output —</span>
            ) : (
              serial.map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EcadPanel;
