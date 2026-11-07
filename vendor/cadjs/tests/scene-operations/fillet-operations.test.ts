import * as THREE from "three";
import {
  filletBRep,
  chamferBRep,
} from "../../src/scene-operations/fillet-operations";
import { Brep } from "../../src/geometry";
import { getOcInstance } from "../../src/services/opencascade-instance";
import {
  ocShapeToBRepHelper,
  computeBoundingBoxCenter,
  translateShape,
  serializeShapeHelper,
} from "../../src/services/occ-helpers";

/**
 * Create a proper OCC box solid and return both the centered BRep
 * and the serialized occBrep string. The occBrep is needed because
 * the worker handler uses it to reconstruct the solid (tessellated
 * BReps produce shells, not solids, which fillet/chamfer reject).
 */
async function createOCCBoxWithOccBrep(
  w: number,
  h: number,
  d: number,
): Promise<{ brep: Brep; occBrep: string }> {
  const oc = await getOcInstance();
  const box = new oc.BRepPrimAPI_MakeBox_2(w, h, d);
  const shape = box.Shape();

  // Center the BRep
  const { brepJson } = ocShapeToBRepHelper(oc, shape, true);
  const brep = Brep.fromJSON(brepJson);

  // Serialize in local space (centered at origin)
  const center = computeBoundingBoxCenter(oc, shape);
  const localShape = translateShape(oc, shape, {
    x: -center.x,
    y: -center.y,
    z: -center.z,
  });
  const occBrep = serializeShapeHelper(oc, localShape);

  return { brep, occBrep };
}

describe("fillet-operations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("filletBRep", () => {
    it("should return FilletResult with brep, positionOffset, and edgeGeometry", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await filletBRep(boxBrep, position, [1], 0.2, occBrep);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep).toBeDefined();
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);
      expect(result.value.positionOffset).toBeDefined();
      expect(result.value.edgeGeometry).toBeDefined();
      expect(result.value.edgeGeometry).toBeInstanceOf(THREE.BufferGeometry);
    });

    it("should produce more geometry than input (fillet adds vertices)", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);
      const originalVertexCount = boxBrep.vertices.length;

      const result = await filletBRep(boxBrep, position, [1], 0.2, occBrep);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(
        originalVertexCount,
      );
    });

    it("should compute reasonable position offset", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await filletBRep(boxBrep, position, [1], 0.2, occBrep);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(typeof result.value.positionOffset.x).toBe("number");
      expect(typeof result.value.positionOffset.y).toBe("number");
      expect(typeof result.value.positionOffset.z).toBe("number");
    });

    it("should include edge geometry with position attribute", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await filletBRep(boxBrep, position, [1], 0.2, occBrep);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.edgeGeometry).toBeDefined();
      expect(
        result.value.edgeGeometry!.attributes.position.count,
      ).toBeGreaterThan(0);
    });

    it("should fillet multiple edges at once", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await filletBRep(
        boxBrep,
        position,
        [1, 2, 3],
        0.2,
        occBrep,
      );

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep).toBeDefined();
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);
      expect(result.value.edgeGeometry).toBeDefined();
    });

    it("should handle empty edge indices array gracefully", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      // No edges to fillet — worker rejects this; expect a discriminated error.
      const result = await filletBRep(boxBrep, position, [], 0.2, occBrep);
      expect(result.ok).toBe(false);
    });

    it("should handle very small fillet radius (0.01)", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await filletBRep(boxBrep, position, [1], 0.01, occBrep);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);
    });

    it("should return discriminated error on fillet failure (radius too large)", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await filletBRep(boxBrep, position, [0], 10, occBrep);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(typeof result.reason).toBe("string");
    });
  });

  describe("chamferBRep", () => {
    it("should produce valid chamfered geometry", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await chamferBRep(boxBrep, position, [1], 0.2, occBrep);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);
      expect(result.value.edgeGeometry).toBeDefined();
    });

    it("should compute reasonable position offset", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await chamferBRep(boxBrep, position, [1], 0.2, occBrep);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(typeof result.value.positionOffset.x).toBe("number");
      expect(typeof result.value.positionOffset.y).toBe("number");
      expect(typeof result.value.positionOffset.z).toBe("number");
    });

    it("should chamfer multiple edges at once", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await chamferBRep(
        boxBrep,
        position,
        [1, 2, 3],
        0.2,
        occBrep,
      );

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);
    });

    it("should handle very small chamfer distance (0.01)", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await chamferBRep(boxBrep, position, [1], 0.01, occBrep);

      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
      expect(result.value.brep.vertices.length).toBeGreaterThan(0);
      expect(result.value.brep.faces.length).toBeGreaterThan(0);
    });

    it("should return discriminated error on chamfer failure", async () => {
      const { brep: boxBrep, occBrep } = await createOCCBoxWithOccBrep(2, 2, 2);
      const position = new THREE.Vector3(0, 0, 0);

      const result = await chamferBRep(boxBrep, position, [0], 5, occBrep);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(typeof result.reason).toBe("string");
    });
  });
});
