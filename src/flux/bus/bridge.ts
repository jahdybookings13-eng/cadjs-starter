// flux/bus/bridge.ts — wire the flux orchestrator onto the global ActionBus.
//
// Exit-ramp rule (actionBus.ts): every operation reachable by desk / VR /
// voice must be reachable by id here. The flux copilot actions get a
// `flux.` namespace on the bus (e.g. `flux.runErcDrc`, `flux.addResistor`) and
// ONE command surface (`flux.runTurn`) that takes the action key + selection.
// Where a flux action maps to an existing scene op (export-step), the alias
// points at the existing id so the bus returns the real export, not a stub.
//
// This mirrors `src/manufacture/index.ts` (MANUFACTURE_ACTIONS + a dispatcher),
// but for the AI copilot: the chat window, the VR radial, the voice command,
// and a programmatic `bus.run("flux.runTurn", key, selection)` all land on the
// SAME orchestrator. One thread per file is preserved because the orchestrator
// is bound to exactly one ProjectContext.

import type { ActionBus } from "../../model/actionBus";
import type { Orchestrator } from "../agent/orchestrator";
import { VALID_ACTION_KEYS } from "../agent/registry";

export const FLUX_ACTIONS = [
  "flux.runTurn",
  "flux.explainProject",
  "flux.runErcDrc",
  "flux.generateBom",
  "flux.simulateCircuit",
  "flux.createPinMapping",
  "flux.createFirmwareFile",
  "flux.exportAssembly",
  "flux.howToUseFlux",
  ...VALID_ACTION_KEYS.map((k) => `flux.${k}`),
] as const;

export type FluxAction = (typeof FLUX_ACTIONS)[number];

/**
 * Register the flux surface on a bus. Idempotent: re-registering the same key
 * replaces the old binding (the factory is the source of truth for runTurn).
 *
 * @param bus   The scene action bus (from createSceneBus).
 * @param orch  The file's orchestrator (bound to one ProjectContext).
 * @param map   A resolver from "flux.<key>" -> the existing scene bus id for
 *   ops that reuse a kernel path (e.g. exportAssembly -> export-step).
 */
export function registerFluxBus(
  bus: ActionBus,
  orch: Orchestrator,
  map: Record<string, string> = {},
): void {
  const runTurn = (...args: unknown[]): unknown => {
    const [key, selection] = args;
    const k = String(key ?? "");
    const sel = Array.isArray(selection)
      ? (selection as { designator: string }[])
      : [];
    return orch.runTurn(k, sel);
  };

  // The universal entry point.
  bus.register({
    id: "flux.runTurn",
    kind: "command",
    aliases: ["flux"],
    run: runTurn,
  } as never);

  // Per-action shortcuts: flux.<key> -> the same runTurn with the key baked in,
  // OR an alias to an existing scene op when the resolver says so.
  for (const key of VALID_ACTION_KEYS) {
    const alias = map[key];
    if (alias) {
      // Reuse the existing op's result (e.g. a real STEP export).
      bus.register({
        id: `flux.${key}`,
        kind: "command",
        aliases: [],
        run: (...args: unknown[]) => bus.run(alias, ...args),
      } as never);
    } else {
      bus.register({
        id: `flux.${key}`,
        kind: "command",
        aliases: [],
        run: (selection: unknown) => runTurn(key, selection),
      } as never);
    }
  }
}
