import { beforeEach, describe, expect, it } from "vitest";
import type { BodyOutput } from "../executor";
import type { ScadgenFeatureNode } from "../onshapeHistory";
import { scadgenHistory } from "../featureEngine";
import { scadgenParts } from "../parts";
import { clearImportAssets, registerImportAsset } from "../assets";
import {
  canonicalProjectJson,
  loadProject,
  saveProject,
} from "../documentStore";
import { geometryDigest, geometrySummary } from "../geometryDigest";
import { stableStringify } from "../stableJson";
import { auditPhase3Acceptance } from "../acceptanceAudit";
import { buildBoxNodes } from "../primitives";

const v = (x: number, y: number, z: number) => ({ x, y, z });

function cubeBody(
  opts: {
    featureId?: string;
    dx?: number;
    shuffle?: boolean;
  } = {},
): BodyOutput {
  const verts = [
    v(0, 0, 0),
    v(1, 0, 0),
    v(1, 1, 0),
    v(0, 1, 0),
    v(0, 0, 1),
    v(1, 0, 1),
    v(1, 1, 1),
    v(0, 1, 1),
  ];
  const idx = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const edges = idx.flatMap((face) =>
    face.map((a, i) => ({ start: verts[a]!, end: verts[face[(i + 1) % 4]!]! })),
  );
  const faces = idx.map((face) => ({ vertices: face.map((i) => verts[i]!) }));
  const brep = {
    vertices: opts.shuffle ? [...verts].reverse() : verts,
    edges: opts.shuffle ? [...edges].reverse() : edges,
    faces: opts.shuffle ? [...faces].reverse() : faces,
  };
  return {
    featureId: opts.featureId ?? "F1",
    kind: "body",
    brep,
    position: { x: opts.dx ?? 0, y: 0, z: 0 },
  } as unknown as BodyOutput;
}

describe("stable JSON", () => {
  it("sorts object keys recursively and preserves array order", () => {
    const a = { b: 1, a: { d: [3, 1], c: 2 } };
    const b = { a: { c: 2, d: [3, 1] }, b: 1 };
    expect(stableStringify(a)).toBe('{"a":{"c":2,"d":[3,1]},"b":1}');
    expect(stableStringify(a)).toBe(stableStringify(b));
    const reorderedArray = { a: { c: 2, d: [1, 3] }, b: 1 };
    expect(stableStringify(a)).not.toBe(stableStringify(reorderedArray));
  });
});

describe("canonical project serialization", () => {
  beforeEach(() => {
    scadgenHistory.restoreNodes([]);
    scadgenParts.reset();
    clearImportAssets();
  });

  it("is byte-stable across saves and ignores the save clock", () => {
    const nodes = buildBoxNodes("P1", "body", 2, 3, 4);
    scadgenHistory.restoreNodes(nodes);
    const first = canonicalProjectJson();
    scadgenHistory.restoreNodes(JSON.parse(JSON.stringify(nodes)));
    const second = canonicalProjectJson();

    expect(second).toBe(first);
    expect(first).not.toContain("savedAt");
    expect(first).toContain('"nodes"');
  });

  it("sorts assets so load order does not change the canonical bytes", () => {
    const asset = (id: string): [string, "stl", string, Uint8Array] => [
      id,
      "stl",
      `${id}.stl`,
      new Uint8Array([id.charCodeAt(0)]),
    ];
    registerImportAsset(...asset("z"));
    registerImportAsset(...asset("a"));
    const first = canonicalProjectJson();

    clearImportAssets();
    registerImportAsset(...asset("a"));
    registerImportAsset(...asset("z"));
    expect(canonicalProjectJson()).toBe(first);
  });

  it("still saves a loadable file with its clock and asset bytes", () => {
    scadgenHistory.restoreNodes(buildBoxNodes("P1", "body", 1, 1, 1));
    registerImportAsset("a1", "stl", "a.stl", new Uint8Array([1, 2, 3]));
    const file = saveProject();
    expect(file).toContain("savedAt");
    expect(file).toContain('"bytesB64":"AQID"');

    scadgenHistory.restoreNodes([]);
    clearImportAssets();
    expect(loadProject(file)).toBe(2);
    expect(scadgenHistory.serializeNodes()).toHaveLength(2);
  });
});

describe("geometry digest", () => {
  it("is independent of vertex, edge and face array order", () => {
    expect(geometryDigest([cubeBody()])).toBe(
      geometryDigest([cubeBody({ shuffle: true })]),
    );
  });

  it("changes when world geometry moves and is independent of body order", () => {
    const a = cubeBody({ featureId: "A" });
    const b = cubeBody({ featureId: "B", dx: 2 });
    expect(geometryDigest([a, b])).toBe(geometryDigest([b, a]));
    expect(geometryDigest([a, b])).not.toBe(geometryDigest([a]));
    expect(geometryDigest([a, b])).not.toBe(
      geometryDigest([a, b], { quantum: 1 }),
    );
  });

  it("includes owners only when asked", () => {
    const a = cubeBody({ featureId: "A" });
    const b = cubeBody({ featureId: "B" });
    expect(geometryDigest([a])).toBe(geometryDigest([b]));
    expect(geometryDigest([a], { includeOwners: true })).not.toBe(
      geometryDigest([b], { includeOwners: true }),
    );
  });

  it("reports canonical topology counts and a world bbox", () => {
    const summary = geometrySummary([
      cubeBody({ featureId: "A" }),
      cubeBody({ featureId: "B", dx: 2 }),
    ]);
    expect(summary.totals).toMatchObject({
      bodies: 2,
      vertices: 16,
      edges: 24,
      faces: 12,
    });
    expect(summary.bbox).toEqual([0, 0, 0, 3, 1, 1]);
    expect(summary.bodies.map((b) => b.featureId)).toEqual(["A", "B"]);
    expect(summary.digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable after a BREP JSON round-trip", () => {
    const source = cubeBody();
    const roundTrip = {
      ...source,
      brep: JSON.parse(JSON.stringify(source.brep)),
    } as unknown as BodyOutput;
    expect(geometryDigest([roundTrip])).toBe(geometryDigest([source]));
  });
});

const n = (id: string, featureType: string): ScadgenFeatureNode => ({
  featureId: id,
  featureType,
  name: id,
  namespace: "",
  parameters: [],
  subFeatures: [],
  suppressed: false,
});

const fullPart = (): ScadgenFeatureNode[] => [
  n("sk1", "newSketch"),
  n("ex1", "extrude"),
  n("sk2", "newSketch"),
  n("rv1", "revolve"),
  n("sk3", "newSketch"),
  n("sw1", "sweep"),
  n("sk4", "newSketch"),
  n("lf1", "loft"),
  n("fl1", "fillet"),
  n("ch1", "chamfer"),
  n("sh1", "shell"),
  n("dr1", "draft"),
  n("ho1", "hole"),
  n("pt1", "pattern"),
  n("bo1", "boolean"),
  n("sp1", "split"),
  n("rb1", "rib"),
  n("dm1", "dome"),
  n("co1", "coil"),
  n("gs1", "gusset"),
  n("var1", "variable"),
];

describe("Phase 3 acceptance audit", () => {
  it("passes a 20-feature part with every required category", () => {
    const audit = auditPhase3Acceptance(fullPart());
    expect(audit.ok).toBe(true);
    expect(audit.featureCount).toBe(20);
    expect(audit.missing).toEqual([]);
    expect(audit.duplicateIds).toEqual([]);
    expect(audit.unnamed).toEqual([]);
    expect(audit.newFeatures).toEqual(["coil", "dome", "gusset", "rib"]);
  });

  it("names each missing category and fails below 20 features", () => {
    const noSplit = fullPart().filter((x) => x.featureId !== "sp1");
    const missing = auditPhase3Acceptance(noSplit);
    expect(missing.ok).toBe(false);
    expect(missing.missing).toContain("Split");

    const short = auditPhase3Acceptance(fullPart().slice(0, 19));
    expect(short.ok).toBe(false);
    expect(short.featureCount).toBe(19);
  });

  it("reports duplicate ids and unnamed features", () => {
    const nodes = fullPart();
    nodes.push(n("ex1", "draft"));
    nodes[0] = { ...nodes[0]!, name: "" };
    const audit = auditPhase3Acceptance(nodes);
    expect(audit.duplicateIds).toEqual(["ex1"]);
    expect(audit.unnamed).toEqual(["sk1"]);
    expect(audit.ok).toBe(false);
  });

  it("does not count variables toward the 20-feature minimum", () => {
    const variables = Array.from({ length: 25 }, (_, i) =>
      n(`v${i}`, "variable"),
    );
    const audit = auditPhase3Acceptance(variables);
    expect(audit.featureCount).toBe(0);
    expect(audit.ok).toBe(false);
  });
});
