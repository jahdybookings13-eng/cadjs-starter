import React, { FC, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  useCadCore,
  useCadVisualizer,
  useMeasureMode,
} from "@vitekk02/cadjs/react";
import MeasureModePanel from "../../navbar/MeasureModePanel";
import type { ModeContentProps } from ".";

const MeasureModeContent: FC<ModeContentProps> = ({ panelSlot }) => {
  const { pinnedMeasurements } = useCadCore();
  const { renderer } = useCadVisualizer();
  const {
    subMode,
    statusText,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
    setSubMode,
    clearTemporaryMeasurements,
    measurements,
    selectedMeasurementId,
    selectMeasurement,
    pinMeasurement,
    unpinMeasurement,
    deleteMeasurement,
  } = useMeasureMode();

  // Temp measurements are reassigned on Clear/pin, so a debug closure must read
  // the latest render instead of capturing whichever array existed at mount.
  const debugStateRef = useRef({
    subMode,
    statusText,
    measurements,
    pinnedMeasurements,
  });
  debugStateRef.current = {
    subMode,
    statusText,
    measurements,
    pinnedMeasurements,
  };

  // E2E hook: exposes the real measure state (and the same pin/unpin actions
  // the UI calls) so browser tests can cover pin persistence without
  // duplicating the measurement math.
  useEffect(() => {
    if (!import.meta.env.DEV && import.meta.env.MODE !== "test") return;
    const host = window as unknown as { __cadMeasureDebug?: unknown };
    const describe = (m: (typeof measurements)[number]) => ({
      id: m.id,
      type: m.type,
      pinned: m.pinned,
      value:
        m.type === "distance"
          ? m.distance
          : m.type === "edge-length"
            ? m.length
            : m.angleDegrees,
    });
    const api = {
      state: () => {
        const current = debugStateRef.current;
        return {
          subMode: current.subMode,
          statusText: current.statusText,
          measurements: current.measurements.map(describe),
          pinned: current.pinnedMeasurements.map(describe),
        };
      },
      pin: (id?: string) => pinMeasurement(id),
      unpin: (id?: string) => unpinMeasurement(id),
      clear: () => clearTemporaryMeasurements(),
    };
    host.__cadMeasureDebug = api;
    return () => {
      if (host.__cadMeasureDebug === api) delete host.__cadMeasureDebug;
    };
  }, [
    subMode,
    statusText,
    measurements,
    pinnedMeasurements,
    pinMeasurement,
    unpinMeasurement,
    clearTemporaryMeasurements,
  ]);

  // Canvas mouse listeners
  useEffect(() => {
    if (!renderer) return;
    const dom = renderer.domElement;
    dom.addEventListener("mousedown", handleMouseDown);
    dom.addEventListener("mousemove", handleMouseMove);
    return () => {
      dom.removeEventListener("mousedown", handleMouseDown);
      dom.removeEventListener("mousemove", handleMouseMove);
    };
  }, [renderer, handleMouseDown, handleMouseMove]);

  // Keyboard: P (pin), C (clear), Delete/Backspace (delete); other keys
  // (D/E/A/Escape) delegate to the hook's handler.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      const key = event.key.toLowerCase();
      if (key === "p") {
        pinMeasurement();
      } else if (key === "c") {
        clearTemporaryMeasurements();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        deleteMeasurement();
      } else {
        handleKeyDown(event);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    handleKeyDown,
    pinMeasurement,
    clearTemporaryMeasurements,
    deleteMeasurement,
  ]);

  const showList = measurements.length > 0 || pinnedMeasurements.length > 0;

  return (
    <>
      {panelSlot &&
        createPortal(
          <MeasureModePanel
            measureSubMode={subMode}
            setMeasureSubMode={setSubMode}
            measureStatusText={statusText}
            pinMeasurement={pinMeasurement}
            clearTemporaryMeasurements={clearTemporaryMeasurements}
          />,
          panelSlot,
        )}

      {showList && (
        <div className="absolute top-2 right-[152px] z-20 w-56 max-h-[200px] overflow-y-auto bg-gray-800/90 border border-gray-700 rounded shadow-lg">
          <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-700">
            Measurements
          </div>
          {measurements.map((m) => (
            <div
              key={m.id}
              className={`flex items-center justify-between px-2 py-0.5 cursor-pointer hover:bg-gray-700 ${
                selectedMeasurementId === m.id ? "bg-gray-600" : ""
              }`}
              onClick={() =>
                selectMeasurement(selectedMeasurementId === m.id ? null : m.id)
              }
            >
              <span className="text-xs text-gray-300 truncate">
                {m.type === "distance"
                  ? `Dist: ${m.distance.toFixed(3)}`
                  : m.type === "edge-length"
                    ? `Edge: ${m.length.toFixed(3)}`
                    : `Angle: ${m.angleDegrees.toFixed(1)}°`}
              </span>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button
                  className="px-1 py-0 text-[10px] rounded bg-gray-700 hover:bg-blue-600 text-gray-400 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    pinMeasurement(m.id);
                  }}
                  title="Pin"
                >
                  Pin
                </button>
                <button
                  className="px-1 py-0 text-[10px] rounded bg-gray-700 hover:bg-red-600 text-gray-400 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMeasurement(m.id);
                  }}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {pinnedMeasurements.map((m) => (
            <div
              key={m.id}
              className={`flex items-center justify-between px-2 py-0.5 cursor-pointer hover:bg-gray-700 ${
                selectedMeasurementId === m.id ? "bg-gray-600" : ""
              }`}
              onClick={() =>
                selectMeasurement(selectedMeasurementId === m.id ? null : m.id)
              }
            >
              <span className="text-xs text-blue-400 truncate">
                {m.type === "distance"
                  ? `Dist: ${m.distance.toFixed(3)}`
                  : m.type === "edge-length"
                    ? `Edge: ${m.length.toFixed(3)}`
                    : `Angle: ${m.angleDegrees.toFixed(1)}°`}
                <span className="text-blue-500 ml-1">(pinned)</span>
              </span>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button
                  className="px-1 py-0 text-[10px] rounded bg-gray-700 hover:bg-yellow-600 text-gray-400 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    unpinMeasurement(m.id);
                  }}
                  title="Unpin"
                >
                  Unpin
                </button>
                <button
                  className="px-1 py-0 text-[10px] rounded bg-gray-700 hover:bg-red-600 text-gray-400 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMeasurement(m.id);
                  }}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default MeasureModeContent;
