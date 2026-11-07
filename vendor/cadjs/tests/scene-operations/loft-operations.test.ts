import * as THREE from "three";
import { loftBReps } from "../../src/scene-operations/loft-operations";
import { Brep, Vertex, Edge, Face } from "../../src/geometry";
/**
 * Create a flat rectangle BRep centered at origin in the XY plane.
 */
function createRectBrep(w: number, h: number): Brep {
  const hw = w / 2,
    hh = h / 2;
  const v = [
    new Vertex(-hw, -hh, 0),
    new Vertex(hw, -hh, 0),
    new Vertex(hw, hh, 0),
    new Vertex(-hw, hh, 0),
  ];
  const edges = [
    new Edge(v[0], v[1]),
    new Edge(v[1], v[2]),
    new Edge(v[2], v[3]),
    new Edge(v[3], v[0]),
  ];
  const faces = [new Face([v[0], v[1], v[2], v[3]])];
  return new Brep(v, edges, faces);
}

/**
 * Create a flat circle-approximating BRep (octagon) centered at origin.
 */
function createCircleBrep(radius: number): Brep {
  const segments = 8;
  const vertices: Vertex[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    vertices.push(
      new Vertex(radius * Math.cos(angle), radius * Math.sin(angle), 0),
    );
  }
  const edges: Edge[] = [];
  for (let i = 0; i < segments; i++) {
    edges.push(new Edge(vertices[i], vertices[(i + 1) % segments]));
  }
  const faces = [new Face(vertices)];
  return new Brep(vertices, edges, faces);
}

describe("loft-operations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loftBReps", () => {
    it("should loft 2 identical rectangles at different Z positions", async () => {
      const rect1 = createRectBrep(2, 2);
      const rect2 = createRectBrep(2, 2);

      const profiles = [
        { brep: rect1, position: new THREE.Vector3(0, 0, 0) },
        { brep: rect2, position: new THREE.Vector3(0, 0, 4) },
      ];

      const result = await loftBReps(profiles);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);
      expect(result.value.position).toBeDefined();

      // Position should be between the two profiles' Z positions
      expect(result.value.position.z).toBeCloseTo(2, 0);
    });

    it("should loft rectangle and circle (different cross sections)", async () => {
      const rect = createRectBrep(2, 2);
      const circle = createCircleBrep(1.5);

      const profiles = [
        { brep: rect, position: new THREE.Vector3(0, 0, 0) },
        { brep: circle, position: new THREE.Vector3(0, 0, 5) },
      ];

      const result = await loftBReps(profiles);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);
    });

    it("should loft 3 profiles in order", async () => {
      const rect1 = createRectBrep(2, 2);
      const rect2 = createRectBrep(3, 3);
      const rect3 = createRectBrep(1, 1);

      const profiles = [
        { brep: rect1, position: new THREE.Vector3(0, 0, 0) },
        { brep: rect2, position: new THREE.Vector3(0, 0, 3) },
        { brep: rect3, position: new THREE.Vector3(0, 0, 6) },
      ];

      const result = await loftBReps(profiles);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);

      // Position Z should be around the center of the 3 profiles (z=3)
      expect(result.value.position.z).toBeCloseTo(3, 0);
    });

    it("should produce valid geometry with isRuled=true", async () => {
      const rect1 = createRectBrep(2, 2);
      const rect2 = createRectBrep(2, 2);

      const profiles = [
        { brep: rect1, position: new THREE.Vector3(0, 0, 0) },
        { brep: rect2, position: new THREE.Vector3(0, 0, 5) },
      ];

      const result = await loftBReps(profiles, true);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);
    });

    it("should produce valid geometry with isRuled=false (default)", async () => {
      const rect1 = createRectBrep(2, 2);
      const rect2 = createRectBrep(2, 2);

      const profiles = [
        { brep: rect1, position: new THREE.Vector3(0, 0, 0) },
        { brep: rect2, position: new THREE.Vector3(0, 0, 5) },
      ];

      const result = await loftBReps(profiles);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
    });

    it("should compute position from bounding box center", async () => {
      const rect1 = createRectBrep(2, 2);
      const rect2 = createRectBrep(2, 2);

      const profiles = [
        { brep: rect1, position: new THREE.Vector3(0, 0, 0) },
        { brep: rect2, position: new THREE.Vector3(0, 0, 6) },
      ];

      const result = await loftBReps(profiles);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      // Position should be at bounding box center (around Z=3 for 0→6)
      expect(result.value.position.z).toBeCloseTo(3, 0);
      expect(result.value.position.x).toBeCloseTo(0, 0);
      expect(result.value.position.y).toBeCloseTo(0, 0);
    });

    it("should include edge geometry in result", async () => {
      const rect1 = createRectBrep(2, 2);
      const rect2 = createRectBrep(2, 2);

      const profiles = [
        { brep: rect1, position: new THREE.Vector3(0, 0, 0) },
        { brep: rect2, position: new THREE.Vector3(0, 0, 4) },
      ];

      const result = await loftBReps(profiles);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.edgeGeometry).toBeDefined();
      expect(result.value.edgeGeometry).toBeInstanceOf(THREE.BufferGeometry);
      expect(
        result.value.edgeGeometry!.attributes.position.count,
      ).toBeGreaterThan(0);
    });

    it("should return centered BRep (bounding box center near origin)", async () => {
      const rect1 = createRectBrep(2, 2);
      const rect2 = createRectBrep(2, 2);

      const profiles = [
        { brep: rect1, position: new THREE.Vector3(0, 0, 0) },
        { brep: rect2, position: new THREE.Vector3(0, 0, 4) },
      ];

      const result = await loftBReps(profiles);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      const xs = result.value.brep.vertices.map((v) => v.x);
      const ys = result.value.brep.vertices.map((v) => v.y);
      const zs = result.value.brep.vertices.map((v) => v.z);
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      expect(centerX).toBeCloseTo(0, 0);
      expect(centerY).toBeCloseTo(0, 0);
      expect(centerZ).toBeCloseTo(0, 0);
    });

    it("should return error for single profile", async () => {
      const rect = createRectBrep(2, 2);
      const result = await loftBReps([
        { brep: rect, position: new THREE.Vector3(0, 0, 0) },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("2 profiles");
    });

    it("should return error for empty profiles array", async () => {
      const result = await loftBReps([]);
      expect(result.ok).toBe(false);
    });
  });
});
