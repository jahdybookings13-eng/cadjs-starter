// src/project/sessionBus.ts — how session events get from one surface to the
// other.
//
// In one tab, 2D and VR already share the same in-memory ProjectDoc and the
// same cadjs core, so awareness only needs the cheap local path. Across tabs
// (a second window on the same machine, or a VR tab and a desk tab) the
// BroadcastChannel transport carries the same events. A real second person on
// another machine needs a server; that is a different Transport, not a
// different runtime — swap the transport and the session layering above it is
// unchanged.

import type { SessionEvent } from "./session";

export interface SessionMessage {
  sessionId: string;
  from: string;
  event: SessionEvent;
}

export interface SessionTransport {
  /** Deliver to everybody except the sender. */
  send(msg: SessionMessage): void;
  listen(fn: (msg: SessionMessage) => void): () => void;
  close(): void;
}

export interface SessionBus {
  readonly sessionId: string;
  readonly selfId: string;
  post(event: SessionEvent): void;
  subscribe(fn: (msg: SessionMessage) => void): () => void;
  close(): void;
}

/* ------------------------------------------------------------------------ */
/* In-memory transport (tests, and same-tab surfaces)                        */
/* ------------------------------------------------------------------------ */

export function createMemoryTransport(): SessionTransport {
  const listeners = new Set<(msg: SessionMessage) => void>();
  return {
    send(msg) {
      for (const fn of [...listeners]) {
        try {
          fn(msg);
        } catch {
          /* a dead listener must not take the room down */
        }
      }
    },
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      listeners.clear();
    },
  };
}

/* ------------------------------------------------------------------------ */
/* BroadcastChannel transport (cross-tab)                                    */
/* ------------------------------------------------------------------------ */

export function createBroadcastTransport(name: string): SessionTransport {
  const Channel = (
    globalThis as unknown as { BroadcastChannel?: typeof BroadcastChannel }
  ).BroadcastChannel;
  const listeners = new Set<(msg: SessionMessage) => void>();
  if (!Channel) {
    // No BroadcastChannel (older webview): local-only room rather than a crash.
    return {
      send() {},
      listen(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      close() {
        listeners.clear();
      },
    };
  }

  let ch: BroadcastChannel | null = null;
  try {
    ch = new Channel(name);
  } catch {
    ch = null;
  }
  if (!ch) {
    return {
      send() {},
      listen(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      close() {
        listeners.clear();
      },
    };
  }

  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as SessionMessage | null;
    if (!data || typeof data !== "object" || !data.sessionId) return;
    for (const fn of [...listeners]) {
      try {
        fn(data);
      } catch {
        /* ignore */
      }
    }
  };
  ch.addEventListener("message", onMessage);
  const channel = ch;

  return {
    send(msg) {
      try {
        channel.postMessage(msg);
      } catch {
        /* serialization/quota — best effort */
      }
    },
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      listeners.clear();
      channel.removeEventListener("message", onMessage);
      try {
        channel.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Bus                                                                       */
/* ------------------------------------------------------------------------ */

export function createSessionBus(opts: {
  sessionId: string;
  selfId: string;
  transport?: SessionTransport;
}): SessionBus {
  const transport =
    opts.transport ??
    createBroadcastTransport(`scadgen.session.${opts.sessionId}`);
  const unsubs = new Set<() => void>();
  return {
    sessionId: opts.sessionId,
    selfId: opts.selfId,
    post(event) {
      transport.send({
        sessionId: opts.sessionId,
        from: opts.selfId,
        event,
      });
    },
    subscribe(fn) {
      const off = transport.listen((msg) => {
        if (msg.sessionId !== opts.sessionId) return;
        if (msg.from === opts.selfId) return;
        fn(msg);
      });
      unsubs.add(off);
      return () => {
        unsubs.delete(off);
        off();
      };
    },
    close() {
      for (const off of [...unsubs]) off();
      unsubs.clear();
      transport.close();
    },
  };
}
