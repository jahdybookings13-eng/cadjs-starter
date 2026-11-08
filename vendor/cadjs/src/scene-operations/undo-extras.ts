// App-owned state can participate in cadjs undo/redo without cadjs importing
// the app. The host registers one adapter; every snapshot captures its value
// and every restore hands it back. The adapter itself decides whether a
// restore is a no-op (for example, identical feature history).
export interface UndoExternalStateAdapter {
  capture: () => unknown;
  restore: (snapshot: unknown) => void;
}

let adapter: UndoExternalStateAdapter | null = null;

export function setUndoExternalStateAdapter(
  next: UndoExternalStateAdapter,
): () => void {
  adapter = next;
  return () => {
    if (adapter === next) adapter = null;
  };
}

export function captureUndoExternalState(): unknown {
  return adapter?.capture();
}

export function restoreUndoExternalState(snapshot: unknown): void {
  if (snapshot !== undefined) adapter?.restore(snapshot);
}
