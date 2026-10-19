/*
 * Action bus: ONE registry keyed by action id for everything the desk UI,
 * the VR hands, and voice will invoke. Exit-ramp rule from the design doc:
 * every operation reachable by desk must be reachable by id through here.
 * The menu (operationMenu) is the static catalog; this is the live dispatcher
 * + event log. Commands not yet wired register honestly as placeholders and
 * throw on run rather than silently no-op.
 */
export type HookFn = (...args: unknown[]) => unknown;
export type HookBag = Record<string, HookFn>;

export interface BusEvent {
  id: string;
  at: number;
  ok: boolean;
  error?: string;
}

export interface BusAction {
  id: string;
  kind: "op" | "command";
  /** Menu op ids this action answers (kebab or executor ids). */
  aliases: string[];
  run: (...args: unknown[]) => unknown;
}

export class ActionBus {
  private byId = new Map<string, BusAction>();
  private listeners: Array<(e: BusEvent) => void> = [];
  log: BusEvent[] = [];

  register(def: BusAction): void {
    this.byId.set(def.id, def);
    for (const a of def.aliases) if (!this.byId.has(a)) this.byId.set(a, def);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  ids(kind?: "op" | "command"): string[] {
    return [...this.byId.entries()]
      .filter(([, d]) => !kind || d.kind === kind)
      .map(([id]) => id)
      .sort();
  }

  subscribe(fn: (e: BusEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  run(id: string, ...args: unknown[]): unknown {
    const def = this.byId.get(id);
    const t = Date.now();
    if (!def) {
      this.emit({ id, at: t, ok: false, error: "unknown action" });
      throw new Error(`actionBus: unknown action "${id}"`);
    }
    try {
      const out = def.run(...args);
      this.emit({ id, at: t, ok: true });
      return out;
    } catch (e) {
      this.emit({ id, at: t, ok: false, error: String(e) });
      throw e;
    }
  }

  private emit(e: BusEvent): void {
    this.log.push(e);
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    for (const l of this.listeners) l(e);
  }
}

const OP_TO_HOOK: Record<string, string> = {
  box: "box",
  cylinder: "cylinder",
  sphere: "sphere",
  torus: "torus",
  shell: "shell",
  draft: "draft",
  hole: "hole",
  fillet: "fillet",
  "modify-fillet": "modFillet",
  mirror: "mirror",
  "linear-pattern": "pattern",
  "curve-pattern": "curvePattern",
  "circular-pattern": "circPattern",
  "feature-pattern": "featurePattern",
  "delete-bodies": "delBodies",
  "project-curves": "projectCurves",
  "ruled-fill-surface": "ruledSurface",
  split: "split",
  section: "section",
  thicken: "thicken",
  "delete-face": "delFace",
  "move-face": "moveFace",
  "create-plane": "createPlane",
  "curve-on-face": "curveOnFace",
  scale: "scale",
  unfold: "unfold",
  wrap: "wrap",
  hem: "hem",
  flange: "flange",
  thread: "thread",
  "sketch-on-datum": "sketchOnDatum",
  appearance: "setAppearance",
  insert: "insertStl",
  measure: "measEdge",
  "export-stl": "exportSceneStl",
  "export-step": "exportSceneStep",
};

const PLACEHOLDER = (label: string) => (): unknown => {
  throw new Error(`actionBus: "${label}" not wired yet (placeholder)`);
};

import { MENU_BY_SELECTION } from "./operationMenu";

export function createSceneBus(hooks: HookBag): ActionBus {
  const bus = new ActionBus();
  for (const [opId, hookKey] of Object.entries(OP_TO_HOOK)) {
    const fn = hooks[hookKey];
    if (typeof fn !== "function") continue;
    bus.register({
      id: opId,
      kind: "op",
      aliases: [hookKey].filter((a) => a !== opId),
      run: (...args: unknown[]) => fn(...args),
    } as never);
  }
  // Completeness: EVERY ready menu op answers on the bus; unmapped ones are
  // honest placeholders (throw on run) rather than invisible gaps.
  for (const ops of Object.values(MENU_BY_SELECTION))
    for (const o of ops) {
      if (o.status !== "ready" || bus.has(o.id)) continue;
      bus.register({
        id: o.id,
        kind: "op",
        aliases: [],
        run: PLACEHOLDER(o.id),
      });
    }
  for (const cmd of [
    "undo",
    "redo",
    "hide",
    "unhide",
    "view-fit",
    "view-iso",
    "gravity",
    "lock",
  ]) {
    if (hooks[cmd])
      bus.register({
        id: cmd,
        kind: "command",
        aliases: [],
        run: hooks[cmd] as (...a: unknown[]) => unknown,
      });
    else
      bus.register({
        id: cmd,
        kind: "command",
        aliases: [],
        run: PLACEHOLDER(cmd),
      });
  }
  return bus;
}
