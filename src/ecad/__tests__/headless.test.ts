import { describe, expect, it } from "vitest";
import { makeHeadlessEcad } from "../headless";

describe("headless ECAD workbench", () => {
  it("exposes the real catalog and dispatches the same bus actions", () => {
    const ecad = makeHeadlessEcad();
    try {
      const catalog = ecad.bus.run("ecad.catalog") as {
        id: string;
        name: string;
        category: string;
      }[];
      expect(catalog.length).toBeGreaterThan(20);
      expect(catalog.some((part) => part.id === "arduino-uno")).toBe(true);
      expect(catalog.some((part) => part.id === "esp32-devkit")).toBe(true);
      expect(catalog.some((part) => part.category === "board")).toBe(true);

      const placed = ecad.bus.run("ecad.insert", {
        part: "arduino-uno",
      }) as { id: string };
      expect(ecad.bus.run("ecad.list")).toEqual([
        expect.objectContaining({ id: placed.id, name: "Arduino Uno R3" }),
      ]);
      expect(
        ecad.bus.run("ecad.deploy", {
          board: placed.id,
          firmwareId: "hello-serial",
        }),
      ).toMatchObject({ firmwareId: "hello-serial", tier: "virtual" });
    } finally {
      ecad.dispose();
    }
  });

  it("runs virtual firmware and exposes pins and serial", async () => {
    const ecad = makeHeadlessEcad();
    try {
      const placed = ecad.bus.run("ecad.insert", {
        part: "arduino-uno",
      }) as { id: string };
      ecad.bus.run("ecad.deploy", {
        board: placed.id,
        firmwareId: "hello-serial",
      });
      await ecad.bus.run("ecad.run", placed.id);

      const status = ecad.bus.run("ecad.status", placed.id) as {
        running: boolean;
        tier: string;
      };
      expect(status.running).toBe(true);
      expect(status.tier).toBe("virtual");

      // The runtime is real: it runs the sketch and accumulates serial output.
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      const serial = ecad.bus.run("ecad.serial", placed.id) as {
        lines: string[];
      };
      expect(serial.lines.join("\n")).toContain("scadgen alive");
      expect(ecad.sim.status(placed.id).running).toBe(true);
    } finally {
      ecad.dispose();
    }
  });
});
