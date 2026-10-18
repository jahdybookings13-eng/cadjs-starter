import { Brep, Face, Edge, Vertex } from "@vitekk02/cadjs";
import { describe, expect, it } from "vitest";
import { faceIndexFromTriangle, faceTagForTriangle } from "../subPrimBridge";
import { ScadgenHistory } from "../featureEngine";
import { scadgenSceneSync } from "../sceneSync";

const mkBrep = () => {
  const v = (x: number, y: number, z: number) => new Vertex(x, y, z);
  const a = v(0, 0, 0);
  const b = v(1, 0, 0);
  const c = v(1, 1, 0);
  const d = v(0, 1, 0);
  const e = v(0, 0, 1);
  const f1 = new Face([a, b, c]);
  const f2 = new Face([a, c, d]);
  const f3 = new Face([a, d, e]);
  const b1 = new Edge(a, b);
  const b2 = new Edge(a, c);
  const b3 = new Edge(a, d);
  return new Brep([a, b, c, d, e], [b1, b2, b3], [f1, f2, f3]);
};

describe("subPrimBridge", () => {
  it("maps triangle vertices to topology face index", () => {
    const brep = mkBrep();
    expect(
      faceIndexFromTriangle(brep, [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
      ]),
    ).toBe(0);
    expect(
      faceIndexFromTriangle(brep, [
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
      ]),
    ).toBe(1);
    expect(
      faceIndexFromTriangle(brep, [
        { x: 5, y: 5, z: 5 },
        { x: 6, y: 5, z: 5 },
        { x: 6, y: 6, z: 5 },
      ]),
    ).toBeNull();
  });
  it("produces owned face tags", () => {
    expect(
      faceTagForTriangle(
        mkBrep(),
        [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
        "Fbox",
      ),
    ).toBe("Fbox_F0");
  });
});

describe("element->feature reverse lookup", () => {
  it("finds authored and mapped owners", () => {
    const h = new ScadgenHistory();
    scadgenSceneSync.configure({ updateElementBrep: () => {} }, h);
    const n = {
      featureId: "F1",
      featureType: "extrude",
      name: "x",
      namespace: "",
      parameters: [],
      subFeatures: [],
      suppressed: false,
      extensions: { elementNodeId: "node_7" },
    };
    h.add(n);
    expect(scadgenSceneSync.featureForElement("node_7")).toBe("F1");
    expect(scadgenSceneSync.featureForElement("node_99")).toBeNull();
  });
});
