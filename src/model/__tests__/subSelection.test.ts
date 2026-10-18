import { describe, expect, it } from "vitest";
import { edgeOwnerOf, faceOwnerOf } from "../executor";

describe("sub-selection tag ownership", () => {
  it("maps face/edge tags to owning feature", () => {
    expect(faceOwnerOf("Fgen_1_F3")).toBe("Fgen_1");
    expect(edgeOwnerOf("Fgen_1_E11")).toBe("Fgen_1");
    expect(faceOwnerOf("Fgen_1_E3")).toBeNull();
    expect(edgeOwnerOf("nope")).toBeNull();
    expect(faceOwnerOf("Fbox_sk_F0")).toBe("Fbox_sk");
  });
});
