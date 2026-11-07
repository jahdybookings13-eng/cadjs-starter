import type * as RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

export interface PhysicsWorld {
  world: RAPIER.World;
  update: (dt?: number) => void;
  addStaticBox: (
    id: string,
    hx: number,
    hy: number,
    hz: number,
    px: number,
    py: number,
    pz: number,
  ) => RAPIER.RigidBody;
  addDynamicBox: (
    id: string,
    hx: number,
    hy: number,
    hz: number,
    px: number,
    py: number,
    pz: number,
    mass?: number,
  ) => RAPIER.RigidBody;
  addDynamicSphere: (
    id: string,
    radius: number,
    px: number,
    py: number,
    pz: number,
    mass?: number,
  ) => RAPIER.RigidBody;
  removeBody: (body: RAPIER.RigidBody) => void;
  setBodyPosition: (
    body: RAPIER.RigidBody,
    x: number,
    y: number,
    z: number,
  ) => void;
  setBodyKinematic: (body: RAPIER.RigidBody, kinematic: boolean) => void;
  zeroBodyVelocity: (body: RAPIER.RigidBody) => void;
  /** Set linear velocity in m/s (the throw launch). */
  setBodyVelocity: (
    body: RAPIER.RigidBody,
    x: number,
    y: number,
    z: number,
  ) => void;
  syncMeshes: (
    entries: Map<string, { body: RAPIER.RigidBody; mesh: THREE.Object3D }>,
  ) => void;
  dispose: () => void;
}

export async function createPhysicsWorld(
  gravity: [number, number, number] = [0, -9.81, 0],
): Promise<PhysicsWorld> {
  // Rapier's compat build embeds its WASM as base64 and is the single largest
  // module in the app. Import it when physics actually starts so the desktop
  // boot chunk does not parse a VR-only engine.
  const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
  await RAPIER.init();
  const world = new RAPIER.World({
    x: gravity[0],
    y: gravity[1],
    z: gravity[2],
  });

  // Honesty: the engine's internal timestep must match the frame budget that
  // drives stepping, or fast falls tunnel through thin colliders in the gaps.
  // Clamp to a safe ceiling (half a 30 Hz frame) to avoid spiral-of-death.
  const update = (dt?: number) => {
    if (dt !== undefined && Number.isFinite(dt) && dt > 0) {
      world.integrationParameters.dt = Math.min(Math.max(dt, 1 / 240), 1 / 30);
    } else {
      world.integrationParameters.dt = 1 / 60;
    }
    world.step();
  };

  const addStaticBox = (
    id: string,
    hx: number,
    hy: number,
    hz: number,
    px: number,
    py: number,
    pz: number,
  ) => {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz);
    const body = world.createRigidBody(desc);
    const collider = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    world.createCollider(collider, body);
    return body;
  };

  const addDynamicBox = (
    id: string,
    hx: number,
    hy: number,
    hz: number,
    px: number,
    py: number,
    pz: number,
    mass = 1.0,
  ) => {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(px, py, pz)
      .setLinearDamping(0.5)
      .setAngularDamping(0.5)
      // A 1.6 mm board at throw speeds covers > the desk slab depth in a
      // single 1/60 step — without CCD it tunnels through colliders.
      .setCcdEnabled(true);
    const body = world.createRigidBody(desc);
    const vol = hx * hy * hz * 8;
    const collider = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setDensity(
      mass / vol,
    );
    world.createCollider(collider, body);
    return body;
  };

  const addDynamicSphere = (
    id: string,
    radius: number,
    px: number,
    py: number,
    pz: number,
    mass = 1.0,
  ) => {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(px, py, pz)
      .setLinearDamping(0.5)
      .setAngularDamping(0.5)
      .setCcdEnabled(true);
    const body = world.createRigidBody(desc);
    const vol = (4 / 3) * Math.PI * radius * radius * radius;
    const collider = RAPIER.ColliderDesc.ball(radius).setDensity(mass / vol);
    world.createCollider(collider, body);
    return body;
  };

  const removeBody = (body: RAPIER.RigidBody) => {
    world.removeRigidBody(body);
  };

  const setBodyPosition = (
    body: RAPIER.RigidBody,
    x: number,
    y: number,
    z: number,
  ) => {
    body.setTranslation({ x, y, z }, true);
  };

  const setBodyKinematic = (body: RAPIER.RigidBody, kinematic: boolean) => {
    if (kinematic) {
      body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    } else {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    }
  };

  const zeroBodyVelocity = (body: RAPIER.RigidBody) => {
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };

  const setBodyVelocity = (
    body: RAPIER.RigidBody,
    x: number,
    y: number,
    z: number,
  ) => {
    body.setLinvel({ x, y, z }, true);
  };

  const syncMeshes = (
    entries: Map<string, { body: RAPIER.RigidBody; mesh: THREE.Object3D }>,
  ) => {
    entries.forEach(({ body, mesh }) => {
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    });
  };

  const dispose = () => {
    world.free();
  };

  return {
    world,
    update,
    addStaticBox,
    addDynamicBox,
    addDynamicSphere,
    removeBody,
    setBodyPosition,
    setBodyKinematic,
    zeroBodyVelocity,
    setBodyVelocity,
    syncMeshes,
    dispose,
  };
}

export function buildRoomBoundaries(
  physics: PhysicsWorld,
  deskWidth = 1.6,
  deskDepth = 0.8,
  deskHeight = 0.75,
  roomSize = 20,
) {
  const halfRoom = roomSize / 2;
  const wt = 0.1;
  // Track every static body created so a live rebuild (suit-panel edits) can
  // retire the old set without touching the board bodies bound to it.
  const bodies: RAPIER.RigidBody[] = [];
  const add = (
    id: string,
    hx: number,
    hy: number,
    hz: number,
    px: number,
    py: number,
    pz: number,
  ) => {
    bodies.push(physics.addStaticBox(id, hx, hy, hz, px, py, pz));
  };

  add("floor", halfRoom, wt / 2, halfRoom, 0, -wt / 2, 0);
  add("ceiling", halfRoom, wt / 2, halfRoom, 0, 3 + wt / 2, 0);
  add("wall-back", halfRoom, 1.5, wt / 2, 0, 1.5, -halfRoom);
  add("wall-front", halfRoom, 1.5, wt / 2, 0, 1.5, halfRoom);
  add("wall-left", wt / 2, 1.5, halfRoom, -halfRoom, 1.5, 0);
  add("wall-right", wt / 2, 1.5, halfRoom, halfRoom, 1.5, 0);

  add(
    "desk-top",
    deskWidth / 2,
    0.25, // thick slab — a 1.6 mm board falls fast enough to tunnel a thin top
    deskDepth / 2,
    0,
    deskHeight + 0.02 - 0.25, // keep the top surface flush at deskHeight + 0.02
    0,
  );

  const legW = 0.03;
  const legs: [number, number][] = [
    [-deskWidth / 2 + 0.04, -deskDepth / 2 + 0.04],
    [deskWidth / 2 - 0.04, -deskDepth / 2 + 0.04],
    [-deskWidth / 2 + 0.04, deskDepth / 2 - 0.04],
    [deskWidth / 2 - 0.04, deskDepth / 2 - 0.04],
  ];
  legs.forEach(([lx, lz], i) => {
    add(`leg-${i}`, legW, deskHeight / 2, legW, lx, deskHeight / 2, lz);
  });
  return bodies;
}
