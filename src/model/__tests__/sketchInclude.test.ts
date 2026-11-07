import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createSketchPlane } from "@vitekk02/cadjs";
import { includeSelectedEdges } from "../sketchInclude";

let nextId = 0;
const id = (prefix: string) => `${prefix}_${++nextId}`;
const noSection = async () => ({ ok: false as const, reason: "no cut" });

describe("includeSelectedEdges", () => {
  it("projects world-space BRep edge segments into plane coordinates", async () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 10, 0, 0], 3),
    );
    const result = await includeSelectedEdges(
      [
        {
          brep: {} as never,
          position: new THREE.Vector3(1, 2, 3),
          edgeGeometry: geometry,
        },
      ],
      createSketchPlane("XY"),
      id,
      noSection as never,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.primitives).toHaveLength(1);
    expect(result.points.map((point) => [point.x, point.y])).toEqual([
      [1, 2],
      [11, 2],
    ]);
  });

  it("uses the analytic section geometry when the kernel cuts the body", async () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 0, 5, 0], 3),
    );
    const result = await includeSelectedEdges(
      [
        {
          brep: {} as never,
          position: new THREE.Vector3(),
        },
      ],
      createSketchPlane("XY"),
      id,
      (async () => ({
        ok: true as const,
        value: {
          positionOffset: { x: 0, y: 0, z: 0 },
          edgeGeometry: geometry,
        },
      })) as never,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points.map((point) => [point.x, point.y])).toEqual([
      [0, 0],
      [0, 5],
    ]);
  });

  it("refuses a selection with no edge geometry or section", async () => {
    const result = await includeSelectedEdges(
      [{ brep: {} as never, position: new THREE.Vector3() }],
      createSketchPlane("XY"),
      id,
      noSection as never,
    );
    expect(result.ok).toBe(false);
  });
});
