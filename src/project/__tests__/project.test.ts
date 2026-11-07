import { describe, it, expect, beforeEach } from "vitest";

// Node test env has no localStorage; stub it before store.ts touches it.
if (
  typeof globalThis.localStorage === "undefined" ||
  globalThis.localStorage === null
) {
  const mem = new Map<string, string>();
  const store = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: store,
    configurable: true,
  });
}

import {
  newAccount,
  newTeam,
  newProject,
  nextId,
  issueShareToken,
  resolveShareToken,
  revokeShareToken,
  resolveSettings,
  accessForShareUrl,
  addProjectNote,
  canRoleComment,
  canRoleEdit,
  removeProjectNote,
  setProjectMember,
  type ProjectDoc,
} from "../model";
import {
  getOrCreateActiveProject,
  getProject,
  createProject,
  listProjects,
  migrateLegacyDesignIntoProject,
  roleForShareUrl,
  saveProject,
  getAccount,
  getTeam,
} from "../store";

beforeEach(() => {
  localStorage.clear();
});

describe("project model", () => {
  it("issues unique ids", () => {
    expect(nextId()).not.toBe(nextId());
    expect(nextId("x")).toMatch(/^x_/);
  });

  it("builds a project with an id, team, owner, and full settings", () => {
    const acc = newAccount("Me");
    const team = newTeam(acc.id);
    const doc = newProject({ account: acc, team, name: "Robot Arm" });
    expect(doc.id).toMatch(/^prj_/);
    expect(doc.teamId).toBe(team.id);
    expect(doc.ownerId).toBe(acc.id);
    expect(doc.name).toBe("Robot Arm");
    expect(doc.settings.units).toBe("mm");
    expect(doc.settings.physics).toBe("realistic");
    expect(doc.settings.room.deskHeight).toBeCloseTo(0.75);
    expect(doc.settings.manufacturing.defaultNozzle).toBeCloseTo(0.4);
    expect(doc.settings.ai.enabledAgents).toEqual(
      expect.arrayContaining(["orchestrator", "pcb", "mcad"]),
    );
    expect(doc.settings.collab.policy).toBe("private");
    expect(doc.settings.collab.tokens).toEqual([]);
    expect(doc.settings.collab.members).toEqual([]);
    expect(doc.settings.collab.notes).toEqual([]);
  });

  it("merges a partial settings override deep (room/manufacturing/ai/collab)", () => {
    const acc = newAccount();
    const team = newTeam(acc.id);
    const doc = newProject({
      account: acc,
      team,
      settings: {
        units: "in",
        room: { deskHeight: 0.9 },
        manufacturing: { defaultMaterial: "ABS" },
        ai: { enabledAgents: ["pcb"] },
      },
    });
    expect(doc.settings.units).toBe("in");
    // deep-merge: only the listed keys are overridden, siblings kept
    expect(doc.settings.room.deskHeight).toBeCloseTo(0.9);
    expect(doc.settings.room.width).toBeCloseTo(5); // untouched default
    expect(doc.settings.manufacturing.defaultMaterial).toBe("ABS");
    expect(doc.settings.manufacturing.defaultNozzle).toBeCloseTo(0.4); // default
    expect(doc.settings.ai.enabledAgents).toEqual(["pcb"]);
    // physics + render fall back to defaults
    expect(doc.settings.physics).toBe("realistic");
  });

  it("deep-merges DEFAULT_SETTINGS so partial overrides never lose siblings", () => {
    const acc = newAccount();
    const team = newTeam(acc.id);
    const doc: ProjectDoc = newProject({ account: acc, team });
    // simulate a partial patch the way newProject does
    doc.settings = {
      ...doc.settings,
      units: "cm",
    } as ProjectDoc["settings"];
    expect(doc.settings.physics).toBe("realistic");
    expect(doc.settings.render).toBe("standard");
    expect(doc.settings.units).toBe("cm");
  });

  it("issues + resolves + revokes share tokens (view vs edit)", () => {
    const acc = newAccount();
    const team = newTeam(acc.id);
    const doc = newProject({ account: acc, team });

    const view = issueShareToken(doc, "view", "for Dave", 60_000);
    const edit = issueShareToken(doc, "edit", "co-designer", 60_000);
    expect(view.url).toContain(`/project/${doc.id}/view?t=${view.token.id}`);
    expect(edit.url).toContain(`/project/${doc.id}/enter?t=${edit.token.id}`);
    expect(doc.settings.collab.tokens).toHaveLength(2);

    expect(resolveShareToken(doc, view.token.id)).toBe("view");
    expect(resolveShareToken(doc, edit.token.id)).toBe("edit");
    expect(resolveShareToken(doc, "nope")).toBeNull();

    // expiry
    expect(
      resolveShareToken(doc, view.token.id, Date.now() + 120_000),
    ).toBeNull();

    // revoke
    expect(revokeShareToken(doc, view.token.id)).toBe(true);
    expect(resolveShareToken(doc, view.token.id)).toBeNull();
    expect(revokeShareToken(doc, "nope")).toBe(false);
  });

  it("resolveSettings: user overlay wins over project defaults (personal vs shared)", () => {
    const acc = newAccount();
    const team = newTeam(acc.id);
    const doc = newProject({
      account: acc,
      team,
      settings: { render: "xray", units: "mm", physics: "realistic" },
    });
    // no overlay → project defaults
    const base = resolveSettings(doc, { accountId: acc.id });
    expect(base.render).toBe("xray");
    expect(base.units).toBe("mm");
    expect(base.physics).toBe("realistic");
    expect(base.soundOn).toBe(true);
    expect(base.viewScale).toBe(1);

    // overlay overrides render + units; physics falls to project
    const over = resolveSettings(doc, {
      accountId: acc.id,
      render: "wireframe",
      units: "in",
    });
    expect(over.render).toBe("wireframe");
    expect(over.units).toBe("in");
    expect(over.physics).toBe("realistic");
    // model-changing shared bits (room, manufacturing) are NEVER overlaid
    expect(over.room.deskHeight).toBeCloseTo(0.75);
  });

  it("resolves comment access and the per-link VR gate", () => {
    const acc = newAccount();
    const team = newTeam(acc.id);
    const doc = newProject({ account: acc, team });
    const comment = issueShareToken(doc, "comment", "reviewer", 0, {
      allowVr: true,
    });
    expect(comment.url).toContain("vr=1");
    expect(accessForShareUrl(doc, "enter", comment.token.id)).toEqual({
      role: "comment",
      allowVr: true,
    });
    expect(canRoleComment("comment")).toBe(true);
    expect(canRoleEdit("comment")).toBe(false);

    const twoD = issueShareToken(doc, "view", "2d only");
    expect(accessForShareUrl(doc, "view", twoD.token.id)).toEqual({
      role: "view",
      allowVr: false,
    });
  });

  it("stores named roles and notes on specific targets", () => {
    const acc = newAccount();
    const team = newTeam(acc.id);
    const doc = newProject({ account: acc, team });
    setProjectMember(doc, {
      accountId: "acc_dave",
      name: "Dave",
      role: "comment",
    });
    expect(doc.settings.collab.members[0]).toMatchObject({
      accountId: "acc_dave",
      role: "comment",
      seeTree: true,
    });

    const note = addProjectNote(doc, {
      authorId: acc.id,
      authorName: acc.name,
      body: "  check this corner  ",
      targetIds: ["el_1", "el_1", "el_2"],
    });
    expect(note?.body).toBe("check this corner");
    expect(note?.targetIds).toEqual(["el_1", "el_2"]);
    expect(removeProjectNote(doc, note!.id, "someone_else")).toBe(false);
    expect(removeProjectNote(doc, note!.id, acc.id)).toBe(true);
  });

  it("public-view policy grants view to anyone via roleForShareUrl", () => {
    const acc = newAccount();
    const team = newTeam(acc.id);
    const doc = newProject({
      account: acc,
      team,
      settings: { collab: { policy: "public-view", tokens: [] } },
    });
    expect(roleForShareUrl(doc, "view", "")).toBe("view");
    expect(roleForShareUrl(doc, "enter", "")).toBe("edit"); // owner enter
  });

  it("private policy requires a token for enter; view link needs a token", () => {
    const acc = newAccount();
    const team = newTeam(acc.id);
    const doc = newProject({ account: acc, team });
    const tok = issueShareToken(doc, "view");
    expect(roleForShareUrl(doc, "view", tok.token.id)).toBe("view");
    expect(roleForShareUrl(doc, "view", "bad")).toBeNull();
    // enter with no token = owner full edit
    expect(roleForShareUrl(doc, "enter", "")).toBe("edit");
  });
});

describe("project store (localStorage)", () => {
  it("creates an active project on first boot and persists it", () => {
    const doc = getOrCreateActiveProject();
    expect(doc.id).toMatch(/^prj_/);
    expect(getProject(doc.id)).not.toBeNull();
    expect(listProjects()).toHaveLength(1);
  });

  it("returns the same active project on re-boot (no duplicate)", () => {
    const a = getOrCreateActiveProject();
    const b = getOrCreateActiveProject();
    expect(b.id).toBe(a.id);
    expect(listProjects()).toHaveLength(1);
  });

  it("seedDesign is carried into the active project", () => {
    const nodes = [{ nodeId: "F1", kind: "box" }] as unknown[];
    const doc = getOrCreateActiveProject({ savedAt: 1, nodes, assets: [] });
    expect(doc.design.nodes).toEqual(nodes);
  });

  it("migrateLegacyDesignIntoProject folds the old single-doc blob in", () => {
    // Pre-project-model layout: everything in "scadgen.project.v1"
    const legacy = JSON.stringify({
      v: 1,
      savedAt: 123,
      nodes: [
        { nodeId: "F1", kind: "box" },
        { nodeId: "F2", kind: "cyl" },
      ],
      assets: [
        { assetId: "a1", format: "step", name: "x.step", bytesB64: "xx" },
      ],
    });
    localStorage.setItem("scadgen.project.v1", legacy);
    const doc = migrateLegacyDesignIntoProject();
    expect(doc.design.nodes).toHaveLength(2);
    expect(doc.design.assets).toHaveLength(1);
    // and it became the active project
    expect(getProject(doc.id)?.design.nodes).toHaveLength(2);
  });

  it("saveProject persists mutations; getProject reads them back", () => {
    const acc = getAccount();
    const team = getTeam();
    const doc = createProject({ name: "A" });
    doc.settings.units = "in";
    doc.settings.room.deskHeight = 0.8;
    saveProject(doc);
    const re = getProject(doc.id);
    expect(re?.settings.units).toBe("in");
    expect(re?.settings.room.deskHeight).toBeCloseTo(0.8);
  });
});
