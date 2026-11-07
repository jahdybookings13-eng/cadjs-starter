/**
 * SketchSolverService Tests
 *
 * Tests for the geometric constraint solver using planegcs.
 * These tests verify constraint solving, DOF calculation, and sketch status.
 */

import { SketchSolverService } from "../../src/services/SketchSolverService";
import {
  Sketch,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  SketchConstraint,
  createSketchPlane,
} from "../../src/types/sketch-types";

describe("SketchSolverService", () => {
  let solver: SketchSolverService;

  // Helper to create a basic sketch
  function createEmptySketch(): Sketch {
    return {
      id: "test_sketch",
      plane: createSketchPlane("XY"),
      primitives: [],
      constraints: [],
      dof: 0,
      status: "underconstrained",
    };
  }

  // Helper to create a point
  function createPoint(
    id: string,
    x: number,
    y: number,
    fixed = false,
  ): SketchPoint {
    return { id, type: "point", x, y, fixed };
  }

  // Helper to create a line
  function createLine(id: string, p1Id: string, p2Id: string): SketchLine {
    return { id, type: "line", p1Id, p2Id };
  }

  // Helper to create a circle
  function createCircle(
    id: string,
    centerId: string,
    radius: number,
  ): SketchCircle {
    return { id, type: "circle", centerId, radius };
  }

  // Helper to create an arc
  function createArc(
    id: string,
    centerId: string,
    startId: string,
    endId: string,
    radius: number,
  ): SketchArc {
    return { id, type: "arc", centerId, startId, endId, radius };
  }

  // Helper to create a constraint
  function createConstraint(
    id: string,
    type: SketchConstraint["type"],
    primitiveIds: string[],
    value?: number,
  ): SketchConstraint {
    return { id, type, primitiveIds, value };
  }

  beforeAll(async () => {
    solver = SketchSolverService.getInstance();
    // Initialize the GCS wrapper
    await solver.getGCS();
  }, 60000);

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = SketchSolverService.getInstance();
      const instance2 = SketchSolverService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("solve() - Geometric Constraints", () => {
    describe("horizontal constraint", () => {
      it("should make line horizontal", async () => {
        const sketch = createEmptySketch();
        // Create a diagonal line
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 2, 1); // Not horizontal
        const line = createLine("line1", "p1", "p2");
        const constraint = createConstraint("c1", "horizontal", ["line1"]);

        sketch.primitives = [p1, p2, line];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        // Find the updated points
        const updatedP1 = result.sketch.primitives.find(
          (p) => p.id === "p1",
        ) as SketchPoint;
        const updatedP2 = result.sketch.primitives.find(
          (p) => p.id === "p2",
        ) as SketchPoint;

        // Y coordinates should be equal (horizontal line)
        expect(updatedP1.y).toBeCloseTo(updatedP2.y, 5);
      });
    });

    describe("vertical constraint", () => {
      it("should make line vertical", async () => {
        const sketch = createEmptySketch();
        // Create a diagonal line
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 1, 2); // Not vertical
        const line = createLine("line1", "p1", "p2");
        const constraint = createConstraint("c1", "vertical", ["line1"]);

        sketch.primitives = [p1, p2, line];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP1 = result.sketch.primitives.find(
          (p) => p.id === "p1",
        ) as SketchPoint;
        const updatedP2 = result.sketch.primitives.find(
          (p) => p.id === "p2",
        ) as SketchPoint;

        // X coordinates should be equal (vertical line)
        expect(updatedP1.x).toBeCloseTo(updatedP2.x, 5);
      });
    });

    describe("coincident constraint", () => {
      it("should merge two points", async () => {
        const sketch = createEmptySketch();
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 1, 1);
        const constraint = createConstraint("c1", "coincident", ["p1", "p2"]);

        sketch.primitives = [p1, p2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP1 = result.sketch.primitives.find(
          (p) => p.id === "p1",
        ) as SketchPoint;
        const updatedP2 = result.sketch.primitives.find(
          (p) => p.id === "p2",
        ) as SketchPoint;

        // Points should be at the same location
        expect(updatedP1.x).toBeCloseTo(updatedP2.x, 5);
        expect(updatedP1.y).toBeCloseTo(updatedP2.y, 5);
      });
    });

    describe("parallel constraint", () => {
      it("should make lines parallel", async () => {
        const sketch = createEmptySketch();
        // Line 1: horizontal
        const p1 = createPoint("p1", 0, 0, true);
        const p2 = createPoint("p2", 2, 0, true);
        // Line 2: diagonal (should become horizontal)
        const p3 = createPoint("p3", 0, 2);
        const p4 = createPoint("p4", 2, 3);

        const line1 = createLine("line1", "p1", "p2");
        const line2 = createLine("line2", "p3", "p4");
        const constraint = createConstraint("c1", "parallel", [
          "line1",
          "line2",
        ]);

        sketch.primitives = [p1, p2, p3, p4, line1, line2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP3 = result.sketch.primitives.find(
          (p) => p.id === "p3",
        ) as SketchPoint;
        const updatedP4 = result.sketch.primitives.find(
          (p) => p.id === "p4",
        ) as SketchPoint;

        // Line2 should now be horizontal (parallel to line1)
        expect(updatedP3.y).toBeCloseTo(updatedP4.y, 5);
      });
    });

    describe("perpendicular constraint", () => {
      it("should make lines perpendicular", async () => {
        const sketch = createEmptySketch();
        // Line 1: horizontal (fixed)
        const p1 = createPoint("p1", 0, 0, true);
        const p2 = createPoint("p2", 2, 0, true);
        // Line 2: horizontal (should become vertical)
        const p3 = createPoint("p3", 1, 1);
        const p4 = createPoint("p4", 3, 1);

        const line1 = createLine("line1", "p1", "p2");
        const line2 = createLine("line2", "p3", "p4");
        const constraint = createConstraint("c1", "perpendicular", [
          "line1",
          "line2",
        ]);

        sketch.primitives = [p1, p2, p3, p4, line1, line2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP3 = result.sketch.primitives.find(
          (p) => p.id === "p3",
        ) as SketchPoint;
        const updatedP4 = result.sketch.primitives.find(
          (p) => p.id === "p4",
        ) as SketchPoint;

        // Line2 should now be vertical (perpendicular to horizontal line1)
        expect(updatedP3.x).toBeCloseTo(updatedP4.x, 5);
      });
    });

    describe("equal constraint", () => {
      it("should make lines equal length", async () => {
        const sketch = createEmptySketch();
        // Line 1: length 2 (fixed)
        const p1 = createPoint("p1", 0, 0, true);
        const p2 = createPoint("p2", 2, 0, true);
        // Line 2: length 1 (should become length 2)
        const p3 = createPoint("p3", 0, 2, true);
        const p4 = createPoint("p4", 1, 2);

        const line1 = createLine("line1", "p1", "p2");
        const line2 = createLine("line2", "p3", "p4");
        const constraint = createConstraint("c1", "equal", ["line1", "line2"]);

        sketch.primitives = [p1, p2, p3, p4, line1, line2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP3 = result.sketch.primitives.find(
          (p) => p.id === "p3",
        ) as SketchPoint;
        const updatedP4 = result.sketch.primitives.find(
          (p) => p.id === "p4",
        ) as SketchPoint;

        // Calculate lengths
        const length2 = Math.sqrt(
          Math.pow(updatedP4.x - updatedP3.x, 2) +
            Math.pow(updatedP4.y - updatedP3.y, 2),
        );

        expect(length2).toBeCloseTo(2, 5);
      });

      it("should make circles equal radius", async () => {
        const sketch = createEmptySketch();
        const c1 = createPoint("c1", 0, 0, true);
        const c2 = createPoint("c2", 5, 0, true);
        const circle1 = createCircle("circle1", "c1", 2);
        const circle2 = createCircle("circle2", "c2", 1);
        const constraint = createConstraint("eq1", "equal", [
          "circle1",
          "circle2",
        ]);

        sketch.primitives = [c1, c2, circle1, circle2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedCircle1 = result.sketch.primitives.find(
          (p) => p.id === "circle1",
        ) as SketchCircle;
        const updatedCircle2 = result.sketch.primitives.find(
          (p) => p.id === "circle2",
        ) as SketchCircle;

        expect(updatedCircle1.radius).toBeCloseTo(updatedCircle2.radius, 5);
      });
    });

    describe("concentric constraint", () => {
      it("should align circle centers", async () => {
        const sketch = createEmptySketch();
        const c1 = createPoint("c1", 0, 0, true);
        const c2 = createPoint("c2", 1, 1);
        const circle1 = createCircle("circle1", "c1", 2);
        const circle2 = createCircle("circle2", "c2", 3);
        const constraint = createConstraint("con1", "concentric", [
          "circle1",
          "circle2",
        ]);

        sketch.primitives = [c1, c2, circle1, circle2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedC1 = result.sketch.primitives.find(
          (p) => p.id === "c1",
        ) as SketchPoint;
        const updatedC2 = result.sketch.primitives.find(
          (p) => p.id === "c2",
        ) as SketchPoint;

        // Centers should coincide
        expect(updatedC1.x).toBeCloseTo(updatedC2.x, 5);
        expect(updatedC1.y).toBeCloseTo(updatedC2.y, 5);
      });
    });

    describe("pointOnLine constraint", () => {
      it("should place point on line", async () => {
        const sketch = createEmptySketch();
        // Horizontal line at y=0
        const p1 = createPoint("p1", 0, 0, true);
        const p2 = createPoint("p2", 4, 0, true);
        // Point not on line
        const p3 = createPoint("p3", 2, 2);
        const line = createLine("line1", "p1", "p2");
        const constraint = createConstraint("c1", "pointOnLine", [
          "p3",
          "line1",
        ]);

        sketch.primitives = [p1, p2, p3, line];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP3 = result.sketch.primitives.find(
          (p) => p.id === "p3",
        ) as SketchPoint;

        // Point should now be on the line (y = 0)
        expect(updatedP3.y).toBeCloseTo(0, 5);
      });
    });

    describe("pointOnCircle constraint", () => {
      it("should place point on circle circumference", async () => {
        const sketch = createEmptySketch();
        const center = createPoint("center", 0, 0, true);
        const circle = createCircle("circle1", "center", 5);
        // Point not on circle
        const p = createPoint("p1", 10, 0);
        const constraint = createConstraint("c1", "pointOnCircle", [
          "p1",
          "circle1",
        ]);

        sketch.primitives = [center, p, circle];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP = result.sketch.primitives.find(
          (p) => p.id === "p1",
        ) as SketchPoint;
        const updatedCircle = result.sketch.primitives.find(
          (p) => p.id === "circle1",
        ) as SketchCircle;

        // Distance from center should equal radius (radius is a free variable
        // when not pinned, so planegcs may settle on a different value than the
        // initial 5 -- the invariant under test is "on the circle").
        const distance = Math.sqrt(
          Math.pow(updatedP.x, 2) + Math.pow(updatedP.y, 2),
        );
        expect(distance).toBeCloseTo(updatedCircle.radius, 5);
      });
    });

    describe("tangent constraint", () => {
      it("should make line tangent to circle", async () => {
        const sketch = createEmptySketch();
        const p1 = createPoint("p1", -5, 0, true);
        const p2 = createPoint("p2", 5, 0, true);
        const center = createPoint("center", 0, 3, true);
        const circle = createCircle("circle1", "center", 2);
        const line = createLine("line1", "p1", "p2");
        const constraint = createConstraint("c1", "tangent", [
          "line1",
          "circle1",
        ]);

        sketch.primitives = [p1, p2, center, circle, line];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);
      });
    });

    describe("distanceX constraint", () => {
      it("should enforce horizontal distance between two points", async () => {
        const sketch = createEmptySketch();
        const p1 = createPoint("p1", 0, 0, true);
        const p2 = createPoint("p2", 1, 3);
        const constraint = createConstraint("c1", "distanceX", ["p1", "p2"], 5);

        sketch.primitives = [p1, p2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP2 = result.sketch.primitives.find(
          (p) => p.id === "p2",
        ) as SketchPoint;

        // X distance from p1(0,0) to p2 should be 5
        expect(Math.abs(updatedP2.x - 0)).toBeCloseTo(5, 4);
      });
    });

    describe("distanceY constraint", () => {
      it("should enforce vertical distance between two points", async () => {
        const sketch = createEmptySketch();
        const p1 = createPoint("p1", 0, 0, true);
        const p2 = createPoint("p2", 3, 1);
        const constraint = createConstraint("c1", "distanceY", ["p1", "p2"], 7);

        sketch.primitives = [p1, p2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP2 = result.sketch.primitives.find(
          (p) => p.id === "p2",
        ) as SketchPoint;

        // Y distance from p1(0,0) to p2 should be 7
        expect(Math.abs(updatedP2.y - 0)).toBeCloseTo(7, 4);
      });

      it("distanceX with value=0 effectively aligns points vertically", async () => {
        const sketch = createEmptySketch();
        const p1 = createPoint("p1", 0, 0, true);
        const p2 = createPoint("p2", 3, 5);
        const constraint = createConstraint("c1", "distanceX", ["p1", "p2"], 0);

        sketch.primitives = [p1, p2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP2 = result.sketch.primitives.find(
          (p) => p.id === "p2",
        ) as SketchPoint;

        // X should be same as p1 (distance = 0)
        expect(updatedP2.x).toBeCloseTo(0, 4);
      });
    });
  });

  describe("solve() - Dimensional Constraints", () => {
    describe("distance constraint", () => {
      it("should set exact distance between points", async () => {
        const sketch = createEmptySketch();
        const p1 = createPoint("p1", 0, 0, true);
        const p2 = createPoint("p2", 1, 0);
        const constraint = createConstraint("c1", "distance", ["p1", "p2"], 5);

        sketch.primitives = [p1, p2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP2 = result.sketch.primitives.find(
          (p) => p.id === "p2",
        ) as SketchPoint;

        const distance = Math.sqrt(
          Math.pow(updatedP2.x, 2) + Math.pow(updatedP2.y, 2),
        );
        expect(distance).toBeCloseTo(5, 5);
      });
    });

    describe("radius constraint", () => {
      it("should set circle radius", async () => {
        const sketch = createEmptySketch();
        const center = createPoint("center", 0, 0, true);
        const circle = createCircle("circle1", "center", 2);
        const constraint = createConstraint("c1", "radius", ["circle1"], 7);

        sketch.primitives = [center, circle];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedCircle = result.sketch.primitives.find(
          (p) => p.id === "circle1",
        ) as SketchCircle;

        expect(updatedCircle.radius).toBeCloseTo(7, 5);
      });
    });

    describe("diameter constraint", () => {
      it("should set circle diameter", async () => {
        const sketch = createEmptySketch();
        const center = createPoint("center", 0, 0, true);
        const circle = createCircle("circle1", "center", 2);
        // Diameter 10 = radius 5
        const constraint = createConstraint("c1", "diameter", ["circle1"], 10);

        sketch.primitives = [center, circle];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedCircle = result.sketch.primitives.find(
          (p) => p.id === "circle1",
        ) as SketchCircle;

        expect(updatedCircle.radius).toBeCloseTo(5, 5);
      });
    });

    describe("angle constraint", () => {
      it("should set angle between lines", async () => {
        const sketch = createEmptySketch();
        // Line 1: horizontal (fixed)
        const p1 = createPoint("p1", 0, 0, true);
        const p2 = createPoint("p2", 2, 0, true);
        // Line 2: starts at same point
        const p3 = createPoint("p3", 0, 0, true);
        const p4 = createPoint("p4", 1, 0);

        const line1 = createLine("line1", "p1", "p2");
        const line2 = createLine("line2", "p3", "p4");
        // 45 degree angle (in radians for planegcs: Math.PI/4)
        const constraint = createConstraint(
          "c1",
          "angle",
          ["line1", "line2"],
          Math.PI / 4,
        );

        sketch.primitives = [p1, p2, p3, p4, line1, line2];
        sketch.constraints = [constraint];

        const result = await solver.solve(sketch);

        expect(result.success).toBe(true);

        const updatedP4 = result.sketch.primitives.find(
          (p) => p.id === "p4",
        ) as SketchPoint;

        // Calculate angle
        const angle = Math.atan2(updatedP4.y - 0, updatedP4.x - 0);
        expect(Math.abs(angle)).toBeCloseTo(Math.PI / 4, 4);
      });
    });
  });

  describe("DOF Calculation", () => {
    it("point adds 2 DOF", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 0, 0);
      sketch.primitives = [p1];

      const dof = await solver.getDOF(sketch);

      expect(dof).toBe(2);
    });

    it("line (2 points) adds 4 DOF", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 0, 0);
      const p2 = createPoint("p2", 1, 1);
      const line = createLine("line1", "p1", "p2");
      sketch.primitives = [p1, p2, line];

      const dof = await solver.getDOF(sketch);

      expect(dof).toBe(4); // 2 points * 2 DOF each
    });

    it("circle adds 3 DOF (center x, y + radius)", async () => {
      const sketch = createEmptySketch();
      const center = createPoint("center", 0, 0);
      const circle = createCircle("circle1", "center", 5);
      sketch.primitives = [center, circle];

      const dof = await solver.getDOF(sketch);

      expect(dof).toBe(3); // center (2) + radius (1)
    });

    it("horizontal constraint removes 1 DOF", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 0, 0);
      const p2 = createPoint("p2", 1, 1);
      const line = createLine("line1", "p1", "p2");
      sketch.primitives = [p1, p2, line];

      const dofBefore = await solver.getDOF(sketch);

      sketch.constraints = [createConstraint("c1", "horizontal", ["line1"])];

      const dofAfter = await solver.getDOF(sketch);

      expect(dofAfter).toBe(dofBefore - 1);
    });

    it("coincident constraint removes 2 DOF", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 0, 0);
      const p2 = createPoint("p2", 1, 1);
      sketch.primitives = [p1, p2];

      const dofBefore = await solver.getDOF(sketch);

      sketch.constraints = [createConstraint("c1", "coincident", ["p1", "p2"])];

      const dofAfter = await solver.getDOF(sketch);

      expect(dofAfter).toBe(dofBefore - 2);
    });

    it("fully constrained sketch has 0 DOF", async () => {
      const sketch = createEmptySketch();
      // Fixed point
      const p1 = createPoint("p1", 0, 0, true);
      sketch.primitives = [p1];

      const dof = await solver.getDOF(sketch);

      expect(dof).toBe(0);
    });
  });

  describe("Constraint Status", () => {
    it("under-constrained: DOF > 0", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 0, 0);
      sketch.primitives = [p1];

      const result = await solver.solve(sketch);

      expect(result.status).toBe("underconstrained");
      expect(result.dof).toBeGreaterThan(0);
    });

    it("fully-constrained: DOF = 0", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 0, 0, true);
      sketch.primitives = [p1];

      const result = await solver.solve(sketch);

      expect(result.status).toBe("fully_constrained");
      expect(result.dof).toBe(0);
    });
  });

  describe("Fixed Points", () => {
    it("should respect fixed flag during solve", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 5, 5, true); // Fixed at (5, 5)
      const p2 = createPoint("p2", 0, 0);
      const constraint = createConstraint("c1", "coincident", ["p1", "p2"]);

      sketch.primitives = [p1, p2];
      sketch.constraints = [constraint];

      const result = await solver.solve(sketch);

      expect(result.success).toBe(true);

      const updatedP1 = result.sketch.primitives.find(
        (p) => p.id === "p1",
      ) as SketchPoint;
      const updatedP2 = result.sketch.primitives.find(
        (p) => p.id === "p2",
      ) as SketchPoint;

      // Fixed point should not move
      expect(updatedP1.x).toBeCloseTo(5, 5);
      expect(updatedP1.y).toBeCloseTo(5, 5);

      // Non-fixed point should move to match
      expect(updatedP2.x).toBeCloseTo(5, 5);
      expect(updatedP2.y).toBeCloseTo(5, 5);
    });

    it("should move non-fixed points to satisfy constraints", async () => {
      const sketch = createEmptySketch();
      // Fixed horizontal line
      const p1 = createPoint("p1", 0, 0, true);
      const p2 = createPoint("p2", 4, 0, true);
      // Non-fixed point
      const p3 = createPoint("p3", 2, 5);
      const line = createLine("line1", "p1", "p2");
      const constraint = createConstraint("c1", "pointOnLine", ["p3", "line1"]);

      sketch.primitives = [p1, p2, p3, line];
      sketch.constraints = [constraint];

      const result = await solver.solve(sketch);

      expect(result.success).toBe(true);

      const updatedP3 = result.sketch.primitives.find(
        (p) => p.id === "p3",
      ) as SketchPoint;

      // Non-fixed point moved to line
      expect(updatedP3.y).toBeCloseTo(0, 5);
      // X should be preserved (approximately)
      expect(updatedP3.x).toBeCloseTo(2, 1);
    });

    it("should handle all points fixed (no movement)", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 0, 0, true);
      const p2 = createPoint("p2", 1, 1, true);
      sketch.primitives = [p1, p2];

      const result = await solver.solve(sketch);

      expect(result.success).toBe(true);

      const updatedP1 = result.sketch.primitives.find(
        (p) => p.id === "p1",
      ) as SketchPoint;
      const updatedP2 = result.sketch.primitives.find(
        (p) => p.id === "p2",
      ) as SketchPoint;

      // Both should remain at original positions
      expect(updatedP1.x).toBeCloseTo(0, 5);
      expect(updatedP1.y).toBeCloseTo(0, 5);
      expect(updatedP2.x).toBeCloseTo(1, 5);
      expect(updatedP2.y).toBeCloseTo(1, 5);
    });
  });

  describe("Edge Cases", () => {
    it("empty sketch -> no-op", async () => {
      const sketch = createEmptySketch();

      const result = await solver.solve(sketch);

      expect(result.success).toBe(true);
      expect(result.sketch.primitives).toHaveLength(0);
      expect(result.dof).toBe(0);
    });

    it("zero-length line with horizontal constraint", async () => {
      const sketch = createEmptySketch();
      // Both points at the same location (zero-length line)
      const p1 = createPoint("p1", 5, 5);
      const p2 = createPoint("p2", 5, 5);
      const line = createLine("line1", "p1", "p2");
      const constraint = createConstraint("c1", "horizontal", ["line1"]);

      sketch.primitives = [p1, p2, line];
      sketch.constraints = [constraint];

      const result = await solver.solve(sketch);

      // Should handle gracefully without crashing
      expect(result.success).toBe(true);
    });

    it("no constraints -> preserve positions", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 3, 4);
      sketch.primitives = [p1];

      const result = await solver.solve(sketch);

      expect(result.success).toBe(true);

      const updatedP1 = result.sketch.primitives.find(
        (p) => p.id === "p1",
      ) as SketchPoint;

      expect(updatedP1.x).toBeCloseTo(3, 5);
      expect(updatedP1.y).toBeCloseTo(4, 5);
    });
  });

  describe("Arc Support", () => {
    it("should handle arc primitives", async () => {
      const sketch = createEmptySketch();
      const center = createPoint("center", 0, 0, true);
      const start = createPoint("start", 5, 0);
      const end = createPoint("end", 0, 5);
      const arc = createArc("arc1", "center", "start", "end", 5);

      sketch.primitives = [center, start, end, arc];

      const result = await solver.solve(sketch);

      expect(result.success).toBe(true);
    });
  });

  describe("Over-constrained Detection", () => {
    /**
     * MOCK LIMITATION: The planegcs mock always returns false for
     * has_gcs_conflicting_constraints() and has_gcs_redundant_constraints().
     * This means the overconstrained status path in SketchSolverService.solve()
     * cannot be triggered through normal constraint solving.
     *
     * The test below verifies the detection logic by temporarily patching
     * the mock's get_gcs_conflicting_constraints to return constraint IDs.
     */
    it("should report overconstrained when conflicting constraints exist", async () => {
      const gcs = await solver.getGCS();

      // Patch the mock to simulate conflicting constraints
      const originalGetConflicting = gcs.get_gcs_conflicting_constraints;
      const originalHasConflicting = gcs.has_gcs_conflicting_constraints;
      gcs.get_gcs_conflicting_constraints = () => ["c1"];
      gcs.has_gcs_conflicting_constraints = () => true;

      try {
        const sketch = createEmptySketch();
        // Two contradictory constraints on same line: horizontal + vertical
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 2, 1);
        const line = createLine("line1", "p1", "p2");
        const c1 = createConstraint("c1", "horizontal", ["line1"]);
        const c2 = createConstraint("c2", "vertical", ["line1"]);

        sketch.primitives = [p1, p2, line];
        sketch.constraints = [c1, c2];

        const result = await solver.solve(sketch);

        expect(result.status).toBe("overconstrained");
        expect(result.conflictingConstraintIds).toEqual(["c1"]);
      } finally {
        // Restore original mock behavior
        gcs.get_gcs_conflicting_constraints = originalGetConflicting;
        gcs.has_gcs_conflicting_constraints = originalHasConflicting;
      }
    });

    it("should not report overconstrained for valid constraints (mock baseline)", async () => {
      const sketch = createEmptySketch();
      const p1 = createPoint("p1", 0, 0);
      const p2 = createPoint("p2", 2, 1);
      const line = createLine("line1", "p1", "p2");
      const constraint = createConstraint("c1", "horizontal", ["line1"]);

      sketch.primitives = [p1, p2, line];
      sketch.constraints = [constraint];

      const result = await solver.solve(sketch);

      expect(result.status).not.toBe("overconstrained");
      expect(result.conflictingConstraintIds).toBeUndefined();
    });
  });
});
