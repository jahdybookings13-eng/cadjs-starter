// Persisted primary-toolbar layout. Right-clicking the toolbar toggles these
// ids; the CSS visibility rule in PrimaryToolbar consumes the hidden list.

export const TOOLBAR_CUSTOMIZATION_KEY = "scadgen.toolbar.customization.v1";
export const TOOLBAR_CUSTOMIZATION_VERSION = 1 as const;

export interface ToolbarTool {
  id: string;
  label: string;
}

export interface ToolbarGroup {
  id: string;
  label: string;
  tools: readonly ToolbarTool[];
}

export const TOOLBAR_GROUPS: readonly ToolbarGroup[] = [
  {
    id: "create",
    label: "Create",
    tools: [
      { id: "sketch", label: "Sketch" },
      { id: "extrude", label: "Extrude" },
      { id: "revolve", label: "Revolve" },
      { id: "sweep", label: "Sweep" },
      { id: "loft", label: "Loft" },
      { id: "fillet", label: "Fillet" },
      { id: "boolean", label: "Boolean" },
      { id: "move", label: "Move" },
      { id: "measure", label: "Measure" },
    ],
  },
  {
    id: "insert",
    label: "Insert",
    tools: [
      { id: "fasteners", label: "Fasteners" },
      { id: "primitives", label: "Primitives" },
      { id: "operations", label: "Operations" },
      { id: "appearance", label: "Appearance" },
    ],
  },
  {
    id: "view",
    label: "View",
    tools: [
      { id: "grid", label: "Grid" },
      { id: "fit", label: "Fit All" },
    ],
  },
];

export const TOOLBAR_TOOL_IDS: readonly string[] = TOOLBAR_GROUPS.flatMap(
  (group) => group.tools.map((tool) => tool.id),
);

export interface ToolbarCustomization {
  v: typeof TOOLBAR_CUSTOMIZATION_VERSION;
  hidden: string[];
}

export interface ToolbarStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultToolbarCustomization(): ToolbarCustomization {
  return { v: TOOLBAR_CUSTOMIZATION_VERSION, hidden: [] };
}

export function normalizeToolbarCustomization(
  raw: unknown,
): ToolbarCustomization {
  if (!raw || typeof raw !== "object") return defaultToolbarCustomization();
  const value = raw as Partial<ToolbarCustomization>;
  if (value.v !== TOOLBAR_CUSTOMIZATION_VERSION) {
    return defaultToolbarCustomization();
  }
  const known = new Set(TOOLBAR_TOOL_IDS);
  const hidden = Array.isArray(value.hidden)
    ? [
        ...new Set(
          value.hidden.filter(
            (id): id is string => typeof id === "string" && known.has(id),
          ),
        ),
      ]
    : [];
  return { v: TOOLBAR_CUSTOMIZATION_VERSION, hidden };
}

export function loadToolbarCustomization(
  storage: ToolbarStorage | null | undefined,
): ToolbarCustomization {
  if (!storage) return defaultToolbarCustomization();
  try {
    const raw = storage.getItem(TOOLBAR_CUSTOMIZATION_KEY);
    return raw
      ? normalizeToolbarCustomization(JSON.parse(raw))
      : defaultToolbarCustomization();
  } catch {
    return defaultToolbarCustomization();
  }
}

export function saveToolbarCustomization(
  storage: ToolbarStorage | null | undefined,
  customization: ToolbarCustomization,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      TOOLBAR_CUSTOMIZATION_KEY,
      JSON.stringify(normalizeToolbarCustomization(customization)),
    );
  } catch {
    // Storage is optional; the in-memory toolbar still works for this session.
  }
}

export function isToolbarToolVisible(
  customization: ToolbarCustomization,
  id: string,
): boolean {
  return !customization.hidden.includes(id);
}

export function toggleToolbarTool(
  customization: ToolbarCustomization,
  id: string,
): ToolbarCustomization {
  if (!TOOLBAR_TOOL_IDS.includes(id)) return customization;
  const hidden = customization.hidden.includes(id)
    ? customization.hidden.filter((item) => item !== id)
    : [...customization.hidden, id];
  return { ...customization, hidden };
}

export function resetToolbarCustomization(): ToolbarCustomization {
  return defaultToolbarCustomization();
}
