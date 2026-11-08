import { beforeAll, describe, expect, it } from "vitest";
import {
  autoBondTouchingFaces,
  emptySimulationDocument,
  materialForBody,
  parseSimulationDocument,
  serializeSimulationDocument,
  simulateModal,
  simulateStatic,
  validateSimulationDocument,
  type SimBodySource,
  type SimDocument,
  type SimLoad,
  type SimMesh,
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
  return { id: "parity_box", name: "Parity box", triangles };
}

function baseLoad(overrides: Partial<SimLoad>): SimLoad {
  return {
    id: "load",
    name: "Load",
    kind: "force",
    bodyId: "parity_box",
    face: "z-max",
    region: "face",
    vector: { x: 0, y: 0, z: -1_000 },
    magnitude: 0,
    temperatureDelta: 0,
    remotePoint: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

let mesh: SimMesh;
let base: SimDocument;

beforeAll(async () => {
  const body = boxBody();
  mesh = await generateVolumeMesh(body, {
    units: "mm",
    cellSize: 10,
    minQuality: 0.05,
    maxElements: 2_000,
  });
  const source = emptySimulationDocument("Onshape parity");
  base = {
    ...source,
    body,
    mesh,
    assignments: [{ bodyId: body.id, materialId: source.materialId }],
    fixtures: [
      {
        id: "fixed",
        name: "Fixed root",
        kind: "fixed",
        bodyId: body.id,
        face: "x-min",
      },
    ],
    loads: [baseLoad({})],
  };
});

function documentWith(loads: SimLoad[]): SimDocument {
  return {
    ...base,
    loads,
    result: null,
    modal: null,
  };
}

describe("Onshape Simulation load parity", () => {
  it("solves moment, bearing, acceleration and angular-velocity loads", () => {
    const material = materialForBody(base, base.body!.id)!;
    const loads: SimLoad[] = [
      baseLoad({
        id: "moment",
        name: "Moment",
        kind: "moment",
        face: "x-max",
        vector: { x: 0, y: 0, z: 1_000 },
      }),
      baseLoad({
        id: "bearing",
        name: "Bearing",
        kind: "bearing",
        face: "x-max",
        vector: { x: -1_000, y: 0, z: 0 },
      }),
      baseLoad({
        id: "acceleration",
        name: "Acceleration",
        kind: "acceleration",
        region: "body",
        vector: { x: 0, y: 0, z: -9.80665 },
      }),
      baseLoad({
        id: "angular",
        name: "Angular velocity",
        kind: "angular-velocity",
        region: "body",
        vector: { x: 0, y: 0, z: 25 },
      }),
    ];

    for (const load of loads) {
      const result = simulateStatic(documentWith([load]), material);
      expect(result.maxDisplacementM).toBeGreaterThan(0);
      expect(Number.isFinite(result.maxVonMisesPa)).toBe(true);
    }
  });

  it("balances an unconstrained load with inertial relief", () => {
    const material = materialForBody(base, base.body!.id)!;
    const document = documentWith([
      baseLoad({
        id: "relief",
        name: "Relief force",
        face: "x-max",
        vector: { x: 0, y: 0, z: -5_000 },
      }),
    ]);
    document.fixtures = [];
    document.inertialRelief = true;
    const result = simulateStatic(document, material);
    expect(result.inertialRelief).toBeDefined();
    expect(result.inertialRelief!.supportNodes).toHaveLength(3);
    expect(result.maxDisplacementM).toBeGreaterThan(0);
    expect(Number.isFinite(result.maxReactionN)).toBe(true);
  });
});

describe("Onshape assembly connectivity", () => {
  it("auto-bonds touching faces and rejects separated bodies", () => {
    const target: SimBodySource = {
      id: "parity_target",
      name: "Parity target",
      triangles: base.body!.triangles.map((triangle) => ({
        a: { ...triangle.a, x: triangle.a.x + 40.02 },
        b: { ...triangle.b, x: triangle.b.x + 40.02 },
        c: { ...triangle.c, x: triangle.c.x + 40.02 },
      })),
    };
    const document = { ...base, contactTarget: target };
    const pairs = autoBondTouchingFaces(document, 0.1);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((pair) => pair.kind === "bonded")).toBe(true);
    expect(() =>
      autoBondTouchingFaces(
        {
          ...document,
          contactTarget: {
            ...target,
            triangles: target.triangles.map((triangle) => ({
              a: { ...triangle.a, x: triangle.a.x + 5 },
              b: { ...triangle.b, x: triangle.b.x + 5 },
              c: { ...triangle.c, x: triangle.c.x + 5 },
            })),
          },
        },
        0.1,
      ),
    ).toThrowError(/touching faces/);
  });
});

describe("Onshape Simulation result parity", () => {
  it("returns strain, safety factor, signed stress and reactions", () => {
    const material = materialForBody(base, base.body!.id)!;
    const result = simulateStatic(documentWith([baseLoad({})]), material);
    expect(result.equivalentStrain).toHaveLength(mesh.elements.length);
    expect(result.safetyFactor).toHaveLength(mesh.elements.length);
    expect(result.signedVonMisesPa).toHaveLength(mesh.elements.length);
    expect(result.maxEquivalentStrain).toBeGreaterThanOrEqual(0);
    expect(result.minSafetyFactor).toBeGreaterThan(0);
    expect(result.maxReactionN).toBeGreaterThan(0);
  });

  it("returns modal energy and the requested mode count", () => {
    const material = materialForBody(base, base.body!.id)!;
    const document = documentWith([baseLoad({})]);
    document.modalModes = 3;
    const result = simulateModal(document, material);
    expect(result.modes).toHaveLength(3);
    expect(result.rigidModes).toBe(0);
    expect(result.modes.every((mode) => mode.energyJ > 0)).toBe(true);
  });

  it("validates new load vectors and modal mode limits", () => {
    const document = documentWith([
      baseLoad({ kind: "moment", vector: { x: 0, y: 0, z: 0 } }),
    ]);
    document.modalModes = 16;
    const codes = validateSimulationDocument(document).map(
      (issue) => issue.code,
    );
    expect(codes).toContain("SIM_LOAD_ZERO");
    expect(codes).toContain("SIM_MODAL_MODES");
  });

  it("round-trips load regions, inertial relief and modal settings", () => {
    const document = documentWith([
      baseLoad({
        kind: "bearing",
        region: "body",
        vector: { x: 500, y: 0, z: 0 },
      }),
    ]);
    document.inertialRelief = true;
    document.modalModes = 7;
    const parsed = parseSimulationDocument(
      serializeSimulationDocument(document),
    );
    expect(parsed.inertialRelief).toBe(true);
    expect(parsed.modalModes).toBe(7);
    expect(parsed.loads[0]!.kind).toBe("bearing");
    expect(parsed.loads[0]!.region).toBe("body");
  });
});
