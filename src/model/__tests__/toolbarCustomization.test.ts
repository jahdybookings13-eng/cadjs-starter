import { describe, expect, it } from "vitest";
import {
  TOOLBAR_CUSTOMIZATION_KEY,
  TOOLBAR_TOOL_IDS,
  defaultToolbarCustomization,
  isToolbarToolVisible,
  loadToolbarCustomization,
  normalizeToolbarCustomization,
  resetToolbarCustomization,
  saveToolbarCustomization,
  toggleToolbarTool,
  type ToolbarStorage,
} from "../toolbarCustomization";

function memoryStorage(): ToolbarStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

describe("toolbar customization", () => {
  it("starts with every implemented tool visible", () => {
    const customization = defaultToolbarCustomization();
    expect(customization.hidden).toEqual([]);
    for (const id of TOOLBAR_TOOL_IDS)
      expect(isToolbarToolVisible(customization, id)).toBe(true);
  });

  it("toggles a known tool and ignores unknown ids", () => {
    let customization = toggleToolbarTool(
      defaultToolbarCustomization(),
      "fillet",
    );
    expect(isToolbarToolVisible(customization, "fillet")).toBe(false);
    customization = toggleToolbarTool(customization, "fillet");
    expect(isToolbarToolVisible(customization, "fillet")).toBe(true);
    expect(toggleToolbarTool(customization, "not-a-tool")).toBe(customization);
  });

  it("normalizes duplicates and unknown persisted ids", () => {
    const normalized = normalizeToolbarCustomization({
      v: 1,
      hidden: ["sketch", "sketch", "nope", 7],
    });
    expect(normalized.hidden).toEqual(["sketch"]);
    expect(
      normalizeToolbarCustomization({ v: 2, hidden: ["sketch"] }).hidden,
    ).toEqual([]);
  });

  it("persists, reloads and resets through storage", () => {
    const storage = memoryStorage();
    const toggled = toggleToolbarTool(defaultToolbarCustomization(), "measure");
    saveToolbarCustomization(storage, toggled);
    expect(storage.data.has(TOOLBAR_CUSTOMIZATION_KEY)).toBe(true);
    expect(loadToolbarCustomization(storage).hidden).toEqual(["measure"]);
    const reset = resetToolbarCustomization();
    saveToolbarCustomization(storage, reset);
    expect(loadToolbarCustomization(storage).hidden).toEqual([]);
    expect(loadToolbarCustomization(null).hidden).toEqual([]);
  });
});
