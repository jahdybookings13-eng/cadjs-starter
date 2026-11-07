import { getOcInstance } from "../../src/services/opencascade-instance";
import type { OpenCascadeInstance, TopoDS_Shape } from "opencascade.js";
import {
  collectSubShapes,
  makeAxis2,
  makeCircle,
  makeDir,
  makePlanarFace,
  makePoint,
  makeWireFromEdge,
  makeWireFromEdges,
} from "../../src/services/occ-facade";
import {
  extrudeShapeHelper,
  ocShapeToBRepHelper,
  serializeShapeHelper,
} from "../../src/services/occ-helpers";
import {
  extrudeShapeHelper,
  ocShapeToBRepHelper,
} from "../../src/services/occ-helpers";
import type { BrepJSON } from "../../src/geometry";
import {
  handleDeleteFace,
  handleDraft,
  handleFillet,
  handleFlange,
  handleHole,
  handlePattern,
  handleProjectCurves,
  handleMoveFace,
  handleSection,
  handleHem,
  handleWrapCurves,
  handleShell,
  handleThread,
  handleSplit,
  handleSurfaceOp,
  handleThicken,
} from "../../src/workers/occ-worker-handlers";

async function cube(
  oc: OpenCascadeInstance,
): Promise<{ json: BrepJSON; faces: number; delete: () => void; shape: TopoDS_Shape }> {
  const pts = [
    makePoint(oc, 0, 0, 0),
    makePoint(oc, 10, 0, 0),
    makePoint(oc, 10, 10, 0),
    makePoint(oc, 0, 10, 0),
  ];
  const edges = pts.map((p, i) => {
    const q = pts[(i + 1) % 4]!;
    const b = new (oc as any).BRepBuilderAPI_MakeEdge_3(p, q);
    const e = b.Edge();
    b.delete();
    return e;
  });
  const wire = makeWireFromEdges(oc, edges);
  const face = makePlanarFace(oc, wire);
  const solid = extrudeShapeHelper(oc, face, 10);
  const { brepJson } = ocShapeToBRepHelper(oc, solid, false);
  const faceCount = collectSubShapes(
    oc,
    solid,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
  ).length;
  return {
    json: brepJson,
    faces: faceCount,
    shape: solid,
    delete: () => {
      solid.delete();
      wire.delete();
      face.delete();
      edges.forEach((e) => e.delete());
      pts.forEach((p) => p.delete());
    },
  };
}

describe("parity worker handlers (real OCC)", () => {
  let oc: OpenCascadeInstance;
  beforeAll(async () => {
    oc = await getOcInstance();
  });

  const origin = { x: 0, y: 0, z: 0 };

  it("shells a solid box: removes the closing face, keeps a hollow", async () => {
    const c = await cube(oc);
    try {
      const res = handleShell(oc, {
        brepJson: c.json,
        position: origin,
        faceIndices: [0],
        thickness: 2,
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(0);
      // 6 outer - 1 removed + inner walls => at least 5 faces survive
      expect(res.brepJson.faces.length).toBeGreaterThanOrEqual(5);
      expect(res.occBrep).toBeTruthy();
    } finally {
      c.delete();
    }
  });

  it("drafts all side faces at 5 degrees without error", async () => {
    const c = await cube(oc);
    try {
      const res = handleDraft(oc, {
        brepJson: c.json,
        position: origin,
        faceIndices: [1, 2, 3, 4, 5].filter((i) => i < c.faces),
        angleDeg: 5,
        neutralNormal: { x: 0, y: 0, z: -1 },
        neutralPoint: { x: 0, y: 0, z: 0 },
      });
      expect(res.brepJson.faces.length).toBeGreaterThanOrEqual(6);
    } finally {
      c.delete();
    }
  });

  it("thickens a cube face into a slab solid", async () => {
    const c = await cube(oc);
    try {
      const res = handleThicken(oc, {
        brepJson: c.json,
        position: origin,
        faceIndices: [0],
        thickness: 2,
      });
      expect(res.brepJson.faces.length).toBeGreaterThanOrEqual(6);
      expect(res.occBrep).toBeTruthy();
    } finally {
      c.delete();
    }
  });

  it("linear-patterns 3 boxes into one fused solid", async () => {
    const c = await cube(oc);
    try {
      const res = handlePattern(oc, {
        brepJson: c.json,
        position: origin,
        kind: "linear",
        count: 3,
        translation: { x: 8, y: 0, z: 0 },
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(c.faces);
    } finally {
      c.delete();
    }
  });

  it("circular-patterns 4 boxes around Z", async () => {
    const c = await cube(oc);
    try {
      const res = handlePattern(oc, {
        brepJson: c.json,
        position: origin,
        kind: "circular",
        count: 4,
        axisOrigin: { x: 0, y: 0, z: 0 },
        axisDir: { x: 0, y: 0, z: 1 },
        angleRad: Math.PI * 2,
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(c.faces);
    } finally {
      c.delete();
    }
  });

  it("curve-patterns 3 boxes along an L path", async () => {
    const c = await cube(oc);
    try {
      const res = handlePattern(oc, {
        brepJson: c.json,
        position: origin,
        kind: "curve",
        count: 3,
        pathPoints: [
          { x: 0, y: 0, z: 0 },
          { x: 40, y: 0, z: 0 },
          { x: 40, y: 40, z: 0 },
        ],
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(c.faces);
    } finally {
      c.delete();
    }
  });

  it("curve-patterns with tangent alignment", async () => {
    const c = await cube(oc);
    try {
      const res = handlePattern(oc, {
        brepJson: c.json,
        position: origin,
        kind: "curve",
        count: 3,
        align: true,
        pathPoints: [
          { x: 0, y: 0, z: 0 },
          { x: 40, y: 0, z: 0 },
          { x: 40, y: 40, z: 0 },
        ],
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(c.faces);
    } finally {
      c.delete();
    }
  });

  it("rejects a curve pattern with an invalid path", async () => {
    const c = await cube(oc);
    try {
      expect(() =>
        handlePattern(oc, {
          brepJson: c.json,
          position: origin,
          kind: "curve",
          count: 3,
        }),
      ).toThrow(/at least 2 path points/);
      expect(() =>
        handlePattern(oc, {
          brepJson: c.json,
          position: origin,
          kind: "curve",
          count: 3,
          pathPoints: [
            { x: 1, y: 1, z: 1 },
            { x: 1, y: 1, z: 1 },
          ],
        }),
      ).toThrow(/zero length/);
    } finally {
      c.delete();
    }
  });

  it("drills a through-hole: adds a cylindrical face", async () => {
    const c = await cube(oc);
    try {
      const res = handleHole(oc, {
        brepJson: c.json,
        position: origin,
        centers: [{ x: 5, y: 5, z: 12 }],
        axisDir: { x: 0, y: 0, z: -1 },
        radius: 2,
        length: 14,
        overdrive: 2,
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(c.faces);
    } finally {
      c.delete();
    }
  });

  it("variable-radius fillet: per-edge radii array", async () => {
    const c = await cube(oc);
    try {
      const res = handleFillet(oc, {
        brepJson: c.json,
        position: origin,
        edgeIndices: [1, 2],
        radius: 2,
        radii: [1, 3],
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(c.faces);
    } finally {
      c.delete();
    }
  });

  it("projects all cube edges along +Z onto the far cap", async () => {
    const c = await cube(oc);
    try {
      const res = handleProjectCurves(oc, {
        brepJson: c.json,
        position: origin,
        targetBrepJson: c.json,
        targetPosition: origin,
        edgeIndices: c.json.edges.map((_, i) => i + 1),
        direction: { x: 0, y: 0, z: 1 },
      });
      expect(res.brepJson.edges.length).toBeGreaterThan(0);
      expect(res.brepJson.faces.length).toBe(0);
    } finally {
      c.delete();
    }
  });

  it("rejects malformed projectCurves requests", async () => {
    const c = await cube(oc);
    try {
      expect(() =>
        handleProjectCurves(oc, {
          brepJson: c.json,
          position: origin,
          targetBrepJson: c.json,
          targetPosition: origin,
          edgeIndices: [1],
          direction: { x: 0, y: 0, z: 0 },
        }),
      ).toThrow(/direction is zero/);
      expect(() =>
        handleProjectCurves(oc, {
          brepJson: c.json,
          position: origin,
          targetBrepJson: c.json,
          targetPosition: origin,
          edgeIndices: [9999],
          direction: { x: 0, y: 0, z: 1 },
        }),
      ).toThrow(/out of range/);
      expect(() =>
        handleProjectCurves(oc, {
          brepJson: c.json,
          position: origin,
          targetBrepJson: c.json,
          targetPosition: origin,
          edgeIndices: [],
          direction: { x: 0, y: 0, z: 1 },
        }),
      ).toThrow(/no edge indices/);
    } finally {
      c.delete();
    }
  });

  it("ruled surface spans two edges of a cube", async () => {
    const c = await cube(oc);
    try {
      const res = handleSurfaceOp(oc, {
        kind: "ruled",
        brepJson: c.json,
        position: origin,
        edgeIndices: [1, 2],
      });
      expect(res.brepJson.faces.length).toBeGreaterThanOrEqual(1);
    } finally {
      c.delete();
    }
  });

  it("fill surface patches across cube edges", async () => {
    const c = await cube(oc);
    try {
      const res = handleSurfaceOp(oc, {
        kind: "fill",
        brepJson: c.json,
        position: origin,
        faceIndex: 0,
      });
      expect(res.brepJson.faces.length).toBeGreaterThanOrEqual(1);
    } finally {
      c.delete();
    }
  });

  it("offset surface refills a planar face at distance", async () => {
    const c = await cube(oc);
    try {
      const res = handleSurfaceOp(oc, {
        kind: "offset",
        brepJson: c.json,
        position: origin,
        faceIndex: 0,
        distance: 3,
      });
      expect(res.brepJson.faces.length).toBe(1);
    } finally {
      c.delete();
    }
  });

  it("rejects malformed surface requests", async () => {
    const c = await cube(oc);
    try {
      expect(() =>
        handleSurfaceOp(oc, {
          kind: "ruled",
          brepJson: c.json,
          position: origin,
          edgeIndices: [1],
        }),
      ).toThrow(/needs >= 2 edges/);
      expect(() =>
        handleSurfaceOp(oc, {
          kind: "ruled",
          brepJson: c.json,
          position: origin,
          edgeIndices: [1, 9999],
        }),
      ).toThrow(/out of range/);
      expect(() =>
        handleSurfaceOp(oc, {
          kind: "offset",
          brepJson: c.json,
          position: origin,
        }),
      ).toThrow(/needs faceIndex/);
    } finally {
      c.delete();
    }
  });

  it("splits the centered cube at x=0 keeping the +X half", async () => {
    const c = await cube(oc);
    try {
      const res = handleSplit(oc, {
        brepJson: c.json,
        position: origin,
        planeOrigin: { x: 0, y: 0, z: 0 },
        planeNormal: { x: 1, y: 0, z: 0 },
      });
      expect(res.brepJson.faces.length).toBeGreaterThanOrEqual(6);
      expect(res.occBrep).toBeTruthy();
    } finally {
      c.delete();
    }
  });

  it("split keep=negative returns the other half", async () => {
    const c = await cube(oc);
    try {
      const pos = handleSplit(oc, {
        brepJson: c.json,
        position: origin,
        planeOrigin: { x: 0, y: 0, z: 0 },
        planeNormal: { x: 1, y: 0, z: 0 },
        keep: "positive",
      });
      const neg = handleSplit(oc, {
        brepJson: c.json,
        position: origin,
        planeOrigin: { x: 0, y: 0, z: 0 },
        planeNormal: { x: 1, y: 0, z: 0 },
        keep: "negative",
      });
      expect(pos.brepJson.faces.length).toBeGreaterThanOrEqual(6);
      expect(neg.brepJson.faces.length).toBeGreaterThanOrEqual(6);
    } finally {
      c.delete();
    }
  });

  it("split with the body entirely on the kept side returns it whole", async () => {
    const c = await cube(oc);
    try {
      const res = handleSplit(oc, {
        brepJson: c.json,
        position: origin,
        planeOrigin: { x: -20, y: 0, z: 0 },
        planeNormal: { x: 1, y: 0, z: 0 },
      });
      expect(res.brepJson.faces.length).toBeGreaterThanOrEqual(6);
    } finally {
      c.delete();
    }
  });

  it("rejects a split whose kept side is empty", async () => {
    const c = await cube(oc);
    try {
      expect(() =>
        handleSplit(oc, {
          brepJson: c.json,
          position: origin,
          planeOrigin: { x: -20, y: 0, z: 0 },
          planeNormal: { x: -1, y: 0, z: 0 },
        }),
      ).toThrow(/discarded side/);
      expect(() =>
        handleSplit(oc, {
          brepJson: c.json,
          position: origin,
          planeOrigin: { x: 0, y: 0, z: 0 },
          planeNormal: { x: 0, y: 0, z: 0 },
        }),
      ).toThrow(/planeNormal is zero/);
    } finally {
      c.delete();
    }
  });

  it("deletes a planar face and heals back to a closed solid", async () => {
    const c = await cube(oc);
    try {
      const res = handleDeleteFace(oc, {
        brepJson: c.json,
        position: origin,
        faceIndices: [0],
      });
      expect(res.brepJson.faces.length).toBeGreaterThanOrEqual(6);
      expect(res.occBrep).toBeTruthy();
    } finally {
      c.delete();
    }
  });

  it("hem folds a lip back over the sheet (135deg raised fold)", async () => {
    const box = new oc.BRepPrimAPI_MakeBox_3(
      new oc.gp_Pnt_3(0, 0, 0),
      10,
      10,
      1,
    );
    const base = box.Shape();
    const { brepJson } = ocShapeToBRepHelper(oc, base, false);
    try {
      const hem = handleHem(oc, {
        brepJson,
        position: origin,
        origin: { x: 5, y: 10, z: 0.5 },
        bendDir: { x: 0, y: 1, z: 0 },
        bendLineDir: { x: 1, y: 0, z: 0 },
        thickness: 1,
        lip: 3,
        relief: 0.6,
        radius: 0.75,
      });
      expect(hem.brepJson.faces.length).toBeGreaterThan(6);
      expect(hem.occBrep).toBeTruthy();
    } finally {
      base.delete();
      box.delete();
    }
  }, 180000);

  it("wrap maps unfolded polylines onto a cylinder as surface edges", async () => {
    const c0 = makePoint(oc, 0, 0, 0);
    const ax = makeAxis2(oc, c0, makeDir(oc, 0, 0, 1));
    const circ = makeCircle(oc, ax, 5);
    const eb = new oc.BRepBuilderAPI_MakeEdge_8(circ);
    const w = makeWireFromEdge(oc, eb.Edge());
    const face = makePlanarFace(oc, w);
    const cyl = extrudeShapeHelper(oc, face, 10);
    const { brepJson } = ocShapeToBRepHelper(oc, cyl, false);
    try {
      const res = handleWrapCurves(oc, {
        brepJson,
        position: origin,
        axisOrigin: { x: 0, y: 0, z: 0 },
        axisDir: { x: 0, y: 0, z: 1 },
        radius: 5,
        polylines: [
          [
            [0, 5],
            [3.14, 5],
            [6.28, 5],
          ],
          [
            [1, 1],
            [2, 8],
          ],
        ],
      });
      expect(res.brepJson.edges.length).toBeGreaterThanOrEqual(2);
      expect(res.brepJson.faces.length).toBe(0);
    } finally {
      cyl.delete();
      w.delete();
      face.delete();
      eb.delete();
      circ.delete();
      ax.delete();
      c0.delete();
    }
  }, 120000);

  it("threads a cylinder: helical ridge cut adds faces", async () => {
    const c0 = makePoint(oc, 0, 0, 0);
    const ax = makeAxis2(oc, c0, makeDir(oc, 0, 0, 1));
    const circ = makeCircle(oc, ax, 5);
    const eb = new oc.BRepBuilderAPI_MakeEdge_8(circ);
    const ce = eb.Edge();
    const w = makeWireFromEdge(oc, ce);
    const face = makePlanarFace(oc, w);
    const cyl = extrudeShapeHelper(oc, face, 10);
    const { brepJson } = ocShapeToBRepHelper(oc, cyl, false);
    try {
      const t0 = Date.now();
      const res = handleThread(oc, {
        brepJson,
        position: origin,
        origin: { x: 0, y: 0, z: 1 },
        axisDir: { x: 0, y: 0, z: 1 },
        radius: 5,
        pitch: 2,
        height: 4,
        depth: 0.6,
        kind: "external",
      });
      console.log("THREADMS", Date.now() - t0);
      expect(res.brepJson.faces.length).toBeGreaterThan(3);
      expect(res.occBrep).toBeTruthy();
    } finally {
      cyl.delete();
      w.delete();
      face.delete();
      ce.delete();
      eb.delete();
      circ.delete();
      ax.delete();
      c0.delete();
    }
  }, 120000);

  it("move-face trims a cube cap flush (negative) and bosses (positive)", async () => {
    const c = await cube(oc);
    try {
      const cut = handleMoveFace(oc, {
        brepJson: c.json,
        position: origin,
        faceIndex: 0,
        distance: -3,
      });
      expect(cut.brepJson.faces.length).toBeGreaterThanOrEqual(6);
      const boss = handleMoveFace(oc, {
        brepJson: c.json,
        position: origin,
        faceIndex: 1,
        distance: 2,
      });
      expect(boss.brepJson.faces.length).toBeGreaterThan(0);
      expect(() =>
        handleMoveFace(oc, {
          brepJson: c.json,
          position: origin,
          faceIndex: 999,
          distance: -1,
        }),
      ).toThrow(/out of range/);
      expect(() =>
        handleMoveFace(oc, {
          brepJson: c.json,
          position: origin,
          faceIndex: 0,
          distance: 0,
        }),
      ).toThrow(/distance is zero/);
    } finally {
      c.delete();
    }
  });

  it("section cuts a wire loop out of the cube mid-plane", async () => {
    const c = await cube(oc);
    try {
      const res = handleSection(oc, {
        brepJson: c.json,
        position: origin,
        planeOrigin: { x: 0, y: 0, z: 0 },
        planeNormal: { x: 0, y: 0, z: 1 },
      });
      expect(res.brepJson.edges.length).toBeGreaterThanOrEqual(4);
      expect(() =>
        handleSection(oc, {
          brepJson: c.json,
          position: origin,
          planeOrigin: { x: 0, y: 0, z: 50 },
          planeNormal: { x: 0, y: 0, z: 1 },
        }),
      ).toThrow(/does not cut/);
    } finally {
      c.delete();
    }
  });

  it("delete-face caps a curved cylinder side boundary with MakeFilling", async () => {
    const c0 = makePoint(oc, 0, 0, 0);
    const ax = makeAxis2(oc, c0, makeDir(oc, 0, 0, 1));
    const circ = makeCircle(oc, ax, 5);
    const eb = new oc.BRepBuilderAPI_MakeEdge_8(circ);
    const ce = eb.Edge();
    const wire = makeWireFromEdge(oc, ce);
    const face = makePlanarFace(oc, wire);
    const solid = extrudeShapeHelper(oc, face, 10);
    const { brepJson } = ocShapeToBRepHelper(oc, solid, false);
    try {
      // a side-strip face: its boundary arcs sit at different heights, so the
      // refill must fall through planar-fill to the MakeFilling cap.
      const sideIdx = brepJson.faces.findIndex((f) => {
        const vs = f.vertices ?? [];
        return vs.some((v) => Math.abs(v.z - (vs[0]?.z ?? 0)) > 1);
      });
      expect(sideIdx).toBeGreaterThan(-1);
      const res = handleDeleteFace(oc, {
        brepJson,
        position: origin,
        faceIndices: [sideIdx],
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(0);
      expect(res.occBrep).toBeTruthy();
    } finally {
      solid.delete();
      wire.delete();
      face.delete();
      ce.delete();
      eb.delete();
      circ.delete();
      ax.delete();
      c0.delete();
    }
  }, 120000);

  it("delete-face fill-cap fallback runs on a real (serialized) cylinder side", async () => {
    const c0 = makePoint(oc, 0, 0, 0);
    const ax = makeAxis2(oc, c0, makeDir(oc, 0, 0, 1));
    const circ = makeCircle(oc, ax, 5);
    const eb = new oc.BRepBuilderAPI_MakeEdge_8(circ);
    const ce = eb.Edge();
    const wire = makeWireFromEdge(oc, ce);
    const face = makePlanarFace(oc, wire);
    const solid = extrudeShapeHelper(oc, face, 10);
    const occ = serializeShapeHelper(oc, solid);
    const { brepJson } = ocShapeToBRepHelper(oc, solid, false);
    try {
      // Real faces survive serialization: 3 faces (2 caps + side). Delete the
      // SIDE (non-planar boundary: two arcs + lines) → planar fill throws →
      // MakeFilling cap path must close the shell.
      const res = handleDeleteFace(oc, {
        brepJson,
        position: origin,
        occBrep: occ,
        faceIndices: [2],
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(0);
    } finally {
      solid.delete();
      wire.delete();
      face.delete();
      ce.delete();
      eb.delete();
      circ.delete();
      ax.delete();
      c0.delete();
    }
  });

  it("rejects bad delete-face selections", async () => {
    const c = await cube(oc);
    try {
      expect(() =>
        handleDeleteFace(oc, {
          brepJson: c.json,
          position: origin,
          faceIndices: [99],
        }),
      ).toThrow(/out of range/);
      const all = c.json.faces.map((_, i) => i);
      expect(() =>
        handleDeleteFace(oc, {
          brepJson: c.json,
          position: origin,
          faceIndices: all,
        }),
      ).toThrow(/every face/);
      expect(() =>
        handleDeleteFace(oc, {
          brepJson: c.json,
          position: origin,
          faceIndices: [],
        }),
      ).toThrow(/no faces/);
    } finally {
      c.delete();
    }
  });

  it("rejects bad face indices instead of crashing OCC", async () => {
    const c = await cube(oc);
    try {
      expect(() =>
        handleShell(oc, {
          brepJson: c.json,
          position: origin,
          faceIndices: [99],
          thickness: 1,
        }),
      ).toThrow(/out of range/);
    } finally {
      c.delete();
    }
  });

  it("flanges a 90-degree upstanding plate onto the cube's top edge", async () => {
    const c = await cube(oc);
    try {
      const res = handleFlange(oc, {
        brepJson: c.json,
        position: origin,
        origin: { x: 0, y: 10, z: 10 },
        bendLineDir: { x: 1, y: 0, z: 0 },
        bendDir: { x: 0, y: 1, z: 0 },
        angle: Math.PI / 2,
        thickness: 2,
        relief: 0,
        length: 8,
        width: 10,
      });
      expect(res.brepJson.faces.length).toBeGreaterThanOrEqual(7);
      expect(res.occBrep).toBeTruthy();
      expect(() =>
        handleFlange(oc, {
          brepJson: c.json,
          position: origin,
          origin: { x: 0, y: 10, z: 10 },
          bendLineDir: { x: 1, y: 0, z: 0 },
          bendDir: { x: 1, y: 0, z: 0 },
          angle: Math.PI / 2,
          thickness: 2,
          relief: 0,
        }),
      ).toThrow(/parallel/);
    } finally {
      c.delete();
    }
  }, 120000);

  it("rounded flange bends with an inside radius (bend loft)", async () => {
    const c = await cube(oc);
    try {
      const res = handleFlange(oc, {
        brepJson: c.json,
        position: origin,
        origin: { x: 0, y: 10, z: 10 },
        bendLineDir: { x: 1, y: 0, z: 0 },
        bendDir: { x: 0, y: 1, z: 0 },
        angle: Math.PI / 2,
        thickness: 2,
        relief: 0,
        length: 8,
        width: 10,
        radius: 1.5,
      });
      expect(res.brepJson.faces.length).toBeGreaterThan(7);
      expect(res.occBrep).toBeTruthy();
    } finally {
      c.delete();
    }
  }, 180000);

  it("flange bend relief cuts notches at the bend-line ends", async () => {
    const c = await cube(oc);
    try {
      const plain = handleFlange(oc, {
        brepJson: c.json,
        position: origin,
        origin: { x: 0, y: 10, z: 10 },
        bendLineDir: { x: 1, y: 0, z: 0 },
        bendDir: { x: 0, y: 1, z: 0 },
        angle: 0,
        thickness: 2,
        relief: 0,
        length: 6,
        width: 10,
      });
      const relieved = handleFlange(oc, {
        brepJson: c.json,
        position: origin,
        origin: { x: 0, y: 10, z: 10 },
        bendLineDir: { x: 1, y: 0, z: 0 },
        bendDir: { x: 0, y: 1, z: 0 },
        angle: 0,
        thickness: 2,
        relief: 1.5,
        length: 6,
        width: 10,
      });
      expect(relieved.brepJson.faces.length).toBeGreaterThan(
        plain.brepJson.faces.length,
      );
    } finally {
      c.delete();
    }
  }, 120000);
});
