// Local Render Studio pipeline.
//
// The live editor renderer is used only as a GPU. A private render target gets
// the requested resolution, a staged copy of the visible body roots, the
// document's materials/lights and the selected camera. The pixels are read back,
// flipped into a detached 2D canvas (or OffscreenCanvas) and encoded locally.
//
// Cancellation is checked around the GPU work and the event loop is yielded to
// between staging, rendering and encoding so the editor can paint and process
// the cancel click. A render that exceeds the pixel budget fails by name before
// allocating the readback buffer.

import * as THREE from "three";
import {
  RENDER_MAX_DIMENSION,
  RENDER_MAX_PIXELS,
  RenderError,
  assertValidRenderDocument,
  type RenderDocument,
  type RenderFormat,
  type RenderMaterial,
} from "./model";

export const RENDER_FORMAT_MIME: Record<RenderFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const RENDER_FORMAT_EXTENSION: Record<RenderFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

interface RenderCanvas2DLike {
  createImageData(
    width: number,
    height: number,
  ): {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  };
  putImageData(
    image: { data: Uint8ClampedArray; width: number; height: number },
    dx: number,
    dy: number,
  ): void;
}

export interface RenderCanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): RenderCanvas2DLike | null;
  toDataURL?(type?: string, quality?: number): string;
  convertToBlob?(options?: { type?: string; quality?: number }): Promise<Blob>;
}

export type RenderCanvasFactory = (
  width: number,
  height: number,
) => RenderCanvasLike;

export interface RendererLike {
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  readRenderTargetPixels(
    target: THREE.WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ): void;
  getPixelRatio(): number;
  setPixelRatio(value: number): void;
  shadowMap: { enabled: boolean; needsUpdate?: boolean };
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  outputColorSpace: string;
  autoClear: boolean;
  getClearColor(target: THREE.Color): THREE.Color;
  getClearAlpha(): number;
  setClearColor(color: THREE.ColorRepresentation, alpha?: number): void;
  getContext?(): { isContextLost?(): boolean } | null;
}

export interface RenderImageResult {
  dataUrl: string;
  mime: string;
  extension: string;
  fileName: string;
  width: number;
  height: number;
  format: RenderFormat;
  quality: number;
  bodyCount: number;
  lightCount: number;
  prepareMs: number;
  renderMs: number;
  encodeMs: number;
  totalMs: number;
  imageBytes: number;
  memoryBytes: number | null;
}

export interface RenderImageRequest {
  document: RenderDocument;
  sourceScene: THREE.Scene | null;
  renderer: RendererLike | null;
  bodyIds?: readonly string[];
  signal?: AbortSignal;
  canvasFactory?: RenderCanvasFactory;
  now?: () => number;
  yieldToBrowser?: () => Promise<void>;
  loadTexture?: (url: string) => Promise<THREE.Texture>;
}

interface BuiltRenderScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  bodyCount: number;
  lightCount: number;
  dispose(): void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new RenderError("RENDER_CANCELLED", "Render cancelled.");
  }
}

function contextIsLost(renderer: RendererLike): boolean {
  return Boolean(renderer.getContext?.()?.isContextLost?.());
}

function isVisibleInTree(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function bodyRoots(
  sourceScene: THREE.Scene,
  bodyIds: readonly string[],
): Map<string, THREE.Object3D> {
  const wanted = new Set(bodyIds);
  const roots = new Map<string, THREE.Object3D>();
  sourceScene.traverse((object) => {
    const id =
      typeof object.userData?.nodeId === "string"
        ? object.userData.nodeId
        : null;
    if (!id || roots.has(id)) return;
    if (wanted.size > 0 && !wanted.has(id)) return;
    if (!isVisibleInTree(object)) return;
    roots.set(id, object);
  });
  return roots;
}

function renderMaterial(
  definition: RenderMaterial | null,
  texture: THREE.Texture | undefined,
  owned: THREE.Material[],
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: definition?.color ?? "#aeb8c4",
    metalness: definition?.metalness ?? 0.15,
    roughness: definition?.roughness ?? 0.55,
    opacity: definition?.opacity ?? 1,
    transparent: (definition?.opacity ?? 1) < 1,
    side: THREE.DoubleSide,
    map: texture ?? null,
  });
  material.name = definition?.name ?? "Render default";
  owned.push(material);
  return material;
}

function addDocumentLights(
  scene: THREE.Scene,
  document: RenderDocument,
  shadowSize: number,
): number {
  const env = document.environment;
  if (env.kind !== "none") {
    const sky =
      env.kind === "sky"
        ? "#b8d8f2"
        : env.kind === "sun"
          ? "#dce9f5"
          : "#eef2f7";
    const ground = env.kind === "sky" ? "#6c7b64" : "#38414b";
    scene.add(
      new THREE.HemisphereLight(
        sky,
        ground,
        Math.max(0.05, env.intensity * 0.55),
      ),
    );
  }
  if (env.kind === "sun") {
    const azimuth = (env.sunAzimuth * Math.PI) / 180;
    const elevation = (env.sunElevation * Math.PI) / 180;
    const sun = new THREE.DirectionalLight(
      "#fff3df",
      Math.max(0, env.intensity),
    );
    sun.position.set(
      Math.cos(elevation) * Math.cos(azimuth) * 0.5,
      Math.cos(elevation) * Math.sin(azimuth) * 0.5,
      Math.sin(elevation) * 0.5,
    );
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.near = 0.001;
    sun.shadow.camera.far = 5;
    sun.shadow.camera.left = -0.5;
    sun.shadow.camera.right = 0.5;
    sun.shadow.camera.top = 0.5;
    sun.shadow.camera.bottom = -0.5;
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);
  }

  for (const definition of document.lights) {
    let light: THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;
    if (definition.kind === "point") {
      light = new THREE.PointLight(
        definition.color,
        definition.intensity,
        0,
        2,
      );
    } else if (definition.kind === "spot") {
      light = new THREE.SpotLight(
        definition.color,
        definition.intensity,
        0,
        (definition.angle * Math.PI) / 180,
        definition.penumbra,
        2,
      );
    } else {
      light = new THREE.DirectionalLight(
        definition.color,
        definition.intensity,
      );
    }
    light.name = definition.name;
    light.position.set(
      definition.position.x,
      definition.position.y,
      definition.position.z,
    );
    if (
      light instanceof THREE.DirectionalLight ||
      light instanceof THREE.SpotLight
    ) {
      light.target.position.set(
        definition.target.x,
        definition.target.y,
        definition.target.z,
      );
    }
    light.castShadow = definition.shadows;
    if (definition.shadows) {
      light.shadow.mapSize.set(shadowSize, shadowSize);
      light.shadow.camera.near = 0.001;
      light.shadow.camera.far = 5;
      light.shadow.bias = -0.0004;
      if (light instanceof THREE.DirectionalLight) {
        light.shadow.camera.left = -0.5;
        light.shadow.camera.right = 0.5;
        light.shadow.camera.top = 0.5;
        light.shadow.camera.bottom = -0.5;
      }
    }
    if (light instanceof THREE.PointLight) scene.add(light);
    else scene.add(light, light.target);
  }
  return document.lights.length;
}

/**
 * Stage only visible body roots from the live scene. Cloned roots share
 * geometry with the editor, but all appearance materials are owned here and
 * disposed with the staged scene.
 */
export function buildRenderScene(
  document: RenderDocument,
  sourceScene: THREE.Scene | null,
  opts: {
    width: number;
    height: number;
    bodyIds?: readonly string[] | undefined;
    textures?: ReadonlyMap<string, THREE.Texture> | undefined;
  },
): BuiltRenderScene {
  if (!sourceScene) {
    throw new RenderError(
      "RENDER_SCENE",
      "The editor scene is not ready to render.",
    );
  }
  const roots = bodyRoots(sourceScene, opts.bodyIds ?? []);
  if (roots.size === 0) {
    throw new RenderError(
      "RENDER_NO_BODIES",
      "No visible bodies are available to render.",
    );
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(document.environment.background);
  const ownedMaterials: THREE.Material[] = [];
  const shadowSize = Math.max(opts.width, opts.height) >= 2000 ? 2048 : 1024;

  for (const [bodyId, source] of roots) {
    const clone = source.clone(true);
    clone.name = source.name || bodyId;
    const remove: THREE.Object3D[] = [];
    clone.traverse((object) => {
      if (object === clone) return;
      const typed = object as THREE.Object3D & {
        isLine?: boolean;
        isLineSegments?: boolean;
        isPoints?: boolean;
      };
      if (
        object.userData?.isHelper ||
        typed.isLine ||
        typed.isLineSegments ||
        typed.isPoints
      ) {
        remove.push(object);
      }
    });
    for (const object of remove) object.parent?.remove(object);

    const assignment = document.assignments.find(
      (item) => item.bodyId === bodyId,
    );
    const definition =
      document.materials.find(
        (material) => material.id === assignment?.materialId,
      ) ?? null;
    const material = renderMaterial(
      definition,
      definition ? opts.textures?.get(definition.id) : undefined,
      ownedMaterials,
    );
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    scene.add(clone);
  }

  const lightCount = addDocumentLights(scene, document, shadowSize);
  const cameraDefinition =
    document.cameras.find((camera) => camera.id === document.activeCameraId) ??
    document.cameras[0];
  if (!cameraDefinition) {
    throw new RenderError(
      "RENDER_CAMERA",
      "The render has no camera to look through.",
    );
  }
  const target = new THREE.Vector3(
    cameraDefinition.target.x,
    cameraDefinition.target.y,
    cameraDefinition.target.z,
  );
  const aspect = opts.width / opts.height;
  const camera =
    cameraDefinition.projection === "orthographic"
      ? (() => {
          const position = new THREE.Vector3(
            cameraDefinition.position.x,
            cameraDefinition.position.y,
            cameraDefinition.position.z,
          );
          const distance = Math.max(0.001, position.distanceTo(target));
          const sensor = 36;
          const fov =
            2 * Math.atan(sensor / (2 * cameraDefinition.focalLength));
          const halfHeight = Math.max(0.01, distance * Math.tan(fov / 2));
          return new THREE.OrthographicCamera(
            -halfHeight * aspect,
            halfHeight * aspect,
            halfHeight,
            -halfHeight,
            cameraDefinition.near,
            cameraDefinition.far,
          );
        })()
      : new THREE.PerspectiveCamera(
          cameraDefinition.fov,
          aspect,
          cameraDefinition.near,
          cameraDefinition.far,
        );
  camera.up.set(0, 0, 1);
  camera.position.set(
    cameraDefinition.position.x,
    cameraDefinition.position.y,
    cameraDefinition.position.z,
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  return {
    scene,
    camera,
    bodyCount: roots.size,
    lightCount,
    dispose: () => {
      for (const material of ownedMaterials) material.dispose();
      scene.clear();
    },
  };
}

export function assertRenderSize(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 16 ||
    height < 16 ||
    width > RENDER_MAX_DIMENSION ||
    height > RENDER_MAX_DIMENSION
  ) {
    throw new RenderError(
      "RENDER_SIZE",
      `Render size must be whole pixels between 16 and ${RENDER_MAX_DIMENSION}.`,
    );
  }
  if (width * height > RENDER_MAX_PIXELS) {
    throw new RenderError(
      "RENDER_MEMORY",
      `Render size ${width} × ${height} exceeds the ${RENDER_MAX_PIXELS.toLocaleString()} pixel limit.`,
    );
  }
}

function defaultCanvasFactory(width: number, height: number): RenderCanvasLike {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      return new OffscreenCanvas(width, height) as unknown as RenderCanvasLike;
    } catch {
      // Fall through to a detached DOM canvas.
    }
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as RenderCanvasLike;
  }
  throw new RenderError(
    "RENDER_CANVAS",
    "No offscreen 2D canvas is available in this environment.",
  );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(
        new RenderError("RENDER_ENCODE", "Could not read the encoded image."),
      );
    reader.readAsDataURL(blob);
  });
}

/** Encode bottom-up RGBA pixels (WebGL readback order) into an image data URL. */
export async function encodeRenderPixels(
  pixels: Uint8Array,
  opts: {
    width: number;
    height: number;
    format: RenderFormat;
    quality: number;
    canvasFactory?: RenderCanvasFactory | undefined;
  },
): Promise<string> {
  const { width, height, format } = opts;
  assertRenderSize(width, height);
  const expected = width * height * 4;
  if (pixels.length < expected) {
    throw new RenderError(
      "RENDER_READBACK",
      `Expected ${expected} RGBA bytes, received ${pixels.length}.`,
    );
  }
  let canvas: RenderCanvasLike;
  try {
    canvas = (opts.canvasFactory ?? defaultCanvasFactory)(width, height);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new RenderError(
        "RENDER_MEMORY",
        "The requested image canvas is too large to allocate.",
      );
    }
    throw error;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    throw new RenderError(
      "RENDER_CANVAS",
      "The offscreen canvas has no 2D context.",
    );
  }
  const image = context.createImageData(width, height);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y += 1) {
    const source = (height - 1 - y) * rowBytes;
    image.data.set(pixels.subarray(source, source + rowBytes), y * rowBytes);
  }
  context.putImageData(image, 0, 0);

  const mime = RENDER_FORMAT_MIME[format];
  const quality = Math.min(1, Math.max(0, opts.quality));
  let dataUrl: string;
  if (canvas.toDataURL) {
    dataUrl = canvas.toDataURL(mime, quality);
  } else if (canvas.convertToBlob) {
    const blob = await canvas.convertToBlob({ type: mime, quality });
    dataUrl = await blobToDataUrl(blob);
  } else {
    throw new RenderError(
      "RENDER_ENCODE",
      "The offscreen canvas cannot encode an image.",
    );
  }
  if (!dataUrl.startsWith(`data:${mime}`)) {
    throw new RenderError(
      "RENDER_ENCODE",
      `The canvas did not produce a ${mime} data URL.`,
    );
  }
  return dataUrl;
}

async function defaultLoadTexture(url: string): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(url);
}

async function loadTextures(
  document: RenderDocument,
  loadTexture: (url: string) => Promise<THREE.Texture>,
): Promise<Map<string, THREE.Texture>> {
  const textures = new Map<string, THREE.Texture>();
  for (const material of document.materials) {
    if (!material.texture) continue;
    const url = material.texture.url.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(data|blob):/i.test(url)) {
      throw new RenderError(
        "RENDER_TEXTURE_NETWORK",
        `Texture "${material.texture.name}" must be a local or data URL.`,
      );
    }
    try {
      const texture = await loadTexture(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      textures.set(material.id, texture);
    } catch (error) {
      throw new RenderError(
        "RENDER_TEXTURE",
        `Texture "${material.texture.name}" could not be loaded: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return textures;
}

function defaultYield(): Promise<void> {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function imageBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
}

function memoryBytes(): number | null {
  const memory = (
    performance as unknown as { memory?: { usedJSHeapSize: number } }
  ).memory;
  return memory && Number.isFinite(memory.usedJSHeapSize)
    ? memory.usedJSHeapSize
    : null;
}

export function renderStudioFileName(
  name: string,
  format: RenderFormat,
): string {
  const stem =
    name
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "render";
  return `${stem}.${RENDER_FORMAT_EXTENSION[format]}`;
}

function normalizeError(error: unknown, signal?: AbortSignal): RenderError {
  if (signal?.aborted) {
    return new RenderError("RENDER_CANCELLED", "Render cancelled.");
  }
  if (error instanceof RenderError) return error;
  if (error instanceof RangeError) {
    return new RenderError(
      "RENDER_MEMORY",
      "The render ran out of memory while allocating its image buffer.",
    );
  }
  return new RenderError(
    "RENDER_FAILED",
    error instanceof Error ? error.message : String(error),
  );
}

export async function renderStudioImage(
  request: RenderImageRequest,
): Promise<RenderImageResult> {
  const { document, signal } = request;
  assertValidRenderDocument(
    document,
    request.bodyIds ? { bodyIds: request.bodyIds } : {},
  );
  assertRenderSize(document.output.width, document.output.height);
  throwIfAborted(signal);
  if (!request.renderer) {
    throw new RenderError(
      "RENDER_RENDERER",
      "The WebGL renderer is not ready.",
    );
  }
  const renderer = request.renderer;
  if (contextIsLost(renderer)) {
    throw new RenderError(
      "RENDER_CONTEXT_LOST",
      "The WebGL context is lost; recreate it before rendering.",
    );
  }
  const output = document.output;
  const now = request.now ?? (() => performance.now());
  const yieldToBrowser = request.yieldToBrowser ?? defaultYield;
  const started = now();
  const memoryBefore = memoryBytes();
  const saved = {
    target: renderer.getRenderTarget(),
    pixelRatio: renderer.getPixelRatio(),
    shadowEnabled: renderer.shadowMap.enabled,
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    colorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear,
    clearColor: renderer.getClearColor(new THREE.Color()).clone(),
    clearAlpha: renderer.getClearAlpha(),
  };
  let target: THREE.WebGLRenderTarget | null = null;
  let built: BuiltRenderScene | null = null;
  let textures = new Map<string, THREE.Texture>();
  try {
    textures = await loadTextures(
      document,
      request.loadTexture ?? defaultLoadTexture,
    );
    throwIfAborted(signal);
    built = buildRenderScene(document, request.sourceScene, {
      width: output.width,
      height: output.height,
      bodyIds: request.bodyIds,
      textures,
    });
    await yieldToBrowser();
    throwIfAborted(signal);

    const prepareMs = now() - started;
    const renderStarted = now();
    target = new THREE.WebGLRenderTarget(output.width, output.height, {
      // Multisampled render targets cannot be read back with readPixels.
      samples: 0,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled =
      document.lights.some((light) => light.shadows) ||
      document.environment.kind === "sun";
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = document.environment.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = true;
    renderer.setClearColor(document.environment.background, 1);
    renderer.setRenderTarget(target);
    renderer.render(built.scene, built.camera);
    if (contextIsLost(renderer)) {
      throw new RenderError(
        "RENDER_CONTEXT_LOST",
        "The WebGL context was lost while rendering the image.",
      );
    }
    const pixels = new Uint8Array(output.width * output.height * 4);
    renderer.readRenderTargetPixels(
      target,
      0,
      0,
      output.width,
      output.height,
      pixels,
    );
    const renderMs = now() - renderStarted;
    renderer.setRenderTarget(saved.target);
    throwIfAborted(signal);
    await yieldToBrowser();
    throwIfAborted(signal);

    const encodeStarted = now();
    const dataUrl = await encodeRenderPixels(pixels, {
      width: output.width,
      height: output.height,
      format: output.format,
      quality: output.quality,
      canvasFactory: request.canvasFactory,
    });
    const encodeMs = now() - encodeStarted;
    return {
      dataUrl,
      mime: RENDER_FORMAT_MIME[output.format],
      extension: RENDER_FORMAT_EXTENSION[output.format],
      fileName: renderStudioFileName(document.name, output.format),
      width: output.width,
      height: output.height,
      format: output.format,
      quality: output.quality,
      bodyCount: built.bodyCount,
      lightCount: built.lightCount,
      prepareMs,
      renderMs,
      encodeMs,
      totalMs: now() - started,
      imageBytes: imageBytes(dataUrl),
      memoryBytes:
        memoryBefore !== null && memoryBytes() !== null
          ? Math.max(0, memoryBytes()! - memoryBefore)
          : null,
    };
  } catch (error) {
    throw normalizeError(error, signal);
  } finally {
    try {
      renderer.setRenderTarget(saved.target);
      renderer.setPixelRatio(saved.pixelRatio);
      renderer.shadowMap.enabled = saved.shadowEnabled;
      renderer.toneMapping = saved.toneMapping;
      renderer.toneMappingExposure = saved.exposure;
      renderer.outputColorSpace = saved.colorSpace;
      renderer.autoClear = saved.autoClear;
      renderer.setClearColor(saved.clearColor, saved.clearAlpha);
    } catch {
      // A lost context makes state restoration impossible; the original error,
      // if any, is the useful one.
    }
    target?.dispose();
    built?.dispose();
    for (const texture of textures.values()) texture.dispose();
  }
}
