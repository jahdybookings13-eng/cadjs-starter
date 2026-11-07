import React, { FC } from "react";
import { RevolveDirection } from "@vitekk02/cadjs";
import { RevolvePhase } from "@vitekk02/cadjs/react";

export interface RevolveModePanelProps {
  revolveIsApplying: boolean;
  revolvePhase: RevolvePhase;
  selectOriginAxis: (axis: "X" | "Y" | "Z") => void;
  revolveDirection: RevolveDirection;
  setRevolveDirection: (direction: RevolveDirection) => void;
  flipRevolveAxis: () => void;
  revolveAngle: number;
  setRevolveAngle: (angle: number) => void;
  revolveAngle2: number;
  setRevolveAngle2: (angle: number) => void;
  performRevolve: (angle: number) => void | Promise<void>;
}

const RevolveModePanel: FC<RevolveModePanelProps> = ({
  revolveIsApplying,
  revolvePhase,
  selectOriginAxis,
  revolveDirection,
  setRevolveDirection,
  flipRevolveAxis,
  revolveAngle,
  setRevolveAngle,
  revolveAngle2,
  setRevolveAngle2,
  performRevolve,
}) => {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-400">
        {revolveIsApplying
          ? "Applying revolve..."
          : revolvePhase === "SELECT_PROFILE"
            ? "Select a flat profile"
            : revolvePhase === "SELECT_AXIS"
              ? "Click an edge, sketch line, or pick an axis"
              : "Enter angle and confirm"}
      </span>
      {revolvePhase === "SELECT_AXIS" && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Axis:</span>
          <button
            className="flex-none px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
            onClick={() => selectOriginAxis("X")}
          >
            X
          </button>
          <button
            className="flex-none px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
            onClick={() => selectOriginAxis("Y")}
          >
            Y
          </button>
          <button
            className="flex-none px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
            onClick={() => selectOriginAxis("Z")}
          >
            Z
          </button>
        </div>
      )}
      {revolvePhase === "SET_ANGLE" && (
        <>
          <button
            className={`px-2 py-1 text-xs rounded ${
              revolveDirection === "one"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
            onClick={() => setRevolveDirection("one")}
          >
            One Side
          </button>
          <button
            className={`px-2 py-1 text-xs rounded ${
              revolveDirection === "two"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
            onClick={() => setRevolveDirection("two")}
          >
            Two Sides
          </button>
          <button
            className={`px-2 py-1 text-xs rounded ${
              revolveDirection === "symmetric"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
            onClick={() => setRevolveDirection("symmetric")}
          >
            Symmetric
          </button>
          <div className="w-px h-4 bg-gray-600" />
          <button
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
            onClick={flipRevolveAxis}
            title="Flip axis direction"
          >
            Flip
          </button>
          <div className="w-px h-4 bg-gray-600" />
          <input
            type="number"
            aria-label="Revolve angle"
            className="w-20 px-2 py-1 text-sm bg-gray-700 text-white rounded border border-gray-600"
            value={revolveAngle}
            onChange={(e) => setRevolveAngle(parseFloat(e.target.value) || 360)}
            min={1}
            max={360}
          />
          <span className="text-xs text-gray-500">deg</span>
          {revolveDirection === "two" && (
            <>
              <input
                type="number"
                aria-label="Second revolve angle"
                className="w-20 px-2 py-1 text-sm bg-gray-700 text-white rounded border border-gray-600"
                value={revolveAngle2}
                onChange={(e) =>
                  setRevolveAngle2(parseFloat(e.target.value) || 360)
                }
                min={1}
                max={360}
              />
              <span className="text-xs text-gray-500">deg</span>
            </>
          )}
          <button
            className="flex-none px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
            onClick={() => {
              void performRevolve(revolveAngle);
            }}
          >
            Revolve
          </button>
        </>
      )}
      <span className="text-xs text-gray-500">Enter: apply | Esc: cancel</span>
    </div>
  );
};

export default RevolveModePanel;
