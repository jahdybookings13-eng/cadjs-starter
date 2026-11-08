import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { Brep, Edge, Face, Vertex } from "../../src/geometry";
import type { SceneElement } from "../../src/scene-operations/types";
import { getOcInstance } from "../../src/services/opencascade-instance";
import {
  readIGESHelper,
  readSTLHelper,
  readSTEPCAFHelper,
  writeIGESHelper,
  writeSTLHelper,
  writeSTEPHelper,
} from "../../src/services/occ-io";
import { collectSubShapes } from "../../src/services/occ-facade";
import { translateShape } from "../../src/services/occ-shape-conversion";
import { export3mf, import3mf } from "../../src/services/three-mf";

const ROOT = path.resolve(__dirname, "../../../..");
const FIXTURES = path.join(ROOT, "src/translation/fixtures");
const RESULTS = path.join(ROOT, "parity/translation-matrix-results.json");

interface MatrixResult {
  format: "step" | "iges" | "stl" | "3mf" | "pdf";
  fixtureBytes: number;
  importMs: number;
  faces: number;
  edited: boolean;
  reloaded: boolean;
  exported: boolean;
}

function triangle(): SceneElement {
  const vertices = [
    new Vertex(0, 0, 0),
    new Vertex(10, 0, 0),
    new Vertex(0, 10, 0),
  ];
  return {
    brep: new Brep(
      vertices,
      [
        new Edge(vertices[0]!, vertices[1]!),
        new Edge(vertices[1]!, vertices[2]!),
        new Edge(vertices[2]!, vertices[0]!),
      ],
      [new Face(vertices)],
    ),
    nodeId: "matrix_3mf" as SceneElement["nodeId"],
    position: new THREE.Vector3(),
    userData: { translationName: "Matrix 3MF", translationColor: "#ff8000" },
  };
}

function writeFixtures(files: Record<string, Uint8Array>): void {
  mkdirSync(FIXTURES, { recursive: true });
  mkdirSync(path.dirname(RESULTS), { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(path.join(FIXTURES, name), Buffer.from(bytes));
  }
}

function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

function faceCount(
  oc: Awaited<ReturnType<typeof getOcInstance>>,
  shape: ReturnType<typeof collectSubShapes>[number],
): number {
  return collectSubShapes(
    oc,
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
  ).length;
}

describe("translation matrix execution", () => {
  it("writes fixtures and runs STEP, IGES, STL, 3MF and PDF checks", async () => {
    const oc = await getOcInstance();
    const box = new oc.BRepPrimAPI_MakeBox_2(10, 20, 30);
    const source = box.Shape();
    const results: MatrixResult[] = [];
    try {
      const step = timed(() =>
        writeSTEPHelper(
          oc,
          [source],
          [{ name: "Matrix STEP", color: "#ff8000" }],
        ),
      );
      const stepImport = timed(() => readSTEPCAFHelper(oc, step.value));
      expect(stepImport.value[0]?.name).toBe("Matrix STEP");
      expect(stepImport.value[0]?.color).toMatch(/^#[0-9a-f]{6}$/i);
      const stepShape = stepImport.value[0]!.shape;
      const stepFaces = faceCount(oc, stepShape);
      const stepMoved = translateShape(oc, stepShape, { x: 5, y: 0, z: 0 });
      const stepOut = writeSTEPHelper(
        oc,
        [stepMoved],
        [{ name: "Matrix STEP", color: "#ff8000" }],
      );
      const stepReload = readSTEPCAFHelper(oc, stepOut);
      results.push({
        format: "step",
        fixtureBytes: step.value.byteLength,
        importMs: stepImport.ms,
        faces: stepFaces,
        edited: !stepMoved.IsNull(),
        reloaded: stepReload.length === 1,
        exported: stepOut.byteLength > 0,
      });
      for (const entry of stepImport.value) entry.shape.delete();
      for (const entry of stepReload) entry.shape.delete();
      stepMoved.delete();

      const iges = timed(() => writeIGESHelper(oc, [source]));
      const igesImport = timed(() => readIGESHelper(oc, iges.value));
      const igesFaces = faceCount(oc, igesImport.value);
      const igesMoved = translateShape(oc, igesImport.value, {
        x: 5,
        y: 0,
        z: 0,
      });
      const igesOut = writeIGESHelper(oc, [igesMoved]);
      const igesReload = readIGESHelper(oc, igesOut);
      results.push({
        format: "iges",
        fixtureBytes: iges.value.byteLength,
        importMs: igesImport.ms,
        faces: igesFaces,
        edited: !igesMoved.IsNull(),
        reloaded: !igesReload.IsNull(),
        exported: igesOut.byteLength > 0,
      });
      igesImport.value.delete();
      igesMoved.delete();
      igesReload.delete();

      const stl = timed(() => writeSTLHelper(oc, source));
      const stlImport = timed(() => readSTLHelper(oc, stl.value));
      const stlFaces = faceCount(oc, stlImport.value);
      const stlMoved = translateShape(oc, stlImport.value, {
        x: 5,
        y: 0,
        z: 0,
      });
      const stlOut = writeSTLHelper(oc, stlMoved);
      const stlReload = readSTLHelper(oc, stlOut);
      results.push({
        format: "stl",
        fixtureBytes: stl.value.byteLength,
        importMs: stlImport.ms,
        faces: stlFaces,
        edited: !stlMoved.IsNull(),
        reloaded: !stlReload.IsNull(),
        exported: stlOut.byteLength > 0,
      });
      stlImport.value.delete();
      stlMoved.delete();
      stlReload.delete();

      const threeMfStart = performance.now();
      const threeMf = new Uint8Array(
        await export3mf([triangle()]).arrayBuffer(),
      );
      const threeMfMs = performance.now() - threeMfStart;
      const threeMfImport = timed(() => import3mf(threeMf.buffer));
      const threeMfFaces = threeMfImport.value[0]!.brep.faces.length;
      const beforeEdit = threeMfImport.value[0]!.brep.vertices.map(
        (vertex) => vertex.x,
      );
      for (const vertex of threeMfImport.value[0]!.brep.vertices) vertex.x += 5;
      const editedGeometry = threeMfImport.value[0]!.brep.vertices.every(
        (vertex, index) => vertex.x === beforeEdit[index]! + 5,
      );
      const edited: SceneElement = {
        brep: threeMfImport.value[0]!.brep,
        nodeId: "matrix_3mf" as SceneElement["nodeId"],
        position: new THREE.Vector3(),
        userData: {
          translationName: "Matrix 3MF",
          translationColor: "#ff8000",
        },
      };
      const threeMfOut = new Uint8Array(
        await export3mf([edited]).arrayBuffer(),
      );
      const threeMfReload = import3mf(threeMfOut.buffer);
      results.push({
        format: "3mf",
        fixtureBytes: threeMf.byteLength,
        importMs: threeMfImport.ms,
        faces: threeMfFaces,
        edited: editedGeometry,
        reloaded: threeMfReload.length === 1,
        exported: threeMfOut.byteLength > 0,
      });

      writeFixtures({
        "box.step": step.value,
        "box.iges": iges.value,
        "box.stl": stl.value,
        "box.3mf": threeMf,
      });
      writeFileSync(RESULTS, JSON.stringify(results, null, 2));
      expect(results).toHaveLength(4);
      for (const result of results) {
        expect(result.fixtureBytes).toBeGreaterThan(0);
        expect(result.faces).toBeGreaterThan(0);
        expect(result.edited, result.format).toBe(true);
        expect(result.reloaded).toBe(true);
        expect(result.exported).toBe(true);
      }

      expect(() =>
        readSTEPCAFHelper(oc, new TextEncoder().encode("not STEP")),
      ).toThrow(/STEP read failed/);
      expect(() =>
        readIGESHelper(oc, new TextEncoder().encode("not IGES")),
      ).toThrow(/IGES read failed/);
      expect(() => export3mf([])).toThrow(/no elements/);
      const inch = zipSync({
        "[Content_Types].xml": strToU8("<Types/>"),
        "3D/3dmodel.model": strToU8(
          `<model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`,
        ),
      });
      const inchImport = import3mf(inch.buffer as ArrayBuffer);
      const xs = inchImport[0]!.brep.vertices.map((vertex) => vertex.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(25.4, 4);
    } finally {
      source.delete();
      box.delete();
    }
  });
});
