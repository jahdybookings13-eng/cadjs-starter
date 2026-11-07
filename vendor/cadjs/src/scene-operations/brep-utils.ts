import { CompoundBrep, type Brep } from "../geometry";
import { AXIS_FLATNESS_MM } from "../tolerances";

export type Axis = "x" | "y" | "z";

export interface AxisRanges {
  x: number;
  y: number;
  z: number;
}

function getRenderableVertices(brep: Brep | CompoundBrep) {
  return brep instanceof CompoundBrep
    ? (brep.cachedUnifiedBRep?.vertices ?? brep.vertices)
    : brep.vertices;
}

export function axisRanges(brep: Brep | CompoundBrep): AxisRanges | null {
  const verts = getRenderableVertices(brep);
  if (!verts || verts.length === 0) return null;
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
}

export function isFlat(
  brep: Brep | CompoundBrep,
  tol = AXIS_FLATNESS_MM,
): boolean {
  const r = axisRanges(brep);
  if (!r) return false;
  return r.x < tol || r.y < tol || r.z < tol;
}

export function flatAxis(
  brep: Brep | CompoundBrep,
  tol = AXIS_FLATNESS_MM,
): Axis | null {
  const r = axisRanges(brep);
  if (!r) return null;
  if (r.x < tol) return "x";
  if (r.y < tol) return "y";
  if (r.z < tol) return "z";
  return null;
}

export function thickAxisCount(
  brep: Brep | CompoundBrep,
  tol = AXIS_FLATNESS_MM,
): number {
  const r = axisRanges(brep);
  if (!r) return 0;
  return (r.x > tol ? 1 : 0) + (r.y > tol ? 1 : 0) + (r.z > tol ? 1 : 0);
}
