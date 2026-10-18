import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

export interface PhysicsWorld {
  world: RAPIER.World;
  update: (dt: number) => void;
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
  syncMeshes: (
    entries: Map<string, { body: RAPIER.RigidBody; mesh: THREE.Object3D }>,
  ) => void;
  dispose: () => void;
}

export async function createPhysicsWorld(
  gravity: [number, number, number] = [0, -9.81, 0],
): Promise<PhysicsWorld> {
  await RAPIER.init();
  const world = new RAPIER.World({
    x: gravity[0],
    y: gravity[1],
    z: gravity[2],
  });

  const update = () => {
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
      .setAngularDamping(0.5);
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
      .setAngularDamping(0.5);
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

  physics.addStaticBox("floor", halfRoom, wt / 2, halfRoom, 0, -wt / 2, 0);
  physics.addStaticBox("ceiling", halfRoom, wt / 2, halfRoom, 0, 3 + wt / 2, 0);
  physics.addStaticBox("wall-back", halfRoom, 1.5, wt / 2, 0, 1.5, -halfRoom);
  physics.addStaticBox("wall-front", halfRoom, 1.5, wt / 2, 0, 1.5, halfRoom);
  physics.addStaticBox("wall-left", wt / 2, 1.5, halfRoom, -halfRoom, 1.5, 0);
  physics.addStaticBox("wall-right", wt / 2, 1.5, halfRoom, halfRoom, 1.5, 0);

  physics.addStaticBox(
    "desk-top",
    deskWidth / 2,
    0.02,
    deskDepth / 2,
    0,
    deskHeight,
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
    physics.addStaticBox(
      `leg-${i}`,
      legW,
      deskHeight / 2,
      legW,
      lx,
      deskHeight / 2,
      lz,
    );
  });
}
