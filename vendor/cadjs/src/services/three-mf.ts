import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as THREE from "three";
import { Brep, Edge, Face, Vertex } from "../geometry";
import type { ImportResult } from "./ImportExportService";
import type { SceneElement } from "../scene-operations/types";

/**
 * Minimal, dependency-light 3MF core reader/writer.
 *
 * 3MF is an OPC ZIP package with a 3D model XML part. This implementation
 * intentionally handles the core mesh/component/build vocabulary and the
 * common color material extension. It does not claim support for slicer
 * extensions, beam lattices or production/print tickets.
 */

type Vec3 = { x: number; y: number; z: number };
type Mat4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

interface MeshData {
  vertices: Vec3[];
  triangles: Array<[number, number, number]>;
}

interface ObjectData {
  id: string;
  name?: string | undefined;
  color?: string | undefined;
  mesh?: MeshData | undefined;
  components: Array<{ objectId: string; transform?: Mat4 | undefined }>;
}

interface BuildItem {
  objectId: string;
  transform?: Mat4;
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const UNIT_TO_MM: Readonly<Record<string, number>> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

function attrsOf(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) attrs[match[1]!] = match[2]!;
  return attrs;
}

function parseNumber(value: string | undefined, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`3MF model has invalid ${label}: ${String(value)}`);
  }
  return number;
}

function parseTransform(raw: string | undefined): Mat4 {
  if (!raw) return IDENTITY;
  const values = raw.trim().split(/\s+/).map(Number);
  if (values.length !== 12 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("3MF model has an invalid transform matrix");
  }
  // 3MF stores a row-vector 4x3 matrix: m00 m01 m02 m10 ... m32.
  return [
    values[0]!,
    values[1]!,
    values[2]!,
    0,
    values[3]!,
    values[4]!,
    values[5]!,
    0,
    values[6]!,
    values[7]!,
    values[8]!,
    0,
    values[9]!,
    values[10]!,
    values[11]!,
    1,
  ];
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row * 4 + k]! * b[k * 4 + col]!;
      }
      out[row * 4 + col] = sum;
    }
  }
  return out as unknown as Mat4;
}

function transformPoint(point: Vec3, matrix: Mat4): Vec3 {
  const x = point.x;
  const y = point.y;
  const z = point.z;
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  };
}

function parseMesh(xml: string): MeshData {
  const vertices: Vec3[] = [];
  const vertexRe = /<vertex\b([^>]*)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = vertexRe.exec(xml))) {
    const attrs = attrsOf(match[1]!);
    vertices.push({
      x: parseNumber(attrs.x, "vertex x"),
      y: parseNumber(attrs.y, "vertex y"),
      z: parseNumber(attrs.z, "vertex z"),
    });
  }

  const triangles: Array<[number, number, number]> = [];
  const triangleRe = /<triangle\b([^>]*)\/?>/g;
  while ((match = triangleRe.exec(xml))) {
    const attrs = attrsOf(match[1]!);
    const triangle: [number, number, number] = [
      parseNumber(attrs.v1, "triangle v1"),
      parseNumber(attrs.v2, "triangle v2"),
      parseNumber(attrs.v3, "triangle v3"),
    ];
    if (
      triangle.some(
        (index) =>
          !Number.isInteger(index) || index < 0 || index >= vertices.length,
      )
    ) {
      throw new Error("3MF triangle references a missing vertex");
    }
    triangles.push(triangle);
  }
  return { vertices, triangles };
}

function parseModel(xml: string): {
  unit: string;
  objects: Map<string, ObjectData>;
  build: BuildItem[];
} {
  const modelOpen = /<model\b([^>]*)>/.exec(xml);
  if (!modelOpen) throw new Error("3MF package is missing a model element");
  const modelAttrs = attrsOf(modelOpen[1]!);
  const unit = (modelAttrs.unit ?? "millimeter").toLowerCase();
  if (!(unit in UNIT_TO_MM)) {
    throw new Error(`3MF model uses unsupported unit “${unit}”`);
  }

  const materialColors = new Map<string, string[]>();
  const materialsRe = /<basematerials\b([^>]*)>([\s\S]*?)<\/basematerials>/g;
  let materialsMatch: RegExpExecArray | null;
  while ((materialsMatch = materialsRe.exec(xml))) {
    const materialAttrs = attrsOf(materialsMatch[1]!);
    const materialId = materialAttrs.id;
    if (!materialId) continue;
    const colors: string[] = [];
    const baseRe = /<base\b([^>]*)\/?>/g;
    let baseMatch: RegExpExecArray | null;
    while ((baseMatch = baseRe.exec(materialsMatch[2]!))) {
      const color = attrsOf(baseMatch[1]!).displaycolor;
      if (color) colors.push(color);
    }
    materialColors.set(materialId, colors);
  }

  const objects = new Map<string, ObjectData>();
  const objectRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
  let objectMatch: RegExpExecArray | null;
  while ((objectMatch = objectRe.exec(xml))) {
    const attrs = attrsOf(objectMatch[1]!);
    const id = attrs.id;
    if (!id) throw new Error("3MF object is missing an id");
    const body = objectMatch[2]!;
    const meshMatch = /<mesh\b[^>]*>([\s\S]*?)<\/mesh>/.exec(body);
    const pid = attrs.pid;
    const pindex = Number(attrs.pindex ?? 0);
    const color =
      (pid ? materialColors.get(pid)?.[pindex] : undefined) ??
      /displaycolor\s*=\s*"([^"]+)"/i.exec(body)?.[1];
    const components: ObjectData["components"] = [];
    const componentRe = /<component\b([^>]*)\/?>/g;
    let componentMatch: RegExpExecArray | null;
    while ((componentMatch = componentRe.exec(body))) {
      const componentAttrs = attrsOf(componentMatch[1]!);
      const objectId = componentAttrs.objectid;
      if (!objectId) throw new Error("3MF component is missing objectid");
      components.push({
        objectId,
        transform: parseTransform(componentAttrs.transform),
      });
    }
    objects.set(id, {
      id,
      name: attrs.name,
      color,
      mesh: meshMatch ? parseMesh(meshMatch[1]!) : undefined,
      components,
    });
  }

  const build: BuildItem[] = [];
  const buildMatch = /<build\b[^>]*>([\s\S]*?)<\/build>/.exec(xml);
  if (buildMatch) {
    const itemRe = /<item\b([^>]*)\/?>/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRe.exec(buildMatch[1]!))) {
      const attrs = attrsOf(itemMatch[1]!);
      const objectId = attrs.objectid;
      if (!objectId) throw new Error("3MF build item is missing objectid");
      build.push({ objectId, transform: parseTransform(attrs.transform) });
    }
  }
  if (build.length === 0) {
    for (const id of objects.keys()) build.push({ objectId: id });
  }
  return { unit, objects, build };
}

function resolveMesh(
  objectId: string,
  objects: Map<string, ObjectData>,
  transform: Mat4,
  stack: Set<string>,
): MeshData {
  if (stack.has(objectId))
    throw new Error("3MF component graph contains a cycle");
  const object = objects.get(objectId);
  if (!object) throw new Error(`3MF references missing object ${objectId}`);

  const nextStack = new Set(stack);
  nextStack.add(objectId);
  const output: MeshData = { vertices: [], triangles: [] };
  if (object.mesh) {
    const offset = output.vertices.length;
    output.vertices.push(
      ...object.mesh.vertices.map((vertex) =>
        transformPoint(vertex, transform),
      ),
    );
    output.triangles.push(
      ...object.mesh.triangles.map(
        (triangle) =>
          [
            triangle[0] + offset,
            triangle[1] + offset,
            triangle[2] + offset,
          ] as [number, number, number],
      ),
    );
  }
  for (const component of object.components) {
    const child = resolveMesh(
      component.objectId,
      objects,
      multiply(transform, component.transform ?? IDENTITY),
      nextStack,
    );
    const offset = output.vertices.length;
    output.vertices.push(...child.vertices);
    output.triangles.push(
      ...child.triangles.map(
        (triangle) =>
          [
            triangle[0] + offset,
            triangle[1] + offset,
            triangle[2] + offset,
          ] as [number, number, number],
      ),
    );
  }
  return output;
}

function buildBrep(mesh: MeshData, tolerance = 1e-6): Brep {
  const vertices: Vertex[] = [];
  const keyToIndex = new Map<string, number>();
  const remap = (oldIndex: number): number => {
    const point = mesh.vertices[oldIndex]!;
    const key = `${Math.round(point.x / tolerance)},${Math.round(
      point.y / tolerance,
    )},${Math.round(point.z / tolerance)}`;
    const existing = keyToIndex.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertices.push(new Vertex(point.x, point.y, point.z));
    keyToIndex.set(key, index);
    return index;
  };

  const faces: Face[] = [];
  const used = new Set<string>();
  for (const triangle of mesh.triangles) {
    const a = remap(triangle[0]);
    const b = remap(triangle[1]);
    const c = remap(triangle[2]);
    if (a === b || b === c || c === a) continue;
    const va = vertices[a]!;
    const vb = vertices[b]!;
    const vc = vertices[c]!;
    const ab = new Vertex(vb.x - va.x, vb.y - va.y, vb.z - va.z);
    const ac = new Vertex(vc.x - va.x, vc.y - va.y, vc.z - va.z);
    const cross = new Vertex(
      ab.y * ac.z - ab.z * ac.y,
      ab.z * ac.x - ab.x * ac.z,
      ab.x * ac.y - ab.y * ac.x,
    );
    if (Math.hypot(cross.x, cross.y, cross.z) < 1e-12) continue;
    faces.push(new Face([va, vb, vc]));
    used.add(`${a},${b}`);
    used.add(`${b},${c}`);
    used.add(`${c},${a}`);
  }
  if (faces.length === 0) throw new Error("3MF mesh has no valid triangles");

  const edges: Edge[] = [];
  for (const key of used) {
    const [a, b] = key.split(",").map(Number) as [number, number];
    edges.push(new Edge(vertices[a]!, vertices[b]!));
  }
  return new Brep(vertices, edges, faces);
}

function centerBrep(brep: Brep): { center: THREE.Vector3; local: Brep } {
  let min = new THREE.Vector3(Infinity, Infinity, Infinity);
  let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const vertex of brep.vertices) {
    min = min.min(new THREE.Vector3(vertex.x, vertex.y, vertex.z));
    max = max.max(new THREE.Vector3(vertex.x, vertex.y, vertex.z));
  }
  const center = min.add(max).multiplyScalar(0.5);
  const local = new Brep(
    brep.vertices.map(
      (vertex) =>
        new Vertex(
          vertex.x - center.x,
          vertex.y - center.y,
          vertex.z - center.z,
        ),
    ),
    brep.edges.map(
      (edge) =>
        new Edge(
          new Vertex(
            edge.start.x - center.x,
            edge.start.y - center.y,
            edge.start.z - center.z,
          ),
          new Vertex(
            edge.end.x - center.x,
            edge.end.y - center.y,
            edge.end.z - center.z,
          ),
        ),
    ),
    brep.faces.map(
      (face) =>
        new Face(
          face.vertices.map(
            (vertex) =>
              new Vertex(
                vertex.x - center.x,
                vertex.y - center.y,
                vertex.z - center.z,
              ),
          ),
        ),
    ),
  );
  return { center, local };
}

/** Import a 3MF package into one centered body per build item. */
export function import3mf(arrayBuffer: ArrayBuffer): ImportResult[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(arrayBuffer));
  } catch {
    throw new Error("3MF package is not a valid ZIP archive");
  }
  const modelEntry = Object.keys(files).find((name) =>
    name.toLowerCase().endsWith(".model"),
  );
  if (!modelEntry) throw new Error("3MF package contains no .model part");
  let model: ReturnType<typeof parseModel>;
  try {
    model = parseModel(strFromU8(files[modelEntry]!));
  } catch (error) {
    throw new Error(
      `3MF model parse failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const scale = UNIT_TO_MM[model.unit]!;
  return model.build.map((item, index) => {
    const object = model.objects.get(item.objectId);
    if (!object)
      throw new Error(`3MF build references missing object ${item.objectId}`);
    const resolved = resolveMesh(
      item.objectId,
      model.objects,
      multiply(
        item.transform ?? IDENTITY,
        parseTransform(`${scale} 0 0 0 ${scale} 0 0 0 ${scale} 0 0 0`),
      ),
      new Set(),
    );
    const { center, local } = centerBrep(buildBrep(resolved));
    return {
      brep: local,
      position: center,
      name: object.name || `3MF Body ${index + 1}`,
      ...(object.color ? { color: object.color } : {}),
    };
  });
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colorOf(element: SceneElement): string {
  const raw = element.userData?.translationColor;
  return typeof raw === "string" && /^#[0-9a-f]{6}$/i.test(raw)
    ? raw
    : "#b8c0cc";
}

function meshXml(
  element: SceneElement,
  objectId: number,
  colorIndex: number,
): string {
  const vertices: string[] = [];
  const triangles: string[] = [];
  let vertexCount = 0;
  const rotation = element.rotation;
  const position = element.position;
  for (const face of element.brep.faces) {
    if (face.vertices.length < 3) continue;
    const points = face.vertices.map((vertex) => {
      const point = new THREE.Vector3(vertex.x, vertex.y, vertex.z);
      if (rotation) point.applyEuler(rotation);
      point.add(position);
      return point;
    });
    const base = vertexCount;
    for (const point of points) {
      vertices.push(
        `      <vertex x="${point.x.toFixed(6)}" y="${point.y.toFixed(
          6,
        )}" z="${point.z.toFixed(6)}"/>`,
      );
      vertexCount += 1;
    }
    for (let i = 1; i < points.length - 1; i++) {
      triangles.push(
        `      <triangle v1="${base}" v2="${base + i}" v3="${base + i + 1}"/>`,
      );
    }
  }
  return `    <object id="${objectId}" type="model" name="${xmlEscape(
    String(element.userData?.translationName ?? `Body ${objectId}`),
  )}" pid="1" pindex="${colorIndex}">
      <mesh>
${vertices.join("\n")}
${triangles.join("\n")}
      </mesh>
    </object>`;
}

/** Export scene elements as a 3MF core package in millimetres. */
export function export3mf(elements: SceneElement[]): Blob {
  if (elements.length === 0)
    throw new Error("3MF export: no elements to write");
  const colors = [...new Set(elements.map(colorOf))];
  const objects = elements
    .map((element, index) =>
      meshXml(element, index + 1, colors.indexOf(colorOf(element))),
    )
    .join("\n");
  const build = elements
    .map((_, index) => `    <item objectid="${index + 1}"/>`)
    .join("\n");
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">CADjs export</metadata>
  <resources>
    <basematerials id="1">
${colors
  .map(
    (color, index) =>
      `      <base name="Color ${index + 1}" displaycolor="${color}"/>`,
  )
  .join("\n")}
    </basematerials>
${objects}
  </resources>
  <build>
${build}
  </build>
</model>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  const zipped = zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(rels),
      "3D/3dmodel.model": strToU8(model),
    },
    { level: 6 },
  );
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "model/3mf" });
}
