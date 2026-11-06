// Geometry-aware mate resolution (pure). Drives instance transforms to zero.

import type {
  Assembly,
  Mate,
  AssemblyInstance,
  RefSpec,
  RefMap,
} from "./model";

export type { RefSpec, RefMap }; // re-export so `import { RefMap } from "./geometry"` still works
export interface MateGeom {
  id: string;
  kind: string;
  aInst: string;
  aRef: string;
  bInst: string;
  bRef: string;
  value?: number;
}

// ---- column-major 4x4 helpers ----
type V3 = [number, number, number];

// slot getters (defensive under noUncheckedIndexedAccess)
const G = (a: number[], i: number): number => a[i] ?? 0;
const gv = (m: number[], i: number): number => m[i] ?? 0;

function mmul(a: number[], b: number[]): number[] {
  // column-major: out[i*4+j] = sum_k a[k*4+i] * b[j*4+k]
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        r[i * 4 + j] = (r[i * 4 + j] ?? 0) + G(a, k * 4 + i) * G(b, j * 4 + k);
  return r;
}
export function r3to4(r: number[]): number[] {
  // r is a row-major 3x3 (R*v); embed its rows into a column-major 4x4
  // so that the resulting 4x4's columns are R's columns (mmul is column-major).
  return [
    G(r, 0),
    G(r, 1),
    G(r, 2),
    0,
    G(r, 3),
    G(r, 4),
    G(r, 5),
    0,
    G(r, 6),
    G(r, 7),
    G(r, 8),
    0,
    0,
    0,
    0,
    1,
  ];
}
// inverse of a rigid 4x4 (column-major): rotation columns c0,c1,c2 + translation t
function minv(m: number[]): number[] {
  const c0x = G(m, 0),
    c0y = G(m, 1),
    c0z = G(m, 2);
  const c1x = G(m, 4),
    c1y = G(m, 5),
    c1z = G(m, 6);
  const c2x = G(m, 8),
    c2y = G(m, 9),
    c2z = G(m, 10);
  const tx = G(m, 3),
    ty = G(m, 7),
    tz = G(m, 11);
  // transposed rotation columns (Rt's col = original row)
  const rt0x = c0x,
    rt0y = c1x,
    rt0z = c2x;
  const rt1x = c0y,
    rt1y = c1y,
    rt1z = c2y;
  const rt2x = c0z,
    rt2y = c1z,
    rt2z = c2z;
  const nx = -(rt0x * tx + rt0y * ty + rt0z * tz);
  const ny = -(rt1x * tx + rt1y * ty + rt1z * tz);
  const nz = -(rt2x * tx + rt2y * ty + rt2z * tz);
  return [
    rt0x,
    rt0y,
    rt0z,
    nx,
    rt1x,
    rt1y,
    rt1z,
    ny,
    rt2x,
    rt2y,
    rt2z,
    nz,
    0,
    0,
    0,
    1,
  ];
}
const orig = (m: number[]): V3 => [gv(m, 3), gv(m, 7), gv(m, 11)];
const axX = (m: number[]): V3 => [gv(m, 0), gv(m, 4), gv(m, 8)];
const axZ = (m: number[]): V3 => [gv(m, 2), gv(m, 6), gv(m, 10)];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dotv = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const nrm3 = (a: V3): V3 => {
  const n = nrm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

// 3x3 (row-major) -> 4x4 column-major (exported for tests) (Rodrigues, with antiparallel fallback)
export function alignRot(u: V3, v: V3): number[] {
  const a = nrm3(u),
    b = nrm3(v);
  const c = Math.min(1, Math.max(-1, dotv(a, b)));
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (c < -0.999999) {
    // antiparallel: spin 180deg about any axis perpendicular to a
    const perp: V3 = Math.abs(a[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
    const axis = nrm3(sub(perp, scale(a, dotv(perp, a))));
    const K = [
      0,
      -axis[2],
      axis[1],
      axis[2],
      0,
      -axis[0],
      -axis[1],
      axis[0],
      0,
    ];
    const Ksq = new Array(9).fill(0);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++)
          Ksq[i * 3 + j] =
            (Ksq[i * 3 + j] ?? 0) + G(K, i * 3 + k) * G(K, k * 3 + j);
    const R = new Array(9).fill(0);
    for (let i = 0; i < 9; i++) R[i] = G(I, i) - G(Ksq, i); // 180deg: I - K^2
    return R;
  }
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  const K = [0, -a[2], a[1], a[2], 0, -a[0], -a[1], a[0], 0]; // cross-product matrix
  const R = new Array(9).fill(0);
  const Ksq = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        Ksq[i * 3 + j] =
          (Ksq[i * 3 + j] ?? 0) + G(K, i * 3 + k) * G(K, k * 3 + j);
  for (let i = 0; i < 9; i++)
    R[i] = G(I, i) + s * G(K, i) + (1 - c) * G(Ksq, i);
  return R;
}
// world transform that rotates frame m about its own origin so the named axis points along `target`
export function rotateAxis(
  m: number[],
  which: "x" | "z",
  target: V3,
): number[] {
  const cur = which === "x" ? nrm3(axX(m)) : nrm3(axZ(m));
  const A = alignRot(cur, nrm3(target));
  const R = r3to4(A);
  return mmul(R, m);
}
function setOrig(m: number[], o: V3): number[] {
  const c = [...m];
  c[3] = o[0];
  c[7] = o[1];
  c[11] = o[2];
  return c;
}

// ---- residual measurement (unchanged contract) ----
export function mateResidual(m: MateGeom, refs: RefMap): number {
  const fa = refs[m.aInst]?.[m.aRef];
  const fb = refs[m.bInst]?.[m.bRef];
  if (!fa || !fb) return 1;
  const ta = fa.transform,
    tb = fb.transform;
  const oa = orig(ta),
    ob = orig(tb);
  switch (m.kind) {
    case "coincident":
      return nrm(sub(oa, ob));
    case "distance":
      return Math.abs(nrm(sub(oa, ob)) - (m.value ?? 0));
    case "concentric":
      return Math.abs(1 - Math.abs(dotv(axZ(ta), axZ(tb))));
    case "parallel":
      return Math.abs(1 - Math.abs(dotv(axX(ta), axX(tb))));
    case "angle": {
      const ang = Math.acos(Math.min(1, Math.max(-1, dotv(axX(ta), axX(tb)))));
      return Math.abs(ang - ((m.value ?? 0) * Math.PI) / 180);
    }
    default:
      return 0;
  }
}
export function totalResidual(mates: MateGeom[], refs: RefMap): number {
  return mates.reduce((acc, m) => acc + mateResidual(m, refs), 0);
}

// ---- closure solver: drive b instances so mates converge in world space ----
function toGeom(m: Mate): MateGeom {
  const out: MateGeom = {
    id: m.id,
    kind: m.kind,
    aInst: m.a.bodyId,
    aRef: m.a.ref,
    bInst: m.b.bodyId,
    bRef: m.b.ref,
  };
  if (m.value !== undefined) out.value = m.value;
  return out;
}

export function solveGeometry(
  asm: Assembly,
  refs: RefMap,
  opts: { tolerance?: number; maxIter?: number } = {},
): { assembly: Assembly; residual: number; iters: number; converged: boolean } {
  const tol = opts.tolerance ?? 1e-5;
  const maxIter = opts.maxIter ?? 64;
  const instances: AssemblyInstance[] = asm.instances.map((i) => ({
    ...i,
    transform: [...i.transform],
  }));
  const byId = new Map(instances.map((i) => [i.id, i]));

  const worldOf = (instId: string, refName: string): number[] | null => {
    const inst = byId.get(instId);
    const rf = refs[instId]?.[refName];
    if (!inst || !rf) return null;
    return mmul(inst.transform, rf.transform);
  };
  const worldRefs = (): RefMap => {
    const out: RefMap = {};
    for (const inst of instances) {
      const lr = refs[inst.id];
      if (!lr) continue;
      const bucket: Record<string, RefSpec> = {};
      for (const [name, rf] of Object.entries(lr))
        bucket[name] = { transform: mmul(inst.transform, rf.transform) };
      out[inst.id] = bucket;
    }
    return out;
  };

  let iters = 0;
  let residual = totalResidual(asm.mates.map(toGeom), worldRefs());

  for (iters = 0; iters < maxIter; iters++) {
    for (const m of asm.mates) {
      const aInst = byId.get(m.a.bodyId);
      const bInst = byId.get(m.b.bodyId);
      if (!aInst || !bInst) continue;
      const fa = worldOf(m.a.bodyId, m.a.ref);
      const fbLocal = refs[bInst.id]?.[m.b.ref];
      if (!fa || !fbLocal) continue;
      const fbWorld = mmul(bInst.transform, fbLocal.transform);

      // desired world transform for b's ref frame (axes matched to the residual's contract)
      let desired: number[];
      switch (m.kind) {
        case "coincident":
          desired = setOrig(fbWorld, orig(fa));
          break;
        case "distance": {
          const oa = orig(fa),
            ob = orig(fbWorld);
          const dir = nrm3(sub(ob, oa));
          desired = setOrig(fbWorld, add(oa, scale(dir, m.value ?? 0)));
          break;
        }
        case "concentric":
          // align b's Z-axis to a's Z-axis; snap origins so the axes truly coincide
          desired = setOrig(rotateAxis(fbWorld, "z", axZ(fa)), orig(fa));
          break;
        case "parallel":
          // align b's X-axis to a's X-axis (parallel faces)
          desired = rotateAxis(fbWorld, "x", axX(fa));
          break;
        case "angle":
          // align b's X-axis to a's X-axis
          desired = rotateAxis(fbWorld, "x", axX(fa));
          break;
        default:
          desired = fbWorld;
      }
      bInst.transform = desired;
    }
    residual = totalResidual(asm.mates.map(toGeom), worldRefs());
    if (residual < tol) break;
  }

  return {
    assembly: { ...asm, instances },
    residual,
    iters,
    converged: residual < tol,
  };
}
