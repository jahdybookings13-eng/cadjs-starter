// Named mate connectors derived from a body's bounds. Connectors are local
// frames: the solver multiplies them by the instance transform before use.

import type { Assembly, AssemblyConnector, RefMap, RefSpec } from "./model";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BodyBounds {
  min: Vec3;
  max: Vec3;
}

export const CONNECTOR_NAMES = [
  "body",
  "center",
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
  "axis-x",
  "axis-y",
  "axis-z",
] as const;

export type ConnectorName = (typeof CONNECTOR_NAMES)[number];

export const CONNECTOR_LABELS: Record<ConnectorName, string> = {
  body: "Body origin",
  center: "Center",
  front: "Front face",
  back: "Back face",
  left: "Left face",
  right: "Right face",
  top: "Top face",
  bottom: "Bottom face",
  "axis-x": "X axis",
  "axis-y": "Y axis",
  "axis-z": "Z axis",
};

function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function frame(origin: Vec3, x: Vec3, y: Vec3, z: Vec3): number[] {
  // Column-major 4x4: columns are the frame axes and origin, matching the
  // solver's translation slots (3, 7, 11).
  return [
    x.x,
    x.y,
    x.z,
    origin.x,
    y.x,
    y.y,
    y.z,
    origin.y,
    z.x,
    z.y,
    z.z,
    origin.z,
    0,
    0,
    0,
    1,
  ];
}

function centerOf(bounds: BodyBounds): Vec3 {
  return v(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  );
}

/** Bounds-derived radius for a connector direction. */
function connectorRadius(name: string, bounds: BodyBounds): number {
  const dx = Math.abs(bounds.max.x - bounds.min.x) / 2;
  const dy = Math.abs(bounds.max.y - bounds.min.y) / 2;
  const dz = Math.abs(bounds.max.z - bounds.min.z) / 2;
  switch (name) {
    case "axis-x":
      return Math.hypot(dy, dz);
    case "axis-y":
      return Math.hypot(dx, dz);
    case "axis-z":
      return Math.hypot(dx, dy);
    case "front":
    case "back":
      return Math.hypot(dx, dz);
    case "left":
    case "right":
      return Math.hypot(dy, dz);
    case "top":
    case "bottom":
      return Math.hypot(dx, dy);
    default:
      return Math.hypot(dx, dy, dz);
  }
}

/** Local frame for a named connector, or null when the name is unknown. */
export function connectorFrame(
  name: string,
  bounds: BodyBounds,
  options: {
    offset?: [number, number, number];
    flip?: boolean;
  } = {},
): number[] | null {
  const frame = connectorBaseFrame(name, bounds);
  if (!frame) return null;
  // Flip is an orientation change on the connector, not on the body: negate
  // the local X/Y axes while keeping the origin where the face sits.
  if (options.flip) {
    for (let row = 0; row < 3; row++) {
      frame[row] = -(frame[row] ?? 0);
      frame[4 + row] = -(frame[4 + row] ?? 0);
    }
  }
  const offset = options.offset ?? [0, 0, 0];
  if (offset.some((value) => value !== 0)) {
    for (let row = 0; row < 3; row++)
      frame[3 + row * 4] =
        (frame[3 + row * 4] ?? 0) +
        (frame[row] ?? 0) * offset[0] +
        (frame[4 + row] ?? 0) * offset[1] +
        (frame[8 + row] ?? 0) * offset[2];
  }
  return frame;
}

function connectorBaseFrame(name: string, bounds: BodyBounds): number[] | null {
  const c = centerOf(bounds);
  const x = v(1, 0, 0);
  const y = v(0, 1, 0);
  const z = v(0, 0, 1);
  switch (name) {
    case "body":
    case "center":
      return frame(c, x, y, z);
    case "front":
      return frame(v(c.x, bounds.min.y, c.z), x, z, v(0, -1, 0));
    case "back":
      return frame(v(c.x, bounds.max.y, c.z), x, v(0, 0, -1), v(0, 1, 0));
    case "left":
      return frame(
        v(bounds.min.x, c.y, c.z),
        v(0, 1, 0),
        v(0, 0, -1),
        v(-1, 0, 0),
      );
    case "right":
      return frame(v(bounds.max.x, c.y, c.z), v(0, 1, 0), z, v(1, 0, 0));
    case "top":
      return frame(v(c.x, c.y, bounds.max.z), x, y, z);
    case "bottom":
      return frame(v(c.x, c.y, bounds.min.z), x, v(0, -1, 0), v(0, 0, -1));
    case "axis-x":
      return frame(c, v(0, 1, 0), v(0, 0, 1), v(1, 0, 0));
    case "axis-y":
      return frame(c, v(0, 0, 1), v(1, 0, 0), v(0, 1, 0));
    case "axis-z":
      return frame(c, x, y, z);
    default:
      return null;
  }
}

/** Local frame of a user-authored connector (base + offset + flip). */
export function customConnectorFrame(
  connector: AssemblyConnector,
  bounds: BodyBounds,
): RefSpec | null {
  const transform = connectorFrame(connector.base, bounds, {
    ...(connector.offset ? { offset: connector.offset } : {}),
    ...(connector.flip ? { flip: true } : {}),
  });
  if (!transform) return null;
  const direction = connector.axis ?? connector.normal;
  if (direction) {
    // A picked face/edge/axis carries its own direction. Keep the picked
    // origin and rebuild the frame around it so the mate axis matches the BRep.
    const origin: [number, number, number] = [
      transform[3] ?? 0,
      transform[7] ?? 0,
      transform[11] ?? 0,
    ];
    const oriented = frameFromNormal(origin, direction);
    if (oriented)
      for (let index = 0; index < 16; index++)
        transform[index] = oriented[index] ?? 0;
  }
  return {
    transform,
    radius: connector.radius ?? connectorRadius(connector.base, bounds),
  };
}

/** Orthonormal frame whose +Z is `normal`, with a stable perpendicular X. */
function frameFromNormal(
  origin: [number, number, number],
  normal: [number, number, number],
): number[] | null {
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  if (length < 1e-9) return null;
  const z: Vec3 = {
    x: normal[0] / length,
    y: normal[1] / length,
    z: normal[2] / length,
  };
  const seed: Vec3 = Math.abs(z.z) < 0.9 ? v(0, 0, 1) : v(0, 1, 0);
  // x = normalize(seed x z); y = z x x
  const xRaw = v(
    seed.y * z.z - seed.z * z.y,
    seed.z * z.x - seed.x * z.z,
    seed.x * z.y - seed.y * z.x,
  );
  const xLength = Math.hypot(xRaw.x, xRaw.y, xRaw.z) || 1;
  const x = v(xRaw.x / xLength, xRaw.y / xLength, xRaw.z / xLength);
  const y = v(
    z.y * x.z - z.z * x.y,
    z.z * x.x - z.x * x.z,
    z.x * x.y - z.y * x.x,
  );
  return [
    x.x,
    x.y,
    x.z,
    origin[0],
    y.x,
    y.y,
    y.z,
    origin[1],
    z.x,
    z.y,
    z.z,
    origin[2],
    0,
    0,
    0,
    1,
  ];
}

/** Build the solver ref map for every instance from its body bounds. */
export function buildRefMap(
  asm: Assembly,
  boundsById: Readonly<Record<string, BodyBounds>>,
): RefMap {
  const map: RefMap = {};
  const visit = (assembly: Assembly): void => {
    for (const inst of assembly.instances) {
      if (inst.subassembly) {
        visit(inst.subassembly);
        continue;
      }
      const bounds = boundsById[inst.bodyId ?? inst.id];
      const refs: Record<string, RefSpec> = {};
      if (bounds) {
        for (const name of CONNECTOR_NAMES) {
          const transform = connectorFrame(name, bounds);
          if (transform)
            refs[name] = {
              transform,
              radius: connectorRadius(name, bounds),
            };
        }
        // User connectors win on a name collision, so a picked face/edge can
        // replace a bounds default without changing the mate references.
        for (const connector of inst.connectors ?? []) {
          const spec = customConnectorFrame(connector, bounds);
          if (spec) refs[connector.name] = spec;
        }
      }
      // Always keep a body-origin fallback so legacy `ref: "body"` mates solve.
      refs.body ??= {
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      };
      map[inst.id] = refs;
    }
  };
  visit(asm);
  return map;
}

/** Connector names a mate picker can offer for one instance. */
export function connectorNamesFor(asm: Assembly, instanceId: string): string[] {
  const inst = asm.instances.find((item) => item.id === instanceId);
  const custom = (inst?.connectors ?? []).map((connector) => connector.name);
  return [...new Set([...CONNECTOR_NAMES, ...custom])];
}
