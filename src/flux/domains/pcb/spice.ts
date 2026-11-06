// flux/domains/pcb/spice.ts — client for the Shortcircuit transient engine.
//
// RE evidence: simulator engine "Shortcircuit" on S3 shortcircuit-cdn-prod,
// namespaced keys ns_Ck0a..., SPICE transient params tStart/tEnd/minStep/maxStep
// (chunk 99275). This is a thin, injectable client: the orchestrator builds a
// SimRequest, the brain/backend POSTs it, and we type the response. No local
// solver — the heavy transient runs server-side. Pure request/response types +
// a fake for tests.

export interface SpiceTransientSpec {
  tEnd: number; // s
  minStep: number; // s
  maxStep?: number; // s
  tStart?: number; // s (default 0)
  relTol?: number;
  abstol?: number;
}

export interface SpiceSource {
  type: "dc" | "pulse" | "sine";
  node1: string;
  node2: string;
  value: number;
  // pulse
  v1?: number;
  v2?: number;
  td?: number;
  tr?: number;
  tf?: number;
  pw?: number;
  per?: number;
  // sine
  f?: number;
  ph?: number;
}

export interface SpiceElement {
  designator: string;
  type: "R" | "C" | "L" | "D" | "V" | "I" | "opamp" | "subcircuit";
  netA: string;
  netB: string;
  value: number;
  params?: Record<string, number>;
}

export interface SimRequest {
  net: string; // node names
  elements: SpiceElement[];
  sources: SpiceSource[];
  transient: SpiceTransientSpec;
  /** Which nets to record. */
  record: string[];
  nodeId: string; // the SC namespace node id (ns_Ck0a... per design)
}

export interface SimResult {
  ok: boolean;
  error?: string;
  /** Time vector + per-recorded-net traces. */
  t?: number[];
  traces?: Record<string, number[]>;
}

export interface SpiceClient {
  run(req: SimRequest): Promise<SimResult>;
}

/** A no-op client (offline / no SC endpoint). Honest: returns not-ok. */
export const offlineSpice: SpiceClient = {
  run: async () => ({
    ok: false,
    error: "Shortcircuit endpoint not configured",
  }),
};

/** Fetch-backed client. ownerId supplies the ns_ key + an auth header. */
export function makeFetchSpice(
  endpoint: string,
  auth?: () => string | undefined,
): SpiceClient {
  return {
    run: async (req) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const tok = auth?.();
      if (tok) headers.Authorization = `Bearer ${tok}`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(req),
      });
      const j = (await r.json()) as SimResult;
      return j;
    },
  };
}

/** Build a SimRequest for a full-board transient (used by simulateCircuit). */
export function boardSimRequest(
  nodeId: string,
  record: string[],
  transient: SpiceTransientSpec,
): SimRequest {
  return {
    net: nodeId,
    elements: [],
    sources: [],
    transient,
    record,
    nodeId,
  };
}
