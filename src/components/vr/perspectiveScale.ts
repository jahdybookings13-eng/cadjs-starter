import * as THREE from "three";

export interface PerspectiveScaleState {
  scale: number;
  isActive: boolean;
}

export interface PerspectiveScaleSystem {
  state: PerspectiveScaleState;
  enter: (worldGroup: THREE.Group) => void;
  exit: () => void;
  update: (handDelta: number) => void;
  snapToLifeSize: (worldGroup: THREE.Group) => void;
  snapToPrevious: (worldGroup: THREE.Group) => void;
}

const SCALE_LABELS: { max: number; label: string }[] = [
  { max: 0.01, label: "Ant" },
  { max: 0.1, label: "Mouse" },
  { max: 0.5, label: "Child" },
  { max: 1.5, label: "Life Size" },
  { max: Infinity, label: "Giant" },
];

export function getScaleLabel(scale: number): string {
  for (const entry of SCALE_LABELS) {
    if (scale <= entry.max) return entry.label;
  }
  return "Giant";
}

export function createPerspectiveScaleSystem(): PerspectiveScaleSystem {
  const state: PerspectiveScaleState = {
    scale: 1.0,
    isActive: false,
  };

  let prevScale = 1.0;
  let targetGroup: THREE.Group | null = null;

  const enter = (worldGroup: THREE.Group) => {
    state.isActive = true;
    targetGroup = worldGroup;
    prevScale = worldGroup.scale.x;
  };

  const exit = () => {
    state.isActive = false;
    targetGroup = null;
  };

  const update = (handDelta: number) => {
    if (!state.isActive || !targetGroup) return;

    const scaleFactor = 1 + handDelta * 0.5;
    const newScale = state.scale * scaleFactor;
    state.scale = Math.max(0.001, Math.min(100, newScale));

    targetGroup.scale.setScalar(1 / state.scale);
  };

  const snapToLifeSize = (_worldGroup: THREE.Group) => {
    if (!targetGroup) return;
    state.scale = 1.0;
    targetGroup.scale.setScalar(1.0);
  };

  const snapToPrevious = (_worldGroup: THREE.Group) => {
    if (!targetGroup) return;
    state.scale = prevScale;
    targetGroup.scale.setScalar(1 / prevScale);
  };

  return { state, enter, exit, update, snapToLifeSize, snapToPrevious };
}
