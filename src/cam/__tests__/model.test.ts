import { describe, expect, it } from "vitest";
import {
  CAM_SCHEMA,
  camStudioFromDesign,
  emptyCamDocument,
  parseCamDocument,
  serializeCamDocument,
  stockBounds,
  stockFromBody,
  validateCamDocument,
  validateOperation,
  validateStock,
  validateTool,
} from "../model";
import { sampleDocument, sampleOperation, sampleTool } from "./fixtures";

describe("CAM stock and work origin", () => {
  it("computes box and cylinder bounds from the work origin", () => {
    const document = emptyCamDocument();
    expect(stockBounds(document.stock)).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 80, z: 20 },
    });
    document.stock = {
      ...document.stock,
      kind: "cylinder",
      diameter: 40,
      height: 12,
      origin: { x: 10, y: 20, z: 2 },
    };
    expect(stockBounds(document.stock)).toEqual({
      min: { x: -10, y: 0, z: 2 },
      max: { x: 30, y: 40, z: 14 },
    });
  });

  it("fits box, cylinder and custom stock around a body", () => {
    const body = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 20, y: 10, z: 6 },
    };
    const box = stockFromBody(body, "box", 2);
    expect(box.size).toEqual({ x: 24, y: 14, z: 10 });
    expect(box.origin).toEqual({ x: -2, y: -2, z: -2 });
    const cylinder = stockFromBody(body, "cylinder", 2);
    expect(cylinder.diameter).toBe(24);
    expect(cylinder.height).toBe(10);
    const custom = stockFromBody(body, "custom", 2);
    expect(custom.customBounds).toEqual(body);
    expect(stockBounds(custom).min).toEqual({ x: -2, y: -2, z: -2 });
  });

  it("rejects impossible stock values by name", () => {
    const issues = validateStock({
      ...emptyCamDocument().stock,
      size: { x: 0, y: -1, z: Number.NaN },
      margin: -1,
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["STOCK_SIZE", "STOCK_MARGIN"]),
    );
  });
});

describe("CAM tool library and operation validation", () => {
  it("rejects bad tool geometry and feeds", () => {
    const issues = validateTool({
      ...sampleTool,
      diameter: 0,
      flutes: 0,
      feed: -1,
      speed: Number.NaN,
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "TOOL_GEOMETRY",
        "TOOL_FLUTES",
        "TOOL_FEED",
        "TOOL_SPEED",
      ]),
    );
  });

  it("rejects missing tools, empty drills and invalid tabs", () => {
    const missing = validateOperation(
      { ...sampleOperation, toolId: "missing" },
      [sampleTool],
    );
    expect(missing.map((issue) => issue.code)).toContain("OPERATION_TOOL");
    const drill = validateOperation(
      {
        ...sampleOperation,
        kind: "drill",
        holes: [],
      },
      [sampleTool],
    );
    expect(drill.map((issue) => issue.code)).toContain("OPERATION_HOLES");
    const tabs = validateOperation(
      {
        ...sampleOperation,
        tabs: { count: 99, width: 0, height: 6 },
      },
      [sampleTool],
    );
    expect(tabs.map((issue) => issue.code)).toContain("OPERATION_TABS");
  });

  it("accepts a complete document", () => {
    expect(validateCamDocument(sampleDocument())).toEqual([]);
  });
});

describe("CAM persistence", () => {
  it("round-trips byte-equivalently", () => {
    const document = sampleDocument();
    const text = serializeCamDocument(document);
    expect(text).toBe(serializeCamDocument(document));
    expect(parseCamDocument(text)).toEqual(document);
  });

  it("migrates a version-0 payload without dropping tools or operations", () => {
    const legacy = {
      schema: CAM_SCHEMA,
      name: "Legacy CAM",
      stock: { kind: "box" },
      tools: [{ id: "tool_old", name: "Old tool" }],
      operations: [{ id: "op_old", name: "Old op", toolId: "tool_old" }],
      post: "linuxcnc",
    };
    const migrated = parseCamDocument(JSON.stringify(legacy));
    expect(migrated.v).toBe(1);
    expect(migrated.tools).toHaveLength(1);
    expect(migrated.operations).toHaveLength(1);
    expect(migrated.operations[0]?.toolId).toBe("tool_old");
    expect(migrated.post).toBe("linuxcnc");
  });

  it("rejects future schemas and malformed JSON by name", () => {
    expect(() =>
      parseCamDocument(
        JSON.stringify({ schema: CAM_SCHEMA, v: 99, name: "future" }),
      ),
    ).toThrow(/newer than this build/);
    expect(() => parseCamDocument("{")).toThrow(/not valid JSON/);
    expect(camStudioFromDesign("{")).toBeNull();
  });
});
