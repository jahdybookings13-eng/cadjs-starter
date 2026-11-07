// src/project/store.ts — local persistence for the project/suit model.
//
// localStorage today (no accounts, no cloud). The store is the seam: swap the
// backends in get* / save* for a cloud later and nothing upstream changes.
// It composes with the existing documentStore (the design blob) — a
// ProjectDoc.design IS the same node/asset shape the scene has always
// serialized.
//
// Keys:
//   scadgen.account.v1   — the local account (one per machine)
//   scadgen.team.v1      — the local team
//   scadgen.projects.v1  — a map { [projectId]: ProjectDoc }
//   scadgen.active.v1    — the active project id
//   scadgen.overlay.v1   — per-account display overlay (UserOverlay)

import {
  type Account,
  type DeepPartial,
  type ProjectDoc,
  type ShareAccess,
  type ShareRole,
  type Team,
  type UserOverlay,
  DEFAULT_SETTINGS,
  accessForShareUrl,
  newAccount,
  newProject,
  newTeam,
  normalizeProjectDoc,
} from "./model";
import { parseSharePath, type SharePath } from "./session";

const K_ACCOUNT = "scadgen.account.v1";
const K_TEAM = "scadgen.team.v1";
const K_PROJECTS = "scadgen.projects.v1";
const K_ACTIVE = "scadgen.active.v1";
const K_OVERLAY = "scadgen.overlay.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — non-fatal, in-memory copy is still valid */
  }
}

/* ------------------------------------------------------------------------ */
/* Account + team (one each, local)                                          */
/* ------------------------------------------------------------------------ */

export function getAccount(): Account {
  const existing = read<Account | null>(K_ACCOUNT, null);
  if (existing && existing.id) return existing;
  const acc = newAccount();
  write(K_ACCOUNT, acc);
  return acc;
}

export function saveAccount(acc: Account): void {
  write(K_ACCOUNT, { ...acc, updatedAt: Date.now() });
}

export function getTeam(): Team {
  const existing = read<Team | null>(K_TEAM, null);
  if (existing && existing.id) return existing;
  const acc = getAccount();
  const team = newTeam(acc.id);
  write(K_TEAM, team);
  return team;
}

export function saveTeam(team: Team): void {
  write(K_TEAM, team);
}

/* ------------------------------------------------------------------------ */
/* Projects                                                                  */
/* ------------------------------------------------------------------------ */

type ProjectMap = Record<string, ProjectDoc>;

function readAll(): ProjectMap {
  return read<ProjectMap>(K_PROJECTS, {});
}
function writeAll(map: ProjectMap): void {
  write(K_PROJECTS, map);
}

export function listProjects(): ProjectDoc[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): ProjectDoc | null {
  const doc = readAll()[id] ?? null;
  return doc ? normalizeProjectDoc(doc) : null;
}

/** Create + persist a new project; returns it (becomes active). */
export function createProject(opts: {
  name?: string;
  seedDesign?: ProjectDoc["design"];
  settings?: DeepPartial<ProjectDoc["settings"]>;
}): ProjectDoc {
  const acc = getAccount();
  const team = getTeam();
  const pwOpts: {
    account: Account;
    team: Team;
    name?: string;
    seedDesign?: ProjectDoc["design"];
    settings?: DeepPartial<ProjectDoc["settings"]>;
  } = { account: acc, team };
  if (opts.name !== undefined) pwOpts.name = opts.name;
  if (opts.seedDesign !== undefined) pwOpts.seedDesign = opts.seedDesign;
  if (opts.settings !== undefined) pwOpts.settings = opts.settings;
  const doc = newProject(pwOpts);
  const map = readAll();
  map[doc.id] = doc;
  writeAll(map);
  write(K_ACTIVE, doc.id);
  return doc;
}

/** Persist an existing doc (any mutation → this). */
export function saveProject(doc: ProjectDoc): void {
  const map = readAll();
  map[doc.id] = doc;
  writeAll(map);
}

export function deleteProject(id: string): boolean {
  const map = readAll();
  if (!map[id]) return false;
  delete map[id];
  writeAll(map);
  if (read<string | null>(K_ACTIVE, null) === id) {
    const next = Object.keys(map)[0] ?? "";
    write(K_ACTIVE, next);
  }
  return true;
}

/* ------------------------------------------------------------------------ */
/* Active project (what the open canvas is working on)                       */
/* ------------------------------------------------------------------------ */

export function getActiveProjectId(): string | null {
  return read<string | null>(K_ACTIVE, null);
}

/**
 * The active project, or a fresh empty one if none exists. This is the entry
 * point the scene calls at boot: it gets back a real ProjectDoc (with a real
 * id) that can be the `projectRef` for FluxSession, the settings source for
 * the VR room, and the share-link target.
 */
export function getOrCreateActiveProject(
  seedDesign?: ProjectDoc["design"],
): ProjectDoc {
  const id = getActiveProjectId();
  if (id) {
    const existing = getProject(id);
    if (existing) return normalizeProjectDoc(existing);
  }
  const opts: { name?: string; seedDesign?: ProjectDoc["design"] } = {
    name: "Untitled",
  };
  if (seedDesign !== undefined) opts.seedDesign = seedDesign;
  return createProject(opts);
}

export function setActiveProjectId(id: string): void {
  write(K_ACTIVE, id);
}

/* ------------------------------------------------------------------------ */
/* Per-account display overlay (personal, not shared)                        */
/* ------------------------------------------------------------------------ */

export function getOverlay(accountId: string): UserOverlay {
  return read<UserOverlay>(K_OVERLAY, { accountId });
}
export function saveOverlay(overlay: UserOverlay): void {
  write(K_OVERLAY, overlay);
}

/* ------------------------------------------------------------------------ */
/* Migrate the pre-existing single localStorage doc into a ProjectDoc.       */
/*                                                                        */
/* This is a one-time transition: before the project model, the whole design */
/* lived in "scadgen.project.v1". If that key exists and there's no project, */
/* fold it into the active project so nothing is lost.                      */
/* ------------------------------------------------------------------------ */

const LEGACY_KEY = "scadgen.project.v1";

export function migrateLegacyDesignIntoProject(): ProjectDoc {
  let legacy: {
    nodes?: unknown[];
    assets?: unknown[];
    ecad?: unknown;
  } | null = null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw)
      legacy = JSON.parse(raw) as {
        nodes?: unknown[];
        assets?: unknown[];
        ecad?: unknown;
      };
  } catch {
    legacy = null;
  }
  const seed = legacy
    ? {
        savedAt: Date.now(),
        nodes: legacy.nodes ?? [],
        assets: legacy.assets ?? [],
        // Carry the ECAD scene + firmware across the one-time migration too.
        ...(legacy.ecad !== undefined ? { ecad: legacy.ecad } : {}),
      }
    : undefined;
  return getOrCreateActiveProject(seed);
}

/**
 * Two-link join API the share links use. `urlRole` is the parsed URL path
 * segment ("view" | "enter"). Returns the role the joiner gets. Public-view
 * projects grant "view" to anyone; otherwise a valid token is required.
 */
export function roleForShareUrl(
  doc: ProjectDoc,
  urlRole: "view" | "enter",
  tokenParam: string,
): ShareRole | null {
  return accessForShareUrl(doc, urlRole, tokenParam)?.role ?? null;
}

export interface BootProjectAccess {
  doc: ProjectDoc | null;
  role: ShareRole;
  allowVr: boolean;
  denied: boolean;
  share: SharePath | null;
}

/**
 * Resolve the project at boot. A share URL selects that project and its
 * granted role; no share URL keeps the existing active-project behaviour.
 * Invalid/expired links return doc:null so the caller can show the access gate
 * without loading the design behind it.
 */
export function resolveBootProject(
  pathname: string,
  search: string,
): BootProjectAccess {
  const share = parseSharePath(pathname, search);
  if (share) {
    const doc = getProject(share.projectId);
    if (!doc) {
      return { doc: null, role: "view", allowVr: false, denied: true, share };
    }
    const access: ShareAccess | null = accessForShareUrl(
      doc,
      share.mode,
      share.token,
    );
    if (!access) {
      return { doc: null, role: "view", allowVr: false, denied: true, share };
    }
    return {
      doc,
      role: access.role,
      allowVr: access.allowVr,
      denied: false,
      share,
    };
  }
  return {
    doc: getOrCreateActiveProject(),
    role: "edit",
    allowVr: true,
    denied: false,
    share: null,
  };
}

export { DEFAULT_SETTINGS };
