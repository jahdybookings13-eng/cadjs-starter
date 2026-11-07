// src/project/sessionRuntime.ts — the one live session this app is in.
//
// A module-level singleton (not React state) because the two surfaces are not
// in the same component tree: the desk webview lives in simpleCadScene, the
// headset view lives inside useVRSession's render loop. Both talk to this.
//
// Responsibilities:
//   - hold the local Session mirror (self + peers + their selections)
//   - publish my selection / surface / heartbeat
//   - hand peers' selections to the surfaces (2D tint, VR outline)
//   - relay "doc saved" so the other surface reloads instead of guessing
//
// React subscribes through useSessionSnapshot(); imperative code (three.js
// loop) reads remoteSelections() each frame.

import type { Account, ProjectDoc } from "./model";
import {
  applySessionEvent,
  makeSeat,
  newSession,
  sessionPeers,
  type Session,
  type SessionEvent,
  type SessionRole,
  type SessionSeat,
  type SessionSurface,
} from "./session";
import {
  createSessionBus,
  type SessionBus,
  type SessionTransport,
} from "./sessionBus";

export interface SessionSnapshot {
  id: string;
  projectId: string;
  self: SessionSeat;
  /** Peers still alive (self excluded). */
  peers: SessionSeat[];
  /** Self first, then peers. */
  seats: SessionSeat[];
}

export interface RemoteSelection {
  accountId: string;
  name: string;
  color: string;
  surface: SessionSurface;
  selection: string[];
}

interface Runtime {
  session: Session;
  self: SessionSeat;
  bus: SessionBus;
  snapshot: SessionSnapshot;
  listeners: Set<() => void>;
  docListeners: Set<() => void>;
  lastSelection: string[];
  lastAnnounced: Set<string>;
  heartbeat: ReturnType<typeof setInterval> | null;
  prune: ReturnType<typeof setInterval> | null;
}

let runtime: Runtime | null = null;

const HEARTBEAT_MS = 8_000;
const PRUNE_MS = 5_000;

function buildSnapshot(session: Session, selfId: string): SessionSnapshot {
  const peers = sessionPeers(session, selfId);
  const self = session.seats.find((s) => s.accountId === selfId);
  const me: SessionSeat =
    self ??
    ({
      accountId: selfId,
      name: "You",
      color: "#4f9dfd",
      surface: "2d",
      role: "edit",
      selection: [],
      updatedAt: Date.now(),
    } satisfies SessionSeat);
  return {
    id: session.id,
    projectId: session.projectId,
    self: me,
    peers,
    seats: [me, ...peers],
  };
}

function notify(rt: Runtime): void {
  rt.snapshot = buildSnapshot(rt.session, rt.self.accountId);
  for (const fn of [...rt.listeners]) {
    try {
      fn();
    } catch {
      /* a broken subscriber must not stop the room */
    }
  }
}

function applyAndNotify(rt: Runtime, event: SessionEvent): void {
  const next = applySessionEvent(rt.session, event);
  if (next === rt.session) return;
  rt.session = next;
  notify(rt);
}

function post(rt: Runtime, event: SessionEvent): void {
  rt.bus.post(event);
}

function announceSelf(rt: Runtime): void {
  const seat = rt.self;
  post(rt, {
    t: "join",
    seat: {
      accountId: seat.accountId,
      name: seat.name,
      color: seat.color,
      surface: seat.surface,
      role: seat.role,
      selection: seat.selection,
      updatedAt: seat.updatedAt,
    },
  });
}

function handleMessage(
  rt: Runtime,
  msg: { from: string; event: SessionEvent },
): void {
  const { event } = msg;

  // A message from someone we have never seen means our own join went out
  // before they arrived. Answer once with our join so they can see us too.
  const known = rt.session.seats.some((s) => s.accountId === msg.from);
  if (!known && event.t !== "join") {
    if (!rt.lastAnnounced.has(msg.from)) {
      rt.lastAnnounced.add(msg.from);
      announceSelf(rt);
    }
    return;
  }

  if (event.t === "doc") {
    for (const fn of [...rt.docListeners]) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (event.t === "leave") {
    rt.lastAnnounced.delete(event.accountId);
  }

  // A room owner can downgrade/upgrade a live participant. The receiver
  // updates its local seat immediately; the actual UI gate reads this role.
  if (event.t === "role" && event.accountId === rt.self.accountId) {
    rt.self = { ...rt.self, role: event.role, updatedAt: event.at };
  }

  applyAndNotify(rt, event);
}

/* ------------------------------------------------------------------------ */
/* Public API                                                                */
/* ------------------------------------------------------------------------ */

export function startSession(opts: {
  doc: Pick<ProjectDoc, "id" | "name">;
  account: Pick<Account, "id" | "name" | "avatarColor">;
  role?: SessionRole;
  surface?: SessionSurface;
  transport?: SessionTransport;
  /** Reuse an existing room id (joining a share link). */
  sessionId?: string;
}): SessionSnapshot {
  stopSession();
  const surface = opts.surface ?? "2d";
  const role = opts.role ?? "edit";
  const self = makeSeat({ account: opts.account, surface, role });
  const session = newSession({
    doc: opts.doc,
    host: self,
    ...(opts.sessionId !== undefined ? { id: opts.sessionId } : {}),
  });
  const bus = createSessionBus({
    sessionId: session.id,
    selfId: self.accountId,
    ...(opts.transport !== undefined ? { transport: opts.transport } : {}),
  });

  const rt: Runtime = {
    session,
    self,
    bus,
    snapshot: buildSnapshot(session, self.accountId),
    listeners: new Set(),
    docListeners: new Set(),
    lastSelection: [],
    lastAnnounced: new Set(),
    heartbeat: null,
    prune: null,
  };
  runtime = rt;

  bus.subscribe((msg) => handleMessage(rt, msg));
  announceSelf(rt);

  rt.heartbeat = setInterval(() => {
    const at = Date.now();
    applyAndNotify(rt, { t: "heartbeat", accountId: rt.self.accountId, at });
    rt.self = { ...rt.self, updatedAt: at };
    post(rt, { t: "heartbeat", accountId: rt.self.accountId, at });
  }, HEARTBEAT_MS);

  // Peers that stop talking must disappear even if they never said "leave".
  rt.prune = setInterval(() => {
    const before = rt.snapshot.peers.length;
    const next = buildSnapshot(rt.session, rt.self.accountId);
    if (next.peers.length !== before) {
      rt.snapshot = next;
      for (const fn of [...rt.listeners]) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
    }
  }, PRUNE_MS);

  // Debug/e2e surface, alongside __scadgen.project.
  if (typeof window !== "undefined") {
    const win = window as unknown as {
      __scadgen?: Record<string, unknown>;
    };
    win.__scadgen = win.__scadgen ?? {};
    win.__scadgen.session = {
      id: () => runtime?.session.id ?? null,
      projectId: () => runtime?.session.projectId ?? null,
      self: () => (runtime ? { ...runtime.snapshot.self } : null),
      peers: () =>
        runtime ? runtime.snapshot.peers.map((p) => ({ ...p })) : [],
      select: (ids: string[]) => publishSelection(ids),
      surface: (s: SessionSurface) => setSurface(s),
      role: () => getRole(),
      setPeerRole: (accountId: string, role: SessionRole) =>
        setPeerRole(accountId, role),
    };
  }

  return rt.snapshot;
}

export function stopSession(): void {
  const rt = runtime;
  if (!rt) return;
  if (rt.heartbeat) clearInterval(rt.heartbeat);
  if (rt.prune) clearInterval(rt.prune);
  post(rt, { t: "leave", accountId: rt.self.accountId });
  rt.bus.close();
  rt.listeners.clear();
  rt.docListeners.clear();
  runtime = null;
  if (typeof window !== "undefined") {
    const win = window as unknown as { __scadgen?: Record<string, unknown> };
    if (win.__scadgen) delete win.__scadgen.session;
  }
}

export function getSessionSnapshot(): SessionSnapshot | null {
  return runtime?.snapshot ?? null;
}

export function subscribeSession(fn: () => void): () => void {
  const rt = runtime;
  if (!rt) return () => {};
  rt.listeners.add(fn);
  return () => rt.listeners.delete(fn);
}

export function getSelfId(): string | null {
  return runtime?.self.accountId ?? null;
}

export function getRole(): SessionRole {
  return runtime?.self.role ?? "edit";
}

export function canEditSession(): boolean {
  return getRole() === "edit";
}

/** Change another live participant's role and tell that surface to apply it. */
export function setPeerRole(accountId: string, role: SessionRole): void {
  const rt = runtime;
  if (!rt || accountId === rt.self.accountId) return;
  const at = Date.now();
  applyAndNotify(rt, { t: "role", accountId, role, at });
  post(rt, { t: "role", accountId, role, at });
}

export function setSurface(surface: SessionSurface): void {
  const rt = runtime;
  if (!rt || rt.self.surface === surface) return;
  const at = Date.now();
  // Leaving VR hands the selection back to the desk: the headset's held id
  // must not linger as "this is what I'm touching" once the desk is driving.
  const selection = surface === "2d" ? [] : rt.self.selection;
  rt.self = { ...rt.self, surface, selection, updatedAt: at };
  applyAndNotify(rt, {
    t: "surface",
    accountId: rt.self.accountId,
    surface,
    at,
  });
  post(rt, {
    t: "surface",
    accountId: rt.self.accountId,
    surface,
    at,
  });
  if (surface === "2d") {
    rt.lastSelection = [];
    applyAndNotify(rt, {
      t: "select",
      accountId: rt.self.accountId,
      selection: [],
      at,
    });
    post(rt, {
      t: "select",
      accountId: rt.self.accountId,
      selection: [],
      at,
    });
  }
}

/**
 * Publish what I am touching. Cheap to call every frame — deduped by value.
 * `surface` guards against the two local surfaces fighting over one seat: only
 * the surface that currently owns the desk/headset drives the selection.
 */
export function publishSelection(
  ids: readonly string[],
  surface: SessionSurface = "2d",
): void {
  const rt = runtime;
  if (!rt) return;
  if (rt.self.surface !== surface) return;
  const next = [...ids];
  if (
    next.length === rt.lastSelection.length &&
    next.every((id, i) => id === rt.lastSelection[i])
  ) {
    return;
  }
  rt.lastSelection = next;
  const at = Date.now();
  rt.self = { ...rt.self, selection: next, updatedAt: at };
  applyAndNotify(rt, {
    t: "select",
    accountId: rt.self.accountId,
    selection: next,
    at,
  });
  post(rt, { t: "select", accountId: rt.self.accountId, selection: next, at });
}

/** What peers are touching, for the VR outline / 2D tint. */
export function remoteSelections(): RemoteSelection[] {
  const rt = runtime;
  if (!rt) return [];
  return rt.snapshot.peers
    .filter((p) => p.selection.length > 0)
    .map((p) => ({
      accountId: p.accountId,
      name: p.name,
      color: p.color,
      surface: p.surface,
      selection: p.selection,
    }));
}

/** Call after I saved the design so the other surface reloads. */
export function announceDocSaved(): void {
  const rt = runtime;
  if (!rt) return;
  post(rt, {
    t: "doc",
    accountId: rt.self.accountId,
    at: Date.now(),
  });
}

export function onRemoteDoc(fn: () => void): () => void {
  const rt = runtime;
  if (!rt) return () => {};
  rt.docListeners.add(fn);
  return () => rt.docListeners.delete(fn);
}

// Re-exported so callers only need one import for the START of a session.
export { makeSeat, sessionPeers };
export type { SessionSeat, SessionSurface, SessionRole };
