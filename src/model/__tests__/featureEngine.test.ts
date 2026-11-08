import { describe, expect, it } from "vitest";
import { ScadgenHistory, rollbackDescription } from "../featureEngine";
import type { ScadgenFeatureNode, ScadgenParameter } from "../onshapeHistory";

const node = (
  featureId: string,
  parameters: ScadgenParameter[] = [],
): ScadgenFeatureNode => ({
  featureId,
  featureType: "sketch",
  name: featureId,
  namespace: "",
  parameters,
  subFeatures: [],
  suppressed: false,
});

const ids = (h: ScadgenHistory) => h.evaluatedNodes().map((n) => n.featureId);

describe("ScadgenHistory feature tree", () => {
  it("moves a feature and emits a move recompute", () => {
    const h = new ScadgenHistory();
    for (const id of ["A", "B", "C"]) h.add(node(id));
    const reasons: string[] = [];
    h.onRecompute((r) => reasons.push(r.kind));

    expect(h.move("C", 0)).toBe(true);
    expect(ids(h)).toEqual(["C", "A", "B"]);
    expect(h.move("missing", 1)).toBe(false);
    expect(reasons).toEqual(["move"]);
  });

  it("moves features across the rollback bar without changing the prefix", () => {
    const h = new ScadgenHistory();
    for (const id of ["A", "B", "C"]) h.add(node(id));
    h.setRollbackTo(2);
    expect(ids(h)).toEqual(["A", "B"]);

    h.move("A", 2);
    expect(lets(h)).toEqual(["B"]);
    expect(h.getRollbackIndex()).toBe(1);

    h.move("C", 0);
    expect(lets(h)).toEqual(["C", "B"]);
    expect(h.getRollbackIndex()).toBe(2);
  });

  it("renames a feature and ignores blank or unchanged names", () => {
    const h = new ScadgenHistory();
    h.add(node("A"));
    const reasons: string[] = [];
    h.onRecompute((r) => reasons.push(r.kind));

    expect(h.rename("A", "  Base Sketch  ")).toBe(true);
    expect(h.get("A")?.name).toBe("Base Sketch");
    expect(h.rename("A", "   ")).toBe(false);
    expect(h.rename("A", "Base Sketch")).toBe(false);
    expect(reasons).toEqual(["rename"]);
  });

  it("describes the rollback position from history names", () => {
    const nodes = [node("A"), node("B")];
    nodes[1]!.name = "Base Extrude";

    expect(rollbackDescription(nodes, null)).toBeNull();
    expect(rollbackDescription(nodes, 0)).toBe("before the first feature");
    expect(rollbackDescription(nodes, 1)).toBe("after “A”");
    expect(rollbackDescription(nodes, 2)).toBe("after “Base Extrude”");
  });

  it("removes a feature and keeps the rollback index consistent", () => {
    const h = new ScadgenHistory();
    for (const id of ["A", "B", "C"]) h.add(node(id));
    h.setRollbackTo(3);
    const reasons: string[] = [];
    h.onRecompute((r) => reasons.push(r.kind));

    expect(h.remove("B")).toBe(true);
    expect(ids(h)).toEqual(["A", "C"]);
    expect(h.getRollbackIndex()).toBe(2);
    expect(h.remove("missing")).toBe(false);
    expect(reasons).toEqual(["remove"]);
  });

  it("persists folders on the feature node", () => {
    const h = new ScadgenHistory();
    h.add(node("A"));
    const reasons: string[] = [];
    h.onRecompute((r) => reasons.push(r.kind));

    expect(h.setFolder("A", "  Base Geometry  ")).toBe(true);
    expect(h.folderOf("A")).toBe("Base Geometry");
    expect(h.setFolder("A", "Base Geometry")).toBe(false);
    expect(h.serializeNodes()[0]?.extensions?.folder).toBe("Base Geometry");
    expect(h.setFolder("A", null)).toBe(true);
    expect(h.folderOf("A")).toBeNull();
    expect(reasons).toEqual(["update", "update"]);
  });

  it("reports features that still reference a feature", () => {
    const h = new ScadgenHistory();
    h.add(node("A"));
    h.add(
      node("B", [
        {
          kind: "queryList",
          parameterId: "entities",
          queries: [
            {
              entityType: "FACE",
              historyType: "CREATION",
              creationFeatureId: "A",
              entityTag: "face-1",
            },
          ],
        },
      ]),
    );
    h.add(node("C", [{ kind: "string", parameterId: "planeRef", value: "A" }]));
    h.add(node("D"));

    expect(h.dependentsOf("A")).toEqual([
      { id: "B", name: "B" },
      { id: "C", name: "C" },
    ]);
    expect(h.dependentsOf("D")).toEqual([]);
  });

  it("keeps renamed features unique", () => {
    const h = new ScadgenHistory();
    h.add(node("A"));
    h.add(node("B"));

    expect(h.uniqueName("A", "B")).toBe("A (2)");
    expect(h.rename("B", "A")).toBe(true);
    expect(h.get("B")?.name).toBe("A (2)");
    expect(h.rename("B", "A")).toBe(false);
    expect(h.uniqueName("  ")).toBeNull();
  });

  it("stops a reorder before a dependent feature", () => {
    const h = new ScadgenHistory();
    h.add(node("A"));
    h.add(
      node("B", [
        {
          kind: "queryList",
          parameterId: "entities",
          queries: [
            {
              entityType: "FACE",
              historyType: "CREATION",
              creationFeatureId: "A",
              entityTag: "face-1",
            },
          ],
        },
      ]),
    );
    h.add(node("C"));

    expect(h.reorderPlan("A", 2)).toEqual({
      from: 0,
      to: 0,
      adjusted: true,
    });
    expect(h.moveSafely("A", 2)).toBe(false);
    expect(h.moveSafely("C", 0)).toBe(true);
    expect(h.serializeNodes().map((n) => n.featureId)).toEqual(["C", "A", "B"]);
  });

  it("repairs a guarded reorder by carrying dependents as a block", () => {
    const h = new ScadgenHistory();
    h.add(node("A"));
    h.add(
      node("B", [
        {
          kind: "queryList",
          parameterId: "entities",
          queries: [
            {
              entityType: "FACE",
              historyType: "CREATION",
              creationFeatureId: "A",
              entityTag: "face-1",
            },
          ],
        },
      ]),
    );
    h.add(node("C"));

    expect(h.allDependentsOf("A")).toEqual([{ id: "B", name: "B" }]);
    expect(h.moveWithDependents("A", 2)).toBe(true);
    expect(h.serializeNodes().map((n) => n.featureId)).toEqual(["C", "A", "B"]);
    expect(h.moveWithDependents("A", 2)).toBe(false);

    expect(h.stepWithDependents("A", -1)).toBe(true);
    expect(h.serializeNodes().map((n) => n.featureId)).toEqual(["A", "B", "C"]);
    expect(h.stepWithDependents("A", 1)).toBe(true);
    expect(h.serializeNodes().map((n) => n.featureId)).toEqual(["C", "A", "B"]);

    // A lone feature still moves through the plain reorder path (and a no-op
    // move reports that nothing changed).
    expect(h.moveWithDependents("C", 0)).toBe(false);
    expect(h.moveWithDependents("C", 2)).toBe(true);
    expect(h.serializeNodes().map((n) => n.featureId)).toEqual(["A", "B", "C"]);
  });

  it("steps the rollback bar and clears a stale error for retry", () => {
    const h = new ScadgenHistory();
    for (const id of ["A", "B", "C"]) h.add(node(id));
    h.setRollbackTo(1);
    expect(h.stepRollback(1)).toBe(true);
    expect(h.getRollbackIndex()).toBe(2);
    expect(h.stepRollback(1)).toBe(true);
    expect(h.getRollbackIndex()).toBe(3);
    expect(h.stepRollback(1)).toBe(false);
    expect(h.stepRollback(-1)).toBe(true);
    expect(h.getRollbackIndex()).toBe(2);

    h.setState("A", { featureStatus: "ERROR", inactive: true });
    expect(h.markRetry("A")).toBe(true);
    expect(h.toListResponse().featureStates.A).toMatchObject({
      featureStatus: "UNKNOWN",
      inactive: false,
    });
    expect(h.markRetry("A")).toBe(false);
  });

  it("restores a persisted rollback index with the nodes", () => {
    const h = new ScadgenHistory();
    h.restoreNodes([node("A"), node("B")], 1);
    expect(h.getRollbackIndex()).toBe(1);
    expect(ids(h)).toEqual(["A"]);
    h.restoreNodes([node("A")], 9);
    expect(h.getRollbackIndex()).toBe(1);
  });

  it("suppresses and restores a dependency cascade", () => {
    const h = new ScadgenHistory();
    h.add(node("A"));
    h.add(
      node("B", [
        {
          kind: "queryList",
          parameterId: "entities",
          queries: [
            {
              entityType: "FACE",
              historyType: "CREATION",
              creationFeatureId: "A",
              entityTag: "face-1",
            },
          ],
        },
      ]),
    );
    h.add(node("C", [{ kind: "string", parameterId: "source", value: "B" }]));

    expect(h.setSuppressedCascade("A", true)).toEqual(["A", "B", "C"]);
    expect(ids(h)).toEqual([]);
    expect(h.setSuppressedCascade("A", false)).toEqual(["A", "B", "C"]);
    expect(ids(h)).toEqual(["A", "B", "C"]);
  });

  it("round-trips order, folders and rollback through an undo snapshot", () => {
    const h = new ScadgenHistory();
    for (const id of ["A", "B", "C"]) h.add(node(id));
    h.setFolder("B", "Base");
    h.setRollbackTo(2);
    const snapshot = h.snapshotState();

    h.remove("B");
    h.setFolder("A", "Other");
    h.setRollbackTo(null);

    expect(h.restoreState(snapshot)).toBe(true);
    expect(h.serializeNodes().map((n) => n.featureId)).toEqual(["A", "B", "C"]);
    expect(h.folderOf("B")).toBe("Base");
    expect(h.getRollbackIndex()).toBe(2);
    expect(h.restoreState(snapshot)).toBe(false);
  });

  it("suppresses and restores a feature, including after serialization", () => {
    const h = new ScadgenHistory();
    h.add(node("A"));
    h.add(node("B"));

    expect(h.setSuppressed("B", true)).toBe(true);
    expect(ids(h)).toEqual(["A"]);
    expect(h.toListResponse().featureStates.B?.featureStatus).toBe(
      "SUPPRESSED",
    );

    h.setSuppressed("B", false);
    expect(ids(h)).toEqual(["A", "B"]);
    expect(h.toListResponse().featureStates.B?.featureStatus).toBe("OK");

    h.setSuppressed("B", true);
    h.restoreNodes(h.serializeNodes());
    expect(h.toListResponse().featureStates.B?.featureStatus).toBe(
      "SUPPRESSED",
    );
    expect(ids(h)).toEqual(["A"]);
  });
});

function lets(h: ScadgenHistory): string[] {
  return h.visibleRecords().map((r) => r.node.featureId);
}
