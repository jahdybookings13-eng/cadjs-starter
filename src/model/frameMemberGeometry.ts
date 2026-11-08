import {
  Brep,
  Edge as BrepEdge,
  Face as BrepFace,
  Vertex as BrepVertex,
} from "@vitekk02/cadjs";

export interface FrameMemberVec3 {
  x: number;
  y: number;
  z: number;
}

export interface FrameMemberProfileDims {
  width: number;
  height: number;
  wall: number;
}

const EPS = 1e-9;

function add(a: FrameMemberVec3, b: FrameMemberVec3): FrameMemberVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: FrameMemberVec3, b: FrameMemberVec3): FrameMemberVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: FrameMemberVec3, s: number): FrameMemberVec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot(a: FrameMemberVec3, b: FrameMemberVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: FrameMemberVec3, b: FrameMemberVec3): FrameMemberVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function unit(a: FrameMemberVec3): FrameMemberVec3 | null {
  const length = Math.hypot(a.x, a.y, a.z);
  return length > EPS ? scale(a, 1 / length) : null;
}

/** Profile ids look like `square-40x40x3`; dimensions are millimetres. */
export function parseFrameProfileId(
  profileId: string,
): FrameMemberProfileDims | null {
  const values = profileId.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length < 2) return null;
  const width = values[0];
  const height = values[1];
  if (!(width && height && width > 0 && height > 0)) return null;
  return {
    width: width / 1000,
    height: height / 1000,
    wall: Math.max(0, values[2] ?? 0) / 1000,
  };
}

export function buildFrameMemberProfile(
  start: FrameMemberVec3,
  end: FrameMemberVec3,
  width: number,
  height: number,
  rotationRad = 0,
): { brep: Brep; direction: FrameMemberVec3; length: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const delta = sub(end, start);
  const length = Math.hypot(delta.x, delta.y, delta.z);
  const direction = unit(delta);
  if (!direction || !(length > EPS)) return null;

  const seed =
    Math.abs(direction.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const u = unit(cross(seed, direction));
  if (!u) return null;
  const v = unit(cross(direction, u));
  if (!v) return null;

  const c = Math.cos(rotationRad);
  const s = Math.sin(rotationRad);
  const xAxis = unit(add(scale(u, c), scale(v, s)));
  const yAxis = unit(sub(scale(v, c), scale(u, s)));
  if (!xAxis || !yAxis) return null;

  const hw = width / 2;
  const hh = height / 2;
  const corners = [
    add(start, add(scale(xAxis, -hw), scale(yAxis, -hh))),
    add(start, add(scale(xAxis, hw), scale(yAxis, -hh))),
    add(start, add(scale(xAxis, hw), scale(yAxis, hh))),
    add(start, add(scale(xAxis, -hw), scale(yAxis, hh))),
  ];
  const vertices = corners.map((p) => new BrepVertex(p.x, p.y, p.z));
  const edges = corners.map((p, i) => {
    const q = corners[(i + 1) % corners.length]!;
    return new BrepEdge(
      new BrepVertex(p.x, p.y, p.z),
      new BrepVertex(q.x, q.y, q.z),
    );
  });
  return {
    brep: new Brep(vertices, edges, [new BrepFace(vertices)]),
    direction,
    length,
  };
}

export function profileNormalDot(
  face: { normal: FrameMemberVec3 },
  direction: FrameMemberVec3,
): number {
  const normal = unit(face.normal);
  return normal ? Math.abs(dot(normal, direction)) : 0;
}
