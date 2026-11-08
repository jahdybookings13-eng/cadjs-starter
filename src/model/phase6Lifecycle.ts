// Generic Phase 6 feature lifecycle and feature-tree projection.
//
// Sheet-metal, frame and surface features all use the same history semantics:
// stable ids, suppression, rollback, reorder, error rows and dependency
// reporting. Kernel rebuilds remain elsewhere; this module owns the data those
// UI rows and undo labels consume.
import {
  phase6Fail,
  phase6Ok,
  type Phase6Issue,
  type Phase6Result,
} from "./phase6";
import {
  phase6FeatureFamily,
  phase6LifecycleUndoName,
  phase6TreeFolder,
  type Phase6FeatureFamily,
  type Phase6LifecycleOp,
} from "./phase6b";

export interface Phase6FeatureRecord {
  id: string;
  featureType: string;
  label: string;
  suppressed: boolean;
  error: string | null;
  /** Earlier feature ids that must rebuild before this one. */
  dependsOn: string[];
}

export interface Phase6FeatureHistory {
  features: Phase6FeatureRecord[];
  /** Rollback marker: this feature and everything after it are rolled back. */
  rollbackId: string | null;
}

export function emptyPhase6FeatureHistory(): Phase6FeatureHistory {
  return { features: [], rollbackId: null };
}

function familyOf(record: Phase6FeatureRecord): Phase6FeatureFamily | null {
  return phase6FeatureFamily(record.featureType);
}

export function addPhase6Feature(
  history: Phase6FeatureHistory,
  input: Omit<Phase6FeatureRecord, "suppressed" | "error"> & {
    suppressed?: boolean;
    error?: string | null;
  },
): Phase6Result<Phase6FeatureHistory> {
  const id = input.id.trim();
  const label = input.label.trim();
  if (!id) return phase6Fail("feature.id", "feature id is required");
  if (!label) return phase6Fail("feature.label", "feature label is required");
  if (history.features.some((feature) => feature.id === id))
    return phase6Fail("feature.id", `duplicate feature ${id}`);
  const record: Phase6FeatureRecord = {
    id,
    featureType: input.featureType,
    label,
    suppressed: input.suppressed ?? false,
    error: input.error ?? null,
    dependsOn: [...new Set(input.dependsOn)],
  };
  if (!familyOf(record))
    return phase6Fail(
      "feature.type",
      `unknown Phase 6 feature type ${input.featureType}`,
    );
  const missing = record.dependsOn.filter(
    (dependency) =>
      !history.features.some((feature) => feature.id === dependency),
  );
  if (missing.length)
    return phase6Fail(
      "feature.dependsOn",
      `unknown dependency ${missing.join(", ")}`,
    );
  return phase6Ok({ ...history, features: [...history.features, record] });
}

export function editPhase6Feature(
  history: Phase6FeatureHistory,
  id: string,
  patch: Partial<Pick<Phase6FeatureRecord, "label" | "error" | "dependsOn">>,
): Phase6Result<Phase6FeatureHistory> {
  const index = history.features.findIndex((feature) => feature.id === id);
  if (index < 0) return phase6Fail("feature.id", `unknown feature ${id}`);
  const current = history.features[index]!;
  const next: Phase6FeatureRecord = {
    ...current,
    ...patch,
    label: patch.label === undefined ? current.label : patch.label.trim(),
    dependsOn: patch.dependsOn
      ? [...new Set(patch.dependsOn)]
      : current.dependsOn,
  };
  if (!next.label)
    return phase6Fail("feature.label", "feature label is required");
  if (next.dependsOn.includes(id))
    return phase6Fail("feature.dependsOn", "a feature cannot depend on itself");
  const missing = next.dependsOn.filter(
    (dependency) =>
      dependency !== id &&
      !history.features.some((feature) => feature.id === dependency),
  );
  if (missing.length)
    return phase6Fail(
      "feature.dependsOn",
      `unknown dependency ${missing.join(", ")}`,
    );
  const features = [...history.features];
  features[index] = next;
  return phase6Ok({ ...history, features });
}

export function suppressPhase6Feature(
  history: Phase6FeatureHistory,
  id: string,
  suppressed = true,
): Phase6Result<Phase6FeatureHistory> {
  const index = history.features.findIndex((feature) => feature.id === id);
  if (index < 0) return phase6Fail("feature.id", `unknown feature ${id}`);
  const features = [...history.features];
  features[index] = { ...features[index]!, suppressed };
  return phase6Ok({ ...history, features });
}

export function deletePhase6Feature(
  history: Phase6FeatureHistory,
  id: string,
): Phase6Result<Phase6FeatureHistory> {
  const target = history.features.find((feature) => feature.id === id);
  if (!target) return phase6Fail("feature.id", `unknown feature ${id}`);
  const dependents = history.features.filter((feature) =>
    feature.dependsOn.includes(id),
  );
  if (dependents.length)
    return phase6Fail(
      "feature.dependents",
      `${target.label} is used by ${dependents.map((feature) => feature.label).join(", ")}`,
    );
  return phase6Ok({
    ...history,
    features: history.features.filter((feature) => feature.id !== id),
    rollbackId: history.rollbackId === id ? null : history.rollbackId,
  });
}

export function reorderPhase6Feature(
  history: Phase6FeatureHistory,
  id: string,
  toIndex: number,
): Phase6Result<Phase6FeatureHistory> {
  const from = history.features.findIndex((feature) => feature.id === id);
  if (from < 0) return phase6Fail("feature.id", `unknown feature ${id}`);
  if (
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex >= history.features.length
  )
    return phase6Fail("feature.order", "target index is out of range");
  const features = [...history.features];
  const [moved] = features.splice(from, 1);
  features.splice(toIndex, 0, moved!);
  return phase6Ok({ ...history, features });
}

export function rollbackPhase6Feature(
  history: Phase6FeatureHistory,
  id: string | null,
): Phase6Result<Phase6FeatureHistory> {
  if (id !== null && !history.features.some((feature) => feature.id === id))
    return phase6Fail("feature.rollback", `unknown feature ${id}`);
  return phase6Ok({ ...history, rollbackId: id });
}

export interface Phase6FeatureRow {
  id: string;
  label: string;
  featureType: string;
  family: Phase6FeatureFamily;
  folder: string;
  status: "OK" | "ERROR" | "SUPPRESSED" | "ROLLED_BACK";
  detail: string | null;
  suppressed: boolean;
  rolledBack: boolean;
  dependents: string[];
  depth: number;
}

/** Feature rows in rebuild order, with tree folders, badges and dependents. */
export function phase6FeatureRows(
  history: Phase6FeatureHistory,
): Phase6FeatureRow[] {
  const byId = new Map(
    history.features.map((feature) => [feature.id, feature]),
  );
  const rollbackIndex =
    history.rollbackId === null
      ? -1
      : history.features.findIndex(
          (feature) => feature.id === history.rollbackId,
        );
  const depthOf = (feature: Phase6FeatureRecord): number => {
    let depth = 0;
    let cursor = feature;
    const seen = new Set<string>();
    while (cursor.dependsOn.length && depth < 32) {
      const parent = cursor.dependsOn
        .map((id) => byId.get(id))
        .find((entry): entry is Phase6FeatureRecord => entry !== undefined);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      depth += 1;
      cursor = parent;
    }
    return depth;
  };
  return history.features.map((feature, index) => {
    const family = familyOf(feature)!;
    const rolledBack = rollbackIndex >= 0 && index >= rollbackIndex;
    const dependents = history.features
      .filter((entry) => entry.dependsOn.includes(feature.id))
      .map((entry) => entry.id);
    return {
      id: feature.id,
      label: feature.label,
      featureType: feature.featureType,
      family,
      folder: phase6TreeFolder(feature.featureType) ?? "Other",
      status: rolledBack
        ? "ROLLED_BACK"
        : feature.error
          ? "ERROR"
          : feature.suppressed
            ? "SUPPRESSED"
            : "OK",
      detail: rolledBack
        ? `Rolled back at ${history.rollbackId}`
        : feature.error,
      suppressed: feature.suppressed,
      rolledBack,
      dependents,
      depth: depthOf(feature),
    };
  });
}

/** Every direct and transitive dependent of a feature, in rebuild order. */
export function phase6AffectedFeatures(
  history: Phase6FeatureHistory,
  id: string,
): string[] {
  const affected = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const feature of history.features) {
      if (feature.id === id || affected.has(feature.id)) continue;
      if (
        feature.dependsOn.some(
          (dependency) => dependency === id || affected.has(dependency),
        )
      ) {
        affected.add(feature.id);
        changed = true;
      }
    }
  }
  return history.features
    .filter((feature) => affected.has(feature.id))
    .map((feature) => feature.id);
}

export interface Phase6TreeSection {
  folder: string;
  rows: Phase6FeatureRow[];
  errorCount: number;
  suppressedCount: number;
  rolledBackCount: number;
}

/** Group feature rows into the folders the feature tree renders. */
export function phase6FeatureTreeSections(
  history: Phase6FeatureHistory,
): Phase6TreeSection[] {
  const rows = phase6FeatureRows(history);
  const sections = new Map<string, Phase6FeatureRow[]>();
  for (const row of rows) {
    const list = sections.get(row.folder) ?? [];
    list.push(row);
    sections.set(row.folder, list);
  }
  return [...sections.entries()].map(([folder, entries]) => ({
    folder,
    rows: entries,
    errorCount: entries.filter((row) => row.status === "ERROR").length,
    suppressedCount: entries.filter((row) => row.status === "SUPPRESSED")
      .length,
    rolledBackCount: entries.filter((row) => row.status === "ROLLED_BACK")
      .length,
  }));
}

export function phase6FeatureUndoName(
  history: Phase6FeatureHistory,
  op: Phase6LifecycleOp,
  id: string,
): string {
  const feature = history.features.find((entry) => entry.id === id);
  return phase6LifecycleUndoName(op, feature?.label ?? id);
}

export function phase6FeatureIssues(
  history: Phase6FeatureHistory,
  id: string,
): Phase6Issue[] {
  const feature = history.features.find((entry) => entry.id === id);
  if (!feature)
    return [{ path: "feature.id", message: `unknown feature ${id}` }];
  const issues: Phase6Issue[] = [];
  if (feature.suppressed)
    issues.push({
      path: "feature.suppressed",
      message: `${feature.label} is suppressed`,
    });
  if (feature.error)
    issues.push({ path: "feature.error", message: feature.error });
  return issues;
}
