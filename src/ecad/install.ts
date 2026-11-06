// ecad/install.ts — one-call hookup for the ScadGen scene.
//
//   const ecad = installEcad({ scene, bus, session });
//   //  → sim + 3D layer + bus actions + flux AI agent, all live.
//
// The scene hands in its THREE.Scene and ActionBus; the flux session (when
// present) gets the composed firmware agent. `ecad.run()` wraps the async
// simulator start for the bus (which is sync) and reports status.

import * as THREE from "three";
import type { ActionBus } from "../model/actionBus";
import type { FluxSession } from "../flux/session";
import { allParts, type EcadPart } from "./catalog";
import { EcadSim } from "./sim";
import { EcadLayer } from "./scene";
import { registerEcadActions } from "./busActions";
import { registerEcadAgent } from "./agent";

export interface Ecad {
  sim: EcadSim;
  layer: EcadLayer;
  /** The bus the actions were registered on (panel/VR dispatch through it). */
  bus: ActionBus;
  catalog(): EcadPart[];
  /** Mount the ECAD layer group into a scene (idempotent, late-safe). */
  attach(scene: THREE.Scene): void;
  /** Bus-safe async run: starts the runtime, returns immediate status. */
  run(boardInst: string): Promise<unknown> | unknown;
}

export interface InstallEcadOpts {
  /** Scene to mount the ECAD layer into; may arrive later via attach(). */
  scene?: THREE.Scene | null;
  bus: ActionBus;
  session?: FluxSession | null;
}

let installed: Ecad | null = null;

/**
 * Idempotent per process: the sim/layer persist for the app lifetime; when
 * the scene recreates its ActionBus (it does on effect re-runs) the actions
 * are simply re-registered onto the new bus.
 */
export function installEcad(opts: InstallEcadOpts): Ecad {
  if (!installed) {
    const sim = new EcadSim();
    const layer = new EcadLayer(sim);
    if (opts.scene) opts.scene.add(layer.group);
    installed = {
      sim,
      layer,
      bus: opts.bus,
      catalog: () => allParts(),
      run: (boardInst: string) => sim.run(boardInst),
      attach(scene: THREE.Scene) {
        if (layer.group.parent !== scene) scene.add(layer.group);
      },
    };
  }
  if (installed.bus !== opts.bus) {
    registerEcadActions(opts.bus, installed);
    installed.bus = opts.bus;
  }
  if (opts.scene) installed.attach(opts.scene);
  if (opts.session) registerEcadAgent(opts.session, installed);
  return installed;
}

/** Test/reset hook — process-wide. */
export function resetEcadInstall(): void {
  installed = null;
}
