// scadgen feature-tree engine — Onshape semantics ported from captured wire
// evidence (~/cadjs/docs/ONSHAPE_MAP.md §5; ONSHAPE_BOILERPLATE.md §1).
import {
  setParameter,
  type ScadgenFeatureNode,
  type ScadgenParameter,
} from "./onshapeHistory";

export type FeatureStatus = "OK" | "SUPPRESSED" | "ERROR" | "UNKNOWN";

export interface FeatureState {
  featureStatus: FeatureStatus;
  inactive: boolean;
}

export interface FeatureRecord {
  node: ScadgenFeatureNode;
  state: FeatureState;
}

export interface FeatureListResponse {
  btType: "SCFeatureListResponse-1";
  isComplete: true;
  serializationVersion: string;
  rollbackIndex: number | null;
  features: ScadgenFeatureNode[];
  featureStates: Record<string, FeatureState>;
}

export interface FeatureHistorySnapshot {
  nodes: ScadgenFeatureNode[];
  rollbackIndex: number | null;
}

export interface FeatureReference {
  id: string;
  name: string;
}

const FOLDER_KEY = "folder";

export function featureReferences(
  node: ScadgenFeatureNode,
  featureId: string,
): boolean {
  for (const param of node.parameters) {
    if (
      param.kind === "queryList" &&
      param.queries.some((q) => q.creationFeatureId === featureId)
    )
      return true;
    if (param.kind === "string" && param.value === featureId) return true;
  }
  return false;
}

function referencesFeature(
  node: ScadgenFeatureNode,
  featureId: string,
): boolean {
  return featureReferences(node, featureId);
}

type RecomputeListener = (reason: {
  kind:
    | "add"
    | "update"
    | "remove"
    | "suppress"
    | "rollback"
    | "move"
    | "rename";
  featureId?: string;
}) => void;

export class ScadgenHistory {
  private records: FeatureRecord[] = [];
  private rollbackIndex: number | null = null;
  private listeners: RecomputeListener[] = [];

  onRecompute(fn: RecomputeListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(reason: Parameters<RecomputeListener>[0]): void {
    for (const l of this.listeners) l(reason);
  }

  add(node: ScadgenFeatureNode): void {
    this.records.push({
      node,
      state: { featureStatus: "OK", inactive: false },
    });
    this.emit({ kind: "add", featureId: node.featureId });
  }

  remove(featureId: string): boolean {
    const i = this.records.findIndex((r) => r.node.featureId === featureId);
    if (i === -1) return false;
    this.records.splice(i, 1);
    if (this.rollbackIndex !== null && this.rollbackIndex > i) {
      this.rollbackIndex -= 1;
    }
    this.emit({ kind: "remove", featureId });
    return true;
  }

  setSuppressed(featureId: string, suppressed: boolean): boolean {
    const rec = this.records.find((r) => r.node.featureId === featureId);
    if (!rec) return false;
    rec.node.suppressed = suppressed;
    rec.state.featureStatus = suppressed ? "SUPPRESSED" : "OK";
    this.emit({ kind: "suppress", featureId });
    return true;
  }

  rename(featureId: string, name: string): boolean {
    const rec = this.records.find((r) => r.node.featureId === featureId);
    const unique = this.uniqueName(name, featureId);
    if (!rec || !unique || rec.node.name === unique) return false;
    rec.node.name = unique;
    this.emit({ kind: "rename", featureId });
    return true;
  }

  /** Collision-free display name, preserving the requested base. */
  uniqueName(name: string, exceptFeatureId?: string): string | null {
    const base = name.trim();
    if (!base) return null;
    const taken = new Set(
      this.records
        .filter((r) => r.node.featureId !== exceptFeatureId)
        .map((r) => r.node.name),
    );
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  /**
   * Folder is persisted on the feature node, so it survives save/reload and
   * history restore. `null` removes the feature from its folder.
   */
  setFolder(featureId: string, folder: string | null): boolean {
    const rec = this.records.find((r) => r.node.featureId === featureId);
    if (!rec) return false;
    const next = folder?.trim() || null;
    if (this.folderOf(featureId) === next) return false;
    const extensions = { ...(rec.node.extensions ?? {}) };
    if (next) extensions[FOLDER_KEY] = next;
    else delete extensions[FOLDER_KEY];
    rec.node.extensions = extensions;
    this.emit({ kind: "update", featureId });
    return true;
  }

  folderOf(featureId: string): string | null {
    const rec = this.records.find((r) => r.node.featureId === featureId);
    const value = rec?.node.extensions?.[FOLDER_KEY];
    return typeof value === "string" && value.trim() ? value : null;
  }

  /** Features whose parameters still point at `featureId`. */
  dependentsOf(featureId: string): FeatureReference[] {
    return this.records
      .filter(
        (r) =>
          r.node.featureId !== featureId &&
          referencesFeature(r.node, featureId),
      )
      .map((r) => ({ id: r.node.featureId, name: r.node.name }));
  }

  /** Direct + transitive dependents, in build order. */
  allDependentsOf(featureId: string): FeatureReference[] {
    const found = new Map<string, FeatureReference>();
    const queue = [featureId];
    const seen = new Set([featureId]);
    while (queue.length) {
      const current = queue.shift()!;
      for (const dep of this.dependentsOf(current)) {
        if (seen.has(dep.id)) continue;
        seen.add(dep.id);
        found.set(dep.id, dep);
        queue.push(dep.id);
      }
    }
    return this.records
      .filter((r) => found.has(r.node.featureId))
      .map((r) => found.get(r.node.featureId)!);
  }

  /**
   * Safe reorder target. A moved feature may never cross a feature that still
   * references it; the returned target stops just before that dependent.
   */
  reorderPlan(
    featureId: string,
    toIndex: number,
  ): { from: number; to: number; adjusted: boolean } {
    const from = this.indexOf(featureId);
    if (from < 0) return { from, to: from, adjusted: false };
    const requested = Math.max(
      0,
      Math.min(Math.round(toIndex), this.records.length - 1),
    );
    const dependentIndices = this.allDependentsOf(featureId)
      .map((d) => this.indexOf(d.id))
      .filter((i) => i >= 0);
    let to = requested;
    if (requested > from) {
      const next = Math.min(...dependentIndices.filter((i) => i > from));
      if (Number.isFinite(next) && requested >= next) to = next - 1;
    } else if (requested < from) {
      const previous = Math.max(
        -1,
        ...dependentIndices.filter((i) => i < from),
      );
      if (previous >= 0 && requested > previous) to = previous;
    }
    to = Math.max(0, Math.min(to, this.records.length - 1));
    return { from, to, adjusted: to !== requested };
  }

  /** Reorder without crossing a dependent; returns false when already safe. */
  moveSafely(featureId: string, toIndex: number): boolean {
    const plan = this.reorderPlan(featureId, toIndex);
    if (plan.from < 0 || plan.to === plan.from) return false;
    return this.move(featureId, plan.to);
  }

  /**
   * Reorder repair: carry the feature AND every transitive dependent as one
   * block, so a requested move that the guard would clamp can still happen.
   * Feature ids are untouched, which is why downstream references stay valid;
   * only the build order of the block changes. `toIndex` is the final index of
   * the moved feature in the resulting list.
   */
  moveWithDependents(featureId: string, toIndex: number): boolean {
    const from = this.indexOf(featureId);
    if (from < 0) return false;
    const blockIds = new Set([
      featureId,
      ...this.allDependentsOf(featureId).map((d) => d.id),
    ]);
    const block = this.records.filter((r) => blockIds.has(r.node.featureId));
    if (block.length <= 1) return this.move(featureId, toIndex);
    const rest = this.records.filter((r) => !blockIds.has(r.node.featureId));
    const target = Math.max(0, Math.min(Math.round(toIndex), rest.length));
    const order = [...rest.slice(0, target), ...block, ...rest.slice(target)];
    if (order.every((rec, i) => rec === this.records[i])) return false;

    if (this.rollbackIndex !== null) {
      const limit = this.rollbackIndex;
      const visibleBefore = new Map(
        this.records.map((r, i) => [r.node.featureId, i < limit]),
      );
      const blockVisible = target < limit;
      let visible = 0;
      for (const rec of order) {
        const isVisible = blockIds.has(rec.node.featureId)
          ? blockVisible
          : (visibleBefore.get(rec.node.featureId) ?? true);
        if (!isVisible) break;
        visible += 1;
      }
      this.rollbackIndex = visible;
    }

    this.records = order;
    this.emit({ kind: "move", featureId });
    return true;
  }

  /** Move a feature and its dependents one step up/down as a block. */
  stepWithDependents(featureId: string, direction: -1 | 1): boolean {
    const from = this.indexOf(featureId);
    if (from < 0) return false;
    return this.moveWithDependents(featureId, from + direction);
  }

  /** Step the rollback bar one feature forward (1) or back (-1). */
  stepRollback(delta: -1 | 1): boolean {
    if (this.rollbackIndex === null) return false;
    const next = this.rollbackIndex + delta;
    if (next < 0 || next > this.records.length) return false;
    this.rollbackIndex = next;
    this.emit({ kind: "rollback" });
    return true;
  }

  /** Clear a stale ERROR state before a retry rebuild. */
  markRetry(featureId: string): boolean {
    const rec = this.records.find((r) => r.node.featureId === featureId);
    if (!rec || rec.state.featureStatus !== "ERROR") return false;
    rec.state.featureStatus = "UNKNOWN";
    rec.state.inactive = false;
    return true;
  }

  /**
   * Suppress a feature and every transitive dependent in one reversible
   * operation. Dependents carry `suppressedBy` so a later unsuppress only
   * restores the cascade it created, never a user-suppressed feature.
   */
  setSuppressedCascade(featureId: string, suppressed: boolean): string[] {
    const target = this.records.find((r) => r.node.featureId === featureId);
    if (!target) return [];
    const affected = suppressed
      ? [
          target,
          ...this.allDependentsOf(featureId).map((d) =>
            this.records.find((r) => r.node.featureId === d.id),
          ),
        ].filter((r): r is FeatureRecord => !!r)
      : this.records.filter((r) => {
          const ext = r.node.extensions as
            | { suppressedBy?: unknown }
            | undefined;
          return (
            r.node.featureId === featureId || ext?.suppressedBy === featureId
          );
        });
    const changed: string[] = [];
    for (const rec of affected) {
      if (Boolean(rec.node.suppressed) === suppressed) continue;
      rec.node.suppressed = suppressed;
      rec.state.featureStatus = suppressed ? "SUPPRESSED" : "OK";
      const extensions = { ...(rec.node.extensions ?? {}) };
      if (suppressed && rec.node.featureId !== featureId) {
        extensions.suppressedBy = featureId;
      } else {
        delete extensions.suppressedBy;
      }
      if (Object.keys(extensions).length) rec.node.extensions = extensions;
      else delete rec.node.extensions;
      changed.push(rec.node.featureId);
    }
    if (changed.length) this.emit({ kind: "suppress", featureId });
    return changed;
  }

  move(featureId: string, toIndex: number): boolean {
    const from = this.records.findIndex((r) => r.node.featureId === featureId);
    if (from === -1) return false;
    const to = Math.max(
      0,
      Math.min(Math.round(toIndex), this.records.length - 1),
    );
    if (to === from) return false;

    // Moving a feature across the rollback bar changes how many records are
    // visible: moving out hides it, moving in includes it.
    if (this.rollbackIndex !== null) {
      if (from < this.rollbackIndex && to >= this.rollbackIndex) {
        this.rollbackIndex -= 1;
      } else if (from >= this.rollbackIndex && to < this.rollbackIndex) {
        this.rollbackIndex += 1;
      }
    }

    const [rec] = this.records.splice(from, 1);
    if (!rec) return false;
    this.records.splice(to, 0, rec);
    this.emit({ kind: "move", featureId });
    return true;
  }

  setState(featureId: string, patch: Partial<FeatureState>): void {
    const rec = this.records.find((r) => r.node.featureId === featureId);
    if (!rec) return;
    Object.assign(rec.state, patch);
  }

  touch(featureId: string): void {
    this.emit({ kind: "update", featureId });
  }

  setRollbackTo(index: number | null): void {
    this.rollbackIndex =
      index === null ? null : Math.max(0, Math.min(index, this.records.length));
    this.emit({ kind: "rollback" });
  }

  getRollbackIndex(): number | null {
    return this.rollbackIndex;
  }

  indexOf(featureId: string): number {
    return this.records.findIndex((r) => r.node.featureId === featureId);
  }

  visibleRecords(): FeatureRecord[] {
    const upto =
      this.rollbackIndex === null
        ? this.records
        : this.records.slice(0, this.rollbackIndex);
    return upto;
  }

  evaluatedNodes(): ScadgenFeatureNode[] {
    return this.visibleRecords()
      .filter((r) => !r.node.suppressed)
      .map((r) => r.node);
  }

  setSnapshot(featureId: string, sketch: Record<string, unknown>): void {
    const rec = this.records.find((r) => r.node.featureId === featureId);
    if (!rec) return;
    rec.node.extensions = { ...(rec.node.extensions ?? {}), sketch };
    this.emit({ kind: "update", featureId });
  }

  updateParameter(featureId: string, param: ScadgenParameter): void {
    const rec = this.records.find((r) => r.node.featureId === featureId);
    if (!rec) return;
    setParameter(rec.node.parameters, param);
    this.emit({ kind: "update", featureId });
  }

  get(featureId: string): ScadgenFeatureNode | null {
    return (
      this.records.find((r) => r.node.featureId === featureId)?.node ?? null
    );
  }

  serializeNodes(): ScadgenFeatureNode[] {
    return JSON.parse(
      JSON.stringify(this.records.map((r) => r.node)),
    ) as ScadgenFeatureNode[];
  }

  snapshotState(): FeatureHistorySnapshot {
    return {
      nodes: this.serializeNodes(),
      rollbackIndex: this.rollbackIndex,
    };
  }

  /** Restore an undo snapshot. Returns false when it is already current. */
  restoreState(snapshot: FeatureHistorySnapshot): boolean {
    if (JSON.stringify(this.snapshotState()) === JSON.stringify(snapshot))
      return false;
    this.records = snapshot.nodes.map((node) => ({
      node: JSON.parse(JSON.stringify(node)) as ScadgenFeatureNode,
      state: {
        featureStatus: node.suppressed ? "SUPPRESSED" : "OK",
        inactive: false,
      },
    }));
    this.rollbackIndex =
      snapshot.rollbackIndex === null
        ? null
        : Math.max(0, Math.min(snapshot.rollbackIndex, this.records.length));
    this.emit({ kind: "add", featureId: "*" });
    return true;
  }

  restoreNodes(
    nodes: ScadgenFeatureNode[],
    rollbackIndex: number | null = null,
  ): void {
    this.records.length = 0;
    this.rollbackIndex =
      rollbackIndex === null
        ? null
        : Math.max(0, Math.min(rollbackIndex, nodes.length));
    for (const n of nodes)
      this.records.push({
        node: n,
        state: {
          featureStatus: n.suppressed ? "SUPPRESSED" : "OK",
          inactive: false,
        },
      });
    this.emit({ kind: "add", featureId: "*" });
  }

  toListResponse(): FeatureListResponse {
    const states: Record<string, FeatureState> = {};
    for (const r of this.records) states[r.node.featureId] = { ...r.state };
    return {
      btType: "SCFeatureListResponse-1",
      isComplete: true,
      serializationVersion: "scadgen-0.1",
      rollbackIndex: this.rollbackIndex,
      features: this.visibleRecords().map((r) => r.node),
      featureStates: states,
    };
  }

  size(): number {
    return this.records.length;
  }

  clear(): void {
    this.records = [];
    this.rollbackIndex = null;
  }
}

export function rollbackDescription(
  nodes: ScadgenFeatureNode[],
  rollbackIndex: number | null,
): string | null {
  if (rollbackIndex === null) return null;
  if (rollbackIndex <= 0) return "before the first feature";
  const name = nodes[rollbackIndex - 1]?.name?.trim();
  return `after “${name || "feature"}”`;
}

export const scadgenHistory = new ScadgenHistory();
