// vrSessionPresence.ts — "my buddy is touching that" in the headset.
//
// Draws a coloured wireframe box around whatever a peer has selected. It is a
// pure view: it reads the session mirror each frame and never touches the
// model. Depth test is off so the box is visible through other bodies — you
// want to know where your friend is working even if his part is behind the
// desk.
import * as THREE from "three";
import type { RemoteSelection } from "../../project/sessionRuntime";

export interface VRSessionPresence {
  update(scene: THREE.Scene, peers: RemoteSelection[]): void;
  dispose(scene: THREE.Scene): void;
}

const GROUP_NAME = "vr-session-presence";
const RECOMPUTE_MS = 200;

interface PeerBox {
  line: THREE.LineSegments;
  color: string;
}

export function createVRSessionPresence(): VRSessionPresence {
  const boxes = new Map<string, PeerBox>();
  let group: THREE.Group | null = null;
  let lastCompute = 0;
  let lastSignature = "";

  function ensureGroup(scene: THREE.Scene): THREE.Group {
    if (group && group.parent === scene) return group;
    group = new THREE.Group();
    group.name = GROUP_NAME;
    group.renderOrder = 999;
    scene.add(group);
    return group;
  }

  function findObjects(
    scene: THREE.Scene,
    ids: Set<string>,
  ): Map<string, THREE.Object3D> {
    const found = new Map<string, THREE.Object3D>();
    if (ids.size === 0) return found;
    scene.traverse((obj) => {
      const id = (obj.userData as Record<string, unknown> | undefined)?.id;
      if (typeof id === "string" && ids.has(id) && !found.has(id)) {
        found.set(id, obj);
      }
    });
    return found;
  }

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  function update(scene: THREE.Scene, peers: RemoteSelection[]): void {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const signature = peers
      .map((p) => `${p.accountId}:${p.selection.join(",")}`)
      .join("|");
    if (signature === lastSignature && now - lastCompute < RECOMPUTE_MS) return;
    lastSignature = signature;
    lastCompute = now;

    const root = ensureGroup(scene);
    const wanted = new Set(peers.map((p) => p.accountId));

    for (const [accountId, entry] of [...boxes]) {
      if (!wanted.has(accountId)) {
        root.remove(entry.line);
        entry.line.geometry.dispose();
        (entry.line.material as THREE.Material).dispose();
        boxes.delete(accountId);
      }
    }

    const ids = new Set(peers.flatMap((p) => p.selection));
    const objects = findObjects(scene, ids);

    for (const peer of peers) {
      const targets = peer.selection
        .map((id) => objects.get(id))
        .filter((o): o is THREE.Object3D => !!o && o.visible);
      if (targets.length === 0) {
        const existing = boxes.get(peer.accountId);
        if (existing) existing.line.visible = false;
        continue;
      }

      box.makeEmpty();
      for (const obj of targets) box.expandByObject(obj);
      if (box.isEmpty()) continue;
      box.getSize(size);
      box.getCenter(center);
      // A little air so the box does not z-fight with the body surface.
      size.addScalar(0.012);

      let entry = boxes.get(peer.accountId);
      if (!entry) {
        const geometry = new THREE.EdgesGeometry(
          new THREE.BoxGeometry(1, 1, 1),
        );
        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(peer.color),
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        });
        const line = new THREE.LineSegments(geometry, material);
        line.name = `vr-session-presence-${peer.accountId}`;
        line.renderOrder = 1000;
        root.add(line);
        entry = { line, color: peer.color };
        boxes.set(peer.accountId, entry);
      }

      if (entry.color !== peer.color) {
        (entry.line.material as THREE.LineBasicMaterial).color.set(peer.color);
        entry.color = peer.color;
      }
      entry.line.visible = true;
      entry.line.position.copy(center);
      entry.line.scale.set(
        Math.max(size.x, 1e-4),
        Math.max(size.y, 1e-4),
        Math.max(size.z, 1e-4),
      );
    }
  }

  function dispose(scene: THREE.Scene): void {
    for (const entry of boxes.values()) {
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
    }
    boxes.clear();
    if (group) {
      scene.remove(group);
      group = null;
    }
    lastSignature = "";
  }

  return { update, dispose };
}
