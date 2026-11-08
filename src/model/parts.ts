// Multi-body part semantics. A Part is a named container that owns one or
// more bodies; a body keeps its own name, material, appearance and keep/hide
// state independently of the feature that authored it. Everything here is
// plain document data so the whole registry round-trips through
// documentStore with the feature nodes.
import type { ScadgenFeatureNode } from "./onshapeHistory";
import type { Phase6BodyKind, SheetMetalBodyMeta } from "./phase6";

export interface Material {
  id: string;
  label: string;
  /** kg/m³. */
  densityKgM3: number;
  color: string;
}

export const MATERIALS: readonly Material[] = [
  { id: "steel", label: "Steel", densityKgM3: 7850, color: "#9aa4ad" },
  { id: "aluminum", label: "Aluminum", densityKgM3: 2700, color: "#c9d1d9" },
  { id: "brass", label: "Brass", densityKgM3: 8500, color: "#c9a227" },
  { id: "abs", label: "ABS", densityKgM3: 1040, color: "#3b82f6" },
  { id: "pla", label: "PLA", densityKgM3: 1240, color: "#22c55e" },
];

export function materialById(id: string | null | undefined): Material | null {
  return MATERIALS.find((m) => m.id === id) ?? null;
}

export type BodyKeepState = "keep" | "removed";

export interface BodyAppearance {
  color?: string | undefined;
  opacity?: number | undefined;
}

export interface BodyRecord {
  /** Body addressing: `<featureId>` or `<featureId>#<k>` for extras. */
  id: string;
  name: string;
  partId: string | null;
  materialId: string | null;
  appearance: BodyAppearance;
  state: BodyKeepState;
  hidden: boolean;
  transparent: boolean;
  /** Phase 6 classification, populated when the body is inspected. */
  kind?: Phase6BodyKind;
  /** Phase 6 sheet-metal metadata attached to this body. */
  sheetMetal?: SheetMetalBodyMeta;
}

export interface PartRecord {
  id: string;
  name: string;
  number: string;
  description: string;
  bodyIds: string[];
}

export interface PartsSnapshot {
  parts: PartRecord[];
  bodies: BodyRecord[];
  nextId: number;
}

/**
 * Bodies that may enter an export. A removed body is excluded from the model
 * (deleteBodies marks it, the scene keeps its hidden element), so exporting
 * its stale element would ship geometry the user deleted.
 */
export function exportableBodies(bodies: BodyRecord[]): BodyRecord[] {
  return bodies.filter((body) => body.state !== "removed");
}

/** `<featureId>#2` → `<featureId>`. */
export function bodyBaseId(bodyId: string): string {
  const hash = bodyId.lastIndexOf("#");
  return hash > 0 ? bodyId.slice(0, hash) : bodyId;
}

/** Extra-body index, or null for a feature's primary body. */
export function bodyNumber(bodyId: string): number | null {
  const hash = bodyId.lastIndexOf("#");
  if (hash <= 0) return null;
  const n = Number(bodyId.slice(hash + 1));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export function defaultBodyName(featureName: string, bodyId: string): string {
  const n = bodyNumber(bodyId);
  return n === null ? featureName : `${featureName} (body ${n + 1})`;
}

function uniqueName(
  base: string,
  taken: Iterable<string>,
  except?: string,
): string {
  const used = new Set(taken);
  if (except) used.delete(except);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
}

export interface BodyVisualState {
  hidden: boolean;
  appearance: BodyAppearance;
}

export class ScadgenParts {
  private partsById = new Map<string, PartRecord>();
  private bodiesById = new Map<string, BodyRecord>();
  private listeners: Array<() => void> = [];
  private isolatedId: string | null = null;
  private seq = 0;

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  parts(): PartRecord[] {
    return [...this.partsById.values()].map((p) => ({
      ...p,
      bodyIds: [...p.bodyIds],
    }));
  }

  part(id: string | null | undefined): PartRecord | null {
    if (!id) return null;
    const p = this.partsById.get(id);
    return p ? { ...p, bodyIds: [...p.bodyIds] } : null;
  }

  addPart(input?: {
    name?: string;
    number?: string;
    description?: string;
  }): PartRecord {
    const id = `part-${++this.seq}`;
    const name = uniqueName(
      input?.name?.trim() || "Part",
      [...this.partsById.values()].map((p) => p.name),
    );
    const part: PartRecord = {
      id,
      name,
      number: input?.number ?? "",
      description: input?.description ?? "",
      bodyIds: [],
    };
    this.partsById.set(id, part);
    this.emit();
    return { ...part, bodyIds: [] };
  }

  renamePart(id: string, name: string): boolean {
    const part = this.partsById.get(id);
    const trimmed = name.trim();
    if (!part || !trimmed || part.name === trimmed) return false;
    part.name = uniqueName(
      trimmed,
      [...this.partsById.values()].map((p) => p.name),
      id,
    );
    this.emit();
    return true;
  }

  updatePart(
    id: string,
    patch: Partial<Pick<PartRecord, "name" | "number" | "description">>,
  ): boolean {
    const part = this.partsById.get(id);
    if (!part) return false;
    let changed = false;
    if (patch.name !== undefined) {
      changed = this.renamePart(id, patch.name) || changed;
    }
    if (patch.number !== undefined && patch.number !== part.number) {
      part.number = patch.number;
      changed = true;
    }
    if (
      patch.description !== undefined &&
      patch.description !== part.description
    ) {
      part.description = patch.description;
      changed = true;
    }
    if (changed && patch.name === undefined) this.emit();
    return changed;
  }

  removePart(id: string): boolean {
    if (!this.partsById.delete(id)) return false;
    for (const body of this.bodiesById.values()) {
      if (body.partId === id) body.partId = null;
    }
    this.emit();
    return true;
  }

  bodiesOfPart(partId: string): BodyRecord[] {
    return [...this.bodiesById.values()].filter((b) => b.partId === partId);
  }

  /** A composite part owns more than one body (disjoint solids). */
  isComposite(partId: string): boolean {
    return this.bodiesOfPart(partId).length > 1;
  }

  allBodies(): BodyRecord[] {
    return [...this.bodiesById.values()];
  }

  body(id: string): BodyRecord | null {
    const rec = this.bodiesById.get(id);
    return rec ? { ...rec, appearance: { ...rec.appearance } } : null;
  }

  /** Read-only projection for UI; never registers a body. */
  recordOf(id: string, fallbackName: string): BodyRecord {
    return (
      this.body(id) ?? {
        id,
        name: defaultBodyName(fallbackName, id),
        partId: null,
        materialId: null,
        appearance: {},
        state: "keep",
        hidden: false,
        transparent: false,
      }
    );
  }

  /**
   * Register a body produced by a rebuild. Existing records are never
   * overwritten, so names/materials/visibility survive a rebuild.
   */
  ensureBody(id: string, fallbackName: string): BodyRecord {
    const existing = this.bodiesById.get(id);
    if (existing) return { ...existing };
    const record: BodyRecord = {
      id,
      name: uniqueName(
        defaultBodyName(fallbackName, id),
        [...this.bodiesById.values()].map((b) => b.name),
      ),
      partId: null,
      materialId: null,
      appearance: {},
      state: "keep",
      hidden: false,
      transparent: false,
    };
    this.bodiesById.set(id, record);
    this.emit();
    return { ...record };
  }

  renameBody(bodyId: string, name: string): boolean {
    const rec = this.bodiesById.get(bodyId);
    const trimmed = name.trim();
    if (!rec || !trimmed || rec.name === trimmed) return false;
    rec.name = uniqueName(
      trimmed,
      [...this.bodiesById.values()].map((b) => b.name),
      bodyId,
    );
    this.emit();
    return true;
  }

  assignBody(bodyId: string, partId: string | null): boolean {
    const rec = this.bodiesById.get(bodyId);
    if (!rec) return false;
    if (partId && !this.partsById.has(partId)) return false;
    if (rec.partId === partId) return false;
    if (rec.partId) {
      const previous = this.partsById.get(rec.partId);
      if (previous)
        previous.bodyIds = previous.bodyIds.filter((b) => b !== bodyId);
    }
    rec.partId = partId;
    if (partId) {
      const part = this.partsById.get(partId);
      if (part && !part.bodyIds.includes(bodyId)) part.bodyIds.push(bodyId);
    }
    this.emit();
    return true;
  }

  assignBodies(bodyIds: string[], partId: string | null): number {
    let changed = 0;
    for (const id of bodyIds) if (this.assignBody(id, partId)) changed += 1;
    return changed;
  }

  setMaterial(bodyId: string, materialId: string | null): boolean {
    const rec = this.bodiesById.get(bodyId);
    if (!rec) return false;
    if (materialId !== null && !materialById(materialId)) return false;
    if (rec.materialId === materialId) return false;
    rec.materialId = materialId;
    this.emit();
    return true;
  }

  setBodyKind(bodyId: string, kind: Phase6BodyKind): boolean {
    const rec = this.bodiesById.get(bodyId);
    if (!rec || rec.kind === kind) return false;
    rec.kind = kind;
    this.emit();
    return true;
  }

  setSheetMetal(bodyId: string, meta: SheetMetalBodyMeta | null): boolean {
    const rec = this.bodiesById.get(bodyId);
    if (!rec) return false;
    const before = rec.sheetMetal ? JSON.stringify(rec.sheetMetal) : "";
    const after = meta ? JSON.stringify(meta) : "";
    if (before === after) return false;
    if (meta) rec.sheetMetal = { ...meta };
    else delete rec.sheetMetal;
    this.emit();
    return true;
  }

  setAppearance(bodyId: string, appearance: BodyAppearance): boolean {
    const rec = this.bodiesById.get(bodyId);
    if (!rec) return false;
    const next: BodyAppearance = { ...rec.appearance, ...appearance };
    const same =
      next.color === rec.appearance.color &&
      next.opacity === rec.appearance.opacity;
    if (same) return false;
    rec.appearance = next;
    this.emit();
    return true;
  }

  setHidden(bodyId: string, hidden: boolean): boolean {
    const rec = this.bodiesById.get(bodyId);
    if (!rec || rec.hidden === hidden) return false;
    rec.hidden = hidden;
    if (!hidden && this.isolatedId === bodyId) this.isolatedId = null;
    this.emit();
    return true;
  }

  setTransparent(bodyId: string, transparent: boolean): boolean {
    const rec = this.bodiesById.get(bodyId);
    if (!rec || rec.transparent === transparent) return false;
    rec.transparent = transparent;
    // Turning transparency off must restore full opacity, otherwise the last
    // transparent opacity would stay on the live material.
    if (!transparent) rec.appearance.opacity = 1;
    this.emit();
    return true;
  }

  setRemoved(bodyId: string, removed: boolean): boolean {
    const rec = this.bodiesById.get(bodyId);
    if (!rec) return false;
    const next: BodyKeepState = removed ? "removed" : "keep";
    if (rec.state === next) return false;
    rec.state = next;
    this.emit();
    return true;
  }

  isolate(bodyId: string | null): boolean {
    if (bodyId && !this.bodiesById.has(bodyId)) return false;
    if (this.isolatedId === bodyId) return false;
    this.isolatedId = bodyId;
    this.emit();
    return true;
  }

  isolated(): string | null {
    return this.isolatedId;
  }

  isHidden(bodyId: string): boolean {
    const rec = this.bodiesById.get(bodyId);
    if (!rec) return false;
    return (
      rec.hidden ||
      rec.state === "removed" ||
      (this.isolatedId !== null && this.isolatedId !== bodyId)
    );
  }

  materialOf(bodyId: string): Material | null {
    return materialById(this.bodiesById.get(bodyId)?.materialId);
  }

  appearanceFor(bodyId: string): BodyAppearance {
    const rec = this.bodiesById.get(bodyId);
    if (!rec) return {};
    const material = materialById(rec.materialId);
    const color = rec.appearance.color ?? material?.color;
    const opacity = rec.transparent
      ? Math.min(rec.appearance.opacity ?? 0.35, 0.35)
      : rec.appearance.opacity;
    return {
      ...(color ? { color } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
    };
  }

  visualState(bodyId: string): BodyVisualState {
    return {
      hidden: this.isHidden(bodyId),
      appearance: this.appearanceFor(bodyId),
    };
  }

  massKg(bodyId: string, volumeMM3: number | null): number | null {
    if (volumeMM3 === null) return null;
    const material = this.materialOf(bodyId);
    if (!material) return null;
    return volumeMM3 * 1e-9 * material.densityKgM3;
  }

  serialize(): PartsSnapshot {
    return {
      parts: this.parts(),
      bodies: this.allBodies(),
      nextId: this.seq,
    };
  }

  restore(snapshot: PartsSnapshot | undefined | null): void {
    this.partsById.clear();
    this.bodiesById.clear();
    this.isolatedId = null;
    this.seq = 0;
    if (!snapshot) {
      this.emit();
      return;
    }
    for (const part of snapshot.parts ?? []) {
      if (!part || typeof part.id !== "string") continue;
      this.partsById.set(part.id, {
        id: part.id,
        name: typeof part.name === "string" ? part.name : part.id,
        number: typeof part.number === "string" ? part.number : "",
        description:
          typeof part.description === "string" ? part.description : "",
        bodyIds: Array.isArray(part.bodyIds) ? [...part.bodyIds] : [],
      });
    }
    for (const body of snapshot.bodies ?? []) {
      if (!body || typeof body.id !== "string") continue;
      this.bodiesById.set(body.id, {
        id: body.id,
        name:
          typeof body.name === "string" && body.name.trim()
            ? body.name
            : body.id,
        partId: typeof body.partId === "string" ? body.partId : null,
        materialId:
          typeof body.materialId === "string" && materialById(body.materialId)
            ? body.materialId
            : null,
        appearance:
          body.appearance && typeof body.appearance === "object"
            ? { ...body.appearance }
            : {},
        state: body.state === "removed" ? "removed" : "keep",
        hidden: Boolean(body.hidden),
        transparent: Boolean(body.transparent),
        ...(body.kind ? { kind: body.kind } : {}),
        ...(body.sheetMetal && typeof body.sheetMetal === "object"
          ? { sheetMetal: { ...body.sheetMetal } }
          : {}),
      });
    }
    this.seq =
      Number.isFinite(snapshot.nextId) && snapshot.nextId > 0
        ? Math.floor(snapshot.nextId)
        : 0;
    this.emit();
  }

  reset(): void {
    this.restore(null);
  }
}

export const scadgenParts = new ScadgenParts();

/**
 * Feature that consumed this body as a tool/target (boolean, extrude merge,
 * delete bodies). Provenance is read from the feature parameters, not stored
 * separately, so it stays correct after a reorder or undo.
 */
export function consumedByFeature(
  nodes: ScadgenFeatureNode[],
  bodyId: string,
): { id: string; name: string; featureType: string } | null {
  const owner = bodyBaseId(bodyId);
  for (const node of nodes) {
    if (node.featureId === owner) continue;
    for (const param of node.parameters) {
      let hit = false;
      if (param.kind === "queryList") {
        hit = param.queries.some(
          (q) =>
            q.creationFeatureId === owner || q.creationFeatureId === bodyId,
        );
      } else if (param.kind === "string") {
        hit =
          param.value === owner ||
          param.value === bodyId ||
          param.value.split(/[,\s\]"]+/).includes(owner);
      }
      if (hit) {
        return {
          id: node.featureId,
          name: node.name,
          featureType: node.featureType,
        };
      }
    }
  }
  return null;
}
