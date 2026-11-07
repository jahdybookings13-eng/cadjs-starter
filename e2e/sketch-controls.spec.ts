import { test, expect } from "@playwright/test";
import { loadAppReady, readMode } from "./helpers";

const dxf = `0
SECTION
2
ENTITIES
0
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
ENDSEC
0
EOF
`;

const dxfWithLayer = `0
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
0
LWPOLYLINE
8
WALLS
90
4
70
1
10
0
20
0
10
10
20
0
10
10
20
10
10
0
20
10
0
ENDSEC
0
EOF
`;

test("sketch text and DXF insert through the real toolbar", async ({
  page,
}) => {
  await loadAppReady(page);
  await page.getByTestId("tool-sketch").click();
  await expect.poll(() => readMode(page)).toBe("sketch");
  await page.getByRole("button", { name: "XY", exact: true }).click();

  await page.getByRole("button", { name: "Text", exact: true }).click();
  const textDialog = page.getByLabel("Sketch text");
  await expect(textDialog).toBeVisible();
  await textDialog.fill("SCAD");
  await page.getByLabel("Text height").fill("10 mm");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText(/Text: \d+ lines/)).toBeVisible();

  await page.getByLabel("Import DXF file").setInputFiles({
    name: "line.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(dxf),
  });
  await expect(page.getByText("DXF: 1 entities in mm")).toBeVisible();

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
    "base64",
  );
  await page.getByLabel("Insert image underlay").setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByText("Image underlay inserted.")).toBeVisible();

  await page.getByRole("button", { name: "Underlay", exact: true }).click();
  await expect(page.getByText("Image underlay", { exact: true })).toBeVisible();
  await page.getByLabel("Width").fill("150");
  await page.getByRole("button", { name: "Delete underlay" }).click();
  await expect(
    page.getByRole("button", { name: "Underlay", exact: true }),
  ).toBeDisabled();

  await page.getByTitle("Discard sketch").click();
  await expect.poll(() => readMode(page)).not.toBe("sketch");
});

test("DXF layers and polylines appear in the sketch layer dialog", async ({
  page,
}) => {
  await loadAppReady(page);
  await page.getByTestId("tool-sketch").click();
  await expect.poll(() => readMode(page)).toBe("sketch");
  await page.getByRole("button", { name: "XY", exact: true }).click();

  await page.getByLabel("Import DXF file").setInputFiles({
    name: "walls.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(dxfWithLayer),
  });
  await expect(page.getByText("DXF: 1 entities in mm")).toBeVisible();

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Sketch layers" }),
  ).toBeVisible();
  await expect(page.getByLabel("WALLS name")).toHaveValue("WALLS");
  await expect(page.getByLabel("WALLS linetype")).toHaveValue("dashed");

  await page.getByRole("button", { name: "Close layers" }).click();
  await page.getByTitle("Discard sketch").click();
  await expect.poll(() => readMode(page)).not.toBe("sketch");
});
