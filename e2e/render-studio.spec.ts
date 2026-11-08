import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

const budgets = (
  JSON.parse(
    readFileSync(new URL("../parity/budgets.json", import.meta.url), "utf8"),
  ) as { budgets: { studioRenderMs: number; studioUiStallMs: number } }
).budgets;

// Render acceptance is a GPU-path test. Force Chromium to expose the platform
// WebGL backend instead of silently substituting the software rasterizer.
test.use({
  launchOptions: {
    args: ["--enable-gpu", "--ignore-gpu-blocklist"],
  },
});

type PixelStats = {
  width: number;
  height: number;
  background: [number, number, number, number];
  changedPixels: number;
  changedRatio: number;
  opaquePixels: number;
};

async function inspectPreview(page: Page): Promise<PixelStats> {
  return page.evaluate(async () => {
    const image = document.querySelector<HTMLImageElement>(
      '[data-testid="render-studio-preview"]',
    );
    if (!image) throw new Error("render preview is missing");
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("render preview did not decode");
    }
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D image inspection context is unavailable");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const background: [number, number, number, number] = [
      pixels[0] ?? 0,
      pixels[1] ?? 0,
      pixels[2] ?? 0,
      pixels[3] ?? 0,
    ];
    let changedPixels = 0;
    let opaquePixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if ((pixels[offset + 3] ?? 0) === 255) opaquePixels += 1;
      const difference = Math.max(
        Math.abs((pixels[offset] ?? 0) - background[0]),
        Math.abs((pixels[offset + 1] ?? 0) - background[1]),
        Math.abs((pixels[offset + 2] ?? 0) - background[2]),
        Math.abs((pixels[offset + 3] ?? 0) - background[3]),
      );
      if (difference > 8) changedPixels += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      background,
      changedPixels,
      changedRatio: changedPixels / (canvas.width * canvas.height),
      opaquePixels,
    };
  });
}

async function waitForRender(
  page: Page,
  previousUrl: string | null,
  mime: string,
): Promise<string> {
  await expect
    .poll(
      async () => {
        const source = await page
          .getByTestId("render-studio-preview")
          .getAttribute("src");
        return source &&
          source !== previousUrl &&
          source.startsWith(`data:${mime}`)
          ? source
          : null;
      },
      { timeout: 90_000 },
    )
    .not.toBeNull();
  const source = await page
    .getByTestId("render-studio-preview")
    .getAttribute("src");
  if (!source) throw new Error("render preview has no source");
  return source;
}

async function downloadBytes(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByTestId("render-studio-download").click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error("download has no local path");
  const bytes = await fs.readFile(path);
  return { name: download.suggestedFilename(), bytes };
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("Render Studio renders, decodes and exports real GPU pixels", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1800, height: 1200 });
  await loadAppReady(page);

  const webgl = await page.evaluate(() => {
    const mount = document.querySelector('[data-testid="cad-canvas"]');
    const canvas =
      mount instanceof HTMLCanvasElement
        ? mount
        : mount?.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const gl =
      canvas.getContext("webgl2") ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    if (!gl) return null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      version: gl.getParameter(gl.VERSION) as string,
      renderer: String(
        debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      ),
      contextLost: gl.isContextLost(),
    };
  });
  expect(webgl).not.toBeNull();
  expect(webgl!.contextLost).toBe(false);
  console.log(`[render-studio] WebGL ${webgl!.version} · ${webgl!.renderer}`);

  const bodyCount = await page.evaluate(async () => {
    const g = window.__cadDebug?.scadgen;
    if (!g) throw new Error("no scadgen debug hook");
    g.configureSync();
    for (const x of [-0.06, 0, 0.06]) {
      g.primitive("box", {
        w: 0.04,
        h: 0.04,
        d: 0.04,
        frame: {
          origin: [x, 0, 0],
          xAxis: [1, 0, 0],
          normal: [0, 0, 1],
        },
      });
      await g.idle();
    }
    return g.authoredIds().length;
  });
  expect(bodyCount).toBeGreaterThanOrEqual(3);
  await expect
    .poll(() => page.evaluate(() => window.__cadDebug?.getElements().length))
    .toBe(3);

  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-renderstudio").click();
  await expect(page.getByTestId("render-studio-workspace")).toBeVisible();

  await page.getByTestId("render-studio-demo").click();
  const workspace = page.getByTestId("render-studio-workspace");
  await expect(workspace).toContainText(
    "3 material(s) · 2 light(s) · 2 camera(s)",
  );

  await page.getByRole("button", { name: "Show render section" }).click();
  const size = page.getByLabel("Render size preset");
  const format = page.getByLabel("Render format");
  const render = page.getByTestId("render-studio-render");
  const preview = page.getByTestId("render-studio-preview");
  const meta = page.getByTestId("render-studio-meta");

  await size.selectOption("preview");
  await format.selectOption("png");
  await expect(render).toBeEnabled({ timeout: 30_000 });
  await render.click();
  await expect(preview).toBeVisible({ timeout: 90_000 });
  await waitForRender(page, null, "image/png");
  await expect(meta).toContainText("1280 × 720");
  await expect(meta).toContainText("3 body(s) · 2 light(s)");
  await expect(meta).toContainText("render");
  await expect(meta).toContainText("readback");

  const previewPixels = await inspectPreview(page);
  expect(previewPixels.width).toBe(1280);
  expect(previewPixels.height).toBe(720);
  expect(previewPixels.opaquePixels).toBe(1280 * 720);
  expect(
    previewPixels.changedRatio,
    `render is only background: ${JSON.stringify(previewPixels)}`,
  ).toBeGreaterThan(0.01);
  console.log(
    `[render-studio] preview ${previewPixels.width}×${previewPixels.height} · ` +
      `${(previewPixels.changedRatio * 100).toFixed(2)}% non-background · ` +
      `background ${previewPixels.background.join(",")}`,
  );

  const png = await downloadBytes(page);
  expect(png.name).toMatch(/\.png$/);
  expect(pngSize(png.bytes)).toEqual({ width: 1280, height: 720 });

  let previousUrl = await preview.getAttribute("src");
  for (const [nextFormat, mime] of [
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
  ] as const) {
    await format.selectOption(nextFormat);
    await render.click();
    const url = await waitForRender(page, previousUrl, mime);
    previousUrl = url;
    const stats = await inspectPreview(page);
    expect(stats.width).toBe(1280);
    expect(stats.height).toBe(720);
    expect(
      stats.changedRatio,
      `${nextFormat} render is only background: ${JSON.stringify(stats)}`,
    ).toBeGreaterThan(0.01);
    await expect(meta).toContainText(nextFormat.toUpperCase());
    const exported = await downloadBytes(page);
    if (nextFormat === "jpeg") {
      expect(exported.name).toMatch(/\.jpg$/);
      expect([...exported.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    } else {
      expect(exported.name).toMatch(/\.webp$/);
      expect(exported.bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(exported.bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }
    console.log(
      `[render-studio] ${nextFormat} ${stats.width}×${stats.height} · ` +
        `${(stats.changedRatio * 100).toFixed(2)}% non-background · ` +
        `${exported.bytes.length} bytes`,
    );
  }

  await format.selectOption("png");
  await size.selectOption("final");
  await page.evaluate(() => {
    const state = { last: performance.now(), maxGap: 0, timer: 0 };
    state.timer = window.setInterval(() => {
      const next = performance.now();
      state.maxGap = Math.max(state.maxGap, next - state.last);
      state.last = next;
    }, 1);
    (
      window as unknown as {
        __renderStall: { last: number; maxGap: number; timer: number };
      }
    ).__renderStall = state;
  });
  const beforeFinal = await preview.getAttribute("src");
  await render.click();
  await waitForRender(page, beforeFinal, "image/png");
  await expect(meta).toContainText("1920 × 1080");
  const finalPixels = await inspectPreview(page);
  expect(finalPixels.width).toBe(1920);
  expect(finalPixels.height).toBe(1080);
  expect(finalPixels.changedRatio).toBeGreaterThan(0.01);
  const finalPng = await downloadBytes(page);
  expect(pngSize(finalPng.bytes)).toEqual({ width: 1920, height: 1080 });
  const finalMeta = (await meta.innerText()).replace(/\s+/g, " ").trim();
  const maxStallMs = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __renderStall: { last: number; maxGap: number; timer: number };
      }
    ).__renderStall;
    window.clearInterval(state.timer);
    return Math.round(state.maxGap);
  });
  expect(finalMeta).not.toContain("n/a readback");
  const finalRenderMs = Number(
    finalMeta.match(/render (\d+(?:\.\d+)?) ms/)?.[1] ?? NaN,
  );
  expect(finalRenderMs).toBeGreaterThan(0);
  expect(finalRenderMs).toBeLessThanOrEqual(budgets.studioRenderMs);
  expect(maxStallMs).toBeLessThanOrEqual(budgets.studioUiStallMs);
  console.log(
    `[render-studio] main-thread stall ${maxStallMs} ms / ${budgets.studioUiStallMs} ms budget`,
  );
  console.log(
    `[render-studio] final ${finalPixels.width}×${finalPixels.height} · ` +
      `${(finalPixels.changedRatio * 100).toFixed(2)}% non-background · ` +
      `${finalPng.bytes.length} bytes · ${finalMeta}`,
  );

  // Switching away must not serialize the Part Studio scene over the studio
  // payload when the tab is captured.
  await page
    .getByRole("tab")
    .filter({ hasText: "Part Studio" })
    .first()
    .click();
  await page
    .getByRole("tab")
    .filter({ hasText: "Render Studio" })
    .first()
    .click();
  await expect(workspace).toContainText(
    "3 material(s) · 2 light(s) · 2 camera(s) · 1920×1080",
  );

  // Autosave must not wash the studio payload back to a Part Studio design.
  await expect(page.getByTestId("document-dirty-state")).toHaveText("Saved", {
    timeout: 10_000,
  });
  await expect(workspace).toContainText(
    "3 material(s) · 2 light(s) · 2 camera(s) · 1920×1080",
  );

  // The saved studio state must survive an actual browser reload.
  await page.reload();
  await expect(page.getByText("Loading...")).toBeHidden({ timeout: 30_000 });
  await expect(workspace).toBeVisible({ timeout: 30_000 });
  await expect(workspace).toContainText(
    "3 material(s) · 2 light(s) · 2 camera(s) · 1920×1080",
  );
});
