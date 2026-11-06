// flux/ui/chatPanel.tsx — the one floating chat window (desk surface).
//
// A React component that wraps `useFluxChat`. Styling mirrors ModeInfoCard.tsx
// (gray-800/90 panels) so it sits in the same visual family. The window:
//   * shows the single ordered TraceRow stream for one file/project
//   * tag-chips each row by agent (orchestrator / pcb / mcad / firmware /
//     parts) so sub-agent posts are visible without separate windows
//   * one input line + a "Send" button + an "Actions" radial
//   * auto-scrolls to the tail on new rows
//
// One window per file: mount one per open project file; key by projectRef.

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { BrainConfig, SelectedPart } from "../agent/context";
import type { Orchestrator } from "../agent/orchestrator";
import { useFluxChat } from "../vr/useFluxChat";

interface Row {
  id: string;
  agent: string;
  kind: string;
  op: string;
  detail?: string;
  ts: number;
  ok?: boolean;
}

interface ChatPanelProps {
  projectRef: string;
  projectName: string;
  orchestrator: Orchestrator;
  selection: SelectedPart[];
  brain: BrainConfig;
  width?: number;
  height?: number;
}

const AGENT_DOT: Record<string, string> = {
  orchestrator: "#8fb7ff",
  pcb: "#5fd0a0",
  mcad: "#e0b34a",
  firmware: "#c58af9",
  parts: "#f28f6b",
};

const ChatPanel: React.FC<ChatPanelProps> = ({
  projectRef,
  projectName,
  orchestrator,
  selection,
  brain,
  width = 380,
  height = 480,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: width, h: height });
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");

  const designators = selection.map((s) => s.designator);

  const onSubmit = useCallback(
    async (key: string, sel: string[]) => {
      setBusy(true);
      // Push the intent row immediately so the user sees the call land.
      const intentId = `row_${Date.now()}`;
      setRows((r) => [
        ...r,
        {
          id: intentId,
          agent: mapAgentFor(key),
          kind: "intent",
          op: key,
          detail: `→ ${sel.join(", ") || "(all)"}`,
          ts: Date.now(),
        },
      ]);
      const res = await orchestrator.runTurn(
        key,
        sel.map((d) => ({ designator: d })),
      );
      // Pull the new rows the orchestrator touched.
      setRows((r) => {
        const tail = orchestrator.trace.rows.slice(-8).map((t) => ({
          id: t.id,
          agent: t.agent,
          kind: t.kind,
          op: t.op,
          ...(t.detail !== undefined ? { detail: t.detail } : {}),
          ts: t.ts,
          ...(t.ok !== undefined ? { ok: t.ok } : {}),
        }));
        return tail;
      });
      setBusy(false);
      return res;
    },
    [orchestrator],
  );

  const chat = useFluxChat({
    projectRef,
    onSubmit,
    selection: designators,
    canvasRef,
    size,
  });

  // Keep the canvas sized to its container.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el.parentElement as Element);
    return () => ro.disconnect();
  }, []);

  // Auto scroll on new rows (canvas-based: bump scroll to max).
  useEffect(() => {
    if (rows.length !== chat.rows.length) {
      chat.scrollBy(100000);
    }
  }, [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitRow = (key: string) => {
    void chat.submit(key);
    setInput("");
  };

  return (
    <div
      className="absolute bottom-20 right-4 z-30 flex flex-col bg-gray-800/95 border border-gray-700 rounded-lg shadow-xl pointer-events-auto select-none overflow-hidden"
      style={{ width, height }}
      data-flux-chat={projectRef}
    >
      {/* Header: one thread, bound to this file */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-xs font-medium text-gray-200">
            FLUX · {projectName}
          </span>
        </div>
        <span className="text-[10px] text-gray-500">one thread</span>
      </div>

      {/* Rows: the single ordered stream, agent-tagged */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {rows.length === 0 && (
          <div className="text-[11px] text-gray-500 italic">
            Ask the orchestrator. Sub-agents post into this same thread.
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-1.5 text-[11px]">
            <span
              className="w-1.5 h-1.5 rounded-full mt-1 flex-none"
              style={{ background: AGENT_DOT[r.agent] ?? "#8fb7ff" }}
            />
            <div className="flex-1 leading-snug">
              <span className="text-gray-300 font-mono">
                [{r.agent}:{r.kind}]
              </span>{" "}
              <span
                className={
                  r.kind === "error" ? "text-red-400" : "text-gray-400"
                }
              >
                {r.detail ?? r.op}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer: input + send */}
      <div className="flex items-center gap-1.5 px-2 py-2 border-t border-gray-700">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy && input.trim()) {
              // Map free-text -> a registry action (default: ask).
              submitRow("ask");
            }
          }}
          placeholder="ask the orchestrator…"
          className="flex-1 bg-gray-700/50 border border-gray-600 rounded px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-blue-500"
          disabled={busy}
        />
        <button
          onClick={() => submitRow("ask")}
          disabled={busy || !input.trim()}
          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-[11px] text-white font-medium"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
};

// Map a registry action key to its owning agent dot (mirrors AGENT_BY_KEY).
function mapAgentFor(key: string): string {
  switch (key) {
    case "connectComponents":
    case "wirePowerNets":
    case "addBypassCaps":
    case "addResistor":
    case "addCapacitor":
    case "addInductor":
    case "addVoltageDivider":
    case "addRCFilter":
    case "addHBridge":
    case "addPowerSupply":
    case "addUsbInterface":
    case "addSensorInterface":
    case "addServoController":
    case "addSubcircuit":
    case "assignFunctionalGroups":
    case "runErcDrc":
    case "findIssues":
    case "reviewDecouplingCapPresence":
    case "reviewEnableResetPins":
    case "reviewUnconnectedPins":
    case "changeProperty":
      return "pcb";
    case "importPart":
    case "exportAssembly":
    case "followBoard":
    case "followEnclosure":
      return "mcad";
    case "createPinMapping":
    case "createFirmwareFile":
    case "generateFirmwareSkeleton":
      return "firmware";
    case "recommendMpn":
    case "recommendReplacement":
    case "verifyPartDetails":
    case "readDatasheet":
    case "findParts":
    case "partSpecifications":
    case "terminalCharacteristics":
    case "operatingConditions":
      return "parts";
    default:
      return "orchestrator";
  }
}
// The canvas draw path (useFluxChat + chatPanelCanvas) serves the VR surface;
// the DOM rows above are the accessible desk surface. Both render the SAME
// row list, so the "one thread" invariant holds across desk + VR.
export default ChatPanel;
