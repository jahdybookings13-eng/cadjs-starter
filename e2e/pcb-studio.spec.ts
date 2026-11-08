import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("PCB Studio builds, checks and exports a two-sheet board", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1800, height: 1200 });
  await loadAppReady(page);

  await page.getByTestId("document-tab-add").click();
  await page.getByTestId("document-tab-create-pcbstudio").click();
  const workspace = page.getByTestId("scadstudio-pcb-workspace");
  await expect(workspace).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("pcb-demo").click();
  await expect(page.getByTestId("pcb-summary")).toContainText("6 parts");
  await expect(page.getByTestId("pcb-summary")).toContainText("2 sheets");
  await expect(page.getByTestId("pcb-summary")).toContainText("traces");
  await expect(page.getByTestId("pcb-summary")).toContainText("vias");

  // The demo opens the schematic, with both real sheets reachable.
  await expect(
    workspace.getByRole("button", { name: /^Sheet 1/ }),
  ).toBeVisible();
  await expect(
    workspace.getByRole("button", { name: /^Sheet 2/ }),
  ).toBeVisible();
  await workspace.getByRole("button", { name: /^Sheet 2/ }).click();
  await expect(
    workspace.getByRole("img", { name: /Schematic sheet Sheet 2/ }),
  ).toBeVisible();

  // The layout is real copper: pads, pours, traces, vias and silkscreen.
  await workspace.getByTestId("pcb-tab-board").click();
  await expect(page.getByTestId("scadstudio-pcb-layout")).toBeVisible();
  await expect(
    page.getByTestId("scadstudio-pcb-layout").locator("polygon").first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("scadstudio-pcb-layout").locator("polyline").first(),
  ).toBeVisible();

  // Rebuild from the toolbar; it must keep every net routed and DRC clean.
  await page.getByTestId("pcb-build").click();
  await expect(page.getByTestId("pcb-drc-run")).toBeEnabled({
    timeout: 60_000,
  });
  await page.getByTestId("pcb-drc-run").click();
  await expect(page.getByTestId("pcb-drc-summary")).toContainText(
    "0 error(s)",
    {
      timeout: 30_000,
    },
  );
  await expect(workspace.getByText("DRC-UNCONNECTED")).toHaveCount(0);

  // Fabrication files are generated locally and the ZIP is downloadable.
  await page.getByTestId("pcb-export").click();
  await expect(page.getByTestId("pcb-fab-summary")).toContainText(
    "Package ready",
    { timeout: 60_000 },
  );
  await expect(page.getByTestId("pcb-fab-file")).toHaveCount(11);
  for (const name of [
    "top-copper.gbr",
    "bottom-copper.gbr",
    "drill.drl",
    "pick-and-place.csv",
    "bom.csv",
    "README.txt",
  ]) {
    await expect(
      page.getByTestId("pcb-fab-file").filter({ hasText: name }),
    ).toBeVisible();
  }

  const pending = page.waitForEvent("download");
  await page.getByTestId("pcb-fab-download").click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("scadstudio-pcb-fab.zip");
  const path = await download.path();
  if (!path) throw new Error("fabrication ZIP has no local path");
  const bytes = await fs.readFile(path);
  expect(bytes.length).toBeGreaterThan(1000);
  expect([...bytes.subarray(0, 2)]).toEqual([0x50, 0x4b]);

  // The 3D assembly places real component solids and checks the enclosure lid.
  await workspace.getByTestId("pcb-tab-3d").click();
  await expect(page.getByTestId("pcb-3d-preview")).toBeVisible();
  await expect(
    page.getByTestId("pcb-3d-preview").locator("canvas"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check 3D assembly collisions" })
    .click();
  await expect(page.getByTestId("pcb-assembly-summary")).toContainText(
    "no enclosure collisions",
  );
  await expect(page.getByTestId("pcb-assembly-summary")).toContainText(
    "max height",
  );

  // The Virtual MCU tab runs the same real ECAD engine as the desk/VR panel.
  await workspace.getByTestId("pcb-tab-mcu").click();
  await expect(page.getByTestId("pcb-mcu-workbench")).toBeVisible();
  await expect(page.getByTestId("ecad-panel")).toBeVisible();
  await page.getByTestId("ecad-add-arduino-uno").click();
  await page.getByRole("button", { name: "ECAD code tab" }).click();
  await page.getByTestId("ecad-fw-select").selectOption("hello-serial");
  await page.getByTestId("ecad-run").click();
  await page.getByRole("button", { name: "ECAD serial tab" }).click();
  await expect(page.getByTestId("ecad-serial")).toContainText("scadgen alive", {
    timeout: 10_000,
  });

  // Leaving the tab must not dispose the simulator: the serial counter keeps
  // advancing while another PCB tab is open, and returning shows later output.
  const serialLast = async (): Promise<number> => {
    const text = (await page.getByTestId("ecad-serial").textContent()) ?? "";
    const counts = [...text.matchAll(/scadgen alive: (\d+)/g)].map((match) =>
      Number(match[1]),
    );
    return counts.length > 0 ? Math.max(...counts) : -1;
  };
  const serialBefore = await serialLast();
  await workspace.getByTestId("pcb-tab-board").click();
  await page.waitForTimeout(1_700);
  await workspace.getByTestId("pcb-tab-mcu").click();
  await expect
    .poll(serialLast, { timeout: 10_000 })
    .toBeGreaterThan(serialBefore);

  // PCB netlist bridge: link the demo MCU element to the placed Uno, apply the
  // routed nets and verify the link survives the document reload below.
  await expect(page.getByTestId("pcb-mcu-link-count")).toHaveText("0 linked");
  await page.getByTestId("pcb-mcu-link-element").selectOption("U1");
  await page.getByTestId("pcb-mcu-link-instance").selectOption("b1");
  await page.getByTestId("pcb-mcu-link-add").click();
  await expect(page.getByTestId("pcb-mcu-link-count")).toHaveText("1 linked");
  await page.getByTestId("pcb-mcu-unlink-U1").click();
  await expect(page.getByTestId("pcb-mcu-link-count")).toHaveText("0 linked");
  await page.getByTestId("pcb-mcu-link-add").click();
  await expect(page.getByTestId("pcb-mcu-link-count")).toHaveText("1 linked");
  await page.getByTestId("pcb-mcu-bridge-apply").click();
  await expect(page.getByTestId("pcb-mcu-bridge-status")).toContainText(
    "net wire(s) applied",
  );

  await expect(page.getByTestId("pcb-mcu-saved")).toContainText(
    "1 virtual part(s) saved",
    { timeout: 10_000 },
  );

  // Autosave and reload must restore the same board, sheets and copper.
  await expect(page.getByTestId("document-dirty-state")).toHaveText("Saved", {
    timeout: 15_000,
  });
  await page.reload();
  await expect(page.getByText("Loading...")).toBeHidden({ timeout: 30_000 });
  const restored = page.getByTestId("scadstudio-pcb-workspace");
  await expect(restored).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pcb-summary")).toContainText("6 parts");
  await expect(page.getByTestId("pcb-summary")).toContainText("2 sheets");
  await expect(page.getByTestId("pcb-summary")).toContainText("vias");

  // The virtual MCU, its firmware and its serial-capable runtime survive reload.
  await restored.getByTestId("pcb-tab-mcu").click();
  await expect(page.getByTestId("pcb-mcu-saved")).toContainText(
    "1 virtual part(s) saved",
  );
  await expect(page.getByTestId("pcb-mcu-link-count")).toHaveText("1 linked");
  await expect(page.getByTestId("ecad-panel")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select Arduino Uno R3" }),
  ).toBeVisible();
});
