// Selection-scoped export: the exact bodies the user grabbed (VR) or
// clicked (desk) become one STL + a mm bounding box, ready for the
// slicer daemon. Whole-scene export stays a separate hook.
//
// Units: 1 scene unit = 1 mm. `vertexPositions` are local to the element
// (on the kernel side), so each vertex is offset by the element's world
// translation before min/max.

export interface SelectionSet {
  ids: string[];
  elements: unknown[];
}

export interface SelectionStl {
  stlBytes: Uint8Array;
  stlName: string;
  /** World bbox in mm: [minX,minY,minZ,maxX,maxY,maxZ]. */
  bboxMM: [number, number, number, number, number, number] | null;
  /** Derived size [W,H,D] in mm (all zeros when no vertices exist). */
  sizeMM: [number, number, number];
  bodyCount: number;
}

interface ElementLike {
  nodeId: string;
  position?: { x: number; y: number; z: number } | undefined;
  vertexPositions?: Float32Array | number[] | undefined;
}

export function selectByNodeIds(
  elements: unknown[],
  ids: string[],
): SelectionSet {
  const set = new Set(ids);
  const els = elements.filter((e) =>
    set.has((e as ElementLike).nodeId),
  ) as ElementLike[];
  const found = new Set(els.map((e) => e.nodeId));
  return {
    ids: ids.filter((i) => found.has(i)),
    elements: els,
  };
}

export function selectionBboxMM(
  elements: unknown[],
  ids: string[] = [],
): [number, number, number, number, number, number] | null {
  const all: ElementLike[] = elements as ElementLike[];
  const set = new Set(ids.length > 0 ? ids : all.map((e) => e.nodeId));
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let found = false;
  for (const e of all) {
    if (set.size > 0 && !set.has(e.nodeId)) continue;
    const pos = e.position ?? { x: 0, y: 0, z: 0 };
    const vp = e.vertexPositions;
    if (vp && vp.length >= 3) {
      for (let i = 0; i + 2 < vp.length; i += 3) {
        const x = vp[i]! + pos.x;
        const y = vp[i + 1]! + pos.y;
        const z = vp[i + 2]! + pos.z;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
        found = true;
      }
    } else {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
      if (pos.z < minZ) minZ = pos.z;
      if (pos.z > maxZ) maxZ = pos.z;
      found = true;
    }
  }
  if (!found) return null;
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

export async function exportSelectionStl(
  elements: unknown[],
  ids: string[],
  exportFn: (els: unknown[]) => Promise<Blob>,
): Promise<SelectionStl> {
  const sel = selectByNodeIds(elements, ids);
  if (sel.elements.length === 0)
    throw new Error("no selected bodies to export");
  const all = elements as ElementLike[];
  const bbox = selectionBboxMM(all, sel.ids);
  const blob = await exportFn(sel.elements);
  const stlBytes = new Uint8Array(await blob.arrayBuffer());
  const sizeMM: [number, number, number] = bbox
    ? [bbox[3] - bbox[0], bbox[4] - bbox[1], bbox[5] - bbox[2]]
    : [0, 0, 0];
  const stamp = Date.now().toString(36);
  return {
    stlBytes,
    stlName:
      sel.ids.length > 1
        ? `scadgen_selection_${stamp}.stl`
        : `scadgen_${stamp}.stl`,
    bboxMM: bbox,
    sizeMM,
    bodyCount: sel.elements.length,
  };
}

/** Fit check: model size vs build volume. Rotates the part? No — size is
 *  already oriented; each axis is compared directly. */
export function fitsOnBed(
  sizeMM: [number, number, number],
  bed: { bedMM: [number, number]; buildHeightMM: number },
): {
  fits: boolean;
  axis: "X" | "Y" | "Z" | null;
  needMM: number;
  haveMM: number;
} {
  const [bx, by] = bed.bedMM;
  const [w, h, d] = sizeMM;
  if (w > bx) return { fits: false, axis: "X", needMM: w, haveMM: bx };
  if (d > by) return { fits: false, axis: "Y", needMM: d, haveMM: by };
  if (h > bed.buildHeightMM)
    return { fits: false, axis: "Z", needMM: h, haveMM: bed.buildHeightMM };
  return {
    fits: true,
    axis: null,
    needMM: Math.max(w, d),
    haveMM: Math.max(bx, by),
  };
}
