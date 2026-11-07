// Pure derivation of browser-panel sections from feature tree + elements.
// No Result<T>: data shuffling, no failure mode. See ./result.ts for the policy.
import {
  FeatureNode,
  BrowserSection,
  BrowserItem,
} from "../types/sketch-types";

/**
 * Build categorical BrowserSections from the flat FeatureNode tree.
 *
 * Sections:
 *  - Origin  (static: planes, axes, origin point)
 *  - Bodies  (operation nodes, extruded profiles, anything that is/has a 3D solid)
 *  - Sketches (sketch nodes with unextruded profile children)
 */
export function buildBrowserSections(
  featureTree: FeatureNode[],
  sectionExpandedState: Record<string, boolean>,
  originVisibility?: Record<string, boolean>,
): BrowserSection[] {
  const bodyItems: BrowserItem[] = [];
  const sketchItems: BrowserItem[] = [];

  for (const node of featureTree) {
    if (node.type === "operation") {
      // Boolean/extrude operations are bodies
      bodyItems.push(featureNodeToBodyItem(node));
    } else if (node.type === "sketch") {
      // Sketch nodes: split children into bodies (extruded) vs profiles (flat)
      const extrudedChildren: BrowserItem[] = [];
      const profileChildren: BrowserItem[] = [];

      for (const child of node.children ?? []) {
        if (child.type === "operation") {
          bodyItems.push(featureNodeToBodyItem(child));
          extrudedChildren.push(featureNodeToBodyItem(child));
        } else {
          profileChildren.push({
            id: child.id,
            label: child.name,
            itemType: child.type === "body" ? "body" : "profile",
            visible: child.visible,
            elementId: child.elementId,
            sourceNodeId: child.id,
          });
        }
      }

      // Always show the sketch in the sketches section
      sketchItems.push({
        id: node.id,
        label: node.name,
        itemType: "sketch",
        visible: node.visible,
        expanded: node.expanded ?? true,
        sourceNodeId: node.id,
        children: profileChildren,
      });
    } else if (node.type === "body") {
      bodyItems.push({
        id: node.id,
        label: node.name,
        itemType: "body",
        visible: node.visible,
        elementId: node.elementId,
        sourceNodeId: node.id,
      });
    }
  }

  // Build origin section (static items, visibility tracked externally)
  const ov = originVisibility ?? {};
  const originItems: BrowserItem[] = [
    {
      id: "origin-xy",
      label: "XY Plane",
      itemType: "plane",
      visible: ov["origin-xy"] ?? true,
      sourceNodeId: "origin-xy",
    },
    {
      id: "origin-xz",
      label: "XZ Plane",
      itemType: "plane",
      visible: ov["origin-xz"] ?? true,
      sourceNodeId: "origin-xz",
    },
    {
      id: "origin-yz",
      label: "YZ Plane",
      itemType: "plane",
      visible: ov["origin-yz"] ?? true,
      sourceNodeId: "origin-yz",
    },
    {
      id: "origin-x-axis",
      label: "X Axis",
      itemType: "axis",
      visible: ov["origin-x-axis"] ?? true,
      sourceNodeId: "origin-x-axis",
    },
    {
      id: "origin-y-axis",
      label: "Y Axis",
      itemType: "axis",
      visible: ov["origin-y-axis"] ?? true,
      sourceNodeId: "origin-y-axis",
    },
    {
      id: "origin-z-axis",
      label: "Z Axis",
      itemType: "axis",
      visible: ov["origin-z-axis"] ?? true,
      sourceNodeId: "origin-z-axis",
    },
    {
      id: "origin-point",
      label: "Origin",
      itemType: "origin-point",
      visible: ov["origin-point"] ?? true,
      sourceNodeId: "origin-point",
    },
  ];

  return [
    {
      id: "section-origin",
      label: "Origin",
      sectionType: "origin",
      expanded: sectionExpandedState["section-origin"] ?? false,
      count: originItems.length,
      items: originItems,
    },
    {
      id: "section-bodies",
      label: "Bodies",
      sectionType: "bodies",
      expanded: sectionExpandedState["section-bodies"] ?? true,
      count: bodyItems.length,
      items: bodyItems,
    },
    {
      id: "section-sketches",
      label: "Sketches",
      sectionType: "sketches",
      expanded: sectionExpandedState["section-sketches"] ?? true,
      count: sketchItems.length,
      items: sketchItems,
    },
  ];
}

function featureNodeToBodyItem(node: FeatureNode): BrowserItem {
  const children: BrowserItem[] | undefined = node.children?.map((child) => ({
    id: child.id,
    label: child.name,
    itemType: (child.type === "operation"
      ? "operation"
      : child.type === "body"
        ? "body"
        : "profile") as BrowserItem["itemType"],
    visible: child.visible,
    elementId: child.elementId,
    sourceNodeId: child.id,
    operationType: child.operationType,
  }));

  return {
    id: node.id,
    label: node.name,
    itemType: node.type === "operation" ? "operation" : "body",
    visible: node.visible,
    expanded: node.expanded ?? true,
    elementId: node.elementId,
    sourceNodeId: node.id,
    children: children && children.length > 0 ? children : undefined,
    operationType: node.operationType,
  };
}
