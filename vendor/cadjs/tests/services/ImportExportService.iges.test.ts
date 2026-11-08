import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ImportExportService } from "../../src/services/ImportExportService";
import { Brep, Edge, Face, Vertex } from "../../src/geometry";
import type { SceneElement } from "../../src/scene-operations/types";

function boxElement(): SceneElement {
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
    nodeId: "node_iges" as SceneElement["nodeId"],
    position: new THREE.Vector3(0, 0, 0),
  };
}

describe("ImportExportService IGES and 3MF", () => {
  const service = ImportExportService.getInstance();

  it("exports an IGES blob and imports it back as a solid", async () => {
    const blob = await service.exportIges([boxElement()]);
    expect(blob.type).toBe("model/iges");

    const bytes = await blob.arrayBuffer();
    expect(new TextDecoder().decode(bytes)).toContain("IGES");

    const imported = await service.importIges(bytes);
    expect(imported).toHaveLength(1);
    expect(imported[0]!.brep.faces.length).toBeGreaterThan(0);
    expect(imported[0]!.occBrep).toBeTruthy();
  });

  it("exports and reimports a 3MF package through the service", async () => {
    const element = boxElement();
    element.userData = { translationName: "Service Box" };
    const blob = await service.export3mf([element]);
    expect(blob.type).toBe("model/3mf");
    const imported = await service.import3mf(await blob.arrayBuffer());
    expect(imported).toHaveLength(1);
    expect(imported[0]!.name).toBe("Service Box");
    expect(imported[0]!.brep.faces.length).toBeGreaterThan(0);
  });
});
