import { useCallback, useRef, useState } from "react";
import { PickItem } from "../scene-operations/mesh-operations";

const HOLD_MS = 400;
const DRAG_THRESHOLD_PX = 4;

export interface MenuCallbacks {
  onPick: (item: PickItem) => void;
  onHover?: ((item: PickItem | null) => void) | undefined;
  onMenuOpen?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
}

export interface MenuState extends MenuCallbacks {
  x: number;
  y: number;
  items: PickItem[];
}

export interface SelectOtherApi {
  startHold: (
    event: MouseEvent,
    candidates: PickItem[],
    callbacks: MenuCallbacks,
  ) => void;
  cancelHold: () => void;
  openFromContextMenu: (
    event: MouseEvent,
    candidates: PickItem[],
    callbacks: MenuCallbacks,
  ) => void;
  closeMenu: () => void;
}

export interface UseSelectOtherResult {
  api: SelectOtherApi;
  menu: MenuState | null;
  setMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
}

/**
 * Owns the Fusion 360-style "Select Other" overlay: a hold timer that fires
 * the menu after ~400 ms of unbroken LMB hold, plus an explicit right-click
 * entry point. Callers (mode hooks) provide the candidate list per event and
 * the onPick callback they want invoked when the user chooses a row.
 */
export function useSelectOther(): UseSelectOtherResult {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const cancelHold = useCallback(() => {
    clearTimer();
    holdStartRef.current = null;
  }, [clearTimer]);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const startHold = useCallback<SelectOtherApi["startHold"]>(
    (event, candidates, callbacks) => {
      if (candidates.length <= 1) return;
      cancelHold();
      holdStartRef.current = { x: event.clientX, y: event.clientY };
      const startedAt = holdStartRef.current;
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        // Only open if the pointer never wandered off (extra safety: caller
        // should also call cancelHold on mousemove past threshold).
        if (holdStartRef.current === startedAt) {
          callbacks.onMenuOpen?.();
          setMenu({
            x: startedAt.x,
            y: startedAt.y,
            items: candidates,
            ...callbacks,
          });
        }
      }, HOLD_MS);
    },
    [cancelHold],
  );

  const openFromContextMenu = useCallback<
    SelectOtherApi["openFromContextMenu"]
  >(
    (event, candidates, callbacks) => {
      if (candidates.length === 0) return;
      cancelHold();
      callbacks.onMenuOpen?.();
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: candidates,
        ...callbacks,
      });
    },
    [cancelHold],
  );

  // Stable api object whose methods always dispatch to the freshest closure.
  // Reassigning api.current.X each render (the prior pattern) breaks the
  // stable-ref claim, anything captured via `const { startHold } = api`
  // would point at a stale closure. Forwarders solve both ends.
  const latestRef = useRef<SelectOtherApi>({
    startHold,
    cancelHold,
    openFromContextMenu,
    closeMenu,
  });
  latestRef.current = { startHold, cancelHold, openFromContextMenu, closeMenu };

  const apiRef = useRef<SelectOtherApi>({
    startHold: (event, candidates, callbacks) =>
      latestRef.current.startHold(event, candidates, callbacks),
    cancelHold: () => latestRef.current.cancelHold(),
    openFromContextMenu: (event, candidates, callbacks) =>
      latestRef.current.openFromContextMenu(event, candidates, callbacks),
    closeMenu: () => latestRef.current.closeMenu(),
  });

  return { api: apiRef.current, menu, setMenu };
}

export { HOLD_MS, DRAG_THRESHOLD_PX };
