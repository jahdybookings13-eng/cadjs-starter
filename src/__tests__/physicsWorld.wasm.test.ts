import { beforeAll, describe, expect, it } from "vitest";
import { initRealRapier } from "./rapierSetup";
import {
  createPhysicsWorld,
  buildRoomBoundaries,
  type PhysicsWorld,
} from "../components/vr/physicsWorld";
import { EcadPhysics } from "../ecad/physics";

// A minimal EcadLayer stand-in whose boards become REAL RAPIER bodies (created
// by EcadPhysics.bind, which reads layer.meters()/get()). Only the layer is
// faked; the world + bodies + integration are the real WASM physics the
// browser runs.
const DESK_HEIGHT = 0.75; // desk surface height (buildRoomBoundaries default)
const DESK_TOP_HALF = 0.02; // desk-top half-thickness (physicsWorld.ts)
// A board resting on the desk's TOP surface: its center is at
// (DESK_HEIGHT + DESK_TOP_HALF) + board half-thickness.
const BOARD_HALF_T = 0.0016 / 2; // 1.6mm board half-thickness in meters
const REST_Y = DESK_HEIGHT + DESK_TOP_HALF + BOARD_HALF_T; // 0.7708 m
const DT = 1 / 60;
const SETTLE_FRAMES = 300; // ~5s of integration — ample for a low-mass board to stop oscillating

// Fake THREE.Object3D position+quaternion — one STABLE mutable object each,
// enough for syncMeshes which does mesh.position.set(x,y,z) +
// mesh.quaternion.set(x,y,z,w) once per frame.
function vec3(x = 0, y = 0, z = 0, w = 1) {
  interface V3 {
    x: number;
    y: number;
    z: number;
    w?: number;
    set: (xx: number, yy: number, zz: number, ww?: number) => void;
  }
  const o: V3 = { x, y, z, w, set: () => {} };
  o.set = function (xx: number, yy: number, zz: number, ww?: number) {
    o.x = xx;
    o.y = yy;
    o.z = zz;
    if (ww !== undefined) o.w = ww;
  };
  return o;
}

function boardLayer(startYm: number) {
  const id = "board-real";
  const mesh: {
    position: ReturnType<typeof vec3>;
    quaternion: ReturnType<typeof vec3>;
  } = { position: vec3(0, startYm, 0), quaternion: vec3(0, 0, 0, 1) };
  const instances = new Map([
    [id, { id, position: { x: 0, y: startYm * 1000, z: 0 } }],
  ]);
  const layer = {
    sim: {
      instances,
      partOf: (iid: string) => (iid === id ? { category: "board" } : undefined),
    },
    // bind() reads m.w / m.t / m.h as FULL meter extents:
    // half.x = w/2 (x extent), half.y = t/2 (thin y), half.z = h/2 (z extent).
    // A 100mm x 1.6mm x 50mm board -> { w: 0.1, t: 0.0016, h: 0.05 }.
    meters: () => ({ w: 0.1, t: 0.0016, h: 0.05 }),
    get: () => mesh,
    markPhysicsOwned: () => {},
    setFromWorld: () => {},
  };
  return { layer: layer as never, mesh, id };
}

function meshY(layer: unknown): number {
  return (layer as { get: () => { position: { y: number } } }).get().position.y;
}
function simY(layer: unknown, id: string): number {
  const inst = (
    layer as { sim: { instances: Map<string, { position: { y: number } }> } }
  ).sim.instances.get(id);
  return inst ? inst.position.y : NaN;
}

describe("REAL RAPIER (WASM) — PCB board rests, is grabbed, and drops", () => {
  let world: PhysicsWorld;

  beforeAll(async () => {
    // Seed the .wasm bytes ONCE (idempotent; createPhysicsWorld's own
    // no-arg RAPIER.init() then resolves as a no-op).
    await initRealRapier();
  });

  async function freshWorld(): Promise<PhysicsWorld> {
    world = await createPhysicsWorld([0, -9.81, 0]);
    buildRoomBoundaries(world, 1.6, 0.8, DESK_HEIGHT, 20);
    return world;
  }

  it("boots a real WASM world with room + desk boundaries", async () => {
    const w = await freshWorld();
    // 1 floor + 1 ceiling + 4 walls + 1 desk-top + 4 legs = 11 static bodies.
    // RAPIER 0.20 exposes bodies as a set with forEachRigidBody (no count fn).
    let count = 0;
    w.world.forEachRigidBody(() => {
      count += 1;
    });
    expect(count).toBe(11);
    w.dispose();
  });

  it("a PCB dropped from above RESTS on the desk-top (real collision)", async () => {
    const w = await freshWorld();
    const { layer, id } = boardLayer(1.0); // start 25cm above the desk
    const phys = new EcadPhysics(w, layer, {});
    phys.syncBoards();
    expect(phys.hasBody(id)).toBe(true);
    for (let i = 0; i < SETTLE_FRAMES; i++) phys.step(DT); // ~5s real integr
    const y = meshY(layer);
    // Rest center = desk top surface + board half-thickness (0.7708 m).
    expect(y, `rested y=${y}`).toBeCloseTo(REST_Y, 2);
    // Must not have fallen through the desk to the floor (y would be ~0.0008).
    expect(y).toBeGreaterThan(0.6);
    // Sim write-back: sim y (mm) aligns with the resting physics y (m).
    expect(simY(layer, id)).toBeCloseTo(REST_Y * 1000, 0);
    phys.dispose();
    w.dispose();
  });

  it("grabbing a board makes it KINEMATIC — held up, it does NOT drop", async () => {
    const w = await freshWorld();
    const { layer, id } = boardLayer(1.0);
    const phys = new EcadPhysics(w, layer, {});
    phys.syncBoards();
    phys.grab(id);
    expect(phys.isGrabbed(id)).toBe(true);
    // Hold the hand at a fixed spot (x=0.2, y=1.0); step past the fall time.
    phys.handOverride = { x: 0.2, y: 1.0, z: 0 };
    for (let i = 0; i < 180; i++) phys.step(DT);
    // Kinematic hand-follow => it stays at the hand, NOT on the desk (0.75),
    // and NOT at the floor. Proof that grab overrides gravity.
    const { x, y } = (
      layer as { get: () => { position: { x: number; y: number } } }
    ).get().position;
    expect(Math.abs(x - 0.2)).toBeLessThan(0.01);
    expect(Math.abs(y - 1.0)).toBeLessThan(0.01);
    phys.release(id);
    expect(phys.isGrabbed(id)).toBe(false);
    phys.dispose();
    w.dispose();
  });

  it("releasing a board turns it DYNAMIC — it falls back to the desk", async () => {
    const w = await freshWorld();
    const { layer, id } = boardLayer(1.0);
    const phys = new EcadPhysics(w, layer, {});
    phys.syncBoards();
    phys.grab(id);
    phys.handOverride = { x: 0, y: 1.0, z: 0 };
    for (let i = 0; i < 30; i++) phys.step(DT); // settle at the hand
    const heldY = meshY(layer);
    phys.release(id); // -> dynamic, will fall
    expect(phys.isGrabbed(id)).toBe(false);
    phys.handOverride = null; // clear the hand => purely gravity
    for (let i = 0; i < SETTLE_FRAMES; i++) phys.step(DT); // ~5s of falling
    const restY = meshY(layer);
    // It was held at ~1.0 m; gravity pulled it back onto the desk (~0.7708 m).
    // It must NOT have fallen through to the floor (that was the tunnel bug).
    expect(heldY).toBeGreaterThan(0.95);
    expect(restY).toBeLessThan(heldY);
    expect(
      restY,
      `released board must rest on the desk, not the floor (y=${restY})`,
    ).toBeCloseTo(REST_Y, 1);
    // Held-then-dropped guarantees it stopped cleanly above the floor.
    expect(restY).toBeGreaterThan(0.6);
    phys.dispose();
    w.dispose();
  });
});
