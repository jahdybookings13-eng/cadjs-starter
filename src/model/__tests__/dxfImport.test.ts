import { describe, expect, it } from "vitest";
import { importDxfToSketch } from "../dxfImport";

let nextId = 0;
const id = (prefix: string) => `${prefix}_${++nextId}`;

const dxf = (entities: string) => `0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
ENTITIES
${entities}
0
ENDSEC
0
EOF
`;

const dxfWithLayers = (entities: string) => `0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
WALLS
70
0
62
1
6
DASHED
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
${entities}
0
ENDSEC
0
EOF
`;

describe("importDxfToSketch", () => {
  it("imports lines, circles and arcs as sketch geometry", () => {
    const result = importDxfToSketch(
      dxf(`0
LINE
10
0
20
0
11
10
21
0
0
CIRCLE
10
5
20
5
40
2
0
ARC
10
0
20
0
40
3
50
0
51
90`),
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entityCount).toBe(3);
    expect(result.primitives.map((primitive) => primitive.type)).toEqual([
      "line",
      "circle",
      "arc",
    ]);
    expect(result.points).toHaveLength(6);
    expect(result.layers).toHaveLength(1);
  });

  it("closes LWPOLYLINE and converts inch units to millimetres", () => {
    const text = dxf(`0
LWPOLYLINE
70
1
10
0
20
0
10
1
20
0
10
1
20
1`).replace("70\n4", "70\n1");
    const result = importDxfToSketch(text, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.units).toBe("in");
    expect(result.primitives).toHaveLength(3);
    expect(result.points[1]!.x).toBeCloseTo(25.4);
    expect(
      new Set(
        result.primitives.map((primitive) =>
          primitive.type === "line" ? primitive.polylineId : undefined,
        ),
      ).size,
    ).toBe(1);
  });

  it("maps the DXF layer table and entity layer/linetype", () => {
    const result = importDxfToSketch(
      dxfWithLayers(`0
LINE
8
WALLS
10
0
20
0
11
5
21
0`),
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const walls = result.layers.find((layer) => layer.name === "WALLS");
    expect(walls).toMatchObject({
      color: "#ef4444",
      visible: true,
      linetype: "dashed",
    });
    expect(result.primitives[0]?.layerId).toBe(walls?.id);
  });

  it("rejects non-DXF input and reports unsupported entities", () => {
    expect(importDxfToSketch("hello", id).ok).toBe(false);
    const result = importDxfToSketch(
      dxf(`0
TEXT
10
0
20
0
1
hello`),
      id,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/TEXT/);
  });
});
