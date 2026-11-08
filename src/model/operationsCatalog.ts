// Operations catalog for the primary feature toolbar.
//
// `operationMenu` is the authoritative, selection-aware list of Onshape-style
// commands. The toolbar menu is not selection-filtered: it shows every ready
// command the live action bus can actually run, grouped the way Onshape groups
// its Part Studio toolbar. Mode commands are always present because they are
// handled by the scene, not the bus.
import { MENU_BY_SELECTION, type MenuOp } from "./operationMenu";

export interface OperationGroup {
  id: string;
  label: string;
  ops: MenuOp[];
}

export const MODE_OPERATION_IDS = new Set([
  "new-sketch",
  "sketch",
  "extrude",
  "revolve",
  "loft",
  "sweep",
  "fillet",
  "boolean",
  "measure",
  "move",
]);

/** Catalog ids that dispatch to a differently named live bus action. */
export const OPERATION_ACTION_ALIASES: Record<string, string> = {
  "linear-pattern": "body-pattern",
  "sheet-metal": "flange",
};

const GROUP_ORDER = [
  ["sketch", "Sketch"],
  ["create", "Create"],
  ["modify", "Modify"],
  ["pattern", "Pattern"],
  ["sheet", "Sheet Metal"],
  ["surface", "Surface"],
  ["inspect", "Inspect"],
] as const;

const GROUP_FOR: Record<string, string> = {
  "new-sketch": "sketch",
  sketch: "sketch",
  extrude: "create",
  revolve: "create",
  loft: "create",
  sweep: "create",
  rib: "create",
  gusset: "create",
  web: "create",
  boss: "create",
  emboss: "create",
  coil: "create",
  "dome-feature": "create",
  "helix-curve": "create",
  "fit-spline": "create",
  "bridging-curve": "create",
  enclose: "create",
  "create-plane": "create",
  insert: "create",
  derive: "create",
  variables: "create",
  fillet: "modify",
  chamfer: "modify",
  boolean: "modify",
  hole: "modify",
  shell: "modify",
  draft: "modify",
  split: "modify",
  thicken: "modify",
  "move-face": "modify",
  "delete-face": "modify",
  "delete-bodies": "modify",
  transform: "modify",
  scale: "modify",
  wrap: "modify",
  "modify-fillet": "modify",
  mirror: "pattern",
  "linear-pattern": "pattern",
  "circular-pattern": "pattern",
  "curve-pattern": "pattern",
  "body-pattern": "pattern",
  "face-pattern": "pattern",
  "feature-pattern": "pattern",
  "sheet-metal": "sheet",
  hem: "sheet",
  unfold: "sheet",
  thread: "sheet",
  section: "surface",
  "curve-on-face": "surface",
  "project-curves": "surface",
  "ruled-fill-surface": "surface",
  measure: "inspect",
  appearance: "inspect",
  move: "inspect",
};

const EXTRA_MODE_OPS: MenuOp[] = [
  {
    id: "move",
    label: "Move Face",
    status: "ready",
    featureType: "transform",
    note: "direct body transform mode",
  },
];

function readyCatalog(): MenuOp[] {
  const byId = new Map<string, MenuOp>();
  for (const ops of Object.values(MENU_BY_SELECTION)) {
    for (const op of ops) {
      if (op.status !== "ready" || byId.has(op.id)) continue;
      byId.set(op.id, op);
    }
  }
  for (const op of EXTRA_MODE_OPS) if (!byId.has(op.id)) byId.set(op.id, op);
  return [...byId.values()];
}

function isLive(op: MenuOp, availableOps?: ReadonlySet<string>): boolean {
  if (MODE_OPERATION_IDS.has(op.id)) return true;
  if (!availableOps || availableOps.size === 0) return false;
  if (availableOps.has(op.id)) return true;
  const alias = OPERATION_ACTION_ALIASES[op.id];
  return Boolean(alias && availableOps.has(alias));
}

export function buildOperationsCatalog(
  availableOps?: ReadonlySet<string>,
): OperationGroup[] {
  const groups = new Map<string, MenuOp[]>(GROUP_ORDER.map(([id]) => [id, []]));
  for (const op of readyCatalog()) {
    if (!isLive(op, availableOps)) continue;
    const group = GROUP_FOR[op.id] ?? "create";
    groups.get(group)?.push(op);
  }
  return GROUP_ORDER.map(([id, label]) => ({
    id,
    label,
    ops: groups.get(id) ?? [],
  })).filter((group) => group.ops.length > 0);
}

export function countOperations(groups: OperationGroup[]): number {
  return groups.reduce((count, group) => count + group.ops.length, 0);
}
