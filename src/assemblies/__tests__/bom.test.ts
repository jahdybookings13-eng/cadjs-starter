import { describe, expect, it } from "vitest";
import { assemblyBom, bomCsv } from "../bom";
import type { Assembly } from "../model";
import type { BodyRecord, PartRecord } from "../../model/parts";

const bodies: BodyRecord[] = [
  {
    id: "body-a",
    name: "Bracket",
    partId: "part-a",
    materialId: "steel",
    appearance: {},
    state: "keep",
    hidden: false,
    transparent: false,
  },
  {
    id: "body-b",
    name: "Pin",
    partId: null,
    materialId: "aluminum",
    appearance: {},
    state: "keep",
    hidden: false,
    transparent: false,
  },
];

const parts: PartRecord[] = [
  {
    id: "part-a",
    name: "Bracket",
    number: "BR-01",
    description: "Mounting bracket",
    bodyIds: ["body-a"],
  },
];

const asm: Assembly = {
  id: "assembly",
  instances: [
    { id: "i1", partId: "part-a", bodyId: "body-a", transform: [] },
    { id: "i2", partId: "part-a", bodyId: "body-a", transform: [] },
    { id: "i3", partId: "body-b", bodyId: "body-b", transform: [] },
  ],
  mates: [],
};

describe("assembly BOM", () => {
  it("groups repeated instances and resolves part/body metadata", () => {
    const rows = assemblyBom(asm, bodies, parts);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "part-a",
      name: "Bracket",
      number: "BR-01",
      qty: 2,
      materialId: "steel",
    });
    expect(rows[1]).toMatchObject({
      key: "body-b",
      name: "Pin",
      qty: 1,
      materialId: "aluminum",
    });
  });

  it("emits subassembly rows followed by indented child rows", () => {
    const nested: Assembly = {
      id: "root",
      instances: [
        {
          id: "sub_1",
          partId: "subasm",
          name: "Gear set",
          transform: [],
          subassembly: {
            id: "subasm",
            instances: [
              { id: "i1", partId: "part-a", bodyId: "body-a", transform: [] },
              { id: "i2", partId: "part-a", bodyId: "body-a", transform: [] },
            ],
            mates: [],
          },
        },
        { id: "i3", partId: "body-b", bodyId: "body-b", transform: [] },
      ],
      mates: [],
    };
    const rows = assemblyBom(nested, bodies, parts);
    expect(rows[0]).toMatchObject({ name: "Gear set", depth: 0, qty: 1 });
    expect(rows.find((row) => row.key === "part-a")).toMatchObject({
      qty: 2,
      depth: 1,
    });
    expect(rows.find((row) => row.key === "body-b")?.depth).toBe(0);
  });

  it("exports a deterministic CSV with escaped cells", () => {
    const csv = bomCsv([
      {
        key: "x",
        name: 'A, "quoted" part',
        number: "001",
        description: "line",
        materialId: null,
        qty: 1,
        depth: 0,
      },
    ]);
    expect(csv.split("\n")[0]).toBe(
      "Item,Part number,Name,Description,Material,Qty",
    );
    expect(csv).toContain('"A, ""quoted"" part"');
  });
});
