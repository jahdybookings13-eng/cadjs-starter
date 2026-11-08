import {
  SIM_FACES,
  SimError,
  simId,
  type SimBodySource,
  type SimContactFinding,
  type SimContactKind,
  type SimContactPair,
  type SimContactResult,
  type SimContactStatus,
  type SimDocument,
  type SimFace,
  type SimMesh,
  type SimTriangle,
  type SimVec3,
} from "./model";

export interface ContactOptions {
  signal?: AbortSignal | undefined;
  shouldCancel?: (() => boolean) | undefined;
  /** Absolute performance.now() deadline for this check. */
  deadlineMs?: number | undefined;
}

function checkCancel(options: ContactOptions): void {
  if (options.signal?.aborted || options.shouldCancel?.()) {
    throw new SimError("SIM_CANCELLED", "Simulation cancelled.");
  }
  if (
    options.deadlineMs !== undefined &&
    performance.now() > options.deadlineMs
  ) {
    throw new SimError("SIM_BUDGET", "Contact check exceeded its time budget.");
  }
}

function sub(a: SimVec3, b: SimVec3): SimVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: SimVec3, b: SimVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: SimVec3, b: SimVec3): SimVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(value: SimVec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function distance(a: SimVec3, b: SimVec3): number {
  return length(sub(a, b));
}

function pointSegmentDistance(p: SimVec3, a: SimVec3, b: SimVec3): number {
  const ab = sub(b, a);
  const denominator = dot(ab, ab);
  if (denominator <= 1e-30) return distance(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / denominator));
  return distance(p, {
    x: a.x + ab.x * t,
    y: a.y + ab.y * t,
    z: a.z + ab.z * t,
  });
}

function pointTriangleDistance(
  p: SimVec3,
  a: SimVec3,
  b: SimVec3,
  c: SimVec3,
): number {
  const normal = cross(sub(b, a), sub(c, a));
  const normalLength = length(normal);
  if (normalLength <= 1e-30) {
    return Math.min(
      pointSegmentDistance(p, a, b),
      pointSegmentDistance(p, b, c),
      pointSegmentDistance(p, c, a),
    );
  }
  const unit = {
    x: normal.x / normalLength,
    y: normal.y / normalLength,
    z: normal.z / normalLength,
  };
  const planeDistance = dot(sub(p, a), unit);
  const projected = {
    x: p.x - unit.x * planeDistance,
    y: p.y - unit.y * planeDistance,
    z: p.z - unit.z * planeDistance,
  };
  const v0 = sub(b, a);
  const v1 = sub(c, a);
  const v2 = sub(projected, a);
  const d00 = dot(v0, v0);
  const d01 = dot(v0, v1);
  const d11 = dot(v1, v1);
  const d20 = dot(v2, v0);
  const d21 = dot(v2, v1);
  const denominator = d00 * d11 - d01 * d01;
  if (Math.abs(denominator) > 1e-30) {
    const v = (d11 * d20 - d01 * d21) / denominator;
    const w = (d00 * d21 - d01 * d20) / denominator;
    if (v >= -1e-9 && w >= -1e-9 && v + w <= 1 + 1e-9) {
      return Math.abs(planeDistance);
    }
  }
  return Math.min(
    pointSegmentDistance(p, a, b),
    pointSegmentDistance(p, b, c),
    pointSegmentDistance(p, c, a),
  );
}

function faceTriangles(body: SimBodySource, face: SimFace): SimTriangle[] {
  const axis = face[0] as "x" | "y" | "z";
  let min = Infinity;
  let max = -Infinity;
  for (const triangle of body.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      min = Math.min(min, point[axis]);
      max = Math.max(max, point[axis]);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new SimError(
      "SIM_CONTACT_GEOMETRY",
      `Body "${body.name}" has no triangle geometry.`,
    );
  }
  const target = face.endsWith("-min") ? min : max;
  const tolerance = Math.max(1e-7, (max - min) * 1e-6);
  return body.triangles.filter(
    (triangle) =>
      Math.abs(triangle.a[axis] - target) <= tolerance &&
      Math.abs(triangle.b[axis] - target) <= tolerance &&
      Math.abs(triangle.c[axis] - target) <= tolerance,
  );
}

function contactGap(
  primary: SimBodySource,
  target: SimBodySource,
  pair: SimContactPair,
): number {
  const primaryFaces = faceTriangles(primary, pair.face);
  const targetFaces = faceTriangles(target, pair.targetFace);
  if (!primaryFaces.length || !targetFaces.length) {
    throw new SimError(
      "SIM_SELECTION_FACE",
      `Contact "${pair.name}" selects a face with no triangles.`,
    );
  }
  let gap = Infinity;
  for (const first of primaryFaces) {
    for (const second of targetFaces) {
      for (const point of [first.a, first.b, first.c]) {
        gap = Math.min(
          gap,
          pointTriangleDistance(point, second.a, second.b, second.c),
        );
      }
      for (const point of [second.a, second.b, second.c]) {
        gap = Math.min(
          gap,
          pointTriangleDistance(point, first.a, first.b, first.c),
        );
      }
    }
  }
  return Number.isFinite(gap) ? gap : Infinity;
}

function statusFor(
  kind: SimContactKind,
  gap: number,
  tolerance: number,
): SimContactStatus {
  if (gap > tolerance) return "open";
  if (kind === "bonded") return "bonded";
  if (kind === "sliding") return "sliding";
  return "separating";
}

export function simulateContacts(
  document: SimDocument,
  options: ContactOptions = {},
): SimContactResult {
  const primary = document.body;
  const target = document.contactTarget;
  if (!primary) {
    throw new SimError(
      "SIM_CONTACT_UNPAIRED",
      "A contact check needs the primary body.",
    );
  }
  if (!target) {
    throw new SimError(
      "SIM_CONTACT_UNPAIRED",
      "A contact check needs a target body.",
    );
  }
  if (primary.id === target.id) {
    throw new SimError(
      "SIM_CONTACT_SELF",
      "A body cannot contact itself; choose a distinct target body.",
    );
  }
  if (!document.contacts.length) {
    throw new SimError(
      "SIM_CONTACT_PAIR_MISSING",
      "Add at least one contact pair before running the check.",
    );
  }

  const started = performance.now();
  const findings: SimContactFinding[] = [];
  let minGap = Infinity;

  for (const pair of document.contacts) {
    checkCancel(options);
    if (!["bonded", "sliding", "separating"].includes(pair.kind)) {
      throw new SimError(
        "SIM_CONTACT_KIND",
        `Unknown contact kind "${String(pair.kind)}".`,
      );
    }
    if (pair.bodyId === pair.targetBodyId) {
      throw new SimError(
        "SIM_CONTACT_SELF",
        `Contact "${pair.name}" pairs a body with itself.`,
      );
    }
    if (pair.bodyId !== primary.id || pair.targetBodyId !== target.id) {
      throw new SimError(
        "SIM_CONTACT_UNPAIRED",
        `Contact "${pair.name}" references a body that is not the active pair.`,
      );
    }
    if (!(pair.penalty > 0) || !(pair.gapTolerance >= 0)) {
      throw new SimError(
        "SIM_CONTACT_PENALTY",
        `Contact "${pair.name}" needs a positive penalty and a non-negative gap tolerance.`,
      );
    }
    if (
      !Number.isFinite(pair.friction) ||
      pair.friction < 0 ||
      pair.friction > 1
    ) {
      throw new SimError(
        "SIM_CONTACT_FRICTION",
        `Contact "${pair.name}" needs friction between zero and one.`,
      );
    }
    const gap = contactGap(primary, target, pair);
    if (!Number.isFinite(gap)) {
      throw new SimError(
        "SIM_SELECTION_FACE",
        `Contact "${pair.name}" selects an empty face.`,
      );
    }
    const status = statusFor(pair.kind, gap, pair.gapTolerance);
    const penetration = Math.max(0, pair.gapTolerance - gap);
    findings.push({
      id: pair.id,
      name: pair.name,
      kind: pair.kind,
      gap,
      status,
      penaltyForceN: status === "open" ? 0 : pair.penalty * penetration,
    });
    minGap = Math.min(minGap, gap);
  }

  return {
    findings,
    minGap,
    bonded: findings.filter((finding) => finding.status === "bonded").length,
    sliding: findings.filter((finding) => finding.status === "sliding").length,
    separating: findings.filter((finding) => finding.status === "separating")
      .length,
    sticking: 0,
    open: findings.filter((finding) => finding.status === "open").length,
    solveMs: performance.now() - started,
  };
}

function meshFaceNodes(mesh: SimMesh, face: SimFace): number[] {
  const axis = face[0] as "x" | "y" | "z";
  const values = mesh.nodes.map((node) => node[axis]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const target = face.endsWith("-min") ? min : max;
  const tolerance = Math.max(1e-7, mesh.cellSize * 1e-3);
  return mesh.nodes.flatMap((node, index) =>
    Math.abs(node[axis] - target) <= tolerance ? [index] : [],
  );
}

export function autoBondTouchingFaces(
  document: SimDocument,
  tolerance = 0.5,
): SimContactPair[] {
  const primary = document.body;
  const target = document.contactTarget;
  if (!primary || !target) {
    throw new SimError(
      "SIM_CONTACT_UNPAIRED",
      "Auto-bond needs both a primary body and a target body.",
    );
  }
  if (primary.id === target.id) {
    throw new SimError(
      "SIM_CONTACT_SELF",
      "A body cannot bond to itself; choose a distinct target body.",
    );
  }
  const pairs: SimContactPair[] = [];
  for (const face of SIM_FACES) {
    for (const targetFace of SIM_FACES) {
      const pair: SimContactPair = {
        id: simId("contact"),
        name: `${face} → ${targetFace}`,
        kind: "bonded",
        bodyId: primary.id,
        targetBodyId: target.id,
        face,
        targetFace,
        penalty: 10_000,
        gapTolerance: tolerance,
        friction: 0,
      };
      const gap = contactGap(primary, target, pair);
      if (gap <= tolerance) pairs.push(pair);
    }
  }
  if (!pairs.length) {
    throw new SimError(
      "SIM_CONTACT_PROXIMITY",
      `No touching faces were found within ${tolerance} ${document.units}.`,
    );
  }
  return pairs;
}

export function contactTargetBody(
  document: SimDocument,
  body: SimBodySource | null,
): SimDocument {
  return {
    ...document,
    contactTarget: body,
    targetMesh: null,
    contacts: [],
    contact: null,
  };
}
