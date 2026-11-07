import {
  getAvailableConstraints,
  validateConstraint,
  requiresValue,
  getDefaultValue,
  getConstraintLabel,
  getConstraintIcon,
  getSelectionDescription,
} from "../../src/scene-operations/constraint-validation";
import {
  SketchPrimitive,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  ConstraintType,
} from "../../src/types/sketch-types";

describe("constraint-validation", () => {
  // Helper functions to create primitives
  function createPoint(id: string, x: number = 0, y: number = 0): SketchPoint {
    return { id, type: "point", x, y };
  }

  function createLine(id: string, p1Id: string, p2Id: string): SketchLine {
    return { id, type: "line", p1Id, p2Id };
  }

  function createCircle(
    id: string,
    centerId: string,
    radius: number = 1,
  ): SketchCircle {
    return { id, type: "circle", centerId, radius };
  }

  function createArc(
    id: string,
    centerId: string,
    startId: string,
    endId: string,
    radius: number = 1,
  ): SketchArc {
    return { id, type: "arc", centerId, startId, endId, radius };
  }

  describe("getAvailableConstraints", () => {
    describe("Single Primitive Selection", () => {
      it("line -> [horizontal, vertical]", () => {
        const p1 = createPoint("p1");
        const p2 = createPoint("p2");
        const line = createLine("line1", "p1", "p2");
        const primitives: SketchPrimitive[] = [p1, p2, line];

        const constraints = getAvailableConstraints(["line1"], primitives);

        expect(constraints).toContain("horizontal");
        expect(constraints).toContain("vertical");
      });

      it("circle -> [radius, diameter]", () => {
        const center = createPoint("center");
        const circle = createCircle("circle1", "center", 5);
        const primitives: SketchPrimitive[] = [center, circle];

        const constraints = getAvailableConstraints(["circle1"], primitives);

        expect(constraints).toContain("radius");
        expect(constraints).toContain("diameter");
      });

      it("arc -> [radius, diameter]", () => {
        const center = createPoint("center");
        const start = createPoint("start", 5, 0);
        const end = createPoint("end", 0, 5);
        const arc = createArc("arc1", "center", "start", "end", 5);
        const primitives: SketchPrimitive[] = [center, start, end, arc];

        const constraints = getAvailableConstraints(["arc1"], primitives);

        expect(constraints).toContain("radius");
        expect(constraints).toContain("diameter");
      });

      it("single line -> includes distance", () => {
        const p1 = createPoint("p1");
        const p2 = createPoint("p2");
        const line = createLine("line1", "p1", "p2");
        const primitives: SketchPrimitive[] = [p1, p2, line];

        const constraints = getAvailableConstraints(["line1"], primitives);

        // distance has a single-line rule (requiredCount: 1, combination: "line")
        expect(constraints).toContain("distance");
      });

      it("point -> [] (no single-point constraints)", () => {
        const point = createPoint("p1");
        const primitives: SketchPrimitive[] = [point];

        const constraints = getAvailableConstraints(["p1"], primitives);

        expect(constraints).toHaveLength(0);
      });
    });

    describe("Two Primitive Selection", () => {
      it("point + point -> [coincident, distance]", () => {
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 1, 1);
        const primitives: SketchPrimitive[] = [p1, p2];

        const constraints = getAvailableConstraints(["p1", "p2"], primitives);

        expect(constraints).toContain("coincident");
        expect(constraints).toContain("distance");
      });

      it("line + line -> [parallel, perpendicular, equal, angle]", () => {
        const p1 = createPoint("p1");
        const p2 = createPoint("p2");
        const p3 = createPoint("p3");
        const p4 = createPoint("p4");
        const line1 = createLine("line1", "p1", "p2");
        const line2 = createLine("line2", "p3", "p4");
        const primitives: SketchPrimitive[] = [p1, p2, p3, p4, line1, line2];

        const constraints = getAvailableConstraints(
          ["line1", "line2"],
          primitives,
        );

        expect(constraints).toContain("parallel");
        expect(constraints).toContain("perpendicular");
        expect(constraints).toContain("equal");
        expect(constraints).toContain("angle");
      });

      it("circle + circle -> [equal, concentric]", () => {
        const c1 = createPoint("c1");
        const c2 = createPoint("c2");
        const circle1 = createCircle("circle1", "c1", 3);
        const circle2 = createCircle("circle2", "c2", 5);
        const primitives: SketchPrimitive[] = [c1, c2, circle1, circle2];

        const constraints = getAvailableConstraints(
          ["circle1", "circle2"],
          primitives,
        );

        expect(constraints).toContain("equal");
        expect(constraints).toContain("concentric");
      });

      it("line + circle -> [tangent]", () => {
        const p1 = createPoint("p1");
        const p2 = createPoint("p2");
        const center = createPoint("center");
        const line = createLine("line1", "p1", "p2");
        const circle = createCircle("circle1", "center", 5);
        const primitives: SketchPrimitive[] = [p1, p2, center, line, circle];

        const constraints = getAvailableConstraints(
          ["line1", "circle1"],
          primitives,
        );

        expect(constraints).toContain("tangent");
      });

      it("point + line -> [pointOnLine]", () => {
        const p1 = createPoint("p1");
        const p2 = createPoint("p2");
        const p3 = createPoint("p3");
        const line = createLine("line1", "p1", "p2");
        const primitives: SketchPrimitive[] = [p1, p2, p3, line];

        const constraints = getAvailableConstraints(
          ["p3", "line1"],
          primitives,
        );

        expect(constraints).toContain("pointOnLine");
      });

      it("point + circle -> [pointOnCircle]", () => {
        const point = createPoint("point", 5, 0);
        const center = createPoint("center");
        const circle = createCircle("circle1", "center", 5);
        const primitives: SketchPrimitive[] = [point, center, circle];

        const constraints = getAvailableConstraints(
          ["point", "circle1"],
          primitives,
        );

        expect(constraints).toContain("pointOnCircle");
      });

      it("point + point includes distanceX/distanceY", () => {
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 1, 1);
        const primitives: SketchPrimitive[] = [p1, p2];

        const constraints = getAvailableConstraints(["p1", "p2"], primitives);

        expect(constraints).toContain("distanceX");
        expect(constraints).toContain("distanceY");
      });
    });

    describe("Multi-Selection (3+)", () => {
      it("3 lines -> [horizontal, vertical, parallel, perpendicular, equal]", () => {
        const points: SketchPoint[] = [];
        for (let i = 1; i <= 6; i++) {
          points.push(createPoint(`p${i}`, i, i));
        }
        const line1 = createLine("line1", "p1", "p2");
        const line2 = createLine("line2", "p3", "p4");
        const line3 = createLine("line3", "p5", "p6");
        const primitives: SketchPrimitive[] = [...points, line1, line2, line3];

        const constraints = getAvailableConstraints(
          ["line1", "line2", "line3"],
          primitives,
        );

        expect(constraints).toContain("horizontal");
        expect(constraints).toContain("vertical");
        expect(constraints).toContain("parallel");
        expect(constraints).toContain("perpendicular");
        expect(constraints).toContain("equal");
      });

      it("3 circles -> [radius, diameter, equal, concentric]", () => {
        const centers = [
          createPoint("c1"),
          createPoint("c2"),
          createPoint("c3"),
        ];
        const circles = [
          createCircle("circle1", "c1", 3),
          createCircle("circle2", "c2", 4),
          createCircle("circle3", "c3", 5),
        ];
        const primitives: SketchPrimitive[] = [...centers, ...circles];

        const constraints = getAvailableConstraints(
          ["circle1", "circle2", "circle3"],
          primitives,
        );

        expect(constraints).toContain("radius");
        expect(constraints).toContain("diameter");
        expect(constraints).toContain("equal");
        expect(constraints).toContain("concentric");
      });

      it("mixed types: lines + circle -> includes tangent", () => {
        const p1 = createPoint("p1");
        const p2 = createPoint("p2");
        const p3 = createPoint("p3");
        const p4 = createPoint("p4");
        const center = createPoint("center");
        const line1 = createLine("line1", "p1", "p2");
        const line2 = createLine("line2", "p3", "p4");
        const circle = createCircle("circle1", "center", 5);
        const primitives: SketchPrimitive[] = [
          p1,
          p2,
          p3,
          p4,
          center,
          line1,
          line2,
          circle,
        ];

        const constraints = getAvailableConstraints(
          ["line1", "line2", "circle1"],
          primitives,
        );

        expect(constraints).toContain("tangent");
      });
    });

    describe("Edge Cases", () => {
      it("empty selection -> []", () => {
        const point = createPoint("p1");
        const primitives: SketchPrimitive[] = [point];

        const constraints = getAvailableConstraints([], primitives);

        expect(constraints).toHaveLength(0);
      });

      it("invalid primitive IDs -> []", () => {
        const point = createPoint("p1");
        const primitives: SketchPrimitive[] = [point];

        const constraints = getAvailableConstraints(
          ["nonexistent"],
          primitives,
        );

        expect(constraints).toHaveLength(0);
      });

      it("duplicate IDs in selection -> handles gracefully", () => {
        const p1 = createPoint("p1");
        const p2 = createPoint("p2");
        const primitives: SketchPrimitive[] = [p1, p2];

        // This is a weird case but shouldn't crash
        const constraints = getAvailableConstraints(["p1", "p1"], primitives);

        // Two points should give point-point constraints
        expect(constraints).toContain("coincident");
      });
    });

    describe("Special Cases", () => {
      it("pointOnLine with circle + lines (rectangle selection)", () => {
        const p1 = createPoint("p1");
        const p2 = createPoint("p2");
        const p3 = createPoint("p3");
        const p4 = createPoint("p4");
        const center = createPoint("center");
        const line1 = createLine("line1", "p1", "p2");
        const line2 = createLine("line2", "p2", "p3");
        const line3 = createLine("line3", "p3", "p4");
        const line4 = createLine("line4", "p4", "p1");
        const circle = createCircle("circle1", "center", 2);
        const primitives: SketchPrimitive[] = [
          p1,
          p2,
          p3,
          p4,
          center,
          line1,
          line2,
          line3,
          line4,
          circle,
        ];

        // Selecting a rectangle (4 lines) + a circle
        const constraints = getAvailableConstraints(
          ["line1", "line2", "line3", "line4", "circle1"],
          primitives,
        );

        // Should include pointOnLine since we have circles and lines
        expect(constraints).toContain("pointOnLine");
      });
    });
  });

  describe("validateConstraint", () => {
    it("should return true for valid constraint/selection combo", () => {
      const p1 = createPoint("p1");
      const p2 = createPoint("p2");
      const line = createLine("line1", "p1", "p2");
      const primitives: SketchPrimitive[] = [p1, p2, line];

      expect(validateConstraint("horizontal", ["line1"], primitives)).toBe(
        true,
      );
    });

    it("should return false for invalid combo", () => {
      const p1 = createPoint("p1");
      const primitives: SketchPrimitive[] = [p1];

      // Can't apply horizontal to a point
      expect(validateConstraint("horizontal", ["p1"], primitives)).toBe(false);
    });

    it("should validate primitive existence", () => {
      const p1 = createPoint("p1");
      const primitives: SketchPrimitive[] = [p1];

      expect(
        validateConstraint("horizontal", ["nonexistent"], primitives),
      ).toBe(false);
    });

    it("should handle edge cases (empty selection)", () => {
      const p1 = createPoint("p1");
      const primitives: SketchPrimitive[] = [p1];

      expect(validateConstraint("horizontal", [], primitives)).toBe(false);
    });
  });

  describe("requiresValue", () => {
    it("should return true for: radius, diameter, distance, distanceX, distanceY, angle", () => {
      expect(requiresValue("radius")).toBe(true);
      expect(requiresValue("diameter")).toBe(true);
      expect(requiresValue("distance")).toBe(true);
      expect(requiresValue("angle")).toBe(true);
    });

    it("distanceX and distanceY require a value", () => {
      expect(requiresValue("distanceX")).toBe(true);
      expect(requiresValue("distanceY")).toBe(true);
    });

    it("should return false for: horizontal, vertical, parallel, perpendicular, coincident, etc.", () => {
      expect(requiresValue("horizontal")).toBe(false);
      expect(requiresValue("vertical")).toBe(false);
      expect(requiresValue("parallel")).toBe(false);
      expect(requiresValue("perpendicular")).toBe(false);
      expect(requiresValue("coincident")).toBe(false);
      expect(requiresValue("tangent")).toBe(false);
      expect(requiresValue("equal")).toBe(false);
      expect(requiresValue("concentric")).toBe(false);
      expect(requiresValue("pointOnLine")).toBe(false);
      expect(requiresValue("pointOnCircle")).toBe(false);
    });
  });

  describe("getDefaultValue", () => {
    describe("radius", () => {
      it("should return current circle radius", () => {
        const center = createPoint("center");
        const circle = createCircle("circle1", "center", 7.5);
        const primitives: SketchPrimitive[] = [center, circle];

        const value = getDefaultValue("radius", ["circle1"], primitives);

        expect(value).toBe(7.5);
      });

      it("should return 1 if no circle found", () => {
        const point = createPoint("p1");
        const primitives: SketchPrimitive[] = [point];

        const value = getDefaultValue("radius", ["p1"], primitives);

        expect(value).toBe(1);
      });
    });

    describe("diameter", () => {
      it("should return current circle diameter (radius * 2)", () => {
        const center = createPoint("center");
        const circle = createCircle("circle1", "center", 5);
        const primitives: SketchPrimitive[] = [center, circle];

        const value = getDefaultValue("diameter", ["circle1"], primitives);

        expect(value).toBe(10); // 5 * 2
      });
    });

    describe("distance", () => {
      it("should return current distance between two points", () => {
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 3, 4);
        const primitives: SketchPrimitive[] = [p1, p2];

        const value = getDefaultValue("distance", ["p1", "p2"], primitives);

        expect(value).toBeCloseTo(5); // 3-4-5 triangle
      });

      it("should return 1 if not exactly two points", () => {
        const p1 = createPoint("p1", 0, 0);
        const primitives: SketchPrimitive[] = [p1];

        const value = getDefaultValue("distance", ["p1"], primitives);

        expect(value).toBe(1);
      });

      it("should return line length for single line selection", () => {
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 3, 4);
        const line = createLine("line1", "p1", "p2");
        const primitives: SketchPrimitive[] = [p1, p2, line];

        const value = getDefaultValue("distance", ["line1"], primitives);

        expect(value).toBeCloseTo(5); // 3-4-5 triangle
      });
    });

    describe("angle", () => {
      it("should return current angle between lines (in degrees)", () => {
        // Two perpendicular lines
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 1, 0); // Horizontal line
        const p3 = createPoint("p3", 0, 0);
        const p4 = createPoint("p4", 0, 1); // Vertical line
        const line1 = createLine("line1", "p1", "p2");
        const line2 = createLine("line2", "p3", "p4");
        const primitives: SketchPrimitive[] = [p1, p2, p3, p4, line1, line2];

        const value = getDefaultValue("angle", ["line1", "line2"], primitives);

        expect(value).toBe(90);
      });

      it("should return 90 if lines not found", () => {
        const p1 = createPoint("p1");
        const primitives: SketchPrimitive[] = [p1];

        const value = getDefaultValue(
          "angle",
          ["nonexistent1", "nonexistent2"],
          primitives,
        );

        expect(value).toBe(90);
      });
    });

    describe("distanceX / distanceY", () => {
      it("distanceX returns the horizontal separation", () => {
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 3, 4);
        const primitives: SketchPrimitive[] = [p1, p2];

        const value = getDefaultValue("distanceX", ["p1", "p2"], primitives);
        expect(value).toBe(3);
      });

      it("distanceY returns the vertical separation", () => {
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 3, 4);
        const primitives: SketchPrimitive[] = [p1, p2];

        const value = getDefaultValue("distanceY", ["p1", "p2"], primitives);
        expect(value).toBe(4);
      });
    });

    it("should return undefined for non-dimensional constraints", () => {
      const p1 = createPoint("p1");
      const p2 = createPoint("p2");
      const line = createLine("line1", "p1", "p2");
      const primitives: SketchPrimitive[] = [p1, p2, line];

      expect(
        getDefaultValue("horizontal", ["line1"], primitives),
      ).toBeUndefined();
      expect(
        getDefaultValue("vertical", ["line1"], primitives),
      ).toBeUndefined();
      expect(
        getDefaultValue("parallel", ["line1"], primitives),
      ).toBeUndefined();
    });
  });

  describe("getConstraintLabel", () => {
    it("should return human-readable labels for all constraint types", () => {
      expect(getConstraintLabel("horizontal")).toBe("Horizontal");
      expect(getConstraintLabel("vertical")).toBe("Vertical");
      expect(getConstraintLabel("parallel")).toBe("Parallel");
      expect(getConstraintLabel("perpendicular")).toBe("Perpendicular");
      expect(getConstraintLabel("tangent")).toBe("Tangent");
      expect(getConstraintLabel("equal")).toBe("Equal");
      expect(getConstraintLabel("coincident")).toBe("Coincident");
      expect(getConstraintLabel("concentric")).toBe("Concentric");
      expect(getConstraintLabel("pointOnLine")).toBe("Point on Line");
      expect(getConstraintLabel("pointOnCircle")).toBe("Point on Circle");
      expect(getConstraintLabel("distance")).toBe("Distance");
      expect(getConstraintLabel("distanceX")).toBe("Distance X");
      expect(getConstraintLabel("distanceY")).toBe("Distance Y");
      expect(getConstraintLabel("angle")).toBe("Angle");
      expect(getConstraintLabel("radius")).toBe("Radius");
      expect(getConstraintLabel("diameter")).toBe("Diameter");
    });
  });

  describe("getConstraintIcon", () => {
    it("should return icon/symbol for all constraint types", () => {
      expect(getConstraintIcon("horizontal")).toBe("H");
      expect(getConstraintIcon("vertical")).toBe("V");
      expect(getConstraintIcon("parallel")).toBe("||");
      expect(getConstraintIcon("perpendicular")).toBe("⊥");
      expect(getConstraintIcon("tangent")).toBe("T");
      expect(getConstraintIcon("equal")).toBe("=");
      expect(getConstraintIcon("coincident")).toBe("⊙");
      expect(getConstraintIcon("concentric")).toBe("◎");
      expect(getConstraintIcon("pointOnLine")).toBe("•—");
      expect(getConstraintIcon("pointOnCircle")).toBe("•○");
      expect(getConstraintIcon("distance")).toBe("↔");
      expect(getConstraintIcon("distanceX")).toBe("↔X");
      expect(getConstraintIcon("distanceY")).toBe("↔Y");
      expect(getConstraintIcon("angle")).toBe("∠");
      expect(getConstraintIcon("radius")).toBe("R");
      expect(getConstraintIcon("diameter")).toBe("⌀");
    });

    it("should return ? for unknown constraint type", () => {
      // Force an unknown type
      expect(getConstraintIcon("unknown" as ConstraintType)).toBe("?");
    });
  });

  describe("getSelectionDescription", () => {
    it("should return 'No selection' for empty selection", () => {
      const primitives: SketchPrimitive[] = [];

      const description = getSelectionDescription([], primitives);

      expect(description).toBe("No selection");
    });

    it("should return '1 <type>' for single primitive", () => {
      const p1 = createPoint("p1");
      const line = createLine("line1", "p1", "p2");
      const circle = createCircle("circle1", "center", 5);
      const primitives: SketchPrimitive[] = [p1, line, circle];

      expect(getSelectionDescription(["p1"], primitives)).toBe("1 point");
      expect(getSelectionDescription(["line1"], primitives)).toBe("1 line");
      expect(getSelectionDescription(["circle1"], primitives)).toBe("1 circle");
    });

    it("should return '2 <type>s' for two same-type primitives", () => {
      const p1 = createPoint("p1");
      const p2 = createPoint("p2");
      const primitives: SketchPrimitive[] = [p1, p2];

      expect(getSelectionDescription(["p1", "p2"], primitives)).toBe(
        "2 points",
      );
    });

    it("should return '<type1> + <type2>' for two different types", () => {
      const p1 = createPoint("p1");
      const line = createLine("line1", "p1", "p2");
      const primitives: SketchPrimitive[] = [p1, line];

      expect(getSelectionDescription(["p1", "line1"], primitives)).toBe(
        "point + line",
      );
    });

    it("should return '<n> items' for 3+ primitives", () => {
      const p1 = createPoint("p1");
      const p2 = createPoint("p2");
      const p3 = createPoint("p3");
      const primitives: SketchPrimitive[] = [p1, p2, p3];

      expect(getSelectionDescription(["p1", "p2", "p3"], primitives)).toBe(
        "3 items",
      );
    });
  });
});
