// flux/domains/pcb/project.ts — PCB/schematic document model.
// Faithful to the RE'd SchematicObjects.js entity enum (observed, 2026-11-04).
// This is the "project inside a project": the PCB tree lives alongside the
// B-rep feature tree, same file, same history. Units: mm.

export type PcbEntityKind =
  | "root"
  | "layout"
  | "element"
  | "via"
  | "routeSegment"
  | "pad"
  | "footprint"
  | "model"
  | "container"
  | "group"
  | "text"
  | "silk"
  | "line"
  | "circle"
  | "rectangle"
  | "net"
  | "fill"
  | "zone"
  | "stackupRegion"
  | "flexJoint"
  | "smartVia"
  | "polygon"
  | "cutout";

export interface PcbPin {
  pin: string;
  name?: string;
  net?: string;
  kind?: "power" | "signal" | "gnd" | "nc";
}

export interface PcbElement {
  uid: string;
  kind: "element";
  designator: string;
  mpn?: string;
  type?: string;
  group?: string;
  value?: string;
  package?: string;
  pins: PcbPin[];
  position: { x: number; y: number; z: number };
  rotation: number;
  children: PcbNode[];
}

export interface PcbNet {
  uid: string;
  kind: "net";
  name: string;
  pins: { designator: string; pin: string }[];
  children: PcbNode[];
}

export interface PcbGroup {
  uid: string;
  kind: "group" | "container" | "layout" | "model" | "root";
  name: string;
  children: PcbNode[];
}

export type PcbNode = PcbElement | PcbNet | PcbGroup;

export interface PcbProject {
  projectRef: string;
  name: string;
  root: PcbGroup;
  nets: PcbNet[];
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

let uidCounter = 0;
export function nextUid(): string {
  return `pcb_${(0x100000000 + ++uidCounter).toString(16)}`;
}

export function makeProject(ref: string, name: string): PcbProject {
  return {
    projectRef: ref,
    name,
    root: {
      uid: nextUid(),
      kind: "root",
      name: "root",
      children: [],
    },
    nets: [],
  };
}

export function makeElement(
  designator: string,
  opts: {
    mpn?: string;
    type?: string;
    group?: string;
    value?: string;
    package?: string;
    pins?: PcbPin[];
    position?: { x: number; y: number; z: number };
    rotation?: number;
  } = {},
): PcbElement {
  return {
    uid: nextUid(),
    kind: "element",
    designator,
    ...(opts.mpn ? { mpn: opts.mpn } : {}),
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.group ? { group: opts.group } : {}),
    ...(opts.value ? { value: opts.value } : {}),
    ...(opts.package ? { package: opts.package } : {}),
    pins: opts.pins ?? [
      { pin: "1", kind: "signal" },
      { pin: "2", kind: "signal" },
    ],
    position: opts.position ?? { x: 0, y: 0, z: 0 },
    rotation: opts.rotation ?? 0,
    children: [],
  };
}

export function makeNet(name: string): PcbNet {
  return { uid: nextUid(), kind: "net", name, pins: [], children: [] };
}

export function makeGroup(
  name: string,
  kind: PcbGroup["kind"] = "group",
): PcbGroup {
  return { uid: nextUid(), kind, name, children: [] };
}

// ---------------------------------------------------------------------------
// Tree ops (pure — return a new PcbProject; no mutation)
// ---------------------------------------------------------------------------

function cloneNode(n: PcbNode): PcbNode {
  // Structural clone with fresh uids preserved (we keep uids stable across
  // edits so the feature-tree + provenance links remain valid).
  return structuredClone(n);
}

function cloneRoot(n: PcbGroup): PcbGroup {
  return structuredClone(n);
}

export function addElement(proj: PcbProject, el: PcbElement): PcbProject {
  const root = cloneRoot(proj.root);
  root.children.push(el);
  return { ...proj, root };
}

export function addNet(proj: PcbProject, net: PcbNet): PcbProject {
  return { ...proj, nets: [...proj.nets, net] };
}

export function addGroup(
  proj: PcbProject,
  g: PcbGroup,
  parentUid?: string,
): PcbProject {
  const root = cloneRoot(proj.root);
  if (!parentUid) {
    root.children.push(g);
    return { ...proj, root };
  }
  const p = findNode(root, parentUid);
  if (p && "children" in p) {
    p.children.push(g);
    return { ...proj, root };
  }
  root.children.push(g);
  return { ...proj, root };
}

export function findNode(root: PcbNode, uid: string): PcbNode | undefined {
  if (root.uid === uid) return root;
  for (const c of "children" in root ? root.children : []) {
    const r = findNode(c, uid);
    if (r) return r;
  }
  return undefined;
}

export function removeElement(
  proj: PcbProject,
  designator: string,
): PcbProject {
  const root = cloneRoot(proj.root);
  const strip = (n: PcbNode): PcbNode => {
    if ("children" in n) {
      n.children = n.children
        .filter((c) => {
          if (c.kind === "element") return c.designator !== designator;
          return true;
        })
        .map(strip);
    }
    return n;
  };
  strip(root);
  return { ...proj, root };
}

export function setGroup(
  proj: PcbProject,
  designator: string,
  group: string,
): PcbProject {
  const root = cloneRoot(proj.root);
  const visit = (n: PcbNode): void => {
    if (n.kind === "element" && n.designator === designator) {
      n.group = group;
      return;
    }
    if ("children" in n) for (const c of n.children) visit(c);
  };
  visit(root);
  return { ...proj, root };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function allElements(proj: PcbProject): PcbElement[] {
  const out: PcbElement[] = [];
  const walk = (n: PcbNode): void => {
    if (n.kind === "element") out.push(n);
    if ("children" in n) for (const c of n.children) walk(c);
  };
  walk(proj.root);
  return out;
}

export function byDesignator(
  proj: PcbProject,
  designator: string,
): PcbElement | undefined {
  return allElements(proj).find((e) => e.designator === designator);
}

export function byGroup(proj: PcbProject, group: string): PcbElement[] {
  return allElements(proj).filter((e) => e.group === group);
}

export function netsOfPin(
  proj: PcbProject,
  designator: string,
  pin: string,
): PcbNet | undefined {
  const el = byDesignator(proj, designator);
  const p = el?.pins.find((x) => x.pin === pin);
  if (!el || !p?.net) return undefined;
  return proj.nets.find((n) => n.name === p.net);
}

/** Read-only projection of a PcbProject into an agent ProjectContext. */
export function projectContextOf(proj: PcbProject): {
  projectRef: string;
  projectName: string;
  parts: { designator: string; mpn?: string; type?: string; group?: string }[];
  nets: { name: string; pins: { designator: string; pin: string }[] }[];
} {
  return {
    projectRef: proj.projectRef,
    projectName: proj.name,
    parts: allElements(proj).map((e) => ({
      designator: e.designator,
      ...(e.mpn !== undefined ? { mpn: e.mpn } : {}),
      ...(e.type !== undefined ? { type: e.type } : {}),
      ...(e.group !== undefined ? { group: e.group } : {}),
    })),
    nets: proj.nets.map((n) => ({
      name: n.name,
      pins: n.pins.map((p) => ({ designator: p.designator, pin: p.pin })),
    })),
  };
}
