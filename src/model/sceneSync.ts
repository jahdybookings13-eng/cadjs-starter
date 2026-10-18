// Scene sync: applies executor outputs to the cadjs core store, mimicking
// web-mode applyExtrusion semantics (profile element is replaced in place).
import * as THREE from "three";
import type { Brep } from "@vitekk02/cadjs";
import type { ScadgenHistory } from "./featureEngine";
import type { BodyOutput, ExecReport, ScadgenExecutor } from "./executor";
import type { ScadgenFeatureNode } from "./onshapeHistory";

const COMMITTABLE = new Set([
  "extrude",
  "fillet",
  "chamfer",
  "loft",
  "revolve",
  "sweep",
  "boolean",
  "pattern",
  "mirror",
  "insertedBody",
]);

export interface SceneSyncCore {
  postCreate?: (nodeId: string, out: BodyOutput) => void;
  createElement?: (
    brep: Brep,
    position: THREE.Vector3,
  ) => string | null | undefined;
  setElementHidden?: (nodeId: string, hidden: boolean) => void;
  updateElementBrep: (
    nodeId: string,
    brep: Brep,
    newPosition?: THREE.Vector3,
    featureUpdate?: { type: string; consumedElementId?: string },
    edgeGeometry?: THREE.BufferGeometry,
    occBrep?: string,
    faceGeometry?: THREE.BufferGeometry,
    vertexPositions?: Float32Array,
  ) => void;
}

export class ScadgenSceneSync {
  private core: SceneSyncCore | null = null;
  private history: ScadgenHistory | null = null;
  private synced = new Set<string>();
  private hiddenBySync = new Set<string>();
  private authored = new Map<string, string>();

  configure(core: SceneSyncCore, history: ScadgenHistory): void {
    if (this.history !== history) {
      this.synced.clear();
      this.hiddenBySync.clear();
      this.authored.clear();
    }
    this.core = core;
    this.history = history;
  }

  authoredIds(): string[] {
    return [...this.authored.entries()].map(([f, e]) => `${f}->${e}`);
  }

  featureForElement(nodeId: string): string | null {
    for (const [fid, id] of this.authored) if (id === nodeId) return fid;
    const nodes = this.history?.evaluatedNodes() ?? [];
    for (const n of nodes) {
      const ext = n.extensions as Record<string, unknown> | undefined;
      if (ext?.elementNodeId === nodeId) return n.featureId;
    }
    return null;
  }

  remapElementId(from: string, to: string): void {
    for (const [fid, id] of [...this.authored]) {
      if (id === from) this.authored.set(fid, to);
    }
    if (this.hiddenBySync.delete(from)) this.hiddenBySync.add(to);
  }

  forget(featureId: string): void {
    this.synced.delete(featureId);
    this.authored.delete(featureId);
    for (const key of [...this.authored.keys()])
      if (key.startsWith(`${featureId}#`)) {
        this.authored.delete(key);
        this.synced.delete(key);
      }
  }

  onRebuilt = (report: ExecReport): void => {
    if (!this.core || !this.history) return;
    const nodes = this.history.evaluatedNodes();
    const stillConsumed = new Set<string>();
    for (const node of nodes) {
      if (!COMMITTABLE.has(node.featureType)) continue;
      if (report[node.featureId]?.status !== "OK") continue;
      if (this.executor?.isDeleted(node.featureId)) {
        const gone = this.authored.get(node.featureId);
        if (gone) this.core.setElementHidden?.(gone, true);
        continue;
      }
      const reappeared = this.authored.get(node.featureId);
      if (reappeared) this.core.setElementHidden?.(reappeared, false);
      const out = this.outputOf(node.featureId);
      if (!out) continue;
      this.syncExtras(node.featureId, out);
      // A separate (multi-body) pattern must NOT consume its source element —
      // every instance is a new body with its own element.
      const multi = (out.additionalBodies?.length ?? 0) > 0;
      let targetId = multi ? undefined : this.resolveTargetElementId(node);
      let justCreated = false;
      if (!targetId) {
        const created = this.core.createElement?.(out.brep, out.position);
        if (typeof created === "string" && created) {
          targetId = created;
          justCreated = true;
          this.authored.set(node.featureId, created);
        }
      }
      if (!targetId) continue;
      if (justCreated) {
        this.core.postCreate?.(targetId, out);
        this.synced.add(node.featureId);
        if (node.featureType === "boolean") {
          for (const toolId of this.toolElementIds(node)) {
            stillConsumed.add(toolId);
            if (!this.hiddenBySync.has(toolId)) {
              this.core.setElementHidden?.(toolId, true);
              this.hiddenBySync.add(toolId);
            }
          }
        }
        continue;
      }
      this.core.updateElementBrep(
        targetId,
        out.brep,
        out.position,
        { type: node.featureType },
        out.edgeGeometry,
        out.occBrep,
        out.faceGeometry,
        out.vertexPositions,
      );
      this.synced.add(node.featureId);
      if (node.featureType === "boolean") {
        for (const toolId of this.toolElementIds(node)) {
          stillConsumed.add(toolId);
          if (!this.hiddenBySync.has(toolId)) {
            this.core.setElementHidden?.(toolId, true);
            this.hiddenBySync.add(toolId);
          }
        }
      }
    }
    for (const id of [...this.hiddenBySync]) {
      if (!stillConsumed.has(id)) {
        this.core.setElementHidden?.(id, false);
        this.hiddenBySync.delete(id);
      }
    }
  };

  toolElementIds(node: ScadgenFeatureNode): string[] {
    if (!this.history) return [];
    const list = node.parameters.find(
      (p) => p.kind === "queryList" && p.parameterId === "tools",
    );
    const queries = list && list.kind === "queryList" ? list.queries : [];
    const ids: string[] = [];
    for (const q of queries) {
      if (!q.creationFeatureId) continue;
      const srcNode = this.history.get(q.creationFeatureId);
      const ext = srcNode?.extensions as Record<string, unknown> | undefined;
      if (typeof ext?.elementNodeId === "string") ids.push(ext.elementNodeId);
    }
    return ids;
  }

  // Extra bodies from multi-body features (split-both, separate patterns)
  // each get their own element, keyed `${fid}#${k}` in the authored map.
  private syncExtras(featureId: string, out: BodyOutput): void {
    const extras = out.additionalBodies ?? [];
    extras.forEach((b, i) => {
      const key = `${featureId}#${i + 1}`;
      const target = this.executor?.isDeleted(key);
      const existing = this.authored.get(key);
      if (target && existing) {
        this.core?.setElementHidden?.(existing, true);
        this.synced.add(key);
        return;
      }
      if (target) return;
      if (existing) this.core?.setElementHidden?.(existing, false);
      let targetId = existing;
      if (!targetId) {
        const created = b.brep
          ? this.core?.createElement?.(b.brep, b.position)
          : undefined;
        if (typeof created === "string" && created) {
          targetId = created;
          this.authored.set(key, created);
          this.core?.postCreate?.(created, b);
          this.synced.add(key);
        }
        return;
      }
      this.core?.updateElementBrep(
        targetId,
        b.brep,
        b.position,
        { type: "body" },
        b.edgeGeometry,
        b.occBrep,
        b.faceGeometry,
        b.vertexPositions,
      );
      this.synced.add(key);
    });
  }

  private outputOf(featureId: string): BodyOutput | undefined {
    return this.executor?.outputs.get(featureId);
  }

  private resolveTargetElementId(node: ScadgenFeatureNode): string | undefined {
    if (!this.history) return undefined;
    const list = (id: string) =>
      node.parameters.find(
        (p) => p.kind === "queryList" && p.parameterId === id,
      );
    const q = (p: ReturnType<typeof list>) =>
      p && p.kind === "queryList" ? p.queries[0]?.creationFeatureId : undefined;
    const source =
      q(list("entities")) ?? q(list("profiles")) ?? q(list("targets"));
    if (!source) return undefined;
    const srcNode = this.history.get(source);
    const ext = srcNode?.extensions as Record<string, unknown> | undefined;
    const id = ext?.elementNodeId;
    if (typeof id === "string") return id;
    if (node.featureType === "mirror") return this.authored.get(node.featureId);
    return this.authored.get(source) ?? this.authored.get(node.featureId);
  }

  private executor: ScadgenExecutor | null = null;

  bindExecutor(executor: ScadgenExecutor): () => void {
    this.executor = executor;
    return executor.onRebuilt(this.onRebuilt);
  }
}

export const scadgenSceneSync = new ScadgenSceneSync();
