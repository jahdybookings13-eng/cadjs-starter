// flux/bus/actions.ts — the flux bus action surface (mirrors MANUFACTURE_ACTIONS).
//
// Every flux action gets a stable `flux.<key>` id. The chat window, the VR
// radial, voice, and `bus.run("flux.<key>", selection)` all resolve to the
// same orchestrator method — one thread per file, identical results from any
// of the four entry points. Read-only / analysis actions (explain, BoM, sim)
// share the same surface as mutating ones (addResistor); the distinction lives
// in the registry's `kind`, not in the id scheme.

export const FLUX_BUS_ACTIONS = [
  "flux.runTurn",
  "flux.explainProject",
  "flux.howToUseFlux",
  "flux.runErcDrc",
  "flux.generateBom",
  "flux.simulateCircuit",
  "flux.createPinMapping",
  "flux.createFirmwareFile",
  "flux.exportAssembly",
  "flux.compareComponents",
  "flux.ask",
  "flux.explain",
  "flux.addResistor",
  "flux.addCapacitor",
  "flux.addInductor",
  "flux.addVoltageDivider",
  "flux.addRCFilter",
  "flux.connectComponents",
  "flux.wirePowerNets",
  "flux.addBypassCaps",
  "flux.recommendMpn",
  "flux.recommendReplacement",
  "flux.verifyPartDetails",
  "flux.readDatasheet",
  "flux.findParts",
  "flux.partSpecifications",
  "flux.terminalCharacteristics",
  "flux.operatingConditions",
  "flux.listPinNamesAndFunctions",
  "flux.calculateVoltageDivider",
  "flux.createTestPlan",
  "flux.createBlockDiagram",
  "flux.passiveComponentConsolidation",
  "flux.checkAvailability",
  "flux.generateFmeaReport",
  "flux.generateRegulatoryChecklist",
  "flux.circuitRobustnessAnalyzer",
  "flux.whatIfScenarioExplorer",
  "flux.designSpaceOptimization",
  "flux.passiveFilterAnalysis",
  "flux.activeFilterAnalysis",
  "flux.currentAnalysis",
  "flux.rippleAnalysis",
  "flux.rcTimingLcOscillator",
  "flux.assignFunctionalGroups",
  "flux.writeProjectDescription",
  "flux.changeProperty",
] as const;

export type FluxBusAction = (typeof FLUX_BUS_ACTIONS)[number];

/** Is a given string a valid flux bus action id? */
export function isFluxAction(id: string): id is FluxBusAction {
  return (FLUX_BUS_ACTIONS as readonly string[]).includes(id);
}

/** Strip the `flux.` prefix -> the registry key. */
export function fluxKeyOf(id: string): string | null {
  return id.startsWith("flux.") ? id.slice(5) : null;
}
