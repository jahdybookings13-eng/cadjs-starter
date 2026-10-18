import { expect, test } from "@playwright/test";

interface Dbg {
  rect: (w: number, h: number) => string;
  constrain: (fid: string, type: string, ids: string[], v?: number) => string;
  idle: () => Promise<Record<string, { status: string; detail?: string }>>;
  measEdge: (f: string) => Promise<number[] | null>;
}

async function dbg(page: import("@playwright/test").Page): Promise<Dbg> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __cadDebug: { scadgen: Dbg };
        }
      ).__cadDebug.scadgen,
  );
}

test("dimension constraint drives sketch through the planegcs solver", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/", { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      !!(
        window as unknown as {
          __cadDebug?: { scadgen?: object };
        }
      ).__cadDebug?.scadgen,
    undefined,
    { timeout: 30_000 },
  );

  const sketchFid = await page.evaluate(() =>
    (
      window as unknown as {
        __cadDebug: { scadgen: Dbg };
      }
    ).__cadDebug.scadgen.rect(2, 1),
  );
  const states1 = await page.evaluate(async () => {
    const d = (
      window as unknown as {
        __cadDebug: { scadgen: Dbg };
      }
    ).__cadDebug.scadgen;
    return await d.idle();
  });
  expect(Object.values(states1).every((v) => v.status === "OK")).toBe(true);

  const cFid = await page.evaluate(
    ({ sk }: { sk: string }) =>
      (
        window as unknown as {
          __cadDebug: { scadgen: Dbg };
        }
      ).__cadDebug.scadgen.constrain(sk, "distance", ["p1", "p2"], 3),
    { sk: sketchFid },
  );
  const states2 = await page.evaluate(async () => {
    const d = (
      window as unknown as {
        __cadDebug: { scadgen: Dbg };
      }
    ).__cadDebug.scadgen;
    return await d.idle();
  });
  expect(states2[cFid]?.status).toBe("OK");

  const lens = await page.evaluate(
    ({ fid }: { fid: string }) =>
      (
        window as unknown as {
          __cadDebug: { scadgen: Dbg };
        }
      ).__cadDebug.scadgen.measEdge(fid),
    { fid: cFid },
  );
  expect(lens).not.toBeNull();
  // One distance constraint on an 8-DOF rectangle yields a valid but sheared
  // solution (correct solver behavior): the constrained edge is exact,
  // neighbors drift. Fully-constrained solves are a later spec.
  const sorted = (lens as number[]).slice().sort((a, b) => a - b);
  expect(sorted.length).toBe(4);
  expect(sorted[3]).toBeCloseTo(3, 6);
  expect(sorted[0]).toBeGreaterThan(0);
});
