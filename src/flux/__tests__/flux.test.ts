// flux/__tests__/flux.test.ts — the FLUX par subsystem: pure-core tests.
//
// Covers the deterministic surface (the part that must run local-first +
// side-channel-free): the prompt registry, the per-turn context/selection
// contract, the trace log, the agent loop, the orchestrator routing, the PCB
// rules (ERC/DRC, BoM, passive consolidation), the sim math, the MCAD co-design
// (links, tolerance, tool-access, plus MCAD→ECAD mounting-hole echo + device
// assembly), the MCP serialiser, and the bus bridge.
//
// The React surfaces (chatPanel / orchestratorView / useFluxChat / vrChatPanel)
// are UI/glue — the engine they call is what we verify here.

import { describe, it, expect } from "vitest";
import { makeFluxSession } from "../session";

// ---- registry -------------------------------------------------------------
import {
  ALL_ACTIONS,
  VALID_ACTION_KEYS,
  getAction,
  menuByGroup,
  topLevelActions,
} from "../agent/registry";

// ---- context --------------------------------------------------------------
import {
  makeContext,
  renderPrompt,
  nextDesignator,
  SELECTION_REQUIREMENTS,
  type ProjectContext,
  type SelectedPart,
} from "../agent/context";

// ---- trace ----------------------------------------------------------------
import { makeTraceLog, type TraceRow } from "../agent/trace";

// ---- loop -----------------------------------------------------------------
import { makeLoop, makeBrain, type Brain } from "../agent/loop";

// ---- orchestrator ---------------------------------------------------------
import { makeOrchestrator, agentForKey } from "../agent/orchestrator";

// ---- pcb project ----------------------------------------------------------
import {
  makeProject,
  makeElement,
  makeNet,
  addElement,
  addNet,
  allElements,
  type PcbProject,
} from "../domains/pcb/project";

// ---- pcb rules ------------------------------------------------------------
import { runErcDrc, buildBom, consolidatePassives } from "../domains/pcb/rules";

// ---- sim ------------------------------------------------------------------
import {
  voltageDivider,
  rcFilter,
  lcResonance,
  monteCarlo,
  drawTol,
  mulberry32,
} from "../domains/pcb/sim";

// ---- mcad co-design -------------------------------------------------------
import {
  addBoardEnclosureLink,
  resolveLinkPosition,
  toleranceStack,
  approachCheck,
  mechToFirmware,
  echoMountingHole,
  assembleDevice,
  type DesignLink,
  type MountingHole,
  type DevicePart,
} from "../domains/mcad/coDesign";

// ---- mcp ------------------------------------------------------------------
import {
  toMcpToolCall,
  validateMcpCall,
  makeFakeMcpClient,
} from "../mcp/client";

// ---- bus ------------------------------------------------------------------
import { FLUX_BUS_ACTIONS, isFluxAction, fluxKeyOf } from "../bus/actions";
import { registerFluxBus, FLUX_ACTIONS } from "../bus/bridge";
import { ActionBus } from "../../model/actionBus";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fixtureProject(): PcbProject {
  let p = makeProject("proj_test", "TestBoard");
  const u1 = makeElement("U1", {
    mpn: "ATMEGA328P",
    type: "mcu",
    group: "control",
    pins: [
      { pin: "1", kind: "signal", net: "SIG_A" },
      { pin: "2", kind: "power", net: "VCC" },
      { pin: "3", kind: "gnd", net: "GND" },
    ],
  });
  const r1 = makeElement("R1", {
    mpn: "0805-10k",
    type: "resistor",
    group: "bias",
    value: "10k",
    pins: [
      { pin: "1", kind: "signal", net: "SIG_A" },
      { pin: "2", kind: "signal" }, // floating → ERC warning
    ],
  });
  p = addElement(p, u1);
  p = addElement(p, r1);
  // VCC / GND / SIG_A nets, with real pin membership (SIG_A = 2 pins).
  p = addNet(p, {
    uid: "n_vcc",
    kind: "net",
    name: "VCC",
    pins: [{ designator: "U1", pin: "2" }],
    children: [],
  });
  p = addNet(p, {
    uid: "n_gnd",
    kind: "net",
    name: "GND",
    pins: [{ designator: "U1", pin: "3" }],
    children: [],
  });
  p = addNet(p, {
    uid: "n_siga",
    kind: "net",
    name: "SIG_A",
    pins: [
      { designator: "U1", pin: "1" },
      { designator: "R1", pin: "1" },
    ],
    children: [],
  });
  return p;
}

function projCtx(p: PcbProject, sel: SelectedPart[]): ProjectContext {
  return {
    projectRef: p.projectRef,
    projectName: p.name,
    parts: allElements(p).map((e) => ({
      designator: e.designator,
      ...(e.mpn !== undefined ? { mpn: e.mpn } : {}),
      ...(e.type !== undefined ? { type: e.type } : {}),
      ...(e.group !== undefined ? { group: e.group } : {}),
    })),
    nets: p.nets.map((n) => ({ name: n.name, pins: n.pins })),
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("flux registry", () => {
  it("exports a non-empty, key-aligned registry", () => {
    expect(ALL_ACTIONS.length).toBeGreaterThan(30);
    expect(new Set(ALL_ACTIONS.map((a) => a.key)).size).toBe(
      ALL_ACTIONS.length,
    );
    expect(VALID_ACTION_KEYS).toEqual(ALL_ACTIONS.map((a) => a.key));
  });

  it("getAction returns the action for a key, undefined for a miss", () => {
    expect(getAction("runErcDrc")?.label).toBe("Run ERC/DRC");
    expect(getAction("not_a_key")).toBeUndefined();
  });

  it("menuByGroup partitions every action exactly once", () => {
    const byGroup = menuByGroup();
    const total = Object.values(byGroup).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(ALL_ACTIONS.length);
  });

  it("topLevelActions are the 'root' group only", () => {
    expect(topLevelActions().every((a) => a.submenuGroup === "root")).toBe(
      true,
    );
    expect(topLevelActions().some((a) => a.key === "explainProject")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Context / selection contract
// ---------------------------------------------------------------------------

describe("flux context", () => {
  it("renderPrompt fills placeholders + evaluates the selection requirement", () => {
    const p = fixtureProject();
    // selection goes in the SECOND arg of makeContext (the SelectedPart[]).
    const ctx = makeContext(projCtx(p, []), [{ designator: "U1" }], {
      provider: "local",
    });
    const out = renderPrompt(getAction("explain")!, ctx);
    expect(out.ok).toBe(true);
    expect(out.text).toContain("U1");
    expect(out.text).toContain("does");
  });

  it("requireExactlyTwoToPair rejects 1 selection", () => {
    const p = fixtureProject();
    const ctx = makeContext(projCtx(p, []), [{ designator: "R1" }], {
      provider: "local",
    });
    const out = renderPrompt(getAction("connectComponents")!, ctx);
    expect(out.ok).toBe(false);
  });

  it("SELECTION_REQUIREMENTS canRun agrees with min/max", () => {
    expect(SELECTION_REQUIREMENTS.requireAnyToDesignator.canRun(1)).toBe(true);
    expect(SELECTION_REQUIREMENTS.requireAnyToDesignator.canRun(2)).toBe(false);
    expect(SELECTION_REQUIREMENTS.optionalAnyToDesignators.canRun(5)).toBe(
      true,
    );
    expect(SELECTION_REQUIREMENTS.none.canRun(0)).toBe(true);
  });

  it("nextDesignator picks the next free in the prefix", () => {
    const p = fixtureProject();
    const ctx = makeContext(projCtx(p, []), [], { provider: "local" });
    expect(nextDesignator(ctx, "R")).toBe("R2");
    expect(nextDesignator(ctx, "C")).toBe("C1");
  });
});

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------

describe("flux trace", () => {
  it("appends, filters by agent, and reports satisfied", () => {
    const log = makeTraceLog();
    const row: TraceRow = {
      id: "t1",
      ts: 0,
      agent: "pcb",
      kind: "satisfied",
      op: "runErcDrc",
    };
    log.append(row);
    log.append({ id: "t2", ts: 0, agent: "mcad", kind: "tool-call", op: "x" });
    expect(log.rows).toHaveLength(2);
    expect(log.forAgent("pcb")).toHaveLength(1);
    expect(log.satisfied("runErcDrc")).toBe(true);
    expect(log.last(1)[0]?.id).toBe("t2");
    log.clear();
    expect(log.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

describe("flux loop", () => {
  const fakeBrain: Brain = {
    kind: "local",
    async chat(prompt) {
      return { ok: true, text: `echo:${prompt.length}`, done: true };
    },
  };

  it("intent → tool-call → tool-result → satisfied, with rows captured", async () => {
    const log = makeTraceLog();
    const loop = makeLoop(log, "orchestrator");
    const p = fixtureProject();
    const ctx = makeContext(projCtx(p, []), [], { provider: "local" });
    const res = await loop.run(getAction("explainProject")!, ctx, fakeBrain);
    expect(res.ok).toBe(true);
    expect(res.text).toContain("echo:");
    const kinds = log.rows.map((r) => r.kind);
    expect(kinds).toContain("intent");
    expect(kinds).toContain("tool-call");
    expect(kinds).toContain("tool-result");
    expect(kinds).toContain("satisfied");
  });

  it("surfaces a brain throw as an error row, not a crash", async () => {
    const log = makeTraceLog();
    const loop = makeLoop(log, "pcb");
    const badBrain: Brain = {
      kind: "local",
      async chat() {
        throw new Error("boom");
      },
    };
    const p = fixtureProject();
    const ctx = makeContext(projCtx(p, []), [], { provider: "local" });
    const res = await loop.run(getAction("generateBom")!, ctx, badBrain);
    expect(res.ok).toBe(false);
    expect(res.text).toContain("boom");
    expect(log.rows.some((r) => r.kind === "error")).toBe(true);
  });

  it("makeBrain: local is available, unknown throws", () => {
    expect(makeBrain({ provider: "local" }).kind).toBe("local");
    expect(() => makeBrain({ provider: "wat" as never })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Orchestrator — routing + one thread
// ---------------------------------------------------------------------------

describe("flux orchestrator", () => {
  it("routes each action key to the owning sub-agent", () => {
    expect(agentForKey("runErcDrc")).toBe("pcb");
    expect(agentForKey("exportAssembly")).toBe("mcad");
    expect(agentForKey("createPinMapping")).toBe("firmware");
    expect(agentForKey("readDatasheet")).toBe("parts");
    expect(agentForKey("explainProject")).toBe("orchestrator");
    expect(agentForKey("definitely_unknown")).toBe("orchestrator");
  });

  it("runs a local tool through the one thread + posts the right kinds", async () => {
    const p = fixtureProject();
    const orch = makeOrchestrator(projCtx(p, []));
    let called = 0;
    orch.registerAgent({
      id: "pcb",
      runLocal: () => {
        called += 1;
        return { ok: true, data: { violations: 0 } };
      },
      runBrain: async () => ({ ok: false, error: "no brain" }),
    } as never);
    const res = await orch.runTurn("runErcDrc", [{ designator: "U1" }]);
    expect(called).toBe(1);
    expect(res.ok).toBe(true);
    const kinds = orch.trace.rows.map((r) => r.kind);
    expect(kinds).toContain("intent");
    expect(kinds).toContain("tool-result");
    expect(kinds).toContain("satisfied");
  });

  it("fails honestly for an unknown action", async () => {
    const p = fixtureProject();
    const orch = makeOrchestrator(projCtx(p, []));
    const res = await orch.runTurn("nope", []);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("unknown action");
  });

  it("the selection contract gates the turn", async () => {
    const p = fixtureProject();
    const orch = makeOrchestrator(projCtx(p, []));
    // connectComponents requires exactly 2; give 1 → the turn is refused BEFORE
    // any agent runs.
    const res = await orch.runTurn("connectComponents", [{ designator: "R1" }]);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/selection/);
  });
});

// ---------------------------------------------------------------------------
// PCB rules (ERC/DRC, BoM, consolidation)
// ---------------------------------------------------------------------------

describe("flux pcb rules", () => {
  it("flags a floating pin (R1.2 has no net) as an unconnected warning", () => {
    const p = fixtureProject();
    const v = runErcDrc(p);
    expect(
      v.some((x) => x.where === "R1.2" && x.rule === "erc.unconnected"),
    ).toBe(true);
  });

  it("a bare net (<2 pins) is flagged as floating; a 2-pin net is not", () => {
    let p = fixtureProject();
    p = addNet(p, {
      uid: "n_bare",
      kind: "net",
      name: "FOO",
      pins: [], // 0 pins → floating
      children: [],
    });
    const v = runErcDrc(p);
    expect(v.some((x) => x.where === "FOO" && x.severity === "warning")).toBe(
      true,
    );
    // SIG_A has 2 pins (U1.1 + R1.1) → NOT floating.
    expect(v.some((x) => x.where === "SIG_A")).toBe(false);
  });

  it("buildBom groups same (type|value|mpn) into one row with the designators", () => {
    const p = fixtureProject();
    const bom = buildBom(p);
    // U1 (mcu) and R1 (resistor) → 2 distinct rows.
    expect(bom.length).toBe(2);
    const r = bom.find((b) => b.designator.includes("R1"));
    expect(r?.value).toBe("10k");
    expect(r?.mpn).toBe("0805-10k");
    expect(r?.qty).toBe(1);
  });

  it("consolidatePassives finds passive (type|value) groups with 2+ MPNs", () => {
    let p = fixtureProject();
    const r2 = makeElement("R2", {
      value: "10k",
      mpn: "1206-10k", // DIFFERENT mpn, same value+type as R1
      type: "resistor",
      pins: [],
    });
    p = addElement(p, r2);
    const out = consolidatePassives(p);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]).toContain("resistor");
  });
});

// ---------------------------------------------------------------------------
// Sim
// ---------------------------------------------------------------------------

describe("flux sim", () => {
  it("voltageDivider: Vout = Vin * r2/(r1+r2)", () => {
    const r = voltageDivider(5, 1000, 2000);
    expect(r.vout).toBeCloseTo(5 * (2000 / 3000), 6);
  });

  it("rcFilter cutoff = 1/(2πRC)", () => {
    const r = rcFilter(1000, 1e-6, "lp");
    expect(r.fc).toBeCloseTo(1 / (2 * Math.PI * 1000 * 1e-6), 4);
  });

  it("lcResonance f0 = 1/(2π√LC) and Q", () => {
    const r = lcResonance(1e-3, 10e-6, 1);
    expect(r.f0).toBeCloseTo(1 / (2 * Math.PI * Math.sqrt(1e-3 * 10e-6)), 4);
    expect(r.Q).toBeCloseTo((1 / 1) * Math.sqrt(1e-3 / 10e-6), 5);
  });

  it("monteCarlo is deterministic on a seed + drawTol stays in band", () => {
    const a = monteCarlo(0, 1000, (rng) => 1500 + rng() * 100);
    const b = monteCarlo(0, 1000, (rng) => 1500 + rng() * 100);
    expect(a.samples).toEqual(b.samples);
    const rng = mulberry32(0);
    const drawn = drawTol(rng, 1000, 0.05);
    expect(drawn).toBeGreaterThanOrEqual(950);
    expect(drawn).toBeLessThanOrEqual(1050);
  });
});

// ---------------------------------------------------------------------------
// MCAD co-design: links + tolerance + access + MCAD→ECAD (holes + device)
// ---------------------------------------------------------------------------

describe("flux co-design", () => {
  const p = fixtureProject();

  it("addBoardEnclosureLink + resolveLinkPosition (parameterised + rigid)", () => {
    const links = addBoardEnclosureLink(
      [],
      "pcb-root",
      "enc-1",
      [0, 0, 2],
      "enclosure-follows-board",
      "parameterised",
    );
    expect(links[0]!.direction).toBe("enclosure-follows-board");
    const posParam = resolveLinkPosition(links[0]!, [10, 20, 0]);
    expect(posParam).toEqual([10, 20, 2]);

    const rigid = addBoardEnclosureLink(
      [],
      "pcb-root",
      "enc-2",
      [1, 2, 3],
      "board-follows-enclosure",
      "rigid",
    );
    expect(resolveLinkPosition(rigid[0]!, [0, 0, 0])).toEqual([1, 2, 3]);
  });

  it("toleranceStack: clearance pass (gap survives worst case)", () => {
    // Target gap 0.05mm; two items consume 0.02 + 0.01 at nominal.
    const t = toleranceStack(0.05, [
      { name: "a", nominal: 0.02, plus: 0.01, minus: 0.01, fit: "clearance" },
      { name: "b", nominal: 0.01, plus: 0, minus: 0, fit: "clearance" },
    ]);
    expect(t.pass).toBe(true);
    expect(t.clearanceMin).toBeCloseTo(0.05 - (0.02 + 0.01) - 0.01, 6); // -0.0 (boundary)
    expect(t.rss).toBeGreaterThan(0);
    expect(t.bandH7).toEqual([0.0105, 0.021]);
  });

  it("toleranceStack: interference pass (shaft > bore at worst)", () => {
    // Target dim -0.02 (i.e. shaft 0.02 bigger than bore). Items consume 0.
    const t = toleranceStack(-0.02, [
      { name: "shaft", nominal: 0, plus: 0, minus: 0, fit: "interference" },
    ]);
    expect(t.pass).toBe(true);
    expect(t.clearanceMin).toBeCloseTo(-0.02, 6);
    expect(t.interference).toBeCloseTo(0.02, 6);
  });

  it("toleranceStack: clearance fail (gap eaten by tolerances)", () => {
    const t = toleranceStack(0.001, [
      { name: "a", nominal: 0.02, plus: 0.05, minus: 0, fit: "clearance" },
    ]);
    expect(t.pass).toBe(false);
    expect(t.clearanceMax).toBeLessThan(0);
  });

  it("approachCheck flags a fastener that can't reach", () => {
    const a = approachCheck("f1", "M3", { x: 0, y: 0, z: 1 }, 12, 8);
    expect(a.blocked).toBe(true);
    expect(a.reason).toContain("only 8.00 mm");
    const ok = approachCheck("f2", "M3", { x: 0, y: 0, z: 1 }, 8, 12);
    expect(ok.blocked).toBe(false);
  });

  it("mechToFirmware: BOARD_L/W + per-link standoffs", () => {
    const links: DesignLink[] = [
      {
        id: "link-1",
        kind: "board-enclosure",
        direction: "enclosure-follows-board",
        behaviour: "parameterised",
        aId: "pcb-root",
        bId: "enc-1",
        offset: [0, 0, 3],
      },
    ];
    const c = mechToFirmware(p, links);
    expect(c.some((x) => x.name === "BOARD_L")).toBe(true);
    expect(c.some((x) => x.name === "BOARD_W")).toBe(true);
    expect(c.some((x) => x.name === "STANDOFF_link-1" && x.value === 3)).toBe(
      true,
    );
  });

  // --- MCAD→ECAD: the "attach vias to screw holes" direction ---------------

  it("echoMountingHole: through-hole pad + 2 ground-return vias + a firmware const", () => {
    const hole: MountingHole = {
      x: 10,
      y: 20,
      diameter: 3,
      depth: 5,
      src: "m3-screw-a",
    };
    const echo = echoMountingHole(hole);
    // The pad is at the SAME (x,y), ringed 1.2mm, hole = 3mm.
    expect(echo.pad.x).toBe(10);
    expect(echo.pad.y).toBe(20);
    expect(echo.pad.diameter).toBeCloseTo(4.2, 6);
    expect(echo.pad.hole).toBe(3);
    // Two vias, symmetric about the hole wall, both on GND.
    expect(echo.vias).toHaveLength(2);
    expect(echo.vias.every((v) => v.net === "GND")).toBe(true);
    expect(echo.vias[0]!.x).toBeGreaterThan(hole.x + 1.5); // holeRadius + 0.6
    expect(echo.vias[1]!.x).toBeLessThan(hole.x - 1.5);
    // A firmware constant for the hole.
    expect(echo.firmwareConstant.name).toBe("HOLE_m3-screw-a_D");
    expect(echo.firmwareConstant.value).toBe(3);
  });

  it("assembleDevice: unified BOM (pcb ∪ mcad), one STEP assembly, firmware per hole+link", () => {
    const mcadParts: DevicePart[] = [
      {
        id: "enc-1",
        from: "mcad",
        designator: "ENC1",
        name: "aluminum case",
        qty: 1,
      },
      {
        id: "m3a",
        from: "mcad",
        designator: "M3-A",
        name: "M3x6 cap screw",
        qty: 4,
      },
    ];
    const links: DesignLink[] = [
      {
        id: "link-1",
        kind: "board-enclosure",
        direction: "enclosure-follows-board",
        behaviour: "parameterised",
        aId: "pcb-root",
        bId: "enc-1",
        offset: [0, 0, 2],
      },
    ];
    const holes: MountingHole[] = [
      { x: 5, y: 5, diameter: 3.2, depth: 6, src: "screw-1" },
      { x: 35, y: 35, diameter: 3.2, depth: 6, src: "screw-2" },
    ];
    const dev = assembleDevice(p, "enc-1", links, mcadParts, holes);
    // BOM: U1 + R1 (pcb) + ENC1 + M3-A (mcad) = 4 distinct part rows.
    expect(dev.parts).toHaveLength(4);
    expect(dev.parts.filter((x) => x.from === "pcb")).toHaveLength(2);
    expect(dev.parts.filter((x) => x.from === "mcad")).toHaveLength(2);
    // One STEP assembly (board + enclosure + fasteners), step format.
    expect(dev.assembly.format).toBe("step");
    expect(dev.assembly.elementIds).toContain("enc-1");
    expect(dev.assembly.elementIds).toContain("pcb-root");
    // Firmware: BOARD_L, BOARD_W, STANDOFF_link-1, HOLE_screw-1_D, HOLE_screw-2_D.
    expect(dev.firmware.some((x) => x.name === "BOARD_L")).toBe(true);
    expect(dev.firmware.some((x) => x.name === "STANDOFF_link-1")).toBe(true);
    expect(dev.firmware.some((x) => x.name === "HOLE_screw-1_D")).toBe(true);
    expect(dev.firmware.some((x) => x.name === "HOLE_screw-2_D")).toBe(true);
    expect(dev.totalParts).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

describe("flux mcp", () => {
  it("toMcpToolCall serialises a registry action + args", () => {
    const call = toMcpToolCall(
      getAction("addResistor")!,
      { designator: "R9", value: "1k" },
      "proj_test",
    )!;
    expect(call.name).toBe("addResistor");
    expect(call.sourceAction).toBe("addResistor");
    expect(call.projectRef).toBe("proj_test");
    expect(call.args).toEqual({ designator: "R9", value: "1k" });
  });

  it("validateMcpCall catches missing required args", () => {
    const ok = validateMcpCall(
      {
        name: "addResistor",
        args: { designator: "R9", value: "1k" },
        sourceAction: "addResistor",
        projectRef: "p",
      },
      getAction("addResistor")!,
    );
    expect(ok.ok).toBe(true);
    const bad = validateMcpCall(
      {
        name: "addResistor",
        args: {},
        sourceAction: "addResistor",
        projectRef: "p",
      },
      getAction("addResistor")!,
    );
    expect(bad.ok).toBe(false);
    expect(bad.missing).toEqual(
      expect.arrayContaining(["designator", "value"]),
    );
  });

  it("makeFakeMcpClient round-trips a canned response; unknown → error", async () => {
    const client = makeFakeMcpClient({
      addResistor: {
        ok: true,
        name: "addResistor",
        data: { placed: "R9" },
        text: "placed R9",
      },
    });
    const ping = await client.ping();
    expect(ping.ok).toBe(true);
    const res = await client.call({
      name: "addResistor",
      args: { designator: "R9", value: "1k" },
      sourceAction: "addResistor",
      projectRef: "p",
    });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ placed: "R9" });
    const miss = await client.call({
      name: "nope",
      args: {},
      sourceAction: "nope",
      projectRef: "p",
    });
    expect(miss.ok).toBe(false);
    expect(miss.error).toContain("no canned response");
  });
});

// ---------------------------------------------------------------------------
// Bus
// ---------------------------------------------------------------------------

describe("flux bus", () => {
  it("FLUX_BUS_ACTIONS are all flux.<key> + the runTurn dispatcher", () => {
    expect(FLUX_BUS_ACTIONS).toContain("flux.runTurn");
    expect(FLUX_BUS_ACTIONS[0]).toBe("flux.runTurn");
    for (const id of FLUX_BUS_ACTIONS) {
      expect(isFluxAction(id)).toBe(true);
      const k = fluxKeyOf(id);
      expect(k).not.toBeNull();
    }
  });

  it("registerFluxBus: every action id resolves on the bus", () => {
    const bus = new ActionBus();
    const p = fixtureProject();
    const orch = makeOrchestrator(projCtx(p, []));
    registerFluxBus(bus, orch, { exportAssembly: "export-step" });
    // The dispatcher + every registered flux.<key> should be present.
    expect(bus.has("flux.runTurn")).toBe(true);
    expect(bus.has("flux.runErcDrc")).toBe(true);
    expect(bus.has("flux.addResistor")).toBe(true);
    // The alias to a scene op is registered under the flux id.
    expect(bus.has("flux.exportAssembly")).toBe(true);
  });

  it("FLUX_ACTIONS (bridge) and FLUX_BUS_ACTIONS (actions.ts) agree on the dispatcher", () => {
    expect(FLUX_ACTIONS).toContain("flux.runTurn");
    expect(FLUX_BUS_ACTIONS).toContain("flux.runTurn");
  });
});

// ---------------------------------------------------------------------------
// FluxSession (the only stateful flux object) + bus integration
// ---------------------------------------------------------------------------

describe("flux session (integration)", () => {
  it("makeFluxSession creates the one thread with all five agents registered", () => {
    const s = makeFluxSession({ projectRef: "test", projectName: "Test" });
    expect(s.ref).toBe("test");
    expect(s.name).toBe("Test");
    // One empty thread on the orchestrator before any turn.
    expect(s.orchestrator.trace.rows.length).toBe(0);
  });

  it("a flux.<key> bus call runs through the session's orchestrator", async () => {
    const s = makeFluxSession({ projectRef: "t2" });
    const bus = new ActionBus();
    registerFluxBus(bus, s.orchestrator);
    const res = (await bus.run("flux.howToUseFlux")) as {
      ok: boolean;
      data?: { tips: string[] };
    };
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data?.tips)).toBe(true);
    // The one thread captured the turn.
    expect(s.orchestrator.trace.rows.some((r) => r.kind === "intent")).toBe(
      true,
    );
  });
});
