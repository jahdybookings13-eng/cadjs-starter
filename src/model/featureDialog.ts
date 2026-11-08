// Feature dialog model — the draft/edit lifecycle shared by every desktop
// feature dialog. Pure data; no DOM, no history, no rebuilds. Callers preview
// by committing returned parameters to ScadgenHistory and restore their own
// baseline on cancel.
//
// open  -> draft mirrors the feature's current panel rows
// edit  -> one row changes, validated through the panel commit bridge
// reset -> draft returns to the rows' current values
// close -> dialog dismissed; caller decides whether to keep the edits
//
// source: paramPanel.ts (row projection + commit bridge).
import {
  panelEditToParameter,
  paramPanelForFeature,
  type PanelRow,
  type ParamPanel,
} from "./paramPanel";
import type { FeatureReference } from "./featureEngine";
import type { ScadgenFeatureNode, ScadgenParameter } from "./onshapeHistory";

export type FeatureDialogPhase = "closed" | "editing";

export interface FeatureDialogState {
  phase: FeatureDialogPhase;
  featureId: string | null;
  featureType: string | null;
  label: string;
  panel: ParamPanel | null;
  /** Working values keyed by parameterId; never mutated in place. */
  draft: Record<string, unknown>;
  /** Last validation problem, cleared by the next accepted edit. */
  error: string | null;
  /** Features that rebuild from this one; edits ripple into them. */
  dependents: FeatureReference[];
}

export const CLOSED_FEATURE_DIALOG: FeatureDialogState = {
  phase: "closed",
  featureId: null,
  featureType: null,
  label: "",
  panel: null,
  draft: {},
  error: null,
  dependents: [],
};

function draftOf(panel: ParamPanel): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const row of panel.rows) draft[row.parameterId] = row.value;
  return draft;
}

function rowOf(
  state: FeatureDialogState,
  parameterId: string,
): PanelRow | undefined {
  return state.panel?.rows.find((r) => r.parameterId === parameterId);
}

/**
 * Commit a draft value. Quantities carry their units in the expression: a bare
 * "0.06" evaluates to a dimensionless number, which the kernel rejects where a
 * length is required.
 */
function commitParameter(
  row: PanelRow,
  value: unknown,
): ScadgenParameter | null {
  if (row.kind !== "quantity") return panelEditToParameter(row, value);
  const expression = row.units
    ? `${String(value)} ${row.units}`
    : String(value);
  return panelEditToParameter(row, value, expression);
}

/**
 * Open the dialog for one feature. Returns null when the feature is missing or
 * its type is unknown — there is nothing meaningful to edit in either case.
 */
export function openFeatureDialog(
  nodes: ScadgenFeatureNode[],
  featureId: string,
  dependents: FeatureReference[] = [],
): FeatureDialogState | null {
  const panel = paramPanelForFeature(nodes, featureId);
  if (!panel || panel.unknownType) return null;
  return {
    phase: "editing",
    featureId: panel.featureId,
    featureType: panel.featureType,
    label: panel.label,
    panel,
    draft: draftOf(panel),
    error: null,
    dependents,
  };
}

/**
 * Change one row. Unwired params are rejected with a reason instead of being
 * accepted into the draft, so the dialog never promises an edit the kernel
 * will ignore.
 */
export function editFeatureDialog(
  state: FeatureDialogState,
  parameterId: string,
  value: unknown,
): FeatureDialogState {
  const row = rowOf(state, parameterId);
  if (!row) return state;
  if (row.support?.status === "unwired") {
    return {
      ...state,
      error: `${row.label}: ${row.support.reason ?? "not wired to the kernel"}`,
    };
  }
  if (!commitParameter(row, value)) {
    return { ...state, error: `${row.label}: value is not editable` };
  }
  return {
    ...state,
    draft: { ...state.draft, [parameterId]: value },
    error: null,
  };
}

function sameParameter(
  a: ScadgenParameter | null,
  b: ScadgenParameter | null,
): boolean {
  if (!a || !b) return false;
  if (a.kind === "quantity" && b.kind === "quantity") {
    return a.value === b.value;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when the draft value differs from the feature's current value. */
export function isRowDirty(row: PanelRow, value: unknown): boolean {
  const before = commitParameter(row, row.value);
  const after = commitParameter(row, value);
  // Query lists and matrices are selections rather than committable scalar
  // parameters. Compare them directly so an untouched dialog is not dirty.
  if (!before || !after) {
    return JSON.stringify(row.value) !== JSON.stringify(value);
  }
  return !sameParameter(before, after);
}

export function featureDialogDirtyRows(state: FeatureDialogState): PanelRow[] {
  if (!state.panel) return [];
  return state.panel.rows.filter((row) =>
    isRowDirty(row, state.draft[row.parameterId]),
  );
}

export function isFeatureDialogDirty(state: FeatureDialogState): boolean {
  return featureDialogDirtyRows(state).length > 0;
}

/** Kernel parameters for every dirty row, in panel order. */
export function featureDialogParameters(
  state: FeatureDialogState,
): ScadgenParameter[] {
  const params: ScadgenParameter[] = [];
  for (const row of featureDialogDirtyRows(state)) {
    const param = commitParameter(row, state.draft[row.parameterId]);
    if (param) params.push(param);
  }
  return params;
}

/** The parameter a single row edit would commit, or null when unchanged. */
export function draftParameterFor(
  state: FeatureDialogState,
  parameterId: string,
): ScadgenParameter | null {
  const row = rowOf(state, parameterId);
  if (!row) return null;
  return commitParameter(row, state.draft[parameterId]);
}

/** Discard draft edits; the caller also restores its preview baseline. */
export function resetFeatureDialog(
  state: FeatureDialogState,
): FeatureDialogState {
  if (!state.panel) return CLOSED_FEATURE_DIALOG;
  return { ...state, draft: draftOf(state.panel), error: null };
}

export function closeFeatureDialog(): FeatureDialogState {
  return CLOSED_FEATURE_DIALOG;
}
