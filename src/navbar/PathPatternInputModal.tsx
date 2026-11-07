import React, { FC, useEffect, useRef, useState } from "react";
import { parseNumericInput } from "../model/numericInput";

export interface PathPatternCandidate {
  id: string;
  label: string;
}

interface PathPatternInputModalProps {
  candidates: PathPatternCandidate[];
  defaultPathId?: string;
  defaultCount?: number;
  defaultAlign?: boolean;
  onConfirm: (count: number, pathId: string, align: boolean) => void;
  onCancel: () => void;
}

const inputClass =
  "w-20 px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm focus:outline-none focus:border-blue-500";

const PathPatternInputModal: FC<PathPatternInputModalProps> = ({
  candidates,
  defaultPathId,
  defaultCount = 4,
  defaultAlign = true,
  onConfirm,
  onCancel,
}) => {
  const [count, setCount] = useState(String(defaultCount));
  const [pathId, setPathId] = useState(
    defaultPathId ?? candidates[0]?.id ?? "",
  );
  const [align, setAlign] = useState(defaultAlign);
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    countRef.current?.focus();
    countRef.current?.select();
  }, []);

  const submit = () => {
    const parsedCount = parseNumericInput(count, "unitless");
    if (!parsedCount.ok) return setError(parsedCount.error);
    const n = parsedCount.value;
    if (!Number.isInteger(n) || n < 2 || n > 50) {
      return setError("Count must be an integer from 2 to 50.");
    }
    if (!pathId) return setError("Choose a path curve.");
    setError(null);
    onConfirm(n, pathId, align);
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
      <div className="text-sm text-gray-300 mb-1">Path pattern:</div>
      <div className="flex gap-2 items-end flex-wrap">
        <label className="text-xs text-gray-400">
          Path
          <select
            value={pathId}
            onChange={(event) => setPathId(event.target.value)}
            className={`${inputClass} block mt-1 !w-36`}
            aria-label="Pattern path"
          >
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-400">
          Count
          <input
            ref={countRef}
            type="text"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            onKeyDown={onKeyDown}
            className={`${inputClass} block mt-1`}
            aria-label="Path pattern count"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-300 pb-1.5">
          <input
            type="checkbox"
            checked={align}
            onChange={(event) => setAlign(event.target.checked)}
            aria-label="Align to path tangent"
          />
          Align to path
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
        Count 2–50. The path is not copied. Open paths place count − 1 copies;
        closed paths fill the loop. Enter to confirm, Escape to cancel.
      </div>
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
    </div>
  );
};

export default PathPatternInputModal;
