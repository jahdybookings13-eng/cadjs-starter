import type { Brep } from "@vitekk02/cadjs";

type V3 = { x: number; y: number; z: number };

const key = (v: V3): string =>
  `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;

const sortedTriKeys = (a: V3, b: V3, c: V3): string[] =>
  [key(a), key(b), key(c)].sort();

export function faceIndexFromTriangle(
  brep: Brep,
  tri: [V3, V3, V3],
): number | null {
  const wanted = sortedTriKeys(tri[0], tri[1], tri[2]);
  const faces = brep.faces as unknown as Array<{ vertices?: V3[] }>;
  for (let i = 0; i < faces.length; i++) {
    const set = new Set((faces[i]?.vertices ?? []).map(key));
    if (wanted.every((k) => set.has(k))) return i;
  }
  return null;
}

export function faceTagForTriangle(
  brep: Brep,
  tri: [V3, V3, V3],
  featureId: string,
): string | null {
  const idx = faceIndexFromTriangle(brep, tri);
  return idx === null ? null : `${featureId}_F${idx}`;
}
