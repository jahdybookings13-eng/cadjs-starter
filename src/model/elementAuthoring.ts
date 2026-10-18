type AddFn = (brep: unknown, position: unknown) => void;

export function makeElementAuthor(
  addElement: AddFn,
  getIdCounter: () => number,
): (brep: unknown, position: unknown) => string {
  let seenCounter = -1;
  let extra = 0;
  return (brep, position) => {
    const base = getIdCounter();
    if (base !== seenCounter) {
      seenCounter = base;
      extra = 0;
    }
    const next = base + 1 + extra;
    extra++;
    addElement(brep, position);
    return `node_${next}`;
  };
}

export interface PendingAuthoring {
  predictedId: string;
  brep: unknown;
  position: unknown;
  occBrep?: string | undefined;
  edgeGeometry?: unknown;
  faceGeometry?: unknown;
  vertexPositions?: unknown;
}

export function pairNewElements(
  elementIds: string[],
  seen: Set<string>,
  pending: PendingAuthoring[],
): { actualId: string; item: PendingAuthoring }[] {
  const fresh = elementIds
    .filter((id) => !seen.has(id))
    .sort((a, b) => {
      const na = Number(a.replace(/\D/g, ""));
      const nb = Number(b.replace(/\D/g, ""));
      return na - nb;
    });
  const out: { actualId: string; item: PendingAuthoring }[] = [];
  const n = Math.min(fresh.length, pending.length);
  for (let i = 0; i < n; i++) {
    const id = fresh[i];
    const item = pending[i];
    if (id && item) out.push({ actualId: id, item });
  }
  for (const id of elementIds) seen.add(id);
  return out;
}
