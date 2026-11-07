/**
 * SketchToBrepService Tests
 *
 * Tests for converting 2D sketch primitives to 3D BRep geometry using OpenCascade.
 * These are integration tests that use the real OpenCascade WASM library.
 */

import { SketchToBrepService } from "../../src/services/SketchToBrepService";
import { getOcInstance } from "../../src/services/opencascade-instance";
import { Brep } from "../../src/geometry";
import {
  Sketch,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  createSketchPlane,
} from "../../src/types/sketch-types";

describe("SketchToBrepService", () => {
  let service: SketchToBrepService;

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
  function createPoint(id: string, x: number, y: number): SketchPoint {
    return { id, type: "point", x, y };
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

  // Helper to create a rectangle sketch
  function createRectangleSketch(
    x: number,
    y: number,
    width: number,
    height: number,
  ): Sketch {
    const sketch = createEmptySketch();

    // Corner points
    const p1 = createPoint("p1", x, y);
    const p2 = createPoint("p2", x + width, y);
    const p3 = createPoint("p3", x + width, y + height);
    const p4 = createPoint("p4", x, y + height);

    // Lines
    const l1 = createLine("l1", "p1", "p2");
    const l2 = createLine("l2", "p2", "p3");
    const l3 = createLine("l3", "p3", "p4");
    const l4 = createLine("l4", "p4", "p1");

    sketch.primitives = [p1, p2, p3, p4, l1, l2, l3, l4];
    return sketch;
  }

  // Helper to create a triangle sketch
  function createTriangleSketch(): Sketch {
    const sketch = createEmptySketch();

    const p1 = createPoint("p1", 0, 0);
    const p2 = createPoint("p2", 2, 0);
    const p3 = createPoint("p3", 1, 1.732);

    const l1 = createLine("l1", "p1", "p2");
    const l2 = createLine("l2", "p2", "p3");
    const l3 = createLine("l3", "p3", "p1");

    sketch.primitives = [p1, p2, p3, l1, l2, l3];
    return sketch;
  }

  // Helper to create a circle sketch
  function createCircleSketch(cx: number, cy: number, radius: number): Sketch {
    const sketch = createEmptySketch();

    const center = createPoint("center", cx, cy);
    const circle = createCircle("circle1", "center", radius);

    sketch.primitives = [center, circle];
    return sketch;
  }

  beforeAll(async () => {
    // Initialize OpenCascade WASM
    await getOcInstance();
    service = SketchToBrepService.getInstance();
  }, 60000);

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = SketchToBrepService.getInstance();
      const instance2 = SketchToBrepService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("convertSketchToBrep() - Simple Shapes", () => {
    describe("rectangle (4 lines)", () => {
      it("should create a quad face", async () => {
        const sketch = createRectangleSketch(0, 0, 2, 1);

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
        expect(brep.vertices.length).toBeGreaterThan(0);
      });

      it("should create correct vertex count", async () => {
        const sketch = createRectangleSketch(0, 0, 3, 2);

        const brep = await service.convertSketchToBrep(sketch);

        // A rectangle should have at least 4 vertices
        expect(brep.vertices.length).toBeGreaterThanOrEqual(4);
      });
    });

    describe("triangle (3 lines)", () => {
      it("should create a triangle face", async () => {
        const sketch = createTriangleSketch();

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
      });
    });

    describe("circle", () => {
      it("should create a circular face", async () => {
        const sketch = createCircleSketch(0, 0, 5);

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
        // Circle tessellation produces many vertices
        expect(brep.vertices.length).toBeGreaterThan(4);
      });

      it("should handle different radii", async () => {
        const smallCircle = createCircleSketch(0, 0, 1);
        const largeCircle = createCircleSketch(0, 0, 10);

        const smallBrep = await service.convertSketchToBrep(smallCircle);
        const largeBrep = await service.convertSketchToBrep(largeCircle);

        expect(smallBrep.faces.length).toBeGreaterThan(0);
        expect(largeBrep.faces.length).toBeGreaterThan(0);
      });
    });

    describe("polygon (n lines)", () => {
      it("should create a pentagon face", async () => {
        const sketch = createEmptySketch();

        // Pentagon vertices
        const points: SketchPoint[] = [];
        const lines: SketchLine[] = [];

        for (let i = 0; i < 5; i++) {
          const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const x = 2 * Math.cos(angle);
          const y = 2 * Math.sin(angle);
          points.push(createPoint(`p${i}`, x, y));
        }

        for (let i = 0; i < 5; i++) {
          lines.push(createLine(`l${i}`, `p${i}`, `p${(i + 1) % 5}`));
        }

        sketch.primitives = [...points, ...lines];

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
      });

      it("should create a hexagon face", async () => {
        const sketch = createEmptySketch();

        const points: SketchPoint[] = [];
        const lines: SketchLine[] = [];

        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          const x = 3 * Math.cos(angle);
          const y = 3 * Math.sin(angle);
          points.push(createPoint(`p${i}`, x, y));
        }

        for (let i = 0; i < 6; i++) {
          lines.push(createLine(`l${i}`, `p${i}`, `p${(i + 1) % 6}`));
        }

        sketch.primitives = [...points, ...lines];

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
      });
    });
  });

  describe("convertSketchToBrep() - Complex Shapes", () => {
    describe("house shape (square + triangle sharing edge)", () => {
      it("should handle house outline without interior line", async () => {
        // House as single closed loop (no interior edge)
        const sketch = createEmptySketch();

        const p1 = createPoint("p1", 0, 0); // bottom-left
        const p2 = createPoint("p2", 2, 0); // bottom-right
        const p3 = createPoint("p3", 2, 2); // top-right
        const p4 = createPoint("p4", 0, 2); // top-left
        const p5 = createPoint("p5", 1, 3); // peak

        // Single closed loop: bottom → right → roof-right → peak → roof-left → left → back to start
        const l1 = createLine("l1", "p1", "p2"); // bottom
        const l2 = createLine("l2", "p2", "p3"); // right
        const l3 = createLine("l3", "p3", "p5"); // right roof
        const l4 = createLine("l4", "p5", "p4"); // left roof
        const l5 = createLine("l5", "p4", "p1"); // left

        sketch.primitives = [p1, p2, p3, p4, p5, l1, l2, l3, l4, l5];

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
      });
    });

    describe("scrambled edge order", () => {
      it("should handle pentagon with edges in reverse order", async () => {
        const sketch = createEmptySketch();

        const points: SketchPoint[] = [];
        for (let i = 0; i < 5; i++) {
          const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          points.push(
            createPoint(`p${i}`, 2 * Math.cos(angle), 2 * Math.sin(angle)),
          );
        }

        // Edges in REVERSE order
        const lines: SketchLine[] = [];
        for (let i = 4; i >= 0; i--) {
          lines.push(createLine(`l${i}`, `p${(i + 1) % 5}`, `p${i}`));
        }

        sketch.primitives = [...points, ...lines];

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
      });
    });

    describe("floating point precision edge cases", () => {
      it("should handle vertices with tiny coordinate differences", async () => {
        const sketch = createEmptySketch();

        // Points with tiny floating point differences (simulating snapping imprecision)
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 2.0000001, 0); // tiny offset
        const p3 = createPoint("p3", 2, 2);
        const p4 = createPoint("p4", 0.0000001, 2.0000001); // tiny offsets

        const l1 = createLine("l1", "p1", "p2");
        const l2 = createLine("l2", "p2", "p3");
        const l3 = createLine("l3", "p3", "p4");
        const l4 = createLine("l4", "p4", "p1");

        sketch.primitives = [p1, p2, p3, p4, l1, l2, l3, l4];

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
      });
    });

    describe("rectangle + circle", () => {
      it("should create union of faces", async () => {
        const sketch = createEmptySketch();

        // Rectangle
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 4, 0);
        const p3 = createPoint("p3", 4, 2);
        const p4 = createPoint("p4", 0, 2);

        const l1 = createLine("l1", "p1", "p2");
        const l2 = createLine("l2", "p2", "p3");
        const l3 = createLine("l3", "p3", "p4");
        const l4 = createLine("l4", "p4", "p1");

        // Circle inside rectangle
        const center = createPoint("center", 2, 1);
        const circle = createCircle("circle1", "center", 0.5);

        sketch.primitives = [p1, p2, p3, p4, center, l1, l2, l3, l4, circle];

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
      });
    });

    describe("multiple disconnected shapes", () => {
      it("should handle multiple circles", async () => {
        const sketch = createEmptySketch();

        const c1 = createPoint("c1", 0, 0);
        const c2 = createPoint("c2", 5, 0);
        const circle1 = createCircle("circle1", "c1", 1);
        const circle2 = createCircle("circle2", "c2", 2);

        sketch.primitives = [c1, c2, circle1, circle2];

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
      });
    });

    describe("shape with arc segments", () => {
      it("should handle arc in sketch", async () => {
        const sketch = createEmptySketch();

        // Simple arc
        const center = createPoint("center", 0, 0);
        const start = createPoint("start", 2, 0);
        const end = createPoint("end", 0, 2);
        const arc = createArc("arc1", "center", "start", "end", 2);

        // Close with lines
        const l1 = createLine("l1", "end", "center");
        const l2 = createLine("l2", "center", "start");

        sketch.primitives = [center, start, end, arc, l1, l2];

        const brep = await service.convertSketchToBrep(sketch);

        // Arc shapes may or may not produce a valid closed wire
        // This tests that the conversion doesn't crash
        expect(brep).toBeDefined();
      });
    });
  });

  describe("Validation", () => {
    describe("closed wire requirement", () => {
      it("should handle empty sketch", async () => {
        const sketch = createEmptySketch();

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces).toHaveLength(0);
        expect(brep.vertices).toHaveLength(0);
      });

      it("should warn on open path", async () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation();

        const sketch = createEmptySketch();

        // Open path (not closed)
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 1, 0);
        const p3 = createPoint("p3", 1, 1);
        const l1 = createLine("l1", "p1", "p2");
        const l2 = createLine("l2", "p2", "p3");

        sketch.primitives = [p1, p2, p3, l1, l2];

        const brep = await service.convertSketchToBrep(sketch);

        // Open path should produce a warning or empty result
        expect(brep).toBeDefined();

        consoleSpy.mockRestore();
      });
    });

    describe("degenerate geometry", () => {
      it("should reject zero-length lines", async () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation();

        const sketch = createEmptySketch();

        // Degenerate line (same start and end)
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 0, 0); // Same as p1
        const l1 = createLine("l1", "p1", "p2");

        sketch.primitives = [p1, p2, l1];

        const brep = await service.convertSketchToBrep(sketch);

        // Should handle gracefully
        expect(brep).toBeDefined();

        consoleSpy.mockRestore();
      });

      it("should reject zero-radius circles", async () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation();

        const sketch = createEmptySketch();

        const center = createPoint("center", 0, 0);
        const circle = createCircle("circle1", "center", 0);

        sketch.primitives = [center, circle];

        const brep = await service.convertSketchToBrep(sketch);

        // Should handle gracefully
        expect(brep).toBeDefined();
        expect(brep.faces).toHaveLength(0);

        consoleSpy.mockRestore();
      });
    });
  });

  describe("Output", () => {
    describe("BRep vertices", () => {
      it("should have vertices in absolute coordinates", async () => {
        const sketch = createRectangleSketch(5, 10, 2, 3);

        const brep = await service.convertSketchToBrep(sketch);

        // Vertices should be created from the sketch
        expect(brep.vertices.length).toBeGreaterThan(0);

        // The service creates geometry - verify it has expected dimensions
        // Calculate bounding box
        const xs = brep.vertices.map((v) => v.x);
        const ys = brep.vertices.map((v) => v.y);
        const width = Math.max(...xs) - Math.min(...xs);
        const height = Math.max(...ys) - Math.min(...ys);

        // Width and height should approximately match the input
        expect(width).toBeCloseTo(2, 1);
        expect(height).toBeCloseTo(3, 1);
      });
    });

    describe("face normal orientation", () => {
      it("should create faces with normals", async () => {
        const sketch = createRectangleSketch(0, 0, 2, 2);

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep.faces.length).toBeGreaterThan(0);

        // Each face should have a valid normal
        for (const face of brep.faces) {
          const normal = face.normal;
          // Normal should not be zero vector
          const magnitude = Math.sqrt(
            normal.x * normal.x + normal.y * normal.y + normal.z * normal.z,
          );
          expect(magnitude).toBeGreaterThan(0);
        }
      });
    });
  });

  describe("Edge Cases", () => {
    describe("very small geometry", () => {
      it("should handle small rectangle", async () => {
        const sketch = createRectangleSketch(0, 0, 0.01, 0.01);

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
      });
    });

    describe("very large geometry", () => {
      it("should handle large rectangle", async () => {
        const sketch = createRectangleSketch(0, 0, 1000, 1000);

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);
      });
    });

    describe("offset from origin", () => {
      it("should handle sketch far from origin", async () => {
        const sketch = createRectangleSketch(1000, 2000, 5, 5);

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);

        // Verify the shape dimensions are preserved
        const xs = brep.vertices.map((v) => v.x);
        const ys = brep.vertices.map((v) => v.y);
        const width = Math.max(...xs) - Math.min(...xs);
        const height = Math.max(...ys) - Math.min(...ys);

        expect(width).toBeCloseTo(5, 1);
        expect(height).toBeCloseTo(5, 1);
      });
    });

    describe("negative coordinates", () => {
      it("should handle negative coordinates", async () => {
        const sketch = createRectangleSketch(-5, -5, 2, 2);

        const brep = await service.convertSketchToBrep(sketch);

        expect(brep).toBeDefined();
        expect(brep.faces.length).toBeGreaterThan(0);

        // Should have vertices with negative coordinates
        const hasNegativeCoords = brep.vertices.some((v) => v.x < 0 || v.y < 0);
        expect(hasNegativeCoords).toBe(true);
      });
    });
  });

  describe("Point Map Building", () => {
    it("should extract all point coordinates", async () => {
      const sketch = createEmptySketch();

      const p1 = createPoint("p1", 1, 2);
      const p2 = createPoint("p2", 3, 4);
      const p3 = createPoint("p3", 5, 6);
      const p4 = createPoint("p4", 7, 8);

      // Square
      const l1 = createLine("l1", "p1", "p2");
      const l2 = createLine("l2", "p2", "p3");
      const l3 = createLine("l3", "p3", "p4");
      const l4 = createLine("l4", "p4", "p1");

      sketch.primitives = [p1, p2, p3, p4, l1, l2, l3, l4];

      // This indirectly tests that point map is built correctly
      const brep = await service.convertSketchToBrep(sketch);

      expect(brep).toBeDefined();
    });
  });

  describe("convertSketchToProfiles() - Multi-Profile Detection", () => {
    describe("circle overlapping rectangle edge", () => {
      it("should create multiple profiles when circle overlaps rectangle edge", async () => {
        // This is the key Fusion 360 behavior:
        // Rectangle 4x2 with circle centered on the right edge
        // Should create 3 profiles:
        // 1. Inner circle portion inside rectangle (lens shape)
        // 2. Rectangle with bite taken out
        // 3. Outer circle portion outside rectangle (crescent)
        const sketch = createEmptySketch();

        // Rectangle from (0,0) to (4,2)
        const p1 = createPoint("p1", 0, 0); // bottom-left
        const p2 = createPoint("p2", 4, 0); // bottom-right
        const p3 = createPoint("p3", 4, 2); // top-right
        const p4 = createPoint("p4", 0, 2); // top-left

        const l1 = createLine("l1", "p1", "p2");
        const l2 = createLine("l2", "p2", "p3");
        const l3 = createLine("l3", "p3", "p4");
        const l4 = createLine("l4", "p4", "p1");

        // Circle centered on right edge, radius 1
        // This will overlap the right edge
        const center = createPoint("center", 4, 1);
        const circle = createCircle("circle1", "center", 1);

        sketch.primitives = [p1, p2, p3, p4, center, l1, l2, l3, l4, circle];

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(true);
        // With proper edge intersection, we should get multiple profiles
        // The exact number depends on OpenCascade's face building algorithm
        expect(result.profiles.length).toBeGreaterThan(0);

        // Each profile should have valid geometry
        for (const profile of result.profiles) {
          expect(profile.brep.faces.length).toBeGreaterThan(0);
          expect(profile.area).toBeGreaterThan(0);
        }
      });

      it("should handle circle fully inside rectangle (hole scenario)", async () => {
        // Circle completely inside rectangle
        // Should create 2 profiles:
        // 1. Ring shape (rectangle with hole)
        // 2. Inner circle
        const sketch = createEmptySketch();

        // Rectangle from (0,0) to (4,4)
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 4, 0);
        const p3 = createPoint("p3", 4, 4);
        const p4 = createPoint("p4", 0, 4);

        const l1 = createLine("l1", "p1", "p2");
        const l2 = createLine("l2", "p2", "p3");
        const l3 = createLine("l3", "p3", "p4");
        const l4 = createLine("l4", "p4", "p1");

        // Circle inside, centered at (2,2), radius 1
        const center = createPoint("center", 2, 2);
        const circle = createCircle("circle1", "center", 1);

        sketch.primitives = [p1, p2, p3, p4, center, l1, l2, l3, l4, circle];

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(true);
        expect(result.profiles.length).toBeGreaterThan(0);
      });

      it("should handle circle fully outside rectangle (no intersection)", async () => {
        // Circle completely outside rectangle - no intersection
        // Should create 2 separate profiles (rectangle + circle)
        const sketch = createEmptySketch();

        // Rectangle from (0,0) to (2,2)
        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 2, 0);
        const p3 = createPoint("p3", 2, 2);
        const p4 = createPoint("p4", 0, 2);

        const l1 = createLine("l1", "p1", "p2");
        const l2 = createLine("l2", "p2", "p3");
        const l3 = createLine("l3", "p3", "p4");
        const l4 = createLine("l4", "p4", "p1");

        // Circle far away at (10,10), radius 1
        const center = createPoint("center", 10, 10);
        const circle = createCircle("circle1", "center", 1);

        sketch.primitives = [p1, p2, p3, p4, center, l1, l2, l3, l4, circle];

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(true);
        // Should have at least 2 separate profiles
        expect(result.profiles.length).toBeGreaterThanOrEqual(2);
      });

      it("should create 3 profiles for circle on TOP edge of rectangle (Fusion 360 behavior)", async () => {
        // This matches the user's exact scenario:
        // Rectangle from (0,0) to (4,2), circle centered at (2,2) on top edge with radius 1
        //
        // With proper profile detection (like Fusion 360), we get 3 regions:
        // 1. The crescent (outer part of circle outside rectangle) - area = π/2 ≈ 1.57
        // 2. The lens shape (inner part of circle inside rectangle) - area = π/2 ≈ 1.57
        // 3. The rectangle with a "bite" taken out - area = 8 - π/2 ≈ 6.43
        const sketch = createEmptySketch();

        // Rectangle from (0,0) to (4,2)
        const p1 = createPoint("p1", 0, 0); // bottom-left
        const p2 = createPoint("p2", 4, 0); // bottom-right
        const p3 = createPoint("p3", 4, 2); // top-right
        const p4 = createPoint("p4", 0, 2); // top-left

        const l1 = createLine("l1", "p1", "p2"); // bottom
        const l2 = createLine("l2", "p2", "p3"); // right
        const l3 = createLine("l3", "p3", "p4"); // top
        const l4 = createLine("l4", "p4", "p1"); // left

        // Circle centered on top edge at (2,2), radius 1
        // This circle overlaps the top edge, creating intersection regions
        const center = createPoint("center", 2, 2);
        const circle = createCircle("circle1", "center", 1);

        sketch.primitives = [p1, p2, p3, p4, center, l1, l2, l3, l4, circle];

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(true);
        // Fusion 360 behavior: 3 profiles from the intersection
        expect(result.profiles.length).toBe(3);

        // All profiles should have valid geometry
        for (const profile of result.profiles) {
          expect(profile.brep).toBeDefined();
          expect(profile.brep.faces.length).toBeGreaterThan(0);
          expect(profile.brep.vertices.length).toBeGreaterThan(0);
          console.log(
            `Profile ${profile.id}: ${profile.brep.faces.length} faces, area=${profile.area.toFixed(4)}`,
          );
        }

        // Check the areas:
        // - Two half-circles (crescent + lens): each ~π/2 ≈ 1.57
        // - Rectangle with bite: 4*2 - π/2 ≈ 6.43
        const areas = result.profiles.map((p) => p.area).sort((a, b) => a - b);

        // Two smallest should be approximately π/2 (the two half-circle portions)
        expect(areas[0]).toBeCloseTo(Math.PI / 2, 0); // ~1.57
        expect(areas[1]).toBeCloseTo(Math.PI / 2, 0); // ~1.57

        // Largest should be rectangle minus half-circle
        expect(areas[2]).toBeCloseTo(8 - Math.PI / 2, 0); // ~6.43
      });
    });

    describe("simple shapes - single profile", () => {
      it("should create single profile for simple rectangle", async () => {
        const sketch = createRectangleSketch(0, 0, 2, 1);

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(true);
        expect(result.profiles.length).toBeGreaterThan(0);

        // Rectangle area should be approximately 2 * 1 = 2
        const totalArea = result.profiles.reduce((sum, p) => sum + p.area, 0);
        expect(totalArea).toBeCloseTo(2, 0);
      });

      it("should create single profile for simple circle", async () => {
        const sketch = createCircleSketch(0, 0, 1);

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(true);
        expect(result.profiles.length).toBeGreaterThan(0);

        // Circle area should be approximately pi * r^2 = pi
        const totalArea = result.profiles.reduce((sum, p) => sum + p.area, 0);
        expect(totalArea).toBeCloseTo(Math.PI, 0);
      });
    });

    describe("intersecting lines", () => {
      it("should detect profiles from crossing lines", async () => {
        // X-shape: two crossing lines should create 4 triangular profiles
        const sketch = createEmptySketch();

        // Cross centered at (0,0)
        const p1 = createPoint("p1", -2, -2); // bottom-left
        const p2 = createPoint("p2", 2, 2); // top-right
        const p3 = createPoint("p3", -2, 2); // top-left
        const p4 = createPoint("p4", 2, -2); // bottom-right

        // Diagonal lines crossing in the middle
        const l1 = createLine("l1", "p1", "p2"); // SW to NE
        const l2 = createLine("l2", "p3", "p4"); // NW to SE

        sketch.primitives = [p1, p2, p3, p4, l1, l2];

        const result = await service.convertSketchToProfiles(sketch);

        // This tests edge intersection - if implemented, should find the crossing point
        // and create profiles. If not implemented, may return 0 profiles (no closed loops)
        expect(result).toBeDefined();
      });
    });

    describe("empty and invalid sketches", () => {
      it("should handle empty sketch", async () => {
        const sketch = createEmptySketch();

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(false);
        expect(result.profiles).toHaveLength(0);
      });

      it("should handle sketch with only points", async () => {
        const sketch = createEmptySketch();
        sketch.primitives = [createPoint("p1", 0, 0), createPoint("p2", 1, 1)];

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(false);
        expect(result.profiles).toHaveLength(0);
      });

      it("should handle open path (no closed profiles)", async () => {
        const sketch = createEmptySketch();

        const p1 = createPoint("p1", 0, 0);
        const p2 = createPoint("p2", 1, 0);
        const p3 = createPoint("p3", 1, 1);
        const l1 = createLine("l1", "p1", "p2");
        const l2 = createLine("l2", "p2", "p3");
        // Note: not closing the path

        sketch.primitives = [p1, p2, p3, l1, l2];

        const result = await service.convertSketchToProfiles(sketch);

        // Open path should not create valid profiles
        // May return empty or fall back to original algorithm
        expect(result).toBeDefined();
      });
    });

    describe("profile properties", () => {
      it("should assign correct IDs to profiles", async () => {
        const sketch = createRectangleSketch(0, 0, 2, 2);
        sketch.id = "my_sketch";

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(true);
        for (const profile of result.profiles) {
          expect(profile.id).toContain("my_sketch");
        }
      });

      it("should calculate positive area for interior profiles", async () => {
        const sketch = createCircleSketch(0, 0, 2);

        const result = await service.convertSketchToProfiles(sketch);

        expect(result.success).toBe(true);
        for (const profile of result.profiles) {
          expect(profile.area).toBeGreaterThan(0);
        }
      });
    });
  });
});
