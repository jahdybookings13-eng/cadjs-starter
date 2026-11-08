import * as THREE from "three";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { Brep, Edge, Face, Vertex } from "../../src/geometry";
import type { SceneElement } from "../../src/scene-operations/types";
import { export3mf, import3mf } from "../../src/services/three-mf";

function cube(): SceneElement {
  const v = [
    new Vertex(0, 0, 0),
    new Vertex(10, 0, 0),
    new Vertex(10, 20, 0),
    new Vertex(0, 20, 0),
    new Vertex(0, 0, 30),
    new Vertex(10, 0, 30),
    new Vertex(10, 20, 30),
    new Vertex(0, 20, 30),
  ];
  const edges = [
    new Edge(v[0]!, v[1]!),
    new Edge(v[1]!, v[2]!),
    new Edge(v[2]!, v[3]!),
    new Edge(v[3]!, v[0]!),
    new Edge(v[4]!, v[5]!),
    new Edge(v[5]!, v[6]!),
    new Edge(v[6]!, v[7]!),
    new Edge(v[7]!, v[4]!),
    new Edge(v[0]!, v[4]!),
    new Edge(v[1]!, v[5]!),
    new Edge(v[2]!, v[6]!),
    new Edge(v[3]!, v[7]!),
  ];
  const faces = [
    new Face([v[0]!, v[3]!, v[2]!, v[1]!]),
    new Face([v[4]!, v[5]!, v[6]!, v[7]!]),
    new Face([v[0]!, v[1]!, v[5]!, v[4]!]),
    new Face([v[2]!, v[3]!, v[7]!, v[6]!]),
    new Face([v[1]!, v[2]!, v[6]!, v[5]!]),
    new Face([v[0]!, v[4]!, v[7]!, v[3]!]),
  ];
  return {
    brep: new Brep(v, edges, faces),
    nodeId: "node_3mf" as SceneElement["nodeId"],
    position: new THREE.Vector3(0, 0, 0),
    userData: {
      translationName: "Bracket",
      translationColor: "#ff8800",
    },
  };
}

describe("3MF core service", () => {
  it("round-trips name, colour and repaired triangles", async () => {
    const blob = export3mf([cube()]);
    expect(blob.type).toBe("model/3mf");
    const imported = import3mf(await blob.arrayBuffer());
    expect(imported).toHaveLength(1);
    expect(imported[0]!.name).toBe("Bracket");
    expect(imported[0]!.color).toBe("#ff8800");
    expect(imported[0]!.brep.faces.length).toBeGreaterThan(0);
    expect(imported[0]!.brep.vertices.length).toBeGreaterThan(0);
  });

  it("converts inch-unit models to millimetres", () => {
    const model = `<?xml version="1.0"?>
<model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources><object id="1" type="model"><mesh>
    <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
    <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
  </mesh></object></resources>
  <build><item objectid="1"/></build>
</model>`;
    const zipped = zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "3D/3dmodel.model": strToU8(model),
    });
    const imported = import3mf(zipped.buffer as ArrayBuffer);
    expect(imported[0]!.brep.vertices).toHaveLength(3);
    const xs = imported[0]!.brep.vertices.map((v) => v.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(25.4, 4);
  });

  it("rejects non-ZIP and package-without-model inputs by name", () => {
    expect(() =>
      import3mf(new TextEncoder().encode("not a zip").buffer),
    ).toThrow(/valid ZIP/);
    const empty = zipSync({ "readme.txt": strToU8("no model") });
    expect(() => import3mf(empty.buffer as ArrayBuffer)).toThrow(/no \.model/);
  });

  it("rejects an empty scene on export", () => {
    expect(() => export3mf([])).toThrow(/no elements/);
  });
});
