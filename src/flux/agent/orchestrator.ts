// flux/agent/orchestrator.ts — the single conductor.
//
// Design rule (NON-NEGOTIABLE): one chat thread per file/project. The
// orchestrator is that thread. Sub-agents (pcb / mcad / firmware / parts) do
// NOT get their own panels — they POST rows into the master thread, tagged with
// their agent id. The user reads one stream, one input.
//
// The orchestrator also decides routing: which agent owns a given action key,
// whether the action can run given the current selection, and — for tools —
// whether to execute locally (pure executors) or serialise to the provisioned
// brain via the MCP client. It owns no state of its own; everything is
// passed-in + returned.
//
// "Project inside a project": this file is the part of the PCB sub-project
// that talks to the MCAD sub-project (co-design), firmware, and parts — all
// inside the same FeatureNode tree, same history, same undo.

import { getAction, type PromptAction } from "./registry";
import {
  SELECTION_REQUIREMENTS,
  type BrainConfig,
  type FluxContext,
  type ProjectContext,
  type SelectedPart,
} from "./context";
import { makeTraceLog, type AgentId, type TraceLog } from "./trace";

// ---------------------------------------------------------------------------
// Routing table: action key -> owning sub-agent.
// The orchestrator refuses to own a mutation it does not understand: unknown
// keys route to "orchestrator" and emit an error, not a silent no-op.
// ---------------------------------------------------------------------------

const AGENT_BY_KEY: Record<string, AgentId> = {
  // pcb (ECAD) — schematic / layout
  connectComponents: "pcb",
  wirePowerNets: "pcb",
  addBypassCaps: "pcb",
  addResistor: "pcb",
  addCapacitor: "pcb",
  addInductor: "pcb",
  addVoltageDivider: "pcb",
  addRCFilter: "pcb",
  addHBridge: "pcb",
  addPowerSupply: "pcb",
  addUsbInterface: "pcb",
  addSensorInterface: "pcb",
  addServoController: "pcb",
  addSubcircuit: "pcb",
  assignFunctionalGroups: "pcb",
  runErcDrc: "pcb",
  findIssues: "pcb",
  reviewDecouplingCapPresence: "pcb",
  reviewEnableResetPins: "pcb",
  reviewUnconnectedPins: "pcb",
  changeProperty: "pcb",
  buildPcb: "pcb",
  autoPlaceBoard: "pcb",
  autorouteBoard: "pcb",
  runPcbDrc: "pcb",
  exportPcbFabrication: "pcb",
  addSchematicSheet: "pcb",
  addPcbPart: "pcb",
  addPcbVia: "pcb",
  checkPcbAssembly: "pcb",
  createPcbDemo: "pcb",
  // mcad
  importPart: "mcad",
  exportAssembly: "mcad",
  followBoard: "mcad",
  followEnclosure: "mcad",
  // firmware
  createPinMapping: "firmware",
  createFirmwareFile: "firmware",
  generateFirmwareSkeleton: "firmware",
  // ecad (virtual microcontrollers — ScadGen ECAD subsystem)
  listBoards: "ecad",
  insertMcu: "ecad",
  wirePins: "ecad",
  writeFirmware: "ecad",
  deployFirmware: "ecad",
  runFirmware: "ecad",
  ecadStatus: "ecad",
  // parts
  recommendMpn: "parts",
  recommendReplacement: "parts",
  verifyPartDetails: "parts",
  readDatasheet: "parts",
  findParts: "parts",
  partSpecifications: "parts",
  terminalCharacteristics: "parts",
  operatingConditions: "parts",
  // analysis (orchestrator itself — pure brain, no mutation)
  ask: "orchestrator",
  explain: "orchestrator",
  explainProject: "orchestrator",
  howToUseFlux: "orchestrator",
  compareComponents: "orchestrator",
  listPinNamesAndFunctions: "orchestrator",
  calculateVoltageDivider: "orchestrator",
  createTestPlan: "orchestrator",
  createBlockDiagram: "orchestrator",
  generateBom: "orchestrator",
  passiveComponentConsolidation: "orchestrator",
  checkAvailability: "orchestrator",
  generateFmeaReport: "orchestrator",
  generateRegulatoryChecklist: "orchestrator",
  circuitRobustnessAnalyzer: "orchestrator",
  whatIfScenarioExplorer: "orchestrator",
  designSpaceOptimization: "orchestrator",
  passiveFilterAnalysis: "orchestrator",
  activeFilterAnalysis: "orchestrator",
  currentAnalysis: "orchestrator",
  rippleAnalysis: "orchestrator",
  rcTimingLcOscillator: "orchestrator",
  simulateCircuit: "orchestrator",
  writeProjectDescription: "orchestrator",
};

export function agentForKey(key: string): AgentId {
  return AGENT_BY_KEY[key] ?? "orchestrator";
}

// ---------------------------------------------------------------------------
// Tool dispatch.
// The local executors (pure, in-browser) cover the deterministic core: ERC/DRC,
// BOM, passive consolidation, sim math, co-design stack, pin-mapping. Anything
// that needs real datasheet lookup or a transient SPICE run goes to the brain
// via the MCP client. The `ExecutorMap` is the seam: the brain can override any
// of these later without touching the orchestrator.
// ---------------------------------------------------------------------------

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

export type LocalExecutor = (
  action: PromptAction,
  args: Record<string, unknown>,
  ctx: FluxContext,
) => ToolResult;

export interface SubAgent {
  id: AgentId;
  /** Execute a local tool (deterministic). Returns null if it needs the brain. */
  runLocal: (
    action: PromptAction,
    args: Record<string, unknown>,
    ctx: FluxContext,
  ) => ToolResult | null | Promise<ToolResult | null>;
  /** Handle a brain round-trip. The orchestrator feeds this the rendered prompt. */
  runBrain: (
    action: PromptAction,
    rendered: string,
    ctx: FluxContext,
  ) => Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// The orchestrator.
// ---------------------------------------------------------------------------

export interface Orchestrator {
  /** The one thread for this file/project. All rows post here. */
  readonly trace: TraceLog;
  /** Register a sub-agent (pcb / mcad / firmware / parts). Replaces on re-key. */
  registerAgent(agent: SubAgent): void;
  /** Set the provisioned brain (called once from settings). */
  setBrain(brain: BrainConfig): void;
  /** Refresh the live project snapshot the next turn reads. */
  setProjectContext(project: ProjectContext): void;
  /**
   * ONE user turn: render the prompt, route to the owning agent, execute
   * locally first, fall back to the brain, post each step as a TraceRow.
   * Returns the final ToolResult so the UI can render the answer inline.
   */
  runTurn(actionKey: string, selection: SelectedPart[]): Promise<ToolResult>;
  /** Selectable actions for the current selection (drives the menu). */
  enabledSelection(): { enabled: string[]; disabled: string[] };
}

export function makeOrchestrator(
  project: ProjectContext,
  trace?: TraceLog,
): Orchestrator {
  const log = trace ?? makeTraceLog();
  const agents = new Map<AgentId, SubAgent>();
  let brain: BrainConfig = { provider: "local" };
  let liveProject = project;

  const route = (action: PromptAction): SubAgent =>
    agents.get(agentForKey(action.key)) ??
    agents.get("orchestrator") ?? {
      id: "orchestrator",
      runLocal: () => ({
        ok: false,
        error: `no local executor for ${action.key}`,
      }),
      runBrain: async () => ({
        ok: false,
        error: `brain not provisioned for ${action.key}`,
      }),
    };

  return {
    trace: log,
    registerAgent(agent) {
      agents.set(agent.id, agent);
    },
    setBrain(b) {
      brain = b;
    },
    setProjectContext(next) {
      liveProject = next;
    },
    async runTurn(actionKey, selection) {
      const action = getAction(actionKey);
      if (!action) {
        const row = log;
        // honest failure: the key is not in the registry at all.
        void row;
        return { ok: false, error: `unknown action "${actionKey}"` };
      }
      const ctx: FluxContext = {
        project: liveProject,
        selection,
        brain,
      };
      const req = SELECTION_REQUIREMENTS[action.selectionMode];
      const okSel = req.canRun(selection.length);
      if (!okSel) {
        log.append({
          id: `tr_${(0x100000000 + log.rows.length + 1).toString(16)}`,
          ts: Date.now(),
          agent: agentForKey(action.key),
          kind: "error",
          op: actionKey,
          detail: `needs ${req.min}..${req.max} selection, got ${selection.length}`,
          ok: false,
        });
        return {
          ok: false,
          error: `selection: needs ${req.min}..${req.max}, got ${selection.length}`,
        };
      }

      log.append({
        id: `tr_${(0x100000000 + log.rows.length + 1).toString(16)}`,
        ts: Date.now(),
        agent: "orchestrator",
        kind: "intent",
        op: actionKey,
        detail: action.label,
      });

      const agent = route(action);
      // Local first — deterministic, no network.
      const local = await agent.runLocal(action, {}, ctx);
      if (local) {
        log.append({
          id: `tr_${(0x100000000 + log.rows.length + 1).toString(16)}`,
          ts: Date.now(),
          agent: agent.id,
          kind: "tool-result",
          op: actionKey,
          detail: local.error ?? "ok",
          ok: local.ok,
        });
        if (local.ok) {
          log.append({
            id: `tr_${(0x100000000 + log.rows.length + 1).toString(16)}`,
            ts: Date.now(),
            agent: agent.id,
            kind: "satisfied",
            op: actionKey,
          });
        }
        return local;
      }
      // Brain path: render the prompt, send, post the result.
      const { text } = renderPromptInternal(action, ctx);
      log.append({
        id: `tr_${(0x100000000 + log.rows.length + 1).toString(16)}`,
        ts: Date.now(),
        agent: agent.id,
        kind: "tool-call",
        op: actionKey,
        detail: text,
      });
      const res = await agent.runBrain(action, text, ctx);
      log.append({
        id: `tr_${(0x100000000 + log.rows.length + 1).toString(16)}`,
        ts: Date.now(),
        agent: agent.id,
        kind: res.ok ? "tool-result" : "error",
        op: actionKey,
        detail: res.error ?? "ok",
        ok: res.ok,
      });
      if (res.ok) {
        log.append({
          id: `tr_${(0x100000000 + log.rows.length + 1).toString(16)}`,
          ts: Date.now(),
          agent: agent.id,
          kind: "satisfied",
          op: actionKey,
        });
      }
      return res;
    },
    enabledSelection() {
      const enabled: string[] = [];
      const disabled: string[] = [];
      for (const [key, def] of Object.entries(AGENT_BY_KEY)) {
        void def;
        const action = getAction(key);
        if (!action) {
          disabled.push(key);
          continue;
        }
        const req = SELECTION_REQUIREMENTS[action.selectionMode];
        // "enabled" = can run with the CURRENT selection count. The orchestrator
        // exposes the whole registry; the caller filters by selection at call
        // time. Here we just flag what's runnable with an empty selection (the
        // menu's resting state).
        if (req.canRun(0)) enabled.push(key);
        else disabled.push(key);
      }
      return { enabled, disabled };
    },
  };
}

// Kept private to avoid a second import surface for renderPrompt (the public
// one in context.ts takes the same ctx; we re-implement the placeholder fill
// here to keep the orchestrator self-contained + testable without the
// context module's full import graph).
function renderPromptInternal(
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
    .replace(/\{verb\}/g, verbs[0] ?? "");
  const req = SELECTION_REQUIREMENTS[action.selectionMode];
  return { text, ok: req.canRun(sel.length) };
}
