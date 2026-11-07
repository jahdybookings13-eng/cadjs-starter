import {
  Vertex,
  Edge,
  Face,
  Brep,
  CompoundBrep,
  cloneBrep,
} from "../src/geometry";

describe("Geometry Classes", () => {
  describe("Vertex", () => {
    test("creates vertex with correct coordinates", () => {
      const v = new Vertex(1.5, 2.5, 3.5);
      expect(v.x).toBe(1.5);
      expect(v.y).toBe(2.5);
      expect(v.z).toBe(3.5);
    });

    test("creates vertex at origin", () => {
      const v = new Vertex(0, 0, 0);
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    test("handles negative coordinates", () => {
      const v = new Vertex(-5, -10, -15);
      expect(v.x).toBe(-5);
      expect(v.y).toBe(-10);
      expect(v.z).toBe(-15);
    });

    test("handles very small values", () => {
      const v = new Vertex(1e-10, 1e-10, 1e-10);
      expect(v.x).toBe(1e-10);
      expect(v.y).toBe(1e-10);
      expect(v.z).toBe(1e-10);
    });

    test("handles very large values", () => {
      const v = new Vertex(1e10, 1e10, 1e10);
      expect(v.x).toBe(1e10);
      expect(v.y).toBe(1e10);
      expect(v.z).toBe(1e10);
    });

    describe("equals", () => {
      test("returns true for identical vertices", () => {
        const v1 = new Vertex(1, 2, 3);
        const v2 = new Vertex(1, 2, 3);
        expect(v1.equals(v2)).toBe(true);
      });

      test("returns false for different vertices", () => {
        const v1 = new Vertex(1, 2, 3);
        const v2 = new Vertex(1, 2, 4);
        expect(v1.equals(v2)).toBe(false);
      });

      test("returns true for self comparison", () => {
        const v = new Vertex(1, 2, 3);
        expect(v.equals(v)).toBe(true);
      });

      test("handles floating point comparison", () => {
        const v1 = new Vertex(0.1 + 0.2, 0, 0);
        const v2 = new Vertex(0.3, 0, 0);
        // Check if the values are close enough
        expect(Math.abs(v1.x - v2.x)).toBeLessThan(1e-10);
      });

      test("returns true for nearly-equal vertices with tolerance", () => {
        const v1 = new Vertex(1.0, 2.0, 3.0);
        const v2 = new Vertex(1.0001, 2.0001, 3.0001);
        expect(v1.equals(v2, 0.001)).toBe(true);
      });

      test("returns false for vertices outside tolerance", () => {
        const v1 = new Vertex(1.0, 2.0, 3.0);
        const v2 = new Vertex(1.1, 2.0, 3.0);
        expect(v1.equals(v2, 0.01)).toBe(false);
      });
    });
  });

  describe("Edge", () => {
    test("creates edge between two vertices", () => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const edge = new Edge(v1, v2);

      expect(edge.start).toBe(v1);
      expect(edge.end).toBe(v2);
    });

    test("calculates edge length correctly", () => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(3, 4, 0);
      const edge = new Edge(v1, v2);

      expect(edge.length).toBe(5); // 3-4-5 triangle
    });

    test("calculates edge direction correctly", () => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const edge = new Edge(v1, v2);

      expect(edge.direction.x).toBeCloseTo(1, 10);
      expect(edge.direction.y).toBeCloseTo(0, 10);
      expect(edge.direction.z).toBeCloseTo(0, 10);
    });

    test("handles diagonal edge", () => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 1, 1);
      const edge = new Edge(v1, v2);

      const expectedLength = Math.sqrt(3);
      expect(edge.length).toBeCloseTo(expectedLength, 10);
    });

    test("handles zero-length edge", () => {
      const v1 = new Vertex(1, 1, 1);
      const v2 = new Vertex(1, 1, 1);
      const edge = new Edge(v1, v2);

      expect(edge.length).toBe(0);
    });
  });

  describe("Face", () => {
    test("creates triangular face", () => {
      const vertices = [
        new Vertex(0, 0, 0),
        new Vertex(1, 0, 0),
        new Vertex(0.5, 1, 0),
      ];
      const face = new Face(vertices);

      expect(face.vertices.length).toBe(3);
    });

    test("creates quadrilateral face", () => {
      const vertices = [
        new Vertex(0, 0, 0),
        new Vertex(1, 0, 0),
        new Vertex(1, 1, 0),
        new Vertex(0, 1, 0),
      ];
      const face = new Face(vertices);

      expect(face.vertices.length).toBe(4);
    });

    test("creates polygon with many vertices", () => {
      const vertices: Vertex[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        vertices.push(new Vertex(Math.cos(angle), Math.sin(angle), 0));
      }
      const face = new Face(vertices);

      expect(face.vertices.length).toBe(10);
    });

    test("throws error for face with less than 3 vertices", () => {
      expect(
        () => new Face([new Vertex(0, 0, 0), new Vertex(1, 0, 0)]),
      ).toThrow("A face must have at least three vertices");
    });

    test("throws error for face with 1 vertex", () => {
      expect(() => new Face([new Vertex(0, 0, 0)])).toThrow();
    });

    test("throws error for empty face", () => {
      expect(() => new Face([])).toThrow();
    });

    describe("normal calculation", () => {
      test("XY-plane face has Z-pointing normal", () => {
        const face = new Face([
          new Vertex(0, 0, 0),
          new Vertex(1, 0, 0),
          new Vertex(1, 1, 0),
          new Vertex(0, 1, 0),
        ]);

        expect(face.normal.x).toBeCloseTo(0, 5);
        expect(face.normal.y).toBeCloseTo(0, 5);
        expect(Math.abs(face.normal.z)).toBeCloseTo(1, 5);
      });

      test("XZ-plane face has Y-pointing normal", () => {
        const face = new Face([
          new Vertex(0, 0, 0),
          new Vertex(1, 0, 0),
          new Vertex(1, 0, 1),
          new Vertex(0, 0, 1),
        ]);

        expect(Math.abs(face.normal.y)).toBeCloseTo(1, 5);
      });

      test("YZ-plane face has X-pointing normal", () => {
        const face = new Face([
          new Vertex(0, 0, 0),
          new Vertex(0, 1, 0),
          new Vertex(0, 1, 1),
          new Vertex(0, 0, 1),
        ]);

        expect(Math.abs(face.normal.x)).toBeCloseTo(1, 5);
      });

      test("angled face has mixed normal", () => {
        const face = new Face([
          new Vertex(0, 0, 0),
          new Vertex(1, 0, 0),
          new Vertex(1, 1, 1),
          new Vertex(0, 1, 1),
        ]);

        // Should have components in Y and Z
        expect(Math.abs(face.normal.y)).toBeGreaterThan(0);
        expect(Math.abs(face.normal.z)).toBeGreaterThan(0);
      });

      test("normal is unit length", () => {
        const face = new Face([
          new Vertex(0, 0, 0),
          new Vertex(1, 0, 0),
          new Vertex(1, 1, 0),
        ]);

        const length = Math.sqrt(
          face.normal.x ** 2 + face.normal.y ** 2 + face.normal.z ** 2,
        );
        expect(length).toBeCloseTo(1, 5);
      });
    });
  });

  describe("Brep", () => {
    const createBoxBrep = (): Brep => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const v3 = new Vertex(1, 1, 0);
      const v4 = new Vertex(0, 1, 0);
      const v5 = new Vertex(0, 0, 1);
      const v6 = new Vertex(1, 0, 1);
      const v7 = new Vertex(1, 1, 1);
      const v8 = new Vertex(0, 1, 1);

      const bottom = new Face([v1, v2, v3, v4]);
      const top = new Face([v5, v6, v7, v8]);
      const front = new Face([v1, v2, v6, v5]);
      const back = new Face([v4, v3, v7, v8]);
      const left = new Face([v1, v4, v8, v5]);
      const right = new Face([v2, v3, v7, v6]);

      return new Brep(
        [v1, v2, v3, v4, v5, v6, v7, v8],
        [],
        [bottom, top, front, back, left, right],
      );
    };

    test("creates brep with vertices and faces", () => {
      const brep = createBoxBrep();

      expect(brep.vertices.length).toBe(8);
      expect(brep.faces.length).toBe(6);
    });

    test("creates empty brep", () => {
      const brep = new Brep([], [], []);

      expect(brep.vertices.length).toBe(0);
      expect(brep.edges.length).toBe(0);
      expect(brep.faces.length).toBe(0);
    });

    test("brep with only vertices (no faces)", () => {
      const vertices = [
        new Vertex(0, 0, 0),
        new Vertex(1, 0, 0),
        new Vertex(1, 1, 0),
      ];
      const brep = new Brep(vertices, [], []);

      expect(brep.vertices.length).toBe(3);
      expect(brep.faces.length).toBe(0);
    });

    test("brep with edges", () => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const edge = new Edge(v1, v2);
      const brep = new Brep([v1, v2], [edge], []);

      expect(brep.edges.length).toBe(1);
      expect(brep.edges[0]).toBe(edge);
    });
  });

  describe("CompoundBrep", () => {
    const createSimpleBrep = (): Brep => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const v3 = new Vertex(1, 1, 0);
      const v4 = new Vertex(0, 1, 0);
      const face = new Face([v1, v2, v3, v4]);
      return new Brep([v1, v2, v3, v4], [], [face]);
    };

    test("creates compound with single child", () => {
      const brep = createSimpleBrep();
      const compound = new CompoundBrep([brep]);

      expect(compound.children.length).toBe(1);
      expect(compound.children[0]).toBe(brep);
    });

    test("creates compound with multiple children", () => {
      const brep1 = createSimpleBrep();
      const brep2 = createSimpleBrep();
      const brep3 = createSimpleBrep();
      const compound = new CompoundBrep([brep1, brep2, brep3]);

      expect(compound.children.length).toBe(3);
    });

    test("creates empty compound", () => {
      const compound = new CompoundBrep([]);

      expect(compound.children.length).toBe(0);
    });

    describe("vertices aggregation", () => {
      test("CompoundBrep starts with empty vertices (aggregation happens via getUnifiedBRep)", () => {
        const brep1 = new Brep(
          [new Vertex(0, 0, 0), new Vertex(1, 0, 0)],
          [],
          [],
        );
        const brep2 = new Brep(
          [new Vertex(2, 0, 0), new Vertex(3, 0, 0)],
          [],
          [],
        );
        const compound = new CompoundBrep([brep1, brep2]);

        // CompoundBrep.vertices is empty - actual geometry is in children
        expect(compound.vertices.length).toBe(0);
        // Children are stored separately
        expect(compound.children.length).toBe(2);
        expect(compound.children[0].vertices.length).toBe(2);
        expect(compound.children[1].vertices.length).toBe(2);
      });
    });

    describe("faces aggregation", () => {
      test("CompoundBrep starts with empty faces (aggregation happens via getUnifiedBRep)", () => {
        const face1 = new Face([
          new Vertex(0, 0, 0),
          new Vertex(1, 0, 0),
          new Vertex(0.5, 1, 0),
        ]);
        const face2 = new Face([
          new Vertex(2, 0, 0),
          new Vertex(3, 0, 0),
          new Vertex(2.5, 1, 0),
        ]);
        const brep1 = new Brep([], [], [face1]);
        const brep2 = new Brep([], [], [face2]);
        const compound = new CompoundBrep([brep1, brep2]);

        // CompoundBrep.faces is empty - actual geometry is in children
        expect(compound.faces.length).toBe(0);
        // Children are stored separately
        expect(compound.children[0].faces.length).toBe(1);
        expect(compound.children[1].faces.length).toBe(1);
      });
    });

    describe("unified BRep", () => {
      test("can set unified brep", () => {
        const brep1 = createSimpleBrep();
        const brep2 = createSimpleBrep();
        const compound = new CompoundBrep([brep1, brep2]);

        const unifiedBrep = createSimpleBrep();
        compound.setUnifiedBrep(unifiedBrep);

        // The unified brep should be accessible
        expect(compound.children.length).toBe(2);
      });

      test("getUnifiedBRep returns promise", async () => {
        const brep = createSimpleBrep();
        const compound = new CompoundBrep([brep]);

        const result = compound.getUnifiedBRep();
        expect(result).toBeInstanceOf(Promise);
      });

      test("getUnifiedBRep returns cached unified brep when already set", async () => {
        const child = new Brep(
          [new Vertex(0, 0, 0), new Vertex(1, 0, 0), new Vertex(1, 1, 0)],
          [],
          [
            new Face([
              new Vertex(0, 0, 0),
              new Vertex(1, 0, 0),
              new Vertex(1, 1, 0),
            ]),
          ],
        );
        const compound = new CompoundBrep([child]);
        const unifiedBrep = new Brep(
          [new Vertex(0, 0, 0), new Vertex(2, 0, 0), new Vertex(2, 2, 0)],
          [],
          [
            new Face([
              new Vertex(0, 0, 0),
              new Vertex(2, 0, 0),
              new Vertex(2, 2, 0),
            ]),
          ],
        );
        compound.setUnifiedBrep(unifiedBrep);

        const result = await compound.getUnifiedBRep();
        expect(result).toBe(unifiedBrep);
        expect(result.vertices.length).toBe(3);
      });

      test("getUnifiedBRep returns empty brep for empty compound", async () => {
        const compound = new CompoundBrep([]);
        const result = await compound.getUnifiedBRep();
        expect(result.vertices.length).toBe(0);
        expect(result.edges.length).toBe(0);
        expect(result.faces.length).toBe(0);
      });

      test("getUnifiedBRep returns single child when only one child", async () => {
        const child = new Brep(
          [new Vertex(0, 0, 0), new Vertex(1, 0, 0), new Vertex(1, 1, 0)],
          [],
          [
            new Face([
              new Vertex(0, 0, 0),
              new Vertex(1, 0, 0),
              new Vertex(1, 1, 0),
            ]),
          ],
        );
        const compound = new CompoundBrep([child]);
        const result = await compound.getUnifiedBRep();
        expect(result).toBe(child);
      });

      test("getUnifiedBRep throws when worker fails for multi-child compound", async () => {
        const child1 = new Brep(
          [new Vertex(0, 0, 0), new Vertex(1, 0, 0), new Vertex(1, 1, 0)],
          [],
          [
            new Face([
              new Vertex(0, 0, 0),
              new Vertex(1, 0, 0),
              new Vertex(1, 1, 0),
            ]),
          ],
        );
        const child2 = new Brep(
          [new Vertex(2, 0, 0), new Vertex(3, 0, 0), new Vertex(3, 1, 0)],
          [],
          [
            new Face([
              new Vertex(2, 0, 0),
              new Vertex(3, 0, 0),
              new Vertex(3, 1, 0),
            ]),
          ],
        );
        const compound = new CompoundBrep([child1, child2]);

        // Mock OccWorkerClient.send to reject for this test
        const { OccWorkerClient } = await import("./__mocks__/OccWorkerClient");
        const client = OccWorkerClient.getInstance();
        const originalSend = client.send.bind(client);
        client.send = vi
          .fn()
          .mockRejectedValue(new Error("mock worker failure"));

        await expect(compound.getUnifiedBRep()).rejects.toThrow(
          "Compound unification failed",
        );

        // Restore original send
        client.send = originalSend;
      });
    });

    describe("nested compounds", () => {
      test("handles nested compound breps", () => {
        const brep = createSimpleBrep();
        const innerCompound = new CompoundBrep([brep]);
        const outerCompound = new CompoundBrep([innerCompound as any]);

        expect(outerCompound.children.length).toBe(1);
      });
    });
  });
});

describe("Geometry Edge Cases", () => {
  test("face with minimum vertices (3)", () => {
    const face = new Face([
      new Vertex(0, 0, 0),
      new Vertex(1, 0, 0),
      new Vertex(0.5, 1, 0),
    ]);

    expect(face.vertices.length).toBe(3);
  });

  test("very thin face", () => {
    const face = new Face([
      new Vertex(0, 0, 0),
      new Vertex(1000, 0, 0),
      new Vertex(1000, 0.001, 0),
      new Vertex(0, 0.001, 0),
    ]);

    expect(face.vertices.length).toBe(4);
  });

  test("face at large offset", () => {
    const offset = 1000000;
    const face = new Face([
      new Vertex(offset, offset, offset),
      new Vertex(offset + 1, offset, offset),
      new Vertex(offset + 1, offset + 1, offset),
      new Vertex(offset, offset + 1, offset),
    ]);

    expect(face.vertices[0].x).toBe(offset);
  });

  test("brep with many faces", () => {
    const faces: Face[] = [];
    for (let i = 0; i < 100; i++) {
      faces.push(
        new Face([
          new Vertex(i, 0, 0),
          new Vertex(i + 1, 0, 0),
          new Vertex(i + 0.5, 1, 0),
        ]),
      );
    }
    const brep = new Brep([], [], faces);

    expect(brep.faces.length).toBe(100);
  });

  test("compound with many children", () => {
    const children: Brep[] = [];
    for (let i = 0; i < 50; i++) {
      children.push(new Brep([], [], []));
    }
    const compound = new CompoundBrep(children);

    expect(compound.children.length).toBe(50);
  });
});

describe("Brep JSON serialization", () => {
  const createTestBrep = (): Brep => {
    const v = [
      new Vertex(0, 0, 0),
      new Vertex(1, 0, 0),
      new Vertex(1, 1, 0),
      new Vertex(0, 1, 0),
    ];
    const e = [new Edge(v[0], v[1]), new Edge(v[1], v[2])];
    const f = [new Face([v[0], v[1], v[2], v[3]])];
    return new Brep(v, e, f);
  };

  test("roundtrip preserves vertices", () => {
    const brep = createTestBrep();
    const restored = Brep.fromJSON(brep.toJSON());
    expect(restored.vertices.length).toBe(brep.vertices.length);
    for (let i = 0; i < brep.vertices.length; i++) {
      expect(restored.vertices[i].x).toBe(brep.vertices[i].x);
      expect(restored.vertices[i].y).toBe(brep.vertices[i].y);
      expect(restored.vertices[i].z).toBe(brep.vertices[i].z);
    }
  });

  test("roundtrip preserves edges", () => {
    const brep = createTestBrep();
    const restored = Brep.fromJSON(brep.toJSON());
    expect(restored.edges.length).toBe(brep.edges.length);
    for (let i = 0; i < brep.edges.length; i++) {
      expect(restored.edges[i].start.x).toBe(brep.edges[i].start.x);
      expect(restored.edges[i].start.y).toBe(brep.edges[i].start.y);
      expect(restored.edges[i].start.z).toBe(brep.edges[i].start.z);
      expect(restored.edges[i].end.x).toBe(brep.edges[i].end.x);
      expect(restored.edges[i].end.y).toBe(brep.edges[i].end.y);
      expect(restored.edges[i].end.z).toBe(brep.edges[i].end.z);
    }
  });

  test("roundtrip preserves faces", () => {
    const brep = createTestBrep();
    const restored = Brep.fromJSON(brep.toJSON());
    expect(restored.faces.length).toBe(brep.faces.length);
    for (let i = 0; i < brep.faces.length; i++) {
      expect(restored.faces[i].vertices.length).toBe(
        brep.faces[i].vertices.length,
      );
      for (let j = 0; j < brep.faces[i].vertices.length; j++) {
        expect(restored.faces[i].vertices[j].x).toBe(
          brep.faces[i].vertices[j].x,
        );
        expect(restored.faces[i].vertices[j].y).toBe(
          brep.faces[i].vertices[j].y,
        );
        expect(restored.faces[i].vertices[j].z).toBe(
          brep.faces[i].vertices[j].z,
        );
      }
    }
  });

  test("empty BRep roundtrip", () => {
    const brep = new Brep([], [], []);
    const restored = Brep.fromJSON(brep.toJSON());
    expect(restored.vertices.length).toBe(0);
    expect(restored.edges.length).toBe(0);
    expect(restored.faces.length).toBe(0);
  });

  test("BRep with negative and floating-point coordinates", () => {
    const v = [
      new Vertex(-3.14, 2.718, -0.001),
      new Vertex(100.5, -200.25, 0.0001),
      new Vertex(0, 0, 99999.99),
    ];
    const e = [new Edge(v[0], v[1])];
    const f = [new Face([v[0], v[1], v[2]])];
    const brep = new Brep(v, e, f);
    const restored = Brep.fromJSON(brep.toJSON());

    expect(restored.vertices[0].x).toBe(-3.14);
    expect(restored.vertices[0].y).toBe(2.718);
    expect(restored.vertices[0].z).toBe(-0.001);
    expect(restored.vertices[1].x).toBe(100.5);
    expect(restored.vertices[1].y).toBe(-200.25);
    expect(restored.vertices[2].z).toBe(99999.99);
  });

  test("single triangle face roundtrip", () => {
    const v = [new Vertex(0, 0, 0), new Vertex(5, 0, 0), new Vertex(2.5, 4, 0)];
    const f = [new Face([v[0], v[1], v[2]])];
    const brep = new Brep(v, [], f);
    const restored = Brep.fromJSON(brep.toJSON());

    expect(restored.faces.length).toBe(1);
    expect(restored.faces[0].vertices.length).toBe(3);
    expect(restored.edges.length).toBe(0);
  });

  test("fromJSON creates independent instances", () => {
    const brep = createTestBrep();
    const json = brep.toJSON();
    const restored = Brep.fromJSON(json);

    // Mutating restored should not affect original
    restored.vertices[0].x = 999;
    expect(brep.vertices[0].x).toBe(0);

    // Restored vertices are Vertex instances
    expect(restored.vertices[0]).toBeInstanceOf(Vertex);
    expect(restored.edges[0]).toBeInstanceOf(Edge);
    expect(restored.faces[0]).toBeInstanceOf(Face);
  });

  test("toJSON type field is 'brep'", () => {
    const brep = createTestBrep();
    const json = brep.toJSON();
    expect(json.type).toBe("brep");
  });
});

describe("CompoundBrep JSON serialization", () => {
  const createSimpleBrep = (): Brep => {
    const v = [
      new Vertex(0, 0, 0),
      new Vertex(1, 0, 0),
      new Vertex(1, 1, 0),
      new Vertex(0, 1, 0),
    ];
    const e = [new Edge(v[0], v[1])];
    const f = [new Face([v[0], v[1], v[2], v[3]])];
    return new Brep(v, e, f);
  };

  test("roundtrip preserves children without unified BRep", () => {
    const child1 = createSimpleBrep();
    const child2 = createSimpleBrep();
    const compound = new CompoundBrep([child1, child2]);
    const json = compound.toJSON();
    const restored = CompoundBrep.fromJSON(json);

    expect(restored).toBeInstanceOf(CompoundBrep);
    expect(restored.children.length).toBe(2);
    expect(restored.children[0].vertices.length).toBe(child1.vertices.length);
    expect(restored.children[1].vertices.length).toBe(child2.vertices.length);
    // Verify child vertex values
    for (let i = 0; i < child1.vertices.length; i++) {
      expect(restored.children[0].vertices[i].x).toBe(child1.vertices[i].x);
      expect(restored.children[0].vertices[i].y).toBe(child1.vertices[i].y);
      expect(restored.children[0].vertices[i].z).toBe(child1.vertices[i].z);
    }
  });

  test("roundtrip preserves unified BRep when set", () => {
    const child = createSimpleBrep();
    const compound = new CompoundBrep([child]);
    const unifiedBrep = createSimpleBrep();
    compound.setUnifiedBrep(unifiedBrep);

    const json = compound.toJSON();
    const restored = CompoundBrep.fromJSON(json);

    expect(restored).toBeInstanceOf(CompoundBrep);
    // Access private _unifiedBRep via any to verify it was restored
    const restoredUnified = (restored as any)._unifiedBRep as Brep | null;
    expect(restoredUnified).not.toBeNull();
    expect(restoredUnified!.vertices.length).toBe(unifiedBrep.vertices.length);
    for (let i = 0; i < unifiedBrep.vertices.length; i++) {
      expect(restoredUnified!.vertices[i].x).toBe(unifiedBrep.vertices[i].x);
      expect(restoredUnified!.vertices[i].y).toBe(unifiedBrep.vertices[i].y);
      expect(restoredUnified!.vertices[i].z).toBe(unifiedBrep.vertices[i].z);
    }
  });

  test("empty children array roundtrip", () => {
    const compound = new CompoundBrep([]);
    const json = compound.toJSON();
    const restored = CompoundBrep.fromJSON(json);

    expect(restored).toBeInstanceOf(CompoundBrep);
    expect(restored.children.length).toBe(0);
  });

  test("toJSON type field is 'compound'", () => {
    const compound = new CompoundBrep([createSimpleBrep()]);
    const json = compound.toJSON();
    expect(json.type).toBe("compound");
  });

  test("children are independent instances after roundtrip", () => {
    const child = createSimpleBrep();
    const compound = new CompoundBrep([child]);
    const restored = CompoundBrep.fromJSON(compound.toJSON());

    // Mutating restored child should not affect original
    restored.children[0].vertices[0].x = 999;
    expect(child.vertices[0].x).toBe(0);

    // Restored children are proper Brep instances
    expect(restored.children[0]).toBeInstanceOf(Brep);
  });
});

describe("cloneBrep", () => {
  test("clone simple Brep has equal vertex values but different references", () => {
    const v = [new Vertex(1, 2, 3), new Vertex(4, 5, 6), new Vertex(7, 8, 9)];
    const e = [new Edge(v[0], v[1])];
    const f = [new Face([v[0], v[1], v[2]])];
    const brep = new Brep(v, e, f);
    const clone = cloneBrep(brep);

    expect(clone.vertices.length).toBe(brep.vertices.length);
    for (let i = 0; i < brep.vertices.length; i++) {
      expect(clone.vertices[i].x).toBe(brep.vertices[i].x);
      expect(clone.vertices[i].y).toBe(brep.vertices[i].y);
      expect(clone.vertices[i].z).toBe(brep.vertices[i].z);
      // Different object references
      expect(clone.vertices[i]).not.toBe(brep.vertices[i]);
    }
  });

  test("mutating clone vertex does not affect original", () => {
    const v = [new Vertex(1, 2, 3), new Vertex(4, 5, 6), new Vertex(7, 8, 9)];
    const brep = new Brep(v, [], [new Face([v[0], v[1], v[2]])]);
    const clone = cloneBrep(brep);

    clone.vertices[0].x = 999;
    clone.vertices[0].y = 888;
    clone.vertices[0].z = 777;

    expect(brep.vertices[0].x).toBe(1);
    expect(brep.vertices[0].y).toBe(2);
    expect(brep.vertices[0].z).toBe(3);
  });

  test("clone CompoundBrep clones children recursively", () => {
    const child1 = new Brep(
      [new Vertex(0, 0, 0), new Vertex(1, 0, 0), new Vertex(1, 1, 0)],
      [],
      [
        new Face([
          new Vertex(0, 0, 0),
          new Vertex(1, 0, 0),
          new Vertex(1, 1, 0),
        ]),
      ],
    );
    const child2 = new Brep(
      [new Vertex(2, 2, 2), new Vertex(3, 3, 3), new Vertex(4, 4, 4)],
      [],
      [
        new Face([
          new Vertex(2, 2, 2),
          new Vertex(3, 3, 3),
          new Vertex(4, 4, 4),
        ]),
      ],
    );
    const compound = new CompoundBrep([child1, child2]);
    const clone = cloneBrep(compound) as CompoundBrep;

    expect(clone).toBeInstanceOf(CompoundBrep);
    expect(clone.children.length).toBe(2);
    // Children have same values
    expect(clone.children[0].vertices[0].x).toBe(0);
    expect(clone.children[1].vertices[0].x).toBe(2);
    // But different references
    expect(clone.children[0]).not.toBe(child1);
    expect(clone.children[1]).not.toBe(child2);
    expect(clone.children[0].vertices[0]).not.toBe(child1.vertices[0]);
  });

  test("clone CompoundBrep with unified BRep also clones unified", () => {
    const child = new Brep(
      [new Vertex(0, 0, 0), new Vertex(1, 0, 0), new Vertex(1, 1, 0)],
      [],
      [
        new Face([
          new Vertex(0, 0, 0),
          new Vertex(1, 0, 0),
          new Vertex(1, 1, 0),
        ]),
      ],
    );
    const unified = new Brep(
      [new Vertex(10, 20, 30), new Vertex(40, 50, 60), new Vertex(70, 80, 90)],
      [],
      [
        new Face([
          new Vertex(10, 20, 30),
          new Vertex(40, 50, 60),
          new Vertex(70, 80, 90),
        ]),
      ],
    );
    const compound = new CompoundBrep([child]);
    compound.setUnifiedBrep(unified);

    const clone = cloneBrep(compound) as CompoundBrep;
    const clonedUnified = (clone as any)._unifiedBRep as Brep | null;

    expect(clonedUnified).not.toBeNull();
    expect(clonedUnified).not.toBe(unified);
    expect(clonedUnified!.vertices[0].x).toBe(10);
    expect(clonedUnified!.vertices[0].y).toBe(20);
    expect(clonedUnified!.vertices[0].z).toBe(30);
  });

  test("clone CompoundBrep without unified BRep has no unified on clone", () => {
    const child = new Brep(
      [new Vertex(0, 0, 0), new Vertex(1, 0, 0), new Vertex(1, 1, 0)],
      [],
      [
        new Face([
          new Vertex(0, 0, 0),
          new Vertex(1, 0, 0),
          new Vertex(1, 1, 0),
        ]),
      ],
    );
    const compound = new CompoundBrep([child]);
    // Do NOT set unified brep

    const clone = cloneBrep(compound) as CompoundBrep;
    const clonedUnified = (clone as any)._unifiedBRep as Brep | null;

    expect(clonedUnified).toBeNull();
  });

  test("clone edge start/end are new Vertex instances", () => {
    const v1 = new Vertex(1, 2, 3);
    const v2 = new Vertex(4, 5, 6);
    const v3 = new Vertex(7, 8, 9);
    const e = [new Edge(v1, v2), new Edge(v2, v3)];
    const brep = new Brep([v1, v2, v3], e, [new Face([v1, v2, v3])]);
    const clone = cloneBrep(brep);

    expect(clone.edges.length).toBe(2);
    // Edge start/end values preserved
    expect(clone.edges[0].start.x).toBe(1);
    expect(clone.edges[0].start.y).toBe(2);
    expect(clone.edges[0].start.z).toBe(3);
    expect(clone.edges[0].end.x).toBe(4);
    expect(clone.edges[0].end.y).toBe(5);
    expect(clone.edges[0].end.z).toBe(6);
    // Edge start/end are new instances
    expect(clone.edges[0].start).not.toBe(v1);
    expect(clone.edges[0].end).not.toBe(v2);
    expect(clone.edges[1].start).not.toBe(v2);
    expect(clone.edges[1].end).not.toBe(v3);
  });

  test("clone preserves face vertex count and values", () => {
    const v = [
      new Vertex(0, 0, 0),
      new Vertex(1, 0, 0),
      new Vertex(1, 1, 0),
      new Vertex(0, 1, 0),
      new Vertex(0.5, 0.5, 1),
    ];
    const f1 = new Face([v[0], v[1], v[2], v[3]]); // quad
    const f2 = new Face([v[0], v[1], v[4]]); // triangle
    const brep = new Brep(v, [], [f1, f2]);
    const clone = cloneBrep(brep);

    expect(clone.faces.length).toBe(2);
    expect(clone.faces[0].vertices.length).toBe(4);
    expect(clone.faces[1].vertices.length).toBe(3);
    // Values preserved
    expect(clone.faces[0].vertices[2].x).toBe(1);
    expect(clone.faces[0].vertices[2].y).toBe(1);
    expect(clone.faces[1].vertices[2].x).toBe(0.5);
    expect(clone.faces[1].vertices[2].y).toBe(0.5);
    expect(clone.faces[1].vertices[2].z).toBe(1);
    // Different references
    expect(clone.faces[0]).not.toBe(f1);
    expect(clone.faces[1]).not.toBe(f2);
    expect(clone.faces[0].vertices[0]).not.toBe(v[0]);
  });
});
