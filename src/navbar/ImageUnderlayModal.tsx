import React, { useState } from "react";
import type { SketchImageUnderlay } from "@vitekk02/cadjs";

interface ImageUnderlayModalProps {
  underlays: SketchImageUnderlay[];
  onUpdate: (id: string, updates: Partial<SketchImageUnderlay>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const ImageUnderlayModal: React.FC<ImageUnderlayModalProps> = ({
  underlays,
  onUpdate,
  onDelete,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState(underlays[0]?.id ?? "");
  const selected =
    underlays.find((underlay) => underlay.id === selectedId) ?? underlays[0];

  if (!selected) {
    return (
      <div className="p-3 bg-gray-800 rounded border border-gray-600 text-sm text-gray-300">
        No image underlays.
        <button
          className="ml-3 px-2 py-1 rounded bg-gray-700"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    );
  }

  const field = (
    label: string,
    key: "x" | "y" | "width" | "height" | "opacity",
    step: number,
  ) => (
    <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        aria-label={label}
        value={selected[key] ?? 0}
        onChange={(event) =>
          onUpdate(selected.id, {
            [key]: Number(event.target.value) || 0,
          })
        }
        className="w-20 px-1 py-0.5 rounded bg-gray-700 border border-gray-600 text-white"
      />
    </label>
  );

  return (
    <div className="w-72 p-3 bg-gray-800 rounded border border-gray-600 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-200">
          Image underlay
        </span>
        <button className="text-gray-400 hover:text-white" onClick={onClose}>
          ×
        </button>
      </div>
      {underlays.length > 1 && (
        <select
          value={selected.id}
          onChange={(event) => setSelectedId(event.target.value)}
          className="w-full mb-2 px-1 py-1 text-xs bg-gray-700 text-gray-200 rounded border border-gray-600"
          aria-label="Select image underlay"
        >
          {underlays.map((underlay, index) => (
            <option key={underlay.id} value={underlay.id}>
              Underlay {index + 1}
            </option>
          ))}
        </select>
      )}
      <div className="space-y-1.5">
        {field("X", "x", 1)}
        {field("Y", "y", 1)}
        {field("Width", "width", 1)}
        {field("Height", "height", 1)}
        {field("Opacity", "opacity", 0.05)}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          className="px-2 py-1 text-xs rounded bg-red-700 hover:bg-red-600 text-white"
          onClick={() => onDelete(selected.id)}
        >
          Delete underlay
        </button>
      </div>
    </div>
  );
};

export default ImageUnderlayModal;
