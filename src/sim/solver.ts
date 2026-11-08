// Local tetrahedral FEM for Simulation Studio.
//
// Linear static and modal analyses run in-process on the same boundary-
// conforming TET4 mesh the UI displays. The solver converts document units to
// SI, assembles a sparse stiffness matrix, applies face fixtures/loads and
// reports named failures for rigid-body, singular and non-converged systems.

import {
  SimError,
  materialForBody,
  type SimContactResult,
  type SimDocument,
  type SimFace,
  type SimFixture,
  type SimLoad,
  type SimMaterial,
  type SimMesh,
  type SimBucklingMode,
  type SimBucklingResult,
  type SimInertialRelief,
  type SimModalResult,
  type SimStaticResult,
  type SimStaticTargetResult,
  type SimThermalResult,
  type SimVec3,
} from "./model";

export interface SolveOptions {
  signal?: AbortSignal | undefined;
  shouldCancel?: (() => boolean) | undefined;
  tolerance?: number | undefined;
  /** Absolute performance.now() deadline for this solve. */
  deadlineMs?: number | undefined;
  maxIterations?: number | undefined;
  modes?: number | undefined;
  onProgress?: ((stage: string, fraction: number) => void) | undefined;
}

const TET_FACES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [0, 1, 3],
  [0, 2, 3],
  [1, 2, 3],
];

interface SparseMatrix {
  n: number;
  rowPtr: Int32Array;
  columns: Int32Array;
  values: Float64Array;
}

interface ElementData {
  nodes: number[];
  K: Float64Array;
  B: Float64Array;
  D: Float64Array;
  volume: number;
  centroid: SimVec3;
}

interface BoundaryFace {
  nodes: number[];
  area: number;
  normal: SimVec3;
  centroid: SimVec3;
}

interface SolvedSystem {
  x: Float64Array;
  iterations: number;
}

function factorFor(units: "mm" | "in"): number {
  return units === "in" ? 0.0254 : 0.001;
}

function addAt(array: Float64Array, index: number, value: number): void {
  array[index] = (array[index] ?? 0) + value;
}

function subtractAt(array: Float64Array, index: number, value: number): void {
  array[index] = (array[index] ?? 0) - value;
}

function divideAt(array: Float64Array, index: number, value: number): void {
  array[index] = (array[index] ?? 0) / value;
}

function cancelled(options: SolveOptions): boolean {
  return Boolean(options.signal?.aborted || options.shouldCancel?.());
}

function checkCancel(options: SolveOptions): void {
  if (cancelled(options)) {
    throw new SimError("SIM_CANCELLED", "Simulation cancelled.");
  }
  if (
    options.deadlineMs !== undefined &&
    performance.now() > options.deadlineMs
  ) {
    throw new SimError("SIM_BUDGET", "Simulation exceeded its time budget.");
  }
}

function materialPa(material: SimMaterial): {
  E: number;
  nu: number;
  rho: number;
  D: Float64Array;
} {
  const E = material.young * 1e6;
  const nu = material.poisson;
  const lambda = (E * nu) / ((1 + nu) * (1 - 2 * nu));
  const mu = E / (2 * (1 + nu));
  const D = new Float64Array(36);
  D[0] = lambda + 2 * mu;
  D[1] = lambda;
  D[2] = lambda;
  D[6] = lambda;
  D[7] = lambda + 2 * mu;
  D[8] = lambda;
  D[12] = lambda;
  D[13] = lambda;
  D[14] = lambda + 2 * mu;
  D[21] = mu;
  D[28] = mu;
  D[35] = mu;
  return { E, nu, rho: material.density, D };
}

function determinant3(m: Float64Array): number {
  return (
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
  );
}

function inverse3(m: Float64Array): Float64Array | null {
  const det = determinant3(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-30) return null;
  const inv = new Float64Array(9);
  inv[0] = (m[4]! * m[8]! - m[5]! * m[7]!) / det;
  inv[1] = (m[2]! * m[7]! - m[1]! * m[8]!) / det;
  inv[2] = (m[1]! * m[5]! - m[2]! * m[4]!) / det;
  inv[3] = (m[5]! * m[6]! - m[3]! * m[8]!) / det;
  inv[4] = (m[0]! * m[8]! - m[2]! * m[6]!) / det;
  inv[5] = (m[2]! * m[3]! - m[0]! * m[5]!) / det;
  inv[6] = (m[3]! * m[7]! - m[4]! * m[6]!) / det;
  inv[7] = (m[1]! * m[6]! - m[0]! * m[7]!) / det;
  inv[8] = (m[0]! * m[4]! - m[1]! * m[3]!) / det;
  return inv;
}

function elementData(
  mesh: SimMesh,
  element: readonly number[],
  material: ReturnType<typeof materialPa>,
  factor: number,
): ElementData {
  if (element.length !== 4) {
    throw new SimError(
      "SIM_MESH_ELEMENT",
      "Every volume element must be a four-node tetrahedron.",
    );
  }
  const points = element.map((index) => mesh.nodes[index]!);
  const a = points[0]!;
  const b = points[1]!;
  const c = points[2]!;
  const d = points[3]!;
  const ax = a.x * factor;
  const ay = a.y * factor;
  const az = a.z * factor;
  const bx = b.x * factor - ax;
  const by = b.y * factor - ay;
  const bz = b.z * factor - az;
  const cx = c.x * factor - ax;
  const cy = c.y * factor - ay;
  const cz = c.z * factor - az;
  const dx = d.x * factor - ax;
  const dy = d.y * factor - ay;
  const dz = d.z * factor - az;
  // J maps reference (r,s,t) to physical coordinates, with its columns the
  // three edges from node 0. det(J) is six times the tetrahedron volume.
  const J = new Float64Array([bx, cx, dx, by, cy, dy, bz, cz, dz]);
  const det = determinant3(J);
  if (!Number.isFinite(det) || det <= 0) {
    throw new SimError(
      "SIM_ELEMENT_INVERTED",
      "A mesh element has a non-positive Jacobian.",
    );
  }
  const inverse = inverse3(J);
  if (!inverse) {
    throw new SimError(
      "SIM_ELEMENT_SINGULAR",
      "A mesh element has a singular Jacobian.",
    );
  }
  const B = new Float64Array(6 * 12);
  const referenceGradients = [
    [-1, -1, -1],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const;
  for (let i = 0; i < 4; i++) {
    const [gx, gy, gz] = referenceGradients[i]!;
    // grad(N_i) = J^-T * grad_ref(N_i).
    const gradX = inverse[0]! * gx + inverse[3]! * gy + inverse[6]! * gz;
    const gradY = inverse[1]! * gx + inverse[4]! * gy + inverse[7]! * gz;
    const gradZ = inverse[2]! * gx + inverse[5]! * gy + inverse[8]! * gz;
    const bx3 = i * 3;
    B[0 * 12 + bx3] = gradX;
    B[1 * 12 + bx3 + 1] = gradY;
    B[2 * 12 + bx3 + 2] = gradZ;
    B[3 * 12 + bx3] = gradY;
    B[3 * 12 + bx3 + 1] = gradX;
    B[4 * 12 + bx3 + 1] = gradZ;
    B[4 * 12 + bx3 + 2] = gradY;
    B[5 * 12 + bx3] = gradZ;
    B[5 * 12 + bx3 + 2] = gradX;
  }
  const volume = det / 6;
  const K = new Float64Array(12 * 12);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      let sum = 0;
      for (let k = 0; k < 6; k++) {
        const bRow = B[k * 12 + row]!;
        if (bRow === 0) continue;
        for (let l = 0; l < 6; l++) {
          const bCol = B[l * 12 + col]!;
          if (bCol === 0) continue;
          sum += bRow * material.D[k * 6 + l]! * bCol;
        }
      }
      K[row * 12 + col] = sum * volume;
    }
  }
  return {
    nodes: [...element],
    K,
    B,
    D: material.D,
    volume,
    centroid: {
      x: (a.x + b.x + c.x + d.x) / 4,
      y: (a.y + b.y + c.y + d.y) / 4,
      z: (a.z + b.z + c.z + d.z) / 4,
    },
  };
}

function buildSparse(
  dofCount: number,
  triplets: Array<{ row: number; col: number; value: number }>,
): SparseMatrix {
  const rows = Array.from(
    { length: dofCount },
    () => new Map<number, number>(),
  );
  for (const triplet of triplets) {
    if (triplet.value === 0) continue;
    const row = rows[triplet.row]!;
    row.set(triplet.col, (row.get(triplet.col) ?? 0) + triplet.value);
  }
  const rowPtr = new Int32Array(dofCount + 1);
  let count = 0;
  for (let i = 0; i < dofCount; i++) {
    rowPtr[i] = count;
    count += rows[i]!.size;
  }
  rowPtr[dofCount] = count;
  const columns = new Int32Array(count);
  const values = new Float64Array(count);
  let at = 0;
  for (let i = 0; i < dofCount; i++) {
    const entries = [...rows[i]!.entries()].sort((a, b) => a[0] - b[0]);
    for (const [column, value] of entries) {
      columns[at] = column;
      values[at] = value;
      at += 1;
    }
  }
  return { n: dofCount, rowPtr, columns, values };
}

function multiply(matrix: SparseMatrix, vector: Float64Array): Float64Array {
  const out = new Float64Array(matrix.n);
  for (let row = 0; row < matrix.n; row++) {
    let sum = 0;
    for (let at = matrix.rowPtr[row]!; at < matrix.rowPtr[row + 1]!; at++) {
      sum += matrix.values[at]! * vector[matrix.columns[at]!]!;
    }
    out[row] = sum;
  }
  return out;
}

function submatrix(
  matrix: SparseMatrix,
  free: readonly number[],
): { matrix: SparseMatrix; fullToFree: Int32Array } {
  const fullToFree = new Int32Array(matrix.n).fill(-1);
  for (let i = 0; i < free.length; i++) fullToFree[free[i]!] = i;
  const rows = Array.from(
    { length: free.length },
    () => new Map<number, number>(),
  );
  for (let localRow = 0; localRow < free.length; localRow++) {
    const fullRow = free[localRow]!;
    for (
      let at = matrix.rowPtr[fullRow]!;
      at < matrix.rowPtr[fullRow + 1]!;
      at++
    ) {
      const localCol = fullToFree[matrix.columns[at]!]!;
      if (localCol < 0) continue;
      rows[localRow]!.set(localCol, matrix.values[at]!);
    }
  }
  const rowPtr = new Int32Array(free.length + 1);
  let count = 0;
  for (let i = 0; i < free.length; i++) {
    rowPtr[i] = count;
    count += rows[i]!.size;
  }
  rowPtr[free.length] = count;
  const columns = new Int32Array(count);
  const values = new Float64Array(count);
  let at = 0;
  for (let i = 0; i < free.length; i++) {
    for (const [column, value] of rows[i]!) {
      columns[at] = column;
      values[at] = value;
      at += 1;
    }
  }
  return { matrix: { n: free.length, rowPtr, columns, values }, fullToFree };
}

function conjugateGradient(
  matrix: SparseMatrix,
  rhs: Float64Array,
  options: SolveOptions,
  label: string,
): SolvedSystem {
  const n = matrix.n;
  const x = new Float64Array(n);
  const r = Float64Array.from(rhs);
  const diagonal = new Float64Array(n);
  for (let row = 0; row < n; row++) {
    for (let at = matrix.rowPtr[row]!; at < matrix.rowPtr[row + 1]!; at++) {
      if (matrix.columns[at] === row) diagonal[row] = matrix.values[at]!;
    }
    if (!(diagonal[row]! > 0)) {
      throw new SimError(
        "SIM_SINGULAR",
        `${label} stiffness is singular at free degree of freedom ${row}.`,
      );
    }
  }
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const Ap = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    z[i] = r[i]! / diagonal[i]!;
    p[i] = z[i]!;
  }
  let rz = 0;
  let rhsNorm = 0;
  for (let i = 0; i < n; i++) {
    rz += r[i]! * z[i]!;
    rhsNorm += rhs[i]! * rhs[i]!;
  }
  if (rhsNorm === 0) return { x, iterations: 0 };
  const target = Math.max(1e-12, options.tolerance ?? 1e-8);
  const maxIterations = Math.max(50, options.maxIterations ?? 2_000);
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (iteration % 25 === 0) checkCancel(options);
    const product = multiply(matrix, p);
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i]! * product[i]!;
    if (!Number.isFinite(pAp) || pAp <= 0) {
      throw new SimError(
        "SIM_SINGULAR",
        `${label} stiffness is singular or not positive definite (CG breakdown).`,
      );
    }
    const alpha = rz / pAp;
    for (let i = 0; i < n; i++) {
      x[i] = x[i]! + alpha * p[i]!;
      r[i] = r[i]! - alpha * product[i]!;
    }
    let residual = 0;
    for (let i = 0; i < n; i++) residual += r[i]! * r[i]!;
    if (Math.sqrt(residual / rhsNorm) <= target) {
      return { x, iterations: iteration + 1 };
    }
    for (let i = 0; i < n; i++) z[i] = r[i]! / diagonal[i]!;
    let next = 0;
    for (let i = 0; i < n; i++) next += r[i]! * z[i]!;
    const beta = next / rz;
    rz = next;
    for (let i = 0; i < n; i++) p[i] = z[i]! + beta * p[i]!;
  }
  throw new SimError(
    "SIM_NO_CONVERGENCE",
    `${label} did not converge within ${maxIterations} iterations.`,
  );
}

function faceNodes(mesh: SimMesh, face: SimFace): number[] {
  const xs = mesh.nodes.map((node) => node.x);
  const ys = mesh.nodes.map((node) => node.y);
  const zs = mesh.nodes.map((node) => node.z);
  const min = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    z: Math.min(...zs),
  };
  const max = {
    x: Math.max(...xs),
    y: Math.max(...ys),
    z: Math.max(...zs),
  };
  const tolerance = Math.max(1e-7, mesh.cellSize * 1e-3);
  const axis = face[0] as "x" | "y" | "z";
  const target = face.endsWith("-min") ? min[axis] : max[axis];
  const result: number[] = [];
  for (let i = 0; i < mesh.nodes.length; i++) {
    if (Math.abs(mesh.nodes[i]![axis] - target) <= tolerance) result.push(i);
  }
  return result;
}

function boundaryFaces(mesh: SimMesh, factor: number): BoundaryFace[] {
  const map = new Map<string, { count: number; face: BoundaryFace }>();
  for (const element of mesh.elements) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const node of element) {
      const point = mesh.nodes[node]!;
      cx += (point.x * factor) / 4;
      cy += (point.y * factor) / 4;
      cz += (point.z * factor) / 4;
    }
    for (const face of TET_FACES) {
      const nodes = face.map((index) => element[index]!);
      const key = [...nodes].sort((a, b) => a - b).join(",");
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const points = nodes.map((index) => {
        const point = mesh.nodes[index]!;
        return {
          x: point.x * factor,
          y: point.y * factor,
          z: point.z * factor,
        };
      });
      const a = points[0]!;
      const b = points[1]!;
      const c = points[2]!;
      const normalVector = {
        x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
        y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
        z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
      };
      const twiceArea = Math.hypot(
        normalVector.x,
        normalVector.y,
        normalVector.z,
      );
      const area = twiceArea / 2;
      const normal =
        twiceArea > 0
          ? {
              x: normalVector.x / twiceArea,
              y: normalVector.y / twiceArea,
              z: normalVector.z / twiceArea,
            }
          : { x: 0, y: 0, z: 0 };
      const centroid = {
        x: (a.x + b.x + c.x) / 3,
        y: (a.y + b.y + c.y) / 3,
        z: (a.z + b.z + c.z) / 3,
      };
      const outward = {
        x: centroid.x - cx,
        y: centroid.y - cy,
        z: centroid.z - cz,
      };
      if (
        normal.x * outward.x + normal.y * outward.y + normal.z * outward.z <
        0
      ) {
        normal.x *= -1;
        normal.y *= -1;
        normal.z *= -1;
      }
      map.set(key, {
        count: 1,
        face: { nodes, area, normal, centroid },
      });
    }
  }
  return [...map.values()]
    .filter((entry) => entry.count === 1)
    .map((entry) => entry.face);
}

function isActiveLoad(load: SimLoad): boolean {
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
    return Math.hypot(load.vector.x, load.vector.y, load.vector.z) > 0;
  }
  if (load.kind === "pressure" || load.kind === "gravity") {
    return load.magnitude > 0;
  }
  if (load.kind === "thermal") return load.temperatureDelta !== 0;
  return false;
}

interface LoadBody {
  mesh: SimMesh;
  elements: ElementData[];
  material: ReturnType<typeof materialPa>;
  cte: number;
  offset: number;
}

function vectorSub(a: SimVec3, b: SimVec3): SimVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vectorCross(a: SimVec3, b: SimVec3): SimVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vectorScale(value: SimVec3, scale: number): SimVec3 {
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale };
}

function vectorUnit(value: SimVec3): SimVec3 | null {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-15
    ? { x: value.x / length, y: value.y / length, z: value.z / length }
    : null;
}

function nodalVolumes(body: LoadBody): Float64Array {
  const volumes = new Float64Array(body.mesh.nodes.length);
  for (const element of body.elements) {
    for (const node of element.nodes) addAt(volumes, node, element.volume / 4);
  }
  return volumes;
}

function bodyCentroidM(body: LoadBody, factor: number): SimVec3 {
  let volume = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const element of body.elements) {
    volume += element.volume;
    x += element.centroid.x * factor * element.volume;
    y += element.centroid.y * factor * element.volume;
    z += element.centroid.z * factor * element.volume;
  }
  if (volume <= 0) return { x: 0, y: 0, z: 0 };
  return { x: x / volume, y: y / volume, z: z / volume };
}

function applyLoad(
  body: LoadBody,
  load: SimLoad,
  factor: number,
  addForce: (localNode: number, values: SimVec3) => void,
): void {
  const nodes = () => {
    const selected = faceNodes(body.mesh, load.face);
    if (!selected.length) {
      throw new SimError(
        "SIM_SELECTION_FACE",
        `Load "${load.name}" selects an empty face.`,
      );
    }
    return selected;
  };
  const addBodyForce = (
    value: (centroid: SimVec3, volume: number) => SimVec3,
  ) => {
    for (const element of body.elements) {
      const each = vectorScale(
        value(element.centroid, element.volume),
        element.volume / 4,
      );
      for (const node of element.nodes) addForce(node, each);
    }
  };

  if (load.kind === "force" || load.kind === "remote") {
    if (load.region === "body") {
      const volumes = nodalVolumes(body);
      let total = 0;
      for (const volume of volumes) total += volume;
      if (total <= 0) {
        throw new SimError(
          "SIM_LOAD_EMPTY",
          `Load "${load.name}" has no body volume.`,
        );
      }
      for (let node = 0; node < volumes.length; node++) {
        addForce(node, vectorScale(load.vector, volumes[node]! / total));
      }
    } else {
      const selected = nodes();
      const each = vectorScale(load.vector, 1 / selected.length);
      for (const node of selected) addForce(node, each);
    }
    return;
  }

  if (load.kind === "moment") {
    const moment = load.vector;
    if (load.region === "body") {
      const volumes = nodalVolumes(body);
      const centroid = bodyCentroidM(body, factor);
      let denominator = 0;
      for (let node = 0; node < body.mesh.nodes.length; node++) {
        const point = body.mesh.nodes[node]!;
        const r = {
          x: point.x * factor - centroid.x,
          y: point.y * factor - centroid.y,
          z: point.z * factor - centroid.z,
        };
        denominator += volumes[node]! * (r.x ** 2 + r.y ** 2 + r.z ** 2);
      }
      if (denominator <= 1e-30) {
        throw new SimError(
          "SIM_LOAD_MOMENT",
          `Moment "${load.name}" has no body volume to act on.`,
        );
      }
      for (let node = 0; node < body.mesh.nodes.length; node++) {
        const point = body.mesh.nodes[node]!;
        const r = {
          x: point.x * factor - centroid.x,
          y: point.y * factor - centroid.y,
          z: point.z * factor - centroid.z,
        };
        addForce(
          node,
          vectorScale(vectorCross(moment, r), volumes[node]! / denominator),
        );
      }
    } else {
      const selected = nodes();
      const centroid = selected.reduce(
        (sum, node) => {
          const point = body.mesh.nodes[node]!;
          return {
            x: sum.x + (point.x * factor) / selected.length,
            y: sum.y + (point.y * factor) / selected.length,
            z: sum.z + (point.z * factor) / selected.length,
          };
        },
        { x: 0, y: 0, z: 0 },
      );
      let denominator = 0;
      const offsets = selected.map((node) => {
        const point = body.mesh.nodes[node]!;
        const r = vectorSub(
          { x: point.x * factor, y: point.y * factor, z: point.z * factor },
          centroid,
        );
        denominator += r.x ** 2 + r.y ** 2 + r.z ** 2;
        return r;
      });
      if (denominator <= 1e-30) {
        throw new SimError(
          "SIM_LOAD_MOMENT",
          `Moment "${load.name}" needs a face with finite area.`,
        );
      }
      for (let index = 0; index < selected.length; index++) {
        addForce(
          selected[index]!,
          vectorScale(vectorCross(moment, offsets[index]!), 1 / denominator),
        );
      }
    }
    return;
  }

  if (load.kind === "bearing") {
    const direction = vectorUnit(load.vector);
    if (!direction) {
      throw new SimError(
        "SIM_LOAD_BEARING",
        `Bearing load "${load.name}" needs a non-zero force direction.`,
      );
    }
    const selected = new Set(nodes());
    const weighted: Array<{ nodes: number[]; weight: number }> = [];
    let totalWeight = 0;
    for (const face of boundaryFaces(body.mesh, factor)) {
      if (!face.nodes.every((node) => selected.has(node))) continue;
      const alignment = Math.max(
        0,
        -(
          face.normal.x * direction.x +
          face.normal.y * direction.y +
          face.normal.z * direction.z
        ),
      );
      const weight = face.area * alignment;
      if (weight <= 0) continue;
      weighted.push({ nodes: face.nodes, weight });
      totalWeight += weight;
    }
    if (totalWeight <= 0) {
      throw new SimError(
        "SIM_LOAD_BEARING",
        `Bearing load "${load.name}" has no positive projection onto the selected face.`,
      );
    }
    for (const entry of weighted) {
      const each = vectorScale(
        load.vector,
        entry.weight / totalWeight / entry.nodes.length,
      );
      for (const node of entry.nodes) addForce(node, each);
    }
    return;
  }

  if (load.kind === "pressure") {
    const selected = new Set(nodes());
    for (const face of boundaryFaces(body.mesh, factor)) {
      if (!face.nodes.every((node) => selected.has(node))) continue;
      const each = (-load.magnitude * face.area) / 3;
      for (const node of face.nodes) {
        addForce(node, {
          x: face.normal.x * each,
          y: face.normal.y * each,
          z: face.normal.z * each,
        });
      }
    }
    return;
  }

  if (load.kind === "gravity") {
    addBodyForce(() => ({
      x: 0,
      y: 0,
      z: -load.magnitude * body.material.rho,
    }));
    return;
  }

  if (load.kind === "acceleration") {
    addBodyForce(() => vectorScale(load.vector, body.material.rho));
    return;
  }

  if (load.kind === "angular-velocity") {
    const omega = load.vector;
    const centroid = bodyCentroidM(body, factor);
    addBodyForce((elementCentroid) => {
      const r = vectorSub(
        {
          x: elementCentroid.x * factor,
          y: elementCentroid.y * factor,
          z: elementCentroid.z * factor,
        },
        centroid,
      );
      const centrifugal = vectorCross(omega, vectorCross(omega, r));
      return vectorScale(centrifugal, -body.material.rho);
    });
    return;
  }

  if (load.kind === "thermal") {
    applyThermalLoad(body, load, body.cte, addForce);
    return;
  }
}

function applyThermalLoad(
  body: LoadBody,
  load: SimLoad,
  cte: number,
  addForce: (localNode: number, values: SimVec3) => void,
): void {
  const thermalStrain = cte * load.temperatureDelta;
  const eigenstrain = Float64Array.from([
    thermalStrain,
    thermalStrain,
    thermalStrain,
    0,
    0,
    0,
  ]);
  for (const data of body.elements) {
    const scale = data.volume / 4;
    for (let row = 0; row < 12; row++) {
      let sum = 0;
      for (let k = 0; k < 6; k++) {
        let stress = 0;
        for (let l = 0; l < 6; l++) {
          stress += data.D[k * 6 + l]! * eigenstrain[l]!;
        }
        sum += data.B[k * 12 + row]! * stress;
      }
      addForce(data.nodes[Math.floor(row / 3)]!, {
        x: row % 3 === 0 ? sum * scale : 0,
        y: row % 3 === 1 ? sum * scale : 0,
        z: row % 3 === 2 ? sum * scale : 0,
      });
    }
  }
}

function applyInertialRelief(
  bodies: LoadBody[],
  factor: number,
  force: Float64Array<ArrayBuffer>,
): SimInertialRelief | null {
  let mass = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const body of bodies) {
    for (const element of body.elements) {
      const elementMass = body.material.rho * element.volume;
      mass += elementMass;
      cx += element.centroid.x * factor * elementMass;
      cy += element.centroid.y * factor * elementMass;
      cz += element.centroid.z * factor * elementMass;
    }
  }
  if (mass <= 0) return null;
  const centroid = { x: cx / mass, y: cy / mass, z: cz / mass };
  const totalForce = { x: 0, y: 0, z: 0 };
  const totalMoment = { x: 0, y: 0, z: 0 };
  for (const body of bodies) {
    for (let node = 0; node < body.mesh.nodes.length; node++) {
      const global = (body.offset + node) * 3;
      const value = {
        x: force[global] ?? 0,
        y: force[global + 1] ?? 0,
        z: force[global + 2] ?? 0,
      };
      totalForce.x += value.x;
      totalForce.y += value.y;
      totalForce.z += value.z;
      const point = body.mesh.nodes[node]!;
      const r = {
        x: point.x * factor - centroid.x,
        y: point.y * factor - centroid.y,
        z: point.z * factor - centroid.z,
      };
      const moment = vectorCross(r, value);
      totalMoment.x += moment.x;
      totalMoment.y += moment.y;
      totalMoment.z += moment.z;
    }
  }
  const inertia = new Float64Array(9);
  for (const body of bodies) {
    for (const element of body.elements) {
      const elementMass = body.material.rho * element.volume;
      const r = {
        x: element.centroid.x * factor - centroid.x,
        y: element.centroid.y * factor - centroid.y,
        z: element.centroid.z * factor - centroid.z,
      };
      addAt(inertia, 0, elementMass * (r.y ** 2 + r.z ** 2));
      addAt(inertia, 4, elementMass * (r.x ** 2 + r.z ** 2));
      addAt(inertia, 8, elementMass * (r.x ** 2 + r.y ** 2));
      addAt(inertia, 1, -elementMass * r.x * r.y);
      addAt(inertia, 3, -elementMass * r.x * r.y);
      addAt(inertia, 2, -elementMass * r.x * r.z);
      addAt(inertia, 6, -elementMass * r.x * r.z);
      addAt(inertia, 5, -elementMass * r.y * r.z);
      addAt(inertia, 7, -elementMass * r.y * r.z);
    }
  }
  const inverse = inverse3(inertia);
  if (!inverse) return null;
  const acceleration = vectorScale(totalForce, 1 / mass);
  const angularAcceleration = {
    x: -(
      inverse[0]! * totalMoment.x +
      inverse[1]! * totalMoment.y +
      inverse[2]! * totalMoment.z
    ),
    y: -(
      inverse[3]! * totalMoment.x +
      inverse[4]! * totalMoment.y +
      inverse[5]! * totalMoment.z
    ),
    z: -(
      inverse[6]! * totalMoment.x +
      inverse[7]! * totalMoment.y +
      inverse[8]! * totalMoment.z
    ),
  };
  for (const body of bodies) {
    for (const element of body.elements) {
      const r = {
        x: element.centroid.x * factor - centroid.x,
        y: element.centroid.y * factor - centroid.y,
        z: element.centroid.z * factor - centroid.z,
      };
      const pointAcceleration = {
        x: acceleration.x + vectorCross(angularAcceleration, r).x,
        y: acceleration.y + vectorCross(angularAcceleration, r).y,
        z: acceleration.z + vectorCross(angularAcceleration, r).z,
      };
      const each = vectorScale(
        pointAcceleration,
        (-body.material.rho * element.volume) / 4,
      );
      for (const node of element.nodes) {
        const global = (body.offset + node) * 3;
        addAt(force, global, each.x);
        addAt(force, global + 1, each.y);
        addAt(force, global + 2, each.z);
      }
    }
  }
  return {
    accelerationMps2: acceleration,
    angularAccelerationRadS2: angularAcceleration,
    supportNodes: [],
  };
}

function minimalSupportNodes(mesh: SimMesh): number[] {
  const extremes = [
    { axis: "x" as const, sign: 1 },
    { axis: "x" as const, sign: -1 },
    { axis: "y" as const, sign: 1 },
    { axis: "y" as const, sign: -1 },
    { axis: "z" as const, sign: 1 },
    { axis: "z" as const, sign: -1 },
  ];
  const result: number[] = [];
  for (const extreme of extremes) {
    let best = -1;
    let bestValue = extreme.sign > 0 ? -Infinity : Infinity;
    for (let index = 0; index < mesh.nodes.length; index++) {
      const value = mesh.nodes[index]![extreme.axis];
      if (
        (extreme.sign > 0 && value > bestValue) ||
        (extreme.sign < 0 && value < bestValue)
      ) {
        best = index;
        bestValue = value;
      }
    }
    if (best >= 0 && !result.includes(best)) result.push(best);
    if (result.length === 3) break;
  }
  if (result.length < 3) {
    throw new SimError(
      "SIM_INERTIAL_SUPPORT",
      "Inertial relief needs at least three distinct mesh nodes for support.",
    );
  }
  return result;
}

interface ThermalElementData {
  nodes: number[];
  K: Float64Array;
  volume: number;
}

function thermalElementData(
  mesh: SimMesh,
  element: readonly number[],
  conductivity: number,
  factor: number,
): ThermalElementData {
  if (element.length !== 4) {
    throw new SimError(
      "SIM_MESH_ELEMENT",
      "Every volume element must be a four-node tetrahedron.",
    );
  }
  const points = element.map((index) => mesh.nodes[index]!);
  const a = points[0]!;
  const b = points[1]!;
  const c = points[2]!;
  const d = points[3]!;
  const ax = a.x * factor;
  const ay = a.y * factor;
  const az = a.z * factor;
  const bx = b.x * factor - ax;
  const by = b.y * factor - ay;
  const bz = b.z * factor - az;
  const cx = c.x * factor - ax;
  const cy = c.y * factor - ay;
  const cz = c.z * factor - az;
  const dx = d.x * factor - ax;
  const dy = d.y * factor - ay;
  const dz = d.z * factor - az;
  const J = new Float64Array([bx, cx, dx, by, cy, dy, bz, cz, dz]);
  const det = determinant3(J);
  if (!Number.isFinite(det) || det <= 0) {
    throw new SimError(
      "SIM_ELEMENT_INVERTED",
      "A mesh element has a non-positive Jacobian.",
    );
  }
  const inverse = inverse3(J);
  if (!inverse) {
    throw new SimError(
      "SIM_ELEMENT_SINGULAR",
      "A mesh element has a singular Jacobian.",
    );
  }
  const referenceGradients = [
    [-1, -1, -1],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const;
  const gradients: Array<[number, number, number]> = [];
  for (const [gx, gy, gz] of referenceGradients) {
    gradients.push([
      inverse[0]! * gx + inverse[3]! * gy + inverse[6]! * gz,
      inverse[1]! * gx + inverse[4]! * gy + inverse[7]! * gz,
      inverse[2]! * gx + inverse[5]! * gy + inverse[8]! * gz,
    ]);
  }
  const volume = det / 6;
  const K = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const gi = gradients[i]!;
      const gj = gradients[j]!;
      K[i * 4 + j] =
        conductivity * volume * (gi[0] * gj[0] + gi[1] * gj[1] + gi[2] * gj[2]);
    }
  }
  return { nodes: [...element], K, volume };
}

export function simulateThermal(
  document: SimDocument,
  material: SimMaterial,
  options: SolveOptions = {},
): SimThermalResult {
  const mesh = document.mesh;
  if (!mesh) {
    throw new SimError("SIM_MESH_MISSING", "Generate a volume mesh first.");
  }
  if (!Number.isFinite(material.conductivity) || material.conductivity <= 0) {
    throw new SimError(
      "SIM_THERMAL_CONDUCTIVITY",
      "Thermal conductivity must be a positive finite value.",
    );
  }
  if (!document.thermalBoundaries.length) {
    throw new SimError(
      "SIM_THERMAL_BC_MISSING",
      "Add a fixed temperature, heat flux or convection boundary before solving.",
    );
  }

  const started = performance.now();
  const factor = factorFor(mesh.units);
  const dofCount = mesh.nodes.length;
  const triplets: Array<{ row: number; col: number; value: number }> = [];
  for (const [index, element] of mesh.elements.entries()) {
    if (index % 200 === 0) checkCancel(options);
    const data = thermalElementData(
      mesh,
      element,
      material.conductivity,
      factor,
    );
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const value = data.K[row * 4 + col]!;
        if (value === 0) continue;
        triplets.push({
          row: data.nodes[row]!,
          col: data.nodes[col]!,
          value,
        });
      }
    }
  }
  checkCancel(options);
  options.onProgress?.("Assembling thermal boundaries", 0.35);

  const rhs = new Float64Array(dofCount);
  const fixed = new Map<number, number>();
  const faces = boundaryFaces(mesh, factor);
  let appliedHeatFluxW = 0;
  let anchored = false;

  for (const boundary of document.thermalBoundaries) {
    if (boundary.bodyId !== mesh.bodyId) {
      throw new SimError(
        "SIM_SELECTION_BODY",
        `Thermal boundary "${boundary.name}" selects a body that is not meshed.`,
      );
    }
    if (!Number.isFinite(boundary.value)) {
      throw new SimError(
        "SIM_THERMAL_VALUE",
        `Thermal boundary "${boundary.name}" has a non-finite value.`,
      );
    }
    const selected = new Set(faceNodes(mesh, boundary.face));
    if (!selected.size) {
      throw new SimError(
        "SIM_SELECTION_FACE",
        `Thermal boundary "${boundary.name}" selects an empty face.`,
      );
    }
    const matching = faces.filter((face) =>
      face.nodes.every((node) => selected.has(node)),
    );
    if (!matching.length) {
      throw new SimError(
        "SIM_SELECTION_FACE",
        `Thermal boundary "${boundary.name}" does not match a boundary face.`,
      );
    }

    if (boundary.kind === "temperature") {
      anchored = true;
      for (const face of matching) {
        for (const node of face.nodes) {
          const previous = fixed.get(node);
          if (
            previous !== undefined &&
            Math.abs(previous - boundary.value) > 1e-7
          ) {
            throw new SimError(
              "SIM_THERMAL_CONFLICT",
              `Thermal boundary "${boundary.name}" conflicts with another fixed temperature on the same node.`,
            );
          }
          fixed.set(node, boundary.value);
        }
      }
    } else if (boundary.kind === "heat-flux") {
      for (const face of matching) {
        const heat = boundary.value * face.area;
        appliedHeatFluxW += heat;
        const each = heat / 3;
        for (const node of face.nodes) addAt(rhs, node, each);
      }
    } else if (boundary.kind === "convection") {
      if (!(boundary.coefficient > 0)) {
        throw new SimError(
          "SIM_THERMAL_CONVECTION",
          `Convection boundary "${boundary.name}" needs a positive coefficient.`,
        );
      }
      anchored = true;
      for (const face of matching) {
        const each = (boundary.coefficient * face.area) / 3;
        for (const node of face.nodes) {
          triplets.push({ row: node, col: node, value: each });
          addAt(rhs, node, each * boundary.value);
        }
      }
    } else {
      throw new SimError(
        "SIM_THERMAL_KIND",
        `Unknown thermal boundary kind "${String(boundary.kind)}".`,
      );
    }
  }

  if (!anchored) {
    throw new SimError(
      "SIM_THERMAL_UNCONSTRAINED",
      "The thermal case needs a fixed temperature or convection boundary to set an absolute temperature.",
    );
  }
  const stiffness = buildSparse(dofCount, triplets);
  const free: number[] = [];
  for (let i = 0; i < dofCount; i++) if (!fixed.has(i)) free.push(i);
  if (!free.length) {
    throw new SimError(
      "SIM_THERMAL_FULLY_CONSTRAINED",
      "Every node has a fixed temperature; there is nothing to solve.",
    );
  }

  options.onProgress?.("Solving thermal case", 0.55);
  const reduced = submatrix(stiffness, free);
  const reducedRhs = new Float64Array(free.length);
  for (let i = 0; i < free.length; i++) {
    const full = free[i]!;
    let value = rhs[full]!;
    for (
      let at = stiffness.rowPtr[full]!;
      at < stiffness.rowPtr[full + 1]!;
      at++
    ) {
      const fixedValue = fixed.get(stiffness.columns[at]!);
      if (fixedValue !== undefined) {
        value -= stiffness.values[at]! * fixedValue;
      }
    }
    reducedRhs[i] = value;
  }
  const solved = conjugateGradient(
    reduced.matrix,
    reducedRhs,
    options,
    "Thermal",
  );
  const temperature = new Float64Array(dofCount);
  for (let i = 0; i < free.length; i++) temperature[free[i]!] = solved.x[i]!;
  for (const [node, value] of fixed) temperature[node] = value;

  let minTemperatureC = Infinity;
  let maxTemperatureC = -Infinity;
  for (const value of temperature) {
    if (!Number.isFinite(value)) {
      throw new SimError(
        "SIM_THERMAL_NONFINITE",
        "The thermal solve produced a non-finite temperature.",
      );
    }
    minTemperatureC = Math.min(minTemperatureC, value);
    maxTemperatureC = Math.max(maxTemperatureC, value);
  }
  options.onProgress?.("Complete", 1);
  return {
    minTemperatureC,
    maxTemperatureC,
    temperaturesC: [...temperature],
    appliedHeatFluxW,
    solveMs: performance.now() - started,
    iterations: solved.iterations,
  };
}

export function simulateStatic(
  document: SimDocument,
  material: SimMaterial,
  options: SolveOptions = {},
): SimStaticResult {
  if (document.contacts.length > 0) {
    return simulateContactStatic(document, material, options);
  }
  const mesh = document.mesh;
  if (!mesh) {
    throw new SimError("SIM_MESH_MISSING", "Generate a volume mesh first.");
  }
  if (!document.loads.some(isActiveLoad)) {
    throw new SimError("SIM_LOAD_MISSING", "The case has no active load.");
  }
  const started = performance.now();
  const factor = factorFor(mesh.units);
  const materialData = materialPa(material);
  const elementDataList: ElementData[] = [];
  const dofCount = mesh.nodes.length * 3;
  const triplets: Array<{ row: number; col: number; value: number }> = [];
  for (const element of mesh.elements) {
    const data = elementData(mesh, element, materialData, factor);
    elementDataList.push(data);
    for (let row = 0; row < 12; row++) {
      const globalRow = data.nodes[Math.floor(row / 3)]! * 3 + (row % 3);
      for (let col = 0; col < 12; col++) {
        const value = data.K[row * 12 + col]!;
        if (value === 0) continue;
        const globalCol = data.nodes[Math.floor(col / 3)]! * 3 + (col % 3);
        triplets.push({ row: globalRow, col: globalCol, value });
      }
    }
  }
  checkCancel(options);
  options.onProgress?.("Assembling loads", 0.3);
  const force = new Float64Array(dofCount);
  const addForce = (node: number, values: SimVec3) => {
    addAt(force, node * 3, values.x);
    addAt(force, node * 3 + 1, values.y);
    addAt(force, node * 3 + 2, values.z);
  };
  const loadBody: LoadBody = {
    mesh,
    elements: elementDataList,
    material: materialData,
    cte: material.cte,
    offset: 0,
  };
  for (const load of document.loads) {
    if (load.bodyId !== mesh.bodyId) {
      throw new SimError(
        "SIM_SELECTION_BODY",
        `Load "${load.name}" selects a body that is not meshed.`,
      );
    }
    applyLoad(loadBody, load, factor, addForce);
  }
  let inertialRelief: SimInertialRelief | undefined;
  if (document.inertialRelief) {
    const balanced = applyInertialRelief([loadBody], factor, force);
    if (!balanced) {
      throw new SimError(
        "SIM_INERTIAL_RELIEF",
        "Inertial relief could not determine a positive mass and inertia tensor.",
      );
    }
    inertialRelief = balanced;
  }
  const fixed: boolean[] = new Array(dofCount).fill(false);
  if (!document.fixtures.length) {
    if (!inertialRelief) {
      throw new SimError(
        "SIM_RIGID_BODY",
        "The case has no fixtures; rigid-body motion is unconstrained. Enable inertial relief or add a fixture.",
      );
    }
    const supports = minimalSupportNodes(mesh);
    inertialRelief = { ...inertialRelief, supportNodes: supports };
    fixed[supports[0]! * 3] = true;
    fixed[supports[0]! * 3 + 1] = true;
    fixed[supports[0]! * 3 + 2] = true;
    fixed[supports[1]! * 3 + 1] = true;
    fixed[supports[1]! * 3 + 2] = true;
    fixed[supports[2]! * 3 + 2] = true;
  }
  for (const fixture of document.fixtures) {
    if (fixture.bodyId !== mesh.bodyId) {
      throw new SimError(
        "SIM_SELECTION_BODY",
        `Fixture "${fixture.name}" selects a body that is not meshed.`,
      );
    }
    const nodes = faceNodes(mesh, fixture.face);
    const axis = fixture.face[0] as "x" | "y" | "z";
    for (const node of nodes) {
      if (fixture.kind === "fixed" || fixture.kind === "pinned") {
        fixed[node * 3] = true;
        fixed[node * 3 + 1] = true;
        fixed[node * 3 + 2] = true;
      } else {
        fixed[node * 3 + (axis === "x" ? 0 : axis === "y" ? 1 : 2)] = true;
      }
    }
  }
  const free: number[] = [];
  for (let i = 0; i < dofCount; i++) if (!fixed[i]) free.push(i);
  if (!free.length) {
    throw new SimError(
      "SIM_NO_FREE_DOF",
      "Every degree of freedom is constrained; there is nothing to solve.",
    );
  }
  if (free.length < 6) {
    throw new SimError(
      "SIM_RIGID_BODY",
      "Fewer than six free degrees of freedom remain; the model can still move rigidly.",
    );
  }
  options.onProgress?.("Solving static case", 0.5);
  const stiffness = buildSparse(dofCount, triplets);
  const reduced = submatrix(stiffness, free);
  const rhs = new Float64Array(free.length);
  for (let i = 0; i < free.length; i++) rhs[i] = force[free[i]!]!;
  const solved = conjugateGradient(reduced.matrix, rhs, options, "Static");
  const displacement = new Float64Array(dofCount);
  for (let i = 0; i < free.length; i++) displacement[free[i]!] = solved.x[i]!;
  const fullResidual = multiply(stiffness, displacement);
  for (let i = 0; i < dofCount; i++) subtractAt(fullResidual, i, force[i]!);
  const reactions: Array<{ node: number; values: SimVec3 }> = [];
  for (let node = 0; node < mesh.nodes.length; node++) {
    if (!fixed[node * 3] && !fixed[node * 3 + 1] && !fixed[node * 3 + 2])
      continue;
    const values = {
      x: fixed[node * 3] ? fullResidual[node * 3]! : 0,
      y: fixed[node * 3 + 1] ? fullResidual[node * 3 + 1]! : 0,
      z: fixed[node * 3 + 2] ? fullResidual[node * 3 + 2]! : 0,
    };
    if (Math.abs(values.x) + Math.abs(values.y) + Math.abs(values.z) > 1e-9) {
      reactions.push({ node, values });
    }
  }
  options.onProgress?.("Recovering stresses", 0.8);
  const recovered = recoverBodyResult(
    mesh,
    0,
    elementDataList,
    displacement,
    material.yield * 1e6,
  );
  const maxReactionN = reactions.reduce((maximum, reaction) => {
    const magnitude = Math.hypot(
      reaction.values.x,
      reaction.values.y,
      reaction.values.z,
    );
    return Math.max(maximum, magnitude);
  }, 0);
  options.onProgress?.("Complete", 1);
  return {
    ...recovered,
    reactionsN: reactions,
    maxReactionN,
    solveMs: performance.now() - started,
    iterations: solved.iterations,
    ...(inertialRelief ? { inertialRelief } : {}),
  };
}

interface ContactCandidate {
  pairId: string;
  kind: "bonded" | "sliding" | "separating";
  nodeGlobal: number;
  faceGlobal: [number, number, number];
  weights: [number, number, number];
  normal: SimVec3;
  tangent1: SimVec3;
  tangent2: SimVec3;
  gapM: number;
  toleranceM: number;
  penaltyNPerM: number;
  friction: number;
}

function contactSub(a: SimVec3, b: SimVec3): SimVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function contactDot(a: SimVec3, b: SimVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function contactCross(a: SimVec3, b: SimVec3): SimVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function contactNormalize(value: SimVec3): SimVec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-15
    ? { x: value.x / length, y: value.y / length, z: value.z / length }
    : { x: 1, y: 0, z: 0 };
}

function contactTangents(normal: SimVec3): [SimVec3, SimVec3] {
  const helper =
    Math.abs(normal.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const tangent1 = contactNormalize(contactCross(normal, helper));
  const tangent2 = contactNormalize(contactCross(normal, tangent1));
  return [tangent1, tangent2];
}

function contactKey(candidate: ContactCandidate): string {
  return `${candidate.pairId}:${candidate.nodeGlobal}`;
}

function closestOnTriangle(
  point: SimVec3,
  a: SimVec3,
  b: SimVec3,
  c: SimVec3,
): { point: SimVec3; weights: [number, number, number] } {
  const ab = contactSub(b, a);
  const ac = contactSub(c, a);
  const ap = contactSub(point, a);
  const d1 = contactDot(ab, ap);
  const d2 = contactDot(ac, ap);
  if (d1 <= 0 && d2 <= 0) {
    return { point: a, weights: [1, 0, 0] };
  }
  const bp = contactSub(point, b);
  const d3 = contactDot(ab, bp);
  const d4 = contactDot(ac, bp);
  if (d3 >= 0 && d4 <= d3) {
    return { point: b, weights: [0, 1, 0] };
  }
  const cp = contactSub(point, c);
  const d5 = contactDot(ab, cp);
  const d6 = contactDot(ac, cp);
  if (d6 >= 0 && d5 <= d6) {
    return { point: c, weights: [0, 0, 1] };
  }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return {
      point: {
        x: a.x + ab.x * v,
        y: a.y + ab.y * v,
        z: a.z + ab.z * v,
      },
      weights: [1 - v, v, 0],
    };
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return {
      point: {
        x: a.x + ac.x * w,
        y: a.y + ac.y * w,
        z: a.z + ac.z * w,
      },
      weights: [1 - w, 0, w],
    };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return {
      point: {
        x: b.x + (c.x - b.x) * w,
        y: b.y + (c.y - b.y) * w,
        z: b.z + (c.z - b.z) * w,
      },
      weights: [0, 1 - w, w],
    };
  }
  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return {
    point: {
      x: a.x + ab.x * v + ac.x * w,
      y: a.y + ab.y * v + ac.y * w,
      z: a.z + ab.z * v + ac.z * w,
    },
    weights: [1 - v - w, v, w],
  };
}

function contactCandidates(
  document: SimDocument,
  mesh: SimMesh,
  targetMesh: SimMesh,
  displacement: Float64Array,
  factor: number,
): ContactCandidate[] {
  const targetOffset = mesh.nodes.length;
  const targetFaces = boundaryFaces(targetMesh, factor);
  const candidates: ContactCandidate[] = [];
  for (const pair of document.contacts) {
    const selectedTarget = new Set(faceNodes(targetMesh, pair.targetFace));
    if (!selectedTarget.size) {
      throw new SimError(
        "SIM_SELECTION_FACE",
        `Contact "${pair.name}" selects an empty target face.`,
      );
    }
    const faces = targetFaces.filter((face) =>
      face.nodes.every((node) => selectedTarget.has(node)),
    );
    if (!faces.length) {
      throw new SimError(
        "SIM_SELECTION_FACE",
        `Contact "${pair.name}" does not match target boundary faces.`,
      );
    }
    const primaryNodes = faceNodes(mesh, pair.face);
    if (!primaryNodes.length) {
      throw new SimError(
        "SIM_SELECTION_FACE",
        `Contact "${pair.name}" selects an empty primary face.`,
      );
    }
    for (const node of primaryNodes) {
      const source = mesh.nodes[node]!;
      const point = {
        x: source.x * factor + displacement[node * 3]!,
        y: source.y * factor + displacement[node * 3 + 1]!,
        z: source.z * factor + displacement[node * 3 + 2]!,
      };
      let bestGap = Infinity;
      let bestFace: BoundaryFace | null = null;
      let bestWeights: [number, number, number] = [1, 0, 0];
      for (const face of faces) {
        const a = targetMesh.nodes[face.nodes[0]!]!;
        const b = targetMesh.nodes[face.nodes[1]!]!;
        const c = targetMesh.nodes[face.nodes[2]!]!;
        const globalA = targetOffset + face.nodes[0]!;
        const globalB = targetOffset + face.nodes[1]!;
        const globalC = targetOffset + face.nodes[2]!;
        const pa = {
          x: a.x * factor + displacement[globalA * 3]!,
          y: a.y * factor + displacement[globalA * 3 + 1]!,
          z: a.z * factor + displacement[globalA * 3 + 2]!,
        };
        const pb = {
          x: b.x * factor + displacement[globalB * 3]!,
          y: b.y * factor + displacement[globalB * 3 + 1]!,
          z: b.z * factor + displacement[globalB * 3 + 2]!,
        };
        const pc = {
          x: c.x * factor + displacement[globalC * 3]!,
          y: c.y * factor + displacement[globalC * 3 + 1]!,
          z: c.z * factor + displacement[globalC * 3 + 2]!,
        };
        const closest = closestOnTriangle(point, pa, pb, pc);
        const gap = contactDot(contactSub(point, closest.point), face.normal);
        if (gap < bestGap) {
          bestGap = gap;
          bestFace = face;
          bestWeights = closest.weights;
        }
      }
      if (!bestFace) continue;
      const [tangent1, tangent2] = contactTangents(bestFace.normal);
      candidates.push({
        pairId: pair.id,
        kind: pair.kind,
        nodeGlobal: node,
        faceGlobal: [
          targetOffset + bestFace.nodes[0]!,
          targetOffset + bestFace.nodes[1]!,
          targetOffset + bestFace.nodes[2]!,
        ],
        weights: bestWeights,
        normal: bestFace.normal,
        tangent1,
        tangent2,
        gapM: bestGap,
        toleranceM: pair.gapTolerance * factor,
        penaltyNPerM: pair.penalty / factor,
        friction: pair.friction,
      });
    }
  }
  return candidates;
}

function activeContactKey(
  candidates: ContactCandidate[],
  slip: ReadonlySet<string>,
): string {
  return candidates
    .filter((candidate) => candidate.gapM <= candidate.toleranceM + 1e-12)
    .map((candidate) => {
      const key = contactKey(candidate);
      return `${key}:${slip.has(key) ? 1 : 0}`;
    })
    .sort()
    .join("|");
}

function contactAssembly(
  candidates: ContactCandidate[],
  dofCount: number,
  slip: ReadonlySet<string>,
  frictionForces: ReadonlyMap<string, SimVec3>,
): {
  triplets: Array<{ row: number; col: number; value: number }>;
  force: Float64Array<ArrayBuffer>;
} {
  const triplets: Array<{ row: number; col: number; value: number }> = [];
  const force = new Float64Array(dofCount);
  const add = (row: number, col: number, value: number) => {
    if (value !== 0) triplets.push({ row, col, value });
  };
  const addDirectional = (
    candidate: ContactCandidate,
    k: number,
    first: SimVec3,
    second: SimVec3,
  ) => {
    const nodeDof = candidate.nodeGlobal * 3;
    for (let a = 0; a < 3; a++) {
      const firstComponent = [first.x, first.y, first.z][a]!;
      if (firstComponent === 0) continue;
      for (let b = 0; b < 3; b++) {
        const secondComponent = [second.x, second.y, second.z][b]!;
        if (secondComponent === 0) continue;
        const value = k * firstComponent * secondComponent;
        add(nodeDof + a, nodeDof + b, value);
        for (let i = 0; i < 3; i++) {
          const faceDof = candidate.faceGlobal[i]! * 3;
          const weight = candidate.weights[i]!;
          add(nodeDof + a, faceDof + b, -value * weight);
          add(faceDof + a, nodeDof + b, -value * weight);
          for (let j = 0; j < 3; j++) {
            add(
              faceDof + a,
              candidate.faceGlobal[j]! * 3 + b,
              value * weight * candidate.weights[j]!,
            );
          }
        }
      }
    }
  };
  for (const candidate of candidates) {
    const penetration = Math.max(0, candidate.toleranceM - candidate.gapM);
    const normal = candidate.normal;
    const nodeDof = candidate.nodeGlobal * 3;
    if (penetration > 0) {
      for (let a = 0; a < 3; a++) {
        addAt(
          force,
          nodeDof + a,
          candidate.penaltyNPerM *
            penetration *
            [normal.x, normal.y, normal.z][a]!,
        );
        for (let i = 0; i < 3; i++) {
          addAt(
            force,
            candidate.faceGlobal[i]! * 3 + a,
            -candidate.weights[i]! *
              candidate.penaltyNPerM *
              penetration *
              [normal.x, normal.y, normal.z][a]!,
          );
        }
      }
    }
    if (candidate.kind === "bonded") {
      addDirectional(
        candidate,
        candidate.penaltyNPerM,
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      );
      addDirectional(
        candidate,
        candidate.penaltyNPerM,
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 0 },
      );
      addDirectional(
        candidate,
        candidate.penaltyNPerM,
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
      );
    } else {
      addDirectional(candidate, candidate.penaltyNPerM, normal, normal);
    }
    if (candidate.kind === "separating" && candidate.friction > 0) {
      const key = contactKey(candidate);
      if (slip.has(key)) {
        const friction = frictionForces.get(key);
        if (friction) {
          for (let a = 0; a < 3; a++) {
            const value = [friction.x, friction.y, friction.z][a]!;
            addAt(force, nodeDof + a, value);
            for (let i = 0; i < 3; i++) {
              addAt(
                force,
                candidate.faceGlobal[i]! * 3 + a,
                -candidate.weights[i]! * value,
              );
            }
          }
        }
      } else {
        addDirectional(
          candidate,
          candidate.penaltyNPerM,
          candidate.tangent1,
          candidate.tangent1,
        );
        addDirectional(
          candidate,
          candidate.penaltyNPerM,
          candidate.tangent2,
          candidate.tangent2,
        );
      }
    }
  }
  return { triplets, force };
}

function frictionState(
  candidates: ContactCandidate[],
  displacement: Float64Array,
): { slip: Set<string>; forces: Map<string, SimVec3> } {
  const slip = new Set<string>();
  const forces = new Map<string, SimVec3>();
  for (const candidate of candidates) {
    if (
      candidate.kind !== "separating" ||
      candidate.friction <= 0 ||
      candidate.gapM > candidate.toleranceM + 1e-12
    ) {
      continue;
    }
    let rx = displacement[candidate.nodeGlobal * 3]!;
    let ry = displacement[candidate.nodeGlobal * 3 + 1]!;
    let rz = displacement[candidate.nodeGlobal * 3 + 2]!;
    for (let i = 0; i < 3; i++) {
      const weight = candidate.weights[i]!;
      const face = candidate.faceGlobal[i]! * 3;
      rx -= weight * displacement[face]!;
      ry -= weight * displacement[face + 1]!;
      rz -= weight * displacement[face + 2]!;
    }
    const normalDisplacement =
      rx * candidate.normal.x +
      ry * candidate.normal.y +
      rz * candidate.normal.z;
    const penetration = Math.max(
      0,
      candidate.toleranceM - (candidate.gapM - normalDisplacement),
    );
    const normalForce = candidate.penaltyNPerM * penetration;
    const tangent = {
      x: rx - candidate.normal.x * normalDisplacement,
      y: ry - candidate.normal.y * normalDisplacement,
      z: rz - candidate.normal.z * normalDisplacement,
    };
    const tangentLength = Math.hypot(tangent.x, tangent.y, tangent.z);
    const limit = candidate.friction * normalForce;
    if (tangentLength > 1e-12) {
      const key = contactKey(candidate);
      const magnitude = Math.min(candidate.penaltyNPerM * tangentLength, limit);
      forces.set(key, {
        x: (-magnitude * tangent.x) / tangentLength,
        y: (-magnitude * tangent.y) / tangentLength,
        z: (-magnitude * tangent.z) / tangentLength,
      });
      if (candidate.penaltyNPerM * tangentLength > limit) slip.add(key);
    }
  }
  return { slip, forces };
}

function recoverBodyResult(
  mesh: SimMesh,
  offset: number,
  elements: ElementData[],
  displacement: Float64Array,
  yieldStrengthPa: number,
): Omit<SimStaticTargetResult, "bodyId" | "bodyName"> {
  const local = new Float64Array(mesh.nodes.length * 3);
  for (let i = 0; i < local.length; i++) {
    local[i] = displacement[offset * 3 + i]!;
  }
  let maxDisplacementM = 0;
  for (let node = 0; node < mesh.nodes.length; node++) {
    maxDisplacementM = Math.max(
      maxDisplacementM,
      Math.hypot(local[node * 3]!, local[node * 3 + 1]!, local[node * 3 + 2]!),
    );
  }
  const vonMisesPa: number[] = [];
  const signedVonMisesPa: number[] = [];
  const principalStressPa: number[][] = [];
  const equivalentStrain: number[] = [];
  const safetyFactor: number[] = [];
  let maxVonMisesPa = 0;
  let maxEquivalentStrain = 0;
  let minSafetyFactor = Infinity;
  let minPrincipalPa = Infinity;
  let maxPrincipalPa = -Infinity;
  for (const data of elements) {
    const strain = new Float64Array(6);
    for (let row = 0; row < 6; row++) {
      let sum = 0;
      for (let col = 0; col < 12; col++) {
        const node = data.nodes[Math.floor(col / 3)]!;
        sum += data.B[row * 12 + col]! * local[node * 3 + (col % 3)]!;
      }
      strain[row] = sum;
    }
    const stress = new Float64Array(6);
    for (let row = 0; row < 6; row++) {
      let sum = 0;
      for (let col = 0; col < 6; col++) {
        sum += data.D[row * 6 + col]! * strain[col]!;
      }
      stress[row] = sum;
    }
    const principal = principalStresses(stress);
    const vm = Math.sqrt(
      Math.max(
        0,
        0.5 *
          ((stress[0]! - stress[1]!) ** 2 +
            (stress[1]! - stress[2]!) ** 2 +
            (stress[2]! - stress[0]!) ** 2 +
            6 * (stress[3]! ** 2 + stress[4]! ** 2 + stress[5]! ** 2)),
      ),
    );
    const meanStrain = (strain[0]! + strain[1]! + strain[2]!) / 3;
    const deviatoric =
      (strain[0]! - meanStrain) ** 2 +
      (strain[1]! - meanStrain) ** 2 +
      (strain[2]! - meanStrain) ** 2 +
      2 *
        ((strain[3]! / 2) ** 2 + (strain[4]! / 2) ** 2 + (strain[5]! / 2) ** 2);
    const equivalent = Math.sqrt(Math.max(0, (2 / 3) * deviatoric));
    const hydrostatic = (stress[0]! + stress[1]! + stress[2]!) / 3;
    const signedVm = hydrostatic < 0 ? -vm : vm;
    const factor =
      vm > 1e-9 && Number.isFinite(yieldStrengthPa)
        ? yieldStrengthPa / vm
        : 1e12;
    vonMisesPa.push(vm);
    signedVonMisesPa.push(signedVm);
    principalStressPa.push(principal);
    equivalentStrain.push(equivalent);
    safetyFactor.push(factor);
    maxVonMisesPa = Math.max(maxVonMisesPa, vm);
    maxEquivalentStrain = Math.max(maxEquivalentStrain, equivalent);
    minSafetyFactor = Math.min(minSafetyFactor, factor);
    minPrincipalPa = Math.min(minPrincipalPa, principal[0]!);
    maxPrincipalPa = Math.max(maxPrincipalPa, principal[2]!);
  }
  return {
    maxDisplacementM,
    maxVonMisesPa,
    minPrincipalPa: Number.isFinite(minPrincipalPa) ? minPrincipalPa : 0,
    maxPrincipalPa: Number.isFinite(maxPrincipalPa) ? maxPrincipalPa : 0,
    maxEquivalentStrain,
    minSafetyFactor: Number.isFinite(minSafetyFactor) ? minSafetyFactor : 1e12,
    displacementsM: [...local],
    vonMisesPa,
    signedVonMisesPa,
    principalStressPa,
    equivalentStrain,
    safetyFactor,
  };
}

function simulateContactStatic(
  document: SimDocument,
  material: SimMaterial,
  options: SolveOptions,
): SimStaticResult {
  const mesh = document.mesh;
  const targetMesh = document.targetMesh;
  const target = document.contactTarget;
  if (!mesh) {
    throw new SimError("SIM_MESH_MISSING", "Generate a primary mesh first.");
  }
  if (!targetMesh || !target) {
    throw new SimError(
      "SIM_CONTACT_MESH",
      "Mesh the target body before a contact solve.",
    );
  }
  if (targetMesh.bodyId !== target.id) {
    throw new SimError(
      "SIM_CONTACT_MESH",
      "The target mesh does not belong to the contact target body.",
    );
  }
  if (targetMesh.units !== mesh.units) {
    throw new SimError(
      "SIM_CONTACT_UNITS",
      "Both contact bodies must use the same units.",
    );
  }
  const targetMaterial = materialForBody(document, target.id);
  if (!targetMaterial) {
    throw new SimError(
      "SIM_MATERIAL",
      `Assign a material to target body "${target.name}".`,
    );
  }
  const started = performance.now();
  const factor = factorFor(mesh.units);
  const primaryOffset = 0;
  const targetOffset = mesh.nodes.length;
  const dofCount = (mesh.nodes.length + targetMesh.nodes.length) * 3;
  const primaryMaterial = materialPa(material);
  const targetMaterialData = materialPa(targetMaterial);
  const primaryElements: ElementData[] = [];
  const targetElements: ElementData[] = [];
  const triplets: Array<{ row: number; col: number; value: number }> = [];
  for (const element of mesh.elements) {
    const data = elementData(mesh, element, primaryMaterial, factor);
    primaryElements.push(data);
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 12; col++) {
        const value = data.K[row * 12 + col]!;
        if (value === 0) continue;
        triplets.push({
          row: data.nodes[Math.floor(row / 3)]! * 3 + (row % 3),
          col: data.nodes[Math.floor(col / 3)]! * 3 + (col % 3),
          value,
        });
      }
    }
  }
  for (const element of targetMesh.elements) {
    const data = elementData(targetMesh, element, targetMaterialData, factor);
    targetElements.push(data);
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 12; col++) {
        const value = data.K[row * 12 + col]!;
        if (value === 0) continue;
        triplets.push({
          row:
            (targetOffset + data.nodes[Math.floor(row / 3)]!) * 3 + (row % 3),
          col:
            (targetOffset + data.nodes[Math.floor(col / 3)]!) * 3 + (col % 3),
          value,
        });
      }
    }
  }
  checkCancel(options);
  const force = new Float64Array(dofCount);
  const primary: LoadBody = {
    mesh,
    elements: primaryElements,
    material: primaryMaterial,
    cte: material.cte,
    offset: primaryOffset,
  };
  const secondary: LoadBody = {
    mesh: targetMesh,
    elements: targetElements,
    material: targetMaterialData,
    cte: targetMaterial.cte,
    offset: targetOffset,
  };
  const addForce = (node: number, values: SimVec3) => {
    addAt(force, node * 3, values.x);
    addAt(force, node * 3 + 1, values.y);
    addAt(force, node * 3 + 2, values.z);
  };
  for (const load of document.loads) {
    const body =
      load.bodyId === mesh.bodyId
        ? primary
        : load.bodyId === targetMesh.bodyId
          ? secondary
          : null;
    if (!body) {
      throw new SimError(
        "SIM_SELECTION_BODY",
        `Load "${load.name}" selects a body that is not meshed.`,
      );
    }
    applyLoad(body, load, factor, (node, values) =>
      addForce(body.offset + node, values),
    );
  }
  let inertialRelief: SimInertialRelief | undefined;
  if (document.inertialRelief) {
    const balanced = applyInertialRelief([primary, secondary], factor, force);
    if (!balanced) {
      throw new SimError(
        "SIM_INERTIAL_RELIEF",
        "Inertial relief could not determine a positive assembly mass and inertia tensor.",
      );
    }
    inertialRelief = balanced;
  }
  const fixed: boolean[] = new Array(dofCount).fill(false);
  if (!document.fixtures.length && inertialRelief) {
    const supports = minimalSupportNodes(mesh);
    inertialRelief = { ...inertialRelief, supportNodes: supports };
    fixed[supports[0]! * 3] = true;
    fixed[supports[0]! * 3 + 1] = true;
    fixed[supports[0]! * 3 + 2] = true;
    fixed[supports[1]! * 3 + 1] = true;
    fixed[supports[1]! * 3 + 2] = true;
    fixed[supports[2]! * 3 + 2] = true;
  }
  for (const fixture of document.fixtures) {
    const body =
      fixture.bodyId === mesh.bodyId
        ? primary
        : fixture.bodyId === targetMesh.bodyId
          ? secondary
          : null;
    if (!body) {
      throw new SimError(
        "SIM_SELECTION_BODY",
        `Fixture "${fixture.name}" selects a body that is not meshed.`,
      );
    }
    const axis = fixture.face[0] as "x" | "y" | "z";
    for (const node of faceNodes(body.mesh, fixture.face)) {
      const dof = (body.offset + node) * 3;
      if (fixture.kind === "fixed" || fixture.kind === "pinned") {
        fixed[dof] = true;
        fixed[dof + 1] = true;
        fixed[dof + 2] = true;
      } else {
        fixed[dof + (axis === "x" ? 0 : axis === "y" ? 1 : 2)] = true;
      }
    }
  }
  const free: number[] = [];
  for (let i = 0; i < dofCount; i++) if (!fixed[i]) free.push(i);
  if (free.length < 6) {
    throw new SimError(
      "SIM_RIGID_BODY",
      "Fewer than six free degrees of freedom remain for the contact assembly.",
    );
  }
  let displacement = new Float64Array(dofCount);
  let solved: SolvedSystem = {
    x: new Float64Array(free.length),
    iterations: 0,
  };
  let finalCandidates: ContactCandidate[] = [];
  let contactForce: Float64Array<ArrayBuffer> = new Float64Array(dofCount);
  let contactIterations = 0;
  let slip = new Set<string>();
  let frictionForces = new Map<string, SimVec3>();
  let finalFriction = { slip, forces: frictionForces };
  let stiffness = buildSparse(dofCount, triplets);
  for (let iteration = 0; iteration < 20; iteration++) {
    contactIterations = iteration + 1;
    const candidates = contactCandidates(
      document,
      mesh,
      targetMesh,
      displacement,
      factor,
    );
    const active = candidates.filter(
      (candidate) => candidate.gapM <= candidate.toleranceM + 1e-12,
    );
    const key = activeContactKey(active, slip);
    const contact = contactAssembly(active, dofCount, slip, frictionForces);
    contactForce = contact.force;
    stiffness = buildSparse(dofCount, [...triplets, ...contact.triplets]);
    const reduced = submatrix(stiffness, free);
    const rhs = new Float64Array(free.length);
    for (let i = 0; i < free.length; i++) {
      const dof = free[i]!;
      rhs[i] = force[dof]! + contactForce[dof]!;
    }
    solved = conjugateGradient(reduced.matrix, rhs, options, "Contact static");
    displacement = new Float64Array(dofCount);
    for (let i = 0; i < free.length; i++) displacement[free[i]!] = solved.x[i]!;
    finalCandidates = contactCandidates(
      document,
      mesh,
      targetMesh,
      displacement,
      factor,
    );
    const nextFriction = frictionState(finalCandidates, displacement);
    const nextKey = activeContactKey(finalCandidates, nextFriction.slip);
    if (nextKey === key) {
      finalFriction = nextFriction;
      break;
    }
    slip = nextFriction.slip;
    frictionForces = nextFriction.forces;
    if (iteration === 19) {
      throw new SimError(
        "SIM_CONTACT_NO_CONVERGENCE",
        "Contact active set did not converge within 20 iterations.",
      );
    }
  }
  const active = finalCandidates.filter(
    (candidate) => candidate.gapM <= candidate.toleranceM + 1e-12,
  );
  const totalForce = new Float64Array(dofCount);
  totalForce.set(force);
  for (let i = 0; i < dofCount; i++) addAt(totalForce, i, contactForce[i]!);
  const residual = multiply(stiffness, displacement);
  for (let i = 0; i < dofCount; i++) subtractAt(residual, i, totalForce[i]!);
  const reactions: Array<{ node: number; values: SimVec3 }> = [];
  for (let node = 0; node < mesh.nodes.length; node++) {
    const dof = node * 3;
    if (!fixed[dof] && !fixed[dof + 1] && !fixed[dof + 2]) continue;
    const values = {
      x: fixed[dof] ? residual[dof]! : 0,
      y: fixed[dof + 1] ? residual[dof + 1]! : 0,
      z: fixed[dof + 2] ? residual[dof + 2]! : 0,
    };
    if (Math.abs(values.x) + Math.abs(values.y) + Math.abs(values.z) > 1e-9) {
      reactions.push({ node, values });
    }
  }
  const primaryResult = recoverBodyResult(
    mesh,
    primaryOffset,
    primaryElements,
    displacement,
    material.yield * 1e6,
  );
  const targetResult: SimStaticTargetResult = {
    bodyId: targetMesh.bodyId,
    bodyName: targetMesh.bodyName,
    ...recoverBodyResult(
      targetMesh,
      targetOffset,
      targetElements,
      displacement,
      targetMaterial.yield * 1e6,
    ),
  };
  const findings = document.contacts.map((pair) => {
    const candidates = finalCandidates.filter(
      (candidate) => candidate.pairId === pair.id,
    );
    const minGap = candidates.length
      ? Math.min(...candidates.map((candidate) => candidate.gapM))
      : Infinity;
    const activeForPair = candidates.filter(
      (candidate) => candidate.gapM <= candidate.toleranceM + 1e-12,
    );
    const maxForce = activeForPair.reduce(
      (value, candidate) =>
        Math.max(
          value,
          candidate.penaltyNPerM *
            Math.max(0, candidate.toleranceM - candidate.gapM),
        ),
      0,
    );
    const slipping = activeForPair.some((candidate) =>
      finalFriction.slip.has(contactKey(candidate)),
    );
    const frictionForceN = activeForPair.reduce((value, candidate) => {
      const force = finalFriction.forces.get(contactKey(candidate));
      return Math.max(value, force ? Math.hypot(force.x, force.y, force.z) : 0);
    }, 0);
    return {
      id: pair.id,
      name: pair.name,
      kind: pair.kind,
      gap: Number.isFinite(minGap) ? minGap / factor : 0,
      status:
        activeForPair.length === 0
          ? ("open" as const)
          : pair.kind === "bonded"
            ? ("bonded" as const)
            : pair.kind === "sliding"
              ? ("sliding" as const)
              : pair.friction <= 0
                ? ("separating" as const)
                : slipping
                  ? ("sliding" as const)
                  : ("sticking" as const),
      penaltyForceN: maxForce,
      frictionForceN,
      sticking:
        pair.kind === "separating" &&
        pair.friction > 0 &&
        activeForPair.length > 0 &&
        !slipping,
    };
  });
  const contact: SimContactResult = {
    findings,
    minGap: findings.length
      ? Math.min(...findings.map((finding) => finding.gap))
      : 0,
    bonded: findings.filter((finding) => finding.status === "bonded").length,
    sliding: findings.filter((finding) => finding.status === "sliding").length,
    separating: findings.filter((finding) => finding.status === "separating")
      .length,
    sticking: findings.filter((finding) => finding.status === "sticking")
      .length,
    open: findings.filter((finding) => finding.status === "open").length,
    solveMs: performance.now() - started,
  };
  const maxReactionN = reactions.reduce((maximum, reaction) => {
    const magnitude = Math.hypot(
      reaction.values.x,
      reaction.values.y,
      reaction.values.z,
    );
    return Math.max(maximum, magnitude);
  }, 0);
  return {
    ...primaryResult,
    reactionsN: reactions,
    maxReactionN,
    solveMs: performance.now() - started,
    iterations: solved.iterations,
    ...(inertialRelief ? { inertialRelief } : {}),
    target: targetResult,
    contactIterations,
    activeContacts: active.length,
    maxContactPenetrationM: active.reduce(
      (value, candidate) =>
        Math.max(value, Math.max(0, candidate.toleranceM - candidate.gapM)),
      0,
    ),
    contact,
  };
}

function orthonormalizeEuclidean(vectors: Float64Array[]): void {
  for (let i = 0; i < vectors.length; i++) {
    for (let j = 0; j < i; j++) {
      let coefficient = 0;
      for (let k = 0; k < vectors[i]!.length; k++) {
        coefficient += vectors[i]![k]! * vectors[j]![k]!;
      }
      for (let k = 0; k < vectors[i]!.length; k++) {
        subtractAt(vectors[i]!, k, coefficient * vectors[j]![k]!);
      }
    }
    let norm = 0;
    for (let k = 0; k < vectors[i]!.length; k++) {
      norm += vectors[i]![k]! ** 2;
    }
    norm = Math.sqrt(norm);
    if (norm <= 1e-14) {
      vectors[i]!.fill(0);
      for (let k = 0; k < vectors[i]!.length; k++) {
        vectors[i]![k] = Math.sin((k + 1) * (i + 1) * 0.37);
      }
      norm = 0;
      for (let k = 0; k < vectors[i]!.length; k++) {
        norm += vectors[i]![k]! ** 2;
      }
      norm = Math.sqrt(norm) || 1;
    }
    for (let k = 0; k < vectors[i]!.length; k++) {
      divideAt(vectors[i]!, k, norm);
    }
  }
}

export function simulateBuckling(
  document: SimDocument,
  material: SimMaterial,
  options: SolveOptions = {},
): SimBucklingResult {
  const mesh = document.mesh;
  if (!mesh) {
    throw new SimError("SIM_MESH_MISSING", "Generate a volume mesh first.");
  }
  if (!document.fixtures.length) {
    throw new SimError(
      "SIM_RIGID_BODY",
      "Buckling analysis needs constraints; the model can move rigidly.",
    );
  }
  if (!document.loads.some(isActiveLoad)) {
    throw new SimError(
      "SIM_BUCKLING_PRELOAD",
      "Buckling analysis needs a non-zero preload.",
    );
  }

  const started = performance.now();
  options.onProgress?.("Solving preload", 0.1);
  const reference = simulateStatic(document, material, {
    ...options,
    maxIterations: Math.max(options.maxIterations ?? 0, 2_000),
  });
  const displacement = Float64Array.from(reference.displacementsM);
  const factor = factorFor(mesh.units);
  const materialData = materialPa(material);
  const dofCount = mesh.nodes.length * 3;
  const stiffnessTriplets: Array<{
    row: number;
    col: number;
    value: number;
  }> = [];
  const elementDataList: ElementData[] = [];
  for (const [index, element] of mesh.elements.entries()) {
    if (index % 200 === 0) checkCancel(options);
    const data = elementData(mesh, element, materialData, factor);
    elementDataList.push(data);
    for (let row = 0; row < 12; row++) {
      const globalRow = data.nodes[Math.floor(row / 3)]! * 3 + (row % 3);
      for (let col = 0; col < 12; col++) {
        const value = data.K[row * 12 + col]!;
        if (value === 0) continue;
        stiffnessTriplets.push({
          row: globalRow,
          col: data.nodes[Math.floor(col / 3)]! * 3 + (col % 3),
          value,
        });
      }
    }
  }
  const stiffness = buildSparse(dofCount, stiffnessTriplets);

  const fixed: boolean[] = new Array(dofCount).fill(false);
  for (const fixture of document.fixtures) {
    const nodes = faceNodes(mesh, fixture.face);
    const axis = fixture.face[0] as "x" | "y" | "z";
    for (const node of nodes) {
      if (fixture.kind === "fixed" || fixture.kind === "pinned") {
        fixed[node * 3] = true;
        fixed[node * 3 + 1] = true;
        fixed[node * 3 + 2] = true;
      } else {
        fixed[node * 3 + (axis === "x" ? 0 : axis === "y" ? 1 : 2)] = true;
      }
    }
  }
  const free: number[] = [];
  for (let i = 0; i < dofCount; i++) if (!fixed[i]) free.push(i);
  if (free.length < 2) {
    throw new SimError(
      "SIM_BUCKLING_CONSTRAINED",
      "Too few free degrees of freedom remain for a buckling mode.",
    );
  }

  options.onProgress?.("Assembling geometric stiffness", 0.45);
  const geometricTriplets: Array<{
    row: number;
    col: number;
    value: number;
  }> = [];
  for (const [elementIndex, data] of elementDataList.entries()) {
    if (elementIndex % 200 === 0) checkCancel(options);
    const strain = new Float64Array(6);
    for (let row = 0; row < 6; row++) {
      let sum = 0;
      for (let col = 0; col < 12; col++) {
        const node = data.nodes[Math.floor(col / 3)]!;
        sum += data.B[row * 12 + col]! * displacement[node * 3 + (col % 3)]!;
      }
      strain[row] = sum;
    }
    const stress = new Float64Array(6);
    for (let row = 0; row < 6; row++) {
      let sum = 0;
      for (let col = 0; col < 6; col++) {
        sum += data.D[row * 6 + col]! * strain[col]!;
      }
      stress[row] = sum;
    }
    const sigma = [
      [stress[0]!, stress[3]!, stress[5]!],
      [stress[3]!, stress[1]!, stress[4]!],
      [stress[5]!, stress[4]!, stress[2]!],
    ];
    const gradients = [0, 1, 2, 3].map((node) => [
      data.B[0 * 12 + node * 3]!,
      data.B[1 * 12 + node * 3 + 1]!,
      data.B[2 * 12 + node * 3 + 2]!,
    ]);
    for (let i = 0; i < 4; i++) {
      const gi = gradients[i]!;
      for (let j = 0; j < 4; j++) {
        const gj = gradients[j]!;
        let product = 0;
        for (let a = 0; a < 3; a++) {
          for (let b = 0; b < 3; b++) {
            product += gi[a]! * sigma[a]![b]! * gj[b]!;
          }
        }
        const value = product * data.volume;
        if (Math.abs(value) < 1e-18) continue;
        for (let component = 0; component < 3; component++) {
          geometricTriplets.push({
            row: data.nodes[i]! * 3 + component,
            col: data.nodes[j]! * 3 + component,
            value,
          });
        }
      }
    }
  }
  const geometric = buildSparse(dofCount, geometricTriplets);
  const reducedStiffness = submatrix(stiffness, free).matrix;
  const reducedGeometric = submatrix(geometric, free).matrix;

  const applyBucklingOperator = (vector: Float64Array): Float64Array => {
    const rhs = new Float64Array(free.length);
    let norm = 0;
    for (let row = 0; row < free.length; row++) {
      let sum = 0;
      for (
        let at = reducedGeometric.rowPtr[row]!;
        at < reducedGeometric.rowPtr[row + 1]!;
        at++
      ) {
        sum +=
          reducedGeometric.values[at]! * vector[reducedGeometric.columns[at]!]!;
      }
      rhs[row] = -sum;
      norm += rhs[row]! ** 2;
    }
    if (norm <= 1e-30) return new Float64Array(free.length);
    return conjugateGradient(
      reducedStiffness,
      rhs,
      { ...options, maxIterations: 1_500 },
      "Buckling",
    ).x;
  };

  const requested = Math.min(Math.max(1, options.modes ?? 3), free.length, 6);
  const vectors = Array.from({ length: requested }, (_, mode) => {
    const vector = new Float64Array(free.length);
    for (let i = 0; i < free.length; i++) {
      vector[i] =
        Math.sin((i + 1) * (mode + 1) * 0.31) +
        Math.cos((i + 1) * (mode + 2) * 0.17);
    }
    return vector;
  });
  orthonormalizeEuclidean(vectors);
  let modes: SimBucklingMode[] = [];
  let previous = Infinity;
  let iterations = reference.iterations;
  const maxIterations = Math.max(10, options.maxIterations ?? 50);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    checkCancel(options);
    const images = vectors.map((vector) => applyBucklingOperator(vector));
    orthonormalizeEuclidean(images);
    const second = images.map((vector) => applyBucklingOperator(vector));
    const projected = images.map((_, row) =>
      images.map((__, col) => {
        let sum = 0;
        for (let k = 0; k < free.length; k++) {
          sum += images[row]![k]! * second[col]![k]!;
        }
        return sum;
      }),
    );
    for (let i = 0; i < projected.length; i++) {
      for (let j = i + 1; j < projected.length; j++) {
        const average = (projected[i]![j]! + projected[j]![i]!) / 2;
        projected[i]![j] = average;
        projected[j]![i] = average;
      }
    }
    const eig = jacobiEigen(projected);
    const order = eig.values
      .map((value, index) => ({ value, index }))
      .filter((entry) => Number.isFinite(entry.value) && entry.value > 1e-12)
      .sort((a, b) => b.value - a.value);
    if (!order.length) break;
    const next = order.slice(0, requested).map((entry) => {
      const vector = new Float64Array(free.length);
      for (let k = 0; k < images.length; k++) {
        const coefficient = eig.vectors[k]![entry.index]!;
        for (let i = 0; i < free.length; i++) {
          addAt(vector, i, images[k]![i]! * coefficient);
        }
      }
      return vector;
    });
    orthonormalizeEuclidean(next);
    vectors.splice(0, vectors.length, ...next);
    modes = order.slice(0, requested).map((entry, index) => {
      const shape = new Float64Array(dofCount);
      for (let i = 0; i < free.length; i++) {
        shape[free[i]!] = vectors[index]![i]!;
      }
      let maxAbs = 0;
      for (const value of shape) maxAbs = Math.max(maxAbs, Math.abs(value));
      if (maxAbs > 0)
        for (let i = 0; i < shape.length; i++) shape[i] = shape[i]! / maxAbs;
      return { multiplier: 1 / entry.value, shape: [...shape] };
    });
    const first = modes[0]?.multiplier ?? Infinity;
    if (
      iteration > 2 &&
      Number.isFinite(previous) &&
      Math.abs(first - previous) / Math.max(1, Math.abs(first)) < 1e-6
    ) {
      break;
    }
    previous = first;
    options.onProgress?.(
      "Buckling iteration",
      Math.min(0.95, 0.5 + (iteration + 1) / (maxIterations * 2)),
    );
  }
  if (!modes.length || !modes.every((mode) => mode.multiplier > 0)) {
    throw new SimError(
      "SIM_BUCKLING_NO_POSITIVE",
      "No positive buckling multiplier was found; the preload may be tensile or too small.",
    );
  }
  options.onProgress?.("Complete", 1);
  return { modes, solveMs: performance.now() - started, iterations };
}

function principalStresses(stress: Float64Array): number[] {
  const a = [
    [stress[0]!, stress[3]!, stress[5]!],
    [stress[3]!, stress[1]!, stress[4]!],
    [stress[5]!, stress[4]!, stress[2]!],
  ];
  const values = jacobiEigen(a).values;
  return values.slice(0, 3).sort((x, y) => x - y);
}

function jacobiEigen(matrix: number[][]): {
  values: number[];
  vectors: number[][];
} {
  const n = matrix.length;
  const a = matrix.map((row) => [...row]);
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) off += a[i]![j]! ** 2;
    }
    if (Math.sqrt(off) < 1e-12) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p]![q]!) < 1e-18) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
        const t =
          Math.sign(theta || 1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return {
    values: a.map((row, i) => row[i]!),
    vectors: v,
  };
}

function massDiagonal(
  mesh: SimMesh,
  material: ReturnType<typeof materialPa>,
  factor: number,
): Float64Array {
  const mass = new Float64Array(mesh.nodes.length * 3);
  for (const element of mesh.elements) {
    const data = elementData(mesh, element, material, factor);
    const each = (material.rho * data.volume) / 4;
    for (const node of element) {
      addAt(mass, node * 3, each);
      addAt(mass, node * 3 + 1, each);
      addAt(mass, node * 3 + 2, each);
    }
  }
  return mass;
}

function mInner(a: Float64Array, b: Float64Array, mass: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += mass[i]! * a[i]! * b[i]!;
  return sum;
}

function orthonormalize(vectors: Float64Array[], mass: Float64Array): void {
  for (let i = 0; i < vectors.length; i++) {
    for (let j = 0; j < i; j++) {
      const coefficient = mInner(vectors[i]!, vectors[j]!, mass);
      for (let k = 0; k < vectors[i]!.length; k++) {
        subtractAt(vectors[i]!, k, coefficient * vectors[j]![k]!);
      }
    }
    const norm = Math.sqrt(Math.max(0, mInner(vectors[i]!, vectors[i]!, mass)));
    if (!(norm > 0)) {
      vectors[i]!.fill(0);
      vectors[i]![Math.min(i, vectors[i]!.length - 1)] = 1;
      for (let j = 0; j < i; j++) {
        const coefficient = mInner(vectors[i]!, vectors[j]!, mass);
        for (let k = 0; k < vectors[i]!.length; k++) {
          subtractAt(vectors[i]!, k, coefficient * vectors[j]![k]!);
        }
      }
      const retry = Math.sqrt(
        Math.max(0, mInner(vectors[i]!, vectors[i]!, mass)),
      );
      if (retry > 0)
        for (let k = 0; k < vectors[i]!.length; k++)
          divideAt(vectors[i]!, k, retry);
    } else {
      for (let k = 0; k < vectors[i]!.length; k++)
        divideAt(vectors[i]!, k, norm);
    }
  }
}

export function simulateModal(
  document: SimDocument,
  material: SimMaterial,
  options: SolveOptions = {},
): SimModalResult {
  const mesh = document.mesh;
  if (!mesh) {
    throw new SimError("SIM_MESH_MISSING", "Generate a volume mesh first.");
  }
  const freeModel = document.fixtures.length === 0;
  const started = performance.now();
  const factor = factorFor(mesh.units);
  const materialData = materialPa(material);
  const elementDataList: ElementData[] = [];
  const dofCount = mesh.nodes.length * 3;
  const triplets: Array<{ row: number; col: number; value: number }> = [];
  for (const element of mesh.elements) {
    const data = elementData(mesh, element, materialData, factor);
    elementDataList.push(data);
    for (let row = 0; row < 12; row++) {
      const globalRow = data.nodes[Math.floor(row / 3)]! * 3 + (row % 3);
      for (let col = 0; col < 12; col++) {
        const value = data.K[row * 12 + col]!;
        if (value === 0) continue;
        triplets.push({
          row: globalRow,
          col: data.nodes[Math.floor(col / 3)]! * 3 + (col % 3),
          value,
        });
      }
    }
  }
  checkCancel(options);
  const stiffness = buildSparse(dofCount, triplets);
  const massFull = massDiagonal(mesh, materialData, factor);
  const fixed: boolean[] = new Array(dofCount).fill(false);
  for (const fixture of document.fixtures) {
    if (fixture.bodyId !== mesh.bodyId) {
      throw new SimError(
        "SIM_SELECTION_BODY",
        `Fixture "${fixture.name}" selects a body that is not meshed.`,
      );
    }
    const nodes = faceNodes(mesh, fixture.face);
    const axis = fixture.face[0] as "x" | "y" | "z";
    for (const node of nodes) {
      if (fixture.kind === "fixed" || fixture.kind === "pinned") {
        fixed[node * 3] = true;
        fixed[node * 3 + 1] = true;
        fixed[node * 3 + 2] = true;
      } else {
        fixed[node * 3 + (axis === "x" ? 0 : axis === "y" ? 1 : 2)] = true;
      }
    }
  }
  const free: number[] = [];
  for (let i = 0; i < dofCount; i++) if (!fixed[i]) free.push(i);
  if (free.length < (freeModel ? 12 : 6)) {
    throw new SimError(
      "SIM_RIGID_BODY",
      "Too few free degrees of freedom remain for the requested modal solve.",
    );
  }
  const mass = new Float64Array(free.length);
  for (let i = 0; i < free.length; i++) mass[i] = massFull[free[i]!]!;
  const rigidCount = freeModel ? 6 : 0;
  const requestedElastic = Math.min(
    Math.max(1, options.modes ?? document.modalModes ?? 6),
    Math.max(1, free.length - 6),
    15,
  );
  const requested = requestedElastic + rigidCount;
  let maxStiffnessMassRatio = 0;
  if (freeModel) {
    for (const dof of free) {
      for (
        let at = stiffness.rowPtr[dof]!;
        at < stiffness.rowPtr[dof + 1]!;
        at++
      ) {
        if (stiffness.columns[at] === dof) {
          maxStiffnessMassRatio = Math.max(
            maxStiffnessMassRatio,
            stiffness.values[at]! / Math.max(1e-30, massFull[dof]!),
          );
        }
      }
    }
  }
  const shift = freeModel ? Math.max(1e-9, maxStiffnessMassRatio * 1e-6) : 0;
  const solveTriplets = shift
    ? [
        ...triplets,
        ...free.map((dof) => ({
          row: dof,
          col: dof,
          value: shift * massFull[dof]!,
        })),
      ]
    : triplets;
  const original = submatrix(stiffness, free);
  const reduced = submatrix(buildSparse(dofCount, solveTriplets), free);
  const vectors = Array.from({ length: requested }, (_, mode) => {
    const vector = new Float64Array(free.length);
    for (let i = 0; i < free.length; i++) {
      vector[i] =
        Math.sin((i + 1) * (mode + 1) * 0.37) +
        Math.cos((i + 1) * (mode + 2) * 0.19);
    }
    return vector;
  });
  orthonormalize(vectors, mass);
  let eigenvalues = new Array(requested).fill(0);
  let previousFirst = 0;
  let iterations = 0;
  const maxIterations = Math.max(20, options.maxIterations ?? 80);
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    checkCancel(options);
    const solvedVectors: Float64Array[] = [];
    for (const vector of vectors) {
      const rhs = new Float64Array(free.length);
      for (let i = 0; i < free.length; i++) rhs[i] = mass[i]! * vector[i]!;
      const solved = conjugateGradient(
        reduced.matrix,
        rhs,
        { ...options, maxIterations: 1_000 },
        "Modal",
      );
      iterations += solved.iterations;
      solvedVectors.push(solved.x);
    }
    orthonormalize(solvedVectors, mass);
    const Kvectors = solvedVectors.map((vector) =>
      multiply(original.matrix, vector),
    );
    const projected = solvedVectors.map((_, i) =>
      solvedVectors.map((__, j) => {
        let sum = 0;
        for (let k = 0; k < free.length; k++) {
          sum += solvedVectors[i]![k]! * Kvectors[j]![k]!;
        }
        return sum;
      }),
    );
    const eig = jacobiEigen(projected);
    const order = eig.values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value);
    eigenvalues = order.map((entry) => entry.value);
    const next = order.map((entry) => {
      const vector = new Float64Array(free.length);
      for (let k = 0; k < requested; k++) {
        const coefficient = eig.vectors[k]![entry.index]!;
        for (let i = 0; i < free.length; i++) {
          addAt(vector, i, solvedVectors[k]![i]! * coefficient);
        }
      }
      return vector;
    });
    orthonormalize(next, mass);
    vectors.splice(0, vectors.length, ...next);
    const convergence = eigenvalues[rigidCount] ?? 0;
    if (convergence > 0) {
      if (
        iteration > 2 &&
        Math.abs(convergence - previousFirst) /
          Math.max(1, Math.abs(convergence)) <
          1e-7
      ) {
        break;
      }
      previousFirst = convergence;
    }
    options.onProgress?.("Modal iteration", (iteration + 1) / maxIterations);
  }
  if (
    eigenvalues
      .slice(rigidCount)
      .some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new SimError(
      "SIM_RIGID_BODY_MODES",
      "Modal analysis found non-positive elastic eigenvalues; the model is still under-constrained.",
    );
  }
  const modes = eigenvalues.map((value, index) => {
    const shape = new Float64Array(dofCount);
    for (let i = 0; i < free.length; i++) shape[free[i]!] = vectors[index]![i]!;
    if (index < rigidCount) {
      return {
        frequencyHz: 0,
        energyJ: 0,
        rigid: true,
        shape: [...shape],
      };
    }
    let peak = 0;
    for (let node = 0; node < mesh.nodes.length; node++) {
      peak = Math.max(
        peak,
        Math.hypot(
          shape[node * 3]!,
          shape[node * 3 + 1]!,
          shape[node * 3 + 2]!,
        ),
      );
    }
    const scale = peak > 0 ? 0.001 / peak : 0;
    return {
      frequencyHz: Math.sqrt(value) / (2 * Math.PI),
      energyJ: 0.5 * value * scale ** 2,
      shape: [...shape],
    };
  });
  options.onProgress?.("Complete", 1);
  return {
    modes,
    rigidModes: rigidCount,
    solveMs: performance.now() - started,
    iterations,
  };
}
