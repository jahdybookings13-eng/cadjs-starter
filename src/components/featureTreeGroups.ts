import type { BrowserItem } from "@vitekk02/cadjs";

/**
 * Collapse every history-backed row that shares a folder into one folder row.
 * A folder is not a build-order constraint: features can be reordered inside
 * it, and unrelated features may sit between them, so non-contiguous members
 * still belong to the same folder. The folder appears at the first member's
 * position and its children keep history order.
 */
export function groupBrowserItems(items: BrowserItem[]): BrowserItem[] {
  const byFolder = new Map<string, BrowserItem[]>();
  for (const item of items) {
    const folder = item.featureFolder;
    if (!folder) continue;
    const children = byFolder.get(folder) ?? [];
    children.push(item);
    byFolder.set(folder, children);
  }

  const out: BrowserItem[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    const folder = item.featureFolder;
    if (!folder) {
      out.push(item);
      continue;
    }
    if (placed.has(folder)) continue;
    placed.add(folder);
    const children = byFolder.get(folder) ?? [];
    out.push({
      id: `folder-${folder}`,
      label: folder,
      itemType: "folder",
      visible: children.some((child) => child.visible),
      expanded: true,
      children,
    });
  }
  return out;
}

/**
 * Group body rows by their owning part. Part grouping is a second pass after
 * folder grouping: a part row contains every body assigned to it, wherever
 * that body sits in build order. Rows with no part stay where they are.
 */
export function groupBrowserByPart(items: BrowserItem[]): BrowserItem[] {
  const out: BrowserItem[] = [];
  const groupIndex = new Map<string, number>();
  for (const item of items) {
    const withChildren = item.children
      ? { ...item, children: groupBrowserByPart(item.children) }
      : item;
    const partId = withChildren.bodyPartId;
    if (!partId || withChildren.itemType === "folder") {
      out.push(withChildren);
      continue;
    }
    const existing = groupIndex.get(partId);
    if (existing === undefined) {
      groupIndex.set(partId, out.length);
      out.push({
        id: `part-${partId}`,
        label: withChildren.bodyPartName ?? "Part",
        itemType: "folder",
        visible: withChildren.visible,
        expanded: true,
        children: [withChildren],
      });
    } else {
      const group = out[existing]!;
      const children = [...(group.children ?? []), withChildren];
      out[existing] = {
        ...group,
        visible: children.some((child) => child.visible),
        children,
      };
    }
  }
  return out;
}
