import { describe, expect, it } from "vitest";
import {
  POST_DEFINITIONS,
  assertPostSupports,
  parsePostedOperations,
  postProcess,
} from "../post";
import { sampleDocument, sampleOperation } from "./fixtures";

describe("local CAM posts", () => {
  it("posts an operation list and G-code for every local post", () => {
    for (const post of POST_DEFINITIONS) {
      const document = sampleDocument();
      const result = postProcess(document, post.id);
      expect(result.post).toBe(post.id);
      expect(result.program).toContain("G21");
      expect(result.program).toContain("G90");
      expect(result.program).toContain("T1 M6");
      expect(result.program).toContain("M30");
      expect(result.operations).toEqual([
        {
          index: 1,
          name: sampleOperation.name,
          kind: sampleOperation.kind,
          tool: "6 mm flat endmill",
        },
      ]);
      expect(parsePostedOperations(result.program)).toEqual(result.operations);
    }
  });

  it("emits G20 for inch documents", () => {
    const document = sampleDocument();
    document.stock.units = "in";
    const result = postProcess(document, "grbl");
    expect(result.unitCode).toBe("G20");
    expect(result.program).toContain("G20");
  });

  it("fails named with no operations or an unknown post", () => {
    const document = sampleDocument();
    document.operations = [];
    expect(() => postProcess(document, "grbl")).toThrow(
      /at least one operation/,
    );
    expect(() => postProcess(sampleDocument(), "unknown" as never)).toThrow(
      /Unknown post processor/,
    );
  });

  it("rejects an operation kind the post does not support", () => {
    const document = sampleDocument();
    document.operations = [
      { ...sampleOperation, kind: "drill", holes: [{ x: 1, y: 2 }] },
    ];
    expect(() =>
      assertPostSupports(document, {
        label: "Test post",
        supports: ["contour"],
      }),
    ).toThrow(/Test post does not support/);
  });
});
