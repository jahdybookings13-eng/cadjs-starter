import { useCallback, useRef, useState } from "react";

/**
 * Tracks whether a long-running async operation (boolean, sweep, loft, finish-
 * sketch) is in flight. The ref is read by synchronous gates that must not stall
 * a render (e.g. mode-change requests during an in-flight boolean op are dropped
 * by reading `isOperationPendingRef.current` directly). The state mirror exists
 * for UI re-renders that need to hide/disable controls during pending work.
 */
export interface AsyncPendingGuardApi {
  isOperationPending: boolean;
  isOperationPendingRef: React.MutableRefObject<boolean>;
  setOperationPending: (pending: boolean) => void;
}

export function useAsyncPendingGuard(): AsyncPendingGuardApi {
  const isOperationPendingRef = useRef(false);
  const [isOperationPending, setIsOperationPending] = useState(false);

  const setOperationPending = useCallback((pending: boolean) => {
    isOperationPendingRef.current = pending;
    setIsOperationPending(pending);
  }, []);

  return { isOperationPending, isOperationPendingRef, setOperationPending };
}
