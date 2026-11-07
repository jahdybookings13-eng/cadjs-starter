import { describe, expect, it } from "vitest";
import { describeConstraintIds } from "../sketchDiagnostics";

describe("sketch constraint diagnostics", () => {
  const constraints = [
    { id: "c1", type: "horizontal", primitiveIds: ["line_1"] },
    { id: "c2", type: "vertical", primitiveIds: ["line_1"] },
  ];

  it("names the conflicting constraint set with primitive ids", () => {
    expect(describeConstraintIds(["c1", "c2"], constraints)).toEqual([
      "horizontal (line_1)",
      "vertical (line_1)",
    ]);
  });

  it("keeps unknown and duplicate ids instead of hiding them", () => {
    expect(
      describeConstraintIds(["c1", "proposed_c", "c1"], constraints),
    ).toEqual(["horizontal (line_1)", "proposed_c"]);
  });

  it("handles an empty or missing set", () => {
    expect(describeConstraintIds(undefined, constraints)).toEqual([]);
    expect(describeConstraintIds([], constraints)).toEqual([]);
  });
});
