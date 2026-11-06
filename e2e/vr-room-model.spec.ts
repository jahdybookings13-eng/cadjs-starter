import { test, expect } from "@playwright/test";
import { installFakeXR, bootIntoVR, vr, shot } from "./vr-harness";

test("generated room 3D file is applied in VR", async ({ page }) => {
  await installFakeXR(page);
  await bootIntoVR(page);
  await page.waitForFunction(
    () =>
      (window as unknown as { __vrRoomModelReady?: boolean })
        .__vrRoomModelReady === true,
    undefined,
    { timeout: 30_000 },
  );
  await vr(page, "frame", [10]);
  const canvas = page.locator("canvas").first();
  await canvas.screenshot({ path: "vr-shots/vr-room-generated.png" });
  const modelInfo = await page.evaluate(() => {
    const m = (window as unknown as { __vrRoomModelReady?: boolean })
      .__vrRoomModelReady;
    return m;
  });
  expect(modelInfo).toBe(true);
});
