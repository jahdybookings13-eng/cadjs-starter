import { afterEach, describe, expect, it } from "vitest";
import {
  captureUndoExternalState,
  restoreUndoExternalState,
  setUndoExternalStateAdapter,
} from "@vitekk02/cadjs";
import { ScadgenHistory } from "../featureEngine";
import type { ScadgenFeatureNode } from "../onshapeHistory";

const node = (featureId: string): ScadgenFeatureNode => ({
  featureId,
  featureType: "sketch",
  name: featureId,
  namespace: "",
  parameters: [],
  subFeatures: [],
  suppressed: false,
});

afterEach(() =>
  setUndoExternalStateAdapter({ capture: () => undefined, restore: () => {} }),
);

describe("cadjs undo external state", () => {
  it("captures and restores app history through the adapter", () => {
    const history = new ScadgenHistory();
    history.add(node("A"));
    history.add(node("B"));
    const off = setUndoExternalStateAdapter({
      capture: () => history.snapshotState(),
      restore: (snapshot) =>
        history.restoreState(
          snapshot as ReturnType<typeof history.snapshotState>,
        ),
    });

    const before = captureUndoExternalState();
    history.remove("A");
    expect(history.serializeNodes().map((n) => n.featureId)).toEqual(["B"]);

    restoreUndoExternalState(before);
    expect(history.serializeNodes().map((n) => n.featureId)).toEqual([
      "A",
      "B",
    ]);
    off();
  });
});
