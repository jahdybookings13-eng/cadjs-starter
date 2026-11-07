import * as THREE from "three";
import type { NodeId } from "../scene-operations/types";

// Sketch plane types
export type SketchPlaneType = "XY" | "XZ" | "YZ" | "offset" | "face";

export interface SketchPlane {
  type: SketchPlaneType;
  origin: THREE.Vector3;
  normal: THREE.Vector3;
  xAxis: THREE.Vector3;
  yAxis: THREE.Vector3;
  offset?: number | undefined;
  sourceElementId?: NodeId | undefined;
}

// Primitive types for planegcs compatibility
export type SketchPrimitiveType =
  | "point"
  | "line"
  | "circle"
  | "arc"
  | "ellipse"
  | "ellipticalArc"
  | "spline"
  | "bezier"
  | "conic"
  | "hatch";

/** Metadata shared by every drawable sketch entity. */
export interface SketchEntityMeta {
  /** Layer assignment. Missing means the sketch's default layer. */
  layerId?: string | undefined;
  /** Lines created by one polyline command share this id. */
  polylineId?: string | undefined;
  /** Block instance membership, used for group selection and explode. */
  blockInstanceId?: string | undefined;
  blockDefinitionId?: string | undefined;
  /** Outer-to-inner instance chain for nested blocks. */
  blockInstancePath?: string[] | undefined;
}

export type SketchLineType = "continuous" | "dashed" | "dotted" | "center";

export interface SketchLayer {
  id: string;
  name: string;
  /** CSS hex colour, e.g. #7dd3fc. */
  color: string;
  visible: boolean;
  linetype: SketchLineType;
}

/** A named, reusable snapshot of sketch geometry. */
export interface SketchBlockDefinition {
  id: string;
  name: string;
  primitives: SketchPrimitive[];
  constraints: SketchConstraint[];
}

export type HatchPattern = "solid" | "lines" | "cross";

export interface SketchHatch {
  id: string;
  type: "hatch";
  /** Ordered line ids that form the closed boundary. */
  boundaryIds: string[];
  pattern: HatchPattern;
  spacing: number;
  angle: number;
  construction?: boolean | undefined;
  layerId?: string | undefined;
  blockInstanceId?: string | undefined;
  blockDefinitionId?: string | undefined;
  blockInstancePath?: string[] | undefined;
}

export interface SketchIncludeSource {
  nodeId: string;
  kind: "edge" | "point";
  /** Offset from the source element's position at include time. */
  offset: { x: number; y: number; z: number };
}

export interface SketchPoint {
  id: string;
  type: "point";
  x: number;
  y: number;
  fixed?: boolean | undefined;
  origin?: boolean | undefined; // Origin construction geometry, undeletable, excluded from BRep
  includeSource?: SketchIncludeSource | undefined;
}

export interface SketchLine {
  id: string;
  type: "line";
  p1Id: string; // Reference to point
  p2Id: string;
  construction?: boolean | undefined; // Construction line (orange dashed, excluded from BRep)
  origin?: boolean | undefined; // Origin axis line, undeletable, excluded from BRep, solid colored rendering
  includeSource?: SketchIncludeSource | undefined;
}

export interface SketchCircle {
  id: string;
  type: "circle";
  centerId: string; // Reference to center point
  radius: number;
  construction?: boolean | undefined; // Construction circle
}

export interface SketchArc {
  id: string;
  type: "arc";
  centerId: string;
  startId: string;
  endId: string;
  radius: number;
  construction?: boolean | undefined; // Construction arc
}

export interface SketchEllipse {
  id: string;
  type: "ellipse";
  centerId: string;
  majorRadius: number;
  minorRadius: number;
  /** Major-axis direction in radians, measured from the sketch +X axis. */
  rotation: number;
  construction?: boolean | undefined; // Construction ellipse
}

export interface SketchEllipticalArc {
  id: string;
  type: "ellipticalArc";
  centerId: string;
  majorRadius: number;
  minorRadius: number;
  rotation: number;
  /** Parameter on the ellipse, not the geometric polar angle. */
  startAngle: number;
  endAngle: number;
  construction?: boolean | undefined;
}

export interface SketchSpline {
  id: string;
  type: "spline";
  /** Points the interpolated spline passes through, in order. */
  pointIds: string[];
  /** Raw Catmull-Rom parameter range. Defaults to the full spline. */
  startT?: number | undefined;
  endT?: number | undefined;
  /** Explicit visible endpoints for a split range. */
  startId?: string | undefined;
  endId?: string | undefined;
  construction?: boolean | undefined;
}

/** Cubic Bezier defined by four control points (start, two controls, end). */
export interface SketchBezier {
  id: string;
  type: "bezier";
  pointIds: string[];
  construction?: boolean | undefined;
}

/** Rational quadratic conic: start/end interpolated, control point pulls the curve. */
export interface SketchConic {
  id: string;
  type: "conic";
  startId: string;
  controlId: string;
  endId: string;
  rho: number;
  /** Homogeneous endpoint weights. Default 1 for a standard conic. */
  startWeight?: number | undefined;
  endWeight?: number | undefined;
  construction?: boolean | undefined;
}

export type SketchPrimitive = (
  | SketchPoint
  | SketchLine
  | SketchCircle
  | SketchArc
  | SketchEllipse
  | SketchEllipticalArc
  | SketchSpline
  | SketchBezier
  | SketchConic
  | SketchHatch
) &
  SketchEntityMeta;

/** True when `p` is a Line/Circle/Arc carrying the `construction` flag set. */
export function isConstructionPrimitive(
  p: SketchPrimitive | undefined,
): boolean {
  return !!p && p.type !== "point" && !!p.construction;
}

// Constraint types matching planegcs API
export type GeometricConstraintType =
  | "coincident"
  | "horizontal"
  | "vertical"
  | "parallel"
  | "perpendicular"
  | "tangent"
  | "equal"
  | "concentric"
  | "pointOnLine"
  | "pointOnCircle"
  | "midpoint"
  | "symmetric";

export type DimensionalConstraintType =
  | "distance"
  | "distanceX"
  | "distanceY"
  | "angle"
  | "radius"
  | "diameter";

export type ConstraintType =
  | GeometricConstraintType
  | DimensionalConstraintType;

/** Fields common to both {@link GeometricConstraint} and {@link DimensionalConstraint}. */
export interface SketchConstraintBase {
  id: string;
  primitiveIds: string[];
  driving?: boolean | undefined; // True = driving constraint, false = reference/driven
  labelOffset?: { x: number; y: number } | undefined; // User-dragged label offset in sketch 2D coords
}

export interface GeometricConstraint extends SketchConstraintBase {
  type: GeometricConstraintType;
}

export interface DimensionalConstraint extends SketchConstraintBase {
  type: DimensionalConstraintType;
  /** Required for dimensional constraints, the value is what the constraint enforces. */
  value: number;
  /** Original expression (for example `width / 2` or `10 mm`). */
  expression?: string | undefined;
  /** Optional inclusive lower limit in the constraint's native units. */
  min?: number | undefined;
  /** Optional inclusive upper limit in the constraint's native units. */
  max?: number | undefined;
}

export type SketchConstraint = GeometricConstraint | DimensionalConstraint;

const DIMENSIONAL_TYPES: ReadonlySet<ConstraintType> = new Set<ConstraintType>([
  "distance",
  "distanceX",
  "distanceY",
  "angle",
  "radius",
  "diameter",
]);

export function isDimensionalConstraintType(
  t: ConstraintType,
): t is DimensionalConstraintType {
  return DIMENSIONAL_TYPES.has(t);
}

export function isDimensionalConstraint(
  c: SketchConstraint,
): c is DimensionalConstraint {
  return isDimensionalConstraintType(c.type);
}

export function isGeometricConstraint(
  c: SketchConstraint,
): c is GeometricConstraint {
  return !isDimensionalConstraint(c);
}

/**
 * Build a SketchConstraint of the right shape for its type. Dimensional
 * types require `value`; geometric types ignore it. Throws if a dimensional
 * type is passed without a value (a programmer error, UI flows must collect
 * the value before calling).
 */
export function makeSketchConstraint(
  id: string,
  type: ConstraintType,
  primitiveIds: string[],
  value: number | undefined,
  driving: boolean = true,
): SketchConstraint {
  if (isDimensionalConstraintType(type)) {
    if (value === undefined) {
      throw new Error(`Dimensional constraint "${type}" requires a value`);
    }
    return { id, type, primitiveIds, value, driving };
  }
  return { id, type, primitiveIds, driving };
}

// Sketch status
export type SketchStatus =
  | "underconstrained"
  | "fully_constrained"
  | "overconstrained";

export interface SketchImageUnderlay {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number | undefined;
}

// Main Sketch interface
export interface Sketch {
  id: string;
  plane: SketchPlane;
  primitives: SketchPrimitive[];
  constraints: SketchConstraint[];
  /** Sketch-local named values usable in dimension expressions. */
  variables?: Record<string, number> | undefined;
  /** Named layer table. Missing on older documents; use the default layer. */
  layers?: SketchLayer[] | undefined;
  /** Reusable block definitions; instances live on primitive metadata. */
  blocks?: SketchBlockDefinition[] | undefined;
  /**
   * Degrees of freedom remaining after constraint solving.
   * `0` ⇒ fully constrained; `> 0` ⇒ underconstrained; `< 0` ⇒ overconstrained.
   * Drives the `status` discriminator above.
   */
  dof: number;
  status: SketchStatus;
  imageUnderlays?: SketchImageUnderlay[] | undefined;
}

// Solve result
export interface SolveResult {
  success: boolean;
  sketch: Sketch; // Updated with solved positions
  /** Same semantics as {@link Sketch.dof}, see field doc above. */
  dof: number;
  status: SketchStatus;
  redundantConstraintIds?: string[] | undefined;
  conflictingConstraintIds?: string[] | undefined;
}

// Result of adding a constraint and solving
export type ConstraintResultStatus =
  | "applied"
  | "redundant"
  | "conflicting"
  | "failed";

export interface ConstraintResult {
  sketch: Sketch | null;
  status: ConstraintResultStatus;
  /** Constraint ids named by the solver when a constraint is rolled back. */
  constraintIds?: string[];
}

// Helper function to create default sketch planes
export function createSketchPlane(
  type: SketchPlaneType,
  origin: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
): SketchPlane {
  switch (type) {
    case "XY":
      return {
        type,
        origin: origin.clone(),
        normal: new THREE.Vector3(0, 0, 1),
        xAxis: new THREE.Vector3(1, 0, 0),
        yAxis: new THREE.Vector3(0, 1, 0),
      };
    case "XZ":
      return {
        type,
        origin: origin.clone(),
        normal: new THREE.Vector3(0, 1, 0),
        xAxis: new THREE.Vector3(1, 0, 0),
        yAxis: new THREE.Vector3(0, 0, 1),
      };
    case "YZ":
      return {
        type,
        origin: origin.clone(),
        normal: new THREE.Vector3(1, 0, 0),
        xAxis: new THREE.Vector3(0, 1, 0),
        yAxis: new THREE.Vector3(0, 0, 1),
      };
    default:
      // For "offset" and "face" types, default to XY plane
      return {
        type,
        origin: origin.clone(),
        normal: new THREE.Vector3(0, 0, 1),
        xAxis: new THREE.Vector3(1, 0, 0),
        yAxis: new THREE.Vector3(0, 1, 0),
      };
  }
}

// Create a sketch plane from an arbitrary normal and origin
export function createSketchPlaneFromNormal(
  normal: THREE.Vector3,
  origin: THREE.Vector3,
  sourceElementId?: NodeId,
): SketchPlane {
  const n = normal.clone().normalize();
  // Compute xAxis using "least-aligned world axis" technique
  const worldY = new THREE.Vector3(0, 1, 0);
  const worldX = new THREE.Vector3(1, 0, 0);
  // If normal is nearly parallel to Y, use X as reference
  const ref = Math.abs(n.dot(worldY)) > 0.9 ? worldX : worldY;
  const xAxis = new THREE.Vector3().crossVectors(ref, n).normalize();
  const yAxis = new THREE.Vector3().crossVectors(n, xAxis).normalize();

  return {
    type: sourceElementId ? "face" : "offset",
    origin: origin.clone(),
    normal: n,
    xAxis,
    yAxis,
    sourceElementId,
  };
}

// Type guards
export function isSketchPoint(
  primitive: SketchPrimitive,
): primitive is SketchPoint {
  return primitive.type === "point";
}

export function isSketchLine(
  primitive: SketchPrimitive,
): primitive is SketchLine {
  return primitive.type === "line";
}

export function isSketchCircle(
  primitive: SketchPrimitive,
): primitive is SketchCircle {
  return primitive.type === "circle";
}

export function isSketchArc(
  primitive: SketchPrimitive,
): primitive is SketchArc {
  return primitive.type === "arc";
}

export function isSketchEllipse(
  primitive: SketchPrimitive,
): primitive is SketchEllipse {
  return primitive.type === "ellipse";
}

export function isSketchEllipticalArc(
  primitive: SketchPrimitive,
): primitive is SketchEllipticalArc {
  return primitive.type === "ellipticalArc";
}

export function isSketchSpline(
  primitive: SketchPrimitive,
): primitive is SketchSpline {
  return primitive.type === "spline";
}

export function isSketchBezier(
  primitive: SketchPrimitive,
): primitive is SketchBezier {
  return primitive.type === "bezier";
}

export function isSketchConic(
  primitive: SketchPrimitive,
): primitive is SketchConic {
  return primitive.type === "conic";
}

export function isSketchHatch(
  primitive: SketchPrimitive,
): primitive is SketchHatch {
  return primitive.type === "hatch";
}

// Lookup helpers, narrow `Array.find` result through the type guard.
// Without these the call site needs `as SketchX | undefined` because TS
// cannot follow the `&& isSketchX(p)` narrowing through `Array.find`.

export function findSketchPoint(
  primitives: readonly SketchPrimitive[],
  id: string,
): SketchPoint | undefined {
  const p = primitives.find((x) => x.id === id);
  return p && isSketchPoint(p) ? p : undefined;
}

export function findSketchLine(
  primitives: readonly SketchPrimitive[],
  id: string,
): SketchLine | undefined {
  const p = primitives.find((x) => x.id === id);
  return p && isSketchLine(p) ? p : undefined;
}

export function findSketchCircle(
  primitives: readonly SketchPrimitive[],
  id: string,
): SketchCircle | undefined {
  const p = primitives.find((x) => x.id === id);
  return p && isSketchCircle(p) ? p : undefined;
}

export function findSketchArc(
  primitives: readonly SketchPrimitive[],
  id: string,
): SketchArc | undefined {
  const p = primitives.find((x) => x.id === id);
  return p && isSketchArc(p) ? p : undefined;
}

export function findSketchEllipse(
  primitives: readonly SketchPrimitive[],
  id: string,
): SketchEllipse | undefined {
  const p = primitives.find((x) => x.id === id);
  return p && isSketchEllipse(p) ? p : undefined;
}

export function findSketchEllipticalArc(
  primitives: readonly SketchPrimitive[],
  id: string,
): SketchEllipticalArc | undefined {
  const p = primitives.find((x) => x.id === id);
  return p && isSketchEllipticalArc(p) ? p : undefined;
}

export function findSketchSpline(
  primitives: readonly SketchPrimitive[],
  id: string,
): SketchSpline | undefined {
  const p = primitives.find((x) => x.id === id);
  return p && isSketchSpline(p) ? p : undefined;
}

export function findSketchBezier(
  primitives: readonly SketchPrimitive[],
  id: string,
): SketchBezier | undefined {
  const p = primitives.find((x) => x.id === id);
  return p && isSketchBezier(p) ? p : undefined;
}

export function findSketchConic(
  primitives: readonly SketchPrimitive[],
  id: string,
): SketchConic | undefined {
  const p = primitives.find((x) => x.id === id);
  return p && isSketchConic(p) ? p : undefined;
}

/**
 * Result of converting a sketch to multiple profiles.
 */
export interface SketchConversionResult {
  profiles: Array<{
    id: string;
    brep: import("../geometry").Brep; // Centered at origin (local space)
    area: number;
    isOuter: boolean;
    center: { x: number; y: number; z: number }; // World position of the profile center
    occBrep?: string | undefined; // Serialized analytic OCC face in LOCAL space (centered)
  }>;
  success: boolean;
}

/**
 * Operation types for feature tree nodes.
 */
export type BuiltInOperationType =
  | "union"
  | "difference"
  | "intersection"
  | "extrude"
  | "fillet"
  | "chamfer"
  | "sweep"
  | "loft"
  | "revolve";

// Open union: consumers can use custom operation type strings on feature-tree
// nodes; pair with `iconForType` / `labelForType` props on the starter's
// FeatureTree to render them.
export type OperationType = BuiltInOperationType | (string & {});

/**
 * Feature tree node types for hierarchical display.
 */
export type FeatureNodeType =
  | "sketch"
  | "profile"
  | "body"
  | "folder"
  | "operation";

/**
 * A node in the feature tree hierarchy.
 * Used to display sketches, profiles, and bodies in a tree view.
 */
export interface FeatureNode {
  id: string;
  type: FeatureNodeType;
  name: string;
  visible: boolean;
  expanded?: boolean | undefined;
  children?: FeatureNode[] | undefined;
  sourceSketchId?: string | undefined; // For profiles/bodies: which sketch they came from
  elementId?: NodeId | undefined; // Link to SceneElement.nodeId for bodies
  profileId?: string | undefined; // For bodies: which profile they came from
  operationType?: OperationType | undefined; // For operation nodes: which operation type
}

export type BrowserSectionType = "origin" | "bodies" | "sketches";
export type BrowserItemType =
  | "body"
  | "sketch"
  | "profile"
  | "operation"
  | "plane"
  | "axis"
  | "origin-point";

export interface BrowserSection {
  id: string;
  label: string;
  sectionType: BrowserSectionType;
  expanded: boolean;
  count: number;
  items: BrowserItem[];
}

export interface BrowserItem {
  id: string;
  label: string;
  itemType: BrowserItemType;
  visible: boolean;
  expanded?: boolean | undefined;
  elementId?: NodeId | undefined;
  // Back-reference for browser→tree navigation; can be a feature-tree id
  // (`FeatureNode.id`) or a static origin string ("origin-xy"). Not a NodeId.
  sourceNodeId?: string | undefined;
  children?: BrowserItem[] | undefined;
  operationType?: OperationType | undefined;
}
