import React from "react";

export interface TreeNode {
  instanceId: string;
  children: TreeNode[];
}

export const AssemblyTreeView: React.FC<{ node: TreeNode | null }> = ({
  node,
}) => {
  if (!node) return <div>No assembly</div>;
  const render = (n: TreeNode): React.ReactNode => (
    <li key={n.instanceId}>
      {n.instanceId}
      {n.children.length > 0 && <ul>{n.children.map(render)}</ul>}
    </li>
  );
  return <ul>{render(node)}</ul>;
};
