import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("Phase 5 drawing package checklist", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1800, height: 1200 });
  await loadAppReady(page);
  await page.evaluate(async () => {
    window.__cadDebug!.scadgen!.box(40, 20, 10);
    await window.__cadDebug!.scadgen!.idle();
  });

  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-assembly").click();
  await expect(page.getByTestId("assembly-workspace")).toBeVisible();
  await page.getByRole("button", { name: /\+ Add source body/ }).click();
  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-drawing").click();
  await expect(page.getByTestId("drawing-workspace")).toBeVisible();
  await expect(page.getByTestId("drawing-sheet")).toBeVisible();
  const drawingPane = await page.getByTestId("drawing-preview").boundingBox();
  const drawingSheet = await page.getByTestId("drawing-sheet").boundingBox();
  const viewport = page.viewportSize()!;
  expect(drawingPane).not.toBeNull();
  expect(drawingSheet).not.toBeNull();
  expect(drawingSheet!.width).toBeLessThanOrEqual(drawingPane!.width + 0.5);
  expect(drawingSheet!.x).toBeGreaterThanOrEqual(0);
  expect(drawingSheet!.x + drawingSheet!.width).toBeLessThanOrEqual(
    viewport.width + 0.5,
  );
  expect(drawingSheet!.y + drawingSheet!.height).toBeLessThanOrEqual(
    viewport.height + 0.5,
  );

  await page.getByLabel("Drawing title").fill("PHASE 5 PACKAGE");
  await page.getByLabel("Sheet template").selectOption("ANSI");
  await page.getByLabel("Zone grid").check();
  await expect(page.getByTestId("drawing-zones")).toBeVisible();

  await page.getByLabel("View x").fill("12");
  await page.getByLabel("View y").fill("16");
  await page.getByLabel("Lock view").check();
  await expect(page.getByLabel("View x")).toBeDisabled();
  await expect(page.getByLabel("View scale")).toBeDisabled();
  await page.getByLabel("Lock view").uncheck();
  await expect(page.getByLabel("View x")).toBeEnabled();
  await page.getByLabel("View x").fill("10");
  await page.getByLabel("View y").fill("78");

  await page.getByLabel("Custom view label").fill("TOP DETAIL");
  await page.getByRole("button", { name: "Add view" }).click();
  await expect(
    page.getByTestId("drawing-sheet").getByText("TOP DETAIL"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove TOP DETAIL" }).click();
  await expect(
    page.getByTestId("drawing-sheet").getByText("TOP DETAIL"),
  ).toHaveCount(0);

  await page.getByLabel("Section view").check();
  await page.getByLabel("Section direction").selectOption("-1");
  await page.getByLabel("Section depth").fill("4");
  await page.getByLabel("Section hatch angle").fill("30");
  await page.getByLabel("Section hatch spacing").fill("2");
  await expect(page.getByTestId("drawing-sheet")).toContainText("SECTION A-A");

  await page.getByLabel("New note").fill("CHECK EDGES");
  await page.getByLabel("Add note").click();
  await expect(page.getByTestId("drawing-notes")).toContainText("CHECK EDGES");
  await page.getByLabel(/Note x note_/).fill("25");
  await page.getByLabel(/Note text note_/).fill("CHECK ALL EDGES");
  await page.getByLabel("Leader").check();
  await expect(page.getByTestId("drawing-notes")).toContainText(
    "CHECK ALL EDGES",
  );
  const moveClose = page.getByRole("button", { name: "×" });
  if (await moveClose.count()) await moveClose.first().click();
  await page.getByTestId("drawing-sheet").screenshot({
    path: "phase5-sheet1.png",
  });

  await page.getByLabel("Add drawing sheet").click();
  await expect(page.getByText("Sheet 2 / 2")).toBeVisible();
  await page.getByLabel("Drawing title").fill("PHASE 5 DETAIL");
  await expect(page.getByTestId("drawing-sheet")).toContainText(
    "PHASE 5 DETAIL",
  );

  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const svg = await svgDownload;
  expect(svg.suggestedFilename()).toMatch(/-sheets\.svg$/);
  const svgPath = await svg.path();
  if (!svgPath) throw new Error("SVG download path missing");
  const svgText = await readFile(svgPath, "utf8");
  expect(svgText).toContain('data-sheet="2"');
  expect(svgText).toContain("CHECK ALL EDGES");

  const dxfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export DXF" }).click();
  const dxf = await dxfDownload;
  expect(dxf.suggestedFilename()).toMatch(/-sheets\.dxf$/);
  const dxfPath = await dxf.path();
  if (!dxfPath) throw new Error("DXF download path missing");
  const dxfText = await readFile(dxfPath, "utf8");
  expect(dxfText).toContain("SECTION A-A");

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const pdfPath = await pdf.path();
  if (!pdfPath) throw new Error("PDF download path missing");
  expect((await readFile(pdfPath)).subarray(0, 5).toString("ascii")).toBe(
    "%PDF-",
  );

  await page.getByLabel("DWG release").selectOption("R2018");
  const dwgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export DWG" }).click();
  const dwg = await dwgDownload;
  expect(dwg.suggestedFilename()).toMatch(/\.dwg$/);
  const dwgPath = await dwg.path();
  if (!dwgPath) throw new Error("DWG download path missing");
  expect((await readFile(dwgPath)).subarray(0, 6).toString("ascii")).toBe(
    "AC1032",
  );

  await page.getByTestId("drawing-sheet").screenshot({
    path: "phase5-sheet2.png",
  });
  await page.screenshot({
    path: "phase5-drawing-package.png",
    fullPage: true,
  });
});
