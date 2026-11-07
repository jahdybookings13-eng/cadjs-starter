import * as THREE from "three";
import {
  createSketchPlane,
  createSketchPlaneFromNormal,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  SketchPrimitive,
} from "../../src/types/sketch-types";

describe("createSketchPlane", () => {
  it("XY plane has normal=(0,0,1), xAxis=(1,0,0), yAxis=(0,1,0)", () => {
    const plane = createSketchPlane("XY");
    expect(plane.type).toBe("XY");
    expect(plane.normal).toEqual(new THREE.Vector3(0, 0, 1));
    expect(plane.xAxis).toEqual(new THREE.Vector3(1, 0, 0));
    expect(plane.yAxis).toEqual(new THREE.Vector3(0, 1, 0));
  });

  it("XZ plane has normal=(0,1,0), xAxis=(1,0,0), yAxis=(0,0,1)", () => {
    const plane = createSketchPlane("XZ");
    expect(plane.type).toBe("XZ");
    expect(plane.normal).toEqual(new THREE.Vector3(0, 1, 0));
    expect(plane.xAxis).toEqual(new THREE.Vector3(1, 0, 0));
    expect(plane.yAxis).toEqual(new THREE.Vector3(0, 0, 1));
  });

  it("YZ plane has normal=(1,0,0), xAxis=(0,1,0), yAxis=(0,0,1)", () => {
    const plane = createSketchPlane("YZ");
    expect(plane.type).toBe("YZ");
    expect(plane.normal).toEqual(new THREE.Vector3(1, 0, 0));
    expect(plane.xAxis).toEqual(new THREE.Vector3(0, 1, 0));
    expect(plane.yAxis).toEqual(new THREE.Vector3(0, 0, 1));
  });

  it("preserves a custom origin", () => {
    const origin = new THREE.Vector3(5, 10, 15);
    const plane = createSketchPlane("XY", origin);
    expect(plane.origin).toEqual(new THREE.Vector3(5, 10, 15));
  });

  it("defaults origin to (0,0,0) when not provided", () => {
    const plane = createSketchPlane("XZ");
    expect(plane.origin).toEqual(new THREE.Vector3(0, 0, 0));
  });

  it("offset type defaults to XY-like plane", () => {
    const plane = createSketchPlane("offset" as any);
    expect(plane.normal).toEqual(new THREE.Vector3(0, 0, 1));
    expect(plane.xAxis).toEqual(new THREE.Vector3(1, 0, 0));
    expect(plane.yAxis).toEqual(new THREE.Vector3(0, 1, 0));
  });
});

describe("createSketchPlaneFromNormal", () => {
  it("normal along Z produces type 'offset' with right-handed axes", () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const origin = new THREE.Vector3(0, 0, 0);
    const plane = createSketchPlaneFromNormal(normal, origin);

    expect(plane.type).toBe("offset");

    // Axes should form a right-handed system: xAxis x yAxis = normal direction
    const cross = new THREE.Vector3().crossVectors(plane.xAxis, plane.yAxis);
    expect(cross.x).toBeCloseTo(plane.normal.x, 5);
    expect(cross.y).toBeCloseTo(plane.normal.y, 5);
    expect(cross.z).toBeCloseTo(plane.normal.z, 5);
  });

  it("normal along Y uses X as reference axis (dot(n,worldY) > 0.9)", () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const origin = new THREE.Vector3(0, 0, 0);
    const plane = createSketchPlaneFromNormal(normal, origin);

    // xAxis should be perpendicular to both normal and the X reference
    expect(plane.xAxis.dot(plane.normal)).toBeCloseTo(0, 5);
    expect(plane.yAxis.dot(plane.normal)).toBeCloseTo(0, 5);
  });

  it("arbitrary diagonal normal produces mutually perpendicular axes", () => {
    const normal = new THREE.Vector3(1, 1, 1);
    const origin = new THREE.Vector3(0, 0, 0);
    const plane = createSketchPlaneFromNormal(normal, origin);

    expect(plane.normal.dot(plane.xAxis)).toBeCloseTo(0, 5);
    expect(plane.normal.dot(plane.yAxis)).toBeCloseTo(0, 5);
    expect(plane.xAxis.dot(plane.yAxis)).toBeCloseTo(0, 5);
  });

  it("all axes are unit length", () => {
    const normal = new THREE.Vector3(3, -2, 7);
    const origin = new THREE.Vector3(0, 0, 0);
    const plane = createSketchPlaneFromNormal(normal, origin);

    expect(plane.normal.length()).toBeCloseTo(1, 5);
    expect(plane.xAxis.length()).toBeCloseTo(1, 5);
    expect(plane.yAxis.length()).toBeCloseTo(1, 5);
  });

  it("with sourceElementId the type is 'face'", () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const origin = new THREE.Vector3(0, 0, 0);
    const plane = createSketchPlaneFromNormal(normal, origin, "element-42");

    expect(plane.type).toBe("face");
    expect(plane.sourceElementId).toBe("element-42");
  });

  it("without sourceElementId the type is 'offset'", () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const origin = new THREE.Vector3(0, 0, 0);
    const plane = createSketchPlaneFromNormal(normal, origin);

    expect(plane.type).toBe("offset");
    expect(plane.sourceElementId).toBeUndefined();
  });

  it("preserves the provided origin", () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const origin = new THREE.Vector3(-3, 7.5, 22);
    const plane = createSketchPlaneFromNormal(normal, origin);

    expect(plane.origin).toEqual(new THREE.Vector3(-3, 7.5, 22));
  });
});

describe("type guards", () => {
  const point: SketchPrimitive = { id: "p1", type: "point", x: 0, y: 0 };
  const line: SketchPrimitive = {
    id: "l1",
    type: "line",
    p1Id: "p1",
    p2Id: "p2",
  };
  const circle: SketchPrimitive = {
    id: "c1",
    type: "circle",
    centerId: "p1",
    radius: 5,
  };
  const arc: SketchPrimitive = {
    id: "a1",
    type: "arc",
    centerId: "p1",
    startId: "p2",
    endId: "p3",
    radius: 5,
  };

  const allPrimitives = [point, line, circle, arc];

  it("isSketchPoint returns true only for point", () => {
    expect(isSketchPoint(point)).toBe(true);
    for (const prim of allPrimitives.filter((p) => p !== point)) {
      expect(isSketchPoint(prim)).toBe(false);
    }
  });

  it("isSketchLine returns true only for line", () => {
    expect(isSketchLine(line)).toBe(true);
    for (const prim of allPrimitives.filter((p) => p !== line)) {
      expect(isSketchLine(prim)).toBe(false);
    }
  });

  it("isSketchCircle returns true only for circle", () => {
    expect(isSketchCircle(circle)).toBe(true);
    for (const prim of allPrimitives.filter((p) => p !== circle)) {
      expect(isSketchCircle(prim)).toBe(false);
    }
  });

  it("isSketchArc returns true only for arc", () => {
    expect(isSketchArc(arc)).toBe(true);
    for (const prim of allPrimitives.filter((p) => p !== arc)) {
      expect(isSketchArc(prim)).toBe(false);
    }
  });
});
