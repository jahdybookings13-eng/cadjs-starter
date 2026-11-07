import type * as THREE from "three";
import type React from "react";
import type { PickItem } from "../../scene-operations/mesh-operations";
import { DRAG_THRESHOLD_PX, type SelectOtherApi } from "../useSelectOther";
import type { ModeInputHoldRefs } from "./useModeInputHoldRefs";

/**
 * Spec for {@link createModeInputHandlers}: a mode-agnostic shell for the
 * mousedown→mousemove→mouseup + Escape + context-menu pattern shared by
 * loft, sweep, fillet, and revolve input handlers.
 *
 * **TPick** is the typed business value the spec resolves on a successful
 * pick (e.g. an element id, a `{kind, edgeIndex}` tag, or a discriminated
 * union for multi-phase modes). **TPreview** is the optional preview state
 * threaded between hover updates (fillet's edge highlight, loft's hover
 * preview shading).
 */
export interface ModeInputHandlersSpec<TPick, TPreview> {
  /**
   * Mousedown raycast. Return `null` to short-circuit the entire pick flow
   * (wrong phase, isApplying, no candidates). The factory feeds `picks` into
   * `selectOtherRef.startHold` for hold-LMB disambiguation; `resolved` is the
   * typed business value passed back to spec callbacks.
   */
  pickTargets: (
    raycaster: THREE.Raycaster,
    event: MouseEvent,
  ) => { picks: PickItem[]; resolved: TPick } | null;

  /**
   * Mousemove hover raycast, independent of `pickTargets` because hover
   * targets may differ from commit targets (e.g. fillet hovers edges only
   * when a body is already selected, but a pick toggles the body in the
   * no-selection case). Omit if the mode has no hover behaviour.
   */
  hoverTargets?: (
    raycaster: THREE.Raycaster,
    event: MouseEvent,
  ) => TPick | null;

  /** Mousedown body, fires synchronously after a successful `pickTargets`. */
  onPickStart: (resolved: TPick, picks: PickItem[], event: MouseEvent) => void;

  /** Called when the user picks a row from the Select Other menu. */
  onPickFromMenu: (item: PickItem, resolved: TPick) => void;

  /** Hover update during the hold or after open-context-menu. */
  onHover?: (resolved: TPick | null) => TPreview | null;

  /**
   * Optional escape hatch for modes whose menu hover wants the *hovered*
   * row's `PickItem`, not the originally-picked element. The factory's
   * default `onHover` bridge passes the original `resolved` for both
   * mousemove and menu hover, which is correct for single-pick modes
   * (sweep / loft / revolve / fillet) where the menu rows all share the
   * same `resolved`. Modes like `combine`, where each menu row is a
   * different body, supply this instead.
   */
  onMenuHover?: (item: PickItem | null) => void;

  /** Select Other menu opened (after HOLD_MS). */
  onMenuOpen?: (resolved: TPick) => void;

  /** Select Other menu cancelled by user (Esc on the menu, click-outside). */
  onMenuCancel?: (resolved: TPick) => void;

  /** Escape key handler. Always called. */
  onCancel: () => void;

  /** Enter key handler (optional, only modes with a commit shortcut). */
  onCommit?: () => void;

  /**
   * Right-click → Select Other menu. Omit (or pass false) to disable
   * context menu for this mode (no extrude / no measure).
   */
  enableContextMenu?: boolean;

  /**
   * Per-key custom handlers, keyed by `KeyboardEvent.key`. Used for things
   * like fillet's `'f'` toggle. Escape and Enter are reserved by the factory.
   */
  extraKeys?: Record<string, (event: KeyboardEvent) => void>;

  /**
   * Raw mousemove pass-through. Fires unconditionally on every mousemove
   * (before drag-routing or hover logic), letting modes that aren't a drag
   *, e.g. sketch's continuous inference / snap rendering, observe the
   * pointer without forcing the spec into the drag protocol.
   *
   * Modes that fit the drag or hover patterns shouldn't use this; prefer
   * `onDrag` (active drag) or `onHover` (hover preview).
   */
  onPointerMove?: (event: MouseEvent) => void;

  /**
   * Raw mouseup pass-through. Fires after the drag-end short-circuit so
   * non-drag modes (sketch's circle/rectangle commit on mouseup, glyph/point
   * drag-end inside `handleSelectMode`) can react to mouseup without owning
   * the drag protocol. Pre-refactor the sketch dispatcher fired its sub-mode
   * switch on every event type; this restores that symmetric pass-through.
   */
  onPointerUp?: (event: MouseEvent) => void;

  /**
   * Optional drag protocol for modes that need to capture mousemove + mouseup
   * after a successful pick (extrude arrow-handles, resize gizmos, draw,
   * sketch primitive drawing). When `onDragStart` is supplied AND returns
   * `true`, the factory enters DRAG mode:
   * - `selectOtherRef.startHold` is *not* called (no hold-menu while dragging);
   * - `handleMouseMove` routes to `onDrag` instead of the hover branch;
   * - `handleMouseUp` fires `onDragEnd` and clears drag state.
   *
   * Returning `false` (or omitting `onDragStart` entirely) preserves the
   * existing hold-menu / hover flow, letting a single mode mix drag picks
   * (e.g. handle hit) with non-drag picks (e.g. body select) on the same
   * mousedown.
   */
  onDragStart?: (
    resolved: TPick,
    picks: PickItem[],
    event: MouseEvent,
  ) => boolean;
  onDrag?: (event: MouseEvent) => void;
  onDragEnd?: (event: MouseEvent) => void;
}

/**
 * Runtime dependencies for the factory. These are typically pulled from
 * `useCadVisualizer()` and the consumer's local raycaster hook.
 */
export interface ModeInputHandlersDeps {
  raycasterFromEvent: (event: MouseEvent) => THREE.Raycaster | null;
  selectOtherRef:
    | React.MutableRefObject<SelectOtherApi | null>
    | { current: SelectOtherApi | null }
    | undefined;
  navToolActiveRef: React.MutableRefObject<boolean> | { current: boolean };
  /**
   * Ref-based gate for "operation in progress", avoids stale-closure on
   * isApplying state without forcing the factory itself to be a hook.
   */
  isApplyingRef: React.MutableRefObject<boolean> | { current: boolean };
}

export interface ModeInputHandlers {
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseMove: (event: MouseEvent) => void;
  handleMouseUp: (event: MouseEvent) => void;
  handleContextMenu: (event: MouseEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
}

/**
 * Build the standard mode-input handler set.
 *
 * Owned by the factory:
 * - LMB-only gate, alt-key bypass, `navToolActiveRef`/`isApplyingRef` short-circuits.
 * - `selectOtherRef.startHold` integration with `onHover`/`onPick`/`onMenuOpen`/`onCancel` routed back to spec callbacks.
 * - Drag threshold (cancel hold once the cursor moves past `DRAG_THRESHOLD_PX`).
 * - Mouseup hold-cancel.
 * - Optional drag protocol (`onDragStart`/`onDrag`/`onDragEnd`): when
 *   `onDragStart` returns `true`, hold-menu and hover are suppressed and
 *   mousemove/mouseup are routed to the drag callbacks until mouseup clears
 *   drag state.
 * - Right-click → `selectOtherRef.openFromContextMenu` (when enabled).
 * - Escape → `onCancel()`; Enter → `onCommit?.()`; otherwise dispatch via `extraKeys`.
 *
 * Caller-owned (in the spec):
 * - What to raycast against (`pickTargets`, `hoverTargets`).
 * - What to do on pick / hover / menu-pick (`onPickStart`, `onHover`, `onPickFromMenu`).
 * - Mode-specific cleanup on cancel.
 */
export function createModeInputHandlers<TPick, TPreview>(
  spec: ModeInputHandlersSpec<TPick, TPreview>,
  deps: ModeInputHandlersDeps,
  refs: ModeInputHoldRefs<TPick>,
): ModeInputHandlers {
  // Hoisted into caller-owned refs (see `useModeInputHoldRefs`) so an in-flight
  // hold/drag survives a `useMemo` rebuild during the 350 ms hold-LMB window.
  const { holdStartRef, lastResolvedRef, dragActiveRef } = refs;

  const isInactive = (): boolean =>
    Boolean(deps.navToolActiveRef.current) ||
    Boolean(deps.isApplyingRef.current);

  const buildMenuCallbacks = (resolved: TPick) => {
    let menuHover: ((item: PickItem | null) => void) | undefined;
    if (spec.onMenuHover) {
      menuHover = spec.onMenuHover;
    } else if (spec.onHover) {
      // Default bridge: pass the original `resolved` for any non-null hover.
      // Adequate when every menu row shares the same business value.
      menuHover = (item: PickItem | null) => {
        spec.onHover?.(item ? resolved : null);
      };
    }
    return {
      onPick: (item: PickItem) => {
        spec.onPickFromMenu(item, resolved);
      },
      onHover: menuHover,
      onMenuOpen: spec.onMenuOpen
        ? () => spec.onMenuOpen?.(resolved)
        : undefined,
      onCancel: spec.onMenuCancel
        ? () => spec.onMenuCancel?.(resolved)
        : undefined,
    };
  };

  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || event.altKey || isInactive()) return;

    const raycaster = deps.raycasterFromEvent(event);
    if (!raycaster) return;

    const result = spec.pickTargets(raycaster, event);
    if (!result) return;

    const { picks, resolved } = result;
    lastResolvedRef.current = resolved;
    spec.onPickStart(resolved, picks, event);

    if (spec.onDragStart && spec.onDragStart(resolved, picks, event)) {
      dragActiveRef.current = true;
      event.stopPropagation();
      return;
    }

    // `picks.length === 0` is the "empty-pick" path: the spec wants
    // `onPickStart` to fire (e.g. resize's empty-space deselect) but
    // there's nothing to hold-disambiguate.
    if (picks.length > 0) {
      holdStartRef.current = { x: event.clientX, y: event.clientY };
      deps.selectOtherRef?.current?.startHold(
        event,
        picks,
        buildMenuCallbacks(resolved),
      );
    }

    event.stopPropagation();
  };

  const handleMouseMove = (event: MouseEvent): void => {
    if (deps.isApplyingRef.current) return;

    spec.onPointerMove?.(event);

    if (dragActiveRef.current) {
      spec.onDrag?.(event);
      return;
    }

    const start = holdStartRef.current;
    if (start) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        deps.selectOtherRef?.current?.cancelHold();
        holdStartRef.current = null;
      }
    }

    if (!spec.hoverTargets || !spec.onHover) return;

    const raycaster = deps.raycasterFromEvent(event);
    if (!raycaster) return;

    const hoverPick = spec.hoverTargets(raycaster, event);
    spec.onHover(hoverPick);
  };

  const handleMouseUp = (event: MouseEvent): void => {
    if (dragActiveRef.current) {
      dragActiveRef.current = false;
      spec.onDragEnd?.(event);
      return;
    }
    spec.onPointerUp?.(event);
    deps.selectOtherRef?.current?.cancelHold();
    holdStartRef.current = null;
  };

  const handleContextMenu = (event: MouseEvent): void => {
    if (!spec.enableContextMenu || isInactive()) return;

    const raycaster = deps.raycasterFromEvent(event);
    if (!raycaster) return;

    const result = spec.pickTargets(raycaster, event);
    if (!result || result.picks.length === 0) return;

    const { picks, resolved } = result;
    lastResolvedRef.current = resolved;

    event.preventDefault();
    event.stopPropagation();

    deps.selectOtherRef?.current?.openFromContextMenu(
      event,
      picks,
      buildMenuCallbacks(resolved),
    );
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      spec.onCancel();
      return;
    }
    if (event.key === "Enter" && spec.onCommit) {
      spec.onCommit();
      return;
    }
    const extra = spec.extraKeys?.[event.key];
    if (extra) extra(event);
  };

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    handleKeyDown,
  };
}
