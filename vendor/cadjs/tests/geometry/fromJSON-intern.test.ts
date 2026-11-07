import { Brep } from "../../src/geometry";

/**
 * `Brep.fromJSON` must intern shared vertices so that two faces sharing the
 * same coordinate end up referencing the *same* Vertex instance (reference
 * equality), not two separate-but-equal instances.
 */
describe("Brep.fromJSON interns shared vertices", () => {
  it("two faces sharing an edge share the same Vertex instance", () => {
    // Triangle fan: two triangles share the (0,0,0) → (1,0,0) edge.
    const json = {
      type: "brep" as const,
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
      ],
      edges: [
        { start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } }, // shared edge
        { start: { x: 1, y: 0, z: 0 }, end: { x: 0, y: 1, z: 0 } },
        { start: { x: 1, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 } },
      ],
      faces: [
        {
          vertices: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
          ],
        },
        {
          vertices: [
            { x: 1, y: 0, z: 0 },
            { x: 1, y: 1, z: 0 },
            { x: 0, y: 1, z: 0 },
          ],
        },
      ],
    };

    const brep = Brep.fromJSON(json);

    // The (0,0,0) Vertex appears in `vertices[0]`, `edges[0].start`, and
    // `faces[0].vertices[0]`. All three should be the SAME instance.
    expect(brep.faces[0].vertices[0]).toBe(brep.vertices[0]);
    expect(brep.edges[0].start).toBe(brep.vertices[0]);

    // Shared (1,0,0) — appears across face[0], face[1], edges[0].end, edges[1].start.
    expect(brep.faces[0].vertices[1]).toBe(brep.vertices[1]);
    expect(brep.faces[1].vertices[0]).toBe(brep.vertices[1]);
    expect(brep.edges[0].end).toBe(brep.vertices[1]);
    expect(brep.edges[1].start).toBe(brep.vertices[1]);

    // Shared (0,1,0) across both faces — same instance.
    expect(brep.faces[0].vertices[2]).toBe(brep.faces[1].vertices[2]);
  });

  it("does NOT merge vertices that are merely close (no tolerance bucketing)", () => {
    // (0,0,0) and (0,0,1e-7) come from `toJSON()` as literal triples — the
    // intern keys are the full numeric strings, so near-but-not-equal
    // coordinates remain distinct.
    const json = {
      type: "brep" as const,
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1e-7 },
      ],
      edges: [],
      faces: [
        {
          vertices: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 0, y: 0, z: 1e-7 },
          ],
        },
      ],
    };

    const brep = Brep.fromJSON(json);
    expect(brep.vertices[0]).not.toBe(brep.vertices[1]);
    expect(brep.vertices[0].z).toBe(0);
    expect(brep.vertices[1].z).toBe(1e-7);
  });

  it("round-trip via toJSON() preserves geometry on the value level", () => {
    // Build a Brep with shared instance vertex, serialize, deserialize.
    const json = {
      type: "brep" as const,
      vertices: [
        { x: 1, y: 2, z: 3 },
        { x: 4, y: 5, z: 6 },
        { x: 7, y: 8, z: 9 },
      ],
      edges: [],
      faces: [
        {
          vertices: [
            { x: 1, y: 2, z: 3 },
            { x: 4, y: 5, z: 6 },
            { x: 7, y: 8, z: 9 },
          ],
        },
      ],
    };
    const brep1 = Brep.fromJSON(json);
    const brep2 = Brep.fromJSON(brep1.toJSON());

    expect(brep2.vertices).toHaveLength(3);
    expect(brep2.faces[0].vertices[0].x).toBe(1);
    expect(brep2.faces[0].vertices[2].z).toBe(9);
    // Interning still works after the round-trip.
    expect(brep2.faces[0].vertices[0]).toBe(brep2.vertices[0]);
  });
});
