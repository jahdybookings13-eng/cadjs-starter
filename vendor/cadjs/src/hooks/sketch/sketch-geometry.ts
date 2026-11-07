/**
 * Geometry helpers that are independent of React and Three.js.
 *
 * Keeping these pure makes creation tools testable without mounting the
 * sketch editor and lets the same construction feed previews and commits.
 */

export interface CircleThroughPoints {
  center: { x: number; y: number };
  radius: number;
}

/**
 * Circle passing through three non-collinear points.
 *
 * Returns `null` for collinear or coincident points (including a zero-radius
 * circle), which is the same condition the 3-point circle tool refuses.
 */
export function circleThroughThreePoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): CircleThroughPoints | null {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const cx = c.x;
  const cy = c.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-10) return null;

  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;

  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const radius = Math.hypot(ax - ux, ay - uy);

  if (!Number.isFinite(ux) || !Number.isFinite(uy) || radius < 1e-10) {
    return null;
  }

  return { center: { x: ux, y: uy }, radius };
}

export interface SlotGeometry {
  a: { x: number; y: number };
  b: { x: number; y: number };
  radius: number;
  direction: { x: number; y: number };
  normal: { x: number; y: number };
  topA: { x: number; y: number };
  topB: { x: number; y: number };
  bottomA: { x: number; y: number };
  bottomB: { x: number; y: number };
}

/** Stadium/slot geometry from two centre points and a half-width. */
export function slotGeometry(
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
): SlotGeometry | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-10 || radius < 1e-10) return null;

  const direction = { x: dx / length, y: dy / length };
  const normal = { x: -direction.y, y: direction.x };

  return {
    a,
    b,
    radius,
    direction,
    normal,
    topA: { x: a.x + normal.x * radius, y: a.y + normal.y * radius },
    topB: { x: b.x + normal.x * radius, y: b.y + normal.y * radius },
    bottomA: { x: a.x - normal.x * radius, y: a.y - normal.y * radius },
    bottomB: { x: b.x - normal.x * radius, y: b.y - normal.y * radius },
  };
}

/** Perpendicular distance to the infinite line through a and b. */
export function distanceToLine(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-10) return Math.hypot(point.x - a.x, point.y - a.y);
  return Math.abs(
    (point.x - a.x) * dy - (point.y - a.y) * dx,
  ) / length;
}

export interface EllipseGeometry {
  center: { x: number; y: number };
  majorRadius: number;
  minorRadius: number;
  rotation: number;
}

/**
 * Ellipse from its centre, a point on the major axis, and a point that sets the
 * minor radius (the perpendicular distance to the major axis). If the second
 * radius is larger, the axes are swapped and the ellipse is rotated 90° so
 * `majorRadius >= minorRadius` always holds.
 */
export function ellipseGeometry(
  center: { x: number; y: number },
  majorPoint: { x: number; y: number },
  minorPoint: { x: number; y: number },
): EllipseGeometry | null {
  let majorRadius = Math.hypot(
    majorPoint.x - center.x,
    majorPoint.y - center.y,
  );
  if (majorRadius < 1e-10) return null;

  let rotation = Math.atan2(
    majorPoint.y - center.y,
    majorPoint.x - center.x,
  );
  let minorRadius = distanceToLine(minorPoint, center, majorPoint);
  if (minorRadius < 1e-10) return null;

  if (minorRadius > majorRadius) {
    [majorRadius, minorRadius] = [minorRadius, majorRadius];
    rotation += Math.PI / 2;
  }

  return { center, majorRadius, minorRadius, rotation };
}

export interface EllipticalArcGeometry extends EllipseGeometry {
  startAngle: number;
  endAngle: number;
}

/** Elliptical arc from centre, major/minor picks, and start/end points. */
export function ellipticalArcGeometry(
  center: { x: number; y: number },
  majorPoint: { x: number; y: number },
  minorPoint: { x: number; y: number },
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number },
): EllipticalArcGeometry | null {
  const ellipse = ellipseGeometry(center, majorPoint, minorPoint);
  if (!ellipse) return null;

  const cosR = Math.cos(ellipse.rotation);
  const sinR = Math.sin(ellipse.rotation);
  const parameterAt = (p: { x: number; y: number }) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const localX = dx * cosR + dy * sinR;
    const localY = -dx * sinR + dy * cosR;
    return Math.atan2(
      localY / ellipse.minorRadius,
      localX / ellipse.majorRadius,
    );
  };

  let startAngle = parameterAt(startPoint);
  let endAngle = parameterAt(endPoint);
  if (endAngle <= startAngle) endAngle += Math.PI * 2;
  if (endAngle - startAngle < 1e-6) return null;

  return { ...ellipse, startAngle, endAngle };
}

export interface PolygonGeometry {
  center: { x: number; y: number };
  radius: number;
  sides: number;
  rotation: number;
  vertices: { x: number; y: number }[];
}

/** Regular polygon with one vertex at `vertex` and centre `center`. */
export function polygonGeometry(
  center: { x: number; y: number },
  vertex: { x: number; y: number },
  sides: number,
): PolygonGeometry | null {
  const count = Math.max(3, Math.min(64, Math.round(sides)));
  const radius = Math.hypot(vertex.x - center.x, vertex.y - center.y);
  if (radius < 1e-10) return null;

  const rotation = Math.atan2(vertex.y - center.y, vertex.x - center.x);
  const vertices = Array.from({ length: count }, (_, i) => {
    const angle = rotation + (i * Math.PI * 2) / count;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });

  return { center, radius, sides: count, rotation, vertices };
}
