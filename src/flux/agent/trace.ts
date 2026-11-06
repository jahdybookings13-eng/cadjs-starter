// flux/agent/trace.ts — action trace. Every tool call the orchestrator makes
// produces a TraceRow. The single chat thread per file/project is just the
// ordered list of TraceRows tagged by agent. No side state, no hidden queue.

export type AgentId =
  | "orchestrator"
  | "pcb"
  | "mcad"
  | "firmware"
  | "parts"
  | "ecad";

export type TraceKind =
  | "intent"
  | "tool-call"
  | "tool-result"
  | "message"
  | "error"
  | "satisfied";

export interface TraceRow {
  id: string;
  ts: number;
  agent: AgentId;
  kind: TraceKind;
  /** intent text or tool key. */
  op: string;
  detail?: string;
  /** stable id linking a tool-call to its tool-result. */
  linkId?: string;
  ok?: boolean;
}

let seq = 0;
export function nextTraceId(): string {
  return `tr_${(0x100000000 + ++seq).toString(16)}`;
}

export interface TraceLog {
  rows: TraceRow[];
  append(row: TraceRow): void;
  forAgent(agent: AgentId): TraceRow[];
  forFile(fileId: string): TraceRow[];
  last(n: number): TraceRow[];
  satisfied(op: string): boolean;
  clear(): void;
}

export function makeTraceLog(): TraceLog {
  const rows: TraceRow[] = [];
  return {
    rows,
    append(row) {
      rows.push(row);
    },
    forAgent(agent) {
      return rows.filter((r) => r.agent === agent);
    },
    forFile() {
      // single-file model: the trace IS the file's thread
      return rows;
    },
    last(n) {
      return rows.slice(-n);
    },
    satisfied(op) {
      return rows.some((r) => r.kind === "satisfied" && r.op === op);
    },
    clear() {
      rows.length = 0;
    },
  };
}
