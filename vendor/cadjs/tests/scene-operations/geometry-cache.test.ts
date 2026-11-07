import { Brep, Face, Vertex } from "../../src/geometry";
import {
  createGeometryFromBRep,
  getOrBuildBrepGeometry,
} from "../../src/convertBRepToGeometry";

/**
 * `getOrBuildBrepGeometry(brep)` caches BufferGeometry by Brep identity via
 * a WeakMap, returning the same instance for repeated calls. The
 * fall-through `createGeometryFromBRep(faces)` retains always-rebuild
 * semantics for transient call sites.
 */
describe("getOrBuildBrepGeometry caching", () => {
  function makeTriangle(): Brep {
    const v1 = new Vertex(0, 0, 0);
    const v2 = new Vertex(1, 0, 0);
    const v3 = new Vertex(0, 1, 0);
    return new Brep([v1, v2, v3], [], [new Face([v1, v2, v3])]);
  }

  it("returns the same BufferGeometry instance on repeated calls with the same Brep", () => {
    const brep = makeTriangle();
    const g1 = getOrBuildBrepGeometry(brep);
    const g2 = getOrBuildBrepGeometry(brep);
    expect(g1).toBe(g2);
  });

  it("returns distinct BufferGeometry instances for different Breps", () => {
    const a = makeTriangle();
    const b = makeTriangle();
    const ga = getOrBuildBrepGeometry(a);
    const gb = getOrBuildBrepGeometry(b);
    expect(ga).not.toBe(gb);
  });

  it("createGeometryFromBRep(faces) bypasses the cache (always rebuilds)", () => {
    const brep = makeTriangle();
    const cached = getOrBuildBrepGeometry(brep);
    const fresh = createGeometryFromBRep(brep.faces);
    // Different instances — cache only applies to getOrBuildBrepGeometry.
    expect(fresh).not.toBe(cached);
  });
});
