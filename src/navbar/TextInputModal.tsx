import React, { FC, useEffect, useRef, useState } from "react";
import { parseNumericInput } from "../model/numericInput";

interface TextInputModalProps {
  defaultText?: string;
  defaultHeight?: number;
  onConfirm: (text: string, height: number) => void;
  onCancel: () => void;
}

const TextInputModal: FC<TextInputModalProps> = ({
  defaultText = "SCADGEN",
  defaultHeight = 10,
  onConfirm,
  onCancel,
}) => {
  const [text, setText] = useState(defaultText);
  const [height, setHeight] = useState(String(defaultHeight));
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
    textRef.current?.select();
  }, []);

  const submit = () => {
    const parsed = parseNumericInput(height, "length");
    if (!parsed.ok) return setError(parsed.error);
    if (!Number.isFinite(parsed.value) || parsed.value <= 0) {
      return setError("Text height must be positive.");
    }
    if (text.trim().length === 0) return setError("Enter some text.");
    setError(null);
    onConfirm(text, parsed.value);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="p-2 bg-gray-600 rounded mt-2 w-[320px]">
      <div className="text-sm text-gray-300 mb-1">Sketch text:</div>
      <textarea
        ref={textRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        className="w-full px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
        aria-label="Sketch text"
      />
      <div className="flex gap-2 items-end mt-2">
        <label className="text-xs text-gray-400">
          Height
          <input
            type="text"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            onKeyDown={onKeyDown}
            className="w-24 block mt-1 px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            aria-label="Text height"
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
        Single-stroke uppercase text, emitted as editable sketch lines. Use
        Ctrl/Cmd+Enter to confirm. Height accepts math and units (10 mm).
      </div>
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
    </div>
  );
};

export default TextInputModal;
