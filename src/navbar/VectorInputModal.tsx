import React, { FC, useEffect, useRef, useState } from "react";
import { parseNumericInput } from "../model/numericInput";

interface VectorInputModalProps {
  title: string;
  defaultX?: number;
  defaultY?: number;
  onConfirm: (x: number, y: number) => void;
  onCancel: () => void;
}

const inputClass =
  "w-20 px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm focus:outline-none focus:border-blue-500";

const VectorInputModal: FC<VectorInputModalProps> = ({
  title,
  defaultX = 1,
  defaultY = 1,
  onConfirm,
  onCancel,
}) => {
  const [x, setX] = useState(defaultX.toFixed(2));
  const [y, setY] = useState(defaultY.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const xRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    xRef.current?.focus();
    xRef.current?.select();
  }, []);

  const submit = () => {
    const parsedX = parseNumericInput(x, "length");
    if (!parsedX.ok) return setError(parsedX.error);
    const parsedY = parseNumericInput(y, "length");
    if (!parsedY.ok) return setError(parsedY.error);
    if (Math.abs(parsedX.value) < 1e-9 && Math.abs(parsedY.value) < 1e-9) {
      return setError("Move/copy distance must be non-zero.");
    }
    setError(null);
    onConfirm(parsedX.value, parsedY.value);
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
      <div className="text-sm text-gray-300 mb-1">{title}:</div>
      <div className="flex gap-2 items-center">
        <span className="text-gray-400 text-xs">X</span>
        <input
          ref={xRef}
          type="text"
          value={x}
          onChange={(e) => setX(e.target.value)}
          onKeyDown={onKeyDown}
          className={inputClass}
          aria-label="X distance"
        />
        <span className="text-gray-400 text-xs">Y</span>
        <input
          type="text"
          value={y}
          onChange={(e) => setY(e.target.value)}
          onKeyDown={onKeyDown}
          className={inputClass}
          aria-label="Y distance"
        />
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
        Math and units supported (10 mm). Enter to confirm, Escape to cancel.
      </div>
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
    </div>
  );
};

export default VectorInputModal;
