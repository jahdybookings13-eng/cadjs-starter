// ecad/agent.ts — the flux AI/VR path for microcontroller coding.
//
// Adds ECAD prompt actions to the flux registry (so the ⚡ menu, the desk
// chat, the VR panel, and voice all see them) and replaces the session's
// firmware sub-agent with a composed one: ECAD actions run locally against
// the placed scene (deterministic, no brain round-trip), and the original
// firmware actions (pin mapping, firmware skeleton) keep working through the
// session's public accessors.

import { PROMPT_REGISTRY, type PromptAction } from "../flux/agent/registry";
import type {
  Orchestrator,
  SubAgent,
  ToolResult,
} from "../flux/agent/orchestrator";
import type { FluxSession } from "../flux/session";
import { findPartByName, getPart } from "./catalog";
import type { Ecad } from "./install";

const ECAD_PROMPTS: Record<string, PromptAction> = {
  listBoards: {
    key: "listBoards",
    label: "List microcontrollers",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "List every microcontroller board and display in the ScadGen catalog with its runtime tiers.",
    kind: "analyze",
    desc: "Enumerate the virtual MCU/display catalog.",
  },
  insertMcu: {
    key: "insertMcu",
    label: "Add a microcontroller",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Add {part} to the scene at {x},{y},{z} and tell me which pins to wire for a first test.",
    placeholders: ["part", "x", "y", "z"],
    kind: "mutate",
    tool: {
      name: "insertMcu",
      args: {
        part: {
          type: "string",
          desc: "catalog part id or name, e.g. arduino-uno, esp32-devkit, rpi-pico",
        },
        x: { type: "string", desc: "x position in mm" },
        y: { type: "string", desc: "y position in mm" },
        z: { type: "string", desc: "z position in mm" },
      },
    },
    desc: "Place a dev board / display / peripheral in 3D space.",
  },
  wirePins: {
    key: "wirePins",
    label: "Wire pins",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "Wire {from} to {to} and confirm the electrical compatibility.",
    placeholders: ["from", "to"],
    kind: "mutate",
    tool: {
      name: "wirePins",
      args: {
        from: { type: "string", desc: "pin ref <instance>.<pin>, e.g. u1.13" },
        to: { type: "string", desc: "pin ref <instance>.<pin>, e.g. d1.A" },
      },
    },
    desc: "Connect two placed ECAD parts electrically.",
  },
  writeFirmware: {
    key: "writeFirmware",
    label: "Write firmware for a board",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Write ScadGen virtual firmware for {board} that does: {behavior}. " +
      "Use the Arduino-flavored API (pinMode/digitalWrite/analogWrite/delay/Serial, plus Display/Servo when wired) " +
      "and define async setup()/loop(). Then deploy it to the board.",
    placeholders: ["board", "behavior"],
    kind: "mutate",
    tool: {
      name: "writeFirmware",
      args: {
        board: { type: "string", desc: "placed board instance id" },
        behavior: { type: "string", desc: "what the firmware should do" },
        code: {
          type: "string",
          desc: "the generated ScadGen JS firmware source",
        },
      },
    },
    desc: "Generate + deploy firmware code via the AI.",
  },
  deployFirmware: {
    key: "deployFirmware",
    label: "Deploy example firmware",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "Deploy the {firmwareId} firmware to {board} and run it.",
    placeholders: ["firmwareId", "board"],
    kind: "mutate",
    tool: {
      name: "deployFirmware",
      args: {
        board: { type: "string", desc: "placed board instance id" },
        firmwareId: {
          type: "string",
          desc: "firmware registry id, e.g. blink, hello-oled",
        },
      },
    },
    desc: "Flash a registry firmware onto a placed board and start it.",
  },
  runFirmware: {
    key: "runFirmware",
    label: "Run / stop firmware",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "{verb} the firmware on {board} and report the runtime status.",
    placeholders: ["verb", "board"],
    kind: "mutate",
    tool: {
      name: "runFirmware",
      args: {
        board: { type: "string", desc: "placed board instance id" },
        verb: { type: "string", desc: "run or stop" },
      },
    },
    desc: "Start or stop the virtual MCU runtime.",
  },
  ecadStatus: {
    key: "ecadStatus",
    label: "ECAD scene status",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "Summarize the placed ECAD parts, wires, and running firmware.",
    kind: "analyze",
    desc: "Report the virtual circuit state.",
  },
};

/** Extend the flux prompt registry (idempotent, additive). */
export function registerEcadPrompts(): void {
  Object.assign(PROMPT_REGISTRY, ECAD_PROMPTS);
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The ECAD sub-agent: deterministic, local-first — no brain round-trip needed
 * for catalog/placement/wiring/deploy/run. The original firmware agent (pin
 * mapping, skeleton headers) stays untouched; the orchestrator routes by key.
 */
export function makeEcadAgent(ecad: Ecad): SubAgent {
  const run = (
    key: string,
    args: Record<string, unknown>,
  ): ToolResult | null => {
    const a = (k: string) => String(args[k] ?? "");

    if (key === "listBoards") {
      const boards = ecad
        .catalog()
        .filter((p) => p.category === "board" || p.category === "display")
        .map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          mcu: "mcu" in p ? p.mcu : undefined,
          tiers: "tiers" in p ? p.tiers : ["virtual"],
        }));
      return { ok: true, data: { boards, total: boards.length } };
    }

    if (key === "insertMcu") {
      const q = a("part");
      const part = getPart(q) ?? findPartByName(q)[0];
      if (!part) return { ok: false, error: `no catalog part matches "${q}"` };
      const inst = ecad.sim.insert(part.id, {
        x: num(args.x),
        y: num(args.y),
        z: num(args.z),
      });
      ecad.layer.add(inst.id);
      return {
        ok: true,
        data: {
          instance: inst.id,
          part: part.id,
          name: part.name,
          pins:
            part.category === "board"
              ? part.headers.flatMap((h) => h.pins.map((p) => p.name))
              : part.pins.map((p) => p.name),
          hint: "wire with bus action ecad.wire { from: '<instance>.<pin>', to: '<instance>.<pin>' }",
        },
      };
    }

    if (key === "wirePins") {
      try {
        const wire = ecad.sim.wire(a("from"), a("to"));
        return {
          ok: true,
          data: { wire: wire.id, from: a("from"), to: a("to") },
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    if (key === "writeFirmware") {
      const board = a("board");
      const code = a("code");
      if (!code)
        return {
          ok: false,
          error: "the brain must supply `code` (ScadGen JS firmware source)",
        };
      try {
        const fw = ecad.sim.deploy(board, { code });
        return {
          ok: true,
          data: {
            board,
            firmwareId: fw.id,
            next: 'bus.run("ecad.run", board)',
          },
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    if (key === "deployFirmware") {
      const board = a("board");
      const fwId = a("firmwareId");
      try {
        const fw = ecad.sim.deploy(board, { firmwareId: fwId });
        return { ok: true, data: { board, firmwareId: fw.id, tier: fw.tier } };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    if (key === "runFirmware") {
      const board = a("board");
      const verb = (a("verb") || "run").toLowerCase();
      try {
        if (verb.startsWith("stop")) {
          ecad.sim.stop(board);
          return { ok: true, data: ecad.sim.status(board) };
        }
        void ecad.run(board);
        return { ok: true, data: ecad.sim.status(board) };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    if (key === "ecadStatus") {
      const parts = [...ecad.sim.instances.values()].map((i) => ({
        id: i.id,
        part: i.partId,
        name: ecad.sim.partOf(i.id)?.name,
      }));
      const wires = ecad.sim.wires.map(
        (w) => `${w.from.inst}.${w.from.pin} -> ${w.to.inst}.${w.to.pin}`,
      );
      const running = [...ecad.sim.instances.keys()]
        .map((id) => ({ id, status: ecad.sim.status(id) }))
        .filter((s) => s.status.running || s.status.error);
      return { ok: true, data: { parts, wires, running } };
    }

    return null; // not ours
  };

  return {
    id: "ecad",
    runLocal: (action, args) => run(action.key, args),
    async runBrain(action) {
      const seg =
        action.prompt.length > 160
          ? action.prompt.slice(0, 157) + "…"
          : action.prompt;
      return { ok: true, data: { hint: `ecad brain: ${seg}` } };
    },
  };
}

/** One-call AI hookup: registry prompts + the ecad sub-agent. Idempotent. */
export function registerEcadAgent(
  session: FluxSession,
  ecad: Ecad,
): () => void {
  registerEcadPrompts();
  const orch: Orchestrator = session.orchestrator;
  orch.registerAgent(makeEcadAgent(ecad));
  return () => orch.registerAgent(makeEcadAgent(ecad));
}

/** Exported for tests: the prompt keys this module owns. */
export const ECAD_PROMPT_KEYS = Object.keys(ECAD_PROMPTS);
