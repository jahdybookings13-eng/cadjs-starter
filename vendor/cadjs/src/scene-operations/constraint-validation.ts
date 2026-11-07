import {
  SketchPrimitive,
  ConstraintType,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  isSketchEllipse,
  isSketchEllipticalArc,
  isSketchSpline,
  isSketchBezier,
  isSketchConic,
  isDimensionalConstraintType,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  findSketchPoint,
} from "../types/sketch-types";
import { assertNever } from "../utils/assertNever";

interface ConstraintRule {
  type: ConstraintType;
  requiredCount: number;
  validCombinations: PrimitiveCombination[];
  requiresValue: boolean;
}

type PrimitiveCombination =
  | "line"
  | "circle"
  | "arc"
  | "ellipse"
  | "ellipticalArc"
  | "spline"
  | "point-point"
  | "line-line"
  | "circle-circle"
  | "line-circle"
  | "point-line"
  | "point-circle"
  | "point-point-line"
  | "point-point-point";

const CONSTRAINT_RULES: ConstraintRule[] = [
  // Single primitive constraints
  {
    type: "horizontal",
    requiredCount: 1,
    validCombinations: ["line"],
    requiresValue: false,
  },
  {
    type: "vertical",
    requiredCount: 1,
    validCombinations: ["line"],
    requiresValue: false,
  },
  {
    type: "radius",
    requiredCount: 1,
    validCombinations: ["circle", "arc"],
    requiresValue: true,
  },
  {
    type: "diameter",
    requiredCount: 1,
    validCombinations: ["circle", "arc"],
    requiresValue: true,
  },

  // Two primitive constraints
  {
    type: "coincident",
    requiredCount: 2,
    validCombinations: ["point-point"],
    requiresValue: false,
  },
  {
    type: "parallel",
    requiredCount: 2,
    validCombinations: ["line-line"],
    requiresValue: false,
  },
  {
    type: "perpendicular",
    requiredCount: 2,
    validCombinations: ["line-line"],
    requiresValue: false,
  },
  {
    type: "tangent",
    requiredCount: 2,
    validCombinations: ["line-circle"],
    requiresValue: false,
  },
  {
    type: "equal",
    requiredCount: 2,
    validCombinations: ["line-line", "circle-circle"],
    requiresValue: false,
  },
  {
    type: "concentric",
    requiredCount: 2,
    validCombinations: ["circle-circle"],
    requiresValue: false,
  },
  {
    type: "distance",
    requiredCount: 1,
    validCombinations: ["line"],
    requiresValue: true,
  },
  {
    type: "distance",
    requiredCount: 2,
    validCombinations: ["point-point"],
    requiresValue: true,
  },
  {
    type: "distanceX",
    requiredCount: 1,
    validCombinations: ["line"],
    requiresValue: true,
  },
  {
    type: "distanceX",
    requiredCount: 2,
    validCombinations: ["point-point"],
    requiresValue: true,
  },
  {
    type: "distanceY",
    requiredCount: 1,
    validCombinations: ["line"],
    requiresValue: true,
  },
  {
    type: "distanceY",
    requiredCount: 2,
    validCombinations: ["point-point"],
    requiresValue: true,
  },
  {
    type: "angle",
    requiredCount: 2,
    validCombinations: ["line-line"],
    requiresValue: true,
  },
  {
    type: "pointOnLine",
    requiredCount: 2,
    validCombinations: ["point-line"],
    requiresValue: false,
  },
  {
    type: "pointOnCircle",
    requiredCount: 2,
    validCombinations: ["point-circle"],
    requiresValue: false,
  },
  {
    type: "midpoint",
    requiredCount: 2,
    validCombinations: ["point-line"],
    requiresValue: false,
  },
  {
    type: "symmetric",
    requiredCount: 3,
    validCombinations: ["point-point-line", "point-point-point"],
    requiresValue: false,
  },
];

function getPrimitiveType(
  primitive: SketchPrimitive,
):
  | "point"
  | "line"
  | "circle"
  | "arc"
  | "ellipse"
  | "ellipticalArc"
  | "spline"
  | "bezier"
  | "conic" {
  if (isSketchPoint(primitive)) return "point";
  if (isSketchLine(primitive)) return "line";
  if (isSketchCircle(primitive)) return "circle";
  if (isSketchArc(primitive)) return "arc";
  if (isSketchEllipse(primitive)) return "ellipse";
  if (isSketchEllipticalArc(primitive)) return "ellipticalArc";
  if (isSketchSpline(primitive)) return "spline";
  if (isSketchBezier(primitive)) return "bezier";
  if (isSketchConic(primitive)) return "conic";
  return "point"; // fallback
}

function getCombination(
  primitives: SketchPrimitive[],
): PrimitiveCombination | null {
  if (primitives.length === 1) {
    const type = getPrimitiveType(primitives[0]!);
    if (type === "line" || type === "circle" || type === "arc") {
      return type as PrimitiveCombination;
    }
    return null;
  }

  if (primitives.length === 2) {
    const type1 = getPrimitiveType(primitives[0]!);
    const type2 = getPrimitiveType(primitives[1]!);

    // Sort for consistent combinations
    const sorted = [type1, type2].sort();
    const combo = `${sorted[0]}-${sorted[1]}`;

    // Map to valid combinations
    const validCombos: Record<string, PrimitiveCombination> = {
      "point-point": "point-point",
      "line-line": "line-line",
      "circle-circle": "circle-circle",
      "arc-arc": "circle-circle", // arcs treated as circles for equal
      "arc-circle": "circle-circle",
      "circle-line": "line-circle",
      "line-point": "point-line",
      "circle-point": "point-circle",
      "arc-point": "point-circle",
    };

    return validCombos[combo] || null;
  }

  if (primitives.length === 3) {
    const types = primitives.map(getPrimitiveType);
    const points = types.filter((type) => type === "point").length;
    const lines = types.filter((type) => type === "line").length;
    if (points === 2 && lines === 1) return "point-point-line";
    if (points === 3) return "point-point-point";
    return null;
  }

  return null;
}

// Constraints that can be applied to each primitive individually when multiple are selected
const MULTI_APPLY_CONSTRAINTS: ConstraintType[] = [
  "horizontal",
  "vertical",
  "radius",
  "diameter",
];

// Helper to count primitives by type
function countPrimitiveTypes(primitives: SketchPrimitive[]): {
  points: number;
  lines: number;
  circles: number;
  arcs: number;
} {
  let points = 0,
    lines = 0,
    circles = 0,
    arcs = 0;
  for (const p of primitives) {
    const type = getPrimitiveType(p);
    if (type === "point") points++;
    else if (type === "line") lines++;
    else if (type === "circle") circles++;
    else if (type === "arc") arcs++;
  }
  return { points, lines, circles, arcs };
}

export function getAvailableConstraints(
  selectedIds: string[],
  primitives: SketchPrimitive[],
): ConstraintType[] {
  if (selectedIds.length === 0) {
    return [];
  }

  const selectedPrimitives = selectedIds
    .map((id) => primitives.find((p) => p.id === id))
    .filter((p): p is SketchPrimitive => p !== undefined);

  if (selectedPrimitives.length !== selectedIds.length) {
    return [];
  }

  const available: ConstraintType[] = [];
  const counts = countPrimitiveTypes(selectedPrimitives);

  // Standard case: exactly 1, 2 or 3 primitives selected
  if (selectedPrimitives.length <= 3) {
    const combination = getCombination(selectedPrimitives);
    if (combination) {
      for (const rule of CONSTRAINT_RULES) {
        if (rule.requiredCount === selectedPrimitives.length) {
          if (rule.validCombinations.includes(combination)) {
            available.push(rule.type);
          }
        }
      }
    }
  }

  // Multi-selection cases (more than 2 primitives)
  if (selectedPrimitives.length > 2) {
    // horizontal/vertical: available if all are lines
    if (counts.lines === selectedPrimitives.length) {
      available.push(
        "horizontal",
        "vertical",
        "parallel",
        "perpendicular",
        "equal",
      );
    }

    // radius/diameter: available if all are circles/arcs
    if (counts.circles + counts.arcs === selectedPrimitives.length) {
      available.push("radius", "diameter", "equal", "concentric");
    }
  }

  // Special case: pointOnLine - available if there's at least 1 point/circle and at least 1 line
  // This allows selecting a shape (multiple lines) + a circle and applying pointOnLine
  if (counts.lines >= 1 && (counts.points >= 1 || counts.circles >= 1)) {
    if (!available.includes("pointOnLine")) {
      available.push("pointOnLine");
    }
  }

  // Special case: pointOnCircle - available if there's at least 1 point and at least 1 circle/arc
  if ((counts.circles >= 1 || counts.arcs >= 1) && counts.points >= 1) {
    if (!available.includes("pointOnCircle")) {
      available.push("pointOnCircle");
    }
  }

  // Special case: tangent - available if there's at least 1 line and at least 1 circle
  if (counts.lines >= 1 && counts.circles >= 1) {
    if (!available.includes("tangent")) {
      available.push("tangent");
    }
  }

  return available;
}

export function validateConstraint(
  type: ConstraintType,
  selectedIds: string[],
  primitives: SketchPrimitive[],
): boolean {
  const available = getAvailableConstraints(selectedIds, primitives);
  return available.includes(type);
}

export function requiresValue(type: ConstraintType): boolean {
  const rule = CONSTRAINT_RULES.find((r) => r.type === type);
  return rule?.requiresValue ?? false;
}

export function getDefaultValue(
  type: ConstraintType,
  selectedIds: string[],
  primitives: SketchPrimitive[],
): number | undefined {
  if (!requiresValue(type) || !isDimensionalConstraintType(type)) {
    return undefined;
  }

  const selectedPrimitives = selectedIds
    .map((id) => primitives.find((p) => p.id === id))
    .filter((p): p is SketchPrimitive => p !== undefined);

  // Helper for distance/distanceX/distanceY: extracts the two endpoints if the
  // selection is a single line, or two points. Returns null when neither
  // configuration matches.
  const resolveTwoPoints = (): { p1: SketchPoint; p2: SketchPoint } | null => {
    const first = selectedPrimitives[0];
    if (selectedPrimitives.length === 1 && first && isSketchLine(first)) {
      const p1 = findSketchPoint(primitives, first.p1Id);
      const p2 = findSketchPoint(primitives, first.p2Id);
      if (p1 && p2) return { p1, p2 };
    }
    if (selectedPrimitives.length === 2) {
      const p1 = selectedPrimitives[0]!;
      const p2 = selectedPrimitives[1]!;
      if (isSketchPoint(p1) && isSketchPoint(p2)) {
        return { p1, p2 };
      }
    }
    return null;
  };

  const findCircleOrArc = (): SketchCircle | SketchArc | undefined =>
    selectedPrimitives.find(
      (p): p is SketchCircle | SketchArc => isSketchCircle(p) || isSketchArc(p),
    );

  switch (type) {
    case "radius": {
      return findCircleOrArc()?.radius ?? 1;
    }

    case "diameter": {
      const c = findCircleOrArc();
      return c ? c.radius * 2 : 2;
    }

    case "distance": {
      const pts = resolveTwoPoints();
      if (pts) {
        const dx = pts.p2.x - pts.p1.x;
        const dy = pts.p2.y - pts.p1.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
      return 1;
    }

    case "distanceX": {
      const pts = resolveTwoPoints();
      return pts ? Math.abs(pts.p2.x - pts.p1.x) : 1;
    }

    case "distanceY": {
      const pts = resolveTwoPoints();
      return pts ? Math.abs(pts.p2.y - pts.p1.y) : 1;
    }

    case "angle": {
      // Calculate current angle between two lines
      if (selectedPrimitives.length === 2) {
        const line1 = selectedPrimitives[0]!;
        const line2 = selectedPrimitives[1]!;
        if (isSketchLine(line1) && isSketchLine(line2)) {
          // Get endpoints for angle calculation
          const getLinePoints = (
            line: SketchLine,
          ): { p1: SketchPoint | undefined; p2: SketchPoint | undefined } => {
            const p1 = findSketchPoint(primitives, line.p1Id);
            const p2 = findSketchPoint(primitives, line.p2Id);
            return { p1, p2 };
          };

          const l1Points = getLinePoints(line1);
          const l2Points = getLinePoints(line2);

          if (l1Points.p1 && l1Points.p2 && l2Points.p1 && l2Points.p2) {
            const v1x = l1Points.p2.x - l1Points.p1.x;
            const v1y = l1Points.p2.y - l1Points.p1.y;
            const v2x = l2Points.p2.x - l2Points.p1.x;
            const v2y = l2Points.p2.y - l2Points.p1.y;

            const dot = v1x * v2x + v1y * v2y;
            const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
            const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

            if (mag1 > 0 && mag2 > 0) {
              const cosAngle = dot / (mag1 * mag2);
              const clampedCos = Math.max(-1, Math.min(1, cosAngle));
              const angleRad = Math.acos(clampedCos);
              // Return angle in degrees for user convenience
              return Math.round((angleRad * 180) / Math.PI);
            }
          }
        }
      }
      return 90;
    }

    default:
      // Compile-time exhaustiveness over DimensionalConstraintType.
      assertNever(type, "getDefaultValue");
  }
}

export function getConstraintLabel(type: ConstraintType): string {
  const labels: Record<ConstraintType, string> = {
    horizontal: "Horizontal",
    vertical: "Vertical",
    parallel: "Parallel",
    perpendicular: "Perpendicular",
    tangent: "Tangent",
    equal: "Equal",
    coincident: "Coincident",
    concentric: "Concentric",
    pointOnLine: "Point on Line",
    pointOnCircle: "Point on Circle",
    midpoint: "Midpoint",
    symmetric: "Symmetric",
    distance: "Distance",
    distanceX: "Distance X",
    distanceY: "Distance Y",
    angle: "Angle",
    radius: "Radius",
    diameter: "Diameter",
  };
  return labels[type] || type;
}

export function getConstraintIcon(type: ConstraintType): string {
  const icons: Record<ConstraintType, string> = {
    horizontal: "H",
    vertical: "V",
    parallel: "||",
    perpendicular: "⊥",
    tangent: "T",
    equal: "=",
    coincident: "⊙",
    concentric: "◎",
    pointOnLine: "•—",
    pointOnCircle: "•○",
    midpoint: "M",
    symmetric: "⇔",
    distance: "↔",
    distanceX: "↔X",
    distanceY: "↔Y",
    angle: "∠",
    radius: "R",
    diameter: "⌀",
  };
  return icons[type] || "?";
}

export function getSelectionDescription(
  selectedIds: string[],
  primitives: SketchPrimitive[],
): string {
  if (selectedIds.length === 0) {
    return "No selection";
  }

  const selectedPrimitives = selectedIds
    .map((id) => primitives.find((p) => p.id === id))
    .filter((p): p is SketchPrimitive => p !== undefined);

  if (selectedPrimitives.length === 1) {
    const p = selectedPrimitives[0]!;
    return `1 ${p.type}`;
  }

  if (selectedPrimitives.length === 2) {
    const types = selectedPrimitives.map((p) => p.type);
    if (types[0] === types[1]) {
      return `2 ${types[0]}s`;
    }
    return `${types[0]} + ${types[1]}`;
  }

  return `${selectedPrimitives.length} items`;
}
