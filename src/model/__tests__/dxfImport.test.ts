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
