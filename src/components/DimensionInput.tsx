import React, { FC } from "react";
import { NumberInput } from "./NumberInput";
import type { NumericInputMode } from "../model/numericInput";

interface DimensionInputProps {
  visible: boolean;
  position: { x: number; y: number };
  label: string;
  initialValue?: number | undefined;
  externalValue?: number | undefined;
  onSubmit: (value: number) => void;
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
  externalValue,
  onSubmit,
  onCancel,
  onChange,
  expressionMode = "length",
  showConfirmButton,
}) => {
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
        externalValue={externalValue}
        onSubmit={onSubmit}
        onCancel={onCancel}
        onChange={onChange}
        expressionMode={expressionMode}
        showConfirmButton={showConfirmButton}
        confirmLabel="Confirm"
        tabCancels
        className="flex items-center gap-1"
      />
      <div className="text-xs text-gray-500 mt-1">
        {showConfirmButton ? "Esc to cancel" : "Tab/Esc to skip"}
      </div>
    </div>
  );
};

export default DimensionInput;
