import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { Brep } from "@vitekk02/cadjs";
import { ScadgenHistory } from "../featureEngine";
import { scadgenExecutor, type BodyOutput } from "../executor";
import {
  buildBooleanNode,
  buildExtrudeNode,
  buildLoftNode,
  buildRevolveNode,
  buildSketchNode,
  buildSweepNode,
  provenanceForFeature,
} from "../onshapeHistory";
import { scadgenSceneSync, type ElementAppearance } from "../sceneSync";
import { buildShape } from "../primitiveLibrary";

describe("sceneSync boolean consumption", () => {
  const calls: Array<[string, boolean]> = [];
  const undoFlags: Array<boolean | undefined> = [];
  const core = {
    updateElementBrep: (id: string, ...rest: unknown[]) => {
      calls.push(["update:" + id, true]);
      undoFlags.push(rest[7] as boolean | undefined);
    },
    setElementHidden: (id: string, hidden: boolean) => calls.push([id, hidden]),
  };
  const plane = {
    type: "XY" as const,
    origin: [0, 0, 0],
    normal: [0, 0, 1],
    xAxis: [1, 0, 0],
    yAxis: [0, 1, 0],
  };
  let h: ScadgenHistory;

  const mk = (fid: string) => {
    const n = buildSketchNode(fid, fid, ["ln1"], null, {
      id: fid,
      plane,
      primitives: [],
      constraints: [],
    });
    n.extensions = { elementNodeId: "NODE_" + fid };
    return n;
  };

  beforeEach(() => {
    calls.length = 0;
    undoFlags.length = 0;
    h = new ScadgenHistory();
    scadgenSceneSync.configure(core, h);
    scadgenSceneSync.bindExecutor(scadgenExecutor);
    scadgenExecutor.attach(h);
    scadgenExecutor.outputs.clear();
    h.add(mk("Fsk_A"));
    h.add(mk("Fsk_B"));
    h.add(
      buildBooleanNode(
        "Fbl",
        "B",
        [provenanceForFeature("Fsk_A", "FACE", "")],
        [provenanceForFeature("Fsk_B", "FACE", "")],
        "ADD",
      ),
    );
  });

  const b = new Brep([], [], []);
  const out = (fid: string): BodyOutput => ({
    featureId: fid,
    kind: "body",
    brep: b,
    position: new THREE.Vector3(),
    edgeTags: [],
    faceTags: [],
  });
  const ok = {
    Fsk_A: { status: "OK" as const },
    Fsk_B: { status: "OK" as const },
    Fbl: { status: "OK" as const },
  };

  it("commits into target element and hides tool", async () => {
    await scadgenExecutor.whenIdle();
    scadgenExecutor.outputs.set("Fbl", out("Fbl"));
    scadgenSceneSync.onRebuilt(ok);
    expect(calls).toEqual([
      ["update:NODE_Fsk_A", true],
      ["NODE_Fsk_B", true],
    ]);
    // Rebuild syncs must not push their own undo entry.
    expect(undoFlags).toEqual([false]);
  });

  it("authors new element via postCreate and skips immediate update", async () => {
    const h2 = new ScadgenHistory();
    const created: string[] = [];
    const updated: string[] = [];
    const core2 = {
      updateElementBrep: (id: string) => {
        updated.push(id);
      },
      createElement: () => {
        created.push("x");
        return "node_9";
      },
      postCreate: (id: string) => {
        created.push(id);
      },
    };
    const out = (fid: string): BodyOutput => ({
      featureId: fid,
      kind: "body",
      brep: new Brep([], [], []),
      position: new THREE.Vector3(),
      edgeTags: [],
      faceTags: [],
    });
    scadgenSceneSync.configure(core2, h2);
    scadgenSceneSync.forget("Fbl2");
    scadgenExecutor.outputs.clear();
    scadgenExecutor.outputs.set("Fbl2", out("Fbl2"));
    const plane2 = {
      type: "XY",
      origin: [0, 0, 0],
      normal: [0, 0, 1],
      xAxis: [1, 0, 0],
      yAxis: [0, 1, 0],
    };
    const sk = buildSketchNode("Fsk2", "s", ["l"], null, {
      id: "Fsk2",
      plane: plane2,
      primitives: [],
      constraints: [],
    });
    h2.add(sk);
    const extr = buildBooleanNode(
      "Fbl2",
      "b",
      [provenanceForFeature("Fsk2", "FACE", "")],
      [provenanceForFeature("Fsk2", "FACE", "")],
    );
    h2.add(extr);
    await scadgenExecutor.whenIdle();
    scadgenSceneSync.onRebuilt({
      Fsk2: { status: "OK" },
      Fbl2: { status: "OK" },
    });
    expect(created).toEqual(["x", "node_9"]);
    expect(updated).toEqual([]);
  });

  it("scales the source body in place instead of authoring a second body", () => {
    const h4 = new ScadgenHistory();
    const created: string[] = [];
    const updated: string[] = [];
    const ellipsoid = buildShape("Fell", "ellipsoid", {
      rx: 0.03,
      ry: 0.02,
      rz: 0.04,
    });
    for (const node of ellipsoid.nodes) h4.add(node);
    scadgenSceneSync.configure(
      {
        updateElementBrep: (id: string) => updated.push(id),
        createElement: () => {
          const id = `node_${created.length + 1}`;
          created.push(id);
          return id;
        },
        postCreate: () => {},
      },
      h4,
    );
    scadgenExecutor.outputs.clear();
    scadgenExecutor.outputs.set("Fell_rev", out("Fell_rev"));
    scadgenExecutor.outputs.set("Fell", out("Fell"));
    scadgenSceneSync.onRebuilt({
      Fell_rev: { status: "OK" },
      Fell: { status: "OK" },
    });
    expect(created).toEqual(["node_1"]);
    expect(updated).toEqual(["node_1"]);
  });

  it("hides authored bodies outside rollback and restores them", () => {
    const hidden: Array<[string, boolean]> = [];
    const h3 = new ScadgenHistory();
    scadgenSceneSync.configure(
      {
        updateElementBrep: () => {},
        createElement: () => "node_rollback",
        postCreate: () => {},
        setElementHidden: (id, value) => hidden.push([id, value]),
      },
      h3,
    );
    h3.add({
      featureId: "Fin",
      featureType: "insertedBody",
      name: "Insert",
      namespace: "",
      parameters: [],
      subFeatures: [],
      suppressed: false,
    });
    scadgenExecutor.outputs.clear();
    scadgenExecutor.outputs.set("Fin", out("Fin"));
    scadgenSceneSync.onRebuilt({ Fin: { status: "OK" } });

    h3.setRollbackTo(0);
    scadgenSceneSync.onRebuilt({});
    expect(hidden).toContainEqual(["node_rollback", true]);

    h3.setRollbackTo(null);
    scadgenSceneSync.onRebuilt({ Fin: { status: "OK" } });
    expect(hidden).toContainEqual(["node_rollback", false]);
  });

  it("consumes merge targets for extrude, revolve, sweep and loft", () => {
    const targets = [provenanceForFeature("Fsk_A", "FACE", "")];
    const merge = (operationType: "NEW" | "ADD" | "CUT" | "INTERSECT") => [
      {
        kind: "enum" as const,
        parameterId: "operationType",
        value: operationType,
      },
      { kind: "queryList" as const, parameterId: "targets", queries: targets },
    ];
    const q = { value: 0.01, units: "m", expression: "10 mm" };
    const nodes = [
      buildExtrudeNode("Fex_m", "E", targets, q, merge("ADD")),
      buildRevolveNode("Frev_m", "R", targets, targets, q, merge("CUT")),
      buildSweepNode("Fsw_m", "S", targets, targets, merge("ADD")),
      buildLoftNode("Flo_m", "L", targets, [], false, merge("INTERSECT")),
    ];
    for (const node of nodes) {
      h.add(node);
      expect(scadgenSceneSync.toolElementIds(node), node.featureType).toEqual([
        "NODE_Fsk_A",
      ]);
    }
    // A NEW operation leaves the referenced body visible.
    const fresh = buildExtrudeNode("Fex_new", "E", targets, q, merge("NEW"));
    h.add(fresh);
    expect(scadgenSceneSync.toolElementIds(fresh)).toEqual([]);
  });

  it("unhides tool when boolean rolls back to ERROR", async () => {
    await scadgenExecutor.whenIdle();
    scadgenExecutor.outputs.set("Fbl", out("Fbl"));
    scadgenSceneSync.onRebuilt(ok);
    scadgenSceneSync.forget("Fbl");
    scadgenSceneSync.onRebuilt({
      Fsk_A: { status: "OK" },
      Fsk_B: { status: "OK" },
      Fbl: { status: "ERROR" },
    });
    expect(calls).toContainEqual(["NODE_Fsk_B", false]);
  });
});

describe("appearance-as-tree-data", () => {
  const applied: Array<[string, ElementAppearance]> = [];
  const coreA = {
    updateElementBrep: () => {},
    setElementHidden: () => {},
    setElementAppearance: (id: string, ap: ElementAppearance) => {
      applied.push([id, ap]);
    },
  };
  const h2 = new ScadgenHistory();
  const mk2 = (fid: string) => {
    const n = buildSketchNode(fid, fid, ["ln1"], null, {
      id: fid,
      plane: {
        type: "XY" as const,
        origin: [0, 0, 0],
        normal: [0, 0, 1],
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
      },
      primitives: [],
      constraints: [],
    });
    n.extensions = { elementNodeId: "NODE_" + fid };
    return n;
  };
  it("re-appearance flows through rebuild onto the committed element", async () => {
    await scadgenExecutor.whenIdle();
    applied.length = 0;
    h2.add(mk2("AF"));
    const bodyNode = mk2("AB");
    h2.add(bodyNode);
    h2.add(
      buildBooleanNode(
        "AX",
        "X",
        [provenanceForFeature("AF", "FACE", "")],
        [provenanceForFeature("AB", "FACE", "")],
        "ADD",
      ),
    );
    const xn = h2.get("AX")!;
    xn.extensions = { appearance: { opacity: 0.4, color: "#ff0000" } };
    scadgenSceneSync.configure(coreA, h2);
    scadgenSceneSync.bindExecutor(scadgenExecutor);
    scadgenExecutor.attach(h2);
    scadgenExecutor.outputs.clear();
    const b2 = new Brep([], [], []);
    scadgenExecutor.outputs.set("AF", {
      featureId: "AF",
      kind: "body",
      brep: b2,
      position: new THREE.Vector3(),
      edgeTags: [],
      faceTags: [],
    });
    scadgenExecutor.outputs.set("AB", {
      ...scadgenExecutor.outputs.get("AF")!,
      featureId: "AB",
    });
    scadgenExecutor.outputs.set("AX", {
      ...scadgenExecutor.outputs.get("AF")!,
      featureId: "AX",
    });
    scadgenSceneSync.onRebuilt({
      AF: { status: "OK" },
      AB: { status: "OK" },
      AX: { status: "OK" },
    });
    expect(applied).toContainEqual([
      "NODE_AF",
      { opacity: 0.4, color: "#ff0000" },
    ]);
  });
});
