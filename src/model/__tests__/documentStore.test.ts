import { describe, expect, it } from "vitest";
import { scadgenHistory } from "../featureEngine";
import { buildBoxNodes } from "../primitives";
import { loadProject, saveProject } from "../documentStore";

describe("documentStore", () => {
  it("save/load round-trips the full node list", () => {
    scadgenHistory.restoreNodes([
      ...buildBoxNodes("P1", "p", 1, 1, 1),
      ...buildBoxNodes("P2", "q", 2, 2, 2),
    ]);
    const text = saveProject();
    scadgenHistory.restoreNodes([]);
    expect(scadgenHistory.serializeNodes().length).toBe(0);
    const n = loadProject(text);
    expect(n).toBe(4);
    const ids = scadgenHistory
      .serializeNodes()
      .map((x) => x.featureId)
      .sort();
    expect(ids).toEqual(["P1", "P1_sk", "P2", "P2_sk"]);
    expect(() => loadProject(JSON.stringify({ v: 9 }))).toThrow(/unsupported/);
  });
});
