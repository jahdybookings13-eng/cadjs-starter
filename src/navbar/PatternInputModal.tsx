import React, { FC, useEffect, useRef, useState } from "react";
import { parseNumericInput } from "../model/numericInput";

interface PatternInputModalProps {
  defaultCount?: number;
  defaultX?: number;
  defaultY?: number;
  onConfirm: (count: number, x: number, y: number) => void;
  onCancel: () => void;
}

const inputClass =
  "w-20 px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm focus:outline-none focus:border-blue-500";

const PatternInputModal: FC<PatternInputModalProps> = ({
  defaultCount = 3,
  defaultX = 1,
  defaultY = 0,
  onConfirm,
  onCancel,
}) => {
  const [count, setCount] = useState(String(defaultCount));
  const [x, setX] = useState(defaultX.toFixed(2));
  const [y, setY] = useState(defaultY.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    countRef.current?.focus();
    countRef.current?.select();
  }, []);

  const submit = () => {
    const parsedCount = parseNumericInput(count, "unitless");
    if (!parsedCount.ok) return setError(parsedCount.error);
    const parsedX = parseNumericInput(x, "length");
    if (!parsedX.ok) return setError(parsedX.error);
    const parsedY = parseNumericInput(y, "length");
    if (!parsedY.ok) return setError(parsedY.error);

    const n = parsedCount.value;
    if (!Number.isInteger(n) || n < 2 || n > 50) {
      return setError("Count must be an integer from 2 to 50.");
    }
    if (Math.abs(parsedX.value) < 1e-9 && Math.abs(parsedY.value) < 1e-9) {
      return setError("Pattern spacing must be non-zero.");
    }
    setError(null);
    onConfirm(n, parsedX.value, parsedY.value);
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
      <div className="text-sm text-gray-300 mb-1">Linear pattern:</div>
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
            aria-label="Pattern count"
          />
        </label>
        <label className="text-xs text-gray-400">
          X spacing
          <input
            type="text"
            value={x}
            onChange={(e) => setX(e.target.value)}
            onKeyDown={onKeyDown}
            className={`${inputClass} block mt-1`}
            aria-label="X spacing"
          />
        </label>
        <label className="text-xs text-gray-400">
          Y spacing
          <input
            type="text"
            value={y}
            onChange={(e) => setY(e.target.value)}
            onKeyDown={onKeyDown}
            className={`${inputClass} block mt-1`}
            aria-label="Y spacing"
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
        Count 2–50; spacing must be non-zero. Math and units supported (10 mm).
        Enter to confirm, Escape to cancel.
      </div>
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
    </div>
  );
};

export default PatternInputModal;
