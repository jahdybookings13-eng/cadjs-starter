// flux/agent/context.ts — typed context passed to every action.
//
// The orchestrator builds a FluxContext once per user turn: the current file
// (project), the selection (designators), and the user's brain choice. Every
// sub-agent receives the same context — "project inside a project". The
// selectionMode contract on each PromptAction is resolved here: it decides
// whether an action is runnable right now, or needs more/less selection.

import type { PromptAction, SelectionMode } from "./registry";

/** A selected schematic element (a part instance). */
export interface SelectedPart {
  designator: string;
  mpn?: string;
  type?: string;
  /** Functional block tag (from assignFunctionalGroups). */
  group?: string;
}

/** A net: a named group of pins electrically joined. */
export interface NetRef {
  name: string;
  pins: { designator: string; pin: string }[];
}

/** The live project/document the chat is bound to. */
export interface ProjectContext {
  /** Project/file id — the chat window is bound to exactly one of these. */
  projectRef: string;
  projectName: string;
  /** All placed parts. */
  parts: SelectedPart[];
  /** All nets. */
  nets: NetRef[];
  /** Functional blocks (group name -> designators). */
  groups?: Record<string, string[]>;
}

/** The LLM brain the user provisioned in settings (provider + key). */
export interface BrainConfig {
  /** Which provider's API to call. */
  provider: "openai" | "anthropic" | "google" | "flux-mcp" | "local";
  /** API key / OAuth token. Never stored on the part; lives in settings. */
  apiKey?: string;
  model?: string;
  /** Base URL override (e.g. a local Ollama). */
  baseUrl?: string;
}

/** What one selection mode actually demands. */
export interface SelectionRequirement {
  mode: SelectionMode;
  /** Minimum number of parts the action needs. */
  min: number;
  max: number;
  /** true when the requirement can be satisfied by `n` selected parts. */
  canRun(n: number): boolean;
}

export const SELECTION_REQUIREMENTS: Record<
  SelectionMode,
  SelectionRequirement
> = {
  none: {
    mode: "none",
    min: 0,
    max: Infinity,
    canRun: () => true,
  },
  optionalAnyToDesignator: {
    mode: "optionalAnyToDesignator",
    min: 0,
    max: 1,
    canRun: (n) => n <= 1,
  },
  optionalAnyToDesignators: {
    mode: "optionalAnyToDesignators",
    min: 0,
    max: Infinity,
    canRun: () => true,
  },
  requireAnyToDesignator: {
    mode: "requireAnyToDesignator",
    min: 1,
    max: 1,
    canRun: (n) => n === 1,
  },
  requireAnyToDesignators: {
    mode: "requireAnyToDesignators",
    min: 1,
    max: Infinity,
    canRun: (n) => n >= 1,
  },
  requireExactlyTwoToPair: {
    mode: "requireExactlyTwoToPair",
    min: 2,
    max: 2,
    canRun: (n) => n === 2,
  },
};

/** The full per-turn context handed to sub-agents + the brain. */
export interface FluxContext {
  project: ProjectContext;
  selection: SelectedPart[];
  brain: BrainConfig;
}

export function makeContext(
  project: ProjectContext,
  selection: SelectedPart[],
  brain: BrainConfig,
): FluxContext {
  return { project, selection, brain };
}

/**
 * Fill a prompt template's {placeholders} from context. Returns the final text
 * sent to the brain. Unknown placeholders are left as-is so the model can see
 * them and ask.
 */
export function renderPrompt(
  action: PromptAction,
  ctx: FluxContext,
): { text: string; ok: boolean } {
  let text = action.prompt;
  const sel = ctx.selection;
  const designators = sel.map((s) => s.designator);
  const verbs = sel.length === 1 ? ["does", "is"] : ["do", "are"];
  text = text
    .replace(/\{designators\}/g, designators.join(", "))
    .replace(/\{designator1\}/g, designators[0] ?? "{designator1}")
    .replace(/\{designator2\}/g, designators[1] ?? "{designator2}")
    .replace(/\{designator\}/g, designators[0] ?? "{designator}")
    .replace(/\{designatorsWithNames\}/g, formatWithNames(sel))
    .replace(/\{designatorWithName\}/g, formatWithNames(sel.slice(0, 1)))
    .replace(/\{verb\}/g, verbs[0] ?? "")
    .replace(/\{possessive\}/g, designators.length === 1 ? "its" : "their");
  const req = SELECTION_REQUIREMENTS[action.selectionMode];
  const ok = req.canRun(sel.length);
  return { text, ok };
}

function formatWithNames(sel: SelectedPart[]): string {
  return sel
    .map((p) => (p.mpn ? `${p.designator} (${p.mpn})` : p.designator))
    .join(", ");
}

/**
 * Build the tool args for a mutating action from context (for local executors).
 * The brain may override with real values; this is the deterministic default.
 */
export function defaultToolArgs(
  action: PromptAction,
  ctx: FluxContext,
): Record<string, unknown> | null {
  if (!action.tool) return null;
  const sel = ctx.selection;
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v !== undefined) out[k] = v;
  };
  switch (action.tool.name) {
    case "addResistor":
    case "addCapacitor":
    case "addInductor":
      put("designator", sel[0]?.designator ?? nextDesignator(ctx));
      put("value", sel[0]?.mpn ?? "10k");
      break;
    case "connectComponents":
      put("a", sel[0]?.designator);
      put("b", sel[1]?.designator);
      break;
    case "change_property":
      put("designator", sel[0]?.designator);
      break;
    default:
      break;
  }
  return Object.keys(out).length ? out : null;
}

/** Suggest the next free designator for a part type (R, C, L, ...). */
export function nextDesignator(ctx: FluxContext, prefix = "R"): string {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const p of ctx.project.parts) {
    const m = re.exec(p.designator);
    if (m && m[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${max + 1}`;
}
