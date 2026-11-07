// src/project/session.ts — the Session layer: who is in the suit right now.
//
// The project model (model.ts) is the persistent thing; a Session is the live
// room over it. Two surfaces can be in one session at once:
//
//   2d — the regular webview (tree, history, native-style tools)
//   vr — the headset view of the same project
//
// Both read the same ProjectDoc, so an edit made on one surface is already the
// same object the other surface renders. What the session adds is awareness:
// each seat publishes what it is touching (a selection of element ids), so the
// other surface can outline it and you can watch your buddy work.
//
// Everything here is pure (no storage, no clock reads except an injected
// `now`) so the reducer is trivially testable. Transport lives in sessionBus.ts
// and the singleton glue in sessionRuntime.ts.

import { nextId, type Account, type ProjectDoc, type ShareRole } from "./model";

export type SessionSurface = "2d" | "vr";
export type SessionRole = ShareRole;

/** Seat colors are derived from the account id, so every client agrees. */
export const SEAT_COLORS = [
  "#4f9dfd",
  "#f5a524",
  "#36d399",
  "#f87272",
  "#a78bfa",
  "#22d3ee",
] as const;

/** A peer that has not spoken for this long is treated as gone. */
export const SEAT_TTL_MS = 25_000;

export function colorFor(accountId: string): string {
  let h = 0;
  for (let i = 0; i < accountId.length; i++) {
    h = (h * 31 + accountId.charCodeAt(i)) >>> 0;
  }
  return SEAT_COLORS[h % SEAT_COLORS.length]!;
}

export interface SessionSeat {
  accountId: string;
  name: string;
  color: string;
  surface: SessionSurface;
  role: SessionRole;
  /** Element ids this seat is currently touching on its surface. */
  selection: string[];
  /** Last time this seat said anything (heartbeat or selection). */
  updatedAt: number;
}

export interface Session {
  id: string;
  projectId: string;
  hostId: string;
  createdAt: number;
  /** Local mirror of the room, self included. */
  seats: SessionSeat[];
}

export type SessionEvent =
  | { t: "join"; seat: Omit<SessionSeat, "color"> & { color?: string } }
  | { t: "leave"; accountId: string }
  | { t: "select"; accountId: string; selection: string[]; at: number }
  | { t: "surface"; accountId: string; surface: SessionSurface; at: number }
  | { t: "role"; accountId: string; role: SessionRole; at: number }
  | { t: "heartbeat"; accountId: string; at: number }
  /** "I saved the design" — receivers reload the doc. */
  | { t: "doc"; accountId: string; at: number };

export function makeSeat(opts: {
  account: Pick<Account, "id" | "name" | "avatarColor">;
  surface: SessionSurface;
  role: SessionRole;
  now?: number;
}): SessionSeat {
  return {
    accountId: opts.account.id,
    name: opts.account.name,
    // The account's avatar color is their identity in the suit; the palette
    // fallback keeps duplicates apart on machines that never set one.
    color: opts.account.avatarColor || colorFor(opts.account.id),
    surface: opts.surface,
    role: opts.role,
    selection: [],
    updatedAt: opts.now ?? Date.now(),
  };
}

export function newSession(opts: {
  doc: Pick<ProjectDoc, "id">;
  host: SessionSeat;
  id?: string;
  now?: number;
}): Session {
  const now = opts.now ?? Date.now();
  return {
    id: opts.id ?? nextId("ses"),
    projectId: opts.doc.id,
    hostId: opts.host.accountId,
    createdAt: now,
    seats: [opts.host],
  };
}

/**
 * Apply one event to the room. Returns the same object when nothing changed so
 * React subscribers do not re-render on duplicate events.
 */
export function applySessionEvent(
  session: Session,
  event: SessionEvent,
): Session {
  const idx = (id: string) =>
    session.seats.findIndex((s) => s.accountId === id);

  switch (event.t) {
    case "join": {
      const seat: SessionSeat = {
        ...event.seat,
        color: event.seat.color || colorFor(event.seat.accountId),
      };
      const i = idx(seat.accountId);
      if (i === -1) {
        return { ...session, seats: [...session.seats, seat] };
      }
      const prev = session.seats[i]!;
      // A re-join (second surface, reload) keeps the existing selection unless
      // the joiner brought one, and never loses a role upgrade.
      const merged: SessionSeat = {
        ...prev,
        ...seat,
        role: seat.role === "edit" ? "edit" : prev.role,
        selection: seat.selection.length ? seat.selection : prev.selection,
      };
      const seats = session.seats.slice();
      seats[i] = merged;
      return { ...session, seats };
    }
    case "leave": {
      const i = idx(event.accountId);
      if (i === -1) return session;
      return {
        ...session,
        seats: session.seats.filter((s) => s.accountId !== event.accountId),
      };
    }
    case "select": {
      const i = idx(event.accountId);
      if (i === -1) return session;
      const prev = session.seats[i]!;
      if (
        prev.updatedAt === event.at &&
        sameIds(prev.selection, event.selection)
      ) {
        return session;
      }
      const seats = session.seats.slice();
      seats[i] = {
        ...prev,
        selection: [...event.selection],
        updatedAt: event.at,
      };
      return { ...session, seats };
    }
    case "surface": {
      const i = idx(event.accountId);
      if (i === -1) return session;
      const prev = session.seats[i]!;
      if (prev.surface === event.surface) return session;
      const seats = session.seats.slice();
      seats[i] = { ...prev, surface: event.surface, updatedAt: event.at };
      return { ...session, seats };
    }
    case "role": {
      const i = idx(event.accountId);
      if (i === -1) return session;
      const prev = session.seats[i]!;
      if (prev.role === event.role) return session;
      const seats = session.seats.slice();
      seats[i] = { ...prev, role: event.role, updatedAt: event.at };
      return { ...session, seats };
    }
    case "heartbeat": {
      const i = idx(event.accountId);
      if (i === -1) return session;
      const seats = session.seats.slice();
      seats[i] = { ...seats[i]!, updatedAt: event.at };
      return { ...session, seats };
    }
    case "doc":
      // No state of its own; sessionRuntime forwards it to doc listeners.
      return session;
  }
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Everyone except me who is still alive. */
export function sessionPeers(
  session: Session,
  selfId: string,
  now = Date.now(),
  ttl = SEAT_TTL_MS,
): SessionSeat[] {
  return session.seats.filter(
    (s) => s.accountId !== selfId && now - s.updatedAt <= ttl,
  );
}

export function sessionSeat(
  session: Session,
  accountId: string,
): SessionSeat | null {
  return session.seats.find((s) => s.accountId === accountId) ?? null;
}

export function canEdit(role: SessionRole): boolean {
  return role === "edit";
}

export function canComment(role: SessionRole): boolean {
  return role === "comment" || role === "edit";
}

/* ------------------------------------------------------------------------ */
/* Share-link routing: /project/:id/view?t=…  and  /project/:id/enter?t=…     */
/* ------------------------------------------------------------------------ */

export interface SharePath {
  projectId: string;
  mode: "view" | "enter";
  /** Empty string for the owner's own "enter" link. */
  token: string;
  /** Link explicitly asks for the VR surface. */
  vr: boolean;
}

/**
 * Parse the share URL the join flow writes (issueShareToken). Returns null for
 * anything that is not a project route, so the app can fall through to its
 * normal boot.
 */
export function parseSharePath(
  pathname: string,
  search: string,
): SharePath | null {
  const m = /^\/project\/([^/]+)\/(view|enter)\/?$/.exec(pathname);
  if (!m) return null;
  const projectId = decodeURIComponent(m[1]!);
  if (!projectId) return null;
  const mode = m[2] as "view" | "enter";
  const params = new URLSearchParams(
    search.startsWith("?") ? search : `?${search}`,
  );
  return {
    projectId,
    mode,
    token: params.get("t") ?? "",
    vr: params.get("vr") === "1",
  };
}
