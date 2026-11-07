// src/project/model.ts — the ScadGen project / "suit" model.
//
// This is the spine everything (VR, AI, comms, print wizard, share links)
// plugs into. Local-only for now: the store is localStorage; the account +
// cloud seam is a no-op so the same model survives a backend swap.
//
// Layout (one id, one team, one settings block per project):
//
//   Account   — the person. "me". Owned keys, avatar, ai prefs. (local)
//   Team      — a collaboration group. A project belongs to one team.
//   Project   — the design doc + all settings. Has id + teamId + owner.
//   Session   — a live room where N people open the same project. See
//               session.ts: seats, surface (2d|vr), selection awareness.
//               Local/tab-scoped today (BroadcastChannel); a server transport
//               is the seam for two machines.
//
// One node of truth: the ProjectDoc (in store.ts) is the only serializable
// thing. Everything else (FluxSession, VR room) derives from it.

export type Units = "mm" | "cm" | "in";

export type PhysicsPersonality =
  | "realistic" // gravity + throw: parts arc, bounce, come to rest
  | "magnetic" // parts follow the hand, no gravity, snap to touches
  | "ghost"; // no collider, pure kinematic move (no throw)

export type RenderStyle =
  | "standard"
  | "wireframe"
  | "xray"
  | "colorByBody"
  | "colorByMaterial";

export type CollabPolicy = "private" | "invited" | "public-view";

/** The access a person or link has on a project. */
export type ShareRole = "view" | "comment" | "edit";

export interface ProjectMember {
  accountId: string;
  name: string;
  role: ShareRole;
  /** Let this person see the shared feature tree (always true today). */
  seeTree: boolean;
}

/** A note pinned to selected sketch/body element ids. */
export interface ProjectNote {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  targetIds: string[];
  createdAt: number;
  resolved?: boolean;
}

/* ------------------------------------------------------------------------ */
/* Account (local, single-user for now)                                      */
/* ------------------------------------------------------------------------ */

export interface Account {
  /** Stable local id for "me" (no auth yet; a random local uuid). */
  id: string;
  name: string;
  /** What other people in the suit see of me. */
  avatarColor: string;
  /**
   * The LLM brain keys. Account-level, NOT per-project: entered once,
   * private to this machine, applied to every project. A project may override
   * (its own key) — the account key is the default fallback.
   */
  ai: {
    provider: "local" | "openai" | "anthropic" | "google" | "flux-mcp";
    apiKey?: string;
  };
  /** Avatar + ai prefs sync to the suit so others see a consistent "me". */
  updatedAt: number;
}

/* ------------------------------------------------------------------------ */
/* Team                                                                       */
/* ------------------------------------------------------------------------ */

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[]; // account ids
}

/* ------------------------------------------------------------------------ */
/* Project settings (the "actual settings" the user sees + edits)            */
/* ------------------------------------------------------------------------ */

export interface ProjectSettings {
  /** Display units the user works in (model stays metric internally). */
  units: Units;
  /** The world personality — how parts behave when grabbed/thrown. */
  physics: PhysicsPersonality;
  /** The view style for the user's own model. */
  render: RenderStyle;
  /** Room + desk the suit is built from. */
  room: {
    width: number; // meters
    depth: number; // meters
    height: number; // meters
    deskWidth: number; // meters
    deskDepth: number; // meters
    deskHeight: number; // meters (e.g. 0.75 = a real desk)
  };
  /** Manufacturing defaults the print wizard pre-fills. */
  manufacturing: {
    defaultSlicer: "orca" | "prusaslicer";
    defaultMaterial: "PLA" | "PETG" | "ABS" | "nylon";
    defaultNozzle: number; // mm
    defaultLayerHeight: number; // mm
    defaultInfill: number; // %
  };
  /** Who AI sub-agents are active for the project (per-project mute). */
  ai: {
    enabledAgents: ("orchestrator" | "pcb" | "mcad" | "firmware" | "parts")[];
    /**
     * Optional project-scoped key override. When null, the account key is
     * used. Lets a project carry its own budget without touching the account.
     */
    keyOverride?: string;
  };
  /** Who can join the suit. */
  collab: {
    policy: CollabPolicy;
    /**
     * Issued share tokens. View-only and editor tokens, each revocable.
     * (Local stub — a cloud would sign + expire these.)
     */
    tokens: ShareToken[];
    /** Named people and their persisted access. */
    members: ProjectMember[];
    /** Comments pinned to specific element ids. */
    notes: ProjectNote[];
  };
}

/** A single issued share link. Local-only, revocable. */
export interface ShareToken {
  id: string;
  /** view = read-only; comment = notes only; edit = full editor. */
  role: ShareRole;
  /** Whether this link may enter the VR surface. */
  allowVr: boolean;
  /** Expiry epoch ms (0 = never). */
  expiresAt: number;
  createdAt: number;
  /** Human label ("for Dave", "public viewer"). */
  label?: string;
}

export interface ShareAccess {
  role: ShareRole;
  allowVr: boolean;
}

/** Recursive partial: lets callers override any depth of settings without
 *  carrying the full object. Defined as a type (not generic signature) so it
 *  composes cleanly with exactOptionalPropertyTypes. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/* ------------------------------------------------------------------------ */
/* The project doc — the only serializable node of truth.                    */
/* ------------------------------------------------------------------------ */

export const PROJECT_DOC_VERSION = 1 as const;

export interface ProjectDoc {
  v: typeof PROJECT_DOC_VERSION;
  id: string; // the project id (this is the share-link path param)
  name: string;
  teamId: string; // which team owns it
  ownerId: string; // which account owns it
  createdBy: number;
  updatedBy: string; // last account id to touch it
  updatedAt: number;
  /**
   * The design doc itself (feature nodes + import assets + serializable
   * ecad/pcb state). We keep the existing store shape — this field IS the
   * `scadgen.project.v1` blob, so loading a ProjectDoc hydrates exactly what
   * the scene has always hydrated. The model (nodes) never moves; we add the
   * envelope around it.
   */
  design: {
    savedAt: number;
    nodes: unknown[]; // ScadgenFeatureNode[] (kept opaque here on purpose)
    assets: unknown[]; // ImportAsset entries (opaque)
    /**
     * The ECAD scene + firmware (EcadSnapshot, see ecad/persist.ts). Opaque
     * here on purpose: the project model must not depend on the simulator.
     * Absent for CAD-only projects.
     */
    ecad?: unknown;
  };
  /** The full settings block — project-level defaults. */
  settings: ProjectSettings;
}

/* ------------------------------------------------------------------------ */
/* Defaults + construction                                                    */
/* ------------------------------------------------------------------------ */

/** A real, humane desk + room so the suit feels like a workshop out of the gate. */
export const DEFAULT_ROOM: ProjectSettings["room"] = {
  width: 5,
  depth: 5,
  height: 3,
  deskWidth: 1.6,
  deskDepth: 0.8,
  deskHeight: 0.75,
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  units: "mm",
  physics: "realistic",
  render: "standard",
  room: DEFAULT_ROOM,
  manufacturing: {
    defaultSlicer: "orca",
    defaultMaterial: "PLA",
    defaultNozzle: 0.4,
    defaultLayerHeight: 0.2,
    defaultInfill: 20,
  },
  ai: {
    enabledAgents: ["orchestrator", "pcb", "mcad", "firmware", "parts"],
  },
  collab: {
    policy: "private",
    tokens: [],
    members: [],
    notes: [],
  },
};

let idCounter = 0;
export function nextId(prefix = "prj"): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}${idCounter}`;
}

export function newAccount(name = "You"): Account {
  return {
    id: nextId("acc"),
    name,
    avatarColor: "#4f9dfd",
    ai: { provider: "local" },
    updatedAt: Date.now(),
  };
}

export function newTeam(ownerId: string, name = "My Team"): Team {
  return { id: nextId("team"), name, ownerId, memberIds: [ownerId] };
}

/**
 * New empty project. `design` starts empty (the loader merges it with any
 * existing localStorage doc if the caller passes `seedDesign`). `settings` is
 * a DeepPartial: override any nested depth without carrying the full object.
 */
export function newProject(opts: {
  account: Account;
  team: Team;
  name?: string;
  seedDesign?: ProjectDoc["design"];
  settings?: DeepPartial<ProjectSettings>;
}): ProjectDoc {
  const now = Date.now();
  return {
    v: PROJECT_DOC_VERSION,
    id: nextId("prj"),
    name: opts.name ?? "Untitled",
    teamId: opts.team.id,
    ownerId: opts.account.id,
    createdBy: now,
    updatedBy: opts.account.id,
    updatedAt: now,
    design: opts.seedDesign ?? { savedAt: now, nodes: [], assets: [] },
    settings: mergeSettings(opts.settings),
  };
}

/** Patch a partial settings object over the defaults (recursive). */
function mergeSettings(patch?: DeepPartial<ProjectSettings>): ProjectSettings {
  const base = DEFAULT_SETTINGS;
  if (!patch) return { ...base };
  const collab = patch.collab;
  return {
    units: patch.units ?? base.units,
    physics: patch.physics ?? base.physics,
    render: patch.render ?? base.render,
    room: { ...base.room, ...patch.room },
    manufacturing: { ...base.manufacturing, ...patch.manufacturing },
    ai: { ...base.ai, ...patch.ai },
    collab: {
      policy: collab?.policy ?? base.collab.policy,
      // Lists are taken wholesale when provided; issueShareToken appends.
      tokens: (collab?.tokens ?? base.collab.tokens) as ShareToken[],
      members: (collab?.members ?? base.collab.members) as ProjectMember[],
      notes: (collab?.notes ?? base.collab.notes) as ProjectNote[],
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Share-link helpers (the "view" and "enter" two-link model)                 */
/* ------------------------------------------------------------------------ */

/**
 * Issue a token for a project. `role` decides what the link can do:
 *   "view" → a read-only suit (see + chat, no edit, no own-AI-by-default)
 *   "edit" → a full editor suit
 * Returns the project id (the URL path param) — the token id is what the
 * joiner presents to enter.
 */
export function issueShareToken(
  doc: ProjectDoc,
  role: ShareRole,
  label?: string,
  ttlMs = 0,
  opts?: { allowVr?: boolean },
): { token: ShareToken; url: string } {
  const token: ShareToken = {
    id: nextId("tok"),
    role,
    allowVr: opts?.allowVr ?? false,
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    createdAt: Date.now(),
  };
  if (label !== undefined) token.label = label;
  doc.settings.collab.tokens = [...doc.settings.collab.tokens, token];
  doc.updatedAt = Date.now();
  const path = role === "view" ? "view" : "enter";
  const vr = token.allowVr ? "&vr=1" : "";
  return { token, url: `/project/${doc.id}/${path}?t=${token.id}${vr}` };
}

/** Resolve a shared-token URL param to the role it grants, or null if invalid. */
export function resolveShareToken(
  doc: ProjectDoc,
  tokenParam: string,
  now = Date.now(),
): ShareRole | null {
  const t = doc.settings.collab.tokens.find((t) => t.id === tokenParam);
  if (!t) return null;
  if (t.expiresAt > 0 && now > t.expiresAt) return null;
  // A public-view policy grants view to anyone (no token checks role=edit).
  if (doc.settings.collab.policy === "public-view" && t.role === "view")
    return "view";
  return t.role;
}

/** Revoke a token (remove it from the doc). */
export function revokeShareToken(doc: ProjectDoc, tokenId: string): boolean {
  const before = doc.settings.collab.tokens.length;
  doc.settings.collab.tokens = doc.settings.collab.tokens.filter(
    (t) => t.id !== tokenId,
  );
  doc.updatedAt = Date.now();
  return doc.settings.collab.tokens.length !== before;
}

/** Role powers. Comment can annotate but cannot change geometry. */
export function canRoleEdit(role: ShareRole): boolean {
  return role === "edit";
}

export function canRoleComment(role: ShareRole): boolean {
  return role === "comment" || role === "edit";
}

export function memberFor(
  doc: ProjectDoc,
  accountId: string,
): ProjectMember | null {
  return (
    doc.settings.collab.members.find((m) => m.accountId === accountId) ?? null
  );
}

/** Add or update a named person's role. The caller owns persistence/auth. */
export function setProjectMember(
  doc: ProjectDoc,
  member: Omit<ProjectMember, "seeTree"> & { seeTree?: boolean },
): ProjectMember {
  const next: ProjectMember = {
    accountId: member.accountId,
    name: member.name,
    role: member.role,
    seeTree: member.seeTree ?? true,
  };
  const i = doc.settings.collab.members.findIndex(
    (m) => m.accountId === next.accountId,
  );
  const members = doc.settings.collab.members.slice();
  if (i === -1) members.push(next);
  else members[i] = next;
  doc.settings.collab.members = members;
  doc.updatedAt = Date.now();
  return next;
}

/** Add a comment pinned to target element ids. Empty notes are refused. */
export function addProjectNote(
  doc: ProjectDoc,
  input: {
    authorId: string;
    authorName: string;
    body: string;
    targetIds?: readonly string[];
    now?: number;
  },
): ProjectNote | null {
  const body = input.body.trim();
  if (!body) return null;
  const note: ProjectNote = {
    id: nextId("note"),
    authorId: input.authorId,
    authorName: input.authorName,
    body,
    targetIds: [...new Set(input.targetIds ?? [])],
    createdAt: input.now ?? Date.now(),
  };
  doc.settings.collab.notes = [...doc.settings.collab.notes, note];
  doc.updatedAt = Date.now();
  return note;
}

export function removeProjectNote(
  doc: ProjectDoc,
  noteId: string,
  actorId: string,
): boolean {
  const note = doc.settings.collab.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (note.authorId !== actorId && doc.ownerId !== actorId) return false;
  doc.settings.collab.notes = doc.settings.collab.notes.filter(
    (n) => n.id !== noteId,
  );
  doc.updatedAt = Date.now();
  return true;
}

/**
 * Backfill fields added after a doc was already stored. Idempotent; no cloud
 * migration needed for local docs.
 */
export function normalizeProjectDoc(doc: ProjectDoc): ProjectDoc {
  const collab = doc.settings.collab;
  collab.members ??= [];
  collab.notes ??= [];
  for (const token of collab.tokens) token.allowVr ??= false;
  return doc;
}

/** Resolve a share URL to the role and VR gate it actually grants. */
export function accessForShareUrl(
  doc: ProjectDoc,
  urlRole: "view" | "enter",
  tokenParam: string,
  now = Date.now(),
): ShareAccess | null {
  if (urlRole === "enter" && !tokenParam) {
    return { role: "edit", allowVr: true };
  }
  const token = doc.settings.collab.tokens.find((t) => t.id === tokenParam);
  if (token && (token.expiresAt === 0 || now <= token.expiresAt)) {
    return { role: token.role, allowVr: token.allowVr === true };
  }
  if (urlRole === "view" && doc.settings.collab.policy === "public-view") {
    return { role: "view", allowVr: false };
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Settings merge: per-user overlay on top of project defaults               */
/* ------------------------------------------------------------------------ */

/**
 * The per-user personalization overlay. Pure display prefs — they do NOT
 * change the model or other people's experience. The project settings are the
 * shared defaults; this is the "how I see it" layer.
 */
export interface UserOverlay {
  accountId: string;
  render?: RenderStyle;
  units?: Units;
  physics?: PhysicsPersonality;
  soundOn?: boolean;
  /** "giant" mode: scale the user's view (not the model) when a part is too small. */
  viewScale?: number;
}

/**
 * The single place a setting is resolved. Project default → user overlay wins.
 * Keeps the "personal vs shared" rule in one function:
 *   - model-changing (units label, physics, render) = personal (overlay)
 *   - the model itself = shared (always the doc)
 */
export function resolveSettings(
  doc: ProjectDoc,
  overlay: UserOverlay,
): ProjectSettings & { soundOn: boolean; viewScale: number } {
  return {
    ...doc.settings,
    units: overlay.units ?? doc.settings.units,
    physics: overlay.physics ?? doc.settings.physics,
    render: overlay.render ?? doc.settings.render,
    soundOn: overlay.soundOn ?? true,
    viewScale: overlay.viewScale ?? 1,
  } as ProjectSettings & { soundOn: boolean; viewScale: number };
}
