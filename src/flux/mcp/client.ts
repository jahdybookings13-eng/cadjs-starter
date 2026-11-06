// flux/mcp/client.ts — the MCP (Model Context Protocol) tool-call surface.
//
// RE evidence (FLUX_RE_FINDINGS): Flux's MCP server is at
// https://app.flux.ai/mcp (OAuth/bearer; free reads, paid design work) and Flux
// is *also* an MCP host (a GitLab connector was visible). Our brain talks to
// tools through this exact shape: the registry's `ToolSpec` (name + typed args)
// is serialised into a standard MCP tool-call, the backend (either the flux
// MCP endpoint or a local executor) returns a typed result, and we deserialize
// it back into a `McpToolResult`.
//
// This is PURE: no fetch here. The `McpClient` interface is the seam — a
// `fetchMcpClient(endpoint, auth)` and a `fakeMcpClient(responses)` both
// implement it. The orchestrator's brain loop is unchanged either way.

import type { PromptAction } from "../agent/registry";

// ---------------------------------------------------------------------------
// Wire types (MCP-flavoured, JSON-safe).
// ---------------------------------------------------------------------------

export interface McpToolCall {
  /** The tool name (== ToolSpec.name, snake_case on the wire). */
  name: string;
  /** Typed args as a JSON object. */
  args: Record<string, unknown>;
  /** The action key it came from (for tracing back to the registry). */
  sourceAction: string;
  /** Project/file binding — the chat thread this call belongs to. */
  projectRef: string;
}

export interface McpToolResult {
  ok: boolean;
  name: string;
  /** The structured payload (BoM rows, violation list, sim traces, …). */
  data?: unknown;
  /** Human text for the thread. */
  text?: string;
  error?: string;
  /** Elapsed ms, set by the client. */
  ms?: number;
}

export interface McpClient {
  /** Send one tool call; receive a typed result. */
  call(req: McpToolCall): Promise<McpToolResult>;
  /** Connectivity probe (the "free reads" class of calls). */
  ping(): Promise<{ ok: boolean; latencyMs?: number }>;
}

// ---------------------------------------------------------------------------
// Serialisation — registry ToolSpec -> wire McpToolCall.
// ---------------------------------------------------------------------------

/** Build a wire-ready McpToolCall from a registry action + args. */
export function toMcpToolCall(
  action: PromptAction,
  args: Record<string, unknown>,
  projectRef: string,
): McpToolCall | null {
  if (!action.tool) return null;
  return {
    name: action.tool.name,
    args,
    sourceAction: action.key,
    projectRef,
  };
}

/** Validate an incoming call against the action's ToolSpec (arg schema). */
export function validateMcpCall(
  req: McpToolCall,
  action: PromptAction | undefined,
): { ok: boolean; missing: string[] } {
  if (!action?.tool) return { ok: false, missing: ["<no tool spec>"] };
  const missing: string[] = [];
  for (const [k, spec] of Object.entries(action.tool.args)) {
    if (spec.type === "string" || spec.type === "number") {
      if (!(k in req.args)) missing.push(k);
    }
  }
  return { ok: missing.length === 0, missing };
}
// ---------------------------------------------------------------------------
// Clients.
// ---------------------------------------------------------------------------

/**
 * Fetch-backed client for the real flux MCP endpoint (or any OpenMCP server).
 * Auth is a bearer token (the OAuth token from settings). We never log it.
 */
export function makeFetchMcpClient(
  endpoint: string,
  authToken: string,
): McpClient {
  return {
    async call(req) {
      const t0 = Date.now();
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(req),
        });
        if (!res.ok) {
          throw new Error(`MCP ${res.status} ${res.statusText}`);
        }
        const json = (await res.json()) as {
          ok?: boolean;
          data?: unknown;
          text?: string;
          error?: string;
        };
        return {
          ok: json.ok ?? true,
          name: req.name,
          ...(json.data !== undefined ? { data: json.data } : {}),
          ...(json.text !== undefined ? { text: json.text } : {}),
          ...(json.error !== undefined ? { error: json.error } : {}),
          ms: Date.now() - t0,
        };
      } catch (e) {
        return {
          ok: false,
          name: req.name,
          error: String(e),
          ms: Date.now() - t0,
        };
      }
    },
    async ping() {
      const t0 = Date.now();
      try {
        const res = await fetch(endpoint, {
          method: "GET",
          headers: { authorization: `Bearer ${authToken}` },
        });
        return { ok: res.ok, latencyMs: Date.now() - t0 };
      } catch {
        return { ok: false };
      }
    },
  };
}

/**
 * A name -> canned-response map. Lets the orchestrator tests exercise the
 * FULL tool-call round-trip (serialise -> dispatch -> deserialize) without a
 * network or a real executor. Unknown tools return an honest error.
 */
export function makeFakeMcpClient(
  responses: Record<string, McpToolResult>,
): McpClient {
  return {
    async call(req) {
      const r = responses[req.name];
      if (!r) {
        return {
          ok: false,
          name: req.name,
          error: `fake: no canned response for "${req.name}"`,
        };
      }
      return r;
    },
    async ping() {
      return { ok: true, latencyMs: 0 };
    },
  };
}
