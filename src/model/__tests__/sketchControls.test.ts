import { describe, expect, it } from "vitest";
import {
  SKETCH_COMMANDS,
  SKETCH_PALETTE_COMMANDS,
  SKETCH_PARITY_GAPS,
  findSketchCommand,
  searchSketchCommands,
  sketchCommandAvailability,
} from "../sketchControls";

// Keys the CAD engine actually handles in sketch mode. If the engine gains or
// loses one, this test is the tripwire that forces the control map to follow.
const ENGINE_KEYS = ["L", "C", "A", "P", "D", "R", "S", "T", "E", "X"];

const lower = (values: readonly string[]) => values.map((v) => v.toLowerCase());

describe("sketch control registry", () => {
  it("has unique ids, labels and direct keys", () => {
    expect(new Set(SKETCH_COMMANDS.map((c) => c.id)).size).toBe(
      SKETCH_COMMANDS.length,
    );
    expect(new Set(SKETCH_COMMANDS.map((c) => c.label)).size).toBe(
      SKETCH_COMMANDS.length,
    );

    const directKeys = lower(SKETCH_COMMANDS.flatMap((c) => c.keys));
    expect(new Set(directKeys).size).toBe(directKeys.length);
  });

  it("does not give two commands the same AutoCAD alias", () => {
    const aliases = lower(SKETCH_COMMANDS.flatMap((c) => c.autocad));
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it("documents every key the engine handles", () => {
    const documented = new Set(lower(SKETCH_COMMANDS.flatMap((c) => c.keys)));
    for (const key of ENGINE_KEYS) {
      expect(documented.has(key.toLowerCase()), `missing key ${key}`).toBe(
        true,
      );
    }
  });

  it("maps every current toolbar tool", () => {
    const tools = new Set(
      SKETCH_COMMANDS.flatMap((c) =>
        c.action.type === "tool" ? [c.action.mode] : [],
      ),
    );
    for (const mode of [
      "select",
      "line",
      "polyline",
      "midpointLine",
      "rectangle",
      "centerRectangle",
      "slot",
      "polygon",
      "circle",
      "circle3p",
      "ellipse",
      "ellipticalArc",
      "spline",
      "bezier",
      "conic",
      "arc",
      "point",
      "dimension",
      "trim",
      "extend",
      "split",
    ]) {
      expect(tools.has(mode as never), `missing tool ${mode}`).toBe(true);
    }
  });

  it("uses cadjs-shaped names and gives every command a description", () => {
    for (const command of SKETCH_COMMANDS) {
      expect(command.cadjs[0]).toMatch(/^sketch\./);
      expect(command.description.length).toBeGreaterThan(10);
    }
  });

  it("maps every constraint button and marks value prompts", () => {
    const constraints = SKETCH_COMMANDS.filter(
      (command) => command.action.type === "constraint",
    );
    expect(constraints).toHaveLength(18);
    const types = constraints.flatMap((command) =>
      command.action.type === "constraint" ? [command.action.constraint] : [],
    );
    expect(new Set(types).size).toBe(18);
    for (const command of constraints) {
      expect(command.requires).toBe("selection");
      if (command.action.type !== "constraint") continue;
      expect(command.action.needsValue).toBe(
        [
          "distance",
          "distanceX",
          "distanceY",
          "angle",
          "radius",
          "diameter",
        ].includes(command.action.constraint),
      );
    }
  });

  it("keeps interface commands out of the palette", () => {
    expect(SKETCH_PALETTE_COMMANDS.length).toBeGreaterThan(15);
    expect(
      SKETCH_PALETTE_COMMANDS.some((c) => c.action.type === "command-palette"),
    ).toBe(false);
    expect(
      SKETCH_PALETTE_COMMANDS.some((c) => c.action.type === "controls-help"),
    ).toBe(false);
  });

  it("lists real parity gaps instead of dead buttons", () => {
    expect(SKETCH_PARITY_GAPS.length).toBeGreaterThanOrEqual(2);
    const commandAliases = new Set(
      lower(SKETCH_COMMANDS.flatMap((command) => command.autocad)),
    );
    for (const gap of SKETCH_PARITY_GAPS) {
      expect(gap.note.length).toBeGreaterThan(10);
      // A gap may share an app key (Text/T, Explode/X), but it must not be a
      // command alias that the palette would resolve to a real action.
      expect(
        commandAliases.has(gap.autocad.split(" / ")[0]!.toLowerCase()),
      ).toBe(false);
    }
  });
});

describe("sketch command lookup", () => {
  it("resolves app keys, names, AutoCAD aliases and cadjs ids", () => {
    expect(findSketchCommand("L")?.id).toBe("sketch.line");
    expect(findSketchCommand("line")?.id).toBe("sketch.line");
    expect(findSketchCommand("LINE")?.id).toBe("sketch.line");
    expect(findSketchCommand("REC")?.id).toBe("sketch.rectangle");
    expect(findSketchCommand("TR")?.id).toBe("sketch.trim");
    expect(findSketchCommand("MI")?.id).toBe("sketch.mirror");
    expect(findSketchCommand("FILLET")?.id).toBe("sketch.fillet");
    expect(findSketchCommand("CHA")?.id).toBe("sketch.chamfer");
    expect(findSketchCommand("OFFSET")?.id).toBe("sketch.offset");
    expect(findSketchCommand("O")?.id).toBe("sketch.offset");
    expect(findSketchCommand("JOIN")?.id).toBe("sketch.join");
    expect(findSketchCommand("J")?.id).toBe("sketch.join");
    expect(findSketchCommand("SPLIT")?.id).toBe("sketch.split");
    expect(findSketchCommand("SP")?.id).toBe("sketch.split");
    expect(findSketchCommand("MOVE")?.id).toBe("sketch.move");
    expect(findSketchCommand("M")?.id).toBe("sketch.move");
    expect(findSketchCommand("COPY")?.id).toBe("sketch.copy");
    expect(findSketchCommand("CP")?.id).toBe("sketch.copy");
    expect(findSketchCommand("ROTATE")?.id).toBe("sketch.rotate");
    expect(findSketchCommand("RO")?.id).toBe("sketch.rotate");
    expect(findSketchCommand("SCALE")?.id).toBe("sketch.scale");
    expect(findSketchCommand("SC")?.id).toBe("sketch.scale");
    expect(findSketchCommand("PATTERN")?.id).toBe("sketch.patternLinear");
    expect(findSketchCommand("AR")?.id).toBe("sketch.patternLinear");
    expect(findSketchCommand("CIRCULAR")?.id).toBe("sketch.patternCircular");
    expect(findSketchCommand("PATTERNCIRCULAR")?.id).toBe(
      "sketch.patternCircular",
    );
    expect(findSketchCommand("HOR")?.id).toBe("sketch.constraint.horizontal");
    expect(findSketchCommand("sketch.circle")?.id).toBe("sketch.circle");
    expect(findSketchCommand("3P")?.id).toBe("sketch.circle3p");
    expect(findSketchCommand("CIRCLE3P")?.id).toBe("sketch.circle3p");
    expect(findSketchCommand("CRECT")?.id).toBe("sketch.centerRectangle");
    expect(findSketchCommand("ELLIPSE")?.id).toBe("sketch.ellipse");
    expect(findSketchCommand("ELLIPTICALARC")?.id).toBe("sketch.ellipticalArc");
    expect(findSketchCommand("SPLINE")?.id).toBe("sketch.spline");
    expect(findSketchCommand("SPL")?.id).toBe("sketch.spline");
    expect(findSketchCommand("BEZIER")?.id).toBe("sketch.bezier");
    expect(findSketchCommand("BZ")?.id).toBe("sketch.bezier");
    expect(findSketchCommand("CONIC")?.id).toBe("sketch.conic");
    expect(findSketchCommand("CO")?.id).toBe("sketch.conic");
    expect(findSketchCommand("SLOT")?.id).toBe("sketch.slot");
    expect(findSketchCommand("POL")?.id).toBe("sketch.polygon");
    expect(findSketchCommand("MIDLINE")?.id).toBe("sketch.midpointLine");
    expect(findSketchCommand("MID")?.id).toBe("sketch.constraint.midpoint");
    expect(findSketchCommand("POINTONCIRCLE")?.id).toBe(
      "sketch.constraint.point-on-circle",
    );
    expect(findSketchCommand("DISTX")?.id).toBe("sketch.constraint.distance-x");
    expect(findSketchCommand("SYM")?.id).toBe("sketch.constraint.symmetric");
    expect(findSketchCommand("erase")?.id).toBe("sketch.delete");
  });

  it("maps 3-point circle as a real draw tool", () => {
    const command = findSketchCommand("CIRCLE3P");
    expect(command?.action).toEqual({ type: "tool", mode: "circle3p" });
    expect(command?.keys).toEqual([]);
  });

  it("returns null for unknown or empty queries", () => {
    expect(findSketchCommand("")).toBeNull();
    expect(findSketchCommand("   ")).toBeNull();
    expect(findSketchCommand("polyline")?.id).toBe("sketch.polyline");
    expect(findSketchCommand("hatch")?.id).toBe("sketch.hatch");
    expect(findSketchCommand("block")?.id).toBe("sketch.blockCreate");
  });

  it("searches by prefix for the palette", () => {
    expect(searchSketchCommands("rec").map((c) => c.id)).toContain(
      "sketch.rectangle",
    );
    expect(searchSketchCommands("")).toBe(SKETCH_COMMANDS);
    expect(searchSketchCommands("zzzz")).toHaveLength(0);
  });
});

describe("sketch command availability", () => {
  const state = {
    hasSelection: false,
    hasPointSelection: false,
    canUndo: false,
    canRedo: false,
  };

  it("blocks selection-dependent and empty-history commands", () => {
    expect(
      sketchCommandAvailability(findSketchCommand("delete")!, state).enabled,
    ).toBe(false);
    expect(
      sketchCommandAvailability(findSketchCommand("fix")!, state).enabled,
    ).toBe(false);
    expect(
      sketchCommandAvailability(findSketchCommand("mirror")!, state).enabled,
    ).toBe(false);
    expect(
      sketchCommandAvailability(findSketchCommand("undo")!, state).enabled,
    ).toBe(false);
  });

  it("enables commands when their prerequisites are met", () => {
    const ready = {
      hasSelection: true,
      hasPointSelection: true,
      canUndo: true,
      canRedo: true,
    };
    for (const query of [
      "delete",
      "construction",
      "fix",
      "mirror",
      "undo",
      "redo",
    ]) {
      expect(
        sketchCommandAvailability(findSketchCommand(query)!, ready).enabled,
      ).toBe(true);
    }
  });

  it("only enables constraints the solver offers", () => {
    const horizontal = findSketchCommand("HOR")!;
    const selected = { ...state, hasSelection: true };
    expect(
      sketchCommandAvailability(horizontal, {
        ...selected,
        availableConstraints: ["vertical"],
      }).enabled,
    ).toBe(false);
    expect(
      sketchCommandAvailability(horizontal, {
        ...selected,
        availableConstraints: ["horizontal"],
      }).enabled,
    ).toBe(true);
  });
});
