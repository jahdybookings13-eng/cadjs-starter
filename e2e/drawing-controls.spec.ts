import { expect, test, type Page } from "@playwright/test";
import type { DrawingTabData } from "../src/drawings/model";
import { loadAppReady } from "./helpers";

async function openDrawing(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1800, height: 1200 });
  await loadAppReady(page);
  await page.evaluate(async () => {
    window.__cadDebug!.scadgen!.box(40, 20, 10);
    window.__cadDebug!.scadgen!.cylinder(6, 12);
    await window.__cadDebug!.scadgen!.idle();
  });

  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-assembly").click();
  await expect(page.getByTestId("assembly-workspace")).toBeVisible();
  const bodySelect = page.getByLabel("Assembly body");
  expect(await bodySelect.locator("option").count()).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: /Add source body/ }).click();
  await bodySelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: /Add source body/ }).click();
  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-drawing").click();
  await expect(page.getByTestId("drawing-workspace")).toBeVisible();
  await expect(page.getByTestId("drawing-sheet")).toBeVisible();
}

async function drawingState(page: Page): Promise<DrawingTabData> {
  const state = await page.evaluate(
    () => window.__cadDebug?.drawing?.state() ?? null,
  );
  if (!state) throw new Error("drawing state unavailable");
  return state;
}

function viewField(
  page: Page,
  key: "x" | "y" | "w" | "h",
): ReturnType<Page["getByTestId"]> {
  return page.getByTestId(`drawing-view-${key}`);
}

test("drawing source binding, sheets and sheet settings", async ({ page }) => {
  test.setTimeout(120_000);
  await openDrawing(page);

  await expect(
    page.getByRole("button", { name: "Bind current source" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bind current source" }).click();
  let state = await drawingState(page);
  expect(state.sourceSignature).toBeTruthy();

  await page.getByRole("tab", { name: /Assembly/ }).click();
  await expect(page.getByTestId("assembly-workspace")).toBeVisible();
  await page.getByRole("button", { name: /Add source body/ }).click();
  await page.getByRole("tab", { name: /Drawing/ }).click();
  await expect(page.getByTestId("drawing-workspace")).toBeVisible();
  await expect(page.getByTestId("drawing-stale")).toBeVisible();
  await page.getByRole("button", { name: "Update drawing" }).click();
  await expect(page.getByTestId("drawing-stale")).toHaveCount(0);

  await page.getByLabel("Add drawing sheet").click();
  await expect(page.getByText("Sheet 2 / 2")).toBeVisible();
  state = await drawingState(page);
  expect(state.sheets).toHaveLength(2);
  expect(state.activeSheet).toBe(1);

  await page.getByLabel("Drawing title").fill("DETAIL SHEET");
  await page.getByLabel("Drawing number").fill("DWG-002");
  await page.getByLabel("Duplicate drawing sheet").click();
  await expect(page.getByText("Sheet 3 / 3")).toBeVisible();
  state = await drawingState(page);
  expect(state.sheets?.[2]?.title).toBe("DETAIL SHEET COPY");
  expect(state.sheets?.[2]?.number).toBe("DWG-002-COPY");

  await page.getByLabel("Move sheet left").click();
  await expect(page.getByText("Sheet 2 / 3")).toBeVisible();
  state = await drawingState(page);
  expect(state.activeSheet).toBe(1);
  expect(state.sheets?.[1]?.title).toBe("DETAIL SHEET COPY");
  await page.getByLabel("Move sheet right").click();
  await expect(page.getByText("Sheet 3 / 3")).toBeVisible();
  await page.getByLabel("Remove drawing sheet").click();
  await expect(page.getByText("Sheet 2 / 2")).toBeVisible();

  await page.getByLabel("Drawing sheet", { exact: true }).selectOption("0");
  await expect(page.getByText("Sheet 1 / 2")).toBeVisible();

  await page.getByLabel("Sheet size").selectOption("A3");
  await page.getByLabel("Sheet orientation").selectOption("portrait");
  await page.getByLabel("Projection angle").selectOption("first");
  await page.getByLabel("Title block variant").selectOption("detailed");
  await page.getByLabel("Drawing title").fill("GA SHEET");
  await page.getByLabel("Drawing number").fill("DWG-100");

  const titleBlockFields: Array<[string, string]> = [
    ["Revision", "B"],
    ["Date", "2026-11-08"],
    ["Drawn by", "BUFFY"],
    ["Checked by", "QA"],
    ["Approved by", "LEAD"],
    ["Material", "AL 6061"],
    ["Finish", "ANODIZE"],
    ["Weight", "1.2 kg"],
  ];
  for (const [label, value] of titleBlockFields)
    await page.getByLabel(`Title block ${label}`).fill(value);

  await page.getByLabel("Custom sheet width").fill("400");
  await page.getByLabel("Custom sheet height").fill("300");
  await page.getByLabel("Drawing scale", { exact: true }).fill("1:2");
  await page.getByLabel("Drawing scale factor").fill("2");
  await page.getByLabel("Drawing explode").fill("5");
  await page.getByLabel("Show BOM table").uncheck();
  await page.getByLabel("Show hidden lines").check();
  await page.getByLabel("Monochrome plot").check();
  await page.getByLabel("Plot line weight").fill("0.5");
  await page.getByLabel("Sheet template").selectOption("ANSI");
  await page.getByLabel("Zone grid").check();
  await expect(page.getByTestId("drawing-zones")).toBeVisible();

  state = await drawingState(page);
  expect(state.sheet).toMatchObject({
    size: "A3",
    orientation: "portrait",
    projectionAngle: "first",
    title: "GA SHEET",
    number: "DWG-100",
    titleBlock: "detailed",
    revision: "B",
    date: "2026-11-08",
    drawnBy: "BUFFY",
    checkedBy: "QA",
    approvedBy: "LEAD",
    material: "AL 6061",
    finish: "ANODIZE",
    weight: "1.2 kg",
    scale: "1:2",
    scaleValue: 2,
    explode: 5,
    showBom: false,
    showHiddenLines: true,
    plotStyle: "monochrome",
    lineWeight: 0.5,
    template: "ANSI",
    showZones: true,
  });
  expect(state.sheet.format).toMatchObject({ width: 400, height: 300 });
  expect(await page.getByTestId("drawing-sheet").getAttribute("width")).toBe(
    "400mm",
  );
  await expect(page.getByTestId("drawing-title-block")).toHaveAttribute(
    "data-variant",
    "detailed",
  );
  await expect(page.getByTestId("drawing-title-block")).toContainText(
    "GA SHEET",
  );
  await expect(page.getByTestId("drawing-title-block")).toContainText(
    "DWG-100",
  );
  await expect(page.getByTestId("drawing-title-block")).toContainText(
    "AL 6061",
  );
  await expect(page.getByTestId("drawing-title-block")).toContainText(
    "SCALE 1:2",
  );
  await expect(page.getByTestId("drawing-bom")).toHaveCount(0);

  await page.getByLabel("Zone grid").uncheck();
  await expect(page.getByTestId("drawing-zones")).toHaveCount(0);
});

test("drawing views, custom view, section, detail, auxiliary and broken-out", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openDrawing(page);

  await page.getByLabel("View label", { exact: true }).fill("FRONT CUSTOM");
  await page.getByLabel("View scale").fill("2");
  await viewField(page, "x").fill("12");
  await viewField(page, "y").fill("16");
  await viewField(page, "w").fill("80");
  await viewField(page, "h").fill("50");
  let state = await drawingState(page);
  expect(state.sheet.viewConfig?.front).toMatchObject({
    label: "FRONT CUSTOM",
    x: 12,
    y: 16,
    w: 80,
    h: 50,
  });
  expect(state.sheet.viewScales?.front).toBe(2);

  await page.getByLabel("Lock view").check();
  await expect(page.getByLabel("View label", { exact: true })).toBeDisabled();
  await expect(viewField(page, "x")).toBeDisabled();
  state = await drawingState(page);
  expect(state.sheet.viewConfig?.front?.locked).toBe(true);
  await page.getByLabel("Lock view").uncheck();
  await expect(viewField(page, "x")).toBeEnabled();

  await page.getByLabel("Configured view").selectOption("top");
  await page.getByLabel("View parent").selectOption("front");
  await page.getByLabel("View alignment").selectOption("above");
  await page.getByLabel("Suppress view").check();
  state = await drawingState(page);
  expect(state.sheet.viewConfig?.top).toMatchObject({
    parent: "front",
    alignment: "above",
    suppressed: true,
  });
  await page.getByLabel("Suppress view").uncheck();

  await page.getByLabel("Custom view label").fill("TOP ISO");
  await page.getByLabel("Custom view direction X").fill("0.5");
  await page.getByLabel("Custom view direction Y").fill("0.5");
  await page.getByLabel("Custom view direction Z").fill("0.5");
  await page.getByRole("button", { name: "Add view" }).click();
  state = await drawingState(page);
  expect(state.sheet.customViews).toHaveLength(1);
  expect(state.sheet.customViews?.[0]?.label).toBe("TOP ISO");
  expect(state.sheet.customViews?.[0]?.direction.x).toBeCloseTo(0.5);
  await expect(page.getByTestId("drawing-sheet")).toContainText("TOP ISO");
  await page.locator('[data-testid^="drawing-remove-custom-view-"]').click();
  state = await drawingState(page);
  expect(state.sheet.customViews).toHaveLength(0);

  await page.getByLabel("Section view").check();
  await page.getByLabel("Section axis").selectOption("y");
  await page.getByLabel("Section offset").fill("3");
  await page.getByLabel("Section direction").selectOption("-1");
  await page.getByLabel("Section depth").fill("4");
  await page.getByLabel("Section hatch angle").fill("30");
  await page.getByLabel("Section hatch spacing").fill("2");
  state = await drawingState(page);
  expect(state.sheet.section).toMatchObject({
    axis: "y",
    offset: 3,
    direction: -1,
    depth: 4,
    hatchAngle: 30,
    hatchSpacing: 2,
  });

  await page.getByLabel("Detail view").check();
  await page.getByLabel("Detail center X").fill("5");
  await page.getByLabel("Detail center Y").fill("6");
  await page.getByLabel("Detail radius").fill("10");
  state = await drawingState(page);
  expect(state.sheet.detail).toMatchObject({
    centerX: 5,
    centerY: 6,
    radius: 10,
  });

  await page.getByLabel("Auxiliary view").check();
  await page.getByLabel("Auxiliary direction X").fill("0.5");
  await page.getByLabel("Auxiliary direction Y").fill("0.2");
  await page.getByLabel("Auxiliary direction Z").fill("0.8");
  state = await drawingState(page);
  expect(state.sheet.auxiliary?.direction.x).toBeCloseTo(0.5);
  expect(state.sheet.auxiliary?.direction.y).toBeCloseTo(0.2);
  expect(state.sheet.auxiliary?.direction.z).toBeCloseTo(0.8);

  await page.getByLabel("Broken-out view").check();
  await page.getByLabel("Broken-out centerX").fill("-3");
  await page.getByLabel("Broken-out centerY").fill("4");
  await page.getByLabel("Broken-out radius").fill("12");
  state = await drawingState(page);
  expect(state.sheet.brokenOut).toMatchObject({
    centerX: -3,
    centerY: 4,
    radius: 12,
  });
});

test("drawing BOM overrides and associative dimensions", async ({ page }) => {
  test.setTimeout(120_000);
  await openDrawing(page);

  const bomNumbers = page.locator('[aria-label^="BOM number "]');
  expect(await bomNumbers.count()).toBeGreaterThanOrEqual(2);
  const key0 = (
    (await bomNumbers.nth(0).getAttribute("aria-label")) ?? ""
  ).replace("BOM number ", "");
  const key1 = (
    (await bomNumbers.nth(1).getAttribute("aria-label")) ?? ""
  ).replace("BOM number ", "");
  expect(key0).not.toBe("");
  expect(key1).not.toBe(key0);

  await page.getByLabel("BOM column vendor").check();
  await page.getByLabel("BOM column qty").uncheck();
  await page.getByLabel(`BOM item ${key0}`).fill("7");
  await page.getByLabel(`BOM number ${key0}`).fill("PN-777");
  await page.getByLabel(`BOM description ${key0}`).fill("CUSTOM PLATE");
  await page.getByLabel(`Move BOM row ${key1} up`).click();

  let state = await drawingState(page);
  expect(state.bom?.columns).toContain("vendor");
  expect(state.bom?.columns).not.toContain("qty");
  expect(state.bom?.overrides?.[key0]).toMatchObject({
    item: 7,
    number: "PN-777",
    description: "CUSTOM PLATE",
  });
  expect(state.bom?.rowOrder?.[0]).toBe(key1);
  await expect(page.getByTestId("drawing-bom")).toHaveAttribute(
    "data-columns",
    /vendor/,
  );
  await expect(page.getByTestId("drawing-bom")).toContainText("PN-777");
  await expect(page.getByTestId("drawing-bom")).toContainText("CUSTOM PLATE");

  await page.getByLabel("Dimension view").selectOption("front");
  await page.getByLabel("Dimension axis").selectOption("vertical");
  await page.getByLabel("Dimension kind").selectOption("linear");
  await page.getByLabel("Dimension text size").fill("4");
  await page
    .getByLabel("Dimension tolerance", { exact: true })
    .selectOption("symmetric");
  await page.getByLabel("Dimension tolerance upper").fill("0.2");
  await page.getByLabel("Dimension tolerance lower").fill("0.1");

  const bodySelect = page.getByLabel("Anchor dimension to body");
  const bodyValue = await bodySelect
    .locator("option")
    .nth(1)
    .getAttribute("value");
  expect(bodyValue).toBeTruthy();
  await bodySelect.selectOption(bodyValue!);
  await expect(page.getByLabel("Dimension edge")).toBeEnabled();
  await page.getByLabel("Dimension edge").selectOption({ index: 1 });
  await expect(page.getByLabel("Dimension edge")).toHaveValue(/\d+/);
  await page.getByRole("button", { name: "Add dimension" }).click();

  state = await drawingState(page);
  expect(state.dimensions).toHaveLength(1);
  expect(state.dimensions?.[0]).toMatchObject({
    view: "front",
    axis: "vertical",
    kind: "linear",
    bodyId: bodyValue,
    textSize: 4,
    tolerance: { type: "symmetric", upper: 0.2, lower: -0.1 },
  });
  expect(state.dimensions?.[0]?.edgeIndex).toEqual(expect.any(Number));

  await page.locator('[data-testid^="drawing-dimension-offset-"]').fill("12");
  state = await drawingState(page);
  expect(state.dimensions?.[0]?.offset).toBe(12);

  await page.locator('[data-testid^="drawing-dimension-delete-"]').click();
  state = await drawingState(page);
  expect(state.dimensions).toHaveLength(0);

  await page.getByLabel("Dimension kind").selectOption("diameter");
  await page
    .getByLabel("Dimension tolerance", { exact: true })
    .selectOption("fit");
  await page.getByLabel("Dimension fit").fill("H7/g6");
  await page.getByRole("button", { name: "Add dimension" }).click();
  state = await drawingState(page);
  expect(state.dimensions?.[0]).toMatchObject({
    kind: "diameter",
    circleIndex: 0,
    tolerance: { type: "fit", fit: "H7/g6" },
  });
  await page.locator('[data-testid^="drawing-dimension-delete-"]').click();
});

test("drawing GD&T, notes, balloons, print and export verification", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openDrawing(page);

  const gdtBody = page.getByLabel("Anchor GD&T to body");
  const gdtBodyValue = await gdtBody
    .locator("option")
    .nth(1)
    .getAttribute("value");
  expect(gdtBodyValue).toBeTruthy();
  await gdtBody.selectOption(gdtBodyValue!);

  await page.getByLabel("GD&T type").selectOption("feature-control");
  await page.getByLabel("GD&T characteristic").selectOption("position");
  await page.getByLabel("GD&T tolerance").fill("0.2");
  await page.getByLabel("GD&T datums").fill("A B");
  await page.getByLabel("Diameter zone").check();
  await page.getByRole("button", { name: "Add GD&T annotation" }).click();

  await page.getByLabel("GD&T type").selectOption("datum");
  await page.getByLabel("Datum label").fill("B");
  await page.getByRole("button", { name: "Add GD&T annotation" }).click();

  await page.getByLabel("GD&T type").selectOption("surface-finish");
  await page.getByLabel("Surface finish Ra").fill("1.6");
  await page.getByRole("button", { name: "Add GD&T annotation" }).click();

  await page.getByLabel("GD&T type").selectOption("weld");
  await page.getByLabel("Weld type").selectOption("groove");
  await page.getByLabel("Weld size").fill("4");
  await page.getByLabel("Weld length").fill("10");
  await page.getByLabel("Weld pitch").fill("20");
  await page.getByLabel("All-around weld").check();
  await page.getByRole("button", { name: "Add GD&T annotation" }).click();

  let state = await drawingState(page);
  expect(state.gdt).toHaveLength(4);
  expect(state.gdt?.[0]).toMatchObject({
    type: "feature-control",
    characteristic: "position",
    tolerance: 0.2,
    diameter: true,
    datums: ["A", "B"],
    bodyId: gdtBodyValue,
  });
  expect(state.gdt?.[1]).toMatchObject({ type: "datum", datum: "B" });
  expect(state.gdt?.[2]).toMatchObject({ type: "surface-finish", ra: 1.6 });
  expect(state.gdt?.[3]).toMatchObject({
    type: "weld",
    weldType: "groove",
    weldSize: 4,
    weldLength: 10,
    weldPitch: 20,
    allAround: true,
  });
  await expect(page.getByTestId("drawing-gdt")).toContainText("POS");
  await expect(page.getByTestId("drawing-gdt")).toContainText("Ra 1.6");
  await expect(page.getByTestId("drawing-gdt")).toContainText(
    "WELD GROOVE 4 L10 P20 ALL AROUND",
  );
  await page.locator('[data-testid^="drawing-gdt-delete-"]').first().click();
  state = await drawingState(page);
  expect(state.gdt).toHaveLength(3);

  await page.getByLabel("New note").fill("CHECK EDGES");
  await page.getByLabel("Add note").click();
  state = await drawingState(page);
  expect(state.notes).toHaveLength(1);
  const noteId = state.notes[0]!.id;
  await page
    .locator(`[data-testid^="drawing-note-text-"]`)
    .fill("CHECK ALL EDGES");
  await page.locator('[data-testid^="drawing-note-x-"]').fill("20");
  await page.locator('[data-testid^="drawing-note-y-"]').fill("22");
  await page.locator('[data-testid^="drawing-note-textSize-"]').fill("4");
  await page.locator('[data-testid^="drawing-note-landing-"]').fill("6");
  await page.getByLabel("Note leader").check();
  state = await drawingState(page);
  expect(state.notes[0]).toMatchObject({
    text: "CHECK ALL EDGES",
    x: 20,
    y: 22,
    textSize: 4,
    landing: 6,
    leader: true,
  });
  await expect(page.getByTestId("drawing-notes")).toContainText(
    "CHECK ALL EDGES",
  );
  await page.locator('[data-testid^="drawing-note-delete-"]').click();
  state = await drawingState(page);
  expect(state.notes).toHaveLength(0);
  await expect(page.getByTestId("drawing-notes")).toHaveCount(0);
  expect(noteId).toBeTruthy();

  const balloonBody = page.getByLabel("Anchor balloon to body");
  const balloonBodyValue = await balloonBody
    .locator("option")
    .nth(1)
    .getAttribute("value");
  expect(balloonBodyValue).toBeTruthy();
  await balloonBody.selectOption(balloonBodyValue!);
  await page.getByLabel("New balloon").fill("A");
  await page.getByLabel("Add balloon").click();
  state = await drawingState(page);
  expect(state.balloons).toHaveLength(1);
  const balloonId = state.balloons[0]!.id;
  expect(state.balloons[0]?.bodyId).toBe(balloonBodyValue);
  expect(state.balloons[0]?.bomKey).toBeTruthy();

  await page.locator('[data-testid^="drawing-balloon-label-"]').fill("9");
  await page.locator('[data-testid^="drawing-balloon-x-"]').fill("30");
  await page.locator('[data-testid^="drawing-balloon-y-"]').fill("32");
  await page.locator('[data-testid^="drawing-balloon-textSize-"]').fill("4");
  await page.locator('[data-testid^="drawing-balloon-landing-"]').fill("8");
  await page.getByLabel("Balloon leader").check();
  state = await drawingState(page);
  expect(state.balloons[0]).toMatchObject({
    label: "9",
    x: 30,
    y: 32,
    textSize: 4,
    landing: 8,
    leader: true,
  });
  await expect(page.getByTestId("drawing-balloons")).toContainText("9");

  await page.getByRole("button", { name: "Link to BOM" }).click();
  state = await drawingState(page);
  expect(state.balloons[0]?.label).toMatch(/^\d+$/);

  await page.locator('[data-testid^="drawing-balloon-label-"]').fill("A");
  await page.getByRole("button", { name: "Renumber balloons" }).click();
  state = await drawingState(page);
  expect(state.balloons[0]?.label).toBe("1");
  expect(state.balloons[0]?.bomKey).toBeTruthy();

  await page.locator('[data-testid^="drawing-balloon-delete-"]').click();
  state = await drawingState(page);
  expect(state.balloons).toHaveLength(0);
  expect(balloonId).toBeTruthy();

  await page.getByLabel("Drawing title").fill("PRINT CHECK");
  await page.getByRole("button", { name: "Verify export" }).click();
  await expect(page.getByTestId("drawing-export-verification")).toContainText(
    "Export verified",
  );
  await expect(page.getByTestId("drawing-export-verification")).toContainText(
    /1 sheet\(s\)/,
  );

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print / plot" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup.locator("body")).toContainText("PRINT CHECK");
  await popup.close();
});
