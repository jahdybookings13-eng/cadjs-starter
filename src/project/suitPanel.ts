// suitPanel.ts — the Project ("suit") settings panel as a ParamPanel-shaped
// data source. Pure + testable. The visual twin lives in VR (vrSuitPanel.ts)
// and renders the rows with the same canvas kit as the feature param panel
// (paramPanelCanvas.ts). Rows that the user edits flow through applySuitEdit,
// which patches the ProjectDoc the session stores believe in.
//
// Live-apply note: room/desk edits are applied to the live session on commit
// (buildVRRoom is deterministic, cheap, and disposeVRRoom is already wired
// for swap). Units / physics / render persist for the next entry; the session
// cannot hot-swap the physics integrator or the units label without a reboot.
import { type ProjectDoc, DEFAULT_SETTINGS } from "./model";
import type { ParamPanel, PanelRow } from "../model/paramPanel";

export const SUIT_PANEL_ID = "suit-settings";
export const SUIT_PANEL_LABEL = "Suit Settings";

export const SUIT_RENDER_STYLES = [
  "standard",
  "wireframe",
  "xray",
  "colorByBody",
  "colorByMaterial",
] as const;
export const SUIT_PHYSICS = ["realistic", "magnetic", "ghost"] as const;
export const SUIT_UNITS = ["mm", "cm", "in"] as const;
export const SUIT_COLLAB = ["private", "invited", "public-view"] as const;

export interface SuitSettingRowSpec {
  parameterId: string;
  label: string;
  kind: "quantity" | "enum" | "string";
  units?: string;
  min?: number;
  max?: number;
  step?: number;
  enumValues?: readonly string[];
  default: string | number;
  /** Where the value lives inside the ProjectDoc. */
  path: "name" | `settings.${string}`;
}

export const SUIT_ROWS: readonly SuitSettingRowSpec[] = [
  {
    parameterId: "name",
    label: "Name",
    kind: "string",
    path: "name",
    default: "Untitled",
  },
  {
    parameterId: "units",
    label: "Units",
    kind: "enum",
    enumValues: SUIT_UNITS,
    path: "settings.units",
    default: DEFAULT_SETTINGS.units,
  },
  {
    parameterId: "physics",
    label: "Physics",
    kind: "enum",
    enumValues: SUIT_PHYSICS,
    path: "settings.physics",
    default: DEFAULT_SETTINGS.physics,
  },
  {
    parameterId: "render",
    label: "Render",
    kind: "enum",
    enumValues: SUIT_RENDER_STYLES,
    path: "settings.render",
    default: DEFAULT_SETTINGS.render,
  },
  {
    parameterId: "collabPolicy",
    label: "Sharing",
    kind: "enum",
    enumValues: SUIT_COLLAB,
    path: "settings.collab.policy",
    default: DEFAULT_SETTINGS.collab.policy,
  },
  {
    parameterId: "roomWidth",
    label: "Room W",
    kind: "quantity",
    units: "m",
    min: 2,
    max: 20,
    step: 0.5,
    path: "settings.room.width",
    default: DEFAULT_SETTINGS.room.width,
  },
  {
    parameterId: "roomDepth",
    label: "Room D",
    kind: "quantity",
    units: "m",
    min: 2,
    max: 20,
    step: 0.5,
    path: "settings.room.depth",
    default: DEFAULT_SETTINGS.room.depth,
  },
  {
    parameterId: "roomHeight",
    label: "Room H",
    kind: "quantity",
    units: "m",
    min: 2,
    max: 10,
    step: 0.25,
    path: "settings.room.height",
    default: DEFAULT_SETTINGS.room.height,
  },
  {
    parameterId: "deskWidth",
    label: "Desk W",
    kind: "quantity",
    units: "m",
    min: 0.6,
    max: 3,
    step: 0.1,
    path: "settings.room.deskWidth",
    default: DEFAULT_SETTINGS.room.deskWidth,
  },
  {
    parameterId: "deskDepth",
    label: "Desk D",
    kind: "quantity",
    units: "m",
    min: 0.3,
    max: 1.5,
    step: 0.05,
    path: "settings.room.deskDepth",
    default: DEFAULT_SETTINGS.room.deskDepth,
  },
  {
    parameterId: "deskHeight",
    label: "Desk H",
    kind: "quantity",
    units: "m",
    min: 0.4,
    max: 1.3,
    step: 0.05,
    path: "settings.room.deskHeight",
    default: DEFAULT_SETTINGS.room.deskHeight,
  },
] as const;

function readPath(doc: ProjectDoc, path: string): unknown {
  if (path === "name") return doc.name;
  const parts = path.replace(/^settings\./, "").split(".");
  let cur: unknown = doc.settings as unknown;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function writePath(doc: ProjectDoc, path: string, value: unknown): void {
  if (path === "name") {
    doc.name = String(value);
    return;
  }
  const parts = path.replace(/^settings\./, "").split(".");
  let cur: Record<string, unknown> = doc.settings as unknown as Record<
    string,
    unknown
  >;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]!];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      // Create the container on demand so an out-of-tree doc cannot corrupt it.
      cur[parts[i]!] = {};
    }
    cur = cur[parts[i]!] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/** Build the ParamPanel rows for a ProjectDoc. */
export function suitPanelFor(doc: ProjectDoc): ParamPanel {
  const rows: PanelRow[] = SUIT_ROWS.map((spec) => {
    const value = readPath(doc, spec.path);
    const row: PanelRow = {
      parameterId: spec.parameterId,
      kind: spec.kind,
      label: spec.label,
      value,
      usingDefault: false,
    };
    if (spec.units !== undefined) row.units = spec.units;
    if (spec.min !== undefined) row.min = spec.min;
    if (spec.max !== undefined) row.max = spec.max;
    if (spec.step !== undefined) row.step = spec.step;
    if (spec.enumValues !== undefined) {
      row.enumValues = [...spec.enumValues];
    }
    return row;
  });
  return {
    featureId: SUIT_PANEL_ID,
    featureType: "suitSettings",
    label: SUIT_PANEL_LABEL,
    status: "implemented",
    rows,
    unknownType: false,
  };
}

/**
 * Apply one panel edit onto the doc (in place, same object as the rest of the
 * app) and return the new doc for convenience. Persistence is the CALLER'S job
 * (saveProject); keeping that here would hide the I/O seam.
 */
export function applySuitEdit(
  doc: ProjectDoc,
  parameterId: string,
  value: unknown,
): boolean {
  const spec = SUIT_ROWS.find((r) => r.parameterId === parameterId);
  if (!spec) return false;
  if (spec.kind === "quantity") {
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    const clamped =
      spec.min !== undefined || spec.max !== undefined
        ? Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, n))
        : n;
    writePath(doc, spec.path, clamped);
    return true;
  }
  if (spec.kind === "string") {
    if (typeof value !== "string") return false;
    // Trim absurd input rather than letting objects/cycles through.
    writePath(doc, spec.path, value.slice(0, 64));
    return true;
  }
  if (spec.kind === "enum") {
    const opts = spec.enumValues ?? [];
    if (!opts.includes(String(value))) return false;
    writePath(doc, spec.path, String(value));
    return true;
  }
  return false;
}
