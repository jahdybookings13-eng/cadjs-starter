import { describe, expect, it } from "vitest";
import type { ScadgenFeatureNode, ScadgenParameter } from "../onshapeHistory";
import { auditParameter, booleanParameter } from "../paramSupport";

const node = (parameter: ScadgenParameter): ScadgenFeatureNode => ({
  featureId: "Fh",
  featureType: "hole",
  name: "Hole",
  namespace: "",
  parameters: [parameter],
  subFeatures: [],
  suppressed: false,
});

describe("booleanParameter", () => {
  it("reads the boolean the hole dialog writes", () => {
    expect(
      booleanParameter(
        node({ kind: "boolean", parameterId: "throughAll", value: true }),
        "throughAll",
      ),
    ).toBe(true);
    expect(
      booleanParameter(
        node({ kind: "boolean", parameterId: "throughAll", value: false }),
        "throughAll",
      ),
    ).toBe(false);
  });

  it("still reads the legacy string builders emitted", () => {
    expect(
      booleanParameter(
        node({ kind: "string", parameterId: "throughAll", value: "true" }),
        "throughAll",
      ),
    ).toBe(true);
    expect(
      booleanParameter(
        node({ kind: "string", parameterId: "throughAll", value: "false" }),
        "throughAll",
      ),
    ).toBe(false);
  });

  it("audits the extrude params the executor now reads", () => {
    for (const id of [
      "operationType",
      "targets",
      "hasDraft",
      "draftAngle",
      "thinWall",
      "wallThickness",
    ]) {
      expect(auditParameter("extrude", id)).toEqual({ status: "wired" });
    }
  });

  it("audits the hole params the executor now reads", () => {
    for (const id of [
      "holeType",
      "counterboreRadius",
      "counterboreDepth",
      "throughAll",
    ]) {
      expect(auditParameter("hole", id)).toEqual({ status: "wired" });
    }
  });

  it("returns false for a missing param", () => {
    expect(
      booleanParameter(
        node({ kind: "string", parameterId: "axisDir", value: "0,0,-1" }),
        "throughAll",
      ),
    ).toBe(false);
  });
});
