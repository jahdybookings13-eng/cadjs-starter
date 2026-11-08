import { describe, expect, it } from "vitest";

import {
  buildToolSearchIndex,
  searchTools,
  type ToolSearchEntry,
} from "../toolSearch";

function find(
  entries: readonly ToolSearchEntry[],
  id: string,
): ToolSearchEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

describe("global tool search", () => {
  it("derives modes, ready operations and app commands from existing registries", () => {
    const entries = buildToolSearchIndex({ inSketch: false });
    expect(find(entries, "extrude")?.kind).toBe("mode");
    expect(find(entries, "hole")?.kind).toBe("op");
    expect(find(entries, "fit")?.kind).toBe("command");
    expect(
      new Set(entries.map((entry) => `${entry.kind}:${entry.id}`)).size,
    ).toBe(entries.length);
  });

  it("includes sketch commands only while a sketch is active", () => {
    expect(
      find(buildToolSearchIndex({ inSketch: false }), "sketch.line"),
    ).toBeUndefined();
    expect(
      find(buildToolSearchIndex({ inSketch: true }), "sketch.line")?.label,
    ).toBe("Sketch: Line");
  });

  it("matches labels, ids, aliases and descriptions", () => {
    const entries = buildToolSearchIndex({ inSketch: false });
    expect(searchTools("extrude", entries)[0]?.id).toBe("extrude");
    expect(
      searchTools("round", entries).some((entry) => entry.id === "fillet"),
    ).toBe(true);
    expect(
      searchTools("union", entries).some((entry) => entry.id === "combine"),
    ).toBe(true);
    expect(
      searchTools("persist", entries).some((entry) => entry.id === "save"),
    ).toBe(true);
    expect(searchTools("no-such-tool", entries)).toEqual([]);
  });

  it("returns the full registry for an empty query", () => {
    const entries = buildToolSearchIndex({ inSketch: true });
    expect(searchTools("  ", entries)).toBe(entries);
  });

  it("omits catalog operations the live bus cannot run", () => {
    const entries = buildToolSearchIndex({
      inSketch: false,
      availableOps: new Set(["hole"]),
    });
    expect(find(entries, "hole")?.kind).toBe("op");
    expect(find(entries, "draft")).toBeUndefined();
    // Modes are always available even when the op of the same name is not.
    expect(find(entries, "extrude")?.kind).toBe("mode");

    const noOps = buildToolSearchIndex({
      inSketch: false,
      availableOps: new Set(),
    });
    expect(noOps.some((entry) => entry.kind === "op")).toBe(false);
  });
});
