import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Page, expect } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FAKE_XR_SCRIPT = path.join(HERE, "vr-fake-xr.js");
export const SHOTS_DIR = path.join(HERE, "..", "vr-shots");

export type VRError = { kind: "console" | "pageerror"; text: string };

export async function installFakeXR(page: Page): Promise<void> {
  await page.addInitScript({ path: FAKE_XR_SCRIPT });
}

export function watchVRErrors(page: Page): VRError[] {
  const errors: VRError[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error")
      errors.push({ kind: "console", text: msg.text() });
  });
  page.on("pageerror", (err) => {
    errors.push({
      kind: "pageerror",
      text: String(err && err.stack ? err.stack : err),
    });
  });
  return errors;
}

export async function bootIntoVR(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Loading...")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  // fake XR makes the button render as "VR" (isSessionSupported -> true)
  const btn = page.getByRole("button", { name: "VR", exact: true });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
  await page.waitForFunction(
    () => (window as any).__vr.sessionActive() !== false,
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForFunction(
    () => {
      const info = (window as any).__vr.info();
      return info.active && info.fb !== null;
    },
    undefined,
    { timeout: 20_000 },
  );
  await vr(page, "frame", [8]);
}

export async function vr(
  page: Page,
  method: string,
  args: unknown[] = [],
): Promise<any> {
  return page.evaluate(
    ([m, a]) => (window as never as Record<string, any>).__vr?.[m]?.(...a),
    [method, args] as const,
  );
}

export async function shot(page: Page, name: string): Promise<string> {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

export async function expectCleanVR(errors: VRError[]): Promise<void> {
  const bad = errors.filter(
    (e) =>
      !/favicon|Download the React DevTools|WebGPU|deprecat|Scene, camera, or renderer not available|already been passed to createRoot/i.test(
        e.text,
      ),
  );
  expect(
    bad.map((e) => `${e.kind}: ${e.text.slice(0, 300)}`),
    "no VR runtime errors",
  ).toEqual([]);
}
