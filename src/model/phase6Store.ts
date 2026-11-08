// Phase 6 state bridge for document save/reload.
//
// The data layer is pure; this module only owns the current in-memory Phase 6
// state so documentStore can persist it with the rest of the Part Studio.
import {
  createSheetMetalRule,
  deleteSheetMetalRule,
  duplicateSheetMetalRule,
  emptyPhase6State,
  normalizeDefaultRule,
  parsePhase6State,
  serializePhase6State,
  upsertSheetMetalBody,
  type Phase6LengthUnit,
  type Phase6State,
  type SheetMetalBodyMeta,
  type SheetMetalRule,
} from "./phase6";

let current: Phase6State = emptyPhase6State();
let undoEntries: Array<{ label: string; state: Phase6State }> = [];
let redoEntries: Array<{ label: string; state: Phase6State }> = [];

function validated(next: Phase6State): Phase6State | null {
  const parsed = parsePhase6State(serializePhase6State(next));
  return parsed.ok ? parsed.value : null;
}

export const scadgenPhase6 = {
  snapshot(): Phase6State {
    return current;
  },

  /** Restore a persisted state; malformed state falls back to the defaults. */
  restore(value: unknown): Phase6State {
    undoEntries = [];
    redoEntries = [];
    if (value === null || value === undefined) {
      current = emptyPhase6State();
      return current;
    }
    const text = typeof value === "string" ? value : JSON.stringify(value);
    const parsed = parsePhase6State(text);
    current = parsed.ok ? parsed.value : emptyPhase6State();
    return current;
  },

  reset(): Phase6State {
    current = emptyPhase6State();
    undoEntries = [];
    redoEntries = [];
    return current;
  },

  update(mutator: (state: Phase6State) => Phase6State): Phase6State {
    const next = validated(mutator(current));
    if (next) current = next;
    return current;
  },

  /** Apply a named edit and push one undo entry. */
  commit(
    label: string,
    mutator: (state: Phase6State) => Phase6State,
  ): Phase6State {
    const next = validated(mutator(current));
    if (!next) return current;
    undoEntries.push({ label, state: current });
    if (undoEntries.length > 100) undoEntries = undoEntries.slice(-100);
    redoEntries = [];
    current = next;
    return current;
  },

  undo(): { label: string; state: Phase6State } | null {
    const entry = undoEntries.pop();
    if (!entry) return null;
    redoEntries.push({ label: entry.label, state: current });
    current = entry.state;
    return { label: entry.label, state: current };
  },

  redo(): { label: string; state: Phase6State } | null {
    const entry = redoEntries.pop();
    if (!entry) return null;
    undoEntries.push({ label: entry.label, state: current });
    current = entry.state;
    return { label: entry.label, state: current };
  },

  canUndo(): boolean {
    return undoEntries.length > 0;
  },

  canRedo(): boolean {
    return redoEntries.length > 0;
  },

  undoLabel(): string | null {
    return undoEntries.at(-1)?.label ?? null;
  },

  redoLabel(): string | null {
    return redoEntries.at(-1)?.label ?? null;
  },

  setDisplayUnit(unit: Phase6LengthUnit): Phase6State {
    return this.commit("Change display unit", (state) => ({
      ...state,
      displayUnit: unit,
    }));
  },

  saveRule(rule: SheetMetalRule): Phase6State {
    const validated = createSheetMetalRule(rule);
    if (!validated.ok) return current;
    return this.commit("Save sheet-metal rule", (state) => ({
      ...state,
      rules: normalizeDefaultRule([
        ...state.rules.filter((entry) => entry.id !== rule.id),
        validated.value,
      ]),
    }));
  },

  /** Re-apply an edited rule to the bodies that use it (metadata + mass). */
  reapplyRule(ruleId: string): Phase6State {
    const rule = current.rules.find((entry) => entry.id === ruleId);
    if (!rule) return current;
    return this.commit("Reapply sheet-metal rule", (state) => ({
      ...state,
      sheetMetalBodies: state.sheetMetalBodies.map((entry) => {
        if (entry.meta.ruleId !== ruleId) return entry;
        const ratio =
          entry.meta.thicknessMM > 0
            ? rule.thicknessMM / entry.meta.thicknessMM
            : 1;
        return {
          ...entry,
          meta: {
            ...entry.meta,
            material: rule.material,
            thicknessMM: rule.thicknessMM,
            massKg:
              entry.meta.massKg === null ? null : entry.meta.massKg * ratio,
          },
        };
      }),
    }));
  },

  deleteRule(id: string): Phase6State {
    return this.commit("Delete sheet-metal rule", (state) => ({
      ...state,
      rules: normalizeDefaultRule(deleteSheetMetalRule(state.rules, id)),
    }));
  },

  duplicateRule(rule: SheetMetalRule, id?: string): Phase6State {
    const duplicated = duplicateSheetMetalRule(rule, id);
    if (!duplicated.ok) return current;
    return this.commit("Duplicate sheet-metal rule", (state) => ({
      ...state,
      rules: [...state.rules, duplicated.value],
    }));
  },

  setSheetMetalBody(bodyId: string, meta: SheetMetalBodyMeta): Phase6State {
    return this.commit("Update sheet-metal body", (state) =>
      upsertSheetMetalBody(state, bodyId, meta),
    );
  },

  /** Canonical text for a save file without mutating the live state. */
  serialize(): string {
    return serializePhase6State(current);
  },
};
