import { describe, expect, it } from "vitest";
import {
  SIM_MAX_ELEMENTS,
  SIM_SCHEMA,
  assignSimMaterial,
  buildSimulationReport,
  demoBracketBody,
  emptySimulationDocument,
  materialForBody,
  parseSimulationDocument,
  serializeSimulationDocument,
  simulateBuckling,
  simulateContacts,
  simulateStatic,
  simulateModal,
  simulateThermal,
  validateSimulationDocument,
  type SimBodySource,
  type SimContactPair,
  type SimTriangle,
} from "..";
import { generateVolumeMesh } from "../mesh";

function boxBody(): SimBodySource {
  const p = (x: number, y: number, z: number) => ({ x, y, z });
  const triangles: SimTriangle[] = [];
  const corners = [
    p(0, 0, 0),
    p(40, 0, 0),
    p(40, 20, 0),
    p(0, 20, 0),
    p(0, 0, 10),
    p(40, 0, 10),
    p(40, 20, 10),
    p(0, 20, 10),
  ];
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [3, 7, 6, 2],
    [0, 4, 7, 3],
    [1, 2, 6, 5],
  ];
  for (const face of faces) {
    const a = corners[face[0]!]!;
    const b = corners[face[1]!]!;
    const c = corners[face[2]!]!;
    const d = corners[face[3]!]!;
    triangles.push({ a, b, c }, { a, b: c, c: d });
  }
  return { id: "box", name: "Box", triangles };
}

function demoDocument() {
  const document = emptySimulationDocument("Bracket study");
  const body = demoBracketBody();
  return {
    ...document,
    body,
    fixtures: document.fixtures.map((fixture) => ({
      ...fixture,
      bodyId: body.id,
    })),
    loads: document.loads.map((load) => ({ ...load, bodyId: body.id })),
  };
}

describe("Simulation mesh generation", () => {
  it("meshes a closed body into boundary-conforming tetrahedra", async () => {
    const body = boxBody();
    const mesh = await generateVolumeMesh(body, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    expect(mesh.bodyId).toBe("box");
    expect(mesh.elementType).toBe("tet4");
    expect(mesh.elements.length).toBeGreaterThan(100);
    expect(mesh.elements.every((element) => element.length === 4)).toBe(true);
    expect(mesh.nodes.length).toBeGreaterThan(8);
    expect(mesh.openEdges).toBe(0);
    expect(mesh.nonManifoldEdges).toBe(0);
    expect(mesh.volume).toBeCloseTo(40 * 20 * 10, 3);
    expect(mesh.minQuality).toBeGreaterThanOrEqual(0.05);

    // Every node is inside the source box and the six source planes are
    // represented by actual boundary nodes. A voxel mesh would also satisfy
    // the bounds check, but its boundary would be quantised to a grid; Gmsh's
    // tets additionally carry the exact source volume above.
    for (const node of mesh.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(-1e-6);
      expect(node.x).toBeLessThanOrEqual(40 + 1e-6);
      expect(node.y).toBeGreaterThanOrEqual(-1e-6);
      expect(node.y).toBeLessThanOrEqual(20 + 1e-6);
      expect(node.z).toBeGreaterThanOrEqual(-1e-6);
      expect(node.z).toBeLessThanOrEqual(10 + 1e-6);
    }
    expect(mesh.nodes.some((node) => Math.abs(node.x) < 1e-6)).toBe(true);
    expect(mesh.nodes.some((node) => Math.abs(node.x - 40) < 1e-6)).toBe(true);
    expect(mesh.nodes.some((node) => Math.abs(node.z) < 1e-6)).toBe(true);
    expect(mesh.nodes.some((node) => Math.abs(node.z - 10) < 1e-6)).toBe(true);
  });

  it("names open shells, non-manifold edges and zero volume", async () => {
    const open = boxBody();
    open.triangles.pop();
    await expect(
      generateVolumeMesh(open, {
        units: "mm",
        cellSize: 10,
        minQuality: 0.05,
        maxElements: 1_000,
      }),
    ).rejects.toThrowError(/open shell/);

    const nonManifold = boxBody();
    nonManifold.triangles.push(nonManifold.triangles[0]!);
    await expect(
      generateVolumeMesh(nonManifold, {
        units: "mm",
        cellSize: 10,
        minQuality: 0.05,
        maxElements: 1_000,
      }),
    ).rejects.toThrowError(/non-manifold/);

    const flat: SimBodySource = {
      id: "flat",
      name: "Flat",
      triangles: [
        {
          a: { x: 0, y: 0, z: 0 },
          b: { x: 10, y: 0, z: 0 },
          c: { x: 0, y: 10, z: 0 },
        },
      ],
    };
    await expect(
      generateVolumeMesh(flat, {
        units: "mm",
        cellSize: 1,
        minQuality: 0.05,
        maxElements: 1_000,
      }),
    ).rejects.toThrowError(/closed|open|zero/i);
  });

  it("enforces the element cap instead of exhausting memory", async () => {
    await expect(
      generateVolumeMesh(boxBody(), {
        units: "mm",
        cellSize: 1,
        minQuality: 0.05,
        maxElements: 100,
      }),
    ).rejects.toThrowError(/element limit|would need/);
  });

  it("rejects a mesh setting above the global browser ceiling", () => {
    const document = demoDocument();
    document.settings.maxElements = SIM_MAX_ELEMENTS + 1;
    expect(
      validateSimulationDocument(document).map((issue) => issue.code),
    ).toContain("SIM_MESH_LIMIT");
  });

  it("honours mesh cancellation and deadlines before native work", async () => {
    const options = {
      units: "mm" as const,
      cellSize: 5,
      minQuality: 0.05,
      maxElements: 2_000,
    };
    await expect(
      generateVolumeMesh(boxBody(), {
        ...options,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrowError(/cancelled/);
    await expect(
      generateVolumeMesh(boxBody(), {
        ...options,
        deadlineMs: performance.now() - 1,
      }),
    ).rejects.toThrowError(/budget/);
  });
});

describe("Simulation materials, selections and persistence", () => {
  it("assigns a local material per body and rejects missing materials", () => {
    const document = demoDocument();
    const material = document.materials[0]!;
    expect(materialForBody(document, document.body!.id)?.id).toBe(material.id);
    expect(() =>
      assignSimMaterial(document, document.body!.id, "missing"),
    ).toThrowError(/local library/);
  });

  it("rejects a selection from a body that is not meshed", async () => {
    const document = demoDocument();
    document.mesh = await generateVolumeMesh(document.body!, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    document.fixtures[0] = { ...document.fixtures[0]!, bodyId: "other" };
    const issues = validateSimulationDocument(document);
    expect(issues.map((issue) => issue.code)).toContain("SIM_SELECTION_BODY");
  });

  it("round-trips the mesh and solves a static case", async () => {
    const document = demoDocument();
    document.mesh = await generateVolumeMesh(document.body!, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    const parsed = parseSimulationDocument(
      serializeSimulationDocument(document),
    );
    expect(parsed).toEqual(document);
    expect(parsed.schema).toBe(SIM_SCHEMA);
    expect(parsed.mesh!.elementType).toBe("tet4");
    const material = materialForBody(parsed, parsed.mesh!.bodyId)!;
    const result = simulateStatic(parsed, material, { maxIterations: 4_000 });
    expect(result.maxDisplacementM).toBeGreaterThan(0);
    expect(result.maxVonMisesPa).toBeGreaterThan(0);
    expect(result.vonMisesPa.length).toBe(parsed.mesh!.elements.length);
    expect(result.reactionsN.length).toBeGreaterThan(0);
    expect(result.iterations).toBeGreaterThan(0);
    expect(() =>
      simulateStatic(parsed, material, { shouldCancel: () => true }),
    ).toThrowError(/cancelled/);
    expect(() =>
      simulateStatic(parsed, material, { deadlineMs: performance.now() - 1 }),
    ).toThrowError(/time budget/);
    expect(() =>
      simulateModal(parsed, material, {
        modes: 2,
        shouldCancel: () => true,
      }),
    ).toThrowError(/cancelled/);
  });

  it("names missing meshes and unconstrained cases", async () => {
    const document = demoDocument();
    const material = materialForBody(document, document.body!.id)!;
    expect(() => simulateStatic(document, material)).toThrowError(/mesh/i);
    document.mesh = await generateVolumeMesh(document.body!, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    document.fixtures = [];
    expect(() => simulateStatic(document, material)).toThrowError(/rigid-body/);
    const freeModal = simulateModal(document, material, { modes: 2 });
    expect(freeModal.rigidModes).toBe(6);
    expect(freeModal.modes.filter((mode) => mode.rigid)).toHaveLength(6);
    expect(freeModal.modes.filter((mode) => !mode.rigid)).toHaveLength(2);
  }, 20_000);

  it("applies pressure, gravity, thermal and remote loads", async () => {
    const document = emptySimulationDocument("Load cases");
    const body = boxBody();
    document.body = body;
    document.mesh = await generateVolumeMesh(body, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    document.fixtures = [
      {
        id: "fixed",
        name: "Fixed root",
        kind: "fixed",
        bodyId: body.id,
        face: "x-min",
      },
    ];
    const material = materialForBody(document, body.id)!;
    const loads = [
      {
        id: "pressure",
        name: "Pressure",
        kind: "pressure" as const,
        bodyId: body.id,
        face: "z-max" as const,
        vector: { x: 0, y: 0, z: 0 },
        magnitude: 1_000,
        temperatureDelta: 0,
        remotePoint: { x: 0, y: 0, z: 0 },
      },
      {
        id: "gravity",
        name: "Gravity",
        kind: "gravity" as const,
        bodyId: body.id,
        face: "z-max" as const,
        vector: { x: 0, y: 0, z: 0 },
        magnitude: 9.80665,
        temperatureDelta: 0,
        remotePoint: { x: 0, y: 0, z: 0 },
      },
      {
        id: "thermal",
        name: "Thermal",
        kind: "thermal" as const,
        bodyId: body.id,
        face: "z-max" as const,
        vector: { x: 0, y: 0, z: 0 },
        magnitude: 0,
        temperatureDelta: 50,
        remotePoint: { x: 0, y: 0, z: 0 },
      },
      {
        id: "remote",
        name: "Remote force",
        kind: "remote" as const,
        bodyId: body.id,
        face: "z-max" as const,
        vector: { x: 0, y: 0, z: -1_000 },
        magnitude: 0,
        temperatureDelta: 0,
        remotePoint: { x: 20, y: 10, z: 20 },
      },
    ];
    for (const load of loads) {
      document.loads = [load];
      const result = simulateStatic(document, material);
      expect(Number.isFinite(result.maxDisplacementM)).toBe(true);
      expect(result.maxDisplacementM).toBeGreaterThan(0);
    }
  });

  it("names a singular roller-only stiffness", async () => {
    const document = demoDocument();
    document.mesh = await generateVolumeMesh(document.body!, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    document.fixtures = [
      {
        id: "roller",
        name: "Roller",
        kind: "roller",
        bodyId: document.mesh.bodyId,
        face: "x-min",
      },
    ];
    const material = materialForBody(document, document.mesh.bodyId)!;
    expect(() => simulateStatic(document, material)).toThrowError(
      /singular|converge|rigid/i,
    );
  });

  it("solves a constrained modal case", async () => {
    const document = demoDocument();
    document.mesh = await generateVolumeMesh(document.body!, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    const material = materialForBody(document, document.mesh.bodyId)!;
    const result = simulateModal(document, material, {
      modes: 3,
      maxIterations: 1_000,
    });
    expect(result.modes).toHaveLength(3);
    expect(result.modes.every((mode) => mode.frequencyHz > 0)).toBe(true);
    expect(result.modes[0]!.shape.length).toBe(document.mesh.nodes.length * 3);
  });
});

describe("Thermal analysis", () => {
  it("solves fixed-temperature conduction and reports nodal extrema", async () => {
    const document = demoDocument();
    document.mesh = await generateVolumeMesh(document.body!, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    const material = materialForBody(document, document.mesh.bodyId)!;
    const result = simulateThermal(document, material);
    expect(result.temperaturesC).toHaveLength(document.mesh.nodes.length);
    expect(result.minTemperatureC).toBeCloseTo(20, 5);
    expect(result.maxTemperatureC).toBeCloseTo(100, 5);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.solveMs).toBeGreaterThanOrEqual(0);
  });

  it("combines heat flux and convection and names an unanchored case", async () => {
    const document = demoDocument();
    document.mesh = await generateVolumeMesh(document.body!, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    const material = materialForBody(document, document.mesh.bodyId)!;
    document.thermalBoundaries = [
      {
        id: "cold",
        name: "Cold face",
        kind: "temperature",
        bodyId: document.mesh.bodyId,
        face: "x-min",
        value: 20,
        coefficient: 0,
      },
      {
        id: "flux",
        name: "Heat flux",
        kind: "heat-flux",
        bodyId: document.mesh.bodyId,
        face: "x-max",
        value: 50_000,
        coefficient: 0,
      },
      {
        id: "convection",
        name: "Convection",
        kind: "convection",
        bodyId: document.mesh.bodyId,
        face: "y-max",
        value: 20,
        coefficient: 15,
      },
    ];
    const result = simulateThermal(document, material);
    expect(result.maxTemperatureC).toBeGreaterThan(result.minTemperatureC);
    expect(result.appliedHeatFluxW).toBeGreaterThan(0);

    document.thermalBoundaries = [document.thermalBoundaries[1]!];
    expect(() => simulateThermal(document, material)).toThrowError(
      /absolute temperature|convection/i,
    );
    document.thermalBoundaries = [];
    expect(() => simulateThermal(document, material)).toThrowError(/boundary/i);
  });
});

describe("Buckling analysis", () => {
  it("returns positive load multipliers and full mode shapes", async () => {
    const body = boxBody();
    const document = emptySimulationDocument("Column buckling");
    document.body = body;
    document.mesh = await generateVolumeMesh(body, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    document.fixtures = [
      {
        id: "base",
        name: "Base",
        kind: "fixed",
        bodyId: body.id,
        face: "z-min",
      },
    ];
    document.loads = [
      {
        id: "compression",
        name: "Compression",
        kind: "force",
        bodyId: body.id,
        face: "z-max",
        vector: { x: 0, y: 0, z: -50_000 },
        magnitude: 0,
        temperatureDelta: 0,
        remotePoint: { x: 0, y: 0, z: 0 },
      },
    ];
    const material = materialForBody(document, body.id)!;
    const result = simulateBuckling(document, material, {
      modes: 2,
      maxIterations: 20,
    });
    expect(result.modes.length).toBeGreaterThan(0);
    expect(result.modes.every((mode) => mode.multiplier > 0)).toBe(true);
    expect(result.modes[0]!.shape).toHaveLength(document.mesh.nodes.length * 3);
    expect(result.solveMs).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it("names a missing preload", () => {
    const document = demoDocument();
    document.mesh = {
      bodyId: document.body!.id,
      bodyName: document.body!.name,
      units: "mm",
      elementType: "tet4",
      cellSize: 10,
      nodes: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: 1 },
      ],
      elements: [[0, 1, 2, 3]],
      volume: 1,
      minQuality: 1,
      openEdges: 0,
      nonManifoldEdges: 0,
    };
    document.loads = [];
    const material = materialForBody(document, document.body!.id)!;
    expect(() => simulateBuckling(document, material)).toThrowError(/preload/i);
  });
});

describe("Contact analysis", () => {
  function translatedBox(offset: number): SimBodySource {
    const source = boxBody();
    return {
      id: "target",
      name: "Target",
      triangles: source.triangles.map((triangle) => ({
        a: { ...triangle.a, x: triangle.a.x + offset },
        b: { ...triangle.b, x: triangle.b.x + offset },
        c: { ...triangle.c, x: triangle.c.x + offset },
      })),
    };
  }

  function contactDocument(offset: number, tolerance: number) {
    const primary = boxBody();
    const document = emptySimulationDocument("Contact check");
    document.body = primary;
    document.contactTarget = translatedBox(offset);
    const pairs: SimContactPair[] = (
      ["bonded", "sliding", "separating"] as const
    ).map((kind) => ({
      id: kind,
      name: kind,
      kind,
      bodyId: primary.id,
      targetBodyId: "target",
      face: "x-max",
      targetFace: "x-min",
      penalty: 10_000,
      gapTolerance: tolerance,
      friction: 0,
    }));
    document.contacts = pairs;
    return document;
  }

  it("reports bonded, sliding, separating and open statuses with penalty force", () => {
    const result = simulateContacts(contactDocument(45, 10));
    expect(result.bonded).toBe(1);
    expect(result.sliding).toBe(1);
    expect(result.separating).toBe(1);
    expect(result.open).toBe(0);
    expect(result.minGap).toBeCloseTo(5, 4);
    expect(result.findings.every((finding) => finding.penaltyForceN > 0)).toBe(
      true,
    );

    const open = simulateContacts(contactDocument(45, 0.1));
    expect(open.open).toBe(3);
  });

  it("fails unpaired and self-contacting selections by name", () => {
    const document = contactDocument(45, 10);
    document.contactTarget = null;
    expect(() => simulateContacts(document)).toThrowError(/target body/i);
    document.contactTarget = document.body;
    document.contacts = [];
    expect(() => simulateContacts(document)).toThrowError(/itself/i);
  });

  it("applies active normal penalty springs in the static solve", async () => {
    const document = demoDocument();
    document.mesh = await generateVolumeMesh(document.body!, {
      units: "mm",
      cellSize: 12,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    const target = demoBracketBody();
    document.contactTarget = {
      ...target,
      id: "target",
      name: "Target",
      triangles: target.triangles.map((triangle) => ({
        a: { ...triangle.a, x: triangle.a.x + 80 },
        b: { ...triangle.b, x: triangle.b.x + 80 },
        c: { ...triangle.c, x: triangle.c.x + 80 },
      })),
    };
    document.targetMesh = await generateVolumeMesh(document.contactTarget, {
      units: "mm",
      cellSize: 12,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    document.fixtures.push({
      id: "target_fixture",
      name: "Target fixed",
      kind: "fixed",
      bodyId: "target",
      face: "x-max",
    });
    document.contacts = [
      {
        id: "stop",
        name: "End stop",
        kind: "separating",
        bodyId: document.body!.id,
        targetBodyId: "target",
        face: "x-max",
        targetFace: "x-min",
        penalty: 500,
        gapTolerance: 1,
        friction: 0.4,
      },
    ];
    const material = materialForBody(document, document.mesh.bodyId)!;
    const contactResult = simulateStatic(document, material, {
      maxIterations: 4_000,
    });
    const withoutContact = simulateStatic(
      {
        ...document,
        contacts: [],
        contactTarget: null,
        targetMesh: null,
        fixtures: document.fixtures.filter(
          (fixture) => fixture.bodyId !== "target",
        ),
      },
      material,
      { maxIterations: 4_000 },
    );

    expect(contactResult.contactIterations).toBeGreaterThan(0);
    expect(contactResult.activeContacts).toBeGreaterThan(0);
    expect(contactResult.target!.maxDisplacementM).toBeGreaterThan(0);
    expect(contactResult.contact!.findings[0]!.status).not.toBe("open");
    expect(["sticking", "sliding"]).toContain(
      contactResult.contact!.findings[0]!.status,
    );
    expect(contactResult.contact!.findings[0]!.frictionForceN).toBeGreaterThan(
      0,
    );
    expect(contactResult.maxContactPenetrationM).toBeGreaterThan(0);
    expect(contactResult.maxDisplacementM).not.toBeCloseTo(
      withoutContact.maxDisplacementM,
      8,
    );
  });
});

describe("Simulation report", () => {
  it("records the load case, mesh, peaks and solve time locally", async () => {
    const document = demoDocument();
    document.mesh = await generateVolumeMesh(document.body!, {
      units: "mm",
      cellSize: 10,
      minQuality: 0.05,
      maxElements: 2_000,
    });
    const material = materialForBody(document, document.mesh.bodyId)!;
    document.result = simulateStatic(document, material, {
      maxIterations: 4_000,
    });
    const report = buildSimulationReport(document);
    expect(report).toContain("Simulation report");
    expect(report).toContain("Linear static");
    expect(report).toContain("Max von Mises");
    expect(report).toContain("TET4 elements");
    expect(report).toContain(document.mesh.elements.length.toString());
  });
});
