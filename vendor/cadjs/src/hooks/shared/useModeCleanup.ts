import { useCallback, useEffect, useRef } from "react";
import type { SceneMode } from "../../scene-operations/types";

/**
 * Standardised cleanup wiring for mode hooks.
 *
 * Pin the latest cleanup body in a ref so the mode-leave effect always calls
 * an up-to-date version, and expose a stable `cleanup` callback that internal
 * callers (e.g. an Escape handler) can invoke with the same identity across
 * renders. Returns the cleanup callback alongside the underlying ref so
 * advanced callers can override it if needed.
 *
 * Replaces ~16 LOC of identical boilerplate across `useExtrudeMode`,
 * `useSweepMode`, `useLoftMode`.
 */
export function useModeCleanup(
  activeMode: SceneMode,
  modeName: SceneMode,
  cleanupFn: () => void,
): {
  cleanup: () => void;
  cleanupRef: React.MutableRefObject<() => void>;
} {
  const cleanupRef = useRef<() => void>(cleanupFn);
  cleanupRef.current = cleanupFn;

  const cleanup = useCallback(() => cleanupRef.current(), []);

  useEffect(() => {
    if (activeMode !== modeName) return;
    return () => cleanupRef.current();
  }, [activeMode, modeName]);

  return { cleanup, cleanupRef };
}
