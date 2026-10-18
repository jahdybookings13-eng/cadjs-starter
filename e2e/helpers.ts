import { Page, expect } from "@playwright/test";

declare global {
  interface Window {
    __cadDebug?: {
      getElements: () => Array<{
        nodeId: string;
        position: [number, number, number];
      }>;
      getMode: () => string;
      getFeatureTree: () => unknown;
      getCameraQuat: () => [number, number, number, number] | null;
      scadgen?: {
        nextId: () => string;
        configureSync: () => void;
        box: (w: number, h: number, d: number) => string;
        cylinder: (r: number, h: number) => string;
        sphere: (r: number) => string;
        torus: (ringR: number, tubeR: number) => string;
        mirror: (src: string, axis: "X" | "Y" | "Z") => string;
        authoredIds: () => string[];
        exportSceneStl: () => Promise<Uint8Array>;
        exportSceneStep: () => Promise<Uint8Array>;
        insertStl: (bytes: number[]) => string;
        geom: (fid: string) => {
          edges: number;
          faces: number;
          vertices: number;
        } | null;
        tags: (fid: string) => {
          edges: number;
          faces: number;
          faceOwner: string | null;
        } | null;
        varRows: () => Array<{
          name: string;
          expression: string;
          usedBy: { featureId: string }[];
        }>;
        varsFor: (fid: string) => string[];
        states: () => Record<
          string,
          { featureStatus: string; inactive: boolean }
        >;
        idle: () => Promise<
          Record<string, { status: string; detail?: string }>
        >;
      };
    };
  }
}

export async function loadAppReady(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Loading...")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  // Wait for the debug hook to attach so subsequent page.evaluate() calls work
  await page.waitForFunction(() => !!window.__cadDebug, undefined, {
    timeout: 10_000,
  });
}

export async function readCameraQuat(
  page: Page,
): Promise<[number, number, number, number]> {
  const q = await page.evaluate(
    () => window.__cadDebug?.getCameraQuat() ?? null,
  );
  if (!q) throw new Error("camera quaternion unavailable");
  return q;
}

export function quatDelta(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);
}

export async function readElements(page: Page) {
  return page.evaluate(() => window.__cadDebug?.getElements() ?? []);
}

export async function readMode(page: Page): Promise<string> {
  return page.evaluate(() => window.__cadDebug?.getMode() ?? "");
}
