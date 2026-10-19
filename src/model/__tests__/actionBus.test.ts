import { describe, expect, it } from "vitest";
import { MENU_BY_SELECTION } from "../operationMenu";
import { createSceneBus, type HookBag } from "../actionBus";

const calls: Array<[string, unknown[]]> = [];
const spy =
  (name: string) =>
  (...args: unknown[]) => {
    calls.push([name, args]);
    return name;
  };

const bag = (extra: Record<string, HookBag[string]> = {}): HookBag => {
  const h: HookBag = { idle: () => undefined };
  for (const ops of Object.values(MENU_BY_SELECTION))
    for (const o of ops) h[o.id] = spy(o.id);
  return { ...h, ...extra };
};

describe("action bus (desk/hand/voice single entry)", () => {
  it("every ready menu op is reachable by id", () => {
    const bus = createSceneBus(bag());
    const missing: string[] = [];
    for (const ops of Object.values(MENU_BY_SELECTION))
      for (const o of ops)
        if (o.status === "ready" && !bus.has(o.id)) missing.push(o.id);
    expect(missing).toEqual([]);
  });
  it("run dispatches to the hook and logs", () => {
    const bus = createSceneBus(bag());
    const out = bus.run("fillet", "F1", ["e1"], 2);
    expect(out).toBe("fillet");
    expect(calls.some(([n, a]) => n === "fillet" && a[0] === "F1")).toBe(true);
    expect(bus.log.at(-1)).toMatchObject({ id: "fillet", ok: true });
  });
  it("unknown ids and unwired commands fail loudly", () => {
    const bus = createSceneBus({});
    expect(() => bus.run("nope")).toThrow(/unknown/);
    expect(bus.log.at(-1)?.ok).toBe(false);
    expect(() => bus.run("undo")).toThrow(/not wired/);
  });
  it("subscribe fires per dispatch and unsubscribes", () => {
    const bus = createSceneBus(bag());
    let n = 0;
    const off = bus.subscribe(() => n++);
    bus.run("section", "F1");
    off();
    bus.run("section", "F1");
    expect(n).toBe(1);
    expect(bus.has("section")).toBe(true);
  });
});
