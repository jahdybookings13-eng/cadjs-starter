import { useCallback, useState } from "react";
import { Measurement } from "../../scene-operations/measure-types";
import { disposeMeasureOverlay } from "../../scene-operations/measure-operations";

/**
 * Owns the user's pinned measurements list (set in measure mode, persisted in
 * the scene until explicitly cleared).
 *
 * No cross-dependencies with other CoreContext hooks, pure container.
 */
export interface MeasurementsApi {
  pinnedMeasurements: Measurement[];
  addPinnedMeasurement: (measurement: Measurement) => void;
  removePinnedMeasurement: (id: string) => void;
  clearPinnedMeasurements: () => void;
}

export function useMeasurements(): MeasurementsApi {
  const [pinnedMeasurements, setPinnedMeasurements] = useState<Measurement[]>(
    [],
  );

  const addPinnedMeasurement = useCallback((measurement: Measurement) => {
    setPinnedMeasurements((prev) => [
      ...prev,
      { ...measurement, pinned: true },
    ]);
  }, []);

  const removePinnedMeasurement = useCallback((id: string) => {
    setPinnedMeasurements((prev) => {
      const measurement = prev.find((m) => m.id === id);
      if (measurement) {
        for (const obj of measurement.overlayObjects) {
          disposeMeasureOverlay(obj);
        }
      }
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  const clearPinnedMeasurements = useCallback(() => {
    setPinnedMeasurements((prev) => {
      for (const measurement of prev) {
        for (const obj of measurement.overlayObjects) {
          disposeMeasureOverlay(obj);
        }
      }
      return [];
    });
  }, []);

  return {
    pinnedMeasurements,
    addPinnedMeasurement,
    removePinnedMeasurement,
    clearPinnedMeasurements,
  };
}
