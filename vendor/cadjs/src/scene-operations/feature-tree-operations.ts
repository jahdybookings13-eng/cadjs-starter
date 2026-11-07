// Pure feature-tree transforms (rename, reorder, applyBoolean, applyUngroup).
// No Result<T>: tree mutations are deterministic; missing-node cases return
// the unchanged tree. See ./result.ts for the policy.
import { FeatureNode, OperationType } from "../types/sketch-types";
import { NodeId } from "./types";

/**
 * Rename a node in the feature tree by its ID.
 */
export function renameNode(
  tree: FeatureNode[],
  nodeId: string,
  newName: string,
): FeatureNode[] {
  return tree.map((node) => {
    if (node.id === nodeId) {
      return { ...node, name: newName };
    }
    if (node.children) {
      return { ...node, children: renameNode(node.children, nodeId, newName) };
    }
    return node;
  });
}

/**
 * Remove a node from the tree by its ID (not by elementId).
 * Returns the updated tree and the removed node (if found).
 */
export function removeNodeById(
  tree: FeatureNode[],
  nodeId: string,
): { updatedTree: FeatureNode[]; removedNode: FeatureNode | null } {
  let removedNode: FeatureNode | null = null;

  function filterNodes(nodes: FeatureNode[]): FeatureNode[] {
    return nodes.reduce<FeatureNode[]>((acc, node) => {
      if (node.id === nodeId) {
        removedNode = node;
        return acc;
      }
      if (node.children) {
        acc.push({ ...node, children: filterNodes(node.children) });
      } else {
        acc.push(node);
      }
      return acc;
    }, []);
  }

  return { updatedTree: filterNodes(tree), removedNode };
}

/**
 * Recursively remove nodes whose elementId is in the given set.
 * Returns the updated tree and the removed nodes.
 * Empty parent sketch nodes are kept (history).
 */
export function removeNodesByElementId(
  tree: FeatureNode[],
  elementIds: Set<string>,
): { updatedTree: FeatureNode[]; removedNodes: FeatureNode[] } {
  const removedNodes: FeatureNode[] = [];

  function filterNodes(nodes: FeatureNode[]): FeatureNode[] {
    return nodes.reduce<FeatureNode[]>((acc, node) => {
      if (node.elementId && elementIds.has(node.elementId)) {
        removedNodes.push(node);
        return acc;
      }

      if (node.children) {
        const filteredChildren = filterNodes(node.children);
        // Keep parent even if all children removed (history)
        acc.push({ ...node, children: filteredChildren });
      } else {
        acc.push(node);
      }
      return acc;
    }, []);
  }

  return { updatedTree: filterNodes(tree), removedNodes };
}

/**
 * Count operation nodes of a given type in the tree for naming ("Union 1", "Union 2", etc.).
 */
export function countOperationsOfType(
  tree: FeatureNode[],
  opType: OperationType,
): number {
  let count = 0;

  function walk(nodes: FeatureNode[]) {
    for (const node of nodes) {
      if (node.type === "operation" && node.operationType === opType) {
        count++;
      }
      if (node.children) {
        walk(node.children);
      }
    }
  }

  walk(tree);
  return count;
}

/**
 * Apply a boolean operation (union/difference/intersection) to the feature tree.
 * Removes consumed profile/body nodes, creates a new operation node
 * with consumed nodes as children, and appends it to the tree.
 */
export function applyBooleanOperationToTree(
  tree: FeatureNode[],
  consumedElementIds: NodeId[],
  newElementId: NodeId,
  operationType: OperationType,
  operationName: string,
): FeatureNode[] {
  const elementIdSet = new Set(consumedElementIds);
  const { updatedTree, removedNodes } = removeNodesByElementId(
    tree,
    elementIdSet,
  );

  const operationNode: FeatureNode = {
    id: `op_${newElementId}`,
    type: "operation",
    name: operationName,
    visible: true,
    expanded: true,
    elementId: newElementId,
    operationType,
    children: removedNodes,
  };

  return [...updatedTree, operationNode];
}

/**
 * Apply an extrude operation to the feature tree.
 * Finds the profile node by elementId and converts it to an operation node.
 */
export function applyExtrudeToTree(
  tree: FeatureNode[],
  elementId: string,
  operationName: string,
): FeatureNode[] {
  function updateNodes(nodes: FeatureNode[]): FeatureNode[] {
    return nodes.map((node) => {
      if (node.elementId === elementId) {
        return {
          ...node,
          type: "operation" as const,
          name: operationName,
          operationType: "extrude" as const,
        };
      }
      if (node.children) {
        return { ...node, children: updateNodes(node.children) };
      }
      return node;
    });
  }

  return updateNodes(tree);
}

/**
 * Apply a fillet or chamfer operation to the feature tree.
 * Finds the node by elementId and converts it to an operation node.
 */
export function applyFilletToTree(
  tree: FeatureNode[],
  elementId: string,
  operationName: string,
  operationType: OperationType,
): FeatureNode[] {
  function updateNodes(nodes: FeatureNode[]): FeatureNode[] {
    return nodes.map((node) => {
      if (node.elementId === elementId) {
        return {
          ...node,
          type: "operation" as const,
          name: operationName,
          operationType,
        };
      }
      if (node.children) {
        return { ...node, children: updateNodes(node.children) };
      }
      return node;
    });
  }

  return updateNodes(tree);
}

/**
 * Apply a sweep operation to the feature tree.
 * Updates the profile node to a sweep operation and removes the path node.
 */
export function applySweepToTree(
  tree: FeatureNode[],
  profileElementId: string,
  pathElementId: string,
  operationName: string,
): FeatureNode[] {
  // Remove path node
  const pathIdSet = new Set([pathElementId]);
  const { updatedTree } = removeNodesByElementId(tree, pathIdSet);

  // Convert profile node to sweep operation
  function updateNodes(nodes: FeatureNode[]): FeatureNode[] {
    return nodes.map((node) => {
      if (node.elementId === profileElementId) {
        return {
          ...node,
          type: "operation" as const,
          name: operationName,
          operationType: "sweep" as const,
        };
      }
      if (node.children) {
        return { ...node, children: updateNodes(node.children) };
      }
      return node;
    });
  }

  return updateNodes(updatedTree);
}

/**
 * Apply a revolve operation to the feature tree.
 * Finds the profile node by elementId and converts it to an operation node.
 */
export function applyRevolveToTree(
  tree: FeatureNode[],
  elementId: string,
  operationName: string,
): FeatureNode[] {
  function updateNodes(nodes: FeatureNode[]): FeatureNode[] {
    return nodes.map((node) => {
      if (node.elementId === elementId) {
        return {
          ...node,
          type: "operation" as const,
          name: operationName,
          operationType: "revolve" as const,
        };
      }
      if (node.children) {
        return { ...node, children: updateNodes(node.children) };
      }
      return node;
    });
  }

  return updateNodes(tree);
}
