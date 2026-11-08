import { MENU_BY_SELECTION } from "./operationMenu";
import { SKETCH_COMMANDS } from "./sketchControls";

/**
 * Global tool search index. It deliberately derives from the existing
 * registries instead of keeping a second command list: the operation menu is
 * the feature catalog, the toolbar modes are the always-available tools, and
 * the sketch command map is the sketch editor's behavior registry.
 */
export type ToolSearchKind = "mode" | "op" | "sketch" | "command";

export interface ToolSearchEntry {
  id: string;
  label: string;
  kind: ToolSearchKind;
  description: string;
  aliases: readonly string[];
}

export const TOOL_SEARCH_OPEN_EVENT = "scadgen:open-tool-search";
export const RUN_SKETCH_COMMAND_EVENT = "scadgen:run-sketch-command";

const MODE_TOOLS: readonly ToolSearchEntry[] = [
  {
    id: "sketch",
    label: "Sketch",
    kind: "mode",
    description: "Start or edit a 2D sketch.",
    aliases: ["2d", "new sketch"],
  },
  {
    id: "extrude",
    label: "Extrude",
    kind: "mode",
    description: "Extrude a sketch profile into a solid.",
    aliases: ["pull", "boss"],
  },
  {
    id: "revolve",
    label: "Revolve",
    kind: "mode",
    description: "Revolve a sketch profile around an axis.",
    aliases: ["lathe", "spin"],
  },
  {
    id: "sweep",
    label: "Sweep",
    kind: "mode",
    description: "Sweep a profile along a path.",
    aliases: ["path"],
  },
  {
    id: "loft",
    label: "Loft",
    kind: "mode",
    description: "Blend profiles into a lofted solid.",
    aliases: ["blend"],
  },
  {
    id: "fillet",
    label: "Fillet",
    kind: "mode",
    description: "Round selected edges.",
    aliases: ["round", "radius"],
  },
  {
    id: "combine",
    label: "Boolean",
    kind: "mode",
    description: "Combine bodies with union, subtract or intersect.",
    aliases: ["combine", "union", "subtract", "intersect"],
  },
  {
    id: "move",
    label: "Move",
    kind: "mode",
    description: "Transform bodies and components.",
    aliases: ["translate", "rotate", "transform"],
  },
  {
    id: "measure",
    label: "Measure",
    kind: "mode",
    description: "Measure distances, angles and body properties.",
    aliases: ["dimension", "distance"],
  },
];

const APP_COMMANDS: readonly ToolSearchEntry[] = [
  {
    id: "fit",
    label: "Fit All",
    kind: "command",
    description: "Frame the model in the viewport.",
    aliases: ["zoom", "frame", "view"],
  },
  {
    id: "grid",
    label: "Toggle Grid",
    kind: "command",
    description: "Show or hide the ground grid.",
    aliases: ["ground", "snap"],
  },
  {
    id: "undo",
    label: "Undo",
    kind: "command",
    description: "Undo the last change.",
    aliases: ["history", "back"],
  },
  {
    id: "redo",
    label: "Redo",
    kind: "command",
    description: "Redo the last undone change.",
    aliases: ["history", "forward"],
  },
  {
    id: "save",
    label: "Save",
    kind: "command",
    description: "Save the current document.",
    aliases: ["commit", "persist"],
  },
  {
    id: "export",
    label: "Export",
    kind: "command",
    description: "Export the current document.",
    aliases: ["download", "stl", "step"],
  },
  {
    id: "documents",
    label: "Documents",
    kind: "command",
    description: "Open the documents browser.",
    aliases: ["files", "open"],
  },
  {
    id: "help",
    label: "Keyboard Help",
    kind: "command",
    description: "Open the keyboard and controls reference.",
    aliases: ["shortcuts", "keys", "controls"],
  },
];

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export function buildToolSearchIndex({
  inSketch,
  availableOps,
}: {
  inSketch: boolean;
  /** Omit catalog operations the live bus cannot run yet. */
  availableOps?: ReadonlySet<string>;
}): readonly ToolSearchEntry[] {
  const entries: ToolSearchEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: ToolSearchEntry) => {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  for (const entry of MODE_TOOLS) push(entry);

  for (const op of Object.values(MENU_BY_SELECTION).flat()) {
    if (op.status !== "ready") continue;
    if (availableOps && !availableOps.has(op.id)) continue;
    // A ready feature operation and a toolbar mode can share an id (Extrude,
    // Fillet, …). Keep the mode because it is the discoverable entry point;
    // the operation remains reachable from the feature menu.
    if (MODE_TOOLS.some((mode) => mode.id === op.id)) continue;
    // The sketch mode above is the real entry point; the history op is an
    // internal node builder rather than a second search result.
    if (op.featureType === "newSketch") continue;
    push({
      id: op.id,
      label: op.label,
      kind: "op",
      description: op.note ?? `${op.label} feature`,
      aliases: [op.featureType, op.id].filter(
        (token): token is string =>
          typeof token === "string" && token.length > 0,
      ),
    });
  }

  for (const entry of APP_COMMANDS) push(entry);

  if (inSketch) {
    for (const command of SKETCH_COMMANDS) {
      if (command.hiddenInPalette) continue;
      push({
        id: command.id,
        label: `Sketch: ${command.label}`,
        kind: "sketch",
        description: command.description,
        aliases: [
          command.label,
          ...command.keys,
          ...command.autocad,
          ...command.cadjs,
        ],
      });
    }
  }

  return entries;
}

export function searchTools(
  query: string,
  entries: readonly ToolSearchEntry[],
): readonly ToolSearchEntry[] {
  const q = normalized(query);
  if (!q) return entries;

  return entries
    .map((entry) => {
      const label = normalized(entry.label);
      const id = normalized(entry.id);
      const aliases = entry.aliases.map(normalized);
      const description = normalized(entry.description);
      let score = 0;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 80;
      else if (id === q) score = 70;
      else if (label.includes(q)) score = 55;
      else if (aliases.some((alias) => alias === q)) score = 50;
      else if (aliases.some((alias) => alias.includes(q))) score = 35;
      else if (description.includes(q)) score = 15;
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label),
    )
    .map(({ entry }) => entry);
}
