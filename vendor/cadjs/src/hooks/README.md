# cadjs hooks

Mode hooks own the per-mode interaction logic (drawing, selection, drag, transforms). All consumer wiring goes through the public hooks at `cadjs/react`; the internal mechanics below explain how the hooks fit together so contributors can add a new mode without re-deriving the conventions.

## The shared input factory

Every mode hook routes its mouse + keyboard handling through `createModeInputHandlers` (`shared/createModeInputHandlers.ts`). The factory owns:

- **Gates.** LMB-only on mousedown, alt-key bypass (so the Three.js OrbitControls pan / orbit still works), `navToolActiveRef` and `isApplyingRef` short-circuits.
- **Hold-menu integration.** Mousedown starts a hold via `selectOtherRef`; if the user holds long enough, the Select Other menu opens with the current `picks[]`. Drag past `DRAG_THRESHOLD_PX` cancels the hold.
- **Right-click.** `handleContextMenu` opens Select Other directly when `enableContextMenu: true`.
- **Keys.** `Escape` → `onCancel`, `Enter` → `onCommit`, anything else → `extraKeys[key]`.
- **Drag protocol.** Optional. Modes that capture mousemove + mouseup _after_ a successful pick (extrude arrow-handles, resize gizmos, draw, etc.) opt in via `onDragStart` / `onDrag` / `onDragEnd`.
- **Continuous pointer tracking.** Optional. Modes that need every mousemove regardless of drag state (sketch's inference snap) use `onPointerMove`.
- **Empty-pick path.** `pickTargets` may return `{ picks: [], resolved }`: `onPickStart` still fires, but `selectOtherRef.startHold` is skipped. Used by resize / move / extrude for "click empty space → deselect".

## Spec contract

```ts
createModeInputHandlers<TPick, TPreview>(spec, deps)
  → { handleMouseDown, handleMouseMove, handleMouseUp, handleContextMenu, handleKeyDown }
```

`TPick` is whatever business value the mode wants resolved per pick (an element id, a discriminated union for multi-phase modes like combine, a `{ kind: "arrow" | "profile" | "empty", … }` tag for extrude). Pass it back through callbacks like `onPickStart(resolved, picks, event)`.

`TPreview` is the optional preview state threaded between hover updates. Most modes use `never`.

The full field reference lives in the JSDoc on `ModeInputHandlersSpec`. Read that for parameter semantics. The pattern below is the recommended skeleton for a new mode.

## Skeleton: writing a new mode hook

```ts
import { useMemo, useRef } from "react";
import { useCadCore } from "../contexts/CoreContext";
import { useCadVisualizer } from "../contexts/VisualizerContext";
import { collectPicksUnderCursor } from "../scene-operations/mesh-operations";
import { useRaycastToObjects } from "./shared/useRaycastToObjects";
import { createModeInputHandlers } from "./shared/createModeInputHandlers";

export function useFooMode() {
  const { elements, getObject } = useCadCore();
  const { navToolActiveRef, selectOtherRef } = useCadVisualizer();
  const { raycasterFromEvent } = useRaycastToObjects();
  const isApplyingRef = useRef(false);

  // Pin live state to refs so the memoized spec doesn't capture stale state.
  // (Pattern: every "latest read" inside a memo callback goes through a ref.)

  const handlers = useMemo(
    () =>
      createModeInputHandlers<MyPick, never>(
        {
          pickTargets: (raycaster) => {
            const picks = collectPicksUnderCursor(
              raycaster,
              elements,
              getObject,
            );
            if (picks.length === 0) return null; // or { picks: [], resolved: { kind: "empty" } }
            return { picks, resolved: picks[0]!.elementId };
          },
          onPickStart: (resolved, picks, event) => {
            /* state mutation here */
          },
          onPickFromMenu: (item, resolved) => {
            /* user picked from Select Other */
          },
          onCancel: () => {
            /* Escape: reset transient state */
          },
          // Optional:
          // hoverTargets / onHover for hover preview
          // onDragStart / onDrag / onDragEnd for capturing mousemove + mouseup
          // onPointerMove for continuous pointer tracking
          // onMenuHover for menu-row-aware hover (combine)
          // enableContextMenu: true to enable right-click → Select Other
          // extraKeys: { f: () => toggleFillet() }
        },
        {
          raycasterFromEvent,
          selectOtherRef,
          navToolActiveRef,
          isApplyingRef,
        },
      ),
    // Deps cover everything read directly inside the spec body. Refs are not deps.
    [elements, getObject, raycasterFromEvent, selectOtherRef, navToolActiveRef],
  );

  return handlers;
}
```

## Reuse helpers

- `shared/useRaycastToObjects.ts`: stable `THREE.Raycaster` plus `raycasterFromEvent(event)` and `raycastToObjects(event, objects)`.
- `shared/tintMeshes.ts`: set body color across an element's meshes (skip helpers / overlays).
- `shared/useHoverPreview.ts`: depth-test-off + render-on-top "see through" hover (Fusion-style), used by sweep / loft / revolve / fillet.
- `shared/useModeCleanup.ts`: wrap mode-exit cleanup so it runs once on unmount, pins the latest closure.
- `scene-operations/mesh-operations.ts`: `collectPickableMeshes`, `collectPicksUnderCursor`, `isDescendantOf`, `makeBodyOrProfileLabel`.

## Decisions worth knowing

- **The factory owns gates, not raycasting.** `pickTargets` is where each mode decides what to raycast against (handles, profiles, edges, custom overlays).
- **State should be ref-pinned for memoized spec callbacks.** The factory rebuilds the handler set when its `useMemo` deps change. Reading React state directly inside a memoized callback bakes in a stale value; pin the latest snapshot to a ref instead.
- **Sketch is a partial fit.** The sketch hook needs every mousemove for inference / guideline rendering. It isn't a drag, and it isn't a hover preview. It uses `onPointerMove` to opt out of the drag/hover dichotomy, while still routing through the factory for gates and keyboard.
- **Right-click is mousedown-button-2 in some legacy hooks.** Browsers also fire `contextmenu` on right-click, which the factory consumes for Select Other. If a mode needs both behaviors (sketch handles button=2 mousedown for glyph alt-select), wrap the factory in a mode-specific dispatcher and route right-click before the factory's LMB gate rejects it.
