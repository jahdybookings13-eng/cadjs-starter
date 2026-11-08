// Local volume mesher.
//
// The mesher accepts the actual closed triangle mesh of a body. It validates
// every edge (open and non-manifold cases are named), classifies the source
// surface and asks Gmsh for a boundary-conforming TET4 volume mesh. Boundary
// nodes lie on the source surface; no bounding-box grid or stair-stepped
// voxel volume is substituted for the body.

import type { Gmsh, GmshFS } from "@loumalouomega/gmsh-wasm";
import {
  SIM_MAX_ELEMENTS,
  SimError,
  type SimBodySource,
  type SimIssue,
  type SimMesh,
  type SimMeshSettings,
  type SimTriangle,
  type SimUnit,
  type SimVec3,
} from "./model";

export interface VolumeMeshOptions extends SimMeshSettings {
  units: SimUnit;
  /** Cooperative cancellation; checked before and after native Gmsh work. */
  signal?: AbortSignal | undefined;
  /** Absolute performance.now() deadline for this mesh. */
  deadlineMs?: number | undefined;
}

function checkMeshBudget(options: VolumeMeshOptions): void {
  if (options.signal?.aborted) {
    throw new SimError("SIM_CANCELLED", "Mesh generation cancelled.");
  }
  if (
    options.deadlineMs !== undefined &&
    performance.now() > options.deadlineMs
  ) {
    throw new SimError(
      "SIM_MESH_BUDGET",
      "Mesh generation exceeded its time budget.",
    );
  }
}

export interface SurfaceDiagnostics {
  openEdges: number;
  nonManifoldEdges: number;
  degenerateTriangles: number;
  signedVolume: number;
}

const EPS = 1e-9;
const INPUT_PATH = "/simulation-input.stl";

type GmshRuntime = Gmsh & { FS: GmshFS };

let gmshPromise: Promise<GmshRuntime> | null = null;
let meshQueue: Promise<void> = Promise.resolve();

function loadGmsh(): Promise<GmshRuntime> {
  gmshPromise ??= (async () => {
    // In the browser the Emscripten module is served as a native public asset;
    // Vite must not transform its pthread worker. Node/Vitest resolves the
    // package normally.
    const moduleUrl =
      typeof window === "undefined"
        ? "@loumalouomega/gmsh-wasm"
        : new URL("/gmsh/gmsh.mjs", window.location.href).href;
    const imported = (await import(/* @vite-ignore */ moduleUrl)) as {
      default: (overrides?: Record<string, unknown>) => Promise<GmshRuntime>;
    };
    const gmsh = await imported.default({
      print: () => undefined,
      printErr: () => undefined,
    });
    gmsh.initialize();
    gmsh.option.setNumber("General.Terminal", 0);
    gmsh.option.setNumber("General.AbortOnError", 2);
    return gmsh;
  })();
  return gmshPromise;
}

/**
 * Gmsh holds one current model per WASM instance. Serialise calls so two tabs
 * or two bodies cannot overwrite each other's model between generate/read.
 */
function withGmsh<T>(task: (gmsh: GmshRuntime) => T): Promise<T> {
  const run = meshQueue.then(async () => {
    const gmsh = await loadGmsh();
    gmsh.clear();
    return task(gmsh);
  });
  meshQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function keyOf(point: SimVec3, tolerance: number): string {
  return [point.x, point.y, point.z]
    .map((value) => Math.round(value / tolerance))
    .join(",");
}

function subtract(a: SimVec3, b: SimVec3): SimVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: SimVec3, b: SimVec3): SimVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: SimVec3, b: SimVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(a: SimVec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function triangleArea(triangle: SimTriangle): number {
  return (
    length(
      cross(subtract(triangle.b, triangle.a), subtract(triangle.c, triangle.a)),
    ) / 2
  );
}

/** Edge pairing, degenerate triangles and signed volume of the source shell. */
export function diagnoseSurface(
  triangles: readonly SimTriangle[],
  opts: { scale?: number } = {},
): SurfaceDiagnostics {
  const scale = opts.scale ?? 1;
  const tolerance = Math.max(1e-9, scale * 1e-7);
  const edges = new Map<string, number>();
  let degenerateTriangles = 0;
  let signedVolume = 0;
  for (const triangle of triangles) {
    if (
      ![triangle.a, triangle.b, triangle.c].every(
        (point) =>
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          Number.isFinite(point.z),
      )
    ) {
      degenerateTriangles += 1;
      continue;
    }
    if (triangleArea(triangle) <= EPS * scale * scale) {
      degenerateTriangles += 1;
      continue;
    }
    const corners = [triangle.a, triangle.b, triangle.c];
    for (let i = 0; i < 3; i++) {
      const a = keyOf(corners[i]!, tolerance);
      const b = keyOf(corners[(i + 1) % 3]!, tolerance);
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
    signedVolume += dot(triangle.a, cross(triangle.b, triangle.c)) / 6;
  }
  let openEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edges.values()) {
    if (count === 1) openEdges += 1;
    else if (count > 2) nonManifoldEdges += 1;
  }
  return {
    openEdges,
    nonManifoldEdges,
    degenerateTriangles,
    signedVolume,
  };
}

function boundsOf(triangles: readonly SimTriangle[]): {
  min: SimVec3;
  max: SimVec3;
} {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const triangle of triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      min.x = Math.min(min.x, point.x);
      min.y = Math.min(min.y, point.y);
      min.z = Math.min(min.z, point.z);
      max.x = Math.max(max.x, point.x);
      max.y = Math.max(max.y, point.y);
      max.z = Math.max(max.z, point.z);
    }
  }
  return { min, max };
}

function boundsDiagnostics(body: SimBodySource): SimIssue[] {
  const issues: SimIssue[] = [];
  if (body.triangles.length < 4) {
    issues.push({
      code: "SIM_MESH_SHELL",
      path: "body.triangles",
      message: `Body "${body.name}" needs a closed triangle shell.`,
    });
    return issues;
  }
  const bounds = boundsOf(body.triangles);
  const scale = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
    1,
  );
  const diagnostics = diagnoseSurface(body.triangles, { scale });
  if (diagnostics.openEdges > 0) {
    issues.push({
      code: "SIM_MESH_OPEN",
      path: "body.triangles",
      message: `Body "${body.name}" has ${diagnostics.openEdges} open shell edge${diagnostics.openEdges === 1 ? "" : "s"}.`,
    });
  }
  if (diagnostics.nonManifoldEdges > 0) {
    issues.push({
      code: "SIM_MESH_NON_MANIFOLD",
      path: "body.triangles",
      message: `Body "${body.name}" has ${diagnostics.nonManifoldEdges} non-manifold edge${diagnostics.nonManifoldEdges === 1 ? "" : "s"}.`,
    });
  }
  if (diagnostics.degenerateTriangles > 0) {
    issues.push({
      code: "SIM_MESH_DEGENERATE",
      path: "body.triangles",
      message: `Body "${body.name}" has ${diagnostics.degenerateTriangles} zero-area triangle${diagnostics.degenerateTriangles === 1 ? "" : "s"}.`,
    });
  }
  if (Math.abs(diagnostics.signedVolume) <= EPS * scale ** 3) {
    issues.push({
      code: "SIM_MESH_ZERO_VOLUME",
      path: "body.triangles",
      message: `Body "${body.name}" encloses zero volume.`,
    });
  }
  return issues;
}

function stlFor(body: SimBodySource, flipWinding: boolean): string {
  const lines: string[] = ["solid simulation"];
  for (const triangle of body.triangles) {
    lines.push(" facet normal 0 0 0", "  outer loop");
    const corners = flipWinding
      ? [triangle.a, triangle.c, triangle.b]
      : [triangle.a, triangle.b, triangle.c];
    for (const point of corners) {
      lines.push(
        `   vertex ${point.x.toPrecision(17)} ${point.y.toPrecision(17)} ${point.z.toPrecision(17)}`,
      );
    }
    lines.push("  endloop", " endfacet");
  }
  lines.push("endsolid simulation");
  return `${lines.join("\n")}\n`;
}

function signedTetVolume(
  nodes: readonly SimVec3[],
  element: readonly number[],
): number {
  const a = nodes[element[0]!]!;
  const b = nodes[element[1]!]!;
  const c = nodes[element[2]!]!;
  const d = nodes[element[3]!]!;
  return dot(subtract(b, a), cross(subtract(c, a), subtract(d, a))) / 6;
}

/**
 * Build a boundary-conforming TET4 volume mesh. `cellSize` is the target
 * element size in document units. The element cap is checked after meshing,
 * and the source surface is validated before the mesher is called.
 */
export async function generateVolumeMesh(
  body: SimBodySource,
  options: VolumeMeshOptions,
): Promise<SimMesh> {
  checkMeshBudget(options);
  if (options.maxElements > SIM_MAX_ELEMENTS) {
    throw new SimError(
      "SIM_MESH_TOO_LARGE",
      `Mesh limit ${options.maxElements.toLocaleString()} exceeds the browser ceiling of ${SIM_MAX_ELEMENTS.toLocaleString()}.`,
    );
  }
  const issues = boundsDiagnostics(body);
  if (issues.length > 0) {
    throw new SimError(
      "SIM_MESH_BODY",
      issues.map((issue) => issue.message).join("; "),
      issues,
    );
  }
  if (!Number.isFinite(options.cellSize) || options.cellSize <= 0) {
    throw new SimError(
      "SIM_MESH_CELL",
      "Mesh cell size must be a positive finite number.",
    );
  }
  if (
    !Number.isFinite(options.minQuality) ||
    options.minQuality <= 0 ||
    options.minQuality > 1
  ) {
    throw new SimError(
      "SIM_MESH_QUALITY",
      "Minimum quality must be greater than zero and at most one.",
    );
  }
  const bounds = boundsOf(body.triangles);
  const extent = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  if (extent.x <= EPS || extent.y <= EPS || extent.z <= EPS) {
    throw new SimError(
      "SIM_MESH_ZERO_VOLUME",
      `Body "${body.name}" has a zero-thickness bounding box.`,
    );
  }
  const estimated = Math.max(
    1,
    Math.ceil((extent.x * extent.y * extent.z) / options.cellSize ** 3),
  );
  if (estimated > options.maxElements) {
    throw new SimError(
      "SIM_MESH_TOO_LARGE",
      `Mesh would need up to ${estimated} elements; the limit is ${options.maxElements}. Increase the cell size.`,
    );
  }

  checkMeshBudget(options);
  const diagnostics = diagnoseSurface(body.triangles, {
    scale: Math.max(extent.x, extent.y, extent.z),
  });
  const sourceVolume = Math.abs(diagnostics.signedVolume);
  const stl = stlFor(body, diagnostics.signedVolume < 0);

  const mesh: SimMesh = await withGmsh((gmsh) => {
    try {
      gmsh.FS.writeFile(INPUT_PATH, stl);
      gmsh.model.add("simulation");
      gmsh.merge(INPUT_PATH);
      // Merge coplanar triangles into named surfaces, then rebuild a volume
      // from the closed shell so Gmsh meshes the solid rather than only the
      // source triangulation.
      gmsh.model.mesh.classifySurfaces(Math.PI / 3, true, true, Math.PI / 3);
      gmsh.model.mesh.createGeometry();
      const dimTags = gmsh.model.getEntities(2).dimTags;
      const surfaces: number[] = [];
      for (let i = 0; i < dimTags.length; i += 2) {
        surfaces.push(dimTags[i + 1]!);
      }
      if (!surfaces.length) {
        throw new SimError(
          "SIM_MESH_SHELL",
          `Body "${body.name}" did not produce a closed volume boundary.`,
        );
      }
      const loop = gmsh.model.geo.addSurfaceLoop(surfaces);
      gmsh.model.geo.addVolume([loop]);
      gmsh.model.geo.synchronize();

      gmsh.option.setNumber("General.NumThreads", 0);
      gmsh.option.setNumber("Mesh.Algorithm3D", 1);
      gmsh.option.setNumber("Mesh.Optimize", 1);
      gmsh.option.setNumber("Mesh.MeshSizeMin", options.cellSize * 0.4);
      gmsh.option.setNumber("Mesh.MeshSizeMax", options.cellSize);
      gmsh.model.mesh.generate(3);

      const nodeResult = gmsh.model.mesh.getNodes();
      const tetResult = gmsh.model.mesh.getElementsByType(4);
      if (!nodeResult.nodeTags.length || !tetResult.elementTags.length) {
        throw new SimError(
          "SIM_MESH_EMPTY",
          `No tetrahedra were generated for "${body.name}".`,
        );
      }
      if (tetResult.elementTags.length > options.maxElements) {
        throw new SimError(
          "SIM_MESH_TOO_LARGE",
          `Mesh produced ${tetResult.elementTags.length} tetrahedra; the limit is ${options.maxElements}. Increase the cell size.`,
        );
      }

      const nodes: SimVec3[] = [];
      const nodeIndex = new Map<number, number>();
      for (let i = 0; i < nodeResult.nodeTags.length; i++) {
        const tag = nodeResult.nodeTags[i]!;
        nodeIndex.set(tag, nodes.length);
        nodes.push({
          x: nodeResult.coord[i * 3]!,
          y: nodeResult.coord[i * 3 + 1]!,
          z: nodeResult.coord[i * 3 + 2]!,
        });
      }
      const elements: number[][] = [];
      let volume = 0;
      for (let e = 0; e < tetResult.elementTags.length; e++) {
        const a = nodeIndex.get(tetResult.nodeTags[e * 4]!);
        const b = nodeIndex.get(tetResult.nodeTags[e * 4 + 1]!);
        const c = nodeIndex.get(tetResult.nodeTags[e * 4 + 2]!);
        const d = nodeIndex.get(tetResult.nodeTags[e * 4 + 3]!);
        if (
          a === undefined ||
          b === undefined ||
          c === undefined ||
          d === undefined
        ) {
          throw new SimError(
            "SIM_MESH_ELEMENT",
            "A tetrahedron references a missing node.",
          );
        }
        let element = [a, b, c, d];
        let elementVolume = signedTetVolume(nodes, element);
        if (elementVolume < 0) {
          element = [a, c, b, d];
          elementVolume = -elementVolume;
        }
        if (!(elementVolume > EPS ** 3)) {
          throw new SimError(
            "SIM_ELEMENT_ZERO_VOLUME",
            "The mesher produced a zero-volume tetrahedron.",
          );
        }
        volume += elementVolume;
        elements.push(element);
      }

      const elementTags = tetResult.elementTags;
      let minQuality = Infinity;
      try {
        const qualities = gmsh.model.mesh.getElementQualities(
          elementTags,
          "minSICN",
        ).elementsQuality;
        for (const value of qualities) {
          if (Number.isFinite(value)) minQuality = Math.min(minQuality, value);
        }
      } catch {
        minQuality = Infinity;
      }
      if (!Number.isFinite(minQuality)) {
        minQuality = 0;
      }
      if (minQuality < options.minQuality) {
        throw new SimError(
          "SIM_ELEMENT_QUALITY",
          `Generated elements are below the requested quality ${options.minQuality} (minimum ${minQuality.toFixed(3)}).`,
        );
      }
      if (
        sourceVolume > 0 &&
        Math.abs(volume - sourceVolume) > sourceVolume * 0.02
      ) {
        throw new SimError(
          "SIM_MESH_VOLUME",
          `Meshed volume ${volume.toFixed(3)} does not match the source shell ${sourceVolume.toFixed(3)}.`,
        );
      }
      return {
        bodyId: body.id,
        bodyName: body.name,
        units: options.units,
        elementType: "tet4",
        cellSize: options.cellSize,
        nodes,
        elements,
        volume,
        minQuality,
        openEdges: diagnostics.openEdges,
        nonManifoldEdges: diagnostics.nonManifoldEdges,
      };
    } catch (error) {
      if (error instanceof SimError) throw error;
      throw new SimError(
        "SIM_MESH_FAILED",
        `Gmsh could not mesh "${body.name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  checkMeshBudget(options);
  return mesh;
}

export function meshNodeBounds(mesh: SimMesh): {
  min: SimVec3;
  max: SimVec3;
} {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const node of mesh.nodes) {
    min.x = Math.min(min.x, node.x);
    min.y = Math.min(min.y, node.y);
    min.z = Math.min(min.z, node.z);
    max.x = Math.max(max.x, node.x);
    max.y = Math.max(max.y, node.y);
    max.z = Math.max(max.z, node.z);
  }
  return { min, max };
}
