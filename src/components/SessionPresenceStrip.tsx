import { useSessionSnapshot } from "../project/useSessionSnapshot";

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/**
 * A compact collaborator presence pill for the graphics area. Solo sessions
 * collapse to a single avatar dot so the viewport stays clean; the full
 * session/peer detail remains available in the title and data attributes.
 */
export function SessionPresenceStrip() {
  const snap = useSessionSnapshot();
  if (!snap) return null;

  const peers = snap.peers;
  if (peers.length === 0) return null;
  const active = peers.find((p) => p.selection.length > 0);
  const self = snap.seats.find(
    (seat) => seat.accountId === snap.self.accountId,
  );

  return (
    <div
      className="pointer-events-none absolute left-2 top-2 z-20 flex select-none items-center gap-1.5 rounded-full border border-[var(--cad-border-strong)] bg-[var(--cad-chrome)]/90 px-2 py-1 text-[10px] leading-none text-[var(--cad-text)] shadow-sm backdrop-blur-sm"
      data-testid="session-presence"
      data-session-id={snap.id}
      data-peer-count={peers.length}
      title={`Session ${shortId(snap.id)} · ${peers.length} peer${
        peers.length === 1 ? "" : "s"
      }`}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: self?.color ?? "#4b9fff" }}
      />
      <span className="font-medium">
        {snap.self.accountId === self?.accountId ? "You" : snap.self.accountId}
      </span>
      <span className="text-[var(--cad-text-faint)]">2D</span>
      {peers.length > 0 && (
        <span className="rounded-full bg-[var(--cad-chrome-hover)] px-1.5 py-0.5 text-[9px] text-[var(--cad-text-muted)]">
          +{peers.length}
        </span>
      )}
      {active && (
        <span className="text-[var(--cad-text-faint)]">
          {active.name} · {active.selection.length}
        </span>
      )}
    </div>
  );
}

export default SessionPresenceStrip;
