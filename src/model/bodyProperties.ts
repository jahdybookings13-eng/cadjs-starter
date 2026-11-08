import type { BodyOutput } from "./executor";
import type { ScadgenFeatureNode } from "./onshapeHistory";
import { classifyPhase6Body, type Phase6BodyKind } from "./phase6";

const MM_PER_SCENE_UNIT = 1000;

export interface BodyProperties {
  featureId: string;
  name: string;
  featureType: string;
  elementId: string;
  /** World bbox in mm, or null when the body has no vertices. */
  bboxMM: [number, number, number, number, number, number] | null;
  /** Derived world size [X, Y, Z] in mm. */
  sizeMM: [number, number, number];
  position: [number, number, number];
  faces: number;
  edges: number;
  visible: boolean;
  volumeMM3: number | null;
  surfaceAreaMM2: number | null;
  triangles: number;
  /** Mass in kg; null until the body has a material density. */
  massKg: number | null;
  /** World centre of mass in mm. */
  centerOfMassMM: [number, number, number] | null;
  /** Centroidal inertia [Ixx,Ixy,Ixz,Iyy,Iyz,Izz] in kg·mm². */
  inertiaKgMM2: [number, number, number, number, number, number] | null;
  /** Phase 6 body classification, independent of the authoring feature. */
  kind: Phase6BodyKind;
  /** True when the mesh has boundary edges (an open shell/surface). */
  openShell: boolean;
  boundaryEdges: number;
  nonManifoldEdges: number;
}

function bboxOfOutput(out: BodyOutput): BodyProperties["bboxMM"] {
  const vp = out.vertexPositions;
  if (!vp || vp.length < 3) return null;
  const p = out.position;
  const k = MM_PER_SCENE_UNIT;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < vp.length; i += 3) {
    const x = (vp[i]! + p.x) * k;
    const y = (vp[i + 1]! + p.y) * k;
    const z = (vp[i + 2]! + p.z) * k;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

interface MeshMass {
  volumeMM3: number | null;
  surfaceAreaMM2: number | null;
  triangles: number;
  volumeM3: number | null;
  /** Centre of mass in metres, world frame. */
  centroidM: [number, number, number] | null;
  /** Centroidal inertia (geometric, m^5) as [xx,xy,xz,yy,yz,zz]. */
  inertiaGeo: [number, number, number, number, number, number] | null;
}

function meshMass(out: BodyOutput): MeshMass {
  const geo = out.faceGeometry;
  const position = geo?.attributes.position;
  const arr = position?.array as ArrayLike<number> | undefined;
  if (!arr) {
    return {
      volumeMM3: null,
      surfaceAreaMM2: null,
      triangles: 0,
      volumeM3: null,
      centroidM: null,
      inertiaGeo: null,
    };
  }
  const step = position?.itemSize ?? 3;
  const index = geo?.index?.array as ArrayLike<number> | undefined;
  const count = index
    ? Math.floor(index.length / 3)
    : Math.floor(arr.length / (step * 3));
  if (count === 0) {
    return {
      volumeMM3: null,
      surfaceAreaMM2: null,
      triangles: 0,
      volumeM3: null,
      centroidM: null,
      inertiaGeo: null,
    };
  }
  const p = out.position;
  const at = (i: number): [number, number, number] => {
    const o = i * step;
    return [arr[o] ?? 0, arr[o + 1] ?? 0, arr[o + 2] ?? 0];
  };
  // Work in metres, world frame: local vertices + element translation.
  let volume6 = 0;
  let area2 = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  let sxx = 0;
  let syy = 0;
  let szz = 0;
  let sxy = 0;
  let sxz = 0;
  let syz = 0;
  for (let t = 0; t < count; t++) {
    const la = at(index ? index[t * 3]! : t * 3);
    const lb = at(index ? index[t * 3 + 1]! : t * 3 + 1);
    const lc = at(index ? index[t * 3 + 2]! : t * 3 + 2);
    const a: [number, number, number] = [la[0] + p.x, la[1] + p.y, la[2] + p.z];
    const b: [number, number, number] = [lb[0] + p.x, lb[1] + p.y, lb[2] + p.z];
    const c: [number, number, number] = [lc[0] + p.x, lc[1] + p.y, lc[2] + p.z];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const acz = c[2] - a[2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    area2 += Math.hypot(nx, ny, nz);
    const v6 =
      a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
    volume6 += v6;
    const vol = v6 / 6;
    const qx = (a[0] + b[0] + c[0]) / 4;
    const qy = (a[1] + b[1] + c[1]) / 4;
    const qz = (a[2] + b[2] + c[2]) / 4;
    mx += vol * qx;
    my += vol * qy;
    mz += vol * qz;
    // ∫ x xᵀ dV for the tetrahedron (origin, a, b, c):
    // V/20 · (Σ v vᵀ + (Σ v)(Σ v)ᵀ).
    const sx = a[0] + b[0] + c[0];
    const sy = a[1] + b[1] + c[1];
    const sz = a[2] + b[2] + c[2];
    const k = vol / 20;
    sxx += k * (a[0] * a[0] + b[0] * b[0] + c[0] * c[0] + sx * sx);
    syy += k * (a[1] * a[1] + b[1] * b[1] + c[1] * c[1] + sy * sy);
    szz += k * (a[2] * a[2] + b[2] * b[2] + c[2] * c[2] + sz * sz);
    sxy += k * (a[0] * a[1] + b[0] * b[1] + c[0] * c[1] + sx * sy);
    sxz += k * (a[0] * a[2] + b[0] * b[2] + c[0] * c[2] + sx * sz);
    syz += k * (a[1] * a[2] + b[1] * b[2] + c[1] * c[2] + sy * sz);
  }
  const volume = volume6 / 6;
  const mm = MM_PER_SCENE_UNIT;
  const result: MeshMass = {
    volumeMM3: Math.abs(volume) * mm ** 3,
    surfaceAreaMM2: (area2 / 2) * mm ** 2,
    triangles: count,
    volumeM3: volume,
    centroidM: null,
    inertiaGeo: null,
  };
  if (Math.abs(volume) < 1e-12) return result;

  const cx = mx / volume;
  const cy = my / volume;
  const cz = mz / volume;
  result.centroidM = [cx, cy, cz];

  // Tensor about the origin, then parallel-axis shift to the centroid.
  const tr = sxx + syy + szz;
  let ixx = tr - sxx;
  let iyy = tr - syy;
  let izz = tr - szz;
  let ixy = -sxy;
  let ixz = -sxz;
  let iyz = -syz;
  const r2 = cx * cx + cy * cy + cz * cz;
  ixx -= volume * (r2 - cx * cx);
  iyy -= volume * (r2 - cy * cy);
  izz -= volume * (r2 - cz * cz);
  ixy += volume * cx * cy;
  ixz += volume * cx * cz;
  iyz += volume * cy * cz;
  result.inertiaGeo = [ixx, ixy, ixz, iyy, iyz, izz];
  return result;
}

export function bodyPropertiesOf(input: {
  featureId: string;
  node: ScadgenFeatureNode | null;
  out: BodyOutput | null;
  elementId: string;
  bboxMM: [number, number, number, number, number, number] | null;
  position: [number, number, number];
  visible: boolean;
  /** Optional material density; absent means mass/inertia are unknown. */
  densityKgM3?: number | null;
  /** Registry name (body naming is independent of the feature name). */
  nameOverride?: string | null;
}): BodyProperties | null {
  if (!input.out) return null;
  const bboxMM = bboxOfOutput(input.out) ?? input.bboxMM;
  const sizeMM: [number, number, number] = bboxMM
    ? [bboxMM[3] - bboxMM[0], bboxMM[4] - bboxMM[1], bboxMM[5] - bboxMM[2]]
    : [0, 0, 0];
  const bodySuffix = /#(\d+)$/.exec(input.featureId)?.[1];
  const baseName = input.node?.name ?? input.featureId;
  const mesh = meshMass(input.out);
  const classification = classifyPhase6Body(
    input.out,
    input.node?.featureType ?? null,
  );
  const density = input.densityKgM3 ?? null;
  const massKg =
    density !== null && mesh.volumeM3 !== null
      ? Math.abs(mesh.volumeM3) * density
      : null;
  const mm = MM_PER_SCENE_UNIT;
  const centerOfMassMM: BodyProperties["centerOfMassMM"] = mesh.centroidM
    ? [mesh.centroidM[0] * mm, mesh.centroidM[1] * mm, mesh.centroidM[2] * mm]
    : null;
  const inertiaKgMM2: BodyProperties["inertiaKgMM2"] =
    density !== null && mesh.inertiaGeo
      ? (mesh.inertiaGeo.map((v) => v * density * mm ** 2) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ])
      : null;
  return {
    featureId: input.featureId,
    name:
      input.nameOverride?.trim() ||
      (bodySuffix ? `${baseName} (body ${Number(bodySuffix) + 1})` : baseName),
    featureType: input.node?.featureType ?? input.out.kind,
    elementId: input.elementId,
    bboxMM,
    sizeMM,
    position: input.position,
    faces: input.out.faceTags.length,
    edges: input.out.edgeTags.length,
    visible: input.visible,
    volumeMM3: mesh.volumeMM3,
    surfaceAreaMM2: mesh.surfaceAreaMM2,
    triangles: mesh.triangles,
    massKg,
    centerOfMassMM,
    inertiaKgMM2,
    kind: classification.kind,
    openShell: classification.openShell,
    boundaryEdges: classification.boundaryEdges,
    nonManifoldEdges: classification.nonManifoldEdges,
  };
}
