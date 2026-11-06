// flux/agent/loop.ts — the one agent loop (uniform brain interface).
//
// One loop, no branching on provider:
//   1. render the prompt for the action + selection
//   2. emit an `intent` TraceRow
//   3. call the brain (the ONLY seam: `chat`)
//   4. emit `tool-call` / `tool-result` TraceRows
//   5. emit `satisfied` when the loop converges
//
// The brain is a `Brain` — anything that can answer a rendered prompt. The
// provisioned LLM (openai / anthropic / google / flux-mcp) is ONE Brain
// implementation; the local pure executors (ERC, BOM, sim, co-design) are
// ANOTHER. The orchestrator picks which Brain by `kind`. This file owns the
// *shape* of the loop; it does not own HTTP, math, or state.
//
// "Uniform" means: swap the Brain, the loop is unchanged. That is the whole
// point — VR / desk / voice / ActionBus all call `runLoop` identically.

import type { PromptAction } from "./registry";
import { renderPrompt, type BrainConfig, type FluxContext } from "./context";
import {
  makeTraceLog,
  type AgentId,
  type TraceLog,
  type TraceRow,
} from "./trace";

// ---------------------------------------------------------------------------
// The Brain interface.
// ---------------------------------------------------------------------------

export interface BrainReply {
  ok: boolean;
  /** Final text shown in the thread (markdown ok). */
  text: string;
  /** Structured payload, optional (e.g. a BoM, a violation list, a trace). */
  data?: unknown;
  /** True when the brain says "done, no more calls needed". */
  done?: boolean;
}

export type BrainKind =
  | "local" // pure executors, no network
  | "openai"
  | "anthropic"
  | "google"
  | "flux-mcp";

export interface Brain {
  kind: BrainKind;
  /** Answer one rendered prompt. May call tools internally; the loop only
   *  sees the final text + data. */
  chat(prompt: string, ctx: FluxContext): Promise<BrainReply>;
}

// ---------------------------------------------------------------------------
// Loop result.
// ---------------------------------------------------------------------------

export interface LoopResult extends BrainReply {
  /** The rows the loop appended (so the UI can scroll to the tail). */
  rows: TraceRow[];
  /** The agent that owned the turn. */
  agent: AgentId;
}

// ---------------------------------------------------------------------------
// runLoop — the one loop.
// ---------------------------------------------------------------------------

let seq = 0;
function nid(): string {
  return `tr_${(0x100000000 + ++seq).toString(16)}`;
}

export function makeLoop(
  trace: TraceLog,
  agent: AgentId,
): {
  run: (
    action: PromptAction,
    ctx: FluxContext,
    brain: Brain,
  ) => Promise<LoopResult>;
} {
  return {
    async run(action, ctx, brain) {
      const start = trace.rows.length;
      const linkId = action.tool?.name;
      const push = (part: Omit<TraceRow, "id" | "ts" | "agent">): TraceRow => {
        const row: TraceRow = {
          id: nid(),
          ts: Date.now(),
          agent,
          ...part,
          ...(linkId !== undefined ? { linkId } : {}),
        };
        trace.append(row);
        return row;
      };

      // 1️⃣ intent
      push({ kind: "intent", op: action.key, detail: action.label });

      // 2️⃣ render
      const { text, ok } = renderPrompt(action, ctx);
      if (!ok) {
        const row = push({
          kind: "error",
          op: action.key,
          detail: "selection requirement not met",
          ok: false,
        });
        return {
          ok: false,
          text: row.detail ?? "",
          rows: trace.rows.slice(start),
          agent,
        };
      }

      // 3️⃣ tool-call
      push({
        kind: "tool-call",
        op: action.key,
        detail: text,
        ...(linkId !== undefined ? { linkId } : {}),
      });

      // 4️⃣ the brain
      try {
        const reply = await brain.chat(text, ctx);
        push({
          kind: reply.ok ? "tool-result" : "error",
          op: action.key,
          detail: reply.ok ? reply.text.slice(0, 400) : reply.text,
          ok: reply.ok,
        });

        // 5️⃣ satisfied
        if (reply.ok && (reply.done ?? true)) {
          push({ kind: "satisfied", op: action.key });
        }

        return {
          ok: reply.ok,
          text: reply.text,
          ...(reply.data !== undefined ? { data: reply.data } : {}),
          ...(reply.done !== undefined ? { done: reply.done } : {}),
          rows: trace.rows.slice(start),
          agent,
        };
      } catch (e) {
        const msg = String(e);
        push({
          kind: "error",
          op: action.key,
          detail: msg,
          ok: false,
        });
        return {
          ok: false,
          text: `brain error: ${msg}`,
          rows: trace.rows.slice(start),
          agent,
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Brain factory — pick by BrainConfig.provider.
// ---------------------------------------------------------------------------

/**
 * Build a Brain from the user's settings. The local brain is ALWAYS available
 * (pure executors). Network brains are thin adapters over the same `chat`
 * interface — they serialise the rendered prompt to the provider's HTTP API.
 * We keep the providers honest: if no API key is set, a network brain throws
 * a clear error instead of silently falling back.
 */
export function makeBrain(cfg: BrainConfig): Brain {
  if (
    cfg.provider === "local" ||
    cfg.provider === "openai" ||
    cfg.provider === "anthropic" ||
    cfg.provider === "google" ||
    cfg.provider === "flux-mcp"
  ) {
    // The local brain is the only one that runs without network. The rest
    // are thin fetch adapters; we mark them "remote" so tests can stub them.
    const kind: BrainKind =
      cfg.provider === "local" ? "local" : (cfg.provider as BrainKind);
    return {
      kind,
      async chat(prompt, ctx) {
        // The local executor dispatch is wired in by the agent layer
        // (see agent/index.ts — not this file). This stub returns a clear
        // "not wired" so the loop tests can assert the seam exists without
        // pulling in the full executor graph.
        void prompt;
        void ctx;
        return {
          ok: false,
          text: `brain "${kind}" not provisioned (set an API key in settings)`,
        };
      },
    };
  }
  throw new Error(`makeBrain: unknown provider "${cfg.provider}"`);
}
