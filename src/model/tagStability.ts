// Face-tag stability across rebuilds: when a feature recomputes, map its
// previous face tags onto the new output by exact quantized vertex-set
// equality. Ambiguous (duplicate) geometry keys are deliberately NOT matched —
// a missing entry means "unknown", never a guess. This is the engine-side
// increment toward Onshape's persistent topology naming: VR/desktop selections
// and downstream provenance can keep pointing at the same face across edits.
import type { Brep } from "@vitekk02/cadjs";

type V3 = { x: number; y: number; z: number };

const key = (v: V3): string =>
  `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;

function faceKeys(brep: Brep): string[] {
  const faces = brep.faces as unknown as Array<{ vertices?: V3[] }>;
  return faces.map((f) =>
    [...new Set((f.vertices ?? []).map(key))].sort().join("|"),
  );
}

export function matchFaceTags(
  prevBrep: Brep,
  prevTags: string[],
  nextBrep: Brep,
  nextTags: string[],
): Map<string, string> {
  const out = new Map<string, string>();
  const prevKeys = faceKeys(prevBrep);
  const nextKeys = faceKeys(nextBrep);
  const countOf = (keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const nextCounts = countOf(nextKeys);
  const prevCounts = countOf(prevKeys);
  for (let i = 0; i < prevTags.length; i++) {
    const k = prevKeys[i];
    if (!k) continue;
    // unique on BOTH sides, or the correspondence is a guess → unknown
    if ((nextCounts.get(k) ?? 0) !== 1 || (prevCounts.get(k) ?? 0) !== 1)
      continue;
    const j = nextKeys.indexOf(k);
    if (j < 0) continue;
    const nt = nextTags[j];
    const pt = prevTags[i];
    if (!nt || !pt) continue;
    out.set(pt, nt);
  }
  return out;
}
