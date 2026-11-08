// Developed-length flat-pattern calculation for a chain of bends. This is
// deliberately a calculation, not a bounding-box shortcut: every active bend
// contributes its own allowance and bend line.
import {
  phase6Fail,
  phase6Ok,
  type Phase6Issue,
  type Phase6Result,
} from "./phase6";
import { bendAllowanceMM } from "./phase6FeatureSpecs";

export interface FlatPatternBendInput {
  id: string;
  angleDeg: number;
  radiusMM: number;
  thicknessMM: number;
  kFactor: number;
  flangeLengthMM: number;
  direction: "up" | "down";
  reliefMM?: number;
  suppressed?: boolean;
}

export interface TrueFlatPatternPlan {
  developedLengthMM: number;
  developedWidthMM: number;
  totalFlangeLengthMM: number;
  totalAllowanceMM: number;
  bendCount: number;
  bendLines: Array<{
    id: string;
    offsetMM: number;
    angleDeg: number;
    direction: "up" | "down";
    allowanceMM: number;
    reliefMM: number;
  }>;
}

export function validateFlatPatternBend(
  bend: FlatPatternBendInput,
): Phase6Issue[] {
  const issues: Phase6Issue[] = [];
  if (!bend.id.trim())
    issues.push({
      path: "flatPattern.bend.id",
      message: "bend id is required",
    });
  if (!(bend.angleDeg > 0 && bend.angleDeg < 180))
    issues.push({
      path: `flatPattern.bend.${bend.id}.angleDeg`,
      message: "bend angle must be between 0 and 180 degrees",
    });
  if (!(Number.isFinite(bend.radiusMM) && bend.radiusMM >= 0))
    issues.push({
      path: `flatPattern.bend.${bend.id}.radiusMM`,
      message: "bend radius cannot be negative",
    });
  if (!(Number.isFinite(bend.thicknessMM) && bend.thicknessMM > 0))
    issues.push({
      path: `flatPattern.bend.${bend.id}.thicknessMM`,
      message: "thickness must be greater than zero",
    });
  if (!(bend.kFactor >= 0 && bend.kFactor <= 1))
    issues.push({
      path: `flatPattern.bend.${bend.id}.kFactor`,
      message: "K-factor must be between 0 and 1",
    });
  if (!(Number.isFinite(bend.flangeLengthMM) && bend.flangeLengthMM > 0))
    issues.push({
      path: `flatPattern.bend.${bend.id}.flangeLengthMM`,
      message: "flange length must be greater than zero",
    });
  if (bend.reliefMM !== undefined && !(bend.reliefMM >= 0))
    issues.push({
      path: `flatPattern.bend.${bend.id}.reliefMM`,
      message: "relief cannot be negative",
    });
  return issues;
}

export function computeTrueFlatPattern(input: {
  baseLengthMM: number;
  baseWidthMM: number;
  bends: readonly FlatPatternBendInput[];
}): Phase6Result<TrueFlatPatternPlan> {
  const issues: Phase6Issue[] = [];
  if (!(input.baseLengthMM > 0) || !(input.baseWidthMM > 0))
    issues.push({
      path: "flatPattern.base",
      message: "base length and width must be greater than zero",
    });
  const seen = new Set<string>();
  for (const bend of input.bends) {
    if (seen.has(bend.id))
      issues.push({
        path: `flatPattern.bend.${bend.id}`,
        message: `duplicate bend id ${bend.id}`,
      });
    seen.add(bend.id);
    issues.push(...validateFlatPatternBend(bend));
  }
  if (issues.length) return { ok: false, errors: issues };

  let offset = input.baseLengthMM;
  let totalFlangeLengthMM = 0;
  let totalAllowanceMM = 0;
  const bendLines: TrueFlatPatternPlan["bendLines"] = [];
  for (const bend of input.bends) {
    if (bend.suppressed) continue;
    const allowanceMM = bendAllowanceMM({
      angleDeg: bend.angleDeg,
      radiusMM: bend.radiusMM,
      thicknessMM: bend.thicknessMM,
      kFactor: bend.kFactor,
    });
    totalFlangeLengthMM += bend.flangeLengthMM;
    totalAllowanceMM += allowanceMM;
    offset += bend.flangeLengthMM + allowanceMM;
    bendLines.push({
      id: bend.id,
      offsetMM: offset - bend.flangeLengthMM / 2,
      angleDeg: bend.angleDeg,
      direction: bend.direction,
      allowanceMM,
      reliefMM: bend.reliefMM ?? 0,
    });
  }
  return phase6Ok({
    developedLengthMM: offset,
    developedWidthMM: input.baseWidthMM,
    totalFlangeLengthMM,
    totalAllowanceMM,
    bendCount: bendLines.length,
    bendLines,
  });
}
