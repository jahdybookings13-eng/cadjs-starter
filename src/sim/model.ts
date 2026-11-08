// Simulation Studio document model.
//
// Geometry and mesh coordinates use the document unit at the UI boundary.
// The solver converts to SI (metres, pascals, kilograms) internally. The
// document stores no cloud identifiers: materials, loads and results are
// plain local data so a Simulation tab survives save/reload.

export const SIM_SCHEMA = "scadgen.simulationstudio";
export const SIM_VERSION = 6 as const;
/** Hard browser ceiling independent of the editable per-case mesh setting. */
export const SIM_MAX_ELEMENTS = 200_000;
/** Guard against a solver that never converges in the acceptance path. */
export const SIM_MAX_SOLVE_MS = 30_000;

export type SimUnit = "mm" | "in";
export type SimFace = "x-min" | "x-max" | "y-min" | "y-max" | "z-min" | "z-max";
export const SIM_FACES: readonly SimFace[] = [
  "x-min",
  "x-max",
  "y-min",
  "y-max",
  "z-min",
  "z-max",
];

export interface SimVec3 {
  x: number;
  y: number;
  z: number;
}

export interface SimTriangle {
  a: SimVec3;
  b: SimVec3;
  c: SimVec3;
}

export interface SimBodySource {
  id: string;
  name: string;
  triangles: SimTriangle[];
}

export interface SimMeshSettings {
  /** Target element edge length in document units. */
  cellSize: number;
  /** Minimum accepted TET4 quality, in (0, 1]. */
  minQuality: number;
  /** Hard cap so a small cell cannot exhaust the browser. */
  maxElements: number;
}

export interface SimMesh {
  bodyId: string;
  bodyName: string;
  units: SimUnit;
  elementType: "tet4";
  cellSize: number;
  nodes: SimVec3[];
  /** Four node indices per tetrahedron, positive signed volume. */
  elements: number[][];
  volume: number;
  minQuality: number;
  openEdges: number;
  nonManifoldEdges: number;
}

export interface SimMaterial {
  id: string;
  name: string;
  /** kg/m^3 */
  density: number;
  /** Young's modulus in MPa (N/mm^2). */
  young: number;
  poisson: number;
  /** Yield strength in MPa. */
  yield: number;
  /** Coefficient of thermal expansion, 1/K. */
  cte: number;
  /** Thermal conductivity, W/(m K). */
  conductivity: number;
}

export type SimFixtureKind = "fixed" | "pinned" | "roller";

export interface SimFixture {
  id: string;
  name: string;
  kind: SimFixtureKind;
  bodyId: string;
  face: SimFace;
}

export type SimLoadKind =
  | "force"
  | "moment"
  | "bearing"
  | "pressure"
  | "gravity"
  | "acceleration"
  | "angular-velocity"
  | "thermal"
  | "remote";

export type SimLoadRegion = "face" | "body";

export interface SimLoad {
  id: string;
  name: string;
  kind: SimLoadKind;
  bodyId: string;
  face: SimFace;
  /** Face load region, or the whole body, for force and moment loads. */
  region?: SimLoadRegion;
  /**
   * Force in N, moment in N·m, bearing force in N, linear acceleration in
   * m/s², or angular velocity in rad/s, depending on `kind`.
   */
  vector: SimVec3;
  /** Pressure in Pa, or gravitational acceleration in m/s^2. */
  magnitude: number;
  /** Temperature rise in K, for thermal loads. */
  temperatureDelta: number;
  /** Application point for a remote load, in document units. */
  remotePoint: SimVec3;
}

export interface SimStaticBodyResult {
  maxDisplacementM: number;
  maxVonMisesPa: number;
  minPrincipalPa: number;
  maxPrincipalPa: number;
  maxEquivalentStrain: number;
  minSafetyFactor: number;
  displacementsM: number[];
  vonMisesPa: number[];
  signedVonMisesPa: number[];
  principalStressPa: number[][];
  equivalentStrain: number[];
  safetyFactor: number[];
}

export interface SimStaticTargetResult extends SimStaticBodyResult {
  bodyId: string;
  bodyName: string;
}

export interface SimInertialRelief {
  accelerationMps2: SimVec3;
  angularAccelerationRadS2: SimVec3;
  supportNodes: number[];
}

export interface SimStaticResult extends SimStaticBodyResult {
  reactionsN: Array<{ node: number; values: SimVec3 }>;
  maxReactionN: number;
  solveMs: number;
  iterations: number;
  /** Present when the static case was balanced with inertial relief. */
  inertialRelief?: SimInertialRelief;
  /** Present for a two-body contact solve. */
  target?: SimStaticTargetResult;
  contactIterations?: number;
  activeContacts?: number;
  maxContactPenetrationM?: number;
  contact?: SimContactResult;
}

export interface SimModalMode {
  frequencyHz: number;
  /** Strain energy required to deform the mode to a 1 mm peak, in joules. */
  energyJ: number;
  /** True for an unconstrained rigid-body mode at zero frequency. */
  rigid?: boolean;
  /** Full nodal mode shape; constrained components are zero. */
  shape: number[];
}

export interface SimModalResult {
  modes: SimModalMode[];
  rigidModes: number;
  solveMs: number;
  iterations: number;
}

export type SimThermalBoundaryKind = "temperature" | "heat-flux" | "convection";

export interface SimThermalBoundary {
  id: string;
  name: string;
  kind: SimThermalBoundaryKind;
  bodyId: string;
  face: SimFace;
  /** Fixed temperature in °C, heat flux in W/m², or ambient temperature in °C. */
  value: number;
  /** Convection coefficient in W/(m² K); unused for other boundary kinds. */
  coefficient: number;
}

export interface SimThermalResult {
  minTemperatureC: number;
  maxTemperatureC: number;
  temperaturesC: number[];
  /** Integrated positive heat-flux boundary input, in watts. */
  appliedHeatFluxW: number;
  solveMs: number;
  iterations: number;
}

export interface SimBucklingMode {
  /** Reference-load multiplier at the buckling mode. */
  multiplier: number;
  /** Full nodal mode shape; constrained components are zero. */
  shape: number[];
}

export interface SimBucklingResult {
  modes: SimBucklingMode[];
  solveMs: number;
  iterations: number;
}

export type SimContactKind = "bonded" | "sliding" | "separating";
export type SimContactStatus =
  | "bonded"
  | "sliding"
  | "separating"
  | "sticking"
  | "open";

export interface SimContactPair {
  id: string;
  name: string;
  kind: SimContactKind;
  bodyId: string;
  targetBodyId: string;
  face: SimFace;
  targetFace: SimFace;
  /** Penalty stiffness in N/mm. */
  penalty: number;
  /** Contact gap tolerance in document units. */
  gapTolerance: number;
  /** Coulomb friction coefficient; used by separating contact. */
  friction: number;
}

export interface SimContactFinding {
  id: string;
  name: string;
  kind: SimContactKind;
  gap: number;
  status: SimContactStatus;
  penaltyForceN: number;
  frictionForceN?: number;
  sticking?: boolean;
}

export interface SimContactResult {
  findings: SimContactFinding[];
  minGap: number;
  bonded: number;
  sliding: number;
  separating: number;
  sticking: number;
  open: number;
  solveMs: number;
}

export interface SimDocument {
  schema: typeof SIM_SCHEMA;
  v: typeof SIM_VERSION;
  name: string;
  units: SimUnit;
  body: SimBodySource | null;
  mesh: SimMesh | null;
  targetMesh: SimMesh | null;
  materials: SimMaterial[];
  materialId: string;
  assignments: Array<{ bodyId: string; materialId: string }>;
  fixtures: SimFixture[];
  loads: SimLoad[];
  thermalBoundaries: SimThermalBoundary[];
  contactTarget: SimBodySource | null;
  contacts: SimContactPair[];
  settings: SimMeshSettings;
  inertialRelief: boolean;
  modalModes: number;
  result: SimStaticResult | null;
  modal: SimModalResult | null;
  thermal: SimThermalResult | null;
  buckling: SimBucklingResult | null;
  contact: SimContactResult | null;
}

export interface SimIssue {
  code: string;
  path: string;
  message: string;
}

export class SimError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues: SimIssue[] = [],
  ) {
    super(message);
    this.name = "SimError";
  }
}

export const SIM_MATERIAL_LIBRARY: readonly Omit<SimMaterial, "id">[] = [
  {
    name: "Steel, mild",
    density: 7850,
    young: 200_000,
    poisson: 0.3,
    yield: 250,
    cte: 12e-6,
    conductivity: 51.9,
  },
  {
    name: "Aluminum 6061-T6",
    density: 2700,
    young: 68_900,
    poisson: 0.33,
    yield: 276,
    cte: 23.6e-6,
    conductivity: 167,
  },
  {
    name: "Titanium Ti-6Al-4V",
    density: 4430,
    young: 113_800,
    poisson: 0.342,
    yield: 880,
    cte: 8.6e-6,
    conductivity: 6.7,
  },
  {
    name: "Nylon 6/6",
    density: 1140,
    young: 2_800,
    poisson: 0.39,
    yield: 82,
    cte: 80e-6,
    conductivity: 0.25,
  },
];

let simSeq = 0;
export function simId(prefix: string): string {
  simSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${simSeq.toString(36)}`;
}

export function emptySimMeshSettings(): SimMeshSettings {
  return { cellSize: 5, minQuality: 0.05, maxElements: 20_000 };
}

export function defaultThermalBoundaries(bodyId: string): SimThermalBoundary[] {
  return [
    {
      id: simId("thermal"),
      name: "Cold face",
      kind: "temperature",
      bodyId,
      face: "x-min",
      value: 20,
      coefficient: 0,
    },
    {
      id: simId("thermal"),
      name: "Hot face",
      kind: "temperature",
      bodyId,
      face: "x-max",
      value: 100,
      coefficient: 0,
    },
  ];
}

/** Closed L-shaped bracket blank used by the local demo, in millimetres. */
export function demoBracketBody(): SimBodySource {
  const outline: Array<[number, number]> = [
    [0, 0],
    [80, 0],
    [80, 20],
    [20, 20],
    [20, 50],
    [0, 50],
  ];
  const z0 = 0;
  const z1 = 8;
  const triangles: SimTriangle[] = [];
  const at = (x: number, y: number, z: number): SimVec3 => ({ x, y, z });
  const n = outline.length;
  for (let i = 1; i + 1 < n; i++) {
    const a = outline[0]!;
    const b = outline[i]!;
    const c = outline[i + 1]!;
    triangles.push({
      a: at(a[0], a[1], z0),
      b: at(c[0], c[1], z0),
      c: at(b[0], b[1], z0),
    });
    triangles.push({
      a: at(a[0], a[1], z1),
      b: at(b[0], b[1], z1),
      c: at(c[0], c[1], z1),
    });
  }
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    const a0 = at(a[0], a[1], z0);
    const b0 = at(b[0], b[1], z0);
    const a1 = at(a[0], a[1], z1);
    const b1 = at(b[0], b[1], z1);
    triangles.push({ a: a0, b: b0, c: b1 });
    triangles.push({ a: a0, b: b1, c: a1 });
  }
  return { id: "sim_demo_bracket", name: "Bracket blank", triangles };
}

export function emptySimulationDocument(
  name = "Simulation Studio",
): SimDocument {
  const material = { id: simId("material"), ...SIM_MATERIAL_LIBRARY[0]! };
  const body = demoBracketBody();
  return {
    schema: SIM_SCHEMA,
    v: SIM_VERSION,
    name,
    units: "mm",
    body,
    mesh: null,
    targetMesh: null,
    materials: [material],
    materialId: material.id,
    assignments: [{ bodyId: body.id, materialId: material.id }],
    fixtures: [
      {
        id: simId("fixture"),
        name: "Fixed root",
        kind: "fixed",
        bodyId: body.id,
        face: "x-min",
      },
    ],
    loads: [
      {
        id: simId("load"),
        name: "Top force",
        kind: "force",
        bodyId: body.id,
        face: "z-max",
        vector: { x: 0, y: 0, z: -5_000 },
        magnitude: 0,
        temperatureDelta: 0,
        remotePoint: { x: 0, y: 0, z: 0 },
      },
    ],
    thermalBoundaries: defaultThermalBoundaries(body.id),
    contactTarget: null,
    contacts: [],
    settings: emptySimMeshSettings(),
    inertialRelief: false,
    modalModes: 15,
    result: null,
    modal: null,
    thermal: null,
    buckling: null,
    contact: null,
  };
}

export function materialForBody(
  document: SimDocument,
  bodyId: string,
): SimMaterial | null {
  const assignment = document.assignments.find(
    (entry) => entry.bodyId === bodyId,
  );
  const id = assignment?.materialId ?? document.materialId;
  return document.materials.find((material) => material.id === id) ?? null;
}

export function materialFromPreset(index: number): SimMaterial | null {
  const preset = SIM_MATERIAL_LIBRARY[index];
  return preset ? { id: simId("material"), ...preset } : null;
}

export function updateSimMaterial(
  document: SimDocument,
  material: SimMaterial,
): SimDocument {
  return {
    ...document,
    materials: document.materials.some((entry) => entry.id === material.id)
      ? document.materials.map((entry) =>
          entry.id === material.id ? { ...material } : entry,
        )
      : [...document.materials, { ...material }],
    result: null,
    modal: null,
    thermal: null,
    buckling: null,
    contact: null,
  };
}

export function assignSimMaterial(
  document: SimDocument,
  bodyId: string,
  materialId: string,
): SimDocument {
  if (!document.materials.some((material) => material.id === materialId)) {
    throw new SimError(
      "SIM_MATERIAL",
      `Material "${materialId}" is not in the local library.`,
    );
  }
  const exists = document.assignments.some((entry) => entry.bodyId === bodyId);
  return {
    ...document,
    materialId,
    thermal: null,
    buckling: null,
    contact: null,
    assignments: exists
      ? document.assignments.map((entry) =>
          entry.bodyId === bodyId ? { ...entry, materialId } : entry,
        )
      : [...document.assignments, { bodyId, materialId }],
  };
}

export function simulationDocumentWithBody(
  document: SimDocument,
  body: SimBodySource,
): SimDocument {
  const existing = document.assignments.find(
    (entry) => entry.bodyId === body.id,
  );
  return {
    ...document,
    body,
    mesh: null,
    targetMesh: null,
    result: null,
    modal: null,
    thermal: null,
    buckling: null,
    contact: null,
    contactTarget: null,
    contacts: [],
    thermalBoundaries: [
      ...document.thermalBoundaries.filter(
        (boundary) => boundary.bodyId === body.id,
      ),
      ...(document.thermalBoundaries.some(
        (boundary) => boundary.bodyId === body.id,
      )
        ? []
        : defaultThermalBoundaries(body.id)),
    ],
    assignments: existing
      ? document.assignments
      : [
          ...document.assignments,
          { bodyId: body.id, materialId: document.materialId },
        ],
    fixtures: document.fixtures.filter((fixture) => fixture.bodyId === body.id),
    loads: document.loads.filter((load) => load.bodyId === body.id),
  };
}

export function validateSimulationDocument(document: SimDocument): SimIssue[] {
  const issues: SimIssue[] = [];
  if (!document.name.trim()) {
    issues.push({
      code: "SIM_NAME",
      path: "name",
      message: "Simulation Studio name cannot be blank.",
    });
  }
  if (document.units !== "mm" && document.units !== "in") {
    issues.push({
      code: "SIM_UNITS",
      path: "units",
      message: "Units must be mm or in.",
    });
  }
  const materialIds = new Set<string>();
  for (const [index, material] of document.materials.entries()) {
    const path = `materials.${index}`;
    if (materialIds.has(material.id)) {
      issues.push({
        code: "SIM_MATERIAL_ID",
        path,
        message: `Duplicate material id "${material.id}".`,
      });
    }
    materialIds.add(material.id);
    if (!material.name.trim()) {
      issues.push({
        code: "SIM_MATERIAL_NAME",
        path: `${path}.name`,
        message: "Material name cannot be blank.",
      });
    }
    for (const [field, label] of [
      ["density", "Density"],
      ["young", "Young's modulus"],
      ["yield", "Yield strength"],
      ["conductivity", "Conductivity"],
    ] as const) {
      if (!Number.isFinite(material[field]) || material[field] <= 0) {
        issues.push({
          code: "SIM_MATERIAL_VALUE",
          path: `${path}.${field}`,
          message: `${label} must be a positive finite number.`,
        });
      }
    }
    if (
      !Number.isFinite(material.poisson) ||
      material.poisson <= -1 ||
      material.poisson >= 0.5
    ) {
      issues.push({
        code: "SIM_POISSON",
        path: `${path}.poisson`,
        message: "Poisson's ratio must be between -1 and 0.5.",
      });
    }
    if (!Number.isFinite(material.cte) || material.cte < 0) {
      issues.push({
        code: "SIM_CTE",
        path: `${path}.cte`,
        message: "Thermal expansion must be zero or greater.",
      });
    }
  }
  if (!materialIds.has(document.materialId)) {
    issues.push({
      code: "SIM_MATERIAL",
      path: "materialId",
      message: "The selected material is not in the local library.",
    });
  }
  for (const [index, assignment] of document.assignments.entries()) {
    if (!materialIds.has(assignment.materialId)) {
      issues.push({
        code: "SIM_ASSIGNMENT",
        path: `assignments.${index}.materialId`,
        message: "Body assignment references a missing material.",
      });
    }
  }
  if (!(document.settings.cellSize > 0)) {
    issues.push({
      code: "SIM_CELL_SIZE",
      path: "settings.cellSize",
      message: "Mesh cell size must be greater than zero.",
    });
  }
  if (
    !(document.settings.minQuality > 0 && document.settings.minQuality <= 1)
  ) {
    issues.push({
      code: "SIM_MESH_QUALITY",
      path: "settings.minQuality",
      message: "Minimum quality must be greater than zero and at most one.",
    });
  }
  if (
    !Number.isInteger(document.settings.maxElements) ||
    document.settings.maxElements < 1 ||
    document.settings.maxElements > SIM_MAX_ELEMENTS
  ) {
    issues.push({
      code: "SIM_MESH_LIMIT",
      path: "settings.maxElements",
      message: `Maximum element count must be a positive whole number no greater than ${SIM_MAX_ELEMENTS.toLocaleString()}.`,
    });
  }
  if (
    !Number.isInteger(document.modalModes) ||
    document.modalModes < 1 ||
    document.modalModes > 15
  ) {
    issues.push({
      code: "SIM_MODAL_MODES",
      path: "modalModes",
      message: "Modal mode count must be a whole number from 1 to 15.",
    });
  }
  const bodyId = document.mesh?.bodyId ?? document.body?.id ?? "";
  const targetBodyId =
    document.targetMesh?.bodyId ?? document.contactTarget?.id ?? "";
  const allowedBodyIds = new Set(
    [bodyId, targetBodyId].filter((id): id is string => Boolean(id)),
  );
  if (
    document.mesh &&
    document.body &&
    document.mesh.bodyId !== document.body.id
  ) {
    issues.push({
      code: "SIM_MESH_BODY",
      path: "mesh.bodyId",
      message: "Mesh does not belong to the selected body.",
    });
  }
  const fixtureIds = new Set<string>();
  for (const [index, fixture] of document.fixtures.entries()) {
    const path = `fixtures.${index}`;
    if (fixtureIds.has(fixture.id)) {
      issues.push({
        code: "SIM_FIXTURE_ID",
        path,
        message: `Duplicate fixture id "${fixture.id}".`,
      });
    }
    fixtureIds.add(fixture.id);
    if (!allowedBodyIds.has(fixture.bodyId)) {
      issues.push({
        code: "SIM_SELECTION_BODY",
        path: `${path}.bodyId`,
        message: `Fixture "${fixture.name}" selects a body that is not meshed.`,
      });
    }
    if (!SIM_FACES.includes(fixture.face)) {
      issues.push({
        code: "SIM_SELECTION_FACE",
        path: `${path}.face`,
        message: `Unknown fixture face "${String(fixture.face)}".`,
      });
    }
    if (!["fixed", "pinned", "roller"].includes(fixture.kind)) {
      issues.push({
        code: "SIM_FIXTURE_KIND",
        path: `${path}.kind`,
        message: `Unknown fixture kind "${String(fixture.kind)}".`,
      });
    }
  }
  const loadIds = new Set<string>();
  for (const [index, load] of document.loads.entries()) {
    const path = `loads.${index}`;
    if (loadIds.has(load.id)) {
      issues.push({
        code: "SIM_LOAD_ID",
        path,
        message: `Duplicate load id "${load.id}".`,
      });
    }
    loadIds.add(load.id);
    if (!allowedBodyIds.has(load.bodyId)) {
      issues.push({
        code: "SIM_SELECTION_BODY",
        path: `${path}.bodyId`,
        message: `Load "${load.name}" selects a body that is not meshed.`,
      });
    }
    if (!SIM_FACES.includes(load.face)) {
      issues.push({
        code: "SIM_SELECTION_FACE",
        path: `${path}.face`,
        message: `Unknown load face "${String(load.face)}".`,
      });
    }
    if (
      ![
        "force",
        "moment",
        "bearing",
        "pressure",
        "gravity",
        "acceleration",
        "angular-velocity",
        "thermal",
        "remote",
      ].includes(load.kind)
    ) {
      issues.push({
        code: "SIM_LOAD_KIND",
        path: `${path}.kind`,
        message: `Unknown load kind "${String(load.kind)}".`,
      });
    }
    if (
      load.region !== undefined &&
      load.region !== "face" &&
      load.region !== "body"
    ) {
      issues.push({
        code: "SIM_LOAD_REGION",
        path: `${path}.region`,
        message: `Unknown load region "${String(load.region)}".`,
      });
    }
    if (
      [
        "force",
        "moment",
        "bearing",
        "acceleration",
        "angular-velocity",
        "remote",
      ].includes(load.kind)
    ) {
      if (
        ![load.vector.x, load.vector.y, load.vector.z].every(Number.isFinite)
      ) {
        issues.push({
          code: "SIM_LOAD_VECTOR",
          path: `${path}.vector`,
          message: "Load vector components must be finite.",
        });
      }
      if (![load.vector.x, load.vector.y, load.vector.z].some((v) => v !== 0)) {
        issues.push({
          code: "SIM_LOAD_ZERO",
          path: `${path}.vector`,
          message: "Load vector cannot be zero.",
        });
      }
    }
    if (load.kind === "pressure" && !(load.magnitude > 0)) {
      issues.push({
        code: "SIM_LOAD_PRESSURE",
        path: `${path}.magnitude`,
        message: "Pressure must be greater than zero.",
      });
    }
    if (load.kind === "gravity" && !(load.magnitude > 0)) {
      issues.push({
        code: "SIM_LOAD_GRAVITY",
        path: `${path}.magnitude`,
        message: "Gravitational acceleration must be greater than zero.",
      });
    }
    if (load.kind === "thermal" && !Number.isFinite(load.temperatureDelta)) {
      issues.push({
        code: "SIM_LOAD_THERMAL",
        path: `${path}.temperatureDelta`,
        message: "Temperature rise must be finite.",
      });
    }
    if (
      load.kind === "remote" &&
      ![load.remotePoint.x, load.remotePoint.y, load.remotePoint.z].every(
        Number.isFinite,
      )
    ) {
      issues.push({
        code: "SIM_LOAD_REMOTE",
        path: `${path}.remotePoint`,
        message: "Remote load point must be finite.",
      });
    }
  }
  const thermalIds = new Set<string>();
  for (const [index, boundary] of document.thermalBoundaries.entries()) {
    const path = `thermalBoundaries.${index}`;
    if (thermalIds.has(boundary.id)) {
      issues.push({
        code: "SIM_THERMAL_ID",
        path,
        message: `Duplicate thermal boundary id "${boundary.id}".`,
      });
    }
    thermalIds.add(boundary.id);
    if (!boundary.name.trim()) {
      issues.push({
        code: "SIM_THERMAL_NAME",
        path: `${path}.name`,
        message: "Thermal boundary name cannot be blank.",
      });
    }
    if (boundary.bodyId !== bodyId) {
      issues.push({
        code: "SIM_SELECTION_BODY",
        path: `${path}.bodyId`,
        message: `Thermal boundary "${boundary.name}" selects a body that is not meshed.`,
      });
    }
    if (!SIM_FACES.includes(boundary.face)) {
      issues.push({
        code: "SIM_SELECTION_FACE",
        path: `${path}.face`,
        message: `Unknown thermal boundary face "${String(boundary.face)}".`,
      });
    }
    if (!["temperature", "heat-flux", "convection"].includes(boundary.kind)) {
      issues.push({
        code: "SIM_THERMAL_KIND",
        path: `${path}.kind`,
        message: `Unknown thermal boundary kind "${String(boundary.kind)}".`,
      });
    }
    if (!Number.isFinite(boundary.value)) {
      issues.push({
        code: "SIM_THERMAL_VALUE",
        path: `${path}.value`,
        message: "Thermal boundary value must be finite.",
      });
    }
    if (
      boundary.kind === "convection" &&
      (!Number.isFinite(boundary.coefficient) || boundary.coefficient <= 0)
    ) {
      issues.push({
        code: "SIM_THERMAL_CONVECTION",
        path: `${path}.coefficient`,
        message: "Convection coefficient must be greater than zero.",
      });
    }
  }
  if (document.contacts.length > 0 && !document.contactTarget) {
    issues.push({
      code: "SIM_CONTACT_TARGET",
      path: "contactTarget",
      message: "Contact pairs need a target body.",
    });
  }
  const contactIds = new Set<string>();
  for (const [index, pair] of document.contacts.entries()) {
    const path = `contacts.${index}`;
    if (contactIds.has(pair.id)) {
      issues.push({
        code: "SIM_CONTACT_ID",
        path,
        message: `Duplicate contact id "${pair.id}".`,
      });
    }
    contactIds.add(pair.id);
    if (!pair.name.trim()) {
      issues.push({
        code: "SIM_CONTACT_NAME",
        path: `${path}.name`,
        message: "Contact name cannot be blank.",
      });
    }
    if (!["bonded", "sliding", "separating"].includes(pair.kind)) {
      issues.push({
        code: "SIM_CONTACT_KIND",
        path: `${path}.kind`,
        message: `Unknown contact kind "${String(pair.kind)}".`,
      });
    }
    if (pair.bodyId === pair.targetBodyId) {
      issues.push({
        code: "SIM_CONTACT_SELF",
        path: `${path}.targetBodyId`,
        message: `Contact "${pair.name}" cannot pair a body with itself.`,
      });
    }
    if (!SIM_FACES.includes(pair.face)) {
      issues.push({
        code: "SIM_SELECTION_FACE",
        path: `${path}.face`,
        message: `Unknown contact face "${String(pair.face)}".`,
      });
    }
    if (!SIM_FACES.includes(pair.targetFace)) {
      issues.push({
        code: "SIM_SELECTION_FACE",
        path: `${path}.targetFace`,
        message: `Unknown contact target face "${String(pair.targetFace)}".`,
      });
    }
    if (!(pair.penalty > 0)) {
      issues.push({
        code: "SIM_CONTACT_PENALTY",
        path: `${path}.penalty`,
        message: "Contact penalty stiffness must be greater than zero.",
      });
    }
    if (!(pair.gapTolerance >= 0)) {
      issues.push({
        code: "SIM_CONTACT_GAP",
        path: `${path}.gapTolerance`,
        message: "Contact gap tolerance must be zero or greater.",
      });
    }
    if (
      !Number.isFinite(pair.friction) ||
      pair.friction < 0 ||
      pair.friction > 1
    ) {
      issues.push({
        code: "SIM_CONTACT_FRICTION",
        path: `${path}.friction`,
        message: "Contact friction must be between zero and one.",
      });
    }
  }
  if (!document.mesh && document.body) {
    issues.push({
      code: "SIM_MESH_MISSING",
      path: "mesh",
      message: "Generate a volume mesh before solving.",
    });
  }
  return issues;
}

export function assertValidSimulationDocument(document: SimDocument): void {
  const issues = validateSimulationDocument(document);
  if (issues.length > 0) {
    throw new SimError(
      "SIM_VALIDATION",
      issues.map((issue) => issue.message).join("; "),
      issues,
    );
  }
}

export function serializeSimulationDocument(document: SimDocument): string {
  return JSON.stringify(document);
}

export function simulationStudioTabDesign(document: SimDocument): string {
  return serializeSimulationDocument(document);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function vec3(value: unknown, fallback: SimVec3): SimVec3 {
  const record = asRecord(value);
  return record
    ? {
        x: numberOr(record.x, fallback.x),
        y: numberOr(record.y, fallback.y),
        z: numberOr(record.z, fallback.z),
      }
    : { ...fallback };
}

function faceOr(value: unknown, fallback: SimFace): SimFace {
  return SIM_FACES.includes(value as SimFace) ? (value as SimFace) : fallback;
}

function normalizeMaterial(value: unknown): SimMaterial | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    id: typeof record.id === "string" ? record.id : simId("material"),
    name: typeof record.name === "string" ? record.name : "Material",
    density: numberOr(record.density, 7850),
    young: numberOr(record.young, 200_000),
    poisson: numberOr(record.poisson, 0.3),
    yield: numberOr(record.yield, 250),
    cte: numberOr(record.cte, 12e-6),
    conductivity: numberOr(record.conductivity, 50),
  };
}

function normalizeTriangle(value: unknown): SimTriangle | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    a: vec3(record.a, { x: 0, y: 0, z: 0 }),
    b: vec3(record.b, { x: 0, y: 0, z: 0 }),
    c: vec3(record.c, { x: 0, y: 0, z: 0 }),
  };
}

function normalizeBody(value: unknown): SimBodySource | null {
  const record = asRecord(value);
  if (!record) return null;
  const triangles = Array.isArray(record.triangles)
    ? record.triangles
        .map(normalizeTriangle)
        .filter((triangle): triangle is SimTriangle => triangle !== null)
    : [];
  if (!triangles.length) return null;
  return {
    id: typeof record.id === "string" ? record.id : simId("body"),
    name: typeof record.name === "string" ? record.name : "Body",
    triangles,
  };
}

function normalizeMesh(value: unknown, units: SimUnit): SimMesh | null {
  const record = asRecord(value);
  if (!record) return null;
  const nodes = Array.isArray(record.nodes)
    ? record.nodes.map((node) => vec3(node, { x: 0, y: 0, z: 0 }))
    : [];
  const elements = Array.isArray(record.elements)
    ? record.elements
        .filter(Array.isArray)
        .map((element) =>
          (element as unknown[])
            .map((index) => Math.round(numberOr(index, -1)))
            .filter((index) => index >= 0 && index < nodes.length),
        )
        .filter((element) => element.length === 4)
    : [];
  if (!nodes.length || !elements.length) return null;
  return {
    bodyId: typeof record.bodyId === "string" ? record.bodyId : "",
    bodyName: typeof record.bodyName === "string" ? record.bodyName : "Body",
    units: record.units === "in" ? "in" : units,
    elementType: "tet4",
    cellSize: numberOr(record.cellSize, 1),
    nodes,
    elements,
    volume: numberOr(record.volume, 0),
    minQuality: numberOr(record.minQuality, 0),
    openEdges: Math.round(numberOr(record.openEdges, 0)),
    nonManifoldEdges: Math.round(numberOr(record.nonManifoldEdges, 0)),
  };
}

function normalizeFixture(value: unknown): SimFixture | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = ["fixed", "pinned", "roller"].includes(String(record.kind))
    ? (record.kind as SimFixtureKind)
    : "fixed";
  return {
    id: typeof record.id === "string" ? record.id : simId("fixture"),
    name: typeof record.name === "string" ? record.name : "Fixture",
    kind,
    bodyId: typeof record.bodyId === "string" ? record.bodyId : "",
    face: faceOr(record.face, "x-min"),
  };
}

function normalizeThermalBoundary(value: unknown): SimThermalBoundary | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = ["temperature", "heat-flux", "convection"].includes(
    String(record.kind),
  )
    ? (record.kind as SimThermalBoundaryKind)
    : "temperature";
  return {
    id: typeof record.id === "string" ? record.id : simId("thermal"),
    name: typeof record.name === "string" ? record.name : "Thermal boundary",
    kind,
    bodyId: typeof record.bodyId === "string" ? record.bodyId : "",
    face: faceOr(record.face, "x-min"),
    value: numberOr(record.value, 20),
    coefficient: numberOr(record.coefficient, kind === "convection" ? 10 : 0),
  };
}

function normalizeContact(value: unknown): SimContactPair | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = ["bonded", "sliding", "separating"].includes(String(record.kind))
    ? (record.kind as SimContactKind)
    : "bonded";
  return {
    id: typeof record.id === "string" ? record.id : simId("contact"),
    name: typeof record.name === "string" ? record.name : "Contact",
    kind,
    bodyId: typeof record.bodyId === "string" ? record.bodyId : "",
    targetBodyId:
      typeof record.targetBodyId === "string" ? record.targetBodyId : "",
    face: faceOr(record.face, "x-max"),
    targetFace: faceOr(record.targetFace, "x-min"),
    penalty: numberOr(record.penalty, 10_000),
    gapTolerance: numberOr(record.gapTolerance, 0.1),
    friction: numberOr(record.friction, kind === "separating" ? 0.2 : 0),
  };
}

function normalizeLoad(value: unknown): SimLoad | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = [
    "force",
    "moment",
    "bearing",
    "pressure",
    "gravity",
    "acceleration",
    "angular-velocity",
    "thermal",
    "remote",
  ].includes(String(record.kind))
    ? (record.kind as SimLoadKind)
    : "force";
  const region =
    record.region === "body"
      ? "body"
      : record.region === "face"
        ? "face"
        : undefined;
  return {
    id: typeof record.id === "string" ? record.id : simId("load"),
    name: typeof record.name === "string" ? record.name : "Load",
    kind,
    bodyId: typeof record.bodyId === "string" ? record.bodyId : "",
    face: faceOr(record.face, "z-max"),
    ...(region ? { region } : {}),
    vector: vec3(record.vector, { x: 0, y: 0, z: -1000 }),
    magnitude: numberOr(record.magnitude, 0),
    temperatureDelta: numberOr(record.temperatureDelta, 0),
    remotePoint: vec3(record.remotePoint, { x: 0, y: 0, z: 0 }),
  };
}

export function parseSimulationDocument(text: string): SimDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SimError(
      "SIM_JSON",
      "Simulation Studio payload is not valid JSON.",
    );
  }
  const record = asRecord(raw);
  if (!record) {
    throw new SimError(
      "SIM_SCHEMA",
      "Simulation Studio payload must be an object.",
    );
  }
  if (record.schema !== undefined && record.schema !== SIM_SCHEMA) {
    throw new SimError(
      "SIM_SCHEMA",
      `Expected ${SIM_SCHEMA}, received ${String(record.schema)}.`,
    );
  }
  const version = numberOr(record.v, 0);
  if (version > SIM_VERSION) {
    throw new SimError(
      "SIM_FUTURE_SCHEMA",
      `Simulation Studio version ${version} is newer than this build (${SIM_VERSION}).`,
    );
  }
  const base = emptySimulationDocument(
    typeof record.name === "string" && record.name.trim()
      ? record.name
      : "Simulation Studio",
  );
  const units: SimUnit = record.units === "in" ? "in" : "mm";
  const materials = Array.isArray(record.materials)
    ? record.materials
        .map(normalizeMaterial)
        .filter((material): material is SimMaterial => material !== null)
    : [];
  const body = normalizeBody(record.body);
  const mesh = normalizeMesh(record.mesh, units);
  const targetMesh = normalizeMesh(record.targetMesh, units);
  const settings = asRecord(record.settings);
  const document: SimDocument = {
    schema: SIM_SCHEMA,
    v: SIM_VERSION,
    name: base.name,
    units,
    body,
    mesh,
    targetMesh,
    materials: materials.length ? materials : base.materials,
    materialId:
      typeof record.materialId === "string"
        ? record.materialId
        : (materials[0]?.id ?? base.materialId),
    assignments: Array.isArray(record.assignments)
      ? record.assignments
          .map((entry) => asRecord(entry))
          .filter((entry): entry is Record<string, unknown> => entry !== null)
          .map((entry) => ({
            bodyId: typeof entry.bodyId === "string" ? entry.bodyId : "",
            materialId:
              typeof entry.materialId === "string" ? entry.materialId : "",
          }))
          .filter((entry) => entry.bodyId && entry.materialId)
      : base.assignments,
    fixtures: Array.isArray(record.fixtures)
      ? record.fixtures
          .map(normalizeFixture)
          .filter((fixture): fixture is SimFixture => fixture !== null)
      : [],
    loads: Array.isArray(record.loads)
      ? record.loads
          .map(normalizeLoad)
          .filter((load): load is SimLoad => load !== null)
      : [],
    thermalBoundaries: Array.isArray(record.thermalBoundaries)
      ? record.thermalBoundaries
          .map(normalizeThermalBoundary)
          .filter(
            (boundary): boundary is SimThermalBoundary => boundary !== null,
          )
      : body
        ? defaultThermalBoundaries(body.id)
        : [],
    contactTarget: normalizeBody(record.contactTarget),
    contacts: Array.isArray(record.contacts)
      ? record.contacts
          .map(normalizeContact)
          .filter((pair): pair is SimContactPair => pair !== null)
      : [],
    settings: {
      cellSize: numberOr(settings?.cellSize, base.settings.cellSize),
      minQuality: numberOr(settings?.minQuality, base.settings.minQuality),
      maxElements: Math.round(
        numberOr(settings?.maxElements, base.settings.maxElements),
      ),
    },
    inertialRelief: record.inertialRelief === true,
    modalModes: Math.round(numberOr(record.modalModes, base.modalModes)),
    result: asRecord(record.result)
      ? (record.result as unknown as SimStaticResult)
      : null,
    modal: asRecord(record.modal)
      ? (record.modal as unknown as SimModalResult)
      : null,
    thermal: asRecord(record.thermal)
      ? (record.thermal as unknown as SimThermalResult)
      : null,
    buckling: asRecord(record.buckling)
      ? (record.buckling as unknown as SimBucklingResult)
      : null,
    contact: asRecord(record.contact)
      ? (record.contact as unknown as SimContactResult)
      : null,
  };
  return document;
}

export function simulationStudioFromDesign(text: string): SimDocument | null {
  try {
    return parseSimulationDocument(text);
  } catch {
    return null;
  }
}
