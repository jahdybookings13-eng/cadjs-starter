import { describe, expect, it } from "vitest";
import type { BrowserItem } from "@vitekk02/cadjs";
import { groupBrowserByPart, groupBrowserItems } from "../featureTreeGroups";

const row = (id: string, folder?: string): BrowserItem => ({
  id,
  label: id,
  itemType: "body",
  visible: true,
  featureId: id,
  ...(folder ? { featureFolder: folder } : {}),
});

describe("groupBrowserItems", () => {
  it("groups rows with the same folder", () => {
    const grouped = groupBrowserItems([
      row("A", "Base"),
      row("B", "Base"),
      row("C"),
      row("D", "Detail"),
    ]);

    expect(grouped.map((item) => item.label)).toEqual(["Base", "C", "Detail"]);
    expect(grouped[0]?.itemType).toBe("folder");
    expect(grouped[0]?.children?.map((item) => item.label)).toEqual(["A", "B"]);
    expect(grouped[1]?.itemType).toBe("body");
    expect(grouped[2]?.children?.map((item) => item.label)).toEqual(["D"]);
  });

  it("merges non-contiguous members into one folder at the first position", () => {
    const grouped = groupBrowserItems([
      row("A", "Base"),
      row("B"),
      row("C", "Base"),
    ]);

    expect(grouped.map((item) => item.label)).toEqual(["Base", "B"]);
    expect(grouped[0]?.children?.map((item) => item.label)).toEqual(["A", "C"]);
    expect(grouped[0]?.id).toBe("folder-Base");
  });
});

describe("groupBrowserByPart", () => {
  const body = (
    id: string,
    partId?: string,
    partName?: string,
  ): BrowserItem => ({
    id,
    label: id,
    itemType: "body",
    visible: true,
    bodyId: id,
    ...(partId ? { bodyPartId: partId } : {}),
    ...(partName ? { bodyPartName: partName } : {}),
  });

  it("groups bodies into one part row at the first member", () => {
    const grouped = groupBrowserByPart([
      body("A", "p1", "Housing"),
      body("B"),
      body("C", "p1", "Housing"),
    ]);
    expect(grouped.map((item) => item.label)).toEqual(["Housing", "B"]);
    expect(grouped[0]).toMatchObject({ id: "part-p1", itemType: "folder" });
    expect(grouped[0]?.children?.map((item) => item.id)).toEqual(["A", "C"]);
  });

  it("keeps unassigned rows and groups inside folders", () => {
    const grouped = groupBrowserByPart([
      {
        id: "folder-Base",
        label: "Base",
        itemType: "folder",
        visible: true,
        children: [body("A", "p2", "Lid"), body("B")],
      },
      body("C", "p2", "Lid"),
    ]);
    expect(grouped[0]?.children?.map((item) => item.label)).toEqual([
      "Lid",
      "B",
    ]);
    expect(grouped[0]?.children?.[0]?.children?.map((item) => item.id)).toEqual(
      ["A"],
    );
    expect(grouped[1]?.children?.map((item) => item.id)).toEqual(["C"]);
  });
});
