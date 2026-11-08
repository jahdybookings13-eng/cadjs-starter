// Drawing sheet model, SVG renderer, and vector export writers.
//
// The sheet is built from tessellated Part Studio geometry. Edges are projected
// orthographically, then hidden-line removal uses the projected face triangles
// as occluders. Section views intersect the same triangles with an axis-aligned
// cutting plane. Native PDF, DXF and DWG writers consume the same projected
// layout so exports match the on-screen sheet.

import type { BomRow } from "../assemblies/bom";
import {
  parseContextSketches,
  type ContextSketchDocument,
} from "../model/contextSketch";

export type SheetSize = "A0" | "A1" | "A2" | "A3" | "A4";
export type DrawingProjectionAngle = "third" | "first";
export type SheetOrientation = "landscape" | "portrait";
export type DrawingProjection = "front" | "top" | "right" | "iso";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SectionSpec {
  axis: "x" | "y" | "z";
  offset: number;
  /** Which side of the cut is kept for the section view. */
  direction?: 1 | -1;
  /** How far behind the cutting plane to include geometry, in millimetres. */
  depth?: number;
  hatchAngle?: number;
  hatchSpacing?: number;
}

export interface DetailViewSpec {
  label: string;
  parent: DrawingProjection;
  centerX: number;
  centerY: number;
  radius: number;
  scale: number;
}

export interface AuxiliaryViewSpec {
  label: string;
  /** Projection direction in model space. */
  direction: Vec3;
}

export interface BrokenOutViewSpec extends DetailViewSpec {}
export type SheetTemplate = "NONE" | "ISO" | "ANSI" | "CUSTOM";
export type TitleBlockVariant = "standard" | "compact" | "detailed";
export type PlotStyle = "color" | "monochrome";
export type DrawingViewAlignment = "left" | "right" | "above" | "below";

/** A user-defined paper size. Width and height are sheet millimetres. */
export interface SheetFormat {
  name: string;
  width: number;
  height: number;
  margin?: number;
}

/** Per-view placement, scale, naming, suppression and lock state. */
export interface DrawingViewConfig {
  label?: string;
  suppressed?: boolean;
  locked?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  scale?: number;
  /** Align this view against a parent view on the sheet. */
  parent?: DrawingViewId;
  alignment?: DrawingViewAlignment;
}

export interface DimensionTolerance {
  type: "none" | "symmetric" | "limits" | "fit";
  upper?: number;
  lower?: number;
  /** ISO fit designation, e.g. H7/g6. */
  fit?: string;
}

export interface DrawingCustomView {
  id: string;
  label: string;
  /** Projection direction in model space. */
  direction: Vec3;
  scale?: number;
}

export interface DrawingSheet {
  size: SheetSize;
  orientation: SheetOrientation;
  /** First-angle flips the top/right view placement; third-angle is default. */
  projectionAngle?: DrawingProjectionAngle;
  title: string;
  number: string;
  scale: string;
  showBom: boolean;
  showHiddenLines: boolean;
  /** Border template; zones are drawn when enabled. */
  template?: SheetTemplate;
  /** Custom paper size; when set it overrides A4/A3. */
  format?: SheetFormat | null;
  titleBlock?: TitleBlockVariant;
  revision?: string;
  date?: string;
  drawnBy?: string;
  checkedBy?: string;
  approvedBy?: string;
  material?: string;
  finish?: string;
  weight?: string;
  /** Numeric sheet scale factor (drawing mm / model mm). AUTO leaves it unset. */
  scaleValue?: number;
  /** Per-view numeric scale overrides. */
  viewScales?: Partial<Record<DrawingViewId, number>>;
  viewConfig?: Partial<Record<DrawingViewId, DrawingViewConfig>>;
  /** Named views projected along arbitrary model-space directions. */
  customViews?: DrawingCustomView[];
  plotStyle?: PlotStyle;
  /** Plotted line weight in millimetres. */
  lineWeight?: number;
  /** Exploded-view offset in model millimetres; absent/0 uses the placed assembly. */
  explode?: number;
  showZones?: boolean;
  section: SectionSpec | null;
  detail: DetailViewSpec | null;
  auxiliary: AuxiliaryViewSpec | null;
  /** Circular broken-out view of a parent projection. */
  brokenOut?: BrokenOutViewSpec | null;
}

export const GDT_CHARACTERISTICS = [
  "flatness",
  "straightness",
  "circularity",
  "cylindricity",
  "position",
  "concentricity",
  "perpendicularity",
  "parallelism",
  "angularity",
  "profile",
  "runout",
] as const;

export type GdtCharacteristic = (typeof GDT_CHARACTERISTICS)[number];

export interface DrawingGdt {
  id: string;
  sheet: number;
  type: "feature-control" | "datum" | "surface-finish" | "weld";
  x: number;
  y: number;
  characteristic?: GdtCharacteristic;
  tolerance?: number;
  diameter?: boolean;
  datums?: string[];
  datum?: string;
  ra?: number;
  /** Attach the annotation to a body in the projected view. */
  bodyId?: string;
  weldType?: "fillet" | "groove" | "plug" | "spot" | "seam";
  weldSize?: number;
  weldLength?: number;
  weldPitch?: number;
  allAround?: boolean;
}

export interface DrawingNote {
  id: string;
  sheet: number;
  text: string;
  x: number;
  y: number;
  textSize?: number;
  leader?: boolean;
  landing?: number;
}

export interface DrawingBalloon {
  id: string;
  sheet: number;
  label: string;
  x: number;
  y: number;
  /** When set, the balloon is placed from this body's projected geometry. */
  bodyId?: string;
  /** BOM row key this balloon calls out, when known. */
  bomKey?: string;
  textSize?: number;
  leader?: boolean;
  landing?: number;
}

export type DrawingViewId =
  | DrawingProjection
  | "section"
  | "detail"
  | "auxiliary"
  | "broken-out";

export type DrawingDimensionKind =
  | "linear"
  | "ordinate"
  | "angular"
  | "radius"
  | "diameter";

export interface DrawingDimension {
  id: string;
  sheet: number;
  view: DrawingViewId;
  /** When set, the measurement follows this body inside the view. */
  bodyId?: string;
  /** Edge index within the body; absent means the body's projected bounds. */
  edgeIndex?: number;
  /** Stable topology key for the primary anchor. */
  anchorId?: string;
  /** Stable topology key for the second edge of an angular dimension. */
  secondAnchorId?: string;
  secondEdgeIndex?: number;
  /** Projected-circle index for radius and diameter dimensions. */
  circleIndex?: number;
  axis: "horizontal" | "vertical";
  kind?: DrawingDimensionKind;
  tolerance?: DimensionTolerance;
  /** Sheet-space offset from the view edge, in millimetres. */
  offset?: number;
  textSize?: number;
  leader?: boolean;
  landing?: number;
}

export type DrawingBomColumn =
  | "item"
  | "number"
  | "name"
  | "description"
  | "qty"
  | "material"
  | "revision"
  | "vendor";

export interface DrawingBomSettings {
  columns?: DrawingBomColumn[];
  /** Row keys in drawing order. Rows not listed keep BOM order after these. */
  rowOrder?: string[];
  /** Per-BOM-row drawing edits, keyed by `BomRow.key`. */
  overrides?: Record<
    string,
    Partial<
      Pick<
        BomRow,
        | "item"
        | "number"
        | "name"
        | "description"
        | "qty"
        | "materialId"
        | "revision"
        | "vendor"
      >
    >
  >;
}

export interface DrawingTabData {
  v: 1;
  kind: "drawing";
  sourceTabId: string;
  assemblyTabId: string | null;
  sheet: DrawingSheet;
  /** Optional multi-sheet list. `sheet` mirrors the active entry. */
  sheets?: DrawingSheet[];
  activeSheet?: number;
  notes: DrawingNote[];
  balloons: DrawingBalloon[];
  /** Optional for backward compatibility with drawings made before GD&T. */
  gdt?: DrawingGdt[];
  /** Optional body-linked dimensions. */
  dimensions?: DrawingDimension[];
  /** Drawing-time BOM column, order and row overrides. */
  bom?: DrawingBomSettings;
  /** Fingerprint of the source geometry/BOM the drawing was last updated to. */
  sourceSignature?: string;
  sourceUpdatedAt?: number;
  /** Sketches authored in the drawing context against the source bodies. */
  contextSketches?: ContextSketchDocument[];
}

export interface DrawingCircle {
  id?: string;
  center: Vec3;
  radius: number;
  /** Circle plane normal, used to avoid drawing edge-on ellipses as circles. */
  normal?: Vec3;
}

export interface DrawingBody {
  id: string;
  name: string;
  partNumber: string;
  materialId: string | null;
  bomKey?: string;
  edges: Array<[Vec3, Vec3]>;
  /** Stable edge IDs supplied by the source; fall back to a geometric hash. */
  edgeKeys?: string[];
  faces?: Array<[Vec3, Vec3, Vec3]>;
  /** Optional analytic circles used by radius/diameter dimensions. */
  circles?: DrawingCircle[];
}

/**
 * Recover circular rims from the tessellated edge loops. CAD BReps commonly
 * carry holes/bores as many short straight segments; a closed degree-2 loop
 * whose vertices are coplanar and equidistant from its centroid is a circle.
 * This is what lets live drawing bodies offer radius/diameter dimensions.
 */
export function circlesFromEdgeLoops(
  edges: ReadonlyArray<readonly [Vec3, Vec3]>,
  minSegments = 6,
): DrawingCircle[] {
  const keyOf = (point: Vec3) =>
    `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
  const points = new Map<string, Vec3>();
  const adjacency = new Map<string, Set<string>>();
  const link = (key: string, other: string) => {
    const current = adjacency.get(key) ?? new Set<string>();
    current.add(other);
    adjacency.set(key, current);
  };
  for (const [a, b] of edges) {
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (ka === kb) continue;
    points.set(ka, a);
    points.set(kb, b);
    link(ka, kb);
    link(kb, ka);
  }

  const seen = new Set<string>();
  const out: DrawingCircle[] = [];
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    if (adjacency.get(start)?.size !== 2) {
      seen.add(start);
      continue;
    }
    const loop: Vec3[] = [];
    let previous: string | null = null;
    let current = start;
    let closed = false;
    for (let guard = 0; guard < 4096; guard++) {
      const point = points.get(current);
      if (!point) break;
      loop.push(point);
      seen.add(current);
      const next = [...(adjacency.get(current) ?? [])].find(
        (candidate) => candidate !== previous,
      );
      if (!next) break;
      previous = current;
      current = next;
      if (current === start) {
        closed = true;
        break;
      }
    }
    if (!closed || loop.length < minSegments) continue;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      nx += (a.y - b.y) * (a.z + b.z);
      ny += (a.z - b.z) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
    }
    const normalLength = Math.hypot(nx, ny, nz);
    if (normalLength < 1e-9) continue;
    nx /= normalLength;
    ny /= normalLength;
    nz /= normalLength;
    const center = loop.reduce(
      (sum, point) => ({
        x: sum.x + point.x / loop.length,
        y: sum.y + point.y / loop.length,
        z: sum.z + point.z / loop.length,
      }),
      { x: 0, y: 0, z: 0 },
    );
    const radii = loop.map((point) =>
      Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z),
    );
    const radius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
    if (!(radius > 1e-6)) continue;
    const tolerance = Math.max(0.01, radius * 0.03);
    if (radii.some((value) => Math.abs(value - radius) > tolerance)) continue;
    const planeTolerance = Math.max(0.001, radius * 0.01);
    if (
      loop.some(
        (point) =>
          Math.abs(
            (point.x - center.x) * nx +
              (point.y - center.y) * ny +
              (point.z - center.z) * nz,
          ) > planeTolerance,
      )
    )
      continue;
    if (
      out.some(
        (circle) =>
          Math.hypot(
            circle.center.x - center.x,
            circle.center.y - center.y,
            circle.center.z - center.z,
          ) < 0.01 && Math.abs(circle.radius - radius) < 0.01,
      )
    )
      continue;
    out.push({
      id: `circle_${out.length + 1}`,
      center,
      radius,
      normal: { x: nx, y: ny, z: nz },
    });
  }
  return out;
}

export function defaultDrawingSheet(): DrawingSheet {
  return {
    size: "A4",
    orientation: "landscape",
    projectionAngle: "third",
    title: "DRAWING",
    number: "DWG-001",
    scale: "AUTO",
    showBom: true,
    showHiddenLines: false,
    template: "ISO",
    format: null,
    titleBlock: "standard",
    revision: "A",
    date: "",
    drawnBy: "",
    checkedBy: "",
    approvedBy: "",
    material: "",
    finish: "",
    weight: "",
    viewScales: {},
    viewConfig: {},
    customViews: [],
    plotStyle: "color",
    lineWeight: 0.35,
    showZones: false,
    section: null,
    detail: null,
    auxiliary: null,
    brokenOut: null,
  };
}

export function emptyDrawingTab(
  sourceTabId: string,
  assemblyTabId: string | null,
): DrawingTabData {
  return {
    v: 1,
    kind: "drawing",
    sourceTabId,
    assemblyTabId,
    sheet: defaultDrawingSheet(),
    notes: [],
    balloons: [],
  };
}

export function serializeDrawingTab(data: DrawingTabData): string {
  return JSON.stringify(data);
}

function parseSheet(raw: Partial<DrawingSheet>): DrawingSheet {
  const section =
    raw.section &&
    (raw.section.axis === "x" ||
      raw.section.axis === "y" ||
      raw.section.axis === "z") &&
    Number.isFinite(raw.section.offset)
      ? {
          axis: raw.section.axis,
          offset: raw.section.offset,
          ...(raw.section.direction === -1
            ? { direction: -1 as const }
            : raw.section.direction === 1
              ? { direction: 1 as const }
              : {}),
          ...(Number.isFinite(raw.section.depth)
            ? { depth: Math.max(0, Number(raw.section.depth)) }
            : {}),
          ...(Number.isFinite(raw.section.hatchAngle)
            ? { hatchAngle: Number(raw.section.hatchAngle) }
            : {}),
          ...(Number.isFinite(raw.section.hatchSpacing)
            ? { hatchSpacing: Math.max(0.5, Number(raw.section.hatchSpacing)) }
            : {}),
        }
      : null;
  const parent: DrawingProjection =
    raw.detail?.parent === "top" ||
    raw.detail?.parent === "right" ||
    raw.detail?.parent === "iso"
      ? raw.detail.parent
      : "front";
  const detail =
    raw.detail &&
    Number.isFinite(raw.detail.centerX) &&
    Number.isFinite(raw.detail.centerY) &&
    Number.isFinite(raw.detail.radius) &&
    Number(raw.detail.radius) > 0
      ? {
          label:
            typeof raw.detail.label === "string" && raw.detail.label.trim()
              ? raw.detail.label
              : "DETAIL A",
          parent,
          centerX: Number(raw.detail.centerX),
          centerY: Number(raw.detail.centerY),
          radius: Math.max(0.01, Number(raw.detail.radius)),
          scale: Number.isFinite(raw.detail.scale)
            ? Math.max(0.1, Number(raw.detail.scale))
            : 2,
        }
      : null;
  const brokenParent: DrawingProjection =
    raw.brokenOut?.parent === "top" ||
    raw.brokenOut?.parent === "right" ||
    raw.brokenOut?.parent === "iso"
      ? raw.brokenOut.parent
      : "front";
  const brokenOut =
    raw.brokenOut &&
    Number.isFinite(raw.brokenOut.centerX) &&
    Number.isFinite(raw.brokenOut.centerY) &&
    Number.isFinite(raw.brokenOut.radius) &&
    Number(raw.brokenOut.radius) > 0
      ? {
          label:
            typeof raw.brokenOut.label === "string" &&
            raw.brokenOut.label.trim()
              ? raw.brokenOut.label
              : "BROKEN OUT",
          parent: brokenParent,
          centerX: Number(raw.brokenOut.centerX),
          centerY: Number(raw.brokenOut.centerY),
          radius: Math.max(0.01, Number(raw.brokenOut.radius)),
          scale: Number.isFinite(raw.brokenOut.scale)
            ? Math.max(0.1, Number(raw.brokenOut.scale))
            : 2,
        }
      : null;
  const direction = raw.auxiliary?.direction;
  const auxiliary =
    raw.auxiliary &&
    direction &&
    Number.isFinite(direction.x) &&
    Number.isFinite(direction.y) &&
    Number.isFinite(direction.z) &&
    Math.hypot(direction.x, direction.y, direction.z) > 1e-9
      ? {
          label:
            typeof raw.auxiliary.label === "string" &&
            raw.auxiliary.label.trim()
              ? raw.auxiliary.label
              : "AUXILIARY",
          direction: {
            x: Number(direction.x),
            y: Number(direction.y),
            z: Number(direction.z),
          },
        }
      : null;
  const format =
    raw.format &&
    typeof raw.format.name === "string" &&
    Number.isFinite(raw.format.width) &&
    Number.isFinite(raw.format.height) &&
    Number(raw.format.width) > 0 &&
    Number(raw.format.height) > 0
      ? {
          name: raw.format.name.trim() || "CUSTOM",
          width: Math.min(2000, Math.max(10, Number(raw.format.width))),
          height: Math.min(2000, Math.max(10, Number(raw.format.height))),
          ...(Number.isFinite(raw.format.margin)
            ? { margin: Math.max(0, Number(raw.format.margin)) }
            : {}),
        }
      : null;
  const viewIds: DrawingViewId[] = [
    "front",
    "top",
    "right",
    "iso",
    "section",
    "detail",
    "auxiliary",
    "broken-out",
  ];
  const viewScales: Partial<Record<DrawingViewId, number>> = {};
  if (raw.viewScales && typeof raw.viewScales === "object")
    for (const id of viewIds) {
      const value = raw.viewScales[id];
      if (Number.isFinite(value) && Number(value) > 0)
        viewScales[id] = Number(value);
    }
  const viewConfig: Partial<Record<DrawingViewId, DrawingViewConfig>> = {};
  if (raw.viewConfig && typeof raw.viewConfig === "object")
    for (const id of viewIds) {
      const value = raw.viewConfig[id];
      if (!value || typeof value !== "object") continue;
      const config: DrawingViewConfig = {
        ...(typeof value.label === "string" && value.label.trim()
          ? { label: value.label }
          : {}),
        ...(value.suppressed === true ? { suppressed: true } : {}),
        ...(value.locked === true ? { locked: true } : {}),
        ...(Number.isFinite(value.x) ? { x: Number(value.x) } : {}),
        ...(Number.isFinite(value.y) ? { y: Number(value.y) } : {}),
        ...(Number.isFinite(value.w) && Number(value.w) > 0
          ? { w: Number(value.w) }
          : {}),
        ...(Number.isFinite(value.h) && Number(value.h) > 0
          ? { h: Number(value.h) }
          : {}),
        ...(Number.isFinite(value.scale) && Number(value.scale) > 0
          ? { scale: Number(value.scale) }
          : {}),
        ...(value.parent && viewIds.includes(value.parent)
          ? { parent: value.parent }
          : {}),
        ...(value.alignment === "left" ||
        value.alignment === "right" ||
        value.alignment === "above" ||
        value.alignment === "below"
          ? { alignment: value.alignment }
          : {}),
      };
      if (Object.keys(config).length) viewConfig[id] = config;
    }
  const customViews: DrawingCustomView[] = [];
  if (Array.isArray(raw.customViews))
    for (const value of raw.customViews) {
      if (!value || !value.direction) continue;
      const direction = value.direction;
      if (
        !Number.isFinite(direction.x) ||
        !Number.isFinite(direction.y) ||
        !Number.isFinite(direction.z) ||
        Math.hypot(direction.x, direction.y, direction.z) < 1e-9
      )
        continue;
      customViews.push({
        id:
          typeof value.id === "string" && value.id.trim()
            ? value.id.trim()
            : `custom_${customViews.length + 1}`,
        label:
          typeof value.label === "string" && value.label.trim()
            ? value.label
            : `VIEW ${customViews.length + 1}`,
        direction: {
          x: Number(direction.x),
          y: Number(direction.y),
          z: Number(direction.z),
        },
        ...(Number.isFinite(value.scale) && Number(value.scale) > 0
          ? { scale: Number(value.scale) }
          : {}),
      });
    }
  return {
    size:
      raw.size === "A0" ||
      raw.size === "A1" ||
      raw.size === "A2" ||
      raw.size === "A3"
        ? raw.size
        : "A4",
    orientation: raw.orientation === "portrait" ? "portrait" : "landscape",
    projectionAngle: raw.projectionAngle === "first" ? "first" : "third",
    title:
      typeof raw.title === "string" && raw.title.trim() ? raw.title : "DRAWING",
    number:
      typeof raw.number === "string" && raw.number.trim()
        ? raw.number
        : "DWG-001",
    scale:
      typeof raw.scale === "string" && raw.scale.trim() ? raw.scale : "AUTO",
    showBom: raw.showBom !== false,
    showHiddenLines: raw.showHiddenLines === true,
    template:
      raw.template === "ANSI" ||
      raw.template === "NONE" ||
      raw.template === "CUSTOM"
        ? raw.template
        : "ISO",
    format,
    titleBlock:
      raw.titleBlock === "compact" || raw.titleBlock === "detailed"
        ? raw.titleBlock
        : "standard",
    revision: typeof raw.revision === "string" ? raw.revision : "A",
    date: typeof raw.date === "string" ? raw.date : "",
    drawnBy: typeof raw.drawnBy === "string" ? raw.drawnBy : "",
    checkedBy: typeof raw.checkedBy === "string" ? raw.checkedBy : "",
    approvedBy: typeof raw.approvedBy === "string" ? raw.approvedBy : "",
    material: typeof raw.material === "string" ? raw.material : "",
    finish: typeof raw.finish === "string" ? raw.finish : "",
    weight: typeof raw.weight === "string" ? raw.weight : "",
    ...(Number.isFinite(raw.scaleValue) && Number(raw.scaleValue) > 0
      ? { scaleValue: Number(raw.scaleValue) }
      : {}),
    viewScales,
    viewConfig,
    customViews,
    plotStyle: raw.plotStyle === "monochrome" ? "monochrome" : "color",
    lineWeight:
      Number.isFinite(raw.lineWeight) && Number(raw.lineWeight) > 0
        ? Math.min(2, Number(raw.lineWeight))
        : 0.35,
    ...(Number.isFinite(raw.explode) && Number(raw.explode) > 0
      ? { explode: Math.max(0, Number(raw.explode)) }
      : {}),
    showZones: raw.showZones === true,
    section,
    detail,
    auxiliary,
    brokenOut,
  };
}

function parseNotes(raw: unknown): DrawingNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((n) => {
    if (!n || typeof n !== "object") return [];
    const item = n as Partial<DrawingNote>;
    if (typeof item.text !== "string" || !item.text.trim()) return [];
    return [
      {
        id: typeof item.id === "string" ? item.id : `note_${item.text}`,
        sheet: Number.isFinite(item.sheet) ? Number(item.sheet) : 0,
        text: item.text,
        x: Number.isFinite(item.x) ? Number(item.x) : 12,
        y: Number.isFinite(item.y) ? Number(item.y) : 12,
        ...(Number.isFinite(item.textSize)
          ? { textSize: Math.max(1, Number(item.textSize)) }
          : {}),
        ...(item.leader === true ? { leader: true } : {}),
        ...(Number.isFinite(item.landing)
          ? { landing: Math.max(0, Number(item.landing)) }
          : {}),
      },
    ];
  });
}

function parseBalloons(raw: unknown): DrawingBalloon[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b) => {
    if (!b || typeof b !== "object") return [];
    const item = b as Partial<DrawingBalloon>;
    if (typeof item.label !== "string" || !item.label.trim()) return [];
    return [
      {
        id: typeof item.id === "string" ? item.id : `balloon_${item.label}`,
        sheet: Number.isFinite(item.sheet) ? Number(item.sheet) : 0,
        label: item.label,
        x: Number.isFinite(item.x) ? Number(item.x) : 30,
        y: Number.isFinite(item.y) ? Number(item.y) : 30,
        ...(typeof item.bodyId === "string" && item.bodyId
          ? { bodyId: item.bodyId }
          : {}),
        ...(typeof item.bomKey === "string" && item.bomKey
          ? { bomKey: item.bomKey }
          : {}),
        ...(Number.isFinite(item.textSize)
          ? { textSize: Math.max(1, Number(item.textSize)) }
          : {}),
        ...(item.leader === true ? { leader: true } : {}),
        ...(Number.isFinite(item.landing)
          ? { landing: Math.max(0, Number(item.landing)) }
          : {}),
      },
    ];
  });
}

function parseTolerance(raw: unknown): DimensionTolerance | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<DimensionTolerance>;
  if (value.type === "fit")
    return {
      type: "fit",
      ...(typeof value.fit === "string" && value.fit.trim()
        ? { fit: value.fit.trim() }
        : { fit: "H7" }),
    };
  if (value.type === "symmetric")
    return {
      type: "symmetric",
      upper: Math.abs(Number(value.upper) || 0.1),
      lower: -Math.abs(Number(value.lower) || 0.1),
    };
  if (value.type === "limits")
    return {
      type: "limits",
      upper: Math.abs(Number(value.upper) || 0.1),
      lower: -Math.abs(Number(value.lower) || 0.1),
    };
  return { type: "none" };
}

function parseDimensions(raw: unknown): DrawingDimension[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<DrawingDimension>;
    const tolerance = parseTolerance(item.tolerance);
    const view: DrawingViewId =
      item.view === "top" ||
      item.view === "right" ||
      item.view === "iso" ||
      item.view === "section" ||
      item.view === "detail" ||
      item.view === "auxiliary" ||
      item.view === "broken-out"
        ? item.view
        : "front";
    return [
      {
        id: typeof item.id === "string" ? item.id : `dim_${Math.random()}`,
        sheet: Number.isFinite(item.sheet) ? Number(item.sheet) : 0,
        view,
        ...(typeof item.bodyId === "string" && item.bodyId
          ? { bodyId: item.bodyId }
          : {}),
        ...(Number.isFinite(item.edgeIndex) && Number(item.edgeIndex) >= 0
          ? { edgeIndex: Math.floor(Number(item.edgeIndex)) }
          : {}),
        axis: item.axis === "vertical" ? "vertical" : "horizontal",
        ...(Number.isFinite(item.offset)
          ? { offset: Math.max(-40, Math.min(40, Number(item.offset))) }
          : {}),
        ...(typeof item.anchorId === "string" && item.anchorId
          ? { anchorId: item.anchorId }
          : {}),
        ...(typeof item.secondAnchorId === "string" && item.secondAnchorId
          ? { secondAnchorId: item.secondAnchorId }
          : {}),
        ...(Number.isFinite(item.secondEdgeIndex) &&
        Number(item.secondEdgeIndex) >= 0
          ? { secondEdgeIndex: Math.floor(Number(item.secondEdgeIndex)) }
          : {}),
        ...(Number.isFinite(item.circleIndex) && Number(item.circleIndex) >= 0
          ? { circleIndex: Math.floor(Number(item.circleIndex)) }
          : {}),
        ...(item.kind === "ordinate" ||
        item.kind === "angular" ||
        item.kind === "radius" ||
        item.kind === "diameter"
          ? { kind: item.kind }
          : item.kind === "linear"
            ? { kind: "linear" as const }
            : {}),
        ...(tolerance ? { tolerance } : {}),
        ...(Number.isFinite(item.textSize)
          ? { textSize: Math.max(1, Number(item.textSize)) }
          : {}),
        ...(item.leader === true ? { leader: true } : {}),
        ...(Number.isFinite(item.landing)
          ? { landing: Math.max(0, Number(item.landing)) }
          : {}),
      },
    ];
  });
}

function parseGdt(raw: unknown): DrawingGdt[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<DrawingGdt>;
    if (
      item.type !== "feature-control" &&
      item.type !== "datum" &&
      item.type !== "surface-finish" &&
      item.type !== "weld"
    )
      return [];
    const characteristic = GDT_CHARACTERISTICS.includes(
      item.characteristic as GdtCharacteristic,
    )
      ? (item.characteristic as GdtCharacteristic)
      : "flatness";
    return [
      {
        id: typeof item.id === "string" ? item.id : `gdt_${Math.random()}`,
        sheet: Number.isFinite(item.sheet) ? Number(item.sheet) : 0,
        type: item.type,
        x: Number.isFinite(item.x) ? Number(item.x) : 20,
        y: Number.isFinite(item.y) ? Number(item.y) : 20,
        ...(item.type === "feature-control"
          ? {
              characteristic,
              tolerance: Number.isFinite(item.tolerance)
                ? Math.max(0, Number(item.tolerance))
                : 0.1,
              diameter: item.diameter === true,
              datums: Array.isArray(item.datums)
                ? item.datums.filter((d): d is string => typeof d === "string")
                : [],
            }
          : {}),
        ...(item.type === "datum"
          ? { datum: typeof item.datum === "string" ? item.datum : "A" }
          : {}),
        ...(item.type === "surface-finish"
          ? {
              ra: Number.isFinite(item.ra) ? Math.max(0, Number(item.ra)) : 3.2,
            }
          : {}),
        ...(item.type === "weld"
          ? {
              weldType:
                item.weldType === "groove" ||
                item.weldType === "plug" ||
                item.weldType === "spot" ||
                item.weldType === "seam"
                  ? item.weldType
                  : "fillet",
              weldSize: Number.isFinite(item.weldSize)
                ? Math.max(0, Number(item.weldSize))
                : 3,
              ...(Number.isFinite(item.weldLength) &&
              Number(item.weldLength) > 0
                ? { weldLength: Number(item.weldLength) }
                : {}),
              ...(Number.isFinite(item.weldPitch) && Number(item.weldPitch) > 0
                ? { weldPitch: Number(item.weldPitch) }
                : {}),
              allAround: item.allAround === true,
            }
          : {}),
        ...(typeof item.bodyId === "string" && item.bodyId
          ? { bodyId: item.bodyId }
          : {}),
      },
    ];
  });
}

const DRAWING_BOM_COLUMNS: DrawingBomColumn[] = [
  "item",
  "number",
  "name",
  "description",
  "qty",
  "material",
  "revision",
  "vendor",
];

function parseBomSettings(raw: unknown): DrawingBomSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as DrawingBomSettings;
  const columns = Array.isArray(value.columns)
    ? value.columns.filter((column): column is DrawingBomColumn =>
        DRAWING_BOM_COLUMNS.includes(column as DrawingBomColumn),
      )
    : undefined;
  const rowOrder = Array.isArray(value.rowOrder)
    ? value.rowOrder.filter((key): key is string => typeof key === "string")
    : undefined;
  const overrides: NonNullable<DrawingBomSettings["overrides"]> = {};
  if (value.overrides && typeof value.overrides === "object")
    for (const [key, rawOverride] of Object.entries(value.overrides)) {
      if (!rawOverride || typeof rawOverride !== "object") continue;
      const override: NonNullable<
        NonNullable<DrawingBomSettings["overrides"]>[string]
      > = {
        ...(Number.isFinite(rawOverride.item) && Number(rawOverride.item) > 0
          ? { item: Math.floor(Number(rawOverride.item)) }
          : {}),
        ...(typeof rawOverride.number === "string"
          ? { number: rawOverride.number }
          : {}),
        ...(typeof rawOverride.name === "string"
          ? { name: rawOverride.name }
          : {}),
        ...(typeof rawOverride.description === "string"
          ? { description: rawOverride.description }
          : {}),
        ...(Number.isFinite(rawOverride.qty) && Number(rawOverride.qty) > 0
          ? { qty: Number(rawOverride.qty) }
          : {}),
        ...(typeof rawOverride.materialId === "string"
          ? { materialId: rawOverride.materialId }
          : {}),
        ...(typeof rawOverride.revision === "string"
          ? { revision: rawOverride.revision }
          : {}),
        ...(typeof rawOverride.vendor === "string"
          ? { vendor: rawOverride.vendor }
          : {}),
      };
      if (Object.keys(override).length) overrides[key] = override;
    }
  if (!columns?.length && !rowOrder?.length && !Object.keys(overrides).length)
    return undefined;
  return {
    ...(columns?.length ? { columns } : {}),
    ...(rowOrder?.length ? { rowOrder } : {}),
    ...(Object.keys(overrides).length ? { overrides } : {}),
  };
}

export function parseDrawingTab(design: string): DrawingTabData | null {
  try {
    const raw = JSON.parse(design) as Partial<DrawingTabData>;
    if (raw?.v !== 1 || raw.kind !== "drawing" || !raw.sheet) return null;
    const sheets = Array.isArray(raw.sheets)
      ? raw.sheets.map((s) => parseSheet(s))
      : undefined;
    const activeSheet = sheets?.length
      ? Math.max(
          0,
          Math.min(
            sheets.length - 1,
            Number.isFinite(raw.activeSheet) ? Number(raw.activeSheet) : 0,
          ),
        )
      : undefined;
    const sheet = parseSheet(
      sheets && activeSheet !== undefined
        ? (sheets[activeSheet] ?? sheets[0]!)
        : raw.sheet,
    );
    const bomSettings = parseBomSettings(raw.bom);
    return {
      v: 1,
      kind: "drawing",
      sourceTabId: typeof raw.sourceTabId === "string" ? raw.sourceTabId : "",
      assemblyTabId:
        typeof raw.assemblyTabId === "string" ? raw.assemblyTabId : null,
      sheet,
      ...(sheets ? { sheets } : {}),
      ...(activeSheet !== undefined ? { activeSheet } : {}),
      notes: parseNotes(raw.notes),
      balloons: parseBalloons(raw.balloons),
      ...(Array.isArray(raw.gdt) && raw.gdt.length
        ? { gdt: parseGdt(raw.gdt) }
        : {}),
      ...(Array.isArray(raw.dimensions) && raw.dimensions.length
        ? { dimensions: parseDimensions(raw.dimensions) }
        : {}),
      ...(bomSettings ? { bom: bomSettings } : {}),
      ...(typeof raw.sourceSignature === "string" && raw.sourceSignature
        ? { sourceSignature: raw.sourceSignature }
        : {}),
      ...(Number.isFinite(raw.sourceUpdatedAt)
        ? { sourceUpdatedAt: Number(raw.sourceUpdatedAt) }
        : {}),
      ...(Array.isArray(raw.contextSketches) && raw.contextSketches.length
        ? { contextSketches: parseContextSketches(raw.contextSketches) }
        : {}),
    };
  } catch {
    return null;
  }
}

export const ISO_SHEET_SIZES: Record<SheetSize, [number, number]> = {
  A0: [1189, 841],
  A1: [841, 594],
  A2: [594, 420],
  A3: [420, 297],
  A4: [297, 210],
};

export function sheetDimensions(sheet: DrawingSheet): {
  width: number;
  height: number;
} {
  if (sheet.format)
    return { width: sheet.format.width, height: sheet.format.height };
  const [long, short] = ISO_SHEET_SIZES[sheet.size] ?? ISO_SHEET_SIZES.A4;
  return sheet.orientation === "portrait"
    ? { width: short, height: long }
    : { width: long, height: short };
}

/** Parse drafting scales such as `1:2`, `2:1` and `1:1` to a drawing factor. */
export function parseDrawingScale(scale: string): number | null {
  const match = scale.trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!(numerator > 0) || !(denominator > 0)) return null;
  return numerator / denominator;
}

export function formatDrawingScale(value: number): string {
  if (!(value > 0)) return "AUTO";
  if (Math.abs(value - 1) < 1e-9) return "1:1";
  if (value < 1) {
    const denominator = Math.round(1 / value);
    return `1:${denominator}`;
  }
  return `${Number(value.toFixed(3))}:1`;
}

export function drawingSheets(data: DrawingTabData): DrawingSheet[] {
  return data.sheets?.length ? data.sheets : [data.sheet];
}

export function activeSheetIndex(data: DrawingTabData): number {
  const count = drawingSheets(data).length;
  return Math.max(
    0,
    Math.min(
      count - 1,
      Number.isFinite(data.activeSheet) ? Number(data.activeSheet) : 0,
    ),
  );
}

export function sheetAt(
  data: DrawingTabData,
  index = activeSheetIndex(data),
): DrawingSheet {
  const sheets = drawingSheets(data);
  return sheets[Math.max(0, Math.min(sheets.length - 1, index))]!;
}

/** Replace the active sheet, keeping the legacy `sheet` mirror in sync. */
export function updateActiveSheet(
  data: DrawingTabData,
  next: DrawingSheet,
): DrawingTabData {
  const index = activeSheetIndex(data);
  const sheets = drawingSheets(data);
  if (!data.sheets?.length) return { ...data, sheet: next };
  return {
    ...data,
    sheet: next,
    sheets: sheets.map((s, i) => (i === index ? next : s)),
    activeSheet: index,
  };
}

export function setActiveSheet(
  data: DrawingTabData,
  index: number,
): DrawingTabData {
  const sheets = drawingSheets(data);
  const activeSheet = Math.max(0, Math.min(sheets.length - 1, index));
  return {
    ...data,
    sheet: sheets[activeSheet]!,
    sheets,
    activeSheet,
  };
}

export function addDrawingSheet(data: DrawingTabData): DrawingTabData {
  const sheets = drawingSheets(data);
  const base = sheets[activeSheetIndex(data)] ?? defaultDrawingSheet();
  const source = base;
  const next: DrawingSheet = {
    ...source,
    number: `${source.number.replace(/-\d+$/, "")}-${sheets.length + 1}`,
    title: `${source.title} · SHEET ${sheets.length + 1}`,
  };
  return {
    ...data,
    sheet: next,
    sheets: [...sheets, next],
    activeSheet: sheets.length,
  };
}

export function removeActiveSheet(data: DrawingTabData): DrawingTabData {
  const sheets = drawingSheets(data);
  if (sheets.length <= 1) return data;
  const index = activeSheetIndex(data);
  const remaining = sheets.filter((_, i) => i !== index);
  const active = Math.max(0, Math.min(remaining.length - 1, index));
  return {
    ...data,
    sheet: remaining[active]!,
    sheets: remaining,
    activeSheet: active,
  };
}

export function duplicateActiveSheet(data: DrawingTabData): DrawingTabData {
  const sheets = drawingSheets(data);
  const index = activeSheetIndex(data);
  const source = sheets[index] ?? defaultDrawingSheet();
  const copy: DrawingSheet = {
    ...source,
    title: `${source.title} COPY`,
    number: `${source.number}-COPY`,
  };
  const next = [
    ...sheets.slice(0, index + 1),
    copy,
    ...sheets.slice(index + 1),
  ];
  return {
    ...data,
    sheet: copy,
    sheets: next,
    activeSheet: index + 1,
  };
}

export function moveActiveSheet(
  data: DrawingTabData,
  direction: -1 | 1,
): DrawingTabData {
  const sheets = drawingSheets(data);
  const from = activeSheetIndex(data);
  const to = from + direction;
  if (to < 0 || to >= sheets.length) return data;
  const next = [...sheets];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return { ...data, sheet: moved!, sheets: next, activeSheet: to };
}

export function renameDrawingSheet(
  data: DrawingTabData,
  index: number,
  title: string,
): DrawingTabData {
  const sheets = drawingSheets(data);
  const safe = Math.max(0, Math.min(sheets.length - 1, index));
  const name = title.trim() || `SHEET ${safe + 1}`;
  const next = sheets.map((sheet, i) =>
    i === safe ? { ...sheet, title: name } : sheet,
  );
  return {
    ...data,
    ...(next[activeSheetIndex(data)]
      ? { sheet: next[activeSheetIndex(data)]! }
      : {}),
    sheets: next,
    activeSheet: activeSheetIndex(data),
  };
}

export const DEFAULT_DRAWING_BOM_COLUMNS: DrawingBomColumn[] = [
  "item",
  "number",
  "name",
  "description",
  "qty",
];

export function drawingBomColumns(data: DrawingTabData): DrawingBomColumn[] {
  const configured = data.bom?.columns;
  if (!configured?.length) return DEFAULT_DRAWING_BOM_COLUMNS;
  return configured.filter((column) => DRAWING_BOM_COLUMNS.includes(column));
}

/** Apply drawing-time BOM row order, row overrides and item numbers. */
export function applyDrawingBom(
  rows: readonly BomRow[],
  settings: DrawingBomSettings | undefined,
): BomRow[] {
  const overrides = settings?.overrides ?? {};
  const byKey = new Map(
    rows.map((row) => [row.key, { ...row, ...overrides[row.key] }]),
  );
  const ordered: BomRow[] = [];
  for (const key of settings?.rowOrder ?? []) {
    const row = byKey.get(key);
    if (row) {
      ordered.push(row);
      byKey.delete(key);
    }
  }
  ordered.push(...byKey.values());
  return ordered.map((row, index) => ({
    ...row,
    item: row.item ?? index + 1,
  }));
}

/** Link balloons to BOM rows via body id and renumber every balloon. */
export function syncDrawingBalloons(
  data: DrawingTabData,
  bom: readonly BomRow[],
  bodies: readonly DrawingBody[],
): DrawingTabData {
  const itemForKey = new Map<string, number>();
  bom.forEach((row, index) => itemForKey.set(row.key, row.item ?? index + 1));
  const bomKeyForBody = new Map(
    bodies.map((body) => [body.id, body.bomKey ?? body.partNumber]),
  );
  let nextItem = Math.max(0, ...itemForKey.values()) + 1;
  const balloons = data.balloons.map((balloon) => {
    const bomKey =
      balloon.bomKey ??
      (balloon.bodyId ? bomKeyForBody.get(balloon.bodyId) : undefined);
    const item = bomKey ? itemForKey.get(bomKey) : undefined;
    return {
      ...balloon,
      ...(bomKey ? { bomKey } : {}),
      label: String(item ?? nextItem++),
    };
  });
  return { ...data, balloons };
}

/** Renumber balloons in sheet/read order without changing their links. */
export function renumberBalloons(data: DrawingTabData): DrawingTabData {
  const sorted = [...data.balloons].sort(
    (a, b) => a.sheet - b.sheet || a.y - b.y || a.x - b.x,
  );
  const labels = new Map(
    sorted.map((balloon, index) => [balloon.id, String(index + 1)]),
  );
  return {
    ...data,
    balloons: data.balloons.map((balloon) => ({
      ...balloon,
      label: labels.get(balloon.id) ?? balloon.label,
    })),
  };
}

export interface DrawingBomIssue {
  severity: "error" | "warning";
  message: string;
}

export function drawingBomIssues(
  data: DrawingTabData,
  bom: readonly BomRow[],
): DrawingBomIssue[] {
  const issues: DrawingBomIssue[] = [];
  const items = new Map<number, string[]>();
  bom.forEach((row, index) => {
    const item = row.item ?? index + 1;
    items.set(item, [...(items.get(item) ?? []), row.key]);
    if (!row.number)
      issues.push({
        severity: "warning",
        message: `Item ${item} has no part number`,
      });
    if (!row.description)
      issues.push({
        severity: "warning",
        message: `Item ${item} has no description`,
      });
  });
  for (const [item, keys] of items)
    if (keys.length > 1)
      issues.push({ severity: "error", message: `Duplicate BOM item ${item}` });
  const known = new Set(bom.map((row) => row.key));
  for (const balloon of data.balloons)
    if (balloon.bomKey && !known.has(balloon.bomKey))
      issues.push({
        severity: "error",
        message: `Balloon ${balloon.label} links to missing BOM row ${balloon.bomKey}`,
      });
  return issues;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function drawingSourceSignature(
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
): string {
  return hashString(
    JSON.stringify({
      bodies: bodies.map((body) => ({
        id: body.id,
        name: body.name,
        partNumber: body.partNumber,
        edges: body.edges,
        circles: body.circles ?? [],
      })),
      bom: bom.map((row) => [row.key, row.number, row.qty, row.revision ?? ""]),
    }),
  );
}

/** Derive exploded drawing geometry from the placed assembly bodies. */
export function explodeDrawingBodies(
  bodies: readonly DrawingBody[],
  amount: number,
): DrawingBody[] {
  if (!(amount > 0)) return [...bodies];
  const all = bodies.flatMap((body) => body.edges.flat());
  if (!all.length) return [...bodies];
  const center = all.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
      z: sum.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  center.x /= all.length;
  center.y /= all.length;
  center.z /= all.length;
  return bodies.map((body, index) => {
    const points = body.edges.flat();
    if (!points.length) return body;
    const local = points.reduce(
      (sum, point) => ({
        x: sum.x + point.x,
        y: sum.y + point.y,
        z: sum.z + point.z,
      }),
      { x: 0, y: 0, z: 0 },
    );
    local.x /= points.length;
    local.y /= points.length;
    local.z /= points.length;
    const radial = {
      x: local.x - center.x,
      y: local.y - center.y,
      z: local.z - center.z,
    };
    const length = Math.hypot(radial.x, radial.y, radial.z);
    const direction =
      length > 1e-6
        ? { x: radial.x / length, y: radial.y / length, z: radial.z / length }
        : { x: 1, y: 0, z: 0 };
    const offset = {
      x: direction.x * amount + (length > 1e-6 ? 0 : index * amount),
      y: direction.y * amount,
      z: direction.z * amount,
    };
    const shift = (point: Vec3): Vec3 => ({
      x: point.x + offset.x,
      y: point.y + offset.y,
      z: point.z + offset.z,
    });
    return {
      ...body,
      edges: body.edges.map(([a, b]) => [shift(a), shift(b)]),
      ...(body.faces
        ? {
            faces: body.faces.map(([a, b, c]) => [
              shift(a),
              shift(b),
              shift(c),
            ]),
          }
        : {}),
      ...(body.circles
        ? {
            circles: body.circles.map((circle) => ({
              ...circle,
              center: shift(circle.center),
            })),
          }
        : {}),
    };
  });
}

// ---- projection -----------------------------------------------------------

export function projectPoint(
  p: Vec3,
  projection: DrawingProjection,
): [number, number] {
  switch (projection) {
    case "front":
      return [p.x, p.y];
    case "top":
      return [p.x, p.z];
    case "right":
      return [p.z, p.y];
    case "iso": {
      const a = Math.PI / 6;
      const x = (p.x - p.z) * Math.cos(a);
      const y = p.y + (p.x + p.z) * Math.sin(a) * 0.5;
      return [x, y];
    }
  }
}

function depthOf(p: Vec3, projection: DrawingProjection): number {
  switch (projection) {
    case "front":
      return p.z;
    case "top":
      return p.y;
    case "right":
      return p.x;
    case "iso":
      return p.x + p.z + p.y * 0.5;
  }
}

function auxBasis(direction: Vec3): { u: Vec3; v: Vec3; n: Vec3 } {
  const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const n = {
    x: direction.x / len,
    y: direction.y / len,
    z: direction.z / len,
  };
  const up = Math.abs(n.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const u = {
    y: n.z * up.x - n.x * up.z,
    z: n.x * up.y - n.y * up.x,
    x: n.y * up.z - n.z * up.y,
  };
  const ul = Math.hypot(u.x, u.y, u.z) || 1;
  u.x /= ul;
  u.y /= ul;
  u.z /= ul;
  const v = {
    x: n.y * u.z - n.z * u.y,
    y: n.z * u.x - n.x * u.z,
    z: n.x * u.y - n.y * u.x,
  };
  return { u, v, n };
}

function projectAuxPoint(p: Vec3, direction: Vec3): [number, number] {
  const { u, v } = auxBasis(direction);
  return [p.x * u.x + p.y * u.y + p.z * u.z, p.x * v.x + p.y * v.y + p.z * v.z];
}

function depthAux(p: Vec3, direction: Vec3): number {
  const { n } = auxBasis(direction);
  return p.x * n.x + p.y * n.y + p.z * n.z;
}

function stableEdgeId(
  body: DrawingBody,
  index: number,
  a: Vec3,
  b: Vec3,
): string {
  return (
    body.edgeKeys?.[index] ??
    `${body.id}:${hashString(
      [a, b]
        .map(
          (point) =>
            `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`,
        )
        .join("|"),
    )}`
  );
}

function projectedAuxEdges(
  bodies: readonly DrawingBody[],
  direction: Vec3,
): ProjectedEdge[] {
  const out: ProjectedEdge[] = [];
  for (const body of bodies)
    for (const [index, [a, b]] of body.edges.entries())
      out.push({
        a: projectAuxPoint(a, direction),
        b: projectAuxPoint(b, direction),
        da: depthAux(a, direction),
        db: depthAux(b, direction),
        bodyId: body.id,
        edgeIndex: index,
        topologyId: stableEdgeId(body, index, a, b),
        fullA: projectAuxPoint(a, direction),
        fullB: projectAuxPoint(b, direction),
      });
  return out;
}

function projectedAuxFaces(
  bodies: readonly DrawingBody[],
  direction: Vec3,
): ProjectedFace[] {
  const out: ProjectedFace[] = [];
  for (const body of bodies)
    for (const [a, b, c] of body.faces ?? [])
      out.push({
        a: projectAuxPoint(a, direction),
        b: projectAuxPoint(b, direction),
        c: projectAuxPoint(c, direction),
        da: depthAux(a, direction),
        db: depthAux(b, direction),
        dc: depthAux(c, direction),
      });
  return out;
}

/** Clip a projected segment to a detail circle. */
function clipSegmentToCircle(
  edge: ProjectedEdge,
  cx: number,
  cy: number,
  radius: number,
): ProjectedEdge | null {
  const dx = edge.b[0] - edge.a[0];
  const dy = edge.b[1] - edge.a[1];
  const fx = edge.a[0] - cx;
  const fy = edge.a[1] - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return fx * fx + fy * fy <= radius * radius ? edge : null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  const start = Math.max(0, Math.min(t0, t1));
  const end = Math.min(1, Math.max(t0, t1));
  if (end <= start) return null;
  const pointAt = (t: number): [number, number] => [
    edge.a[0] + dx * t,
    edge.a[1] + dy * t,
  ];
  return {
    a: pointAt(start),
    b: pointAt(end),
    da: edge.da + (edge.db - edge.da) * start,
    db: edge.da + (edge.db - edge.da) * end,
    ...(edge.bodyId ? { bodyId: edge.bodyId } : {}),
    ...(edge.edgeIndex !== undefined ? { edgeIndex: edge.edgeIndex } : {}),
    ...(edge.topologyId ? { topologyId: edge.topologyId } : {}),
    ...(edge.fullA && edge.fullB
      ? { fullA: edge.fullA, fullB: edge.fullB }
      : {}),
  };
}

function detailViewEdges(
  bodies: readonly DrawingBody[],
  detail: DetailViewSpec,
): { visible: ProjectedEdge[]; hidden: ProjectedEdge[] } {
  const edges = projectedEdges(bodies, detail.parent);
  const faces = projectedFaces(bodies, detail.parent);
  const split = splitEdges(edges, faces);
  const clip = (items: ProjectedEdge[]) =>
    items.flatMap((edge) => {
      const clipped = clipSegmentToCircle(
        edge,
        detail.centerX,
        detail.centerY,
        detail.radius,
      );
      return clipped ? [clipped] : [];
    });
  return { visible: clip(split.visible), hidden: clip(split.hidden) };
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ProjectedEdge {
  a: [number, number];
  b: [number, number];
  da: number;
  db: number;
  bodyId?: string;
  /** Index of the body edge this segment came from. */
  edgeIndex?: number;
  /** Stable source topology key, retained across rebuilds and HLR splits. */
  topologyId?: string;
  /** Full projected source edge, retained when HLR splits the segment. */
  fullA?: [number, number];
  fullB?: [number, number];
}

interface ProjectedFace {
  a: [number, number];
  b: [number, number];
  c: [number, number];
  da: number;
  db: number;
  dc: number;
}

function projectedEdges(
  bodies: readonly DrawingBody[],
  projection: DrawingProjection,
): ProjectedEdge[] {
  const out: ProjectedEdge[] = [];
  for (const body of bodies)
    for (const [index, [a, b]] of body.edges.entries())
      out.push({
        a: projectPoint(a, projection),
        b: projectPoint(b, projection),
        da: depthOf(a, projection),
        db: depthOf(b, projection),
        bodyId: body.id,
        edgeIndex: index,
        topologyId: stableEdgeId(body, index, a, b),
        fullA: projectPoint(a, projection),
        fullB: projectPoint(b, projection),
      });
  return out;
}

function projectedFaces(
  bodies: readonly DrawingBody[],
  projection: DrawingProjection,
): ProjectedFace[] {
  const out: ProjectedFace[] = [];
  for (const body of bodies)
    for (const [a, b, c] of body.faces ?? [])
      out.push({
        a: projectPoint(a, projection),
        b: projectPoint(b, projection),
        c: projectPoint(c, projection),
        da: depthOf(a, projection),
        db: depthOf(b, projection),
        dc: depthOf(c, projection),
      });
  return out;
}

function edgeLength(edge: ProjectedEdge): number {
  return Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]);
}

function pointInTriangle(
  p: [number, number],
  a: [number, number],
  b: [number, number],
  c: [number, number],
): boolean {
  const sign = (
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
  ) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < -1e-7 || d2 < -1e-7 || d3 < -1e-7;
  const hasPos = d1 > 1e-7 || d2 > 1e-7 || d3 > 1e-7;
  return !(hasNeg && hasPos);
}

function faceDepthAt(face: ProjectedFace, p: [number, number]): number | null {
  if (!pointInTriangle(p, face.a, face.b, face.c)) return null;
  const det =
    (face.b[1] - face.c[1]) * (face.a[0] - face.c[0]) +
    (face.c[0] - face.b[0]) * (face.a[1] - face.c[1]);
  if (Math.abs(det) < 1e-9) return null;
  const l1 =
    ((face.b[1] - face.c[1]) * (p[0] - face.c[0]) +
      (face.c[0] - face.b[0]) * (p[1] - face.c[1])) /
    det;
  const l2 =
    ((face.c[1] - face.a[1]) * (p[0] - face.c[0]) +
      (face.a[0] - face.c[0]) * (p[1] - face.c[1])) /
    det;
  const l3 = 1 - l1 - l2;
  return l1 * face.da + l2 * face.db + l3 * face.dc;
}

interface SplitEdges {
  visible: ProjectedEdge[];
  hidden: ProjectedEdge[];
}

/** Parameter where a projected edge crosses one projected triangle edge. */
function triangleCrossing(
  edge: ProjectedEdge,
  a: [number, number],
  b: [number, number],
): number | null {
  const rx = edge.b[0] - edge.a[0];
  const ry = edge.b[1] - edge.a[1];
  const sx = b[0] - a[0];
  const sy = b[1] - a[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = a[0] - edge.a[0];
  const qy = a[1] - edge.a[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return Math.max(0, Math.min(1, t));
}

/**
 * Split one projected edge at the exact intersections with every projected
 * face triangle. No sampling: the visible/hidden runs are the intervals where
 * the edge's depth is in front of or behind the triangle surface.
 */
function splitEdge(
  edge: ProjectedEdge,
  faces: readonly ProjectedFace[],
): SplitEdges {
  if (!faces.length || edgeLength(edge) < 1e-7) {
    return { visible: [edge], hidden: [] };
  }
  const pointAt = (t: number): [number, number] => [
    edge.a[0] + (edge.b[0] - edge.a[0]) * t,
    edge.a[1] + (edge.b[1] - edge.a[1]) * t,
  ];
  const depthAt = (t: number) => edge.da + (edge.db - edge.da) * t;
  const overlaps: Array<[number, number]> = [];

  for (const face of faces) {
    const cuts = [0, 1];
    for (const [a, b] of [
      [face.a, face.b],
      [face.b, face.c],
      [face.c, face.a],
    ] as Array<[[number, number], [number, number]]>) {
      const crossing = triangleCrossing(edge, a, b);
      if (crossing !== null) cuts.push(crossing);
    }
    cuts.sort((a, b) => a - b);
    const unique = cuts.filter(
      (value, index) =>
        index === 0 || Math.abs(value - cuts[index - 1]!) > 1e-7,
    );
    for (let i = 0; i + 1 < unique.length; i++) {
      const start = unique[i]!;
      const end = unique[i + 1]!;
      if (end - start < 1e-7) continue;
      const mid = (start + end) / 2;
      const fz = faceDepthAt(face, pointAt(mid));
      if (fz !== null && fz > depthAt(mid) + 0.05) overlaps.push([start, end]);
    }
  }

  overlaps.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of overlaps) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1] + 1e-7) {
      last[1] = Math.max(last[1], interval[1]);
    } else {
      merged.push([...interval]);
    }
  }

  const visible: ProjectedEdge[] = [];
  const hidden: ProjectedEdge[] = [];
  const pushRun = (start: number, end: number, isHidden: boolean) => {
    if (end - start < 1e-6) return;
    const segment: ProjectedEdge = {
      a: pointAt(start),
      b: pointAt(end),
      da: depthAt(start),
      db: depthAt(end),
      ...(edge.bodyId ? { bodyId: edge.bodyId } : {}),
      ...(edge.edgeIndex !== undefined ? { edgeIndex: edge.edgeIndex } : {}),
      ...(edge.topologyId ? { topologyId: edge.topologyId } : {}),
      ...(edge.fullA && edge.fullB
        ? { fullA: edge.fullA, fullB: edge.fullB }
        : {}),
    };
    if (isHidden) hidden.push(segment);
    else visible.push(segment);
  };
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) pushRun(cursor, start, false);
    pushRun(Math.max(cursor, start), end, true);
    cursor = Math.max(cursor, end);
  }
  if (cursor < 1) pushRun(cursor, 1, false);
  return { visible, hidden };
}

function splitEdges(
  edges: readonly ProjectedEdge[],
  faces: readonly ProjectedFace[],
): SplitEdges {
  const visible: ProjectedEdge[] = [];
  const hidden: ProjectedEdge[] = [];
  for (const edge of edges) {
    const split = splitEdge(edge, faces);
    visible.push(...split.visible);
    hidden.push(...split.hidden);
  }
  return { visible, hidden };
}

function extent(edges: readonly ProjectedEdge[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (!edges.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const edge of edges)
    for (const [x, y] of [edge.a, edge.b]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return { minX, minY, maxX, maxY };
}

interface ViewFrame {
  scale: number;
  cx: number;
  cy: number;
  tx: (x: number) => number;
  ty: (y: number) => number;
}

function viewFrame(
  edges: readonly ProjectedEdge[],
  box: ViewBox,
  explicitScale?: number,
): ViewFrame | null {
  const ext = extent(edges);
  if (!ext) return null;
  const pad = 7;
  const w = Math.max(1e-6, ext.maxX - ext.minX);
  const h = Math.max(1e-6, ext.maxY - ext.minY);
  const fitScale = Math.min((box.w - pad * 2) / w, (box.h - pad * 2) / h);
  const scale =
    explicitScale && explicitScale > 0
      ? explicitScale
      : Math.max(1e-6, fitScale);
  const cx = (ext.minX + ext.maxX) / 2;
  const cy = (ext.minY + ext.maxY) / 2;
  return {
    scale,
    cx,
    cy,
    tx: (x: number) => box.x + box.w / 2 + (x - cx) * scale,
    ty: (y: number) => box.y + box.h / 2 - (y - cy) * scale,
  };
}

interface RenderViewOptions {
  scale?: number;
  lineWeight?: number;
  plotStyle?: PlotStyle;
  hatch?: { angle: number; spacing: number };
}

function renderView(
  visible: readonly ProjectedEdge[],
  hidden: readonly ProjectedEdge[],
  box: ViewBox,
  label: string,
  showHidden: boolean,
  options: RenderViewOptions = {},
): string {
  const all = [...visible, ...hidden];
  const frame = viewFrame(all, box, options.scale);
  if (!frame) {
    return `<g><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="#cbd5e1" stroke-dasharray="2 2"/><text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" text-anchor="middle" font-size="4" fill="#94a3b8">${xml(label)}</text></g>`;
  }
  const linesFor = (edges: readonly ProjectedEdge[]) =>
    edges
      .map(
        (e) =>
          `<line x1="${frame.tx(e.a[0]).toFixed(3)}" y1="${frame.ty(e.a[1]).toFixed(3)}" x2="${frame.tx(e.b[0]).toFixed(3)}" y2="${frame.ty(e.b[1]).toFixed(3)}"/>`,
      )
      .join("");
  const color = options.plotStyle === "monochrome" ? "#000000" : "#0f172a";
  const weight = options.lineWeight ?? 0.35;
  const hiddenLines =
    showHidden && hidden.length
      ? `<g stroke="#94a3b8" stroke-width="${(weight * 0.6).toFixed(2)}" stroke-dasharray="1.4 1.2" fill="none">${linesFor(hidden)}</g>`
      : "";
  const hatch = options.hatch
    ? (() => {
        const id = `hatch-${hashString(label)}`;
        return `<defs><pattern id="${id}" width="${options.hatch!.spacing}" height="${options.hatch!.spacing}" patternUnits="userSpaceOnUse" patternTransform="rotate(${options.hatch!.angle})"><line x1="0" y1="0" x2="0" y2="${options.hatch!.spacing}" stroke="#64748b" stroke-width="0.18"/></pattern></defs><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#${id})" opacity="0.28" pointer-events="none"/>`;
      })()
    : "";
  return `<g data-view="${xml(label)}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="#e2e8f0" stroke-dasharray="2 2"/>${hatch}<g stroke="${color}" stroke-width="${weight.toFixed(2)}" fill="none">${linesFor(visible)}</g>${hiddenLines}<text x="${box.x + 2}" y="${box.y + 4}" font-size="3.5" fill="#475569">${xml(label)}</text></g>`;
}

interface DimensionGeometry {
  axis: "horizontal" | "vertical";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  start: number;
  end: number;
  value: number;
}

function dimensionEdges(
  view: DrawingView,
  dimension: DrawingDimension,
): ProjectedEdge[] {
  let edges = dimension.bodyId
    ? view.visible.filter((edge) => edge.bodyId === dimension.bodyId)
    : view.visible;
  if (dimension.anchorId)
    edges = edges.filter((edge) => edge.topologyId === dimension.anchorId);
  else if (dimension.edgeIndex !== undefined)
    edges = edges.filter((edge) => edge.edgeIndex === dimension.edgeIndex);
  return edges;
}

function dimensionValue(
  view: DrawingView,
  dimension: DrawingDimension,
): number | null {
  if (dimension.kind === "radius" || dimension.kind === "diameter") {
    const circle = view.circles?.[dimension.circleIndex ?? 0];
    if (!circle) return null;
    return dimension.kind === "diameter" ? circle.radius * 2 : circle.radius;
  }
  if (dimension.kind === "angular") {
    const primary = dimensionEdges(view, dimension).find(
      (edge) => edge.fullA && edge.fullB,
    );
    let secondary = view.visible.filter(
      (edge) =>
        edge.fullA &&
        edge.fullB &&
        ((dimension.secondAnchorId &&
          edge.topologyId === dimension.secondAnchorId) ||
          (dimension.secondEdgeIndex !== undefined &&
            edge.edgeIndex === dimension.secondEdgeIndex)),
    )[0];
    if (!secondary && dimension.bodyId)
      secondary = view.visible.find(
        (edge) =>
          edge.bodyId === dimension.bodyId &&
          edge !== primary &&
          edge.fullA &&
          edge.fullB,
      );
    if (
      !primary?.fullA ||
      !primary.fullB ||
      !secondary?.fullA ||
      !secondary.fullB
    )
      return null;
    const primaryA = primary.fullA;
    const primaryB = primary.fullB;
    const secondaryA = secondary.fullA;
    const secondaryB = secondary.fullB;
    const a: [number, number] = [
      primaryB[0] - primaryA[0],
      primaryB[1] - primaryA[1],
    ];
    const b: [number, number] = [
      secondaryB[0] - secondaryA[0],
      secondaryB[1] - secondaryA[1],
    ];
    const denominator = Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]);
    if (denominator < 1e-9) return null;
    const cosine = Math.max(
      -1,
      Math.min(1, (a[0] * b[0] + a[1] * b[1]) / denominator),
    );
    return (Math.acos(cosine) * 180) / Math.PI;
  }
  const edges = dimensionEdges(view, dimension);
  const picked = edges.find((edge) => edge.fullA && edge.fullB);
  const fullA = picked?.fullA;
  const fullB = picked?.fullB;
  const ext =
    fullA && fullB
      ? {
          minX: Math.min(fullA[0], fullB[0]),
          maxX: Math.max(fullA[0], fullB[0]),
          minY: Math.min(fullA[1], fullB[1]),
          maxY: Math.max(fullA[1], fullB[1]),
        }
      : extent(edges);
  if (!ext) return null;
  return dimension.axis === "vertical"
    ? ext.maxY - ext.minY
    : ext.maxX - ext.minX;
}

export function dimensionGeometry(
  view: DrawingView,
  dimension: DrawingDimension,
): DimensionGeometry | null {
  const frame = viewFrameFor(view);
  if (!frame) return null;
  let edges = dimensionEdges(view, dimension);
  const picked = edges.find((edge) => edge.fullA && edge.fullB);
  const full: [[number, number], [number, number]] | null =
    picked && picked.fullA && picked.fullB
      ? [picked.fullA, picked.fullB]
      : null;
  const ext = full
    ? {
        minX: Math.min(full[0][0], full[1][0]),
        maxX: Math.max(full[0][0], full[1][0]),
        minY: Math.min(full[0][1], full[1][1]),
        maxY: Math.max(full[0][1], full[1][1]),
      }
    : extent(edges);
  if (!ext) return null;
  const x1 = frame.tx(ext.minX);
  const y1 = frame.ty(ext.minY);
  const x2 = frame.tx(ext.maxX);
  const y2 = frame.ty(ext.maxY);
  const value = dimensionValue(view, dimension);
  if (value === null) return null;
  const offset = Math.max(1, dimension.offset ?? 7);
  if (dimension.axis === "vertical") {
    const x = Math.min(view.box.x + view.box.w - 2, Math.max(x1, x2) + offset);
    return {
      axis: "vertical",
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      start: x,
      end: x,
      value,
    };
  }
  const y = Math.min(view.box.y + view.box.h - 2, Math.max(y1, y2) + offset);
  return {
    axis: "horizontal",
    x1: x1,
    y1: y1,
    x2: x2,
    y2: y2,
    start: y,
    end: y,
    value,
  };
}

export function dimensionText(
  dimension: DrawingDimension,
  value: number,
): string {
  const kind = dimension.kind ?? "linear";
  const base =
    kind === "radius"
      ? `R${value.toFixed(1)}`
      : kind === "diameter"
        ? `⌀${value.toFixed(1)}`
        : kind === "angular"
          ? `${value.toFixed(1)}°`
          : value.toFixed(1);
  const tolerance = dimension.tolerance;
  if (!tolerance || tolerance.type === "none") return base;
  if (tolerance.type === "fit") return `${base} ${tolerance.fit ?? "H7"}`;
  const upper = Math.abs(tolerance.upper ?? 0.1);
  const lower = Math.abs(tolerance.lower ?? 0.1);
  if (tolerance.type === "limits")
    return `${base} +${upper.toFixed(2)}/-${lower.toFixed(2)}`;
  return `${base} ±${upper.toFixed(2)}`;
}

function renderDimension(
  view: DrawingView,
  dimension: DrawingDimension,
): string {
  const frame = viewFrameFor(view);
  if (!frame) return "";
  if (dimension.kind === "ordinate") {
    const g = dimensionGeometry(view, dimension);
    if (!g) return "";
    const originX = view.box.x + 2;
    const originY = view.box.y + view.box.h - 2;
    const label = dimensionText(dimension, g.value);
    const tx = g.axis === "horizontal" ? g.x1 : originX;
    const ty = g.axis === "horizontal" ? originY : g.y1;
    return `<g data-dimension="${xml(dimension.id)}" data-dimension-kind="ordinate" data-dimension-body="${xml(dimension.bodyId ?? "")}" stroke="#334155" stroke-width="0.3" fill="none"><circle cx="${originX}" cy="${originY}" r="0.6" fill="#334155" stroke="none"/><line x1="${originX}" y1="${originY}" x2="${tx}" y2="${ty}"/><line x1="${tx}" y1="${ty}" x2="${tx + (g.axis === "horizontal" ? 0 : 3)}" y2="${ty + (g.axis === "horizontal" ? -3 : 0)}"/><text x="${g.axis === "horizontal" ? (originX + tx) / 2 : tx + 1.5}" y="${g.axis === "horizontal" ? ty - 1 : (originY + ty) / 2}" text-anchor="${g.axis === "horizontal" ? "middle" : "start"}" font-size="${dimension.textSize ?? 3.5}" fill="#334155" stroke="none">${xml(label)}</text></g>`;
  }
  if (dimension.kind === "radius" || dimension.kind === "diameter") {
    const circle = view.circles?.[dimension.circleIndex ?? 0];
    if (!circle) return "";
    const cx = frame.tx(circle.center[0]);
    const cy = frame.ty(circle.center[1]);
    const radius = circle.radius * frame.scale;
    const value = dimensionValue(view, dimension);
    if (value === null) return "";
    const label = dimensionText(dimension, value);
    const tx = cx + radius * 0.72;
    const ty = cy - radius * 0.72;
    return `<g data-dimension="${xml(dimension.id)}" data-dimension-kind="${dimension.kind}" data-dimension-body="${xml(dimension.bodyId ?? "")}" stroke="#334155" stroke-width="0.3" fill="none"><circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${radius.toFixed(3)}"/><line x1="${cx.toFixed(3)}" y1="${cy.toFixed(3)}" x2="${tx.toFixed(3)}" y2="${ty.toFixed(3)}"/><text x="${(tx + 2).toFixed(3)}" y="${ty.toFixed(3)}" font-size="${dimension.textSize ?? 3.5}" fill="#334155" stroke="none">${xml(label)}</text></g>`;
  }
  const g = dimensionGeometry(view, dimension);
  if (!g) return "";
  const label = dimensionText(dimension, g.value);
  const common = `data-dimension="${xml(dimension.id)}" data-dimension-kind="${dimension.kind ?? "linear"}" data-dimension-body="${xml(dimension.bodyId ?? "")}" stroke="#334155" stroke-width="0.3" fill="none"`;
  if (g.axis === "horizontal") {
    return `<g ${common}><line x1="${g.x1}" y1="${g.y1}" x2="${g.x1}" y2="${g.start}"/><line x1="${g.x2}" y1="${g.y2}" x2="${g.x2}" y2="${g.start}"/><line x1="${g.x1}" y1="${g.start}" x2="${g.x2}" y2="${g.start}"/><text x="${(g.x1 + g.x2) / 2}" y="${g.start - 1}" text-anchor="middle" font-size="${dimension.textSize ?? 3.5}" fill="#334155" stroke="none">${xml(label)}</text></g>`;
  }
  return `<g ${common}><line x1="${g.x1}" y1="${g.y1}" x2="${g.start}" y2="${g.y1}"/><line x1="${g.x2}" y1="${g.y2}" x2="${g.start}" y2="${g.y2}"/><line x1="${g.start}" y1="${g.y1}" x2="${g.start}" y2="${g.y2}"/><text x="${g.start + 1}" y="${(g.y1 + g.y2) / 2}" font-size="${dimension.textSize ?? 3.5}" fill="#334155" stroke="none">${xml(label)}</text></g>`;
}

function renderDimensions(
  edges: readonly ProjectedEdge[],
  box: ViewBox,
  label = "",
): string {
  const ext = extent(edges);
  if (!ext) return "";
  const w = ext.maxX - ext.minX;
  const h = ext.maxY - ext.minY;
  const y = box.y + box.h - 1.5;
  const x = box.x + 4;
  return `<g data-dimensions="${xml(label)}" stroke="#334155" stroke-width="0.3" fill="none"><line x1="${box.x + 2}" y1="${y}" x2="${box.x + box.w - 2}" y2="${y}"/><line x1="${x}" y1="${box.y + 4}" x2="${x}" y2="${box.y + box.h - 4}"/><text x="${box.x + box.w / 2}" y="${y - 1}" text-anchor="middle" font-size="3.5" fill="#334155" stroke="none">${w.toFixed(1)}</text><text x="${x + 2}" y="${box.y + box.h / 2}" font-size="3.5" fill="#334155" stroke="none">${h.toFixed(1)}</text></g>`;
}

const BOM_COLUMN_LABEL: Record<DrawingBomColumn, string> = {
  item: "ITEM",
  number: "PART NUMBER",
  name: "NAME",
  description: "DESCRIPTION",
  qty: "QTY",
  material: "MATERIAL",
  revision: "REV",
  vendor: "VENDOR",
};

function bomColumnWeight(column: DrawingBomColumn): number {
  switch (column) {
    case "item":
      return 0.8;
    case "number":
      return 1.6;
    case "name":
      return 1.8;
    case "description":
      return 2.4;
    case "qty":
      return 0.7;
    case "material":
      return 1.3;
    case "revision":
      return 0.7;
    case "vendor":
      return 1.3;
  }
}

function bomCell(row: BomRow, index: number, column: DrawingBomColumn): string {
  switch (column) {
    case "item":
      return String(row.item ?? index + 1);
    case "number":
      return row.number || "—";
    case "name":
      return row.name;
    case "description":
      return row.description;
    case "qty":
      return String(row.qty);
    case "material":
      return row.materialId ?? "";
    case "revision":
      return row.revision ?? "";
    case "vendor":
      return row.vendor ?? "";
  }
}

function titleBlockHeight(sheet: DrawingSheet): number {
  return sheet.titleBlock === "compact"
    ? 16
    : sheet.titleBlock === "detailed"
      ? 34
      : 24;
}

function renderBom(
  rows: readonly BomRow[],
  sheet: DrawingSheet,
  width: number,
  height: number,
  columns: readonly DrawingBomColumn[] = DEFAULT_DRAWING_BOM_COLUMNS,
): string {
  if (!sheet.showBom || rows.length === 0) return "";
  const visibleColumns = columns.length ? columns : DEFAULT_DRAWING_BOM_COLUMNS;
  const rowH = 5;
  const tableW = Math.min(180, width * 0.5);
  const tableH = rowH * (rows.length + 1) + 4;
  const x = width - tableW - 8;
  const y = height - titleBlockHeight(sheet) - 16 - tableH;
  const totalWeight = visibleColumns.reduce(
    (sum, column) => sum + bomColumnWeight(column),
    0,
  );
  const columnX = (index: number) =>
    x +
    (tableW *
      visibleColumns
        .slice(0, index)
        .reduce((sum, column) => sum + bomColumnWeight(column), 0)) /
      totalWeight;
  const lines: string[] = [];
  lines.push(
    `<rect x="${x}" y="${y}" width="${tableW}" height="${tableH}" fill="#ffffff" stroke="#334155" stroke-width="0.4"/>`,
    `<rect x="${x}" y="${y}" width="${tableW}" height="${rowH}" fill="#e2e8f0" stroke="#334155" stroke-width="0.3"/>`,
  );
  visibleColumns.forEach((column, index) => {
    lines.push(
      `<text x="${columnX(index) + 1.2}" y="${y + 3.6}" font-size="2.8" font-weight="600" fill="#0f172a">${xml(BOM_COLUMN_LABEL[column])}</text>`,
    );
  });
  rows.forEach((row, index) => {
    const ry = y + rowH * (index + 1);
    lines.push(
      `<line x1="${x}" y1="${ry}" x2="${x + tableW}" y2="${ry}" stroke="#cbd5e1" stroke-width="0.2"/>`,
    );
    visibleColumns.forEach((column, columnIndex) => {
      lines.push(
        `<text x="${columnX(columnIndex) + 1.2}" y="${ry + 3.5}" font-size="2.6" fill="#0f172a">${xml(bomCell(row, index, column))}</text>`,
      );
    });
  });
  return `<g data-testid="drawing-bom" data-columns="${visibleColumns.join(",")}">${lines.join("")}</g>`;
}

function renderTitleBlock(
  sheet: DrawingSheet,
  width: number,
  height: number,
  page: number,
  pageCount: number,
): string {
  const w = Math.min(170, width * 0.52);
  const h = titleBlockHeight(sheet);
  const x = width - w - 8;
  const y = height - h - 8;
  const compact = sheet.titleBlock === "compact";
  const detailed = sheet.titleBlock === "detailed";
  const field = (
    label: string,
    value: string,
    fieldX: number,
    fieldY: number,
    size = 3,
  ) =>
    `<text x="${fieldX}" y="${fieldY - 2}" font-size="2.5" fill="#475569">${xml(label)}</text><text x="${fieldX}" y="${fieldY + 1}" font-size="${size}" fill="#0f172a">${xml(value || "—")}</text>`;
  const meta = detailed
    ? `${field("REV", sheet.revision ?? "", x + 2, y + 20)}${field("DATE", sheet.date ?? "", x + 24, y + 20)}${field("DRAWN", sheet.drawnBy ?? "", x + 54, y + 20)}${field("CHECKED", sheet.checkedBy ?? "", x + 86, y + 20)}${field("APPROVED", sheet.approvedBy ?? "", x + 118, y + 20)}${field("MATERIAL", sheet.material ?? "", x + 2, y + 30)}${field("FINISH", sheet.finish ?? "", x + 54, y + 30)}${field("WEIGHT", sheet.weight ?? "", x + 104, y + 30)}`
    : `${field("REV", sheet.revision ?? "", x + 2, y + 20)}${field("DATE", sheet.date ?? "", x + 24, y + 20)}${field("DRAWN", sheet.drawnBy ?? "", x + 64, y + 20)}${field("CHECKED", sheet.checkedBy ?? "", x + 112, y + 20)}`;
  return `<g data-testid="drawing-title-block" data-variant="${sheet.titleBlock ?? "standard"}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="#0f172a" stroke-width="0.5"/><line x1="${x}" y1="${y + 14}" x2="${x + w}" y2="${y + 14}" stroke="#0f172a" stroke-width="0.3"/><line x1="${x + 62}" y1="${y}" x2="${x + 62}" y2="${y + 14}" stroke="#0f172a" stroke-width="0.3"/><text x="${x + 2}" y="${y + 5}" font-size="3" fill="#475569">TITLE</text><text x="${x + 2}" y="${y + 11}" font-size="5" font-weight="700" fill="#0f172a">${xml(sheet.title)}</text><text x="${x + 64}" y="${y + 5}" font-size="3" fill="#475569">DRAWING NO.</text><text x="${x + 64}" y="${y + 11}" font-size="4" fill="#0f172a">${xml(sheet.number)}</text>${compact ? "" : meta}<text x="${x + 2}" y="${y + h - 2}" font-size="2.8" fill="#475569">SHEET ${sheet.size} ${sheet.orientation.toUpperCase()} · ${sheet.template ?? "ISO"}</text><text x="${x + w - 2}" y="${y + h - 2}" text-anchor="end" font-size="2.8" fill="#475569">SCALE ${xml(sheet.scale)} · ${page + 1}/${pageCount}</text></g>`;
}

function bodyAnchor(
  views: readonly DrawingView[],
  bodyId: string | undefined,
): { x: number; y: number } | null {
  if (!bodyId) return null;
  for (const view of views) {
    const edges = view.visible.filter((edge) => edge.bodyId === bodyId);
    const ext = extent(edges);
    if (!ext) continue;
    return {
      x: view.box.x + view.box.w * 0.74,
      y: Math.max(
        view.box.y + 8,
        Math.min(view.box.y + view.box.h - 8, view.box.y + view.box.h * 0.3),
      ),
    };
  }
  return null;
}

function annotationPosition(
  x: number,
  y: number,
  bodyId: string | undefined,
  views: readonly DrawingView[],
): { x: number; y: number } {
  return bodyAnchor(views, bodyId) ?? { x, y };
}

function renderZones(
  sheet: DrawingSheet,
  width: number,
  height: number,
): string {
  if (!sheet.showZones) return "";
  const step = 25;
  const lines: string[] = [];
  const columns = Math.max(2, Math.floor((width - 8) / step));
  const rows = Math.max(2, Math.floor((height - 8) / step));
  for (let i = 1; i < columns; i++) {
    const x = 4 + ((width - 8) * i) / columns;
    lines.push(
      `<line x1="${x}" y1="4" x2="${x}" y2="${height - 4}" stroke="#cbd5e1" stroke-width="0.15"/>`,
    );
  }
  for (let i = 1; i < rows; i++) {
    const y = 4 + ((height - 8) * i) / rows;
    lines.push(
      `<line x1="4" y1="${y}" x2="${width - 4}" y2="${y}" stroke="#cbd5e1" stroke-width="0.15"/>`,
    );
  }
  for (let i = 0; i < columns; i++) {
    const x = 4 + ((width - 8) * (i + 0.5)) / columns;
    lines.push(
      `<text x="${x}" y="7" text-anchor="middle" font-size="2.6" fill="#64748b">${String.fromCharCode(65 + (i % 26))}</text>`,
      `<text x="${x}" y="${height - 5}" text-anchor="middle" font-size="2.6" fill="#64748b">${String.fromCharCode(65 + (i % 26))}</text>`,
    );
  }
  for (let i = 0; i < rows; i++) {
    const y = 4 + ((height - 8) * (i + 0.5)) / rows;
    lines.push(
      `<text x="6" y="${y}" text-anchor="middle" font-size="2.6" fill="#64748b">${i + 1}</text>`,
      `<text x="${width - 6}" y="${y}" text-anchor="middle" font-size="2.6" fill="#64748b">${i + 1}</text>`,
    );
  }
  return `<g data-testid="drawing-zones">${lines.join("")}</g>`;
}

function renderAnnotations(
  notes: readonly DrawingNote[],
  balloons: readonly DrawingBalloon[],
  sheetIndex: number,
  views: readonly DrawingView[] = [],
): string {
  const noteSvg = notes
    .filter((note) => note.sheet === sheetIndex)
    .map(
      (note) =>
        `<g data-note="${xml(note.id)}"><text x="${note.x}" y="${note.y}" font-size="${note.textSize ?? 3.2}" fill="#0f172a">${xml(note.text)}</text>${note.leader ? `<line x1="${note.x - 2}" y1="${note.y + 1}" x2="${note.x - (note.landing ?? 7)}" y2="${note.y + (note.landing ?? 7)}" stroke="#0f172a" stroke-width="0.3"/>` : ""}</g>`,
    )
    .join("");
  const balloonSvg = balloons
    .filter((balloon) => balloon.sheet === sheetIndex)
    .map((balloon) => {
      const pos = annotationPosition(
        balloon.x,
        balloon.y,
        balloon.bodyId,
        views,
      );
      const landing = balloon.landing ?? 7;
      return `<g data-balloon-for="${xml(balloon.bodyId ?? "")}" data-balloon-bom="${xml(balloon.bomKey ?? "")}"><line x1="${pos.x - landing}" y1="${pos.y + landing}" x2="${pos.x - 2}" y2="${pos.y + 2}" stroke="#0f172a" stroke-width="0.3"/><circle cx="${pos.x}" cy="${pos.y}" r="4" fill="#ffffff" stroke="#0f172a" stroke-width="0.4"/><text x="${pos.x}" y="${pos.y + 1.2}" text-anchor="middle" font-size="${balloon.textSize ?? 3.2}" fill="#0f172a">${xml(balloon.label)}</text></g>`;
    })
    .join("");
  const noteGroup = noteSvg
    ? `<g data-testid="drawing-notes">${noteSvg}</g>`
    : "";
  const balloonGroup = balloonSvg
    ? `<g data-testid="drawing-balloons">${balloonSvg}</g>`
    : "";
  return `${noteGroup}${balloonGroup}`;
}

const GDT_SYMBOL: Record<GdtCharacteristic, string> = {
  flatness: "FLT",
  straightness: "STR",
  circularity: "CIR",
  cylindricity: "CYL",
  position: "POS",
  concentricity: "CON",
  perpendicularity: "PERP",
  parallelism: "PAR",
  angularity: "ANG",
  profile: "PROF",
  runout: "RUN",
};

function gdtLabel(item: DrawingGdt): string {
  if (item.type === "datum") return item.datum ?? "A";
  if (item.type === "surface-finish") return `Ra ${item.ra ?? 3.2}`;
  if (item.type === "weld") {
    const size = item.weldSize ?? 3;
    const length = item.weldLength ? ` L${item.weldLength}` : "";
    const pitch = item.weldPitch ? ` P${item.weldPitch}` : "";
    return `WELD ${(item.weldType ?? "fillet").toUpperCase()} ${size}${length}${pitch}${item.allAround ? " ALL AROUND" : ""}`;
  }
  return `${GDT_SYMBOL[item.characteristic ?? "flatness"]} ${item.diameter ? "⌀" : ""}${item.tolerance ?? 0.1}`;
}

function renderGdt(
  items: readonly DrawingGdt[],
  views: readonly DrawingView[] = [],
): string {
  if (!items.length) return "";
  const body = items
    .map((item) => {
      const pos = annotationPosition(item.x, item.y, item.bodyId, views);
      if (item.type === "datum") {
        return `<g data-gdt="datum"><rect x="${pos.x}" y="${pos.y - 5}" width="7" height="7" fill="#ffffff" stroke="#0f172a" stroke-width="0.4"/><text x="${pos.x + 3.5}" y="${pos.y}" text-anchor="middle" font-size="3.5" fill="#0f172a">${xml(item.datum ?? "A")}</text></g>`;
      }
      if (item.type === "surface-finish") {
        return `<g data-gdt="surface-finish"><path d="M${pos.x} ${pos.y} l3 -5 l2 5 l3 -5" fill="none" stroke="#0f172a" stroke-width="0.4"/><text x="${pos.x + 9}" y="${pos.y}" font-size="3" fill="#0f172a">Ra ${item.ra ?? 3.2}</text></g>`;
      }
      if (item.type === "weld") {
        return `<g data-gdt="weld" data-balloon-for="${xml(item.bodyId ?? "")}"><path d="M${pos.x} ${pos.y} l5 0M${pos.x + 1} ${pos.y - 1} l3 3" fill="none" stroke="#0f172a" stroke-width="0.5"/><text x="${pos.x + 8}" y="${pos.y}" font-size="3" fill="#0f172a">${xml(gdtLabel(item))}</text></g>`;
      }
      const symbol = GDT_SYMBOL[item.characteristic ?? "flatness"];
      const datums = item.datums ?? [];
      const cell = 13 + datums.length * 5;
      const datumText = datums
        .map(
          (d, index) =>
            `<line x1="${pos.x + 13 + index * 5}" y1="${pos.y - 5}" x2="${pos.x + 13 + index * 5}" y2="${pos.y + 2}" stroke="#0f172a" stroke-width="0.3"/><text x="${pos.x + 15.5 + index * 5}" y="${pos.y - 0.5}" font-size="2.8" fill="#0f172a">${xml(d)}</text>`,
        )
        .join("");
      return `<g data-gdt="feature-control"><rect x="${pos.x}" y="${pos.y - 5}" width="${cell}" height="7" fill="#ffffff" stroke="#0f172a" stroke-width="0.4"/><line x1="${pos.x + 13}" y1="${pos.y - 5}" x2="${pos.x + 13}" y2="${pos.y + 2}" stroke="#0f172a" stroke-width="0.3"/><text x="${pos.x + 2}" y="${pos.y - 0.7}" font-size="2.4" fill="#0f172a">${xml(symbol)}</text><text x="${pos.x + 15}" y="${pos.y - 0.7}" font-size="2.8" fill="#0f172a">${item.diameter ? "⌀" : ""}${(item.tolerance ?? 0.1).toFixed(3)}</text>${datumText}</g>`;
    })
    .join("");
  return `<g data-testid="drawing-gdt">${body}</g>`;
}

// ---- section cuts ---------------------------------------------------------

function intersectTriangle(
  tri: [Vec3, Vec3, Vec3],
  axis: "x" | "y" | "z",
  offset: number,
): Vec3[] {
  const value = (p: Vec3) => p[axis];
  const points: Vec3[] = [];
  const edges: Array<[Vec3, Vec3]> = [
    [tri[0], tri[1]],
    [tri[1], tri[2]],
    [tri[2], tri[0]],
  ];
  for (const [a, b] of edges) {
    const da = value(a) - offset;
    const db = value(b) - offset;
    if (Math.abs(da) < 1e-7 && Math.abs(db) < 1e-7) {
      points.push(a, b);
    } else if (da === 0) {
      points.push(a);
    } else if (db === 0) {
      points.push(b);
    } else if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = (offset - value(a)) / (value(b) - value(a));
      points.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      });
    }
  }
  const unique: Vec3[] = [];
  for (const p of points)
    if (
      !unique.some(
        (q) =>
          Math.abs(q.x - p.x) < 1e-6 &&
          Math.abs(q.y - p.y) < 1e-6 &&
          Math.abs(q.z - p.z) < 1e-6,
      )
    )
      unique.push(p);
  return unique;
}

function clipSegmentToSectionSlab(
  a: Vec3,
  b: Vec3,
  axis: "x" | "y" | "z",
  min: number,
  max: number,
): [Vec3, Vec3] | null {
  const value = (point: Vec3) => point[axis];
  const v0 = value(a);
  const v1 = value(b);
  const inside = (valueAt: number) =>
    valueAt >= min - 1e-7 && valueAt <= max + 1e-7;
  if (inside(v0) && inside(v1)) return [a, b];
  const ts = [0, 1];
  if (Math.abs(v1 - v0) > 1e-12)
    for (const bound of [min, max]) {
      const t = (bound - v0) / (v1 - v0);
      if (t > 0 && t < 1) ts.push(t);
    }
  ts.sort((left, right) => left - right);
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]!;
    const t1 = ts[i + 1]!;
    if (t1 - t0 < 1e-9) continue;
    const mid = (t0 + t1) / 2;
    if (!inside(v0 + (v1 - v0) * mid)) continue;
    const pointAt = (t: number): Vec3 => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    });
    return [pointAt(t0), pointAt(t1)];
  }
  return null;
}

function sectionSegments(
  bodies: readonly DrawingBody[],
  projection: DrawingProjection,
  section: SectionSpec,
): ProjectedEdge[] {
  const out: ProjectedEdge[] = [];
  for (const body of bodies) {
    for (const tri of body.faces ?? []) {
      const points = intersectTriangle(tri, section.axis, section.offset);
      if (points.length < 2) continue;
      const a = points[0]!;
      const b = points[1]!;
      out.push({
        a: projectPoint(a, projection),
        b: projectPoint(b, projection),
        da: depthOf(a, projection),
        db: depthOf(b, projection),
        bodyId: body.id,
      });
    }
    const depth = Number(section.depth);
    if (depth > 0) {
      const direction = section.direction === -1 ? -1 : 1;
      const min = direction > 0 ? section.offset : section.offset - depth;
      const max = direction > 0 ? section.offset + depth : section.offset;
      for (const [index, [a, b]] of body.edges.entries()) {
        const clipped = clipSegmentToSectionSlab(a, b, section.axis, min, max);
        if (!clipped) continue;
        out.push({
          a: projectPoint(clipped[0], projection),
          b: projectPoint(clipped[1], projection),
          da: depthOf(clipped[0], projection),
          db: depthOf(clipped[1], projection),
          bodyId: body.id,
          edgeIndex: index,
          topologyId: stableEdgeId(body, index, a, b),
        });
      }
    }
  }
  return out;
}

// ---- layout / render model ------------------------------------------------

export interface ProjectedCircle {
  center: [number, number];
  radius: number;
  bodyId?: string;
  circleIndex?: number;
  id?: string;
}

function circleInProjection(
  circle: DrawingCircle,
  projection: DrawingProjection,
): boolean {
  const normal = circle.normal;
  if (!normal) return true;
  if (projection === "front") return Math.abs(normal.z) > 0.95;
  if (projection === "top") return Math.abs(normal.y) > 0.95;
  if (projection === "right") return Math.abs(normal.x) > 0.95;
  return false;
}

function projectedCircles(
  bodies: readonly DrawingBody[],
  projection: DrawingProjection,
): ProjectedCircle[] {
  return bodies.flatMap((body) =>
    (body.circles ?? []).flatMap((circle, index) =>
      circleInProjection(circle, projection)
        ? [
            {
              center: projectPoint(circle.center, projection),
              radius: circle.radius,
              bodyId: body.id,
              circleIndex: index,
              ...(circle.id ? { id: circle.id } : {}),
            },
          ]
        : [],
    ),
  );
}

function projectedAuxCircles(
  bodies: readonly DrawingBody[],
  direction: Vec3,
): ProjectedCircle[] {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return bodies.flatMap((body) =>
    (body.circles ?? []).flatMap((circle, index) => {
      const normal = circle.normal;
      const aligned =
        !normal ||
        Math.abs(
          (normal.x * direction.x +
            normal.y * direction.y +
            normal.z * direction.z) /
            length,
        ) > 0.95;
      return aligned
        ? [
            {
              center: projectAuxPoint(circle.center, direction),
              radius: circle.radius,
              bodyId: body.id,
              circleIndex: index,
              ...(circle.id ? { id: circle.id } : {}),
            },
          ]
        : [];
    }),
  );
}

export interface DrawingView {
  id: string;
  label: string;
  box: ViewBox;
  visible: ProjectedEdge[];
  hidden: ProjectedEdge[];
  circles?: ProjectedCircle[];
  scale?: number;
  hatch?: { angle: number; spacing: number };
}

export interface DrawingRender {
  width: number;
  height: number;
  sheet: DrawingSheet;
  sheetIndex: number;
  pageCount: number;
  views: DrawingView[];
  bom: BomRow[];
  bomColumns: DrawingBomColumn[];
  notes: DrawingNote[];
  balloons: DrawingBalloon[];
  gdt: DrawingGdt[];
  dimensions: DrawingDimension[];
}

export function viewBoxes(
  width: number,
  height: number,
  angle: DrawingProjectionAngle = "third",
): Record<DrawingProjection | "section", ViewBox> {
  const frame = 6;
  const titleH = 32;
  const viewTop = frame + 4;
  const viewBottom = height - titleH - frame;
  const leftW = width * 0.36;
  const rightW = width * 0.24;
  const isoW = width - leftW - rightW - frame * 4;
  const upperH = (viewBottom - viewTop) * 0.42;
  const lowerH = (viewBottom - viewTop) * 0.58;
  const firstAngle = angle === "first";
  return {
    front: firstAngle
      ? { x: frame + 4 + rightW + 4, y: viewTop, w: leftW, h: upperH }
      : { x: frame + 4, y: viewTop + upperH, w: leftW, h: lowerH },
    top: firstAngle
      ? {
          x: frame + 4 + rightW + 4,
          y: viewTop + upperH + 4,
          w: leftW,
          h: lowerH - 4,
        }
      : { x: frame + 4, y: viewTop, w: leftW, h: upperH },
    right: firstAngle
      ? { x: frame + 4, y: viewTop, w: rightW, h: upperH }
      : {
          x: frame + 4 + leftW + 4,
          y: viewTop + upperH,
          w: rightW,
          h: lowerH,
        },
    iso: {
      x: frame + 4 + leftW + rightW + 8,
      y: viewTop,
      w: isoW,
      h: viewBottom - viewTop,
    },
    section: {
      x: frame + 4 + leftW + rightW + 8,
      y: viewTop,
      w: isoW,
      h: viewBottom - viewTop,
    },
  };
}

function alignViewBox(
  box: ViewBox,
  parent: ViewBox,
  alignment: DrawingViewAlignment,
): ViewBox {
  switch (alignment) {
    case "left":
      return { ...box, x: parent.x - box.w - 2, y: parent.y };
    case "right":
      return { ...box, x: parent.x + parent.w + 2, y: parent.y };
    case "above":
      return { ...box, x: parent.x, y: parent.y - box.h - 2 };
    case "below":
      return { ...box, x: parent.x, y: parent.y + parent.h + 2 };
  }
}

export function drawingRender(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
  sheetIndex = activeSheetIndex(data),
): DrawingRender {
  const sheets = drawingSheets(data);
  const index = Math.max(0, Math.min(sheets.length - 1, sheetIndex));
  const sheet = sheets[index]!;
  const { width, height } = sheetDimensions(sheet);
  const boxes = viewBoxes(width, height, sheet.projectionAngle ?? "third");
  const renderBodies =
    Number(sheet.explode) > 0
      ? explodeDrawingBodies(bodies, Number(sheet.explode))
      : bodies;
  const sheetScale =
    sheet.scaleValue ?? parseDrawingScale(sheet.scale) ?? undefined;
  const projections: DrawingProjection[] = ["front", "top", "right"];
  const views: DrawingView[] = [];
  for (const projection of projections) {
    const edges = projectedEdges(renderBodies, projection);
    const faces = projectedFaces(renderBodies, projection);
    const split = splitEdges(edges, faces);
    views.push({
      id: projection,
      label: projection.toUpperCase(),
      box: boxes[projection],
      visible: split.visible,
      hidden: split.hidden,
      circles: projectedCircles(renderBodies, projection),
    });
  }

  const custom: Array<Omit<DrawingView, "box">> = [];
  if (sheet.section) {
    custom.push({
      id: "section",
      label: `SECTION A-A · ${sheet.section.axis.toUpperCase()} ${sheet.section.offset}`,
      visible: sectionSegments(renderBodies, "iso", sheet.section),
      hidden: [],
      hatch: {
        angle: sheet.section.hatchAngle ?? 45,
        spacing: sheet.section.hatchSpacing ?? 3,
      },
    });
  }
  if (sheet.detail) {
    const detail = detailViewEdges(renderBodies, sheet.detail);
    custom.push({
      id: "detail",
      label: `${sheet.detail.label} · SCALE ${sheet.detail.scale}:1`,
      visible: detail.visible,
      hidden: detail.hidden,
      scale: sheet.detail.scale,
    });
  }
  if (sheet.brokenOut) {
    const broken = detailViewEdges(renderBodies, sheet.brokenOut);
    custom.push({
      id: "broken-out",
      label: `${sheet.brokenOut.label} · BROKEN OUT · SCALE ${sheet.brokenOut.scale}:1`,
      visible: broken.visible,
      hidden: broken.hidden,
      scale: sheet.brokenOut.scale,
    });
  }
  if (sheet.auxiliary) {
    const aux = sheet.auxiliary;
    const edges = projectedAuxEdges(renderBodies, aux.direction);
    const faces = projectedAuxFaces(renderBodies, aux.direction);
    const split = splitEdges(edges, faces);
    custom.push({
      id: "auxiliary",
      label: aux.label,
      visible: split.visible,
      hidden: split.hidden,
      circles: projectedAuxCircles(renderBodies, aux.direction),
    });
  }
  for (const view of sheet.customViews ?? []) {
    const edges = projectedAuxEdges(renderBodies, view.direction);
    const faces = projectedAuxFaces(renderBodies, view.direction);
    const split = splitEdges(edges, faces);
    custom.push({
      id: `custom:${view.id}`,
      label: view.label,
      visible: split.visible,
      hidden: split.hidden,
      circles: projectedAuxCircles(renderBodies, view.direction),
      ...(view.scale ? { scale: view.scale } : {}),
    });
  }

  const area = boxes.iso;
  const customHeight = custom.length ? area.h / custom.length : area.h;
  custom.forEach((view, customIndex) => {
    views.push({
      ...view,
      box: {
        x: area.x,
        y: area.y + customIndex * customHeight,
        w: area.w,
        h: customHeight,
      },
    });
  });
  if (!custom.length) {
    const edges = projectedEdges(renderBodies, "iso");
    const faces = projectedFaces(renderBodies, "iso");
    const split = splitEdges(edges, faces);
    views.push({
      id: "iso",
      label: Number(sheet.explode) > 0 ? "EXPLODED ISOMETRIC" : "ISOMETRIC",
      box: boxes.iso,
      visible: split.visible,
      hidden: split.hidden,
      circles: projectedCircles(renderBodies, "iso"),
    });
  }

  const configured = views.flatMap((view) => {
    const config = sheet.viewConfig?.[view.id as DrawingViewId];
    if (config?.suppressed) return [];
    let box: ViewBox = {
      x: Number.isFinite(config?.x) ? Number(config!.x) : view.box.x,
      y: Number.isFinite(config?.y) ? Number(config!.y) : view.box.y,
      w:
        Number.isFinite(config?.w) && Number(config!.w) > 0
          ? Number(config!.w)
          : view.box.w,
      h:
        Number.isFinite(config?.h) && Number(config!.h) > 0
          ? Number(config!.h)
          : view.box.h,
    };
    const parent = config?.parent
      ? views.find((candidate) => candidate.id === config.parent)
      : undefined;
    if (parent && config?.alignment)
      box = alignViewBox(box, parent.box, config.alignment);
    const scale =
      config?.scale ??
      sheet.viewScales?.[view.id as DrawingViewId] ??
      view.scale ??
      sheetScale;
    return [
      {
        ...view,
        label: config?.label?.trim() || view.label,
        box,
        ...(scale && scale > 0 ? { scale } : {}),
      },
    ];
  });

  return {
    width,
    height,
    sheet,
    sheetIndex: index,
    pageCount: sheets.length,
    views: configured,
    bom: sheet.showBom ? applyDrawingBom(bom, data.bom) : [],
    bomColumns: drawingBomColumns(data),
    notes: data.notes.filter((note) => note.sheet === index),
    balloons: data.balloons.filter((balloon) => balloon.sheet === index),
    gdt: (data.gdt ?? []).filter((item) => item.sheet === index),
    dimensions: (data.dimensions ?? []).filter((item) => item.sheet === index),
  };
}

export function drawingSvg(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
  sheetIndex = activeSheetIndex(data),
): string {
  const render = drawingRender(data, bodies, bom, sheetIndex);
  const { width, height, sheet } = render;
  const views = render.views
    .map((view) =>
      renderView(
        view.visible,
        view.hidden,
        view.box,
        view.label,
        sheet.showHiddenLines,
        {
          ...(view.scale ? { scale: view.scale } : {}),
          ...(sheet.lineWeight ? { lineWeight: sheet.lineWeight } : {}),
          ...(sheet.plotStyle ? { plotStyle: sheet.plotStyle } : {}),
          ...(view.hatch ? { hatch: view.hatch } : {}),
        },
      ),
    )
    .join("");
  const dimensions = render.dimensions.length
    ? render.dimensions
        .map((dimension) => {
          const view = render.views.find(
            (candidate) => candidate.id === dimension.view,
          );
          return view ? renderDimension(view, dimension) : "";
        })
        .join("")
    : render.views
        .map((view) => renderDimensions(view.visible, view.box, view.id))
        .join("");
  const framed = sheet.template !== "NONE";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" data-testid="drawing-sheet" data-sheet="${render.sheetIndex + 1}" data-template="${sheet.template ?? "ISO"}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
${framed ? `<rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#0f172a" stroke-width="0.6"/>` : ""}
${framed ? renderZones(sheet, width, height) : ""}
${framed ? `<text x="${width / 2}" y="3.5" text-anchor="middle" font-size="3" fill="#64748b">${xml(sheet.title)}</text>` : ""}
${views}
${dimensions}
${renderAnnotations(render.notes, render.balloons, render.sheetIndex, render.views)}
${renderGdt(render.gdt, render.views)}
${renderBom(render.bom, sheet, width, height, render.bomColumns)}
${framed ? renderTitleBlock(sheet, width, height, render.sheetIndex, render.pageCount) : ""}
</svg>`;
}

// ---- vector PDF -----------------------------------------------------------

const PT_PER_MM = 72 / 25.4;

export function pdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7e]/g, "?");
}

class PdfWriter {
  private objects: string[] = [];

  reserve(): number {
    this.objects.push("");
    return this.objects.length;
  }

  set(id: number, body: string): void {
    this.objects[id - 1] = body;
  }

  add(body: string): number {
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  build(): string {
    const header = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const parts: string[] = [header];
    const offsets: number[] = [];
    let offset = new TextEncoder().encode(header).length;
    this.objects.forEach((body, index) => {
      offsets.push(offset);
      const object = `${index + 1} 0 obj\n${body}\nendobj\n`;
      parts.push(object);
      offset += new TextEncoder().encode(object).length;
    });
    const xrefStart = offset;
    const xref = [
      `xref\n0 ${this.objects.length + 1}\n`,
      "0000000000 65535 f \n",
      ...offsets.map(
        (value) => `${String(value).padStart(10, "0")} 00000 n \n`,
      ),
      `trailer\n<< /Size ${this.objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
    ].join("");
    parts.push(xref);
    return parts.join("");
  }
}

interface PdfPageContext {
  pageHeight: number;
  lines: string[];
}

function pdfY(ctx: PdfPageContext, mm: number): number {
  return ctx.pageHeight - mm * PT_PER_MM;
}

function pdfLine(
  ctx: PdfPageContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  ctx.lines.push(
    `${(x1 * PT_PER_MM).toFixed(3)} ${pdfY(ctx, y1).toFixed(3)} m ${(x2 * PT_PER_MM).toFixed(3)} ${pdfY(ctx, y2).toFixed(3)} l S`,
  );
}

function pdfRect(
  ctx: PdfPageContext,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  pdfLine(ctx, x, y, x + w, y);
  pdfLine(ctx, x + w, y, x + w, y + h);
  pdfLine(ctx, x + w, y + h, x, y + h);
  pdfLine(ctx, x, y + h, x, y);
}

function pdfTextLine(
  ctx: PdfPageContext,
  x: number,
  y: number,
  size: number,
  text: string,
): void {
  ctx.lines.push(
    `BT /F1 ${size.toFixed(2)} Tf ${(x * PT_PER_MM).toFixed(3)} ${pdfY(ctx, y).toFixed(3)} Td (${pdfText(text)}) Tj ET`,
  );
}

function viewFrameFor(view: DrawingView): ViewFrame | null {
  return viewFrame([...view.visible, ...view.hidden], view.box);
}

function renderPdfPage(render: DrawingRender): string {
  const { width, height, sheet } = render;
  const ctx: PdfPageContext = {
    pageHeight: height * PT_PER_MM,
    lines: ["0.5 w", "0 0 0 RG", "0 0 0 rg"],
  };
  pdfRect(ctx, 4, 4, width - 8, height - 8);
  for (const view of render.views) {
    const frame = viewFrameFor(view);
    pdfRect(ctx, view.box.x, view.box.y, view.box.w, view.box.h);
    pdfTextLine(ctx, view.box.x + 2, view.box.y + 5, 7, view.label);
    if (!frame) continue;
    for (const edge of view.visible)
      pdfLine(
        ctx,
        frame.tx(edge.a[0]),
        frame.ty(edge.a[1]),
        frame.tx(edge.b[0]),
        frame.ty(edge.b[1]),
      );
    if (sheet.showHiddenLines) {
      ctx.lines.push("[2 2] 0 d");
      for (const edge of view.hidden)
        pdfLine(
          ctx,
          frame.tx(edge.a[0]),
          frame.ty(edge.a[1]),
          frame.tx(edge.b[0]),
          frame.ty(edge.b[1]),
        );
      ctx.lines.push("[] 0 d");
    }
  }
  for (const dimension of render.dimensions) {
    const view = render.views.find(
      (candidate) => candidate.id === dimension.view,
    );
    const g = view ? dimensionGeometry(view, dimension) : null;
    if (!g) continue;
    if (g.axis === "horizontal") {
      pdfLine(ctx, g.x1, g.y1, g.x1, g.start);
      pdfLine(ctx, g.x2, g.y2, g.x2, g.start);
      pdfLine(ctx, g.x1, g.start, g.x2, g.start);
      pdfTextLine(ctx, (g.x1 + g.x2) / 2, g.start - 1, 7, g.value.toFixed(1));
    } else {
      pdfLine(ctx, g.x1, g.y1, g.start, g.y1);
      pdfLine(ctx, g.x2, g.y2, g.start, g.y2);
      pdfLine(ctx, g.start, g.y1, g.start, g.y2);
      pdfTextLine(ctx, g.start + 1, (g.y1 + g.y2) / 2, 7, g.value.toFixed(1));
    }
  }
  for (const note of render.notes)
    pdfTextLine(ctx, note.x, note.y, 8, note.text);
  for (const item of render.gdt) {
    const pos = annotationPosition(item.x, item.y, item.bodyId, render.views);
    const prefix = item.type === "surface-finish" ? "SURFACE " : "";
    pdfTextLine(ctx, pos.x, pos.y, 7, `${prefix}${gdtLabel(item)}`);
  }
  for (const balloon of render.balloons) {
    const pos = annotationPosition(
      balloon.x,
      balloon.y,
      balloon.bodyId,
      render.views,
    );
    const cx = pos.x * PT_PER_MM;
    const cy = pdfY(ctx, pos.y);
    const r = 4 * PT_PER_MM;
    const k = 0.5522847498 * r;
    ctx.lines.push(
      `${cx + r} ${cy} m`,
      `${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} c`,
      `${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} c`,
      `${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} c`,
      `${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} c S`,
    );
    pdfTextLine(ctx, pos.x - 1.5, pos.y + 1, 7, balloon.label);
  }

  if (render.bom.length) {
    const rowH = 5;
    const tableW = Math.min(180, width * 0.5);
    const tableH = rowH * (render.bom.length + 1) + 4;
    const x = width - tableW - 8;
    const y = height - 34 - tableH;
    const columns = render.bomColumns;
    const totalWeight = columns.reduce(
      (sum, column) => sum + bomColumnWeight(column),
      0,
    );
    const columnX = (index: number) =>
      x +
      (tableW *
        columns
          .slice(0, index)
          .reduce((sum, column) => sum + bomColumnWeight(column), 0)) /
        totalWeight;
    pdfRect(ctx, x, y, tableW, tableH);
    columns.forEach((column, index) =>
      pdfTextLine(
        ctx,
        columnX(index) + 1.2,
        y + 3.5,
        5.5,
        BOM_COLUMN_LABEL[column],
      ),
    );
    render.bom.forEach((row, index) => {
      const ry = y + rowH * (index + 1);
      pdfLine(ctx, x, ry, x + tableW, ry);
      columns.forEach((column, columnIndex) =>
        pdfTextLine(
          ctx,
          columnX(columnIndex) + 1.2,
          ry + 3.4,
          5.5,
          bomCell(row, index, column),
        ),
      );
    });
  }

  const tw = Math.min(150, width * 0.48);
  const tx = width - tw - 8;
  const ty = height - 32;
  pdfRect(ctx, tx, ty, tw, 24);
  pdfLine(ctx, tx, ty + 14, tx + tw, ty + 14);
  pdfLine(ctx, tx + 62, ty, tx + 62, ty + 14);
  pdfTextLine(ctx, tx + 2, ty + 5, 7, "TITLE");
  pdfTextLine(ctx, tx + 2, ty + 11, 10, sheet.title);
  pdfTextLine(ctx, tx + 64, ty + 5, 7, "DRAWING NO.");
  pdfTextLine(ctx, tx + 64, ty + 11, 9, sheet.number);
  pdfTextLine(
    ctx,
    tx + 2,
    ty + 21,
    6,
    `${sheet.size} ${sheet.orientation.toUpperCase()}  SCALE ${sheet.scale}  SHEET ${render.sheetIndex + 1}/${render.pageCount}`,
  );
  return ctx.lines.join("\n");
}

export function drawingPdf(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
): string {
  const pageCount = drawingSheets(data).length;
  const writer = new PdfWriter();
  const catalog = writer.reserve();
  const pages = writer.reserve();
  const font = writer.reserve();
  writer.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  writer.set(font, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    pageIds.push(writer.reserve());
    contentIds.push(writer.reserve());
  }
  for (let i = 0; i < pageCount; i++) {
    const render = drawingRender(data, bodies, bom, i);
    const content = renderPdfPage(render);
    writer.set(
      contentIds[i]!,
      `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
    );
    const pageWidth = (render.width * PT_PER_MM).toFixed(3);
    const pageHeight = (render.height * PT_PER_MM).toFixed(3);
    writer.set(
      pageIds[i]!,
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`,
    );
  }
  writer.set(
    pages,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );
  return writer.build();
}

// ---- DXF ------------------------------------------------------------------

function dxfText(
  value: string,
  layer: string,
  x: number,
  y: number,
  height = 2.5,
): string {
  return [
    "0",
    "TEXT",
    "8",
    layer,
    "10",
    x.toFixed(3),
    "20",
    y.toFixed(3),
    "30",
    "0",
    "40",
    height.toFixed(3),
    "1",
    pdfText(value),
    "",
  ].join("\n");
}

export function drawingDxf(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
  sheetIndex = activeSheetIndex(data),
  includeDimensions = true,
): string {
  const render = drawingRender(data, bodies, bom, sheetIndex);
  const out: string[] = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$INSUNITS",
    "70",
    "4",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "TABLES",
    "0",
    "TABLE",
    "2",
    "LAYER",
    "70",
    "3",
    "0",
    "LAYER",
    "2",
    "VISIBLE",
    "70",
    "0",
    "62",
    "7",
    "6",
    "CONTINUOUS",
    "0",
    "LAYER",
    "2",
    "HIDDEN",
    "70",
    "0",
    "62",
    "8",
    "6",
    "DASHED",
    "0",
    "LAYER",
    "2",
    "ANNOTATION",
    "70",
    "0",
    "62",
    "3",
    "6",
    "CONTINUOUS",
    "0",
    "ENDTAB",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
  ];
  const line = (
    layer: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) =>
    out.push(
      "0",
      "LINE",
      "8",
      layer,
      "10",
      x1.toFixed(3),
      "20",
      (render.height - y1).toFixed(3),
      "30",
      "0",
      "11",
      x2.toFixed(3),
      "21",
      (render.height - y2).toFixed(3),
      "31",
      "0",
    );
  const circle = (layer: string, x: number, y: number, radius: number) =>
    out.push(
      "0",
      "CIRCLE",
      "8",
      layer,
      "10",
      x.toFixed(3),
      "20",
      (render.height - y).toFixed(3),
      "30",
      "0",
      "40",
      radius.toFixed(3),
    );
  const polyline = (
    layer: string,
    points: ReadonlyArray<readonly [number, number]>,
    closed = true,
  ) =>
    out.push(
      "0",
      "LWPOLYLINE",
      "8",
      layer,
      "90",
      String(points.length),
      "70",
      closed ? "1" : "0",
      ...points.flatMap(([x, y]) => [
        "10",
        x.toFixed(3),
        "20",
        (render.height - y).toFixed(3),
      ]),
    );

  // Native frame, title-block outline and balloon circles, so the DWG carries
  // more than LINE/TEXT entities when opened in a CAD application.
  polyline("ANNOTATION", [
    [4, 4],
    [render.width - 4, 4],
    [render.width - 4, render.height - 4],
    [4, render.height - 4],
  ]);
  const titleWidth = Math.min(150, render.width * 0.48);
  const titleX = render.width - titleWidth - 8;
  const titleY = render.height - 32;
  polyline("ANNOTATION", [
    [titleX, titleY],
    [titleX + titleWidth, titleY],
    [titleX + titleWidth, titleY + 24],
    [titleX, titleY + 24],
  ]);
  line("ANNOTATION", titleX, titleY + 14, titleX + titleWidth, titleY + 14);
  line("ANNOTATION", titleX + 62, titleY, titleX + 62, titleY + 14);

  for (const view of render.views) {
    const frame = viewFrameFor(view);
    if (!frame) continue;
    for (const edge of view.visible)
      line(
        "VISIBLE",
        frame.tx(edge.a[0]),
        frame.ty(edge.a[1]),
        frame.tx(edge.b[0]),
        frame.ty(edge.b[1]),
      );
    if (render.sheet.showHiddenLines)
      for (const edge of view.hidden)
        line(
          "HIDDEN",
          frame.tx(edge.a[0]),
          frame.ty(edge.a[1]),
          frame.tx(edge.b[0]),
          frame.ty(edge.b[1]),
        );
    out.push(
      dxfText(
        view.label,
        "ANNOTATION",
        view.box.x + 2,
        render.height - view.box.y - 5,
        3,
      ),
    );
  }
  if (includeDimensions)
    for (const dimension of render.dimensions) {
      const view = render.views.find(
        (candidate) => candidate.id === dimension.view,
      );
      const g = view ? dimensionGeometry(view, dimension) : null;
      if (!g) continue;
      if (g.axis === "horizontal") {
        line("ANNOTATION", g.x1, g.y1, g.x1, g.start);
        line("ANNOTATION", g.x2, g.y2, g.x2, g.start);
        line("ANNOTATION", g.x1, g.start, g.x2, g.start);
        out.push(
          dxfText(
            g.value.toFixed(1),
            "ANNOTATION",
            (g.x1 + g.x2) / 2,
            render.height - g.start + 1,
            3,
          ),
        );
      } else {
        line("ANNOTATION", g.x1, g.y1, g.start, g.y1);
        line("ANNOTATION", g.x2, g.y2, g.start, g.y2);
        line("ANNOTATION", g.start, g.y1, g.start, g.y2);
        out.push(
          dxfText(
            g.value.toFixed(1),
            "ANNOTATION",
            g.start + 1,
            render.height - (g.y1 + g.y2) / 2,
            3,
          ),
        );
      }
    }
  for (const note of render.notes)
    out.push(
      dxfText(note.text, "ANNOTATION", note.x, render.height - note.y, 3),
    );
  for (const balloon of render.balloons) {
    const pos = annotationPosition(
      balloon.x,
      balloon.y,
      balloon.bodyId,
      render.views,
    );
    line("ANNOTATION", pos.x - 7, pos.y + 7, pos.x - 2, pos.y + 2);
    circle("ANNOTATION", pos.x, pos.y, 4);
    out.push(
      dxfText(
        balloon.label,
        "ANNOTATION",
        pos.x - 1,
        render.height - pos.y + 1,
        3,
      ),
    );
  }
  for (const item of render.gdt) {
    const pos = annotationPosition(item.x, item.y, item.bodyId, render.views);
    out.push(
      dxfText(gdtLabel(item), "ANNOTATION", pos.x, render.height - pos.y, 3),
    );
  }
  out.push(
    dxfText(render.sheet.title, "ANNOTATION", render.width - 150, 12, 5),
    dxfText(
      `${render.sheet.number} · ${render.sheet.size} · SHEET ${render.sheetIndex + 1}/${render.pageCount}`,
      "ANNOTATION",
      render.width - 150,
      8,
      3,
    ),
  );
  if (render.sheet.showBom && render.bom.length) {
    let y = render.height - 34 - 5 * (render.bom.length + 1);
    const columns = render.bomColumns;
    const totalWeight = columns.reduce(
      (sum, column) => sum + bomColumnWeight(column),
      0,
    );
    const columnX = (index: number) =>
      10 +
      (150 *
        columns
          .slice(0, index)
          .reduce((sum, column) => sum + bomColumnWeight(column), 0)) /
        totalWeight;
    columns.forEach((column, index) =>
      out.push(
        dxfText(BOM_COLUMN_LABEL[column], "ANNOTATION", columnX(index), y, 3),
      ),
    );
    render.bom.forEach((row, index) => {
      y += 5;
      columns.forEach((column, columnIndex) =>
        out.push(
          dxfText(
            bomCell(row, index, column),
            "ANNOTATION",
            columnX(columnIndex),
            y,
            2.6,
          ),
        ),
      );
    });
  }
  out.push("0", "ENDSEC", "0", "EOF", "");
  return out.join("\n");
}

export function drawingSvgSheets(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
): string {
  const sheets = drawingSheets(data);
  if (sheets.length <= 1) return drawingSvg(data, bodies, bom, 0);
  const pages = sheets.map((_, index) => {
    const page = drawingSvg(data, bodies, bom, index);
    return page.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  });
  const sizes = sheets.map((_, index) =>
    drawingRender(data, bodies, bom, index),
  );
  const widths = sizes.map((page) => page.width);
  const gap = 8;
  const maxWidth = Math.max(...widths);
  const totalHeight =
    sizes.reduce((sum, page) => sum + page.height, 0) +
    gap * (sizes.length - 1);
  let y = 0;
  const nested = sizes.map((page, index) => {
    const x = (maxWidth - page.width) / 2;
    const body = `<svg data-sheet="${index + 1}" x="${x}" y="${y}" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}">${pages[index]}</svg>`;
    y += page.height + gap;
    return body;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidth}mm" height="${totalHeight}mm" viewBox="0 0 ${maxWidth} ${totalHeight}" data-testid="drawing-sheets"><rect width="${maxWidth}" height="${totalHeight}" fill="#e5e7eb"/>${nested.join("")}</svg>`;
}

/** Browser print/plot path. Each sheet is emitted at its real paper size. */
export function drawingPrintHtml(
  data: DrawingTabData,
  bodies: readonly DrawingBody[],
  bom: readonly BomRow[],
): string {
  const sheets = drawingSheets(data);
  const first = sheets[0] ?? defaultDrawingSheet();
  const firstSize = sheetDimensions(first);
  const pages = sheets
    .map((sheet, index) => {
      const size = sheetDimensions(sheet);
      return `<section class="sheet-page" data-print-sheet="${index + 1}" style="width:${size.width}mm;height:${size.height}mm">${drawingSvg(data, bodies, sheet.showBom ? bom : [], index)}</section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${xml(first.number)}</title><style>@page{size:${firstSize.width}mm ${firstSize.height}mm;margin:0}html,body{margin:0;background:#fff}.sheet-page{page-break-after:always;break-after:page;overflow:hidden}.sheet-page:last-child{page-break-after:auto;break-after:auto}svg{display:block}</style></head><body>${pages}<script>window.addEventListener('load',function(){window.print()})</script></body></html>`;
}
