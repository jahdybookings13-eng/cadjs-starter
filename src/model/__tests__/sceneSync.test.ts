import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { Brep } from "@vitekk02/cadjs";
import { ScadgenHistory } from "../featureEngine";
import { scadgenExecutor, type BodyOutput } from "../executor";
import {
  buildBooleanNode,
  buildSketchNode,
  provenanceForFeature,
} from "../onshapeHistory";
import { scadgenSceneSync } from "../sceneSync";

describe("sceneSync boolean consumption", () => {
  const calls: Array<[string, boolean]> = [];
  const core = {
    updateElementBrep: (id: string) => calls.push(["update:" + id, true]),
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
