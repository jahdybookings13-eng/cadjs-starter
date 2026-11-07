export const SCENE = {
  backgroundTop: 0xe8e8e8,
  backgroundBottom: 0xc0c0c0,
  gridMajor: 0xcccccc,
  gridMinor: 0xdddddd,
  groundPlane: 0xf0f0f0,
  groundPlaneOpacity: 0.15,
};

export const LIGHTING = {
  ambient: { color: 0xffffff, intensity: 0.45 },
  hemisphereTop: 0xf0f0f0,
  hemisphereBottom: 0xd0cfc8,
  hemisphereIntensity: 0.4,
  keyLight: {
    color: 0xffffff,
    intensity: 0.7,
    position: [8, 10, 10] as readonly [number, number, number],
  },
  fillLight: {
    color: 0xffffff,
    intensity: 0.25,
    position: [-6, -4, 8] as readonly [number, number, number],
  },
};

export const BODY = {
  default: 0xa8a9ad, // Steel satin gray
  edge: 0x333333, // Dark gray edges (always visible)
  edgeOpacity: 1.0,
  edgeWidth: 1.5, // Screen-pixel width for body edge overlay (LineMaterial)
  edgeAngleDeg: 15, // EdgesGeometry crease threshold (degrees)
  selected: 0x2e75b6, // Blue selection
  hover: 0x4a90d9, // Blue pre-selection (lighter)
  dimmedOpacity: 0.25, // Opacity when bodies are dimmed (sketch mode)
  dimmedColor: 0xb8b8b8, // Slightly lighter gray when dimmed
};

export const SELECTION = {
  selected: 0x2e75b6, // Blue
  hover: 0x4a90d9, // Lighter blue
};

export const SKETCH = {
  underconstrained: 0x1e90ff, // Dodger blue (like Fusion 360)
  constrained: 0x111111, // Near-black
  overconstrained: 0xff0000, // Red
  preview: 0x1e90ff, // Blue preview while drawing
  point: 0xffffff, // White (Fusion 360 style)
  pointConstrained: 0x111111, // Dark (constrained point)
  selected: 0x2e75b6, // Blue selection
  selectedLine: 0x2e75b6, // Blue selected line
  selectedPoint: 0x5ba3e0, // Lighter blue selected point
  profileHover: 0x87ceeb, // Light blue profile fill on hover
  profileHoverOpacity: 0.3,
  profileFill: 0x87ceeb, // Translucent blue closed profile fill
  profileFillOpacity: 0.15,
  construction: 0xff8800, // Orange construction lines
  constructionSelected: 0xffaa44, // Selected construction lines
  constraintGlyph: 0xddaa00, // Gold for constraint symbols
  constraintGlyphBg: 0x333333, // Dark background circle
  trimHighlight: 0xff4444, // Red for segment to be removed
  extendPreview: 0x44ff44, // Green for extension preview line
  fixed: 0x00cc44, // Green for fixed/pinned points
  originPoint: 0xffcc00, // Yellow origin construction point
  xAxisLine: 0xff4444, // Red X axis
  yAxisLine: 0x44dd44, // Green Y axis
  // CSS-string variants for canvas-drawn constraint glyphs (canvas API needs strings, not 0xRRGGBB)
  constraintFillCss: "#333333",
  constraintFillSelectedCss: "#0066ff",
  constraintStrokeSelectedCss: "#3399ff",
  constraintTextCss: "#ddaa00",
  constraintTextSelectedCss: "#ffffff",
};

export const INFERENCE = {
  endpoint: 0x00cc44, // Green (Fusion 360 style)
  midpoint: 0x00cc44, // Green
  center: 0x00cc44, // Green
  quadrant: 0x00cc44, // Green
  intersection: 0x00cc44, // Green
  default: 0x00cc44, // Green
  guidelineChain: 0x00bcd4, // Teal for chain guidelines
  guidelinePoint: 0x5ba3e0, // Soft blue for point guidelines
};

export const SKETCH_PLANE = {
  xy: 0x4488ff,
  xz: 0x44ff88,
  yz: 0xff6644,
  hover: 0xffff44,
  xAxis: 0xff4444,
  yAxis: 0x44ff44,
  zAxis: 0x4488ff,
  edge: 0xffffff,
  origin: 0xffffff,
  grid: 0x888888,
  gridMajor: 0xbbbbbb,
  gridMinor: 0xd0d0d0,
};

/**
 * Colors for the plane-selector ViewCube (mini cube shown when entering sketch
 * mode). Distinct from {@link SKETCH_PLANE} which renders the actual sketch
 * plane in the 3D scene; the selector uses brighter/more saturated shades for
 * UI affordance.
 */
export const PLANE_SELECTOR = {
  xy: 0x4444ff,
  xz: 0x44ff44,
  yz: 0xff4444,
  hover: 0xffff00,
  background: 0x2a2a2a, // Dark background for the mini selector scene
  // CSS-string variants for inline style props
  xyCss: "#4444ff",
  xzCss: "#44ff44",
  yzCss: "#ff4444",
  faceCss: "#2e75b6",
  // Hovered-label tint also used inline in simpleCadScene
  wireframe: 0x888888,
};

export const EXTRUDE = {
  arrow: 0x2e75b6, // Blue arrows instead of green
  arrowSecondary: 0x2e75b6, // Same blue, lower opacity
  profileHighlight: 0x87ceeb,
  cutArrow: 0xcc3333, // Red arrows for cut direction
  cutArrowSecondary: 0xcc3333, // Same red, lower opacity
  cutPreview: 0xff6b6b, // Light red/salmon preview volume
};

export const FILLET = {
  edgeHighlight: 0xff8800, // Orange, selected edges
  edgeHover: 0xffaa44, // Lighter orange, hovered edge
  edgeWidth: 2.5, // Screen-pixel width for fillet edge picking overlay
  preview: 0xa8a9ad, // Body default for preview mesh
  previewOpacity: 0.6,
};

export const SWEEP = {
  pathPreview: 0x2e75b6,
  pathPoint: 0x4a90d9,
  profileHighlight: 0x87ceeb,
  preview: 0xa8a9ad,
  previewOpacity: 0.6,
};

export const LOFT = {
  profileHighlight: 0x2e75b6,
  profileHover: 0x4a90d9,
  preview: 0xa8a9ad,
  previewOpacity: 0.6,
};

export const REVOLVE = {
  axisLine: 0xff8800, // Orange axis line
  axisHover: 0xffaa44, // Lighter orange on hover
  profileHighlight: 0x87ceeb, // Same as extrude
  preview: 0xa8a9ad, // Body default for preview
  previewOpacity: 0.6,
  sketchLineAxis: 0x44aaff, // Blue tint for sketch line axes
  bodyEdgeAxis: 0xaaff44, // Green tint for other body edges
};

export const COMBINE = {
  targetHighlight: 0x00b8d4, // Teal, target body
  toolHighlight: 0xff8800, // Orange, tool bodies
  targetHover: 0x4dd0e1, // Lighter teal, hover when picking target
  toolHover: 0xffaa44, // Lighter orange, hover when picking tools
};

export const MEASURE = {
  line: 0x00cc44, // Green measurement lines
  lineHover: 0x44ff88, // Lighter green hover
  point: 0xff4444, // Red measurement points
  text: 0x00cc44, // Green label text
  textBg: 0x222222, // Dark label background
  textBgCss: "#222222", // CSS-string variant for canvas-drawn labels
  angleArc: 0xffaa00, // Orange angle arc
  edgeHighlight: 0x00cc44, // Green edge highlight
  pinnedLine: 0x2e75b6, // Blue for pinned measurements
  pinnedText: 0x2e75b6, // Blue pinned label text
};

export const DEBUG = {
  wireframe: 0x666666, // Neutral gray wireframe (was green)
  invalidMesh: 0xff0000, // Bright red placeholder shown when a BRep is structurally invalid
};

export const VIEWCUBE = {
  face: 0x5a5a5a, // Medium gray face
  faceHover: 0x6a8abf, // Blue-gray on hover
  faceBorder: 0x444444, // Dark gray edge lines
  text: "#e0e0e0", // Light text on faces (CSS color)
  textBold: "#ffffff", // Active/hovered text
  background: 0x2a2a2a, // Dark background for the mini scene
  // CSS-string variants for canvas drawing
  faceCss: "#5a5a5a",
  faceHoverCss: "#6a8abf",
  faceBorderCss: "#444444",
};

export const HELPERS = {
  edgeColor: 0x555555, // Subtle dark gray edges (was cyan)
  edgeWidth: 1.5, // Screen-pixel width for selection-mode edge helpers
  vertexColor: 0xff4444, // Soft red vertices
};

/**
 * Frozen snapshot of the original theme values, captured at module load before
 * any consumer override could run. Read-only, useful for "reset to defaults"
 * UI or for debugging "what was this color originally".
 */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      const value = (obj as Record<string, unknown>)[key];
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        deepFreeze(value);
      }
    }
  }
  return obj;
}

export const THEME_DEFAULTS = deepFreeze({
  SCENE: structuredClone(SCENE),
  LIGHTING: structuredClone(LIGHTING),
  BODY: structuredClone(BODY),
  SELECTION: structuredClone(SELECTION),
  SKETCH: structuredClone(SKETCH),
  INFERENCE: structuredClone(INFERENCE),
  SKETCH_PLANE: structuredClone(SKETCH_PLANE),
  PLANE_SELECTOR: structuredClone(PLANE_SELECTOR),
  EXTRUDE: structuredClone(EXTRUDE),
  FILLET: structuredClone(FILLET),
  SWEEP: structuredClone(SWEEP),
  LOFT: structuredClone(LOFT),
  REVOLVE: structuredClone(REVOLVE),
  COMBINE: structuredClone(COMBINE),
  MEASURE: structuredClone(MEASURE),
  DEBUG: structuredClone(DEBUG),
  VIEWCUBE: structuredClone(VIEWCUBE),
  HELPERS: structuredClone(HELPERS),
});
