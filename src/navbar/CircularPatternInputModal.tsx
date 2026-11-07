import React, { FC, useEffect, useRef, useState } from "react";
import { parseNumericInput } from "../model/numericInput";

interface CircularPatternInputModalProps {
  defaultCount?: number;
  defaultAngle?: number;
  onConfirm: (count: number, angle: number) => void;
  onCancel: () => void;
}

const inputClass =
  "w-20 px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm focus:outline-none focus:border-blue-500";

const CircularPatternInputModal: FC<CircularPatternInputModalProps> = ({
  defaultCount = 4,
  defaultAngle = 360,
  onConfirm,
  onCancel,
}) => {
  const [count, setCount] = useState(String(defaultCount));
  const [angle, setAngle] = useState(defaultAngle.toFixed(0));
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    countRef.current?.focus();
    countRef.current?.select();
  }, []);

  const submit = () => {
    const parsedCount = parseNumericInput(count, "unitless");
    if (!parsedCount.ok) return setError(parsedCount.error);
    const parsedAngle = parseNumericInput(angle, "angle");
    if (!parsedAngle.ok) return setError(parsedAngle.error);

    const n = parsedCount.value;
    if (!Number.isInteger(n) || n < 2 || n > 50) {
      return setError("Count must be an integer from 2 to 50.");
    }
    if (Math.abs(parsedAngle.value) < 1e-9) {
      return setError("Total angle must be non-zero.");
    }
    setError(null);
    onConfirm(n, parsedAngle.value);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="p-2 bg-gray-600 rounded mt-2">
      <div className="text-sm text-gray-300 mb-1">Circular pattern:</div>
      <div className="flex gap-2 items-end">
        <label className="text-xs text-gray-400">
          Count
          <input
            ref={countRef}
            type="text"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            onKeyDown={onKeyDown}
            className={`${inputClass} block mt-1`}
            aria-label="Circular pattern count"
          />
        </label>
        <label className="text-xs text-gray-400">
          Total angle (deg)
          <input
            type="text"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            onKeyDown={onKeyDown}
            className={`${inputClass} block mt-1`}
            aria-label="Circular pattern angle"
          />
        </label>
        <button
          onClick={submit}
          className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
        >
          OK
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 bg-gray-500 hover:bg-gray-400 rounded text-sm"
        >
          Cancel
        </button>
      </div>
      <div className="text-xs text-gray-400 mt-1">
        Count includes the source; copies are evenly spaced over the total
        angle. Math and units supported (360 deg).
      </div>
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
    </div>
  );
};

export default CircularPatternInputModal;
