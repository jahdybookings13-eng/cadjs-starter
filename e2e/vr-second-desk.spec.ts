import { test, expect } from "@playwright/test";
import { installFakeXR, bootIntoVR, vr, shot } from "./vr-harness";

test("second desk with green blueprint mat and FNAF board loads", async ({
  page,
}) => {
  await installFakeXR(page);
  await bootIntoVR(page);
  await page.waitForFunction(
    () =>
      (window as unknown as { __vrBoardReady?: boolean }).__vrBoardReady ===
      true,
    undefined,
    { timeout: 30_000 },
  );
  await vr(page, "frame", [10]);
  await shot(page, "vr-second-desk");
  const ready = await page.evaluate(
    () => (window as unknown as { __vrBoardReady?: boolean }).__vrBoardReady,
  );
  expect(ready).toBe(true);
});
