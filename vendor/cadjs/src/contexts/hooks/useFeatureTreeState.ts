import { useCallback, useState } from "react";
import { FeatureNode } from "../../types/sketch-types";
import { renameNode as renameNodeOp } from "../../scene-operations/feature-tree-operations";

/**
 * Owns the feature tree state, section expansion, and origin-helper visibility.
 *
 * Note: `deleteNode` lives in the composer (not here) because deleting a node
 * also removes its element via `useElementMutations.removeElement`, that's a
 * cross-cutting concern. This hook stays pure-state.
 *
 * `applyVisibility` is a callback wired by the composer so toggling a node's
 * visibility cascades to the corresponding `THREE.Object3D` in `objectsMap`.
 * Decoupling avoids forcing this hook to depend on mutations.
 */
export interface FeatureTreeStateApi {
  featureTree: FeatureNode[];
  setFeatureTree: React.Dispatch<React.SetStateAction<FeatureNode[]>>;
  sectionExpandedState: Record<string, boolean>;
  originVisibility: Record<string, boolean>;
  toggleNodeVisibility: (nodeId: string) => void;
  toggleNodeExpanded: (nodeId: string) => void;
  renameNode: (nodeId: string, newName: string) => void;
  toggleSectionExpanded: (sectionId: string) => void;
  toggleOriginVisibility: (id: string) => void;
}

export interface UseFeatureTreeStateDeps {
  /** Cascade a tree-node visibility flip to its corresponding 3D object. */
  applyVisibility: (elementId: string, visible: boolean) => void;
}

export function useFeatureTreeState(
  deps: UseFeatureTreeStateDeps,
): FeatureTreeStateApi {
  const [featureTree, setFeatureTree] = useState<FeatureNode[]>([]);

  const [sectionExpandedState, setSectionExpandedState] = useState<
    Record<string, boolean>
  >({
    "section-origin": false,
    "section-bodies": true,
    "section-sketches": true,
  });

  const [originVisibility, setOriginVisibility] = useState<
    Record<string, boolean>
  >({
    "origin-xy": true,
    "origin-xz": true,
    "origin-yz": true,
    "origin-x-axis": true,
    "origin-y-axis": true,
    "origin-z-axis": true,
    "origin-point": true,
  });

  const { applyVisibility } = deps;

  const toggleNodeVisibility = useCallback(
    (nodeId: string) => {
      const updateNode = (nodes: FeatureNode[]): FeatureNode[] => {
        return nodes.map((node) => {
          if (node.id === nodeId) {
            const newVisible = !node.visible;

            if (node.elementId) applyVisibility(node.elementId, newVisible);

            // Sketch nodes cascade to their child profiles/bodies.
            if (node.children) {
              const updatedChildren = node.children.map((child) => {
                if (child.elementId)
                  applyVisibility(child.elementId, newVisible);
                return { ...child, visible: newVisible };
              });
              return {
                ...node,
                visible: newVisible,
                children: updatedChildren,
              };
            }

            return { ...node, visible: newVisible };
          }

          if (node.children) {
            return { ...node, children: updateNode(node.children) };
          }
          return node;
        });
      };

      setFeatureTree((prev) => updateNode(prev));
    },
    [applyVisibility],
  );

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    const updateNode = (nodes: FeatureNode[]): FeatureNode[] => {
      return nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, expanded: !node.expanded };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };

    setFeatureTree((prev) => updateNode(prev));
  }, []);

  const renameNode = useCallback((nodeId: string, newName: string) => {
    setFeatureTree((prev) => renameNodeOp(prev, nodeId, newName));
  }, []);

  const toggleSectionExpanded = useCallback((sectionId: string) => {
    setSectionExpandedState((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  const toggleOriginVisibility = useCallback((id: string) => {
    setOriginVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  return {
    featureTree,
    setFeatureTree,
    sectionExpandedState,
    originVisibility,
    toggleNodeVisibility,
    toggleNodeExpanded,
    renameNode,
    toggleSectionExpanded,
    toggleOriginVisibility,
  };
}
