import * as THREE from "three";
import {
  createSketch,
  addPrimitiveToSketch,
  addConstraintToSketch,
  removePrimitiveFromSketch,
  removeConstraintFromSketch,
  updatePrimitiveInSketch,
  updateConstraintInSketch,
  getPointById,
  getAllPoints,
  getConstraintsForPrimitive,
  splitLineAtParams,
  trimLineAtSegment,
  convertCircleToArc,
  removeLineSegment,
  cleanupOrphanedPoints,
} from "../../src/scene-operations/sketch-operations";
import {
  createSketchPlane,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  SketchConstraint,
  DimensionalConstraint,
  Sketch,
} from "../../src/types/sketch-types";

// Strip auto-generated origin construction geometry so tests can assume
// a pristine "empty" sketch for user-primitive assertions.
const stripOrigin = (sketch: Sketch): Sketch => ({
  ...sketch,
  primitives: sketch.primitives.filter(
    (p) => !(p as { origin?: boolean }).origin,
  ),
  dof: 0,
  status: "underconstrained",
});

describe("sketch-operations", () => {
  describe("createSketch", () => {
    it("should create sketch with XY plane", () => {
      const plane = createSketchPlane("XY");
      const result = createSketch(plane, 0);

      expect(result.sketch.id).toBe("sketch_0");
      expect(result.sketch.plane.type).toBe("XY");
      expect(result.sketch.plane.normal.z).toBe(1);
      expect(result.nextId).toBe(1);
    });

    it("should create sketch with XZ plane", () => {
      const plane = createSketchPlane("XZ");
      const result = createSketch(plane, 5);

      expect(result.sketch.id).toBe("sketch_5");
      expect(result.sketch.plane.type).toBe("XZ");
      expect(result.sketch.plane.normal.y).toBe(1);
      expect(result.nextId).toBe(6);
    });

    it("should create sketch with YZ plane", () => {
      const plane = createSketchPlane("YZ");
      const result = createSketch(plane, 10);

      expect(result.sketch.id).toBe("sketch_10");
      expect(result.sketch.plane.type).toBe("YZ");
      expect(result.sketch.plane.normal.x).toBe(1);
      expect(result.nextId).toBe(11);
    });

    it("should generate unique sketch ID", () => {
      const plane = createSketchPlane("XY");
      const result1 = createSketch(plane, 0);
      const result2 = createSketch(plane, result1.nextId);

      expect(result1.sketch.id).not.toBe(result2.sketch.id);
    });

    it("should initialize with only origin construction geometry (no user primitives)", () => {
      const plane = createSketchPlane("XY");
      const result = createSketch(plane, 0);

      // Auto-populated: origin point + 2 axis endpoints + 2 axis lines
      expect(result.sketch.primitives).toHaveLength(5);
      expect(
        result.sketch.primitives.every(
          (p) => (p as { origin?: boolean }).origin === true,
        ),
      ).toBe(true);
    });

    it("should initialize empty constraints array", () => {
      const plane = createSketchPlane("XY");
      const result = createSketch(plane, 0);

      expect(result.sketch.constraints).toEqual([]);
    });

    it("should set status to fully_constrained (origin geometry is fully fixed)", () => {
      const plane = createSketchPlane("XY");
      const result = createSketch(plane, 0);

      expect(result.sketch.status).toBe("fully_constrained");
    });

    it("should initialize DOF to 0", () => {
      const plane = createSketchPlane("XY");
      const result = createSketch(plane, 0);

      expect(result.sketch.dof).toBe(0);
    });
  });

  describe("addPrimitiveToSketch", () => {
    let sketch: Sketch;

    beforeEach(() => {
      const plane = createSketchPlane("XY");
      sketch = stripOrigin(createSketch(plane, 0).sketch);
    });

    describe("Points", () => {
      it("should add point primitive", () => {
        const point: SketchPoint = { id: "", type: "point", x: 1, y: 2 };
        const result = addPrimitiveToSketch(sketch, point, 1);

        expect(result.sketch.primitives).toHaveLength(1);
        expect(result.sketch.primitives[0].type).toBe("point");
      });

      it("should generate unique primitive ID", () => {
        const point: SketchPoint = { id: "", type: "point", x: 1, y: 2 };
        const result = addPrimitiveToSketch(sketch, point, 5);

        expect(result.sketch.primitives[0].id).toBe("prim_5");
        expect(result.nextId).toBe(6);
      });

      it("should preserve existing primitives", () => {
        const point1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
        const point2: SketchPoint = { id: "", type: "point", x: 1, y: 1 };

        const result1 = addPrimitiveToSketch(sketch, point1, 1);
        const result2 = addPrimitiveToSketch(
          result1.sketch,
          point2,
          result1.nextId,
        );

        expect(result2.sketch.primitives).toHaveLength(2);
        expect(result2.sketch.primitives[0].id).toBe("p1");
      });

      it("should use provided ID if given", () => {
        const point: SketchPoint = {
          id: "custom_id",
          type: "point",
          x: 1,
          y: 2,
        };
        const result = addPrimitiveToSketch(sketch, point, 5);

        expect(result.sketch.primitives[0].id).toBe("custom_id");
        expect(result.nextId).toBe(5); // ID not incremented when provided
      });

      it("should increase DOF by 2 for each point", () => {
        const point: SketchPoint = { id: "", type: "point", x: 1, y: 2 };
        const result = addPrimitiveToSketch(sketch, point, 1);

        expect(result.sketch.dof).toBe(2);
      });
    });

    describe("Lines", () => {
      it("should add line with valid point references", () => {
        // First add two points
        const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
        const p2: SketchPoint = { id: "p2", type: "point", x: 1, y: 1 };
        let result = addPrimitiveToSketch(sketch, p1, 1);
        result = addPrimitiveToSketch(result.sketch, p2, result.nextId);

        // Then add line
        const line: SketchLine = {
          id: "",
          type: "line",
          p1Id: "p1",
          p2Id: "p2",
        };
        result = addPrimitiveToSketch(result.sketch, line, result.nextId);

        expect(result.sketch.primitives).toHaveLength(3);
        const addedLine = result.sketch.primitives[2] as SketchLine;
        expect(addedLine.type).toBe("line");
        expect(addedLine.p1Id).toBe("p1");
        expect(addedLine.p2Id).toBe("p2");
      });

      it("should add line even with invalid p1Id (no validation in function)", () => {
        // The function doesn't validate references - it just adds the primitive
        const line: SketchLine = {
          id: "",
          type: "line",
          p1Id: "invalid",
          p2Id: "p2",
        };
        const result = addPrimitiveToSketch(sketch, line, 1);

        expect(result.sketch.primitives).toHaveLength(1);
      });

      it("should not increase DOF for lines (only points increase DOF)", () => {
        const line: SketchLine = {
          id: "",
          type: "line",
          p1Id: "p1",
          p2Id: "p2",
        };
        const result = addPrimitiveToSketch(sketch, line, 1);

        expect(result.sketch.dof).toBe(0);
      });
    });

    describe("Circles", () => {
      it("should add circle with valid center reference", () => {
        const center: SketchPoint = { id: "center", type: "point", x: 0, y: 0 };
        let result = addPrimitiveToSketch(sketch, center, 1);

        const circle: SketchCircle = {
          id: "",
          type: "circle",
          centerId: "center",
          radius: 5,
        };
        result = addPrimitiveToSketch(result.sketch, circle, result.nextId);

        expect(result.sketch.primitives).toHaveLength(2);
        const addedCircle = result.sketch.primitives[1] as SketchCircle;
        expect(addedCircle.type).toBe("circle");
        expect(addedCircle.centerId).toBe("center");
      });

      it("should add circle with specified radius", () => {
        const circle: SketchCircle = {
          id: "",
          type: "circle",
          centerId: "c",
          radius: 10,
        };
        const result = addPrimitiveToSketch(sketch, circle, 1);

        const addedCircle = result.sketch.primitives[0] as SketchCircle;
        expect(addedCircle.radius).toBe(10);
      });
    });

    describe("Arcs", () => {
      it("should add arc with valid point references", () => {
        const center: SketchPoint = { id: "c", type: "point", x: 0, y: 0 };
        const start: SketchPoint = { id: "s", type: "point", x: 5, y: 0 };
        const end: SketchPoint = { id: "e", type: "point", x: 0, y: 5 };

        let result = addPrimitiveToSketch(sketch, center, 1);
        result = addPrimitiveToSketch(result.sketch, start, result.nextId);
        result = addPrimitiveToSketch(result.sketch, end, result.nextId);

        const arc: SketchArc = {
          id: "",
          type: "arc",
          centerId: "c",
          startId: "s",
          endId: "e",
          radius: 5,
        };
        result = addPrimitiveToSketch(result.sketch, arc, result.nextId);

        expect(result.sketch.primitives).toHaveLength(4);
        const addedArc = result.sketch.primitives[3] as SketchArc;
        expect(addedArc.type).toBe("arc");
        expect(addedArc.centerId).toBe("c");
        expect(addedArc.startId).toBe("s");
        expect(addedArc.endId).toBe("e");
        expect(addedArc.radius).toBe(5);
      });
    });

    describe("General", () => {
      it("should return updated sketch state", () => {
        const point: SketchPoint = { id: "", type: "point", x: 1, y: 2 };
        const result = addPrimitiveToSketch(sketch, point, 1);

        expect(result.sketch).not.toBe(sketch); // Immutable update
        expect(result.sketch.primitives).not.toBe(sketch.primitives);
      });
    });
  });

  describe("addConstraintToSketch", () => {
    let sketch: Sketch;

    beforeEach(() => {
      const plane = createSketchPlane("XY");
      sketch = stripOrigin(createSketch(plane, 0).sketch);

      // Add some primitives for testing
      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 1, y: 0 };
      let result = addPrimitiveToSketch(sketch, p1, 1);
      result = addPrimitiveToSketch(result.sketch, p2, result.nextId);

      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
      };
      result = addPrimitiveToSketch(result.sketch, line, result.nextId);
      sketch = result.sketch;
    });

    it("should add geometric constraint (horizontal)", () => {
      const constraint: SketchConstraint = {
        id: "",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const result = addConstraintToSketch(sketch, constraint, 10);

      expect(result.sketch.constraints).toHaveLength(1);
      expect(result.sketch.constraints[0].type).toBe("horizontal");
    });

    it("should add geometric constraint (vertical)", () => {
      const constraint: SketchConstraint = {
        id: "",
        type: "vertical",
        primitiveIds: ["line1"],
      };
      const result = addConstraintToSketch(sketch, constraint, 10);

      expect(result.sketch.constraints).toHaveLength(1);
      expect(result.sketch.constraints[0].type).toBe("vertical");
    });

    it("should add dimensional constraint with value (distance)", () => {
      const constraint: SketchConstraint = {
        id: "",
        type: "distance",
        primitiveIds: ["p1", "p2"],
        value: 5,
      };
      const result = addConstraintToSketch(sketch, constraint, 10);

      expect(result.sketch.constraints).toHaveLength(1);
      expect(result.sketch.constraints[0]!.type).toBe("distance");
      expect(
        (result.sketch.constraints[0] as DimensionalConstraint).value,
      ).toBe(5);
    });

    it("should generate unique constraint ID", () => {
      const constraint: SketchConstraint = {
        id: "",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const result = addConstraintToSketch(sketch, constraint, 10);

      expect(result.sketch.constraints[0].id).toBe("const_10");
      expect(result.nextId).toBe(11);
    });

    it("should use provided ID if given", () => {
      const constraint: SketchConstraint = {
        id: "my_constraint",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const result = addConstraintToSketch(sketch, constraint, 10);

      expect(result.sketch.constraints[0].id).toBe("my_constraint");
      expect(result.nextId).toBe(10); // Not incremented
    });

    it("should warn but not reject constraint with invalid primitive IDs", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation();

      const constraint: SketchConstraint = {
        id: "",
        type: "horizontal",
        primitiveIds: ["nonexistent"],
      };
      const result = addConstraintToSketch(sketch, constraint, 10);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("non-existent primitive"),
      );
      expect(result.sketch.constraints).toHaveLength(1); // Still added

      consoleSpy.mockRestore();
    });

    it("should update sketch status after constraint", () => {
      const constraint: SketchConstraint = {
        id: "",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const result = addConstraintToSketch(sketch, constraint, 10);

      expect(result.sketch.status).toBe("underconstrained");
    });

    it("should decrease DOF after adding constraint", () => {
      // Set initial DOF
      sketch.dof = 4;
      const constraint: SketchConstraint = {
        id: "",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const result = addConstraintToSketch(sketch, constraint, 10);

      expect(result.sketch.dof).toBe(3); // Decreased by 1
    });

    it("should not allow DOF to go below 0", () => {
      sketch.dof = 0;
      const constraint: SketchConstraint = {
        id: "",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const result = addConstraintToSketch(sketch, constraint, 10);

      expect(result.sketch.dof).toBe(0);
    });
  });

  describe("removePrimitiveFromSketch", () => {
    let sketch: Sketch;

    beforeEach(() => {
      const plane = createSketchPlane("XY");
      sketch = stripOrigin(createSketch(plane, 0).sketch);

      // Create a sketch with points, a line, and a constraint
      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 1, y: 0 };
      const p3: SketchPoint = { id: "p3", type: "point", x: 2, y: 0 };
      let result = addPrimitiveToSketch(sketch, p1, 1);
      result = addPrimitiveToSketch(result.sketch, p2, result.nextId);
      result = addPrimitiveToSketch(result.sketch, p3, result.nextId);

      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
      };
      result = addPrimitiveToSketch(result.sketch, line, result.nextId);

      const constraint: SketchConstraint = {
        id: "c1",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const constResult = addConstraintToSketch(
        result.sketch,
        constraint,
        result.nextId,
      );
      sketch = constResult.sketch;
    });

    it("should remove primitive by ID", () => {
      const result = removePrimitiveFromSketch(sketch, "p3");

      expect(result.sketch.primitives).toHaveLength(3); // Was 4, now 3
      expect(
        result.sketch.primitives.find((p) => p.id === "p3"),
      ).toBeUndefined();
    });

    it("should remove dependent constraints (lines referencing removed point)", () => {
      // Removing p1 should also remove line1 (which uses p1) and constraint c1 (which uses line1)
      const result = removePrimitiveFromSketch(sketch, "p1");

      expect(
        result.sketch.primitives.find((p) => p.id === "p1"),
      ).toBeUndefined();
      expect(
        result.sketch.primitives.find((p) => p.id === "line1"),
      ).toBeUndefined();
      expect(result.sketch.constraints).toHaveLength(0); // c1 removed because line1 removed
    });

    it("should handle non-existent primitive ID", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation();

      const result = removePrimitiveFromSketch(sketch, "nonexistent");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );
      expect(result.sketch).toBe(sketch); // Unchanged

      consoleSpy.mockRestore();
    });

    it("should cascade removal for connected primitives", () => {
      // Add a circle that depends on p1
      const circle: SketchCircle = {
        id: "circle1",
        type: "circle",
        centerId: "p1",
        radius: 5,
      };
      let result = addPrimitiveToSketch(sketch, circle, 100);
      sketch = result.sketch;

      // Removing p1 should also remove the circle
      const removeResult = removePrimitiveFromSketch(sketch, "p1");

      expect(
        removeResult.sketch.primitives.find((p) => p.id === "circle1"),
      ).toBeUndefined();
    });

    it("should update sketch status after removal", () => {
      const result = removePrimitiveFromSketch(sketch, "p3");

      expect(result.sketch.status).toBe("underconstrained");
    });

    it("should cascade removal for arc depending on removed point (centerId)", () => {
      const center: SketchPoint = { id: "ac", type: "point", x: 0, y: 0 };
      const start: SketchPoint = { id: "as", type: "point", x: 5, y: 0 };
      const end_: SketchPoint = { id: "ae", type: "point", x: 0, y: 5 };
      const arcPrim: SketchArc = {
        id: "arc1",
        type: "arc",
        centerId: "ac",
        startId: "as",
        endId: "ae",
        radius: 5,
      };

      let result = addPrimitiveToSketch(sketch, center, 100);
      result = addPrimitiveToSketch(result.sketch, start, result.nextId);
      result = addPrimitiveToSketch(result.sketch, end_, result.nextId);
      result = addPrimitiveToSketch(result.sketch, arcPrim, result.nextId);

      // Removing center should cascade-remove the arc
      const removeResult = removePrimitiveFromSketch(result.sketch, "ac");
      expect(
        removeResult.sketch.primitives.find((p) => p.id === "arc1"),
      ).toBeUndefined();
    });

    it("should cascade removal for arc depending on removed point (startId)", () => {
      const center: SketchPoint = { id: "ac", type: "point", x: 0, y: 0 };
      const start: SketchPoint = { id: "as", type: "point", x: 5, y: 0 };
      const end_: SketchPoint = { id: "ae", type: "point", x: 0, y: 5 };
      const arcPrim: SketchArc = {
        id: "arc1",
        type: "arc",
        centerId: "ac",
        startId: "as",
        endId: "ae",
        radius: 5,
      };

      let result = addPrimitiveToSketch(sketch, center, 100);
      result = addPrimitiveToSketch(result.sketch, start, result.nextId);
      result = addPrimitiveToSketch(result.sketch, end_, result.nextId);
      result = addPrimitiveToSketch(result.sketch, arcPrim, result.nextId);

      const removeResult = removePrimitiveFromSketch(result.sketch, "as");
      expect(
        removeResult.sketch.primitives.find((p) => p.id === "arc1"),
      ).toBeUndefined();
    });
  });

  describe("removeConstraintFromSketch", () => {
    let sketch: Sketch;

    beforeEach(() => {
      const plane = createSketchPlane("XY");
      sketch = stripOrigin(createSketch(plane, 0).sketch);

      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 1, y: 0 };
      let result = addPrimitiveToSketch(sketch, p1, 1);
      result = addPrimitiveToSketch(result.sketch, p2, result.nextId);

      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
      };
      result = addPrimitiveToSketch(result.sketch, line, result.nextId);

      const constraint: SketchConstraint = {
        id: "c1",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const constResult = addConstraintToSketch(
        result.sketch,
        constraint,
        result.nextId,
      );
      sketch = constResult.sketch;
      sketch.dof = 2; // Set initial DOF
    });

    it("should remove constraint by ID", () => {
      const result = removeConstraintFromSketch(sketch, "c1");

      expect(result.sketch.constraints).toHaveLength(0);
    });

    it("should increase DOF after removal", () => {
      const result = removeConstraintFromSketch(sketch, "c1");

      expect(result.sketch.dof).toBe(3); // Was 2, now 3
    });

    it("should handle non-existent constraint ID", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation();

      const result = removeConstraintFromSketch(sketch, "nonexistent");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );
      expect(result.sketch).toBe(sketch); // Unchanged

      consoleSpy.mockRestore();
    });

    it("should not affect primitives when removing constraint", () => {
      const primitiveCount = sketch.primitives.length;
      const result = removeConstraintFromSketch(sketch, "c1");

      expect(result.sketch.primitives).toHaveLength(primitiveCount);
    });
  });

  describe("updatePrimitiveInSketch", () => {
    let sketch: Sketch;

    beforeEach(() => {
      const plane = createSketchPlane("XY");
      sketch = stripOrigin(createSketch(plane, 0).sketch);

      const point: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const result = addPrimitiveToSketch(sketch, point, 1);
      sketch = result.sketch;
    });

    it("should update primitive position", () => {
      const updated = updatePrimitiveInSketch(sketch, "p1", { x: 10, y: 20 });

      const point = updated.primitives[0] as SketchPoint;
      expect(point.x).toBe(10);
      expect(point.y).toBe(20);
    });

    it("should not modify other primitives", () => {
      const p2: SketchPoint = { id: "p2", type: "point", x: 5, y: 5 };
      let result = addPrimitiveToSketch(sketch, p2, 2);
      sketch = result.sketch;

      const updated = updatePrimitiveInSketch(sketch, "p1", { x: 10, y: 20 });

      const point2 = updated.primitives[1] as SketchPoint;
      expect(point2.x).toBe(5);
      expect(point2.y).toBe(5);
    });

    it("should return immutable updated sketch", () => {
      const updated = updatePrimitiveInSketch(sketch, "p1", { x: 10 });

      expect(updated).not.toBe(sketch);
      expect(updated.primitives).not.toBe(sketch.primitives);
    });
  });

  describe("updateConstraintInSketch", () => {
    let sketch: Sketch;

    beforeEach(() => {
      const plane = createSketchPlane("XY");
      sketch = stripOrigin(createSketch(plane, 0).sketch);

      const constraint: SketchConstraint = {
        id: "c1",
        type: "distance",
        primitiveIds: ["p1", "p2"],
        value: 5,
      };
      const result = addConstraintToSketch(sketch, constraint, 1);
      sketch = result.sketch;
    });

    it("should update constraint value", () => {
      const updated = updateConstraintInSketch(sketch, "c1", { value: 10 });

      expect((updated.constraints[0] as DimensionalConstraint).value).toBe(10);
    });

    it("should not modify other constraints", () => {
      const c2: SketchConstraint = {
        id: "c2",
        type: "distance",
        primitiveIds: ["p2", "p3"],
        value: 3,
      };
      const result = addConstraintToSketch(sketch, c2, 2);
      sketch = result.sketch;

      const updated = updateConstraintInSketch(sketch, "c1", { value: 10 });

      expect((updated.constraints[1] as DimensionalConstraint).value).toBe(3);
    });
  });

  describe("getPointById", () => {
    let sketch: Sketch;

    beforeEach(() => {
      const plane = createSketchPlane("XY");
      sketch = stripOrigin(createSketch(plane, 0).sketch);

      const p1: SketchPoint = { id: "p1", type: "point", x: 1, y: 2 };
      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
      };
      let result = addPrimitiveToSketch(sketch, p1, 1);
      result = addPrimitiveToSketch(result.sketch, line, result.nextId);
      sketch = result.sketch;
    });

    it("should return point by ID", () => {
      const point = getPointById(sketch, "p1");

      expect(point).toBeDefined();
      expect(point?.x).toBe(1);
      expect(point?.y).toBe(2);
    });

    it("should return undefined for non-existent ID", () => {
      const point = getPointById(sketch, "nonexistent");

      expect(point).toBeUndefined();
    });

    it("should return undefined for non-point primitive", () => {
      const point = getPointById(sketch, "line1");

      expect(point).toBeUndefined();
    });
  });

  describe("getAllPoints", () => {
    let sketch: Sketch;

    beforeEach(() => {
      const plane = createSketchPlane("XY");
      sketch = stripOrigin(createSketch(plane, 0).sketch);
    });

    it("should return all points", () => {
      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 1, y: 1 };
      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
      };

      let result = addPrimitiveToSketch(sketch, p1, 1);
      result = addPrimitiveToSketch(result.sketch, p2, result.nextId);
      result = addPrimitiveToSketch(result.sketch, line, result.nextId);
      sketch = result.sketch;

      const points = getAllPoints(sketch);

      expect(points).toHaveLength(2);
      expect(points.every((p) => p.type === "point")).toBe(true);
    });

    it("should return empty array for sketch with no points", () => {
      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
      };
      const result = addPrimitiveToSketch(sketch, line, 1);
      sketch = result.sketch;

      const points = getAllPoints(sketch);

      expect(points).toHaveLength(0);
    });
  });

  describe("getConstraintsForPrimitive", () => {
    let sketch: Sketch;

    beforeEach(() => {
      const plane = createSketchPlane("XY");
      sketch = stripOrigin(createSketch(plane, 0).sketch);

      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 1, y: 0 };
      let result = addPrimitiveToSketch(sketch, p1, 1);
      result = addPrimitiveToSketch(result.sketch, p2, result.nextId);

      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
      };
      result = addPrimitiveToSketch(result.sketch, line, result.nextId);

      const c1: SketchConstraint = {
        id: "c1",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const c2: SketchConstraint = {
        id: "c2",
        type: "distance",
        primitiveIds: ["p1", "p2"],
        value: 5,
      };
      let constResult = addConstraintToSketch(result.sketch, c1, result.nextId);
      constResult = addConstraintToSketch(
        constResult.sketch,
        c2,
        constResult.nextId,
      );
      sketch = constResult.sketch;
    });

    it("should return all constraints for a primitive", () => {
      const constraints = getConstraintsForPrimitive(sketch, "p1");

      expect(constraints).toHaveLength(1); // Only c2 references p1
      expect(constraints[0].id).toBe("c2");
    });

    it("should return empty array for primitive with no constraints", () => {
      const p3: SketchPoint = { id: "p3", type: "point", x: 5, y: 5 };
      const result = addPrimitiveToSketch(sketch, p3, 100);
      sketch = result.sketch;

      const constraints = getConstraintsForPrimitive(sketch, "p3");

      expect(constraints).toHaveLength(0);
    });

    it("should return multiple constraints if primitive is referenced by multiple", () => {
      // Add another constraint referencing line1
      const c3: SketchConstraint = {
        id: "c3",
        type: "vertical",
        primitiveIds: ["line1"],
      };
      const result = addConstraintToSketch(sketch, c3, 100);
      sketch = result.sketch;

      const constraints = getConstraintsForPrimitive(sketch, "line1");

      expect(constraints).toHaveLength(2); // c1 and c3
    });
  });

  // ── Helper for trim/split tests ──

  function makeSketchWithLine(): {
    sketch: Sketch;
    p1Id: string;
    p2Id: string;
    lineId: string;
    nextId: number;
  } {
    const plane = createSketchPlane("XY");
    let sketch = stripOrigin(createSketch(plane, 0).sketch);
    const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
    const p2: SketchPoint = { id: "p2", type: "point", x: 10, y: 0 };
    let result = addPrimitiveToSketch(sketch, p1, 1);
    result = addPrimitiveToSketch(result.sketch, p2, result.nextId);
    const line: SketchLine = {
      id: "line1",
      type: "line",
      p1Id: "p1",
      p2Id: "p2",
    };
    result = addPrimitiveToSketch(result.sketch, line, result.nextId);
    return {
      sketch: result.sketch,
      p1Id: "p1",
      p2Id: "p2",
      lineId: "line1",
      nextId: result.nextId,
    };
  }

  // ── splitLineAtParams ──

  describe("splitLineAtParams", () => {
    it("should split at t=0.5 into 2 segments and 1 new point", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = splitLineAtParams(sketch, lineId, [0.5], nextId);

      expect(result.newPointIds).toHaveLength(1);
      expect(result.newLineIds).toHaveLength(2);
    });

    it("should place new point at interpolated position (5,0) for t=0.5", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = splitLineAtParams(sketch, lineId, [0.5], nextId);

      const newPt = result.sketch.primitives.find(
        (p) => p.id === result.newPointIds[0],
      ) as SketchPoint;
      expect(newPt.x).toBeCloseTo(5, 10);
      expect(newPt.y).toBeCloseTo(0, 10);
    });

    it("should split with 2 params into 3 segments and 2 new points", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = splitLineAtParams(sketch, lineId, [0.25, 0.75], nextId);

      expect(result.newPointIds).toHaveLength(2);
      expect(result.newLineIds).toHaveLength(3);
    });

    it("should compute correct interpolated coordinates for multiple params", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = splitLineAtParams(sketch, lineId, [0.25, 0.75], nextId);

      const pt1 = result.sketch.primitives.find(
        (p) => p.id === result.newPointIds[0],
      ) as SketchPoint;
      const pt2 = result.sketch.primitives.find(
        (p) => p.id === result.newPointIds[1],
      ) as SketchPoint;

      expect(pt1.x).toBeCloseTo(2.5, 10);
      expect(pt1.y).toBeCloseTo(0, 10);
      expect(pt2.x).toBeCloseTo(7.5, 10);
      expect(pt2.y).toBeCloseTo(0, 10);
    });

    it("should preserve the construction flag on new line segments", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 10, y: 0 };
      let r = addPrimitiveToSketch(sketch, p1, 1);
      r = addPrimitiveToSketch(r.sketch, p2, r.nextId);
      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
        construction: true,
      };
      r = addPrimitiveToSketch(r.sketch, line, r.nextId);

      const result = splitLineAtParams(r.sketch, "line1", [0.5], r.nextId);

      for (const lid of result.newLineIds) {
        const seg = result.sketch.primitives.find(
          (p) => p.id === lid,
        ) as SketchLine;
        expect(seg.construction).toBe(true);
      }
    });

    it("should filter out params near 0 (< 1e-4) and return unchanged", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = splitLineAtParams(sketch, lineId, [0.00001], nextId);

      expect(result.newPointIds).toHaveLength(0);
      expect(result.newLineIds).toHaveLength(0);
      expect(result.sketch).toBe(sketch);
    });

    it("should filter out params near 1 (> 1-1e-4) and return unchanged", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = splitLineAtParams(sketch, lineId, [0.99999], nextId);

      expect(result.newPointIds).toHaveLength(0);
      expect(result.newLineIds).toHaveLength(0);
      expect(result.sketch).toBe(sketch);
    });

    it("should deduplicate params", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = splitLineAtParams(sketch, lineId, [0.5, 0.5, 0.5], nextId);

      expect(result.newPointIds).toHaveLength(1);
      expect(result.newLineIds).toHaveLength(2);
    });

    it("should return unchanged sketch when line not found", () => {
      const { sketch, nextId } = makeSketchWithLine();
      const result = splitLineAtParams(sketch, "nonexistent", [0.5], nextId);

      expect(result.sketch).toBe(sketch);
      expect(result.newPointIds).toHaveLength(0);
      expect(result.newLineIds).toHaveLength(0);
    });

    it("should return unchanged sketch when endpoint points not found", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      // Add line without its points
      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "missing1",
        p2Id: "missing2",
      };
      const r = addPrimitiveToSketch(sketch, line, 1);

      const result = splitLineAtParams(r.sketch, "line1", [0.5], r.nextId);

      expect(result.newPointIds).toHaveLength(0);
      expect(result.newLineIds).toHaveLength(0);
    });

    it("should transfer horizontal constraint to first new segment", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const cResult = addConstraintToSketch(
        sketch,
        { id: "ch", type: "horizontal", primitiveIds: ["line1"] },
        nextId,
      );
      const result = splitLineAtParams(
        cResult.sketch,
        lineId,
        [0.5],
        cResult.nextId,
      );

      const hConstraint = result.sketch.constraints.find((c) => c.id === "ch");
      expect(hConstraint).toBeDefined();
      expect(hConstraint!.primitiveIds).toContain(result.newLineIds[0]);
      expect(hConstraint!.primitiveIds).not.toContain("line1");
    });

    it("should transfer vertical constraint to first new segment", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const cResult = addConstraintToSketch(
        sketch,
        { id: "cv", type: "vertical", primitiveIds: ["line1"] },
        nextId,
      );
      const result = splitLineAtParams(
        cResult.sketch,
        lineId,
        [0.5],
        cResult.nextId,
      );

      const vConstraint = result.sketch.constraints.find((c) => c.id === "cv");
      expect(vConstraint).toBeDefined();
      expect(vConstraint!.primitiveIds).toContain(result.newLineIds[0]);
    });

    it("should leave coincident constraints unchanged (they reference point IDs)", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const cResult = addConstraintToSketch(
        sketch,
        { id: "cc", type: "coincident", primitiveIds: ["p1", "p2"] },
        nextId,
      );
      const result = splitLineAtParams(
        cResult.sketch,
        lineId,
        [0.5],
        cResult.nextId,
      );

      const cConstraint = result.sketch.constraints.find((c) => c.id === "cc");
      expect(cConstraint).toBeDefined();
      expect(cConstraint!.primitiveIds).toEqual(["p1", "p2"]);
    });

    it("should drop distance constraints", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const cResult = addConstraintToSketch(
        sketch,
        { id: "cd", type: "distance", primitiveIds: ["line1"], value: 10 },
        nextId,
      );
      const result = splitLineAtParams(
        cResult.sketch,
        lineId,
        [0.5],
        cResult.nextId,
      );

      const dConstraint = result.sketch.constraints.find((c) => c.id === "cd");
      expect(dConstraint).toBeUndefined();
    });

    it("should correctly increment nextId", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      // 1 param → 1 new point (nextId+1) + 2 new lines (nextId+2, nextId+3)
      const result = splitLineAtParams(sketch, lineId, [0.5], nextId);

      expect(result.nextId).toBe(nextId + 3); // 1 point + 2 lines
    });

    it("should pass through coincident constraint that references the line ID unchanged", () => {
      const { sketch: baseSketch, lineId, nextId } = makeSketchWithLine();
      // Add a coincident constraint referencing the line
      const constraint: SketchConstraint = {
        id: "cc1",
        type: "coincident",
        primitiveIds: ["line1", "p1"],
      };
      const withConstraint = addConstraintToSketch(
        baseSketch,
        constraint,
        nextId,
      );

      const result = splitLineAtParams(
        withConstraint.sketch,
        lineId,
        [0.5],
        withConstraint.nextId,
      );
      // Coincident constraint should still be present and unchanged
      const cc = result.sketch.constraints.find((c) => c.id === "cc1");
      expect(cc).toBeDefined();
      expect(cc!.primitiveIds).toContain("line1"); // NOT remapped
    });

    it("should pass through unrecognized constraint types unchanged", () => {
      const { sketch: baseSketch, lineId, nextId } = makeSketchWithLine();
      // Add a tangent constraint referencing the line
      const constraint: SketchConstraint = {
        id: "t1",
        type: "tangent",
        primitiveIds: ["line1"],
      };
      const withConstraint = addConstraintToSketch(
        baseSketch,
        constraint,
        nextId,
      );

      const result = splitLineAtParams(
        withConstraint.sketch,
        lineId,
        [0.5],
        withConstraint.nextId,
      );
      // Tangent constraint is not geometric/coincident/dimensional, so it falls through as-is
      const tc = result.sketch.constraints.find((c) => c.id === "t1");
      expect(tc).toBeDefined();
      expect(tc!.primitiveIds).toContain("line1"); // unchanged
    });
  });

  // ── trimLineAtSegment ──

  describe("trimLineAtSegment", () => {
    it("should trim start segment: new shorter line from intersection to p2", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = trimLineAtSegment(sketch, lineId, 0, 0.5, [0.5], nextId);

      // Original line1 removed
      expect(
        result.sketch.primitives.find((p) => p.id === "line1"),
      ).toBeUndefined();

      // New line exists going to p2
      const newLines = result.sketch.primitives.filter(
        (p) => p.type === "line" && p.id !== "line1",
      ) as SketchLine[];
      expect(newLines).toHaveLength(1);
      expect(newLines[0].p2Id).toBe("p2");
    });

    it("should trim end segment: new shorter line from p1 to intersection", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = trimLineAtSegment(sketch, lineId, 0.5, 1, [0.5], nextId);

      expect(
        result.sketch.primitives.find((p) => p.id === "line1"),
      ).toBeUndefined();

      const newLines = result.sketch.primitives.filter(
        (p) => p.type === "line" && p.id !== "line1",
      ) as SketchLine[];
      expect(newLines).toHaveLength(1);
      expect(newLines[0].p1Id).toBe("p1");
    });

    it("should trim middle segment: splits then removes middle", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      // Two intersections at 0.25 and 0.75, remove middle segment [0.25, 0.75]
      const result = trimLineAtSegment(
        sketch,
        lineId,
        0.25,
        0.75,
        [0.25, 0.75],
        nextId,
      );

      // Original line removed, should have 2 surviving segments (first and last)
      expect(
        result.sketch.primitives.find((p) => p.id === "line1"),
      ).toBeUndefined();
      const newLines = result.sketch.primitives.filter(
        (p) => p.type === "line",
      ) as SketchLine[];
      expect(newLines).toHaveLength(2);
    });

    it("should remove entire line when startParam≈0 and endParam≈1", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = trimLineAtSegment(sketch, lineId, 0, 1, [], nextId);

      expect(
        result.sketch.primitives.find((p) => p.id === "line1"),
      ).toBeUndefined();
    });

    it("should place new point at correct position for start-trim", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = trimLineAtSegment(sketch, lineId, 0, 0.3, [0.3], nextId);

      // New point at t=0.3 on line from (0,0) to (10,0) → (3, 0)
      const newPoints = result.sketch.primitives.filter(
        (p) => p.type === "point" && p.id !== "p1" && p.id !== "p2",
      ) as SketchPoint[];
      expect(newPoints).toHaveLength(1);
      expect(newPoints[0].x).toBeCloseTo(3, 10);
      expect(newPoints[0].y).toBeCloseTo(0, 10);
    });

    it("should place new point at correct position for end-trim", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const result = trimLineAtSegment(sketch, lineId, 0.7, 1, [0.7], nextId);

      // New point at t=0.7 on line from (0,0) to (10,0) → (7, 0)
      const newPoints = result.sketch.primitives.filter(
        (p) => p.type === "point" && p.id !== "p1" && p.id !== "p2",
      ) as SketchPoint[];
      expect(newPoints).toHaveLength(1);
      expect(newPoints[0].x).toBeCloseTo(7, 10);
      expect(newPoints[0].y).toBeCloseTo(0, 10);
    });

    it("should transfer geometric constraints to the new line (start-trim)", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const cResult = addConstraintToSketch(
        sketch,
        { id: "ch", type: "horizontal", primitiveIds: ["line1"] },
        nextId,
      );
      const result = trimLineAtSegment(
        cResult.sketch,
        lineId,
        0,
        0.5,
        [0.5],
        cResult.nextId,
      );

      const hConstraint = result.sketch.constraints.find((c) => c.id === "ch");
      expect(hConstraint).toBeDefined();
      expect(hConstraint!.primitiveIds).not.toContain("line1");
    });

    it("should drop dimensional constraints during trim", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const cResult = addConstraintToSketch(
        sketch,
        { id: "cd", type: "distance", primitiveIds: ["line1"], value: 10 },
        nextId,
      );
      const result = trimLineAtSegment(
        cResult.sketch,
        lineId,
        0,
        0.5,
        [0.5],
        cResult.nextId,
      );

      expect(
        result.sketch.constraints.find((c) => c.id === "cd"),
      ).toBeUndefined();
    });

    it("should return unchanged sketch when line not found", () => {
      const { sketch, nextId } = makeSketchWithLine();
      const result = trimLineAtSegment(
        sketch,
        "nonexistent",
        0,
        0.5,
        [0.5],
        nextId,
      );

      expect(result.sketch).toBe(sketch);
      expect(result.nextId).toBe(nextId);
    });

    it("should preserve construction flag on trimmed line (end-trim)", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 10, y: 0 };
      let r = addPrimitiveToSketch(sketch, p1, 1);
      r = addPrimitiveToSketch(r.sketch, p2, r.nextId);
      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
        construction: true,
      };
      r = addPrimitiveToSketch(r.sketch, line, r.nextId);

      const result = trimLineAtSegment(
        r.sketch,
        "line1",
        0.6,
        1,
        [0.6],
        r.nextId,
      );

      const newLines = result.sketch.primitives.filter(
        (p) => p.type === "line" && p.id !== "line1",
      ) as SketchLine[];
      expect(newLines).toHaveLength(1);
      expect(newLines[0].construction).toBe(true);
    });

    it("should create correct number of remaining segments for middle trim", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      // Three intersections, remove middle segment between [0.33, 0.66]
      const result = trimLineAtSegment(
        sketch,
        lineId,
        0.33,
        0.66,
        [0.33, 0.66],
        nextId,
      );

      // After split at [0.33, 0.66] → 3 segments, then remove middle → 2 remain
      const lines = result.sketch.primitives.filter(
        (p) => p.type === "line",
      ) as SketchLine[];
      expect(lines).toHaveLength(2);
    });

    it("should return unchanged sketch when points not found", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "missing1",
        p2Id: "missing2",
      };
      const r = addPrimitiveToSketch(sketch, line, 1);

      const result = trimLineAtSegment(
        r.sketch,
        "line1",
        0,
        0.5,
        [0.5],
        r.nextId,
      );

      expect(result.sketch).toBe(r.sketch);
    });

    it("should preserve construction flag on trimmed line (start-trim)", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 10, y: 0 };
      let r = addPrimitiveToSketch(sketch, p1, 1);
      r = addPrimitiveToSketch(r.sketch, p2, r.nextId);
      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
        construction: true,
      };
      r = addPrimitiveToSketch(r.sketch, line, r.nextId);

      const result = trimLineAtSegment(
        r.sketch,
        "line1",
        0,
        0.4,
        [0.4],
        r.nextId,
      );

      const newLines = result.sketch.primitives.filter(
        (p) => p.type === "line" && p.id !== "line1",
      ) as SketchLine[];
      expect(newLines).toHaveLength(1);
      expect(newLines[0].construction).toBe(true);
    });

    it("should transfer geometric and drop dimensional constraints in end-trim", () => {
      const { sketch: baseSketch, lineId, nextId } = makeSketchWithLine();
      const hc: SketchConstraint = {
        id: "hc1",
        type: "horizontal",
        primitiveIds: ["line1"],
      };
      const dc: SketchConstraint = {
        id: "dc1",
        type: "distance",
        primitiveIds: ["line1"],
        value: 10,
      };
      let s = addConstraintToSketch(baseSketch, hc, nextId);
      s = addConstraintToSketch(s.sketch, dc, s.nextId);

      const result = trimLineAtSegment(
        s.sketch,
        lineId,
        0.5,
        1.0,
        [0.5],
        s.nextId,
      );
      // Horizontal transfers to new line
      const hConstraint = result.sketch.constraints.find(
        (c) => c.type === "horizontal",
      );
      expect(hConstraint).toBeDefined();
      // Distance dropped
      const dConstraint = result.sketch.constraints.find(
        (c) => c.type === "distance",
      );
      expect(dConstraint).toBeUndefined();
    });

    it("should return split sketch when middle segment index doesn't match", () => {
      const { sketch: baseSketch, lineId, nextId } = makeSketchWithLine();
      // Middle trim where startParam/endParam don't match any boundary
      // Split at 0.3 and 0.7, but claim middle segment is [0.4, 0.6] — won't match
      const result = trimLineAtSegment(
        baseSketch,
        lineId,
        0.4,
        0.6,
        [0.3, 0.7],
        nextId,
      );
      // Falls through without removing middle → returns the split sketch as-is
      expect(
        result.sketch.primitives.filter((p) => p.type === "line").length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  // ── convertCircleToArc ──

  describe("convertCircleToArc", () => {
    function makeSketchWithCircle(): {
      sketch: Sketch;
      circleId: string;
      centerId: string;
      nextId: number;
    } {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const center: SketchPoint = { id: "center", type: "point", x: 5, y: 5 };
      let r = addPrimitiveToSketch(sketch, center, 1);
      const circle: SketchCircle = {
        id: "circle1",
        type: "circle",
        centerId: "center",
        radius: 3,
      };
      r = addPrimitiveToSketch(r.sketch, circle, r.nextId);
      return {
        sketch: r.sketch,
        circleId: "circle1",
        centerId: "center",
        nextId: r.nextId,
      };
    }

    it("should create an arc when removing a quarter of the circle", () => {
      const { sketch, circleId, nextId } = makeSketchWithCircle();
      const result = convertCircleToArc(
        sketch,
        circleId,
        0,
        Math.PI / 2,
        nextId,
      );

      expect(result.arcId).not.toBe("");
      const arc = result.sketch.primitives.find(
        (p) => p.id === result.arcId,
      ) as SketchArc;
      expect(arc).toBeDefined();
      expect(arc.type).toBe("arc");
    });

    it("should place start point at removeEndAngle position on circle boundary", () => {
      const { sketch, circleId, nextId } = makeSketchWithCircle();
      const removeEnd = Math.PI / 2;
      const result = convertCircleToArc(sketch, circleId, 0, removeEnd, nextId);

      const arc = result.sketch.primitives.find(
        (p) => p.id === result.arcId,
      ) as SketchArc;
      const startPt = result.sketch.primitives.find(
        (p) => p.id === arc.startId,
      ) as SketchPoint;

      // Start point = center + radius * cos/sin(removeEndAngle)
      expect(startPt.x).toBeCloseTo(5 + 3 * Math.cos(removeEnd), 10);
      expect(startPt.y).toBeCloseTo(5 + 3 * Math.sin(removeEnd), 10);
    });

    it("should place end point at removeStartAngle position on circle boundary", () => {
      const { sketch, circleId, nextId } = makeSketchWithCircle();
      const removeStart = 0;
      const result = convertCircleToArc(
        sketch,
        circleId,
        removeStart,
        Math.PI / 2,
        nextId,
      );

      const arc = result.sketch.primitives.find(
        (p) => p.id === result.arcId,
      ) as SketchArc;
      const endPt = result.sketch.primitives.find(
        (p) => p.id === arc.endId,
      ) as SketchPoint;

      expect(endPt.x).toBeCloseTo(5 + 3 * Math.cos(removeStart), 10);
      expect(endPt.y).toBeCloseTo(5 + 3 * Math.sin(removeStart), 10);
    });

    it("should use the same center point ID as the circle", () => {
      const { sketch, circleId, centerId, nextId } = makeSketchWithCircle();
      const result = convertCircleToArc(sketch, circleId, 0, Math.PI, nextId);

      const arc = result.sketch.primitives.find(
        (p) => p.id === result.arcId,
      ) as SketchArc;
      expect(arc.centerId).toBe(centerId);
    });

    it("should set arc radius equal to circle radius", () => {
      const { sketch, circleId, nextId } = makeSketchWithCircle();
      const result = convertCircleToArc(sketch, circleId, 0, Math.PI, nextId);

      const arc = result.sketch.primitives.find(
        (p) => p.id === result.arcId,
      ) as SketchArc;
      expect(arc.radius).toBe(3);
    });

    it("should transfer radius constraint from circle to arc", () => {
      const { sketch, circleId, nextId } = makeSketchWithCircle();
      const cResult = addConstraintToSketch(
        sketch,
        { id: "cr", type: "radius", primitiveIds: ["circle1"], value: 3 },
        nextId,
      );
      const result = convertCircleToArc(
        cResult.sketch,
        circleId,
        0,
        Math.PI,
        cResult.nextId,
      );

      const rConstraint = result.sketch.constraints.find((c) => c.id === "cr");
      expect(rConstraint).toBeDefined();
      expect(rConstraint!.primitiveIds).toContain(result.arcId);
      expect(rConstraint!.primitiveIds).not.toContain("circle1");
    });

    it("should transfer diameter constraint from circle to arc", () => {
      const { sketch, circleId, nextId } = makeSketchWithCircle();
      const cResult = addConstraintToSketch(
        sketch,
        { id: "cdiam", type: "diameter", primitiveIds: ["circle1"], value: 6 },
        nextId,
      );
      const result = convertCircleToArc(
        cResult.sketch,
        circleId,
        0,
        Math.PI,
        cResult.nextId,
      );

      const dConstraint = result.sketch.constraints.find(
        (c) => c.id === "cdiam",
      );
      expect(dConstraint).toBeDefined();
      expect(dConstraint!.primitiveIds).toContain(result.arcId);
    });

    it("should transfer concentric constraint from circle to arc", () => {
      const { sketch, circleId, nextId } = makeSketchWithCircle();
      const cResult = addConstraintToSketch(
        sketch,
        {
          id: "ccon",
          type: "concentric",
          primitiveIds: ["circle1", "other_circle"],
        },
        nextId,
      );
      const result = convertCircleToArc(
        cResult.sketch,
        circleId,
        0,
        Math.PI,
        cResult.nextId,
      );

      const conConstraint = result.sketch.constraints.find(
        (c) => c.id === "ccon",
      );
      expect(conConstraint).toBeDefined();
      expect(conConstraint!.primitiveIds).toContain(result.arcId);
      expect(conConstraint!.primitiveIds).toContain("other_circle");
    });

    it("should transfer pointOnCircle constraint to arc", () => {
      const { sketch, circleId, nextId } = makeSketchWithCircle();
      const cResult = addConstraintToSketch(
        sketch,
        {
          id: "cpoc",
          type: "pointOnCircle",
          primitiveIds: ["somepoint", "circle1"],
        },
        nextId,
      );
      const result = convertCircleToArc(
        cResult.sketch,
        circleId,
        0,
        Math.PI,
        cResult.nextId,
      );

      const pocConstraint = result.sketch.constraints.find(
        (c) => c.id === "cpoc",
      );
      expect(pocConstraint).toBeDefined();
      expect(pocConstraint!.primitiveIds).toContain(result.arcId);
    });

    it("should return unchanged sketch and empty arcId when circle not found", () => {
      const { sketch, nextId } = makeSketchWithCircle();
      const result = convertCircleToArc(
        sketch,
        "nonexistent",
        0,
        Math.PI,
        nextId,
      );

      expect(result.arcId).toBe("");
      expect(result.sketch).toBe(sketch);
    });

    it("should preserve construction flag from circle to arc", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const center: SketchPoint = { id: "center", type: "point", x: 0, y: 0 };
      let r = addPrimitiveToSketch(sketch, center, 1);
      const circle: SketchCircle = {
        id: "circle1",
        type: "circle",
        centerId: "center",
        radius: 5,
        construction: true,
      };
      r = addPrimitiveToSketch(r.sketch, circle, r.nextId);

      const result = convertCircleToArc(
        r.sketch,
        "circle1",
        0,
        Math.PI,
        r.nextId,
      );

      const arc = result.sketch.primitives.find(
        (p) => p.id === result.arcId,
      ) as SketchArc;
      expect(arc.construction).toBe(true);
    });

    it("should drop non-transferable constraints (e.g., tangent)", () => {
      // Build a sketch with a circle and a tangent constraint
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const center: SketchPoint = { id: "cc", type: "point", x: 0, y: 0 };
      const circle: SketchCircle = {
        id: "circ1",
        type: "circle",
        centerId: "cc",
        radius: 5,
      };
      let result = addPrimitiveToSketch(sketch, center, 1);
      result = addPrimitiveToSketch(result.sketch, circle, result.nextId);
      const tangentC: SketchConstraint = {
        id: "tc1",
        type: "tangent",
        primitiveIds: ["circ1", "some_line"],
      };
      const cr = addConstraintToSketch(result.sketch, tangentC, result.nextId);

      const conv = convertCircleToArc(
        cr.sketch,
        "circ1",
        0,
        Math.PI / 2,
        cr.nextId,
      );
      // Tangent constraint should be dropped
      const tc = conv.sketch.constraints.find((c) => c.id === "tc1");
      expect(tc).toBeUndefined();
    });
  });

  // ── removeLineSegment ──

  describe("removeLineSegment", () => {
    it("should remove line and its exclusive points", () => {
      const { sketch, lineId } = makeSketchWithLine();
      const result = removeLineSegment(sketch, lineId);

      expect(result.primitives.find((p) => p.id === "line1")).toBeUndefined();
      // p1 and p2 are exclusive to line1, so they should be removed
      expect(result.primitives.find((p) => p.id === "p1")).toBeUndefined();
      expect(result.primitives.find((p) => p.id === "p2")).toBeUndefined();
    });

    it("should keep shared points used by another line", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      // Add another line that shares p2
      const p3: SketchPoint = { id: "p3", type: "point", x: 20, y: 0 };
      let r = addPrimitiveToSketch(sketch, p3, nextId);
      const line2: SketchLine = {
        id: "line2",
        type: "line",
        p1Id: "p2",
        p2Id: "p3",
      };
      r = addPrimitiveToSketch(r.sketch, line2, r.nextId);

      const result = removeLineSegment(r.sketch, lineId);

      // p2 is shared, should survive
      expect(result.primitives.find((p) => p.id === "p2")).toBeDefined();
      // p1 is exclusive, should be removed
      expect(result.primitives.find((p) => p.id === "p1")).toBeUndefined();
      // line2 still exists
      expect(result.primitives.find((p) => p.id === "line2")).toBeDefined();
    });

    it("should remove constraints referencing the removed line", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      const cResult = addConstraintToSketch(
        sketch,
        { id: "ch", type: "horizontal", primitiveIds: ["line1"] },
        nextId,
      );

      const result = removeLineSegment(cResult.sketch, lineId);

      expect(result.constraints.find((c) => c.id === "ch")).toBeUndefined();
    });

    it("should keep point shared by circle center", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      // Add circle using p1 as center
      const circle: SketchCircle = {
        id: "circle1",
        type: "circle",
        centerId: "p1",
        radius: 5,
      };
      const r = addPrimitiveToSketch(sketch, circle, nextId);

      const result = removeLineSegment(r.sketch, lineId);

      // p1 is used by circle center, should survive
      expect(result.primitives.find((p) => p.id === "p1")).toBeDefined();
    });

    it("should keep point shared by arc", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      // Add arc that uses p1 as start point
      const center: SketchPoint = { id: "ac", type: "point", x: 5, y: 5 };
      let r = addPrimitiveToSketch(sketch, center, nextId);
      const endPt: SketchPoint = { id: "ae", type: "point", x: 10, y: 5 };
      r = addPrimitiveToSketch(r.sketch, endPt, r.nextId);
      const arc: SketchArc = {
        id: "arc1",
        type: "arc",
        centerId: "ac",
        startId: "p1",
        endId: "ae",
        radius: 5,
      };
      r = addPrimitiveToSketch(r.sketch, arc, r.nextId);

      const result = removeLineSegment(r.sketch, lineId);

      // p1 is used by arc startId, should survive
      expect(result.primitives.find((p) => p.id === "p1")).toBeDefined();
    });

    it("should return unchanged sketch when line not found", () => {
      const { sketch } = makeSketchWithLine();
      const result = removeLineSegment(sketch, "nonexistent");

      expect(result).toBe(sketch);
    });

    it("should remove constraints referencing exclusive points too", () => {
      const { sketch, lineId, nextId } = makeSketchWithLine();
      // Add a constraint referencing p1 (which is exclusive to line1)
      const cResult = addConstraintToSketch(
        sketch,
        { id: "cp", type: "coincident", primitiveIds: ["p1", "p2"] },
        nextId,
      );

      const result = removeLineSegment(cResult.sketch, lineId);

      // p1 and p2 are exclusive → removed → constraint referencing them should be removed
      expect(result.constraints.find((c) => c.id === "cp")).toBeUndefined();
    });

    it("should remove construction line same as regular line", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 10, y: 0 };
      let r = addPrimitiveToSketch(sketch, p1, 1);
      r = addPrimitiveToSketch(r.sketch, p2, r.nextId);
      const line: SketchLine = {
        id: "line1",
        type: "line",
        p1Id: "p1",
        p2Id: "p2",
        construction: true,
      };
      r = addPrimitiveToSketch(r.sketch, line, r.nextId);

      const result = removeLineSegment(r.sketch, "line1");

      expect(result.primitives.find((p) => p.id === "line1")).toBeUndefined();
      expect(result.primitives.find((p) => p.id === "p1")).toBeUndefined();
      expect(result.primitives.find((p) => p.id === "p2")).toBeUndefined();
    });
  });

  // ── cleanupOrphanedPoints ──

  describe("cleanupOrphanedPoints", () => {
    it("should remove orphaned points not referenced by any primitive", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const orphan: SketchPoint = { id: "orphan", type: "point", x: 99, y: 99 };
      const r = addPrimitiveToSketch(sketch, orphan, 1);

      const result = cleanupOrphanedPoints(r.sketch);

      expect(result.removedIds).toContain("orphan");
      expect(
        result.sketch.primitives.find((p) => p.id === "orphan"),
      ).toBeUndefined();
    });

    it("should keep points used by lines", () => {
      const { sketch } = makeSketchWithLine();
      const result = cleanupOrphanedPoints(sketch);

      expect(result.removedIds).toHaveLength(0);
      expect(result.sketch.primitives.find((p) => p.id === "p1")).toBeDefined();
      expect(result.sketch.primitives.find((p) => p.id === "p2")).toBeDefined();
    });

    it("should keep points used by circles (centerId)", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const center: SketchPoint = { id: "center", type: "point", x: 0, y: 0 };
      let r = addPrimitiveToSketch(sketch, center, 1);
      const circle: SketchCircle = {
        id: "c1",
        type: "circle",
        centerId: "center",
        radius: 5,
      };
      r = addPrimitiveToSketch(r.sketch, circle, r.nextId);

      const result = cleanupOrphanedPoints(r.sketch);

      expect(result.removedIds).toHaveLength(0);
      expect(
        result.sketch.primitives.find((p) => p.id === "center"),
      ).toBeDefined();
    });

    it("should keep points used by arcs (centerId, startId, endId)", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const center: SketchPoint = { id: "ac", type: "point", x: 0, y: 0 };
      const start: SketchPoint = { id: "as", type: "point", x: 5, y: 0 };
      const end: SketchPoint = { id: "ae", type: "point", x: 0, y: 5 };
      let r = addPrimitiveToSketch(sketch, center, 1);
      r = addPrimitiveToSketch(r.sketch, start, r.nextId);
      r = addPrimitiveToSketch(r.sketch, end, r.nextId);
      const arc: SketchArc = {
        id: "arc1",
        type: "arc",
        centerId: "ac",
        startId: "as",
        endId: "ae",
        radius: 5,
      };
      r = addPrimitiveToSketch(r.sketch, arc, r.nextId);

      const result = cleanupOrphanedPoints(r.sketch);

      expect(result.removedIds).toHaveLength(0);
      expect(result.sketch.primitives.find((p) => p.id === "ac")).toBeDefined();
      expect(result.sketch.primitives.find((p) => p.id === "as")).toBeDefined();
      expect(result.sketch.primitives.find((p) => p.id === "ae")).toBeDefined();
    });

    it("should remove constraints referencing orphaned points", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const orphan: SketchPoint = { id: "orphan", type: "point", x: 0, y: 0 };
      let r = addPrimitiveToSketch(sketch, orphan, 1);
      const cResult = addConstraintToSketch(
        r.sketch,
        { id: "co", type: "coincident", primitiveIds: ["orphan", "other"] },
        r.nextId,
      );

      const result = cleanupOrphanedPoints(cResult.sketch);

      expect(result.removedIds).toContain("orphan");
      expect(
        result.sketch.constraints.find((c) => c.id === "co"),
      ).toBeUndefined();
    });

    it("should return unchanged sketch and empty removedIds when no orphans", () => {
      const { sketch } = makeSketchWithLine();
      const result = cleanupOrphanedPoints(sketch);

      expect(result.removedIds).toHaveLength(0);
      expect(result.sketch).toBe(sketch);
    });

    it("should remove all points when all are orphaned", () => {
      const plane = createSketchPlane("XY");
      let sketch = stripOrigin(createSketch(plane, 0).sketch);
      const p1: SketchPoint = { id: "p1", type: "point", x: 0, y: 0 };
      const p2: SketchPoint = { id: "p2", type: "point", x: 5, y: 5 };
      const p3: SketchPoint = { id: "p3", type: "point", x: 10, y: 10 };
      let r = addPrimitiveToSketch(sketch, p1, 1);
      r = addPrimitiveToSketch(r.sketch, p2, r.nextId);
      r = addPrimitiveToSketch(r.sketch, p3, r.nextId);

      const result = cleanupOrphanedPoints(r.sketch);

      expect(result.removedIds).toHaveLength(3);
      expect(
        result.sketch.primitives.filter((p) => p.type === "point"),
      ).toHaveLength(0);
    });

    it("should handle mixed scenario: some orphaned, some not", () => {
      const { sketch, nextId } = makeSketchWithLine();
      // Add orphaned points
      const orphan1: SketchPoint = {
        id: "orphan1",
        type: "point",
        x: 50,
        y: 50,
      };
      const orphan2: SketchPoint = {
        id: "orphan2",
        type: "point",
        x: 60,
        y: 60,
      };
      let r = addPrimitiveToSketch(sketch, orphan1, nextId);
      r = addPrimitiveToSketch(r.sketch, orphan2, r.nextId);

      const result = cleanupOrphanedPoints(r.sketch);

      expect(result.removedIds).toHaveLength(2);
      expect(result.removedIds).toContain("orphan1");
      expect(result.removedIds).toContain("orphan2");
      // p1 and p2 used by line1 should survive
      expect(result.sketch.primitives.find((p) => p.id === "p1")).toBeDefined();
      expect(result.sketch.primitives.find((p) => p.id === "p2")).toBeDefined();
    });
  });
});
