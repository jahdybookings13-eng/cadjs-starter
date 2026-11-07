import type {
  SweepCornerMode,
  SweepOrientation,
} from "../../scene-operations/sweep-operations";

export type { SweepCornerMode, SweepOrientation };

export type SweepPhase = "SELECT_PROFILE" | "SELECT_PATH" | "READY";

export interface SweepState {
  phase: SweepPhase;
  selectedProfile: string | null;
  selectedPath: string | null;
  isApplying: boolean;
  orientation: SweepOrientation;
  cornerMode: SweepCornerMode;
}
