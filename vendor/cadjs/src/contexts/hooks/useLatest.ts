import { useRef, useEffect, MutableRefObject } from "react";

/**
 * Returns a `MutableRefObject` whose `.current` always points at the latest
 * value of `value`. Useful for callbacks/effects that need "the most recent
 * value" without re-running on every change, e.g. snapshot capture inside
 * an undo stack that should not invalidate its dep array on every render.
 */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef<T>(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
