// Sketch path sampling for sweep. Turns the sketch's lines, arcs, circles,
// ellipses, splines, Beziers and conics into one ordered polyline that the
// OCC path wire can consume. Pure 2D geometry; no kernel, no DOM.
//
// Arcs carry only start/end points (no sweep direction), so the shorter sweep
// is assumed. A clockwise arc longer than 180° therefore samples the other
// way round; that limitation is recorded in PHASE3_A_TEST_PLAN.md.

export interface PathPoint {
  x: number;
  y: number;
  z: number;
}

interface P2 {
  x: number;
  y: number;
}

interface PathPlaneLike {
  origin: number[];
  xAxis: number[];
  yAxis: number[];
}

interface PathSnapshotLike {
  plane: PathPlaneLike;
  primitives: unknown[];
}

interface SampleSegment {
  points: P2[];
  startKey: string;
  endKey: string;
}

/** Points per full turn for curved primitives (polyline resolution). */
const SAMPLES_PER_TURN = 32;
const SPLINE_STEPS_PER_SPAN = 8;
const BEZIER_STEPS = 16;
const CONIC_STEPS = 16;

const at = (a: number[] | undefined, i: number, fallback = 0): number =>
  a?.[i] ?? fallback;

function toWorld(plane: PathPlaneLike, p: P2): PathPoint {
  const o = plane.origin;
  const ax = plane.xAxis;
  const ay = plane.yAxis;
  return {
    x: at(o, 0) + at(ax, 0) * p.x + at(ay, 0) * p.y,
    y: at(o, 1) + at(ax, 1) * p.x + at(ay, 1) * p.y,
    z: at(o, 2) + at(ax, 2) * p.x + at(ay, 2) * p.y,
  };
}

function sampleArc(center: P2, radius: number, start: P2, end: P2): P2[] {
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const a1 = Math.atan2(end.y - center.y, end.x - center.x);
  let delta = a1 - a0;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  const steps = Math.max(
    2,
    Math.ceil((Math.abs(delta) / (2 * Math.PI)) * SAMPLES_PER_TURN),
  );
  const out: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (delta * i) / steps;
    out.push({
      x: center.x + radius * Math.cos(a),
      y: center.y + radius * Math.sin(a),
    });
  }
  return out;
}

function sampleEllipse(
  center: P2,
  major: number,
  minor: number,
  rotation: number,
  from = 0,
  to = Math.PI * 2,
): P2[] {
  const steps = Math.max(
    4,
    Math.ceil((Math.abs(to - from) / (2 * Math.PI)) * SAMPLES_PER_TURN),
  );
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const out: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    const x = major * Math.cos(t);
    const y = minor * Math.sin(t);
    out.push({
      x: center.x + x * cosR - y * sinR,
      y: center.y + x * sinR + y * cosR,
    });
  }
  return out;
}

function catmullRom(p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

function sampleSpline(points: P2[]): P2[] {
  if (points.length < 2) return points.slice();
  const out: P2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    for (let s = 0; s < SPLINE_STEPS_PER_SPAN; s++) {
      out.push(catmullRom(p0, p1, p2, p3, s / SPLINE_STEPS_PER_SPAN));
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

function sampleBezier(p0: P2, c1: P2, c2: P2, p3: P2): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= BEZIER_STEPS; i++) {
    const t = i / BEZIER_STEPS;
    const u = 1 - t;
    out.push({
      x:
        u * u * u * p0.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t * t * t * p3.x,
      y:
        u * u * u * p0.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t * t * t * p3.y,
    });
  }
  return out;
}

function sampleConic(
  start: P2,
  control: P2,
  end: P2,
  rho: number,
  startWeight = 1,
  endWeight = 1,
): P2[] {
  const out: P2[] = [];
  const w1 = 2 * rho;
  for (let i = 0; i <= CONIC_STEPS; i++) {
    const t = i / CONIC_STEPS;
    const u = 1 - t;
    const w0 = u * u * startWeight;
    const wc = w1 * u * t;
    const w2 = t * t * endWeight;
    const denom = w0 + wc + w2 || 1;
    out.push({
      x: (w0 * start.x + wc * control.x + w2 * end.x) / denom,
      y: (w0 * start.y + wc * control.y + w2 * end.y) / denom,
    });
  }
  return out;
}

function keyFor(p: P2): string {
  return `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
}

function pointById(map: Map<string, P2>, id: unknown): P2 | null {
  return typeof id === "string" ? (map.get(id) ?? null) : null;
}

function segmentFrom(
  points: P2[],
  startKey: string,
  endKey: string,
): SampleSegment | null {
  return points.length >= 2 ? { points, startKey, endKey } : null;
}

/** Convert primitives into sampled segments with chainable endpoint keys. */
function segmentsOf(primitives: unknown[]): SampleSegment[] {
  const pts = new Map<string, P2>();
  for (const raw of primitives) {
    const p = raw as { type?: string; id?: string; x?: number; y?: number };
    if (p.type === "point" && typeof p.id === "string") {
      pts.set(p.id, { x: p.x ?? 0, y: p.y ?? 0 });
    }
  }

  const out: SampleSegment[] = [];
  for (const raw of primitives) {
    const p = raw as {
      type?: string;
      id?: string;
      p1Id?: string;
      p2Id?: string;
      centerId?: string;
      startId?: string;
      endId?: string;
      controlId?: string;
      pointIds?: string[];
      radius?: number;
      majorRadius?: number;
      minorRadius?: number;
      rotation?: number;
      startAngle?: number;
      endAngle?: number;
      rho?: number;
      startWeight?: number;
      endWeight?: number;
      construction?: boolean;
    };
    if (!p.type || p.type === "point" || p.type === "hatch" || p.construction) {
      continue;
    }
    const id = typeof p.id === "string" ? p.id : `${p.type}:${out.length}`;

    if (p.type === "line") {
      const a = pointById(pts, p.p1Id);
      const b = pointById(pts, p.p2Id);
      const seg = a && b ? segmentFrom([a, b], keyFor(a), keyFor(b)) : null;
      if (seg) out.push(seg);
      continue;
    }

    if (p.type === "arc") {
      const c = pointById(pts, p.centerId);
      const a = pointById(pts, p.startId);
      const b = pointById(pts, p.endId);
      const radius = p.radius ?? 0;
      if (c && a && b && radius > 0) {
        out.push({
          points: sampleArc(c, radius, a, b),
          startKey: keyFor(a),
          endKey: keyFor(b),
        });
      }
      continue;
    }

    if (p.type === "circle") {
      const c = pointById(pts, p.centerId);
      const radius = p.radius ?? 0;
      if (c && radius > 0) {
        const ptsAround = sampleEllipse(c, radius, radius, 0);
        out.push({
          points: ptsAround,
          startKey: `circle:${id}`,
          endKey: `circle:${id}`,
        });
      }
      continue;
    }

    if (p.type === "ellipse") {
      const c = pointById(pts, p.centerId);
      const major = p.majorRadius ?? 0;
      const minor = p.minorRadius ?? 0;
      if (c && major > 0 && minor > 0) {
        out.push({
          points: sampleEllipse(c, major, minor, p.rotation ?? 0),
          startKey: `ellipse:${id}`,
          endKey: `ellipse:${id}`,
        });
      }
      continue;
    }

    if (p.type === "ellipticalArc") {
      const c = pointById(pts, p.centerId);
      const major = p.majorRadius ?? 0;
      const minor = p.minorRadius ?? 0;
      if (c && major > 0 && minor > 0) {
        const ptsAround = sampleEllipse(
          c,
          major,
          minor,
          p.rotation ?? 0,
          p.startAngle ?? 0,
          p.endAngle ?? Math.PI * 2,
        );
        out.push({
          points: ptsAround,
          startKey: keyFor(ptsAround[0]!),
          endKey: keyFor(ptsAround[ptsAround.length - 1]!),
        });
      }
      continue;
    }

    if (p.type === "spline" || p.type === "bezier") {
      const ids = p.pointIds ?? [];
      const ordered = ids
        .map((pid) => pts.get(pid))
        .filter((v): v is P2 => !!v);
      if (ordered.length < 2) continue;
      const sampled =
        p.type === "bezier" && ordered.length >= 4
          ? sampleBezier(ordered[0]!, ordered[1]!, ordered[2]!, ordered[3]!)
          : sampleSpline(ordered);
      out.push({
        points: sampled,
        startKey: keyFor(ordered[0]!),
        endKey: keyFor(ordered[ordered.length - 1]!),
      });
      continue;
    }

    if (p.type === "conic") {
      const a = pointById(pts, p.startId);
      const c = pointById(pts, p.controlId);
      const b = pointById(pts, p.endId);
      if (a && c && b) {
        out.push({
          points: sampleConic(
            a,
            c,
            b,
            p.rho ?? 0.5,
            p.startWeight ?? 1,
            p.endWeight ?? 1,
          ),
          startKey: keyFor(a),
          endKey: keyFor(b),
        });
      }
    }
  }
  return out;
}

/** Chain sampled segments head-to-tail into one polyline. */
function chainSegments(segments: SampleSegment[]): P2[] {
  if (!segments.length) return [];
  const counts = new Map<string, number>();
  for (const s of segments) {
    for (const k of [s.startKey, s.endKey]) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const free = (k: string) => (counts.get(k) ?? 0) === 1; // Prefer a segment that starts at a free end so the walk runs head-to-tail.
  // If every segment is oriented toward its free end, start there and reverse.
  const first =
    segments.find((s) => free(s.startKey)) ??
    segments.find((s) => free(s.endKey)) ??
    segments[0]!;
  const remaining = segments.filter((s) => s !== first);
  const reverse = !free(first.startKey) && free(first.endKey);
  const points = reverse ? [...first.points].reverse() : [...first.points];

  while (remaining.length) {
    const tail = points[points.length - 1]!;
    const tailKey = keyFor(tail);
    const idx = remaining.findIndex(
      (s) => s.startKey === tailKey || s.endKey === tailKey,
    );
    if (idx < 0) break;
    const seg = remaining.splice(idx, 1)[0]!;
    const segPoints =
      seg.startKey === tailKey ? seg.points : [...seg.points].reverse();
    points.push(...segPoints.slice(1));
  }
  return points;
}

/**
 * Ordered world-space polylines, one per connected chain. A sketch with
 * several disjoint loops yields several chains; overlap/self-intersection
 * validation uses all of them.
 */
export function chainPathLoops(snap: PathSnapshotLike): PathPoint[][] {
  const remaining = segmentsOf(snap.primitives);
  const loops: PathPoint[][] = [];
  while (remaining.length) {
    const seed = remaining.pop()!;
    const component = [seed];
    const keys = new Set([seed.startKey, seed.endKey]);
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const segment = remaining[i]!;
        if (!keys.has(segment.startKey) && !keys.has(segment.endKey)) continue;
        component.push(segment);
        keys.add(segment.startKey);
        keys.add(segment.endKey);
        remaining.splice(i, 1);
        changed = true;
      }
    }
    const points = chainSegments(component).map((p) => toWorld(snap.plane, p));
    if (points.length >= 2) loops.push(points);
  }
  return loops;
}

/**
 * World-space samples for one sketch entity. Used by viewport curve picking
 * and by features that consume a single selected curve (sweep guides, draft
 * parting edges). Returns an empty list when the entity is missing/open.
 */
export function pathForPrimitive(
  snap: PathSnapshotLike,
  primitiveId: string,
): PathPoint[] {
  const target = snap.primitives.find((raw) => {
    const p = raw as { id?: string; type?: string };
    return (
      p.id === primitiveId &&
      p.type !== undefined &&
      p.type !== "point" &&
      p.type !== "hatch"
    );
  });
  if (!target) return [];
  const points = snap.primitives.filter((raw) => {
    const p = raw as { type?: string };
    return p.type === "point";
  });
  const segments = segmentsOf([...points, target]);
  return segments.length
    ? chainSegments(segments).map((p) => toWorld(snap.plane, p))
    : [];
}

/**
 * Ordered world-space polyline for a sketch's path geometry. Empty when the
 * sketch has nothing chainable; disconnected islands yield the first chain.
 */
export function chainPathPoints(snap: PathSnapshotLike): PathPoint[] {
  return chainPathLoops(snap)[0] ?? [];
}

/**
 * Extend both ends of a polyline along its end tangents. Positive `startOffset`
 * lengthens before the first point, `endOffset` after the last.
 */
/**
 * Blend several guide curves into one auxiliary spine. Each guide is resampled
 * to a common point count by arc length, then corresponding points are averaged.
 * This is the closest approximation to multi-guide sweep this OCC build allows
 * (`BRepOffsetAPI_MakePipeShell.SetMode_5` takes a single auxiliary spine).
 */
export function blendGuidePoints(
  guides: PathPoint[][],
  samples = 64,
): PathPoint[] | undefined {
  const chains = guides.filter((g) => g.length >= 2);
  if (!chains.length) return undefined;
  if (chains.length === 1) return chains[0]!.map((p) => ({ ...p }));
  const resampled = chains.map((g) => resampleByArcLength(g, samples));
  const out: PathPoint[] = [];
  for (let i = 0; i < samples; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const chain of resampled) {
      const p = chain[i]!;
      x += p.x;
      y += p.y;
      z += p.z;
    }
    const n = resampled.length;
    out.push({ x: x / n, y: y / n, z: z / n });
  }
  return out;
}

function resampleByArcLength(points: PathPoint[], count: number): PathPoint[] {
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const total = lengths[lengths.length - 1]!;
  if (!(total > 1e-12)) return points.map((p) => ({ ...p }));
  const out: PathPoint[] = [];
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    let j = 1;
    while (j < lengths.length - 1 && lengths[j]! < target) j++;
    const a = points[j - 1]!;
    const b = points[j]!;
    const span = lengths[j]! - lengths[j - 1]!;
    const t = span > 1e-12 ? (target - lengths[j - 1]!) / span : 0;
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    });
  }
  return out;
}

export function extendPathEnds(
  points: PathPoint[],
  startOffset = 0,
  endOffset = 0,
): PathPoint[] {
  if (points.length < 2) return points.slice();
  const out = points.map((p) => ({ ...p }));

  if (startOffset > 0) {
    const a = out[0]!;
    const b = out[1]!;
    const len = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (len > 1e-9) {
      out.unshift({
        x: a.x + ((a.x - b.x) / len) * startOffset,
        y: a.y + ((a.y - b.y) / len) * startOffset,
        z: a.z + ((a.z - b.z) / len) * startOffset,
      });
    }
  }

  if (endOffset > 0) {
    const a = out[out.length - 1]!;
    const b = out[out.length - 2]!;
    const len = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (len > 1e-9) {
      out.push({
        x: a.x + ((a.x - b.x) / len) * endOffset,
        y: a.y + ((a.y - b.y) / len) * endOffset,
        z: a.z + ((a.z - b.z) / len) * endOffset,
      });
    }
  }

  return out;
}
