// A scene-free ECAD controller.
//
// PCB Studio embeds the same virtual MCU workbench as the desktop/VR ECAD
// surfaces. It has no Three.js scene of its own, so the visual layer is a no-op;
// the simulator, catalog, firmware registry and ActionBus actions are real.
// This keeps MCU execution identical across desk, headset, AI and PCB Studio.

import { ActionBus } from "../model/actionBus";
import { registerEcadActions } from "./busActions";
import { allParts } from "./catalog";
import { EcadSim } from "./sim";
import type { Ecad } from "./install";
import type { EcadLayer } from "./scene";

export type HeadlessEcad = Ecad & { dispose: () => void };

function noopLayer(): EcadLayer {
  return {
    add: () => null,
    remove: () => false,
    highlight: () => undefined,
    selected: () => null,
    update: () => undefined,
  } as unknown as EcadLayer;
}

export function makeHeadlessEcad(): HeadlessEcad {
  const sim = new EcadSim();
  const bus = new ActionBus();
  const layer = noopLayer();
  const ecad: HeadlessEcad = {
    sim,
    layer,
    bus,
    catalog: () => allParts(),
    attach: () => undefined,
    run: (boardInst: string) => sim.run(boardInst),
    dispose: () => sim.clear(),
  };
  registerEcadActions(bus, ecad);
  return ecad;
}
