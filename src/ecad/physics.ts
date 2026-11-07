import type { PhysicsWorld } from "../components/vr/physicsWorld.js";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { EcadLayer } from "./scene.js";
import { boardMassKg, mToMm } from "./oneToOne.js";

/** Fastest a real hand-throw can launch a board (m/s). Clamped, not simulated. */
export const MAX_THROW_MPS = 5;
/** Below this a release is a drop, not a throw (no phantom flings). */
export const MIN_THROW_MPS = 0.3;
/** Hand-velocity averaging window (ms) — a flick, not the whole grab. */
export const THROW_WINDOW_MS = 120;

/**
 * EcadPhysics — grab/throw/pick physics for ECAD boards, on the VR physics
 * world. A board is a Rapier dynamic rigid body whose collider box matches
 * the board's REAL meter size (1:1 law: the collider IS the board).
 *
 *   - placed   -> dynamic (rests on the desk under gravity)
 *   - grabbed  -> KinematicPositionBased (follows the hand exactly)
 *   - released -> dynamic (falls. the 1:1 size is what makes it land right.)
 *
 * Mass is real: board volume (m^3) * FR4 density. You feel the weight.
 */

export interface EcadBoardBody {
  instId: string;
  body: RigidBody;
  /** Real half-extents in meters (collider == board). */
  half: { x: number; y: number; z: number };
  grabbed: boolean;
}

export interface EcadPhysicsOptions {
  /** Where a freshly-grabbed board should travel to (world meters). */
  handPosition?: () => { x: number; y: number; z: number } | null;
  /** Clock for the throw window (ms). Injectable so tests are deterministic. */
  now?: () => number;
}

export class EcadPhysics {
  /** Settable per-frame by the VR session (right-hand position, meters). */
  handOverride: { x: number; y: number; z: number } | null = null;
  private bodies = new Map<string, EcadBoardBody>();
  private meshEntries: Map<string, { body: RigidBody; mesh: THREE.Object3D }> =
    new Map();
  /** Recent hand positions (world metres) — the source of throw velocity. */
  private handTrail: { t: number; x: number; y: number; z: number }[] = [];
  /** The ECAD layer this physics drives (exposed for the 1:1 nag in VR). */
  readonly layerEcad: EcadLayer;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly layer: EcadLayer,
    private readonly opts: EcadPhysicsOptions = {},
  ) {
    this.layerEcad = layer;
  }

  /** Bind a newly-placed board to a Rapier body sized to its REAL meters. */
  bind(instId: string): EcadBoardBody | null {
    if (this.bodies.has(instId)) return this.bodies.get(instId)!;
    const m = this.layer.meters(instId);
    const mesh = this.layer.get(instId);
    if (!m || !mesh) return null;
    // 1:1: collider half-extents are the board's real half-meters.
    const half = { x: m.w / 2, y: m.t / 2, z: m.h / 2 };
    const mass = boardMassKg(m.w * 1000, m.h * 1000, m.t * 1000);
    const p = mesh.position;
    const body = this.physics.addDynamicBox(
      `ecad-${instId}`,
      half.x,
      half.y,
      half.z,
      p.x,
      p.y,
      p.z,
      Math.max(0.0001, mass),
    );
    const rec: EcadBoardBody = { instId, body, half, grabbed: false };
    this.bodies.set(instId, rec);
    this.meshEntries.set(instId, { body, mesh });
    this.layer.markPhysicsOwned(instId, true);
    return rec;
  }

  unbind(instId: string): void {
    const rec = this.bodies.get(instId);
    if (rec) {
      this.physics.removeBody(rec.body);
      this.bodies.delete(instId);
      this.meshEntries.delete(instId);
      this.layer.markPhysicsOwned(instId, false);
    }
  }

  /** Grab: kinematic — it follows the hand. */
  grab(instId: string): void {
    const rec = this.bodies.get(instId);
    if (!rec) return;
    this.handTrail.length = 0; // a throw is measured from THIS grab onward
    rec.grabbed = true;
    this.physics.setBodyKinematic(rec.body, true);
  }

  /**
   * Release: dynamic again — with the hand's velocity, so a flick THROWS.
   * A slow release (< MIN_THROW_MPS) drops straight down; a hard flick is
   * clamped to MAX_THROW_MPS. The velocity is applied BEFORE flipping to
   * dynamic so the body keeps it on the first integrated step.
   */
  release(instId: string): void {
    const rec = this.bodies.get(instId);
    if (!rec) return;
    const launch = this.throwVelocity();
    this.handTrail.length = 0;
    if (launch) {
      this.physics.setBodyVelocity(rec.body, launch.x, launch.y, launch.z);
    } else {
      this.physics.zeroBodyVelocity(rec.body);
    }
    rec.grabbed = false;
    this.physics.setBodyKinematic(rec.body, false);
  }

  /** Boards currently held (the circuit card follows one of these). */
  grabbedIds(): string[] {
    const out: string[] = [];
    for (const [id, rec] of this.bodies) if (rec.grabbed) out.push(id);
    return out;
  }

  isGrabbed(instId: string): boolean {
    return this.bodies.get(instId)?.grabbed ?? false;
  }

  /**
   * Test/debug seam: full body state (meters) for diagnostics. Not used by
   * the VR loop; the e2e/unit suites read it to assert integrator behavior.
   */
  debugBodyState(instId: string): {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
  } | null {
    const rec = this.bodies.get(instId);
    if (!rec) return null;
    const t = rec.body.translation();

    const v = (
      rec.body as unknown as { linvel(): { x: number; y: number; z: number } }
    ).linvel();
    return { x: t.x, y: t.y, z: t.z, vx: v.x, vy: v.y, vz: v.z };
  }

  hasBody(instId: string): boolean {
    return this.bodies.has(instId);
  }

  /**
   * Self-sync the physics world with the sim's board set. Idempotent: binds
   * any board missing a body, unbinds any board that vanished. Call each
   * frame — cheap (a few map checks) and it makes boards added mid-VR (via the
   * ecosystem panel / flux) get real physics without a separate event.
   */
  syncBoards(): void {
    const instances = this.layer.sim.instances;
    // Unbind boards the sim no longer has.
    for (const [instId] of [...this.bodies]) {
      if (!instances.has(instId)) this.unbind(instId);
    }
    // Bind boards the sim has that lack a body.
    for (const instId of instances.keys()) {
      if (this.bodies.has(instId)) continue;
      const part = this.layer.sim.partOf(instId);
      if (part?.category === "board") this.bind(instId);
    }
  }

  /** Per-frame: hand-follow grabbed boards, integrate, sync, write back. */
  step(dt: number): void {
    this.syncBoards();
    const hand = this.handOverride ?? this.opts.handPosition?.() ?? null;
    this.trackHand(hand);
    for (const rec of this.bodies.values()) {
      if (rec.grabbed && hand) {
        this.physics.setBodyPosition(rec.body, hand.x, hand.y, hand.z);
      }
    }
    this.physics.update(dt);
    this.physics.syncMeshes(this.meshEntries);
    // Write world (m) back to the sim (mm) so sim + physics stay aligned.
    for (const rec of this.bodies.values()) {
      const inst = this.layer.sim.instances.get(rec.instId);
      if (!inst) continue;
      const t = rec.body.translation();
      inst.position.x = mToMm(t.x);
      inst.position.y = Math.max(0, mToMm(t.y));
      inst.position.z = mToMm(t.z);
    }
  }

  dispose(): void {
    for (const [id] of [...this.bodies]) this.unbind(id);
  }

  private nowMs(): number {
    return this.opts.now ? this.opts.now() : performance.now();
  }

  /** Keep a ~THROW_WINDOW_MS tail of hand positions while the hand exists. */
  private trackHand(hand: { x: number; y: number; z: number } | null): void {
    const t = this.nowMs();
    if (hand) {
      this.handTrail.push({ t, x: hand.x, y: hand.y, z: hand.z });
    }
    const cutoff = t - THROW_WINDOW_MS;
    while (this.handTrail.length > 2 && this.handTrail[0]!.t < cutoff) {
      this.handTrail.shift();
    }
  }

  /** Hand velocity over the throw window, or null if it was a drop. */
  private throwVelocity(): { x: number; y: number; z: number } | null {
    const n = this.handTrail.length;
    if (n < 2) return null;
    const first = this.handTrail[0]!;
    const last = this.handTrail[n - 1]!;
    const dt = (last.t - first.t) / 1000;
    if (!(dt > 0.008)) return null; // < 8 ms of data is noise, not a throw
    let vx = (last.x - first.x) / dt;
    let vy = (last.y - first.y) / dt;
    let vz = (last.z - first.z) / dt;
    const speed = Math.hypot(vx, vy, vz);
    if (!Number.isFinite(speed) || speed < MIN_THROW_MPS) return null;
    if (speed > MAX_THROW_MPS) {
      const k = MAX_THROW_MPS / speed;
      vx *= k;
      vy *= k;
      vz *= k;
    }
    return { x: vx, y: vy, z: vz };
  }
}
