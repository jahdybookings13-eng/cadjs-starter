// flux/session.ts — the per-file flux document ("project inside a project").
//
// One FluxSession per open file/project. It owns:
//   * the live PcbProject (mutated only through the pure domain fns)
//   * the MCAD co-design state (links, mounting holes, mcad parts)
//   * the orchestrator + its five default sub-agents
//   * the single TraceLog (the one chat thread)
//
// The session is the ONLY stateful flux object; everything else (domains,
// registry, loop) is pure. Desk panel, VR panel, voice, and the ActionBus all
// call `session.orchestrator.runTurn(key, selection)` — same path, same thread.
// ProjectContext is rebuilt from the live tree on every turn.

import {
  addElement,
  addGroup,
  addNet,
  makeElement,
  makeGroup,
  makeNet,
  makeProject,
  projectContextOf,
  byDesignator,
  allElements,
  type PcbProject,
  type PcbNode,
  type PcbElement,
} from "./domains/pcb/project";
import { runErcDrc, buildBom, consolidatePassives } from "./domains/pcb/rules";
import {
  boxOf,
  assembleDevice,
  echoMountingHole,
  mechToFirmware,
  runCoDesign,
  toleranceStack,
  approachCheck,
  type DesignLink,
  type DevicePart,
  type MountingHole,
  type StackItem,
  type ToleranceResult,
  type AccessCheck,
  type FirmwareConstant,
  type CoDesignResult,
} from "./domains/mcad/coDesign";
import {
  voltageDivider,
  rcFilter,
  rlcBode,
  rcTiming,
  lcResonance,
  dcCurrent,
  rippleEstimate,
  monteCarlo,
  mulberry32,
  drawTol,
} from "./domains/pcb/sim";
import type { FluxContext, SelectedPart, BrainConfig } from "./agent/context";
import {
  makeOrchestrator,
  agentForKey,
  type Orchestrator,
  type SubAgent,
  type ToolResult,
} from "./agent/orchestrator";
import type { TraceLog } from "./agent/trace";
import type { PcbStudioDocument } from "../pcb/model";

export interface FluxSessionOpts {
  projectRef?: string;
  projectName?: string;
  brain?: BrainConfig;
  /** Full PCB studio document; project must be the same live tree. */
  pcbDocument?: PcbStudioDocument;
}

export interface FluxSession {
  readonly ref: string;
  readonly name: string;
  readonly orchestrator: Orchestrator;
  getProject(): PcbProject;
  setProject(p: PcbProject): void;
  getPcbDocument(): PcbStudioDocument | null;
  setPcbDocument(doc: PcbStudioDocument): void;
  getLinks(): DesignLink[];
  addLink(link: DesignLink): void;
  getHoles(): MountingHole[];
  addHole(hole: MountingHole): void;
  getMcadParts(): DevicePart[];
  setMcadParts(parts: DevicePart[]): void;
  setBrain(brain: BrainConfig): void;
  trace(): TraceLog;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const parseValue = (s: string | undefined): number => {
  if (!s) return 0;
  const m = /^([0-9.]+)\s*(k|m|u|n|p)?$/i.exec(s.trim());
  if (!m || !m[1]) return 0;
  const mult: Record<string, number> = {
    k: 1e3,
    m: 1e6,
    u: 1e-6,
    n: 1e-9,
    p: 1e-12,
  };
  return parseFloat(m[1]) * (mult[(m[2] ?? "").toLowerCase()] ?? 1);
};

function describeProject(p: PcbProject): string {
  const els = allElements(p);
  const nets = p.nets;
  const parts = els
    .map((e) => {
      const v = e.value ? ` ${e.value}` : "";
      return `${e.designator}(${e.type ?? "?"}${v})`;
    })
    .join(", ");
  const netNames = nets.map((n) => n.name).join(", ");
  return (
    `Project "${p.name}": ${els.length} parts, ${nets.length} nets. ` +
    `Parts: ${parts || "(none)"}; Nets: ${netNames || "(none)"}. ` +
    `Bounds: ${JSON.stringify(boxOf(p)).slice(0, 80)}…`
  );
}

function changeEl(
  p: PcbProject,
  designator: string,
  updates: { value?: string; mpn?: string; group?: string; package?: string },
): PcbProject {
  const next = structuredClone(p) as PcbProject;
  const patch = (n: PcbNode): void => {
    if (n.kind !== "element") {
      for (const c of "children" in n ? n.children : []) patch(c as PcbNode);
      return;
    }
    if (n.designator !== designator) return;
    if (updates.value !== undefined) n.value = updates.value;
    if (updates.mpn !== undefined) n.mpn = updates.mpn;
    if (updates.group !== undefined) n.group = updates.group;
    if (updates.package !== undefined) n.package = updates.package;
  };
  patch(next.root);
  return next;
}

function reassignGroup(
  p: PcbProject,
  designator: string,
  group: string,
): PcbProject {
  return changeEl(p, designator, { group });
}

interface SessInternals {
  get(): PcbProject;
  set(p: PcbProject): void;
  getPcbDocument(): PcbStudioDocument | null;
  setPcbDocument(doc: PcbStudioDocument): void;
  getLinks(): DesignLink[];
  setLinks(l: DesignLink[]): void;
  getHoles(): MountingHole[];
  getMcadParts(): DevicePart[];
  setMcadParts(parts: DevicePart[]): void;
}

type ExecFn = (a: AgentArgs) => ToolResult | null;

function detail(res: ToolResult): string {
  if (res.error) return res.error;
  const d = res.data;
  if (d === undefined) return "ok";
  const s = JSON.stringify(d);
  return s.length > 220 ? s.slice(0, 217) + "…" : s;
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Domain agent builders (pure over the session internals)
// ---------------------------------------------------------------------------

interface AgentArgs {
  action: string;
  args: Record<string, unknown>;
  ctx: FluxContext;
}

function buildPcbAgent(s: SessInternals): SubAgent {
  const plocal = () => {
    const p_ = s.get();
    return {
      p: p_,
      els: allElements(p_),
      ics: allElements(p_).filter((e) => e.designator.startsWith("U")),
    };
  };

  const nextFree = (prefix: string): string => {
    const re = new RegExp(`^${prefix}(\\d+)$`);
    let max = 0;
    for (const e of allElements(s.get())) {
      const m = re.exec(e.designator);
      if (m && m[1]) max = Math.max(max, parseInt(m[1], 10));
    }
    return `${prefix}${max + 1}`;
  };

  const place = (
    kind: "R" | "C" | "L",
    key: string,
    defValue: string,
    a: AgentArgs,
  ): ToolResult => {
    const d =
      typeof a.args.designator === "string"
        ? a.args.designator
        : nextFree(kind);
    if (byDesignator(s.get(), d)) {
      return { ok: false, error: `designator ${d} already placed` };
    }
    const value = typeof a.args.value === "string" ? a.args.value : defValue;
    const el = makeElement(d, {
      type: kind,
      value,
      ...(typeof a.args.package === "string"
        ? { package: a.args.package as string }
        : {}),
    });
    s.set(addElement(s.get(), el));
    return { ok: true, data: { designator: d, value } };
  };

  const addNets = (names: string[]): ToolResult => {
    let p = s.get();
    for (const n of names)
      if (!p.nets.some((x) => x.name === n)) p = addNet(p, makeNet(n));
    s.set(p);
    return { ok: true, data: { nets: names } };
  };

  const runErc = (): ToolResult => {
    const v = runErcDrc(s.get());
    return {
      ok: true,
      data: { violations: v, count: v.length, clean: v.length === 0 },
    };
  };

  const pcbDoc = (): PcbStudioDocument | null => s.getPcbDocument();

  const run = (
    a: AgentArgs,
  ): ToolResult | null | Promise<ToolResult | null> => {
    const k = a.action;
    const { args } = a;
    const argNum = (n: string, def: number) =>
      typeof args[n] === "number" ? (args[n] as number) : def;
    const argStr = (n: string, def: string) =>
      typeof args[n] === "string" ? (args[n] as string) : def;
    const { p, els, ics } = plocal();

    switch (k) {
      case "addResistor":
        return place("R", "R", "10k", a);
      case "addCapacitor":
        return place("C", "C", "100nF", a);
      case "addInductor":
        return place("L", "L", "10uH", a);

      case "addVoltageDivider": {
        let pr = s.get();
        const r1d = nextFree("R");
        const r2d = nextFree("R");
        pr = addElement(
          pr,
          makeElement(r1d, {
            type: "R",
            value: argStr("r1", "10k"),
            group: "divider",
          }),
        );
        pr = addElement(
          pr,
          makeElement(r2d, {
            type: "R",
            value: argStr("r2", "10k"),
            group: "divider",
          }),
        );
        s.set(pr);
        const calc = voltageDivider(
          argNum("vin", 5),
          parseValue(argStr("r1", "10k")),
          parseValue(argStr("r2", "10k")),
        );
        return { ok: true, data: { r1: r1d, r2: r2d, ...calc } };
      }
      case "addRCFilter": {
        let pr = s.get();
        const rd = nextFree("R");
        const cd = nextFree("C");
        pr = addElement(
          pr,
          makeElement(rd, {
            type: "R",
            value: argStr("r", "1k"),
            group: "filter",
          }),
        );
        pr = addElement(
          pr,
          makeElement(cd, {
            type: "C",
            value: argStr("c", "1uF"),
            group: "filter",
          }),
        );
        s.set(pr);
        const calc = rcFilter(
          parseValue(argStr("r", "1k")),
          parseValue(argStr("c", "1uF")),
          argStr("type", "lp") === "hp" ? "hp" : "lp",
        );
        return { ok: true, data: { r: rd, c: cd, ...calc } };
      }

      case "addHBridge": {
        const d = argStr("designator", nextFree("U"));
        const el = makeElement(d, {
          type: "IC",
          value: "H-bridge driver",
          group: "motor",
          pins: [
            { pin: "1", name: "VM" },
            { pin: "2", name: "IN1" },
            { pin: "3", name: "IN2" },
            { pin: "4", name: "OUT1" },
            { pin: "5", name: "OUT2" },
            { pin: "6", name: "GND" },
          ],
        });
        s.set(addElement(s.get(), el));
        return { ok: true, data: { designator: d } };
      }
      case "addPowerSupply": {
        const d = argStr("designator", nextFree("U"));
        const el = makeElement(d, {
          type: "IC",
          value: "regulator",
          group: "power",
          pins: [
            { pin: "1", name: "VIN", kind: "power" },
            { pin: "2", name: "GND", kind: "gnd" },
            { pin: "3", name: "OUT", kind: "power" },
          ],
        });
        s.set(addElement(s.get(), el));
        return addNets(["GND", "VCC"]);
      }
      case "addUsbInterface": {
        const d = argStr("designator", nextFree("U"));
        const el = makeElement(d, {
          type: "IC",
          value: "USB interface",
          group: "usb",
          pins: [
            { pin: "1", name: "D+" },
            { pin: "2", name: "D-" },
            { pin: "3", name: "VBUS", kind: "power" },
            { pin: "4", name: "GND", kind: "gnd" },
          ],
        });
        s.set(addElement(s.get(), el));
        return { ok: true, data: { designator: d } };
      }
      case "addSensorInterface": {
        const d = argStr("designator", nextFree("U"));
        const el = makeElement(d, {
          type: "IC",
          value: "sensor",
          group: "sensors",
          pins: [
            { pin: "1", name: "VIO", kind: "power" },
            { pin: "2", name: "SDA" },
            { pin: "3", name: "SCL" },
            { pin: "4", name: "GND", kind: "gnd" },
          ],
        });
        s.set(addElement(s.get(), el));
        return { ok: true, data: { designator: d } };
      }
      case "addServoController": {
        const d = argStr("designator", nextFree("U"));
        const el = makeElement(d, {
          type: "IC",
          value: "servo driver",
          group: "motor",
          pins: [
            { pin: "1", name: "VCC", kind: "power" },
            { pin: "2", name: "SIG" },
            { pin: "3", name: "ENA" },
            { pin: "4", name: "GND", kind: "gnd" },
          ],
        });
        s.set(addElement(s.get(), el));
        return { ok: true, data: { designator: d } };
      }
      case "addSubcircuit": {
        const name = argStr("name", `SC-${els.length + 1}`);
        s.set(addGroup(s.get(), makeGroup(name, "group")));
        return { ok: true, data: { group: name } };
      }
      case "assignFunctionalGroups": {
        const groups: Record<string, string[]> = {};
        for (const e of els) {
          const g = e.type ?? "misc";
          (groups[g] ??= []).push(e.designator);
        }
        let pr = s.get();
        for (const entry of Object.entries(groups)) {
          for (const d of entry[1]) pr = reassignGroup(pr, d, entry[0]);
        }
        s.set(pr);
        return { ok: true, data: { groups, items: els.length } };
      }
      case "wirePowerNets":
        return addNets(["GND", "VCC"]);
      case "addBypassCaps": {
        const p0 = s.get();
        const ics0 = allElements(p0).filter((e) =>
          e.designator.startsWith("U"),
        );
        let pr = p0;
        const added: string[] = [];
        let n = allElements(p0).filter((e) =>
          e.designator.startsWith("C"),
        ).length;
        for (const ic of ics0) {
          const near = allElements(pr).some(
            (e) =>
              e.designator.startsWith("C") &&
              e.group === "decoupling" &&
              Math.abs(e.position.x - ic.position.x) < 3,
          );
          if (near) continue;
          n += 1;
          const d = `C${n}`;
          pr = addElement(
            pr,
            makeElement(d, {
              type: "C",
              value: "0.1uF",
              package: "0805",
              group: "decoupling",
              position: { x: ic.position.x + 2, y: ic.position.y, z: 0 },
            }),
          );
          added.push(d);
        }
        s.set(pr);
        return { ok: true, data: { added, count: added.length } };
      }
      case "connectComponents": {
        const aStr = argStr("a", "");
        const bStr = argStr("b", "");
        const netName = argStr("net", "NET-1");
        if (!aStr || !bStr)
          return {
            ok: false,
            error: "connectComponents needs designators a and b",
          };
        const pr0 = s.get();
        const ea = byDesignator(pr0, aStr);
        const eb = byDesignator(pr0, bStr);
        if (!ea || !eb)
          return {
            ok: false,
            error: `unknown designator(s): ${aStr}, ${bStr}`,
          };
        const pa = ea.pins.find((x) => !x.net);
        const pb = eb.pins.find((x) => !x.net);
        if (!pa || !pb)
          return {
            ok: false,
            error: `no unconnected pin on ${aStr} / ${bStr}`,
          };
        let pr = pr0;
        let net = pr.nets.find((x) => x.name === netName);
        if (!net) {
          net = makeNet(netName);
          pr = addNet(pr, net);
        }
        net.pins.push({ designator: aStr, pin: pa.pin });
        net.pins.push({ designator: bStr, pin: pb.pin });
        pa.net = netName;
        pb.net = netName;
        s.set(pr);
        return {
          ok: true,
          data: {
            net: netName,
            a: `${aStr}.${pa.pin}`,
            b: `${bStr}.${pb.pin}`,
          },
        };
      }
      case "changeProperty": {
        const dd = argStr("designator", "");
        const prop = argStr("property", "");
        const val = argStr("value", "");
        if (!dd || !prop)
          return {
            ok: false,
            error: "changeProperty needs designator + property (+ value)",
          };
        if (!["value", "mpn", "group", "package"].includes(prop)) {
          return { ok: false, error: `unknown property "${prop}"` };
        }
        if (!byDesignator(s.get(), dd))
          return { ok: false, error: `unknown ${dd}` };
        s.set(changeEl(s.get(), dd, { [prop]: val } as never));
        return { ok: true, data: { designator: dd, [prop]: val } };
      }

      // ---- PCB studio build pipeline -----------------------------------------
      // Loaded on demand so the PCB engine never ships in the initial bundle.
      case "buildPcb":
        return (async () => {
          const doc = pcbDoc();
          if (!doc)
            return {
              ok: false,
              error: "Open a ScadStudio:pcb tab before building a board",
            };
          const { buildPcb } = await import("../pcb/build");
          const built = buildPcb(doc, { gridMM: argNum("gridMM", 0.5) });
          s.setPcbDocument(built.doc);
          const route = built.report.route;
          return {
            ok: built.report.drc.clean,
            data: {
              steps: built.report.steps,
              ms: built.report.ms,
              netlist: built.report.netlist,
              placement: built.report.placement,
              route: route
                ? {
                    routed: route.routed,
                    failed: route.failed,
                    vias: route.vias,
                    traces: route.traces,
                    ms: route.ms,
                    failures: route.edges.filter((edge) => !edge.ok),
                  }
                : null,
              drc: {
                errors: built.report.drc.errors,
                warnings: built.report.drc.warnings,
                clean: built.report.drc.clean,
              },
              fab: {
                ok: built.report.fab.ok,
                stats: built.report.fab.stats,
                issues: built.report.fab.issues,
                files: built.report.fab.files.map((file) => file.name),
              },
            },
          };
        })();
      case "createPcbDemo":
        return (async () => {
          const { createPcbDemo } = await import("../pcb/build");
          const demo = createPcbDemo();
          s.setPcbDocument(demo);
          return {
            ok: true,
            data: {
              parts: allElements(demo.project).length,
              nets: demo.project.nets.length,
              sheets: demo.schematic.sheets.length,
              traces: demo.traces.length,
              vias: demo.vias.length,
              services: demo.zones.length,
            },
          };
        })();
      case "autoPlaceBoard":
        return (async () => {
          const doc = pcbDoc();
          if (!doc)
            return { ok: false, error: "No PCB studio document is attached" };
          const { autoPlacePcb } = await import("../pcb/layout");
          const placed = autoPlacePcb(doc);
          s.setPcbDocument(placed.doc);
          return { ok: true, data: placed.report };
        })();
      case "autorouteBoard":
        return (async () => {
          const doc = pcbDoc();
          if (!doc)
            return { ok: false, error: "No PCB studio document is attached" };
          const { autoroutePcb } = await import("../pcb/layout");
          const routed = autoroutePcb(doc, { gridMM: argNum("gridMM", 0.5) });
          s.setPcbDocument(routed.doc);
          return {
            ok: routed.report.failed === 0,
            data: {
              routed: routed.report.routed,
              failed: routed.report.failed,
              vias: routed.report.vias,
              traces: routed.report.traces,
              ms: routed.report.ms,
              failures: routed.report.edges.filter((edge) => !edge.ok),
            },
          };
        })();
      case "runPcbDrc":
        return (async () => {
          const doc = pcbDoc();
          if (!doc)
            return { ok: false, error: "No PCB studio document is attached" };
          const { drcSummary, runDesignRuleCheck } = await import("../pcb/drc");
          const violations = runDesignRuleCheck(doc);
          return {
            ok: violations.every((violation) => violation.severity !== "error"),
            data: { ...drcSummary(violations), violations },
          };
        })();
      case "exportPcbFabrication":
        return (async () => {
          const doc = pcbDoc();
          if (!doc)
            return { ok: false, error: "No PCB studio document is attached" };
          const { buildFabrication } = await import("../pcb/fabrication");
          const fab = buildFabrication(doc);
          return {
            ok: fab.ok,
            ...(fab.ok ? {} : { error: "Fabrication package has errors" }),
            data: {
              files: fab.files.map((file) => ({
                name: file.name,
                kind: file.kind,
                layer: file.layer,
                bytes: file.bytes,
              })),
              issues: fab.issues,
              stats: fab.stats,
              zipBytes: fab.zip.length,
            },
          };
        })();
      case "addSchematicSheet":
        return (async () => {
          const doc = pcbDoc();
          if (!doc)
            return { ok: false, error: "No PCB studio document is attached" };
          const { addSchematicSheet } = await import("../pcb/schematic");
          const next = addSchematicSheet(doc, argStr("name", ""));
          s.setPcbDocument(next);
          const sheet = next.schematic.sheets[next.schematic.sheets.length - 1];
          return {
            ok: true,
            data: {
              sheet: sheet?.name,
              id: sheet?.id,
              sheets: next.schematic.sheets.length,
            },
          };
        })();
      case "addPcbPart":
        return (async () => {
          const doc = pcbDoc();
          if (!doc)
            return { ok: false, error: "No PCB studio document is attached" };
          const libraryId = argStr("libraryId", "");
          if (!libraryId)
            return { ok: false, error: "addPcbPart needs a libraryId" };
          const before = new Set(
            allElements(doc.project).map((element) => element.designator),
          );
          const { addPcbLibraryPart } = await import("../pcb/model");
          const next = addPcbLibraryPart(
            doc,
            libraryId,
            argStr("designator", "") || undefined,
          );
          if (next === doc)
            return { ok: false, error: `unknown library part ${libraryId}` };
          s.setPcbDocument(next);
          const added = allElements(next.project).find(
            (element) => !before.has(element.designator),
          );
          return {
            ok: true,
            data: { designator: added?.designator, libraryId },
          };
        })();
      case "addPcbVia":
        return (async () => {
          const doc = pcbDoc();
          if (!doc)
            return { ok: false, error: "No PCB studio document is attached" };
          const net = argStr("net", "");
          if (!net) return { ok: false, error: "addPcbVia needs a net" };
          const { addPcbVia } = await import("../pcb/layout");
          const next = addPcbVia(
            doc,
            net,
            argNum("x", doc.board.widthMM / 2),
            argNum("y", doc.board.heightMM / 2),
          );
          s.setPcbDocument(next);
          const via = next.vias[next.vias.length - 1];
          return {
            ok: true,
            data: { id: via?.id, net, x: via?.x, y: via?.y },
          };
        })();
      case "checkPcbAssembly":
        return (async () => {
          const doc = pcbDoc();
          if (!doc)
            return { ok: false, error: "No PCB studio document is attached" };
          const { checkPcbAssembly, enclosureLid } =
            await import("../pcb/assembly");
          const report = checkPcbAssembly(doc, [
            enclosureLid(doc, argNum("cavityMM", 8), argNum("wallMM", 1.5)),
          ]);
          return {
            ok: report.pass,
            data: {
              pass: report.pass,
              components: report.componentCount,
              maxComponentHeightMM: report.maxComponentHeightMM,
              boardTopZ: report.boardTopZ,
              collisions: report.collisions,
            },
          };
        })();

      // ---- read-only / analysis ---------------------------------------------
      case "runErcDrc":
      case "findIssues":
        return runErc();
      case "reviewDecouplingCapPresence": {
        const missing = ics.filter((ic) => {
          const near = els.some(
            (e) =>
              e.designator.startsWith("C") &&
              e.group === "decoupling" &&
              Math.abs(e.position.x - ic.position.x) < 3,
          );
          return !near;
        });
        return {
          ok: true,
          data: {
            ics: ics.length,
            missingDecoupling: missing.map((e) => e.designator),
          },
        };
      }
      case "reviewUnconnectedPins": {
        const v = runErcDrc(p).filter((x) => x.rule === "erc.unconnected");
        return {
          ok: true,
          data: { unconnected: v.map((x) => x.where), count: v.length },
        };
      }
      case "reviewEnableResetPins": {
        const pins = els
          .flatMap((e) => e.pins)
          .filter((pn) => /en|enable|reset/i.test(pn.name ?? ""))
          .filter((pn) => !pn.net);
        return {
          ok: true,
          data: { floating: pins.map((pn) => pn.name), count: pins.length },
        };
      }
      case "listPinNamesAndFunctions": {
        const targets = a.ctx.selection.length
          ? a.ctx.selection.map((x) => x.designator)
          : els.slice(0, 4).map((e) => e.designator);
        const out = targets.map((d) => {
          const el = byDesignator(p, d);
          return {
            designator: d,
            mpn: el?.mpn ?? el?.type ?? null,
            pins: el
              ? el.pins.map((pn) => ({
                  pin: pn.pin,
                  name: pn.name ?? pn.pin,
                  net: pn.net ?? "unassigned",
                  kind: pn.kind ?? "signal",
                }))
              : [],
          };
        });
        return { ok: true, data: { pins: out } };
      }
      case "calculateVoltageDivider": {
        const da = byDesignator(p, argStr("a", ""));
        const db = byDesignator(p, argStr("b", ""));
        if (!da || !db)
          return {
            ok: false,
            error: "calculateVoltageDivider needs two resistor designators",
          };
        const calc = voltageDivider(
          argNum("vin", 5),
          parseValue(da.value),
          parseValue(db.value),
        );
        return {
          ok: true,
          data: { r1: da.designator, r2: db.designator, ...calc },
        };
      }
      case "generateBom": {
        const rows = buildBom(p);
        return { ok: true, data: { bom: rows, rows: rows.length } };
      }
      case "passiveComponentConsolidation":
        return { ok: true, data: { candidates: consolidatePassives(p) } };
      case "currentAnalysis": {
        const vin = argNum("vin", 5);
        const r = argNum("r", 1e3);
        const i = dcCurrent(vin, r);
        return {
          ok: true,
          data: { vin, r, currentA: i, currentMA: +(i * 1e3).toFixed(3) },
        };
      }
      case "passiveFilterAnalysis": {
        const r = argNum("r", 1e3);
        const c = argNum("c", 1e-9);
        const l = argNum("l", 0);
        const fMin = argNum("fMin", 100);
        const fMax = argNum("fMax", 1e6);
        const n = argNum("n", 51);
        const rc0 = rcFilter(r, c);
        const rlc0 = rlcBode(r, l, c, fMin, fMax, n);
        return { ok: true, data: { fc: rc0.fc, points: rlc0 } };
      }
      case "activeFilterAnalysis": {
        const gain = argNum("gain", 1);
        const r = argNum("r", 1e3);
        const c = argNum("c", 1e-9);
        const fMin = argNum("fMin", 100);
        const fMax = argNum("fMax", 1e6);
        const n = argNum("n", 51);
        const pts = rlcBode(r, 0, c, fMin, fMax, n).map((pt) => ({
          ...pt,
          magDb: +(pt.magDb + 20 * Math.log10(Math.max(gain, 1e-9))).toFixed(3),
        }));
        return { ok: true, data: { gain, points: pts } };
      }
      case "rippleAnalysis": {
        const i = argNum("i", 1);
        const f = argNum("f", 100);
        const c = argNum("c", 1e-4);
        return { ok: true, data: rippleEstimate(i, f, c) };
      }
      case "rcTimingLcOscillator":
        return {
          ok: true,
          data: {
            rc: rcTiming(argNum("r", 1e3), argNum("c", 1e-9)),
            lc: lcResonance(
              argNum("l", 1e-6),
              argNum("c", 1e-9),
              argNum("r", 1e3),
            ),
          },
        };
      case "circuitRobustnessAnalyzer": {
        const seed = argNum("seed", 42);
        const iters = argNum("iterations", 200);
        const r1 = argNum("r1", 10e3);
        const r2 = argNum("r2", 10e3);
        const vin = argNum("vin", 5);
        const run0 = monteCarlo(
          seed,
          iters,
          (rng) => {
            const a = drawTol(rng, r1, 0.1);
            const b = drawTol(rng, r2, 0.1);
            return (vin * b) / (a + b);
          },
          vin * 0.4,
          vin * 0.6,
        );
        return { ok: true, data: run0 };
      }
      case "whatIfScenarioExplorer": {
        const seed = argNum("seed", 7);
        const iters = argNum("iterations", 100);
        const r1 = argNum("r1", 10e3);
        const r2 = argNum("r2", 10e3);
        const vin = argNum("vin", 5);
        const base = (vin * r2) / (r1 + r2);
        const run0 = monteCarlo(
          seed,
          iters,
          (rng) => {
            const a = drawTol(rng, r1, 0.05);
            const b = drawTol(rng, r2, 0.05);
            return (vin * b) / (a + b);
          },
          base * 0.95,
          base * 1.05,
        );
        return { ok: true, data: { base, scenarios: run0, nominal: base } };
      }
      case "designSpaceOptimization": {
        const seed = argNum("seed", 1234);
        const iters = argNum("iterations", 300);
        const r1 = argNum("r1", 10e3);
        const r2 = argNum("r2", 10e3);
        const vin = argNum("vin", 5);
        const target = argNum("target", vin / 2);
        const run0 = monteCarlo(seed, iters, (rng) => {
          const a = drawTol(rng, r1, 0.1);
          return a;
        });
        const samples = run0.samples;
        let best: number | null = null;
        let bestErr = Infinity;
        for (const sv of samples) {
          const err = Math.abs((vin * r2) / (sv + r2) - target);
          if (err < bestErr) {
            bestErr = err;
            best = sv;
          }
        }
        return {
          ok: true,
          data: {
            bestR1: best,
            targetVout: target,
            achievableErr: bestErr,
            samples: samples.length,
          },
        };
      }
      case "compareComponents": {
        const picks = a.ctx.selection.map((x) => x.designator);
        const out = picks.map((d) => ({
          designator: d,
          el: byDesignator(p, d) ?? null,
        }));
        return { ok: true, data: { components: out } };
      }
      case "createTestPlan": {
        const scope = argStr("scope", "board");
        const plan: string[] = [
          `T1 continuity: all nets in ${scope} (continuity < 50 mΩ)`,
          `T2 no-opens: every pin with an assigned net makes contact`,
          `T3 no-shorts: power nets (GND/VCC) pairwise isolation > 1 MΩ`,
          `T4 BOM verification: all ${els.length} placed parts present + correct value spot-check`,
        ];
        return { ok: true, data: { plan, scope } };
      }
      case "createBlockDiagram": {
        const blocks = els
          .map((e) => `${e.designator} [${e.type ?? "?"}]`)
          .join(" — ");
        return {
          ok: true,
          data: { blocks: blocks || "(empty board)", parts: els.length },
        };
      }
      case "generateFmeaReport": {
        const rows = buildBom(p).map((row) => {
          const hf = fmeaHash(row);
          const s = 3 + (hf.s % 5);
          const o = 2 + (hf.o % 3);
          const dgt = 3 + (hf.d % 4);
          return {
            part: row.designator.join(", "),
            function: row.type || "?",
            failureMode: "open / short / drift",
            severity: hf.s,
            occurrence: hf.o,
            detection: hf.d,
            rpn: s * o * dgt,
          };
        });
        return { ok: true, data: { fmea: rows, parts: rows.length } };
      }
      case "generateRegulatoryChecklist": {
        const checklist: string[] = [
          "FCC Part 15 Class B (intended environment: residential)",
          "Ground continuity: chassis to protective earth ≤ 0.1 Ω",
          "Cable strain relief at all I/O edges",
          "Marking: model, input rating, serial, warning labels",
          "Insulation / tracking distance: verify creepage ≥ 2.5 mm on 5 V inputs",
          "EMC pre-scan: radiated 30 MHz–1 GHz at 10 m",
        ];
        return { ok: true, data: { checklist, standard: "FCC Part 15 B" } };
      }
      default:
        return null;
    }
  };

  function fmeaHash(row: {
    designator: string[];
    type: string;
    value?: string;
    mpn?: string;
    qty: number;
  }): { s: number; o: number; d: number } {
    const h =
      (row.designator.join("") + row.type + (row.value ?? "")).length % 9;
    return { s: 3 + (h % 5), o: 2 + (h % 3), d: 3 + (h % 4) };
  }

  return {
    id: "pcb",
    runLocal: (action, args, ctx) => run({ action: action.key, args, ctx }),
    async runBrain(action) {
      const seg =
        action.prompt.length > 160
          ? action.prompt.slice(0, 157) + "…"
          : action.prompt;
      return {
        ok: true,
        data: {
          hint: `brain-backed: ${seg}`,
          note: "provision a brain (OpenAI/Anthropic/Google/flux-mcp) to enrich this answer",
        },
      };
    },
  };
}

function buildMcadAgent(s: SessInternals): SubAgent {
  const run = (a: AgentArgs): ToolResult | null => {
    if (a.action === "followBoard" || a.action === "followEnclosure") {
      const b = boxOf(s.get());
      const w = b.max[0] - b.min[0];
      const h = b.max[1] - b.min[1];
      if (a.action === "followBoard") {
        const links0 = s.getLinks().map((l) => ({
          ...l,
          offset: [l.offset[0], l.offset[1], Math.max(l.offset[2], 1.5)] as [
            number,
            number,
            number,
          ],
        }));
        s.setLinks(links0);
        return {
          ok: true,
          data: {
            direction: "enclosure-follows-board",
            board: { w, h },
            links: links0.length,
          },
        };
      }
      return {
        ok: true,
        data: { direction: "board-follows-enclosure", board: { w, h } },
      };
    }
    if (a.action === "exportAssembly") {
      const dev = assembleDevice(
        s.get(),
        "ENC",
        s.getLinks(),
        s.getMcadParts(),
        s.getHoles(),
      );
      return { ok: true, data: { assembly: dev, totalParts: dev.totalParts } };
    }
    return null;
  };
  return {
    id: "mcad",
    runLocal: (action, args, ctx) => run({ action: action.key, args, ctx }),
    async runBrain(action) {
      const seg =
        action.prompt.length > 160
          ? action.prompt.slice(0, 157) + "…"
          : action.prompt;
      return { ok: true, data: { hint: `mcad brain: ${seg}` } };
    },
  };
}

function buildFirmwareAgent(s: SessInternals): SubAgent {
  const run = (a: AgentArgs): ToolResult | null => {
    if (a.action === "createPinMapping") {
      const map = allElements(s.get())
        .filter((e) => e.designator.startsWith("U"))
        .map((e) => ({
          designator: e.designator,
          mpn: e.mpn ?? e.type ?? "IC",
          pins: e.pins.map((pn) => ({
            pin: pn.pin,
            name: pn.name ?? pn.pin,
            net: pn.net ?? "unassigned",
            kind: pn.kind ?? "signal",
          })),
        }));
      return { ok: true, data: { pins: map } };
    }
    if (
      a.action === "createFirmwareFile" ||
      a.action === "generateFirmwareSkeleton"
    ) {
      const p0 = s.get();
      const constants: FirmwareConstant[] = [
        ...mechToFirmware(p0, s.getLinks()),
        ...s.getHoles().map((h) => echoMountingHole(h).firmwareConstant),
      ];
      const header = constants.map((c) => `  #define ${c.name} ${c.value}`);
      return {
        ok: true,
        data: {
          file: `${p0.name.replace(/\s+/g, "_").toLowerCase()}_firmware.h`,
          constants,
          header,
        },
      };
    }
    return null;
  };
  return {
    id: "firmware",
    runLocal: (action, args, ctx) => run({ action: action.key, args, ctx }),
    async runBrain(action) {
      const seg =
        action.prompt.length > 160
          ? action.prompt.slice(0, 157) + "…"
          : action.prompt;
      return { ok: true, data: { hint: `firmware brain: ${seg}` } };
    },
  };
}

function buildPartsAgent(_s: SessInternals): SubAgent {
  const run = (a: AgentArgs): ToolResult | null => {
    if (a.action === "findParts") {
      const q = String(a.args.query ?? a.args.name ?? "")
        .toLowerCase()
        .trim();
      return {
        ok: true,
        data: {
          query: q || "(no query)",
          parts: q
            ? [
                {
                  mpn: `PART-A-${q.replace(/\s+/g, "-").toUpperCase()}`,
                  name: q,
                  notes: "local index (offline)",
                },
                {
                  mpn: `PART-B-${q.replace(/\s+/g, "-").toUpperCase()}`,
                  name: q,
                  notes: "local index (offline)",
                },
              ]
            : [],
          note: "offline local index; wire an MCP parts backend for live data",
        },
      };
    }
    return null;
  };
  return {
    id: "parts",
    runLocal: (action, args, ctx) => run({ action: action.key, args, ctx }),
    async runBrain(action) {
      const seg =
        action.prompt.length > 160
          ? action.prompt.slice(0, 157) + "…"
          : action.prompt;
      return { ok: true, data: { hint: `parts brain: ${seg}` } };
    },
  };
}

function buildOrchestratorAgent(s: SessInternals): SubAgent {
  const run = (a: AgentArgs): ToolResult | null => {
    if (a.action === "simulateCircuit") {
      const p0 = s.get();
      const els0 = allElements(p0);
      const resZ = els0.filter((e) => e.designator.startsWith("R")).length;
      const capZ = els0.filter((e) => e.designator.startsWith("C")).length;
      const icZ = els0.filter((e) => e.designator.startsWith("U")).length;
      const netsZ = p0.nets.length;
      const simSummary: string[] = [
        `elements: ${els0.length} (R:${resZ} C:${capZ} U:${icZ}, nets:${netsZ})`,
      ];
      const divs = els0.filter((e) => e.group === "divider");
      for (const el of divs) {
        const r1 = els0.find(
          (e) => e.group === "divider" && e.designator < el.designator,
        );
        const r2 = els0.find(
          (e) => e.group === "divider" && e.designator > el.designator,
        );
        if (r1?.value && r2?.value) {
          const calc = voltageDivider(
            5,
            parseValue(r1.value),
            parseValue(r2.value),
          );
          simSummary.push(
            `divider around ${el.designator}: Vout ≈ ${calc.vout.toFixed(3)} V (5 V in)`,
          );
        }
      }
      return {
        ok: true,
        data: {
          summary: simSummary,
          counts: { R: resZ, C: capZ, IC: icZ, nets: netsZ },
          note: "local small-signal analysis; SPICE transient via offlineSpice / makeFetchSpice",
        },
      };
    }
    if (a.action === "explainProject") {
      return { ok: true, data: { explanation: describeProject(s.get()) } };
    }
    if (a.action === "howToUseFlux") {
      const tips = [
        'Ask in plain English: "add a 10k pull-up to R5", "run ERC", "generate BoM".',
        "Every turn lands in this one thread per file — sub-agents post here too.",
        "Selection context: pick components first (desk/VR), then ask; the orchestrator routes to the right sub-agent.",
        'MCAD: "enclosure follows board" / "board follows enclosure" to toggle co-design direction.',
        "Voice, VR, and ActionBus (`flux.<key>`) hit the same orchestrator as this window.",
      ];
      return { ok: true, data: { tips } };
    }
    if (a.action === "ask" || a.action === "explain") {
      const picks = a.ctx.selection;
      const targets = picks.length ? picks : allElements(s.get()).slice(0, 4);
      const out = targets.map((x) => {
        const el = byDesignator(s.get(), x.designator);
        if (a.action === "explain") {
          const val = el?.value ? ` (${el.value})` : "";
          return `${x.designator} — ${el?.type ?? "?"}${val}, ${el ? el.pins.length : 0} pins`;
        }
        return {
          designator: x.designator,
          type: el?.type ?? null,
          value: el?.value ?? null,
          mpn: el?.mpn ?? null,
          group: el?.group ?? null,
          pins: el
            ? el.pins.map((pn) => ({
                pin: pn.pin,
                name: pn.name ?? pn.pin,
                net: pn.net ?? null,
                kind: pn.kind ?? "signal",
              }))
            : [],
        };
      });
      return {
        ok: true,
        data:
          a.action === "explain"
            ? { explanation: out.join("; ") }
            : { parts: out },
      };
    }
    if (a.action === "checkAvailability") {
      const els0 = allElements(s.get());
      const stock = buildBom(s.get()).map((row) => ({
        part: row.designator.join(", "),
        type: row.type,
        stockable: row.mpn !== undefined,
        qty: row.qty,
      }));
      return {
        ok: true,
        data: {
          total: els0.length,
          withMpn: els0.filter((e) => e.mpn).length,
          stock,
        },
      };
    }
    if (a.action === "writeProjectDescription") {
      const p0 = s.get();
      const els0 = allElements(p0);
      const desc =
        `${p0.name}: a ${p0.nets.length}-net board with ${els0.length} components. ` +
        (els0.length
          ? `Contains: ${els0
              .slice(0, 8)
              .map((e) => e.designator)
              .join(", ")}${els0.length > 8 ? "…" : ""}. `
          : "") +
        "Primary functions derived from placed groups of parts.";
      return { ok: true, data: { description: desc } };
    }
    return null;
  };
  return {
    id: "orchestrator",
    runLocal: (action, args, ctx) => run({ action: action.key, args, ctx }),
    async runBrain(action) {
      const seg =
        action.prompt.length > 160
          ? action.prompt.slice(0, 157) + "…"
          : action.prompt;
      return {
        ok: true,
        data: {
          context: describeProject(s.get()),
          note: `orchestrator answered locally; brain "${action.key}" would enrich: ${seg}`,
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Session factory
// ---------------------------------------------------------------------------

export function makeFluxSession(opts: FluxSessionOpts = {}): FluxSession {
  const ref = opts.projectRef ?? "flux-0";
  let proj =
    opts.pcbDocument?.project ?? makeProject(ref, opts.projectName ?? ref);
  let pcbDocument: PcbStudioDocument | null = opts.pcbDocument ?? null;
  let links: DesignLink[] = [];
  let holes: MountingHole[] = [];
  let mcadParts: DevicePart[] = [];
  let refreshContext: (p: PcbProject) => void = () => {};

  const internals: SessInternals = {
    get: () => proj,
    set: (p) => {
      proj = p;
      refreshContext(p);
    },
    getPcbDocument: () => pcbDocument,
    setPcbDocument: (doc) => {
      pcbDocument = doc;
      proj = doc.project;
      refreshContext(proj);
    },
    getLinks: () => links,
    setLinks: (l) => {
      links = l;
    },
    getHoles: () => holes,
    getMcadParts: () => mcadParts,
    setMcadParts: (parts) => {
      mcadParts = parts;
    },
  };

  const orch = makeOrchestrator(projectContextOf(proj));
  refreshContext = (p) => orch.setProjectContext(projectContextOf(p));
  for (const agent of [
    buildOrchestratorAgent(internals),
    buildPcbAgent(internals),
    buildMcadAgent(internals),
    buildFirmwareAgent(internals),
    buildPartsAgent(internals),
  ]) {
    orch.registerAgent(agent);
  }
  if (opts.brain) orch.setBrain(opts.brain);

  return {
    ref,
    name: opts.projectName ?? ref,
    orchestrator: orch,
    getProject: () => proj,
    setProject: (p) => {
      proj = p;
      refreshContext(p);
    },
    getPcbDocument: () => pcbDocument,
    setPcbDocument: (doc) => {
      pcbDocument = doc;
      proj = doc.project;
      refreshContext(proj);
    },
    getLinks: () => links,
    addLink: (link) => {
      links = [...links.filter((l) => l.id !== link.id), link];
    },
    getHoles: () => holes,
    addHole: (hole) => {
      holes = [...holes, hole];
    },
    getMcadParts: () => mcadParts,
    setMcadParts: (parts) => {
      mcadParts = parts;
    },
    setBrain: (brain) => {
      orch.setBrain(brain);
    },
    trace: () => orch.trace,
  };
}
