// e2e/ecad-mcu.spec.ts — virtual microcontrollers in the live app: place a
// board + screen + LED through the ActionBus, wire them, deploy firmware,
// run it, and watch the 3D state react (LED emissive, OLED pixels, serial).

import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

interface EcadWindow {
  __ecad?: {
    sim: {
      instances: Map<string, { id: string; partId: string }>;
      ledLevel: (id: string) => number;
      monoBuffer: (
        id: string,
      ) => { get: (x: number, y: number) => boolean } | null;
      displayOf: (id: string) => { instId: string } | null;
      status: (id: string) => {
        running: boolean;
        tier: string | null;
        error: string | null;
      };
      serial: (id: string) => string[];
      partOf: (id: string) => { id: string; category: string } | undefined;
      stop: (id: string) => void;
    };
    layer: { get: (id: string) => { children: unknown[] } | undefined };
  };
  __cadDebug?: {
    scadgen?: {
      bus?: {
        run: (id: string, ...args: unknown[]) => unknown;
        has: (id: string) => boolean;
      };
    };
  };
}

test("ecad: uno + oled + led run real firmware in 3D space", async ({
  page,
}) => {
  page.on("console", (m) => {
    if (!m.text().includes("React DevTools")) console.log("PAGE:", m.text());
  });
  await loadAppReady(page);

  // ── place + wire + deploy + run through the bus (desk == VR == voice == AI)
  const setup = await page.evaluate(async () => {
    const w = window as unknown as EcadWindow;
    const bus = w.__cadDebug?.scadgen?.bus;
    if (!bus) throw new Error("no bus");
    const uno = bus.run("ecad.insert", {
      part: "arduino-uno",
      x: 0,
      y: 0,
      z: 0,
    }) as { id: string };
    const oled = bus.run("ecad.insert", {
      part: "ssd1306-128x64",
      x: 0.12,
      y: 0,
      z: 0,
    }) as { id: string };
    const led = bus.run("ecad.insert", {
      part: "led-red",
      x: -0.12,
      y: 0,
      z: 0.05,
    }) as { id: string };
    bus.run("ecad.wire", { from: `${uno.id}.A4`, to: `${oled.id}.SDA` });
    bus.run("ecad.wire", { from: `${uno.id}.A5`, to: `${oled.id}.SCL` });
    bus.run("ecad.wire", { from: `${uno.id}.13`, to: `${led.id}.A` });
    // custom firmware via the coding path: blink the LED + write the OLED
    bus.run("ecad.code", {
      board: uno.id,
      code: [
        "function setup() { pinMode(13, OUTPUT); }",
        "async function loop() {",
        "  digitalWrite(13, HIGH);",
        "  Display.clear();",
        '  Display.text("SCADGEN MCU", 0, 0);',
        "  await delay(500);",
        "}",
      ].join("\n"),
    });
    const status = (await bus.run("ecad.run", uno.id)) as {
      running: boolean;
      tier: string;
    };
    await new Promise((r) => setTimeout(r, 400));
    const list = bus.run("ecad.list") as { id: string }[];
    return {
      uno: uno.id,
      led: led.id,
      running: status.running,
      tier: status.tier,
      placed: list.length,
    };
  });
  expect(setup.placed).toBe(3);
  expect(setup.running).toBe(true);
  expect(setup.tier).toBe("virtual");

  // ── the firmware drives the 3D state: LED lit, OLED text pixels, display bound
  const visual = await page.evaluate(() => {
    const ecad = (window as unknown as EcadWindow).__ecad!;
    const ids = [...ecad.sim.instances.values()];
    const uno = ids.find((i) => i.partId === "arduino-uno");
    const ledInst = ids.find((i) => i.partId === "led-red");
    if (!uno || !ledInst) return { error: "instances missing" } as never;
    const mono = ecad.sim.monoBuffer(uno.id);
    return {
      ledLevel: ecad.sim.ledLevel(ledInst.id),
      hasOledBuffer: !!mono,
      oledTextPixel: mono ? mono.get(0, 1) : false,
      displayBound: ecad.sim.displayOf(uno.id)?.instId ?? null,
      ledObjectChildren: ecad.layer.get(ledInst.id)?.children.length ?? 0,
    };
  });
  expect(visual.ledLevel).toBe(1);
  expect(visual.hasOledBuffer).toBe(true);
  expect(visual.oledTextPixel).toBe(true);
  expect(visual.displayBound).toBeTruthy();
  expect(visual.ledObjectChildren).toBeGreaterThan(0);

  // ── stop cleanly
  await page.evaluate(() => {
    const ecad = (window as unknown as EcadWindow).__ecad!;
    const uno = [...ecad.sim.instances.values()].find(
      (i) => i.partId === "arduino-uno",
    );
    ecad.sim.stop(uno!.id);
  });
  const stopped = await page.evaluate(() => {
    const ecad = (window as unknown as EcadWindow).__ecad!;
    const uno = [...ecad.sim.instances.values()].find(
      (i) => i.partId === "arduino-uno",
    );
    return ecad.sim.status(uno!.id).running;
  });
  expect(stopped).toBe(false);
});
