import { describe, expect, it } from "vitest";

// EcadPhysics is a pure orchestrator over the PhysicsWorld interface — test
// it in node with a stub world (no RAPIER/WASM) + a stub EcadLayer. Proves the
// grab-throw state machine, real-mass colliders, and the 1:1 law wiring.

import { EcadPhysics, MAX_THROW_MPS } from "../ecad/physics";
import { assertOneToOneScale, OneToOneScaleError } from "../ecad/oneToOne";
import { allParts } from "../ecad/catalog";
import { EcadSim } from "../ecad/sim";
import type { EcadLayer } from "../ecad/scene";

// ---- stub PhysicsWorld --------------------------------------------------
type FakeBody = {
  __t: { x: number; y: number; z: number };
  __kinematic: boolean;
  translation: () => { x: number; y: number; z: number };
  setTranslation: (t: { x: number; y: number; z: number }, w: boolean) => void;
  rotation: () => { x: number; y: number; z: number; w: number };
  setBodyType: (t: string, w: boolean) => void;
};

function stubWorld() {
  const rec = {
    bodies: [] as {
      id: string;
      body: FakeBody;
      half: { x: number; y: number; z: number };
      mass: number;
    }[],
    updated: 0,
    synced: 0,
    removed: 0,
    launches: [] as { x: number; y: number; z: number }[],
    zeroed: 0,
  };
  const world = {
    addDynamicBox(
      id: string,
      hx: number,
      hy: number,
      hz: number,
      px: number,
      py: number,
      pz: number,
      mass = 1,
    ) {
      const b: FakeBody = {
        __t: { x: px, y: py, z: pz },
        __kinematic: false,
        translation: () => ({ x: b.__t.x, y: b.__t.y, z: b.__t.z }),
        setTranslation: (t2) => {
          Object.assign(b.__t, t2);
        },
        rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
        setBodyType: (tType) => {
          b.__kinematic = tType === "KinematicPositionBased";
        },
      };
      rec.bodies.push({ id, body: b, half: { x: hx, y: hy, z: hz }, mass });
      return b as never;
    },
    removeBody(b: FakeBody) {
      rec.removed += 1;
      rec.bodies = rec.bodies.filter((r) => r.body !== b);
    },
    setBodyPosition(b: FakeBody, x: number, y: number, z: number) {
      Object.assign(b.__t, { x, y, z });
    },
    setBodyKinematic(b: FakeBody, k: boolean) {
      b.__kinematic = k;
    },
    zeroBodyVelocity(_b: FakeBody) {
      rec.zeroed += 1;
    },
    setBodyVelocity(_b: FakeBody, x: number, y: number, z: number) {
      rec.launches.push({ x, y, z });
    },
    update(_dt: number) {
      rec.updated += 1;
    },
    syncMeshes(_m: unknown) {
      rec.synced += 1;
    },
    dispose() {},
  };
  return { world, rec };
}

// ---- stub EcadLayer (the part EcadPhysics touches) -----------------------
interface StubLayer extends EcadLayer {}
function stubLayer(sim: EcadSim): StubLayer {
  const meters = new Map<string, { w: number; h: number; t: number }>();
  const groups = new Map<
    string,
    {
      position: { x: number; y: number; z: number };
      quaternion: { x: number; y: number; z: number; w: number };
    }
  >();
  const MM = 1 / 1000; // the 1:1 boundary — the stub reports METERS, like EcadLayer
  const layer = {
    sim,
    meters: (instId: string) => meters.get(instId) ?? null,
    get: (instId: string) => groups.get(instId) as never,
    markPhysicsOwned() {},
    setFromWorld(instId: string, pos: { x: number; y: number; z: number }) {
      const g = groups.get(instId);
      if (g) g.position = { ...pos };
    },
    _add(
      instId: string,
      w: number,
      h: number,
      t: number,
      pos: { x: number; y: number; z: number },
    ) {
      meters.set(instId, { w: w * MM, h: h * MM, t: t * MM });
      groups.set(instId, {
        position: { ...pos },
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
      });
    },
  };
  return layer as unknown as StubLayer;
}

function addBoard(
  layer: StubLayer,
  instId: string,
  w: number,
  h: number,
  t: number,
  pos: { x: number; y: number; z: number },
) {
  (
    layer as unknown as {
      _add: (
        i: string,
        w: number,
        h: number,
        t: number,
        p: { x: number; y: number; z: number },
      ) => void;
    }
  )._add(instId, w, h, t, pos);
}

function deskBoard(
  sim: EcadSim,
  layer: StubLayer,
  w: number,
  h: number,
  t: number,
) {
  const board = allParts().find((p) => p.category === "board")!;
  const inst = sim.insertInlinePart({ ...board, size: { w, h, t } });
  addBoard(layer, inst.id, w, h, t, { x: 0, y: 0.75, z: 0 });
  return inst;
}

describe("EcadPhysics — grab/throw state machine (1:1 orchestrator)", () => {
  it("binds a board with a collider == its REAL meters + real mass", () => {
    const { world, rec } = stubWorld();
    const sim = new EcadSim();
    const layer = stubLayer(sim);
    const inst = deskBoard(sim, layer, 100, 50, 1.6);
    const phys = new EcadPhysics(world as never, layer as never, {});
    phys.syncBoards();
    expect(rec.bodies.length).toBe(1);
    const b0 = rec.bodies[0];
    if (!b0) throw new Error("no body");
    // collider == real half-meters: 100mm→0.1m→x. 50mm→0.05m→z. 1.6mm→0.0016m→y.
    expect(b0.half.x).toBeCloseTo(0.05, 5);
    expect(b0.half.z).toBeCloseTo(0.025, 5);
    expect(b0.half.y).toBeCloseTo(0.0008, 6);
    // real mass: 100 x 50 x 1.6mm → 8e-6 m^3 * 1850 = 0.0148 kg
    expect(b0.mass).toBeCloseTo(0.0148, 4);
    expect(phys.hasBody(inst.id)).toBe(true);
    expect(phys.isGrabbed(inst.id)).toBe(false);
  });

  it("grab → kinematic; release → dynamic; syncBoard idempotent", () => {
    const { world } = stubWorld();
    const sim = new EcadSim();
    const layer = stubLayer(sim);
    const inst = deskBoard(sim, layer, 100, 50, 1.6);
    const phys = new EcadPhysics(world as never, layer as never, {});
    phys.syncBoards();
    expect(phys.hasBody(inst.id)).toBe(true);

    phys.grab(inst.id);
    expect(phys.isGrabbed(inst.id)).toBe(true);
    // hand-follow: feed the right hand position; step.
    phys.handOverride = { x: 0.2, y: 1.0, z: 0 };
    phys.step(0.016);
    // the board's sim position is written back near the hand (m→mm)
    let px: number | null = null;
    for (const rec of sim.instances.values())
      if (rec.id === inst.id) px = rec.position.x;
    expect(px).not.toBeNull();
    expect(Math.abs((px as number) - 200)).toBeLessThan(20); // ~0.2m = 200mm

    phys.release(inst.id);
    expect(phys.isGrabbed(inst.id)).toBe(false);

    phys.syncBoards(); // idempotent — does NOT double-bind
    expect(phys.hasBody(inst.id)).toBe(true);
    phys.dispose();
  });

  it("syncBoards binds a board added mid-frame, unbinds one removed", () => {
    const { world, rec } = stubWorld();
    const sim = new EcadSim();
    const layer = stubLayer(sim);
    const phys = new EcadPhysics(world as never, layer as never, {});
    const a = deskBoard(sim, layer, 80, 40, 1.6);
    phys.syncBoards();
    expect(rec.bodies.length).toBe(1);
    const b = deskBoard(sim, layer, 60, 30, 1.6);
    phys.syncBoards();
    expect(rec.bodies.length).toBe(2);
    sim.remove(a.id);
    phys.syncBoards();
    expect(rec.bodies.length).toBe(1);
    expect(phys.hasBody(b.id)).toBe(true);
    expect(phys.hasBody(a.id)).toBe(false);
  });

  it("the 1:1 law is reachable through the layer (nag path)", () => {
    const sim = new EcadSim();
    const layer = stubLayer(sim);
    const ok = deskBoard(sim, layer, 100, 50, 1.6);
    expect(() => assertOneToOneScale(layer as never)).not.toThrow();
    const bigger = deskBoard(sim, layer, 400000, 50, 1.6); // 400m
    expect(() => assertOneToOneScale(layer as never)).toThrow(
      OneToOneScaleError,
    );
    void ok;
    void bigger;
  });

  it("throws: release carries the hand's velocity (clamped), slow release drops", () => {
    const { world, rec } = stubWorld();
    const sim = new EcadSim();
    const layer = stubLayer(sim);
    const inst = deskBoard(sim, layer, 100, 50, 1.6);
    let t = 0;
    const phys = new EcadPhysics(world as never, layer as never, {
      now: () => t,
    });
    phys.syncBoards();

    // --- flick: 1.2 m in 100 ms = 12 m/s → clamped to MAX_THROW_MPS
    phys.grab(inst.id);
    t = 0;
    phys.handOverride = { x: 0, y: 1, z: 0 };
    phys.step(0.016);
    t = 100;
    phys.handOverride = { x: 1.2, y: 1, z: 0 };
    phys.step(0.016);
    phys.release(inst.id);
    expect(rec.launches.length).toBe(1);
    expect(rec.launches[0]!.x).toBeCloseTo(MAX_THROW_MPS, 5);
    expect(rec.launches[0]!.y).toBeCloseTo(0, 5);
    expect(rec.zeroed).toBe(0);

    // --- drift: 1 cm in 100 ms = 0.1 m/s → below the floor, so a DROP
    phys.grab(inst.id);
    t = 300;
    phys.handOverride = { x: 0, y: 1, z: 0 };
    phys.step(0.016);
    t = 400;
    phys.handOverride = { x: 0.01, y: 1, z: 0 };
    phys.step(0.016);
    phys.release(inst.id);
    expect(rec.launches.length).toBe(1); // no second launch
    expect(rec.zeroed).toBe(1);
    expect(rec.bodies[0]!.body.__kinematic).toBe(false);
  });

  it("grabbedIds follows the hold state (the circuit card uses it)", () => {
    const { world } = stubWorld();
    const sim = new EcadSim();
    const layer = stubLayer(sim);
    const inst = deskBoard(sim, layer, 100, 50, 1.6);
    const phys = new EcadPhysics(world as never, layer as never, {});
    phys.syncBoards();
    expect(phys.grabbedIds()).toEqual([]);
    phys.grab(inst.id);
    expect(phys.grabbedIds()).toEqual([inst.id]);
    phys.release(inst.id);
    expect(phys.grabbedIds()).toEqual([]);
  });
});
