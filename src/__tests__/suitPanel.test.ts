import { describe, expect, it } from "vitest";

// suitPanel.ts is the pure data side of the Suit Settings panel: building rows
// from a ProjectDoc and applying a single edit back onto it (clamped, validated).
// The VR panel (vrSuitPanel.ts) is the visual twin over the same data.
import {
  applySuitEdit,
  suitPanelFor,
  SUIT_PANEL_LABEL,
} from "../project/suitPanel";
import {
  newProject,
  newAccount,
  newTeam,
  DEFAULT_SETTINGS,
} from "../project/model";

const acc = newAccount();
const team = newTeam(acc.id);
const freshDoc = () => newProject({ account: acc, team, name: "Workshop" });

describe("suitPanelFor", () => {
  it("builds rows from the doc with live values", () => {
    const doc = freshDoc();
    const panel = suitPanelFor(doc);
    expect(panel.label).toBe(SUIT_PANEL_LABEL);
    const byId = new Map(panel.rows.map((r) => [r.parameterId, r]));
    expect(byId.get("name")!.value).toBe("Workshop");
    expect(byId.get("units")!.value).toBe(DEFAULT_SETTINGS.units);
    expect(byId.get("physics")!.value).toBe("realistic");
    expect(byId.get("render")!.value).toBe("standard");
    expect(byId.get("collabPolicy")!.value).toBe("private");
    expect(byId.get("roomWidth")!.value).toBe(DEFAULT_SETTINGS.room.width);
    expect(byId.get("deskHeight")!.value).toBe(
      DEFAULT_SETTINGS.room.deskHeight,
    );
    expect(byId.get("collabPolicy")!.enumValues).toContain("public-view");
    expect(byId.get("name")!.kind).toBe("string");
    expect(byId.get("roomWidth")!.kind).toBe("quantity");
    expect(byId.get("roomWidth")!.units).toBe("m");
  });

  it("clamps quantity edits inside [min,max]", () => {
    const doc = freshDoc();
    expect(applySuitEdit(doc, "roomWidth", 100)).toBe(true);
    expect(doc.settings.room.width).toBe(20); // max
    expect(applySuitEdit(doc, "roomWidth", -5)).toBe(true);
    expect(doc.settings.room.width).toBe(2); // min
    // non-finite values rejected, doc untouched
    expect(applySuitEdit(doc, "roomWidth", Number.NaN)).toBe(false);
    expect(doc.settings.room.width).toBe(2);
  });

  it("accepts valid enum values and rejects invalid ones", () => {
    const doc = freshDoc();
    expect(applySuitEdit(doc, "physics", "ghost")).toBe(true);
    expect(doc.settings.physics).toBe("ghost");
    expect(applySuitEdit(doc, "physics", "not-a-physics")).toBe(false);
    expect(doc.settings.physics).toBe("ghost");
    expect(applySuitEdit(doc, "units", "in")).toBe(true);
    expect(doc.settings.units).toBe("in");
  });

  it("keeps unrelated settings intact on edits", () => {
    const doc = freshDoc();
    applySuitEdit(doc, "deskHeight", 0.9);
    expect(doc.settings.room.deskHeight).toBe(0.9);
    expect(doc.settings.room.width).toBe(DEFAULT_SETTINGS.room.width);
    expect(doc.settings.units).toBe(DEFAULT_SETTINGS.units);
    expect(doc.name).toBe("Workshop");
    // a name string row can be edited too
    expect(applySuitEdit(doc, "name", "")).toBe(true);
    expect(doc.name).toBe("");
    expect(doc.settings.room.deskHeight).toBe(0.9);
  });

  it("rejects edits to unknown parameter ids without throwing", () => {
    const doc = freshDoc();
    expect(applySuitEdit(doc, "nope", "x")).toBe(false);
  });
});
