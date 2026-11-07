import { useMemo, useRef, type MutableRefObject } from "react";

export interface ModeInputHoldRefs<TPick> {
  holdStartRef: MutableRefObject<{ x: number; y: number } | null>;
  lastResolvedRef: MutableRefObject<TPick | null>;
  dragActiveRef: MutableRefObject<boolean>;
}

/**
 * Owns the hold/drag state used by `createModeInputHandlers`. Hoisted out of
 * the factory closure so an in-progress hold or drag survives a `useMemo`
 * rebuild during the 350 ms hold-LMB window, e.g. when a worker op completes
 * and `elements` updates while the user is still holding the mouse.
 *
 * The returned bag has stable identity, so consumers can safely list it in
 * their `useMemo` deps without forcing extra rebuilds.
 */
export function useModeInputHoldRefs<TPick>(): ModeInputHoldRefs<TPick> {
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastResolvedRef = useRef<TPick | null>(null);
  const dragActiveRef = useRef<boolean>(false);
  return useMemo(
    () => ({ holdStartRef, lastResolvedRef, dragActiveRef }),
    [holdStartRef, lastResolvedRef, dragActiveRef],
  );
}
