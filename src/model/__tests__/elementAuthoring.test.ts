import { describe, expect, it } from "vitest";
import {
  makeElementAuthor,
  pairNewElements,
  type PendingAuthoring,
} from "../elementAuthoring";

describe("element authoring id prediction", () => {
  it("claims sequential node ids within a render generation", () => {
    let counter = 5;
    const added: unknown[] = [];
    const author = makeElementAuthor(
      (b, p) => {
        added.push([b, p]);
        counter++;
      },
      () => counter,
    );
    expect(author("b1", "p1")).toBe("node_6");
    expect(author("b2", "p2")).toBe("node_7");
    expect(added).toHaveLength(2);
  });
  it("re-syncs after the store counter moves externally", () => {
    let counter = 0;
    const author = makeElementAuthor(
      () => {
        counter++;
      },
      () => counter,
    );
    expect(author("a", "b")).toBe("node_1");
    counter += 10;
    expect(author("c", "d")).toBe("node_12");
  });
});

describe("pairNewElements", () => {
  const item = (id: string): PendingAuthoring => ({
    predictedId: id,
    brep: id,
    position: 0,
  });
  it("pairs fresh ids numerically against insertion order", () => {
    const seen = new Set<string>(["node_1"]);
    const pairs = pairNewElements(["node_10", "node_3", "node_1"], seen, [
      item("p1"),
      item("p2"),
    ]);
    expect(pairs.map((p) => [p.actualId, p.item.predictedId])).toEqual([
      ["node_3", "p1"],
      ["node_10", "p2"],
    ]);
    expect(seen.has("node_10")).toBe(true);
  });
  it("leaves pending unmatched when flush not arrived", () => {
    const pairs = pairNewElements([], new Set<string>(), [item("p1")]);
    expect(pairs).toEqual([]);
  });
});
