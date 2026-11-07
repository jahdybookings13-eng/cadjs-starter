import * as THREE from "three";
import type { Mock } from "vitest";
import { createModeInputHandlers } from "../../src/hooks/shared/createModeInputHandlers";
import type { PickItem } from "../../src/scene-operations/mesh-operations";
import type { SelectOtherApi } from "../../src/hooks/useSelectOther";

/**
 * The factory is a plain function (not a hook), so the tests synthesize
 * event-like objects and call the returned handlers directly. No DOM /
 * jsdom required — testEnvironment is "node".
 */

interface SelectOtherMock {
  api: SelectOtherApi;
  startHold: Mock;
  cancelHold: Mock;
  openFromContextMenu: Mock;
  closeMenu: Mock;
}

function makeSelectOtherMock(): SelectOtherMock {
  const startHold = vi.fn();
  const cancelHold = vi.fn();
  const openFromContextMenu = vi.fn();
  const closeMenu = vi.fn();
  return {
    api: { startHold, cancelHold, openFromContextMenu, closeMenu },
    startHold,
    cancelHold,
    openFromContextMenu,
    closeMenu,
  };
}

function makeMouseEvent(
  overrides: Partial<{
    button: number;
    clientX: number;
    clientY: number;
    altKey: boolean;
  }> = {},
): MouseEvent {
  return {
    button: 0,
    clientX: 0,
    clientY: 0,
    altKey: false,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as MouseEvent;
}

function makeKeyEvent(key: string): KeyboardEvent {
  return { key } as KeyboardEvent;
}

const fakeRaycaster = new THREE.Raycaster();
const raycasterFromEvent = vi.fn(() => fakeRaycaster);

function makeDeps(
  selectOtherMock: SelectOtherMock | null = makeSelectOtherMock(),
) {
  return {
    raycasterFromEvent,
    selectOtherRef: selectOtherMock
      ? { current: selectOtherMock.api }
      : { current: null },
    navToolActiveRef: { current: false },
    isApplyingRef: { current: false },
  };
}

function makeHoldRefs<TPick = unknown>() {
  return {
    holdStartRef: { current: null as { x: number; y: number } | null },
    lastResolvedRef: { current: null as TPick | null },
    dragActiveRef: { current: false },
  };
}

describe("createModeInputHandlers", () => {
  beforeEach(() => {
    raycasterFromEvent.mockClear();
  });

  it("pickTargets returning empty picks fires onPickStart but skips startHold (empty-pick path)", () => {
    const so = makeSelectOtherMock();
    const onPickStart = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({ picks: [], resolved: "deselect" }),
        onPickStart,
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent());

    expect(onPickStart).toHaveBeenCalledTimes(1);
    expect(onPickStart).toHaveBeenCalledWith(
      "deselect",
      [],
      expect.any(Object),
    );
    expect(so.startHold).not.toHaveBeenCalled();
  });

  it("pickTargets returning null short-circuits — startHold not called", () => {
    const so = makeSelectOtherMock();
    const onPickStart = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => null,
        onPickStart,
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent());

    expect(so.startHold).not.toHaveBeenCalled();
    expect(onPickStart).not.toHaveBeenCalled();
  });

  it("drag past DRAG_THRESHOLD_PX cancels the hold", () => {
    const so = makeSelectOtherMock();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent({ clientX: 100, clientY: 100 }));
    expect(so.startHold).toHaveBeenCalledTimes(1);

    // Move 1px — under threshold (4)
    handlers.handleMouseMove(makeMouseEvent({ clientX: 101, clientY: 100 }));
    expect(so.cancelHold).not.toHaveBeenCalled();

    // Move 6px — past threshold
    handlers.handleMouseMove(makeMouseEvent({ clientX: 106, clientY: 100 }));
    expect(so.cancelHold).toHaveBeenCalledTimes(1);
  });

  it("Escape fires onCancel; Enter does not", () => {
    const onCancel = vi.fn();
    const onCommit = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => null,
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel,
        onCommit,
      },
      makeDeps(),
      makeHoldRefs(),
    );

    handlers.handleKeyDown(makeKeyEvent("Escape"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Enter fires onCommit when provided", () => {
    const onCommit = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => null,
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
        onCommit,
      },
      makeDeps(),
      makeHoldRefs(),
    );

    handlers.handleKeyDown(makeKeyEvent("Enter"));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("right-click with enableContextMenu opens context menu and bypasses startHold", () => {
    const so = makeSelectOtherMock();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
        enableContextMenu: true,
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleContextMenu(makeMouseEvent({ button: 2 }));
    expect(so.openFromContextMenu).toHaveBeenCalledTimes(1);
    expect(so.startHold).not.toHaveBeenCalled();
  });

  it("right-click with enableContextMenu omitted is a no-op", () => {
    const so = makeSelectOtherMock();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
        // enableContextMenu omitted
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleContextMenu(makeMouseEvent({ button: 2 }));
    expect(so.openFromContextMenu).not.toHaveBeenCalled();
  });

  it("onPickStart fires synchronously on mousedown when picks resolve", () => {
    const onPickStart = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        onPickStart,
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
      },
      makeDeps(),
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent());
    expect(onPickStart).toHaveBeenCalledTimes(1);
    expect(onPickStart).toHaveBeenCalledWith(
      "n1",
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("extraKeys dispatches by key", () => {
    const fHandler = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => null,
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
        extraKeys: { f: fHandler },
      },
      makeDeps(),
      makeHoldRefs(),
    );

    handlers.handleKeyDown(makeKeyEvent("f"));
    expect(fHandler).toHaveBeenCalledTimes(1);

    handlers.handleKeyDown(makeKeyEvent("g"));
    expect(fHandler).toHaveBeenCalledTimes(1);
  });

  it("alt-key on mousedown is a no-op (preserves pan/orbit)", () => {
    const so = makeSelectOtherMock();
    const onPickStart = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        onPickStart,
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent({ altKey: true }));
    expect(onPickStart).not.toHaveBeenCalled();
    expect(so.startHold).not.toHaveBeenCalled();
  });

  it("right-button on mousedown is a no-op (left-click only)", () => {
    const so = makeSelectOtherMock();
    const onPickStart = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        onPickStart,
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent({ button: 2 }));
    expect(onPickStart).not.toHaveBeenCalled();
    expect(so.startHold).not.toHaveBeenCalled();
  });

  it("onDragStart returning true bypasses startHold and routes mousemove/mouseup to onDrag/onDragEnd", () => {
    const so = makeSelectOtherMock();
    const onDragStart = vi.fn(() => true);
    const onDrag = vi.fn();
    const onDragEnd = vi.fn();
    const onHover = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        hoverTargets: () => "n1",
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onHover,
        onCancel: vi.fn(),
        onDragStart,
        onDrag,
        onDragEnd,
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent({ clientX: 100, clientY: 100 }));
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(so.startHold).not.toHaveBeenCalled();

    handlers.handleMouseMove(makeMouseEvent({ clientX: 120, clientY: 100 }));
    expect(onDrag).toHaveBeenCalledTimes(1);
    expect(onHover).not.toHaveBeenCalled();
    expect(so.cancelHold).not.toHaveBeenCalled();

    handlers.handleMouseUp(makeMouseEvent({ clientX: 120, clientY: 100 }));
    expect(onDragEnd).toHaveBeenCalledTimes(1);

    // After drag ends, mousemove resumes hover routing.
    handlers.handleMouseMove(makeMouseEvent({ clientX: 130, clientY: 100 }));
    expect(onDrag).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it("onDragStart returning false falls back to the standard hold-menu flow", () => {
    const so = makeSelectOtherMock();
    const onDragStart = vi.fn(() => false);
    const onDrag = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
        onDragStart,
        onDrag,
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent({ clientX: 100, clientY: 100 }));
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(so.startHold).toHaveBeenCalledTimes(1);

    // Past-threshold move should cancel the hold (proves the standard flow runs).
    handlers.handleMouseMove(makeMouseEvent({ clientX: 110, clientY: 100 }));
    expect(onDrag).not.toHaveBeenCalled();
    expect(so.cancelHold).toHaveBeenCalledTimes(1);
  });

  it("mouseup outside a drag still cancels the hold (regression)", () => {
    const so = makeSelectOtherMock();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
      },
      makeDeps(so),
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent({ clientX: 100, clientY: 100 }));
    handlers.handleMouseUp(makeMouseEvent({ clientX: 100, clientY: 100 }));
    expect(so.cancelHold).toHaveBeenCalledTimes(1);
  });

  it("onPointerMove fires on every mousemove regardless of drag/hover state", () => {
    const onPointerMove = vi.fn();
    const onHover = vi.fn();
    const onDrag = vi.fn();
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        hoverTargets: () => "n1",
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
        onHover,
        onDragStart: () => true,
        onDrag,
        onPointerMove,
      },
      makeDeps(),
      makeHoldRefs(),
    );

    // Before any mousedown: onPointerMove fires AND so does onHover (no drag).
    handlers.handleMouseMove(makeMouseEvent({ clientX: 50, clientY: 50 }));
    expect(onPointerMove).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledTimes(1);

    // Mousedown enters drag — hover suppressed, onPointerMove still fires.
    handlers.handleMouseDown(makeMouseEvent({ clientX: 100, clientY: 100 }));
    handlers.handleMouseMove(makeMouseEvent({ clientX: 110, clientY: 100 }));

    expect(onPointerMove).toHaveBeenCalledTimes(2);
    expect(onDrag).toHaveBeenCalledTimes(1);
    // onHover did not fire during drag.
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it("isApplyingRef gate suppresses both mousedown and mousemove hover", () => {
    const so = makeSelectOtherMock();
    const onPickStart = vi.fn();
    const onHover = vi.fn();
    const deps = makeDeps(so);
    deps.isApplyingRef.current = true;
    const handlers = createModeInputHandlers(
      {
        pickTargets: () => ({
          picks: [
            {
              key: "n1",
              label: "x",
              distance: 0,
              elementId: "n1",
              object: {} as THREE.Object3D,
            } satisfies PickItem,
          ],
          resolved: "n1",
        }),
        hoverTargets: () => "n1",
        onPickStart,
        onPickFromMenu: vi.fn(),
        onHover,
        onCancel: vi.fn(),
      },
      deps,
      makeHoldRefs(),
    );

    handlers.handleMouseDown(makeMouseEvent());
    handlers.handleMouseMove(makeMouseEvent());

    expect(onPickStart).not.toHaveBeenCalled();
    expect(onHover).not.toHaveBeenCalled();
  });

  it("hold state survives a factory rebuild", () => {
    // Simulates the consumer's `useMemo` deps churning during the 350 ms
    // hold-LMB window: caller-owned refs persist; the second handler set
    // shares the same hold state and threshold-cancels the original hold.
    const so = makeSelectOtherMock();
    const refs = makeHoldRefs();
    const pick: PickItem = {
      key: "n1",
      label: "x",
      distance: 0,
      elementId: "n1",
      object: {} as THREE.Object3D,
    };

    const handlersA = createModeInputHandlers(
      {
        pickTargets: () => ({ picks: [pick], resolved: "n1" }),
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
      },
      makeDeps(so),
      refs,
    );

    handlersA.handleMouseDown(makeMouseEvent({ clientX: 100, clientY: 100 }));
    expect(refs.holdStartRef.current).toEqual({ x: 100, y: 100 });
    expect(so.startHold).toHaveBeenCalledTimes(1);

    // Factory rebuild — fresh spec/handlers, same refs.
    const handlersB = createModeInputHandlers(
      {
        pickTargets: () => ({ picks: [pick], resolved: "n1" }),
        onPickStart: vi.fn(),
        onPickFromMenu: vi.fn(),
        onCancel: vi.fn(),
      },
      makeDeps(so),
      refs,
    );

    expect(refs.holdStartRef.current).toEqual({ x: 100, y: 100 });
    handlersB.handleMouseMove(makeMouseEvent({ clientX: 200, clientY: 200 }));
    expect(so.cancelHold).toHaveBeenCalledTimes(1);
    expect(refs.holdStartRef.current).toBeNull();
  });
});
