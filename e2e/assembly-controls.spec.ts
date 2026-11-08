import { expect, test, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

type AssemblyInstanceState = {
  id: string;
  bodyId?: string;
  partId: string;
  name?: string;
  visible?: boolean;
  suppressed?: boolean;
  grounded?: boolean;
  folder?: string;
  explode?: number;
  transform: number[];
  metadata?: Record<string, string>;
  appearance?: { color?: string; opacity?: number };
  connectors?: {
    id: string;
    name: string;
    offset?: number[];
    flip?: boolean;
  }[];
};

type AssemblyState = {
  instances: AssemblyInstanceState[];
  mates: {
    id: string;
    kind: string;
    enabled?: boolean;
    suppressed?: boolean;
    value?: number;
    min?: number;
    max?: number;
    a: { bodyId: string; ref: string };
    b: { bodyId: string; ref: string };
  }[];
  features?: { id: string; kind: string }[];
  displayStates?: {
    id: string;
    name: string;
    visibility: Record<string, boolean>;
  }[];
  bomOverrides?: Record<
    string,
    {
      number?: string;
      description?: string;
      materialId?: string;
      revision?: string;
      vendor?: string;
    }
  >;
};

async function assemblyState(page: Page): Promise<AssemblyState> {
  return page.evaluate(() => {
    const debug = (
      window as unknown as {
        __cadDebug?: {
          scadgen?: { assembly?: { state: () => unknown } };
        };
      }
    ).__cadDebug;
    return (debug?.scadgen?.assembly?.state() ?? {
      instances: [],
      mates: [],
    }) as AssemblyState;
  });
}

async function openAssembly(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1800, height: 1200 });
  await loadAppReady(page);
  await page.evaluate(async () => {
    window.__cadDebug!.scadgen!.box(40, 20, 10);
    window.__cadDebug!.scadgen!.box(10, 10, 10);
    await window.__cadDebug!.scadgen!.idle();
  });
  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-assembly").click();
  await expect(page.getByTestId("assembly-workspace")).toBeVisible();
  await expect(page.getByText(/0 top-level · 0 leaves/)).toBeVisible();
}

async function addSourceBodies(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index++) {
    await page.getByRole("button", { name: /Add source body/ }).click();
  }
}

async function setRangeValue(
  page: Page,
  label: string,
  value: number,
): Promise<void> {
  await page.getByRole("slider", { name: label }).evaluate((element, next) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("assembly toolbar, catalog, instance rows and subassemblies", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openAssembly(page);
  const workspace = page.getByTestId("assembly-workspace");
  const toolbar = page.getByTestId("assembly-toolbar");

  // Insert menu -> real source body instance.
  await page.getByTitle("Insert").click();
  await page.getByTestId("assembly-insert-body").first().click();
  await expect(page.getByText(/1 top-level · 1 leaves/)).toBeVisible();
  await addSourceBodies(page, 1);
  await expect(page.getByText(/2 top-level · 2 leaves/)).toBeVisible();

  // Toolbar: Mate jumps to the mate editor, Move exposes the viewport drag
  // layer, Explode toggles the real explode state, Solve runs the solver.
  await page.getByLabel("Mate", { exact: true }).click();
  await expect(page.locator("#assembly-mates-section")).toBeInViewport();
  await page.locator('[data-testid^="assembly-instance-"]').first().click();
  await page.getByLabel("Move instance").click();
  await expect(page.getByTestId("assembly-viewport-drag")).toBeVisible();
  await toolbar.getByLabel("Explode assembly").click();
  await expect(toolbar.getByLabel("Explode assembly")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(toolbar.getByText("Collapse")).toBeVisible();
  await toolbar.getByLabel("Explode assembly").click();
  await expect(toolbar.getByLabel("Explode assembly")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await toolbar.getByLabel("Solve assembly").click();
  await expect(page.getByText(/SOLVED|NOT SOLVED/).first()).toBeVisible();

  // Browse standard content scrolls the sidebar to the catalog section.
  await page.locator("#assembly-mates-section").scrollIntoViewIfNeeded();
  await page.getByTitle("Insert").click();
  await page.getByRole("button", { name: "Browse standard content…" }).click();
  await expect(page.locator("#assembly-standard-content")).toBeInViewport();

  // Catalog search, kind filters, selected part defaults and insertion.
  await page.getByLabel("Filter catalog by washer").click();
  await expect(page.getByLabel("Catalog part").locator("option")).toHaveCount(
    2,
  );
  await page.getByLabel("Catalog search").fill("M8");
  await expect(page.getByLabel("Catalog part").locator("option")).toHaveCount(
    1,
  );
  await page.getByLabel("Catalog search").fill("");
  await page.getByLabel("Filter catalog by all").click();
  await expect(page.getByLabel("Catalog part").locator("option")).toHaveCount(
    6,
  );
  await page.getByLabel("Catalog part").selectOption("iso-4762-m8x30");
  await expect(page.getByLabel("Catalog length")).toHaveValue("30");
  await expect(page.getByLabel("Catalog radius")).toHaveValue("4");
  await page.getByLabel("Catalog length").fill("25");
  await page.getByLabel("Catalog radius").fill("4.5");
  await page.getByLabel("Catalog count").fill("1");
  await page.getByTestId("assembly-insert-standard").click();
  await expect(
    page.getByText(/Inserted 1 × Socket head cap screw/).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/3 top-level · 3 leaves/)).toBeVisible();

  // Assembly body selector drives which source body is instanced.
  await page.getByLabel("Assembly body").selectOption({ index: 1 });
  await addSourceBodies(page, 1);
  await expect(page.getByText(/4 top-level · 4 leaves/)).toBeVisible();

  // Instance row: select, visibility, suppression, grounded, rename, folder,
  // per-instance explode, duplicate and remove.
  await page.getByTestId("assembly-select-instance").first().check();
  await expect(
    page.getByTestId("assembly-select-instance").first(),
  ).toBeChecked();
  const visible = page.getByTestId("assembly-visible-instance").first();
  await visible.uncheck();
  expect((await assemblyState(page)).instances[0]?.visible).toBe(false);
  await visible.check();
  const suppressed = page.getByLabel(/^Suppressed inst_/).first();
  await suppressed.check();
  expect((await assemblyState(page)).instances[0]?.suppressed).toBe(true);
  await suppressed.uncheck();
  const grounded = page.getByLabel(/^Grounded inst_/).first();
  await grounded.check();
  expect((await assemblyState(page)).instances[0]?.grounded).toBe(true);
  await grounded.uncheck();

  const rename = page.getByTestId("assembly-rename-instance").first();
  await rename.fill("Bracket");
  await rename.press("Tab");
  await expect
    .poll(async () => (await assemblyState(page)).instances[0]?.name)
    .toBe("Bracket");
  const folder = page.getByTestId("assembly-folder-instance").first();
  await folder.fill("Gear");
  await folder.press("Tab");
  await page
    .getByTestId("assembly-folder-filter")
    .filter({ hasText: "Gear" })
    .click();
  await expect(
    page.locator('[data-testid^="assembly-instance-"]').first(),
  ).toBeVisible();
  await page.getByLabel("Show all folders").click();

  const explode = page.getByTestId("assembly-explode-instance").first();
  await explode.fill("7");
  expect((await assemblyState(page)).instances[0]?.explode).toBe(7);

  const beforeDuplicate = (await assemblyState(page)).instances.length;
  await page
    .getByLabel(/^Duplicate inst_/)
    .first()
    .click();
  await expect
    .poll(async () => (await assemblyState(page)).instances.length)
    .toBe(beforeDuplicate + 1);
  const beforeRemove = (await assemblyState(page)).instances.length;
  await page.getByTestId("assembly-remove-instance").last().click();
  await expect
    .poll(async () => (await assemblyState(page)).instances.length)
    .toBe(beforeRemove - 1);

  // Group two rows into a subassembly, exercise the nested row controls, then
  // dissolve it again.
  await page.getByTestId("assembly-select-instance").nth(0).check();
  await page.getByTestId("assembly-select-instance").nth(1).check();
  await page.getByLabel("Subassembly name").fill("Gear set");
  await page.getByTestId("assembly-group").click();
  const subRow = page
    .locator('[data-testid^="assembly-instance-sub_"]')
    .first();
  await expect(subRow).toContainText("Gear set");
  const nested = page.locator("details").filter({ hasText: /nested instance/ });
  await nested.locator("summary").click();
  await nested
    .getByLabel(/^Select instance /)
    .first()
    .click();
  await nested.getByTestId("assembly-visible-nested").last().uncheck();
  await nested.getByTestId("assembly-focus-nested").first().click();
  await expect(page.getByTestId("assembly-viewport-drag")).toBeVisible();
  await page.getByTestId("assembly-ungroup").first().click();
  await expect(page.getByText(/4 top-level · 4 leaves/)).toBeVisible();

  // Selected instance panel: name, metadata, appearance, clear, body replace
  // and delete.
  await page.locator('[data-testid^="assembly-instance-"]').first().click();
  const targetId = (await assemblyState(page)).instances[0]!.id;
  await page.getByLabel("Instance name").fill("Left bracket");
  await page.getByLabel("Instance name").press("Tab");
  const metadata: [string, string][] = [
    ["Instance number", "PN-100"],
    ["Instance description", "L-bracket"],
    ["Instance material", "Aluminum 6061"],
    ["Instance revision", "B"],
    ["Instance vendor", "Acme"],
  ];
  for (const [label, value] of metadata) {
    await page.getByLabel(label).fill(value);
    await page.getByLabel(label).press("Tab");
  }
  await expect
    .poll(
      async () => (await assemblyState(page)).instances[0]?.metadata?.number,
    )
    .toBe("PN-100");

  await page.getByLabel("Instance appearance color").evaluate((element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "#ff0000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByLabel("Instance appearance opacity").fill("0.4");
  await workspace
    .getByRole("button", { name: "Appearance", exact: true })
    .click();
  await expect
    .poll(async () => (await assemblyState(page)).instances[0]?.appearance)
    .toEqual({ color: "#ff0000", opacity: 0.4 });
  await workspace.getByTestId("assembly-clear-appearance").click();
  await expect
    .poll(async () => (await assemblyState(page)).instances[0]?.appearance)
    .toBeUndefined();

  const originalBody = (await assemblyState(page)).instances[0]?.bodyId;
  await page.getByLabel("Replacement body").selectOption({ index: 1 });
  await workspace.getByTestId("assembly-replace-body").click();
  await expect
    .poll(async () => (await assemblyState(page)).instances[0]?.bodyId)
    .not.toBe(originalBody);

  const beforeDelete = (await assemblyState(page)).instances.length;
  await workspace.getByTestId("assembly-delete-instance").click();
  await expect
    .poll(async () => (await assemblyState(page)).instances.length)
    .toBe(beforeDelete - 1);
  expect(targetId.length).toBeGreaterThan(0);

  // Linked references: the panel action and the Insert menu both add a real
  // linked reference to the assembly.
  const beforeLinked = (await assemblyState(page)).instances.length;
  await page.getByTestId("assembly-linked-tab").selectOption({ index: 0 });
  await page.getByTestId("assembly-insert-linked").click();
  await expect
    .poll(async () => (await assemblyState(page)).instances.length)
    .toBeGreaterThan(beforeLinked);
  const beforeMenuLinked = (await assemblyState(page)).instances.length;
  await page.getByTitle("Insert").click();
  await page.getByTestId("assembly-insert-linked-menu").first().click();
  await expect
    .poll(async () => (await assemblyState(page)).instances.length)
    .toBeGreaterThan(beforeMenuLinked);
});

test("assembly mates, connectors, solve and drag", async ({ page }) => {
  test.setTimeout(240_000);
  await openAssembly(page);
  await addSourceBodies(page, 2);
  await expect(page.getByText(/2 top-level · 2 leaves/)).toBeVisible();

  const instances = (await assemblyState(page)).instances;
  const a = instances[0]!.id;
  const b = instances[1]!.id;

  await page.getByLabel("Mate instance A").selectOption(a);
  await page.getByLabel("Mate instance B").selectOption(b);
  await page.getByLabel("Mate connector A").selectOption("body");
  await page.getByLabel("Mate connector B").selectOption("body");
  await page.getByLabel("Mate type").selectOption("distance");
  await page.getByLabel("Mate value").fill("12.5");
  await page.getByLabel("Mate minimum").fill("5");
  await page.getByLabel("Mate maximum").fill("20");
  await page.getByRole("button", { name: "+ Mate selected instances" }).click();
  await expect
    .poll(async () => (await assemblyState(page)).mates.length)
    .toBe(1);
  await expect
    .poll(async () => (await assemblyState(page)).mates[0]?.value)
    .toBe(12.5);
  expect((await assemblyState(page)).mates[0]?.min).toBe(5);
  expect((await assemblyState(page)).mates[0]?.max).toBe(20);

  const mateId = (await assemblyState(page)).mates[0]!.id;
  await page.getByTestId("assembly-edit-mate-kind").selectOption("angle");
  await page.getByTestId("assembly-edit-mate-a").fill("axis-z");
  await page.getByTestId("assembly-edit-mate-a").press("Tab");
  await page.getByTestId("assembly-edit-mate-b").fill("axis-z");
  await page.getByTestId("assembly-edit-mate-b").press("Tab");
  await page.getByTestId("assembly-mate-value").fill("45");
  await page.getByTestId("assembly-mate-value").press("Tab");
  await page.getByTestId("assembly-mate-min").fill("10");
  await page.getByTestId("assembly-mate-min").press("Tab");
  await page.getByTestId("assembly-mate-max").fill("90");
  await page.getByTestId("assembly-mate-max").press("Tab");
  await expect
    .poll(async () => (await assemblyState(page)).mates[0])
    .toMatchObject({
      id: mateId,
      kind: "angle",
      value: 45,
      min: 10,
      max: 90,
      a: { bodyId: a, ref: "axis-z" },
      b: { bodyId: b, ref: "axis-z" },
    });

  await page.getByTestId("assembly-enable-mate").uncheck();
  expect((await assemblyState(page)).mates[0]?.enabled).toBe(false);
  await page.getByTestId("assembly-suppress-mate").check();
  expect((await assemblyState(page)).mates[0]?.suppressed).toBe(true);
  await page.getByTitle("Focus instance A").click();
  await expect(page.getByTestId("assembly-viewport-drag")).toBeVisible();
  await page.getByTestId("assembly-remove-mate").click();
  await expect
    .poll(async () => (await assemblyState(page)).mates.length)
    .toBe(0);

  // Named connector: offsets are authored in millimetres, stored in metres.
  await page.getByLabel("Connector instance").selectOption(a);
  await page.getByLabel("Connector base").selectOption("body");
  await page.getByLabel("Connector name").fill("Mount");
  await page.getByLabel("Connector offset X").fill("10");
  await page.getByLabel("Connector offset Y").fill("2");
  await page.getByLabel("Connector offset Z").fill("3");
  await page.getByLabel("Flip connector").check();
  await page.getByLabel("Connector pick kind").selectOption("axis");
  await expect(page.getByLabel("Connector pick kind")).toHaveValue("axis");
  await page.getByRole("button", { name: "Add connector" }).click();
  await expect
    .poll(
      async () => (await assemblyState(page)).instances[0]?.connectors?.length,
    )
    .toBe(1);
  const connector = (await assemblyState(page)).instances[0]!.connectors![0]!;
  expect(connector.name).toBe("Mount");
  expect(connector.offset?.[0]).toBeCloseTo(0.01, 6);
  expect(connector.offset?.[1]).toBeCloseTo(0.002, 6);
  expect(connector.offset?.[2]).toBeCloseTo(0.003, 6);
  expect(connector.flip).toBe(true);

  // Pick a connector on the real viewport; frame the model first so the
  // centre ray hits an actual body, then click the pick layer.
  await page.getByRole("button", { name: "Fit all" }).click({ force: true });
  await page.getByRole("button", { name: "Pick connector" }).click();
  await expect(page.getByText(/Pick a axis in the viewport/)).toBeVisible();
  const pickLayer = page.getByTestId("assembly-pick-layer");
  await expect(pickLayer).toBeVisible();
  const pickBox = await pickLayer.boundingBox();
  expect(pickBox).not.toBeNull();
  await page.mouse.click(
    pickBox!.x + pickBox!.width / 2,
    pickBox!.y + pickBox!.height / 2,
  );
  await expect(page.getByText(/connector added at/)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("assembly-remove-connector").first().click();
  await expect
    .poll(
      async () => (await assemblyState(page)).instances[0]?.connectors?.length,
    )
    .toBe(1);

  await page.getByTestId("assembly-solve-place").click();
  await expect(page.getByText(/SOLVED|NOT SOLVED/).first()).toBeVisible();

  // Drag with mates: authored delta and the live residual slider.
  await page.locator('[data-testid^="assembly-instance-"]').first().click();
  const beforeX = (await assemblyState(page)).instances[0]!.transform[3]!;
  await page.getByLabel("Drag delta X").fill("5");
  await page.getByLabel("Drag delta Y").fill("0");
  await page.getByLabel("Drag delta Z").fill("0");
  await page
    .getByRole("button", { name: "Drag selected · live residual" })
    .click();
  await expect
    .poll(async () => (await assemblyState(page)).instances[0]!.transform[3]!)
    .not.toBe(beforeX);
  const afterStep = (await assemblyState(page)).instances[0]!.transform[3]!;
  await setRangeValue(page, "Live drag X", 10);
  await expect
    .poll(async () => (await assemblyState(page)).instances[0]!.transform[3]!)
    .not.toBe(afterStep);
  await expect(page.getByText(/residual/).first()).toBeVisible();
});

test("assembly features, patterns, states, BOM and interference", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openAssembly(page);
  await addSourceBodies(page, 2);
  await expect(page.getByText(/2 top-level · 2 leaves/)).toBeVisible();

  // Overlapping instances are reported by the interference check.
  await expect(page.getByTestId("assembly-interference-count")).toContainText(
    /[1-9]\d* penetrating/,
  );
  await page.getByLabel("Interference clearance").fill("5");
  await expect(page.getByLabel("Interference clearance")).toHaveValue("5");
  await page.getByRole("button", { name: "focus pair" }).first().click();
  await expect(page.getByTestId("assembly-viewport-drag")).toBeVisible();

  // In-context feature: apply, edit and delete a real hole.
  await page
    .getByTestId("assembly-feature-instance")
    .selectOption({ index: 1 });
  await page.getByLabel("Assembly feature kind").selectOption("hole");
  await page.getByLabel("Assembly feature axis").selectOption("x");
  await page.getByLabel("Assembly feature radius").fill("4");
  await page.getByLabel("Assembly feature depth").fill("8");
  await page.getByLabel("Assembly feature offset X").fill("3");
  await page.getByLabel("Assembly feature offset Y").fill("0");
  await page.getByLabel("Assembly feature offset Z").fill("0");
  await page.getByTestId("assembly-pick-feature").click();
  await expect(page.getByTestId("assembly-pick-layer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("assembly-pick-layer")).toBeHidden();
  await page.getByTestId("assembly-apply-feature").click();
  await expect(page.getByText(/In-context hole through/)).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(async () => (await assemblyState(page)).features?.length ?? 0)
    .toBe(1);
  await page.getByTestId("assembly-edit-feature").first().click();
  await page.getByLabel("Assembly feature kind").selectOption("boss");
  await expect(page.getByTestId("assembly-apply-feature")).toHaveAttribute(
    "aria-label",
    "Update boss feature",
  );
  await page.getByTestId("assembly-apply-feature").click();
  await expect(page.getByText(/In-context boss on/)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("assembly-delete-feature").first().click();
  await expect
    .poll(async () => (await assemblyState(page)).features?.length ?? 0)
    .toBe(0);

  // Linear pattern creates real instances along the chosen axis.
  const beforePattern = (await assemblyState(page)).instances.length;
  await page.getByLabel("Pattern instance").selectOption({ index: 1 });
  await page.getByLabel("Pattern axis").selectOption("y");
  await page.getByLabel("Pattern count").fill("3");
  await page.getByLabel("Pattern spacing").fill("20");
  await page.getByRole("button", { name: "Apply linear pattern" }).click();
  await expect
    .poll(async () => (await assemblyState(page)).instances.length)
    .toBe(beforePattern + 2);

  await page.getByRole("button", { name: "auto-explode" }).click();
  expect(
    (await assemblyState(page)).instances.some(
      (item) => (item.explode ?? 0) > 0,
    ),
  ).toBe(true);
  await setRangeValue(page, "Explode assembly", 25);
  await expect(page.getByText(/Explode 25.0 mm/)).toBeVisible();

  // Display states capture and restore visibility.
  const firstInstance = (await assemblyState(page)).instances[0]!;
  await page.getByLabel(`Visible ${firstInstance.id}`).first().uncheck();
  await page.getByLabel("Display state name").fill("Front");
  await page.getByRole("button", { name: "Save state" }).click();
  await expect(page.getByLabel("Display state", { exact: true })).toContainText(
    "Front",
  );
  await page.getByLabel(`Visible ${firstInstance.id}`).first().check();
  await page
    .getByLabel("Display state", { exact: true })
    .selectOption({ label: "Front" });
  await expect(
    page.getByLabel(`Visible ${firstInstance.id}`).first(),
  ).not.toBeChecked();
  await page.getByTestId("assembly-apply-state").first().click();
  await page.getByTestId("assembly-delete-state").first().click();
  await expect(page.getByTestId("assembly-delete-state")).toHaveCount(0);

  // Named position saves the current explode/transforms and reapplies it.
  await page.getByLabel("Position name").fill("Exploded");
  await page.getByTestId("assembly-save-position").click();
  await expect(page.getByLabel("Named position")).toContainText("Exploded");
  await page.getByLabel("Named position").selectOption("Exploded");
  await expect(page.getByText(/Explode 25.0 mm/)).toBeVisible();

  // Performance fixture and a real budget run.
  await page.getByRole("button", { name: "Run 21-instance budget" }).click();
  await expect(page.getByText(/BUDGET PASS|BUDGET FAIL/)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("Load benchmark assembly").click();
  await expect(page.getByText(/8 top-level · 21 leaves/)).toBeVisible({
    timeout: 30_000,
  });

  // BOM: mode, columns, edits, CSV export.
  await page.getByLabel("Show BOM").click();
  await expect(page.getByText(/23 rows/)).toBeVisible();
  await page.getByLabel("BOM mode").selectOption("flat");
  await expect(page.getByLabel("BOM mode")).toHaveValue("flat");
  await page.getByLabel("BOM mode").selectOption("indented");
  await expect(page.getByLabel("BOM mode")).toHaveValue("indented");

  await page.getByText("Columns", { exact: true }).click();
  await expect(page.getByTestId("assembly-bom-column")).toHaveCount(8);
  await page.getByTestId("assembly-bom-column").nth(6).check();
  await page.getByTestId("assembly-bom-column").nth(7).check();
  await expect(
    page.getByRole("columnheader", { name: "Revision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Vendor" }),
  ).toBeVisible();

  const number = page.getByTestId("assembly-bom-number").first();
  await number.fill("PN-900");
  await number.press("Tab");
  const description = page.getByTestId("assembly-bom-description").first();
  await description.fill("Custom bracket");
  await description.press("Tab");
  await page
    .getByTestId("assembly-bom-material")
    .first()
    .selectOption("aluminum");
  const revision = page.getByTestId("assembly-bom-revision").first();
  await revision.fill("C");
  await revision.press("Tab");
  const vendor = page.getByTestId("assembly-bom-vendor").first();
  await vendor.fill("Acme");
  await vendor.press("Tab");
  await expect
    .poll(async () =>
      Object.values((await assemblyState(page)).bomOverrides ?? {}),
    )
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          number: "PN-900",
          description: "Custom bracket",
          materialId: "aluminum",
          revision: "C",
          vendor: "Acme",
        }),
      ]),
    );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-bom\.csv$/);
});
