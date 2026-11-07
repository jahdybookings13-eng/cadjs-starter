import React, { FC, useEffect, useState } from "react";
import { NumberInput } from "./NumberInput";
import type { NumericInputMode } from "../model/numericInput";
import type { Scope } from "../model/expression";

export interface DimensionSubmitOptions {
  driving: boolean;
  min?: number | undefined;
  max?: number | undefined;
}

interface DimensionInputProps {
  visible: boolean;
  position: { x: number; y: number };
  label: string;
  initialValue?: number | undefined;
  initialExpression?: string | undefined;
  initialDriving?: boolean | undefined;
  initialMin?: number | undefined;
  initialMax?: number | undefined;
  externalValue?: number | undefined;
  scope?: Scope | undefined;
  onSubmit: (
    value: number,
    expression: string,
    options: DimensionSubmitOptions,
  ) => void;
  onCancel: () => void;
  onChange?: ((value: number) => void) | undefined;
  expressionMode?: NumericInputMode | undefined;
  showConfirmButton?: boolean | undefined;
}

const DimensionInput: FC<DimensionInputProps> = ({
  visible,
  position,
  label,
  initialValue,
  initialExpression,
  initialDriving = true,
  initialMin,
  initialMax,
  externalValue,
  scope,
  onSubmit,
  onCancel,
  onChange,
  expressionMode = "length",
  showConfirmButton,
}) => {
  const [driving, setDriving] = useState(initialDriving);
  const [minText, setMinText] = useState(initialMin?.toString() ?? "");
  const [maxText, setMaxText] = useState(initialMax?.toString() ?? "");

  useEffect(() => {
    if (!visible) return;
    setDriving(initialDriving);
    setMinText(initialMin?.toString() ?? "");
    setMaxText(initialMax?.toString() ?? "");
  }, [visible, initialDriving, initialMin, initialMax]);

  if (!visible) return null;

  const clampedX = Math.max(
    80,
    Math.min(
      position.x,
      (typeof window !== "undefined" ? window.innerWidth : 1920) - 80,
    ),
  );
  const clampedY = Math.max(
    80,
    Math.min(
      position.y,
      (typeof window !== "undefined" ? window.innerHeight : 1080) - 20,
    ),
  );

  const min = minText.trim() === "" ? undefined : Number(minText);
  const max = maxText.trim() === "" ? undefined : Number(maxText);
  const limitsValid =
    (min === undefined || Number.isFinite(min)) &&
    (max === undefined || Number.isFinite(max)) &&
    (min === undefined || max === undefined || min <= max);

  return (
    <div
      className="absolute z-50 bg-gray-800 rounded shadow-lg p-2 border border-blue-500"
      style={{
        left: `${clampedX}px`,
        top: `${clampedY}px`,
        transform: "translate(-50%, -100%) translateY(-10px)",
      }}
    >
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <NumberInput
        initialValue={initialValue}
        initialText={initialExpression}
        externalValue={externalValue}
        onSubmit={(value, expression) => {
          if (!limitsValid) return;
          onSubmit(value, expression, {
            driving,
            ...(min === undefined ? {} : { min }),
            ...(max === undefined ? {} : { max }),
          });
        }}
        onCancel={onCancel}
        onChange={onChange}
        scope={scope}
        validate={(value) =>
          value > 0 &&
          (min === undefined || value >= min) &&
          (max === undefined || value <= max)
        }
        expressionMode={expressionMode}
        showConfirmButton={showConfirmButton}
        confirmLabel="Confirm"
        tabCancels
        className="flex items-center gap-1"
      />
      <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={driving}
            onChange={(event) => setDriving(event.target.checked)}
          />
          Driving
        </label>
        <label className="flex items-center gap-1">
          Min
          <input
            value={minText}
            onChange={(event) => setMinText(event.target.value)}
            className="w-14 rounded bg-gray-700 px-1 py-0.5 text-white"
            aria-label="Dimension minimum"
          />
        </label>
        <label className="flex items-center gap-1">
          Max
          <input
            value={maxText}
            onChange={(event) => setMaxText(event.target.value)}
            className="w-14 rounded bg-gray-700 px-1 py-0.5 text-white"
            aria-label="Dimension maximum"
          />
        </label>
      </div>
      {!driving && (
        <div className="text-[10px] text-amber-300 mt-1">
          Reference dimension — measures geometry without driving it.
        </div>
      )}
      {!limitsValid && (
        <div className="text-[10px] text-red-400 mt-1">
          Limits must be numbers with min ≤ max.
        </div>
      )}
      {initialExpression && (
        <div className="text-[10px] text-gray-500 mt-1 font-mono truncate max-w-56">
          {initialExpression}
        </div>
      )}
      <div className="text-xs text-gray-500 mt-1">
        {showConfirmButton ? "Esc to cancel" : "Tab/Esc to skip"}
      </div>
    </div>
  );
};

export default DimensionInput;
