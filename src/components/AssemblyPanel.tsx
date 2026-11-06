// Assembly side panel — desk-side control surface for the assembly subsystem.
// All mutations go through the action bus (assembly.insert / addMate / solve).
import React, { useMemo, useState } from "react";
import {
  buildTree,
  countInstances,
  type Assembly,
  type AssemblyNode,
  type Mate,
} from "../assemblies";

interface AssemblyPanelProps {
  asm: Assembly;
  onAddInstance: (i: {
    id: string;
    partId?: string;
    transform?: number[];
  }) => void;
  onAddMate: (m: Mate) => void;
  onSolve: () => {
    ok: boolean;
    dof: number;
    issues: string[];
    residual: number;
    placed: number;
  } | null;
}

let instCounter = 0;

const TreeNode: React.FC<{ node: AssemblyNode; depth: number }> = ({
  node,
  depth,
}) => (
  <div style={{ paddingLeft: depth * 14 }} className="leading-5">
    {node.instanceId}
    {node.children.map((c) => (
      <TreeNode key={c.instanceId} node={c} depth={depth + 1} />
    ))}
  </div>
);

const LiveTree: React.FC<{ asm: Assembly }> = ({ asm }) => {
  const tree = useMemo(() => buildTree(asm), [asm]);
  if (!tree) return <div className="text-gray-500">No instances</div>;
  return (
    <div className="text-[11px] text-gray-300">
      <TreeNode node={tree} depth={0} />
      <div className="text-gray-500 mt-1">
        instances: {countInstances(tree)}
      </div>
    </div>
  );
};

export const AssemblyPanel: React.FC<AssemblyPanelProps> = ({
  asm,
  onAddInstance,
  onAddMate,
  onSolve,
}) => {
  const [lastResult, setLastResult] = useState("");
  const parts = [...new Set(asm.instances.map((i) => i.partId))];

  const handleSolve = () => {
    const r = onSolve();
    if (r)
      setLastResult(
        `ok=${r.ok} dof=${r.dof} placed=${r.placed} residual=${r.residual.toFixed(5)}${
          r.issues.length ? "\nissues: " + r.issues.join("; ") : ""
        }`,
      );
    else setLastResult("(no solve result)");
  };

  const a = asm.instances[0];
  const b = asm.instances[1];

  return (
    <div className="w-72 flex-none bg-gray-900 border-l border-gray-700 flex flex-col text-xs text-gray-200 overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-700 font-semibold">
        Assembly — {asm.instances.length} instances, {asm.mates.length} mates
      </div>
      <div className="p-3 space-y-2">
        <button
          onClick={() =>
            onAddInstance({
              id: `inst_${++instCounter}`,
              partId: parts[0] ?? "body_0",
            })
          }
          className="w-full py-1 bg-gray-700 hover:bg-gray-600 rounded"
        >
          + Instance
        </button>
        {a && b && (
          <button
            onClick={() =>
              onAddMate({
                id: `m_${Date.now()}`,
                kind: "coincident",
                a: { bodyId: a.id, ref: "body" },
                b: { bodyId: b.id, ref: "body" },
              })
            }
            className="w-full py-1 bg-gray-700 hover:bg-gray-600 rounded"
          >
            + Coincident mate ({a.id} → {b.id})
          </button>
        )}
        <button
          onClick={handleSolve}
          className="w-full py-1 bg-blue-700 hover:bg-blue-600 rounded font-medium"
        >
          Solve &amp; Place
        </button>
        {lastResult && (
          <div className="text-[11px] text-gray-400 whitespace-pre-wrap break-all">
            {lastResult}
          </div>
        )}
      </div>
      <div className="p-3 border-t border-gray-700">
        <div className="font-semibold mb-1">Tree</div>
        <LiveTree asm={asm} />
      </div>
    </div>
  );
};
