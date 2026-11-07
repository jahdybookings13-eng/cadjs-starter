import { expect, test, type Page } from "@playwright/test";
import { loadAppReady } from "./helpers";

const elementCount = (page: Page) =>
  page.evaluate(() => window.__cadDebug?.getElements().length ?? 0);

const idbDocumentNames = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("scadgen.documents");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const docs = await new Promise<Array<{ name?: string }>>(
      (resolve, reject) => {
        const request = db
          .transaction("documents", "readonly")
          .objectStore("documents")
          .getAll();
        request.onsuccess = () =>
          resolve(request.result as Array<{ name?: string }>);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return docs.map((doc) => doc.name ?? "");
  });

test("local documents survive IndexedDB and round-trip tabs, trash and snapshots", async ({
  page,
}) => {
  await loadAppReady(page);
  await page.getByTestId("open-documents").click();
  const docsPage = page.getByTestId("documents-page");
  await expect(docsPage).toBeVisible();

  // Create a fresh local document. Opening it reloads the editor, which is the
  // same path a user takes from the Documents page.
  await page.getByTestId("documents-new").click();
  await page.getByLabel("Document name").fill("Phase One Case");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page.getByTestId("document-toolbar")).toContainText(
    "Phase One Case",
  );
  await expect.poll(() => idbDocumentNames(page)).toContain("Phase One Case");

  // A corrupt localStorage mirror must not hide the good IndexedDB copy.
  await page.evaluate(() =>
    localStorage.setItem("scadgen.documents.v1", "{not-json"),
  );
  await page.reload();
  await expect(page.getByTestId("document-toolbar")).toContainText(
    "Phase One Case",
  );

  // The page reads from the durable store, not a component-local fixture.
  await page.getByTestId("open-documents").click();
  await docsPage.getByLabel("Search documents").fill("Phase One");
  await expect(
    docsPage.getByRole("heading", { name: "Phase One Case" }),
  ).toBeVisible();

  // Rename through the real dialog.
  await docsPage.getByRole("button", { name: "Rename" }).first().click();
  await page.getByLabel("Document name").fill("Phase One Renamed");
  await page.getByRole("button", { name: "Rename document" }).click();
  await expect(
    docsPage.getByRole("heading", { name: "Phase One Renamed" }),
  ).toBeVisible();

  // Duplicate produces a second independent document card.
  await docsPage.getByRole("button", { name: "Duplicate" }).first().click();
  await expect(docsPage.getByTestId(/document-card-/)).toHaveCount(2);
  await expect(
    docsPage.getByRole("heading", { name: "Phase One Renamed copy" }),
  ).toBeVisible();

  // Export is a real downloadable document file, not a toast.
  const download = page.waitForEvent("download");
  await docsPage.getByRole("button", { name: "Export" }).first().click();
  expect((await download).suggestedFilename()).toMatch(/\.cadjs-doc\.json$/);

  // Trash the duplicate, restore it, and prove it comes back in All.
  const copyCard = docsPage
    .getByTestId(/document-card-/)
    .filter({ hasText: "Phase One Renamed copy" });
  await copyCard.getByRole("button", { name: "Delete" }).click();
  await docsPage.getByRole("button", { name: "Show Trash" }).click();
  await expect(
    docsPage
      .getByTestId(/document-card-/)
      .filter({ hasText: "Phase One Renamed copy" }),
  ).toBeVisible();
  await docsPage.getByRole("button", { name: "Restore" }).click();
  await docsPage.getByRole("button", { name: "Show All" }).click();
  await expect(
    docsPage
      .getByTestId(/document-card-/)
      .filter({ hasText: "Phase One Renamed copy" }),
  ).toBeVisible();

  // Back to the editor: snapshot the empty document, add a body, restore the
  // snapshot, and verify the scene is empty again.
  await page.getByRole("button", { name: "← Back to editor" }).click();
  await expect(page.getByTestId("document-toolbar")).toBeVisible();
  await page.getByTestId("document-panel-toggle").click();
  await expect(page.getByTestId("document-panel")).toBeVisible();
  await page.getByLabel("Snapshot name").fill("empty");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("empty", { exact: true })).toBeVisible();
  await page.getByLabel("Close document panel").click();

  // The named snapshot is durable across a reload, not session state.
  await page.reload();
  await expect(page.getByTestId("document-toolbar")).toContainText(
    "Phase One Renamed",
  );
  await page.getByTestId("document-panel-toggle").click();
  await expect(page.getByText("empty", { exact: true })).toBeVisible();
  await page.getByLabel("Close document panel").click();

  await page.evaluate(() => window.__cadDebug!.scadgen!.box(20, 20, 20));
  await expect.poll(() => elementCount(page)).toBe(1);
  await page.getByTestId("document-panel-toggle").click();
  await page.getByRole("button", { name: "Restore empty" }).click();
  await expect.poll(() => elementCount(page)).toBe(0);
});
