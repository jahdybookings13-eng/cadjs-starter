import { describe, expect, it } from "vitest";
import type { Sketch } from "@vitekk02/cadjs";
import { sketchToDxf } from "../sketchDxf";

const sketch: Sketch = {
  id: "s",
  plane: {
    type: "XY",
    origin: { x: 0, y: 0, z: 0 } as never,
    normal: { x: 0, y: 0, z: 1 } as never,
    xAxis: { x: 1, y: 0, z: 0 } as never,
    yAxis: { x: 0, y: 1, z: 0 } as never,
  },
  primitives: [
    { id: "p1", type: "point", x: 0, y: 0 },
    { id: "p2", type: "point", x: 10, y: 0 },
    { id: "p3", type: "point", x: 10, y: 10 },
    { id: "p4", type: "point", x: 0, y: 10 },
    {
      id: "l1",
      type: "line",
      p1Id: "p1",
      p2Id: "p2",
      polylineId: "pl",
      layerId: "walls",
    },
    {
      id: "l2",
      type: "line",
      p1Id: "p2",
      p2Id: "p3",
      polylineId: "pl",
      layerId: "walls",
    },
    {
      id: "l3",
      type: "line",
      p1Id: "p3",
      p2Id: "p4",
      polylineId: "pl",
      layerId: "walls",
    },
    {
      id: "l4",
      type: "line",
      p1Id: "p4",
      p2Id: "p1",
      polylineId: "pl",
      layerId: "walls",
    },
    { id: "c1", type: "circle", centerId: "p1", radius: 3 },
  ],
  constraints: [],
  dof: 0,
  status: "underconstrained",
  layers: [
    {
      id: "layer_0",
      name: "Layer 0",
      color: "#cbd5e1",
      visible: true,
      linetype: "continuous",
    },
    {
      id: "walls",
      name: "WALLS",
      color: "#ef4444",
      visible: true,
      linetype: "dashed",
    },
  ],
};

describe("sketchToDxf", () => {
  it("emits layers, a closed LWPOLYLINE and normal entities", () => {
    const dxf = sketchToDxf(sketch);
    expect(dxf).toContain("$ACADVER");
    expect(dxf).toContain("\nLAYER\n2\nWALLS");
    expect(dxf).toContain("\n6\nDASHED");
    expect(dxf).toContain("\n0\nLWPOLYLINE");
    expect(dxf).toContain("\n90\n4");
    expect(dxf).toContain("\n70\n1");
    expect(dxf).toContain("\n0\nCIRCLE");
    expect(dxf.trim().endsWith("EOF")).toBe(true);
  });
});
