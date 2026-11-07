import * as THREE from "three";
import {
  buildUndoSnapshot,
  type UndoSnapshotInputs,
} from "../../src/contexts/hooks/useUndoStack";
import type { SceneElement } from "../../src/scene-operations/types";
import { Brep } from "../../src/geometry";

function makeElement(
  nodeId: string,
  position: THREE.Vector3,
  rotation?: THREE.Euler,
): SceneElement {
  return {
    brep: new Brep([], [], []),
    nodeId,
    position,
    rotation,
  };
}

function makeDeps(elements: SceneElement[]): UndoSnapshotInputs {
  return {
    elementsRef: { current: elements },
    idCounterRef: { current: elements.length },
    featureTreeRef: { current: [] },
    sketchesRef: { current: [] },
  };
}

describe("buildUndoSnapshot", () => {
  it("deep-clones THREE.Vector3 position so post-snapshot drag does not mutate the snapshot", () => {
    const pos = new THREE.Vector3(1, 2, 3);
    const el = makeElement("a", pos);
    const deps = makeDeps([el]);

    const snap = buildUndoSnapshot(deps, "drag");

    // Simulate TransformControls drag mutating the live element after snapshot.
    el.position.set(99, 99, 99);

    expect(snap.elements[0].position.x).toBe(1);
    expect(snap.elements[0].position.y).toBe(2);
    expect(snap.elements[0].position.z).toBe(3);
    // Sanity: snapshot got its own Vector3 instance.
    expect(snap.elements[0].position).not.toBe(el.position);
  });

  it("deep-clones THREE.Euler rotation when present", () => {
    const rot = new THREE.Euler(0.1, 0.2, 0.3);
    const el = makeElement("a", new THREE.Vector3(0, 0, 0), rot);
    const deps = makeDeps([el]);

    const snap = buildUndoSnapshot(deps, "rotate");
    el.rotation!.set(1.5, 1.5, 1.5);

    expect(snap.elements[0].rotation!.x).toBeCloseTo(0.1, 10);
    expect(snap.elements[0].rotation!.y).toBeCloseTo(0.2, 10);
    expect(snap.elements[0].rotation!.z).toBeCloseTo(0.3, 10);
    expect(snap.elements[0].rotation).not.toBe(el.rotation);
  });

  it("leaves rotation undefined when source element has none", () => {
    const el = makeElement("a", new THREE.Vector3(0, 0, 0));
    const deps = makeDeps([el]);

    const snap = buildUndoSnapshot(deps, "noop");

    expect(snap.elements[0].rotation).toBeUndefined();
  });

  it("snapshot is unaffected by adding new elements to the source array after capture", () => {
    const el = makeElement("a", new THREE.Vector3(1, 2, 3));
    const deps = makeDeps([el]);

    const snap = buildUndoSnapshot(deps, "add");
    deps.elementsRef.current.push(makeElement("b", new THREE.Vector3(0, 0, 0)));

    expect(snap.elements).toHaveLength(1);
  });

  it("preserves nodeId, brep reference, and other primitive fields", () => {
    const el: SceneElement = {
      ...makeElement("a", new THREE.Vector3(0, 0, 0)),
      occBrep: "serialized",
      selected: true,
      elementType: "profile",
    };
    const deps = makeDeps([el]);

    const snap = buildUndoSnapshot(deps, "preserve");

    expect(snap.elements[0].nodeId).toBe("a");
    expect(snap.elements[0].brep).toBe(el.brep); // brep is structurally shared (immutable by convention)
    expect(snap.elements[0].occBrep).toBe("serialized");
    expect(snap.elements[0].selected).toBe(true);
    expect(snap.elements[0].elementType).toBe("profile");
  });
});
