// VR assembly grip/placement helper (additive skeleton).
import type { Assembly } from "../../assemblies";

export interface GripState {
  instanceId: string | null;
  hovering: boolean;
}

export function createGrip(): GripState {
  return { instanceId: null, hovering: false };
}

export function grab(g: GripState, instanceId: string): GripState {
  return { ...g, instanceId, hovering: false };
}

export function release(g: GripState): GripState {
  return { instanceId: null, hovering: false };
}

export function isHolding(g: GripState): boolean {
  return g.instanceId !== null;
}

export function selectInstance(g: GripState, instanceId: string): GripState {
  return { ...g, instanceId };
}

// VR controller trigger binding state machine (pure, additive)
export function triggerPress(
  g: GripState,
  instanceId: string | null,
): GripState {
  if (g.instanceId === null && instanceId) return grab(g, instanceId);
  if (g.instanceId !== null) return release(g);
  return g;
}
