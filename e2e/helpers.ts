import { Page, expect } from "@playwright/test";
import type { DrawingTabData } from "../src/drawings/model";

type MeasureDebugEntry = {
  id: string;
  type: string;
  pinned: boolean;
  value: number;
};

declare global {
  interface Window {
    __cadMeasureDebug?: {
      state: () => {
        subMode: string;
        statusText: string;
        measurements: MeasureDebugEntry[];
        pinned: MeasureDebugEntry[];
      };
      pin: (id?: string) => boolean;
      unpin: (id?: string) => boolean;
      clear: () => void;
    };
    __cadDebug?: {
      getElements: () => Array<{
        nodeId: string;
        position: [number, number, number];
        visible?: boolean;
      }>;
      getMode: () => string;
      getFeatureTree: () => unknown;
      getCameraQuat: () => [number, number, number, number] | null;
      drawing?: {
        state: () => DrawingTabData;
      };
      selectElement: (id: string) => void;
      deselectElement: (id: string) => void;
      scadgen?: {
        nextId: () => string;
        configureSync: () => void;
        history: () => {
          features: Array<{ featureId: string; name: string }>;
          rollbackIndex: number | null;
        };
        box: (w: number, h: number, d: number) => string;
        hole: (
          fid: string,
          centers: [number, number, number][],
          r: number,
          d: number,
          opts?: {
            holeType?: "SIMPLE" | "COUNTERBORE" | "COUNTERSINK" | "TAPPED";
            counterboreRadius?: number;
            counterboreDepth?: number;
          },
        ) => string;
        etags: (fid: string) => string[] | null;
        fillet: (
          fid: string,
          tags: string[],
          r: number,
          radii?: number[],
        ) => string;
        chamfer: (
          fid: string,
          tags: string[],
          d: number,
          distances?: number[],
        ) => string;
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
            | "sphere"
            | "pipe"
            | "ellipsoid"
            | "capsule"
            | "dome",
          opts?: Record<string, unknown>,
        ) => { featureId: string; profileFeatureId: string };
        mirror: (src: string, axis: "X" | "Y" | "Z") => string;
        split: (
          fid: string,
          origin: [number, number, number],
          normal: [number, number, number],
          keep?: "positive" | "negative" | "both",
        ) => string;
        bodiesOf: (fid: string) => string[];
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
  // Wait for the debug hook to attach so subsequent page.evaluate() calls work.
  await page.waitForFunction(() => !!window.__cadDebug, undefined, {
    timeout: 10_000,
  });
  // ECAD is a lazy chunk now; ECAD specs read __ecad immediately after boot.
  await page.waitForFunction(
    () => !!(window as unknown as { __ecad?: unknown }).__ecad,
    undefined,
    { timeout: 20_000 },
  );
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
