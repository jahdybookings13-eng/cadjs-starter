import React, { FC } from "react";
import { CombineOperationType } from "@vitekk02/cadjs";

export interface CombineModePanelProps {
  combineOpType: CombineOperationType;
  setCombineOpType: (type: CombineOperationType) => void;
  combineTarget: string | null;
  combineTools: string[];
  combineKeepTools: boolean;
  setCombineKeepTools: (keep: boolean) => void;
  canCombine: boolean;
  performCombine: () => void | Promise<void>;
}

const CombineModePanel: FC<CombineModePanelProps> = ({
  combineOpType,
  setCombineOpType,
  combineTarget,
  combineTools,
  combineKeepTools,
  setCombineKeepTools,
  canCombine,
  performCombine,
}) => {
  return (
    <div className="flex items-center gap-3">
      <button
        className={`px-2 py-1 text-xs rounded ${
          combineOpType === "join"
            ? "bg-green-600 text-white"
            : "bg-gray-700 hover:bg-gray-600 text-gray-300"
        }`}
        onClick={() => setCombineOpType("join")}
      >
        Join
      </button>
      <button
        className={`px-2 py-1 text-xs rounded ${
          combineOpType === "cut"
            ? "bg-orange-600 text-white"
            : "bg-gray-700 hover:bg-gray-600 text-gray-300"
        }`}
        onClick={() => setCombineOpType("cut")}
      >
        Cut
      </button>
      <button
        className={`px-2 py-1 text-xs rounded ${
          combineOpType === "intersect"
            ? "bg-purple-600 text-white"
            : "bg-gray-700 hover:bg-gray-600 text-gray-300"
        }`}
        onClick={() => setCombineOpType("intersect")}
      >
        Intersect
      </button>
      <div className="w-px h-4 bg-gray-600" />
      <span className="text-sm text-gray-400">
        {!combineTarget
          ? "Select target body"
          : combineTools.length === 0
            ? "Select tool body(ies)"
            : `Target: 1, Tools: ${combineTools.length}`}
      </span>
      {combineOpType !== "join" && (
        <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={combineKeepTools}
            onChange={(e) => setCombineKeepTools(e.target.checked)}
            aria-label="Keep combine tools"
            className="w-3 h-3"
          />
          Keep Tools
        </label>
      )}
      {canCombine && (
        <button
          className={`flex-none px-3 py-1 text-sm text-white rounded ${
            combineOpType === "join"
              ? "bg-green-600 hover:bg-green-500"
              : combineOpType === "cut"
                ? "bg-orange-600 hover:bg-orange-500"
                : "bg-purple-600 hover:bg-purple-500"
          }`}
          onClick={() => {
            void performCombine();
          }}
        >
          {combineOpType === "join"
            ? "Join"
            : combineOpType === "cut"
              ? "Cut"
              : "Intersect"}{" "}
          ({combineTools.length})
        </button>
      )}
    </div>
  );
};

export default CombineModePanel;
