import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  RENDER_MAX_PIXELS,
  RENDER_VERSION,
  createRenderDemo,
  emptyRenderDocument,
  renderMaterialFromPreset,
  type RenderDocument,
} from "../model";
import {
  assertRenderSize,
  buildRenderScene,
  encodeRenderPixels,
  renderStudioFileName,
  renderStudioImage,
  type RenderCanvasLike,
  type RendererLike,
} from "../pipeline";

function sourceScene(count = 1): THREE.Scene {
  const scene = new THREE.Scene();
  for (let index = 1; index <= count; index += 1) {
    const root = new THREE.Group();
    root.name = `Body ${index}`;
    root.userData.nodeId = `body_${index}`;
    root.position.set(index * 10, 0, 0);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(10, 6, 4),
      new THREE.MeshStandardMaterial({ color: "#777777" }),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: "#111111" }),
    );
    edges.userData.isHelper = true;
    root.add(mesh, edges);
    scene.add(root);
  }
  return scene;
}

function documentForRender(): RenderDocument {
  const document = emptyRenderDocument("Render acceptance");
  const material = renderMaterialFromPreset(3)!;
  document.materials.push(material);
  document.assignments = [{ bodyId: "body_1", materialId: material.id }];
  document.output = {
    preset: "custom",
    width: 32,
    height: 16,
    format: "png",
    quality: 0.9,
  };
  return document;
}

function fakeCanvas(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    pixels,
    getContext: (_type: "2d") => ({
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      putImageData: (image: {
        data: Uint8ClampedArray;
        width: number;
        height: number;
      }) => {
        pixels.set(image.data);
      },
    }),
    toDataURL: (mime = "image/png") =>
      `data:${mime};base64,${Buffer.from(pixels).toString("base64")}`,
  } satisfies RenderCanvasLike & { pixels: Uint8ClampedArray };
}

function fakeRenderer() {
  let target: THREE.WebGLRenderTarget | null = null;
  let clear = new THREE.Color("#000000");
  const renderer: RendererLike & {
    targets: (THREE.WebGLRenderTarget | null)[];
    renders: number;
  } = {
    targets: [],
    renders: 0,
    getRenderTarget: () => target,
    setRenderTarget: (next: THREE.WebGLRenderTarget | null) => {
      target = next;
      renderer.targets.push(next);
    },
    render: () => {
      renderer.renders += 1;
    },
    readRenderTargetPixels: (
      _target: THREE.WebGLRenderTarget,
      _x: number,
      _y: number,
      _width: number,
      _height: number,
      buffer: Uint8Array,
    ) => {
      for (let i = 0; i < buffer.length; i += 1) buffer[i] = i % 251;
    },
    getPixelRatio: () => 1,
    setPixelRatio: () => {},
    shadowMap: { enabled: false },
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    autoClear: true,
    getClearColor: (out: THREE.Color) => out.copy(clear),
    getClearAlpha: () => 1,
    setClearColor: (color: THREE.ColorRepresentation) => {
      clear = new THREE.Color(color);
    },
  };
  return renderer;
}

describe("Render Studio local pipeline", () => {
  it("stages visible bodies with the assigned material and strips edge helpers", () => {
    const document = documentForRender();
    const source = sourceScene();
    const sourceMesh = source.children[0]!.children[0] as THREE.Mesh;
    const built = buildRenderScene(document, source, {
      width: 320,
      height: 200,
      bodyIds: ["body_1"],
    });
    expect(built.bodyCount).toBe(1);
    expect(built.lightCount).toBe(1);
    let meshes = 0;
    let lines = 0;
    built.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes += 1;
      if (object instanceof THREE.LineSegments) lines += 1;
    });
    expect(meshes).toBe(1);
    expect(lines).toBe(0);
    const mesh = [] as THREE.Mesh[];
    built.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) mesh.push(object);
    });
    const material = mesh[0]!.material as THREE.MeshStandardMaterial;
    expect(material.color.getHexString()).toBe("f27a24");
    expect(material.metalness).toBe(0.05);
    expect(built.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(built.camera.position.toArray()).toEqual([0.16, -0.2, 0.14]);
    expect(
      (sourceMesh.material as THREE.MeshStandardMaterial).color.getHexString(),
    ).toBe("777777");
    built.dispose();
  });

  it("flips WebGL bottom-up pixels before encoding an image", async () => {
    const width = 16;
    const height = 16;
    const rows = width * 4;
    const canvas = fakeCanvas(width, height);
    const pixels = new Uint8Array(width * height * 4);
    pixels.set([255, 0, 0, 255], 0);
    pixels.set([0, 0, 255, 255], (height - 1) * rows);
    const url = await encodeRenderPixels(pixels, {
      width,
      height,
      format: "png",
      quality: 1,
      canvasFactory: () => canvas,
    });
    expect(url).toContain("data:image/png");
    expect([...canvas.pixels.slice(0, 4)]).toEqual([0, 0, 255, 255]);
    expect([
      ...canvas.pixels.slice((height - 1) * rows, (height - 1) * rows + 4),
    ]).toEqual([255, 0, 0, 255]);
  });

  it("rejects a readback that exceeds the pixel budget", () => {
    expect(() => assertRenderSize(4097, 4096)).toThrow(/pixel limit/);
    expect(4097 * 4096).toBeGreaterThan(RENDER_MAX_PIXELS);
  });

  it("rejects a canvas that silently substitutes another image format", async () => {
    const canvas = {
      ...fakeCanvas(16, 16),
      toDataURL: () => "data:image/png;base64,AAAA",
    };
    await expect(
      encodeRenderPixels(new Uint8Array(16 * 16 * 4), {
        width: 16,
        height: 16,
        format: "webp",
        quality: 0.8,
        canvasFactory: () => canvas,
      }),
    ).rejects.toMatchObject({ code: "RENDER_ENCODE" });
  });

  it("reports a lost WebGL context by name", async () => {
    const renderer = fakeRenderer();
    renderer.getContext = () => ({ isContextLost: () => true });
    await expect(
      renderStudioImage({
        document: documentForRender(),
        sourceScene: sourceScene(),
        renderer,
        bodyIds: ["body_1"],
        canvasFactory: (width, height) => fakeCanvas(width, height),
        yieldToBrowser: async () => {},
      }),
    ).rejects.toMatchObject({ code: "RENDER_CONTEXT_LOST" });
  });

  it("renders preview and final sizes and exports every requested format", async () => {
    const document = createRenderDemo(["body_1"]);
    document.output.width = 64;
    document.output.height = 32;
    document.output.preset = "custom";
    const renderer = fakeRenderer();
    const formats = ["png", "jpeg", "webp"] as const;
    for (const format of formats) {
      document.output.format = format;
      const result = await renderStudioImage({
        document,
        sourceScene: sourceScene(),
        renderer,
        bodyIds: ["body_1"],
        canvasFactory: (width, height) => fakeCanvas(width, height),
        yieldToBrowser: async () => {},
      });
      expect(result.width).toBe(64);
      expect(result.height).toBe(32);
      expect(result.format).toBe(format);
      expect(result.mime).toBe(`image/${format}`);
      expect(result.dataUrl.startsWith(`data:image/${format}`)).toBe(true);
      expect(result.bodyCount).toBe(1);
      expect(result.imageBytes).toBeGreaterThan(0);
      expect(result.renderMs).toBeGreaterThanOrEqual(0);
      expect(result.encodeMs).toBeGreaterThanOrEqual(0);
    }
    expect(renderer.renders).toBe(3);
    expect(renderer.targets[0]?.samples).toBe(0);
    expect(renderer.getRenderTarget()).toBeNull();
    expect(renderStudioFileName("Bracket / Render", "jpeg")).toBe(
      "Bracket-Render.jpg",
    );
  });

  it("accepts the demo at preview and final output sizes", async () => {
    const document = createRenderDemo(["body_1", "body_2", "body_3"]);
    expect(document.materials).toHaveLength(3);
    expect(document.lights).toHaveLength(2);
    expect(document.cameras).toHaveLength(2);
    const renderer = fakeRenderer();
    for (const [preset, width, height] of [
      ["preview", 1280, 720],
      ["final", 1920, 1080],
    ] as const) {
      document.output = {
        ...document.output,
        preset,
        width,
        height,
        format: "png",
      };
      const result = await renderStudioImage({
        document,
        sourceScene: sourceScene(3),
        renderer,
        bodyIds: ["body_1", "body_2", "body_3"],
        canvasFactory: (canvasWidth, canvasHeight) =>
          fakeCanvas(canvasWidth, canvasHeight),
        yieldToBrowser: async () => {},
      });
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.format).toBe("png");
      expect(result.bodyCount).toBe(3);
      expect(result.lightCount).toBe(2);
      expect(result.dataUrl.startsWith("data:image/png")).toBe(true);
      expect(result.dataUrl.length).toBeGreaterThan(width * height);
      expect(result.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.memoryBytes === null || result.memoryBytes >= 0).toBe(true);
    }
    expect(renderer.getRenderTarget()).toBeNull();
  });

  it("cancels before starting and fails named on an empty scene", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      renderStudioImage({
        document: documentForRender(),
        sourceScene: sourceScene(),
        renderer: fakeRenderer(),
        bodyIds: ["body_1"],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "RENDER_CANCELLED" });

    await expect(
      renderStudioImage({
        document: documentForRender(),
        sourceScene: new THREE.Scene(),
        renderer: fakeRenderer(),
        bodyIds: ["body_1"],
        canvasFactory: (width, height) => fakeCanvas(width, height),
        yieldToBrowser: async () => {},
      }),
    ).rejects.toMatchObject({ code: "RENDER_NO_BODIES" });

    const mid = new AbortController();
    await expect(
      renderStudioImage({
        document: documentForRender(),
        sourceScene: sourceScene(),
        renderer: fakeRenderer(),
        bodyIds: ["body_1"],
        signal: mid.signal,
        canvasFactory: (width, height) => fakeCanvas(width, height),
        yieldToBrowser: async () => {
          mid.abort();
        },
      }),
    ).rejects.toMatchObject({ code: "RENDER_CANCELLED" });
  });

  it("keeps the persisted schema version current after adding output settings", () => {
    const document = emptyRenderDocument("Versioned");
    expect(document.v).toBe(RENDER_VERSION);
    expect(document.output).toBeDefined();
  });
});
