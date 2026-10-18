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

type RecomputeListener = (reason: {
  kind: "add" | "update" | "remove" | "suppress" | "rollback";
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

  setSuppressed(featureId: string, suppressed: boolean): void {
    const rec = this.records.find((r) => r.node.featureId === featureId);
    if (!rec) return;
    rec.node.suppressed = suppressed;
    rec.state.featureStatus = suppressed ? "SUPPRESSED" : "OK";
    this.emit({ kind: "suppress", featureId });
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

export const scadgenHistory = new ScadgenHistory();
