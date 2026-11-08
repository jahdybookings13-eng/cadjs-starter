import { describe, expect, it } from "vitest";
import {
  RENDER_MAX_PIXELS,
  RENDER_SCHEMA,
  RENDER_VERSION,
  assignRenderMaterial,
  createRenderDemo,
  emptyRenderCamera,
  emptyRenderDocument,
  emptyRenderLight,
  parseRenderDocument,
  renderMaterialFromPreset,
  renderStudioFromDesign,
  renderStudioTabDesign,
  serializeRenderDocument,
  validateRenderDocument,
} from "../model";

describe("Render Studio appearance and state", () => {
  it("starts valid with a material, light and camera", () => {
    const document = emptyRenderDocument();
    expect(validateRenderDocument(document)).toEqual([]);
    expect(document.materials).toHaveLength(1);
    expect(document.lights).toHaveLength(1);
    expect(document.cameras).toHaveLength(1);
    expect(document.activeCameraId).toBe(document.cameras[0]!.id);
    expect(document.output).toEqual({
      preset: "preview",
      width: 1280,
      height: 720,
      format: "png",
      quality: 0.92,
    });
  });

  it("seeds a render demo with three appearances, two lights and two cameras", () => {
    const document = createRenderDemo(["body_1", "body_2", "body_3"]);
    expect(document.materials).toHaveLength(3);
    expect(document.lights).toHaveLength(2);
    expect(document.cameras).toHaveLength(2);
    expect(document.assignments).toHaveLength(3);
    expect(document.output.preset).toBe("final");
    expect(
      validateRenderDocument(document, {
        bodyIds: ["body_1", "body_2", "body_3"],
      }),
    ).toEqual([]);
  });

  it("assigns a library material to a body and rejects missing targets", () => {
    const document = emptyRenderDocument();
    const material = renderMaterialFromPreset(3)!;
    document.materials.push(material);
    const assigned = assignRenderMaterial(document, "body_1", material.id);
    expect(assigned.assignments).toEqual([
      { bodyId: "body_1", materialId: material.id },
    ]);
    expect(validateRenderDocument(assigned, { bodyIds: ["body_1"] })).toEqual(
      [],
    );
    expect(
      validateRenderDocument(assigned, { bodyIds: ["body_2"] }).map(
        (issue) => issue.code,
      ),
    ).toContain("ASSIGNMENT_MISSING_BODY");
    expect(() => assignRenderMaterial(document, "body_1", "missing")).toThrow(
      /material library/,
    );
  });

  it("validates lights, cameras and texture resources by name", () => {
    const document = emptyRenderDocument();
    document.materials[0]!.texture = { name: "Brushed map", url: "" };
    document.lights[0] = { ...emptyRenderLight("Spot", "spot"), angle: 0 };
    document.cameras[0] = {
      ...emptyRenderCamera(),
      far: 0,
      fov: 0,
    };
    const codes = validateRenderDocument(document).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "MATERIAL_TEXTURE",
        "LIGHT_ANGLE",
        "CAMERA_FOV",
        "CAMERA_CLIP",
      ]),
    );
  });

  it("round-trips the payload and migrates missing version fields", () => {
    const document = emptyRenderDocument("Persisted");
    document.materials[0]!.roughness = 0.12;
    const text = renderStudioTabDesign(document);
    expect(parseRenderDocument(text)).toEqual(document);
    expect(serializeRenderDocument(parseRenderDocument(text))).toBe(text);
    expect(renderStudioFromDesign(text)?.name).toBe("Persisted");

    const legacy = JSON.parse(text) as Record<string, unknown>;
    delete legacy.v;
    delete legacy.schema;
    const migrated = parseRenderDocument(JSON.stringify(legacy));
    expect(migrated.v).toBe(RENDER_VERSION);
    expect(migrated.schema).toBe(RENDER_SCHEMA);
    expect(migrated.materials[0]!.roughness).toBe(0.12);
    expect(migrated.output.preset).toBe("preview");
  });

  it("round-trips the demo materials, cameras and assignments", () => {
    const document = createRenderDemo(["body_1", "body_2", "body_3"]);
    const restored = parseRenderDocument(renderStudioTabDesign(document));
    expect(restored).toEqual(document);
    expect(restored.activeCameraId).toBe(document.cameras[0]!.id);
    expect(restored.assignments).toEqual(document.assignments);
    expect(restored.output).toEqual(document.output);
  });

  it("rejects a future schema instead of dropping state", () => {
    expect(() =>
      parseRenderDocument(
        JSON.stringify({ ...emptyRenderDocument(), v: RENDER_VERSION + 1 }),
      ),
    ).toThrow(/newer than this build/);
    expect(() =>
      parseRenderDocument(
        JSON.stringify({ ...emptyRenderDocument(), schema: "other" }),
      ),
    ).toThrow(/Expected/);
  });

  it("rejects an output larger than the readback memory budget", () => {
    const document = emptyRenderDocument();
    document.output.width = 4097;
    document.output.height = 4096;
    expect(document.output.width * document.output.height).toBeGreaterThan(
      RENDER_MAX_PIXELS,
    );
    expect(
      validateRenderDocument(document).map((issue) => issue.code),
    ).toContain("OUTPUT_PIXELS");
    document.output.quality = 2;
    expect(
      validateRenderDocument(document).map((issue) => issue.code),
    ).toContain("OUTPUT_QUALITY");
  });
});
