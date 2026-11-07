// SessionPresenceStrip — the 2D webview's answer to "who else is in my suit?".
//
// Sits in the canvas corner (not the toolbars, so it never steals clicks or
// shifts layout). Shows the live seats and what a peer is touching; the same
// selection drives the VR wireframe box in vrSessionPresence.ts, so both
// surfaces agree on who is where.

import { useSessionSnapshot } from "../project/useSessionSnapshot";

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export function SessionPresenceStrip() {
  const snap = useSessionSnapshot();
  if (!snap) return null;

  const peers = snap.peers;
  const active = peers.find((p) => p.selection.length > 0);

  return (
    <div
      className="absolute top-2 left-2 z-20 rounded bg-gray-900/90 border border-gray-700 px-2 py-1 text-[11px] leading-tight text-gray-200 pointer-events-none select-none"
      data-testid="session-presence"
      data-session-id={snap.id}
      data-peer-count={peers.length}
    >
      <div className="flex items-center gap-2">
        {snap.seats.map((seat) => (
          <span key={seat.accountId} className="flex items-center gap-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: seat.color }}
            />
            <span className="text-gray-300">
              {seat.accountId === snap.self.accountId ? "You" : seat.name}
            </span>
            <span className="text-gray-500 uppercase text-[9px]">
              {seat.surface === "vr" ? "VR" : "2D"}
            </span>
          </span>
        ))}
        {peers.length === 0 && (
          <span className="text-gray-500 text-[9px]">
            solo · {shortId(snap.id)}
          </span>
        )}
      </div>
      {active && (
        <div className="text-gray-400 mt-0.5">
          {active.name} · {active.selection.length} part
          {active.selection.length === 1 ? "" : "s"} in{" "}
          {active.surface === "vr" ? "VR" : "2D"}
        </div>
      )}
    </div>
  );
}

export default SessionPresenceStrip;
