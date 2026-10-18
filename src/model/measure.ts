import * as THREE from "three";
import { OccWorkerClient, distance3 } from "@vitekk02/cadjs";
import type { BodyOutput } from "./executor";

export type Meas =
  | { kind: "edge-length"; tag: string; value: number }
  | {
      kind: "distance";
      tagA: string;
      tagB: string;
      value: number;
      method: "vertex-heuristic";
    }
  | { kind: "polyline-length"; value: number }
  | { kind: "straight-edge-angle"; tagA: string; tagB: string; value: number }
  | { kind: "face-count" | "edge-count"; value: number };

export function edgeIndexOf(tag: string): number {
  const m = /_E(\d+)$/.exec(tag);
  if (!m) throw new Error(`not an edge tag: ${tag}`);
  return Number(m[1]);
}

const vec = (v: { x: number; y: number; z: number }) =>
  new THREE.Vector3(v.x, v.y, v.z);

export async function edgeLength(
  body: BodyOutput,
  tag: string,
): Promise<number> {
  const client = OccWorkerClient.getInstance();
  await client.waitForReady();
  const res = await client.send<{ length: number }>({
    type: "edgeLength",
    payload: {
      brepJson: body.brep.toJSON(),
      position: {
        x: body.position.x,
        y: body.position.y,
        z: body.position.z,
      },
      edgeIndex: edgeIndexOf(tag) + 1,
      ...(body.occBrep !== undefined ? { occBrep: body.occBrep } : {}),
    },
  });
  return res.length;
}

export function polylineLength(body: BodyOutput): number {
  let total = 0;
  for (const e of body.brep.edges) total += distance3(vec(e.start), vec(e.end));
  return total;
}

export function straightEdgeAngle(
  body: BodyOutput,
  tagA: string,
  tagB: string,
): number | null {
  const a = body.brep.edges[edgeIndexOf(tagA)];
  const b = body.brep.edges[edgeIndexOf(tagB)];
  if (!a || !b) return null;
  const da = vec(a.end).sub(vec(a.start)).normalize();
  const db = vec(b.end).sub(vec(b.start)).normalize();
  const dot = THREE.MathUtils.clamp(da.dot(db), -1, 1);
  return THREE.MathUtils.radToDeg(Math.acos(dot));
}

export function nearestVertexDistance(a: BodyOutput, b: BodyOutput): number {
  let min = Infinity;
  for (const va of a.brep.vertices) {
    const pa = vec(va).add(a.position);
    for (const vb of b.brep.vertices) {
      const d = distance3(pa, vec(vb).add(b.position));
      if (d < min) min = d;
    }
  }
  return min;
}
