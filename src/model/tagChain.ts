// Persistent topology naming: chains prev→next face-tag matches across
// rebuilds so provenance queries written against OLD tags keep resolving to
// the same physical face after geometry moves. Unmatched (ambiguous or gone)
// tags are dropped, never guessed — a failed resolve means "re-select", same
// as Onshape dropping a broken reference.

export class TagChain {
  private map = new Map<string, string>();

  // Called once per rebuild of a feature with the fresh prev→next matches.
  apply(matches: Map<string, string>): void {
    if (this.map.size === 0) {
      for (const [o, n] of matches) this.map.set(o, n);
      return;
    }
    const next = new Map<string, string>();
    for (const [oldTag, curTag] of this.map) {
      const landed = matches.get(curTag);
      if (landed) next.set(oldTag, landed);
      // else: face vanished or ambiguous this rebuild → dropped (unknown,
      // never guessed — stale entries would mis-point selection)
    }
    // Fresh chain heads from this rebuild's matches (identities are
    // no-information: exact lookups already cover them)
    for (const [o, n] of matches) if (o !== n && !next.has(o)) next.set(o, n);
    this.map = next;
  }

  get(oldTag: string): string | null {
    return this.map.get(oldTag) ?? null;
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map);
  }

  clear(): void {
    this.map.clear();
  }
}
