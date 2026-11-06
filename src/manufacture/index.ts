// manufacture/index.ts — public API for the manufacturing + patent export
// package. Bridge from the cadjs SceneElement (with its analytic BRep) to the
// pure drawing primitives, plus a thin ActionBus surface so the scene + the
// VR grab flow can invoke exports from anywhere.
//
// Exports:
//   * extractBodyEl(element) — SceneElement → BodyGeometry
//   * generateDxf(...)       — window set → ASCII DXF R12
//   * usptoSheet/Sheets(...) — figures → SVG(s), Letter, 37 CFR 1.84
//   * checkUsptoCompliance   — pre-flight validator
//   * MANUFACTURE_ACTIONS    — bus action ids
//
// Units: mm throughout (matches the print pipeline).

import { ImportExportService, type SceneElement } from "@vitekk02/cadjs";
import {
  extractGeometry,
  makeViewBasis,
  type BodyGeometry,
  type Pt3,
} from "./geometry";
import {
  generateDxf,
  layoutWindows,
  type DxfOptions,
  type DxfViewWindow,
  type TitleBlock,
  type DxfViewLayout,
} from "./dxf";
import {
  usptoSheet,
  usptoSheets,
  checkUsptoCompliance,
  type PatentDesignSpec,
  type PatentFigureSpec,
  type ReferenceNumeral,
  type PatentViewName,
} from "./uspto";

export type {
  BodyGeometry,
  Pt3,
  DxfOptions,
  DxfViewWindow,
  DxfViewLayout,
  TitleBlock,
  PatentDesignSpec,
  PatentFigureSpec,
  ReferenceNumeral,
  PatentViewName,
};

export {
  extractGeometry,
  generateDxf,
  layoutWindows,
  usptoSheet,
  usptoSheets,
  checkUsptoCompliance,
};

// ---------------------------------------------------------------------------
// SceneElement → BodyGeometry bridge
// ---------------------------------------------------------------------------

const scenePos = (e: SceneElement): Pt3 => ({
  x: e.position.x,
  y: e.position.y,
  z: e.position.z,
});
const sceneRot = (e: SceneElement) =>
  e.rotation
    ? { x: e.rotation.x, y: e.rotation.y, z: e.rotation.z }
    : undefined;

/**
 * Build a BodyGeometry from a SceneElement. Reads the analytic BRep
 * (vertices/edges/faces) and applies the element's world position+rotation.
 *
 * This is the single choke-point between the scene and the drawing package —
 * the scene passes it a SceneElement, the printers/patent modules get back a
 * unitless, world-space geometry they can project & dimension.
 */
export function extractBodyEl(element: SceneElement): BodyGeometry {
  const position = scenePos(element);
  // If the element carries a live brep with occBrep, prefer the raw arrays.
  const raw: {
    vertices?: Pt3[] | undefined;
    edges?: unknown[] | undefined;
    faces?: unknown[] | undefined;
  } = {};
  const b = element.brep as
    | {
        vertices?: Pt3[] | undefined;
        edges?: { start: Pt3; end: Pt3 }[] | undefined;
        faces?: { vertices: Pt3[] }[] | undefined;
      }
    | undefined;
  raw.vertices = b?.vertices;
  raw.edges = b?.edges;
  raw.faces = b?.faces;
  const rot = sceneRot(element);
  const opts: {
    position: Pt3;
    rotation?: { x: number; y: number; z: number };
  } = { position };
  if (rot) opts.rotation = rot;
  return extractGeometry(
    {
      vertices: raw.vertices ?? [],
      edges: (raw.edges ?? []) as { start: Pt3; end: Pt3 }[],
      faces: (raw.faces ?? []) as { vertices: Pt3[] }[],
    },
    opts,
  );
}

/** Convenience: one body → one-window DXF (front/top/right). */
export function bodyToDxf(
  body: BodyGeometry,
  titleBlock: TitleBlock,
  options: { notes?: string[]; generalTolerance?: string } = {},
): string {
  return generateDxf({
    titleBlock,
    windows: [
      { name: "front", view: viewByName("front"), body },
      { name: "top", view: viewByName("top"), body },
      { name: "right", view: viewByName("right"), body },
    ],
    ...(options.notes !== undefined ? { notes: options.notes } : {}),
    ...(options.generalTolerance !== undefined
      ? { generalTolerance: options.generalTolerance }
      : {}),
  });
}

function viewByName(
  n: "front" | "top" | "right" | "left" | "back" | "bottom" | "iso",
) {
  switch (n) {
    case "front":
      return makeViewBasis({ x: 0, y: 0, z: 1 });
    case "top":
      return makeViewBasis({ x: 0, y: -1, z: 0 });
    case "right":
      return makeViewBasis({ x: 1, y: 0, z: 0 });
    case "left":
      return makeViewBasis({ x: -1, y: 0, z: 0 });
    case "back":
      return makeViewBasis({ x: 0, y: 0, z: -1 });
    case "bottom":
      return makeViewBasis({ x: 0, y: 1, z: 0 });
    case "iso":
      return makeViewBasis({ x: 1, y: 1, z: 1 });
  }
}

// ---------------------------------------------------------------------------
// Patent helpers
// ---------------------------------------------------------------------------

export interface PatentExportResult {
  /** Path to the output SVG (caller must write this). */
  sheetPath: string;
  compliant: boolean;
  issues: { rule: string; msg: string }[];
  /** The SVG string itself so the caller can render / save without a fetch. */
  svg: string;
}

/**
 * Build a USPTO-compliant sheet for a single figure from the scene.
 *
 * `figure` carries the bodies; `spec` is the patent metadata (applicant,
 * drawing title). Returns the SVG string + a compliance pre-flight.
 */
export function buildPatentFigure(
  figure: PatentFigureSpec,
  spec: Omit<PatentDesignSpec, "figures" | "referenceNumerals"> & {
    referenceNumerals?: ReferenceNumeral[];
  },
): PatentExportResult {
  const full: PatentDesignSpec = {
    ...spec,
    figures: [figure],
    referenceNumerals: spec.referenceNumerals ?? [],
  };
  const svg = usptoSheet(full, 1, 1);
  const { issues, ok } = checkUsptoCompliance(full);
  return { sheetPath: "in-memory.svg", compliant: ok, issues, svg };
}

/**
 * Build N USPTO sheets (one per chunk of `maxFiguresPerSheet`), each as SVG.
 */
export function buildPatentSheets(
  figures: PatentFigureSpec[],
  spec: Omit<PatentDesignSpec, "figures" | "referenceNumerals">,
  maxFiguresPerSheet = 2,
): PatentExportResult[] {
  const svgs = usptoSheets(figures, spec, maxFiguresPerSheet);
  return svgs.map((svg, i) => {
    const chunk = figures.slice(
      i * maxFiguresPerSheet,
      i * maxFiguresPerSheet + maxFiguresPerSheet,
    );
    const full: PatentDesignSpec = {
      ...spec,
      figures: chunk,
      referenceNumerals: [],
    };
    const { issues, ok } = checkUsptoCompliance(full);
    return {
      sheetPath: `sheet-${i + 1}.svg`,
      compliant: ok,
      issues,
      svg,
    };
  });
}

// ---------------------------------------------------------------------------
// ActionBus actions
// ---------------------------------------------------------------------------

export const MANUFACTURE_ACTIONS = [
  "manufacture.extractBody",
  "manufacture.exportDxf",
  "manufacture.exportStep",
  "manufacture.exportStl",
  "manufacture.exportPatentSheet",
  "manufacture.checkUspto",
] as const;

export type ManufactureAction = (typeof MANUFACTURE_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Export dispatcher — every 3D / 2D export type in one bus entry point.
// ---------------------------------------------------------------------------

export type ManufacturingFormat = "stl" | "step" | "dxf" | "svg";

export interface ExportOutput {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Run a manufacturing export. STL / STEP go through the existing OCC worker
 * (`ImportExportService`); DXF / USPTO-SVG are generated here (pure, no kernel
 * round-trip). All output is base64 Uint8Array so it round-trips the IPC bus
 * without Blob typing.
 *
 * @param action  One of `MANUFACTURE_ACTIONS`, minus extractBody/checkUspto
 *   (those have their own signatures — `extractBodyEl` / `checkUsptoCompliance`).
 * @param elements The scene elements to export (the worker's `SceneElement[]`).
 * @param opts     DXF title block / patent metadata, picked per-format.
 */
export async function runManufactureExport(
  action: ManufactureAction,
  elements: SceneElement[],
  opts: {
    dxf?: {
      titleBlock?: TitleBlock;
      notes?: string[];
      generalTolerance?: string;
    };
    patent?:
      | (Parameters<typeof buildPatentFigure>[1] & {
          referenceNumerals?: ReferenceNumeral[];
        })
      | undefined;
  } = {},
): Promise<ExportOutput> {
  switch (action) {
    case "manufacture.exportStl": {
      const svc = ImportExportService.getInstance();
      const blob = await svc.export(elements);
      return {
        name: "export.stl",
        mimeType: "model/stl",
        bytes: new Uint8Array(await blob.arrayBuffer()),
      };
    }
    case "manufacture.exportStep": {
      const svc = ImportExportService.getInstance();
      const blob = await svc.exportStep(elements);
      return {
        name: "export.step",
        mimeType: "model/step",
        bytes: new Uint8Array(await blob.arrayBuffer()),
      };
    }
    case "manufacture.exportDxf": {
      const body = elements.length ? extractBodyEl(elements[0]!) : undefined;
      if (!body) throw new Error("exportDxf needs at least one element");
      const titleBlock =
        opts.dxf?.titleBlock ??
        ({
          title: "CADJS Drawing",
        } satisfies TitleBlock);
      const { titleBlock: _tb, ...dxfOpts } = { ...(opts.dxf ?? {}) };
      const dxf = bodyToDxf(body, titleBlock, dxfOpts);
      return {
        name: "export.dxf",
        mimeType: "application/dxf",
        bytes: new TextEncoder().encode(dxf),
      };
    }
    case "manufacture.exportPatentSheet": {
      if (!opts.patent) {
        throw new Error("exportPatentSheet needs a patent spec block");
      }
      const figure: PatentFigureSpec = {
        figureLabel: "FIG. 1",
        caption: opts.patent.drawingTitle,
        bodies: elements.map(extractBodyEl),
      };
      const { referenceNumerals: rnRest, ...patentRest } = {
        ...opts.patent,
      };
      const spec = {
        ...patentRest,
        ...(rnRest?.length ? { referenceNumerals: rnRest } : {}),
      };
      const { svg, compliant, issues } = buildPatentFigure(figure, spec);
      if (!compliant) {
        throw new Error(
          `USPTO compliance failed: ${issues.map((i) => i.msg).join("; ")}`,
        );
      }
      return {
        name: "sheet-1.svg",
        mimeType: "image/svg+xml",
        bytes: new TextEncoder().encode(svg),
      };
    }
    default: {
      // extractBody / checkUspto have their own signatures; this dispatcher
      // only carries the file-producing actions.
      throw new Error(`runManufactureExport: unsupported action "${action}"`);
    }
  }
}
