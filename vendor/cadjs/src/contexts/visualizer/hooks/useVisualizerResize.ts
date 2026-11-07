import { useEffect } from "react";
import { useCadVisualizer } from "../../VisualizerContext";

/**
 * Subscribe to canvas-container resize events. The callback receives the new
 * width/height in CSS pixels and is invoked once on mount with the current size.
 *
 * Use this instead of `window.addEventListener("resize", ...)` so resizes that
 * change the canvas container without changing the window (split panes, dock
 * panels, devtools) are still observed.
 */
export function useVisualizerResize(
  listener: (width: number, height: number) => void,
): void {
  const { subscribeResize } = useCadVisualizer();

  useEffect(() => {
    return subscribeResize(listener);
  }, [subscribeResize, listener]);
}
