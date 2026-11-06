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
        primitive: (
          kind:
            | "box"
            | "prism"
            | "pyramid"
            | "wedge"
            | "cylinder"
            | "cone"
            | "torus"
            | "pipe",
          opts?: Record<string, unknown>,
        ) => { featureId: string; profileFeatureId: string };
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
        faceDirs: (fid: string) => Array<{
          tag: string;
          center: { x: number; y: number; z: number };
          normal: { x: number; y: number; z: number };
        }> | null;
        ftags: (fid: string) => string[] | null;
        describeScene: () => {
          mode: string;
          selection: { ids: string[]; kind: string };
          camera: [number, number, number, number] | null;
          bodies: Array<{
            fid: string;
            type: string;
            name: string;
            state: string;
            elementId: string | null;
            visible: boolean | null;
            position: number[] | null;
            faces: number;
            edges: number;
            faceTags: string[];
            bbox: number[] | null;
          }>;
        };
        idle: () => Promise<
          Record<string, { status: string; detail?: string }>
        >;
      };
    };
    __vrMechanics?: {
      debugRaycast?: () => {
        tagged: Array<{ id: string; pos: number[] }>;
        rawCount: number;
      } | null;
      hoverBeam?: () => {
        kind: string;
        id: string;
        faceTag?: string;
        featureId?: string;
      } | null;
      selectBeam?: () => {
        kind: string;
        id: string;
        faceTag?: string;
        featureId?: string;
      } | null;
      openPanel?: (
        featureId: string,
      ) => { featureId: string; rows: number; label: string } | null;
      closePanel?: () => void;
      propertyPanel?: (featureId: string) => Array<{
        parameterId: string;
        kind: string;
        label: string;
        value: unknown;
        expression?: string;
        units?: string;
        linkedVariable?: string;
        usingDefault: boolean;
      }> | null;
      panelStep?: (
        featureId: string,
        parameterId: string,
        delta: number,
      ) => number | null;
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
