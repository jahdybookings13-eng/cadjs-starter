// Render Studio document model.
//
// The model owns persisted appearance, environment, light, camera and output
// settings. The pipeline in `pipeline.ts` renders the live scene offscreen from
// this state; no network assets are required, and texture entries are local/data
// resources validated by name and URL.

export const RENDER_SCHEMA = "scadgen.renderstudio";
export const RENDER_VERSION = 2 as const;

export type RenderProjection = "perspective" | "orthographic";
export type RenderLightKind = "directional" | "point" | "spot" | "sun";
export type RenderEnvironmentKind = "studio" | "sun" | "sky" | "none";
export type RenderFormat = "png" | "jpeg" | "webp";
export type RenderSizePreset = "preview" | "final" | "print";
export type RenderPreset = RenderSizePreset | "custom";

/** Largest accepted output; 4096 x 4096 at RGBA8. */
export const RENDER_MAX_PIXELS = 16_777_216;
export const RENDER_MAX_DIMENSION = 8192;

export const RENDER_SIZE_PRESETS: readonly {
  id: RenderSizePreset;
  label: string;
  width: number;
  height: number;
}[] = [
  { id: "preview", label: "Preview · 1280 × 720", width: 1280, height: 720 },
  { id: "final", label: "Final · 1920 × 1080", width: 1920, height: 1080 },
  { id: "print", label: "Print · 3840 × 2160", width: 3840, height: 2160 },
];

export interface RenderOutput {
  preset: RenderPreset;
  width: number;
  height: number;
  format: RenderFormat;
  /** Encoder quality for JPEG/WebP, 0..1. PNG ignores it. */
  quality: number;
}

export interface RenderVec3 {
  x: number;
  y: number;
  z: number;
}

export interface RenderTexture {
  name: string;
  /** Local file path or data URL. Empty is invalid. */
  url: string;
}

export interface RenderMaterial {
  id: string;
  name: string;
  /** sRGB hex, e.g. #b8c0cc. */
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  texture: RenderTexture | null;
}

export interface RenderAssignment {
  bodyId: string;
  materialId: string;
}

export interface RenderLight {
  id: string;
  name: string;
  kind: RenderLightKind;
  color: string;
  intensity: number;
  shadows: boolean;
  position: RenderVec3;
  target: RenderVec3;
  /** Spot cone angle in degrees. */
  angle: number;
  /** Spot penumbra, 0..1. */
  penumbra: number;
}

export interface RenderBookmark {
  id: string;
  name: string;
  position: RenderVec3;
  target: RenderVec3;
}

export interface RenderCamera {
  id: string;
  name: string;
  projection: RenderProjection;
  position: RenderVec3;
  target: RenderVec3;
  /** Perspective field of view in degrees. */
  fov: number;
  /** Orthographic focal length in mm. */
  focalLength: number;
  near: number;
  far: number;
  bookmarks: RenderBookmark[];
}

export interface RenderEnvironment {
  kind: RenderEnvironmentKind;
  /** Exposure multiplier. 1 is neutral. */
  exposure: number;
  /** Hex background color. */
  background: string;
  sunAzimuth: number;
  sunElevation: number;
  intensity: number;
}

export interface RenderDocument {
  schema: typeof RENDER_SCHEMA;
  v: typeof RENDER_VERSION;
  name: string;
  materials: RenderMaterial[];
  assignments: RenderAssignment[];
  lights: RenderLight[];
  cameras: RenderCamera[];
  environment: RenderEnvironment;
  activeCameraId: string;
  output: RenderOutput;
}

export interface RenderIssue {
  code: string;
  path: string;
  message: string;
}

export class RenderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues: RenderIssue[] = [],
  ) {
    super(message);
    this.name = "RenderError";
  }
}

export const RENDER_MATERIAL_LIBRARY: readonly Omit<RenderMaterial, "id">[] = [
  {
    name: "Brushed steel",
    color: "#b8c0cc",
    metalness: 0.9,
    roughness: 0.35,
    opacity: 1,
    texture: null,
  },
  {
    name: "Anodized aluminium",
    color: "#d6d9de",
    metalness: 0.75,
    roughness: 0.28,
    opacity: 1,
    texture: null,
  },
  {
    name: "Matte black plastic",
    color: "#262a30",
    metalness: 0,
    roughness: 0.72,
    opacity: 1,
    texture: null,
  },
  {
    name: "Orange powder coat",
    color: "#f27a24",
    metalness: 0.05,
    roughness: 0.5,
    opacity: 1,
    texture: null,
  },
  {
    name: "Clear glass",
    color: "#cfe8ef",
    metalness: 0,
    roughness: 0.05,
    opacity: 0.32,
    texture: null,
  },
];

let renderIdSeq = 0;

export function renderId(
  prefix: "material" | "light" | "camera" | "bookmark",
): string {
  renderIdSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${renderIdSeq.toString(36)}`;
}

export function emptyRenderOutput(): RenderOutput {
  return {
    preset: "preview",
    width: 1280,
    height: 720,
    format: "png",
    quality: 0.92,
  };
}

export function emptyRenderEnvironment(): RenderEnvironment {
  return {
    kind: "studio",
    exposure: 1,
    background: "#141820",
    sunAzimuth: 35,
    sunElevation: 50,
    intensity: 1,
  };
}

export function emptyRenderCamera(
  name = "Camera 1",
  // Document geometry is in metres. These defaults frame a typical
  // centimetre-scale part instead of placing the camera hundreds of metres
  // away, where the rendered body would be sub-pixel.
  position: RenderVec3 = { x: 0.16, y: -0.2, z: 0.14 },
  target: RenderVec3 = { x: 0, y: 0, z: 0.02 },
): RenderCamera {
  return {
    id: renderId("camera"),
    name,
    projection: "perspective",
    position,
    target,
    fov: 45,
    focalLength: 50,
    near: 0.001,
    far: 100,
    bookmarks: [],
  };
}

export function emptyRenderLight(
  name = "Key light",
  kind: RenderLightKind = "directional",
): RenderLight {
  return {
    id: renderId("light"),
    name,
    kind,
    color: "#ffffff",
    intensity: kind === "sun" ? 2.2 : 3,
    shadows: true,
    position: { x: 0.08, y: -0.09, z: 0.12 },
    target: { x: 0, y: 0, z: 0.02 },
    angle: 35,
    penumbra: 0.25,
  };
}

export function emptyRenderDocument(name = "Render Studio"): RenderDocument {
  const material = {
    id: renderId("material"),
    ...RENDER_MATERIAL_LIBRARY[0]!,
  };
  const camera = emptyRenderCamera();
  return {
    schema: RENDER_SCHEMA,
    v: RENDER_VERSION,
    name,
    materials: [material],
    assignments: [],
    lights: [emptyRenderLight()],
    cameras: [camera],
    environment: emptyRenderEnvironment(),
    activeCameraId: camera.id,
    output: emptyRenderOutput(),
  };
}

/** Seed a demo with three appearances, two lights, two cameras and assignments. */
export function createRenderDemo(
  bodyIds: readonly string[],
  name = "Render demo",
): RenderDocument {
  const materials = [0, 3, 2].map((index) => renderMaterialFromPreset(index)!);
  const key = emptyRenderLight("Key light", "directional");
  key.position = { x: 0.12, y: -0.09, z: 0.16 };
  key.intensity = 3.2;
  const rim = emptyRenderLight("Rim light", "point");
  rim.position = { x: -0.11, y: 0.08, z: 0.1 };
  rim.color = "#9ecbff";
  rim.intensity = 0.35;
  const camera = emptyRenderCamera(
    "Three-quarter",
    { x: 0.16, y: -0.2, z: 0.14 },
    { x: 0, y: 0, z: 0.02 },
  );
  const orthographic = {
    ...emptyRenderCamera(
      "Front orthographic",
      { x: 0, y: -0.35, z: 0.06 },
      { x: 0, y: 0, z: 0.02 },
    ),
    projection: "orthographic" as const,
    focalLength: 60,
  };
  return {
    ...emptyRenderDocument(name),
    materials,
    lights: [key, rim],
    cameras: [camera, orthographic],
    activeCameraId: camera.id,
    assignments: bodyIds.slice(0, 3).map((bodyId, index) => ({
      bodyId,
      materialId: materials[index]!.id,
    })),
    environment: {
      ...emptyRenderEnvironment(),
      kind: "studio",
      background: "#11161d",
    },
    output: { ...emptyRenderOutput(), preset: "final" },
  };
}

export function renderMaterialFromPreset(index: number): RenderMaterial | null {
  const preset = RENDER_MATERIAL_LIBRARY[index];
  return preset ? { id: renderId("material"), ...preset } : null;
}

export function assignRenderMaterial(
  document: RenderDocument,
  bodyId: string,
  materialId: string,
): RenderDocument {
  if (!bodyId.trim()) {
    throw new RenderError("RENDER_BODY", "A body id is required.");
  }
  if (!document.materials.some((material) => material.id === materialId)) {
    throw new RenderError(
      "RENDER_MATERIAL",
      `Material "${materialId}" is not in the material library.`,
    );
  }
  const exists = document.assignments.some(
    (assignment) => assignment.bodyId === bodyId,
  );
  return {
    ...document,
    assignments: exists
      ? document.assignments.map((assignment) =>
          assignment.bodyId === bodyId
            ? { ...assignment, materialId }
            : assignment,
        )
      : [...document.assignments, { bodyId, materialId }],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function vec3(value: unknown, fallback: RenderVec3): RenderVec3 {
  const record = asRecord(value);
  return record
    ? {
        x: numberOr(record.x, fallback.x),
        y: numberOr(record.y, fallback.y),
        z: numberOr(record.z, fallback.z),
      }
    : { ...fallback };
}

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function normalizeTexture(value: unknown): RenderTexture | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    name: stringOr(record.name, "Texture"),
    url: stringOr(record.url, ""),
  };
}

function normalizeMaterial(value: unknown): RenderMaterial | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    id: stringOr(record.id, renderId("material")),
    name: stringOr(record.name, "Material"),
    color: hex(record.color, "#b8c0cc"),
    metalness: numberOr(record.metalness, 0),
    roughness: numberOr(record.roughness, 0.5),
    opacity: numberOr(record.opacity, 1),
    texture: normalizeTexture(record.texture),
  };
}

function normalizeLight(value: unknown): RenderLight | null {
  const record = asRecord(value);
  if (!record) return null;
  const kinds: RenderLightKind[] = ["directional", "point", "spot", "sun"];
  const kind = kinds.includes(record.kind as RenderLightKind)
    ? (record.kind as RenderLightKind)
    : "directional";
  return {
    id: stringOr(record.id, renderId("light")),
    name: stringOr(record.name, "Light"),
    kind,
    color: hex(record.color, "#ffffff"),
    intensity: numberOr(record.intensity, 3),
    shadows: boolOr(record.shadows, true),
    position: vec3(record.position, { x: 80, y: -90, z: 120 }),
    target: vec3(record.target, { x: 0, y: 0, z: 20 }),
    angle: numberOr(record.angle, 35),
    penumbra: numberOr(record.penumbra, 0.25),
  };
}

function normalizeBookmark(value: unknown): RenderBookmark | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    id: stringOr(record.id, renderId("bookmark")),
    name: stringOr(record.name, "Bookmark"),
    position: vec3(record.position, { x: 120, y: -120, z: 90 }),
    target: vec3(record.target, { x: 0, y: 0, z: 20 }),
  };
}

function normalizeCamera(value: unknown): RenderCamera | null {
  const record = asRecord(value);
  if (!record) return null;
  const base = emptyRenderCamera();
  return {
    id: stringOr(record.id, renderId("camera")),
    name: stringOr(record.name, "Camera"),
    projection:
      record.projection === "orthographic" ? "orthographic" : "perspective",
    position: vec3(record.position, base.position),
    target: vec3(record.target, base.target),
    fov: numberOr(record.fov, base.fov),
    focalLength: numberOr(record.focalLength, base.focalLength),
    near: numberOr(record.near, base.near),
    far: numberOr(record.far, base.far),
    bookmarks: Array.isArray(record.bookmarks)
      ? record.bookmarks
          .map(normalizeBookmark)
          .filter((bookmark): bookmark is RenderBookmark => bookmark !== null)
      : [],
  };
}

function normalizeOutput(value: unknown): RenderOutput {
  const base = emptyRenderOutput();
  const record = asRecord(value);
  if (!record) return base;
  const presets: RenderPreset[] = ["preview", "final", "print", "custom"];
  const formats: RenderFormat[] = ["png", "jpeg", "webp"];
  return {
    preset: presets.includes(record.preset as RenderPreset)
      ? (record.preset as RenderPreset)
      : base.preset,
    width: Math.min(
      RENDER_MAX_DIMENSION,
      Math.max(16, Math.round(numberOr(record.width, base.width))),
    ),
    height: Math.min(
      RENDER_MAX_DIMENSION,
      Math.max(16, Math.round(numberOr(record.height, base.height))),
    ),
    format: formats.includes(record.format as RenderFormat)
      ? (record.format as RenderFormat)
      : base.format,
    quality: Math.min(1, Math.max(0, numberOr(record.quality, base.quality))),
  };
}

function normalizeEnvironment(value: unknown): RenderEnvironment {
  const base = emptyRenderEnvironment();
  const record = asRecord(value);
  if (!record) return base;
  const kinds: RenderEnvironmentKind[] = ["studio", "sun", "sky", "none"];
  return {
    kind: kinds.includes(record.kind as RenderEnvironmentKind)
      ? (record.kind as RenderEnvironmentKind)
      : base.kind,
    exposure: numberOr(record.exposure, base.exposure),
    background: hex(record.background, base.background),
    sunAzimuth: numberOr(record.sunAzimuth, base.sunAzimuth),
    sunElevation: numberOr(record.sunElevation, base.sunElevation),
    intensity: numberOr(record.intensity, base.intensity),
  };
}

function normalizeAssignment(value: unknown): RenderAssignment | null {
  const record = asRecord(value);
  if (!record) return null;
  const bodyId = stringOr(record.bodyId, "");
  const materialId = stringOr(record.materialId, "");
  return bodyId && materialId ? { bodyId, materialId } : null;
}

export function parseRenderDocument(text: string): RenderDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new RenderError(
      "RENDER_JSON",
      "Render Studio payload is not valid JSON.",
    );
  }
  const record = asRecord(raw);
  if (!record) {
    throw new RenderError(
      "RENDER_SCHEMA",
      "Render Studio payload must be an object.",
    );
  }
  if (record.schema !== undefined && record.schema !== RENDER_SCHEMA) {
    throw new RenderError(
      "RENDER_SCHEMA",
      `Expected ${RENDER_SCHEMA}, received ${String(record.schema)}.`,
    );
  }
  const version = numberOr(record.v, 0);
  if (version > RENDER_VERSION) {
    throw new RenderError(
      "RENDER_FUTURE_SCHEMA",
      `Render Studio version ${version} is newer than this build (${RENDER_VERSION}).`,
    );
  }
  const base = emptyRenderDocument(stringOr(record.name, "Render Studio"));
  const materials = Array.isArray(record.materials)
    ? record.materials
        .map(normalizeMaterial)
        .filter((material): material is RenderMaterial => material !== null)
    : [];
  const lights = Array.isArray(record.lights)
    ? record.lights
        .map(normalizeLight)
        .filter((light): light is RenderLight => light !== null)
    : [];
  const cameras = Array.isArray(record.cameras)
    ? record.cameras
        .map(normalizeCamera)
        .filter((camera): camera is RenderCamera => camera !== null)
    : [];
  const document: RenderDocument = {
    schema: RENDER_SCHEMA,
    v: RENDER_VERSION,
    name: base.name,
    materials: materials.length ? materials : base.materials,
    assignments: Array.isArray(record.assignments)
      ? record.assignments
          .map(normalizeAssignment)
          .filter(
            (assignment): assignment is RenderAssignment => assignment !== null,
          )
      : [],
    lights: lights.length ? lights : base.lights,
    cameras: cameras.length ? cameras : base.cameras,
    environment: normalizeEnvironment(record.environment),
    activeCameraId: stringOr(
      record.activeCameraId,
      cameras[0]?.id ?? base.activeCameraId,
    ),
    output: normalizeOutput(record.output),
  };
  if (
    !document.cameras.some((camera) => camera.id === document.activeCameraId)
  ) {
    document.activeCameraId = document.cameras[0]?.id ?? base.activeCameraId;
  }
  return document;
}

export function serializeRenderDocument(document: RenderDocument): string {
  return JSON.stringify(document);
}

export function renderStudioTabDesign(document: RenderDocument): string {
  return serializeRenderDocument(document);
}

export function renderStudioFromDesign(text: string): RenderDocument | null {
  try {
    return parseRenderDocument(text);
  } catch {
    return null;
  }
}

function finiteVec(value: RenderVec3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

export function validateRenderDocument(
  document: RenderDocument,
  opts: { bodyIds?: readonly string[] } = {},
): RenderIssue[] {
  const issues: RenderIssue[] = [];
  if (!document.name.trim()) {
    issues.push({
      code: "RENDER_NAME",
      path: "name",
      message: "Render Studio name cannot be blank.",
    });
  }
  if (
    !Number.isInteger(document.output.width) ||
    document.output.width < 16 ||
    document.output.width > RENDER_MAX_DIMENSION
  ) {
    issues.push({
      code: "OUTPUT_WIDTH",
      path: "output.width",
      message: `Output width must be 16-${RENDER_MAX_DIMENSION} pixels.`,
    });
  }
  if (
    !Number.isInteger(document.output.height) ||
    document.output.height < 16 ||
    document.output.height > RENDER_MAX_DIMENSION
  ) {
    issues.push({
      code: "OUTPUT_HEIGHT",
      path: "output.height",
      message: `Output height must be 16-${RENDER_MAX_DIMENSION} pixels.`,
    });
  }
  if (document.output.width * document.output.height > RENDER_MAX_PIXELS) {
    issues.push({
      code: "OUTPUT_PIXELS",
      path: "output",
      message: `Output exceeds the ${RENDER_MAX_PIXELS.toLocaleString()} pixel memory limit.`,
    });
  }
  if (document.output.quality < 0 || document.output.quality > 1) {
    issues.push({
      code: "OUTPUT_QUALITY",
      path: "output.quality",
      message: "Output quality must be between 0 and 1.",
    });
  }
  const materialIds = new Set<string>();
  for (const [index, material] of document.materials.entries()) {
    const path = `materials.${index}`;
    if (materialIds.has(material.id)) {
      issues.push({
        code: "MATERIAL_DUPLICATE",
        path: `${path}.id`,
        message: "Material ids must be unique.",
      });
    }
    materialIds.add(material.id);
    if (!material.name.trim()) {
      issues.push({
        code: "MATERIAL_NAME",
        path: `${path}.name`,
        message: "Material name cannot be blank.",
      });
    }
    if (!/^#[0-9a-f]{6}$/i.test(material.color)) {
      issues.push({
        code: "MATERIAL_COLOR",
        path: `${path}.color`,
        message: "Material color must be a six-digit hex color.",
      });
    }
    for (const [key, value] of [
      ["metalness", material.metalness],
      ["roughness", material.roughness],
      ["opacity", material.opacity],
    ] as const) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        issues.push({
          code: "MATERIAL_RANGE",
          path: `${path}.${key}`,
          message: `${key} must be between 0 and 1.`,
        });
      }
    }
    if (material.texture) {
      if (!material.texture.name.trim() || !material.texture.url.trim()) {
        issues.push({
          code: "MATERIAL_TEXTURE",
          path: `${path}.texture`,
          message: "A texture needs a name and a local/data URL.",
        });
      }
    }
  }
  const assignedBodies = new Set<string>();
  for (const [index, assignment] of document.assignments.entries()) {
    const path = `assignments.${index}`;
    if (!assignment.bodyId.trim()) {
      issues.push({
        code: "ASSIGNMENT_BODY",
        path: `${path}.bodyId`,
        message: "Assignment body id cannot be blank.",
      });
    }
    if (assignedBodies.has(assignment.bodyId)) {
      issues.push({
        code: "ASSIGNMENT_DUPLICATE",
        path: `${path}.bodyId`,
        message: "A body can have only one appearance assignment.",
      });
    }
    assignedBodies.add(assignment.bodyId);
    if (!materialIds.has(assignment.materialId)) {
      issues.push({
        code: "ASSIGNMENT_MATERIAL",
        path: `${path}.materialId`,
        message: "Assignment references a material that is not in the library.",
      });
    }
    if (opts.bodyIds && !opts.bodyIds.includes(assignment.bodyId)) {
      issues.push({
        code: "ASSIGNMENT_MISSING_BODY",
        path: `${path}.bodyId`,
        message: `Body "${assignment.bodyId}" no longer exists.`,
      });
    }
  }
  const cameraIds = new Set<string>();
  for (const [index, camera] of document.cameras.entries()) {
    const path = `cameras.${index}`;
    if (cameraIds.has(camera.id)) {
      issues.push({
        code: "CAMERA_DUPLICATE",
        path: `${path}.id`,
        message: "Camera ids must be unique.",
      });
    }
    cameraIds.add(camera.id);
    if (!camera.name.trim()) {
      issues.push({
        code: "CAMERA_NAME",
        path: `${path}.name`,
        message: "Camera name cannot be blank.",
      });
    }
    if (!finiteVec(camera.position) || !finiteVec(camera.target)) {
      issues.push({
        code: "CAMERA_TRANSFORM",
        path,
        message: "Camera position and target must be finite.",
      });
    }
    if (camera.fov <= 0 || camera.fov >= 180) {
      issues.push({
        code: "CAMERA_FOV",
        path: `${path}.fov`,
        message: "Perspective FOV must be between 0 and 180 degrees.",
      });
    }
    if (camera.focalLength <= 0) {
      issues.push({
        code: "CAMERA_FOCAL",
        path: `${path}.focalLength`,
        message: "Focal length must be positive.",
      });
    }
    if (!(camera.near > 0) || !(camera.far > camera.near)) {
      issues.push({
        code: "CAMERA_CLIP",
        path,
        message: "Camera near must be positive and far must exceed near.",
      });
    }
  }
  if (!cameraIds.has(document.activeCameraId)) {
    issues.push({
      code: "CAMERA_ACTIVE",
      path: "activeCameraId",
      message: "Active camera is not in the camera list.",
    });
  }
  const lightIds = new Set<string>();
  for (const [index, light] of document.lights.entries()) {
    const path = `lights.${index}`;
    if (lightIds.has(light.id)) {
      issues.push({
        code: "LIGHT_DUPLICATE",
        path: `${path}.id`,
        message: "Light ids must be unique.",
      });
    }
    lightIds.add(light.id);
    if (!light.name.trim()) {
      issues.push({
        code: "LIGHT_NAME",
        path: `${path}.name`,
        message: "Light name cannot be blank.",
      });
    }
    if (!Number.isFinite(light.intensity) || light.intensity < 0) {
      issues.push({
        code: "LIGHT_INTENSITY",
        path: `${path}.intensity`,
        message: "Light intensity must be zero or greater.",
      });
    }
    if (!/^#[0-9a-f]{6}$/i.test(light.color)) {
      issues.push({
        code: "LIGHT_COLOR",
        path: `${path}.color`,
        message: "Light color must be a six-digit hex color.",
      });
    }
    if (!finiteVec(light.position) || !finiteVec(light.target)) {
      issues.push({
        code: "LIGHT_TRANSFORM",
        path,
        message: "Light position and target must be finite.",
      });
    }
    if (light.kind === "spot" && (light.angle <= 0 || light.angle >= 180)) {
      issues.push({
        code: "LIGHT_ANGLE",
        path: `${path}.angle`,
        message: "Spot angle must be between 0 and 180 degrees.",
      });
    }
    if (light.penumbra < 0 || light.penumbra > 1) {
      issues.push({
        code: "LIGHT_PENUMBRA",
        path: `${path}.penumbra`,
        message: "Spot penumbra must be between 0 and 1.",
      });
    }
  }
  if (document.environment.exposure <= 0) {
    issues.push({
      code: "ENV_EXPOSURE",
      path: "environment.exposure",
      message: "Exposure must be positive.",
    });
  }
  if (document.environment.intensity < 0) {
    issues.push({
      code: "ENV_INTENSITY",
      path: "environment.intensity",
      message: "Environment intensity must be zero or greater.",
    });
  }
  if (!/^#[0-9a-f]{6}$/i.test(document.environment.background)) {
    issues.push({
      code: "ENV_BACKGROUND",
      path: "environment.background",
      message: "Background must be a six-digit hex color.",
    });
  }
  return issues;
}

export function assertValidRenderDocument(
  document: RenderDocument,
  opts: { bodyIds?: readonly string[] } = {},
): void {
  const issues = validateRenderDocument(document, opts);
  if (issues.length > 0) {
    throw new RenderError(
      "RENDER_VALIDATION",
      issues.map((issue) => issue.message).join("; "),
      issues,
    );
  }
}

export function renderCameraById(
  document: RenderDocument,
  cameraId: string,
): RenderCamera | null {
  return document.cameras.find((camera) => camera.id === cameraId) ?? null;
}
