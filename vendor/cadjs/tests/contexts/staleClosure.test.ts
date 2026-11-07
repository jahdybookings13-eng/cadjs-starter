import * as THREE from "three";
import {
  applyAddElement,
  applyDeselectAll,
  applyDeselectElement,
  applyRemoveElement,
  applySelectElement,
} from "../../src/contexts/hooks/useElementMutations";
import { Brep } from "../../src/geometry";
import type { SceneElement } from "../../src/scene-operations/types";

/**
 * Regression tests for the stale-closure bug class in element mutations:
 * the stale `idCounter` in `addElement`, and the stale `elements` /
 * `selectedElements` reads in subsequent ops.
 *
 * The bugs manifest when two state-mutating callbacks execute in the same
 * tick — React's `useCallback` closures pinned the stale state. The fix is
 * to read from refs (which are mutated synchronously) rather than closure-
 * captured state.
 *
 * Tests below stub the React setters with the same functional-updater
 * semantics as `useState`, then call the helpers consecutively (no React
 * render between them) and assert that both updates land.
 */

interface FakeStore {
  elements: SceneElement[];
  selected: string[];
  idCounter: number;
  elementsRef: React.MutableRefObject<SceneElement[]>;
  idCounterRef: React.MutableRefObject<number>;
  selectedElementsRef: React.MutableRefObject<string[]>;
  setElements: React.Dispatch<React.SetStateAction<SceneElement[]>>;
  setSelectedElements: React.Dispatch<React.SetStateAction<string[]>>;
  setIdCounter: React.Dispatch<React.SetStateAction<number>>;
  objectsMap: Map<string, THREE.Object3D>;
}

function makeStore(initialIdCounter = 0): FakeStore {
  const store: FakeStore = {
    elements: [],
    selected: [],
    idCounter: initialIdCounter,
    elementsRef: { current: [] },
    idCounterRef: { current: initialIdCounter },
    selectedElementsRef: { current: [] },
    objectsMap: new Map<string, THREE.Object3D>(),
    setElements: () => {
      /* set below */
    },
    setSelectedElements: () => {
      /* set below */
    },
    setIdCounter: () => {
      /* set below */
    },
  };
  // Functional-updater semantics matching React's useState — applied
  // synchronously, mirroring how same-tick batched updates compose.
  store.setElements = (updater) => {
    store.elements =
      typeof updater === "function"
        ? (updater as (prev: SceneElement[]) => SceneElement[])(store.elements)
        : updater;
    store.elementsRef.current = store.elements;
  };
  store.setSelectedElements = (updater) => {
    store.selected =
      typeof updater === "function"
        ? (updater as (prev: string[]) => string[])(store.selected)
        : updater;
    store.selectedElementsRef.current = store.selected;
  };
  store.setIdCounter = (updater) => {
    store.idCounter =
      typeof updater === "function"
        ? (updater as (prev: number) => number)(store.idCounter)
        : updater;
  };
  return store;
}

// Pass a dummy Object3D so addElement doesn't fall back to createMeshFromBrep
// for our empty test BReps (which would log to console).
const dummyObj = () => new THREE.Group();

describe("applyAddElement: stale idCounter", () => {
  it("two synchronous calls allocate distinct node IDs", () => {
    const s = makeStore(0);
    const a = applyAddElement(
      s,
      new Brep([], [], []),
      new THREE.Vector3(),
      dummyObj(),
    );
    const b = applyAddElement(
      s,
      new Brep([], [], []),
      new THREE.Vector3(),
      dummyObj(),
    );

    expect(a).toBe("node_1");
    expect(b).toBe("node_2");
    expect(s.elements).toHaveLength(2);
    expect(s.elements[0].nodeId).toBe("node_1");
    expect(s.elements[1].nodeId).toBe("node_2");
  });

  it("idCounterRef is bumped synchronously so a third reader sees the new value before next tick", () => {
    const s = makeStore(0);
    applyAddElement(s, new Brep([], [], []), new THREE.Vector3(), dummyObj());
    // Pre-fix bug: idCounterRef would still be 0 here because state update
    // hadn't flushed. The fix bumps the ref inside the callback body.
    expect(s.idCounterRef.current).toBe(1);
  });

  it("setElements uses functional updater so concurrent updates compose", () => {
    const s = makeStore(0);
    // Simulate a "concurrent" external add that sets state directly (e.g. a
    // mode switch or undo restore).
    s.elements = [
      {
        brep: new Brep([], [], []),
        nodeId: "external",
        position: new THREE.Vector3(),
      },
    ];
    applyAddElement(s, new Brep([], [], []), new THREE.Vector3(), dummyObj());

    // Pre-fix: the closure-captured `elements` was still empty, so the new
    // setElements call replaced "external" with [new]. With functional updater,
    // both survive.
    expect(s.elements.map((e) => e.nodeId)).toEqual(["external", "node_1"]);
  });
});

describe("applyRemoveElement: stale selection", () => {
  it("reads selectedElementsRef.current, not closure-captured selection", () => {
    const s = makeStore(0);
    s.elements = [
      {
        brep: new Brep([], [], []),
        nodeId: "a",
        position: new THREE.Vector3(),
      },
      {
        brep: new Brep([], [], []),
        nodeId: "b",
        position: new THREE.Vector3(),
      },
    ];
    s.objectsMap.set("a", new THREE.Group());
    s.objectsMap.set("b", new THREE.Group());

    // Initially nothing selected; capture a closure here would freeze [].
    s.selectedElementsRef.current = [];
    // Now the user selects "a" *after* the callback was created.
    s.selectedElementsRef.current = ["a"];

    applyRemoveElement(s, "a");

    // With the fix, removeElement saw the live ["a"] selection and cleared it.
    expect(s.selected).toEqual([]);
    expect(s.elements.map((e) => e.nodeId)).toEqual(["b"]);
  });

  it("chained add+remove in one tick: remove sees the just-added element", () => {
    const s = makeStore(0);
    applyAddElement(s, new Brep([], [], []), new THREE.Vector3(), dummyObj());
    // Pre-fix: a closure-captured `elements` here would not yet include "node_1".
    applyRemoveElement(s, "node_1");

    expect(s.elements).toHaveLength(0);
    expect(s.idCounterRef.current).toBe(1); // ID still claimed even though removed
  });
});

// The four `setElements(() => result.updatedElements)` call sites in
// selection paths use the `prev` argument inside the updater so a
// concurrently-queued setState lands instead of being clobbered.
//
// Each test below patches `s.setElements` with a wrapper that simulates "a
// racing op already queued an update that appended element `c`" — i.e. when
// the apply* helper's updater runs, `prev` !== the snapshot it captured. The
// fast path (no race) is exercised by the existing tests above; here we
// specifically exercise the slow path.
function makeElement(nodeId: string, selected = false): SceneElement {
  return {
    brep: new Brep([], [], []),
    nodeId,
    position: new THREE.Vector3(),
    selected,
  };
}

function injectRacingAppend(s: FakeStore, racing: SceneElement): void {
  const original = s.setElements;
  s.setElements = (updater) => {
    if (typeof updater === "function") {
      const racedPrev: SceneElement[] = [...s.elements, racing];
      const fn = updater as (prev: SceneElement[]) => SceneElement[];
      s.elements = fn(racedPrev);
      s.elementsRef.current = s.elements;
    } else {
      original(updater);
    }
  };
}

describe("selection paths: race-merged updater", () => {
  it("applySelectElement preserves a racing concurrent add", () => {
    const a = makeElement("a");
    const b = makeElement("b");
    const c = makeElement("c");
    const s = makeStore(0);
    s.elements = [a, b];
    s.elementsRef.current = [a, b];
    injectRacingAppend(s, c);

    applySelectElement(s, "a");

    expect(s.elements.map((e) => e.nodeId)).toEqual(["a", "b", "c"]);
    expect(s.elements.find((e) => e.nodeId === "a")?.selected).toBe(true);
    expect(s.elements.find((e) => e.nodeId === "b")?.selected).toBeFalsy();
    expect(s.selected).toEqual(["a"]);
  });

  it("applyDeselectElement preserves a racing concurrent add", () => {
    const a = makeElement("a", /* selected */ true);
    const b = makeElement("b");
    const c = makeElement("c");
    const s = makeStore(0);
    s.elements = [a, b];
    s.elementsRef.current = [a, b];
    s.selected = ["a"];
    s.selectedElementsRef.current = ["a"];
    injectRacingAppend(s, c);

    applyDeselectElement(s, "a");

    expect(s.elements.map((e) => e.nodeId)).toEqual(["a", "b", "c"]);
    expect(s.elements.find((e) => e.nodeId === "a")?.selected).toBe(false);
    expect(s.selected).toEqual([]);
  });

  it("applyDeselectAll preserves a racing concurrent add", () => {
    const a = makeElement("a", true);
    const b = makeElement("b", true);
    const c = makeElement("c");
    const s = makeStore(0);
    s.elements = [a, b];
    s.elementsRef.current = [a, b];
    s.selected = ["a", "b"];
    s.selectedElementsRef.current = ["a", "b"];
    injectRacingAppend(s, c);

    applyDeselectAll(s, "move");

    expect(s.elements.map((e) => e.nodeId)).toEqual(["a", "b", "c"]);
    expect(s.elements.every((e) => e.selected === false)).toBe(true);
    expect(s.selected).toEqual([]);
  });
});
