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

export function EcadPanel({
  ecad,
  onClose,
}: {
  ecad: Ecad;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"place" | "code" | "serial">("place");
  const [placed, setPlaced] = useState<PlacedRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [serial, setSerial] = useState<string[]>([]);
  const [code, setCode] = useState<string>("");
  const [fwId, setFwId] = useState<string>("");
  const [wireFrom, setWireFrom] = useState("");
  const [wireTo, setWireTo] = useState("");
  const pollRef = useRef<number | null>(null);

  const catalog = useMemo(() => allParts(), []);
  const selectedIsBoard = useMemo(() => {
    const inst = ecad.sim.instances.get(selected ?? "");
    return inst ? ecad.sim.partOf(inst.id)?.category === "board" : false;
  }, [selected, ecad]);

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

  return (
    <div
      data-testid="ecad-panel"
      className="absolute right-2 top-2 z-40 flex max-h-[80vh] w-96 flex-col rounded-lg border border-neutral-700 bg-neutral-900/95 text-xs text-neutral-200 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-2">
        <span className="font-semibold">ECAD · Virtual MCUs</span>
        <div className="flex gap-1">
          {(["place", "code", "serial"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 ${tab === t ? "bg-blue-600" : "bg-neutral-800 hover:bg-neutral-700"}`}
            >
              {t}
            </button>
          ))}
          <button
            onClick={onClose}
            className="rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
          >
            ✕
          </button>
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
                    } catch (err) {
                      setStatus(String(err));
                    }
                    refresh();
                  }}
                  className="rounded bg-neutral-700 px-2 py-0.5 hover:bg-neutral-600"
                >
                  deploy
                </button>
              </div>
              <textarea
                data-testid="ecad-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                className="h-56 w-full flex-1 resize-none rounded bg-neutral-950 p-2 font-mono text-[11px] text-green-300 outline-none"
              />
              <div className="flex gap-1">
                <button
                  data-testid="ecad-run"
                  onClick={async () => {
                    if (!selected) return;
                    try {
                      ecad.sim.deploy(selected, { code });
                      await run();
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
                <span className="flex-1 truncate text-right text-neutral-400">
                  {status}
                </span>
              </div>
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
