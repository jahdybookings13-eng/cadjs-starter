// flux/index.ts — public facade for the FLUX par subsystem.
//
// "Project inside a project." The PCB/MCAD subsystems live inside scadgen
// (same FeatureNode tree, same `scadgenHistory` undo/redo, same ActionBus).
// This file is the single entry point: the registry, the orchestrator, the
// agent loop, the MCP client, the domains, the bus bridge, and (re-exported)
// the UI surfaces. A consumer does:
//
//   import { makeOrchestrator, makeContext, FLUX_ACTIONS, registerFluxBus }
//     from "@cadjs/flux"; // (the facade)
//   import { OrchestratorView } from "@cadjs/flux"; // (the React surface)
//
// Local-first: everything here runs in the browser. The brain + the real SPICE
// transient + the datasheet lookup are the only network paths, and they're
// injected (BrainConfig / SpiceClient / McpClient), never baked in.

// ---- agent core -----------------------------------------------------------
export {
  PROMPT_REGISTRY,
  ALL_ACTIONS,
  VALID_ACTION_KEYS,
  getAction,
  menuByGroup,
  topLevelActions,
  type PromptAction,
  type ToolSpec,
  type SelectionMode,
  type SubmenuGroup,
} from "./agent/registry";

export {
  makeContext,
  renderPrompt,
  defaultToolArgs,
  nextDesignator,
  SELECTION_REQUIREMENTS,
  type BrainConfig,
  type FluxContext,
  type ProjectContext,
  type SelectedPart,
  type NetRef,
  type SelectionRequirement,
} from "./agent/context";

export {
  makeTraceLog,
  type TraceLog,
  type TraceRow,
  type AgentId,
  type TraceKind,
} from "./agent/trace";

export {
  makeOrchestrator,
  agentForKey,
  type Orchestrator,
  type SubAgent,
  type ToolResult,
  type LocalExecutor,
} from "./agent/orchestrator";

export {
  makeLoop,
  makeBrain,
  type Brain,
  type BrainReply,
  type BrainKind,
  type LoopResult,
} from "./agent/loop";

// ---- session ---------------------------------------------------------------
export {
  makeFluxSession,
  type FluxSession,
  type FluxSessionOpts,
} from "./session";

// ---- domains ---------------------------------------------------------------
export {
  makeProject,
  makeElement,
  makeNet,
  makeGroup,
  addElement,
  addNet,
  addGroup,
  removeElement,
  setGroup,
  allElements,
  byDesignator,
  byGroup,
  netsOfPin,
  nextUid,
  type PcbProject,
  type PcbElement,
  type PcbNet,
  type PcbGroup,
  type PcbNode,
  type PcbPin,
  type PcbEntityKind,
} from "./domains/pcb/project";

export {
  resolveRules,
  runErcDrc,
  buildBom,
  consolidatePassives,
  type PcbRule,
  type RuleSet,
  type Violation,
  type RuleOrigin,
  type RuleSelector,
} from "./domains/pcb/rules";

export {
  mulberry32,
  voltageDivider,
  rcFilter,
  rlcBode,
  rcTiming,
  lcResonance,
  dcCurrent,
  rippleEstimate,
  monteCarlo,
  drawTol,
} from "./domains/pcb/sim";

export {
  offlineSpice,
  makeFetchSpice,
  boardSimRequest,
  type SpiceClient,
  type SpiceTransientSpec,
  type SpiceSource,
  type SpiceElement,
  type SimRequest,
  type SimResult,
} from "./domains/pcb/spice";

export {
  FORMAT_MATRIX,
  isNativeFormat,
  extOf,
  type CadFormat,
  type FormatInfo,
} from "./domains/mcad/formats";

export {
  boxOf,
  addBoardEnclosureLink,
  resolveLinkPosition,
  toleranceStack,
  approachCheck,
  mechToFirmware,
  assemblySpec,
  runCoDesign,
  echoMountingHole,
  assembleDevice,
  type Box3,
  type DesignLink,
  type ToleranceSpec,
  type ToleranceResult,
  type StackItem,
  type AccessCheck,
  type FirmwareConstant,
  type CoDesignResult,
  type AssemblySpec,
  type FitClass,
  type LinkBehaviour,
  type LinkDirection,
  type MountingHole,
  type BoardEcho,
  type DevicePart,
  type DeviceAssembly,
} from "./domains/mcad/coDesign";

// ---- MCP -------------------------------------------------------------------
export {
  toMcpToolCall,
  validateMcpCall,
  makeFetchMcpClient,
  makeFakeMcpClient,
  type McpClient,
  type McpToolCall,
  type McpToolResult,
} from "./mcp/client";

// ---- bus -------------------------------------------------------------------
export {
  FLUX_BUS_ACTIONS,
  isFluxAction,
  fluxKeyOf,
  type FluxBusAction,
} from "./bus/actions";

export { registerFluxBus, FLUX_ACTIONS } from "./bus/bridge";

// ---- UI surfaces (React + three.js) ----------------------------------------
export { default as ChatPanel } from "./ui/chatPanel";
export {
  default as OrchestratorView,
  OrchestratorView as OrchestratorViewNamed,
} from "./ui/orchestratorView";

export {
  layoutChat,
  drawChat,
  chatHitTest,
  CHAT_THEME,
  type ChatLayout,
  type ChatRowLayout,
  type ChatRegion,
  type ChatTheme,
} from "./vr/chatPanelCanvas";

export { createVRChatPanel, type VRChatPanel } from "./vr/vrChatPanel";

export {
  useFluxChat,
  type FluxChatState,
  type UseFluxChatOpts,
} from "./vr/useFluxChat";
