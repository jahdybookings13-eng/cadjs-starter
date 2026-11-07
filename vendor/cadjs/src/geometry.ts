import { distance3, toVec3 } from "./vectorHelpers";

// JSON serialization types for Web Worker communication
export interface VertexJSON {
  x: number;
  y: number;
  z: number;
}
export interface EdgeJSON {
  start: VertexJSON;
  end: VertexJSON;
}
export interface FaceJSON {
  vertices: VertexJSON[];
}
export interface BrepJSON {
  type?: "brep" | "compound" | undefined;
  vertices: VertexJSON[];
  edges: EdgeJSON[];
  faces: FaceJSON[];
}
export interface CompoundBrepJSON extends BrepJSON {
  type: "compound";
  children: BrepJSON[];
  unifiedBRep?: BrepJSON | undefined;
}

export class Vertex {
  constructor(
    public x: number,
    public y: number,
    public z: number,
  ) {}

  equals(other: Vertex, tolerance: number = 0): boolean {
    if (tolerance === 0) {
      return this.x === other.x && this.y === other.y && this.z === other.z;
    } else {
      return (
        Math.abs(this.x - other.x) < tolerance &&
        Math.abs(this.y - other.y) < tolerance &&
        Math.abs(this.z - other.z) < tolerance
      );
    }
  }
}

export class Edge {
  constructor(
    public start: Vertex,
    public end: Vertex,
  ) {}

  /** Edge vector (end − start). NOT normalized; use `.length` to get the magnitude. */
  get direction(): Vertex {
    return new Vertex(
      this.end.x - this.start.x,
      this.end.y - this.start.y,
      this.end.z - this.start.z,
    );
  }

  get length(): number {
    return distance3(this.start, this.end);
  }
}

export class Face {
  constructor(public vertices: Vertex[]) {
    if (vertices.length < 3) {
      throw new Error("A face must have at least three vertices.");
    }
  }

  /** Face normal via (v1−v0) × (v2−v0). NOT normalized; magnitude equals
   *  2 × triangle area for the first three vertices. */
  get normal(): Vertex {
    const v0 = this.vertices[0]!;
    const v1 = this.vertices[1]!;
    const v2 = this.vertices[2]!;

    const a = new Vertex(v1.x - v0.x, v1.y - v0.y, v1.z - v0.z);
    const b = new Vertex(v2.x - v0.x, v2.y - v0.y, v2.z - v0.z);
    return crossProduct(a, b);
  }
}

export class Brep {
  vertices: Vertex[];
  edges: Edge[];
  faces: Face[];

  constructor(vertices: Vertex[], edges: Edge[], faces: Face[]) {
    this.vertices = vertices;
    this.edges = edges;
    this.faces = faces;
  }

  toJSON(): BrepJSON {
    return {
      type: "brep",
      vertices: this.vertices.map((v) => toVec3(v)),
      edges: this.edges.map((e) => ({
        start: toVec3(e.start),
        end: toVec3(e.end),
      })),
      faces: this.faces.map((f) => ({
        vertices: f.vertices.map((v) => toVec3(v)),
      })),
    };
  }

  static fromJSON(json: BrepJSON): Brep {
    assertBrepJson(json, "json");

    // Intern shared vertices on the way in. Without this, every call site
    // that round-trips a Brep through JSON (file I/O, undo, worker payload)
    // duplicates the same coordinate as a fresh `Vertex` instance.
    // Triangle-fans, shared cube corners, etc. balloon to ~3× memory.
    //
    // Bucket by exact-coordinate string key (not POINT_TOL), the JSON came
    // from `toJSON()` which already wrote each vertex as a literal triple, so
    // bit-identical inputs produce bit-identical keys. Tolerance bucketing
    // would risk merging vertices that the producer treats as distinct.
    const interned = new Map<string, Vertex>();
    const intern = (v: VertexJSON): Vertex => {
      const key = `${v.x},${v.y},${v.z}`;
      const cached = interned.get(key);
      if (cached) return cached;
      const fresh = new Vertex(v.x, v.y, v.z);
      interned.set(key, fresh);
      return fresh;
    };

    const vertices = json.vertices.map(intern);
    const edges = json.edges.map(
      (e) => new Edge(intern(e.start), intern(e.end)),
    );
    const faces = json.faces.map((f) => new Face(f.vertices.map(intern)));
    return new Brep(vertices, edges, faces);
  }
}

function assertVertexJson(v: unknown, path: string): asserts v is VertexJSON {
  if (!v || typeof v !== "object") {
    throw new Error(
      `assertBrepJson: ${path} is not an object (got ${typeof v})`,
    );
  }
  const o = v as Record<string, unknown>;
  if (typeof o.x !== "number" || !Number.isFinite(o.x)) {
    throw new Error(
      `assertBrepJson: ${path}.x is not a finite number (got ${String(o.x)})`,
    );
  }
  if (typeof o.y !== "number" || !Number.isFinite(o.y)) {
    throw new Error(
      `assertBrepJson: ${path}.y is not a finite number (got ${String(o.y)})`,
    );
  }
  if (typeof o.z !== "number" || !Number.isFinite(o.z)) {
    throw new Error(
      `assertBrepJson: ${path}.z is not a finite number (got ${String(o.z)})`,
    );
  }
}

function assertBrepJson(json: unknown, path: string): asserts json is BrepJSON {
  if (!json || typeof json !== "object") {
    throw new Error(
      `assertBrepJson: ${path} is not an object (got ${typeof json})`,
    );
  }
  const o = json as Record<string, unknown>;
  if (!Array.isArray(o.vertices)) {
    throw new Error(`assertBrepJson: ${path}.vertices is not an array`);
  }
  if (!Array.isArray(o.edges)) {
    throw new Error(`assertBrepJson: ${path}.edges is not an array`);
  }
  if (!Array.isArray(o.faces)) {
    throw new Error(`assertBrepJson: ${path}.faces is not an array`);
  }
  o.vertices.forEach((v, i) => assertVertexJson(v, `${path}.vertices[${i}]`));
  o.edges.forEach((e, i) => {
    if (!e || typeof e !== "object") {
      throw new Error(`assertBrepJson: ${path}.edges[${i}] is not an object`);
    }
    const edge = e as Record<string, unknown>;
    assertVertexJson(edge.start, `${path}.edges[${i}].start`);
    assertVertexJson(edge.end, `${path}.edges[${i}].end`);
  });
  o.faces.forEach((f, i) => {
    if (!f || typeof f !== "object") {
      throw new Error(`assertBrepJson: ${path}.faces[${i}] is not an object`);
    }
    const face = f as Record<string, unknown>;
    if (!Array.isArray(face.vertices)) {
      throw new Error(
        `assertBrepJson: ${path}.faces[${i}].vertices is not an array`,
      );
    }
    if (face.vertices.length < 3) {
      throw new Error(
        `assertBrepJson: ${path}.faces[${i}].vertices has ${face.vertices.length} entries (need >= 3)`,
      );
    }
    face.vertices.forEach((v, j) =>
      assertVertexJson(v, `${path}.faces[${i}].vertices[${j}]`),
    );
  });
}

export class CompoundBrep extends Brep {
  children: Brep[];
  private _unifiedBRep: Brep | null = null;

  constructor(children: Brep[]) {
    super([], [], []);
    this.children = children;
  }

  setUnifiedBrep(brep: Brep) {
    this._unifiedBRep = brep;
  }

  /** Cached unified BRep, or null if it has not yet been computed. */
  get cachedUnifiedBRep(): Brep | null {
    return this._unifiedBRep;
  }

  // lazy load - computes unified brep only when needed
  async getUnifiedBRep(): Promise<Brep> {
    if (this._unifiedBRep) {
      return this._unifiedBRep;
    }

    if (this.children.length === 0) {
      return new Brep([], [], []);
    }

    if (this.children.length === 1) {
      return this.children[0]!;
    }

    try {
      // Route through worker client (lazy import to avoid circular dependency)
      const { OccWorkerClient } = await import("./services/OccWorkerClient");
      const client = OccWorkerClient.getInstance();
      const result = await client.send<{ brepJson: BrepJSON }>({
        type: "unifyCompound",
        payload: {
          childrenBrepJson: this.children.map((c) => c.toJSON()),
        },
      });
      this._unifiedBRep = Brep.fromJSON(result.brepJson);
      return this._unifiedBRep;
    } catch (error) {
      console.error("Error in compound unification:", error);
      throw new Error(
        `Compound unification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  toJSON(): CompoundBrepJSON {
    return {
      type: "compound",
      vertices: [],
      edges: [],
      faces: [],
      children: this.children.map((c) => c.toJSON() as BrepJSON),
      unifiedBRep: this._unifiedBRep?.toJSON() as BrepJSON | undefined,
    };
  }

  static fromJSON(json: CompoundBrepJSON): CompoundBrep {
    if (!json || typeof json !== "object") {
      throw new Error(
        `CompoundBrep.fromJSON: input is not an object (got ${typeof json})`,
      );
    }
    if (!Array.isArray(json.children)) {
      throw new Error(`CompoundBrep.fromJSON: json.children is not an array`);
    }
    const children = json.children.map((c) => Brep.fromJSON(c));
    const compound = new CompoundBrep(children);
    if (json.unifiedBRep) {
      compound.setUnifiedBrep(Brep.fromJSON(json.unifiedBRep));
    }
    return compound;
  }
}
/**
 * Deep-clone a Brep or CompoundBrep.
 * BRep refs are treated as immutable in the codebase, but we clone
 * the vertex/edge/face arrays so the copy is truly independent.
 */
export function cloneBrep(brep: Brep): Brep {
  if (brep instanceof CompoundBrep) {
    const clonedChildren = brep.children.map((child) => cloneBrep(child));
    const compound = new CompoundBrep(clonedChildren);
    const unified = brep.cachedUnifiedBRep;
    if (unified) {
      compound.setUnifiedBrep(cloneBrep(unified));
    }
    return compound;
  }

  const vertices = brep.vertices.map((v) => new Vertex(v.x, v.y, v.z));
  const edges = brep.edges.map(
    (e) =>
      new Edge(
        new Vertex(e.start.x, e.start.y, e.start.z),
        new Vertex(e.end.x, e.end.y, e.end.z),
      ),
  );
  const faces = brep.faces.map(
    (f) => new Face(f.vertices.map((v) => new Vertex(v.x, v.y, v.z))),
  );
  return new Brep(vertices, edges, faces);
}

function crossProduct(a: Vertex, b: Vertex): Vertex {
  return new Vertex(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}
