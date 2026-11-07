import { describe, it, expect, afterEach } from "vitest";

import {
  applySessionEvent,
  canComment,
  canEdit,
  colorFor,
  makeSeat,
  newSession,
  parseSharePath,
  sameIds,
  sessionPeers,
  sessionSeat,
  SEAT_COLORS,
  type Session,
  type SessionSeat,
} from "../session";
import { createMemoryTransport, createSessionBus } from "../sessionBus";
import {
  getSessionSnapshot,
  publishSelection,
  remoteSelections,
  startSession,
  stopSession,
} from "../sessionRuntime";

const t0 = 1_700_000_000_000;

function seat(over: Partial<SessionSeat> = {}): SessionSeat {
  return {
    accountId: "acc_me",
    name: "Me",
    color: "#4f9dfd",
    surface: "2d",
    role: "edit",
    selection: [],
    updatedAt: t0,
    ...over,
  };
}

function room(seats: SessionSeat[] = [seat()]): Session {
  return {
    id: "ses_x",
    projectId: "prj_x",
    hostId: seats[0]!.accountId,
    createdAt: t0,
    seats,
  };
}

afterEach(() => {
  stopSession();
});

describe("session model", () => {
  it("derives a stable seat colour from the account id", () => {
    expect(colorFor("acc_1")).toBe(colorFor("acc_1"));
    expect(SEAT_COLORS).toContain(colorFor("acc_1"));
  });

  it("makes a seat from the account's avatar colour", () => {
    const s = makeSeat({
      account: { id: "a", name: "Al", avatarColor: "#abcdef" },
      surface: "vr",
      role: "view",
      now: t0,
    });
    expect(s.color).toBe("#abcdef");
    expect(s.surface).toBe("vr");
    expect(canEdit(s.role)).toBe(false);
    expect(canComment(s.role)).toBe(false);
  });

  it("a role event downgrades a seat without losing its selection", () => {
    const next = applySessionEvent(room(), {
      t: "role",
      accountId: "acc_me",
      role: "comment",
      at: t0 + 1,
    });
    expect(next.seats[0]!.role).toBe("comment");
    expect(canEdit(next.seats[0]!.role)).toBe(false);
    expect(canComment(next.seats[0]!.role)).toBe(true);
  });

  it("starts with the host seated", () => {
    const host = seat();
    const s = newSession({ doc: { id: "prj_1" }, host, id: "ses_1", now: t0 });
    expect(s.id).toBe("ses_1");
    expect(s.projectId).toBe("prj_1");
    expect(s.hostId).toBe("acc_me");
    expect(s.seats).toHaveLength(1);
  });

  it("joins a peer once and upgrades, never duplicates", () => {
    let s = room();
    s = applySessionEvent(s, {
      t: "join",
      seat: seat({ accountId: "acc_peer", name: "Dave", surface: "vr" }),
    });
    expect(s.seats).toHaveLength(2);

    s = applySessionEvent(s, {
      t: "join",
      seat: {
        ...seat({ accountId: "acc_peer", name: "Dave" }),
        selection: ["el_1"],
      },
    });
    expect(s.seats).toHaveLength(2);
    expect(sessionSeat(s, "acc_peer")?.selection).toEqual(["el_1"]);
  });

  it("records a peer selection and heartbeat, ignores strangers", () => {
    let s = room();
    s = applySessionEvent(s, {
      t: "join",
      seat: seat({ accountId: "acc_peer", surface: "vr" }),
    });
    s = applySessionEvent(s, {
      t: "select",
      accountId: "acc_peer",
      selection: ["el_a", "el_b"],
      at: t0 + 50,
    });
    expect(sessionSeat(s, "acc_peer")?.selection).toEqual(["el_a", "el_b"]);
    expect(sessionSeat(s, "acc_peer")?.updatedAt).toBe(t0 + 50);

    const before = s;
    s = applySessionEvent(s, {
      t: "select",
      accountId: "acc_ghost",
      selection: ["el_z"],
      at: t0 + 60,
    });
    expect(s).toBe(before); // no phantom seats
  });

  it("leaves cleanly and drops stale peers", () => {
    let s = room();
    s = applySessionEvent(s, {
      t: "join",
      seat: seat({ accountId: "acc_peer", updatedAt: t0 }),
    });
    expect(sessionPeers(s, "acc_me", t0 + 1_000)).toHaveLength(1);
    expect(sessionPeers(s, "acc_me", t0 + 60_000)).toHaveLength(0);

    s = applySessionEvent(s, { t: "leave", accountId: "acc_peer" });
    expect(s.seats).toHaveLength(1);
  });

  it("tracks a surface switch", () => {
    let s = room();
    s = applySessionEvent(s, {
      t: "join",
      seat: seat({ accountId: "acc_peer", surface: "2d" }),
    });
    s = applySessionEvent(s, {
      t: "surface",
      accountId: "acc_peer",
      surface: "vr",
      at: t0 + 5,
    });
    expect(sessionSeat(s, "acc_peer")?.surface).toBe("vr");
  });

  it("compares id lists", () => {
    expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(false);
  });
});

describe("share-link paths", () => {
  it("parses the two link forms", () => {
    expect(parseSharePath("/project/prj_1/view", "?t=tok_1")).toEqual({
      projectId: "prj_1",
      mode: "view",
      token: "tok_1",
      vr: false,
    });
    expect(parseSharePath("/project/prj_1/enter", "")).toEqual({
      projectId: "prj_1",
      mode: "enter",
      token: "",
      vr: false,
    });
    expect(parseSharePath("/project/prj_1/enter/", "t=tok_2")).toEqual({
      projectId: "prj_1",
      mode: "enter",
      token: "tok_2",
      vr: false,
    });
    expect(parseSharePath("/project/prj_1/view", "?t=tok_1&vr=1")).toEqual({
      projectId: "prj_1",
      mode: "view",
      token: "tok_1",
      vr: true,
    });
  });

  it("returns null for anything else", () => {
    expect(parseSharePath("/", "")).toBeNull();
    expect(parseSharePath("/project/prj_1", "")).toBeNull();
    expect(parseSharePath("/project//view", "")).toBeNull();
    expect(parseSharePath("/project/prj_1/edit", "")).toBeNull();
  });
});

describe("session bus", () => {
  it("delivers to other buses and never echoes to the sender", () => {
    const transport = createMemoryTransport();
    const a = createSessionBus({ sessionId: "s1", selfId: "a", transport });
    const b = createSessionBus({ sessionId: "s1", selfId: "b", transport });
    const gotA: string[] = [];
    const gotB: string[] = [];
    a.subscribe((m) => gotA.push(m.from));
    b.subscribe((m) => gotB.push(m.from));

    a.post({ t: "heartbeat", accountId: "a", at: t0 });
    expect(gotA).toEqual([]);
    expect(gotB).toEqual(["a"]);

    b.post({ t: "heartbeat", accountId: "b", at: t0 + 1 });
    expect(gotA).toEqual(["b"]);

    a.close();
    b.close();
  });
});

describe("session runtime", () => {
  it("keeps a live peer mirror and hands out remote selections", () => {
    const transport = createMemoryTransport();
    const snap = startSession({
      doc: { id: "prj_1", name: "Desk" },
      account: { id: "acc_me", name: "Me", avatarColor: "#4f9dfd" },
      transport,
    });
    expect(snap.self.accountId).toBe("acc_me");
    expect(snap.peers).toHaveLength(0);

    const peer = createSessionBus({
      sessionId: snap.id,
      selfId: "acc_peer",
      transport,
    });
    peer.post({
      t: "join",
      seat: {
        accountId: "acc_peer",
        name: "Dave",
        color: "#f5a524",
        surface: "vr",
        role: "edit",
        selection: [],
        updatedAt: Date.now(),
      },
    });
    peer.post({
      t: "select",
      accountId: "acc_peer",
      selection: ["el_7"],
      at: Date.now(),
    });

    expect(getSessionSnapshot()?.peers).toHaveLength(1);
    expect(remoteSelections()).toEqual([
      {
        accountId: "acc_peer",
        name: "Dave",
        color: "#f5a524",
        surface: "vr",
        selection: ["el_7"],
      },
    ]);

    publishSelection(["el_mine"]);
    expect(getSessionSnapshot()?.self.selection).toEqual(["el_mine"]);
    peer.close();
  });
});
